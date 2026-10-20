package expo.modules.milink

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.InputStream
import java.io.OutputStream
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.Socket
import javax.net.ssl.SSLSocket

/**
 * Raw TCP/TLS socket and Mi TV discovery for the remote protocols.
 * Framing and packets live in TypeScript (src/milink, src/atv); this module only moves bytes,
 * plus the client key and TLS that the Android TV Remote protocol needs.
 */
class MiLinkModule : Module() {
  // All socket and discovery state is touched only on this thread.
  private val thread = HandlerThread("expo.modules.milink").apply { start() }
  private val handler = Handler(thread.looper)

  private var socket: Socket? = null
  private val identity by lazy {
    ClientIdentity(appContext.reactContext ?: throw IllegalStateException("No React context"))
  }
  private var output: OutputStream? = null
  private var generation = 0

  private var nsd: NsdManager? = null
  private var discoveryListener: NsdManager.DiscoveryListener? = null
  private val resolveQueue = ArrayDeque<NsdServiceInfo>()
  private var resolving = false
  private val reported = mutableSetOf<String>()

  override fun definition() = ModuleDefinition {
    Name("MiLink")

    Events("onSocketState", "onSocketData", "onTvFound")

    Function("connect") { host: String, port: Int, tls: Boolean ->
      handler.post { open(host, port, tls) }
    }

    AsyncFunction("clientKey") {
      val cert = identity.certificate()
      val result = mutableMapOf<String, Any>("publicKey" to identity.publicKey().toIntList())
      if (cert != null) result["certificate"] = cert.toIntList()
      result
    }

    AsyncFunction("signWithClientKey") { data: List<Int> ->
      identity.sign(data.toByteArray()).toIntList()
    }

    AsyncFunction("setClientCertificate") { der: List<Int> ->
      identity.setCertificate(der.toByteArray())
    }

    Function("disconnect") {
      handler.post { close() }
    }

    Function("send") { bytes: List<Int> ->
      val data = bytes.toByteArray()
      handler.post {
        try {
          output?.write(data)
          output?.flush()
        } catch (e: Exception) {
          fail(generation, e.message ?: "Write failed")
        }
      }
    }

    Function("startDiscovery") {
      handler.post { startBrowsing() }
    }

    Function("stopDiscovery") {
      handler.post { stopBrowsing() }
    }

    OnDestroy {
      handler.post {
        close()
        stopBrowsing()
        thread.quitSafely()
      }
    }
  }

  // region Socket

  private fun open(host: String, port: Int, tls: Boolean) {
    close()
    val gen = ++generation
    emitState("connecting")
    // Connecting blocks, so do it on its own thread and hop back to `handler` with the result.
    Thread {
      val plain = Socket()
      try {
        plain.tcpNoDelay = true
        plain.keepAlive = true
        plain.connect(InetSocketAddress(host, port), 4000)
      } catch (e: Exception) {
        try { plain.close() } catch (_: Exception) {}
        handler.post { if (gen == generation) emitState("failed", e.message ?: "Connection failed", reachable = false) }
        return@Thread
      }
      var s: Socket = plain
      var peerCertificate: List<Int>? = null
      if (tls) {
        try {
          val ssl = identity.socketFactory().createSocket(plain, host, port, true) as SSLSocket
          s = ssl
          ssl.soTimeout = 6000
          ssl.startHandshake()
          ssl.soTimeout = 0
          peerCertificate = ssl.session.peerCertificates.firstOrNull()?.encoded?.toIntList()
        } catch (e: Exception) {
          try { s.close() } catch (_: Exception) {}
          // TCP got through, so the service exists; the TLS session itself was refused.
          handler.post { if (gen == generation) emitState("failed", e.message ?: "TLS handshake failed", reachable = true) }
          return@Thread
        }
      }
      val connected = s
      handler.post {
        if (gen != generation) {
          try { connected.close() } catch (_: Exception) {}
          return@post
        }
        socket = connected
        output = connected.getOutputStream()
        emitState("connected", peerCertificate = peerCertificate)
        startReader(gen, connected.getInputStream())
      }
    }.start()
  }

  private fun startReader(gen: Int, input: InputStream) {
    Thread {
      val buffer = ByteArray(4096)
      try {
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          if (n > 0) {
            val bytes = (0 until n).map { buffer[it].toInt() and 0xFF }
            handler.post { if (gen == generation) sendEvent("onSocketData", mapOf("bytes" to bytes)) }
          }
        }
        handler.post { fail(gen, "TV closed the connection") }
      } catch (e: Exception) {
        handler.post { fail(gen, e.message ?: "Connection lost") }
      }
    }.start()
  }

  private fun fail(gen: Int, message: String) {
    if (gen != generation || socket == null) return
    teardown()
    emitState("failed", message, reachable = true)
  }

  private fun close() {
    generation++
    if (socket == null) return
    teardown()
    emitState("disconnected")
  }

  private fun teardown() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
    output = null
  }

  private fun emitState(
    state: String,
    error: String? = null,
    reachable: Boolean? = null,
    peerCertificate: List<Int>? = null,
  ) {
    val body = mutableMapOf<String, Any>("state" to state)
    if (error != null) body["error"] = error
    if (reachable != null) body["reachable"] = reachable
    if (peerCertificate != null) body["peerCertificate"] = peerCertificate
    sendEvent("onSocketState", body)
  }

  private fun ByteArray.toIntList(): List<Int> = map { it.toInt() and 0xFF }

  private fun List<Int>.toByteArray(): ByteArray = ByteArray(size) { this[it].toByte() }

  // endregion

  // region Discovery

  /** Mi TVs advertise `_googlecast._tcp` with a TXT `md=MiTV-…` model. */
  private fun startBrowsing() {
    stopBrowsing()
    reported.clear()
    val context = appContext.reactContext ?: return
    val manager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    nsd = manager
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {}
      override fun onDiscoveryStopped(serviceType: String) {}
      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
      override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
      override fun onServiceFound(serviceInfo: NsdServiceInfo) {
        handler.post {
          if (discoveryListener !== this) return@post
          val name = serviceInfo.serviceName ?: return@post
          if (reported.contains(name) || resolveQueue.any { it.serviceName == name }) return@post
          resolveQueue.addLast(serviceInfo)
          resolveNext()
        }
      }
    }
    discoveryListener = listener
    try {
      manager.discoverServices("_googlecast._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
    } catch (_: Exception) {
      discoveryListener = null
    }
  }

  private fun stopBrowsing() {
    val listener = discoveryListener ?: return
    discoveryListener = null
    resolveQueue.clear()
    try { nsd?.stopServiceDiscovery(listener) } catch (_: Exception) {}
  }

  // NsdManager resolves one service at a time on older Android versions, so resolve serially.
  @Suppress("DEPRECATION")
  private fun resolveNext() {
    if (resolving || discoveryListener == null) return
    val info = resolveQueue.removeFirstOrNull() ?: return
    val manager = nsd ?: return
    resolving = true
    manager.resolveService(info, object : NsdManager.ResolveListener {
      override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
        handler.post {
          resolving = false
          resolveNext()
        }
      }

      override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
        handler.post {
          resolving = false
          report(serviceInfo)
          resolveNext()
        }
      }
    })
  }

  @Suppress("DEPRECATION")
  private fun report(info: NsdServiceInfo) {
    val name = info.serviceName ?: return
    val attrs = info.attributes ?: emptyMap()
    val model = attrs["md"]?.toString(Charsets.UTF_8) ?: ""
    val friendly = attrs["fn"]?.toString(Charsets.UTF_8) ?: name
    if (!model.lowercase().startsWith("mitv") && !name.lowercase().startsWith("mitv")) return
    // Android 14+ can resolve several addresses; the TV listens on IPv4.
    val host = if (Build.VERSION.SDK_INT >= 34) {
      info.hostAddresses.filterIsInstance<Inet4Address>().firstOrNull()
    } else {
      info.host as? Inet4Address
    } ?: return
    val address = host.hostAddress ?: return
    if (!reported.add(name)) return
    sendEvent("onTvFound", mapOf("id" to name, "name" to friendly, "model" to model, "address" to address))
  }

  // endregion
}

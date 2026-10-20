package expo.modules.milink

import android.content.Context
import android.util.Base64
import java.io.ByteArrayInputStream
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.spec.PKCS8EncodedKeySpec
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/**
 * The RSA key and self-signed certificate the app presents to Android TVs (Android TV Remote
 * protocol). The TV trusts it once paired, so it must survive app restarts. The certificate is
 * built in TypeScript (src/atv/der.ts), which asks this class to sign it.
 *
 * Kept in app-private preferences as a plain software key: it only identifies this phone to a
 * TV on the LAN, and a software key works with every TLS stack Android ships.
 */
internal class ClientIdentity(context: Context) {
  private val prefs = context.getSharedPreferences("expo.modules.milink.atv", Context.MODE_PRIVATE)

  @Synchronized
  fun publicKey(): ByteArray {
    ensureKey()
    return decode(prefs.getString(PUBLIC_KEY, null)!!)
  }

  @Synchronized
  fun certificate(): ByteArray? = prefs.getString(CERTIFICATE, null)?.let(::decode)

  @Synchronized
  fun setCertificate(der: ByteArray) {
    // Throws if it isn't a parseable certificate, so a bad one is never stored.
    CertificateFactory.getInstance("X.509").generateCertificate(ByteArrayInputStream(der))
    prefs.edit().putString(CERTIFICATE, encode(der)).commit()
  }

  @Synchronized
  fun sign(data: ByteArray): ByteArray {
    ensureKey()
    return Signature.getInstance("SHA256withRSA").run {
      initSign(privateKey())
      update(data)
      sign()
    }
  }

  /** TLS context that presents our certificate and accepts the TV's self-signed one. */
  @Synchronized
  fun socketFactory(): SSLSocketFactory {
    val der = certificate() ?: throw IllegalStateException("No client certificate yet")
    val cert = CertificateFactory.getInstance("X.509")
      .generateCertificate(ByteArrayInputStream(der)) as X509Certificate
    val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
      load(null, null)
      setKeyEntry("client", privateKey(), CharArray(0), arrayOf(cert))
    }
    val keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
      .apply { init(store, CharArray(0)) }
      .keyManagers
    val context = SSLContext.getInstance("TLS")
    context.init(keyManagers, arrayOf(AcceptTvCertificate), null)
    return context.socketFactory
  }

  private fun privateKey(): PrivateKey {
    val bytes = decode(prefs.getString(PRIVATE_KEY, null)!!)
    return KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(bytes))
  }

  private fun ensureKey() {
    if (prefs.contains(PRIVATE_KEY) && prefs.contains(PUBLIC_KEY)) return
    val pair = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()
    prefs.edit()
      .putString(PRIVATE_KEY, encode(pair.private.encoded))
      .putString(PUBLIC_KEY, encode(pair.public.encoded))
      .remove(CERTIFICATE)
      .commit()
  }

  /**
   * TVs present a self-signed certificate, so there is no CA to check it against. The pairing
   * secret mixes in the TV's public key, which is what ties the session to the right TV.
   */
  @Suppress("CustomX509TrustManager", "TrustAllX509TrustManager")
  private object AcceptTvCertificate : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
  }

  private companion object {
    const val PRIVATE_KEY = "privateKey"
    const val PUBLIC_KEY = "publicKey"
    const val CERTIFICATE = "certificate"

    fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
    fun decode(text: String): ByteArray = Base64.decode(text, Base64.NO_WRAP)
  }
}

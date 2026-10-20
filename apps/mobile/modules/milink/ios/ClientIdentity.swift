import Foundation
import Security

/// The RSA key and self-signed certificate the app presents to Android TVs (Android TV Remote
/// protocol). The TV trusts it once paired, so both live in the keychain. iOS can't create
/// certificates, so the certificate is built in TypeScript (src/atv/der.ts), which asks this
/// type to sign it; the keychain pairs the stored key and certificate into a TLS identity.
enum ClientIdentity {
  private static let keyTag = Data("expo.modules.milink.atv.key".utf8)
  private static let certLabel = "expo.modules.milink.atv.certificate"

  enum Failure: LocalizedError {
    case keychain(OSStatus)
    case security(String)

    var errorDescription: String? {
      switch self {
      case .keychain(let status):
        return (SecCopyErrorMessageString(status, nil) as String?) ?? "Keychain error \(status)"
      case .security(let message):
        return message
      }
    }
  }

  /// PKCS#1 RSAPublicKey DER of the client key, creating the key on first use.
  static func publicKey() throws -> Data {
    let key = try privateKey()
    guard let pub = SecKeyCopyPublicKey(key) else { throw Failure.security("No public key") }
    var error: Unmanaged<CFError>?
    guard let data = SecKeyCopyExternalRepresentation(pub, &error) as Data? else {
      throw error!.takeRetainedValue() as Error
    }
    return data
  }

  /// The certificate is also kept as a file: the keychain is only needed for the identity, and
  /// on macOS a label lookup of the stored certificate came back empty (#4), so the file is the
  /// source of truth for "which certificate is ours".
  private static var certificateURL: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("expo.modules.milink", isDirectory: true)
      .appendingPathComponent("client-certificate.der")
  }

  static func certificate() -> Data? {
    if let data = try? Data(contentsOf: certificateURL) { return data }
    let query: [String: Any] = [
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
      kSecReturnData as String: true,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
    return item as? Data
  }

  static func setCertificate(_ der: Data) throws {
    guard SecCertificateCreateWithData(nil, der as CFData) != nil else {
      throw Failure.security("Not a valid certificate")
    }
    try FileManager.default.createDirectory(at: certificateURL.deletingLastPathComponent(),
                                            withIntermediateDirectories: true)
    try der.write(to: certificateURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    try addToKeychain(der)
  }

  /// Puts the certificate in the keychain, where it joins the private key as an identity.
  private static func addToKeychain(_ der: Data) throws {
    guard let cert = SecCertificateCreateWithData(nil, der as CFData) else {
      throw Failure.security("Not a valid certificate")
    }
    SecItemDelete([
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
    ] as CFDictionary)
    let status = SecItemAdd([
      kSecClass as String: kSecClassCertificate,
      kSecValueRef as String: cert,
      kSecAttrLabel as String: certLabel,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ] as CFDictionary, nil)
    guard status == errSecSuccess || status == errSecDuplicateItem else { throw Failure.keychain(status) }
  }

  /// SHA256withRSA (PKCS#1 v1.5) signature, used to self-sign the certificate.
  static func sign(_ data: Data) throws -> Data {
    let key = try privateKey()
    var error: Unmanaged<CFError>?
    guard let signature = SecKeyCreateSignature(
      key, .rsaSignatureMessagePKCS1v15SHA256, data as CFData, &error
    ) as Data? else {
      throw error!.takeRetainedValue() as Error
    }
    return signature
  }

  /// The TLS identity: our certificate joined with its private key in the keychain. If the
  /// keychain doesn't have the certificate (or lost it), it's added back once. Throws with the
  /// reason rather than letting the app connect without a client certificate.
  static func identity() throws -> SecIdentity {
    guard let wanted = certificate() else { throw Failure.security("No client certificate yet") }
    if let found = findIdentity(for: wanted) { return found }
    try addToKeychain(wanted)
    if let found = findIdentity(for: wanted) { return found }
    throw Failure.security("The keychain didn't pair the client certificate with its key")
  }

  private static func findIdentity(for wanted: Data) -> SecIdentity? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassIdentity,
      kSecMatchLimit as String: kSecMatchLimitAll,
      kSecReturnRef as String: true,
    ]
    var items: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &items) == errSecSuccess,
          let identities = items as? [SecIdentity] else { return nil }
    for identity in identities {
      var cert: SecCertificate?
      if SecIdentityCopyCertificate(identity, &cert) == errSecSuccess, let cert,
         SecCertificateCopyData(cert) as Data == wanted {
        return identity
      }
    }
    return nil
  }

  private static func privateKey() throws -> SecKey {
    let query: [String: Any] = [
      kSecClass as String: kSecClassKey,
      kSecAttrApplicationTag as String: keyTag,
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecReturnRef as String: true,
    ]
    var item: CFTypeRef?
    if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let item {
      return item as! SecKey // swiftlint:disable:this force_cast
    }
    // A certificate for an older key would never match the new one.
    try? FileManager.default.removeItem(at: certificateURL)
    SecItemDelete([
      kSecClass as String: kSecClassCertificate,
      kSecAttrLabel as String: certLabel,
    ] as CFDictionary)
    let attributes: [String: Any] = [
      kSecAttrKeyType as String: kSecAttrKeyTypeRSA,
      kSecAttrKeySizeInBits as String: 2048,
      kSecPrivateKeyAttrs as String: [
        kSecAttrIsPermanent as String: true,
        kSecAttrApplicationTag as String: keyTag,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      ],
    ]
    var error: Unmanaged<CFError>?
    guard let key = SecKeyCreateRandomKey(attributes as CFDictionary, &error) else {
      throw error!.takeRetainedValue() as Error
    }
    return key
  }
}

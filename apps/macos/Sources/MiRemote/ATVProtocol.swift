import CryptoKit
import Foundation

// Android TV Remote protocol v2, the one Google's TV remote apps use. Two TLS ports, both
// carrying varint-length-delimited protobuf messages, and both requiring a client certificate:
//
//   6467  pairing ("polo"): the TV shows a 6-digit hex code; proving we saw it makes the TV
//         trust our certificate from then on.
//   6466  remote: key presses, text, pings. The TV drops the TLS session if the certificate
//         isn't paired.
//
// Field numbers follow polo.proto and remotemessage.proto as used by androidtvremote2. This is
// a Swift port of the mobile app's src/atv; both are tested against the same fixtures.

enum ATV {
    static let remotePort: UInt16 = 6466
    static let pairingPort: UInt16 = 6467
    static let clientName = "Mi Remote"
}

// MARK: - Protobuf

enum Proto {
    enum DecodeError: Error { case malformed }

    static func varint(_ value: Int64) -> [UInt8] {
        // Negative int32 values are sign-extended to 64 bits, as protobuf does.
        var v = UInt64(bitPattern: value)
        var out: [UInt8] = []
        while v >= 0x80 {
            out.append(UInt8(v & 0x7F) | 0x80)
            v >>= 7
        }
        out.append(UInt8(v))
        return out
    }

    static func int(_ field: Int, _ value: Int64) -> [UInt8] {
        varint(Int64(field << 3)) + varint(value)
    }

    static func bytes(_ field: Int, _ data: [UInt8]) -> [UInt8] {
        varint(Int64(field << 3 | 2)) + varint(Int64(data.count)) + data
    }

    static func string(_ field: Int, _ text: String) -> [UInt8] {
        bytes(field, Array(text.utf8))
    }

    /// Prefixes a message with its varint length, the framing both TV ports use.
    static func delimited(_ message: [UInt8]) -> [UInt8] {
        varint(Int64(message.count)) + message
    }

    static func readVarint(_ bytes: [UInt8], _ index: inout Int) -> UInt64? {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        while index < bytes.count {
            let byte = bytes[index]
            index += 1
            if shift < 64 { result |= UInt64(byte & 0x7F) << shift }
            if byte & 0x80 == 0 { return result }
            shift += 7
            if shift >= 70 { return nil }
        }
        return nil
    }

    /// Splits complete length-delimited messages off the front of `buffer`, leaving any partial
    /// message in it for the next chunk.
    static func split(_ buffer: inout [UInt8]) -> [[UInt8]] {
        var messages: [[UInt8]] = []
        var offset = 0
        while offset < buffer.count {
            var index = offset
            guard let length = readVarint(buffer, &index),
                  length <= UInt64(buffer.count - index) else { break }
            let end = index + Int(length)
            messages.append(Array(buffer[index..<end]))
            offset = end
        }
        buffer.removeFirst(offset)
        return messages
    }

    /// A decoded message: the last value of each varint field and each length-delimited field.
    /// Every varint this app reads is an int32, enum or bool, so they're kept as Int32.
    struct Message {
        private(set) var ints: [Int: Int32] = [:]
        private(set) var blobs: [Int: [UInt8]] = [:]

        init(decoding bytes: [UInt8]) throws {
            var index = 0
            while index < bytes.count {
                guard let key = Proto.readVarint(bytes, &index) else { throw DecodeError.malformed }
                let field = Int(key >> 3)
                switch key & 7 {
                case 0:
                    guard let value = Proto.readVarint(bytes, &index) else { throw DecodeError.malformed }
                    ints[field] = Int32(truncatingIfNeeded: value)
                case 2:
                    guard let length = Proto.readVarint(bytes, &index),
                          length <= UInt64(bytes.count - index) else { throw DecodeError.malformed }
                    let end = index + Int(length)
                    blobs[field] = Array(bytes[index..<end])
                    index = end
                case 1:
                    index += 8
                case 5:
                    index += 4
                default:
                    throw DecodeError.malformed
                }
            }
        }

        func has(_ field: Int) -> Bool { ints[field] != nil || blobs[field] != nil }
        func int(_ field: Int, default fallback: Int32 = 0) -> Int32 { ints[field] ?? fallback }
        func message(_ field: Int) -> Message? { blobs[field].flatMap { try? Message(decoding: $0) } }
        func string(_ field: Int) -> String { blobs[field].map { String(decoding: $0, as: UTF8.self) } ?? "" }
    }
}

// MARK: - Pairing (polo)

enum Pairing {
    static let statusOK: Int32 = 200
    static let statusBadSecret: Int32 = 402

    private static func outer(_ body: [UInt8]) -> [UInt8] {
        Proto.int(1, 2) + Proto.int(2, Int64(statusOK)) + body
    }

    /// Hexadecimal code, 6 symbols.
    private static var hexEncoding: [UInt8] { Proto.int(1, 3) + Proto.int(2, 6) }
    /// We type the code: the input role.
    private static let roleInput: Int64 = 1

    static func request(clientName: String) -> [UInt8] {
        outer(Proto.bytes(10, Proto.string(1, "atvremote") + Proto.string(2, clientName)))
    }

    static func options() -> [UInt8] {
        outer(Proto.bytes(20, Proto.bytes(1, hexEncoding) + Proto.int(3, roleInput)))
    }

    static func configuration() -> [UInt8] {
        outer(Proto.bytes(30, Proto.bytes(1, hexEncoding) + Proto.int(2, roleInput)))
    }

    static func secretMessage(_ secret: [UInt8]) -> [UInt8] {
        outer(Proto.bytes(40, Proto.bytes(1, secret)))
    }

    enum Reply: Equatable { case requestAck, options, configurationAck, secretAck, unknown }

    static func parse(_ bytes: [UInt8]) throws -> (status: Int32, reply: Reply) {
        let message = try Proto.Message(decoding: bytes)
        let status = message.int(2, default: statusOK)
        if message.has(11) { return (status, .requestAck) }
        if message.has(20) { return (status, .options) }
        if message.has(31) { return (status, .configurationAck) }
        if message.has(41) { return (status, .secretAck) }
        return (status, .unknown)
    }

    /// Uppercase hex, 6 characters, or nil if `input` can't be a code.
    static func normalize(_ input: String) -> String? {
        let code = input.filter { !$0.isWhitespace }.uppercased()
        guard code.count == 6, code.allSatisfy({ $0.isHexDigit }) else { return nil }
        return code
    }

    /// SHA-256 over both public keys and the last 4 hex digits of the code. The first 2 hex
    /// digits are a checksum that must equal the hash's first byte, which catches a mistyped
    /// code before the TV sees it. Returns nil when it doesn't match.
    static func secret(client: RSAPublicKey, server: RSAPublicKey, code: String) -> [UInt8]? {
        guard let normalized = normalize(code) else { return nil }
        let chars = Array(normalized)
        let codeBytes = stride(from: 0, to: 6, by: 2).map { UInt8(String(chars[$0...$0 + 1]), radix: 16)! }
        var input = client.modulus + client.exponent + server.modulus + server.exponent
        input += codeBytes[1...]
        let hash = Array(SHA256.hash(data: Data(input)))
        return hash[0] == codeBytes[0] ? hash : nil
    }
}

// MARK: - Remote

enum RemoteMessage {
    /// Feature bits: ping, key, ime, power, volume, app link.
    static let wantedFeatures: Int32 = 1 | 2 | 4 | 32 | 64 | 512

    enum Direction: Int64 { case startLong = 1, endLong = 2, short = 3 }

    static func configure(features: Int32) -> [UInt8] {
        let deviceInfo = Proto.string(1, ATV.clientName) + Proto.string(2, ATV.clientName)
            + Proto.int(3, 1) + Proto.string(4, "1") + Proto.string(5, "atvremote") + Proto.string(6, "1.0.0")
        return Proto.bytes(1, Proto.int(1, Int64(features)) + Proto.bytes(2, deviceInfo))
    }

    static func setActive(features: Int32) -> [UInt8] {
        Proto.bytes(2, Proto.int(1, Int64(features)))
    }

    static func pingResponse(_ value: Int32) -> [UInt8] {
        Proto.bytes(9, Proto.int(1, Int64(value)))
    }

    /// `code` is an Android KeyEvent keycode; the protocol's key enum uses the same numbers.
    static func keyInject(code: Int32, direction: Direction) -> [UInt8] {
        Proto.bytes(10, Proto.int(1, Int64(code)) + Proto.int(2, direction.rawValue))
    }

    /// Asks the TV to open a link (RemoteAppLinkLaunchRequest): a deep link, a TV-input link such
    /// as content://android.media.tv/passthrough/<input id>, or possibly an intent: URI.
    static func appLink(_ link: String) -> [UInt8] {
        Proto.bytes(90, Proto.string(1, link))
    }

    /// Puts `text` into the focused text field on the TV, cursor after it. The counters echo the
    /// TV's latest (0 before it has sent any), as the Google TV app and other clients do.
    static func imeBatchEdit(imeCounter: Int32, fieldCounter: Int32, text: String) -> [UInt8] {
        let cursor = Int64(text.unicodeScalars.count)
        let imeObject = Proto.int(1, cursor) + Proto.int(2, cursor) + Proto.string(3, text)
        let editInfo = Proto.int(1, 1) + Proto.bytes(2, imeObject)
        return Proto.bytes(21, Proto.int(1, Int64(imeCounter)) + Proto.int(2, Int64(fieldCounter)) + Proto.bytes(3, editInfo))
    }

    enum Event: Equatable {
        case configure(features: Int32, model: String)
        case setActive
        case ping(Int32)
        case start(Bool)
        case imeBatchEdit(imeCounter: Int32, fieldCounter: Int32)
        /// A text field got focus (show request) or the focused app reported its field.
        case imeField(fieldCounter: Int32)
        case error
        case other
    }

    static func parse(_ bytes: [UInt8]) throws -> Event {
        let message = try Proto.Message(decoding: bytes)
        if let configure = message.message(1) {
            return .configure(features: configure.int(1), model: configure.message(2)?.string(1) ?? "")
        }
        if message.has(2) { return .setActive }
        if message.has(3) { return .error }
        if let ping = message.message(8) { return .ping(ping.int(1)) }
        if let keyInject = message.message(20), let field = keyInject.message(2) {
            return .imeField(fieldCounter: field.int(1))
        }
        if let show = message.message(22), let field = show.message(2) {
            return .imeField(fieldCounter: field.int(1))
        }
        if let batch = message.message(21) {
            return .imeBatchEdit(imeCounter: batch.int(1), fieldCounter: batch.int(2))
        }
        if let start = message.message(40) { return .start(start.int(1) != 0) }
        return .other
    }
}

// MARK: - DER / X.509

struct RSAPublicKey: Equatable {
    /// Unsigned big-endian, no leading zeros.
    var modulus: [UInt8]
    var exponent: [UInt8]
}

/// Minimal DER: builds the self-signed client certificate around the keychain key (macOS has no
/// public API to create certificates) and reads RSA keys out of certificates.
enum DER {
    enum ParseError: Error { case malformed, unsupported }

    private static let tagInteger: UInt8 = 0x02
    private static let tagBitString: UInt8 = 0x03
    private static let tagSequence: UInt8 = 0x30
    private static let tagVersion: UInt8 = 0xA0

    static func tlv(_ tag: UInt8, _ content: [UInt8]) -> [UInt8] {
        [tag] + length(content.count) + content
    }

    private static func length(_ n: Int) -> [UInt8] {
        if n < 0x80 { return [UInt8(n)] }
        var out: [UInt8] = []
        var v = n
        while v > 0 {
            out.insert(UInt8(v & 0xFF), at: 0)
            v >>= 8
        }
        return [0x80 | UInt8(out.count)] + out
    }

    static func sequence(_ items: [UInt8]...) -> [UInt8] {
        tlv(tagSequence, items.flatMap { $0 })
    }

    /// INTEGER from unsigned big-endian bytes.
    static func integer(_ magnitude: [UInt8]) -> [UInt8] {
        let bytes = stripZeros(magnitude)
        return tlv(tagInteger, (bytes.first ?? 0) & 0x80 != 0 ? [0] + bytes : bytes)
    }

    static func oid(_ dotted: String) -> [UInt8] {
        let parts = dotted.split(separator: ".").map { Int($0)! }
        var out: [UInt8] = [UInt8(parts[0] * 40 + parts[1])]
        for part in parts.dropFirst(2) {
            var chunk: [UInt8] = []
            var v = part
            repeat {
                chunk.insert(UInt8(v & 0x7F) | (chunk.isEmpty ? 0 : 0x80), at: 0)
                v >>= 7
            } while v > 0
            out += chunk
        }
        return tlv(0x06, out)
    }

    private static func algorithm(_ dotted: String) -> [UInt8] {
        sequence(oid(dotted), tlv(0x05, []))
    }

    private static let rsaEncryption = "1.2.840.113549.1.1.1"
    private static let sha256WithRSA = "1.2.840.113549.1.1.11"

    private static func name(_ commonName: String) -> [UInt8] {
        let cn = sequence(oid("2.5.4.3"), tlv(0x0C, Array(commonName.utf8)))
        return sequence(tlv(0x31, cn))
    }

    /// UTCTime, YYMMDDHHMMSSZ (valid until 2049, which is all the certificate needs).
    private static func utcTime(_ date: Date) -> [UInt8] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        let text = String(format: "%02d%02d%02d%02d%02d%02dZ",
                          c.year! % 100, c.month!, c.day!, c.hour!, c.minute!, c.second!)
        return tlv(0x17, Array(text.utf8))
    }

    static func subjectPublicKeyInfo(_ key: RSAPublicKey) -> [UInt8] {
        let pkcs1 = sequence(integer(key.modulus), integer(key.exponent))
        return sequence(algorithm(rsaEncryption), tlv(tagBitString, [0] + pkcs1))
    }

    /// The to-be-signed part of a self-signed v3 certificate for `key`.
    static func tbsCertificate(key: RSAPublicKey, commonName: String, serial: [UInt8], notBefore: Date) -> [UInt8] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let notAfter = calendar.date(from: DateComponents(year: 2049, month: 12, day: 31, hour: 23, minute: 59, second: 59))!
        let subject = name(commonName)
        return sequence(
            tlv(tagVersion, integer([2])),
            integer(serial),
            algorithm(sha256WithRSA),
            subject,
            sequence(utcTime(notBefore), utcTime(notAfter)),
            subject,
            subjectPublicKeyInfo(key)
        )
    }

    /// Wraps a TBS certificate and its SHA256withRSA signature into the final certificate.
    static func certificate(tbs: [UInt8], signature: [UInt8]) -> [UInt8] {
        sequence(tbs, algorithm(sha256WithRSA), tlv(tagBitString, [0] + signature))
    }

    // MARK: Parsing

    private struct Node {
        var tag: UInt8
        var content: [UInt8]
    }

    private static func readNode(_ bytes: [UInt8], _ offset: Int) throws -> (Node, Int) {
        guard offset + 2 <= bytes.count else { throw ParseError.malformed }
        let tag = bytes[offset]
        var len = Int(bytes[offset + 1])
        var start = offset + 2
        if len & 0x80 != 0 {
            let count = len & 0x7F
            guard count <= 4, start + count <= bytes.count else { throw ParseError.malformed }
            len = 0
            for i in 0..<count { len = len << 8 | Int(bytes[start + i]) }
            start += count
        }
        guard start + len <= bytes.count else { throw ParseError.malformed }
        return (Node(tag: tag, content: Array(bytes[start..<start + len])), start + len)
    }

    private static func children(_ content: [UInt8]) throws -> [Node] {
        var nodes: [Node] = []
        var offset = 0
        while offset < content.count {
            let (node, next) = try readNode(content, offset)
            nodes.append(node)
            offset = next
        }
        return nodes
    }

    private static func stripZeros(_ bytes: [UInt8]) -> [UInt8] {
        var i = 0
        while i < bytes.count - 1 && bytes[i] == 0 { i += 1 }
        return Array(bytes[i...])
    }

    /// The RSA public key in an X.509 certificate, a SubjectPublicKeyInfo, or a PKCS#1
    /// RSAPublicKey (what the keychain exports).
    static func rsaPublicKey(_ der: [UInt8]) throws -> RSAPublicKey {
        let (top, _) = try readNode(der, 0)
        guard top.tag == tagSequence else { throw ParseError.malformed }
        let parts = try children(top.content)
        if parts.count == 2, parts[0].tag == tagInteger, parts[1].tag == tagInteger {
            return RSAPublicKey(modulus: stripZeros(parts[0].content), exponent: stripZeros(parts[1].content))
        }
        if parts.count == 2, parts[0].tag == tagSequence, parts[1].tag == tagBitString {
            return try rsaPublicKey(Array(parts[1].content.dropFirst()))
        }
        if parts.count == 3, parts[0].tag == tagSequence {
            let tbs = try children(parts[0].content)
            let index = tbs.first?.tag == tagVersion ? 6 : 5
            guard tbs.count > index else { throw ParseError.malformed }
            return try rsaPublicKey(tlv(tbs[index].tag, tbs[index].content))
        }
        throw ParseError.unsupported
    }
}

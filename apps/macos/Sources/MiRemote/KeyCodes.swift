import Foundation

/// Android `KeyEvent.KEYCODE_*` values used by the remote.
enum AndroidKey: Int32 {
    case home = 3
    case back = 4
    case dpadUp = 19
    case dpadDown = 20
    case dpadLeft = 21
    case dpadRight = 22
    case dpadCenter = 23
    case volumeUp = 24
    case volumeDown = 25
    case power = 26
    case enter = 66
    case del = 67
    case menu = 82
    case search = 84
    case playPause = 85
    case next = 87
    case previous = 88
    case rewind = 89
    case fastForward = 90
    case mute = 164
    case info = 165
    case channelUp = 166
    case channelDown = 167
    case settings = 176
    case tvInput = 178
    case appSwitch = 187
}

/// META_SHIFT_ON | META_SHIFT_LEFT_ON
let kMetaShift: Int32 = 0x41

/// Maps a character to an Android key code (+ shift) on the virtual keyboard layout,
/// so text can be "typed" through the key-event channel (MiLink has no text packet).
func androidKeystroke(for ch: Character) -> (code: Int32, meta: Int32)? {
    guard let scalar = ch.unicodeScalars.first, ch.unicodeScalars.count == 1 else { return nil }
    let v = scalar.value
    switch v {
    case 0x61...0x7A: return (29 + Int32(v - 0x61), 0)            // a-z
    case 0x41...0x5A: return (29 + Int32(v - 0x41), kMetaShift)   // A-Z
    case 0x30...0x39: return (7 + Int32(v - 0x30), 0)             // 0-9
    default: break
    }
    let table: [Character: (Int32, Int32)] = [
        " ": (62, 0), "\n": (66, 0), "\t": (61, 0),
        ".": (56, 0), ",": (55, 0), "-": (69, 0), "=": (70, 0),
        "[": (71, 0), "]": (72, 0), "\\": (73, 0), ";": (74, 0),
        "'": (75, 0), "/": (76, 0), "@": (77, 0), "+": (81, 0),
        "*": (17, 0), "#": (18, 0), "`": (68, 0),
        "!": (8, kMetaShift), "$": (11, kMetaShift), "%": (12, kMetaShift),
        "^": (13, kMetaShift), "&": (14, kMetaShift), "(": (16, kMetaShift),
        ")": (7, kMetaShift), "_": (69, kMetaShift), "?": (76, kMetaShift),
        ":": (74, kMetaShift), "\"": (75, kMetaShift), "<": (55, kMetaShift),
        ">": (56, kMetaShift), "{": (71, kMetaShift), "}": (72, kMetaShift),
        "|": (73, kMetaShift), "~": (68, kMetaShift),
    ]
    return table[ch].map { (code: $0.0, meta: $0.1) }
}

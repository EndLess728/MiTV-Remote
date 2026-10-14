// Renders the app icons (same glyph as the macOS app) into ./assets.
//   swift scripts/make-icons.swift
import AppKit

let orangeTop = NSColor(red: 1, green: 0.55, blue: 0.1, alpha: 1)
let orangeBottom = NSColor(red: 0.98, green: 0.36, blue: 0.0, alpha: 1)
let buttonOrange = NSColor(red: 0.98, green: 0.42, blue: 0.0, alpha: 1)

/// The white remote glyph, drawn at `scale` of the canvas around its center.
func drawGlyph(_ s: CGFloat, scale: CGFloat) {
    let u = s * scale
    let ox = (s - u) / 2, oy = (s - u) / 2
    func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> NSRect {
        NSRect(x: ox + x * u, y: oy + y * u, width: w * u, height: h * u)
    }
    NSColor.white.setFill()
    NSBezierPath(roundedRect: r(0.38, 0.2, 0.24, 0.6), xRadius: u * 0.12, yRadius: u * 0.12).fill()
    buttonOrange.setFill()
    NSBezierPath(ovalIn: r(0.435, 0.58, 0.13, 0.13)).fill()
    for i in 0..<2 {
        NSBezierPath(ovalIn: r(0.44 + 0.07 * CGFloat(i), 0.38, 0.05, 0.05)).fill()
    }
}

/// Opaque images are drawn with alpha and then flattened, since AppKit can't draw into a
/// bitmap without an alpha channel. iOS requires app icons without alpha.
func render(_ px: Int, opaque: Bool, draw: @escaping (CGFloat) -> Void) -> Data {
    let s = CGFloat(px)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    draw(s)
    NSGraphicsContext.restoreGraphicsState()
    guard opaque else { return rep.representation(using: .png, properties: [:])! }
    let cg = rep.cgImage!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: px, height: px))
    let flat = NSBitmapImageRep(cgImage: ctx.makeImage()!)
    return flat.representation(using: .png, properties: [:])!
}

func fullBleed(_ s: CGFloat) {
    NSGradient(starting: orangeTop, ending: orangeBottom)!.draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -90)
    drawGlyph(s, scale: 1)
}

let assets = URL(fileURLWithPath: "assets")
// iOS / store icon: opaque, the OS applies the rounded mask.
try! render(1024, opaque: true, draw: fullBleed).write(to: assets.appendingPathComponent("icon.png"))
// Android adaptive foreground: glyph only, kept inside the 66% safe zone. Background color is set
// in app.config.ts.
try! render(1024, opaque: false) { drawGlyph($0, scale: 0.72) }.write(to: assets.appendingPathComponent("adaptive-icon.png"))
// Splash: the glyph on transparent, shown over the dark splash background.
try! render(512, opaque: false) { s in
    let inset = s * 0.12
    let rect = NSRect(x: inset, y: inset, width: s - 2 * inset, height: s - 2 * inset)
    let bg = NSBezierPath(roundedRect: rect, xRadius: s * 0.17, yRadius: s * 0.17)
    NSGradient(starting: orangeTop, ending: orangeBottom)!.draw(in: bg, angle: -90)
    drawGlyph(s, scale: 0.76)
}.write(to: assets.appendingPathComponent("splash-icon.png"))
try! render(48, opaque: true, draw: fullBleed).write(to: assets.appendingPathComponent("favicon.png"))
print("Wrote icons to ./assets")

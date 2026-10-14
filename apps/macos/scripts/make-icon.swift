import AppKit
let out = CommandLine.arguments[1]
func render(_ px: Int) -> Data {
    let s = CGFloat(px)
    let img = NSImage(size: NSSize(width: s, height: s), flipped: false) { r in
        let inset = s * 0.1
        let rect = r.insetBy(dx: inset, dy: inset)
        let bg = NSBezierPath(roundedRect: rect, xRadius: s * 0.19, yRadius: s * 0.19)
        NSGradient(starting: NSColor(red: 1, green: 0.55, blue: 0.1, alpha: 1),
                   ending: NSColor(red: 0.98, green: 0.36, blue: 0.0, alpha: 1))!.draw(in: bg, angle: -90)
        let body = NSRect(x: s * 0.38, y: s * 0.2, width: s * 0.24, height: s * 0.6)
        NSColor.white.setFill()
        NSBezierPath(roundedRect: body, xRadius: s * 0.12, yRadius: s * 0.12).fill()
        NSColor(red: 0.98, green: 0.42, blue: 0.0, alpha: 1).setFill()
        let c = s * 0.13
        NSBezierPath(ovalIn: NSRect(x: s * 0.5 - c / 2, y: s * 0.58, width: c, height: c)).fill()
        for i in 0..<2 {
            let d = s * 0.05
            NSBezierPath(ovalIn: NSRect(x: s * (0.44 + 0.07 * CGFloat(i)), y: s * 0.38, width: d, height: d)).fill()
        }
        return true
    }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                               bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    img.draw(in: NSRect(x: 0, y: 0, width: s, height: s))
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
for (name, px) in [("16x16",16),("16x16@2x",32),("32x32",32),("32x32@2x",64),("128x128",128),("128x128@2x",256),("256x256",256),("256x256@2x",512),("512x512",512),("512x512@2x",1024)] {
    try! render(px).write(to: URL(fileURLWithPath: "\(out)/icon_\(name).png"))
}

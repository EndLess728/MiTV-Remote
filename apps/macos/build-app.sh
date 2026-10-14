#!/bin/zsh
# Builds "Mi Remote.app" into ./dist
#   UNIVERSAL=1  build for both Apple Silicon and Intel
#   VERSION=x.y  set CFBundleShortVersionString
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${UNIVERSAL:-0}" == 1 ]]; then
    # Build each architecture with --triple and merge with lipo. `--arch` goes through
    # Xcode's build system, which breaks on some toolchains.
    BINS=()
    for arch in arm64 x86_64; do
        swift build -c release --triple $arch-apple-macosx14.0 --scratch-path .build/$arch
        BINS+=("$(swift build -c release --triple $arch-apple-macosx14.0 --scratch-path .build/$arch --show-bin-path)/MiRemote")
    done
    mkdir -p .build/universal
    BIN=.build/universal/MiRemote
    lipo -create "${BINS[@]}" -output "$BIN"
else
    swift build -c release
    BIN="$(swift build -c release --show-bin-path)/MiRemote"
fi
APP="dist/Mi Remote.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/MiRemote"
cp Resources/Info.plist "$APP/Contents/Info.plist"
[[ -f Resources/AppIcon.icns ]] && cp Resources/AppIcon.icns "$APP/Contents/Resources/"
if [[ -n "${VERSION:-}" ]]; then
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$APP/Contents/Info.plist"
fi
codesign --force --sign - "$APP"
echo "Built $APP"

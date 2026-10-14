#!/bin/zsh
# Builds "Mi Remote.app" into ./dist
#   UNIVERSAL=1  build for both Apple Silicon and Intel
#   VERSION=x.y  set CFBundleShortVersionString
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${UNIVERSAL:-0}" == 1 ]]; then
    ARCHS=(--arch arm64 --arch x86_64)
else
    ARCHS=()
fi
swift build -c release "${ARCHS[@]}"
BIN="$(swift build -c release "${ARCHS[@]}" --show-bin-path)/MiRemote"
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

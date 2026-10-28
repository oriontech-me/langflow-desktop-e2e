#!/usr/bin/env bash
# Copies the Langflow Desktop app out of a DMG into <dest> and prints the executable path,
# for LANGFLOW_DESKTOP_APP. Leaves /Applications alone, so it never replaces an installed app.
# Usage: scripts/install-langflow-desktop-macos.sh <dmg> [dest]   (dest defaults to .cache/app)
set -euo pipefail

dmg=$1
dest=${2:-.cache/app}

mnt=$(hdiutil attach "$dmg" -nobrowse -noautoopen -readonly | awk -F'\t' '/\/Volumes\//{print $NF}')
trap 'hdiutil detach "$mnt" -quiet || true' EXIT

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$mnt"/*.app "$dest"/
app=$(find "$dest" -maxdepth 1 -name '*.app' | head -1)
# Unsigned build: drop the download quarantine so Gatekeeper lets it start.
xattr -dr com.apple.quarantine "$app" 2>/dev/null || true

# The executable name has a trailing space ("Langflow "); read it from Info.plist instead of guessing.
exe=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Contents/Info.plist")
echo "$(cd "$(dirname "$app")" && pwd)/$(basename "$app")/Contents/MacOS/$exe"

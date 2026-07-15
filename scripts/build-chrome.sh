#!/usr/bin/env bash
#
# Package the Chrome/Brave extension for the Chrome Web Store.
#
# Usage: ./scripts/build-chrome.sh
# Output: dist/web-clipper-for-omnifocus-chrome-v<version>.zip
#
# The file list below is an explicit allowlist: anything not named here is not
# shipped. Add new runtime files here or they will be missing from the store
# build even though they work when loaded unpacked.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
OUT="dist/web-clipper-for-omnifocus-chrome-v${VERSION}.zip"

FILES=(
  manifest.json
  background.js
  handoff.html
  popup.html
  popup.css
  popup.js
  options.html
  options.css
  options.js
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
  src/extract-page.js
  src/notifications.js
  src/omnifocus.js
  src/open-omnifocus.js
  src/platform.js
)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "missing: $f" >&2; exit 1; }
done

# Every JS file the manifest or an HTML page references must be in FILES above.
# Catch the common failure: a src/*.js that exists but was never allowlisted.
for f in src/*.js; do
  printf '%s\n' "${FILES[@]}" | grep -qxF "$f" || {
    echo "not allowlisted (add to FILES or delete): $f" >&2; exit 1; }
done

mkdir -p dist
rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"

echo "$OUT"
unzip -l "$OUT" | tail -1

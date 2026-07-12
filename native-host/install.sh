#!/bin/bash
# Installs the Clip to OmniFocus native messaging host for Chrome.
#
# Usage: ./install.sh <extension-id> [--uninstall]
# Find the extension ID at chrome://extensions (Developer mode on).

set -euo pipefail

HOST_NAME="com.spiralocean.clip_to_omnifocus"
APP_DIR="$HOME/Library/Application Support/ClipToOmniFocus"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BROWSER_DIRS=(
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
  "$HOME/Library/Application Support/Google/Chrome"
  "$HOME/Library/Application Support/Google/Chrome Beta"
  "$HOME/Library/Application Support/Google/Chrome Canary"
  "$HOME/Library/Application Support/Google/Chrome Dev"
  "$HOME/Library/Application Support/Chromium"
)

if [[ "${1:-}" == "--uninstall" || "${2:-}" == "--uninstall" ]]; then
  rm -rf "$APP_DIR"
  for dir in "${BROWSER_DIRS[@]}"; do
    rm -f "$dir/NativeMessagingHosts/$HOST_NAME.json"
  done
  echo "Uninstalled $HOST_NAME."
  exit 0
fi

EXT_ID="${1:-}"
if [[ ! "$EXT_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Usage: $0 <extension-id> [--uninstall]" >&2
  echo "Find the 32-character ID at chrome://extensions (Developer mode on)." >&2
  exit 1
fi

mkdir -p "$APP_DIR"
cp "$SCRIPT_DIR/host.py" "$APP_DIR/host.py"
chmod +x "$APP_DIR/host.py"

MANIFEST=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Opens omnifocus:// URLs in the background for Clip to OmniFocus",
  "path": "$APP_DIR/host.py",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF
)

installed=0
for dir in "${BROWSER_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  mkdir -p "$dir/NativeMessagingHosts"
  printf '%s\n' "$MANIFEST" > "$dir/NativeMessagingHosts/$HOST_NAME.json"
  echo "Installed manifest for: $(basename "$dir")"
  installed=1
done

if [[ "$installed" == 0 ]]; then
  echo "No Chrome profile directories found." >&2
  exit 1
fi

echo "Done. Reload the extension (chrome://extensions) so it picks up the host."

#!/usr/bin/env python3
"""Native messaging host for Clip to OmniFocus.

Receives {"url": "omnifocus://...", "activate": bool} from the extension
and opens it with /usr/bin/open. Without activate, `open -g` delivers the
URL while OmniFocus stays in the background, so Chrome keeps focus.
"""

import json
import struct
import subprocess
import sys

OPEN = "/usr/bin/open"


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    (length,) = struct.unpack("<I", raw_length)
    return json.loads(sys.stdin.buffer.read(length))


def send_message(message):
    data = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def main():
    message = read_message() or {}
    url = message.get("url", "")
    activate = bool(message.get("activate"))

    if not isinstance(url, str) or not url.startswith("omnifocus://"):
        send_message({"ok": False, "error": "Refused non-OmniFocus URL."})
        return

    command = [OPEN] + ([] if activate else ["-g"]) + [url]
    result = subprocess.run(command, capture_output=True)

    if result.returncode == 0:
        send_message({"ok": True})
    else:
        error = result.stderr.decode("utf-8", "replace").strip()
        send_message({"ok": False, "error": error or "open failed"})


if __name__ == "__main__":
    main()

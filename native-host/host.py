#!/usr/bin/env python3
"""Native messaging host for Clip to OmniFocus.

Messages:
  {"action": "open", "url": "omnifocus://...", "activate": bool}
      Opens the URL with /usr/bin/open. Without activate, `open -g` delivers
      the URL while OmniFocus stays in the background, so Chrome keeps focus.

  {"action": "reveal-task", "name": "Task name"}
      Finds the most recently created OmniFocus task with that exact name
      (via AppleScript) and opens omnifocus:///task/<id>, activating OmniFocus.
"""

import json
import struct
import subprocess
import sys

OPEN = "/usr/bin/open"
OSASCRIPT = "/usr/bin/osascript"


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


def applescript_string(value):
    """Quote a Python string as an AppleScript string literal."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def find_task_id(name):
    """Return the OmniFocus task id for the newest task with this name, or None."""
    script = f"""
tell application "OmniFocus"
  tell default document
    set matches to flattened tasks whose name is {applescript_string(name)}
    if (count of matches) is 0 then return ""
    set best to item 1 of matches
    set bestDate to creation date of best
    repeat with t in matches
      if creation date of t comes after bestDate then
        set best to t
        set bestDate to creation date of t
      end if
    end repeat
    return id of best as string
  end tell
end tell
"""
    result = subprocess.run(
        [OSASCRIPT, "-e", script],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if result.returncode != 0:
        return None
    task_id = (result.stdout or "").strip()
    return task_id or None


def open_url(url, activate):
    command = [OPEN] + ([] if activate else ["-g"]) + [url]
    result = subprocess.run(command, capture_output=True)
    if result.returncode == 0:
        return {"ok": True}
    error = result.stderr.decode("utf-8", "replace").strip()
    return {"ok": False, "error": error or "open failed"}


def handle_open(message):
    url = message.get("url", "")
    activate = bool(message.get("activate"))

    if not isinstance(url, str) or not url.startswith("omnifocus://"):
        return {"ok": False, "error": "Refused non-OmniFocus URL."}

    return open_url(url, activate)


def handle_reveal_task(message):
    name = message.get("name", "")
    if not isinstance(name, str) or not name.strip():
        return {"ok": False, "error": "Missing task name."}

    try:
        task_id = find_task_id(name.strip())
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Timed out looking up task in OmniFocus."}
    except Exception as exc:  # noqa: BLE001 — surface any osascript failure
        return {"ok": False, "error": str(exc) or "Task lookup failed."}

    if not task_id:
        return {"ok": False, "error": "Task not found."}

    # Activate OmniFocus so the user sees the task after a notification click.
    return open_url(f"omnifocus:///task/{task_id}", activate=True)


def main():
    message = read_message() or {}
    action = message.get("action") or "open"

    if action == "reveal-task":
        send_message(handle_reveal_task(message))
        return

    # Default / "open" — original clip handoff.
    send_message(handle_open(message))


if __name__ == "__main__":
    main()

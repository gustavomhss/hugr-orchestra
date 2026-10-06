#!/usr/bin/env python3
"""Prepare an owned VS Code view. Focus/navigation setup is not semantic proof."""

import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--view", choices=("quick", "settings"), default="settings")
    args = parser.parse_args()
    app = json.loads(Path("/session/apps.json").read_text())["apps"]["vscode"]
    fields = Path(f'/proc/{app["pid"]}/stat').read_text().rsplit(")", 1)[1].split()
    if int(fields[19]) != app["startTicks"]:
        raise RuntimeError("Owned VS Code launch changed")
    windows = subprocess.check_output(
        ["xdotool", "search", "--onlyvisible", "--pid", str(app["pid"])], text=True, timeout=5,
    ).split()
    if len(windows) != 1:
        raise RuntimeError("VS Code preparation requires one owned visible window")
    subprocess.run(["xdotool", "windowfocus", "--sync", windows[0]], check=True, timeout=5)
    subprocess.run(["xdotool", "key", "--clearmodifiers", "Escape"], check=True, timeout=5)
    subprocess.run(["xdotool", "key", "--clearmodifiers", "ctrl+p" if args.view == "quick" else "ctrl+comma"],
                   check=True, timeout=5)
    print(json.dumps({"stage": args.view + "-view-setup", "pid": app["pid"], "window": windows[0],
                       "semanticProof": False}))


if __name__ == "__main__":
    main()

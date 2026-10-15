import json
import os
from pathlib import Path
import re
import runpy
import sys
import urllib.parse
import urllib.request

ROOT = Path("/home/dock/.orchestra-runtime")
CONFIG = ROOT / "browser-bridge.json"


def main():
    command = sys.argv[1]
    if command == "configure":
        config = json.loads(sys.stdin.read(16384))
        endpoint = urllib.parse.urlsplit(config["endpoint"])
        if endpoint.scheme != "http" or endpoint.hostname != "host.docker.internal" or endpoint.path != "/open-url" or not endpoint.port:
            raise ValueError("failed")
        if not re.fullmatch(r"[a-f0-9]{64}", config["token"]):
            raise ValueError("failed")
        ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.umask(0o077)
        temporary = CONFIG.with_suffix(".tmp")
        temporary.write_text(json.dumps(config))
        temporary.replace(CONFIG)
        directory = Path("/home/dock/.local/share/applications")
        directory.mkdir(parents=True, exist_ok=True)
        desktop = directory / "orchestra-browser.desktop"
        desktop.write_text("[Desktop Entry]\nType=Application\nName=Orchestra\nNoDisplay=true\nExec=python3 /opt/orchestra/browser-bridge.py open %u\nMimeType=x-scheme-handler/http;x-scheme-handler/https;\n")
        from gi.repository import Gio
        app = Gio.DesktopAppInfo.new_from_filename(str(desktop))
        for kind in ("x-scheme-handler/http", "x-scheme-handler/https"):
            if not app.set_as_default_for_type(kind):
                raise RuntimeError("failed")
        return
    if command == "open":
        url = sys.argv[2]
        parsed = urllib.parse.urlsplit(url)
        if len(url) > 8192 or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("failed")
        config = json.loads(CONFIG.read_text())
        request = urllib.request.Request(config["endpoint"], data=json.dumps({"url": url}).encode(), headers={"Authorization": "Bearer " + config["token"], "Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status != 204:
                raise RuntimeError("failed")
        return
    if command == "callback":
        url = json.loads(sys.stdin.read(16384))["url"]
        parsed = urllib.parse.urlsplit(url)
        if len(url) > 8192 or parsed.scheme != "slack" or parsed.username or parsed.password:
            raise ValueError("failed")
        environment = runpy.run_path("/opt/orchestra/workspace.py")["session_environment"]()
        os.environ.update(environment)
        from gi.repository import Gio
        app = Gio.DesktopAppInfo.new("slack.desktop")
        if app is None:
            raise RuntimeError("failed")
        context = Gio.AppLaunchContext()
        for key, value in environment.items():
            context.setenv(key, value)
        if not app.launch_uris([url], context):
            raise RuntimeError("failed")
        return
    raise ValueError("failed")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("failed", file=sys.stderr)
        sys.exit(1)

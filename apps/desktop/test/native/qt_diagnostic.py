#!/usr/bin/env python3
"""Read-only Qt5 AT-SPI diagnosis; --reproduce requires a fresh private container.

Live: orchestra-a11y-session --exec python3 -B /dev/stdin < qt_diagnostic.py
Private: mount this directory at /proof read-only and run this file with
--reproduce, overriding the image entrypoint with /usr/bin/python3.
Reproduction launches only its own Xvfb, AT-SPI infrastructure and FeatherPad;
it tests root export, not editor mutations or full W0 application conformance.

Primary source (installed Qt 5.15.13+dfsg-1ubuntu1):
https://git.launchpad.net/ubuntu/+source/qtbase-opensource-src/plain/debian/patches/a11y_root.diff?h=ubuntu/noble
https://git.launchpad.net/ubuntu/+source/qtbase-opensource-src/plain/src/platformsupport/linuxaccessibility/dbusconnection.cpp?h=applied/ubuntu/noble
https://raw.githubusercontent.com/tsujan/FeatherPad/V1.4.1/featherpad/main.cpp
"""

import argparse
from contextlib import contextmanager, ExitStack
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from time import monotonic, sleep

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio, GLib

DBUS = "org.freedesktop.DBus"
DBUS_PATH = "/org/freedesktop/DBus"
ROOT = "/org/a11y/atspi/accessible/root"
ACCESSIBLE = "org.a11y.atspi.Accessible"


class Queries:
    def __init__(self, address):
        self.connection = Gio.DBusConnection.new_for_address_sync(
            address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            None, None,
        )
        self.connection.set_exit_on_close(False)
        self.calls = 0
        self.deadline = monotonic() + 10

    def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()"):
        remaining = int((self.deadline - monotonic()) * 1000)
        if self.calls >= 128 or remaining <= 0:
            raise RuntimeError("verification-incomplete: query budget exhausted")
        self.calls += 1
        return self.connection.call_sync(owner, path, interface, method, GLib.Variant(signature, parameters),
                                         GLib.VariantType.new(reply), Gio.DBusCallFlags.NONE,
                                         min(750, remaining), None).unpack()[0]

    def prop(self, owner, path, interface, name):
        return self.call(owner, path, "org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, name), "(v)")

    def clients(self):
        names = self.call(DBUS, DBUS_PATH, DBUS, "ListNames", reply="(as)")
        if len(names) > 64:
            raise RuntimeError("verification-incomplete: bus name limit exceeded")
        result = []
        for name in names:
            if not name.startswith(":"):
                continue
            try:
                pid = self.call(DBUS, DBUS_PATH, DBUS, "GetConnectionUnixProcessID", "(s)", (name,), "(u)")
            except GLib.Error as error:
                if Gio.DBusError.get_remote_error(error) != DBUS + ".Error.NameHasNoOwner":
                    raise
                continue
            result.append({"owner": name, "pid": pid})
        return result

    def close(self):
        self.connection.close_sync(None)


def snapshot(pid):
    with ExitStack() as cleanup:
        session = Queries(os.environ["DBUS_SESSION_BUS_ADDRESS"])
        cleanup.callback(session.close)
        address = session.call("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus", "GetAddress", reply="(s)")
        a11y = Queries(address)
        cleanup.callback(a11y.close)
        registry = a11y.call(DBUS, DBUS_PATH, DBUS, "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
        count = a11y.prop(registry, ROOT, ACCESSIBLE, "ChildCount")
        if type(count) is not int or not 0 <= count <= 16:
            raise RuntimeError("verification-incomplete: registry root limit exceeded")
        clients = a11y.clients()
        result = {
            "pid": pid, "sessionClients": session.clients(), "accessibilityClients": clients,
            "status": {name: session.prop("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Status", name)
                       for name in ("IsEnabled", "ScreenReaderEnabled")},
            "registryRole": a11y.call(registry, ROOT, ACCESSIBLE, "GetRole", reply="(u)"),
            "exporters": [], "qtRoots": [],
        }
        for index in range(count):
            ref = a11y.call(registry, ROOT, ACCESSIBLE, "GetChildAtIndex", "(i)", (index,), "((so))")
            exporter_pid = a11y.call(DBUS, DBUS_PATH, DBUS, "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
            result["exporters"].append({"ref": ref, "pid": exporter_pid})
        for client in clients:
            if client["pid"] != pid:
                continue
            root = {"owner": client["owner"]}
            try:
                root.update(
                    role=a11y.call(client["owner"], ROOT, ACCESSIBLE, "GetRole", reply="(u)"),
                    name=a11y.prop(client["owner"], ROOT, ACCESSIBLE, "Name"),
                    children=a11y.prop(client["owner"], ROOT, ACCESSIBLE, "ChildCount"),
                    interfaces=a11y.call(client["owner"], ROOT, ACCESSIBLE, "GetInterfaces", reply="(as)"),
                )
            except GLib.Error as error:
                root["error"] = {"code": Gio.DBusError.get_remote_error(error), "message": str(error)}
            result["qtRoots"].append(root)
        result["queries"] = session.calls + a11y.calls
        return result


def process_info(pid):
    proc = Path("/proc") / str(pid)
    environment = dict(entry.split("=", 1) for entry in (proc / "environ").read_bytes().decode().split("\0") if "=" in entry)
    return {
        "executable": os.readlink(proc / "exe"),
        "startTicks": int((proc / "stat").read_text().rsplit(")", 1)[1].split()[19]),
        "argv": (proc / "cmdline").read_bytes().decode().rstrip("\0").split("\0"),
        "environment": {key: value for key, value in environment.items()
                        if key.startswith(("QT_", "AT_SPI_", "DBUS_", "DISPLAY", "XAUTHORITY"))},
        "qtLibraries": sorted({line.split()[-1] for line in (proc / "maps").read_text().splitlines() if "libQt5" in line}),
    }


@contextmanager
def child(directory, name, argv, environment):
    with (directory / (name + ".log")).open("w") as log:
        process = subprocess.Popen(argv, env=environment, stdout=log, stderr=subprocess.STDOUT)
    try:
        yield process
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(3)


def reproduce():
    if Path("/session/apps.json").exists():
        raise RuntimeError("Reproduction requires a fresh private container, not the live session")
    with tempfile.TemporaryDirectory(prefix="orchestra-a11y-qt-") as temporary, ExitStack() as cleanup:
        directory = Path(temporary)
        runtime = directory / "runtime"
        runtime.mkdir(mode=0o700)
        os.environ.update(DISPLAY=":92", XDG_RUNTIME_DIR=str(runtime), QT_QPA_PLATFORM="xcb",
                          QT_LINUX_ACCESSIBILITY_ALWAYS_ON="1", LANG="C.UTF-8")
        os.environ.pop("XAUTHORITY", None)
        cleanup.enter_context(child(directory, "xvfb", ["Xvfb", ":92", "-screen", "0", "800x600x24", "-nolisten", "tcp"], os.environ))
        for _ in range(30):
            if subprocess.run(["xdpyinfo"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2).returncode == 0:
                break
            sleep(0.1)
        else:
            raise RuntimeError("Private display startup failed")
        cleanup.enter_context(child(directory, "launcher", ["/usr/libexec/at-spi-bus-launcher", "--launch-immediately", "--a11y=1"], os.environ))
        session = Queries(os.environ["DBUS_SESSION_BUS_ADDRESS"])
        cleanup.callback(session.close)
        for _ in range(30):
            if session.call(DBUS, DBUS_PATH, DBUS, "NameHasOwner", "(s)", ("org.a11y.Bus",), "(b)"):
                break
            sleep(0.1)
        else:
            raise RuntimeError("Private accessibility launcher startup failed")
        address = session.call("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus", "GetAddress", reply="(s)")
        os.environ["AT_SPI_BUS_ADDRESS"] = address
        cleanup.enter_context(child(directory, "registry", ["/usr/libexec/at-spi2-registryd"], os.environ))
        a11y = Queries(address)
        cleanup.callback(a11y.close)
        for _ in range(30):
            if a11y.call(DBUS, DBUS_PATH, DBUS, "NameHasOwner", "(s)", ("org.a11y.atspi.Registry",), "(b)"):
                break
            sleep(0.1)
        else:
            raise RuntimeError("Private accessibility registry startup failed")
        observations = []
        for trial in ("env-only", "x-atom", "env-only-restored"):
            if trial == "x-atom":
                subprocess.run(["xprop", "-root", "-f", "AT_SPI_BUS", "8s", "-set", "AT_SPI_BUS", address], check=True, timeout=3)
            if trial == "env-only-restored":
                subprocess.run(["xprop", "-root", "-remove", "AT_SPI_BUS"], check=True, timeout=3)
            home = directory / trial
            home.mkdir()
            (home / "input.txt").write_text("FeatherPad Qt5 diagnostic\n", encoding="utf-8")
            environment = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
                           "XDG_CACHE_HOME": str(home / ".cache"), "XDG_DATA_HOME": str(home / ".local/share")}
            with child(directory, trial, ["featherpad", "--standalone", str(home / "input.txt")], environment) as app:
                sleep(1)
                if app.poll() is not None:
                    raise RuntimeError("FeatherPad exited: " + (directory / (trial + ".log")).read_text())
                receipt = snapshot(app.pid)
                with (directory / (trial + ".log")).open() as log:
                    receipt.update(trial=trial, process=process_info(app.pid),
                                   xAtom=subprocess.check_output(["xprop", "-root", "AT_SPI_BUS"], text=True, timeout=3),
                                   log=log.read(8192))
                observations.append(receipt)
                print(json.dumps(receipt, ensure_ascii=False), flush=True)
        for observation in observations:
            roots = observation["qtRoots"]
            if len(roots) != 1:
                raise RuntimeError("verification-incomplete: expected one Qt bus connection")
            if observation["trial"] == "x-atom":
                if roots[0].get("role") != 75 or roots[0].get("children", 0) < 1 or not any(
                    exporter["pid"] == observation["pid"] for exporter in observation["exporters"]
                ):
                    raise RuntimeError("X atom did not establish a registered nonempty application root")
                continue
            if roots[0].get("error", {}).get("code") != DBUS + ".Error.UnknownObject" or any(
                exporter["pid"] == observation["pid"] for exporter in observation["exporters"]
            ):
                raise RuntimeError("Environment-only control did not reproduce the missing-root failure")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reproduce", action="store_true")
    parser.add_argument("--inside", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    versions = json.loads(Path("/opt/orchestra-a11y/versions.json").read_text())["packages"]
    print(json.dumps({"packages": {key: value for key, value in versions.items()
                      if "libqt5" in key or key == "featherpad"}}), flush=True)
    if args.reproduce:
        if not args.inside:
            if Path("/session/apps.json").exists():
                raise RuntimeError("Reproduction requires a fresh private container")
            return subprocess.run(["dbus-run-session", "--", sys.executable, "-B", str(Path(__file__).resolve()),
                                   "--reproduce", "--inside"], timeout=40).returncode
        reproduce()
        return 0
    apps = json.loads(Path("/session/apps.json").read_text())
    app = apps["apps"]["featherpad"]
    process = process_info(app["pid"])
    if process["startTicks"] != app["startTicks"] or process["executable"] != app["executable"]:
        raise RuntimeError("Published FeatherPad process identity changed")
    receipt = snapshot(app["pid"])
    with Path("/session/logs/featherpad.log").open() as log:
        receipt.update(launch=app, process=process, log=log.read(8192))
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

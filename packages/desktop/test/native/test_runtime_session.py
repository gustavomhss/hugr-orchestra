#!/usr/bin/env python3
"""Real workspace session parsing, Linux /proc and owned Unix socket regressions.

Linux with PyGObject and dbus-daemon (no GUI required for the default tests):
    python3 -B test/native/test_runtime_session.py --workspace resources/linux-runtime/workspace.py --self-check

An already running runtime, with this file staged at /tmp/test_runtime_session.py:
    python3 -B /tmp/test_runtime_session.py --workspace /opt/orchestra/workspace.py --live-session --self-check

--payload accepts the workspace.py file or its directory, as does --workspace.
Explicit paths also work when this script is passed on stdin. Darwin/missing Gio
reports NOTRUN, never a skipped/green Linux result. No GI or /proc stubs are used.

The passive-reader regressions use real Gio and private dbus-daemon processes,
with a controlled org.a11y.Bus exporter that starts a real bus on GetAddress.
They establish wire behavior, not GNOME-binary, Xpra or toolkit conformance.
--case NAME may be repeated; --self-check runs only matching mutation controls.
Workspace census tests require an unprivileged Linux user. --foreign-pid supplies
an existing foreign-UID/namespace process for an optional exclusion probe.
"""

import argparse
import ast
from concurrent.futures import Future
import copy
import errno
import importlib.util
import io
import json
import os
from pathlib import Path
import selectors
import socket
import stat
import subprocess
import sys
import tempfile
from threading import Event, Lock, Thread, Timer
from time import monotonic
import unittest
import uuid
from xml.etree import ElementTree


class SessionBusWire:
    """Controlled lazy launcher over real D-Bus, including eavesdropped activation calls."""

    def __init__(self, api, runtime):
        from gi.repository import Gio, GLib

        self.Gio, self.GLib = Gio, GLib
        self.api, self.runtime = api, runtime
        self.context = GLib.MainContext.new()
        self.loop = GLib.MainLoop.new(self.context, False)
        self.cancel = Gio.Cancellable.new()
        self.deadline = Timer(20, self.cancel.cancel)
        self.deadline.daemon = True
        self.ready, self.lock = Future(), Lock()
        self.connections, self.monitors, self.filters, self.daemons = [], [], [], []
        self.calls = {"GetAddress": 0, "Set": 0, "StartServiceByName": 0, "launches": 0}
        self.accessible = self.failure = None
        self.enabled = False
        self.info = Gio.DBusNodeInfo.new_for_xml("""<node>
  <interface name="org.a11y.Bus">
    <method name="GetAddress"><arg type="s" direction="out"/></method>
  </interface>
  <interface name="org.a11y.Status">
    <property name="IsEnabled" type="b" access="readwrite"/>
  </interface>
</node>""")
        self.thread = Thread(target=self.run, name="runtime-session-wire", daemon=True)

    def start(self):
        self.deadline.start()
        self.thread.start()
        self.ready.result(5)

    def daemon(self, name, path):
        config = ElementTree.Element("busconfig")
        config.extend(node for node in ElementTree.fromstring(self.api.session_bus_config(_runtime=self.runtime))
                      if node.tag in ("type", "auth", "policy"))
        ElementTree.SubElement(config, "listen").text = "unix:path=" + str(path)
        # dbus-daemon looks up the activation entry BEFORE checking whether the
        # name is already owned. RequestName alone does not make it activatable.
        service = "org.a11y.Bus" if name == "session" else "org.a11y.atspi.Registry"
        directory = self.runtime / "run" / (name + "-services")
        directory.mkdir(mode=0o700, exist_ok=True)
        self.api.atomic_private_file(directory / (service + ".service"),
                                     f"[D-BUS Service]\nName={service}\nExec=/bin/false\n".encode(), 1024)
        ElementTree.SubElement(config, "servicedir").text = str(directory)
        # These controlled services are pre-owned and exercise ALREADY_RUNNING.
        # Exec is a fail-closed trap for an owner gap, not a substitute provider.
        file = self.runtime / "run" / (name + "-fixture.conf")
        self.api.atomic_private_file(file, ElementTree.tostring(config), self.api.CONFIG_BYTES)
        process = subprocess.Popen(["dbus-daemon", "--nofork", "--print-address=1", "--config-file=" + str(file)],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        self.daemons.append(process)
        data, deadline = bytearray(), monotonic() + 3
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while b"\n" not in data:
                if len(data) >= 1024 or not selector.select(max(0, deadline - monotonic())):
                    raise AssertionError("fixture-daemon-address-timeout")
                chunk = os.read(process.stdout.fileno(), 1024 - len(data))
                if not chunk:
                    raise AssertionError("fixture-daemon-address-missing")
                data.extend(chunk)
        address = bytes(data).decode().strip()
        self.api.bus_socket_path(address, accessibility=name == "atspi", _runtime=self.runtime)
        if ",guid=" not in address:
            raise AssertionError("fixture-daemon-guid-missing")
        return process, address

    def connect(self, address):
        connection = self.Gio.DBusConnection.new_for_address_sync(
            address, self.Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | self.Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            None, self.cancel)
        connection.set_exit_on_close(False)
        self.connections.append(connection)
        return connection

    def call(self, connection, method, signature, parameters, reply):
        return connection.call_sync("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus", method,
                                    self.GLib.Variant(signature, parameters), self.GLib.VariantType.new(reply),
                                    self.Gio.DBusCallFlags.NO_AUTO_START, 1000, self.cancel).unpack()

    def own(self, connection, name):
        if name not in self.call(connection, "ListActivatableNames", "()", (), "(as)")[0]:
            raise AssertionError("fixture-activation-entry-missing: " + name)
        if self.call(connection, "RequestName", "(su)", (name, 4), "(u)") != (1,):
            raise AssertionError("fixture-name-not-owned: " + name)
        owner = self.call(connection, "GetNameOwner", "(s)", (name,), "(s)")[0]
        if (owner != connection.get_unique_name()
                or self.call(connection, "GetConnectionUnixProcessID", "(s)", (owner,), "(u)") != (os.getpid(),)):
            raise AssertionError("fixture-owner-not-ready: " + name)

    def observe(self, connection, message, incoming, *_):
        if not incoming or message.get_message_type() != self.Gio.DBusMessageType.METHOD_CALL:
            return message
        method, interface = message.get_member(), message.get_interface()
        if ((interface, method) in (("org.freedesktop.DBus", "StartServiceByName"), ("org.a11y.Bus", "GetAddress"))
                or (interface, method, message.get_path()) == ("org.freedesktop.DBus.Properties", "Set", "/org/a11y/bus")):
            with self.lock:
                self.calls[method] += 1
        # These are eavesdropped copies, never method calls for the monitor.
        # Drop them before Gio could send a spurious UnknownMethod reply.
        return None

    def monitor(self, address):
        connection = self.connect(address)
        self.filters.append((connection, connection.add_filter(self.observe, None)))
        self.call(connection, "AddMatch", "(s)", ("type='method_call',eavesdrop='true'",), "()")
        self.monitors.append(connection)
        return connection

    def launcher(self):
        connection = self.connect(self.session_address)
        for interface in self.info.interfaces:
            if not connection.register_object("/org/a11y/bus", interface, self.method, self.property, self.set_property):
                raise AssertionError("fixture-launcher-registration")
        self.own(connection, "org.a11y.Bus")
        return connection

    def method(self, connection, sender, path, interface, method, parameters, invocation):
        try:
            if (interface, method) != ("org.a11y.Bus", "GetAddress"):
                raise AssertionError("fixture-unexpected-launcher-method")
            if self.accessible is None:
                process, address = self.daemon("atspi", self.runtime / "run/at-spi/bus_100")
                registry = self.connect(address)
                self.own(registry, "org.a11y.atspi.Registry")
                self.accessible = (process, address, registry, self.monitor(address))
                with self.lock:
                    self.calls["launches"] += 1
            invocation.return_value(self.GLib.Variant("(s)", (self.accessible[1],)))
        except Exception as error:
            self.failure = error
            invocation.return_dbus_error("org.orchestra.Test.Failed", "fixture-launcher-failed")

    def property(self, connection, sender, path, interface, name):
        return self.GLib.Variant("b", self.enabled)

    def set_property(self, connection, sender, path, interface, name, value):
        self.enabled = value.unpack()
        return True

    def run(self):
        self.context.push_thread_default()
        try:
            _, self.session_address = self.daemon("session", self.runtime / "run/session-bus")
            self.monitor(self.session_address)
            self.provider = self.launcher()
            self.ready.set_result(None)
            self.loop.run()
        except Exception as error:
            self.failure = error
            if not self.ready.done():
                self.ready.set_exception(error)
        finally:
            for connection, identifier in self.filters:
                connection.remove_filter(identifier)
            for connection in self.connections:
                try:
                    connection.close_sync(self.cancel)
                except self.GLib.Error:
                    pass
            self.context.pop_thread_default()

    def on_loop(self, function):
        result = Future()

        def run(*_):
            try:
                result.set_result(function())
            except Exception as error:
                result.set_exception(error)
            return False

        source = self.GLib.idle_source_new()
        source.set_callback(run)
        source.attach(self.context)
        try:
            return result.result(8)
        finally:
            source.destroy()

    def snapshot(self):
        def read():
            if self.failure is not None:
                raise self.failure
            for connection in self.monitors:
                if not connection.is_closed():
                    # The reply follows already queued eavesdropped calls on this
                    # connection, so assertions cannot race the monitor's filter.
                    self.call(connection, "GetId", "()", (), "(s)")
            with self.lock:
                return dict(self.calls)

        return self.on_loop(read)

    def replace_idle(self):
        def replace():
            previous = self.provider.get_unique_name()
            if self.call(self.provider, "ReleaseName", "(s)", ("org.a11y.Bus",), "(u)") != (1,):
                raise AssertionError("fixture-launcher-release")
            self.provider.close_sync(self.cancel)
            for connection in self.accessible[2:]:
                connection.close_sync(self.cancel)
            self.stop(self.accessible[0])
            self.api.probe_bus_socket(self.accessible[1], accessibility=True, clear_stale=True, _runtime=self.runtime)
            self.accessible = None
            self.provider = self.launcher()
            return previous, self.call(self.provider, "GetNameOwner", "(s)", ("org.a11y.Bus",), "(s)")[0]

        return self.on_loop(replace)

    @staticmethod
    def stop(process):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
        process.stdout.close()

    def close(self):
        self.cancel.cancel()
        self.loop.quit()
        if self.thread.ident is not None:
            self.thread.join(3)
        for process in reversed(self.daemons):
            self.stop(process)
        self.deadline.cancel()
        if self.deadline.ident is not None:
            self.deadline.join(1)
        if self.thread.is_alive():
            raise AssertionError("fixture-wire-thread-not-reaped")
        if self.failure is not None:
            raise self.failure


class RuntimeSessionTests(unittest.TestCase):
    api = None
    foreign_pids = ()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ors-", dir="/tmp")
        self.addCleanup(self.temporary.cleanup)
        self.runtime = Path(self.temporary.name) / ".orchestra-runtime"
        self.runtime.mkdir(mode=0o700)
        (self.runtime / "run").mkdir(mode=0o700)
        (self.runtime / "run/at-spi").mkdir(mode=0o700)
        self.session = {
            "DISPLAY": ":100",
            "DBUS_SESSION_BUS_ADDRESS": "unix:path=" + str(self.runtime / "run/session-bus"),
            "XDG_RUNTIME_DIR": str(self.runtime / "run"),
            "XAUTHORITY": str(self.runtime.parent / ".Xauthority"),
            "AT_SPI_BUS_ADDRESS": "unix:path=" + str(self.runtime / "run/at-spi/bus_100"),
            "ORCHESTRA_A11Y_SESSION_ID": str(uuid.uuid4()),
            "processIdentity": self.api.process_identity(os.getpid()),
        }

    def publish(self, value=None):
        self.api.atomic_private_file(self.runtime / "session.json", json.dumps(
            self.session if value is None else value).encode(), self.api.SESSION_BYTES)

    def listener(self, *, accessibility=False, backlog=4):
        path = self.runtime / "run" / ("at-spi/bus_100" if accessibility else "session-bus")
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(listener.close)
        listener.bind(str(path))
        listener.listen(backlog)
        return listener

    def test_current_linux_identity(self):
        identity = self.api.process_identity(os.getpid())
        self.assertEqual(identity["pid"], os.getpid())
        self.assertGreater(identity["startTicks"], 0)
        self.assertEqual(str(uuid.UUID(identity["bootID"])), identity["bootID"])
        self.assertEqual(identity["pidNamespace"], os.readlink("/proc/self/ns/pid"))
        self.assertEqual(identity["mountNamespace"], os.readlink("/proc/self/ns/mnt"))
        self.publish()
        self.assertEqual(self.api.current_session(_runtime=self.runtime), self.session)

    def test_exited_supervisor(self):
        child = subprocess.Popen([sys.executable, "-B", "-c", "import time; time.sleep(30)"])
        try:
            self.session["processIdentity"] = self.api.process_identity(child.pid)
            self.publish()
            self.assertEqual(self.api.current_session(_runtime=self.runtime), self.session)
        finally:
            child.terminate()
            child.wait(timeout=3)
        with self.assertRaisesRegex(self.api.SessionError, "^native-session-identity-unavailable$"):
            self.api.current_session(_runtime=self.runtime)

    def test_stale_identity(self):
        for key, value in (("startTicks", self.session["processIdentity"]["startTicks"] + 1),
                           ("bootID", str(uuid.uuid4())), ("pidNamespace", "pid:[0]"),
                           ("mountNamespace", "mnt:[0]")):
            with self.subTest(key=key):
                stale = copy.deepcopy(self.session)
                stale["processIdentity"][key] = value
                self.publish(stale)
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-stale$"):
                    self.api.current_session(_runtime=self.runtime)

    def test_missing_and_invalid_fields(self):
        for key in ("DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "AT_SPI_BUS_ADDRESS",
                    "ORCHESTRA_A11Y_SESSION_ID", "processIdentity"):
            with self.subTest(key=key):
                value = copy.deepcopy(self.session)
                del value[key]
                with self.assertRaises(self.api.SessionError):
                    self.api.parse_session(json.dumps(value), _runtime=self.runtime)
        for key in self.session["processIdentity"]:
            with self.subTest(identity=key):
                value = copy.deepcopy(self.session)
                del value["processIdentity"][key]
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-identity-invalid$"):
                    self.api.parse_session(json.dumps(value), _runtime=self.runtime)
        for key, invalid in (("pid", True), ("startTicks", 0), ("startTicks", "1"),
                             ("bootID", "missing"), ("pidNamespace", "pid:1"), ("mountNamespace", "pid:[1]")):
            with self.subTest(identity=key, value=invalid):
                value = copy.deepcopy(self.session)
                value["processIdentity"][key] = invalid
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-identity-invalid$"):
                    self.api.parse_session(json.dumps(value), _runtime=self.runtime)
        for key, invalid in (("DISPLAY", ":101"), ("XDG_RUNTIME_DIR", "/tmp"),
                             ("ORCHESTRA_A11Y_SESSION_ID", "not-a-session"), ("XAUTHORITY", "bad\x00path")):
            with self.subTest(environment=key):
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-invalid$"):
                    self.api.parse_session(json.dumps({**self.session, key: invalid}), _runtime=self.runtime)

    def test_parse_allowlist(self):
        value = {**self.session, "APP_DOCK_RUNTIME_PASSWORD": "fixture-secret", "unexpected": {"secret": True}}
        self.assertEqual(self.api.parse_session(json.dumps(value), _runtime=self.runtime), self.session)
        self.publish(value)
        expected = {key: self.session[key] for key in ("DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR",
                                                      "XAUTHORITY", "AT_SPI_BUS_ADDRESS", "ORCHESTRA_A11Y_SESSION_ID")}
        self.assertEqual(self.api.session_environment(_runtime=self.runtime), expected)
        del value["XAUTHORITY"]
        del expected["XAUTHORITY"]
        self.publish(value)
        self.assertEqual(self.api.session_environment(_runtime=self.runtime), expected)

    def test_degraded_accessibility_session(self):
        degraded = {key: value for key, value in self.session.items()
                    if key not in ("AT_SPI_BUS_ADDRESS", "ORCHESTRA_A11Y_SESSION_ID")}
        degraded["accessibilityError"] = "a11y-startup-failed"
        self.assertEqual(self.api.parse_session(json.dumps(degraded), _runtime=self.runtime), degraded)
        self.publish(degraded)
        # Terminal, files and apps read this environment; it must not need the a11y bus.
        self.assertEqual(self.api.session_environment(_runtime=self.runtime),
                         {key: self.session[key] for key in ("DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "XAUTHORITY")})
        outcome = None
        try:
            self.api.native_session(_runtime=self.runtime)
        except Exception as error:
            outcome = error
        self.assertIsInstance(outcome, self.api.SessionError, "degraded-native-session-refused")
        self.assertEqual(str(outcome), "native-session-a11y-unavailable")
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$"):
            self.api.native_scope(_runtime=self.runtime)
        for name, value in (
                ("bus-with-error", {**degraded, "AT_SPI_BUS_ADDRESS": self.session["AT_SPI_BUS_ADDRESS"]}),
                ("id-with-error", {**degraded, "ORCHESTRA_A11Y_SESSION_ID": self.session["ORCHESTRA_A11Y_SESSION_ID"]}),
                ("both-with-error", {**self.session, "accessibilityError": "a11y-startup-failed"}),
                ("unexplained-absence", {key: value for key, value in degraded.items() if key != "accessibilityError"}),
                ("free-text-code", {**degraded, "accessibilityError": "Bus said: no"}),
                ("non-string-code", {**degraded, "accessibilityError": 1})):
            with self.subTest(record=name):
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-invalid$"):
                    self.api.parse_session(json.dumps(value), _runtime=self.runtime)

    def test_record_bounds_and_mode(self):
        for value in (b"{" + b" " * self.api.SESSION_BYTES, b"[1]", b"null", b"{", b"\xff",
                      b"[" * 2000 + b"]" * 2000):
            with self.subTest(value=value[:16]):
                with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-invalid$"):
                    self.api.parse_session(value, _runtime=self.runtime)
        with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-missing$"):
            self.api.current_session(_runtime=self.runtime)
        self.publish()
        path = self.runtime / "session.json"
        path.chmod(0o644)
        with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-invalid$"):
            self.api.current_session(_runtime=self.runtime)
        path.unlink()
        path.symlink_to(self.runtime.parent / "missing")
        with self.assertRaisesRegex(self.api.SessionError, "^native-session-record-invalid$"):
            self.api.current_session(_runtime=self.runtime)

    def test_private_atomic_replacement(self):
        self.publish()
        path = self.runtime / "session.json"
        # An open reader retains the old complete record across replacement.
        with path.open("rb") as old:
            newer = {**self.session, "ORCHESTRA_A11Y_SESSION_ID": str(uuid.uuid4())}
            self.publish(newer)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(json.loads(old.read()), self.session)
            self.assertEqual(json.loads(path.read_bytes()), newer)
        with self.assertRaisesRegex(self.api.SessionError, "^session-file-too-large$"):
            self.api.atomic_private_file(path, b"x" * (self.api.SESSION_BYTES + 1), self.api.SESSION_BYTES)
        self.assertEqual(json.loads(path.read_bytes()), newer)
        self.assertEqual({entry.name for entry in self.runtime.iterdir()}, {"run", "session.json"})

    def test_active_socket_preserved(self):
        self.listener()
        address = self.session["DBUS_SESSION_BUS_ADDRESS"]
        path = self.runtime / "run/session-bus"
        before = path.stat().st_ino
        self.api.probe_bus_socket(address, _runtime=self.runtime)
        with self.assertRaisesRegex(self.api.SessionError, "^session-bus-active$"):
            self.api.probe_bus_socket(address, clear_stale=True, _runtime=self.runtime)
        self.assertEqual(path.stat().st_ino, before)
        self.listener(accessibility=True)
        self.api.probe_bus_socket(self.session["AT_SPI_BUS_ADDRESS"], accessibility=True, _runtime=self.runtime)

    def test_missing_and_refused_socket(self):
        address = self.session["DBUS_SESSION_BUS_ADDRESS"]
        self.api.probe_bus_socket(address, clear_stale=True, _runtime=self.runtime)
        with self.assertRaisesRegex(self.api.SessionError, "^session-socket-unavailable$"):
            self.api.probe_bus_socket(address, _runtime=self.runtime)
        self.listener().close()
        self.assertTrue((self.runtime / "run/session-bus").is_socket())
        with self.assertRaisesRegex(self.api.SessionError, "^session-socket-unavailable$"):
            self.api.probe_bus_socket(address, _runtime=self.runtime)
        self.api.probe_bus_socket(address, clear_stale=True, _runtime=self.runtime)
        self.assertFalse((self.runtime / "run/session-bus").exists())

    def test_unexpected_socket_error_preserved(self):
        self.listener(backlog=0)
        blocked = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(blocked.close)
        blocked.settimeout(1)
        blocked.connect(str(self.runtime / "run/session-bus"))
        with self.assertRaisesRegex(self.api.SessionError, "^session-socket-probe-failed$"):
            self.api.probe_bus_socket(self.session["DBUS_SESSION_BUS_ADDRESS"], clear_stale=True, _runtime=self.runtime)
        self.assertTrue((self.runtime / "run/session-bus").is_socket())

    def test_foreign_address_and_socket(self):
        address = self.session["DBUS_SESSION_BUS_ADDRESS"]
        self.assertEqual(self.api.bus_socket_path(address + ",guid=" + "1" * 32, _runtime=self.runtime),
                         self.runtime / "run/session-bus")
        for foreign in ("unix:path=/tmp/session-bus", "unix:abstract=orchestra", "unix:tmpdir=/tmp",
                        address + ";unix:path=/tmp/other", address + ",guid=bad", address + ",path=/tmp/other",
                        address.replace("session-bus", "../run/session-bus"), address.replace("/run/", "%2frun/")):
            with self.subTest(address=foreign):
                with self.assertRaisesRegex(self.api.SessionError, "^session-bus-address-invalid$"):
                    self.api.probe_bus_socket(foreign, clear_stale=True, _runtime=self.runtime)
        path = self.runtime / "run/session-bus"
        foreign = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(foreign.close)
        foreign_path = self.runtime.parent / "foreign-bus"
        foreign.bind(str(foreign_path))
        foreign.listen(1)
        path.symlink_to(foreign_path)
        with self.assertRaisesRegex(self.api.SessionError, "^session-socket-invalid$"):
            self.api.probe_bus_socket(address, clear_stale=True, _runtime=self.runtime)
        self.assertTrue(foreign_path.is_socket())
        self.assertTrue(path.is_symlink())
        path.unlink()
        path.write_text("not a socket")
        with self.assertRaisesRegex(self.api.SessionError, "^session-socket-invalid$"):
            self.api.probe_bus_socket(address, clear_stale=True, _runtime=self.runtime)
        self.assertEqual(path.read_text(), "not a socket")

    def test_foreign_runtime_directory(self):
        (self.runtime / "run").chmod(0o755)
        with self.assertRaisesRegex(self.api.SessionError, "^session-root-invalid$"):
            self.api.probe_bus_socket(self.session["DBUS_SESSION_BUS_ADDRESS"], clear_stale=True, _runtime=self.runtime)
        (self.runtime / "run").chmod(0o700)
        self.runtime.rename(self.runtime.parent / "elsewhere")
        self.runtime.symlink_to(self.runtime.parent / "elsewhere", target_is_directory=True)
        with self.assertRaisesRegex(self.api.SessionError, "^session-root-invalid$"):
            self.api.runtime_directories(_runtime=self.runtime)

    def test_standard_session_config(self):
        config = ElementTree.fromstring(self.api.session_bus_config(_runtime=self.runtime))
        standard = ElementTree.parse("/usr/share/dbus-1/session.conf").getroot()
        self.assertEqual(config.findtext("listen"), self.session["DBUS_SESSION_BUS_ADDRESS"])
        self.assertEqual([node.text for node in config.findall("auth")], ["EXTERNAL"])
        self.assertEqual(config.findtext("type"), "session")
        self.assertIsNotNone(config.find("standard_session_servicedirs"))
        self.assertTrue(config.findall("policy"))
        for tag in ("policy", "limit"):
            self.assertEqual([ElementTree.tostring(node) for node in config.findall(tag)],
                             [ElementTree.tostring(node) for node in standard.findall(tag)])
        for node in (*config.findall("include"), *config.findall("includedir")):
            if node.get("selinux_root_relative") != "yes":
                self.assertTrue(Path(node.text).is_absolute())

    def test_real_session_config_daemon(self):
        path = self.runtime / "run/session-bus.conf"
        self.api.atomic_private_file(path, self.api.session_bus_config(_runtime=self.runtime), self.api.CONFIG_BYTES)
        # A real daemon parses the generated policy. Gio authenticates as this UID;
        # no accessibility activation or GUI is involved in this isolated test.
        code = """import os
from gi.repository import Gio, GLib
connection = Gio.DBusConnection.new_for_address_sync(os.environ['DBUS_SESSION_BUS_ADDRESS'],
    Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
result = connection.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
    'GetConnectionUnixUser', GLib.Variant('(s)', (connection.get_unique_name(),)), GLib.VariantType.new('(u)'),
    Gio.DBusCallFlags.NO_AUTO_START, 1000, None).unpack()
assert result == (os.getuid(),)
connection.close_sync(None)
"""
        child = subprocess.run(["dbus-run-session", "--config-file=" + str(path), "--", sys.executable, "-B", "-c", code],
                               env={**os.environ, "XDG_RUNTIME_DIR": str(self.runtime / "run")},
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
        self.assertEqual(child.returncode, 0, child.stderr.decode(errors="replace")[:1024])
        self.assertEqual(child.stdout, b"")

    def bus_wire(self):
        wire = SessionBusWire(self.api, self.runtime)
        self.addCleanup(wire.close)
        wire.start()
        self.session["DBUS_SESSION_BUS_ADDRESS"] = wire.session_address
        self.session["AT_SPI_BUS_ADDRESS"] = self.api.accessibility_bus(self.session, activate=True, _runtime=self.runtime)
        self.publish()
        self.assertEqual(wire.snapshot(), {"GetAddress": 1, "Set": 1, "StartServiceByName": 2, "launches": 1},
                         "startup-wire-positive-control")
        return wire

    def test_readonly_bus_wire(self):
        wire = self.bus_wire()
        before = wire.snapshot()
        result = self.api.native_session(_runtime=self.runtime)
        self.assertEqual(result["sessionID"], self.session["ORCHESTRA_A11Y_SESSION_ID"])
        self.assertEqual(result["environment"]["AT_SPI_BUS_ADDRESS"], self.session["AT_SPI_BUS_ADDRESS"])
        self.assertEqual(wire.snapshot(), before, "readonly-no-GetAddress-or-activation")

    def test_replacement_idle_launcher(self):
        wire = self.bus_wire()
        before = wire.snapshot()
        paused, resume, result = Event(), Event(), Future()

        def pause(frame, event, value):
            # Scheduling instrumentation only: pause AFTER the real socket probe
            # returns. No production callable, argument or result is replaced.
            if (event == "return" and frame.f_code is self.api.probe_bus_socket.__code__
                    and frame.f_locals["accessibility"] and not paused.is_set()):
                paused.set()
                if not resume.wait(15):
                    raise AssertionError("fixture-probe-resume-timeout")

        def read():
            previous = sys.getprofile()
            sys.setprofile(pause)
            try:
                result.set_result(self.api.native_session(_runtime=self.runtime))
            except BaseException as error:
                result.set_exception(error)
            finally:
                sys.setprofile(previous)

        thread = Thread(target=read, name="runtime-read-after-probe", daemon=True)
        thread.start()
        try:
            self.assertTrue(paused.wait(5), "fixture-reader-completed-real-probe")
            previous, replacement = wire.replace_idle()
            self.assertNotEqual(previous, replacement, "fixture-launcher-owner-replaced")
        finally:
            resume.set()
            thread.join(8)
        self.assertFalse(thread.is_alive(), "fixture-reader-not-reaped")
        with self.assertRaisesRegex(self.api.SessionError, "^(session-socket-unavailable|native-session-stale|native-session-bus-unavailable)$"):
            result.result(1)
        self.assertEqual(wire.snapshot(), before, "readonly-idle-launcher-must-not-launch")
        self.assertTrue(wire.on_loop(lambda: wire.accessible is None), "fixture-replacement-still-idle")

    def test_replaced_bus_guid(self):
        wire = self.bus_wire()
        recorded = self.session["AT_SPI_BUS_ADDRESS"]
        wire.replace_idle()
        replacement = self.api.accessibility_bus(self.session, activate=True, _runtime=self.runtime)
        self.assertEqual(recorded.partition(",guid=")[0], replacement.partition(",guid=")[0])
        self.assertNotEqual(recorded.partition(",guid=")[2], replacement.partition(",guid=")[2],
                            "fixture-replacement-guid-differs")
        before = wire.snapshot()
        with self.assertRaisesRegex(self.api.SessionError, "^(native-session-stale|native-session-bus-unavailable)$"):
            self.api.native_session(_runtime=self.runtime)
        self.assertEqual(wire.snapshot(), before, "readonly-guid-mismatch-must-not-activate")
        # Explicit startup can publish the new GUID; the same reader then succeeds.
        self.session["AT_SPI_BUS_ADDRESS"] = replacement
        self.publish()
        self.assertEqual(self.api.native_session(_runtime=self.runtime)["environment"]["AT_SPI_BUS_ADDRESS"], replacement)
        self.assertEqual(wire.snapshot(), before, "readonly-new-guid-must-not-activate")

    def scope_process(self, nondumpable=False):
        code = """import ctypes, os, sys, time
if sys.argv[1] == 'private':
    assert ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0) == 0
print(os.getpid(), flush=True)
time.sleep(30)
"""
        process = subprocess.Popen([sys.executable, "-B", "-c", code, "private" if nondumpable else "normal"],
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE)
        self.addCleanup(SessionBusWire.stop, process)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            self.assertTrue(selector.select(3), "fixture-scope-process-ready")
            self.assertEqual(int(process.stdout.readline(32)), process.pid)
        return process

    def scope_fixture(self):
        wire = self.bus_wire()
        self.session["processIdentity"] = self.api.process_identity(self.scope_process().pid)
        self.publish()
        return wire

    def test_native_workspace_scope(self):
        wire = self.scope_fixture()
        child = self.scope_process()
        before = wire.snapshot()
        result = self.api.native_scope(_runtime=self.runtime)
        self.assertEqual(set(result), {"session", "processIdentities"})
        self.assertEqual(result["session"], self.api.native_session(_runtime=self.runtime))
        self.assertIn(self.session["processIdentity"], result["processIdentities"], "scope-supervisor-present")
        self.assertIn(self.api.process_identity(child.pid), result["processIdentities"], "scope-guest-process-present")
        self.assertNotIn(os.getpid(), [identity["pid"] for identity in result["processIdentities"]], "scope-observer-excluded")
        self.assertEqual(result["processIdentities"], sorted(result["processIdentities"], key=lambda identity: identity["pid"]))
        self.assertTrue(1 <= len(result["processIdentities"]) <= 128)
        for identity in result["processIdentities"]:
            # Uncontrolled workspace members may exit after this non-atomic
            # census. Fresh liveness assertions above use our owned children.
            self.assertEqual(set(identity), {"pid", "startTicks", "bootID", "pidNamespace", "mountNamespace"})
            for key in ("bootID", "pidNamespace", "mountNamespace"):
                self.assertEqual(identity[key], self.session["processIdentity"][key])
        self.assertEqual(wire.snapshot(), before, "scope-observation-must-not-activate")

    def test_census_limits(self):
        supervisor = self.api.process_identity(self.scope_process().pid)
        self.scope_process()
        self.assertIn(supervisor, self.api.workspace_processes(supervisor))
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-process-limit"):
            self.api.workspace_processes(supervisor, _max_processes=1)
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-visit-limit"):
            self.api.workspace_processes(supervisor, _max_visits=1)
        for limits in ({"_max_visits": 1025}, {"_max_processes": 129}, {"_max_processes": 0}):
            with self.subTest(limits=limits):
                with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$"):
                    self.api.workspace_processes(supervisor, **limits)

    def test_census_cancel_and_deadline(self):
        supervisor = self.api.process_identity(self.scope_process().pid)
        cancelled = Event()
        cancelled.set()
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-cancel-before-visit"):
            self.api.workspace_processes(supervisor, _cancelled=cancelled.is_set)
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-absolute-deadline"):
            self.api.workspace_processes(supervisor, _deadline=monotonic() - 1)
        cancelled.clear()

        def cancel_after_identity(frame, event, value):
            if event == "return" and frame.f_code is self.api.process_identity.__code__ and value == supervisor:
                cancelled.set()

        previous = sys.getprofile()
        sys.setprofile(cancel_after_identity)
        try:
            with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-cancel-after-identity"):
                self.api.workspace_processes(supervisor, _cancelled=cancelled.is_set)
        finally:
            sys.setprofile(previous)
        self.assertTrue(cancelled.is_set(), "fixture-real-supervisor-identity-read")

    def test_census_fresh_supervisor(self):
        supervisor = self.api.process_identity(self.scope_process().pid)
        self.assertIn(supervisor, self.api.workspace_processes(supervisor))
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-full-supervisor-identity"):
            self.api.workspace_processes({**supervisor, "startTicks": supervisor["startTicks"] + 1})

    def test_census_disappeared_process(self):
        supervisor = self.api.process_identity(self.scope_process().pid)
        child = self.scope_process()
        exited = Event()

        def exit_before_identity(frame, event, value):
            if (event == "call" and frame.f_code is self.api.process_identity.__code__
                    and frame.f_locals["pid"] == child.pid and not exited.is_set()):
                SessionBusWire.stop(child)
                exited.set()

        previous = sys.getprofile()
        sys.setprofile(exit_before_identity)
        try:
            result = self.api.workspace_processes(supervisor)
        finally:
            sys.setprofile(previous)
        self.assertTrue(exited.is_set(), "fixture-exit-during-real-census")
        self.assertIn(supervisor, result)
        self.assertNotIn(child.pid, [identity["pid"] for identity in result])

    def test_census_live_inaccessible(self):
        self.assertNotEqual(os.getuid(), 0, "fixture-census-requires-unprivileged-runtime-user")
        normal = self.scope_process()
        supervisor = self.api.process_identity(normal.pid)
        self.assertIn(supervisor, self.api.workspace_processes(supervisor), "fixture-readable-census-positive-control")
        child = self.scope_process(nondumpable=True)
        self.assertIsNone(child.poll())
        blocked = []
        for namespace, field in (("pid", "pidNamespace"), ("mnt", "mountNamespace")):
            self.assertEqual(os.readlink(f"/proc/{normal.pid}/ns/{namespace}"), supervisor[field],
                             "fixture-readable-namespace-positive-control")
            try:
                os.readlink(f"/proc/{child.pid}/ns/{namespace}")
            except OSError as error:
                if error.errno not in (errno.EPERM, errno.EACCES):
                    self.fail(f"fixture-unsupported: namespace probe returned errno {error.errno}")
                blocked.append(namespace)
        self.assertTrue(blocked, "fixture-unsupported: nondumpable namespace identity remains readable")
        with self.assertRaisesRegex(self.api.SessionError, "^native-session-identity-unavailable$",
                                    msg="fixture-unsupported: nondumpable production identity remains readable"):
            self.api.process_identity(child.pid)
        self.assertIsNone(child.poll(), "fixture-inaccessible-process-live-before-census")
        with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-live-inaccessible-must-fail"):
            self.api.workspace_processes(supervisor)
        self.assertIsNone(child.poll(), "fixture-inaccessible-process-still-live")
        self.assertEqual(self.api.process_identity(normal.pid), supervisor, "fixture-normal-sibling-still-readable")

    def test_scope_session_refresh(self):
        self.scope_fixture()
        changed = Event()

        def change_after_session(frame, event, value):
            if event == "return" and frame.f_code is self.api.native_session.__code__ and not changed.is_set():
                self.publish({**self.session, "ORCHESTRA_A11Y_SESSION_ID": str(uuid.uuid4())})
                changed.set()

        previous = sys.getprofile()
        sys.setprofile(change_after_session)
        try:
            with self.assertRaisesRegex(self.api.SessionError, "^native-workspace-scope-unavailable$", msg="scope-session-changed-must-fail"):
                self.api.native_scope(_runtime=self.runtime)
        finally:
            sys.setprofile(previous)
        self.assertTrue(changed.is_set(), "fixture-session-changed-after-real-bus-check")

    def test_census_foreign_process(self):
        self.scope_fixture()
        for pid in self.foreign_pids:
            with self.subTest(pid=pid):
                uid = next(line.split()[2] for line in Path(f"/proc/{pid}/status").read_text().splitlines()
                           if line.startswith("Uid:"))
                foreign = int(uid) != os.getuid()
                if not foreign:
                    identity = self.api.process_identity(pid)
                    foreign = any(identity[key] != self.session["processIdentity"][key]
                                  for key in ("bootID", "pidNamespace", "mountNamespace"))
                self.assertTrue(foreign, "fixture-process-must-have-foreign-uid-or-realm")
                self.assertNotIn(pid, [identity["pid"] for identity in
                                      self.api.native_scope(_runtime=self.runtime)["processIdentities"]])


class LiveSessionTests(unittest.TestCase):
    api = None

    def test_actual_supervisor_and_buses(self):
        first = self.api.native_session()
        second = self.api.native_session()
        self.assertEqual(first, second)
        self.assertEqual(set(first), {"sessionID", "processIdentity", "environment"})
        self.assertNotEqual(first["processIdentity"]["pid"], os.getpid())
        self.assertEqual(first["processIdentity"], self.api.process_identity(first["processIdentity"]["pid"]))
        self.assertEqual(first["sessionID"], first["environment"]["ORCHESTRA_A11Y_SESSION_ID"])
        self.assertEqual(first["environment"]["DISPLAY"], ":100")
        self.assertEqual(first["environment"], self.api.session_environment())
        self.assertNotIn("APP_DOCK_RUNTIME_PASSWORD", first["environment"])
        self.assertLessEqual(len(json.dumps(first).encode()), self.api.SESSION_BYTES)


MUTATIONS = (
    ("degraded-pair", "test_degraded_accessibility_session",
     "if degraded and (any(key in session for key in ACCESSIBILITY_FIELDS) or ", "if degraded and ("),
    ("degraded-native", "test_degraded_accessibility_session",
     '    if "accessibilityError" in session:', '    if False:'),
    ("identity", "test_stale_identity",
     '    if process_identity(session["processIdentity"]["pid"]) != session["processIdentity"]:', '    if False:'),
    ("active-socket", "test_active_socket_preserved",
     '                    raise SessionError("session-bus-active")', '                    return'),
    ("allowlist", "test_parse_allowlist",
     '    return {key: session[key] for key in SESSION_FIELDS if key in session}', '    return session'),
    ("private-mode", "test_private_atomic_replacement",
     '            os.fchmod(stream.fileno(), 0o600)', '            os.fchmod(stream.fileno(), 0o644)'),
    ("readonly-get-address", "test_readonly_bus_wire",
     '            if activate else environment["AT_SPI_BUS_ADDRESS"]',
     '            if True else environment["AT_SPI_BUS_ADDRESS"]'),
    ("readonly-idle-launch", "test_replacement_idle_launcher",
     '            if activate else environment["AT_SPI_BUS_ADDRESS"]',
     '            if True else environment["AT_SPI_BUS_ADDRESS"]'),
    ("scope-observer", "test_native_workspace_scope", '                if pid == os.getpid():', '                if False:'),
    ("scope-process-limit", "test_census_limits", '                if len(identities) > _max_processes:', '                if False:'),
    ("scope-visit-limit", "test_census_limits", '                if visits > _max_visits:', '                if False:'),
    ("scope-cancel", "test_census_cancel_and_deadline",
     '    if remaining <= 0 or (cancelled is not None and cancelled()):', '    if remaining <= 0:'),
    ("scope-deadline", "test_census_cancel_and_deadline",
     '    if remaining <= 0 or (cancelled is not None and cancelled()):', '    if cancelled is not None and cancelled():'),
    ("scope-supervisor", "test_census_fresh_supervisor",
     '        if supervisor not in identities or process_identity(supervisor["pid"]) != supervisor:', '        if False:'),
    ("scope-inaccessible", "test_census_live_inaccessible", '                    if _process_exited(pid):', '                    if True:'),
    ("scope-session", "test_scope_session_refresh", '        if (current_session(_runtime=_runtime) != before', '        if (False'),
)


def load_workspace(path, source):
    module = importlib.util.module_from_spec(importlib.util.spec_from_file_location("runtime_workspace", path))
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def main():
    cases = unittest.defaultTestLoader.getTestCaseNames(RuntimeSessionTests)
    parser = argparse.ArgumentParser(description=__doc__)
    paths = parser.add_mutually_exclusive_group()
    paths.add_argument("--workspace", type=Path)
    paths.add_argument("--payload", type=Path)
    parser.add_argument("--syntax-only", action="store_true")
    parser.add_argument("--live-session", action="store_true")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--case", action="append", choices=cases, help="Select a test method; repeat for multiple cases")
    parser.add_argument("--foreign-pid", action="append", type=int, default=[], help="Existing process with a foreign UID or namespace")
    args = parser.parse_args()
    if not args.foreign_pid:
        if args.case and "test_census_foreign_process" in args.case:
            parser.error("test_census_foreign_process requires --foreign-pid")
        cases.remove("test_census_foreign_process")
    # Resolve the fallback only after explicit options; /tmp or stdin scripts
    # have no repository ancestors, and must not evaluate parents[3] eagerly.
    path = args.workspace if args.workspace is not None else args.payload
    if path is None:
        path = Path(__file__).resolve().parent.parent.parent / "resources/linux-runtime/workspace.py"
    if path.is_dir():
        path = path / "workspace.py"
    if not path.is_file():
        parser.error("workspace.py missing; use --workspace or --payload")
    source = path.read_text()
    ast.parse(source, filename=str(path))
    if args.self_check:
        for name, test, before, after in MUTATIONS:
            if test not in (args.case or cases):
                continue
            if source.count(before) != 1:
                raise AssertionError("mutation anchor changed: " + name)
            ast.parse(source.replace(before, after), filename=str(path))
    try:
        ast.parse(source + "\ndef syntax_control(:\n", filename=str(path))
    except SyntaxError:
        pass
    else:
        raise AssertionError("AST syntax control did not reject invalid Python")
    print("AST syntax checked; malformed-source control rejected", flush=True)
    if args.syntax_only or sys.platform != "linux":
        print("NOTRUN: Linux /proc, Unix peer credentials, Gio and live-session checks", flush=True)
        return 0 if args.syntax_only else 2
    try:
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio
    except (ImportError, ValueError):
        print("NOTRUN: Gio unavailable; Linux session tests require real PyGObject", flush=True)
        return 2
    if not hasattr(Gio, "DBusConnection"):
        raise RuntimeError("Gio has no DBusConnection")
    RuntimeSessionTests.api = load_workspace(path, source)
    RuntimeSessionTests.foreign_pids = args.foreign_pid
    suite = unittest.TestSuite(RuntimeSessionTests(name) for name in args.case or cases)
    if args.live_session:
        LiveSessionTests.api = RuntimeSessionTests.api
        suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(LiveSessionTests))
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        return 1
    if args.self_check:
        for name, test, before, after in MUTATIONS:
            if test not in (args.case or cases):
                continue
            if source.count(before) != 1:
                raise AssertionError("mutation anchor changed: " + name)
            RuntimeSessionTests.api = load_workspace(path, source.replace(before, after))
            mutant = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([RuntimeSessionTests(test)]))
            if mutant.wasSuccessful() or mutant.errors or not mutant.failures:
                raise AssertionError("mutation escaped or failed outside its assertion: " + name)
            assertion = {"readonly-get-address": "readonly-no-GetAddress-or-activation",
                         "readonly-idle-launch": "readonly-idle-launcher-must-not-launch",
                         "scope-observer": "scope-observer-excluded", "scope-process-limit": "scope-process-limit",
                         "scope-visit-limit": "scope-visit-limit", "scope-cancel": "scope-cancel-before-visit",
                         "scope-deadline": "scope-absolute-deadline",
                         "scope-supervisor": "scope-full-supervisor-identity", "scope-inaccessible": "scope-live-inaccessible-must-fail",
                         "scope-session": "scope-session-changed-must-fail"}.get(name)
            if assertion and not any(assertion in failure for _, failure in mutant.failures):
                raise AssertionError("mutation missed its named wire assertion: " + name)
            print("Mutation rejected: " + name, flush=True)
    if not args.live_session:
        print("NOTRUN: actual runtime session; add --live-session inside the running workspace", flush=True)
    if not args.foreign_pid:
        print("NOTRUN: supplied foreign UID/namespace exclusion probe; use --foreign-pid", flush=True)
    return 0


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    raise SystemExit(main())

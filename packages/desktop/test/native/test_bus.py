#!/usr/bin/env python3
"""W0 transport conformance: real Gio calls over two disposable D-Bus daemons.

The org.a11y.Bus fixture only advertises a separate private accessibility bus.
These tests do not establish native toolkit, application, or event coverage.
Run with the development image's Python; this script starts dbus-run-session.
Pass --self-check to falsify timeout, bulk-call, pending-limit, and reply-type enforcement in
temporary bus.py copies. The source supplied by --bus-dir is never modified.
"""

import argparse
from collections import deque
from concurrent.futures import Future
import importlib
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from threading import Condition, Event, Thread
from time import monotonic
import unittest

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib

DBUS = "org.freedesktop.DBus"
DBUS_PATH = "/org/freedesktop/DBus"
NAME = "org.orchestra.W0"
ROOT = "/org/a11y/atspi/accessible/root"
ACCESSIBLE = "org.a11y.atspi.Accessible"
VALUE = "W0 café 🧪 漢字 e\u0301"
XML = """<node>
  <interface name="org.a11y.Bus">
    <method name="GetAddress"><arg type="s" direction="out"/></method>
  </interface>
  <interface name="org.orchestra.W0">
    <method name="Tuple"><arg type="(so)" direction="out"/><arg type="au" direction="out"/></method>
    <method name="Delay"><arg type="u" direction="in"/><arg type="s" direction="out"/></method>
    <method name="Reject"/>
    <method name="WrongType"><arg type="u" direction="out"/></method>
  </interface>
  <interface name="org.a11y.atspi.Accessible">
    <property name="Name" type="s" access="read"/>
    <property name="ChildCount" type="i" access="read"/>
    <method name="GetChildAtIndex"><arg type="i" direction="in"/><arg type="(so)" direction="out"/></method>
  </interface>
  <interface name="org.a11y.atspi.Registry">
    <method name="RegisterEvent"><arg type="s" direction="in"/><arg type="as" direction="in"/><arg type="s" direction="in"/></method>
  </interface>
</node>"""


class Service:
    def __init__(self):
        self.context = GLib.MainContext.new()
        self.loop = GLib.MainLoop.new(self.context, False)
        self.ready = Future()
        self.condition = Condition()
        self.calls = deque(maxlen=128)
        self.received, self.replied = Event(), Event()
        self.connections, self.timers = [], []
        self.daemon = self.thread = None

    def start(self):
        self.daemon = subprocess.Popen(
            ["dbus-daemon", "--session", "--nofork", "--print-address=1"],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, text=True,
        )
        with selectors.DefaultSelector() as selector:
            selector.register(self.daemon.stdout, selectors.EVENT_READ)
            if not selector.select(3):
                raise AssertionError("Private accessibility daemon did not publish an address")
            self.address = self.daemon.stdout.readline().strip()
        if not self.address.startswith("unix:"):
            raise AssertionError("Invalid private accessibility address: " + self.address)
        self.thread = Thread(target=self.run, name="w0-service", daemon=True)
        self.thread.start()
        self.ready.result(3)

    def connect(self, address, names=()):
        connection = Gio.DBusConnection.new_for_address_sync(
            address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            None, None,
        )
        connection.set_exit_on_close(False)
        self.connections.append(connection)
        for name in names:
            result = connection.call_sync(DBUS, DBUS_PATH, DBUS, "RequestName", GLib.Variant("(su)", (name, 4)),
                                          GLib.VariantType.new("(u)"), Gio.DBusCallFlags.NONE, 1000, None)
            if result.unpack() != (1,):
                raise AssertionError("Fixture could not own " + name)
        return connection

    def run(self):
        self.context.push_thread_default()
        try:
            session = self.connect(os.environ["DBUS_SESSION_BUS_ADDRESS"], ("org.a11y.Bus",))
            self.exporter = self.connect(self.address, (NAME, "org.a11y.atspi.Registry"))
            self.other = self.connect(self.address)
            for interface in Gio.DBusNodeInfo.new_for_xml(XML).interfaces:
                connection = session if interface.name == "org.a11y.Bus" else self.exporter
                path = "/org/a11y/bus" if interface.name == "org.a11y.Bus" else (
                    "/org/a11y/atspi/registry" if interface.name == "org.a11y.atspi.Registry" else ROOT
                )
                if not connection.register_object(path, interface, self.method, self.property, None):
                    raise AssertionError("Fixture registration failed: " + interface.name)
            self.ready.set_result(None)
            self.loop.run()
        except Exception as error:
            if not self.ready.done():
                self.ready.set_exception(error)
            else:
                raise
        finally:
            for timer in self.timers:
                timer.destroy()
            for connection in self.connections:
                if not connection.is_closed():
                    connection.close_sync(None)
            self.context.pop_thread_default()

    def method(self, connection, sender, path, interface, method, parameters, invocation):
        with self.condition:
            self.calls.append((interface, method, parameters.unpack()))
            self.condition.notify_all()
        if method == "GetAddress":
            invocation.return_value(GLib.Variant("(s)", (self.address,)))
            return
        if method == "Delay":
            self.received.set()

            def reply(*_):
                invocation.return_value(GLib.Variant("(s)", (VALUE,)))
                self.replied.set()
                return False

            timer = GLib.timeout_source_new(parameters.unpack()[0])
            timer.set_callback(reply)
            timer.attach(self.context)
            self.timers.append(timer)
            return
        if method == "Reject":
            invocation.return_dbus_error(NAME + ".Rejected", "Deliberate provider rejection")
            return
        if method == "GetChildAtIndex":
            index = parameters.unpack()[0]
            ref = ("", ROOT + "/0") if index == 0 else (
                ("", "/org/a11y/atspi/null") if index == 1 else (NAME, ROOT + "/2")
            )
            invocation.return_value(GLib.Variant("((so))", (ref,)))
            return
        invocation.return_value({
            "Tuple": GLib.Variant("((so)au)", ((self.exporter.get_unique_name(), ROOT), [3, 42])),
            "WrongType": GLib.Variant("(u)", (7,)),
            "RegisterEvent": GLib.Variant("()", ()),
        }[method])

    def property(self, connection, sender, path, interface, name):
        return GLib.Variant("s", VALUE) if name == "Name" else GLib.Variant("i", 3)

    def close(self):
        self.loop.quit()
        if self.thread:
            self.thread.join(3)
        if self.daemon:
            self.daemon.terminate()
            self.daemon.wait(3)
            self.daemon.stdout.close()
        if self.thread and self.thread.is_alive():
            raise AssertionError("Fixture GLib thread did not stop")


class BusTests(unittest.TestCase):
    def setUp(self):
        self.service = Service()
        self.addCleanup(self.service.close)
        self.service.start()
        self.bus = self.wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], timeout_ms=1000)
        self.addCleanup(self.bus.close)
        self.owner = self.service.exporter.get_unique_name()

    def call(self, method, signature="()", parameters=(), reply="()", timeout_ms=None, interface=NAME):
        return self.bus.call(self.owner, ROOT, interface, method, signature, parameters, reply, timeout_ms)

    def valid(self):
        self.assertEqual(self.call("Tuple", reply="((so)au)"), ((self.owner, ROOT), [3, 42]))
        self.assertEqual(self.bus.trace[-1]["method"], "Tuple")

    def test_address_identity_and_values(self):
        self.valid()
        self.assertEqual(self.bus.owner(NAME), self.owner)
        self.assertEqual(self.bus.process_id(self.owner), os.getpid())
        self.assertEqual(self.bus.property(self.owner, ROOT, ACCESSIBLE, "Name"), VALUE)
        self.assertTrue(self.bus._thread.is_alive())
        addresses = [call for call in self.bus.trace if call["method"] == "GetAddress"]
        self.assertEqual(len(addresses), 1)
        self.assertEqual(addresses[0]["owner"], "org.a11y.Bus")
        self.assertEqual(self.bus.connection.get_guid(), self.service.exporter.get_guid())
        self.assertNotEqual(self.bus.connection.get_guid(), self.service.connections[0].get_guid())
        self.assertEqual(self.bus.trace_total, len(self.bus.trace))

    def test_remote_errors_and_reply_type(self):
        self.valid()
        for method, interface, code in (
            ("Missing", NAME, DBUS + ".Error.UnknownMethod"),
            ("Tuple", NAME + ".Missing", DBUS + ".Error.UnknownMethod"),
            ("Reject", NAME, NAME + ".Rejected"),
            ("WrongType", NAME, "provider-unavailable"),
        ):
            with self.subTest(method=method, interface=interface):
                with self.assertRaises(self.wire.BusError) as caught:
                    self.call(method, reply="(s)", interface=interface)
                self.assertEqual(caught.exception.code, code)
                if method == "WrongType":
                    self.assertIn("(u)", str(caught.exception))
                    self.assertIn("(s)", str(caught.exception))
        self.valid()

    def test_rejects_bulk_before_trace(self):
        self.valid()
        for interface, method in ((NAME, "GetItems"), (ACCESSIBLE, "GetChildren"),
                                  ("org.freedesktop.DBus.Properties", "GetAll"), ("org.a11y.atspi.Collection", "Match")):
            with self.subTest(interface=interface, method=method):
                before = self.bus.trace_total
                with self.assertRaises(self.wire.BusError) as caught:
                    self.call(method, interface=interface)
                self.assertEqual(caught.exception.code, "unsupported-operation")
                self.valid()  # The same trace must see a genuine outgoing call.
                self.assertEqual(self.bus.trace_total, before + 1)
                self.assertEqual(self.bus.trace[-1]["method"], "Tuple")

    def test_limits_and_indexed_children(self):
        self.valid()
        before = self.bus.trace_total
        for timeout in (0, -1, 60001, True, 1.5):
            with self.subTest(timeout=timeout):
                with self.assertRaises(self.wire.BusError) as caught:
                    self.call("Tuple", reply="((so)au)", timeout_ms=timeout)
                self.assertEqual(caught.exception.code, "protocol-error")
        for limit in (-1, 513, True):
            with self.assertRaises(self.wire.BusError) as caught:
                self.bus.children(self.owner, ROOT, limit)
            self.assertEqual(caught.exception.code, "protocol-error")
        self.valid()
        self.assertEqual(self.bus.trace_total, before + 1)
        self.assertEqual(self.bus.children(self.owner, ROOT, 0), [])
        self.assertEqual(self.bus.children(self.owner, ROOT, 2), [(self.owner, ROOT + "/0")])
        self.assertEqual(self.bus.children(self.owner, ROOT, 3), [(self.owner, ROOT + "/0"), (self.owner, ROOT + "/2")])
        indexed = [call["parameters"] for call in self.bus.trace if call["method"] == "GetChildAtIndex"]
        self.assertEqual(indexed, [(0,), (1,), (0,), (1,), (2,)])

    def test_definite_tuple_signatures(self):
        self.valid()
        for signature, reply in (("s", "(s)"), ("()", "s"), ("()", "(*)")):
            with self.subTest(signature=signature, reply=reply):
                with self.assertRaises(self.wire.BusError) as caught:
                    self.call("WrongType", signature=signature, reply=reply, timeout_ms=80)
                self.assertEqual(caught.exception.code, "protocol-error")
        self.valid()

    def test_out_of_range_parameters_never_reach_the_wire(self):
        self.valid()
        before = self.bus.trace_total
        for signature, parameters in (("(u)", (-1,)), ("(i)", (2**31,))):
            with self.subTest(signature=signature, parameters=parameters):
                with self.assertRaises(self.wire.BusError) as caught:
                    self.call("Delay", signature, parameters, "(s)", 80)
                self.assertEqual(caught.exception.code, "protocol-error")
        self.assertEqual(self.bus.trace_total, before)
        self.valid()

    def test_timeout_no_retry(self):
        self.valid()
        started = monotonic()
        with self.assertRaises(self.wire.BusError) as caught:
            self.call("Delay", "(u)", (400,), "(s)", 80)
        self.assertEqual(caught.exception.code, "timeout")
        self.assertLess(monotonic() - started, 1)
        self.assertTrue(self.service.received.wait(1), "Timeout must follow actual provider dispatch")
        self.valid()
        self.assertTrue(self.service.replied.wait(2), "Delayed provider must really send a late reply")
        self.valid()
        with self.service.condition:
            self.assertEqual(sum(call[1] == "Delay" for call in self.service.calls), 1)
        self.assertEqual(sum(call["method"] == "Delay" for call in self.bus.trace), 1)
        with self.bus._lock:
            self.assertEqual(len(self.bus._pending), 0)

    def test_close_pending(self):
        self.valid()
        results = [Future() for _ in range(16)]

        def request(result):
            try:
                result.set_result(self.call("Delay", "(u)", (10000,), "(s)", 5000))
            except Exception as error:
                result.set_exception(error)

        callers = [Thread(target=request, args=(result,), daemon=True) for result in results]
        for caller in callers:
            caller.start()
        with self.service.condition:
            self.assertTrue(self.service.condition.wait_for(
                lambda: sum(call[1] == "Delay" for call in self.service.calls) == 16, timeout=3,
            ), "Close must cancel already dispatched calls, not just queued work")
        before = self.bus.trace_total
        with self.assertRaises(self.wire.BusError) as caught:
            self.call("Tuple", reply="((so)au)")
        self.assertEqual(caught.exception.code, "busy")
        self.assertEqual(self.bus.trace_total, before)
        self.bus.close()
        for caller, result in zip(callers, results):
            caller.join(1)
            self.assertFalse(caller.is_alive())
            with self.assertRaises(self.wire.BusError) as caught:
                result.result(1)
            self.assertEqual(caught.exception.code, "cancelled")
        self.assertFalse(self.bus._thread.is_alive())
        self.assertFalse(self.bus._loop.is_running())
        self.assertFalse(self.bus._pending)
        before = self.bus.trace_total
        with self.assertRaises(self.wire.BusError) as caught:
            self.call("Tuple", reply="((so)au)")
        self.assertEqual(caught.exception.code, "cancelled")
        self.assertEqual(self.bus.trace_total, before)
        self.bus.close()

    def test_owner_scoped_lifecycle(self):
        events, changed = [], Condition()

        def dirty(*event):
            with changed:
                events.append(event)
                changed.notify_all()

        status = self.bus.subscribe_lifecycle(self.owner, dirty)
        self.assertEqual(status["defunct"], "registered; delivery requires empirical proof")
        self.valid()  # Flush subscription setup before sending fixture signals.
        for connection, ref in ((self.service.other, self.owner), (self.service.exporter, self.service.other.get_unique_name())):
            connection.emit_signal(None, "/org/a11y/atspi/cache", "org.a11y.atspi.Cache", "RemoveAccessible",
                                   GLib.Variant("((so))", ((ref, ROOT),)))
            connection.flush_sync(None)
        self.service.exporter.emit_signal(None, ROOT, "org.a11y.atspi.Event.Object", "StateChanged", GLib.Variant("(si)", ("defunct", 0)))
        self.service.exporter.emit_signal(None, "/org/a11y/atspi/cache", "org.a11y.atspi.Cache", "RemoveAccessible",
                                          GLib.Variant("((so))", ((self.owner, ROOT),)))
        self.service.exporter.emit_signal(None, ROOT, "org.a11y.atspi.Event.Object", "StateChanged", GLib.Variant("(si)", ("defunct", 1)))
        self.service.exporter.flush_sync(None)
        with changed:
            self.assertTrue(changed.wait_for(lambda: len(events) >= 2, timeout=2))
            self.assertEqual(events, [("cache-remove", self.owner, ROOT), ("defunct", self.owner, ROOT)])
        self.service.exporter.close_sync(None)
        with changed:
            self.assertTrue(changed.wait_for(lambda: len(events) >= 3, timeout=2))
            self.assertEqual(events[-1], ("owner-loss", self.owner, ROOT))
            self.assertEqual(len(events), 3)


def self_check(args):
    source = (args.bus_dir / "bus.py").read_text(encoding="utf-8")
    mutations = (
        ("timeout", "test_timeout_no_retry",
         "timeout = self._timeout(self.timeout_ms if timeout_ms is None else timeout_ms)", "timeout = self._timeout(2000)"),
        ("bulk-guard", "test_rejects_bulk_before_trace",
         'if method in ("GetItems", "GetChildren", "GetAll") or interface == "org.a11y.atspi.Collection":', "if False:"),
        ("pending-limit", "test_close_pending",
         "if len(self._pending) >= 16:", "if len(self._pending) >= 17:"),
        ("typed-reply", "test_remote_errors_and_reply_type",
         "parameters, reply = GLib.Variant(signature, parameters), GLib.VariantType.new(reply)",
         "parameters, reply = GLib.Variant(signature, parameters), None"),
    )
    for name, case, old, new in mutations:
        if source.count(old) != 1:
            raise AssertionError("Mutation anchor changed: " + name)
        with tempfile.TemporaryDirectory(prefix="orchestra-a11y-mutation-") as directory:
            (Path(directory) / "bus.py").write_text(source.replace(old, new), encoding="utf-8")
            result = subprocess.run(
                ["dbus-run-session", "--", sys.executable, "-B", str(Path(__file__).resolve()),
                 "--inside-session", "--bus-dir", directory, "--case", case],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=20,
            )
        print(result.stdout, end="", flush=True)
        if result.returncode != 1 or "FAIL: " + case not in result.stdout or "AssertionError:" not in result.stdout:
            raise AssertionError("Mutation did not produce its expected assertion failure: " + name)
        print("MUTATION REJECTED: " + name, flush=True)
    if (args.bus_dir / "bus.py").read_text(encoding="utf-8") != source:
        raise AssertionError("Production source changed during self-check")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bus-dir", type=Path, default=Path(__file__).resolve().parent.parent.parent / "resources/linux/app-dock-accessibility")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--inside-session", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--case", choices=unittest.defaultTestLoader.getTestCaseNames(BusTests))
    args = parser.parse_args()
    if not args.inside_session:
        return subprocess.run(["dbus-run-session", "--", sys.executable, "-B", str(Path(__file__).resolve()),
                               "--inside-session", *sys.argv[1:]], timeout=90).returncode
    sys.path.insert(0, str(args.bus_dir.resolve()))
    BusTests.wire = importlib.import_module("bus")
    suite = unittest.TestSuite([BusTests(args.case)]) if args.case else unittest.defaultTestLoader.loadTestsFromTestCase(BusTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if args.self_check:
        self_check(args)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())

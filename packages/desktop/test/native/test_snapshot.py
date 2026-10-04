#!/usr/bin/env python3
"""W2 A: actual refs/snapshot/context on a real, disposable Gio D-Bus exporter.

The fixture implements fixed AT-SPI wire signatures and independently controlled
objects. It proves transport, scope, lifetime and bounds here, not toolkit/event
coverage. No GUI session is used. Run Python -B under dbus-run-session.
--self-check mutates temporary module copies, requires named assertion failures,
restores those copies and checks the mounted production digests.
"""

import argparse
from collections import deque
from concurrent.futures import Future
from copy import deepcopy
import hashlib
import importlib
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from threading import Event, Thread
from time import monotonic
import unittest

import gi

gi.require_version("Gio", "2.0")
gi.require_version("GLib", "2.0")
from gi.repository import Gio, GLib

A = "org.a11y.atspi."
DBUS = "org.freedesktop.DBus"
ROOT = "/org/a11y/atspi/accessible/root"
NULL = "/org/a11y/atspi/null"
WINDOW = ROOT + "/window"
SIBLING = ROOT + "/sibling"
ENTRY = WINDOW + "/entry"
BUTTON = WINDOW + "/button"
VALUE = "café 🧪 漢字 e\u0301"
QT_VALUE = "abcdefghijklmnopqrstuvwx🧪"
SECRET = "PROTECTED-SENTINEL-🔑"
XML = """<node>
 <interface name="org.a11y.Bus">
  <method name="GetAddress"><arg type="s" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.Accessible">
  <property name="Name" type="s" access="read"/>
  <property name="Parent" type="(so)" access="read"/>
  <property name="ChildCount" type="i" access="read"/>
  <method name="GetRole"><arg type="u" direction="out"/></method>
  <method name="GetState"><arg type="au" direction="out"/></method>
  <method name="GetInterfaces"><arg type="as" direction="out"/></method>
  <method name="GetChildAtIndex"><arg type="i" direction="in"/><arg type="(so)" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.Action">
  <property name="NActions" type="i" access="read"/>
  <method name="GetName"><arg type="i" direction="in"/><arg type="s" direction="out"/></method>
  <method name="DoAction"><arg type="i" direction="in"/><arg type="b" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.Text">
  <property name="CharacterCount" type="i" access="read"/>
  <method name="GetText"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="s" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.EditableText">
  <method name="SetTextContents"><arg type="s" direction="in"/><arg type="b" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.Component">
  <method name="GrabFocus"><arg type="b" direction="out"/></method>
 </interface>
 <interface name="org.a11y.atspi.Application">
  <property name="ToolkitName" type="s" access="read"/>
 </interface>
 <interface name="org.a11y.atspi.Registry">
  <method name="RegisterEvent"><arg type="s" direction="in"/><arg type="as" direction="in"/><arg type="s" direction="in"/></method>
 </interface>
</node>"""


class Exporter:
    """Only the exporter owns the GLib loop; production uses its own bus thread."""

    def __init__(self):
        self.context = GLib.MainContext.new()
        self.loop = GLib.MainLoop.new(self.context, False)
        self.ready = Future()
        self.connections, self.objects, self.nodes = [], {}, {}
        self.calls = deque(maxlen=8192)
        self.mutations = 0

    def start(self):
        self.daemon = subprocess.Popen(["dbus-daemon", "--session", "--nofork", "--print-address=1"],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, text=True)
        with selectors.DefaultSelector() as selector:
            selector.register(self.daemon.stdout, selectors.EVENT_READ)
            if not selector.select(3):
                raise AssertionError("private-accessibility-address-timeout")
            self.address = self.daemon.stdout.readline().strip()
        if not self.address.startswith("unix:"):
            raise AssertionError("private-accessibility-address-invalid")
        self.thread = Thread(target=self.run, name="w2a-exporter", daemon=True)
        self.thread.start()
        self.ready.result(3)

    def connect(self, address, names=()):
        connection = Gio.DBusConnection.new_for_address_sync(address,
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
        connection.set_exit_on_close(False)
        self.connections.append(connection)
        for name in names:
            reply = connection.call_sync(DBUS, "/org/freedesktop/DBus", DBUS, "RequestName",
                GLib.Variant("(su)", (name, 4)), GLib.VariantType.new("(u)"), Gio.DBusCallFlags.NONE, 1000, None)
            if reply.unpack() != (1,):
                raise AssertionError("fixture-name-unavailable:" + name)
        return connection

    def run(self):
        self.context.push_thread_default()
        try:
            self.info = Gio.DBusNodeInfo.new_for_xml(XML)
            session = self.connect(os.environ["DBUS_SESSION_BUS_ADDRESS"], ("org.a11y.Bus",))
            session.register_object("/org/a11y/bus", self.info.interfaces[0], self.method, None, None)
            self.connection = self.connect(self.address, ("org.a11y.atspi.Registry",))
            self.other = self.connect(self.address)
            self.connection.register_object("/org/a11y/atspi/registry", self.info.interfaces[-1], self.method, None, None)
            self.owner = self.connection.get_unique_name()
            self.other_owner = self.other.get_unique_name()
            self.ready.set_result(None)
            self.loop.run()
        except Exception as error:
            if not self.ready.done():
                self.ready.set_exception(error)
            else:
                raise
        finally:
            for connection in self.connections:
                if not connection.is_closed():
                    connection.close_sync(None)
            self.context.pop_thread_default()

    def on(self, callback):
        future = Future()
        source = GLib.idle_source_new()

        def run(*_):
            try:
                future.set_result(callback())
            except Exception as error:
                future.set_exception(error)
            return False

        source.set_callback(run)
        source.attach(self.context)
        return future.result(3)

    def add(self, path, role=43, name="control", parent=WINDOW, live=(8, 24), text=None, actions=(), owner=None):
        owner = owner or self.owner
        node = {"role": role, "name": name, "parent": (owner, parent), "states": set(live), "children": [],
                "text": text, "textUnits": "scalar", "actions": list(actions), "interfaces": [A + "Accessible"]}
        if text is not None:
            node["interfaces"].extend([A + "Text", A + "EditableText"])
        if actions:
            node["interfaces"].append(A + "Action")

        def install():
            self.nodes[(owner, path)] = node
            connection = self.connection if owner == self.owner else self.other
            registrations = [connection.register_object(path, interface, self.method, self.property, None)
                             for interface in self.info.interfaces[1:-2]]
            if not all(registrations):
                raise AssertionError("fixture-object-registration-failed")
            self.objects[(owner, path)] = registrations

        self.on(install)
        return node

    def change(self, path, owner=None, **fields):
        self.on(lambda: self.nodes[(owner or self.owner, path)].update(fields))

    def toolkit(self, name):
        def install():
            node = self.nodes[(self.owner, ROOT)]
            if "toolkit" not in node:
                self.objects[(self.owner, ROOT)].append(self.connection.register_object(
                    ROOT, self.info.interfaces[-2], self.method, self.property, None))
            node["toolkit"] = name
        self.on(install)

    def remove(self, path):
        def remove():
            for registration in self.objects.pop((self.owner, path)):
                self.connection.unregister_object(registration)
            del self.nodes[(self.owner, path)]
        self.on(remove)

    def property(self, connection, sender, path, interface, name):
        self.calls.append((path, interface, "Get", (interface, name)))
        node = self.nodes[(connection.get_unique_name(), path)]
        if node.get("propertyError") == name:
            raise GLib.Error("Deliberate property failure")
        if name == "CharacterCount" and node.get("onTextCount"):
            node["onTextCount"]()
        signature, value = {"Name": ("s", node["name"]), "Parent": ("(so)", node["parent"]),
            "ChildCount": ("i", node.get("count", len(node["children"]))),
            "NActions": ("i", node.get("actionCount", len(node["actions"]))),
            "CharacterCount": ("i", len((node["text"] or "").encode("utf-16-le")) // 2 if node["textUnits"] == "utf-16" else len(node["text"] or "")),
            "ToolkitName": ("s", node.get("toolkit", ""))}[name]
        return GLib.Variant(signature, value)

    def method(self, connection, sender, path, interface, method, parameters, invocation):
        params = parameters.unpack()
        self.calls.append((path, interface, method, params))
        if method == "GetAddress":
            invocation.return_value(GLib.Variant("(s)", (self.address,)))
            return
        if method == "RegisterEvent":
            invocation.return_value(GLib.Variant("()", ()))
            return
        node = self.nodes[(connection.get_unique_name(), path)]
        if node.get("methodError") == method:
            invocation.return_dbus_error("org.orchestra.W2A.Unavailable", "Deliberate provider failure")
            return
        if method == "GetRole":
            if node.get("onRole"):
                node["onRole"]()
            value = GLib.Variant("(u)", (node["role"],))
        elif method == "GetState":
            value = GLib.Variant("(au)", ([sum(1 << bit for bit in node["states"] if bit < 32),
                                            sum(1 << (bit - 32) for bit in node["states"] if bit >= 32)],))
        elif method == "GetInterfaces":
            value = GLib.Variant("(as)", (node["interfaces"],))
        elif method == "GetChildAtIndex":
            value = GLib.Variant("((so))", (node["children"][params[0]] if params[0] < len(node["children"]) else ("", NULL),))
        elif method == "GetName":
            value = GLib.Variant("(s)", (node["actions"][params[0]],))
        elif method == "GetText":
            # QString-style positions: slicing a UTF-16 surrogate half produces
            # replacement text on the D-Bus UTF-8 wire. The client must not emit it.
            text = (node["text"] or "").encode("utf-16-le")[2 * params[0]:2 * params[1]].decode("utf-16-le", "replace") if node["textUnits"] == "utf-16" else (node["text"] or "")[params[0]:params[1]]
            value = GLib.Variant("(s)", (node.get("textReply", text + node.get("textExtra", "")),))
        else:
            self.mutations += 1
            value = GLib.Variant("(b)", (True,))
        invocation.return_value(value)

    def signal(self, member, path=ENTRY):
        def send():
            if member == "RemoveAccessible":
                self.connection.emit_signal(None, "/org/a11y/atspi/cache", A + "Cache", member,
                                            GLib.Variant("((so))", ((self.owner, path),)))
            else:
                self.connection.emit_signal(None, path, A + "Event.Object", "StateChanged", GLib.Variant("(si)", ("defunct", 1)))
            self.connection.flush_sync(None)
        self.on(send)

    def close(self):
        self.loop.quit()
        self.thread.join(3)
        self.daemon.terminate()
        self.daemon.wait(3)
        self.daemon.stdout.close()
        if self.thread.is_alive():
            raise AssertionError("fixture-thread-not-reaped")


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.service = Exporter()
        self.service.start()
        self.addCleanup(self.service.close)
        self.service.add(ROOT, role=75, parent=NULL, name="application")
        self.service.add(WINDOW, role=23, parent=ROOT, name="confirmed window")
        self.service.add(SIBLING, role=23, parent=ROOT, name="confirmed window")
        self.service.add(ENTRY, role=61, name="entry", live=(7, 8, 24), text=VALUE)
        self.service.add(BUTTON, name="button", actions=("press", "show menu"))
        self.service.change(ROOT, children=[("", WINDOW), ("", SIBLING)])
        self.service.change(WINDOW, children=[("", ENTRY), ("", BUTTON)])
        self.bus = self.wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
        self.addCleanup(self.bus.close)
        self.registry = self.refs.RefRegistry("helper-A")
        self.binding = {"bindingID": "binding-A", "bindingEpoch": "binding-epoch-A",
            "dock": {"senderID": 7, "tabID": "tab-A", "generation": 1, "profileID": "profile-A"},
            "runtime": {"runtimeID": "runtime-A", "runtimeEpoch": "runtime-epoch-A", "accessibilitySessionID": "session-A"},
            "appID": "app-A", "launchEpoch": "launch-A", "ownershipRevision": 1,
            "processIdentities": [self.context.process_identity(os.getpid())],
            "roots": [{"owner": self.service.owner, "path": WINDOW}]}
        self.registry.register(self.binding)

    def ctx(self, binding=None, registry=None, cancelled=None):
        return self.context.RequestContext(self.bus, registry or self.registry, binding or self.binding, 10000, cancelled)

    def read(self, query=None, binding=None, registry=None):
        return self.snapshot.read(self.ctx(binding, registry), {} if query is None else query)

    def workspace(self, count=2):
        roots = [WINDOW, SIBLING, *[ROOT + "/window_" + str(index) for index in range(2, count)]]
        for index, path in enumerate(roots):
            if index >= 2:
                self.service.add(path, role=23, parent=ROOT)
            self.service.change(path, name="window-" + str(index))
            if index:
                self.service.add(path + "/entry", role=61, name="entry-" + str(index), parent=path,
                                 live=(7, 8, 24), text="xyz")
                self.service.add(path + "/button", name="button-" + str(index), parent=path, actions=("press",))
                self.service.change(path, children=[("", path + "/entry"), ("", path + "/button")])
        self.registry.close(self.binding)
        self.binding = {**self.binding, "scopeKind": "workspace",
                        "roots": [{"owner": self.service.owner, "path": path} for path in roots]}
        self.registry.register(self.binding)
        return roots

    def pages(self, query):
        pages = [self.read(query)]
        for _ in range(128):
            page = pages[-1]
            frame = json.dumps({"v": 1, "id": "🧪" * 256, "ok": True, "value": page}).encode() + b"\n"
            self.assertLessEqual(len(frame), self.context.LIMITS["frameBytes"], "workspace-frame-cap")
            self.assertLessEqual(page["coverage"]["calls"], self.context.LIMITS["calls"])
            if not page["hasMore"]:
                return pages
            old = [item["ref"] for item in page["items"]]
            pages.append(self.read({"cursor": page["cursor"]}))
            self.assertTrue(all(self.denied(ref) for ref in old), "workspace-page-consumes-previous-refs")
        self.fail("workspace-continuation-must-finish")

    def ref(self, result, name):
        items = [item for item in result["items"] if item["name"] == name]
        self.assertEqual(len(items), 1, "positive-ref-selection:" + name)
        return items[0]["ref"]

    def denied(self, ref, binding=None, registry=None):
        try:
            (registry or self.registry).resolve(ref, self.ctx(binding, registry))
            return False
        except self.wire.BusError:
            return True

    def error(self, code, callback):
        with self.assertRaises(self.wire.BusError) as caught:
            callback()
        self.assertEqual(caught.exception.code, code)

    def audit(self):
        trace = self.bus.trace
        self.assertTrue(trace, "trace-positive-control")
        self.assertEqual(len(trace), self.bus.trace_total, "trace-not-truncated")
        self.assertIn("GetRole", {call["method"] for call in trace}, "trace-live-role-positive-control")
        self.assertFalse(any(call["method"] in {"GetChildren", "GetItems", "GetAll", "DoAction", "SetTextContents", "GrabFocus", "GenerateKeyboardEvent"}
                             or call["interface"] == A + "Collection" for call in trace), "read-must-not-mutate-or-bulk-query")
        self.assertEqual(self.service.mutations, 0)

    def test_nonempty_unicode_empty_and_max_text_zero(self):
        result = self.read()
        self.assertEqual([item["name"] for item in result["items"]], ["confirmed window", "entry", "button"])
        self.assertEqual(result["text"], VALUE)
        self.assertEqual(result["consistency"], "non-atomic")
        self.assertTrue(result["coverage"]["complete"])
        self.assertFalse(result["hasMore"])
        entry = self.registry.resolve(self.ref(result, "entry"), self.ctx())
        self.assertEqual(entry["states"], {7, 8, 24})
        self.assertEqual(entry["owner"], self.service.owner, "owned-native-record-positive-control")
        self.assertNotIn(self.service.owner, json.dumps(result), "native-exporter-handle-is-internal")
        self.assertNotIn(WINDOW, json.dumps(result), "native-object-path-is-internal")
        button = self.registry.resolve(self.ref(result, "button"), self.ctx())
        self.assertEqual([(action["name"], action["index"]) for action in button["actions"]], [("press", 0), ("show menu", 1)])
        self.assertEqual(len({action["id"] for action in button["actions"]}), 2)
        self.assertTrue(all(result["observation"] in action["id"] for action in button["actions"]))
        self.assertFalse(any("index" in action for item in result["items"] for action in item["actions"]), "native-action-index-is-internal")
        old = self.ref(result, "entry")
        self.service.change(ENTRY, text="")
        empty = self.read()
        self.assertEqual(empty["text"], "")
        self.assertEqual(next(item for item in empty["items"] if item["name"] == "entry")["text"], "")
        self.assertTrue(self.denied(old), "new-observation-consumes-refs")
        before = self.bus.trace_total
        skipped = self.read({"maxText": 0})
        self.assertEqual(skipped["text"], "")
        self.assertTrue(skipped["items"])
        self.assertFalse(any(call["interface"] in (A + "Text", A + "Application") or call.get("parameters", (None,))[0] in (A + "Text", A + "Application")
                             for call in self.bus.trace[before:]), "maxText0-schedules-no-text-work")
        self.audit()

    def test_workspace_roots_first_then_each_root_dfs(self):
        self.workspace()
        self.service.add(ENTRY + "/inner", name="inner", parent=ENTRY)
        self.service.change(ENTRY, children=[("", ENTRY + "/inner")])
        page = self.read({"maxText": 0})
        self.assertEqual([item["name"] for item in page["items"]],
                         ["window-0", "window-1", "entry", "inner", "button", "entry-1", "button-1"],
                         "workspace-root-first-exact-dfs-order")
        self.assertEqual([item["depth"] for item in page["items"]], [0, 0, 1, 2, 1, 1, 1])
        self.assertEqual([item["scopeDepth"] for item in page["items"]], [0, 0, 1, 2, 1, 1, 1])
        self.assertEqual(page["scopeKind"], "workspace")
        self.assertEqual(page["title"], "window-0")
        self.assertEqual([window["ref"] for window in page["windows"]], [item["ref"] for item in page["items"][:2]])
        self.assertEqual([window["title"] for window in page["windows"]], ["window-0", "window-1"])
        for item in page["items"]:
            self.assertEqual(self.registry.resolve(item["ref"], self.ctx())["name"], item["name"], "workspace-refs-really-issued")
        self.assertTrue(page["coverage"]["complete"])
        self.assertFalse(page["hasMore"])
        self.assertFalse(page["truncated"])
        self.audit()

    def test_workspace_catalogue_and_descendants_split(self):
        self.workspace()
        for budget in (1, 2, 3, 5):
            with self.subTest(budget=budget):
                pages = self.pages({"budget": budget, "maxText": 0})
                items = [item for page in pages for item in page["items"]]
                self.assertEqual([item["name"] for item in items],
                                 ["window-0", "window-1", "entry", "button", "entry-1", "button-1"],
                                 "workspace-pages-preserve-root-catalogue-and-children")
                self.assertEqual([item["depth"] for item in items], [0, 0, 1, 1, 1, 1])
                self.assertEqual(len({item["ref"] for item in items}), len(items))
                self.assertTrue(all(0 < len(page["items"]) <= budget for page in pages))
                for page in pages[:-1]:
                    self.assertEqual(page["coverage"]["reasons"], ["page-limit"])
                    self.assertFalse(page["coverage"]["complete"])
                    self.assertTrue(page["truncated"])
                self.assertTrue(pages[-1]["coverage"]["complete"])
                self.assertFalse(pages[-1]["truncated"])
        self.audit()

    def test_workspace_scoped_and_application_keep_dfs(self):
        self.workspace()
        page = self.read({"maxText": 0})
        pages = self.pages({"rootRef": self.ref(page, "window-1"), "budget": 1, "maxText": 0})
        self.assertEqual([item["name"] for page in pages for item in page["items"]], ["window-1", "entry-1", "button-1"])
        self.assertEqual([item["depth"] for page in pages for item in page["items"]], [0, 1, 1])
        for kind in ("application", None):
            self.registry.close(self.binding)
            self.binding.pop("scopeKind", None)
            if kind:
                self.binding["scopeKind"] = kind
            self.registry.register(self.binding)
            pages = self.pages({"budget": 2, "maxText": 0})
            self.assertEqual([item["name"] for page in pages for item in page["items"]],
                             ["window-0", "entry", "button", "window-1", "entry-1", "button-1"], "application-retains-dfs")
        self.audit()

    def test_workspace_deferred_fingerprint_drift(self):
        self.workspace()
        for change in ({"role": 69}, {"name": "renamed"}, {"parent": (self.service.owner, WINDOW)}, {"count": 3}):
            with self.subTest(change=change):
                page = self.read({"budget": 2, "maxText": 0})
                self.service.change(SIBLING, **change)
                # Even though the next page only visits window-0's children,
                # window-1's deferred evidence must already be revalidated.
                with self.assertRaises(self.wire.BusError, msg="workspace-deferred-fingerprint-must-reject") as caught:
                    self.read({"cursor": page["cursor"]})
                self.assertEqual(caught.exception.code, "cursor-stale")
                self.assertTrue(self.denied(page["items"][0]["ref"]))
                self.service.change(SIBLING, role=23, name="window-1", parent=(self.service.owner, ROOT), count=2)
        prefix = "🧪" * 256
        self.service.change(SIBLING, name=prefix + "A")
        page = self.read({"budget": 2, "maxText": 0})
        self.service.change(SIBLING, name=prefix + "B")
        with self.assertRaises(self.wire.BusError, msg="workspace-deferred-full-name-digest-must-reject") as caught:
            self.read({"cursor": page["cursor"]})
        self.assertEqual(caught.exception.code, "cursor-stale")
        self.assertEqual(len([item for page in self.pages({"budget": 2, "maxText": 0}) for item in page["items"]]), 6,
                         "workspace-unchanged-long-name-continuation-positive-control")
        self.audit()

    def test_workspace_deferred_rechecked_before_expansion(self):
        self.workspace()
        changed = []

        def rename():
            changed.append(True)
            self.service.nodes[(self.service.owner, WINDOW)]["name"] = "changed-after-catalogue"

        self.service.change(SIBLING, onRole=rename)
        with self.assertRaises(self.wire.BusError, msg="workspace-delayed-root-rechecked-before-expansion") as caught:
            self.read({"maxText": 0})
        self.assertEqual(caught.exception.code, "cursor-stale")
        self.assertTrue(changed, "workspace-in-page-root-drift-hook-exercised")
        self.service.change(SIBLING, onRole=None)
        self.service.change(WINDOW, name="window-0")
        page = self.read({"budget": 2, "maxText": 0})

        def rename_later():
            self.service.nodes[(self.service.owner, SIBLING)]["name"] = "changed-after-anchor-check"

        self.service.change(ENTRY, onRole=rename_later)
        page = self.read({"cursor": page["cursor"]})
        # The changed sibling was checked before this provider reply. Activation
        # on the following page still must reject it before a child is fetched.
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        self.audit()

    def test_workspace_active_root_child_anchor_drift(self):
        self.workspace()
        page = self.read({"budget": 3, "maxText": 0})
        self.assertEqual([item["name"] for item in page["items"]], ["window-0", "window-1", "entry"])
        self.service.change(WINDOW, children=[("", BUTTON), ("", ENTRY)])
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        self.service.change(WINDOW, children=[("", ENTRY), ("", BUTTON)])
        self.assertTrue(self.pages({"budget": 3, "maxText": 0})[-1]["coverage"]["complete"])
        self.audit()

    def test_workspace_root_instability_is_independent(self):
        self.workspace()
        page = self.read({"budget": 2, "maxText": 0})
        self.service.change(WINDOW, states={8, 24, 31})
        page = self.read({"cursor": page["cursor"]})
        button = next(item for item in page["items"] if item["name"] == "button")
        self.assertFalse(button["capabilities"]["action"]["supported"], "deferred-root-inherits-fresh-virtual-state")
        self.assertTrue(button["capabilities"]["observedAction"]["supported"])
        page = self.read({"cursor": page["cursor"]})
        sibling = next(item for item in page["items"] if item["name"] == "button-1")
        self.assertTrue(sibling["capabilities"]["action"]["supported"], "virtual-root-must-not-contaminate-sibling")
        self.service.change(WINDOW, states={8, 24})
        self.service.change(ENTRY, role=40, name=SECRET, text=SECRET, children=[("", ENTRY + "/inner")])
        self.service.add(ENTRY + "/inner", name="protected-inner", parent=ENTRY, actions=("press",))
        pages = self.pages({"budget": 3, "maxText": 0})
        items = {item["name"]: item for page in pages for item in page["items"]}
        self.assertFalse(items["protected-inner"]["capabilities"]["observedAction"]["supported"])
        self.assertTrue(items["button-1"]["capabilities"]["action"]["supported"], "protected-chain-must-not-contaminate-deferred-root")
        self.assertNotIn(SECRET, json.dumps(pages, ensure_ascii=False))
        self.audit()

    def test_workspace_root_text_chunks_and_utf16_keep_frontier(self):
        self.workspace()
        for path in (ENTRY, SIBLING + "/entry"):
            self.service.change(path, text=None, interfaces=[A + "Accessible"])
        for unit in ("scalar", "utf-16"):
            self.service.toolkit("Qt" if unit == "utf-16" else "GTK")
            for path, text in ((WINDOW, "a🧪"), (SIBLING, "b🧪")):
                self.service.change(path, text=text, textUnits=unit, interfaces=[A + "Accessible", A + "Text"])
            for limit in (1, 2):
                with self.subTest(unit=unit, limit=limit):
                    pages = self.pages({"maxText": limit})
                    items = [item for page in pages for item in page["items"]]
                    self.assertEqual("".join(page["text"] for page in pages), "a🧪b🧪", "workspace-root-text-keeps-every-scalar")
                    self.assertTrue(all(len(page["text"]) <= limit for page in pages))
                    self.assertEqual([item["name"] for item in items if item["depth"]], ["entry", "button", "entry-1", "button-1"],
                                     "workspace-root-text-schedules-children-once")
                    self.assertEqual([item["depth"] for item in items], [0] * (4 if limit == 1 else 2) + [1] * 4)
                    self.assertEqual([window["title"] for page in pages for window in page["windows"]], ["window-0", "window-1"],
                                     "workspace-text-delayed-root-window-metadata-once")
                    for name in ("window-0", "window-1"):
                        chunks = [item for item in items if item["name"] == name]
                        end = 3 if unit == "utf-16" else 2
                        self.assertEqual([(item["textOffset"], item["textEnd"]) for item in chunks],
                                         [(0, 1), (1, end)] if limit == 1 else [(0, end)])
                    self.assertTrue(pages[-1]["coverage"]["complete"])
        self.audit()

    def test_workspace_root_byte_overflow_preserves_frontier(self):
        roots = self.workspace(8)
        interfaces = [A + "Accessible", A + "Action", A + "Text", *["x" + str(index) + "." + "x" * 251 for index in range(13)]]
        actions = ["🧪" * 255 + str(index) for index in range(8)]
        names = ["🧪" * 255 + str(index) for index in range(8)]
        for path, name in zip(roots, names):
            self.service.change(path, name=name, interfaces=interfaces, actions=actions, text="🧪")
        pages = self.pages({"budget": 500, "maxText": 20000})
        self.assertIn("reply-byte-limit", pages[0]["coverage"]["reasons"], "workspace-byte-cap-splits-root-catalogue")
        self.assertLess(len(pages[0]["items"]), len(roots))
        expected = [*names, "entry", "button", *[name + "-" + str(index) for index in range(1, 8) for name in ("entry", "button")]]
        self.assertEqual([item["name"] for page in pages for item in page["items"]], expected,
                         "workspace-byte-guard-retains-root-frontier")
        self.assertEqual([window["title"] for page in pages for window in page["windows"]], names)
        self.assertEqual("".join(page["text"] for page in pages), "🧪" * 8 + VALUE + "xyz" * 7)
        self.assertTrue(pages[-1]["coverage"]["complete"])
        self.audit()

    def test_workspace_call_budget_preserves_root_frontier(self):
        self.workspace()
        for allowance, count in ((73, 1), (82, 2)):
            context = self.ctx()
            context.calls = self.context.LIMITS["calls"] - allowance
            page = self.snapshot.read(context, {"maxText": 0})
            self.assertEqual([item["name"] for item in page["items"]], ["window-" + str(index) for index in range(count)])
            self.assertIn("read-budget", page["coverage"]["reasons"])
            self.assertTrue(page["hasMore"], "workspace-budget-retains-pending-roots-and-children")
            state = self.registry._cursors[page["cursor"]]["state"]
            self.assertEqual(len(state["deferred"]), count)
            pages = [page, *self.pages({"cursor": page["cursor"]})]
            self.assertEqual([item["name"] for page in pages for item in page["items"]],
                             ["window-0", "window-1", "entry", "button", "entry-1", "button-1"])
            self.assertTrue(pages[-1]["coverage"]["complete"])
        self.audit()

    def test_workspace_timeout_cancel_and_dirty_clear_observation(self):
        self.workspace()
        for code in ("timeout", "cancelled", "stale-ref"):
            context = self.ctx()
            cancelled = Event()
            context.cancelled = cancelled.is_set

            def interrupt():
                if code == "timeout":
                    context.deadline = monotonic() - 1
                elif code == "cancelled":
                    cancelled.set()
                else:
                    self.registry.mark_dirty(self.binding, "during-root-catalogue")

            self.service.change(SIBLING, onRole=interrupt)
            self.error(code, lambda: self.snapshot.read(context, {"maxText": 0}))
            self.assertEqual(self.registry._bindings[self.binding["bindingID"]]["refs"], {}, "interrupted-workspace-invalidates-issued-roots")
            self.assertEqual(self.registry._cursors, {})
            self.service.change(SIBLING, onRole=None)
            self.assertTrue(self.read({"maxText": 0})["coverage"]["complete"], "workspace-recovery-after-interruption")
        self.audit()

    def test_workspace_terminal_error_clears_deferred_roots(self):
        self.workspace()
        self.service.change(ENTRY, textExtra="out-of-range")
        page = self.read({"maxText": 1})
        self.assertEqual([item["name"] for item in page["items"]], ["window-0", "window-1"])
        self.assertIn("protocol-error", page["coverage"]["reasons"])
        self.assertFalse(page["hasMore"], "terminal-error-clears-deferred-roots")
        self.assertNotIn("cursor", page)
        self.assertFalse(page["coverage"]["complete"])
        self.assertTrue(page["truncated"])
        self.service.change(ENTRY, textExtra="")
        self.service.change(WINDOW, children=[("", NULL), ("", ENTRY), ("", BUTTON)])
        pages = self.pages({"budget": 2, "maxText": 0})
        self.assertIn("null-child", pages[-1]["coverage"]["reasons"])
        self.assertFalse(pages[-1]["coverage"]["complete"])
        self.audit()

    def test_workspace_deferred_roots_bounded_at_32(self):
        self.workspace(32)
        page = self.read({"budget": 32, "maxText": 0})
        self.assertEqual([item["name"] for item in page["items"]], ["window-" + str(index) for index in range(32)])
        state = self.registry._cursors[page["cursor"]]["state"]
        self.assertEqual((len(state["deferred"]), len(state["stack"]), state["rootIndex"]), (32, 0, 32))
        self.assertLessEqual(len(json.dumps(state)), self.context.LIMITS["frameBytes"])
        pages = [page, *self.pages({"cursor": page["cursor"]})]
        self.assertEqual([item["name"] for page in pages for item in page["items"]],
                         [*["window-" + str(index) for index in range(32)], "entry", "button",
                          *[name + "-" + str(index) for index in range(1, 32) for name in ("entry", "button")]])
        self.assertTrue(pages[-1]["coverage"]["complete"])
        self.registry.close(self.binding)
        self.binding["roots"].append({"owner": self.service.owner, "path": ROOT + "/overflow"})
        self.registry.register(self.binding)
        before = self.bus.trace_total
        self.error("wrong-scope", lambda: self.read({"maxText": 0}))
        self.assertEqual(self.bus.trace_total, before, "root-33-rejected-before-scheduling")
        self.audit()

    def test_ref_scope_foreign_dock(self):
        result = self.read({"maxText": 0})
        ref = self.ref(result, "button")
        self.assertEqual(self.registry.resolve(ref, self.ctx())["name"], "button", "valid-ref-before-scope-probe")
        for key, value in (("senderID", 8), ("tabID", "tab-B"), ("generation", 2), ("profileID", "profile-B")):
            binding = deepcopy(self.binding)
            binding["dock"][key] = value
            self.assertTrue(self.denied(ref, binding), "ref-scope-foreign-dock:" + key)
        self.assertEqual(self.registry.resolve(ref, self.ctx())["name"], "button", "valid-ref-after-scope-probe")
        self.audit()

    def test_binding_runtime_helper_and_restart_epochs(self):
        ref = self.ref(self.read({"maxText": 0}), "button")
        for key, value in (("bindingID", "other-binding"), ("bindingEpoch", "other-epoch"), ("appID", "other-app"),
                           ("launchEpoch", "restarted-app"), ("ownershipRevision", 2)):
            binding = {**self.binding, key: value}
            self.assertTrue(self.denied(ref, binding), "ref-binding-fence:" + key)
        for key in self.binding["runtime"]:
            binding = deepcopy(self.binding)
            binding["runtime"][key] += "-foreign"
            self.assertTrue(self.denied(ref, binding), "ref-runtime-fence:" + key)
        for epoch in ("helper-B", "helper-A"):
            registry = self.refs.RefRegistry(epoch)
            registry.register(self.binding)
            current = self.read({"maxText": 0}, registry=registry)
            self.assertTrue(self.denied(ref, registry=registry), "ref-restarted-registry-fence")
            self.assertFalse(self.denied(self.ref(current, "button"), registry=registry), "restarted-registry-live-control")
        self.assertTrue(self.denied("n:foreign"))
        self.assertTrue(self.denied(1))
        self.audit()

    def test_real_window_and_process_scope(self):
        sibling = SIBLING + "/control"
        self.service.add(sibling, parent=SIBLING)
        self.service.add(ROOT, role=75, parent=NULL, owner=self.service.other_owner)
        self.service.add(WINDOW, role=23, parent=ROOT, owner=self.service.other_owner)
        self.error("wrong-scope", lambda: self.ctx().require_owned({"owner": self.service.owner, "path": sibling}))
        self.error("wrong-scope", lambda: self.ctx().require_owned({"owner": self.service.other_owner, "path": WINDOW}))
        self.assertEqual(self.ctx().require_owned({"owner": self.service.owner, "path": ENTRY})["pid"], os.getpid())
        for key, value in (("startTicks", 0), ("bootID", "foreign"), ("pidNamespace", "foreign"), ("mountNamespace", "foreign")):
            binding = deepcopy(self.binding)
            binding["processIdentities"][0][key] = value
            registry = self.refs.RefRegistry("identity-probe")
            registry.register(binding)
            self.error("wrong-scope", lambda: self.read(binding=binding, registry=registry))
        self.service.change(WINDOW, role=75)
        self.error("wrong-scope", lambda: self.read())
        self.service.change(WINDOW, role=23)
        self.assertTrue(self.read()["items"], "concrete-window-restored-positive-control")
        self.audit()

    def test_removed_defunct_and_changed_fingerprint(self):
        ref = self.ref(self.read({"maxText": 0}), "button")
        self.service.change(BUTTON, name="changed")
        self.error("stale-ref", lambda: self.registry.resolve(ref, self.ctx()))
        self.service.change(BUTTON, name="button", role=44)
        self.error("stale-ref", lambda: self.registry.resolve(ref, self.ctx()))
        self.service.change(BUTTON, role=43, parent=(self.service.owner, SIBLING))
        self.assertTrue(self.denied(ref), "fresh-parent-scope-fence")
        self.service.change(BUTTON, parent=(self.service.owner, WINDOW), states={6})
        self.error("defunct", lambda: self.registry.resolve(ref, self.ctx()))
        self.service.change(BUTTON, states={8, 24})
        self.assertFalse(self.denied(ref), "fresh-fingerprint-restored-control-not-logical-identity")
        self.service.remove(BUTTON)
        self.assertTrue(self.denied(ref), "removed-control-fresh-wire-rejection")
        self.audit()

    def test_dirty_callback_constant_size_and_lifecycle(self):
        result = self.read({"budget": 1, "maxText": 0})
        ref = result["items"][0]["ref"]
        before = self.bus.trace_total
        entry = self.registry._bindings[self.binding["bindingID"]]
        keys, refs = set(entry), len(entry["refs"])
        threads = [Thread(target=lambda: [self.registry.mark_dirty(self.binding, "event-" + str(index)) for index in range(10000)]) for _ in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(3)
            self.assertFalse(thread.is_alive())
        self.assertEqual(self.bus.trace_total, before, "dirty-callback-does-no-wire-work")
        self.assertEqual(set(entry), keys)
        self.assertEqual(len(entry["refs"]), refs)
        self.assertTrue(entry["dirty"])
        self.error("stale-ref", lambda: self.registry.resolve(ref, self.ctx()))
        self.error("cursor-stale", lambda: self.registry.resume(self.binding, result["cursor"]))
        observed = Event()

        def dirty(reason, owner, path):
            self.registry.mark_dirty(self.binding, reason)
            observed.set()

        self.bus.subscribe_lifecycle(self.service.owner, dirty)
        for member in ("RemoveAccessible", "StateChanged"):
            current = self.read({"budget": 1, "maxText": 0})
            observed.clear()
            self.service.signal(member)
            self.assertTrue(observed.wait(2), "actual-private-bus-lifecycle-delivery:" + member)
            self.assertTrue(self.denied(current["items"][0]["ref"]))
            self.error("cursor-stale", lambda: self.registry.resume(self.binding, current["cursor"]))
        current = self.read({"maxText": 0})
        observed.clear()
        self.service.on(lambda: self.service.connection.close_sync(None))
        self.assertTrue(observed.wait(2), "actual-owner-loss-delivery")
        self.assertTrue(self.denied(current["items"][0]["ref"]))
        self.audit()

    def test_disabled_protected_virtual_and_read_only(self):
        paths = []
        for label, role, live in (("disabled", 61, (7,)), (SECRET, 40, (7, 8, 24)),
                                 ("managed", 61, (7, 8, 24, 31)), ("readonly", 61, (8, 24, 43))):
            path = WINDOW + "/" + ("password" if role == 40 else label)
            self.service.add(path, role=role, name=label, live=live, text=SECRET if role == 40 else label, actions=("press",))
            paths.append(("", path))
        for role in (31, 32, 55, 56, 65, 66, 90, 91):
            path = WINDOW + "/virtual_" + str(role)
            self.service.add(path, role=role, name="record-" + str(role), actions=("press",))
            inner = path + "/inner"
            self.service.add(inner, role=61, name="inner-" + str(role), parent=path, live=(7, 8, 24), text="readable", actions=("press",))
            self.service.change(path, children=[("", inner)])
            paths.append(("", path))
        self.service.change(WINDOW, children=paths)
        result = self.read({"maxText": 20000})
        self.assertNotIn(SECRET, json.dumps(result, ensure_ascii=False), "protected-name-and-text-not-echoed")
        self.assertIn("readable", result["text"])
        for item in result["items"][1:]:
            if item["name"] == "readonly":
                self.assertFalse(item["capabilities"]["type"]["supported"])
                self.assertFalse(item["capabilities"]["observedAction"]["supported"])
                continue
            if item["name"].startswith("inner-"):
                self.assertEqual([action["name"] for action in item["actions"]], ["press"])
                self.assertTrue(item["capabilities"]["observedAction"]["supported"], "volatile-leaf-requires-explicit-observed-mode")
            else:
                self.assertEqual(item["actions"], [], "record-protected-disabled-controls-have-no-advertised-action")
                self.assertFalse(item["capabilities"]["observedAction"]["supported"])
            self.assertFalse(item["capabilities"]["action"]["supported"])
            self.assertFalse(item["capabilities"]["type"]["supported"])
        password_calls = [call for call in self.bus.trace if call["path"] == WINDOW + "/password"]
        self.assertTrue(password_calls, "protected-role-really-observed")
        self.assertFalse(any(call["method"] in ("GetText", "GetName") or call.get("parameters") in ((A + "Text", "CharacterCount"), (A + "Accessible", "Name"))
                             for call in password_calls), "protected-no-name-text-or-action-work")
        self.audit()

    def test_ancestor_becomes_virtual_before_resolve(self):
        panel, inner = WINDOW + "/panel", WINDOW + "/panel/inner"
        self.service.add(panel, role=39, name="panel")
        self.service.add(inner, name="inner", parent=panel, actions=("press",))
        self.service.change(panel, children=[("", inner)])
        self.service.change(WINDOW, children=[("", panel)])
        ref = self.ref(self.read({"maxText": 0}), "inner")
        self.assertFalse(self.registry.resolve(ref, self.ctx())["unstable"])
        self.service.change(panel, states={8, 24, 31})
        self.assertTrue(self.registry.resolve(ref, self.ctx())["unstable"], "fresh-virtual-ancestor-fence")
        self.audit()

    def test_observed_mode_never_downgrades_unprovable_ancestry(self):
        panel, inner = WINDOW + "/panel", WINDOW + "/panel/checkbox"
        self.service.add(panel, role=39, name="panel")
        self.service.add(inner, role=7, name="setting", parent=panel, actions=("press",))
        self.service.change(panel, children=[("", inner)])
        self.service.change(WINDOW, children=[("", panel)])
        for change, reason in (({"name": "x" * 257}, "fingerprint"), ({"name": "panel", "methodError": "GetInterfaces"}, "interface")):
            self.service.change(panel, **change)
            result = self.read({"maxText": 0})
            item = next(item for item in result["items"] if item["name"] == "setting")
            self.assertFalse(item["capabilities"]["action"]["supported"])
            self.assertFalse(item["capabilities"]["observedAction"]["supported"], "observed-waiver-cannot-bypass-" + reason)
            self.assertEqual([], item["actions"])
        self.service.change(panel, name="panel", methodError=None, role=91)
        result = self.read({"maxText": 0})
        item = next(item for item in result["items"] if item["name"] == "setting")
        self.assertFalse(item["capabilities"]["action"]["supported"])
        self.assertTrue(item["capabilities"]["observedAction"]["supported"], "virtual-only-observed-positive-control")
        self.service.change(panel, name="x" * 257)
        record = self.registry.resolve(item["ref"], self.ctx())
        self.assertIn("fingerprint", record["unstableReasons"], "fresh-ancestry-retains-nonvirtual-cause")
        self.audit()

    def test_text_offset_must_be_within_native_character_count(self):
        result = self.read()
        ref = self.ref(result, "entry")
        self.error("invalid-text-offset", lambda: self.read({"rootRef": ref, "textOffset": len(VALUE) + 1}))
        result = self.read()
        result = self.read({"rootRef": self.ref(result, "entry"), "textOffset": len(VALUE)})
        item = result["items"][0]
        self.assertEqual("", item["text"])
        self.assertTrue(0 <= item["textOffset"] <= item["textEnd"] <= item["textLength"], "native-range-metadata-valid")
        self.audit()

    def test_hidden_menu_subtree_is_pruned_before_child_query(self):
        menu, inner = WINDOW + "/menu", WINDOW + "/menu/hidden"
        self.service.add(menu, role=33, name="closed menu")
        self.service.add(inner, name="deep hidden control", parent=menu)
        self.service.change(menu, children=[("", inner)])
        self.service.change(WINDOW, children=[("", menu), ("", ENTRY)])
        result = self.read({"maxText": 0})
        self.assertNotIn("deep hidden control", [item["name"] for item in result["items"]])
        self.assertEqual(1, result["coverage"]["omittedHiddenMenus"])
        self.assertFalse(any(call["path"] == menu and call["method"] == "GetChildAtIndex" for call in self.bus.trace), "closed-menu-no-child-materialization")
        self.service.change(menu, states={8, 24, 25})
        result = self.read({"maxText": 0})
        self.assertIn("deep hidden control", [item["name"] for item in result["items"]], "opened-menu-positive-control")
        self.audit()

    def test_indexed_parent_hint_cannot_admit_same_exporter_sibling(self):
        foreign = SIBLING + "/foreign"
        self.service.add(foreign, name="foreign sibling control", parent=SIBLING, actions=("press",))
        self.service.change(WINDOW, children=[("", foreign)])
        self.error("wrong-scope", lambda: self.read({"maxText": 0}))
        self.service.change(WINDOW, children=[("", ENTRY)])
        valid = self.read({"maxText": 0})
        self.assertIn("entry", [item["name"] for item in valid["items"]], "owned-indexed-parent-positive-control")
        ref = self.ref(valid, "entry")
        self.service.change(ENTRY, parent=(self.service.owner, SIBLING))
        self.assertTrue(self.denied(ref), "mutation-ref-still-revalidates-whole-ownership")
        self.audit()

    def test_continuation_inherits_fresh_virtual_ancestry(self):
        panel, inner = WINDOW + "/panel", WINDOW + "/panel/inner"
        self.service.add(panel, role=39, name="panel")
        self.service.add(inner, name="inner", parent=panel, actions=("press",))
        self.service.change(panel, children=[("", inner)])
        self.service.change(WINDOW, children=[("", panel)])
        page = self.read({"budget": 2, "maxText": 0})
        self.service.change(WINDOW, states={8, 24, 31})
        page = self.read({"cursor": page["cursor"]})
        item = next(item for item in page["items"] if item["name"] == "inner")
        self.assertFalse(item["capabilities"]["action"]["supported"], "cursor-refreshes-manages-descendants-ancestry")
        self.assertEqual([action["name"] for action in item["actions"]], ["press"])
        self.assertTrue(item["capabilities"]["observedAction"]["supported"])
        self.service.change(WINDOW, states={8, 24})
        self.service.change(panel, children=[("", inner), ("foreign.exporter", NULL)])
        root = self.ref(self.read({"maxText": 0}), "panel")
        page = self.read({"rootRef": root, "budget": 1, "maxText": 0})
        self.service.change(WINDOW, states={8, 24, 31})
        page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["items"][0]["capabilities"]["action"]["supported"], "root-ref-cursor-refreshes-outside-stack-ancestry")
        self.assertTrue(page["items"][0]["capabilities"]["observedAction"]["supported"])
        self.audit()

    def test_partial_coverage_survives_continuation(self):
        self.service.change(WINDOW, children=[("", NULL), ("", ENTRY), ("", BUTTON)])
        page = self.read({"budget": 2, "maxText": 0})
        self.assertIn("null-child", page["coverage"]["reasons"])
        page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["hasMore"])
        self.assertIn("null-child", page["coverage"]["reasons"], "cursor-retains-omitted-coverage-reasons")
        self.assertFalse(page["coverage"]["complete"])
        self.audit()

    def test_text_budget_continuation_preserves_child_stack(self):
        self.service.change(WINDOW, text="a", interfaces=[A + "Accessible", A + "Text"], children=[("", ENTRY)])
        self.service.change(ENTRY, text="bc", children=[("", BUTTON)])
        self.service.change(BUTTON, parent=(self.service.owner, ENTRY))
        page = self.read({"maxText": 1})
        self.assertEqual(page["text"], "a")
        self.assertEqual([item["name"] for item in page["items"]], ["confirmed window"])
        names, text = ["confirmed window"], [page["text"]]
        for _ in range(4):
            if not page["hasMore"]:
                break
            page = self.read({"cursor": page["cursor"]})
            names.extend(item["name"] for item in page["items"])
            text.append(page["text"])
        self.assertFalse(page["hasMore"])
        self.assertEqual("".join(text), "abc", "text-budget-preserves-pending-character-offset")
        self.assertIn("button", names, "text-budget-preserves-pending-node-children")
        self.audit()

    def test_dirty_during_live_ref_resolution(self):
        ref = self.ref(self.read({"maxText": 0}), "button")
        self.assertFalse(self.denied(ref), "live-ref-before-concurrent-dirty")
        # A real provider reply can trigger a lifecycle callback before resolve returns.
        self.service.change(BUTTON, onRole=lambda: self.registry.mark_dirty(self.binding, "during-wire-read"))
        self.error("stale-ref", lambda: self.registry.resolve(ref, self.ctx()))
        self.service.change(BUTTON, onRole=None)
        self.assertFalse(self.denied(self.ref(self.read({"maxText": 0}), "button")), "new-observation-after-concurrent-dirty")
        self.audit()

    def test_close_cancelled_read_race_never_allocates(self):
        self.registry.close(self.binding)
        for index in range(12):
            binding = {**self.binding, "bindingID": "race-" + str(index), "bindingEpoch": "epoch-" + str(index)}
            self.registry.register(binding)
            self.assertTrue(self.read({"budget": 1, "maxText": 0}, binding=binding)["items"], "registered-race-live-control")
            entered, release, cancelled = Event(), Event(), Event()

            def gate():
                entered.set()
                if not release.wait(2):
                    raise AssertionError("private-provider-race-barrier-timeout")

            self.service.change(WINDOW, onRole=gate)
            outcome = Future()

            def read():
                try:
                    outcome.set_result(self.snapshot.read(self.ctx(binding=binding, cancelled=cancelled.is_set), {"maxText": 0}))
                except Exception as error:
                    outcome.set_exception(error)

            worker = Thread(target=read, name="w2a-close-read", daemon=True)
            worker.start()
            self.addCleanup(release.set)
            self.assertTrue(entered.wait(2), "close-race-follows-real-native-dispatch")
            self.registry.close(binding)
            self.assertEqual(self.registry._bindings, {}, "close-removes-live-binding-before-reply")
            cancelled.set()
            release.set()
            worker.join(2)
            self.assertFalse(worker.is_alive(), "cancelled-read-thread-reaped")
            self.service.change(WINDOW, onRole=None)
            with self.assertRaises(self.wire.BusError) as caught:
                outcome.result()
            self.assertIn(caught.exception.code, ("cancelled", "wrong-scope", "stale-ref"))
            self.assertEqual(self.registry._bindings, {}, "close-read-no-orphan-binding")
            self.assertEqual(self.registry._cursors, {}, "close-read-no-orphan-cursor")
            self.error("wrong-scope", lambda: self.registry.begin(binding))
            self.assertEqual(self.registry._bindings, {}, "closed-begin-cannot-resurrect")
        fresh = {**self.binding, "bindingID": "fresh-after-races", "bindingEpoch": "fresh-epoch"}
        self.registry.register(fresh)
        self.assertTrue(self.read({"maxText": 0}, binding=fresh)["items"], "fresh-confirmed-binding-after-twelve-closes")
        self.error("wrong-scope", lambda: self.registry.begin({**fresh, "bindingEpoch": "unknown-epoch"}))
        self.registry.close(fresh)
        self.assertEqual(self.registry._bindings, {})
        self.assertEqual(self.registry._cursors, {})
        self.audit()

    def test_subtree_respects_absolute_ownership_depth(self):
        for depth in range(1, 42):
            path = WINDOW + "/absolute_" + str(depth)
            parent = WINDOW if depth == 1 else WINDOW + "/absolute_" + str(depth - 1)
            self.service.add(path, role=39, name="absolute-" + str(depth), parent=parent)
            self.service.change(parent, children=[("", path)])
        self.registry.begin(self.binding)
        root = self.registry.issue(self.binding, self.refs.fingerprint(self.ctx(), {
            "owner": self.service.owner, "path": WINDOW + "/absolute_38"}))
        self.assertEqual(self.registry.resolve(root, self.ctx())["scopeDepth"], 38, "issued-ref-preserves-absolute-scope-depth")
        before = self.bus.trace_total
        try:
            result = self.read({"rootRef": root, "maxText": 0})
        except self.wire.BusError as error:
            self.fail("absolute-depth-subtree-keeps-partial-results:" + error.code)
        self.assertEqual([item["name"] for item in result["items"]], ["absolute-38", "absolute-39"])
        self.assertEqual([item["scopeDepth"] for item in result["items"]], [38, 39])
        self.assertIn("depth-limit", result["coverage"]["reasons"])
        self.assertTrue(result["truncated"])
        self.assertFalse(result["hasMore"])
        self.assertFalse(any(call["path"] == WINDOW + "/absolute_39" and call["method"] == "GetChildAtIndex"
                             for call in self.bus.trace[before:]), "absolute-cap-before-descendant-call")
        self.audit()

    def test_fresh_depth_drift_rejects_mutation_ref(self):
        panel, outer = WINDOW + "/panel", WINDOW + "/outer"
        self.service.add(panel, role=39, name="panel")
        self.service.add(outer, role=39, name="outer")
        self.service.change(ENTRY, parent=(self.service.owner, panel))
        self.service.change(panel, children=[("", ENTRY)])
        self.service.change(WINDOW, children=[("", panel), ("", outer)])
        ref = self.ref(self.read({"maxText": 0}), "entry")
        self.assertEqual(self.registry.resolve(ref, self.ctx())["scopeDepth"], 2)
        self.service.change(panel, parent=(self.service.owner, outer))
        self.service.change(outer, children=[("", panel)])
        self.error("stale-ref", lambda: self.registry.resolve(ref, self.ctx()))
        self.audit()

    def test_text_cursor_fresh_depth_drift_after_anchor_check(self):
        panel, outer = WINDOW + "/panel", WINDOW + "/outer"
        self.service.add(panel, role=39, name="panel")
        self.service.add(outer, role=39, name="outer")
        self.service.change(ENTRY, parent=(self.service.owner, panel))
        self.service.change(panel, children=[("", ENTRY)])
        self.service.change(WINDOW, children=[("", panel), ("", outer)])
        ref = self.ref(self.read({"maxText": 0}), "entry")
        page = self.read({"rootRef": ref, "maxText": 1})
        self.assertTrue(page["hasMore"], "live-text-cursor-before-ancestry-drift")

        def move():
            self.service.nodes[(self.service.owner, panel)]["parent"] = (self.service.owner, outer)

        # A real property reply changes ancestry after _anchors checked it;
        # the next fresh fingerprint must reject the changed absolute depth.
        self.service.change(ENTRY, onTextCount=move)
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        self.audit()

    def test_text_cursor_name_digest_drift_after_anchor_check(self):
        prefix = "🧪" * 256
        self.service.change(ENTRY, name=prefix + "A")
        page = self.read({"maxText": 1})
        self.assertTrue(page["hasMore"], "long-name-text-cursor-positive-control")
        changed = []

        def rename():
            changed.append(True)
            self.service.nodes[(self.service.owner, ENTRY)]["name"] = prefix + "B"

        self.service.change(ENTRY, onTextCount=rename)
        with self.assertRaises(self.wire.BusError, msg="post-anchor-name-digest-drift-must-reject") as caught:
            self.read({"cursor": page["cursor"]})
        self.assertEqual("cursor-stale", caught.exception.code)
        self.assertTrue(changed, "Native post-anchor rename hook was not exercised")
        self.audit()

    def test_invalid_interfaces_are_not_retained(self):
        self.service.change(BUTTON, interfaces=["🧪" * 256] * 16)
        record = self.refs.fingerprint(self.ctx(), {"owner": self.service.owner, "path": BUTTON})
        self.assertEqual(record["interfaces"], [], "fingerprint-rejects-unicode-interface-reply")
        result = self.read({"maxText": 0})
        item = next(item for item in result["items"] if item["name"] == "button")
        self.assertEqual(item["interfaces"], [], "invalid-interface-not-retained")
        self.assertIn("invalid-interface", result["coverage"]["reasons"])
        self.assertFalse(item["capabilities"]["action"]["supported"])
        self.assertFalse(item["capabilities"]["type"]["supported"])
        self.assertEqual(item["capabilities"]["action"]["reason"], "invalid-interface")
        self.error("invalid-interface", lambda: self.registry.resolve(item["ref"], self.ctx()))
        record = self.refs.fingerprint(self.ctx(), {"owner": self.service.owner, "path": BUTTON})
        self.assertEqual(record["interfaces"], [], "fingerprint-rejects-unicode-interface-reply")
        record["interfaces"] = ["a..b"]
        self.error("field-limit", lambda: self.registry.issue(self.binding, record))
        for invalid in ("a", "a..b", "1.a", "a.1", "a.b-", "a.é", "a." + "x" * 254):
            self.service.change(BUTTON, interfaces=[invalid])
            self.assertEqual(self.refs.fingerprint(self.ctx(), {"owner": self.service.owner, "path": BUTTON})["interfaceError"], "invalid-interface")
        self.service.change(BUTTON, interfaces=[A + "Accessible", A + "Action", "a." + "x" * 253])
        self.assertIsNone(self.refs.fingerprint(self.ctx(), {"owner": self.service.owner, "path": BUTTON})["interfaceError"], "ascii-grammar-boundary-positive-control")
        self.audit()

    def test_all_accepted_fields_byte_cap_and_frontier(self):
        interfaces = [A + "Accessible", A + "Action", *["x" + str(index) + "." + "x" * (252 - len(str(index))) for index in range(14)]]
        self.assertTrue(all(self.context.interface_name(value) for value in interfaces))
        actions = ["🧪" * 255 + str(index) for index in range(8)]
        expected = ["🧪" * 256]
        self.service.change(WINDOW, name=expected[0], interfaces=interfaces, actions=actions)
        children = []
        for index in range(20):
            path = WINDOW + "/accepted_" + str(index)
            name = "🧪" * (256 - len(str(index))) + str(index)
            self.service.add(path, name=name, actions=actions)
            self.service.change(path, interfaces=interfaces)
            children.append(("", path))
            expected.append(name)
        self.service.change(WINDOW, children=children)
        page, observed = self.read({"budget": 500, "maxText": 0}), []
        for _ in range(10):
            frame = json.dumps({"v": 1, "id": "🧪" * 256, "ok": True, "value": page}).encode() + b"\n"
            self.assertLessEqual(len(frame), 262144, "all-accepted-fields-frame-cap")
            self.assertTrue(page["items"], "accepted-fields-nonempty-page")
            observed.extend(item["name"] for item in page["items"])
            if not page["hasMore"]:
                break
            page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["hasMore"])
        self.assertEqual(observed, expected, "byte-guard-retains-indexed-frontier")
        self.audit()

    def test_qt_full_native_length_and_supplementary_boundaries(self):
        self.service.toolkit("Qt")
        self.service.change(ENTRY, text=QT_VALUE, textUnits="utf-16")
        result = self.read()
        self.assertEqual(result["text"], QT_VALUE, "qt-full-26-position-25-character-read")
        item = next(item for item in result["items"] if item["name"] == "entry")
        self.assertEqual(item["text"], QT_VALUE, "qt-full-26-position-25-character-read")
        self.assertEqual((len(item["text"]), item["textLength"], item["textUnit"], item["textEnd"]), (25, 26, "utf-16", 26))
        self.assertNotIn("text-changed", result["coverage"]["reasons"])
        self.service.change(ENTRY, text="a🧪b🧪🧪c")
        ref = self.ref(self.read({"maxText": 0}), "entry")
        self.assertEqual(self.read({"rootRef": ref, "maxText": 2})["text"], "a🧪", "qt-trims-by-actual-unicode-character-allowance")
        ref = self.ref(self.read({"maxText": 0}), "entry")
        before = self.bus.trace_total
        page = self.read({"rootRef": ref, "maxText": 1})
        text, offsets = [], []
        for _ in range(8):
            item = page["items"][0]
            self.assertEqual(len(item["text"]), 1, "qt-maxText-counts-unicode-characters")
            self.assertEqual(item["textUnit"], "utf-16")
            self.assertNotIn("\ufffd", item["text"], "qt-main-range-never-emits-surrogate-half")
            text.append(item["text"])
            offsets.append(item["textOffset"])
            if not page["hasMore"]:
                break
            page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["hasMore"])
        self.assertEqual("".join(text), "a🧪b🧪🧪c", "qt-supplementary-cursor-keeps-every-scalar")
        self.assertEqual(offsets, [0, 1, 3, 4, 6, 8], "qt-offsets-are-native-utf16-positions")
        ranges = [call["parameters"] for call in self.bus.trace[before:] if call["method"] == "GetText"]
        self.assertTrue(ranges)
        self.assertTrue(all(0 <= start < end <= 9 and end - start <= 4 for start, end in ranges), "qt-bounded-neighbor-and-range-reads")
        for offset in (2, 5, 7):
            ref = self.ref(self.read({"maxText": 0}), "entry")
            self.error("invalid-text-offset", lambda: self.read({"rootRef": ref, "maxText": 1, "textOffset": offset}))
        ref = self.ref(self.read({"maxText": 0}), "entry")
        self.assertEqual(self.read({"rootRef": ref, "maxText": 1, "textOffset": 3})["text"], "b", "qt-valid-native-offset-after-pair")
        self.audit()

    def test_toolkit_units_are_request_local_and_unknown_stays_native(self):
        self.service.change(ENTRY, text=QT_VALUE, textUnits="utf-16")
        result = self.read()
        item = next(item for item in result["items"] if item["name"] == "entry")
        self.assertEqual(item["text"], QT_VALUE, "unknown-toolkit-full-utf16-range-accepted")
        self.assertEqual(item["textUnit"], "native", "missing-toolkit-does-not-invent-unit-identity")
        self.service.toolkit("Qt")
        second = WINDOW + "/second_text"
        self.service.add(second, role=61, name="second", live=(7, 8, 24), text="🧪z")
        self.service.change(second, textUnits="utf-16")
        self.service.change(WINDOW, children=[("", ENTRY), ("", second)])
        context = self.ctx()
        before = self.bus.trace_total
        self.snapshot.read(context, {"maxText": 20000})
        queries = [call for call in self.bus.trace[before:] if call.get("parameters") == (A + "Application", "ToolkitName")]
        self.assertEqual(len(queries), 1, "toolkit-observation-cached-only-in-request-context")
        self.assertEqual(context.text_units, {self.service.owner: "utf-16"})
        page = self.read({"maxText": 1})
        self.service.toolkit("Other")
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        context = self.ctx()
        before = self.bus.trace_total
        self.snapshot.read(context, {"maxText": 20000})
        self.assertEqual(context.text_units, {self.service.owner: "native"}, "next-request-reobserves-toolkit-property")
        self.assertEqual(len([call for call in self.bus.trace[before:] if call.get("parameters") == (A + "Application", "ToolkitName")]), 1)
        self.audit()

    def test_qt_unicode_character_and_frame_caps(self):
        self.service.toolkit("Qt")
        self.service.change(ENTRY, text="🧪" * 30000, textUnits="utf-16")
        ref = self.ref(self.read({"maxText": 0}), "entry")
        page, text = self.read({"rootRef": ref, "maxText": 20000}), []
        for _ in range(8):
            frame = json.dumps({"v": 1, "id": "🧪" * 256, "ok": True, "value": page}).encode() + b"\n"
            self.assertLessEqual(len(frame), 262144, "qt-text-frame-cap-including-envelope")
            self.assertLessEqual(len(page["text"]), 20000, "qt-actual-unicode-character-budget")
            item = page["items"][0]
            self.assertEqual(item["textEnd"] - item["textOffset"], 2 * len(item["text"]))
            text.append(page["text"])
            if not page["hasMore"]:
                break
            page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["hasMore"])
        self.assertEqual("".join(text), "🧪" * 30000)
        ranges = [call["parameters"] for call in self.bus.trace if call["method"] == "GetText"]
        self.assertTrue(all(0 <= start < end <= 60000 and end - start <= 40002 for start, end in ranges))
        self.audit()

    def test_text_offsets_and_live_text_continuation(self):
        ref = self.ref(self.read({"maxText": 0}), "entry")
        page = self.read({"rootRef": ref, "maxText": 3, "textOffset": 2})
        fragments = [page["text"]]
        self.assertEqual(page["text"], VALUE[2:5])
        self.assertEqual(page["items"][0]["textOffset"], 2)
        self.assertEqual(page["windows"], [], "selected-text-control-is-not-a-window")
        while page["hasMore"]:
            old = page["items"][0]["ref"]
            page = self.read({"cursor": page["cursor"]})
            self.assertTrue(self.denied(old), "text-page-invalidates-old-ref")
            fragments.append(page["text"])
        self.assertEqual("".join(fragments), VALUE[2:])
        calls = [call["parameters"] for call in self.bus.trace if call["method"] == "GetText"]
        self.assertTrue(calls)
        self.assertTrue(all(0 <= start <= end <= len(VALUE) and end - start <= 3 for start, end in calls), "character-range-cap")
        self.assertIn((2, 5), calls, "non-byte-unicode-offset-positive-control")
        self.audit()

    def test_large_unicode_text_frame_and_range_caps(self):
        self.service.change(ENTRY, text="🧪" * 30000)
        ref = self.ref(self.read({"maxText": 0}), "entry")
        page = self.read({"rootRef": ref, "maxText": 20000})
        text = []
        for _ in range(6):
            frame = json.dumps({"v": 1, "id": "🧪" * 256, "ok": True, "value": page}).encode() + b"\n"
            self.assertLessEqual(len(frame), 262144, "unicode-text-frame-cap-including-envelope")
            self.assertLessEqual(len(page["text"]), 20000, "unicode-text-character-cap")
            text.append(page["text"])
            if not page["hasMore"]:
                break
            page = self.read({"cursor": page["cursor"]})
        self.assertFalse(page["hasMore"])
        self.assertEqual("".join(text), "🧪" * 30000, "live-text-continuation-reaches-final-character")
        calls = [call["parameters"] for call in self.bus.trace if call["method"] == "GetText"]
        self.assertTrue(calls)
        self.assertTrue(all(0 <= start < end <= 30000 and end - start <= 20000 for start, end in calls), "bounded-get-text-never-uses-minus-one")
        self.audit()

    def test_late_sibling_continuation_and_consumed_cursor(self):
        children = []
        for index in range(75):
            path = WINDOW + "/late_" + str(index)
            self.service.add(path, name="late-" + str(index))
            children.append(("", path))
        self.service.change(WINDOW, children=children)
        page = self.read({"budget": 7, "maxText": 0})
        names, observations = [], set()
        for _ in range(20):
            names.extend(item["name"] for item in page["items"])
            observations.add(page["observation"])
            if not page["hasMore"]:
                break
            token, old = page["cursor"], page["items"][0]["ref"]
            page = self.read({"cursor": token})
            self.assertTrue(self.denied(old))
            self.error("cursor-stale", lambda: self.registry.resume(self.binding, token))
        self.assertFalse(page["hasMore"])
        self.assertEqual(names, ["confirmed window", *["late-" + str(index) for index in range(75)]], "indexed-cursor-reaches-late-sibling")
        self.assertGreater(len(observations), 1)
        self.assertIn((74,), [call["parameters"] for call in self.bus.trace if call["method"] == "GetChildAtIndex"])
        self.audit()

    def test_cursor_scope_two_slots_expiry_and_mutation(self):
        first = self.read({"budget": 1, "maxText": 0})
        second = self.read({"budget": 1, "maxText": 0})
        self.error("cursor-stale", lambda: self.registry.resume(self.binding, first["cursor"]))
        state = deepcopy(self.registry._cursors[second["cursor"]]["state"])
        extra = self.registry.cursor(self.binding, state)
        self.assertEqual(len(self.registry._cursors), 2)
        self.error("cursor-limit", lambda: self.registry.cursor(self.binding, state))
        foreign_binding = deepcopy(self.binding)
        foreign_binding["bindingID"] = "independent-binding"
        foreign_binding["dock"]["tabID"] = "independent-tab"
        self.registry.register(foreign_binding)
        self.registry.begin(foreign_binding)
        foreign_cursor = self.registry.cursor(foreign_binding, state)
        self.assertEqual(len(self.registry._cursors), 3, "cursor-cap-is-per-binding-not-session-wide")
        self.registry.close(foreign_binding)
        state["stack"] = state["stack"] * 41
        self.error("read-budget", lambda: self.registry.cursor(self.binding, state))
        foreign = deepcopy(self.binding)
        foreign["dock"]["tabID"] = "foreign-tab"
        self.error("cursor-stale", lambda: self.registry.resume(foreign, second["cursor"]))
        self.assertIn(second["cursor"], self.registry._cursors, "foreign-cursor-probe-does-not-consume-owned-token")
        self.error("cursor-stale", lambda: self.registry.resume(foreign_binding, foreign_cursor))
        with self.registry._lock:
            expiry = self.registry._cursors[extra]["expires"]
            self.assertGreater(expiry, monotonic())
            self.assertLessEqual(expiry, monotonic() + 10)
            self.registry._cursors[extra]["expires"] = monotonic() - 1
        self.error("cursor-stale", lambda: self.registry.resume(self.binding, extra))
        self.read({"cursor": second["cursor"]})
        live = self.read({"budget": 1, "maxText": 0})
        self.registry.invalidate(self.binding)
        self.assertEqual(self.registry._cursors, {}, "mutation-closes-both-cursors")
        self.assertTrue(self.denied(live["items"][0]["ref"]))
        self.registry.close(self.binding)
        self.assertEqual(self.registry._bindings, {})
        self.registry.close(self.binding)
        self.registry.invalidate(self.binding)
        self.audit()

    def test_stale_cursor_fresh_anchors(self):
        for change in ({"name": "renamed-window"}, {"children": [("", BUTTON), ("", ENTRY)]}, {"states": {6}}):
            page = self.read({"budget": 2, "maxText": 0})
            self.service.change(WINDOW, **change)
            self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
            self.assertTrue(self.denied(page["items"][0]["ref"]), "failed-new-read-consumes-previous-refs")
            self.service.change(WINDOW, name="confirmed window", children=[("", ENTRY), ("", BUTTON)], states={8, 24})
        page = self.read({"budget": 2, "maxText": 2})
        self.service.change(ENTRY, text=VALUE + "changed")
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        self.service.change(ENTRY, text=VALUE)
        page = self.read({"budget": 2, "maxText": 2})
        self.service.change(ENTRY, children=[("", BUTTON)])
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"]}))
        self.service.change(ENTRY, children=[])
        page = self.read({"budget": 1, "maxText": 0})
        self.error("cursor-stale", lambda: self.read({"cursor": page["cursor"], "maxText": 1}))
        self.audit()

    def test_reply_frame_cap_and_stop_before_next_child(self):
        children = []
        for index in range(100):
            path = WINDOW + "/wide_" + str(index)
            names = tuple("🧪" * 255 + str(action) for action in range(8))
            self.service.add(path, name="🧪" * 256, actions=names)
            children.append(("", path))
        self.service.change(WINDOW, children=children)
        result = self.read({"budget": 500, "maxText": 0})
        frame = json.dumps({"v": 1, "id": "🧪" * 256, "ok": True, "value": result}).encode() + b"\n"
        self.assertLessEqual(len(frame), 262144, "reply-frame-cap-including-envelope")
        self.assertTrue(result["items"], "frame-cap-positive-nonempty-control")
        self.assertIn("reply-byte-limit", result["coverage"]["reasons"])
        self.assertTrue(result["hasMore"])
        indexed = [call["parameters"][0] for call in self.bus.trace if call["method"] == "GetChildAtIndex"]
        self.assertEqual(indexed, list(range(len(result["items"]) - 1)), "output-cap-stops-before-next-child-call")
        self.assertTrue(all(len(cursor["state"]["stack"]) <= 40 for cursor in self.registry._cursors.values()))
        self.audit()

    def test_visit_call_depth_and_cross_exporter_limits(self):
        self.service.change(WINDOW, count=1000000000, children=[])
        result = self.read({"budget": 500, "maxText": 0})
        self.assertEqual(result["coverage"]["visited"], 512)
        self.assertLessEqual(result["coverage"]["calls"], 1600)
        indexed = [call["parameters"][0] for call in self.bus.trace if call["method"] == "GetChildAtIndex"]
        self.assertEqual(indexed, list(range(511)), "indexed-visit-cap-before-scheduling")
        self.assertIn("read-budget", result["coverage"]["reasons"])
        self.service.change(WINDOW, count=1, children=[("", WINDOW + "/deep_0")])
        for index in range(45):
            path = WINDOW + "/deep_" + str(index)
            parent = WINDOW if index == 0 else WINDOW + "/deep_" + str(index - 1)
            self.service.add(path, role=39, parent=parent, name="depth-" + str(index))
            self.service.change(path, children=[("", WINDOW + "/deep_" + str(index + 1))] if index < 44 else [])
        self.registry.begin(self.binding)
        root = self.registry.issue(self.binding, self.refs.fingerprint(self.ctx(), {
            "owner": self.service.owner, "path": WINDOW + "/deep_34"}))
        result = self.read({"rootRef": root, "maxText": 0})
        self.assertLessEqual(max(item["depth"] for item in result["items"]), 39)
        self.assertEqual(max(item["scopeDepth"] for item in result["items"]), 39)
        self.assertIn("depth-limit", result["coverage"]["reasons"])
        self.assertLessEqual(result["coverage"]["calls"], 1600)
        self.service.add(WINDOW, owner=self.service.other_owner, role=23, parent=ROOT, name="foreign-exporter-window")
        self.service.change(WINDOW, count=2, children=[(self.service.other_owner, WINDOW), ("", BUTTON)])
        before = self.bus.trace_total
        result = self.read({"maxText": 0})
        self.assertIn("cross-exporter-edge", result["coverage"]["reasons"])
        self.assertIn("button", [item["name"] for item in result["items"]])
        self.assertFalse(any(call["owner"] == self.service.other_owner for call in self.bus.trace[before:]), "foreign-edge-not-followed")
        self.audit()

    def test_partial_capability_errors_and_provider_text_bounds(self):
        self.service.change(BUTTON, actionCount=9)
        result = self.read()
        item = next(item for item in result["items"] if item["name"] == "button")
        self.assertFalse(item["capabilities"]["action"]["supported"])
        self.assertEqual(item["capabilities"]["action"]["reason"], "action-limit")
        self.assertEqual(item["actions"], [])
        self.assertIn("action-limit", result["coverage"]["reasons"])
        self.service.change(BUTTON, actionCount=2, actions=["press", "press"])
        result = self.read()
        self.assertIn("action-ambiguous", result["coverage"]["reasons"])
        self.service.change(BUTTON, methodError="GetInterfaces")
        result = self.read()
        self.assertTrue(any("Unavailable" in reason for reason in result["coverage"]["reasons"]))
        self.service.change(ENTRY, textExtra="out-of-range")
        result = self.read({"maxText": 1})
        self.assertNotIn("out-of-range", result["text"])
        self.assertIn("protocol-error", result["coverage"]["reasons"])
        self.assertTrue(result["truncated"])
        self.assertTrue(result["capabilities"]["read"]["reason"].startswith("partial:"))
        self.service.change(ENTRY, textExtra="", textReply="")
        result = self.read({"maxText": 1})
        self.assertIn("text-changed", result["coverage"]["reasons"], "short-text-reply-must-not-claim-complete")
        self.audit()

    def test_field_ref_and_binding_storage_caps(self):
        self.service.change(BUTTON, name="🧪" * 257)
        result = self.read({"maxText": 0})
        item = next(item for item in result["items"] if item["role"] == 43)
        self.assertEqual(len(item["name"]), 256)
        self.assertFalse(item["capabilities"]["action"]["supported"], "truncated-fingerprint-is-unprovable-identity")
        self.assertTrue(self.denied(item["ref"]), "truncated-fingerprint-ref-fails-fresh-resolution")
        self.service.change(BUTTON, name="button", actions=["x" * 257], actionCount=1)
        result = self.read({"maxText": 0})
        self.assertIn("action-ambiguous", result["coverage"]["reasons"])
        self.service.change(BUTTON, interfaces=[A + "Accessible"] * 17)
        result = self.read({"maxText": 0})
        self.assertIn("field-limit", result["coverage"]["reasons"])
        record = self.registry.resolve(self.ref(result, "entry"), self.ctx())
        for _ in range(512 - len(self.registry._bindings[self.binding["bindingID"]]["refs"])):
            self.registry.issue(self.binding, record)
        self.error("read-budget", lambda: self.registry.issue(self.binding, record))
        self.assertEqual(len(self.registry._bindings[self.binding["bindingID"]]["refs"]), 512)
        foreign = {**self.binding, "bindingID": "other-binding", "bindingEpoch": "other-epoch"}
        self.registry.register(foreign)
        self.registry.begin(foreign)
        self.assertTrue(self.denied(self.ref(result, "entry"), foreign), "registered-foreign-binding-ref-rejected")
        for index in range(6):
            self.registry.register({**self.binding, "bindingID": "capacity-" + str(index)})
        self.error("read-budget", lambda: self.registry.register({**self.binding, "bindingID": "overflow"}))
        self.assertEqual(len(self.registry._bindings), 8)
        self.audit()

    def test_long_name_cursor_digest_never_makes_mutation_refs_stable(self):
        name = "🧪" * 256
        self.service.change(WINDOW, name=name + "A")
        first = self.read({"budget": 1, "maxText": 0})
        self.assertTrue(first["cursor"], "long-name-continuation-positive-control")
        try:
            page = self.read({"cursor": first["cursor"]})
        except self.wire.BusError as error:
            self.fail("bounded-full-name-digest-must-allow-read-continuation:" + error.code)
        self.assertTrue(page["items"], "bounded-full-name-digest-must-allow-read-continuation")
        self.assertTrue(all(not item["capabilities"]["action"]["supported"] for item in page["items"]), "truncated-ancestor-mutations-still-disabled")
        actions = importlib.import_module("actions")
        self.error("unstable-ref", lambda: actions.replace_text(self.ctx(), page["items"][0]["ref"], "digest-must-not-dispatch"))
        first = self.read({"budget": 1, "maxText": 0})
        self.service.change(WINDOW, name=name + "B")
        with self.assertRaises(self.wire.BusError, msg="same-prefix-name-digest-must-reject-change") as caught:
            self.read({"cursor": first["cursor"]})
        self.assertEqual("cursor-stale", caught.exception.code)
        self.service.change(WINDOW, name="🧪" * (self.context.LIMITS["text"] + 1))
        first = self.read({"budget": 1, "maxText": 0})
        self.error("cursor-stale", lambda: self.read({"cursor": first["cursor"]}))
        self.audit()

    def test_query_cancel_and_call_budget_fail_before_scheduling(self):
        self.assertTrue(self.read()["items"], "pre-rejection-live-positive-control")
        before = self.bus.trace_total
        for query in ({"budget": 0}, {"budget": 501}, {"budget": True}, {"maxText": -1}, {"maxText": 20001},
                      {"textOffset": -1}, {"rootRef": "n:a", "cursor": "c:a"}, {"unexpected": 1}):
            self.error("protocol-error", lambda: self.read(query))
        self.assertEqual(self.bus.trace_total, before, "invalid-query-no-provider-scheduling")
        self.error("cancelled", lambda: self.snapshot.read(self.ctx(cancelled=lambda: True), {}))
        self.assertEqual(self.bus.trace_total, before, "cancelled-read-no-provider-scheduling")
        context = self.ctx()
        context.calls = 1600
        result = self.snapshot.read(context, {})
        self.assertIn("read-budget", result["coverage"]["reasons"])
        self.assertEqual(self.bus.trace_total, before, "call-cap-no-provider-scheduling")
        self.audit()


def self_check(args):
    digests = {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest()
               for name in ("bus.py", "context.py", "refs.py", "snapshot.py")}
    probes = (("scope", "refs.py", "test_ref_scope_foreign_dock",
               'if entry is None or entry["scope"] != scope(binding):', 'if entry is None:', "ref-scope-foreign-dock:senderID", None),
              ("frame-cap", "snapshot.py", "test_reply_frame_cap_and_stop_before_next_child",
               "FRAME_RESERVE = 4096", "FRAME_RESERVE = -262144", "reply-frame-cap-including-envelope", None),
              ("late-read-allocation", "refs.py", "test_close_cancelled_read_race_never_allocates",
                '    def begin(self, binding):\n        """Reset a registered observation; never resurrect closed bindings."""\n        with self._lock:\n            self._prune()\n            entry = self._entry(binding)',
                '    def begin(self, binding):\n        """Reset a registered observation; never resurrect closed bindings."""\n        with self._lock:\n            self._prune()\n            if binding["bindingID"] not in self._bindings:\n                self._bindings[binding["bindingID"]] = {"scope": scope(binding), "epoch": binding["bindingEpoch"], "refs": {}, "dirty": False}\n            entry = self._entry(binding)',
               "close-read-no-orphan-binding", None),
              ("relative-depth", "snapshot.py", "test_subtree_respects_absolute_ownership_depth",
               'if record["scopeDepth"] >= LIMITS["depth"] - 1:', 'if len(state["stack"]) >= LIMITS["depth"] - 1:',
               "absolute-depth-subtree-keeps-partial-results", None),
              ("interface-grammar", "refs.py", "test_invalid_interfaces_are_not_retained",
               "if not all(interface_name(value) for value in interfaces):", "if False:",
               "fingerprint-rejects-unicode-interface-reply", None),
              ("scalar-only-length", "snapshot.py", "test_qt_full_native_length_and_supplementary_boundaries",
               'if not text_length_matches(text, end - start) or (unit == "utf-16" and len(text.encode("utf-16-le")) // 2 != end - start):',
               "if len(text) != end - start:", "qt-full-26-position-25-character-read", None),
              ("utf16-character-allowance", "snapshot.py", "test_qt_full_native_length_and_supplementary_boundaries",
               "text = text[:remaining]", "text = text[:remaining * 2]",
               "qt-trims-by-actual-unicode-character-allowance", None),
              ("lost-sizing-frontier", "snapshot.py", "test_all_accepted_fields_byte_cap_and_frontier",
               '                state.update(rootIndex=position[0], text=position[1], textStarted=position[2])\n                if frame:\n                    frame["index"], frame["last"] = index',
                "                pass", "byte-guard-retains-indexed-frontier", ("NODE_RESERVE = 49152", "NODE_RESERVE = 0")),
              ("long-name-continuation", "snapshot.py", "test_long_name_cursor_digest_never_makes_mutation_refs_stable",
                'not fresh["fingerprintComplete"] and fresh["nameDigest"] is None', 'not fresh["fingerprintComplete"]',
                "bounded-full-name-digest-must-allow-read-continuation", None),
              ("full-name-digest", "snapshot.py", "test_long_name_cursor_digest_never_makes_mutation_refs_stable",
                'or fresh["nameDigest"] != anchor.get("nameDigest")', "or False",
                "same-prefix-name-digest-must-reject-change", None),
              ("repeat-name-digest", "snapshot.py", "test_text_cursor_name_digest_drift_after_anchor_check",
                'record["nameDigest"] != handle.get("nameDigest")', "False",
                 "post-anchor-name-digest-drift-must-reject", None),
              ("workspace-root-order", "snapshot.py", "test_workspace_roots_first_then_each_root_dfs",
                 '"rootFirst": root is None and scope_kind(binding) == "workspace"', '"rootFirst": False',
                 "workspace-root-first-exact-dfs-order", None),
              ("workspace-deferred-fingerprint", "snapshot.py", "test_workspace_deferred_fingerprint_drift",
                 '*[[anchor] for anchor in state["deferred"]]]', '*[]]',
                 "workspace-deferred-fingerprint-must-reject", None),
              ("workspace-delayed-expansion", "snapshot.py", "test_workspace_deferred_rechecked_before_expansion",
                 '_anchors(context, state, expanding=True)', 'pass',
                 "workspace-delayed-root-rechecked-before-expansion", None),
              ("workspace-pending-more", "snapshot.py", "test_workspace_catalogue_and_descendants_split",
                 'state["text"] or state["stack"] or state["deferred"] or state["rootIndex"] < len(state["roots"])',
                 'state["text"] or state["stack"] or state["rootIndex"] < len(state["roots"])',
                 "workspace-pages-preserve-root-catalogue-and-children", None),
              ("workspace-sizing-frontier", "snapshot.py", "test_workspace_root_byte_overflow_preserves_frontier",
                 '                state.update(rootIndex=position[0], text=position[1], textStarted=position[2])\n                if frame:\n                    frame["index"], frame["last"] = index',
                 "                pass", "workspace-byte-guard-retains-root-frontier", ("NODE_RESERVE = 49152", "NODE_RESERVE = 0")))
    for label, file, case, old, new, assertion, stress in probes:
        source = (args.payload / file).read_text(encoding="utf-8")
        if source.count(old) != 1:
            raise AssertionError("mutation-anchor-drift:" + label)
        with tempfile.TemporaryDirectory(prefix="w2a-mutation-") as directory:
            copy = Path(directory) / file
            command = ["dbus-run-session", "--", sys.executable, "-B", str(Path(__file__).resolve()),
                       "--payload", str(args.payload), "--override", directory, "--case", case]
            if stress:
                if source.count(stress[0]) != 1:
                    raise AssertionError("stress-anchor-drift:" + label)
                copy.write_text(source.replace(*stress), encoding="utf-8")
                control = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30)
                print(control.stdout, end="", flush=True)
                if control.returncode != 0 or "OK" not in control.stdout:
                    raise AssertionError("stress-positive-control-failed:" + label)
                print("FORCED SIZING OVERFLOW RECOVERED", flush=True)
            copy.write_text((source.replace(*stress) if stress else source).replace(old, new), encoding="utf-8")
            red = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30)
            print(red.stdout, end="", flush=True)
            if red.returncode != 1 or "FAIL: " + case not in red.stdout or "AssertionError:" not in red.stdout or assertion not in red.stdout:
                raise AssertionError("mutation-missed-named-assertion:" + label)
            copy.write_text(source, encoding="utf-8")
            if hashlib.sha256(copy.read_bytes()).hexdigest() != digests[file]:
                raise AssertionError("mutation-copy-not-restored:" + label)
            green = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=30)
            print(green.stdout, end="", flush=True)
            if green.returncode != 0 or "OK" not in green.stdout:
                raise AssertionError("restored-copy-not-green:" + label)
            print("MUTATION KILLED + RESTORED: " + label + " / " + assertion, flush=True)
    if digests != {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest() for name in digests}:
        raise AssertionError("production-source-digest-changed")
    print("PRODUCTION DIGESTS UNCHANGED: " + json.dumps(digests, sort_keys=True), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, default=Path(__file__).resolve().parent.parent.parent / "resources/linux/app-dock-accessibility")
    parser.add_argument("--override", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--case", choices=unittest.defaultTestLoader.getTestCaseNames(SnapshotTests))
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if not os.environ.get("DBUS_SESSION_BUS_ADDRESS") or sys.flags.optimize:
        raise RuntimeError("Private dbus-run-session and enabled assertions required")
    sys.path.insert(0, str(args.payload.resolve()))
    if args.override:
        sys.path.insert(0, str(args.override.resolve()))
    SnapshotTests.wire = importlib.import_module("bus")
    SnapshotTests.context = importlib.import_module("context")
    SnapshotTests.refs = importlib.import_module("refs")
    SnapshotTests.snapshot = importlib.import_module("snapshot")
    suite = unittest.TestSuite([SnapshotTests(args.case)]) if args.case else unittest.defaultTestLoader.loadTestsFromTestCase(SnapshotTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful() and args.self_check:
        self_check(args)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())

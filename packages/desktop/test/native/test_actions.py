"""Run under private D-Bus/Xvfb, with the real W2 A registry (never a stand-in).

    env -u AT_SPI_BUS_ADDRESS -u XDG_RUNTIME_DIR A11Y_PAYLOAD=/bridge \
      xvfb-run -a dbus-run-session -- python3 -B /proof/test_actions.py

Use --mutations for temporary actions-module controls. Missing registry exits 3,
not a skip/green. GTK receipt travels over a separate pipe, not AT-SPI readback.
Xvfb must precede D-Bus so activated services inherit the private display. Do not
inherit a maintained app session's accessibility address or runtime directory.
"""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
from threading import Event
from time import monotonic, sleep
import unittest

SOURCE = Path(os.environ["A11Y_PAYLOAD"]) if "A11Y_PAYLOAD" in os.environ else Path(__file__).resolve().parents[2] / "resources/linux/app-dock-accessibility"
sys.path.insert(0, str(SOURCE))

from bus import AtspiBus, BusError
from context import A, LIMITS, ROOT, RequestContext, process_identity, states


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture():
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import Gio, GLib, Gtk

    session = Gio.bus_get_sync(Gio.BusType.SESSION, None)
    address = session.call_sync("org.a11y.Bus", "/org/a11y/bus", "org.a11y.Bus", "GetAddress", None,
                                GLib.VariantType.new("(s)"), Gio.DBusCallFlags.NONE, 1000, None).unpack()[0]
    connection = Gio.DBusConnection.new_for_address_sync(
        address, Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION, None, None)
    owner = connection.get_unique_name()
    window_path, field_path, group_path, focus_path = ["/org/a11y/atspi/accessible/w2b_" + s for s in ("window", "field", "group", "focus")]
    wire = {}
    interfaces = [A + s for s in ("Accessible", "Action", "Text", "EditableText", "Component")]

    def reset_wire():
        wire.clear()
        wire.update(names=["click"], states=[7, 8, 12, 24, 25], role=61, value="start", setter="accept",
                    action=True, interfaces=interfaces, relation="none", readError=None, calls={}, indices=[])

    reset_wire()
    xml = f"""<node>
      <interface name="{A}Accessible">
        <method name="GetRole"><arg type="u" direction="out"/></method>
        <method name="GetState"><arg type="au" direction="out"/></method>
        <method name="GetInterfaces"><arg type="as" direction="out"/></method>
        <method name="GetChildAtIndex"><arg type="i" direction="in"/><arg type="(so)" direction="out"/></method>
        <method name="GetRelationSet"><arg type="a(ua(so))" direction="out"/></method>
        <property name="Name" type="s" access="read"/>
        <property name="Parent" type="(so)" access="read"/>
        <property name="ChildCount" type="i" access="read"/>
      </interface>
      <interface name="{A}Action">
        <property name="NActions" type="i" access="read"/>
        <method name="GetName"><arg type="i" direction="in"/><arg type="s" direction="out"/></method>
        <method name="DoAction"><arg type="i" direction="in"/><arg type="b" direction="out"/></method>
      </interface>
      <interface name="{A}Text">
        <property name="CharacterCount" type="i" access="read"/>
        <method name="GetText"><arg type="i" direction="in"/><arg type="i" direction="in"/><arg type="s" direction="out"/></method>
      </interface>
      <interface name="{A}EditableText">
        <method name="SetTextContents"><arg type="s" direction="in"/><arg type="b" direction="out"/></method>
      </interface>
      <interface name="{A}Component"><method name="GrabFocus"><arg type="b" direction="out"/></method></interface>
    </node>"""

    def native_states(path):
        values = (wire["states"] if path == field_path else wire.get("focusStates", [8, 12, 24, 25]) if path == focus_path
                  else wire.get("windowStates", [1, 8, 24, 25]) if path == window_path else [1, 8, 24, 25])
        return [sum(1 << (s % 32) for s in values if s // 32 == word) for word in range(2)]

    def method(connection, sender, path, interface, name, parameters, invocation):
        wire["calls"][name] = wire["calls"].get(name, 0) + 1
        args = parameters.unpack()
        if wire["readError"] == name and path == field_path:
            invocation.return_dbus_error("org.example.W2B.ReadFailed", "Intentional live read failure")
            return
        if name == "GetRole":
            value = ("(u)", (wire["role"] if path == field_path else wire.get("focusRole", 39) if path == focus_path else 75 if path == ROOT else 69 if path == window_path else wire.get("groupRole", 39),))
            wire.setdefault("rolesRead", []).append([path, value[1][0]])
        elif name == "GetState":
            value = ("(au)", (native_states(path),))
        elif name == "GetInterfaces":
            value = ("(as)", (wire["interfaces"] if path == field_path else [A + "Accessible"],))
        elif name == "GetChildAtIndex":
            child = focus_path if path == group_path else field_path
            value = ("((so))", ((owner, child),))
        elif name == "GetRelationSet":
            relation = wire["relation"]
            targets = [] if relation == "none" else [(3, [(owner, group_path)])]
            if relation == "foreign":
                targets = [(3, [(":999.999", group_path)])]
            if relation == "oversized":
                targets = [(3, [(owner, group_path)] * 33)]
            value = ("(a(ua(so)))", (targets,))
        elif name == "GetName":
            value = ("(s)", (wire["names"][args[0]],))
            if wire.pop("disableAfterNames", False):
                wire["states"].remove(8)
            if "namesAfterGetName" in wire:
                wire["names"] = wire.pop("namesAfterGetName")
        elif name == "DoAction":
            wire["indices"].append(args[0])
            value = ("(b)", (wire["action"],))
        elif name == "GetText":
            text = wire.get("readback", wire["value"])
            value = ("(s)", (text if "readback" in wire else text.encode("utf-16-le")[args[0] * 2:args[1] * 2].decode("utf-16-le")
                             if wire.get("utf16") else text[args[0]:args[1]],))
            if wire.pop("disableAfterText", False):
                wire["states"].remove(8)
            if "countAfterRead" in wire:
                wire["countOverride"] = wire.pop("countAfterRead")
            if "readbackAfterRead" in wire:
                wire["readback"] = wire.pop("readbackAfterRead")
        elif name == "SetTextContents":
            setter = wire["setter"]
            if setter != "false":
                wire["value"] = "provider mismatch" if setter == "mismatch" else "z" * (LIMITS["text"] + 1) if setter == "oversized" else args[0]
            if setter == "uncertain":
                invocation.return_dbus_error("org.example.W2B.Uncertain", "Setter received text; reply failed")
                return
            if setter == "unavailable":
                wire["readError"] = "GetText"
            if "nameAfterSetter" in wire:
                wire["fieldName"] = wire.pop("nameAfterSetter")
            value = ("(b)", (setter != "false",))
        elif name == "GrabFocus":
            if wire["relation"] == "none" and 12 not in wire["states"] and not wire.get("keepUnfocused"):
                wire["states"].append(12)
            wire.update(wire.pop("afterGrab", {}))
            value = ("(b)", (True,))
        else:
            invocation.return_dbus_error("org.example.W2B.Unknown", name)
            return
        invocation.return_value(GLib.Variant(*value))

    def property(connection, sender, path, interface, name):
        if name == "Name":
            return GLib.Variant("s", wire.get("fieldName", "wire field") if path == field_path else path.rsplit("_", 1)[-1])
        if name == "Parent":
            parent = wire.get("fieldParent", window_path) if path == field_path else window_path if path == group_path else wire.get("focusParent", group_path) if path == focus_path else ROOT if path == window_path else "/org/a11y/atspi/null"
            return GLib.Variant("(so)", (owner, parent))
        if name == "ChildCount":
            return GLib.Variant("i", 1 if path in (ROOT, window_path, group_path) else 0)
        if name == "NActions":
            return GLib.Variant("i", len(wire["names"]))
        count = wire.get("countOverride", len(wire["value"].encode("utf-16-le")) // 2 if wire.get("utf16") else len(wire["value"]))
        return GLib.Variant("b" if type(count) is bool else "i", count)

    registered = []
    for path in (ROOT, window_path, field_path, group_path, focus_path):
        for interface in Gio.DBusNodeInfo.new_for_xml(xml).interfaces:
            if path == field_path or interface.name == A + "Accessible":
                registered.append(connection.register_object(path, interface, method, property, None))

    window = Gtk.Window(title="W2-B GTK fixture")
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
    window.add(box)
    widgets = {name: Gtk.Entry() for name in ("entry", "disabled", "readonly", "protected")}
    widgets["multiline"] = Gtk.TextView()
    widgets["button"] = Gtk.Button(label="Receipt button")
    widgets["label"] = Gtk.Label(label="No mutation interface")
    receipt = {"changes": [], "clicks": 0}
    for name, widget in widgets.items():
        widget.get_accessible().set_name("W2-B " + name)
        box.pack_start(widget, True, True, 0)
        if isinstance(widget, Gtk.Entry):
            widget.connect("changed", lambda w, n=name: receipt["changes"].append([n, w.get_text()]))
    buffer = widgets["multiline"].get_buffer()
    buffer.connect("changed", lambda b: receipt["changes"].append(["multiline", b.get_text(b.get_start_iter(), b.get_end_iter(), True)]))
    widgets["button"].connect("clicked", lambda w: receipt.update(clicks=receipt["clicks"] + 1))
    widgets["disabled"].set_sensitive(False)
    widgets["readonly"].set_editable(False)
    widgets["protected"].set_visibility(False)

    def command(stream, condition):
        line = stream.readline()
        if not line:
            Gtk.main_quit()
            return False
        data = json.loads(line)
        op = data.pop("op")
        if op == "wire":
            wire.update(data)
            answer = True
        elif op == "wire-receipt":
            answer = {"calls": wire["calls"], "indices": wire["indices"], "value": wire["value"], "rolesRead": wire.get("rolesRead", [])}
        elif op == "edit":
            widget = widgets[data["name"]]
            widget.get_buffer().set_text(data["text"]) if isinstance(widget, Gtk.TextView) else widget.set_text(data["text"])
            answer = True
        elif op == "reset":
            reset_wire()
            for name, widget in widgets.items():
                if isinstance(widget, Gtk.Entry):
                    widget.set_text("start")
            buffer.set_text("start")
            receipt.update(changes=[], clicks=0)
            answer = True
        else:
            answer = dict(receipt, entry=widgets["entry"].get_text(),
                          multiline=buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), True))
        print(json.dumps(answer, ensure_ascii=False), flush=True)
        return True

    GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, command)
    window.show_all()
    window.present()
    GLib.timeout_add(200, lambda: print(json.dumps({"pid": os.getpid(), "owner": owner, "window": window_path, "field": field_path}), flush=True))
    Gtk.main()
    for registration in registered:
        connection.unregister_object(registration)
    connection.close_sync(None)


class NativeFixtureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--fixture"],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True,
                                   env=dict(os.environ, GTK_MODULES="atk-bridge", NO_AT_BRIDGE="0"))
        cls.selector = selectors.DefaultSelector()
        cls.selector.register(cls.app.stdout, selectors.EVENT_READ)
        cls.bus = None
        cls.addClassCleanup(cls.shutdown)
        cls.ready = cls.receive()
        cls.bus = AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
        cls.nodes = {}
        deadline = monotonic() + 5
        while not cls.nodes and monotonic() < deadline:
            apps = cls.bus.children("org.a11y.atspi.Registry", ROOT, 32)
            for owner, path in apps:
                if cls.bus.process_id(owner) != cls.ready["pid"]:
                    continue
                pending, seen = [(owner, path, 0)], set()
                while pending:
                    node_owner, node_path, depth = pending.pop()
                    if (node_owner, node_path) in seen:
                        continue
                    if len(seen) >= 128 or depth >= 32:
                        raise AssertionError("GTK discovery exceeded bounded indexed traversal")
                    seen.add((node_owner, node_path))
                    name = cls.bus.property(node_owner, node_path, A + "Accessible", "Name")
                    if name.startswith("W2-B ") and name[5:] in ("entry", "multiline", "button", "label", "readonly", "protected", "disabled"):
                        cls.nodes[name[5:]] = {"owner": node_owner, "path": node_path}
                    if cls.bus.call(node_owner, node_path, A + "Accessible", "GetRole", "()", (), "(u)")[0] in (23, 69):
                        cls.gtk_window = {"owner": node_owner, "path": node_path}
                    pending.extend((child_owner, child_path, depth + 1) for child_owner, child_path in cls.bus.children(node_owner, node_path, 32))
            if not cls.nodes:
                sleep(0.05)
        if set(cls.nodes) != {"entry", "multiline", "button", "label", "readonly", "protected", "disabled"}:
            raise AssertionError("Real GTK fixture did not export every required control")
        cls.nodes["wire"] = {"owner": cls.ready["owner"], "path": cls.ready["field"]}
        cls.binding = {"bindingID": "w2b-binding", "bindingEpoch": "w2b-epoch",
                       "dock": {"senderID": 1, "tabID": "w2b", "generation": 1, "profileID": "test"},
                       "runtime": {"runtimeID": "private-session", "runtimeEpoch": "test", "accessibilitySessionID": cls.bus.connection.get_guid()},
                       "appID": "w2b.gtk", "launchEpoch": "test", "ownershipRevision": 1,
                       "processIdentities": [process_identity(cls.ready["pid"])],
                       "roots": [cls.gtk_window, {"owner": cls.ready["owner"], "path": cls.ready["window"]}]}

    @classmethod
    def receive(cls):
        if not cls.selector.select(10):
            raise AssertionError("Independent GTK receipt timed out")
        line = cls.app.stdout.readline()
        if not line:
            raise AssertionError("GTK fixture exited before receipt")
        return json.loads(line)

    @classmethod
    def command(cls, op, **args):
        cls.app.stdin.write(json.dumps(dict(args, op=op)) + "\n")
        cls.app.stdin.flush()
        return cls.receive()

    @classmethod
    def shutdown(cls):
        if cls.bus:
            cls.bus.close()
        cls.app.stdin.close()
        try:
            cls.app.wait(timeout=2)
        except subprocess.TimeoutExpired:
            cls.app.kill()
            cls.app.wait(timeout=2)
        cls.app.stdout.close()
        cls.selector.close()

    def setUp(self):
        self.command("reset")

    def context(self, cancelled=None):
        return RequestContext(self.bus, getattr(self, "registry", None), self.binding, 10000, cancelled)


class ActionsTest(NativeFixtureTest):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.registry = refs.RefRegistry("w2b-live-helper")
        cls.registry.register(cls.binding)
        cls.addClassCleanup(cls.registry.close, cls.binding)

    def issue(self, name="wire", unstable=False):
        observation = self.registry.begin(self.binding)
        node = self.nodes[name]
        context = self.context()
        record = refs.fingerprint(context, node)
        record["interfaces"] = context.call(node["owner"], node["path"], A + "Accessible", "GetInterfaces", reply="(as)")[0]
        count = context.property(node["owner"], node["path"], A + "Action", "NActions") if A + "Action" in record["interfaces"] else 0
        record["unstable"] |= unstable
        if unstable:
            record["unstableReasons"] = sorted(set(record["unstableReasons"]) | {"virtual"})
        record["actions"] = [{"id": f"a:{observation}:w2b:{index}", "index": index,
                              "name": context.call(node["owner"], node["path"], A + "Action", "GetName", "(i)", (index,), "(s)")[0]}
                             for index in range(min(count, LIMITS["actions"]))]
        return self.registry.issue(self.binding, record)

    def rejected(self, code, operation, *args, **kwargs):
        with self.assertRaises(BusError, msg=code + " must reject") as caught:
            operation(self.context(), *args, **kwargs)
        self.assertEqual(code, caught.exception.code)
        return caught.exception

    def test_live_unicode_clear_newline_and_independent_receipt(self):
        for name, values in (("entry", ["café 🧪 漢字 e\u0301", ""]), ("multiline", ["first\n第二行 🧪", ""])):
            for value in values:
                with self.subTest(name=name, value=value):
                    result = actions.replace_text(self.context(), self.issue(name), value)
                    self.assertEqual({"method": "editable", "dispatch": "acknowledged", "postcondition": "verified", "value": value}, result)
                    node = self.nodes[name]
                    context = self.context()
                    count = context.property(node["owner"], node["path"], A + "Text", "CharacterCount")
                    self.assertEqual(value, context.call(node["owner"], node["path"], A + "Text", "GetText", "(ii)", (0, count), "(s)")[0])
                    receipt = self.command("receipt")
                    self.assertEqual(value, receipt[name], "Independent GTK application value differs")
                    self.assertIn([name, value], receipt["changes"], "GTK application never received change")

    def test_live_click_ack_is_not_postcondition(self):
        result = actions.invoke(self.context(), self.issue("button"))
        self.assertEqual("acknowledged", result["dispatch"])
        self.assertEqual("unverified", result["postcondition"])
        self.assertEqual(1, self.command("receipt")["clicks"])

    def test_observed_action_is_explicit_and_still_consumes_ref(self):
        ref = self.issue("button", unstable=True)
        self.rejected("unstable-ref", actions.invoke, ref)
        self.assertEqual(0, self.command("receipt")["clicks"])
        ref = self.issue("button", unstable=True)
        record = self.registry.resolve(ref, self.context())
        result = actions.invoke(self.context(), ref, record["actions"][0]["id"], "observed")
        self.assertEqual("acknowledged", result["dispatch"])
        self.assertEqual("observed-control", result["identity"])
        self.assertEqual("unverified", result["logicalIdentity"])
        self.assertEqual("non-atomic", result["consistency"])
        self.assertEqual(1, self.command("receipt")["clicks"])
        self.rejected("stale-ref", actions.invoke, ref, record["actions"][0]["id"], "observed")

    def test_observed_mode_does_not_bypass_target_state_or_record_identity(self):
        for values, code in (({"states": [7, 24, 25]}, "disabled"), ({"states": [7, 8, 24, 25, 43]}, "read-only"),
                             ({"role": 56}, "unstable-ref"), ({"role": 40}, "protected-text")):
            self.command("reset")
            self.command("wire", **values)
            ref = self.issue(unstable=True)
            record = self.registry.resolve(ref, self.context())
            self.rejected(code, actions.invoke, ref, record["actions"][0]["id"], "observed")
            self.assertEqual([], self.command("wire-receipt")["indices"])
        self.command("reset")
        ref = self.issue(unstable=True)
        self.rejected("action-required", actions.invoke, ref, None, "observed")

    def test_false_action_rejects(self):
        self.command("wire", action=False)
        error = self.rejected("provider-rejected", actions.invoke, self.issue())
        self.assertEqual("rejected", error.result["dispatch"])
        self.assertEqual("unverified", error.result["postcondition"])
        self.assertEqual([0], self.command("wire-receipt")["indices"])

    def test_action_consumes_ref_once(self):
        ref = self.issue()
        actions.invoke(self.context(), ref)
        with self.assertRaises(BusError, msg="consumed native ref must reject replay"):
            actions.invoke(self.context(), ref)
        self.assertEqual([0], self.command("wire-receipt")["indices"], "Consumed action replayed")

    def test_rejected_ref_consumed_no_retry(self):
        self.command("wire", action=False)
        ref = self.issue()
        self.rejected("provider-rejected", actions.invoke, ref)
        with self.assertRaises(BusError, msg="rejected native ref must reject replay"):
            actions.invoke(self.context(), ref)
        self.assertEqual([0], self.command("wire-receipt")["indices"])

    def test_action_consumes_peer_refs_and_cursor(self):
        ref = self.issue()
        peer = self.registry.issue(self.binding, self.registry.resolve(ref, self.context()))
        cursor = self.registry.cursor(self.binding, {"query": {"budget": 100, "maxText": 1500, "textOffset": 0},
                                                    "roots": [self.gtk_window], "rootIndex": 0, "stack": [],
                                                    "text": None, "textStarted": False, "rootUnstable": False})
        actions.invoke(self.context(), ref)
        with self.assertRaises(BusError, msg="Mutation must consume peer refs") as caught:
            self.registry.resolve(peer, self.context())
        self.assertEqual("stale-ref", caught.exception.code)
        with self.assertRaises(BusError, msg="Mutation must consume continuation") as caught:
            self.registry.resume(self.binding, cursor)
        self.assertEqual("cursor-stale", caught.exception.code)

    def test_invalid_action_id_consumes_valid_ref_without_dispatch(self):
        ref = self.issue()
        self.rejected("invalid-action", actions.invoke, ref, "a:not-advertised")
        with self.assertRaises(BusError, msg="Invalid action attempt must consume admitted ref"):
            actions.invoke(self.context(), ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_invalid_native_refs_do_not_dispatch(self):
        for ref in (0, "7", "n:not-issued", "n:"):
            with self.subTest(ref=ref), self.assertRaises(BusError, msg="Invalid native ref must reject"):
                actions.invoke(self.context(), ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_action_drift_exact_name_and_index(self):
        for old, new in ((["click"], ["press"]), (["click", "jump"], ["jump", "click"])):
            with self.subTest(old=old, new=new):
                self.command("wire", names=old)
                ref = self.issue()
                action_id = self.registry.resolve(ref, self.context())["actions"][0]["id"]
                self.command("wire", names=new)
                self.rejected("action-drift", actions.invoke, ref, action_id)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_action_drift_during_admission_rejects(self):
        ref = self.issue()
        self.command("wire", namesAfterGetName=["press"])
        self.rejected("action-drift", actions.invoke, ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_duplicate_action_ambiguity(self):
        self.command("wire", names=["click", "click"])
        ref = self.issue()
        action_id = self.registry.resolve(ref, self.context())["actions"][0]["id"]
        self.rejected("action-ambiguous", actions.invoke, ref, action_id)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_default_requires_single_exact_provider_name(self):
        for names in ([], ["CLICK"], ["jump"], ["click", "press"]):
            with self.subTest(names=names):
                self.command("wire", names=names)
                self.rejected("action-required", actions.invoke, self.issue())
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_explicit_action_uses_advertised_index(self):
        self.command("wire", names=["click", "jump"])
        ref = self.issue()
        action_id = self.registry.resolve(ref, self.context())["actions"][1]["id"]
        result = actions.invoke(self.context(), ref, action_id)
        self.assertEqual("jump", result["action"])
        self.assertEqual([1], self.command("wire-receipt")["indices"])

    def test_action_enumeration_bounded_before_dispatch(self):
        self.command("wire", names=["action" + str(i) for i in range(9)])
        self.rejected("verification-incomplete", actions.invoke, self.issue())
        receipt = self.command("wire-receipt")
        self.assertEqual([], receipt["indices"])
        self.assertEqual(8, receipt["calls"]["GetName"], "Oversized list scheduled extra action reads")

    def test_disabled_native_control_rejects(self):
        self.rejected("disabled", actions.replace_text, self.issue("disabled"), "new")
        self.assertNotIn(["disabled", "new"], self.command("receipt")["changes"])

    def test_fresh_disabled_wire_action_rejects(self):
        ref = self.issue()
        self.command("wire", states=[7, 12, 24, 25])
        self.rejected("disabled", actions.invoke, ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_disabled_during_native_reads_rejects_before_dispatch(self):
        ref = self.issue()
        self.command("wire", disableAfterNames=True)
        self.rejected("disabled", actions.invoke, ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])
        self.command("reset")
        ref = self.issue()
        self.command("wire", disableAfterText=True)
        self.rejected("disabled", actions.replace_text, ref, "new")
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("SetTextContents", 0))

    def test_readonly_and_protected_native_controls_reject(self):
        for name, code in (("readonly", "read-only"), ("protected", "protected-text")):
            with self.subTest(name=name):
                self.rejected(code, actions.replace_text, self.issue(name), "new")
                self.assertNotIn([name, "new"], self.command("receipt")["changes"])

    def test_no_interface_and_no_implicit_keyboard_fallback(self):
        self.rejected("read-only", actions.replace_text, self.issue("label"), "new")
        ref = self.issue()
        self.command("wire", interfaces=[A + "Accessible", A + "Text", A + "Component"])
        context = self.context()
        start = self.bus.trace_total
        with self.assertRaises(BusError) as caught:
            actions.replace_text(context, ref, "new")
        self.assertEqual("unsupported-interface", caught.exception.code)
        trace = self.bus.trace[-(self.bus.trace_total - start):]
        self.assertFalse(any(t["method"] in ("GrabFocus", "GenerateKeyboardEvent", "SetTextContents") for t in trace))

    def test_unstable_and_defunct_reject(self):
        self.rejected("unstable-ref", actions.invoke, self.issue(unstable=True))
        ref = self.issue()
        self.command("wire", states=[6, 7, 8, 24, 25])
        self.rejected("defunct", actions.invoke, ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])

    def test_oversized_existing_and_requested_text_reject_before_setter(self):
        self.command("edit", name="entry", text="z" * (LIMITS["text"] + 1))
        self.rejected("verification-incomplete", actions.replace_text, self.issue("entry"), "new")
        self.rejected("verification-incomplete", actions.replace_text, self.issue(), "z" * (LIMITS["text"] + 1))
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("SetTextContents", 0))

    def test_text_equality_is_mandatory(self):
        self.command("wire", setter="mismatch")
        error = self.rejected("postcondition-mismatch", actions.replace_text, self.issue(), "requested")
        self.assertEqual("acknowledged", error.result["dispatch"])
        self.assertEqual("unverified", error.result["postcondition"])
        self.assertEqual("provider mismatch", error.result["value"])

    def test_false_setter_rejects(self):
        self.command("wire", setter="false")
        error = self.rejected("provider-rejected", actions.replace_text, self.issue(), "new")
        self.assertEqual("rejected", error.result["dispatch"])
        self.assertEqual("start", self.command("wire-receipt")["value"])

    def test_uncertain_dispatch_bounded_and_consumed(self):
        self.command("wire", setter="uncertain")
        ref = self.issue()
        error = self.rejected("org.example.W2B.Uncertain", actions.replace_text, ref, "received 🧪")
        self.assertEqual({"method": "editable", "dispatch": "unknown", "postcondition": "unverified", "value": None}, error.result)
        self.assertLess(len(json.dumps(error.result)), LIMITS["frameBytes"])
        with self.assertRaises(BusError, msg="uncertain setter ref must reject retry"):
            actions.replace_text(self.context(), ref, "received 🧪")
        receipt = self.command("wire-receipt")
        self.assertEqual(1, receipt["calls"]["SetTextContents"])
        self.assertEqual("received 🧪", receipt["value"])

    def test_post_setter_name_drift_preserves_uncertainty_and_consumes_ref(self):
        self.command("wire", nameAfterSetter="wire field. 1 Setting Found")
        ref = self.issue()
        error = self.rejected("stale-ref", actions.replace_text, ref, "received 🧪")
        self.assertEqual("Native action target role, name or parent changed: name", str(error))
        self.assertEqual({"method": "editable", "dispatch": "acknowledged", "postcondition": "unverified", "value": None}, error.result)
        self.rejected("stale-ref", actions.replace_text, ref, "received 🧪")
        receipt = self.command("wire-receipt")
        self.assertEqual(1, receipt["calls"]["SetTextContents"], "Name drift must never replay the setter")
        self.assertEqual("received 🧪", receipt["value"], "Independent provider value must retain the uncertain effect")

    def test_unavailable_or_oversized_post_read_preserves_ack_not_success(self):
        for setter, code in (("unavailable", "org.example.W2B.ReadFailed"), ("oversized", "verification-incomplete")):
            with self.subTest(setter=setter):
                self.command("reset")
                self.command("wire", setter=setter)
                error = self.rejected(code, actions.replace_text, self.issue(), "new")
                self.assertEqual("acknowledged", error.result["dispatch"])
                self.assertEqual("unverified", error.result["postcondition"])
                self.assertIsNone(error.result["value"])
                self.assertEqual(1, self.command("wire-receipt")["calls"]["SetTextContents"])

    def test_predispatch_provider_read_exception_is_not_ok(self):
        ref = self.issue()
        self.command("wire", readError="GetInterfaces")
        self.rejected("org.example.W2B.ReadFailed", actions.invoke, ref)
        self.assertEqual([], self.command("wire-receipt")["indices"])
        self.command("reset")
        ref = self.issue()
        self.command("wire", readError="GetText")
        self.rejected("org.example.W2B.ReadFailed", actions.replace_text, ref, "new")
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("SetTextContents", 0))

    def test_explicit_keyboard_owned_controlling_descendant_noop(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled",
                     interfaces=[A + "Accessible", A + "Text", A + "Component"])
        result = actions.replace_text(self.context(), self.issue(), "start", "keyboard")
        self.assertEqual("keyboard", result["method"])
        self.assertEqual("verified", result["postcondition"])
        self.assertEqual("start", result["value"])
        self.assertTrue(result["focus"]["confirmed"])
        self.assertEqual("unfenced", result["focus"]["externalRaces"])
        self.assertEqual(0, result["controllerCalls"])

    def test_keyboard_foreign_or_oversized_relation_rejects_before_focus(self):
        for relation, code in (("foreign", "wrong-scope"), ("oversized", "verification-incomplete")):
            with self.subTest(relation=relation):
                self.command("reset")
                self.command("wire", states=[7, 8, 24, 25], relation=relation)
                self.rejected(code, actions.replace_text, self.issue(), "start", "keyboard")
                self.assertEqual(0, self.command("wire-receipt")["calls"].get("GrabFocus", 0))

    def test_keyboard_protected_focused_descendant_rejects(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled", focusRole=40)
        self.rejected("protected-text", actions.replace_text, self.issue(), "start", "keyboard")
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("GrabFocus", 0))

    def test_keyboard_malformed_after_admission_rejects_before_dispatch(self):
        self.command("wire", readbackAfterRead="x" * (1500 + 1))
        error = self.rejected("verification-incomplete", actions.replace_text, self.issue(), "replacement", "keyboard")
        self.assertIsNone(error.result["value"])
        self.assertEqual(0, error.result["controllerCalls"])
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("GrabFocus", 0))

    def test_semantic_full_utf16_range_is_verified(self):
        self.command("wire", utf16=True)
        text = "012345678901234567890123🧪"
        result = actions.replace_text(self.context(), self.issue(), text)
        self.assertEqual(text, result["value"])
        self.assertEqual("verified", result["postcondition"])

    def test_keyboard_cancellation_still_unlocks_modifiers(self):
        cancelled = Event()
        cleanup = []

        class CancelAfterRealLock(RequestContext):
            def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
                value = super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)
                if method == "GenerateKeyboardEvent" and parameters == (4, "", 5):
                    cancelled.set()
                return value

            def cleanup_call(self, *args):
                value = super().cleanup_call(*args)
                cleanup.append(args)
                return value

        ref = self.issue()
        context = CancelAfterRealLock(self.bus, self.registry, self.binding, 10000, cancelled.is_set)
        start = self.bus.trace_total
        with self.assertRaises(BusError, msg="Cancellation after real modifier lock must fail") as caught:
            actions.replace_text(context, ref, "replacement", "keyboard")
        self.assertEqual("cancelled", caught.exception.code)
        self.assertEqual("acknowledged", caught.exception.result["modifierRelease"])
        self.assertEqual("unknown", caught.exception.result["dispatch"])
        self.assertEqual(1, len(cleanup), "Modifier unlock did not execute after cancellation")
        self.assertEqual((4, "", 6), cleanup[0][5])
        self.assertEqual(2, caught.exception.result["controllerCalls"], "Cancelled confirmation must not schedule select-all")
        trace = self.bus.trace[-(self.bus.trace_total - start):]
        self.assertEqual(2, sum(t["method"] == "GenerateKeyboardEvent" for t in trace), "Wire must contain only lock and cleanup unlock")
        with self.assertRaises(BusError):
            actions.replace_text(self.context(), ref, "replacement", "keyboard")


def mutation_controls():
    source = (SOURCE / "actions.py").read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    controls = [
        ("false-action", "test_false_action_rejects", "provider-rejected must reject",
         "        if not accepted:\n            result[\"dispatch\"] = \"rejected\"\n            raise BusError(\"provider-rejected\", \"Provider rejected DoAction\")",
         "        if False:\n            result[\"dispatch\"] = \"rejected\"\n            raise BusError(\"provider-rejected\", \"Provider rejected DoAction\")", 1),
        ("consume", "test_action_consumes_ref_once", "consumed native ref must reject replay",
         "    context.registry.invalidate(context.binding)\n", "    # Mutation control: leave observation live.\n", 2),
        ("drift", "test_action_drift_exact_name_and_index", "action-drift must reject",
         "    if [(a[\"index\"], a[\"name\"]) for a in advertised] != list(enumerate(names)):", "    if False:", 1),
        ("equality", "test_text_equality_is_mandatory", "postcondition-mismatch must reject",
         "\n        if result[\"value\"] != text:", "\n        if False:", 1),
        ("disabled", "test_fresh_disabled_wire_action_rejects", "disabled must reject",
         "    if not {8, 24}.issubset(live) or mode == \"keyboard\" and 25 not in live:", "    if False:", 1),
        ("post-name-drift", "test_post_setter_name_drift_preserves_uncertainty_and_consumes_ref", "stale-ref must reject",
         "or name != record[\"name\"] ", "", 1),
    ]
    with tempfile.TemporaryDirectory(prefix="w2b-actions-mutations-") as directory:
        for name, test, assertion, old, new, count in controls:
            if source.count(old) != count:
                raise AssertionError("Mutation anchor changed: " + name)
            copy = Path(directory) / (name + ".py")
            copy.write_text(source.replace(old, new))
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()), "ActionsTest." + test],
                                 env=dict(os.environ, A11Y_ACTIONS_MODULE=str(copy)), text=True, capture_output=True, timeout=30)
            output = run.stdout + run.stderr
            if run.returncode == 0 or "AssertionError" not in output or assertion not in output or test not in output:
                raise AssertionError("Mutation control did not produce named failed assertion: " + name + "\n" + output)
            print("MUTATION " + name + ": named assertion failed: " + assertion, flush=True)
    if hashlib.sha256((SOURCE / "actions.py").read_bytes()).hexdigest() != digest:
        raise AssertionError("Production module changed during mutation controls")
    print("RESTORED: production SHA256 " + digest, flush=True)


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        fixture()
        sys.exit(0)
    refs = load("refs", os.environ.get("A11Y_REFS_MODULE", str(SOURCE / "refs.py")))
    try:
        refs.RefRegistry("dependency-preflight")
    except NotImplementedError:
        print("DEPENDENCY PENDING: real W2 A RefRegistry is still scaffold; no integration tests executed", file=sys.stderr)
        sys.exit(3)
    if not callable(getattr(refs.RefRegistry, "register", None)):
        print("DEPENDENCY PENDING: R2 RefRegistry.register is required; no integration tests executed", file=sys.stderr)
        sys.exit(3)
    actions = load("actions", os.environ.get("A11Y_ACTIONS_MODULE", str(SOURCE / "actions.py")))
    if "--mutations" in sys.argv:
        mutation_controls()
        sys.exit(0)
    unittest.main(verbosity=2)

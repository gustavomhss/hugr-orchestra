#!/usr/bin/env python3
"""W0 lifetime probe. Fixture confirmation is not runtime confirmation; draft gaps stay findings."""

import argparse
import ast
from collections import deque
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
from time import monotonic, sleep
from uuid import uuid4

A, ROOT = "org.a11y.atspi.", "/org/a11y/atspi/accessible/root"
D = ("org.freedesktop.DBus", "/org/freedesktop/DBus")
CAPS = {"seconds": 70, "calls": 1500, "nodes": 48, "children": 16, "depth": 10, "text": 128,
        "events": 96, "fileBytes": 32768, "receiptBytes": 524288,
        "mainCalls": 1000, "helperCalls": 100, "helpers": 4, "fixtures": 3}

def bounded(path):
    with Path(path).open("rb") as stream:
        data = stream.read(CAPS["fileBytes"] + 1)
    assert len(data) <= CAPS["fileBytes"], "file-cap: " + str(path)
    return data

def identity(pid):
    return {"pid": pid, "startTicks": int(bounded(f"/proc/{pid}/stat").rsplit(b")", 1)[1].split()[19]),
            "bootID": bounded("/proc/sys/kernel/random/boot_id").decode().strip(),
            "pidNamespace": os.readlink(f"/proc/{pid}/ns/pid"), "mountNamespace": os.readlink(f"/proc/{pid}/ns/mnt"),
            "executable": os.readlink(f"/proc/{pid}/exe")}

def fixture(root):
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk
    windows, boxes, entries, serial = [], [], [], [0]
    model = Gtk.ListStore(str, str)
    model.append(["W0 recycled label", "row-A"])
    def publish():
        serial[0] += 1
        assert serial[0] <= 32, "fixture-receipt-cap"
        value = {"pid": os.getpid(), "gtkVersion": [Gtk.get_major_version(), Gtk.get_minor_version(), Gtk.get_micro_version()],
                 "logicalRow": model[0][1], "receiptFile": str(root / f"receipt-{serial[0]}.json"), "windows": [
            {"xid": w.get_window().get_xid(), "description": w.get_accessible().get_description(),
             "text": e.get_text() if e else None} for w, e in zip(windows, entries)]}
        Path(value["receiptFile"]).write_text(json.dumps(value, ensure_ascii=False))
        return value
    def entry(index):
        widget = Gtk.Entry()
        widget.set_text("initial")
        widget.get_accessible().set_name("same editable label")
        widget.connect("changed", lambda *_: publish())
        boxes[index].pack_start(widget, False, False, 0)
        return widget
    for index in range(2):
        window = Gtk.Window(title="W0 identical window")
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        window.add(box)
        windows.append(window)
        boxes.append(box)
        entries.append(entry(index))
        if index == 0:
            tree = Gtk.TreeView(model=model)
            tree.append_column(Gtk.TreeViewColumn("W0 records", Gtk.CellRendererText(), text=0))
            box.pack_start(tree, True, True, 0)
        window.show_all()
        window.get_accessible().set_description(f"{root.parent.name}/{root.name}:frame-{index}:xid-{window.get_window().get_xid()}")
    def control(*_):
        command = sys.stdin.readline(128).strip()
        if command in ("quit", ""):
            Gtk.main_quit()
            return False
        assert command in ("remove", "replace", "recycle", "snapshot"), "unknown-fixture-command"
        if command == "remove":
            entries[0].destroy()
            entries[0] = None
        if command == "replace":
            entries[0] = entry(0)
            windows[0].show_all()
        if command == "recycle":
            model[0][1] = "row-B"
        print(json.dumps(publish(), ensure_ascii=False), flush=True)
        return True
    GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, control)
    print(json.dumps(publish()), flush=True)
    Gtk.main()
    for window in windows:
        window.destroy()

def connection(bus_dir, cap=CAPS["mainCalls"]):
    sys.path.insert(0, str(Path(bus_dir).resolve()))
    from bus import AtspiBus, BusError
    from context import RequestContext
    deadline, issued = monotonic() + CAPS["seconds"], [0]
    class CappedBus(AtspiBus):
        def call(self, *args, **kwargs):
            if monotonic() >= deadline or issued[0] >= cap:
                raise BusError("probe-cap", "Probe scheduling cap exhausted")
            issued[0] += 1
            return super().call(*args, **kwargs)
    return CappedBus(json.loads(bounded("/session/environment.json"))["DBUS_SESSION_BUS_ADDRESS"], 800), RequestContext, BusError

def owned(bus, context, error_type, binding, handle):
    try:
        return {"accepted": True, "evidence": context(bus, None, binding, 4000).require_owned(handle)}
    except error_type as error:
        return {"accepted": False, "code": error.code, "message": str(error)}

def audit(trace, total):
    assert trace and len(trace) == total <= CAPS["calls"], "trace-empty-truncated-or-cap"
    for call in trace:
        assert call["method"] not in ("GetItems", "GetChildren", "GetAll") and call["interface"] != A + "Collection", "forbidden-query"
        if call["method"] == "GetChildAtIndex":
            assert 0 <= call["parameters"][0] < CAPS["children"], "indexed-call-cap"
        if call["method"] == "GetText":
            assert 0 <= call["parameters"][0] <= call["parameters"][1] <= CAPS["text"], "text-call-cap"

class Proof:
    def __init__(self, bus, context, error_type, receipt, root):
        self.bus, self.context, self.error_type, self.r, self.root = bus, context, error_type, receipt, root
        self.children, self.events, self.event_total = [], deque(maxlen=CAPS["events"]), 0
        self.start = monotonic()
    def check(self, name, value):
        assert value, name
        self.r.setdefault("assertions", []).append(name)
    def call(self, ref, interface, method, signature="()", params=(), reply="(u)"):
        return self.bus.call(*ref, interface, method, signature, params, reply)[0]
    def prop(self, ref, name):
        return self.call(ref, "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Accessible", name), "(v)")
    def launch(self, mode):
        assert len(self.children) < CAPS["fixtures"] + CAPS["helpers"], "child-process-cap"
        directory = self.root / f"fixture-{len(self.children)}"
        if mode == "--fixture":
            directory.mkdir()
        with (self.root / f"child-{len(self.children)}.stderr").open("wb") as log:
            process = subprocess.Popen([sys.executable, "-B", __file__, mode, *([str(directory)] if mode == "--fixture" else [])], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, bufsize=0)
        self.children.append(process)
        return process
    def control(self, process, command=None):
        if command:
            process.stdin.write((command + "\n").encode())
        data, deadline = b"", monotonic() + 3
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while b"\n" not in data:
                assert selector.select(max(0, deadline - monotonic())), "fixture-control-timeout"
                chunk = os.read(process.stdout.fileno(), 4096)
                assert chunk and len(data) + len(chunk) <= 4096, "fixture-control-eof-or-cap"
                data += chunk
        return json.loads(data)
    def walk(self, ref):
        pending, nodes, seen = deque([(ref, 0)]), [], set()
        while pending:
            current, depth = pending.popleft()
            assert current[0] == ref[0] and current not in seen and len(seen) < CAPS["nodes"] and depth <= CAPS["depth"], "walk-scope-or-cap"
            seen.add(current)
            node = {"owner": current[0], "path": current[1], "role": self.call(current, A + "Accessible", "GetRole"),
                    "name": self.prop(current, "Name"), "description": self.prop(current, "Description"),
                    "interfaces": self.call(current, A + "Accessible", "GetInterfaces", reply="(as)")}
            assert len(node["name"]) <= 256 and len(node["description"]) <= 256 and len(node["interfaces"]) <= 16, "field-cap"
            nodes.append(node)
            count = self.prop(current, "ChildCount")
            assert 0 <= count <= CAPS["children"], "child-count-cap"
            for index in range(count):
                child = self.call(current, A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")
                pending.append(((child[0] or ref[0], child[1]), depth + 1))
        self.r.setdefault("walkSizes", []).append(len(nodes))
        return nodes
    def ref(self, handle):
        return handle["owner"], handle["path"]
    def select(self, nodes, **fields):
        matches = [n for n in nodes if all(n[k] == v for k, v in fields.items())]
        self.check("unique-native-selection:" + str(fields), len(matches) == 1)
        return matches[0]
    def confirm(self, process, snapshot):
        registry = self.call(D, D[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
        end = monotonic() + 4
        while True:
            count = self.prop((registry, ROOT), "ChildCount")
            self.check("registry-nonempty-bounded", 0 < count <= CAPS["children"])
            exporters = [self.call((registry, ROOT), A + "Accessible", "GetChildAtIndex", "(i)", (i,), "((so))") for i in range(count)]
            matches = [r for r in exporters if self.call(D, D[0], "GetConnectionUnixProcessID", "(s)", (r[0],), "(u)") == process.pid]
            if matches:
                break
            assert monotonic() < end, "fixture-application-ready-timeout"
            sleep(0.1)
        self.check("one-unique-exporter-for-launch", len(matches) == 1 and matches[0][0].startswith(":"))
        nodes = self.walk(matches[0])
        self.check("application-nonempty", nodes[0]["role"] == 75 and len(nodes) > 1)
        frames = [self.select(nodes, role=23, description=w["description"]) for w in snapshot["windows"]]
        self.check("identical-window-names-distinct-native-frames", frames[0]["name"] == frames[1]["name"] and self.ref(frames[0]) != self.ref(frames[1]))
        self.r.setdefault("launches", []).append({"identity": identity(process.pid), "application": matches[0], "frames": frames, "fixtureWindowEvidence": snapshot, "confirmation": "fixture nonce/XID receipt; runtime integration untested"})
        return {"processIdentities": [identity(process.pid)], "roots": [frames[0]]}, frames, exporters
    def scope(self, binding, handle, context=None):
        return owned(self.bus, context or self.context, self.error_type, binding, handle)
    def reject(self, name, binding, handle, valid_binding, valid, context=None):
        before = self.scope(valid_binding, valid, context)
        result = self.scope(binding, handle, context)
        after = self.scope(valid_binding, valid, context)
        self.r.setdefault("scope", []).append({"assertion": name, "result": result, "validBefore": before, "validAfter": after})
        self.check(name + ":valid-controls", before["accepted"] and after["accepted"])
        self.check(name, not result["accepted"])
    def event(self, kind, owner, path):
        self.event_total += 1
        self.events.append({"kind": kind, "owner": owner, "path": path, "atMs": round((monotonic() - self.start) * 1000)})
    def snapshot(self, handle):
        result = {}
        for name, get in (("role", lambda: self.call(self.ref(handle), A + "Accessible", "GetRole")), ("name", lambda: self.prop(self.ref(handle), "Name")),
                          ("parent", lambda: self.prop(self.ref(handle), "Parent")), ("stateWords", lambda: self.call(self.ref(handle), A + "Accessible", "GetState", reply="(au)"))):
            try:
                result[name] = get()
            except self.error_type as error:
                result[name] = {"code": error.code, "message": str(error)}
        return result
    def reader(self, binding, live, old=None):
        child = self.launch("--helper")
        stdout, _ = child.communicate(json.dumps({"busDir": self.r["busDir"], "binding": binding, "live": live, "old": old}).encode(), timeout=8)
        self.check("helper-process-reaped-success", child.returncode == 0 and len(stdout) < CAPS["receiptBytes"])
        result = json.loads(stdout)
        self.check("fresh-helper-valid-native-control", result["live"]["accepted"])
        self.r.setdefault("helpers", []).append(result)
        return result

def run(proof, bus_dir):
    process = proof.launch("--fixture")
    binding, frames, exporters = proof.confirm(process, proof.control(process))
    live = proof.select(proof.walk(proof.ref(frames[0])), name="same editable label")
    sibling = proof.select(proof.walk(proof.ref(frames[1])), name="same editable label")
    proof.reject("sibling-rejected", binding, sibling, binding, live)
    proof.reject("missing-root-rejected", dict(binding, roots=[]), live, binding, live)
    foreign = next({"owner": r[0], "path": r[1]} for r in exporters if r[0] != live["owner"])
    proof.reject("foreign-root-rejected", dict(binding, roots=[foreign]), live, binding, live)
    proof.reject("foreign-exporter-rejected", binding, foreign, binding, live)
    proof.reject("changed-start-rejected", dict(binding, processIdentities=[dict(binding["processIdentities"][0], startTicks=binding["processIdentities"][0]["startTicks"] + 1)]), live, binding, live)
    for field in ("bootID", "pidNamespace", "mountNamespace"):
        proof.reject(field + "-mismatch-rejected", dict(binding, processIdentities=[dict(binding["processIdentities"][0], **{field: "changed-identity"})]), live, binding, live)
    missing = {"owner": live["owner"], "path": ROOT + "/w0_missing"}
    proof.r["draftMissingConfirmedRoot"] = {"scope": proof.scope(dict(binding, roots=[missing]), missing), "native": proof.snapshot(missing)}
    proof.reject("nonexistent-confirmed-root-rejected", dict(binding, roots=[missing]), missing, binding, live)
    source = bounded(bus_dir / "context.py").decode()
    tree = ast.parse(source)
    targets = [n for n in ast.walk(tree) if isinstance(n, ast.If) and any(isinstance(c, ast.Constant) and c.value == "roots" for c in ast.walk(n.test))]
    proof.check("mutation-one-scope-guard", len(targets) == 1)
    targets[0].test = ast.BoolOp(op=ast.Or(), values=[ast.Compare(left=ast.Name(id="current", ctx=ast.Load()), ops=[ast.Eq()], comparators=[ast.Name(id="ROOT", ctx=ast.Load())]), targets[0].test])
    roles = [n for n in ast.walk(tree) if isinstance(n, ast.Tuple) and [getattr(v, "value", None) for v in n.elts] == [16, 23, 69]]
    proof.check("mutation-one-window-role-guard", len(roles) == 1)
    roles[0].elts.append(ast.Constant(value=75))
    copy = proof.root / "context-copy.py"
    def load_copy(name):
        spec = importlib.util.spec_from_file_location(name, copy)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.RequestContext
    copy.write_text(ast.unparse(ast.fix_missing_locations(tree)))
    try:
        proof.reject("sibling-rejected", binding, sibling, binding, live, load_copy("w0_mutant"))
    except AssertionError as error:
        proof.check("mutation-named-failure", str(error) == "sibling-rejected")
        proof.r["mutation"] = {"before": "reject", "mutant": "sibling admitted; failed assertion sibling-rejected"}
    finally:
        copy.write_text(source)
    proof.check("mutation-was-killed", "mutation" in proof.r)
    proof.reject("restored-sibling-rejected", binding, sibling, binding, live, load_copy("w0_restored"))
    proof.r["mutation"]["after"] = "restored source digest; baseline rejects with valid controls"
    proof.check("mutation-copy-restored", bounded(copy).decode() == source)
    proof.r["subscription"] = [proof.bus.subscribe_lifecycle(live["owner"], proof.event)]
    value = "W0 café 🧪 漢字 e\u0301"
    proof.check("editable-interface", A + "EditableText" in live["interfaces"])
    proof.check("native-text-ack", proof.call(proof.ref(live), A + "EditableText", "SetTextContents", "(s)", (value,), "(b)"))
    readback = proof.call(proof.ref(live), A + "Text", "GetText", "(ii)", (0, len(value)), "(s)")
    independent = json.loads(bounded(proof.control(process, "snapshot")["receiptFile"]))
    proof.check("text-effect-native-and-independent-sibling-unchanged", readback == value == independent["windows"][0]["text"] and independent["windows"][1]["text"] == "initial")
    proof.r["effect"] = {"requested": value, "readback": readback, "file": independent}
    row = proof.select(proof.walk(proof.ref(frames[0])), name="W0 recycled label")
    before = proof.snapshot(row)
    row_mark, row_start = len(proof.events), monotonic()
    logical = proof.control(process, "recycle")
    after = proof.snapshot(row)
    current_row = proof.select(proof.walk(proof.ref(frames[0])), name="W0 recycled label")
    proof.check("recycled-logical-item-same-native-role-name", independent["logicalRow"] == "row-A" and logical["logicalRow"] == "row-B" and isinstance(after["role"], int)
                and before["role"] == after["role"] and before["name"] == after["name"] == "W0 recycled label" and proof.ref(row) == proof.ref(current_row))
    proof.check("recycled-row-live-not-defunct", len(after["stateWords"]) == 2 and not after["stateWords"][0] & (1 << 6))
    proof.r["recycledRow"] = {"handle": row, "before": before, "after": after, "logicalBefore": independent["logicalRow"], "logicalAfter": logical["logicalRow"], "events": list(proof.events)[row_mark:], "eventWindowMs": round((monotonic() - row_start) * 1000),
                             "draftScope": proof.scope(binding, row), "mutationCapability": "unsupported-operation: logical continuity unprovable; no mutation dispatched"}
    mark, event_start = len(proof.events), monotonic()
    removed = proof.control(process, "remove")
    sleep(0.8)
    removal_events, event_window_ms = list(proof.events)[mark:], round((monotonic() - event_start) * 1000)
    old = proof.snapshot(live)
    proof.check("fixture-widget-removed", removed["windows"][0]["text"] is None and not any(n["path"] == live["path"] for n in proof.walk(proof.ref(frames[0]))))
    recreated = proof.control(process, "replace")
    replacement = proof.select(proof.walk(proof.ref(frames[0])), name="same editable label")
    proof.check("replacement-same-role-name", replacement["role"] == live["role"] and replacement["name"] == live["name"])
    proof.r["widgetLifetime"] = {"old": live, "afterRemove": old, "afterReplaceOld": proof.snapshot(live), "replacement": replacement, "pathRecycled": proof.ref(live) == proof.ref(replacement), "oldDraftScope": proof.scope(binding, live),
                                "events": removal_events, "eventWindowMs": event_window_ms, "removedReceipt": removed, "replacementReceipt": recreated, "roleNameProvesContinuity": False}
    if proof.ref(live) != proof.ref(replacement):
        proof.reject("removed-widget-old-handle-rejected", binding, live, binding, replacement)
    proof.check("replacement-independent-initial-value", recreated["windows"][0]["text"] == "initial")
    first = proof.reader(binding, replacement)
    second = proof.reader(binding, replacement, replacement)
    proof.check("helper-actually-restarted", first["identity"] != second["identity"])
    proof.r["helperRestartGap"] = {"oldTupleAcceptedWhileExporterLive": second["old"]["accepted"], "reason": "RequestContext has no helper/ref epoch check"}
    for cycle in range(2):
        previous, previous_owner = replacement, replacement["owner"]
        process.stdin.write(b"quit\n")
        proof.check("fixture-reaped-before-restart", process.wait(timeout=3) == 0)
        sleep(0.8)
        proof.check("owner-loss-delivered", any(e["kind"] == "owner-loss" and e["owner"] == previous_owner for e in proof.events))
        process = proof.launch("--fixture")
        binding, frames, _ = proof.confirm(process, proof.control(process))
        replacement = proof.select(proof.walk(proof.ref(frames[0])), name="same editable label")
        proof.check("restart-exporter-changed", replacement["owner"] != previous_owner)
        proof.reject(f"restart-{cycle}-old-handle-rejected", binding, previous, binding, replacement)
        reader = proof.reader(binding, replacement, previous)
        proof.check("restarted-helper-rejects-retired-exporter", not reader["old"]["accepted"])
        proof.r["subscription"].append(proof.bus.subscribe_lifecycle(replacement["owner"], proof.event))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--helper", action="store_true")
    parser.add_argument("--bus-dir", type=Path, default=Path("/bridge"))
    parser.add_argument("--output", type=Path, default=Path("/session/lifetime-probe.json"))
    args = parser.parse_args()
    if args.fixture:
        fixture(args.fixture)
        return 0
    if args.helper:
        data = json.loads(sys.stdin.buffer.read(8193))
        bus, context, error_type = connection(data["busDir"], CAPS["helperCalls"])
        try:
            result = {"identity": identity(os.getpid()), "live": owned(bus, context, error_type, data["binding"], data["live"]), "old": owned(bus, context, error_type, data["binding"], data["old"]) if data["old"] else None}
        finally:
            bus.close()
        audit(bus.trace, bus.trace_total)
        result.update(trace=bus.trace, traceTotal=bus.trace_total)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    receipt, bus, proof = {"limits": CAPS, "busDir": str(args.bus_dir), "status": "failed"}, None, None
    try:
        assert os.getuid() == os.getgid() == 1000 and not sys.flags.optimize, "guest-uid-gid-or-disabled-assertions"
        os.umask(0o077)
        root = Path("/session/a11y-lifetime-only") / uuid4().hex
        root.mkdir(parents=True)
        receipt.update(artifacts=str(root), sourceDigests={name: hashlib.sha256(bounded(args.bus_dir / name)).hexdigest() for name in ("bus.py", "context.py")})
        bus, context, error_type = connection(args.bus_dir)
        proof = Proof(bus, context, error_type, receipt, root)
        def interrupted(*_):
            raise RuntimeError("probe-interrupted-or-deadline")
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP, signal.SIGALRM):
            signal.signal(sig, interrupted)
        signal.alarm(CAPS["seconds"])
        run(proof, args.bus_dir)
        receipt["status"] = "verified-with-draft-gaps"
    except Exception as error:
        receipt.update(status="failed", error=str(error), errorType=type(error).__name__)
    finally:
        signal.alarm(0)
        if proof:
            for child in reversed(proof.children):
                try:
                    child.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.communicate(timeout=2)
        if bus:
            try:
                bus.close()
                traces = bus.trace + [call for helper in receipt.get("helpers", []) for call in helper["trace"]]
                total = bus.trace_total + sum(helper["traceTotal"] for helper in receipt.get("helpers", []))
                receipt.update(trace=traces, traceTotal=total, events=list(proof.events), eventTotal=proof.event_total, childrenReaped=len(proof.children),
                               elapsedMs=round((monotonic() - proof.start) * 1000), childExits=[child.returncode for child in proof.children])
                audit(traces, total)
                assert {"GetAddress", "GetChildAtIndex", "GetState", "GetRole", "SetTextContents", "GetText", "RegisterEvent"} <= {c["method"] for c in traces}, "trace-positive-control"
                assert not any(c["owner"] == receipt["recycledRow"]["handle"]["owner"] and c["path"] == receipt["recycledRow"]["handle"]["path"] and c["method"] in ("SetTextContents", "DoAction") for c in traces), "recycled-row-mutation-dispatched"
                for method, interface in [("GetItems", A + "Cache"), ("GetChildren", A + "Accessible"), ("GetAll", "org.freedesktop.DBus.Properties"), ("GetMatches", A + "Collection")]:
                    try:
                        audit(traces + [{"method": method, "interface": interface}], total + 1)
                        raise RuntimeError("trace-control-missed")
                    except AssertionError as error:
                        assert str(error) == "forbidden-query", "trace-control-wrong-failure"
                assert proof.event_total <= CAPS["events"] and monotonic() - proof.start < CAPS["seconds"], "event-or-time-cap"
                assert receipt["sourceDigests"] == {name: hashlib.sha256(bounded(args.bus_dir / name)).hexdigest() for name in receipt["sourceDigests"]}, "production-source-changed"
                receipt["traceCheck"] = "positive calls present; four forbidden-query controls killed"
            except Exception as error:
                receipt.update(status="failed", traceError=str(error))
        encoded = json.dumps(receipt, ensure_ascii=False, indent=2)
        if len(encoded.encode()) > CAPS["receiptBytes"]:
            receipt.update(status="failed", error="receipt-cap")
            encoded = json.dumps({k: v for k, v in receipt.items() if k not in ("trace", "helpers")})
        try:
            args.output.write_text(encoded + "\n")
        except OSError as error:
            receipt.update(status="failed", error="receipt-write: " + str(error))
    print(json.dumps({"status": receipt["status"], "assertions": len(receipt.get("assertions", [])), "traceTotal": receipt.get("traceTotal"), "events": receipt.get("eventTotal"), "error": receipt.get("error"), "traceError": receipt.get("traceError"), "receipt": str(args.output)}))
    return 1 if receipt["status"] == "failed" else 0

if __name__ == "__main__":
    sys.exit(main())

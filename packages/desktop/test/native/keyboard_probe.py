#!/usr/bin/env python3
"""W0: actual Electron keyboard mode, native readback, app-written config effect.

Run inside the owned session through orchestra-a11y-session --exec. Production
bus.py comes from read-only /bridge; --payload supplies our keyboard.py. xdotool
is used only for owned-window/view setup, never to type proof text. JSON receipt
goes to stdout; this script never writes the configuration effect oracle.
"""

import argparse
from collections import Counter, deque
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Lock
from time import monotonic, sleep

A = "org.a11y.atspi."
ROOT = "/org/a11y/atspi/accessible/root"
DBUS = ("org.freedesktop.DBus", "/org/freedesktop/DBus")
LIMITS = {"calls": 3400, "seconds": 90, "walkNodes": 64, "walkDepth": 24, "children": 8, "text": 1500, "metadataBytes": 65536}


class Probe:
    def __init__(self, bus, app):
        self.bus, self.app = bus, app
        self.deadline, self.calls = monotonic() + LIMITS["seconds"], 0
        self.owner = self.window = None

    def call(self, ref, interface, method, signature="()", parameters=(), reply="()"):
        remaining = int((self.deadline - monotonic()) * 1000)
        if remaining <= 0 or self.calls >= LIMITS["calls"]:
            raise RuntimeError("verification-incomplete: probe query budget exhausted")
        self.calls += 1
        result = self.bus.call(*ref, interface, method, signature, parameters, reply, min(3000, remaining))
        return result[0] if reply != "()" else None

    def prop(self, path, interface, name):
        return self.call((self.owner, path), "org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, name), "(v)")

    def node(self, path, prune_classes=()):
        words = self.call((self.owner, path), A + "Accessible", "GetState", reply="(au)")
        if len(words) != 2 or any(type(word) is not int or not 0 <= word < 2**32 for word in words):
            raise RuntimeError("protocol-error: invalid native state masks")
        role = self.call((self.owner, path), A + "Accessible", "GetRole", reply="(u)")
        attributes = self.call((self.owner, path), A + "Accessible", "GetAttributes", reply="(a{ss})")
        if len(attributes) > 32 or any(len(key) > 256 or len(value) > 1024 for key, value in attributes.items()):
            raise RuntimeError("verification-incomplete: native attributes exceed diagnostic budget")
        pruned = any(name in attributes.get("class", "").split() for name in prune_classes)
        return {"owner": self.owner, "path": path, "name": "" if role == 40 or pruned else self.prop(path, A + "Accessible", "Name"),
                "role": role,
                "states": [state for state in range(64) if words[state // 32] & (1 << (state % 32))],
                "interfaces": [] if pruned else self.call((self.owner, path), A + "Accessible", "GetInterfaces", reply="(as)"),
                "attributes": attributes}

    def children(self, path):
        count = self.prop(path, A + "Accessible", "ChildCount")
        if type(count) is not int or not 0 <= count <= LIMITS["children"]:
            raise RuntimeError("verification-incomplete: scoped child window exceeded")
        refs = [self.call((self.owner, path), A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))") for index in range(count)]
        if any(ref[0] not in ("", self.owner) for ref in refs):
            raise RuntimeError("Cross-exporter traversal refused")
        return [ref[1] for ref in refs if ref[1] != "/org/a11y/atspi/null"]

    def find(self, root, predicate, prune_classes=()):
        pending, seen = deque([(root, 0)]), set()
        while pending and len(seen) < LIMITS["walkNodes"]:
            path, depth = pending.popleft()
            if path in seen:
                continue
            seen.add(path)
            node = self.node(path, prune_classes)
            if 6 in node["states"] or 25 not in node["states"]:
                continue
            if predicate(node):
                return node
            if any(name in node["attributes"].get("class", "").split() for name in prune_classes):
                continue
            if depth >= LIMITS["walkDepth"]:
                continue
            pending.extend((child, depth + 1) for child in self.children(path))
        raise RuntimeError("verification-incomplete: target missing from bounded subtree")

    def identify(self):
        proc = Path("/proc") / str(self.app["pid"])
        if int((proc / "stat").read_text().rsplit(")", 1)[1].split()[19]) != self.app["startTicks"] or os.readlink(proc / "exe") != self.app["executable"]:
            raise RuntimeError("Published app identity changed")
        registry = self.call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
        count = self.call((registry, ROOT), "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Accessible", "ChildCount"), "(v)")
        if not 0 < count <= 16:
            raise RuntimeError("Invalid bounded registry root count")
        exporters = []
        for index in range(count):
            ref = self.call((registry, ROOT), A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")
            pid = self.call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
            exporters.append({"ref": ref, "pid": pid})
        matches = [item for item in exporters if item["pid"] == self.app["pid"]]
        if len(matches) != 1:
            raise RuntimeError("Expected one exporter for the current owned VS Code process")
        self.owner = matches[0]["ref"][0]
        self.window = self.find(ROOT, lambda node: node["role"] == 23 and 1 in node["states"])["path"]
        return exporters

    def setup(self, key):
        self.identify()
        if key == "ctrl+comma":
            setup = json.loads(subprocess.check_output([sys.executable, "/proof/prepare_code.py"], text=True, timeout=8))
            sleep(1)
            self.identify()
            workbench = self.find(ROOT, lambda node: "monaco-workbench" in node["attributes"].get("class", ""))
            return workbench["path"], {**setup, "method": "prepare_code.py-setup-only", "key": key}
        windows = subprocess.check_output(["xdotool", "search", "--all", "--onlyvisible", "--pid", str(self.app["pid"])], text=True, timeout=3).split()
        if len(windows) != 1 or subprocess.check_output(["xdotool", "getwindowpid", windows[0]], text=True, timeout=3).strip() != str(self.app["pid"]):
            raise RuntimeError("Owned X window is ambiguous")
        subprocess.run(["xdotool", "windowfocus", "--sync", windows[0]], check=True, timeout=3)
        subprocess.run(["xdotool", "key", "--clearmodifiers", "Escape"], check=True, timeout=3)
        sleep(0.2)
        self.identify()
        subprocess.run(["xdotool", "key", "--clearmodifiers", key], check=True, timeout=3)
        sleep(0.4)
        workbench = self.find(ROOT, lambda node: "monaco-workbench" in node["attributes"].get("class", ""))
        return workbench["path"], {"method": "xdotool-setup-only", "key": key, "window": windows[0], "pid": self.app["pid"]}

    def evidence(self, node, widget):
        evidence = {"owner": self.owner, "path": self.window, "root": ROOT,
                    "pid": self.app["pid"], "startTicks": self.app["startTicks"]}
        if 12 not in node["states"]:
            focused = self.find(widget, lambda item: 12 in item["states"])
            evidence["focus"] = focused["path"]
        return evidence

    def text(self, node):
        from context import text_length_matches
        count = self.prop(node["path"], A + "Text", "CharacterCount")
        if type(count) is not int or not 0 <= count <= LIMITS["text"]:
            raise RuntimeError("verification-incomplete: native text read budget exceeded")
        value = self.call((self.owner, node["path"]), A + "Text", "GetText", "(ii)", (0, count), "(s)")
        if (not isinstance(value, str) or len(value) > LIMITS["text"]
                or any(0xD800 <= ord(c) <= 0xDFFF for c in value) or not text_length_matches(value, count)):
            raise RuntimeError("verification-incomplete: native Text range malformed, oversized or incomplete")
        after = self.prop(node["path"], A + "Text", "CharacterCount")
        if type(after) is not int or after != count:
            raise RuntimeError("verification-incomplete: native Text count changed during readback")
        return value

    def ancestry(self, node):
        from bus import BusError
        chain, seen, path = [], set(), node["path"]
        for _ in range(40):
            if path in seen:
                raise RuntimeError("verification-incomplete: diagnostic ancestry cycle")
            seen.add(path)
            current = self.node(path)
            try:
                current["accessibleID"] = self.prop(path, A + "Accessible", "AccessibleId")
            except BusError as error:
                current["accessibleID"] = {"unavailable": error.code}
            chain.append(current)
            if len(json.dumps(chain).encode()) > LIMITS["metadataBytes"]:
                raise RuntimeError("verification-incomplete: native ancestry metadata exceeds byte budget")
            if path == ROOT and current["role"] == 75:
                return chain
            parent = self.prop(path, A + "Accessible", "Parent")
            if parent[0] not in ("", self.owner) or parent[1] == "/org/a11y/atspi/null":
                raise RuntimeError("wrong-scope: diagnostic ancestry left owned exporter")
            path = parent[1]
        raise RuntimeError("verification-incomplete: diagnostic ancestry exceeds depth budget")

    def toolkit(self, node):
        from bus import BusError
        app = self.call((self.owner, node["path"]), A + "Accessible", "GetApplication", reply="((so))")
        if app[0] not in ("", self.owner) or app[1] != ROOT:
            raise RuntimeError("wrong-scope: unexpected diagnostic application root")
        result = {}
        for name in ("ToolkitName", "Version", "AtspiVersion", "Id"):
            try:
                result[name] = self.prop(ROOT, A + "Application", name)
            except BusError as error:
                result[name] = {"unavailable": error.code}
        return result


def load_keyboard(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def execute(args, receipt, bus, wire):
    keyboard = load_keyboard(args.payload / "keyboard.py", "keyboard_w0")
    probe = Probe(bus, receipt["launch"])
    receipt["exporters"] = probe.identify()
    def operation(label, module, node, text, allowed=None):
        fresh = probe.node(node["path"])
        allowed = {"owner": probe.owner, "path": probe.window, "root": ROOT, "pid": probe.app["pid"],
                   "startTicks": probe.app["startTicks"]} if allowed is None else allowed
        before = bus.trace_total
        item = {"case": label, "target": {"owner": node["owner"], "path": node["path"]}, "requested": text,
                "admission": {"role": fresh["role"], "states": fresh["states"], "attributes": fresh["attributes"]}}
        receipt["operations"].append(item)
        try:
            item["result"] = module.replace_text(bus, item["target"], text, 8000, allowed)
        except wire.BusError as error:
            item.update(error={"code": error.code, "message": str(error)}, result=getattr(error, "result", None))
        delta = bus.trace_total - before
        if delta > len(bus.trace):
            raise RuntimeError("verification-incomplete: operation trace was truncated")
        item["methods"] = dict(Counter(call["method"] for call in bus.trace[-delta:])) if delta else {}
        item["actual"] = probe.text(node) if A + "Text" in node["interfaces"] else {"unavailable": "unsupported-interface"}
        return item

    if args.phase == "settings":
        _settings_workflow(probe, keyboard, receipt, operation)
        return
    workbench, setup = probe.setup("ctrl+p")
    receipt["setup"].append(setup)
    widget = probe.find(workbench, lambda node: "quick-input-widget" in node["attributes"].get("class", ""), ("settings-body",))
    target = probe.find(widget["path"], lambda node: node["role"] == 79 and node["attributes"].get("tag") == "input")
    receipt["quickOpen"] = target
    evidence = probe.evidence(target, widget["path"])
    for label, allowed in (("wrong-exporter", {**evidence, "pid": -1}), ("wrong-window", {**evidence, "path": ROOT}),
                           ("wrong-root", {**evidence, "root": ROOT + "/wrong"}), ("wrong-start", {**evidence, "startTicks": -1})):
        item = operation(label, keyboard, target, "scope-control", allowed)
        if item.get("error", {}).get("code") != "wrong-scope" or item["methods"].get("GenerateKeyboardEvent", 0) or item["methods"].get("GrabFocus", 0):
            raise RuntimeError("Scope negative control failed")
    root_case = operation("read-only-target", keyboard, probe.node(probe.window), "read-only-control")
    if root_case.get("error", {}).get("code") != "read-only" or root_case["methods"].get("GenerateKeyboardEvent", 0):
        raise RuntimeError("Read-only target control failed")
    other = wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"])
    held = Lock()
    held.acquire()
    with keyboard._guard:
        keyboard._locks[bus.connection.get_guid()] = held
    try:
        before = other.trace_total
        item = {"case": "same-session-exclusion", "differentConnections": other.connection.get_unique_name() != bus.connection.get_unique_name()}
        receipt["operations"].append(item)
        try:
            keyboard.replace_text(other, {"owner": target["owner"], "path": target["path"]}, "locked-control", 100, evidence)
        except wire.BusError as error:
            item["error"] = {"code": error.code, "message": str(error)}
        item["methods"] = dict(Counter(call["method"] for call in other.trace[before:]))
        if item.get("error", {}).get("code") != "busy" or item["methods"] or not item["differentConnections"]:
            raise RuntimeError("Same-session cross-connection exclusion failed")
    finally:
        held.release()
        other.close()
    receipt["focusNegativeControls"] = "private native adversaries; omission of a hint is not failure when current controlling relations prove focus"
    ascii_case = operation("ascii", keyboard, target, "W0-ascii")
    if ascii_case.get("error"):
        raise RuntimeError("ASCII positive control failed")
    noop = operation("same-value-no-op", keyboard, target, "W0-ascii")
    if noop.get("error") or not noop["result"].get("noOp") or noop["methods"].get("GenerateKeyboardEvent", 0):
        raise RuntimeError("No-op control dispatched repeated typing")
    source = (args.payload / "keyboard.py").read_text()
    anchor = '    generate(0, segment, 4)'
    if source.count(anchor) != 1:
        raise RuntimeError("No-op typing mutation anchor changed")
    with tempfile.TemporaryDirectory(prefix="orchestra-a11y-keyboard-control-") as directory:
        path = Path(directory) / "keyboard.py"
        path.write_text(source.replace(anchor, '    return  # Suppressed KEY_STRING segment control.'))
        mutated = load_keyboard(path, "keyboard_noop_control")
        item = operation("suppressed-typing-readback-control", mutated, target, "not-typed-control")
        if item.get("error", {}).get("code") != "postcondition-mismatch" or item["actual"] != "W0-ascii":
            raise RuntimeError("Readback control did not reject suppressed typing")
    unicode_case = operation("unicode", keyboard, target, "café 漢字 🧪")
    combining_case = operation("decomposed-combining", keyboard, target, "e\u0301")
    clear_case = operation("empty-clear", keyboard, target, "")
    if not clear_case.get("error"):
        noop = operation("empty-no-op", keyboard, target, "")
        if noop.get("error") or not noop["result"].get("noOp") or noop["methods"].get("GenerateKeyboardEvent", 0):
            raise RuntimeError("Empty no-op dispatched repeated typing")
    if unicode_case.get("error") or combining_case.get("error") or clear_case.get("error"):
        receipt["unicodeCapability"] = "unverified; see exact native readback/errors"
    else:
        receipt["unicodeCapability"] = "verified in this control/session"
    receipt["status"] = "verified" if all(not entry.get("error") for entry in (unicode_case, combining_case, clear_case)) else "capability-boundary"
    receipt["proofScope"] = ["QuickOpen Unicode/clear/no-op"]
    if args.phase == "quick":
        return
    quick_status = receipt["status"]
    _settings_workflow(probe, keyboard, receipt, operation)
    receipt["status"] = "verified" if quick_status == "verified" and receipt["status"] == "verified" else "capability-boundary"
    receipt["proofScope"].insert(0, "QuickOpen Unicode/clear/no-op")


def _settings_workflow(probe, keyboard, receipt, operation):
    workbench, setup = probe.setup("ctrl+comma")
    receipt["setup"].append(setup)
    modal = probe.find(workbench, lambda node: "monaco-modal-editor-block" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
    settings = probe.find(modal["path"], lambda node: node["role"] == 16 and node["name"] == "Settings", ("settings-body", "quick-input-widget"))
    search = probe.find(settings["path"], lambda node: "search-container" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
    target = probe.find(search["path"], lambda node: node["role"] == 79 and "search settings" in node["name"].casefold())
    receipt["settingsSearch"] = target
    receipt["settingsSearch"]["nativeBefore"] = probe.text(target)
    query = "@id:files.trimTrailingWhitespace"
    item = operation("settings-filter", keyboard, target, query)
    if item.get("error") or item["actual"] != query or item["result"]["postcondition"] != "verified":
        raise RuntimeError("verification-incomplete: Settings ASCII filter did not verify; body traversal refused")
    sleep(0.4)
    body = probe.find(settings["path"], lambda node: "settings-body" in node["attributes"].get("class", ""))
    checkbox = probe.find(body["path"], lambda node: node["role"] == 7 and node["name"] == "files.trimTrailingWhitespace")
    _checkbox_diagnostic(probe, checkbox, receipt)
    # The checkbox workflow changes focus. Reopen through the owner's setup script
    # before this separate clear/projection diagnostic; no keyboard mutation retries.
    workbench, setup = probe.setup("ctrl+comma")
    receipt["setup"].append({**setup, "stage": "settings-clear-setup"})
    modal = probe.find(workbench, lambda node: "monaco-modal-editor-block" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
    settings = probe.find(modal["path"], lambda node: node["role"] == 16 and node["name"] == "Settings", ("settings-body", "quick-input-widget"))
    search = probe.find(settings["path"], lambda node: "search-container" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
    target = probe.find(search["path"], lambda node: node["role"] == 79 and "search settings" in node["name"].casefold())
    empty = operation("settings-empty-projection", keyboard, target, "", {"owner": probe.owner, "path": probe.window, "root": ROOT,
                      "pid": probe.app["pid"], "startTicks": probe.app["startTicks"]})
    receipt["settingsProjection"] = {"control": probe.node(target["path"]), "requested": "", "actual": empty["actual"],
                                     "clearVerified": not empty.get("error") and empty["actual"] == "",
                                     "error": empty.get("error"), "controllerCalls": empty.get("result", {}).get("controllerCalls", 0),
                                     "limitation": None if not empty.get("error") else "Exact native projection is not empty; no trimming or normalization"
                                     if empty.get("result", {}).get("controllerCalls", 0) else "Native focus could not be confirmed; no clear key dispatched"}
    receipt["proofScope"] = ["Settings ASCII filter", "W0 direct config diagnostic and native restore"]
    receipt["status"] = "verified"


def _checkbox_diagnostic(probe, checkbox, receipt):
    chain = probe.ancestry(checkbox)
    receipt["checkboxMetadata"] = {"ancestry": chain, "toolkit": probe.toolkit(checkbox),
                                   "virtualAncestorRoles": [node["role"] for node in chain[1:] if node["role"] in (31, 32, 55, 56, 65, 66, 90, 91)],
                                   "adapterPath": False, "policyDecision": "lead-owned; virtual ref checks retained"}
    config = Path("/home/proof/vscode-profile/User/settings.json")
    baseline = config.read_bytes()
    value = json.loads(baseline).get("files.trimTrailingWhitespace", False)
    if type(value) is not bool or (4 in checkbox["states"]) != value:
        raise RuntimeError("Checkbox/config baseline mismatch")
    ref = probe.owner, checkbox["path"]
    count = probe.prop(checkbox["path"], A + "Action", "NActions")
    if not 0 < count <= 8:
        raise RuntimeError("Invalid advertised checkbox action count")
    actions = [probe.call(ref, A + "Action", "GetName", "(i)", (index,), "(s)") for index in range(count)]
    selected = [index for index, name in enumerate(actions) if name in ("check", "uncheck", "toggle", "click", "press")]
    if len(selected) != 1 or probe.call(ref, A + "Action", "GetName", "(i)", (selected[0],), "(s)") != actions[selected[0]]:
        raise RuntimeError("Checkbox advertised default action is ambiguous")
    fresh = probe.node(checkbox["path"])
    if not {8, 24, 25}.issubset(fresh["states"]) or 6 in fresh["states"]:
        raise RuntimeError("Checkbox became unavailable")
    action = {"target": fresh, "advertised": actions, "selected": selected[0], "before": value,
              "beforeConfigSha256": hashlib.sha256(baseline).hexdigest(), "diagnosticOnly": True}
    receipt["checkbox"] = action
    try:
        action["acknowledged"] = probe.call(ref, A + "Action", "DoAction", "(i)", (selected[0],), "(b)")
        if not action["acknowledged"]:
            raise RuntimeError("provider-rejected: direct checkbox diagnostic action rejected")
        for _ in range(20):
            after = config.read_bytes()
            configured = json.loads(after)
            # VS Code removes the override when the setting returns to default false.
            observed = configured.get("files.trimTrailingWhitespace", False)
            if type(observed) is bool and observed != value:
                action.update(after=observed, configVerified=after != baseline, overridePresent="files.trimTrailingWhitespace" in configured,
                              afterConfigSha256=hashlib.sha256(after).hexdigest(), afterStates=probe.node(checkbox["path"])["states"])
                break
            sleep(0.05)
        if not action.get("configVerified") or (4 in action["afterStates"]) == value:
            raise RuntimeError("postcondition-mismatch: app-written config/native checkbox diagnostic failed")
    finally:
        current = json.loads(config.read_bytes()).get("files.trimTrailingWhitespace", False)
        restore = {"method": "native-advertised-action", "value": value}
        receipt["restore"] = restore
        if type(current) is not bool:
            raise RuntimeError("verification-incomplete: app profile state cannot be restored")
        fresh = probe.node(checkbox["path"])
        if fresh["name"] != checkbox["name"] or 6 in fresh["states"] or not {8, 24, 25}.issubset(fresh["states"]):
            raise RuntimeError("verification-incomplete: native restore control changed")
        checked = 4 in fresh["states"]
        if checked != value:
            restore_name = "uncheck" if checked else "check"
            if probe.call(ref, A + "Action", "GetName", "(i)", (selected[0],), "(s)") != restore_name:
                raise RuntimeError("action-drift: native restore action changed")
            restore.update(action=restore_name, acknowledged=probe.call(ref, A + "Action", "DoAction", "(i)", (selected[0],), "(b)"))
            if not restore["acknowledged"]:
                raise RuntimeError("provider-rejected: native profile restore rejected")
        for _ in range(20):
            restored = config.read_bytes()
            configured = json.loads(restored)
            if configured.get("files.trimTrailingWhitespace", False) == value and (4 in probe.node(checkbox["path"])["states"]) == value:
                restore.update(configVerified=True, overridePresent="files.trimTrailingWhitespace" in configured,
                               configSha256=hashlib.sha256(restored).hexdigest(), bytesRestored=restored == baseline)
                break
            sleep(0.05)
        if not restore.get("configVerified"):
            raise RuntimeError("postcondition-mismatch: app-driven profile restore did not verify")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--bus-dir", type=Path, default=Path("/bridge"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--phase", choices=("all", "quick", "settings"), default="all")
    args = parser.parse_args()
    sys.path.insert(0, str(args.bus_dir))
    import bus
    app = json.loads(Path("/session/apps.json").read_text())["apps"]["vscode"]
    receipt = {"launch": app, "limits": LIMITS, "setup": [], "operations": [],
               "versions": json.loads(Path("/session/versions.json").read_text())["vscode"],
               "busSha256": hashlib.sha256((args.bus_dir / "bus.py").read_bytes()).hexdigest(),
               "keyboardSha256": hashlib.sha256((args.payload / "keyboard.py").read_bytes()).hexdigest()}
    wire = bus.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], timeout_ms=3000)
    try:
        execute(args, receipt, wire, bus)
    except Exception as error:
        receipt.update(status="verification-incomplete", error=str(error))
    finally:
        wire.close()
        receipt.update(calls=wire.trace, traceTotal=wire.trace_total)
    methods = {call["method"] for call in wire.trace}
    if not wire.trace or len(wire.trace) != wire.trace_total or any(call["method"] in ("GetItems", "GetChildren", "GetAll")
        or call["interface"] == A + "Collection" for call in wire.trace):
        receipt.update(status="verification-incomplete", traceError="Outgoing trace is empty, truncated, or contains a forbidden query")
    required = {"GrabFocus", "GenerateKeyboardEvent", "GetText"} | ({"DoAction"} if args.phase != "quick" else set())
    if receipt["status"] == "verified" and not required.issubset(methods):
        receipt.update(status="verification-incomplete", traceError="Trace missed actual focus/keyboard/readback/action positive controls")
    if args.output:
        args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": receipt["status"], "error": receipt.get("error"),
                           "unicodeCapability": receipt.get("unicodeCapability"),
                           "settingsClearVerified": receipt.get("settingsProjection", {}).get("clearVerified"),
                           "settingsClearActual": receipt.get("settingsProjection", {}).get("actual"),
                          "configVerified": receipt.get("checkbox", {}).get("configVerified", False),
                          "restoreVerified": receipt.get("restore", {}).get("configVerified", False)}))
        return 0 if receipt["status"] == "verified" else 1
    print(json.dumps(receipt, ensure_ascii=False, indent=2))
    return 0 if receipt["status"] == "verified" else 1


if __name__ == "__main__":
    raise SystemExit(main())

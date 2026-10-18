#!/usr/bin/env python3
"""W0 real-app probe, not a server. No CLI work occurs on import.

Manifests: environment.json contains DBUS_SESSION_BUS_ADDRESS; apps.json contains
an apps map with launch PID, file and processIdentities from the supervisor.
Only initial editor/Settings preparation belongs to the bootstrap supervisor.
"""

import argparse
from collections import deque
import json
from pathlib import Path
import platform
import subprocess
import sys
from time import monotonic, sleep
from uuid import uuid4

A = "org.a11y.atspi."
ROOT = "/org/a11y/atspi/accessible/root"
DBUS = ("org.freedesktop.DBus", "/org/freedesktop/DBus")
PIN = "https://raw.githubusercontent.com/GNOME/at-spi2-core/AT_SPI2_CORE_2_52_0/"
LIMITS = {"nodesPerWalk": 256, "childrenPerNode": 32, "depth": 32, "queries": 3500, "text": 1500, "seconds": 45}


class Finding(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(message)


def bounded_bytes(path, limit=65536):
    with Path(path).open("rb") as stream:
        data = stream.read(limit + 1)
    if len(data) > limit:
        raise Finding("verification-incomplete", "File exceeds verification budget: " + str(path))
    return data


def state_ids(words):
    if len(words) != 2 or any(type(word) is not int or not 0 <= word < 2**32 for word in words):
        raise Finding("wire-schema-mismatch", "GetState must return two uint32 masks")
    return [index for index in range(64) if words[index // 32] & (1 << (index % 32))]


def check_trace(calls, total):
    if not calls or len(calls) != total:
        raise Finding("verification-incomplete", "Outgoing method trace is empty or truncated")
    for call in calls:
        if call["method"] in ("GetItems", "GetChildren", "GetAll") or call["interface"] == A + "Collection":
            raise Finding("forbidden-query", str(call))
        if call["method"] == "GetChildAtIndex" and not 0 <= call["parameters"][0] < 512:
            raise Finding("unbounded-query", str(call))
        if call["method"] == "GetText" and not 0 <= call["parameters"][0] <= call["parameters"][1] <= LIMITS["text"]:
            raise Finding("unbounded-query", str(call))


class Probe:
    def __init__(self, bus, receipt):
        self.bus, self.receipt = bus, receipt
        self.deadline, self.queries = monotonic() + LIMITS["seconds"], 0

    def call(self, ref, interface, method, signature, parameters, reply):
        remaining = int((self.deadline - monotonic()) * 1000)
        if remaining <= 0 or self.queries >= LIMITS["queries"]:
            raise Finding("verification-incomplete", "Probe deadline/query budget exhausted")
        self.queries += 1
        return self.bus.call(*ref, interface, method, signature, parameters, reply, min(1000, remaining))[0]

    def prop(self, ref, interface, name):
        return self.call(ref, "org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, name), "(v)")

    def text(self, node):
        count = self.prop(node["ref"], A + "Text", "CharacterCount")
        if not 0 <= count <= LIMITS["text"]:
            raise Finding("verification-incomplete", "Text read-back exceeds character budget")
        return self.call(node["ref"], A + "Text", "GetText", "(ii)", (0, count), "(s)")

    def walk(self, root):
        frontier, seen, nodes, partial = deque([(root, 0)]), set(), [], []
        while frontier and len(seen) < LIMITS["nodesPerWalk"]:
            ref, depth = frontier.popleft()
            if ref in seen or ref[1] == "/org/a11y/atspi/null":
                continue
            seen.add(ref)
            if ref[0] != root[0]:
                partial.append("cross-exporter child excluded: " + str(ref))
                continue
            words = self.call(ref, A + "Accessible", "GetState", "()", (), "(au)")
            states = state_ids(words)
            if 6 in states:
                partial.append("defunct: " + str(ref))
                continue
            if depth > 0 and 25 not in states:
                continue
            interfaces = self.call(ref, A + "Accessible", "GetInterfaces", "()", (), "(as)")
            node = {"ref": ref, "depth": depth, "name": self.prop(ref, A + "Accessible", "Name")[:256],
                    "role": self.call(ref, A + "Accessible", "GetRole", "()", (), "(u)"),
                    "stateWords": words, "states": states, "interfaces": interfaces[:16], "actions": []}
            if len(interfaces) > 16:
                partial.append("interface limit: " + str(ref))
            if A + "Action" in interfaces:
                count = self.prop(ref, A + "Action", "NActions")
                node["actions"] = [{"index": index, "name": self.call(ref, A + "Action", "GetName", "(i)", (index,), "(s)")}
                                   for index in range(max(0, min(count, 8)))]
                if count > 8:
                    partial.append("action limit: " + str(ref))
            if A + "Text" in interfaces and node["role"] != 40:
                count = self.prop(ref, A + "Text", "CharacterCount")
                node["text"] = {"count": count, "range": [0, max(0, min(count, LIMITS["text"]))],
                                "value": self.call(ref, A + "Text", "GetText", "(ii)", (0, max(0, min(count, LIMITS["text"]))), "(s)"),
                                "completeWithinControl": 0 <= count <= LIMITS["text"]}
            nodes.append(node)
            count = self.prop(ref, A + "Accessible", "ChildCount")
            available = min(LIMITS["childrenPerNode"], LIMITS["nodesPerWalk"] - len(seen) - len(frontier))
            if count < 0 or count > available or depth >= LIMITS["depth"] and count:
                partial.append("child/depth/visit limit: " + str(ref))
            if depth >= LIMITS["depth"]:
                continue
            for index in range(max(0, min(count, available))):
                child = self.call(ref, A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")
                owner = child[0] or ref[0]
                owner = owner if owner.startswith(":") else self.call(DBUS, DBUS[0], "GetNameOwner", "(s)", (owner,), "(s)")
                frontier.append(((owner, child[1]), depth + 1))
        self.receipt.setdefault("walks", []).append({"nodes": nodes, "partial": partial, "consistency": "non-atomic"})
        return nodes

    def replace(self, node, value):
        result = {"ref": node["ref"], "requested": value, "before": self.text(node)}
        self.receipt.setdefault("replacements", []).append(result)
        states = state_ids(self.call(node["ref"], A + "Accessible", "GetState", "()", (), "(au)"))
        interfaces = self.call(node["ref"], A + "Accessible", "GetInterfaces", "()", (), "(as)")
        if not {7, 8, 24}.issubset(states) or 6 in states or 43 in states or A + "EditableText" not in interfaces:
            raise Finding("unsupported-interface", "Fresh control does not expose enabled EditableText")
        result["acknowledged"] = self.call(node["ref"], A + "EditableText", "SetTextContents", "(s)", (value,), "(b)")
        result["after"] = self.text(node)
        result["verified"] = result["acknowledged"] and result["after"] == value
        if not result["verified"]:
            raise Finding("postcondition-mismatch", "Unicode replacement did not read back exactly")


def select(nodes, predicate, path, description):
    candidates = [node for node in nodes if predicate(node) and (not path or node["ref"][1] == path)]
    if len(candidates) != 1:
        raise Finding("unsupported-operation" if not candidates else "ownership-unresolved", description + " requires one candidate; observed " + str(len(candidates)))
    return candidates[0]


def execute(args, receipt, bus, app):
    probe = Probe(bus, receipt)
    registry = probe.call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
    count = probe.prop((registry, ROOT), A + "Accessible", "ChildCount")
    roots = [probe.call((registry, ROOT), A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))") for index in range(max(0, min(count, 32)))]
    receipt["exporters"] = [{"ref": ref, "pid": probe.call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")}
                            for ref in roots if ref[1] != "/org/a11y/atspi/null"]
    process_ids = [item["pid"] for item in app["processIdentities"]]
    matches = [item["ref"] for item in receipt["exporters"] if item["pid"] in process_ids]
    if len(matches) != 1:
        raise Finding("not-ready" if not matches else "ownership-unresolved", "Known launch PID must identify one accessible application root")
    root = matches[0]
    if not root[0].startswith(":") or probe.call(root, A + "Accessible", "GetRole", "()", (), "(u)") != 75 or probe.prop(root, A + "Accessible", "ChildCount") <= 0:
        raise Finding("not-ready", "Matched exporter has no nonempty application tree")
    receipt["rootProposal"] = {"ref": root, "ownership": "exporter-PID match; runtime/window confirmation not performed",
                               "commandLine": bounded_bytes("/proc/" + str(app["pid"]) + "/cmdline", 4096).decode("utf-8", "replace")}
    events = deque(maxlen=64)
    receipt["lifecycleSubscription"] = bus.subscribe_lifecycle(root[0], lambda *event: events.append(event))
    receipt["controls"] = []
    for method, path in (("W0MissingMethod", root[1]), ("GetRole", "/org/a11y/atspi/accessible/w0_missing")):
        try:
            probe.call((root[0], path), A + "Accessible", method, "()", (), "(u)")
        except Exception as error:
            code = getattr(error, "code", "probe-error")
            receipt["controls"].append({"method": method, "path": path, "error": code, "message": str(error)})
            if code not in ("org.freedesktop.DBus.Error.UnknownMethod", "org.freedesktop.DBus.Error.UnknownObject", "org.a11y.atspi.Error.InvalidObject"):
                raise Finding("control-failed", "Missing-method/object control produced an unexpected failure")
            continue
        raise Finding("control-failed", "Missing-method/object control unexpectedly succeeded")
    nodes = probe.walk(root)
    if args.inspect_only:
        raise Finding("verification-incomplete", "Inspection only; mutations have not been tested")
    output_file = "/home/proof/vscode-profile/User/settings.json" if args.app == "code" else app["file"]
    before = bounded_bytes(output_file)
    editor = select(nodes, lambda node: A + "EditableText" in node["interfaces"] and A + "Text" in node["interfaces"]
                    and 7 in node["states"] and node["role"] == (79 if args.app == "code" else 61)
                    and (args.app != "featherpad" or node.get("text", {}).get("value") == before.decode("utf-8"))
                    and (args.app != "code" or "search settings" in node["name"].casefold()),
                    args.text_path, "Editor/Settings search")
    receipt["independentOutcome"] = {"path": output_file, "before": before.decode("utf-8"), "verified": False}
    replacement = "W0 café 🧪 漢字 e\u0301 " + uuid4().hex[:8] + ("" if args.app == "code" else "\n")
    probe.replace(editor, replacement)
    if args.app == "code":
        value = json.loads(before).get("files.trimTrailingWhitespace", False)
        if type(value) is not bool:
            raise Finding("verification-incomplete", "files.trimTrailingWhitespace baseline must be boolean")
        probe.replace(editor, "@id:files.trimTrailingWhitespace")
        sleep(0.4)
    nodes = probe.walk(root)
    if args.app != "code" and not any(node["role"] in (43, 35) and node["name"].replace("_", "").strip() == "Save" for node in nodes):
        menu = select(nodes, lambda node: node["role"] == 33 and node["name"] == "File" and bool(node["actions"]),
                      None, "Owned File menu")
        action = menu["actions"][0]
        current = probe.call(menu["ref"], A + "Action", "GetName", "(i)", (action["index"],), "(s)")
        if current != action["name"]:
            raise Finding("action-changed", "File menu action changed before dispatch")
        if not probe.call(menu["ref"], A + "Action", "DoAction", "(i)", (action["index"],), "(b)"):
            raise Finding("provider-rejected", "File menu action rejected")
        sleep(0.1)
        nodes = probe.walk(root)
    candidates = [node for node in nodes if node["role"] == 7] if args.app == "code" else [
        node for node in nodes if node["role"] in (43, 35) and node["name"].replace("_", "").strip() == "Save"]
    if not args.action_path and args.app != "code" and any(node["role"] == 43 for node in candidates):
        candidates = [node for node in candidates if node["role"] == 43]
    target = select(candidates, lambda node: bool(node["actions"]), args.action_path, "Save/setting control")
    count = probe.prop(target["ref"], A + "Action", "NActions")
    if not 0 < count <= 8:
        raise Finding("action-required", "Action enumeration exceeds probe budget or is empty")
    fresh = [{"index": index, "name": probe.call(target["ref"], A + "Action", "GetName", "(i)", (index,), "(s)")}
             for index in range(count)]
    if fresh != target["actions"]:
        raise Finding("action-changed", "Advertised actions changed before dispatch")
    actions = [action for action in fresh if action["name"] == args.action_name] if args.action_name else fresh[:1]
    if len(actions) != 1:
        raise Finding("action-required", "Choose one exact advertised action using --action-name")
    states = state_ids(probe.call(target["ref"], A + "Accessible", "GetState", "()", (), "(au)"))
    if not {8, 24}.issubset(states) or 6 in states:
        raise Finding("disabled", "Fresh action target is disabled or defunct")
    baseline = bounded_bytes(output_file)
    if args.app == "code" and (json.loads(baseline).get("files.trimTrailingWhitespace", False) is not value or (4 in states) != value):
        raise Finding("verification-incomplete", "Checkbox state/config baseline disagree before action")
    if args.app != "code" and baseline == replacement.encode("utf-8"):
        raise Finding("verification-incomplete", "File already matches before action; saving cannot be attributed")
    receipt["action"] = {"ref": target["ref"], "name": target["name"], "advertised": fresh, "selected": actions[0], "beforeStates": states,
                         "dispatchAcknowledged": probe.call(target["ref"], A + "Action", "DoAction", "(i)", (actions[0]["index"],), "(b)")}
    for _ in range(20):
        after = bounded_bytes(output_file)
        actual = json.loads(after).get("files.trimTrailingWhitespace") if args.app == "code" else None
        verified = type(actual) is bool and actual == (not value) if args.app == "code" else after == replacement.encode("utf-8")
        receipt["independentOutcome"].update(after=after.decode("utf-8"), verified=verified)
        if verified:
            break
        sleep(0.1)
    if args.app == "code":
        receipt["action"]["afterStates"] = state_ids(probe.call(target["ref"], A + "Accessible", "GetState", "()", (), "(au)"))
        if (4 in receipt["action"]["afterStates"]) == value:
            raise Finding("postcondition-mismatch", "Checkbox state did not match changed configuration")
    # Menu controls may disappear after activation; the editor's file is the effect oracle.
    receipt["lifecycleEvents"] = list(events)
    receipt["queries"] = probe.queries
    if not receipt["action"]["dispatchAcknowledged"] or not receipt["independentOutcome"]["verified"]:
        raise Finding("postcondition-mismatch", "Action reply did not establish the independently observed file/config effect")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", choices=("mousepad", "featherpad", "code"), required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--session", type=Path, default=Path("/session"))
    parser.add_argument("--bus-dir", type=Path, default=Path("/bridge"))
    parser.add_argument("--inspect-only", action="store_true")
    parser.add_argument("--text-path")
    parser.add_argument("--action-path")
    parser.add_argument("--action-name")
    args = parser.parse_args()
    receipt = {"app": args.app, "limits": LIMITS, "sourceClaims": {"pin": "AT_SPI2_CORE_2_52_0", "wire": PIN + "xml/Accessible.xml",
               "stateInterpretation": "two uint32 masks; XML enum-array prose is not the wire encoding",
               "action": PIN + "atk-adaptor/adaptors/action-adaptor.c", "actionClaim": "ATK sends reply before atk_action_do_action; deployed-source match untested",
               "events": PIN + "xml/Event.xml", "eventClaim": "XML warns signatures differ; delivery is not assumed"}}
    bus = None
    try:
        environment = json.loads(bounded_bytes(args.session / "environment.json"))
        manifest = json.loads(bounded_bytes(args.session / "apps.json"))
        if manifest.get("v") != 1 or not isinstance(manifest.get("apps"), dict):
            raise Finding("protocol-error", "Invalid bootstrap app manifest")
        app = manifest["apps"]["vscode" if args.app == "code" else args.app]
        receipt["launchEvidence"] = app
        sys.path.insert(0, str(args.bus_dir.resolve()))
        from bus import AtspiBus
        from gi.repository import GLib
        import gi
        versions = subprocess.run(["dpkg-query", "-W", "-f=${Package}\t${Version}\n", "at-spi2-core", "python3-gi", "libglib2.0-0t64", "mousepad", "featherpad", "code"],
                                  capture_output=True, text=True, timeout=3)
        receipt["versions"] = {"python": platform.python_version(), "pygobject": gi.__version__, "glib": [GLib.MAJOR_VERSION, GLib.MINOR_VERSION, GLib.MICRO_VERSION],
                               "packages": versions.stdout, "queryExit": versions.returncode, "queryError": versions.stderr}
        bus = AtspiBus(environment["DBUS_SESSION_BUS_ADDRESS"])
        execute(args, receipt, bus, app)
        receipt["status"] = "verified"
    except Exception as error:
        receipt.update(status=getattr(error, "code", "probe-error"), error=str(error))
    finally:
        if bus:
            try:
                bus.close()
            except Exception as error:
                receipt.update(status=getattr(error, "code", "probe-error"), closeError=str(error))
            receipt["calls"], receipt["traceTotal"] = bus.trace, bus.trace_total
            try:
                check_trace(receipt["calls"], receipt["traceTotal"])
                if receipt["status"] == "verified" and not {"GetChildAtIndex", "GetState", "GetInterfaces", "SetTextContents", "DoAction"}.issubset({call["method"] for call in receipt["calls"]}):
                    raise Finding("control-failed", "Outgoing trace missed known probe calls")
                receipt["traceCheck"] = "passed"
            except Finding as error:
                receipt["traceCheck"] = {"code": error.code, "message": str(error)}
                if receipt["status"] == "verified":
                    receipt["status"] = error.code
        args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"app": args.app, "status": receipt["status"], "error": receipt.get("error"),
                      "effectVerified": receipt.get("independentOutcome", {}).get("verified", False),
                      "traceCheck": receipt.get("traceCheck")}, ensure_ascii=False))
    return 0 if receipt["status"] == "verified" else 1


if __name__ == "__main__":
    sys.exit(main())

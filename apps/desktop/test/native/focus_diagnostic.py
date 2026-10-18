#!/usr/bin/env python3
"""Bounded exporter/window focus diagnosis; optional focus setup is not proof."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from time import sleep
from uuid import uuid4

sys.path.insert(0, "/bridge")
from bus import AtspiBus
from context import process_identity, states
from keyboard_probe import A, DBUS, ROOT, Probe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--focus-window-setup", action="store_true")
    parser.add_argument("--cycle-window-setup", action="store_true")
    parser.add_argument("--lifecycle-setup", action="store_true")
    parser.add_argument("--scoped-type", action="store_true")
    parser.add_argument("--view", choices=("quick", "settings"), default="quick")
    parser.add_argument("--text")
    parser.add_argument("--post-dispatch-name-delay-ms", type=int, default=0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 0 <= args.post_dispatch_name_delay_ms <= 750:
        parser.error("--post-dispatch-name-delay-ms must be between 0 and 750")
    manifest = json.loads(Path("/session/apps.json").read_text())
    app = manifest["apps"]["vscode"]
    current = process_identity(app["pid"])
    if any(current[field] != app[field] for field in current):
        raise RuntimeError("owned-launch-identity-changed")
    bus = AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], timeout_ms=1000)
    probe = Probe(bus, app)
    try:
        registry = probe.call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
        count = probe.call((registry, ROOT), "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Accessible", "ChildCount"), "(v)")
        if type(count) is not int or not 1 <= count <= 16:
            raise RuntimeError("registry-root-count-outside-diagnostic-budget")
        exporters = []
        for index in range(count):
            ref = probe.call((registry, ROOT), A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")
            pid = probe.call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
            if pid == app["pid"]:
                exporters.append(ref[0])
        if len(exporters) != 1:
            raise RuntimeError("owned-exporter-missing-or-ambiguous")
        probe.owner = exporters[0]
        nodes = [probe.node(ROOT), *[probe.node(path) for path in probe.children(ROOT)]]
        for node in nodes:
            node["childCount"] = probe.prop(node["path"], A + "Accessible", "ChildCount")
        setup = None
        lifecycle = None
        if args.lifecycle_setup:
            lifecycle = bus.subscribe_lifecycle(probe.owner, lambda *_: None)
            sleep(0.2)
        if args.focus_window_setup:
            windows = [node for node in nodes[1:] if node["role"] in (16, 23, 69) and 25 in node["states"]]
            if len(windows) != 1:
                raise RuntimeError("window-focus-setup-requires-one-owned-concrete-window")
            window = windows[0]
            accepted = probe.call((probe.owner, window["path"]), A + "Component", "GrabFocus", reply="(b)")
            setup = {"semanticProof": False, "accepted": accepted, "after": probe.node(window["path"])}
        if args.cycle_window_setup:
            for launch in (manifest["apps"]["mousepad"], app):
                identity = process_identity(launch["pid"])
                if any(identity[field] != launch[field] for field in identity):
                    raise RuntimeError("focus-cycle-owned-launch-changed")
                windows = subprocess.check_output(["xdotool", "search", "--onlyvisible", "--pid", str(launch["pid"])], text=True, timeout=3).split()
                if len(windows) != 1:
                    raise RuntimeError("focus-cycle-owned-window-ambiguous")
                subprocess.run(["xdotool", "windowfocus", "--sync", windows[0]], check=True, timeout=3)
            setup = {"semanticProof": False, "method": "owned-window-focus-cycle", "after": [probe.node(node["path"]) for node in nodes[1:]]}
        scoped = []
        if args.scoped_type:
            import actions
            from context import RequestContext
            from refs import RefRegistry, fingerprint
            import snapshot

            # Focus cycling closes Quick Open; view setup must follow it.
            subprocess.run([sys.executable, "/proof/prepare_code.py", "--view", args.view], check=True, timeout=15)
            sleep(0.4)
            probe.identify()
            workbench = probe.find(ROOT, lambda node: "monaco-workbench" in node["attributes"].get("class", ""))
            if args.view == "quick":
                widget = probe.find(workbench["path"], lambda node: "quick-input-widget" in node["attributes"].get("class", ""), ("settings-body",))
            if args.view == "settings":
                modal = probe.find(workbench["path"], lambda node: "monaco-modal-editor-block" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
                widget = probe.find(modal["path"], lambda node: "search-container" in node["attributes"].get("class", ""), ("settings-body", "quick-input-widget"))
            if args.view == "settings":
                print(json.dumps({"settingsSearch": probe.node(widget["path"]), "children": [probe.node(path) for path in probe.children(widget["path"]) ]}, ensure_ascii=False))
            target = probe.find(widget["path"], lambda node: node["role"] in (61, 79) and A + "Text" in node["interfaces"])

            class DelayedNameContext(RequestContext):
                """Diagnostic observation timing only; real wire and request budgets remain."""

                def property(self, owner, path, interface, name):
                    if self.dispatch_started and path == target["path"] and name == "Name" and not getattr(self, "name_delayed", False):
                        self.name_delayed = True
                        sleep(args.post_dispatch_name_delay_ms / 1000)
                    return super().property(owner, path, interface, name)

            registry = RefRegistry(str(uuid4()))
            binding = {"bindingID": str(uuid4()), "bindingEpoch": str(uuid4()),
                       "dock": {"senderID": 1, "tabID": "vscode", "generation": 1, "profileID": "exclusive-diagnostic"},
                       "runtime": {"runtimeID": "exclusive-diagnostic", "runtimeEpoch": manifest["sessionID"], "accessibilitySessionID": manifest["sessionID"]},
                       "appID": "vscode", "launchEpoch": app["launchEpoch"], "ownershipRevision": 1,
                       "processIdentities": [current], "roots": [{"owner": probe.owner, "path": probe.window}]}
            registry.register(binding)
            try:
                for text in (("café 漢字 🧪", "e\u0301", "", "") if args.view == "quick" else (args.text if args.text is not None else "@id:files.trimTrailingWhitespace",)):
                    registry.begin(binding)
                    context = RequestContext(bus, registry, binding, 10000)
                    before = fingerprint(context, target)
                    root = registry.issue(binding, before)
                    page = snapshot.read(context, {"rootRef": root, "budget": 1, "maxText": 1500})
                    if len(page["items"]) != 1 or page["items"][0]["role"] not in (61, 79):
                        raise RuntimeError("scoped-probe-text-control-missing-or-ambiguous")
                    operation = {"requested": text, "actualBefore": probe.text(target), "fingerprintBefore": {key: before[key] for key in ("role", "name", "parent")}}
                    scoped.append(operation)
                    try:
                        operation["result"] = actions.replace_text(DelayedNameContext(bus, registry, binding, 10000), page["items"][0]["ref"], text, "keyboard")
                    except Exception as error:
                        operation["error"] = {"code": getattr(error, "code", type(error).__name__), "message": str(error), "result": getattr(error, "result", None)}
                        operation["focusSamples"] = []
                        for delay in (0, 0.02, 0.1):
                            sleep(delay)
                            handle = (target["owner"], target["path"])
                            relations = probe.call(handle, A + "Accessible", "GetRelationSet", reply="(a(ua(so)))")
                            if len(relations) > 32 or sum(len(handles) for _, handles in relations) > 32:
                                raise RuntimeError("focus-sample-relations-exceed-budget")
                            controlled = [(owner or probe.owner, path) for kind, handles in relations if kind == 3 for owner, path in handles]
                            if any(owner != probe.owner or len(path) > 256 for owner, path in controlled):
                                raise RuntimeError("focus-sample-leaves-owned-exporter")
                            operation["focusSamples"].append({"delay": delay,
                                "field": sorted(states(probe.call(handle, A + "Accessible", "GetState", reply="(au)"))),
                                "relations": relations,
                                "controlled": [{"path": path, "states": sorted(states(probe.call((owner, path), A + "Accessible", "GetState", reply="(au)")))} for owner, path in controlled]})
                    operation["actualAfter"] = probe.text(target)
                    after = fingerprint(RequestContext(bus, registry, binding, 10000), target)
                    operation["fingerprintAfter"] = {key: after[key] for key in ("role", "name", "parent")}
                    if operation.get("error") or operation["actualAfter"] != text:
                        break
            finally:
                registry.close(binding)
        receipt = {"scope": "diagnostic; native refs/snapshot/actions only; host RPC/runtime confirmation not exercised", "sessionID": manifest["sessionID"], "process": current, "nodes": nodes, "setup": setup, "lifecycle": lifecycle,
                   "postDispatchNameDelayMs": args.post_dispatch_name_delay_ms,
                   "scopedOperations": scoped, "calls": bus.trace_total, "traceRetained": len(bus.trace), "traceTruncated": len(bus.trace) != bus.trace_total, "trace": bus.trace,
                   "sources": {name: hashlib.sha256((Path("/bridge") / name).read_bytes()).hexdigest() for name in ("actions.py", "keyboard.py", "refs.py", "snapshot.py", "context.py", "bus.py")}}
        if args.output:
            args.output.write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({key: value for key, value in receipt.items() if key != "trace"}, ensure_ascii=False))
        if args.scoped_type and (len(scoped) != (4 if args.view == "quick" else 1) or any(operation.get("error") or operation["actualAfter"] != operation["requested"] for operation in scoped)):
            return 1
        return 0
    finally:
        bus.close()


if __name__ == "__main__":
    raise SystemExit(main())

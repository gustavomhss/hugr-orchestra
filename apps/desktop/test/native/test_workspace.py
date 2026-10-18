#!/usr/bin/env python3
"""Workspace scope contracts on the actual helper modules.

Linux/PyGObject, no GUI:
    python3 -B test_workspace.py --payload /opt/orchestra/app-dock-accessibility --self-check

--workspace is an alias for --payload; either accepts the helper directory or
main.py. Explicit paths work from stdin. Host without Linux/Gio performs AST
checks only and reports NOTRUN. The small provider supplies AT-SPI replies;
binding validation, process identity, registry, snapshot and hello are production
code. These tests do not claim Gio transport or real toolkit coverage.
"""

import argparse
from copy import deepcopy
import ast
import importlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest


SESSION = "workspace-scope-test"
OWNER, REGISTRY = ":1.42", ":1.43"
A, ROOT = "org.a11y.atspi.", "/org/a11y/atspi/accessible/root"
WINDOW, CHILD = "/fixture/window", "/fixture/window/child"
MODULES = ("bus", "context", "refs", "snapshot", "bindings", "keyboard", "actions", "main")


class Provider:
    """Fixed two-node wire fixture; never substitutes a helper implementation."""

    def __init__(self):
        self.connection, self.calls = object(), []

    def call(self, owner, path, interface, method, signature, parameters, reply, timeout_ms):
        self.calls.append((owner, path, interface, method))
        if timeout_ms <= 0:
            raise AssertionError("fixture-call-deadline")
        if method == "GetNameOwner":
            if parameters != ("org.a11y.atspi.Registry",):
                raise AssertionError("fixture-registry-name")
            return (REGISTRY,)
        if method == "GetConnectionUnixProcessID":
            if parameters != (OWNER,):
                raise AssertionError("fixture-exporter-owner")
            return (os.getpid(),)
        if owner not in (OWNER, REGISTRY) or path not in (ROOT, WINDOW, CHILD):
            raise AssertionError("fixture-object-address")
        if method == "GetRole":
            return ({ROOT: 75, WINDOW: 23, CHILD: 43}[path],)
        if method == "GetState":
            return ([sum(1 << bit for bit in (8, 24, 25)), 0],)
        if method == "GetInterfaces":
            return ([A + "Accessible"],)
        if method == "GetChildAtIndex":
            if parameters != (0,):
                raise AssertionError("fixture-index")
            return ((OWNER, ROOT if owner == REGISTRY else WINDOW if path == ROOT else CHILD),)
        if method == "Get":
            return ({"Name": {ROOT: "Fixture", WINDOW: "Window", CHILD: "Child"}[path],
                     "Parent": (OWNER, ROOT if path == WINDOW else WINDOW),
                     "ChildCount": 0 if path == CHILD else 1}[parameters[1]],)
        raise AssertionError("fixture-unexpected-call: " + method)


class WorkspaceTests(unittest.TestCase):
    api = bindings = refs = source = payload = None

    def args(self, kind=None):
        target = {"runtime": {"runtimeID": "fixture", "runtimeEpoch": "epoch", "accessibilitySessionID": SESSION},
                  "appID": "workspace", "launchEpoch": SESSION, "ownershipRevision": 1,
                  "processIdentities": [self.api.process_identity(os.getpid())]}
        if kind is not None:
            target["scopeKind"] = kind
        return {"phase": "discover", "identity": {"senderID": 1, "tabID": "tab", "generation": 1, "profileID": "profile"},
                "target": target}

    def binding(self, kind=None):
        identity, target = self.bindings._target(self.args(kind), SESSION)
        if kind is None:
            del target["scopeKind"]  # Legacy direct RefRegistry callers omit it.
        return {**target, "dock": identity, "bindingID": "binding", "bindingEpoch": "epoch",
                "roots": [{"owner": OWNER, "path": WINDOW}]}

    def context(self, binding):
        registry = self.api.RefRegistry("helper")
        registry.register(binding)
        return self.api.RequestContext(Provider(), registry, binding, 2000)

    def test_legacy_default_and_workspace_target(self):
        args = self.args()
        _, target = self.bindings._target(args, SESSION)
        self.assertEqual(target["scopeKind"], "application", "legacy-application-default")
        self.assertNotIn("scopeKind", args["target"])
        _, workspace = self.bindings._target(self.args("workspace"), SESSION)
        self.assertEqual(workspace["scopeKind"], "workspace")
        bus = Provider()
        store = self.api.BindingStore(bus, self.api.RefRegistry("helper"), SESSION)
        proposal = store.discover(self.args("workspace"), 2000, lambda: False)
        self.assertEqual([(root["owner"], root["path"]) for root in proposal["roots"]], [(OWNER, WINDOW)])
        self.assertTrue(bus.calls, "workspace-discovery-positive-provider-control")

    def test_scope_kind_validation(self):
        for kind in (None, "window", "", 1, [], {}):
            with self.subTest(kind=kind):
                args = self.args()
                args["target"]["scopeKind"] = kind
                bus = Provider()
                store = self.api.BindingStore(bus, self.api.RefRegistry("helper"), SESSION)
                with self.assertRaisesRegex(self.api.BusError, "Unsupported native scope kind", msg="scope-kind-denied") as failure:
                    store.discover(args, 2000, lambda: False)
                self.assertEqual(failure.exception.code, "wrong-scope")
                self.assertEqual(bus.calls, [], "invalid-kind-before-provider")
                self.assertEqual(store.bindings, {})
                self.assertEqual(store.proposals, {})

    def test_workspace_markers(self):
        for key, value in (("appID", "installed-app"), ("launchEpoch", "different-session")):
            with self.subTest(key=key):
                args = self.args("workspace")
                args["target"][key] = value
                bus = Provider()
                store = self.api.BindingStore(bus, self.api.RefRegistry("helper"), SESSION)
                with self.assertRaises(self.api.BusError, msg="workspace-markers-denied") as failure:
                    store.discover(args, 2000, lambda: False)
                self.assertEqual(failure.exception.code, "wrong-scope")
                self.assertEqual(bus.calls, [])

    def test_workspace_uniform_realm(self):
        child = subprocess.Popen([sys.executable, "-B", "-c", "import time; time.sleep(30)"])
        try:
            args = self.args("workspace")
            args["target"]["processIdentities"].append(self.api.process_identity(child.pid))
            self.bindings._target(args, SESSION)
            for key in ("bootID", "pidNamespace", "mountNamespace"):
                with self.subTest(key=key):
                    changed = deepcopy(args)
                    changed["target"]["processIdentities"][1][key] = "foreign-realm"
                    bus = Provider()
                    store = self.api.BindingStore(bus, self.api.RefRegistry("helper"), SESSION)
                    with self.assertRaises(self.api.BusError, msg="workspace-realm-denied") as failure:
                        store.discover(changed, 2000, lambda: False)
                    self.assertEqual(failure.exception.code, "wrong-scope")
                    self.assertEqual(bus.calls, [])
        finally:
            child.terminate()
            child.wait(timeout=3)

    def test_scope_tokens(self):
        binding = self.binding()
        self.assertEqual(self.refs.scope(binding), self.refs.scope({**binding, "scopeKind": "application"}),
                         "legacy-explicit-application-same-scope")
        context = self.context(binding)
        snapshot = self.api.read(context, {"budget": 1, "maxText": 0})
        ref, cursor = snapshot["items"][0]["ref"], snapshot["cursor"]
        self.assertEqual(context.registry.resolve(ref, context)["name"], "Window")
        flipped = {**binding, "scopeKind": "workspace"}
        other = self.api.RequestContext(context.bus, context.registry, flipped, 2000)
        with self.assertRaises(self.api.BusError, msg="scope-ref-kind-bound") as failure:
            context.registry.resolve(ref, other)
        self.assertEqual(failure.exception.code, "wrong-scope")
        with self.assertRaises(self.api.BusError, msg="scope-cursor-kind-bound") as failure:
            context.registry.resume(flipped, cursor)
        self.assertEqual(failure.exception.code, "cursor-stale")
        self.assertEqual(context.registry.resolve(ref, context)["name"], "Window")
        self.assertTrue(context.registry.resume(binding, cursor)["stack"])

    def test_snapshot_scope_label(self):
        for kind, expected in ((None, "application"), ("application", "application"), ("workspace", "workspace")):
            with self.subTest(kind=kind):
                snapshot = self.api.read(self.context(self.binding(kind)), {"budget": 4, "maxText": 0})
                self.assertEqual([item["name"] for item in snapshot["items"]], ["Window", "Child"])
                self.assertEqual(snapshot.get("scopeKind"), expected, "snapshot-scope-explicit")

    def test_hello_scope_capability(self):
        # Exercise real Helper.run/send/write and /proc identity in a child. No
        # semantic request is sent, so only the lifecycle close boundary is needed.
        code = """import sys
from types import SimpleNamespace
sys.path.insert(0, sys.argv[1])
module = {'__name__': 'scope_hello'}
exec(compile(sys.stdin.read(), sys.argv[1] + '/main.py', 'exec'), module)
module['Helper'](SimpleNamespace(close=lambda: None), 'workspace-scope-test').run()
"""
        child = subprocess.run([sys.executable, "-B", "-c", code, str(self.payload)], input=self.source.encode(),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        self.assertEqual(child.returncode, 0, child.stderr.decode(errors="replace")[:1024])
        hello = json.loads(child.stdout)
        self.assertEqual((hello["id"], hello["ok"]), ("hello", True))
        self.assertEqual(hello["value"].get("scopeKinds"), ["application", "workspace"], "hello-workspace-capability")
        self.assertEqual(set(hello["value"]["processIdentity"]),
                         {"pid", "startTicks", "bootID", "pidNamespace", "mountNamespace"})


MUTATIONS = (
    ("scope-kind", "refs", "test_scope_kind_validation", "scope-kind-denied",
     '    if not isinstance(kind, str) or kind not in SCOPE_KINDS:', '    if False:'),
    ("workspace-markers", "bindings", "test_workspace_markers", "workspace-markers-denied",
     '        if target["appID"] != "workspace" or target["launchEpoch"] != runtime["accessibilitySessionID"]:', '        if False:'),
    ("workspace-realm", "bindings", "test_workspace_uniform_realm", "workspace-realm-denied",
     '        if any(process[key] != processes[0][key] for process in processes',
     '        if any(False for process in processes'),
    ("scope-hash", "refs", "test_scope_tokens", "scope-ref-kind-bound",
     '"scopeKind": scope_kind(binding)', '"scopeKind": "application"'),
    ("snapshot-scope", "snapshot", "test_snapshot_scope_label", "snapshot-scope-explicit",
     '"scopeKind": scope_kind(binding)', '"scopeKind": "application"'),
    ("hello-scopes", "main", "test_hello_scope_capability", "hello-workspace-capability",
     '"scopeKinds": list(SCOPE_KINDS)', '"scopeKinds": ["application"]'),
)


def load_payload(payload, mutation=None):
    # Reload actual source modules; mutations exist only in memory. GI is real.
    for name in MODULES:
        sys.modules.pop(name, None)
    if str(payload) not in sys.path:
        sys.path.insert(0, str(payload))
    source = (payload / "main.py").read_text()
    if mutation is not None:
        path = payload / (mutation[1] + ".py")
        changed = path.read_text()
        if changed.count(mutation[4]) != 1:
            raise AssertionError("mutation anchor changed: " + mutation[0])
        changed = changed.replace(mutation[4], mutation[5])
        module = importlib.util.module_from_spec(importlib.util.spec_from_file_location(mutation[1], path))
        sys.modules[mutation[1]] = module
        exec(compile(changed, str(path), "exec"), module.__dict__)
        if mutation[1] == "main":
            source = changed
    WorkspaceTests.api = importlib.import_module("main")
    WorkspaceTests.bindings = importlib.import_module("bindings")
    WorkspaceTests.refs = importlib.import_module("refs")
    WorkspaceTests.source, WorkspaceTests.payload = source, payload


def main():
    cases = unittest.defaultTestLoader.getTestCaseNames(WorkspaceTests)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", "--workspace", dest="payload", type=Path)
    parser.add_argument("--case", choices=cases, action="append")
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--syntax-only", action="store_true")
    args = parser.parse_args()
    payload = args.payload
    if payload is None:
        payload = Path(__file__).resolve().parent.parent.parent / "resources/linux/app-dock-accessibility"
    if payload.is_file():
        payload = payload.parent
    payload = payload.resolve()
    for name in MODULES:
        path = payload / (name + ".py")
        if not path.is_file():
            parser.error("helper source missing; use --payload or --workspace")
        ast.parse(path.read_text(), filename=str(path))
    if args.self_check:
        for mutation in MUTATIONS:
            if args.case and mutation[2] not in args.case:
                continue
            path = payload / (mutation[1] + ".py")
            source = path.read_text()
            if source.count(mutation[4]) != 1:
                raise AssertionError("mutation anchor changed: " + mutation[0])
            ast.parse(source.replace(mutation[4], mutation[5]), filename=str(path))
    try:
        ast.parse("def syntax_control(:\n")
    except SyntaxError:
        pass
    else:
        raise AssertionError("AST syntax control did not reject invalid Python")
    print("AST syntax checked; malformed-source control rejected", flush=True)
    if args.syntax_only or sys.platform != "linux":
        print("NOTRUN: Linux/Gio workspace scope and mutation checks", flush=True)
        return 0 if args.syntax_only else 2
    try:
        import gi
        gi.require_version("Gio", "2.0")
        from gi.repository import Gio
    except (ImportError, ValueError):
        print("NOTRUN: real Gio unavailable", flush=True)
        return 2
    if not hasattr(Gio, "DBusConnection"):
        raise RuntimeError("Gio has no DBusConnection")
    load_payload(payload)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(WorkspaceTests(name) for name in args.case or cases))
    if not result.wasSuccessful():
        return 1
    if args.self_check:
        for mutation in MUTATIONS:
            if args.case and mutation[2] not in args.case:
                continue
            load_payload(payload, mutation)
            result = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([WorkspaceTests(mutation[2])]))
            if result.wasSuccessful() or result.errors or not any(mutation[3] in failure for _, failure in result.failures):
                raise AssertionError("mutation missed its named scope assertion: " + mutation[0])
            print("Mutation rejected: " + mutation[0], flush=True)
    return 0


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    raise SystemExit(main())

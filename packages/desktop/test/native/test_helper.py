#!/usr/bin/env python3
"""Helper composition regressions; real production methods, deterministic provider fixture.

Run on Linux with PyGObject, without a GUI or D-Bus session:
    python3 -B test/native/test_helper.py --payload resources/linux/app-dock-accessibility

--case selects one test; --self-check kills four bounded, temporary-module mutants.
A11Y_PAYLOAD also selects the payload. No GI stubs or alternate Helper/RefRegistry
implementations are used. This tests composition, not Gio transport conformance
(test_bus.py owns that). Saturation always runs in a separately reaped process.
"""

import argparse
from concurrent.futures import Future
import fcntl
import hashlib
import importlib
import json
import os
from pathlib import Path
from queue import Queue
import selectors
import subprocess
import sys
import tempfile
from threading import Event, Thread, current_thread
from time import monotonic
import unittest

SESSION = "helper-regression"
OWNER, REGISTRY = ":1.42", ":1.43"
A, ROOT = "org.a11y.atspi.", "/org/a11y/atspi/accessible/root"
WINDOW, BUTTON = "/fixture/window", "/fixture/window/button"

# Each control changes only the relevant production boundary. The expected named
# assertion must fail, rather than an import, fixture, syntax or unrelated test.
MUTATIONS = (
    ("H1", "bindings.py", "test_lifecycle_transition", "H1-survivor-event",
     "    def unbind(self, binding):\n        with self._lifecycle:",
     "    def unbind(self, binding):\n        with RLock():"),
    ("H2", "main.py", "test_replay_during_dispatch", "H2-single-original-terminal",
     '                    _request(request, self.epoch, self.sequence)\n                    request_id = request["id"]',
     '                    request_id = request["id"]\n                    _request(request, self.epoch, self.sequence)'),
    ("H3", "main.py", "test_output_saturation", "H3-finite-retirement",
     "        except Full:\n            self.stopped.set()\n            os._exit(1)",
     '        except Full:\n            raise BusError("busy", "Native stdout backlog exhausted")'),
    ("H4", "main.py", "test_pointer_and_focused_type_arguments", "P1-pointer-arguments",
     ' or args.get("kind") not in ("hover", "contextMenu"):', ':'),
)


def require(value, name):
    if not value:
        raise AssertionError(name)


def start(function, name):
    result = Future()

    def run():
        try:
            result.set_result(function())
        except BaseException as error:
            result.set_exception(error)

    thread = Thread(target=run, name=name, daemon=True)
    thread.start()
    return result, thread


def discovery(api, pid, tab):
    return {"phase": "discover", "identity": {"senderID": 1, "tabID": tab, "generation": 1, "profileID": "test"},
            "target": {"runtime": {"runtimeID": "test", "runtimeEpoch": "epoch", "accessibilitySessionID": SESSION},
                       "appID": "fixture", "launchEpoch": "launch", "ownershipRevision": 1,
                       "processIdentities": [api.process_identity(pid)]}}


def confirmation(proposal):
    return {"phase": "confirm", "proposalID": proposal["proposalID"], "ownershipRevision": 1,
            "roots": [{"owner": root["owner"], "path": root["path"]} for root in proposal["roots"]]}


class Provider:
    """Small wire fixture; ownership still uses real Linux process identity."""

    def __init__(self, api, hold=False):
        self.api, self.hold, self.connection = api, hold, object()
        self.closed, self.release, self.dispatched, self.named = Event(), Event(), Event(), Event()
        self.subscriptions, self.mutations = [], 0
        self.cancel_after_subscribe = None

    def call(self, owner, path, interface, method, signature, parameters, reply, timeout_ms):
        require(timeout_ms > 0, "fixture-finite-call")
        if method == "GetNameOwner":
            require(parameters == ("org.a11y.atspi.Registry",), "fixture-registry-owner")
            return (REGISTRY,)
        if method == "GetConnectionUnixProcessID":
            require(parameters == (OWNER,), "fixture-owned-exporter")
            return (os.getpid(),)
        require(owner in (OWNER, REGISTRY) and path in (ROOT, WINDOW, BUTTON), "fixture-address")
        if method == "GetRole":
            return ({ROOT: 75, WINDOW: 23, BUTTON: 43}[path],)
        if method == "GetState":
            return ([sum(1 << state for state in (8, 24, 25)), 0],)
        if method == "GetInterfaces":
            return ([A + "Accessible", *([A + "Action"] if path == BUTTON else [])],)
        if method == "GetChildAtIndex":
            require(parameters == (0,), "fixture-index")
            return ((OWNER, ROOT if owner == REGISTRY else WINDOW if path == ROOT else BUTTON),)
        if method == "Get":
            name = parameters[1]
            if name == "Name":
                self.named.set()
                return ({ROOT: "Fixture", WINDOW: "Fixture window", BUTTON: "Fixture button"}[path],)
            if name == "Parent":
                return ((OWNER, ROOT if path == WINDOW else WINDOW if path == BUTTON else "/org/a11y/atspi/null"),)
            if name == "ChildCount":
                return (0 if path == BUTTON else 1,)
            if name == "NActions":
                require(path == BUTTON, "fixture-action-target")
                return (1,)
            if name == "ToolkitName":
                # A "click" on GTK goes out as a pointer click (actions._click); this fixture is not GTK.
                require(path == ROOT, "fixture-toolkit-root")
                return ("fixture",)
        if method == "GetName":
            require(path == BUTTON and parameters == (0,), "fixture-action-name")
            return ("click",)
        if method == "DoAction":
            require(path == BUTTON and parameters == (0,), "fixture-mutation-target")
            self.mutations += 1
            self.dispatched.set()
            if self.hold:
                os.write(sys.stderr.fileno(), b"dispatched\n")
                require(self.release.wait(4), "fixture-held-dispatch-deadline")
                if self.closed.is_set():
                    raise self.api.BusError("cancelled", "Fixture closed after mutation dispatch")
            return (True,)
        raise AssertionError("fixture-unexpected-call: " + interface + "." + method)

    def subscribe_lifecycle(self, owner, callback):
        status = {"owner": owner, "callback": callback}
        self.subscriptions.append(status)
        # Simulate an event on the separate Gio callback thread while confirmation
        # awaits subscription completion. Taking the lifecycle lock here deadlocks.
        result, thread = start(lambda: callback("cache-remove", owner, BUTTON), "fixture-event")
        result.result(2)
        thread.join(1)
        if self.cancel_after_subscribe is not None:
            self.cancel_after_subscribe.set()
        return status

    def unsubscribe_lifecycle(self, status):
        self.subscriptions.remove(status)

    def remove(self):
        for status in tuple(self.subscriptions):
            result, thread = start(lambda: status["callback"]("cache-remove", status["owner"], BUTTON), "fixture-event")
            result.result(2)
            thread.join(1)

    def close(self):
        self.closed.set()
        self.release.set()


class RetirementMap(dict):
    """Pause the real subscription-map iteration, after unbind computed live owners."""

    def __init__(self, values):
        super().__init__(values)
        self.entered, self.release = Event(), Event()

    def __iter__(self):
        if current_thread().name == "retire-old":
            self.entered.set()
            require(self.release.wait(3), "fixture-retirement-barrier")
        return super().__iter__()


class ObservedLock:
    """Observe actual RLock contention without relying on a scheduling sleep."""

    def __init__(self, lock):
        self.lock, self.attempt = lock, Future()

    def __enter__(self):
        if current_thread().name == "confirm-new" and not self.attempt.done():
            acquired = self.lock.acquire(blocking=False)
            self.attempt.set_result(acquired)
            if acquired:
                return self
        self.lock.acquire()
        return self

    def __exit__(self, *_):
        self.lock.release()


class SaturationQueue(Queue):
    """Observe real bounded puts; release the provider only when the queue is full."""

    def __init__(self, provider):
        super().__init__(provider.api.LIMITS["pending"])
        self.provider = provider

    def put(self, item, block=True, timeout=None):
        super().put(item, block, timeout)
        if self.provider.dispatched.is_set():
            size = self.qsize()
            os.write(sys.stderr.fileno(), f"queued {size}\n".encode())
            if size == self.maxsize:
                self.provider.release.set()


class Lines:
    def __init__(self, stream):
        self.stream, self.buffer = stream, b""

    def line(self):
        deadline = monotonic() + 4
        with selectors.DefaultSelector() as selector:
            selector.register(self.stream, selectors.EVENT_READ)
            while b"\n" not in self.buffer:
                require(selector.select(max(0, deadline - monotonic())), "fixture-child-line-deadline")
                chunk = os.read(self.stream.fileno(), 65536)
                require(chunk, "fixture-child-line-eof")
                self.buffer += chunk
                require(len(self.buffer) <= 524288, "fixture-child-output-cap")
        line, _, self.buffer = self.buffer.partition(b"\n")
        return line


class Channel:
    def __init__(self, api, config, mode="normal"):
        self.api, self.sequence = api, 0
        command = [sys.executable, "-B", str(Path(__file__).resolve()), "--payload", str(config.payload), "--child", mode]
        if config.overlay:
            command += ["--overlay", str(config.overlay)]
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        self.output, self.events = Lines(self.process.stdout), Lines(self.process.stderr)

    def __enter__(self):
        try:
            hello = json.loads(self.output.line())
            require(hello["id"] == "hello" and hello["ok"], "fixture-real-helper-hello")
            self.epoch = hello["value"]["helperEpoch"]
            return self
        except BaseException:
            self.__exit__()
            raise

    def __exit__(self, *_):
        if self.process.poll() is None:
            self.process.kill()
        self.process.communicate(timeout=3)

    def write(self, request):
        data = json.dumps(request).encode() + b"\n"
        require(self.process.stdin.write(data) == len(data), "fixture-complete-request-write")

    def send(self, op, args, binding=None):
        self.sequence += 1
        request = {"v": 1, "id": f"{self.epoch}:{self.sequence}", "sequence": self.sequence,
                   "helperEpoch": self.epoch, "op": op, "timeoutMs": 4000, "args": args}
        if binding is not None:
            request.update(bindingID=binding["bindingID"], bindingEpoch=binding["bindingEpoch"])
        self.write(request)
        return request

    def call(self, op, args, binding=None):
        request = self.send(op, args, binding)
        reply = json.loads(self.output.line())
        require(reply["id"] == request["id"] and reply["ok"], "fixture-valid-operation: " + str(reply))
        return reply["value"]

    def bind(self):
        proposal = self.call("bind", discovery(self.api, self.process.pid, "peer"))
        return self.call("bind", confirmation(proposal))

    def finish(self):
        output, errors = self.process.communicate(timeout=4)
        data = self.output.buffer + output
        require(len(data) <= 524288 and len(errors) <= 32768, "fixture-finite-terminal-output")
        require(not data or data.endswith(b"\n"), "fixture-terminal-delimiter")
        return [json.loads(line) for line in data.splitlines()]


class HelperTests(unittest.TestCase):
    def setUp(self):
        self.provider = Provider(self.api)
        self.helper = self.api.Helper(self.provider, SESSION)
        self.addCleanup(self.provider.close)

    def proposal(self, tab):
        return self.helper.store.discover(discovery(self.api, os.getpid(), tab), 4000, lambda: False)

    def test_lifecycle_transition(self):
        store = self.helper.store
        old = store.confirm(confirmation(self.proposal("old")), 4000, lambda: False)
        old = store.get(old["bindingID"], old["bindingEpoch"])
        candidate = confirmation(self.proposal("new"))
        subscriptions = RetirementMap(store.subscriptions)
        lock = ObservedLock(store._lifecycle)
        store.subscriptions, store._lifecycle = subscriptions, lock
        retired, retiring = start(lambda: store.unbind(old), "retire-old")
        try:
            require(subscriptions.entered.wait(2), "fixture-retirement-entered")
            confirmed, confirming = start(lambda: store.confirm(candidate, 4000, lambda: False), "confirm-new")
            # With the broken transition, publish C before allowing B's stale
            # owner sweep. With the fence, C must wait until B's sweep finishes.
            if lock.attempt.result(2):
                confirmed.result(2)
        finally:
            subscriptions.release.set()
        retired.result(2)
        current = confirmed.result(2)
        retiring.join(1)
        confirming.join(1)
        current = store.get(current["bindingID"], current["bindingEpoch"])
        context = self.api.RequestContext(self.provider, self.helper.registry, current, 4000)
        observation = self.api.read(context, {"budget": 4, "maxText": 0})
        require(any(item["actions"] for item in observation["items"]), "H1-live-read-control")
        self.helper.registry.check(current, observation["observation"])
        self.provider.remove()
        try:
            self.helper.registry.check(current, observation["observation"])
        except self.api.BusError as error:
            require(error.code == "stale-ref", "H1-invalidation-code")
        else:
            self.fail("H1-survivor-event")
        store.unbind(current)
        require(not self.provider.subscriptions and not store.bindings, "H1-retired-subscriptions")
        with self.assertRaises(self.api.BusError):
            self.helper.registry.begin(current)

    def test_confirmation_cancelled_while_waiting(self):
        candidate = confirmation(self.proposal("wait"))
        cancelled = Event()
        self.provider.named.clear()
        with self.helper.store._lifecycle:
            confirmed, thread = start(lambda: self.helper.store.confirm(candidate, 4000, cancelled.is_set), "waiting-confirm")
            require(self.provider.named.wait(2), "H1-validation-outside-lock")
            cancelled.set()
        with self.assertRaises(self.api.BusError) as caught:
            confirmed.result(3)
        thread.join(1)
        require(caught.exception.code == "cancelled", "H1-cancel-after-lock")
        require(not self.helper.store.bindings and not self.provider.subscriptions, "H1-no-cancelled-publication")

    def test_confirmation_subscription_rollback(self):
        cancelled = Event()
        candidate = confirmation(self.proposal("rollback"))
        self.provider.cancel_after_subscribe = cancelled
        confirmed, thread = start(lambda: self.helper.store.confirm(candidate, 4000, cancelled.is_set), "rollback-confirm")
        with self.assertRaises(self.api.BusError) as caught:
            confirmed.result(3)
        thread.join(1)
        require(caught.exception.code == "cancelled", "H1-cancel-after-subscribe")
        require(not self.helper.store.bindings and not self.helper.registry._bindings
                and not self.provider.subscriptions, "H1-reentrant-rollback")
        self.provider.cancel_after_subscribe = None
        current = self.helper.store.confirm(confirmation(self.proposal("valid")), 4000, lambda: False)
        require(self.helper.store.get(current["bindingID"], current["bindingEpoch"]), "H1-bind-after-rollback")

    def test_replay_during_dispatch(self):
        with Channel(self.api, self.config, "replay") as channel:
            binding = channel.bind()
            snapshot = channel.call("read", {"budget": 4, "maxText": 0}, binding)
            button = next(item for item in snapshot["items"] if item["actions"])
            request = channel.send("action", {"ref": button["ref"], "actionID": button["actions"][0]["id"]}, binding)
            require(channel.events.line() == b"dispatched", "H2-real-dispatch-control")
            channel.write(request)
            replies = channel.finish()
            originals = [reply for reply in replies if reply["id"] == request["id"]]
            require(len(originals) == 1, "H2-single-original-terminal")
            require(not originals[0]["ok"] and originals[0]["error"]["outcome"] == "unknown", "H2-dispatched-uncertainty")
            invalid = [reply for reply in replies if reply["id"] == "invalid"]
            require(len(invalid) == 1 and invalid[0]["error"]["code"] == "protocol-error", "H2-reserved-diagnostic")
            require(len(replies) == 2 and channel.process.returncode == 0, "H2-stream-retired")

    def test_fresh_scope_and_arguments_keep_correlation(self):
        with Channel(self.api, self.config) as channel:
            request = channel.send("read", {})
            reply = json.loads(channel.output.line())
            require(reply["id"] == request["id"] and reply["error"]["code"] == "wrong-scope", "H2-fresh-scope-correlation")
            binding = channel.bind()
            request = channel.send("action", {"ref": "invalid-ref"}, binding)
            replies = channel.finish()
            require(len(replies) == 1 and replies[0]["id"] == request["id"]
                    and replies[0]["error"]["code"] == "protocol-error", "H2-fresh-arguments-correlation")

    def test_key_operation_requires_binding_and_exact_arguments(self):
        with Channel(self.api, self.config) as channel:
            request = channel.send("key", {"ref": "n:x", "keys": "Escape"})
            reply = json.loads(channel.output.line())
            require(reply["id"] == request["id"] and reply["error"]["code"] == "wrong-scope", "K1-key-needs-binding")
        # A malformed envelope ends the helper, so each case gets its own channel.
        for args in ({"ref": "n:x"}, {"ref": "n:x", "keys": 1}, {"ref": "n:x", "keys": "Escape", "mode": "observed"},
                     {"ref": "invalid-ref", "keys": "Escape"}):
            with Channel(self.api, self.config) as channel:
                request = channel.send("key", args, channel.bind())
                replies = channel.finish()
                require(len(replies) == 1 and replies[0]["id"] == request["id"]
                        and replies[0]["error"]["code"] == "protocol-error", "K1-key-arguments")

    def test_pointer_and_focused_type_arguments(self):
        # Each malformed envelope ends the helper, so each case gets its own channel.
        for op, args, name in (("pointer", {"ref": "n:x"}, "P1-pointer-arguments"),
                               ("pointer", {"ref": "n:x", "kind": "doubleClick"}, "P1-pointer-arguments"),
                               ("pointer", {"ref": "n:x", "kind": "hover", "x": 1}, "P1-pointer-arguments"),
                               ("pointer", {"ref": "invalid-ref", "kind": "hover"}, "P1-pointer-arguments"),
                               ("type", {"ref": "n:x", "text": "a", "mode": "editable", "focused": True}, "T1-focused-keyboard-only"),
                               ("type", {"ref": "n:x", "text": "a", "mode": "keyboard", "focused": 1}, "T1-focused-keyboard-only")):
            with Channel(self.api, self.config) as channel:
                request = channel.send(op, args, channel.bind())
                replies = channel.finish()
                require(len(replies) == 1 and replies[0]["id"] == request["id"]
                        and replies[0]["error"]["code"] == "protocol-error", name)
        with Channel(self.api, self.config) as channel:
            request = channel.send("pointer", {"ref": "n:x", "kind": "hover"})
            reply = json.loads(channel.output.line())
            require(reply["id"] == request["id"] and reply["error"]["code"] == "wrong-scope", "P1-pointer-needs-binding")

    def test_draining_output_successive_operations(self):
        with Channel(self.api, self.config) as channel:
            binding = channel.bind()
            first = channel.call("read", {"budget": 4, "maxText": 0}, binding)
            second = channel.call("read", {"budget": 4, "maxText": 0}, binding)
            require(first["observation"] != second["observation"], "H3-successive-observations")
            button = next(item for item in second["items"] if item["actions"])
            result = channel.call("action", {"ref": button["ref"], "actionID": button["actions"][0]["id"]}, binding)
            require(result["dispatch"] == "acknowledged", "H3-drained-mutation-control")
            require(channel.call("read", {"budget": 4, "maxText": 0}, binding)["items"], "H3-worker-still-live")
            channel.call("shutdown", {})
            require(not channel.finish() and channel.process.returncode == 0, "H3-drained-clean-exit")

    def test_output_saturation(self):
        with Channel(self.api, self.config, "saturation") as channel:
            binding = channel.bind()
            snapshot = channel.call("read", {"budget": 4, "maxText": 0}, binding)
            button = next(item for item in snapshot["items"] if item["actions"])
            # A small real pipe makes backpressure deterministic without changing
            # helper budgets or replacing its stdout writer.
            require(fcntl.fcntl(channel.process.stdout.fileno(), fcntl.F_SETPIPE_SZ, 4096) == 4096, "fixture-small-pipe")
            channel.send("action", {"ref": button["ref"], "actionID": button["actions"][0]["id"]}, binding)
            require(channel.events.line() == b"dispatched", "H3-real-dispatch-control")
            for _ in range(128):
                channel.send("cancel", {"requestID": "not-active"})
                status = channel.events.line().decode().split()
                require(len(status) == 2 and status[0] == "queued", "fixture-real-queue-event")
                if int(status[1]) == self.api.LIMITS["pending"]:
                    break
            else:
                self.fail("fixture-output-not-saturated")
            # The main reader has no more input. Only the held semantic worker
            # now attempts the overflowing put; recoverable busy would strand it.
            try:
                code = channel.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.fail("H3-finite-retirement")
            require(code == 1, "H3-nonzero-retirement")


def child(api, mode):
    provider = Provider(api, hold=mode != "normal")
    helper = api.Helper(provider, SESSION)
    if mode == "saturation":
        helper.output = SaturationQueue(provider)
    helper.run()
    require(provider.mutations <= 1, "fixture-no-mutation-replay")
    return 0


def self_check(args):
    before = {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest() for name in ("main.py", "bindings.py")}
    controls = [control for control in MUTATIONS if not args.case or control[2] == args.case]
    require(controls, "mutation-case-has-no-control")
    for label, filename, case, failure, anchor, replacement in controls:
        source = (args.payload / filename).read_text()
        require(source.count(anchor) == 1, "mutation-anchor: " + label)
        with tempfile.TemporaryDirectory(prefix="a11y-helper-mutation-") as directory:
            (Path(directory) / filename).write_text(source.replace(anchor, replacement))
            result = subprocess.run([sys.executable, "-B", str(Path(__file__).resolve()), "--payload", str(args.payload),
                                     "--overlay", directory, "--case", case], capture_output=True, text=True, timeout=15)
        output = result.stdout + result.stderr
        require(len(output) <= 32768, "mutation-output-cap: " + label)
        print(output, end="", flush=True)
        require(result.returncode == 1 and "FAIL: " + case in output and failure in output,
                "mutation-named-failure: " + label)
        print("MUTATION REJECTED: " + label, flush=True)
    require(before == {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest() for name in before},
            "mutation-production-drift")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, default=os.environ.get("A11Y_PAYLOAD"))
    parser.add_argument("--case", choices=unittest.defaultTestLoader.getTestCaseNames(HelperTests))
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--overlay", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--child", choices=("normal", "replay", "saturation"), help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.payload is None:
        parents = Path(__file__).resolve().parents
        payload = parents[2] / "resources/linux/app-dock-accessibility" if len(parents) > 2 else None
        require(payload is not None and all((payload / name).is_file() for name in ("main.py", "bindings.py")),
                "helper-payload-layout-missing: pass --payload or set A11Y_PAYLOAD")
        args.payload = payload
    args.payload = args.payload.resolve()
    require(sys.platform == "linux", "helper-tests-require-linux-proc-and-pygobject")
    sys.path[:0] = ([str(args.overlay)] if args.overlay else []) + [str(args.payload)]
    api = importlib.import_module("main")  # Real GI import is mandatory; never skip or stub it.
    if args.child:
        return child(api, args.child)
    HelperTests.api, HelperTests.config = api, args
    suite = unittest.TestSuite([HelperTests(args.case)]) if args.case else unittest.defaultTestLoader.loadTestsFromTestCase(HelperTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if args.self_check and result.wasSuccessful():
        self_check(args)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())

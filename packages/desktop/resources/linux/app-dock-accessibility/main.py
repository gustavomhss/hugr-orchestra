#!/usr/bin/env python3
"""One session helper; stdout is bounded protocol JSONL, never diagnostics."""

import argparse
import fcntl
import json
import os
from pathlib import Path
from queue import Empty, Full, Queue
from secrets import token_hex
import signal
import sys
from threading import Event, Lock, Thread
from time import monotonic

from actions import invoke, pointer, press, replace_text
from bindings import BindingStore, word
from bus import AtspiBus, BusError
from context import LIMITS, RequestContext, process_identity
from refs import RefRegistry, SCOPE_KINDS
from snapshot import read

OPERATIONS = ("bind", "read", "action", "type", "key", "pointer", "unbind", "cancel", "shutdown")


class Helper:
    def __init__(self, bus, session_id):
        self.bus, self.session_id = bus, session_id
        self.epoch, self.sequence = token_hex(16), 0
        self.registry = RefRegistry(self.epoch)
        self.store = BindingStore(bus, self.registry, session_id)
        self.lock, self.stopped = Lock(), Event()
        self.jobs, self.output, self.active = Queue(1), Queue(LIMITS["pending"]), None
        self.writer = Thread(target=self.write, name="native-jsonl", daemon=True)
        self.worker = Thread(target=self.work, name="native-operation", daemon=True)

    def send(self, request_id, value=None, error=None):
        reply = {"v": 1, "id": request_id, "ok": error is None}
        reply["error" if error else "value"] = error if error else value
        data = json.dumps(reply, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode() + b"\n"
        if len(data) > LIMITS["frameBytes"]:
            data = json.dumps({"v": 1, "id": request_id, "ok": False, "error": {
                "code": "reply-byte-limit", "message": "Native response exceeded frame limit", "outcome": "unknown"}}, separators=(",", ":")).encode() + b"\n"
        try:
            self.output.put(data, timeout=0.1)
        except Full:
            self.stopped.set()
            os._exit(1)

    def write(self):
        try:
            while True:
                data = self.output.get()
                if data is None:
                    return
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()
        except (OSError, BrokenPipeError):
            self.stopped.set()
            os._exit(1)

    def work(self):
        while not self.stopped.is_set():
            try:
                job = self.jobs.get(timeout=0.1)
            except Empty:
                continue
            request, cancelled, deadline = job
            context = None
            terminal = None
            try:
                if cancelled.is_set():
                    raise BusError("cancelled", "Native request cancelled before execution")
                timeout_ms = int((deadline - monotonic()) * 1000)
                if timeout_ms < 1:
                    raise BusError("timeout", "Native request expired before execution")
                if request["op"] == "bind":
                    method = self.store.discover if request["args"]["phase"] == "discover" else self.store.confirm
                    value = method(request["args"], timeout_ms, cancelled.is_set)
                else:
                    binding = self.store.get(request["bindingID"], request["bindingEpoch"])
                    context = RequestContext(self.bus, self.registry, binding, timeout_ms,
                                             lambda: cancelled.is_set() or binding["bindingID"] not in self.store.bindings,
                                             self.store.cache)
                    args = request["args"]
                    value = read(context, args) if request["op"] == "read" else (
                        invoke(context, args["ref"], args.get("actionID"), args.get("mode", "stable")) if request["op"] == "action" else
                        press(context, args["ref"], args["keys"]) if request["op"] == "key" else
                        pointer(context, args["ref"], args["kind"]) if request["op"] == "pointer" else
                        replace_text(context, args["ref"], args["text"], args.get("mode", "editable"), args.get("focused", False)))
                terminal = {"value": value}
            except BusError as error:
                terminal = {"error": {"code": error.code, "message": error.message,
                          "outcome": "unknown" if context and context.dispatch_started else "not-dispatched",
                          **({"result": error.result} if hasattr(error, "result") else {})}}
            except Exception:
                terminal = {"error": {"code": "protocol-error", "message": "Native operation failed validation",
                          "outcome": "unknown" if context and context.dispatch_started else "not-dispatched"}}
            finally:
                with self.lock:
                    if self.active is job:
                        self.active = None
            # Release only after native execution finishes, but before publishing
            # its terminal. The client can immediately send its next operation.
            if terminal is not None:
                self.send(request["id"], **terminal)

    def accept(self, request):
        """Admit an envelope already validated and sequenced by run."""
        _scope(request)
        op, args = request["op"], request["args"]
        _arguments(op, args)
        if op == "cancel":
            with self.lock:
                accepted = self.active is not None and self.active[0]["id"] == args["requestID"]
                if accepted:
                    self.active[1].set()
            self.send(request["id"], {"cancelled": accepted, "outcome": "unknown" if accepted else "not-dispatched"})
            return
        if op == "unbind":
            binding = self.store.get(request["bindingID"], request["bindingEpoch"])
            with self.lock:
                if self.active and self.active[0].get("bindingID") == binding["bindingID"]:
                    self.active[1].set()
            self.store.unbind(binding)
            self.send(request["id"], {"unbound": True})
            return
        if op == "shutdown":
            self.send(request["id"], {"shutdown": True})
            self.stopped.set()
            return
        if op != "bind":
            self.store.get(request["bindingID"], request["bindingEpoch"])
        with self.lock:
            if self.active:
                raise BusError("busy", "A native semantic operation is already active")
            job = (request, Event(), monotonic() + request["timeoutMs"] / 1000)
            self.active = job
            self.jobs.put_nowait(job)

    def run(self):
        self.writer.start()
        self.worker.start()
        self.send("hello", {"backend": "linux-atspi", "helperEpoch": self.epoch, "sessionID": self.session_id,
                            "limits": LIMITS, "operations": OPERATIONS, "scopeKinds": list(SCOPE_KINDS),
                            "processIdentity": process_identity(os.getpid())})
        try:
            while not self.stopped.is_set():
                data = sys.stdin.buffer.readline(LIMITS["frameBytes"] + 1)
                if not data:
                    break
                if len(data) > LIMITS["frameBytes"] or not data.endswith(b"\n"):
                    self.send("invalid", error={"code": "protocol-error", "message": "Native frame size or delimiter invalid", "outcome": "not-dispatched"})
                    break
                request_id = "invalid"
                try:
                    request = json.loads(data.decode("utf-8"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON")))
                    # Only a fresh, validated envelope may own a request correlation.
                    _request(request, self.epoch, self.sequence)
                    request_id = request["id"]
                    self.sequence = request["sequence"]
                    self.accept(request)
                except (UnicodeError, ValueError, TypeError, KeyError, RecursionError, BusError) as error:
                    self.send(request_id, error={"code": getattr(error, "code", "protocol-error"),
                              "message": str(error)[:1024], "outcome": "not-dispatched"})
                    if getattr(error, "code", "protocol-error") == "protocol-error":
                        break
        finally:
            self.stopped.set()
            with self.lock:
                if self.active:
                    self.active[1].set()
            self.bus.close()
            self.worker.join(2)
            self.output.put(None, timeout=0.2)
            self.writer.join(1)
            if self.worker.is_alive() or self.writer.is_alive():
                os._exit(1)


def _request(request, epoch, sequence):
    if (not isinstance(request, dict) or set(request) - {"v", "id", "sequence", "helperEpoch", "op", "timeoutMs", "bindingID", "bindingEpoch", "args"}
            or type(request.get("v")) is not int or request["v"] != 1 or request.get("helperEpoch") != epoch
            or type(request.get("sequence")) is not int or not sequence < request["sequence"] < 2**53
            or request.get("id") != f"{epoch}:{request['sequence']}" or request.get("op") not in OPERATIONS
            or type(request.get("timeoutMs")) is not int or not 1 <= request["timeoutMs"] <= LIMITS["timeoutMs"]
            or not isinstance(request.get("args"), dict)):
        raise BusError("protocol-error", "Invalid or replayed native request envelope")


def _scope(request):
    if request["op"] in ("read", "action", "type", "key", "pointer", "unbind"):
        if not word(request.get("bindingID")) or not word(request.get("bindingEpoch")):
            raise BusError("wrong-scope", "Native binding identity is required")
        return
    if "bindingID" in request or "bindingEpoch" in request:
        raise BusError("wrong-scope", "Control/discovery cannot carry a native binding")


def _arguments(op, args):
    if op == "bind":
        if args.get("phase") not in ("discover", "confirm"):
            raise BusError("protocol-error", "Invalid native bind phase")
        return
    if op == "read":
        return  # snapshot._query validates the bounded discriminated read arguments.
    if op == "key":
        if set(args) != {"ref", "keys"} or not word(args.get("ref")) or not args["ref"].startswith("n:") or not isinstance(args.get("keys"), str):
            raise BusError("protocol-error", "Key combination requires an opaque ref and keys")
        return
    if op == "pointer":
        if set(args) != {"ref", "kind"} or not word(args.get("ref")) or not args["ref"].startswith("n:") or args.get("kind") not in ("hover", "contextMenu"):
            raise BusError("protocol-error", "Pointer requires an opaque ref and kind hover or contextMenu")
        return
    if op in ("action", "type"):
        allowed = {"ref", "actionID", "mode"} if op == "action" else {"ref", "text", "mode", "focused"}
        if set(args) - allowed or not word(args.get("ref")) or not args["ref"].startswith("n:"):
            raise BusError("protocol-error", "Native mutation requires an opaque ref")
        if op == "action" and "actionID" in args and not word(args["actionID"]):
            raise BusError("protocol-error", "Invalid native action ID")
        if op == "action" and args.get("mode", "stable") not in ("stable", "observed"):
            raise BusError("protocol-error", "Invalid native action identity mode")
        if op == "type" and (not isinstance(args.get("text"), str) or args.get("mode", "editable") not in ("editable", "keyboard")
                             or args.get("focused", False) is not False and (args["focused"] is not True or args.get("mode") != "keyboard")):
            raise BusError("protocol-error", "Invalid native text replacement")
        return
    if op == "cancel" and (set(args) != {"requestID"} or not word(args.get("requestID"))):
        raise BusError("protocol-error", "Cancel requires the original request ID")
    if op in ("unbind", "shutdown") and args:
        raise BusError("protocol-error", "Native control requires empty arguments")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session-id", default=os.environ.get("ORCHESTRA_A11Y_SESSION_ID"))
    args = parser.parse_args()
    if not word(args.session_id) or not os.environ.get("DBUS_SESSION_BUS_ADDRESS") or not os.environ.get("XDG_RUNTIME_DIR"):
        raise BusError("not-ready", "Runtime session identity/environment is required")
    with (Path(os.environ["XDG_RUNTIME_DIR"]) / "orchestra-atspi-helper.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise BusError("busy", "An accessibility session already owns a helper") from error
        helper = Helper(AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000), args.session_id)
        def stop(*_):
            raise SystemExit(0)
        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        helper.run()


if __name__ == "__main__":
    try:
        main()
    except (BusError, OSError) as error:
        sys.stderr.write(f"{getattr(error, 'code', 'not-ready')}: {str(error)[:1024]}\n")
        sys.exit(1)

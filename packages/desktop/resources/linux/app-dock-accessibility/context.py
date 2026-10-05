"""Request-scoped budgets and fresh exporter/ancestry checks."""

import os
from pathlib import Path
from time import monotonic

from bus import BusError

A = "org.a11y.atspi."
ROOT = "/org/a11y/atspi/accessible/root"
DBUS = "org.freedesktop.DBus"

LIMITS = {"frameBytes": 262144, "bindings": 8, "refs": 512, "nodes": 512,
          "calls": 1600, "depth": 40, "text": 20000, "field": 256,
          "pending": 32, "timeoutMs": 10000, "cursors": 2, "proposals": 8,
          "actions": 8, "roots": 32, "processes": 128, "keyboardCalls": 800}


def process_identity(pid):
    if type(pid) is not int or pid < 1:
        raise BusError("ownership-unresolved", "Invalid process identity")
    try:
        with Path(f"/proc/{pid}/stat").open() as stream:
            stat = stream.read(8192)
        with Path("/proc/sys/kernel/random/boot_id").open() as stream:
            boot = stream.read(128).strip()
        return {"pid": pid, "startTicks": int(stat.rsplit(")", 1)[1].split()[19]), "bootID": boot,
                "pidNamespace": os.readlink(f"/proc/{pid}/ns/pid"),
                "mountNamespace": os.readlink(f"/proc/{pid}/ns/mnt")}
    except (OSError, ValueError, IndexError) as error:
        raise BusError("ownership-unresolved", "Owned process is unavailable") from error


def states(words):
    if not isinstance(words, (tuple, list)) or len(words) != 2 or any(type(w) is not int or not 0 <= w < 2**32 for w in words):
        raise BusError("protocol-error", "Invalid native state masks")
    return {state for state in range(64) if words[state // 32] & (1 << (state % 32))}


def text_length_matches(value, count):
    # Qt 5 exports UTF-16 positions; GTK exports Unicode scalar positions.
    # Validate the native full range without assuming Python's string indexing.
    return (isinstance(value, str) and type(count) is int and count >= 0
            and (len(value) == count or len(value.encode("utf-16-le")) // 2 == count))


def interface_name(value):
    if not isinstance(value, str) or not value.isascii() or not 1 <= len(value) <= 255:
        return False
    parts = value.split(".")
    return len(parts) >= 2 and all(part and (part[0].isalpha() or part[0] == "_")
                                 and all(char.isalnum() or char == "_" for char in part) for part in parts)


class RequestContext:
    def __init__(self, bus, registry, binding, timeout_ms, cancelled=None):
        self.bus, self.registry, self.binding = bus, registry, binding
        self.deadline = monotonic() + min(timeout_ms, LIMITS["timeoutMs"]) / 1000
        self.cancelled = cancelled or (lambda: False)
        self.calls, self.dispatch_started = 0, False
        self.connection = bus.connection
        self.text_units = {}

    def remaining(self):
        if self.cancelled():
            raise BusError("cancelled", "Native operation cancelled; no automatic retry")
        remaining = int((self.deadline - monotonic()) * 1000)
        if remaining < 1:
            raise BusError("timeout", "Native request deadline expired")
        return remaining

    def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
        remaining = self.remaining()
        if self.calls >= LIMITS["calls"]:
            raise BusError("read-budget", "Native call budget exhausted")
        self.calls += 1
        if method in ("DoAction", "SetTextContents", "GenerateKeyboardEvent", "GrabFocus"):
            self.dispatch_started = True
        return self.bus.call(owner, path, interface, method, signature, parameters, reply,
                             min(800, remaining, timeout_ms or remaining))

    def property(self, owner, path, interface, name):
        return self.call(owner, path, "org.freedesktop.DBus.Properties", "Get", "(ss)", (interface, name), "(v)")[0]

    def owner(self, name):
        return self.call(DBUS, "/org/freedesktop/DBus", DBUS, "GetNameOwner", "(s)", (name,), "(s)")[0]

    def cleanup_call(self, owner, path, interface, method, signature, parameters, reply, timeout_ms=None):
        # Releasing modifiers must still run after cancellation/deadline exhaustion.
        # Only KEY_UNLOCKMODIFIERS of shortcut modifier bits (Shift, Control, Mod1, Mod4) qualifies.
        mask = parameters[0] if isinstance(parameters, tuple) and parameters else None
        if (path, interface, method, signature, parameters[1:] if mask is not None else None, reply) != (
                "/org/a11y/atspi/registry/deviceeventcontroller", A + "DeviceEventController",
                "GenerateKeyboardEvent", "(isu)", ("", 6), "()") or type(mask) is not int or not mask or mask & ~(1 | 4 | 8 | 64):
            raise BusError("unsupported-operation", "Only modifier cleanup may bypass request cancellation")
        return self.bus.call(owner, path, interface, method, signature, parameters, reply, 500)

    def require_owned(self, handle):
        owner, path = handle["owner"], handle["path"]
        if not owner.startswith(":"):
            raise BusError("wrong-scope", "Native handle must use a unique exporter")
        pid = self.call(DBUS, "/org/freedesktop/DBus", DBUS, "GetConnectionUnixProcessID", "(s)", (owner,), "(u)")[0]
        identity = process_identity(pid)
        if not any(all(p.get(key) == value for key, value in identity.items()) for p in self.binding["processIdentities"]):
            raise BusError("wrong-scope", "Native exporter is outside the owned launch")
        current, seen = path, set()
        for depth in range(LIMITS["depth"]):
            self.remaining()
            if any(r["owner"] == owner and r["path"] == current for r in self.binding["roots"]):
                role = self.call(owner, current, A + "Accessible", "GetRole", reply="(u)")[0]
                if role not in (16, 23, 69):
                    raise BusError("wrong-scope", "Confirmed root is not a concrete dialog or window")
                if 6 in states(self.call(owner, current, A + "Accessible", "GetState", reply="(au)")[0]):
                    raise BusError("defunct", "Confirmed window root is defunct")
                return {"owner": owner, "path": current, "pid": pid, "startTicks": identity["startTicks"], "root": ROOT, "scopeDepth": depth}
            if current in seen:
                raise BusError("ownership-unresolved", "Native ancestry cycle")
            seen.add(current)
            parent = self.property(owner, current, A + "Accessible", "Parent")
            if parent[0] not in ("", owner) or parent[1] == "/org/a11y/atspi/null":
                break
            current = parent[1]
        raise BusError("wrong-scope", "Native object is outside confirmed window roots")

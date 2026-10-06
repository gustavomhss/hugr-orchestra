"""Explicit X11 keyboard mode. External focus races remain unfenced.

allowed_window may supply owner, path (native frame), root, pid, startTicks,
and focus (an owned, focused active descendant controlled by the text field).
BusError.result preserves bounded readback and uncertain-dispatch evidence.
The caller owns binding/ref epochs and must serialize its semantic operations.
"""

import os
from itertools import groupby
from pathlib import Path
from threading import Lock
from time import monotonic, sleep
from weakref import WeakValueDictionary

from bus import BusError
from context import LIMITS, text_length_matches

A = "org.a11y.atspi."
ROOT = "/org/a11y/atspi/accessible/root"
DBUS = ("org.freedesktop.DBus", "/org/freedesktop/DBus")
DEC = "/org/a11y/atspi/registry/deviceeventcontroller"
_locks, _guard = WeakValueDictionary(), Lock()
MAX_TEXT, MAX_CALLS = 1500, LIMITS["keyboardCalls"]
# X11 modifier masks and the keysyms a shortcut may name; single printable ASCII characters are their own keysym.
MODIFIERS = {"ctrl": 4, "control": 4, "shift": 1, "alt": 8, "super": 64}
KEYSYMS = {"return": 0xFF0D, "enter": 0xFF0D, "escape": 0xFF1B, "esc": 0xFF1B, "tab": 0xFF09, "backspace": 0xFF08,
           "delete": 0xFFFF, "insert": 0xFF63, "home": 0xFF50, "end": 0xFF57, "left": 0xFF51, "up": 0xFF52,
           "right": 0xFF53, "down": 0xFF54, "pageup": 0xFF55, "pagedown": 0xFF56, "space": 0x20, "plus": 0x2B,
           "comma": 0x2C, "period": 0x2E, "slash": 0x2F, "minus": 0x2D, "equal": 0x3D, "semicolon": 0x3B,
           "backslash": 0x5C, "grave": 0x60, "apostrophe": 0x27, "bracketleft": 0x5B, "bracketright": 0x5D,
           **{f"f{n}": 0xFFBE + n - 1 for n in range(1, 13)}}
# Registry mouse event names: absolute motion, then a button-3 click at the same point.
POINTER = {"hover": ("abs",), "contextMenu": ("abs", "b3c")}


def replace_text(bus, node, text, timeout_ms, allowed_window=None):
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 60000 or not isinstance(text, str):
        raise BusError("protocol-error", "Invalid keyboard text/deadline")
    if len(text) > MAX_TEXT or any(ord(c) < 32 or ord(c) == 127 or 0xD800 <= ord(c) <= 0xDFFF for c in text):
        raise BusError("unsupported-operation", "Keyboard mode requires bounded text without control characters")
    if not os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        raise BusError("unsupported-operation", "Keyboard mode requires an X11 accessibility session")
    if (not isinstance(node, dict) or not isinstance(node.get("owner"), str) or not node["owner"].startswith(":")
            or not isinstance(node.get("path"), str) or max(len(node["owner"]), len(node["path"])) > 256):
        raise BusError("ownership-unresolved", "A unique exporter and native path are required")
    if allowed_window is not None and not isinstance(allowed_window, dict):
        raise BusError("protocol-error", "Invalid allowed-window evidence")
    evidence = dict(allowed_window or {})
    deadline = monotonic() + timeout_ms / 1000
    result = {"method": "keyboard", "dispatch": "unknown", "postcondition": "unverified", "value": None,
              "focus": {"target": {"owner": node["owner"], "path": node["path"]}, "session": bus.connection.get_guid(), "requested": False,
                        "confirmed": False, "externalRaces": "unfenced"}, "controllerCalls": 0}
    counter = [0]

    def call(ref, interface, method, signature="()", parameters=(), reply="()"):
        remaining = int((deadline - monotonic()) * 1000)
        if remaining <= 0 or counter[0] >= MAX_CALLS:
            raise BusError("timeout", "Keyboard query/deadline budget exhausted")
        counter[0] += 1
        value = bus.call(*ref, interface, method, signature, parameters, reply, min(1000, remaining))
        return value[0] if reply != "()" else None

    with _guard:
        lock = _locks.get(result["focus"]["session"])
        if lock is None:
            lock = Lock()
            _locks[result["focus"]["session"]] = lock
    if not lock.acquire(timeout=max(0, deadline - monotonic())):
        raise BusError("busy", "Keyboard session is already executing")
    try:
        ref = node["owner"], node["path"]
        pid = call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
        if evidence.get("owner", ref[0]) != ref[0] or evidence.get("pid", pid) != pid:
            raise BusError("wrong-scope", "Exporter does not match allowed window evidence")
        if "startTicks" in evidence:
            try:
                if int(Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]) != evidence["startTicks"]:
                    raise BusError("wrong-scope", "Exporter process identity changed")
            except OSError as error:
                raise BusError("ownership-unresolved", error) from error
        trail, window = _ancestry(call, ref)
        if not window or evidence.get("path", window) != window or evidence.get("root", ROOT) not in trail:
            raise BusError("wrong-scope", "Target ancestry does not confirm allowed root/window")
        result["focus"].update(window=window, root=evidence.get("root", ROOT), exporterPID=pid)
        _editable(call, ref, evidence)
        if 1 not in _states(call, (ref[0], window)):
            raise BusError("focus-unconfirmed", "Owned window is not active")
        result["before"] = _value(call, ref)
        if result["before"] != text:
            if evidence.get("focus"):
                _confirm(call, ref, window, evidence)
            result["focus"]["requested"] = True
            if not call(ref, A + "Component", "GrabFocus", reply="(b)"):
                raise BusError("focus-unconfirmed", "Provider rejected target focus")
        _confirm(call, ref, window, evidence)
        result["focus"]["confirmed"] = True
        if result["before"] == text:
            result["value"] = _value(call, ref)
            if result["value"] != text:
                raise BusError("postcondition-mismatch", "Native Text changed during no-op confirmation")
            result.update(dispatch="acknowledged", postcondition="verified", noOp=True)
            return result
        registry = call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)")
        controller = registry, DEC

        def generate(code, value, kind):
            _confirm(call, ref, window, evidence)
            result["controllerCalls"] += 1
            call(controller, A + "DeviceEventController", "GenerateKeyboardEvent", "(isu)", (code, value, kind))

        try:
            generate(4, "", 5)  # X11 ControlMask; KEY_LOCKMODIFIERS.
            generate(ord("a"), "", 3)  # KEY_SYM, select all.
        finally:
            _release(bus, controller, result)

        def verify(expected):
            for _ in range(12):
                _editable(call, ref, evidence)
                try:
                    result["value"] = _value(call, ref)
                except BusError as error:
                    if not getattr(error, "changing_count", False):
                        raise
                    # Read-only polling after dispatch; never resend the segment.
                    result["readbackChanges"] = result.get("readbackChanges", 0) + 1
                    sleep(min(0.05, max(0, deadline - monotonic())))
                    continue
                if result["value"] == expected:
                    return
                sleep(min(0.05, max(0, deadline - monotonic())))
            raise BusError("postcondition-mismatch", "Native Text did not prove the requested incremental value")

        if not text:
            try:
                generate(0xFF08, "", 3)
            finally:
                _release(bus, controller, result)
            verify("")
        prefix = ""
        for segment in _segments(text):
            try:
                _send_segment(generate, segment)
            finally:
                _release(bus, controller, result)
            prefix += segment
            # X11 reuses a Unicode keycode. Native consumption must precede its next remap.
            verify(prefix)
        _confirm(call, ref, window, evidence)
        result.update(dispatch="acknowledged", postcondition="verified")
        return result
    except BusError as error:
        result["dispatch"] = "unknown" if result["controllerCalls"] else result["dispatch"]
        result["focus"]["confirmed"] = False
        error.result = result
        raise
    finally:
        lock.release()


def _states(call, ref):
    words = call(ref, A + "Accessible", "GetState", reply="(au)")
    if len(words) != 2 or any(type(word) is not int or not 0 <= word < 2**32 for word in words):
        raise BusError("protocol-error", "Invalid native state masks")
    return {state for state in range(64) if words[state // 32] & (1 << (state % 32))}


def _editable(call, ref, evidence=None):
    states = _states(call, ref)
    if 6 in states:
        raise BusError("defunct", "Target is defunct")
    if 43 in states or 7 not in states:
        raise BusError("read-only", "Target does not expose editable state")
    if not {8, 24, 25}.issubset(states):
        raise BusError("disabled", "Target is not enabled, sensitive and showing")
    role = call(ref, A + "Accessible", "GetRole", reply="(u)")
    if role == 40:
        raise BusError("protected-text", "Target is protected")
    if role not in (61, 79):
        raise BusError("unsupported-operation", "Keyboard mode requires an unprotected text control")
    if evidence is not None and role != evidence.setdefault("targetRole", role):
        raise BusError("focus-unconfirmed", "Native target role changed during keyboard operation")
    if not {A + "Text", A + "Component"}.issubset(call(ref, A + "Accessible", "GetInterfaces", reply="(as)")):
        raise BusError("unsupported-interface", "Target requires Component and native Text readback")
    return states


def _ancestry(call, ref, stop=None, expected_role=None):
    paths, window = [], None
    for _ in range(32):
        if ref[1] in paths:
            raise BusError("ownership-unresolved", "Native ancestry cycle")
        paths.append(ref[1])
        # Parent changes can introduce protected ancestry after admission.
        role = call(ref, A + "Accessible", "GetRole", reply="(u)")
        if role == 40:
            raise BusError("protected-text", "Focus ancestry contains a protected control")
        if len(paths) == 1 and expected_role is not None and role != expected_role:
            raise BusError("focus-unconfirmed", "Controlled descendant role changed during confirmation")
        if role in (23, 69) and window is None:
            window = ref[1]
        if ref[1] == stop:
            return paths, window
        if ref[1] == ROOT:
            if role != 75:
                raise BusError("ownership-unresolved", "Native root is not an application")
            return paths, window
        parent = call(ref, "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Accessible", "Parent"), "(v)")
        if parent[0] not in ("", ref[0]) or parent[1] == "/org/a11y/atspi/null":
            raise BusError("wrong-scope", "Ancestry left the confirmed exporter")
        ref = ref[0], parent[1]
    raise BusError("verification-incomplete", "Ancestry exceeds keyboard budget")


def _confirm(call, ref, window, evidence):
    for _ in range(2):
        current = _states(call, (ref[0], window))
        if 6 in current:
            raise BusError("defunct", "Owned window is defunct")
        if not {8, 24, 25}.issubset(current):
            raise BusError("disabled", "Owned window is not enabled, sensitive and showing")
        if 1 not in current:
            raise BusError("focus-unconfirmed", "Owned window lost focus")
        if 12 in _editable(call, ref, evidence):
            _, target_window = _ancestry(call, ref, window, evidence["targetRole"])
            if target_window != window:
                raise BusError("wrong-scope", "Focused target left the owned window")
            return
        relations = call(ref, A + "Accessible", "GetRelationSet", reply="(a(ua(so)))")
        if len(relations) > 32 or sum(len(targets) for _, targets in relations) > 32:
            raise BusError("verification-incomplete", "Controlled focus relations exceed verification budget")
        focused = (ref[0], evidence["focus"]) if evidence.get("focus") else _controlled_focus(call, ref, relations)
        if focused is None:
            continue
        current = _states(call, focused)
        if 12 not in current:
            focused = _controlled_focus(call, ref, relations)
            if focused is None:
                # Autocomplete can move focus to the field between its state read
                # and the descendant walk. Recheck once, read-only, under the same
                # budgets and guards; never refocus, resend or trust global focus.
                continue
            current = _states(call, focused)
            evidence["focus"] = focused[1]
            evidence.pop("focusRole", None)
        if 6 in current:
            raise BusError("defunct", "Controlled focused descendant is defunct")
        role = call(focused, A + "Accessible", "GetRole", reply="(u)")
        if role == 40:
            raise BusError("protected-text", "Controlled focused descendant is protected")
        if role != evidence.setdefault("focusRole", role):
            raise BusError("focus-unconfirmed", "Controlled focused descendant role changed")
        if not {8, 24, 25}.issubset(current):
            raise BusError("disabled", "Controlled focused descendant is not enabled, sensitive and showing")
        if 12 not in current:
            raise BusError("focus-unconfirmed", "Declared active descendant is not focused")
        paths, focus_window = _ancestry(call, focused, window, role)
        if focus_window != window or not any(kind == 3 and any(owner in ("", ref[0]) and path in paths for owner, path in targets) for kind, targets in relations):
            raise BusError("focus-unconfirmed", "Focused descendant is not controlled by target")
        return
    raise BusError("focus-unconfirmed", "No owned controlled descendant reports focus")


def _controlled_focus(call, ref, relations):
    # Direct focus may become an active descendant after an autocomplete update.
    # This is a fresh relation-scoped read, never another GrabFocus or typing retry.
    pending = [(owner or ref[0], path, 0) for kind, targets in relations if kind == 3 for owner, path in targets]
    seen = set()
    while pending:
        owner, path, depth = pending.pop()
        if (owner, path) in seen:
            continue
        if owner != ref[0]:
            raise BusError("wrong-scope", "Controlled focus leaves the allowed exporter")
        if len(path) > 256 or len(seen) >= 32 or depth >= 32:
            raise BusError("verification-incomplete", "Controlled focus traversal exceeds verification budget")
        seen.add((owner, path))
        current = _states(call, (owner, path))
        if 6 in current:
            raise BusError("defunct", "Controlled focus subtree is defunct")
        if 12 in current:
            return owner, path  # _confirm validates role, usable states and owned-window ancestry.
        count = call((owner, path), "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Accessible", "ChildCount"), "(v)")
        if type(count) is not int or count < 0 or len(seen) + len(pending) + count > 32:
            raise BusError("verification-incomplete", "Controlled focus children exceed verification budget")
        for index in range(count):
            child = call((owner, path), A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")
            pending.append((child[0] or owner, child[1], depth + 1))
    return None


def _value(call, ref):
    length = call(ref, "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Text", "CharacterCount"), "(v)")
    if type(length) is not int or not 0 <= length <= MAX_TEXT:
        raise BusError("verification-incomplete", "Native Text exceeds keyboard verification budget")
    value = call(ref, A + "Text", "GetText", "(ii)", (0, length), "(s)")
    if (not isinstance(value, str) or len(value) > MAX_TEXT
            or any(0xD800 <= ord(c) <= 0xDFFF for c in value) or not text_length_matches(value, length)):
        raise BusError("verification-incomplete", "Native Text range was malformed, oversized or incomplete")
    after = call(ref, "org.freedesktop.DBus.Properties", "Get", "(ss)", (A + "Text", "CharacterCount"), "(v)")
    if type(after) is not int or not 0 <= after <= MAX_TEXT:
        raise BusError("verification-incomplete", "Native Text count is invalid after readback")
    if after != length:
        error = BusError("verification-incomplete", "Native Text length changed during readback")
        error.changing_count = True
        raise error
    return value


def parse_keys(keys):
    """Map "ctrl+shift+p" style shortcuts to an X11 modifier mask and one keysym."""
    if not isinstance(keys, str) or not 1 <= len(keys) <= 64 or any(ord(c) < 32 or ord(c) > 126 for c in keys):
        raise BusError("protocol-error", "Key combination must be short printable ASCII")
    *names, key = [part.strip().lower() for part in keys.split("+")]
    mask = 0
    for name in names:
        if name not in MODIFIERS or mask & MODIFIERS[name]:
            raise BusError("unsupported-operation", "Unknown or repeated modifier in key combination")
        mask |= MODIFIERS[name]
    keysym = KEYSYMS.get(key, ord(key) if len(key) == 1 and 32 < ord(key) < 127 else None)
    if keysym is None:
        raise BusError("unsupported-operation", "Unknown key name in key combination")
    # Server-level sequences (zap, virtual terminal switch) act outside the workspace session.
    if mask & 4 and mask & 8 and (key == "backspace" or key in KEYSYMS and key.startswith("f") and key[1:].isdigit()):
        raise BusError("unsupported-operation", "Server control key combinations are not allowed")
    return mask, keysym


def press_keys(bus, node, keys, timeout_ms, allowed_window):
    """One shortcut into an owned, active window. Its effect is application-defined, so it is never verified."""
    mask, keysym = parse_keys(keys)
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 60000:
        raise BusError("protocol-error", "Invalid keyboard deadline")
    if not os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        raise BusError("unsupported-operation", "Key combinations require an X11 accessibility session")
    if (not isinstance(node, dict) or not isinstance(node.get("owner"), str) or not node["owner"].startswith(":")
            or not isinstance(node.get("path"), str) or max(len(node["owner"]), len(node["path"])) > 256):
        raise BusError("ownership-unresolved", "A unique exporter and native path are required")
    if not isinstance(allowed_window, dict):
        raise BusError("protocol-error", "Owned window evidence is required")
    deadline = monotonic() + timeout_ms / 1000
    result = {"method": "keys", "keys": keys, "dispatch": "unknown", "postcondition": "unverified",
              "focus": {"requested": False, "confirmed": False, "externalRaces": "unfenced"}, "controllerCalls": 0}
    counter = [0]

    def call(ref, interface, method, signature="()", parameters=(), reply="()"):
        remaining = int((deadline - monotonic()) * 1000)
        if remaining <= 0 or counter[0] >= MAX_CALLS:
            raise BusError("timeout", "Keyboard query/deadline budget exhausted")
        counter[0] += 1
        value = bus.call(*ref, interface, method, signature, parameters, reply, min(1000, remaining))
        return value[0] if reply != "()" else None

    with _guard:
        lock = _locks.get(bus.connection.get_guid())
        if lock is None:
            lock = Lock()
            _locks[bus.connection.get_guid()] = lock
    if not lock.acquire(timeout=max(0, deadline - monotonic())):
        raise BusError("busy", "Keyboard session is already executing")
    try:
        ref = node["owner"], node["path"]
        pid = call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
        if allowed_window.get("owner") != ref[0] or allowed_window.get("pid") != pid:
            raise BusError("wrong-scope", "Exporter does not match owned window evidence")
        _, window = _ancestry(call, ref)
        if not window or allowed_window.get("path") != window:
            raise BusError("wrong-scope", "Target ancestry does not confirm the owned window")

        def active():
            current = _states(call, (ref[0], window))
            if 6 in current:
                raise BusError("defunct", "Owned window is defunct")
            if 1 not in current:
                raise BusError("focus-unconfirmed", "Owned window is not active")

        active()
        target = _states(call, ref)
        if 6 in target:
            raise BusError("defunct", "Target is defunct")
        if call(ref, A + "Accessible", "GetRole", reply="(u)") == 40:
            raise BusError("protected-text", "Key combinations are not sent to protected controls")
        # A focusable anchor takes focus first; a window or frame anchor leaves focus where the app has it.
        if 11 in target and 12 not in target and A + "Component" in call(ref, A + "Accessible", "GetInterfaces", reply="(as)"):
            result["focus"]["requested"] = True
            if not call(ref, A + "Component", "GrabFocus", reply="(b)") or 12 not in _states(call, ref):
                raise BusError("focus-unconfirmed", "Provider did not focus the key target")
        result["focus"]["confirmed"] = 12 in _states(call, ref)
        active()
        controller = call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)"), DEC

        def generate(code, kind):
            active()
            result["controllerCalls"] += 1
            call(controller, A + "DeviceEventController", "GenerateKeyboardEvent", "(isu)", (code, "", kind))

        try:
            if mask:
                generate(mask, 5)  # KEY_LOCKMODIFIERS
            generate(keysym, 3)  # KEY_SYM: press and release
        finally:
            if mask and result["controllerCalls"]:
                _release(bus, controller, result, mask)
        result["dispatch"] = "acknowledged"
        return result
    except BusError as error:
        result["dispatch"] = "unknown" if result["controllerCalls"] or result["focus"]["requested"] else "not-dispatched"
        error.result = result
        raise
    finally:
        lock.release()


def point(bus, node, kind, timeout_ms, allowed_window):
    """Move the pointer to the center of a showing control in an owned, active window; contextMenu also right-clicks there.

    What a hover or a right-click shows is application-defined, so the effect is never verified."""
    if kind not in POINTER:
        raise BusError("protocol-error", "Pointer kind must be hover or contextMenu")
    if type(timeout_ms) is not int or not 1 <= timeout_ms <= 60000:
        raise BusError("protocol-error", "Invalid pointer deadline")
    if not os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"):
        raise BusError("unsupported-operation", "Pointer events require an X11 accessibility session")
    if (not isinstance(node, dict) or not isinstance(node.get("owner"), str) or not node["owner"].startswith(":")
            or not isinstance(node.get("path"), str) or max(len(node["owner"]), len(node["path"])) > 256):
        raise BusError("ownership-unresolved", "A unique exporter and native path are required")
    if not isinstance(allowed_window, dict):
        raise BusError("protocol-error", "Owned window evidence is required")
    deadline = monotonic() + timeout_ms / 1000
    result = {"method": "pointer", "kind": kind, "dispatch": "unknown", "postcondition": "unverified",
              "point": None, "hit": "unverified", "controllerCalls": 0}
    counter = [0]

    def call(ref, interface, method, signature="()", parameters=(), reply="()"):
        remaining = int((deadline - monotonic()) * 1000)
        if remaining <= 0 or counter[0] >= MAX_CALLS:
            raise BusError("timeout", "Pointer query/deadline budget exhausted")
        counter[0] += 1
        value = bus.call(*ref, interface, method, signature, parameters, reply, min(1000, remaining))
        return value[0] if reply != "()" else None

    with _guard:
        lock = _locks.get(bus.connection.get_guid())
        if lock is None:
            lock = Lock()
            _locks[bus.connection.get_guid()] = lock
    if not lock.acquire(timeout=max(0, deadline - monotonic())):
        raise BusError("busy", "Input session is already executing")
    try:
        ref = node["owner"], node["path"]
        pid = call(DBUS, DBUS[0], "GetConnectionUnixProcessID", "(s)", (ref[0],), "(u)")
        if allowed_window.get("owner") != ref[0] or allowed_window.get("pid") != pid:
            raise BusError("wrong-scope", "Exporter does not match owned window evidence")
        paths, window = _ancestry(call, ref)  # Also refuses protected controls and protected ancestry.
        if not window or allowed_window.get("path") != window:
            raise BusError("wrong-scope", "Target ancestry does not confirm the owned window")

        def active():
            current = _states(call, (ref[0], window))
            if 6 in current:
                raise BusError("defunct", "Owned window is defunct")
            if 1 not in current:
                raise BusError("focus-unconfirmed", "Owned window is not active")

        def extents(target):
            box = call(target, A + "Component", "GetExtents", "(u)", (0,), "((iiii))")
            if (not isinstance(box, (tuple, list)) or len(box) != 4 or any(type(v) is not int or abs(v) > 1 << 20 for v in box)
                    or box[2] <= 0 or box[3] <= 0):
                raise BusError("offscreen", "Control has no on-screen extents")
            return tuple(box)

        active()
        target = _states(call, ref)
        if 6 in target:
            raise BusError("defunct", "Target is defunct")
        if 25 not in target:
            raise BusError("offscreen", "Target is not showing")
        if A + "Component" not in call(ref, A + "Accessible", "GetInterfaces", reply="(as)"):
            raise BusError("unsupported-interface", "Target has no Component extents")
        box, frame = extents(ref), extents((ref[0], window))
        x, y = box[0] + box[2] // 2, box[1] + box[3] // 2
        if not (frame[0] <= x < frame[0] + frame[2] and frame[1] <= y < frame[1] + frame[3]):
            raise BusError("offscreen", "Control center lies outside its owned window")
        result["point"] = {"x": x, "y": y}
        result["hit"] = _hit(call, ref, window, paths, x, y)
        controller = call(DBUS, DBUS[0], "GetNameOwner", "(s)", ("org.a11y.atspi.Registry",), "(s)"), DEC
        for event in POINTER[kind]:
            active()
            if extents(ref) != box:
                raise BusError("target-moved", "Control moved before the pointer event")
            result["controllerCalls"] += 1
            call(controller, A + "DeviceEventController", "GenerateMouseEvent", "(iis)", (x, y, event))
        result["dispatch"] = "acknowledged"
        return result
    except BusError as error:
        result["dispatch"] = "unknown" if result["controllerCalls"] else "not-dispatched"
        error.result = result
        raise
    finally:
        lock.release()


def _hit(call, ref, window, paths, x, y):
    """Which control lies under the point: the target (or inside it), or "unavailable" when the app has no hit test.

    Anything else on top of the target (a popup, an overlay) refuses the event, and a protected control on the path
    refuses it through _ancestry."""
    current, seen = (ref[0], window), set()
    for _ in range(32):
        try:
            child = call(current, A + "Component", "GetAccessibleAtPoint", "(iiu)", (x, y, 0), "((so))")
        except BusError as error:
            if error.code in ("timeout", "cancelled"):
                raise
            break
        owner, path = child[0] or ref[0], child[1]
        if owner != ref[0] or path in ("", "/org/a11y/atspi/null") or (owner, path) in seen or path == current[1]:
            break
        seen.add((owner, path))
        current = owner, path
    if current[1] == window:
        return "unavailable"
    hit, _ = _ancestry(call, current)
    if ref[1] in hit:
        return "target"
    # The descent stopped above the target: the app's hit test cannot say what is under the point.
    if current[1] in paths:
        return "unavailable"
    raise BusError("target-obscured", "Another control lies on top of the target at its center")


def _segments(text):
    for ascii_run, characters in groupby(text, lambda c: ord(c) < 128):
        if ascii_run:
            yield "".join(characters)
            continue
        yield from characters


def _send_segment(generate, segment):
    generate(0, segment, 4)


def _release(bus, controller, result, mask=4):
    # Separate finite cleanup budget also runs after the operation deadline.
    result["controllerCalls"] += 1
    try:
        getattr(bus, "cleanup_call", bus.call)(*controller, A + "DeviceEventController", "GenerateKeyboardEvent", "(isu)", (mask, "", 6), "()", 500)
    except BusError as error:
        result["modifierRelease"] = error.code
        raise
    result["modifierRelease"] = "acknowledged"

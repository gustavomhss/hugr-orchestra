"""One-shot mutations; fresh checks are non-atomic, acknowledgement is not completion."""

import keyboard
from bus import BusError
from context import A, LIMITS, ROOT, interface_name, states, text_length_matches
from refs import VIRTUAL_ROLES, ancestry_reasons, instability

# Pointer refusals that only mean "a click cannot stand in here"; the advertised action is used instead.
CLICK_INELIGIBLE = ("unsupported-operation", "focus-unconfirmed", "offscreen", "unsupported-interface", "hit-unconfirmed")


def invoke(context, ref, action_id=None, mode="stable"):
    if mode not in ("stable", "observed"):
        raise BusError("protocol-error", "Invalid native action identity mode")
    if mode == "observed" and action_id is None:
        raise BusError("action-required", "Observed-control mode requires an explicit advertised action ID")
    record = context.registry.resolve(ref, context)
    context.registry.invalidate(context.binding)
    _target(context, record, observed=mode == "observed")
    names = _action_names(context, record)
    advertised = record["actions"]
    if [(a["index"], a["name"]) for a in advertised] != list(enumerate(names)):
        raise BusError("action-drift", "Advertised action names or indices changed")
    if len(set(names)) != len(names):
        raise BusError("action-ambiguous", "Duplicate provider action names are ambiguous")
    if action_id is None:
        if len(names) != 1 or names[0] not in ("click", "press", "activate", "toggle"):
            raise BusError("action-required", "Choose an advertised action explicitly")
        action = advertised[0]
    else:
        matches = [a for a in advertised if a["id"] == action_id]
        if not isinstance(action_id, str) or len(matches) != 1:
            raise BusError("invalid-action", "Action ID is not in this observation")
        action = matches[0]
    evidence, live = _target(context, record, observed=mode == "observed")
    if _action_names(context, record) != names:
        raise BusError("action-drift", "Provider actions changed during admission")
    result = {"method": "action", "action": action["name"], "via": "action",
              "dispatch": "unknown", "postcondition": "unverified", "consistency": "non-atomic",
              "identity": "observed-control" if mode == "observed" else "snapshot-bound-control",
              "logicalIdentity": "unverified"}
    clicked = _click(context, record, action, evidence, live, result)
    if clicked:
        return clicked
    try:
        accepted = context.call(record["owner"], record["path"], A + "Action", "DoAction",
                                "(i)", (action["index"],), "(b)")[0]
        if not accepted:
            result["dispatch"] = "rejected"
            raise BusError("provider-rejected", "Provider rejected DoAction")
        result["dispatch"] = "acknowledged"
        _responding(context, record["owner"])
        return result
    except BusError as error:
        if context.dispatch_started:
            error.result = result
        raise


def _click(context, record, action, evidence, live, result):
    """GTK 3 (at-spi2-atk) runs DoAction's handler inside its D-Bus dispatch. A handler that runs a modal dialog
    (gtk_dialog_run, e.g. Thunar "Create Folder...", Mousepad "Go to...") nests a main loop there: the app stops
    answering AT-SPI until the dialog closes, and the first key event then deadlocks it for good. A left click at the
    control's center runs the same handler from GDK's event dispatch instead, as a person's click does. The click goes
    through the pointer guards (owned active window, showing, protected refusal, fresh identity) and must hit the
    control; when it cannot stand in (no X11, inactive window, offscreen, hit elsewhere) the action itself is used,
    except for an item of a closed menu: "..." items open dialogs, and a person would open the menu first too."""
    if action["name"] != "click":
        return None
    try:
        toolkit = context.property(record["owner"], ROOT, A + "Application", "ToolkitName")
    except BusError as error:
        if error.code in ("cancelled", "timeout"):
            raise
        return None
    if not isinstance(toolkit, str) or toolkit.lower() != "gtk":
        return None
    if record["role"] in (8, 35, 45) and 25 not in live:
        raise BusError("menu-closed", "This menu item is not on screen; open its menu first")
    try:
        pointed = keyboard.point(context, record, "click", context.remaining(), evidence)
    except BusError as error:
        sent = getattr(error, "result", {}).get("controllerCalls")
        if error.code in CLICK_INELIGIBLE and not sent:
            result["clickRefused"] = error.code  # Why the action itself is used: evidence for the reader.
            return None
        if sent:
            error.result = {**result, "via": "pointer", "dispatch": "unknown"}
        raise
    return {**result, "via": "pointer", "dispatch": pointed["dispatch"], "point": pointed["point"], "hit": pointed["hit"]}


def _responding(context, owner):
    # An acknowledged action whose app then stops answering is running something modal inside the accessibility
    # call (see _click); say so now rather than let every later read time out without a reason.
    if context.remaining() < 900:
        return  # Too little time left to tell a busy app from an expiring request.
    try:
        context.call(owner, ROOT, A + "Accessible", "GetRole", reply="(u)")
    except BusError as error:
        if error.code != "timeout":
            raise
        raise BusError("app-not-responding", "The action was delivered, then the app stopped answering") from error


def replace_text(context, ref, text, mode="editable", focused=False):
    """focused: the field must still hold keyboard focus (typing into the focused field); refused before any dispatch."""
    record = context.registry.resolve(ref, context)
    context.registry.invalidate(context.binding)
    if not isinstance(text, str) or "\x00" in text or any(0xD800 <= ord(c) <= 0xDFFF for c in text):
        raise BusError("protocol-error", "Text must be a valid D-Bus Unicode string")
    if mode not in ("editable", "keyboard"):
        raise BusError("unsupported-operation", "Unknown text replacement mode")
    if focused and mode != "keyboard":
        raise BusError("protocol-error", "Typing into the focused field uses keyboard mode")
    limit = keyboard.MAX_TEXT if mode == "keyboard" else LIMITS["text"]
    if len(text) > limit:
        raise BusError("verification-incomplete", "Replacement exceeds native Text verification budget")
    _target(context, record, mode)
    _value(context, record, limit)  # Refuse an unverifiable full-value replacement before dispatch.
    evidence, live = _target(context, record, mode)
    if mode == "keyboard":
        evidence = _keyboard_window(context, record, evidence, live)
        if focused and 12 not in live and "focus" not in evidence:
            raise BusError("focus-unconfirmed", "The field no longer holds keyboard focus")
        result = {"method": "keyboard", "dispatch": "unknown", "postcondition": "unverified", "value": None}
        try:
            result = _keyboard_result(keyboard.replace_text(context, record, text, context.remaining(), evidence))
            _target(context, record, mode)
            result["value"] = _value(context, record, limit)
            if result["value"] != text:
                raise BusError("postcondition-mismatch", "Native Text differs from requested full value")
            result["postcondition"] = "verified"
            return result
        except BusError as error:
            if hasattr(error, "result"):
                result = _keyboard_result(error.result)
            if context.dispatch_started or hasattr(error, "result"):
                error.result = result
            raise
    result = {"method": "editable", "dispatch": "unknown", "postcondition": "unverified", "value": None}
    try:
        accepted = context.call(record["owner"], record["path"], A + "EditableText", "SetTextContents",
                                "(s)", (text,), "(b)")[0]
        if not accepted:
            result["dispatch"] = "rejected"
            raise BusError("provider-rejected", "Provider rejected SetTextContents")
        result["dispatch"] = "acknowledged"
        _target(context, record, mode)
        result["value"] = _value(context, record, limit)
        if result["value"] != text:
            raise BusError("postcondition-mismatch", "Native Text differs from requested full value")
        result["postcondition"] = "verified"
        return result
    except BusError as error:
        if context.dispatch_started:
            error.result = result
        raise


def press(context, ref, keys=None, text=None):
    """Send one key combination, or printable text as key events, to the owned window holding ref; the app decides
    what it means. Text goes only to ref when ref holds focus."""
    record = context.registry.resolve(ref, context)
    context.registry.invalidate(context.binding)
    # Refuse unknown or server-level combinations and unprintable text before any native call.
    keyboard.parse_keys(keys) if text is None else keyboard.parse_text(text)
    evidence = context.require_owned(record)
    try:
        return _keys_result(keyboard.press_keys(context, record, keys, context.remaining(), evidence, text))
    except BusError as error:
        if hasattr(error, "result"):
            error.result = _keys_result(error.result)
        raise


def pointer(context, ref, kind):
    """Hover over or right-click the center of a showing control; the app decides what that shows."""
    record = context.registry.resolve(ref, context)  # Fresh ownership, role, name and parent.
    context.registry.invalidate(context.binding)
    # Rows of virtual lists and trees qualify, unlike for actions: hover and right-click land on a point that
    # the resolve above (fresh role, name and parent), fresh extents and a hit test tie to this row, so a
    # recycled row shows another name and refuses. Stale, transient or unreadable identity still refuses.
    if not set(record["unstableReasons"]) <= {"virtual"}:
        raise BusError("unstable-ref", "Native target identity is not stable enough for pointer events")
    evidence = context.require_owned(record)
    try:
        return _pointer_result(keyboard.point(context, record, kind, context.remaining(), evidence))
    except BusError as error:
        if hasattr(error, "result"):
            error.result = _pointer_result(error.result)
        raise


def _pointer_result(result):
    point = result.get("point")
    return {"method": "pointer", "kind": str(result.get("kind", ""))[:16], "dispatch": result["dispatch"],
            "postcondition": "unverified", "hit": str(result.get("hit", "unverified"))[:16],
            "point": {"x": point["x"], "y": point["y"]} if isinstance(point, dict) else None,
            "controllerCalls": result.get("controllerCalls", 0)}


def _keys_result(result):
    focus = result.get("focus", {})
    typed = {"characters": result["characters"]} if type(result.get("characters")) is int else {"keys": str(result.get("keys", ""))[:64]}
    bounded = {"method": "keys", **typed, "dispatch": result["dispatch"],
               "postcondition": "unverified", "focus": {"requested": bool(focus.get("requested")),
               "confirmed": bool(focus.get("confirmed")), "externalRaces": "unfenced"},
               "controllerCalls": result.get("controllerCalls", 0)}
    if "modifierRelease" in result:
        bounded["modifierRelease"] = str(result["modifierRelease"])[:LIMITS["field"]]
    return bounded


def _target(context, record, mode=None, observed=False):
    evidence = context.require_owned(record)
    live = states(context.call(record["owner"], record["path"], A + "Accessible", "GetState", reply="(au)")[0])
    if 6 in live:
        raise BusError("defunct", "Native target is defunct")
    role = context.call(record["owner"], record["path"], A + "Accessible", "GetRole", reply="(u)")[0]
    if role == 40 or record["role"] == 40:
        raise BusError("protected-text", "Protected controls do not permit native mutation")
    if record["unstable"] and not (observed and set(record["unstableReasons"]) <= {"virtual"}
                                  and record["role"] not in VIRTUAL_ROLES and not live & {27, 28, 31}):
        raise BusError("unstable-ref", "Native target identity is not stable enough for mutation")
    parent = context.property(record["owner"], record["path"], A + "Accessible", "Parent")
    name = context.property(record["owner"], record["path"], A + "Accessible", "Name")
    if role != record["role"] or name != record["name"] or (parent[0] or record["owner"], parent[1]) != record["parent"]:
        fields = (["role"] if role != record["role"] else []) + (["name"] if name != record["name"] else []) + (["parent"] if (parent[0] or record["owner"], parent[1]) != record["parent"] else [])
        raise BusError("stale-ref", "Native action target role, name or parent changed: " + ",".join(fields))
    if not {8, 24}.issubset(live) or mode == "keyboard" and 25 not in live:
        raise BusError("disabled", "Native target is not enabled and sensitive")
    if 43 in live or mode is not None and 7 not in live:
        raise BusError("read-only", "Native target is read-only")
    interfaces = context.call(record["owner"], record["path"], A + "Accessible", "GetInterfaces", reply="(as)")[0]
    if len(interfaces) > 16 or not all(interface_name(i) for i in interfaces):
        raise BusError("verification-incomplete", "Native interface list exceeds verification budget")
    required = {A + "Action"} if mode is None else {A + "Text", A + ("Component" if mode == "keyboard" else "EditableText")}
    if not required.issubset(interfaces):
        raise BusError("unsupported-interface", "Required native mutation/readback interface is unavailable")
    if observed and set(ancestry_reasons(context, {**record, "states": live,
                        "unstableReasons": instability(role, live)})) - {"virtual"}:
        raise BusError("unstable-ref", "Observed mode cannot bypass unprovable ancestry")
    if mode == "keyboard" and role not in (61, 79):
        raise BusError("unsupported-operation", "Keyboard mode requires an unprotected text control")
    return evidence, live


def _action_names(context, record):
    count = context.property(record["owner"], record["path"], A + "Action", "NActions")
    if type(count) is not int or not 0 <= count <= LIMITS["actions"]:
        raise BusError("verification-incomplete", "Native action list exceeds verification budget")
    names = []
    for index in range(count):
        name = context.call(record["owner"], record["path"], A + "Action", "GetName", "(i)", (index,), "(s)")[0]
        if not isinstance(name, str) or not name or len(name) > LIMITS["field"]:
            raise BusError("verification-incomplete", "Native action name is unavailable or oversized")
        names.append(name)
    return names


def _value(context, record, limit):
    count = context.property(record["owner"], record["path"], A + "Text", "CharacterCount")
    if type(count) is not int or not 0 <= count <= limit:
        raise BusError("verification-incomplete", "Native Text exceeds full-value verification budget")
    value = context.call(record["owner"], record["path"], A + "Text", "GetText", "(ii)", (0, count), "(s)")[0]
    if (not isinstance(value, str) or len(value) > limit
            or any(0xD800 <= ord(c) <= 0xDFFF for c in value) or not text_length_matches(value, count)):
        raise BusError("verification-incomplete", "Native Text range was malformed, oversized or incomplete")
    after = context.property(record["owner"], record["path"], A + "Text", "CharacterCount")
    if type(after) is not int or after != count:
        raise BusError("verification-incomplete", "Native Text length changed or readback was incomplete")
    return value


def _keyboard_window(context, record, evidence, live):
    if 12 in live:
        return evidence
    relations = context.call(record["owner"], record["path"], A + "Accessible", "GetRelationSet", reply="(a(ua(so)))")[0]
    if len(relations) > 32 or sum(len(targets) for _, targets in relations) > 32:
        raise BusError("verification-incomplete", "Active-descendant relations exceed verification budget")
    roots = [(owner or record["owner"], path) for kind, targets in relations if kind == 3 for owner, path in targets]
    if not roots:
        return evidence  # Ordinary controls may establish direct focus via GrabFocus.
    pending = [(owner, path, 0) for owner, path in roots]
    seen, focused = set(), []
    while pending:
        owner, path, depth = pending.pop()
        if (owner, path) in seen:
            continue
        if len(owner) > LIMITS["field"] or len(path) > LIMITS["field"]:
            raise BusError("verification-incomplete", "Controlled descendant handle exceeds verification budget")
        if owner != record["owner"]:
            raise BusError("wrong-scope", "Controlled descendant leaves the owned exporter")
        if len(seen) >= 128 or depth >= LIMITS["depth"]:
            raise BusError("verification-incomplete", "Active-descendant traversal exceeds verification budget")
        seen.add((owner, path))
        window = context.require_owned({"owner": owner, "path": path})
        if (window["owner"], window["path"]) != (evidence["owner"], evidence["path"]):
            raise BusError("wrong-scope", "Controlled descendant leaves the allowed window")
        current = states(context.call(owner, path, A + "Accessible", "GetState", reply="(au)")[0])
        if 6 in current:
            raise BusError("defunct", "Controlled descendant is defunct")
        if 12 in current:
            if context.call(owner, path, A + "Accessible", "GetRole", reply="(u)")[0] == 40:
                raise BusError("protected-text", "Controlled focused descendant is protected")
            if not {8, 24, 25}.issubset(current):
                raise BusError("focus-unconfirmed", "Controlled focused descendant is not usable")
            focused.append(path)
            if len(focused) > 1:
                raise BusError("focus-unconfirmed", "Multiple controlled descendants report focus")
        count = context.property(owner, path, A + "Accessible", "ChildCount")
        if type(count) is not int or count < 0 or len(seen) + len(pending) + count > 128:
            raise BusError("verification-incomplete", "Active-descendant children exceed verification budget")
        for index in range(count):
            child = context.call(owner, path, A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")[0]
            pending.append((child[0] or owner, child[1], depth + 1))
    if len(focused) != 1:
        raise BusError("focus-unconfirmed", "No owned controlled descendant reports focus")
    return dict(evidence, focus=focused[0])


def _keyboard_result(result):
    # Do not forward unbounded provider text or internal native handles in error evidence.
    value = result.get("value")
    focus = result.get("focus", {})
    bounded = {"method": "keyboard", "dispatch": result["dispatch"], "postcondition": "unverified",
               "value": value if isinstance(value, str) and len(value) <= keyboard.MAX_TEXT else None,
               "focus": {"requested": bool(focus.get("requested")), "confirmed": bool(focus.get("confirmed")),
                         "externalRaces": "unfenced"}, "controllerCalls": result.get("controllerCalls", 0)}
    if "modifierRelease" in result:
        bounded["modifierRelease"] = str(result["modifierRelease"])[:LIMITS["field"]]
    if result.get("noOp"):
        bounded["noOp"] = True
    return bounded

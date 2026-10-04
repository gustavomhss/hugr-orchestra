"""Indexed live reads. Text offsets use reported native position units.

Provider calls and observations are non-atomic. Continuations retain traversal
positions and fingerprints, not a materialized tree or logical record identity.
"""

import json
import os
from secrets import token_hex

from bus import BusError
from context import A, LIMITS, ROOT, interface_name, text_length_matches
from refs import VIRTUAL_ROLES, ancestry_reasons, fingerprint, scope_kind

# Default JSON escaping costs up to 12 bytes per Unicode character. Text appears
# in both the item and aggregate. Reserve envelope/terminal metadata separately.
FRAME_RESERVE = 4096
# Names/action names/title/window: 11 * 256 * 12 = 33792 bytes.
# Sixteen grammar-checked ASCII interfaces: <= 16 * 259 = 4144 bytes.
# ASCII tokens, states, capabilities, scalar metadata and JSON keys: < 8 KiB.
# Text has its own 24-byte-per-character allowance, including both copies.
NODE_RESERVE = 49152
NULL = "/org/a11y/atspi/null"
ROLES = {7: "check-box", 16: "dialog", 23: "frame", 31: "list", 32: "list-item", 33: "menu",
         34: "menu-bar", 35: "menu-item", 39: "panel", 40: "password-text", 43: "push-button",
         55: "table", 56: "table-cell", 61: "text", 65: "tree", 66: "tree-table", 69: "window",
         75: "application", 79: "entry", 90: "table-row", 91: "tree-item"}


def read(context, query):
    options = _query(query)
    registry, binding = context.registry, context.binding
    if "cursor" in query:
        try:
            state = registry.resume(binding, query["cursor"])
        except BusError:
            registry.begin(binding)
            raise
        observation = registry.begin(binding)
        if any(key in query and options[key] != state["query"][key] for key in ("budget", "maxText", "textOffset")):
            raise BusError("cursor-stale", "Native continuation query changed")
        options = state["query"]
        _anchors(context, state)
    else:
        try:
            root = registry.resolve(query["rootRef"], context) if "rootRef" in query else None
        except BusError:
            registry.begin(binding)
            raise
        observation = registry.begin(binding)
        roots = [{"owner": root["owner"], "path": root["path"]}] if root else binding["roots"]
        if not roots or len(roots) > LIMITS["roots"]:
            raise BusError("wrong-scope", "Read requires bounded confirmed window roots")
        state = {"query": options, "roots": [{"owner": root["owner"], "path": root["path"]} for root in roots],
                 "rootIndex": 0, "stack": [], "deferred": [], "rootFirst": root is None and scope_kind(binding) == "workspace",
                 "text": None, "textStarted": False,
                  "rootUnstable": bool(root and root["unstable"]), "rootReasons": root["unstableReasons"] if root else [], "partial": []}
    result = {"backend": "linux-atspi", "scopeKind": scope_kind(binding), "observation": observation, "title": "", "items": [], "text": "",
              "truncated": False, "windows": [], "coverage": {"scope": "owned-controls-excluding-hidden-menu-subtrees", "complete": False,
              "visited": 0, "calls": 0, "omittedHiddenMenus": 0, "reasons": list(state["partial"])}, "consistency": "non-atomic", "capabilities": {
              "read": {"supported": True, "reason": "bounded-live-traversal"},
              "mutation": {"supported": False, "reason": "per-item-capabilities; no-logical-dataset-identity"}}}
    seen = set()
    try:
        while len(result["items"]) < options["budget"]:
            registry.check(binding, observation)
            context.remaining()
            available = LIMITS["frameBytes"] - FRAME_RESERVE - len(json.dumps(result).encode())
            if available < NODE_RESERVE:
                _reason(result, "reply-byte-limit")
                break
            if result["coverage"]["visited"] >= LIMITS["nodes"] or context.calls >= LIMITS["calls"]:
                _reason(result, "read-budget")
                break
            if context.calls and LIMITS["calls"] - context.calls < min(LIMITS["depth"] + 32, LIMITS["calls"] // 2):
                # Preserve the next indexed position before a record can exhaust
                # its fresh-ownership/property budget. The next page resumes it.
                _reason(result, "read-budget")
                break
            position = (state["rootIndex"], state["text"], state["textStarted"])
            frame = state["stack"][-1] if state["stack"] else None
            index = (frame["index"], frame["last"]) if frame else None
            repeat = state["text"] is not None
            if repeat:
                handle, inherited = state["text"]["anchor"], state["text"]["anchor"]["unstableReasons"]
            elif not state["stack"]:
                if state["rootIndex"] >= len(state["roots"]):
                    if not state["deferred"]:
                        break
                    # Catalogue all workspace roots before descending. A delayed
                    # root may have changed even within this non-atomic page.
                    _anchors(context, state, expanding=True)
                    state["stack"].append(state["deferred"].pop(0))
                    continue
                handle = state["roots"][state["rootIndex"]]
                state["rootIndex"] += 1
                inherited = state["rootReasons"]
            else:
                frame = state["stack"][-1]
                if frame["index"] >= frame["count"]:
                    state["stack"].pop()
                    continue
                child = context.call(frame["owner"], frame["path"], A + "Accessible", "GetChildAtIndex",
                                     "(i)", (frame["index"],), "((so))")[0]
                frame["index"] += 1
                frame["last"] = (child[0] or frame["owner"], child[1])
                result["coverage"]["visited"] += 1
                if child[1] == NULL:
                    _reason(result, "null-child")
                    continue
                if child[0] not in ("", frame["owner"]):
                    _reason(result, "cross-exporter-edge")
                    continue
                handle, inherited = {"owner": frame["owner"], "path": child[1]}, frame["unstableReasons"]
            if not repeat and (handle["owner"], handle["path"]) in seen:
                _reason(result, "duplicate-or-cycle")
                continue
            if not repeat and any(frame["owner"] == handle["owner"] and frame["path"] == handle["path"] for frame in state["stack"]):
                _reason(result, "duplicate-or-cycle")
                continue
            if not repeat and not state["stack"]:
                result["coverage"]["visited"] += 1
            # Roots and mutation refs get full fresh ownership checks. Indexed
            # children prove their direct parent against this bounded live stack,
            # avoiding repeated /proc and whole-ancestry walks for every sibling.
            record = fingerprint(context, handle, state["stack"][-1] if state["stack"] and not repeat else None)
            if record["role"] == 33 and 25 not in record["states"] and state["stack"] and not repeat:
                # GTK exports every language/menu entry even while its popup is
                # closed. Do not materialize those unrelated hidden subtrees.
                result["coverage"]["omittedHiddenMenus"] += 1
                continue
            if state["stack"] and not repeat and record["parent"] != (state["stack"][-1]["owner"], state["stack"][-1]["path"]):
                _reason(result, "ancestry-changed")
                continue
            record["unstableReasons"] = sorted(set(record["unstableReasons"]) | set(inherited))
            record["unstable"] |= bool(record["unstableReasons"])
            if repeat and (record["nameDigest"] != handle.get("nameDigest")
                           or (not record["fingerprintComplete"] and record["nameDigest"] is None)
                           or any(record[key] != handle[key] for key in ("role", "name", "parent", "scopeDepth"))):
                raise BusError("cursor-stale", "Native text anchor changed")
            seen.add((record["owner"], record["path"]))
            capabilities = _capabilities(context, record, observation, result)
            count = state["text"]["count"] if repeat else context.property(record["owner"], record["path"], A + "Accessible", "ChildCount")
            if type(count) is not int or not 0 <= count < 2**31:
                raise BusError("defunct", "Invalid native child count")
            anchor = {key: record[key] for key in ("owner", "path", "role", "name", "nameDigest", "parent", "unstable", "unstableReasons", "scopeDepth")}
            item = {"role": record["role"], "roleName": ROLES.get(record["role"], f"atspi-role-{record['role']}"),
                    "name": record["name"], "states": sorted(record["states"]), "interfaces": record["interfaces"],
                    "depth": state["text"]["depth"] if repeat else len(state["stack"]), "scopeDepth": record["scopeDepth"],
                    "actions": [{"id": action["id"], "name": action["name"]} for action in record["actions"]], "capabilities": capabilities}
            if not options["maxText"]:
                capabilities["text"].update(requested=False, reason="protected" if record["role"] == 40 else "request-disabled")
            if options["maxText"] and record["role"] != 40 and A + "Text" in record["interfaces"]:
                remaining = min(options["maxText"] - len(result["text"]), (available - NODE_RESERVE) // 24)
                if remaining < 1:
                    # Do not schedule text calls when its output allowance is exhausted.
                    state["text"] = state["text"] if repeat else {
                        "anchor": anchor, "offset": options["textOffset"] if not state["textStarted"] else 0,
                        "count": count, "depth": item["depth"], "rootPending": state["rootFirst"] and not state["stack"]}
                    if not repeat and count and record["scopeDepth"] < LIMITS["depth"] - 1:
                        (state["deferred"] if state["rootFirst"] and not state["stack"] else state["stack"]).append(
                            {**anchor, "count": count, "index": 0, "last": None})
                    elif not repeat and count:
                        _reason(result, "depth-limit")
                    _reason(result, "text-limit")
                    break
                offset = state["text"]["offset"] if repeat else (options["textOffset"] if not state["textStarted"] else 0)
                _text(context, record, item, result, state, offset, remaining, count, anchor)
            elif repeat:
                raise BusError("cursor-stale", "Native text interface changed")
            context.remaining()
            registry.check(binding, observation)
            item["ref"] = f"n:{observation}:{'0' * 16}"
            candidate = {**result, "items": [*result["items"], item], "text": result["text"] + item.get("text", "")}
            if (not state["stack"] and not repeat) or (repeat and position[1].get("rootPending", False)):
                candidate["title"] = result["title"] or record["name"]
                if record["role"] in (16, 23, 69):
                    candidate["windows"] = [*result["windows"], {"ref": item["ref"], "title": record["name"], "role": record["role"]}]
            if len(json.dumps(candidate).encode()) + FRAME_RESERVE > LIMITS["frameBytes"]:
                # Keep the pre-record indexed frontier even if a future field
                # violates the conservative reserve; never lose a fetched node.
                state.update(rootIndex=position[0], text=position[1], textStarted=position[2])
                if frame:
                    frame["index"], frame["last"] = index
                _reason(result, "reply-byte-limit")
                break
            item["ref"] = registry.issue(binding, record)
            if len(candidate["windows"]) > len(result["windows"]):
                candidate["windows"][-1]["ref"] = item["ref"]
            result.update(items=candidate["items"], text=candidate["text"], title=candidate["title"], windows=candidate["windows"])
            if not repeat and count:
                if record["scopeDepth"] >= LIMITS["depth"] - 1:
                    _reason(result, "depth-limit")
                else:
                    (state["deferred"] if state["rootFirst"] and not state["stack"] else state["stack"]).append(
                        {**anchor, "count": count, "index": 0, "last": None})
            if state["text"] is not None:
                break
    except BusError as error:
        if error.code in ("cancelled", "timeout", "wrong-scope", "stale-ref", "cursor-stale", "invalid-text-offset"):
            registry.begin(binding)
            raise
        _reason(result, error.code)
        # An interrupted record cannot be resumed without inventing its identity.
        state.update(stack=[], deferred=[], text=None, rootIndex=len(state["roots"]))
    registry.check(binding, observation)
    while state["stack"] and state["stack"][-1]["index"] >= state["stack"][-1]["count"] and state["text"] is None:
        state["stack"].pop()
    more = bool(state["text"] or state["stack"] or state["deferred"] or state["rootIndex"] < len(state["roots"]))
    if more:
        state["partial"] = [code for code in result["coverage"]["reasons"]
                            if code not in ("page-limit", "text-limit", "reply-byte-limit", "read-budget", "cursor-limit")]
        try:
            result["cursor"] = registry.cursor(binding, state)
        except BusError as error:
            if error.code != "cursor-limit":
                raise
            _reason(result, error.code)
        _reason(result, "page-limit")
    result["hasMore"] = more and "cursor" in result
    result["coverage"].update(calls=context.calls, complete=not more and not result["coverage"]["reasons"])
    result["truncated"] = bool(result["coverage"]["reasons"])
    if result["truncated"]:
        result["capabilities"]["read"]["reason"] = "partial:" + result["coverage"]["reasons"][0]
    registry.check(binding, observation)
    return result


def _query(query):
    if not isinstance(query, dict) or set(query) - {"budget", "maxText", "rootRef", "cursor", "textOffset"}:
        raise BusError("protocol-error", "Invalid native read query")
    options = {"budget": query.get("budget", 100), "maxText": query.get("maxText", 1500), "textOffset": query.get("textOffset", 0)}
    if any(type(options[key]) is not int or not low <= options[key] <= high
           for key, low, high in (("budget", 1, 500), ("maxText", 0, LIMITS["text"]), ("textOffset", 0, 2**31 - 1))):
        raise BusError("protocol-error", "Native read query exceeds limits")
    if "cursor" in query and "rootRef" in query:
        raise BusError("protocol-error", "Choose a native root ref or continuation")
    if any(key in query and (not isinstance(query[key], str) or not query[key] or len(query[key]) > 256) for key in ("rootRef", "cursor")):
        raise BusError("protocol-error", "Invalid native read selector")
    return options


def _reason(result, code):
    reasons = result["coverage"]["reasons"]
    if code[:64] not in reasons and len(reasons) < 16:
        reasons.append(code[:64])


def _capabilities(context, record, observation, result):
    reason = record["interfaceError"] or ("protected" if record["role"] == 40 else ("unstable-identity" if record["unstable"] else (
              "disabled" if not {8, 24} <= record["states"] else ("read-only" if 43 in record["states"] else None))))
    observed = (record["interfaceError"] is None and record["fingerprintComplete"] and record["role"] != 40
                and record["role"] not in VIRTUAL_ROLES and {8, 24} <= record["states"]
                and set(record["unstableReasons"]) <= {"virtual"}
                and not record["states"] & {27, 28, 31, 43})
    try:
        if record["interfaceError"] or not all(interface_name(value) for value in record["interfaces"]):
            raise BusError(record["interfaceError"] or "invalid-interface", "Native interfaces are unavailable or invalid")
        if (reason is None or observed) and A + "Action" in record["interfaces"]:
            count = context.property(record["owner"], record["path"], A + "Action", "NActions")
            if type(count) is not int or not 0 <= count <= LIMITS["actions"]:
                raise BusError("action-limit", "Native action count exceeds limit")
            for index in range(count):
                name = context.call(record["owner"], record["path"], A + "Action", "GetName", "(i)", (index,), "(s)")[0]
                if not name or len(name) > LIMITS["field"] or any(action["name"] == name for action in record["actions"]):
                    raise BusError("action-ambiguous", "Native action name is unavailable or ambiguous")
                record["actions"].append({"id": f"a:{observation}:{token_hex(8)}", "name": name, "index": index})
    except BusError as error:
        if error.code in ("cancelled", "timeout", "read-budget"):
            raise
        reason, observed, record["unstable"], record["actions"] = error.code[:64], False, True, []
        if error.code == "invalid-interface":
            record["interfaces"] = []
        _reason(result, error.code)
    action = reason or (None if record["actions"] else "action-unavailable")
    editable = reason or ("read-only" if 43 in record["states"] or 7 not in record["states"] else (
               None if {A + "EditableText", A + "Text"} <= set(record["interfaces"]) else "editable-text-unavailable"))
    return {"action": {"supported": action is None, "reason": action or "advertised-native-action"},
            "observedAction": {"supported": observed and bool(record["actions"]),
                               "reason": "explicit-observed-mode; logical-identity-unverified"},
            "type": {"supported": editable is None, "reason": editable or "editable-text-with-verification"},
            "keyboardType": {"supported": reason is None and record["role"] in (61, 79)
                             and {7, 8, 24, 25} <= record["states"] and 43 not in record["states"]
                             and {A + "Text", A + "Component"} <= set(record["interfaces"])
                             and bool(os.environ.get("DISPLAY")) and not os.environ.get("WAYLAND_DISPLAY"),
                              "reason": reason or "explicit-x11-mode; fresh-focus-validation-required"},
            "text": {"supported": record["role"] != 40 and A + "Text" in record["interfaces"],
                     "reason": record["interfaceError"] or ("protected" if record["role"] == 40 else (
                     "bounded-native-text" if A + "Text" in record["interfaces"] else "text-unavailable"))}}


def _text(context, record, item, result, state, offset, remaining, count, anchor):
    unit = _unit(context, record["owner"])
    if state["text"] and state["text"].get("unit", unit) != unit:
        raise BusError("cursor-stale", "Observed native text position units changed")
    length = context.property(record["owner"], record["path"], A + "Text", "CharacterCount")
    if type(length) is not int or not 0 <= length < 2**31:
        raise BusError("protocol-error", "Invalid native text length")
    if offset > length:
        raise BusError("invalid-text-offset", "Native text offset exceeds the control's character count")
    end = max(offset, min(length, offset + remaining * (2 if unit == "utf-16" else 1)))
    if unit == "utf-16":
        if _split(context, record, offset, length):
            raise BusError("invalid-text-offset", "Native text offset splits a UTF-16 supplementary scalar")
        if _split(context, record, end, length):
            end -= 1
    text = _range(context, record, offset, end, unit)
    if unit == "utf-16":
        text = text[:remaining]
        end = offset + len(text.encode("utf-16-le")) // 2
    item.update(text=text, textOffset=offset, textEnd=end, textLength=length, textUnit=unit, textTruncated=end < length)
    state["textStarted"] = True
    state["text"] = {"anchor": anchor, "offset": end, "count": count, "length": length,
                     "depth": item["depth"], "unit": unit} if end < length else None
    if end < length:
        _reason(result, "text-limit")


def _unit(context, owner):
    if owner not in context.text_units:
        try:
            toolkit = context.property(owner, ROOT, A + "Application", "ToolkitName")
        except BusError as error:
            if error.code in ("cancelled", "timeout", "read-budget"):
                raise
            toolkit = None
        context.text_units[owner] = "utf-16" if toolkit == "Qt" else "native"
    return context.text_units[owner]


def _range(context, record, start, end, unit):
    text = context.call(record["owner"], record["path"], A + "Text", "GetText", "(ii)", (start, end), "(s)")[0] if start < end else ""
    if not isinstance(text, str) or len(text) > end - start:
        raise BusError("protocol-error", "Native text exceeded requested position range")
    if not text_length_matches(text, end - start) or (unit == "utf-16" and len(text.encode("utf-16-le")) // 2 != end - start):
        raise BusError("text-changed", "Native text changed during the bounded read")
    return text


def _split(context, record, position, length):
    if not 0 < position < length:
        return False
    text = _range(context, record, position - 1, position + 1, "utf-16")
    return len(text) == 1 and ord(text) > 0xFFFF


def _anchors(context, state, *, expanding=False):
    try:
        if not expanding:
            for handle in state["roots"]:
                context.require_owned(handle)
        # Deferred roots are separate ancestry chains, never siblings on one DFS
        # stack. Their count is bounded by the confirmed root catalogue.
        chains = [[state["deferred"][0]]] if expanding else [
            [*state["stack"], *([state["text"]["anchor"]] if state["text"] else [])],
            *[[anchor] for anchor in state["deferred"]]]
        for chain in chains:
            inherited = set(state["rootReasons"])
            for index, anchor in enumerate(chain):
                within = chain[index - 1] if index and "count" in anchor else None
                fresh = fingerprint(context, anchor, within)
                # Read-only continuation can compare a bounded full-name digest while
                # mutation refs still reject the incomplete visible fingerprint.
                if ((not fresh["fingerprintComplete"] and fresh["nameDigest"] is None)
                        or fresh["nameDigest"] != anchor.get("nameDigest")
                        or any(fresh[key] != anchor[key] for key in ("role", "name", "parent", "scopeDepth"))):
                    fields = [key for key in ("role", "name", "parent", "scopeDepth") if fresh[key] != anchor[key]]
                    raise BusError("cursor-stale", "Native continuation fingerprint changed: " + ",".join(fields if fresh["fingerprintComplete"] else ["incomplete", *fields]))
                if index == 0:
                    inherited.update(ancestry_reasons(context, fresh))
                inherited.update(fresh["unstableReasons"])
                anchor["unstableReasons"] = sorted(set(anchor["unstableReasons"]) | inherited)
                anchor["unstable"] |= bool(anchor["unstableReasons"])
                if "count" in anchor:
                    count = context.property(anchor["owner"], anchor["path"], A + "Accessible", "ChildCount")
                    if count != anchor["count"]:
                        raise BusError("cursor-stale", "Native continuation child count changed")
                    if anchor["last"] is not None:
                        child = context.call(anchor["owner"], anchor["path"], A + "Accessible", "GetChildAtIndex",
                                             "(i)", (anchor["index"] - 1,), "((so))")[0]
                        if (child[0] or anchor["owner"], child[1]) != anchor["last"]:
                            raise BusError("cursor-stale", "Native continuation child anchor changed")
        if not expanding and state["text"]:
            anchor = state["text"]["anchor"]
            if context.property(anchor["owner"], anchor["path"], A + "Accessible", "ChildCount") != state["text"]["count"]:
                raise BusError("cursor-stale", "Native text anchor children changed")
            if "length" in state["text"] and context.property(anchor["owner"], anchor["path"], A + "Text", "CharacterCount") != state["text"]["length"]:
                raise BusError("cursor-stale", "Native continuation text length changed")
    except BusError as error:
        if error.code in ("cancelled", "timeout", "read-budget", "cursor-stale"):
            raise
        raise BusError("cursor-stale", "Native continuation scope or liveness changed: " + error.code) from error

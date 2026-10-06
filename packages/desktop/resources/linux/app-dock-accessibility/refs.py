"""Current observations, not logical dataset identities or atomic object fences."""

from copy import deepcopy
from hashlib import sha256
import json
from secrets import token_hex
from threading import Lock
from time import monotonic

from bus import BusError
from context import A, LIMITS, interface_name, states

VIRTUAL_ROLES = {31, 32, 55, 56, 65, 66, 90, 91}
INSTABILITY = {"virtual", "stale", "transient", "fingerprint", "interface", "protected"}
SCOPE_FIELDS = ("bindingID", "bindingEpoch", "dock", "runtime", "appID", "launchEpoch",
                "ownershipRevision", "processIdentities", "roots")
SCOPE_KINDS = ("application", "workspace")


def scope_kind(binding):
    kind = binding.get("scopeKind", "application")
    if not isinstance(kind, str) or kind not in SCOPE_KINDS:
        raise BusError("wrong-scope", "Unsupported native scope kind")
    return kind


def scope(binding):
    if not isinstance(binding, dict) or any(key not in binding for key in SCOPE_FIELDS):
        raise BusError("wrong-scope", "Incomplete native binding identity")
    return sha256(json.dumps({**{key: binding[key] for key in SCOPE_FIELDS},
                              "scopeKind": scope_kind(binding)}, sort_keys=True).encode()).hexdigest()


def fingerprint(context, handle, within=None):
    """Wire evidence. Protected providers' names are never requested.

    Roots and refs (no `within`) are always fresh; indexed traversal children may
    come from the request's fenced, event-invalidated cache."""
    evidence = context.require_owned(handle) if within is None else {"scopeDepth": within["scopeDepth"] + 1}
    if within is not None and (handle["owner"] != within["owner"] or evidence["scopeDepth"] >= LIMITS["depth"]):
        raise BusError("wrong-scope", "Indexed child leaves its request-owned ancestry")
    owner, path = handle["owner"], handle["path"]
    fetch = lambda: _facts(context, owner, path)
    role, live, name, parent, interfaces, error = fetch() if within is None else context.cached(
        owner, path, "facts", fetch, keep=lambda facts: facts[5] is None and not facts[1] & {27, 28, 31})
    live, interfaces = set(live), list(interfaces)
    if within is not None and (parent[0] or owner, parent[1]) != (within["owner"], within["path"]):
        raise BusError("wrong-scope", "Indexed child parent differs from its request-owned traversal anchor")
    reasons = instability(role, live, len(name) <= LIMITS["field"], error)
    return {"owner": owner, "path": path, "role": role, "name": name[:LIMITS["field"]],
            "nameDigest": sha256(name.encode()).hexdigest() if LIMITS["field"] < len(name) <= LIMITS["text"] else None,
            "parent": (parent[0] or owner, parent[1]), "states": live, "interfaces": interfaces, "actions": [],
            "unstable": bool(reasons), "unstableReasons": reasons,
            "fingerprintComplete": len(name) <= LIMITS["field"], "scopeDepth": evidence["scopeDepth"], "interfaceError": error}


def _facts(context, owner, path):
    role = context.call(owner, path, A + "Accessible", "GetRole", reply="(u)")[0]
    live = states(context.call(owner, path, A + "Accessible", "GetState", reply="(au)")[0])
    if 6 in live:
        raise BusError("defunct", "Native object is defunct")
    name = "" if role == 40 else context.property(owner, path, A + "Accessible", "Name")
    parent = context.property(owner, path, A + "Accessible", "Parent")
    if (not isinstance(name, str) or not isinstance(parent, (tuple, list)) or len(parent) != 2
            or not all(isinstance(value, str) and len(value) <= LIMITS["field"] for value in parent)
            or len(owner) > LIMITS["field"] or len(path) > LIMITS["field"]):
        raise BusError("field-limit", "Native fingerprint exceeds bounded fields")
    error, interfaces = None, []
    try:
        interfaces = context.call(owner, path, A + "Accessible", "GetInterfaces", reply="(as)")[0]
        if len(interfaces) > 16:
            raise BusError("field-limit", "Native interface count exceeds limit")
        if not all(interface_name(value) for value in interfaces):
            raise BusError("invalid-interface", "Native interface names violate D-Bus grammar")
    except BusError as failure:
        if failure.code in ("cancelled", "timeout", "read-budget"):
            raise
        error, interfaces = failure.code[:64], []
    return role, frozenset(live), name, tuple(parent), tuple(interfaces), error


class TreeCache:
    """Traversal facts per exporter, dropped by that exporter's AT-SPI change events.

    Only exporters whose change events were registered are enabled. A request may
    read an exporter's entries only after RequestContext.fence. A fetch that raced
    an invalidation of its path is never stored. The TTL bounds staleness for an
    exporter that drops events; it never touches refs, roots or mutation checks.
    """

    # Covers a whole-tree scan plus the confirming rescan of one locate-and-act call.
    TTL = 120

    def __init__(self, limit=LIMITS["cache"]):
        self.limit, self._lock, self._owners = limit, Lock(), {}

    def enable(self, owner):
        with self._lock:
            self._owners.setdefault(owner, {"seq": 0, "floor": 0, "stamps": {}, "nodes": {}})

    def disable(self, owner):
        with self._lock:
            self._owners.pop(owner, None)

    def enabled(self, owner):
        with self._lock:
            return owner in self._owners

    def invalidate(self, owner, path=None):
        """GLib-thread safe; constant work per event."""
        with self._lock:
            entry = self._owners.get(owner)
            if entry is None:
                return
            entry["seq"] += 1
            if path is None or len(entry["stamps"]) >= self.limit:
                entry.update(floor=entry["seq"], stamps={}, nodes={})
                return
            entry["stamps"][path] = entry["seq"]
            entry["nodes"].pop(path, None)

    def mark(self, owner):
        with self._lock:
            entry = self._owners.get(owner)
            return None if entry is None else entry["seq"]

    def get(self, owner, path, field):
        with self._lock:
            entry = self._owners.get(owner)
            value = entry and entry["nodes"].get(path, {}).get(field)
        return value[0] if value and monotonic() - value[1] < self.TTL else None

    def put(self, owner, path, field, value, seen):
        with self._lock:
            entry = self._owners.get(owner)
            if entry is None or seen is None or seen < entry["floor"] or entry["stamps"].get(path, 0) > seen:
                return
            if path not in entry["nodes"] and sum(len(item["nodes"]) for item in self._owners.values()) >= self.limit:
                entry["nodes"].clear()
            entry["nodes"].setdefault(path, {})[field] = (value, monotonic())


def instability(role, live, complete=True, error=None):
    return sorted(({"virtual"} if role in VIRTUAL_ROLES or 31 in live else set())
                  | ({"stale"} if 27 in live else set()) | ({"transient"} if 28 in live else set())
                  | ({"fingerprint"} if not complete else set()) | ({"interface"} if error else set())
                  | ({"protected"} if role == 40 else set()))


def ancestry_reasons(context, record):
    """Bounded fresh ancestry evidence; virtual ancestry never masks other failures."""
    current, reasons, seen = record, set(record["unstableReasons"]), set()
    for _ in range(LIMITS["depth"]):
        reasons.update(current["unstableReasons"])
        if any(root["owner"] == current["owner"] and root["path"] == current["path"] for root in context.binding["roots"]):
            if current["role"] not in (16, 23, 69):
                raise BusError("wrong-scope", "Native window role changed")
            return sorted(reasons)
        owner, path = current["parent"]
        if owner != record["owner"] or path in seen or path == "/org/a11y/atspi/null":
            raise BusError("wrong-scope", "Native ancestry changed")
        seen.add(path)
        role = context.call(owner, path, A + "Accessible", "GetRole", reply="(u)")[0]
        live = states(context.call(owner, path, A + "Accessible", "GetState", reply="(au)")[0])
        if 6 in live:
            raise BusError("defunct", "Native ancestor is defunct")
        parent = context.property(owner, path, A + "Accessible", "Parent")
        if len(parent) != 2 or any(len(value) > LIMITS["field"] for value in parent):
            raise BusError("field-limit", "Native ancestry exceeds bounded fields")
        name = "" if role == 40 else context.property(owner, path, A + "Accessible", "Name")
        complete = isinstance(name, str) and len(name) <= LIMITS["field"]
        try:
            interfaces = context.call(owner, path, A + "Accessible", "GetInterfaces", reply="(as)")[0]
            error = not isinstance(interfaces, (list, tuple)) or len(interfaces) > 16 or not all(interface_name(value) for value in interfaces)
        except BusError as failure:
            if failure.code in ("cancelled", "timeout", "read-budget"):
                raise
            error = True
        current = {"owner": owner, "path": path, "role": role, "parent": (parent[0] or owner, parent[1]),
                   "unstableReasons": instability(role, live, complete, error)}
    raise BusError("ownership-unresolved", "Native ancestry exceeds depth limit")


def virtual_ancestry(context, record):
    return bool(ancestry_reasons(context, record))


class RefRegistry:
    def __init__(self, helper_epoch):
        self.helper = sha256(str(helper_epoch).encode()).hexdigest()[:16]
        self._lock, self._bindings, self._cursors = Lock(), {}, {}

    def _entry(self, binding):
        entry = self._bindings.get(binding["bindingID"])
        if entry is None or entry["scope"] != scope(binding):
            raise BusError("wrong-scope", "Native observation belongs to another binding")
        return entry

    def _prune(self):
        for token, cursor in tuple(self._cursors.items()):
            entry = self._bindings.get(cursor["bindingID"])
            if monotonic() >= cursor["expires"] or entry is None or entry["dirty"]:
                del self._cursors[token]

    def register(self, binding):
        """Sole allocator, called only by confirmed binding admission."""
        identity = scope(binding)
        with self._lock:
            if binding["bindingID"] in self._bindings:
                self._entry(binding)
                return
            if len(self._bindings) >= LIMITS["bindings"]:
                raise BusError("read-budget", "Native binding capacity exhausted")
            self._bindings[binding["bindingID"]] = {"scope": identity, "epoch": binding["bindingEpoch"], "refs": {}, "dirty": False}

    def begin(self, binding):
        """Reset a registered observation; never resurrect closed bindings."""
        with self._lock:
            self._prune()
            entry = self._entry(binding)
            for token, cursor in tuple(self._cursors.items()):
                if cursor["bindingID"] == binding["bindingID"]:
                    del self._cursors[token]
            entry.update(refs={}, dirty=False, observation=f"{self.helper}:{entry['scope'][:16]}:{token_hex(12)}")
            return entry["observation"]

    def check(self, binding, observation):
        with self._lock:
            entry = self._entry(binding)
            if entry["dirty"] or entry.get("observation") != observation:
                raise BusError("stale-ref", "Native observation was invalidated")

    def issue(self, binding, record):
        """Return opaque n: ref; record has owner/path/role/name/parent/states/interfaces/actions/unstable."""
        if (set(record) - {"owner", "path", "role", "name", "nameDigest", "parent", "states", "interfaces", "actions", "unstable", "unstableReasons", "fingerprintComplete", "scopeDepth", "interfaceError"}
                or type(record["role"]) is not int or not 0 <= record["role"] < 2**32
                or type(record["scopeDepth"]) is not int or not 0 <= record["scopeDepth"] < LIMITS["depth"]
                or type(record["unstable"]) is not bool or type(record["fingerprintComplete"]) is not bool
                or (record.get("nameDigest") is not None and (not isinstance(record["nameDigest"], str) or len(record["nameDigest"]) != 64
                    or any(value not in "0123456789abcdef" for value in record["nameDigest"])))
                or not isinstance(record["unstableReasons"], list) or len(record["unstableReasons"]) > len(INSTABILITY)
                or any(reason not in INSTABILITY for reason in record["unstableReasons"])
                or (record["interfaceError"] is not None and (not isinstance(record["interfaceError"], str)
                    or not record["interfaceError"].isascii() or len(record["interfaceError"]) > 64))
                or any(not isinstance(record[key], str) or len(record[key]) > LIMITS["field"] for key in ("owner", "path", "name"))
                or len(record["parent"]) != 2 or any(not isinstance(value, str) or len(value) > LIMITS["field"] for value in record["parent"])
                or len(record["states"]) > 64 or any(type(value) is not int or not 0 <= value < 64 for value in record["states"])
                or len(record["actions"]) > LIMITS["actions"] or len(record["interfaces"]) > 16
                or not all(interface_name(value) for value in record["interfaces"])
                or any(set(action) != {"id", "name", "index"} or type(action["index"]) is not int
                       or not 0 <= action["index"] < LIMITS["actions"] or any(not isinstance(action[key], str)
                       or len(action[key]) > LIMITS["field"] for key in ("id", "name")) or not action["id"].isascii() for action in record["actions"])):
            raise BusError("field-limit", "Native record exceeds bounded fields")
        with self._lock:
            entry = self._entry(binding)
            if entry["dirty"] or "observation" not in entry:
                raise BusError("stale-ref", "Native observation was invalidated")
            if len(entry["refs"]) >= LIMITS["refs"]:
                raise BusError("read-budget", "Native ref capacity exhausted")
            ref = f"n:{entry['observation']}:{token_hex(8)}"
            entry["refs"][ref] = deepcopy(record)
            return ref

    def resolve(self, ref, context):
        """Fresh ownership/liveness/fingerprint check; return the issued record."""
        with self._lock:
            entry = self._entry(context.binding)
            record = entry["refs"].get(ref) if isinstance(ref, str) else None
            if entry["dirty"] or record is None:
                raise BusError("stale-ref", "Native ref is not in the current observation")
            observation = entry["observation"]
            record = deepcopy(record)
        fresh = fingerprint(context, record)
        if (not record.get("fingerprintComplete", True) or not fresh["fingerprintComplete"]
                or any(fresh[key] != record[key] for key in ("role", "name", "parent", "scopeDepth"))):
            if context.cache is not None:
                # A ref drifted from its read: whatever the exporter failed to announce goes.
                context.cache.invalidate(record["owner"])
            raise BusError("stale-ref", "Native role, name, parent or ownership depth changed")
        if fresh["interfaceError"] or not all(interface_name(value) for value in fresh["interfaces"]):
            raise BusError(fresh["interfaceError"] or "invalid-interface", "Fresh native interfaces are unavailable or invalid")
        reasons = sorted(set(record["unstableReasons"]) | set(ancestry_reasons(context, fresh)))
        self.check(context.binding, observation)
        return {**record, "states": fresh["states"], "interfaces": fresh["interfaces"], "scopeDepth": fresh["scopeDepth"],
                 "unstable": record["unstable"] or bool(reasons), "unstableReasons": reasons}

    def invalidate(self, binding, reason="mutation"):
        """Consume refs and cursors, including unknown mutation outcomes."""
        with self._lock:
            if binding["bindingID"] not in self._bindings:
                return
            entry = self._entry(binding)
            entry.update(refs={}, dirty=True)
            for token, cursor in tuple(self._cursors.items()):
                if cursor["bindingID"] == binding["bindingID"]:
                    del self._cursors[token]

    def mark_dirty(self, binding, reason):
        """Thread-safe, constant-size event invalidation; no callback traversal."""
        with self._lock:
            entry = self._bindings.get(binding["bindingID"])
            if entry is not None and entry["epoch"] == binding["bindingEpoch"]:
                entry["dirty"] = True

    def cursor(self, binding, state):
        """Bounded opaque cursor for one live indexed DFS traversal state."""
        if (len(state["stack"]) > LIMITS["depth"] or len(state["roots"]) > LIMITS["roots"]
                or len(json.dumps(state)) > LIMITS["frameBytes"]):
            raise BusError("read-budget", "Native continuation state exceeds limits")
        with self._lock:
            self._prune()
            entry = self._entry(binding)
            if entry["dirty"]:
                raise BusError("cursor-stale", "Native continuation was invalidated")
            if sum(cursor["bindingID"] == binding["bindingID"] for cursor in self._cursors.values()) >= LIMITS["cursors"]:
                raise BusError("cursor-limit", "Native continuation capacity exhausted")
            token = f"c:{entry['observation']}:{token_hex(8)}"
            self._cursors[token] = {"bindingID": binding["bindingID"], "scope": entry["scope"],
                                    "expires": monotonic() + 10, "state": deepcopy(state)}
            return token

    def resume(self, binding, token):
        """Consume, validate and return saved continuation; wrong epoch/dirty => cursor-stale."""
        with self._lock:
            try:
                entry = self._entry(binding)
            except BusError as error:
                raise BusError("cursor-stale", "Native cursor belongs to another binding epoch") from error
            cursor = self._cursors.get(token) if isinstance(token, str) else None
            if cursor is None or cursor["scope"] != entry["scope"]:
                raise BusError("cursor-stale", "Native cursor belongs to another observation or binding")
            del self._cursors[token]
            if entry["dirty"] or monotonic() >= cursor["expires"]:
                raise BusError("cursor-stale", "Native continuation expired or was invalidated")
            return cursor["state"]

    def close(self, binding):
        """Release all binding state, including continuation state."""
        with self._lock:
            if binding["bindingID"] not in self._bindings:
                return
            self._entry(binding)
            del self._bindings[binding["bindingID"]]
            for token, cursor in tuple(self._cursors.items()):
                if cursor["bindingID"] == binding["bindingID"]:
                    del self._cursors[token]

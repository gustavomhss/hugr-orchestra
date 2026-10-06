"""Host-confirmed concrete windows; the helper never confirms its own proposals."""

from copy import deepcopy
from secrets import token_hex
from threading import RLock
from time import monotonic

from bus import BusError
from context import A, DBUS, LIMITS, ROOT, WINDOW_ROLES, RequestContext, process_identity
from refs import TreeCache, scope_kind


def word(value):
    return isinstance(value, str) and 0 < len(value) <= LIMITS["field"]


def handle(value):
    return (isinstance(value, dict) and word(value.get("owner")) and value["owner"].startswith(":")
            and word(value.get("path")) and value["path"].startswith("/") and value["path"] != ROOT
            and value["path"] != "/org/a11y/atspi/null")


class BindingStore:
    def __init__(self, bus, registry, session_id):
        self.bus, self.registry, self.session_id = bus, registry, session_id
        self.bindings, self.proposals, self.subscriptions = {}, {}, {}
        self.registered_owners = set()
        self.cache = TreeCache()
        self._lifecycle = RLock()

    def get(self, binding_id, epoch):
        with self._lifecycle:
            binding = self.bindings.get(binding_id)
            if binding is None or binding["bindingEpoch"] != epoch:
                raise BusError("stale-binding", "Native binding is no longer current")
            return binding

    def discover(self, args, timeout_ms, cancelled):
        identity, target = _target(args, self.session_id)
        context = RequestContext(self.bus, self.registry, {**target, "roots": []}, timeout_ms, cancelled)
        with self._lifecycle:
            context.remaining()
            self.proposals = {key: value for key, value in self.proposals.items() if value["expires"] > monotonic()}
            if len(self.proposals) >= LIMITS["proposals"] or len(self.bindings) >= LIMITS["bindings"]:
                raise BusError("busy", "Native binding/proposal capacity exhausted")
        registry = context.owner("org.a11y.atspi.Registry")
        count = context.property(registry, ROOT, A + "Accessible", "ChildCount")
        if type(count) is not int or not 0 <= count <= LIMITS["roots"]:
            raise BusError("ownership-unresolved", "Accessible application discovery exceeds indexed budget")
        roots = []
        for index in range(count):
            ref = context.call(registry, ROOT, A + "Accessible", "GetChildAtIndex", "(i)", (index,), "((so))")[0]
            if ref[1] == "/org/a11y/atspi/null":
                continue
            owner = ref[0] if ref[0].startswith(":") else context.owner(ref[0])
            pid = context.call(DBUS, "/org/freedesktop/DBus", DBUS, "GetConnectionUnixProcessID", "(s)", (owner,), "(u)")[0]
            matching = next((p for p in target["processIdentities"] if p["pid"] == pid), None)
            if matching is None:
                continue
            if any(matching[key] != value for key, value in process_identity(pid).items()):
                raise BusError("wrong-scope", "Owned launch process identity changed")
            if ref[1] != ROOT or context.call(owner, ROOT, A + "Accessible", "GetRole", reply="(u)")[0] != 75:
                raise BusError("ownership-unresolved", "Exporter application root is unprovable")
            windows = context.property(owner, ROOT, A + "Accessible", "ChildCount")
            if type(windows) is not int or not 0 <= windows <= LIMITS["roots"]:
                raise BusError("ownership-unresolved", "Accessible window discovery exceeds budget")
            for child_index in range(windows):
                child = context.call(owner, ROOT, A + "Accessible", "GetChildAtIndex", "(i)", (child_index,), "((so))")[0]
                if child[0] not in ("", owner) or child[1] == "/org/a11y/atspi/null":
                    continue
                role = context.call(owner, child[1], A + "Accessible", "GetRole", reply="(u)")[0]
                if role not in WINDOW_ROLES:
                    continue
                root = {"owner": owner, "path": child[1]}
                context.binding["roots"] = [root]
                context.require_owned(root)
                parent = context.property(owner, child[1], A + "Accessible", "Parent")
                if parent[0] not in ("", owner) or parent[1] != ROOT:
                    raise BusError("ownership-unresolved", "Proposed window left its application root")
                name = context.property(owner, child[1], A + "Accessible", "Name")
                if not isinstance(name, str) or len(name) > LIMITS["field"] or not handle(root):
                    raise BusError("ownership-unresolved", "Window proposal exceeds bounded identity fields")
                roots.append({**root, "name": name, "role": role})
                if len(roots) > LIMITS["roots"]:
                    raise BusError("ownership-unresolved", "Window proposal capacity exhausted")
        if not roots:
            raise BusError("not-ready", "Owned application has no nonempty accessible window proposal")
        proposal_id = token_hex(16)
        self.proposals[proposal_id] = {"dock": identity, "target": target, "roots": roots, "expires": monotonic() + 10}
        return {"status": "proposal", "proposalID": proposal_id, "roots": deepcopy(roots)}

    def confirm(self, args, timeout_ms, cancelled):
        if set(args) != {"phase", "proposalID", "roots", "ownershipRevision"} or not word(args.get("proposalID")):
            raise BusError("protocol-error", "Invalid native confirmation")
        proposal = self.proposals.pop(args["proposalID"], None)
        if proposal is None or proposal["expires"] <= monotonic():
            raise BusError("stale-proposal", "Native root proposal expired or was consumed")
        roots, target = args["roots"], proposal["target"]
        if (type(args["ownershipRevision"]) is not int or args["ownershipRevision"] != target["ownershipRevision"]
                or not isinstance(roots, list) or not 1 <= len(roots) <= LIMITS["roots"] or not all(handle(root) for root in roots)
                or len({(root["owner"], root["path"]) for root in roots}) != len(roots)):
            raise BusError("ownership-unresolved", "Runtime confirmation requires current concrete roots")
        if not all(any(all(root[key] == item[key] for key in ("owner", "path")) for item in proposal["roots"]) for root in roots):
            raise BusError("wrong-scope", "Confirmed roots are outside the native proposal")
        if target.get("roots") and not all(root in target["roots"] for root in roots):
            raise BusError("wrong-scope", "Confirmed roots are outside runtime window evidence")
        binding = {**target, "dock": proposal["dock"], "roots": deepcopy(roots),
                   "bindingID": token_hex(16), "bindingEpoch": token_hex(16)}
        context = RequestContext(self.bus, self.registry, binding, timeout_ms, cancelled)
        for root in roots:
            context.require_owned(root)
            item = next(item for item in proposal["roots"] if all(item[key] == root[key] for key in ("owner", "path")))
            if (context.call(root["owner"], root["path"], A + "Accessible", "GetRole", reply="(u)")[0] != item["role"]
                    or context.property(root["owner"], root["path"], A + "Accessible", "Name") != item["name"]):
                raise BusError("stale-proposal", "Proposed window changed before confirmation")
        owners = {root["owner"] for root in roots}
        with self._lifecycle:
            context.remaining()
            if proposal["expires"] <= monotonic():
                raise BusError("stale-proposal", "Native root proposal expired before admission")
            if len(self.bindings) >= LIMITS["bindings"]:
                raise BusError("busy", "Native binding capacity exhausted")
            if len(self.registered_owners | owners) > 16:
                raise BusError("busy", "Lifecycle registration epoch capacity exhausted; recreate helper")
            self.registry.register(binding)
            try:
                self.registry.begin(binding)
                self.bindings[binding["bindingID"]] = binding
                for owner in owners:
                    context.remaining()
                    if owner not in self.subscriptions:
                        self.subscriptions[owner] = self.bus.subscribe_lifecycle(owner, self.dirty)
                        self.registered_owners.add(owner)
                        if self.subscriptions[owner].get("changes") == "registered":
                            self.cache.enable(owner)
                    context.remaining()
            except BusError:
                self.unbind(binding)
                raise
        return {key: binding[key] for key in ("bindingID", "bindingEpoch", "appID", "launchEpoch")}

    def dirty(self, kind, owner, path):
        # At most eight bindings; no accessible traversal in the GLib callback.
        # Do not take _lifecycle: confirmation can hold it while awaiting Gio.
        self.cache.invalidate(owner, None if kind == "owner-loss" else path)
        if kind == "changed":
            return  # Ordinary UI changes keep refs; resolution re-reads them fresh.
        for binding in tuple(self.bindings.values()):
            if any(root["owner"] == owner for root in binding["roots"]):
                self.registry.mark_dirty(binding, kind)

    def unbind(self, binding):
        with self._lifecycle:
            self.bindings.pop(binding["bindingID"], None)
            self.registry.close(binding)
            live = {root["owner"] for item in self.bindings.values() for root in item["roots"]}
            for owner in tuple(self.subscriptions):
                if owner not in live:
                    self.cache.disable(owner)
                    self.bus.unsubscribe_lifecycle(self.subscriptions.pop(owner))


def _target(args, session_id):
    if set(args) != {"phase", "identity", "target"} or not isinstance(args.get("identity"), dict) or not isinstance(args.get("target"), dict):
        raise BusError("protocol-error", "Invalid native discovery")
    identity, target = deepcopy(args["identity"]), deepcopy(args["target"])
    target["scopeKind"] = scope_kind(target)
    if (set(identity) != {"senderID", "tabID", "generation", "profileID"}
            or any(type(identity[key]) is not int or not 1 <= identity[key] < 2**53 for key in ("senderID", "generation"))
            or not all(word(identity[key]) for key in ("tabID", "profileID"))):
        raise BusError("wrong-scope", "Complete Dock identity is required")
    runtime = target.get("runtime")
    if (not isinstance(runtime, dict) or set(runtime) != {"runtimeID", "runtimeEpoch", "accessibilitySessionID"}
            or not all(word(value) for value in runtime.values()) or runtime["accessibilitySessionID"] != session_id
            or not all(word(target.get(key)) for key in ("appID", "launchEpoch"))
            or type(target.get("ownershipRevision")) is not int or not 0 <= target["ownershipRevision"] < 2**53):
        raise BusError("wrong-scope", "Complete matching runtime launch identity is required")
    processes = target.get("processIdentities")
    if not isinstance(processes, list) or not 1 <= len(processes) <= LIMITS["processes"]:
        raise BusError("ownership-unresolved", "Bounded process identity set is required")
    for process in processes:
        if (not isinstance(process, dict) or any(type(process.get(key)) is not int or not 1 <= process[key] < 2**53 for key in ("pid", "startTicks"))
                or not all(word(process.get(key)) for key in ("bootID", "pidNamespace", "mountNamespace"))):
            raise BusError("ownership-unresolved", "Process start/boot/namespace identity is required")
    if len({process["pid"] for process in processes}) != len(processes):
        raise BusError("ownership-unresolved", "Duplicate owned process identity")
    if target["scopeKind"] == "workspace":
        if target["appID"] != "workspace" or target["launchEpoch"] != runtime["accessibilitySessionID"]:
            raise BusError("wrong-scope", "Workspace target must identify the accessibility session")
        if any(process[key] != processes[0][key] for process in processes
               for key in ("bootID", "pidNamespace", "mountNamespace")):
            raise BusError("wrong-scope", "Workspace process identities must share one boot and namespace realm")
    if "roots" in target and (not isinstance(target["roots"], list) or not 1 <= len(target["roots"]) <= LIMITS["roots"] or not all(handle(root) for root in target["roots"])):
        raise BusError("ownership-unresolved", "Invalid runtime window evidence")
    return identity, target

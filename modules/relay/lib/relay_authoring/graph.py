"""Compile authored workflow graphs into Relay sprints without reinterpreting control bytes."""
from __future__ import annotations

import copy
import json
import math

from .config import AuthoringError

KINDS = {
    "execute": "Run task",
    "gate": "Check criteria",
    "review": "Review change",
    "inject": "Provide context",
    "human": "Human approval",
}
START_TYPE = "relay.startTrigger"
START_NAME = "Workflow start"


def node_types():
    """Workflow node catalog: labels, ports and parameter defaults for authoring clients."""
    def field(name, label, kind, default, **extra):
        return {"name": name, "label": label, "type": kind, "default": default, **extra}
    entry = [field("relayBrief", "Workflow objective", "text", ""),
             field("relayRetryBudget", "Fixes allowed per step", "number", 3, minimum=0, maximum=99)]
    step = [field("instructions", "Instructions", "text", ""),
            field("skill", "Skill", "skill", ""),
            field("skillMode", "How to use the skill", "options", "combine",
                  options=[{"value": "combine", "label": "Skill plus instructions"}, {"value": "replace", "label": "Skill replaces instructions"}]),
            field("checklist", "Criteria to advance", "json", "[]")]
    context = [field("text", "Context", "text", ""), field("file", "Context file", "string", "")]
    return [{"type": START_TYPE, "label": START_NAME, "inputs": 0, "outputs": ["main"], "maximum": 1, "parameters": entry}] + [
        {"type": "relay." + kind, "label": label, "inputs": 1, "outputs": ["main"], "parameters": step + (context if kind == "inject" else [])}
        for kind, label in KINDS.items()]


def unique_json(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise AuthoringError(f"Duplicate JSON key: {key}")
        value[key] = item
    return value


def loads(text):
    try:
        return json.loads(text, object_pairs_hook=unique_json, parse_constant=lambda value: (_ for _ in ()).throw(AuthoringError(f"Invalid JSON constant: {value}")))
    except (ValueError, UnicodeError) as error:
        raise AuthoringError(f"Invalid JSON: {error}") from error


def string(value, label, *, nonempty=False):
    if not isinstance(value, str) or "\0" in value or (nonempty and not value):
        raise AuthoringError(f"{label} must be {'non-empty ' if nonempty else ''}text without NUL")
    return value


def validate_document(document):
    if not isinstance(document, dict):
        raise AuthoringError("A document must be a JSON object")
    string(document.get("name", ""), "Name", nonempty=True)
    nodes = document.get("nodes", [])
    if not isinstance(nodes, list) or len(nodes) > 1000:
        raise AuthoringError("Nodes must be a list of at most 1000 steps")
    ids, names = set(), set()
    for node in nodes:
        if not isinstance(node, dict):
            raise AuthoringError("Invalid node")
        ident, name = string(node.get("id"), "Node ID", nonempty=True), string(node.get("name"), "Step name", nonempty=True)
        if ident in ids or name in names:
            raise AuthoringError("Node IDs and names must be unique")
        ids.add(ident); names.add(name)
        if not isinstance(node.get("parameters", {}), dict):
            raise AuthoringError("Invalid node parameters")
        position = node.get("position")
        if not isinstance(position, list) or len(position) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in position):
            raise AuthoringError("Invalid canvas position")
        string(node.get("type"), "Step type", nonempty=True)
    if not isinstance(document.get("connections", {}), dict) or not isinstance(document.get("meta", {}), dict):
        raise AuthoringError("Connections and metadata must be objects")
    for outputs in document.get("connections", {}).values():
        if not isinstance(outputs, dict):
            raise AuthoringError("Outputs must be an object of connections")
        for channels in outputs.values():
            if not isinstance(channels, list) or any(not isinstance(channel, list) for channel in channels):
                raise AuthoringError("Channels must be lists of connections")
            for channel in channels:
                for edge in channel:
                    if not isinstance(edge, dict) or type(edge.get("index")) is not int:
                        raise AuthoringError("A connection must declare its port")
                    string(edge.get("node"), "Connection target", nonempty=True)
                    string(edge.get("type"), "Connection type", nonempty=True)
    metadata = document.get("meta", {}).get("relay", {})
    if not isinstance(metadata, dict):
        raise AuthoringError("Relay metadata must be an object")
    retained = metadata.get("sprint", {})
    if not isinstance(retained, dict) or not isinstance(retained.get("work_packages", []), list) or not isinstance(retained.get("macros", []), list):
        raise AuthoringError("The retained sprint must hold lists of steps and phases")
    for collection in (retained.get("work_packages", []), retained.get("macros", [])):
        retained_ids = set()
        for item in collection:
            if not isinstance(item, dict):
                raise AuthoringError("Retained steps and phases must be objects")
            ident = string(item.get("id"), "Retained ID", nonempty=True)
            if ident in retained_ids:
                raise AuthoringError("Retained IDs must be unique")
            retained_ids.add(ident)
    if not isinstance(metadata.get("names", {}), dict):
        raise AuthoringError("Retained names must be an object")
    tags = document.get("tags", [])
    if not isinstance(tags, list):
        raise AuthoringError("Scopes must be a list")
    for tag in tags:
        string(tag.get("id") if isinstance(tag, dict) else tag, "Scope ID", nonempty=True)
    validate_groups(document, ids, {node["id"]: node["name"] for node in nodes})


def validate_groups(document, ids, node_names):
    """Each phase must be one contiguous stretch of the chain; Relay macros are flat scopes."""
    groups = document.get("nodeGroups", [])
    if not isinstance(groups, list):
        raise AuthoringError("Phases must be a list")
    grouped, group_ids = set(), set()
    edges = [(source, edge["node"]) for source, outputs in document.get("connections", {}).items()
             for channel in outputs.get("main", []) for edge in channel]
    for group in groups:
        if not isinstance(group, dict) or not isinstance(group.get("nodeIds"), list):
            raise AuthoringError("Invalid phase")
        ident = string(group.get("id"), "Phase ID", nonempty=True)
        string(group.get("name"), "Phase name", nonempty=True)
        if ident in group_ids:
            raise AuthoringError("Phase IDs must be unique")
        group_ids.add(ident)
        for member in group["nodeIds"]:
            string(member, "Grouped step ID", nonempty=True)
            if member not in ids or member in grouped:
                raise AuthoringError("A step belongs to at most one existing phase")
            grouped.add(member)
        if "description" in group:
            string(group["description"], "Phase protocol")
        members = {node_names[member] for member in group["nodeIds"]}
        if not members:
            continue
        incoming = {name: [] for name in members}
        outgoing = {name: [] for name in members}
        for source, target in edges:
            if source in members and target in members:
                incoming[target].append(source); outgoing[source].append(target)
        roots = [name for name in members if not incoming[name]]
        leaves = [name for name in members if not outgoing[name]]
        valid = len(roots) == len(leaves) == 1 and all(len(incoming[n]) <= 1 and len(outgoing[n]) <= 1 for n in members)
        seen, cursor = set(), roots[0] if valid else None
        while cursor is not None and cursor not in seen:
            seen.add(cursor); cursor = next(iter(outgoing[cursor]), None)
        valid = valid and seen == members and not any(
            (source not in members and target in members and target != roots[0]) or
            (source in members and target not in members and source != leaves[0]) for source, target in edges)
        if not valid:
            raise AuthoringError("A phase must be one contiguous stretch of the sequence. Interleaved phases need distinct phase declarations.", 400, "unsupported-macro-topology")


def project_sprint(name, sprint):
    """Lay a flat sprint out as a chain behind a start node. Duplicate titles get disambiguated node names; IDs stay exact."""
    if not isinstance(sprint, dict) or not isinstance(sprint.get("work_packages"), list):
        raise AuthoringError("Invalid sprint")
    nodes, connections, names = [], {}, set()
    phase_order = list(dict.fromkeys(wp.get("macro") or "" for wp in sprint["work_packages"]))
    phase_counts = {}
    for index, wp in enumerate(sprint["work_packages"]):
        ident = string(wp.get("id"), "WP ID", nonempty=True)
        node_name = wp.get("title") or ident
        while node_name in names:
            node_name += " · " + ident
        names.add(node_name)
        phase = wp.get("macro") or ""
        phase_index = phase_order.index(phase)
        member_index = phase_counts.get(phase, 0)
        phase_counts[phase] = member_index + 1
        nodes.append({"id": ident, "name": node_name, "type": "relay." + wp.get("kind", "execute"), "typeVersion": 1,
                      "position": [240 + phase_index % 2 * 672 + member_index * 224, 240 + phase_index // 2 * 288],
                      "parameters": {"title": wp.get("title", ""), "macro": wp.get("macro") or "", "instructions": wp.get("instructions", ""),
                                     "checklist": json.dumps(wp.get("checklist", []), ensure_ascii=False, indent=2),
                                     "skill": "", "skillMode": "combine", "text": wp.get("text", ""), "file": wp.get("file", "")}})
        if index:
            connections[nodes[index-1]["name"]] = {"main": [[{"node": node_name, "type": "main", "index": 0}]]}
    macros = list(sprint.get("macros", []))
    declared = {m["id"] for m in macros}
    for wp in sprint["work_packages"]:
        if wp.get("macro") and wp["macro"] not in declared:
            macros.append({"id": wp["macro"], "instructions": ""}); declared.add(wp["macro"])
    groups = [{"id": macro["id"], "name": macro.get("title") or macro["id"], "description": macro.get("instructions", ""),
               "nodeIds": [wp["id"] for wp in sprint["work_packages"] if wp.get("macro") == macro["id"]]} for macro in macros]
    document = {"name": name, "nodes": nodes, "connections": connections, "nodeGroups": groups, "tags": [],
                "meta": {"relay": {"schema": 1, "kind": "workflow", "sprint": copy.deepcopy(sprint), "names": {n["id"]: n["name"] for n in nodes}}}}
    if nodes:
        add_start(document, sprint)
    validate_document(document)
    return document


def add_start(document, sprint):
    """The start node carries the objective and retry budget; it is neither a WP nor a phase member."""
    nodes = document["nodes"]
    first = nodes[0]
    ids, names = {n["id"] for n in nodes}, {n["name"] for n in nodes}
    identifier, name = "relay-start", START_NAME
    while identifier in ids: identifier += "-start"
    while name in names: name += " · start"
    nodes.insert(0, {"id": identifier, "name": name, "type": START_TYPE, "typeVersion": 1,
                     "position": [first["position"][0] - 224, first["position"][1]],
                     "parameters": {"relayBrief": sprint.get("brief", ""), "relayRetryBudget": sprint.get("retry_budget", 3)}})
    document["connections"][name] = {"main": [[{"node": first["name"], "type": "main", "index": 0}]]}


def compile_document(document, skill_resolver=None):
    validate_document(document)
    nodes = document["nodes"]
    if not nodes:
        raise AuthoringError("Add at least one step before running")
    ordered = ordered_chain(document)
    metadata = document.get("meta", {}).get("relay", {})
    sprint = copy.deepcopy(metadata.get("sprint", {"brief": document["name"], "gen": 0, "retry_budget": 3, "macros": []}))
    entry = ordered[0].get("parameters", {})
    if ordered[0]["type"] == START_TYPE:
        if any(ordered[0]["id"] in g["nodeIds"] for g in document.get("nodeGroups", [])):
            raise AuthoringError("The workflow start stays outside every phase")
        ordered = ordered[1:]
        if not ordered:
            raise AuthoringError("Add at least one step after the start")
    sprint["brief"] = string(entry.get("relayBrief", sprint.get("brief", document["name"])), "Workflow objective")
    budget = entry.get("relayRetryBudget", sprint.get("retry_budget", 3))
    if type(budget) is not int or not 0 <= budget <= 99:
        raise AuthoringError("The retry budget must be an integer from 0 to 99")
    sprint["retry_budget"] = budget
    previous = {wp["id"]: wp for wp in sprint.get("work_packages", [])}
    grouped = {member: group["id"] for group in document.get("nodeGroups", []) for member in group["nodeIds"]}
    if "nodeGroups" in document:
        macros = {m["id"]: m for m in sprint.get("macros", [])}
        sprint["macros"] = [{**copy.deepcopy(macros.get(g["id"], {})), "id": g["id"], "title": g["name"], "instructions": g.get("description", macros.get(g["id"], {}).get("instructions", ""))} for g in document["nodeGroups"]]
    work_packages, control_ids, bindings = [], set(), []
    for node in ordered:
        kind = node["type"].removeprefix("relay.")
        if not node["type"].startswith("relay.") or kind not in KINDS:
            raise AuthoringError("This node type has no Relay implementation")
        params = node.get("parameters", {})
        wp = copy.deepcopy(previous.get(node["id"], {}))
        checks = params.get("checklist", "[]")
        checks = loads(checks) if isinstance(checks, str) else checks
        if not isinstance(checks, list):
            raise AuthoringError("Criteria must be a JSON list")
        for item in checks:
            if not isinstance(item, dict):
                raise AuthoringError("A criterion must be a JSON object")
            ident = string(item.get("id"), "Criterion ID", nonempty=True)
            if ident in control_ids:
                raise AuthoringError("Criterion IDs must be unique across the workflow")
            control_ids.add(ident)
            for field in ("cmd", "judge", "assert"):
                if field in item and item[field] is not None:
                    string(item[field], field)
        original_title = previous.get(node["id"], {}).get("title", node["name"])
        title = params.get("title", original_title)
        # A renamed node renames its WP unless the author also edited the title separately.
        if node["id"] not in previous or (node["name"] != metadata.get("names", {}).get(node["id"], node["name"]) and title == previous[node["id"]].get("title", "")):
            title = node["name"]
        wp.update(id=node["id"], title=string(title, "Title"), kind=kind,
                  instructions=string(params.get("instructions", ""), "Instructions"), checklist=copy.deepcopy(checks))
        macro = grouped.get(node["id"], "") if "nodeGroups" in document else params.get("macro", "")
        if macro:
            wp["macro"] = string(macro, "Phase")
        elif "nodeGroups" in document or "macro" in params:
            wp.pop("macro", None)
        skill = params.get("skill", "")
        if not isinstance(skill, str):
            raise AuthoringError("Choose at most one skill per step")
        if skill:
            if skill_resolver is None:
                raise AuthoringError("The skill catalog is unavailable")
            resolved = skill_resolver(skill)
            mode = params.get("skillMode", "combine")
            if mode not in ("combine", "replace"):
                raise AuthoringError("Invalid skill mode")
            wp["instructions"] = resolved["content"] if mode == "replace" else resolved["content"] + "\n\n" + wp["instructions"]
            bindings.append({"wp": wp["id"], "skill": resolved["id"], "sha256": resolved["sha256"], "mode": mode, "content": resolved["content"]})
        if kind == "inject":
            wp.update(text=string(params.get("text", ""), "Context"), file=string(params.get("file", ""), "Context file"))
        work_packages.append(wp)
    sprint["work_packages"] = work_packages
    return sprint, bindings


def ordered_chain(document):
    """Directed edges, not array order, define the single sequential chain Relay executes."""
    nodes = document["nodes"]
    by_name = {node["name"]: node for node in nodes}
    incoming, successors = set(), {}
    for source, outputs in document.get("connections", {}).items():
        if source not in by_name or not isinstance(outputs, dict) or set(outputs) - {"main"}:
            raise AuthoringError("Relay does not support this connection")
        channels = outputs.get("main", [])
        if not isinstance(channels, list) or any(not isinstance(c, list) for c in channels) or any(channels[1:]):
            raise AuthoringError("Relay accepts one sequential output per step")
        edges = channels[0] if channels else []
        if len(edges) > 1:
            raise AuthoringError("Remove branches before running the Relay sequence")
        for edge in edges:
            if not isinstance(edge, dict) or edge.get("type") != "main" or type(edge.get("index")) is not int or edge["index"] != 0:
                raise AuthoringError("Invalid port for the Relay sequence")
            target = edge.get("node")
            if target not in by_name or target in incoming:
                raise AuthoringError("A connection points to a missing step or to a step with several inputs")
            incoming.add(target); successors[source] = target
    roots = set(by_name) - incoming
    if len(roots) != 1:
        raise AuthoringError("Connect every step into one sequence")
    ordered, visited, current = [], set(), roots.pop()
    while current is not None:
        if current in visited:
            raise AuthoringError("Relay does not accept cycles between steps")
        visited.add(current); ordered.append(by_name[current]); current = successors.get(current)
    if len(ordered) != len(nodes):
        raise AuthoringError("Some steps are disconnected from the sequence")
    return ordered

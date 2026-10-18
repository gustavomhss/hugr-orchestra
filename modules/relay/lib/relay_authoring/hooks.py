"""Versioned Hook authoring data. Installing hooks on host events belongs to the Orchestra binding."""
import copy

from .config import AuthoringError
from .graph import string, validate_document

EVENT_TYPE = "relay.hookEventTrigger"
CONDITION_TYPE = "relay.hookCondition"
ACTIONS = {
    "remind": "Send reminder",
    "block": "Block",
    "approve": "Ask for approval",
    "verify": "Run check",
    "repair": "Require repair",
    "record": "Record only",
}


def node_types():
    """Hook node catalog: labels, ports and parameter defaults for authoring clients."""
    def choice(name, label, options, default):
        return {"name": name, "label": label, "type": "options", "default": default, "options": [{"value": value, "label": text} for value, text in options]}
    event = {"type": EVENT_TYPE, "label": "Agent event", "inputs": 0, "outputs": ["main"], "maximum": 1, "parameters": [
        choice("operation", "Operation", [("read", "Read file"), ("edit", "Edit file"), ("write", "Create file"), ("command", "Run command")], "edit"),
        choice("timing", "Timing", [("before", "Before the operation"), ("after", "After the operation")], "before"),
    ]}
    condition = {"type": CONDITION_TYPE, "label": "Hook condition", "inputs": 1, "outputs": ["Yes", "No"], "parameters": [
        choice("field", "Field", [("path", "File path"), ("tool", "Tool"), ("command", "Command"), ("event", "Event")], "path"),
        {"name": "pattern", "label": "Matches pattern", "type": "string", "default": "", "placeholder": "src/generated/**"},
    ]}
    actions = [{"type": "relay.hook" + action.title(), "label": label, "inputs": 1, "outputs": [] if action == "block" else ["main"],
                "parameters": [{"name": "message", "label": "Message", "type": "text", "default": ""}] +
                ([{"name": "check", "label": "Check command", "type": "string", "default": ""}] if action == "verify" else [])}
               for action, label in ACTIONS.items()]
    return [event, condition, *actions]


def is_hook(document):
    return document.get("meta", {}).get("relay", {}).get("kind") == "hook" or any(n.get("type", "").startswith("relay.hook") for n in document.get("nodes", []))


def compile_hook(document):
    validate_document(document)
    descriptors = {d["type"]: d for d in node_types()}
    nodes = copy.deepcopy(document["nodes"])
    by_name = {n["name"]: n for n in nodes}
    if not nodes or any(n["type"] not in descriptors for n in nodes):
        raise AuthoringError("Hooks accept an event, conditions and hook actions; do not mix in workflow steps")
    # A client may omit parameters that equal the catalog default; the export carries the resolved values.
    for node in nodes:
        node["parameters"] = {**{p["name"]: p["default"] for p in descriptors[node["type"]]["parameters"]}, **node.get("parameters", {})}
    if not any(n["type"] not in (EVENT_TYPE, CONDITION_TYPE) for n in nodes):
        raise AuthoringError("Add at least one action to the hook")
    triggers = [n for n in nodes if n["type"] == EVENT_TYPE]
    if len(triggers) != 1:
        raise AuthoringError("A hook needs exactly one event")
    event = triggers[0]["parameters"]
    if event.get("operation") not in ("read", "edit", "write", "command") or event.get("timing") not in ("before", "after"):
        raise AuthoringError("Choose the event operation and timing")
    adjacency = {n["name"]: [] for n in nodes}
    connections = []
    for source, outputs in document.get("connections", {}).items():
        if source not in by_name or not isinstance(outputs, dict) or set(outputs) - {"main"}:
            raise AuthoringError("Invalid hook connection")
        channels = outputs.get("main", [])
        if not isinstance(channels, list) or len(channels) > len(descriptors[by_name[source]["type"]]["outputs"]):
            raise AuthoringError("Invalid output port for this action")
        for port, channel in enumerate(channels):
            if not isinstance(channel, list) or len(channel) > 1:
                raise AuthoringError("A hook output accepts one next step")
            for edge in channel:
                if not isinstance(edge, dict) or edge.get("node") not in by_name or edge.get("type") != "main" or type(edge.get("index")) is not int or edge["index"] != 0:
                    raise AuthoringError("Invalid hook target")
                target = edge["node"]
                if target == triggers[0]["name"]:
                    raise AuthoringError("The event takes no incoming connections")
                adjacency[source].append(target)
                connections.append({"from": by_name[source]["id"], "port": port, "to": by_name[target]["id"]})
    seen, visiting = set(), set()
    def visit(name):
        if name in visiting:
            raise AuthoringError("Hooks do not accept cycles")
        if name in seen:
            return
        visiting.add(name)
        for target in adjacency[name]: visit(target)
        visiting.remove(name); seen.add(name)
    visit(triggers[0]["name"])
    if len(seen) != len(nodes) or len(nodes) < 2:
        raise AuthoringError("Connect the event to the next hook steps")
    for node in nodes:
        params = node["parameters"]
        if node["type"] == CONDITION_TYPE:
            if params.get("field") not in ("path", "tool", "command", "event"):
                raise AuthoringError("Invalid condition field")
            string(params.get("pattern"), "Condition pattern", nonempty=True)
        elif node["type"] != EVENT_TYPE:
            string(params.get("message"), "Message", nonempty=True)
            if node["type"] in ("relay.hookBlock", "relay.hookApprove") and event["timing"] != "before":
                raise AuthoringError("Block and approval need an event before the effect")
            if node["type"] == "relay.hookVerify":
                string(params.get("check"), "Check command", nonempty=True)
    return {"schema": "relay.hook.v1", "name": document["name"], "nodes": copy.deepcopy(nodes), "connections": connections,
            "binding": "host-required", "installed": False}

"""Hook authoring and export stay separate from installing hooks on Orchestra events."""
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from relay_authoring.config import AuthoringError
from relay_authoring.hooks import compile_hook, is_hook, node_types


@pytest.fixture
def hook():
    return {"name": "Protect generated files", "nodes": [
        {"id": "event", "name": "Before edit", "type": "relay.hookEventTrigger", "position": [0, 0], "parameters": {"operation": "edit", "timing": "before"}},
        {"id": "condition", "name": "Generated file?", "type": "relay.hookCondition", "position": [224, 0], "parameters": {"field": "path", "pattern": "src/generated/**"}},
        {"id": "block", "name": "Block change", "type": "relay.hookBlock", "position": [448, 0], "parameters": {"message": "Edit the source contract and regenerate."}},
        {"id": "record", "name": "Record", "type": "relay.hookRecord", "position": [448, 224], "parameters": {"message": "File is outside the generated tree."}},
    ], "connections": {"Before edit": {"main": [[{"node": "Generated file?", "type": "main", "index": 0}]]}, "Generated file?": {"main": [[{"node": "Block change", "type": "main", "index": 0}], [{"node": "Record", "type": "main", "index": 0}]]}}}


def test_hook_exports_without_claiming_installation(hook):
    assert is_hook(hook)
    result = compile_hook(hook)
    assert result["schema"] == "relay.hook.v1"
    assert result["installed"] is False and result["binding"] == "host-required"
    assert result["nodes"] == hook["nodes"]
    assert result["connections"] == [{"from": "event", "port": 0, "to": "condition"}, {"from": "condition", "port": 0, "to": "block"}, {"from": "condition", "port": 1, "to": "record"}]
    catalog = {d["type"]: d for d in node_types()}
    assert catalog["relay.hookBlock"]["outputs"] == []
    assert catalog["relay.hookCondition"]["outputs"] == ["Yes", "No"]
    assert catalog["relay.hookEventTrigger"]["inputs"] == 0


def test_omitted_hook_defaults_are_exported_without_mutating_authored_data(hook):
    hook["nodes"][0]["parameters"] = {}
    del hook["nodes"][1]["parameters"]["field"]
    exported = compile_hook(hook)
    assert exported["nodes"][0]["parameters"] == {"operation": "edit", "timing": "before"}
    assert exported["nodes"][1]["parameters"]["field"] == "path"
    assert hook["nodes"][0]["parameters"] == {}


@pytest.mark.parametrize("change", ["after-block", "cycle", "unconnected", "two-events", "terminal-output", "workflow-step", "no-action"])
def test_invalid_hook_configs_remain_unpublishable(hook, change):
    if change == "after-block": hook["nodes"][0]["parameters"]["timing"] = "after"
    if change == "cycle": hook["connections"]["Record"] = {"main": [[{"node": "Generated file?", "type": "main", "index": 0}]]}
    if change == "unconnected": hook["connections"]["Generated file?"]["main"][1] = []
    if change == "two-events": hook["nodes"][3]["type"] = "relay.hookEventTrigger"
    if change == "terminal-output": hook["connections"]["Block change"] = {"main": [[{"node": "Record", "type": "main", "index": 0}]]}
    if change == "workflow-step": hook["nodes"][3]["type"] = "relay.execute"
    if change == "no-action": hook["nodes"] = hook["nodes"][:2]; hook["connections"].pop("Generated file?")
    with pytest.raises(AuthoringError): compile_hook(hook)

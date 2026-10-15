#!/usr/bin/env python3
"""G1 goldens: relay_authoring compilation, projection, hook export, node catalog, lint and document checksums.

Dev-only, like ledger.py (whose harness this uses). Run: `python3 packages/relay/test/golden/generate/authoring.py`.
The oracle is lib/relay_authoring and `lint_sprint` from bin/relay-spec.py, called in-process under the clean
environment; nothing they compute reads the environment.

Layout: test/golden/authoring/<name>/
- input.json `{op, ...}`, where op is one of:
  - `compile` `{document, skills?}`: `compile_document(document, resolver)`. `skills` maps a skill ID to
    `{id, content, sha256}`; an unknown ID is refused the way the catalog refuses it ("Skill unavailable", 404,
    skill-unavailable). Without `skills` no resolver is passed. Output `{sprint, bindings}`.
  - `project` `{name, sprint}`: `project_sprint`. `roundtrip` `{name, sprint}`: `compile_document` of that projection.
  - `hook` `{document}`: `compile_hook`. `isHook` `{document}`: `is_hook`.
  - `validate` `{document}`: `validate_document`; output null.
  - `loads` `{text}`: the strict JSON reader for checklist text.
  - `nodeTypes` `{}`: `{workflow, hook}` catalogs.
  - `lint` `{sprint, allowUngated}`: `lint_sprint`; output `{findings, exit}` (exit 1 when any finding is an error).
  - `checksum` `{document}`: `document_checksum`; output `{text, checksum}`, `text` being the hashed JSON.
- output.json, or refusal.json `{status, code, message}` when AuthoringError was raised.

test/fixtures/authoring.sqlite3 is a store the Python `Store` wrote (ids and clocks made deterministic), and
authoring/store-fixture/output.json is what that `Store` reads back from it: per workspace its documents, scopes and
each document's versions, plus every document's checksum.
"""
import copy
import hashlib
import itertools
import json
import shutil
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ledger import EPOCH, FIXTURES, GOLDEN, PKG, load_module, reset, start, write_bytes, write_generator, write_json  # noqa: E402

sys.path.insert(0, str(PKG / "lib"))
from relay_authoring import graph, hooks, store  # noqa: E402
from relay_authoring.config import AuthoringError  # noqa: E402
from relay_authoring.store import document_checksum  # noqa: E402

SPEC = load_module("relay_golden_spec", PKG / "bin" / "relay-spec.py")

SPRINT = {"brief": "Exact author intent\n", "gen": 7, "retry_budget": 2, "extra": {"retained": True},
          "macros": [{"id": "phase", "title": "Phase", "instructions": "Context\n", "extra": 3}],
          "work_packages": [
              {"id": "first\n", "title": "Same name", "macro": "phase", "instructions": "Do it\n\n",
               "self_check": ["Evidence?"],
               "checklist": [{"id": "check\r\n", "assert": "Keep\tbytes\n", "cmd": "printf 'a\\tb\\n' > evidence.txt\n",
                              "context": ["a.md"], "origin": "test"}],
               "dod": [{"cmd": "test -s evidence.txt"}]},
              {"id": "second", "title": "Same name", "macro": "phase", "kind": "review", "instructions": "Review",
               "checklist": [{"id": "review", "judge": "Keep exact\n", "blocking": True}]},
          ]}
SKILL = "# Review\n\nUse evidence.\n\n"
SKILLS = {"repo:review": {"id": "repo:review", "content": SKILL, "sha256": hashlib.sha256(SKILL.encode()).hexdigest()}}


def projected(name="Title", sprint=SPRINT):
    return graph.project_sprint(name, copy.deepcopy(sprint))


def edge(target):
    return {"node": target, "type": "main", "index": 0}


def step(ident, kind="execute", x=0, **parameters):
    return {"id": ident, "name": ident, "type": f"relay.{kind}", "position": [x, 0], "parameters": parameters}


def chain(*nodes, **document):
    """A bare document: the nodes in order, each connected to the next."""
    connections = {a["name"]: {"main": [[edge(b["name"])]]} for a, b in zip(nodes, nodes[1:])}
    return {"name": "Chain", "nodes": list(nodes), "connections": connections, **document}


def mutated(change, document=None):
    """A copy of the projected SPRINT document (start, first, second) after `change(document, start, a, b)`."""
    document = copy.deepcopy(document or projected())
    change(document, *document["nodes"])
    return document


def compile_cases():
    def checklist(value):
        return mutated(lambda d, s, a, b: a["parameters"].update(checklist=value))

    def budget(value):
        return mutated(lambda d, s, a, b: s["parameters"].update(relayRetryBudget=value))

    def skill(value, mode="combine"):
        return mutated(lambda d, s, a, b: a["parameters"].update(skill=value, skillMode=mode))

    def rename(d, s, a, b):
        b["name"] = "New name"
        d["connections"][a["name"]]["main"][0][0]["node"] = "New name"
        d["nodeGroups"][0].update(name="New phase", description="# Phase\n\n" + "Keep the protocol's newlines.\n" * 3)

    def retitle(d, s, a, b):
        b["parameters"]["title"] = "Edited title"

    def reconnect(d, s, a, b):
        d["connections"][b["name"]] = {"main": [[edge(a["name"])]]}

    two = chain(step("a"), step("b", x=224))
    cases = {
        "compile-projected": {"document": projected()},
        "compile-reversed-nodes": {"document": mutated(lambda d, s, a, b: d["nodes"].reverse())},
        "compile-start-collision": {"document": projected("Start collision", {"work_packages": [
            {"id": "relay-start", "title": "Workflow start", "checklist": []}]})},
        "compile-renamed-node-and-phase": {"document": mutated(rename)},
        "compile-retitled-node": {"document": mutated(retitle)},
        "compile-groups-emptied": {"document": mutated(lambda d, s, a, b: d.update(nodeGroups=[]))},
        "compile-groups-absent": {"document": mutated(lambda d, s, a, b: d.pop("nodeGroups"))},
        "compile-macro-parameter-cleared": {"document": mutated(lambda d, s, a, b: (d.pop("nodeGroups"),
                                                                                    a["parameters"].update(macro="")))},
        "compile-start-parameters": {"document": mutated(lambda d, s, a, b: s["parameters"].update(
            relayBrief="New objective\n", relayRetryBudget=5))},
        "compile-budget-zero": {"document": budget(0)},
        "compile-budget-ninety-nine": {"document": budget(99)},
        "compile-checklist-array": {"document": checklist([{"id": "inline", "cmd": "test -s out.txt"}])},
        "compile-skill-combine": {"document": skill("repo:review"), "skills": SKILLS},
        "compile-skill-replace": {"document": skill("repo:review", "replace"), "skills": SKILLS},
        "compile-bare-chain": {"document": two},
        "compile-bare-kinds": {"document": chain(step("load", "inject", text="Rules\n", file="rules.md"),
                                                 step("gate", "gate", 224, checklist='[{"id":"g","cmd":"true"}]'),
                                                 step("approve", "human", 448), step("look", "review", 672))},
        "compile-bare-no-meta-defaults": {"document": chain(step("only"))},
        # Refusals.
        "compile-refused-empty": {"document": mutated(lambda d, s, a, b: d.update(nodes=[]))},
        "compile-refused-only-start": {"document": mutated(lambda d, s, a, b: (d.update(nodes=[s], nodeGroups=[]),
                                                                               d["connections"].clear()))},
        "compile-refused-disconnected": {"document": mutated(lambda d, s, a, b: d["connections"].clear())},
        "compile-refused-cycle": {"document": mutated(reconnect)},
        "compile-refused-branch": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]]["main"][0].append(
            edge(s["name"])))},
        "compile-refused-two-inputs": {"document": chain(step("a"), step("b"), step("c"), connections={
            "a": {"main": [[edge("c")]]}, "b": {"main": [[edge("c")]]}})},
        "compile-refused-two-channels": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]][
            "main"].append([edge(b["name"])]))},
        "compile-refused-extra-output": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]].update(
            ai=[[edge(b["name"])]]))},
        "compile-refused-unknown-source": {"document": mutated(lambda d, s, a, b: d["connections"].update(
            ghost={"main": [[edge(b["name"])]]}))},
        "compile-refused-bad-port": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]]["main"][0][0]
                                                         .update(index=1))},
        "compile-refused-edge-type": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]]["main"][0][0]
                                                          .update(type="ai_tool"))},
        "compile-refused-missing-target": {"document": mutated(lambda d, s, a, b: d["connections"][a["name"]]["main"][
            0][0].update(node="ghost"))},
        "compile-refused-duplicate-id": {"document": mutated(lambda d, s, a, b: b.update(id=a["id"]))},
        "compile-refused-duplicate-control": {"document": mutated(lambda d, s, a, b: b["parameters"].update(
            checklist=a["parameters"]["checklist"]))},
        "compile-refused-grouped-start": {"document": mutated(lambda d, s, a, b: d["nodeGroups"][0]["nodeIds"].insert(
            0, s["id"]))},
        "compile-refused-unknown-type": {"document": mutated(lambda d, s, a, b: b.update(type="relay.loop"))},
        "compile-refused-foreign-type": {"document": mutated(lambda d, s, a, b: b.update(type="n8n.execute"))},
        "compile-refused-checklist-object": {"document": checklist("{}")},
        "compile-refused-checklist-item": {"document": checklist('["check"]')},
        "compile-refused-checklist-id": {"document": checklist('[{"id":"","cmd":"true"}]')},
        "compile-refused-checklist-cmd": {"document": checklist('[{"id":"c","cmd":1}]')},
        "compile-refused-checklist-assert-nul": {"document": checklist('[{"id":"c","assert":"a\\u0000b"}]')},
        "compile-refused-checklist-nan": {"document": checklist('[{"id":"c","cmd":NaN}]')},
        "compile-refused-checklist-duplicate-key": {"document": checklist('[{"id":"c","id":"d"}]')},
        "compile-refused-checklist-json": {"document": checklist("[{")},
        "compile-refused-instructions-nul": {"document": mutated(lambda d, s, a, b: a["parameters"].update(
            instructions="a\u0000b"))},
        "compile-refused-brief": {"document": mutated(lambda d, s, a, b: s["parameters"].update(relayBrief=3))},
        "compile-refused-budget-negative": {"document": budget(-1)},
        "compile-refused-budget-float": {"document": budget(2.5)},
        "compile-refused-budget-bool": {"document": budget(True)},
        "compile-refused-budget-string": {"document": budget("3")},
        "compile-refused-budget-hundred": {"document": budget(100)},
        "compile-refused-skill-list": {"document": skill(["one", "two"]), "skills": SKILLS},
        "compile-refused-skill-no-catalog": {"document": skill("repo:review")},
        "compile-refused-skill-unknown": {"document": skill("repo:absent"), "skills": SKILLS},
        "compile-refused-skill-mode": {"document": skill("repo:review", "append"), "skills": SKILLS},
        "compile-refused-inject-text": {"document": chain(step("load", "inject", text=["not", "text"]))},
        # The projected document's phase check runs first; bare chains reach each sequence refusal itself.
        "compile-refused-bare-empty": {"document": chain()},
        "compile-refused-bare-disconnected": {"document": chain(step("a"), step("b"), connections={})},
        "compile-refused-bare-cycle": {"document": chain(step("a"), step("b"), connections={
            "a": {"main": [[edge("b")]]}, "b": {"main": [[edge("a")]]}})},
        "compile-refused-bare-detached-loop": {"document": chain(step("r"), step("a"), step("b"), step("c"), connections={
            "r": {"main": [[edge("a")]]}, "b": {"main": [[edge("c")]]}, "c": {"main": [[edge("b")]]}})},
        "compile-refused-bare-branch": {"document": chain(step("a"), step("b"), step("c"), connections={
            "a": {"main": [[edge("b"), edge("c")]]}})},
        "compile-refused-bare-two-channels": {"document": chain(step("a"), step("b"), step("c"), connections={
            "a": {"main": [[edge("b")], [edge("c")]]}})},
        "compile-bare-empty-second-channel": {"document": chain(step("a"), step("b"), connections={
            "a": {"main": [[edge("b")], []]}})},
        "compile-refused-bare-unknown-source": {"document": chain(step("a"), connections={"ghost": {"main": [[edge("a")]]}})},
        "compile-refused-bare-missing-target": {"document": chain(step("a"), connections={"a": {"main": [[edge("ghost")]]}})},
        "compile-refused-noncontiguous": {"document": chain(step("a1"), step("b"), step("a2"), nodeGroups=[
            {"id": "A", "name": "A", "description": "Protocol A", "nodeIds": ["a1", "a2"]},
            {"id": "B", "name": "B", "description": "Protocol B", "nodeIds": ["b"]}])},
    }
    return {name: {"op": "compile", **case} for name, case in cases.items()}


def validate_cases():
    base = chain(step("a"), step("b", x=224))

    def broken(change):
        document = copy.deepcopy(base)
        change(document)
        return document

    def node(change):
        return broken(lambda d: change(d["nodes"][0]))

    groups = [{"id": "g", "name": "G", "nodeIds": ["a", "b"]}]
    cases = {
        "validate-ok": base,
        "validate-ok-groups-and-scopes": broken(lambda d: d.update(nodeGroups=groups, tags=["s1", {"id": "s2"}])),
        "validate-refused-not-object": [],
        "validate-refused-name-missing": broken(lambda d: d.pop("name")),
        "validate-refused-name-nul": broken(lambda d: d.update(name="a\u0000b")),
        "validate-refused-nodes": broken(lambda d: d.update(nodes={})),
        "validate-refused-node": broken(lambda d: d["nodes"].append("node")),
        "validate-refused-node-id": node(lambda n: n.update(id="")),
        "validate-refused-node-name": node(lambda n: n.pop("name")),
        "validate-refused-duplicate-name": node(lambda n: n.update(name="b")),
        "validate-refused-parameters": node(lambda n: n.update(parameters=[])),
        "validate-refused-position-short": node(lambda n: n.update(position=[1])),
        "validate-refused-position-text": node(lambda n: n.update(position=["1", 0])),
        "validate-refused-position-bool": node(lambda n: n.update(position=[True, 0])),
        "validate-refused-type": node(lambda n: n.update(type="")),
        "validate-refused-connections": broken(lambda d: d.update(connections=[])),
        "validate-refused-meta": broken(lambda d: d.update(meta=[])),
        "validate-refused-outputs": broken(lambda d: d["connections"].update(a=[])),
        "validate-refused-channels": broken(lambda d: d["connections"]["a"].update(main=None)),
        "validate-refused-channel": broken(lambda d: d["connections"]["a"].update(main=[{}])),
        "validate-refused-edge-index": broken(lambda d: d["connections"]["a"]["main"][0][0].pop("index")),
        "validate-refused-edge-index-bool": broken(lambda d: d["connections"]["a"]["main"][0][0].update(index=False)),
        "validate-refused-edge-node": broken(lambda d: d["connections"]["a"]["main"][0][0].update(node="")),
        "validate-refused-edge-type": broken(lambda d: d["connections"]["a"]["main"][0][0].pop("type")),
        "validate-refused-relay-meta": broken(lambda d: d.update(meta={"relay": []})),
        "validate-refused-retained-sprint": broken(lambda d: d.update(meta={"relay": {"sprint": {"work_packages": {}}}})),
        "validate-refused-retained-wp": broken(lambda d: d.update(meta={"relay": {"sprint": {"work_packages": [None]}}})),
        "validate-refused-retained-id": broken(lambda d: d.update(meta={"relay": {"sprint": {"macros": [{"id": ""}]}}})),
        "validate-refused-retained-duplicate": broken(lambda d: d.update(meta={"relay": {"sprint": {
            "work_packages": [{"id": "x"}, {"id": "x"}]}}})),
        "validate-refused-retained-names": broken(lambda d: d.update(meta={"relay": {"names": []}})),
        "validate-refused-tags": broken(lambda d: d.update(tags={})),
        "validate-refused-tag": broken(lambda d: d.update(tags=[["bad"]])),
        "validate-refused-tag-object": broken(lambda d: d.update(tags=[{"id": ""}])),
        "validate-refused-groups": broken(lambda d: d.update(nodeGroups={})),
        "validate-refused-group": broken(lambda d: d.update(nodeGroups=[{"id": "g", "name": "G"}])),
        "validate-refused-group-name": broken(lambda d: d.update(nodeGroups=[{**groups[0], "name": ""}])),
        "validate-refused-group-duplicate": broken(lambda d: d.update(nodeGroups=[{**groups[0], "nodeIds": ["a"]},
                                                                                  {**groups[0], "nodeIds": ["b"]}])),
        "validate-refused-group-member": broken(lambda d: d.update(nodeGroups=[{**groups[0], "nodeIds": [{}]}])),
        "validate-refused-group-unknown-member": broken(lambda d: d.update(nodeGroups=[{**groups[0],
                                                                                       "nodeIds": ["ghost"]}])),
        "validate-refused-group-shared-member": broken(lambda d: d.update(nodeGroups=[
            {"id": "g", "name": "G", "nodeIds": ["a"]}, {"id": "h", "name": "H", "nodeIds": ["a"]}])),
        "validate-refused-group-description": broken(lambda d: d.update(nodeGroups=[{**groups[0], "description": 1}])),
    }
    return {name: {"op": "validate", "document": document} for name, document in cases.items()}


def project_cases():
    phased = {"brief": "Phases", "macros": [{"id": "m1", "title": "One", "instructions": "first"},
                                            {"id": "m2", "instructions": "second"}],
              "work_packages": [{"id": "a", "macro": "m1"}, {"id": "b", "macro": "m1", "kind": "gate"},
                                {"id": "c", "macro": "m2"}, {"id": "d"}, {"id": "e", "macro": "m3", "title": "E"},
                                {"id": "f", "macro": "m3", "kind": "inject", "text": "t", "file": "f.md"}]}
    cases = {
        "project-base": ("Title", SPRINT),
        "project-duplicate-titles": ("Titles", {"work_packages": [{"id": "x", "title": "T"}, {"id": "y", "title": "T"},
                                                                  {"id": "z", "title": "T"}]}),
        "project-start-collision": ("Start", {"work_packages": [{"id": "relay-start", "title": "Workflow start"},
                                                                {"id": "relay-start-start", "title": "Workflow start · start"}]}),
        "project-phases-layout": ("Phases", phased),
        "project-empty": ("Empty", {"work_packages": []}),
        "project-refused-not-object": ("Invalid", []),
        "project-refused-no-list": ("Invalid", {"work_packages": {}}),
        "project-refused-wp-id": ("Invalid", {"work_packages": [{"title": "no id"}]}),
        "project-refused-noncontiguous": ("Interleaved", {"macros": [{"id": "A"}, {"id": "B"}], "work_packages": [
            {"id": "a1", "macro": "A"}, {"id": "b", "macro": "B"}, {"id": "a2", "macro": "A"}]}),
    }
    out = {name: {"op": "project", "name": title, "sprint": sprint} for name, (title, sprint) in cases.items()}
    for path in sorted((PKG / "profiles").glob("*.sprint.json")):
        profile = path.name.removesuffix(".sprint.json")
        sprint = graph.loads(path.read_text(encoding="utf-8"))
        out[f"project-profile-{profile}"] = {"op": "project", "name": "Relay · " + profile, "sprint": sprint}
        out[f"roundtrip-profile-{profile}"] = {"op": "roundtrip", "name": "Relay · " + profile, "sprint": sprint}
    out["roundtrip-base"] = {"op": "roundtrip", "name": "Title", "sprint": SPRINT}
    return out


HOOK = {"name": "Protect generated files", "nodes": [
    {"id": "event", "name": "Before edit", "type": "relay.hookEventTrigger", "position": [0, 0],
     "parameters": {"operation": "edit", "timing": "before"}},
    {"id": "condition", "name": "Generated file?", "type": "relay.hookCondition", "position": [224, 0],
     "parameters": {"field": "path", "pattern": "src/generated/**"}},
    {"id": "block", "name": "Block change", "type": "relay.hookBlock", "position": [448, 0],
     "parameters": {"message": "Edit the source contract and regenerate."}},
    {"id": "record", "name": "Record", "type": "relay.hookRecord", "position": [448, 224],
     "parameters": {"message": "File is outside the generated tree."}},
], "connections": {"Before edit": {"main": [[edge("Generated file?")]]},
                   "Generated file?": {"main": [[edge("Block change")], [edge("Record")]]}}}


def hook_cases():
    def changed(change):
        document = copy.deepcopy(HOOK)
        change(document, *document["nodes"])
        return document

    def action(kind, x, **parameters):
        return {"id": kind.lower(), "name": kind, "type": f"relay.hook{kind}", "position": [x, 0],
                "parameters": parameters}

    def actions(timing, *nodes):
        trigger = {**copy.deepcopy(HOOK["nodes"][0]), "parameters": {"operation": "command", "timing": timing}}
        every = [trigger, *nodes]
        return {"name": "Actions", "nodes": every, "connections": {a["name"]: {"main": [[edge(b["name"])]]}
                                                                   for a, b in zip(every, every[1:])}}

    def set_params(index, **parameters):
        return changed(lambda d, *n: n[index]["parameters"].update(parameters))

    cases = {
        "hook-base": HOOK,
        "hook-defaults": changed(lambda d, e, c, b, r: (e.update(parameters={}), c["parameters"].pop("field"))),
        "hook-every-action": actions("before", action("Remind", 224, message="Remember the contract."),
                                     action("Verify", 448, message="Checks pass.", check="bun typecheck"),
                                     action("Repair", 672, message="Fix it."), action("Approve", 896, message="Ask."),
                                     action("Record", 1120, message="Recorded.")),
        "hook-after-record": actions("after", action("Record", 224, message="Recorded after the command.")),
        "hook-refused-after-block": set_params(0, timing="after"),
        "hook-refused-after-approve": actions("after", action("Approve", 224, message="Ask.")),
        "hook-refused-cycle": changed(lambda d, *n: d["connections"].update(Record={"main": [[edge("Generated file?")]]})),
        "hook-refused-unconnected": changed(lambda d, *n: d["connections"]["Generated file?"]["main"].__setitem__(1, [])),
        "hook-refused-two-events": changed(lambda d, e, c, b, r: r.update(type="relay.hookEventTrigger")),
        "hook-refused-terminal-output": changed(lambda d, *n: d["connections"].update(
            {"Block change": {"main": [[edge("Record")]]}})),
        "hook-refused-workflow-step": changed(lambda d, e, c, b, r: r.update(type="relay.execute")),
        "hook-refused-no-action": changed(lambda d, *n: (d.update(nodes=d["nodes"][:2]),
                                                         d["connections"].pop("Generated file?"))),
        "hook-refused-no-nodes": changed(lambda d, *n: (d.update(nodes=[]), d["connections"].clear())),
        "hook-refused-verify-check": actions("before", action("Verify", 224, message="Checks pass.")),
        "hook-refused-empty-message": set_params(2, message=""),
        "hook-refused-condition-field": set_params(1, field="branch"),
        "hook-refused-condition-pattern": set_params(1, pattern=""),
        "hook-refused-operation": set_params(0, operation="delete"),
        "hook-refused-timing": set_params(0, timing="during"),
        "hook-refused-port": changed(lambda d, *n: d["connections"].update(
            {"Record": {"main": [[edge("Block change")], [edge("Block change")]]}})),
        "hook-refused-two-targets": changed(lambda d, *n: d["connections"]["Generated file?"]["main"][0].append(
            edge("Record"))),
        "hook-refused-into-event": changed(lambda d, *n: d["connections"].update(Record={"main": [[edge("Before edit")]]})),
        "hook-refused-target": changed(lambda d, *n: d["connections"]["Before edit"]["main"][0][0].update(node="ghost")),
        "hook-refused-source": changed(lambda d, *n: d["connections"].update(ghost={"main": [[edge("Record")]]})),
        "hook-refused-output-key": changed(lambda d, *n: d["connections"]["Before edit"].update(ai=[])),
        "hook-refused-invalid-document": changed(lambda d, e, c, b, r: r.update(position=[0])),
    }
    out = {name: {"op": "hook", "document": document} for name, document in cases.items()}
    out["is-hook-nodes"] = {"op": "isHook", "document": HOOK}
    out["is-hook-meta"] = {"op": "isHook", "document": {**projected(), "meta": {"relay": {"kind": "hook"}}}}
    out["is-hook-workflow"] = {"op": "isHook", "document": projected()}
    return out


def lint_cases():
    def wp(ident, controls=None, **extra):
        return {"id": ident, "instructions": f"do {ident}", "checklist": controls or [], **extra}

    def real(ident="c1", cmd="pytest -q"):
        return {"id": ident, "assert": "the suite is green", "cmd": cmd}

    layout = (("frame", ["intake", "bearings", "terms"], "framed"), ("carve", ["carve", "size"], "carved"),
              ("sequence", ["waits", "order", "forecast"], "sequenced"),
              ("dispatch", ["policy", "packets", "tripwires"], "frozen"))
    planning = []
    for macro, subs, gate in layout:
        planning += [wp(sub, macro=macro, kind="execute") for sub in subs]
        if macro == "dispatch":
            planning.append(wp("hostile_read", [real("hostile-read-approved",
                                                     'test "$(jq -r .verdict plan/verdict.json)" = APPROVE')],
                               macro=macro, kind="review"))
        planning.append(wp(gate, [real(f"{gate}-ok", f"plan-check --phase {macro}")], macro=macro, kind="gate"))
    sprints = {
        "lint-planning-shape": ({"brief": "planning", "retry_budget": 3, "macros": [
            {"id": m, "instructions": "load"} for m in ("frame", "carve", "sequence", "dispatch")],
            "work_packages": planning}, False),
        "lint-allow-ungated": ({"brief": "x", "work_packages": [wp("a"), wp("b", [real()])]}, True),
        "lint-trivial-commands": ({"brief": "x", "work_packages": [wp(f"w{n}", [real(f"c{n}", cmd)]) for n, cmd in
                                                                   enumerate(["true", "exit 0", "test -e .", " : ",
                                                                              "/bin/true", "echo"])]}, False),
        "lint-clean": ({"brief": "x", "work_packages": [wp("a", [real()])]}, False),
        "lint-judge-only": ({"brief": "x", "work_packages": [wp("a", [{"id": "j1", "judge": "is it good?",
                                                                       "blocking": False}])]}, False),
        "lint-blocking-judge-only": ({"brief": "x", "work_packages": [wp("a", [{"id": "j1", "judge": "good?",
                                                                                "blocking": True}])]}, False),
        "lint-self-check-restates": ({"brief": "x", "work_packages": [wp("a", [real()],
                                                                         self_check=["The suite is green."])]}, False),
        "lint-chain-cap": ({"brief": "x", "work_packages": [wp(f"w{n}", [real(f"c{n}")]) for n in range(12)]}, False),
        "lint-inject-without-file": ({"brief": "x", "work_packages": [wp("load", kind="inject"),
                                                                      wp("b", [real()])]}, False),
        "lint-inject-with-file": ({"brief": "x", "work_packages": [wp("load", kind="inject", file="protocol.md"),
                                                                   wp("b", [real()])]}, False),
        "lint-undeclared-macro": ({"brief": "x", "macros": [{"id": "frame"}],
                                   "work_packages": [wp("a", [real()], macro="carve")]}, False),
        "lint-unknown-kind": ({"brief": "x", "work_packages": [wp("a", [real()], kind="excute")]}, False),
        "lint-duplicate-control": ({"brief": "x", "work_packages": [wp("a", [real("c1", "pytest -q")]),
                                                                    wp("b", [real("c1", "ruff check .")])]}, False),
        "lint-human-ungated": ({"brief": "x", "work_packages": [wp("ok", kind="human"), wp("b", [real()])]}, False),
    }
    for path in sorted((PKG / "profiles").glob("*.sprint.json")):
        sprints[f"lint-profile-{path.name.removesuffix('.sprint.json')}"] = (json.loads(path.read_text()), False)
    return {name: {"op": "lint", "sprint": sprint, "allowUngated": allow} for name, (sprint, allow) in sprints.items()}


def other_cases():
    keyed = {"name": "Keys", "z": 1, "Z": 2, "é": 3, "￿": 4, "\U0001F600": 5, "a": {"b": [1, 2.5, None, True]},
             "nodes": [], "position": [240.5, 1e16]}
    return {
        "node-types": {"op": "nodeTypes"},
        "loads-object": {"op": "loads", "text": '{"a":1}'},
        "loads-refused-duplicate": {"op": "loads", "text": '{"a":1,"a":2}'},
        "loads-refused-escaped-duplicate": {"op": "loads", "text": '{"a":1,"\\u0061":2}'},
        "loads-refused-nan": {"op": "loads", "text": '{"a":NaN}'},
        "loads-refused-infinity": {"op": "loads", "text": '{"a":Infinity}'},
        "loads-refused-json": {"op": "loads", "text": "[{"},
        "loads-refused-extra-data": {"op": "loads", "text": "[] []"},
        "checksum-projected": {"op": "checksum", "document": projected()},
        "checksum-key-order": {"op": "checksum", "document": keyed},
    }


def evaluate(case):
    op = case["op"]
    if op == "compile":
        skills = case.get("skills")
        resolver = None if skills is None else lambda ident: resolve(skills, ident)
        sprint, bindings = graph.compile_document(copy.deepcopy(case["document"]), resolver)
        return {"sprint": sprint, "bindings": bindings}
    if op == "project":
        return graph.project_sprint(case["name"], copy.deepcopy(case["sprint"]))
    if op == "roundtrip":
        sprint, bindings = graph.compile_document(graph.project_sprint(case["name"], copy.deepcopy(case["sprint"])))
        return {"sprint": sprint, "bindings": bindings}
    if op == "hook":
        return hooks.compile_hook(copy.deepcopy(case["document"]))
    if op == "isHook":
        return hooks.is_hook(copy.deepcopy(case["document"]))
    if op == "validate":
        return graph.validate_document(copy.deepcopy(case["document"]))
    if op == "loads":
        return graph.loads(case["text"])
    if op == "nodeTypes":
        return {"workflow": graph.node_types(), "hook": hooks.node_types()}
    if op == "lint":
        findings = SPEC.lint_sprint(copy.deepcopy(case["sprint"]), allow_ungated=case["allowUngated"])
        return {"findings": findings, "exit": 1 if any(f["severity"] == "error" for f in findings) else 0}
    if op == "checksum":
        return {"text": json.dumps(case["document"], sort_keys=True, ensure_ascii=False, allow_nan=False),
                "checksum": document_checksum(case["document"])}
    raise ValueError(f"unknown op {op}")


def resolve(skills, ident):
    """The catalog's `Skills.resolve` refusals, over an in-memory catalog."""
    if not isinstance(ident, str):
        raise AuthoringError("Choose a single skill")
    if ident not in skills:
        raise AuthoringError("Skill unavailable", 404, "skill-unavailable")
    return skills[ident]


def generate():
    out = GOLDEN / "authoring"
    reset(out)
    cases = {**compile_cases(), **validate_cases(), **project_cases(), **hook_cases(), **lint_cases(), **other_cases()}
    for name, case in cases.items():
        directory = out / name
        write_json(directory / "input.json", case)
        try:
            write_json(directory / "output.json", evaluate(case))
            refused = False
        except AuthoringError as error:
            write_json(directory / "refusal.json", {"status": error.status, "code": error.code, "message": str(error)})
            refused = True
        # A case name states the expected side, so a mutation that stops refusing cannot pass unnoticed.
        if refused != ("-refused-" in name):
            sys.exit(f"golden generator: {name} {'refused' if refused else 'compiled'} against its name")


def deterministic_store():
    """Store ids and clocks from counters, so the same operations write the same rows."""
    ids, ticks = itertools.count(1), itertools.count(1)
    store.uuid = type("Ids", (), {"uuid4": staticmethod(lambda: uuid.UUID(int=0x5E1A_0000 + next(ids)))})
    store.now = lambda: datetime.fromtimestamp(EPOCH + next(ticks), timezone.utc).replace(
        microsecond=1000 * next(ticks)).isoformat().replace("+00:00", "Z")


def build_store(directory):
    deterministic_store()
    work = store.Store(directory, "workspace-a")
    document = work.save(projected())
    changed = work.save({"name": "Changed"}, document["id"], document["versionId"])
    work.publish(document["id"], changed["versionId"], document_checksum(changed))
    scope = work.save_scope({"name": "Review", "description": "Review deliveries"})
    work.save({"tags": [scope["id"]]}, document["id"])
    work.save({**copy.deepcopy(HOOK), "meta": {"relay": {"schema": 1, "kind": "hook"}}})
    work.seed("relay-tdd_feature", graph.project_sprint("Relay · tdd_feature", graph.loads(
        (PKG / "profiles" / "tdd_feature.sprint.json").read_text(encoding="utf-8"))))
    removed = work.save({"name": "Removed later"})
    work.delete(removed["id"])
    work.put_execution({"id": "execution-1", "workflowId": document["id"], "finished": True})
    work.close()
    other = store.Store(directory, "workspace-b")
    other.save(projected("Other workspace"))
    other.close()


def generate_store(tmp):
    built = Path(tempfile.mkdtemp(dir=tmp))
    build_store(built)
    data = (built / "authoring.sqlite3").read_bytes()
    write_bytes(FIXTURES / "authoring.sqlite3", data)
    # Read back from a copy: opening a Store writes its pragmas and schema, and the fixture must stay as built.
    copied = Path(tempfile.mkdtemp(dir=tmp))
    (copied / "authoring.sqlite3").write_bytes(data)
    workspaces = {}
    for workspace in ("workspace-a", "workspace-b", "workspace-absent"):
        reader = store.Store(copied, workspace)
        documents = reader.documents()
        workspaces[workspace] = {
            "documents": documents,
            "checksums": {document["id"]: document_checksum(document) for document in documents},
            "versions": {document["id"]: reader.versions(document["id"]) for document in documents},
            "scopes": reader.scopes(),
        }
        reader.close()
    out = GOLDEN / "authoring" / "store-fixture"
    write_json(out / "input.json", {"op": "store", "database": "test/fixtures/authoring.sqlite3",
                                    "workspaces": list(workspaces)})
    write_json(out / "output.json", workspaces)


def main():
    tmp = start()
    try:
        generate()
        generate_store(tmp)
        write_generator(GOLDEN / "authoring", "authoring.py", [
            "bin/relay-spec.py", "lib/relay_authoring/__init__.py", "lib/relay_authoring/config.py",
            "lib/relay_authoring/graph.py", "lib/relay_authoring/hooks.py", "lib/relay_authoring/store.py"])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

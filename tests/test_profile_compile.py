"""V9 (docs/relay-v2.md §3) — a Protocol Enforcer profile compiles into a v2 sprint.

The state machine is not re-authored here. Macro order, sub-state order and the criteria are READ
from the profile and never restated — the family's cardinal rule, and the reason the compiled sprint
can be regenerated rather than maintained.

What the compilation changes is exactly one thing:

    Protocol Enforcer   a checklist gate passes when a key with the criterion's NAME IS PRESENT in
                        the evidence the executor submitted (`is_present`). Actually running the
                        mechanical check is the executor's job, on its honour.
    Relay               a gate passes when A COMMAND EXITS ZERO — run by the gate, recorded with its
                        own verdict, oracle sha and origin on a hash-chained ledger.

The load-bearing clause is what happens to a criterion with no command behind it: it compiles to
NOTHING, and V8's lint then reports the sub-state as ungated. Never to a placeholder that passes. A
silently-passing placeholder is worse than an admitted hole, because it reads as coverage — and the
pressure while authoring 200 criteria is precisely to produce one.
"""
import json
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PROF = ROOT / "bin" / "relay-profile.py"
SPEC = ROOT / "bin" / "relay-spec.py"

pytest.importorskip("yaml", reason="the compiler reads real YAML rather than hand-rolling a parser")

PROFILE = """
name: "tiny"
version: "1.0.0"
description: "a two-macro profile"

criteria_map:
  default: "plan-check --phase {macro} --criterion {criterion}"
  per_criterion:
    readback_emitted: "test -s plan/{macro}/readback.md"
  per_sub:
    dispatch.hostile_read:
      - id: hostile-read-approved
        assert: "the cold reviewer returned APPROVE"
        cmd: "test \\"$(jq -r .verdict plan/verdict.json)\\" = APPROVE"

pipeline:
  - state_id: frame
    name: "FRAME"
    max_iterations: 3
    system_prompt: |
      Load protocols/frame.md — its MUST clauses bind.
    sub_states:
      - id: intake
        type: execute
        name: "Intake"
        description: "classify every input by provenance"
      - id: framed
        type: checklist
        name: "FRAMED gate"
        criteria:
          - upstream_bound
          - readback_emitted
  - state_id: dispatch
    name: "DISPATCH"
    max_iterations: 5
    system_prompt: |
      Load protocols/dispatch.md.
    sub_states:
      - id: load_doctrine
        type: inject
        file: "protocols/doctrine.md"
      - id: hostile_read
        type: review
        name: "Hostile read"
      - id: signoff
        type: human_approval
        name: "Sign-off"
      - id: frozen
        type: checklist
        criteria:
          - tripwires_armed
"""


def _compile(tmp_path, profile=PROFILE, *extra):
    p = tmp_path / "prof.yaml"
    p.write_text(profile)
    out = tmp_path / "sprint.json"
    r = subprocess.run(["python3", str(PROF), str(p), "-o", str(out), *extra],
                       capture_output=True, text=True)
    sprint = json.loads(out.read_text()) if out.exists() else None
    return sprint, r


def _wp(sprint, wid):
    return next(w for w in sprint["work_packages"] if w["id"] == wid)


# ------------------------------------------------------------------ the machine is read, not rewritten

def test_macro_and_sub_order_come_from_the_profile(tmp_path):
    sprint, r = _compile(tmp_path)
    assert r.returncode == 0, r.stderr
    assert [m["id"] for m in sprint["macros"]] == ["frame", "dispatch"]
    assert [w["id"] for w in sprint["work_packages"]] == \
        ["intake", "framed", "load_doctrine", "hostile_read", "signoff", "frozen"]
    assert [w["macro"] for w in sprint["work_packages"]][:2] == ["frame", "frame"]


def test_the_macro_prompt_becomes_the_macro_instructions(tmp_path):
    """This is where "load protocol X, its MUST clauses bind" belongs — injected once on entry."""
    sprint, _ = _compile(tmp_path)
    assert "protocols/frame.md" in sprint["macros"][0]["instructions"]


def test_pe_types_map_onto_v2_kinds(tmp_path):
    sprint, _ = _compile(tmp_path)
    kinds = {w["id"]: w.get("kind") for w in sprint["work_packages"]}
    assert kinds == {"intake": "execute", "framed": "gate", "load_doctrine": "inject",
                     "hostile_read": "review", "signoff": "human", "frozen": "gate"}
    assert _wp(sprint, "load_doctrine")["file"] == "protocols/doctrine.md"


# ------------------------------------------------------------ criteria become commands, or nothing

def test_a_criterion_with_a_command_becomes_a_control(tmp_path):
    sprint, _ = _compile(tmp_path)
    ctrls = {c["id"]: c for c in _wp(sprint, "framed")["checklist"]}
    assert ctrls["upstream_bound"]["cmd"] == "plan-check --phase frame --criterion upstream_bound"
    assert ctrls["readback_emitted"]["cmd"] == "test -s plan/frame/readback.md", \
        "an explicit per-criterion entry beats the default"


def test_an_unmapped_criterion_compiles_to_nothing(tmp_path):
    """The clause that keeps the migration honest. No default, no entry — so no control, and the
    sub-state is reported ungated rather than filled with something that passes."""
    prof = PROFILE.replace('  default: "plan-check --phase {macro} --criterion {criterion}"\n', "")
    sprint, r = _compile(tmp_path, prof)
    assert _wp(sprint, "framed")["checklist"] == [
        {"id": "readback_emitted", "assert": "readback_emitted", "cmd": "test -s plan/frame/readback.md",
         "origin": "pe-profile:tiny@1.0.0"}], _wp(sprint, "framed")
    assert "upstream_bound" in r.stderr and "unmapped" in r.stderr.lower()


def test_the_coverage_report_separates_derived_from_authored(tmp_path):
    """Passing a hand-written control off as derived from the profile would make the port look
    stronger than the profile is. Each source is counted on its own line."""
    _, r = _compile(tmp_path)
    for word in ("default", "per-criterion", "hand-mapped", "ungated"):
        assert word in r.stderr.lower(), r.stderr


def test_a_hand_mapped_control_lands_on_a_sub_with_no_criteria(tmp_path):
    sprint, _ = _compile(tmp_path)
    ctrls = _wp(sprint, "hostile_read")["checklist"]
    assert [c["id"] for c in ctrls] == ["hostile-read-approved"]


def test_every_control_carries_its_provenance(tmp_path):
    sprint, _ = _compile(tmp_path)
    for w in sprint["work_packages"]:
        for c in w.get("checklist", []):
            assert c["origin"] == "pe-profile:tiny@1.0.0", c


# ----------------------------------------------------------------------- it refuses what it cannot do

def test_duplicate_sub_ids_are_refused(tmp_path):
    """Retry state, keep-best and the drift detector all key on the WP id. Two sub-states sharing one
    would silently share a budget."""
    prof = PROFILE.replace("      - id: intake\n        type: execute",
                           "      - id: frozen\n        type: execute")
    sprint, r = _compile(tmp_path, prof)
    assert r.returncode != 0 and "frozen" in r.stderr, r.stderr
    assert "--qualify-ids" in r.stderr, "refusing is only half an answer; say the way out"


def test_qualify_ids_resolves_a_collision(tmp_path):
    prof = PROFILE.replace("      - id: intake\n        type: execute",
                           "      - id: frozen\n        type: execute")
    sprint, r = _compile(tmp_path, prof, "--qualify-ids")
    assert r.returncode == 0, r.stderr
    assert "frame.frozen" in [w["id"] for w in sprint["work_packages"]]


def test_a_disabled_sub_state_is_skipped(tmp_path):
    prof = PROFILE.replace('        description: "classify every input by provenance"',
                           '        enabled: false')
    sprint, _ = _compile(tmp_path, prof)
    assert "intake" not in [w["id"] for w in sprint["work_packages"]]


# -------------------------------------------------------------------- the artifact cannot drift

def test_check_mode_fails_on_a_hand_edited_sprint(tmp_path):
    """The compiled sprint and its profile are two committed artifacts, so they can fork. `--check`
    is the same discipline gen-doc-index.py already enforces — run from the test suite, because this
    repo has no CI."""
    sprint, _ = _compile(tmp_path)
    out = tmp_path / "sprint.json"
    d = json.loads(out.read_text())
    d["work_packages"][0]["instructions"] = "something a person typed in by hand"
    out.write_text(json.dumps(d, indent=2) + "\n")
    r = subprocess.run(["python3", str(PROF), str(tmp_path / "prof.yaml"), "-o", str(out), "--check"],
                       capture_output=True, text=True)
    assert r.returncode != 0 and "stale" in r.stderr.lower(), r.stderr


def test_check_mode_passes_on_a_freshly_compiled_sprint(tmp_path):
    _compile(tmp_path)
    r = subprocess.run(["python3", str(PROF), str(tmp_path / "prof.yaml"),
                        "-o", str(tmp_path / "sprint.json"), "--check"],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


# --------------------------------------------------------------------- the lint agrees with it

def test_the_compiled_sprint_lints_clean_where_it_should(tmp_path):
    """The two tools have to agree: what the compiler reports as ungated is exactly what the lint
    finds, and nothing the compiler emits trips a trivial-control finding."""
    sprint, _ = _compile(tmp_path)
    r = subprocess.run(["python3", str(SPEC), "lint", str(tmp_path / "sprint.json"), "--json"],
                       capture_output=True, text=True)
    findings = json.loads(r.stdout)["findings"]
    ungated = sorted(f["wp"] for f in findings if f["category"] == "ungated")
    assert ungated == ["intake"], findings
    assert not [f for f in findings if f["category"] == "trivial-control"], findings


# ------------------------------------------------- reproducing a prior measurement, on the real file

REFERENCE_PLANNING = Path.home() / "Documents" / "HuGR" / "MCP-Statemachine" / "profiles" / "planning.yaml"


@pytest.mark.skipif(not REFERENCE_PLANNING.exists(),
                    reason="the frozen reference repo is not checked out here")
def test_it_reproduces_the_port_s_measurement_on_the_real_planning_profile(tmp_path):
    """The port experiment measured planning.yaml at 52 compiled + 1 hand-mapped + 11 ungated, using
    a purpose-built script. This compiler is independent code reaching the same numbers on the same
    file — which is what makes the figure a measurement rather than a remembered one.

    Skipped rather than vendored: the profile belongs to the frozen reference repo, and copying it in
    would create the second copy this whole campaign exists to avoid.
    """
    yaml_mod = pytest.importorskip("yaml")
    d = yaml_mod.safe_load(REFERENCE_PLANNING.read_text())
    # The mapping the port hardcoded, moved to where it belongs: the profile.
    d["criteria_map"] = {
        "default": "docs/edd/tools/plan-check --phase {macro} --criterion {criterion}",
        "per_sub": {"dispatch.hostile_read": [
            {"id": "hostile-read-approved", "assert": "the cold reviewer returned APPROVE",
             "cmd": 'test "$(jq -r .verdict plan/verdict.json)" = APPROVE'}]},
    }
    p = tmp_path / "planning.yaml"
    p.write_text(yaml_mod.safe_dump(d, sort_keys=False))
    out = tmp_path / "sprint.json"
    r = subprocess.run(["python3", str(PROF), str(p), "-o", str(out)],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr

    sprint = json.loads(out.read_text())
    assert len(sprint["work_packages"]) == 16
    assert [m["id"] for m in sprint["macros"]] == ["frame", "carve", "sequence", "dispatch"]

    compiled = sum(1 for w in sprint["work_packages"] for c in w["checklist"]
                   if c["id"] != "hostile-read-approved")
    hand = sum(1 for w in sprint["work_packages"] for c in w["checklist"]
               if c["id"] == "hostile-read-approved")
    ungated = [w["id"] for w in sprint["work_packages"] if not w["checklist"]]
    assert (compiled, hand, len(ungated)) == (52, 1, 11), (compiled, hand, ungated)

    # And the lint, which knows nothing about the compiler, agrees on the same eleven.
    lint = subprocess.run(["python3", str(SPEC), "lint", str(out), "--json"],
                          capture_output=True, text=True)
    findings = json.loads(lint.stdout)["findings"]
    assert sorted(f["wp"] for f in findings if f["category"] == "ungated") == sorted(ungated)
    assert not [f for f in findings if f["category"] == "trivial-control"]

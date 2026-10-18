"""V8 (docs/relay-v2.md §3) — the instrument that says whether a plan gates anything.

Compiling `profiles/planning.yaml` onto Relay produced 53 controls and **11 ungated sub-states** —
every `execute` state. Under MCP those states also advanced on nothing, so the port was honest; but
v2's whole claim is that a state is earned, and a state with no deterministic control is not.

Authoring those controls is the campaign's real cost, and the pressure while doing it is to fill a
hole with something that passes. So this ships BEFORE the compiler: built after, it would be grading
its own homework.

It runs offline, which bounds what it can honestly say. It compares chain length against the
DOCUMENTED default block cap, because it cannot see the agent's environment — V2's preflight is what
reads the live value. The two are not redundant: the lint catches an unrunnable profile at authoring
time, the preflight catches a misconfigured session at run time.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "bin" / "relay-spec.py"


def _lint(tmp_path, sprint, *extra):
    p = tmp_path / "sprint.json"
    p.write_text(json.dumps(sprint))
    r = subprocess.run(["python3", str(SPEC), "lint", str(p), "--json", *extra],
                       capture_output=True, text=True)
    return json.loads(r.stdout), r.returncode


def _cats(findings):
    return sorted({f["category"] for f in findings["findings"]})


def _wp(wid, controls=None, **extra):
    wp = {"id": wid, "instructions": f"do {wid}", "checklist": controls or []}
    wp.update(extra)
    return wp


def _real(cid="c1", cmd="pytest -q"):
    return {"id": cid, "assert": "the suite is green", "cmd": cmd}


# ------------------------------------------------------------------ the measured calibration case

def test_it_reports_the_planning_profile_s_eleven_ungated_states(tmp_path):
    """Calibrated against a known answer rather than against itself: the planning profile's shape is
    16 sub-states, of which 11 are `execute` with no control and 5 are gates that carry them."""
    # The real shape: 4 macros, 16 sub-states — 11 ungated `execute`, 4 checklist gates, and
    # `dispatch.hostile_read`, a `review` which the port hand-mapped to a control (verdict is
    # APPROVE). 11 + 4 + 1 = 16.
    layout = (("frame",    ["intake", "bearings", "terms"],  "framed"),
              ("carve",    ["carve", "size"],                "carved"),
              ("sequence", ["waits", "order", "forecast"],   "sequenced"),
              ("dispatch", ["policy", "packets", "tripwires"], "frozen"))
    wps = []
    for macro, subs, gate in layout:
        for sname in subs:
            wps.append(_wp(sname, macro=macro, kind="execute"))
        if macro == "dispatch":
            wps.append(_wp("hostile_read", [_real("hostile-read-approved",
                                                  "test \"$(jq -r .verdict plan/verdict.json)\" = APPROVE")],
                           macro=macro, kind="review"))
        wps.append(_wp(gate, [_real(f"{gate}-ok", f"plan-check --phase {macro}")],
                       macro=macro, kind="gate"))
    assert len(wps) == 16, len(wps)
    sprint = {"brief": "planning", "retry_budget": 3,
              "macros": [{"id": m, "instructions": "load"} for m in
                         ("frame", "carve", "sequence", "dispatch")],
              "work_packages": wps}
    out, code = _lint(tmp_path, sprint)
    ungated = [f for f in out["findings"] if f["category"] == "ungated"]
    assert len(ungated) == 11, [f["wp"] for f in ungated]
    assert code != 0


def test_allow_ungated_downgrades_it_for_a_migration_in_progress(tmp_path):
    sprint = {"brief": "x", "work_packages": [_wp("a"), _wp("b", [_real()])]}
    out, code = _lint(tmp_path, sprint, "--allow-ungated")
    assert [f["severity"] for f in out["findings"] if f["category"] == "ungated"] == ["warn"]
    assert code == 0, "a migration in progress must be able to run its own lint"


# ------------------------------------------------------- a control that cannot fail is not a control

def test_a_trivially_true_command_is_reported(tmp_path):
    """The shape a hole gets filled with under deadline. `true` passes, so the state reads as
    covered, which is strictly worse than an admitted gap."""
    for cmd in ("true", "exit 0", "test -e .", " : "):
        out, code = _lint(tmp_path, {"brief": "x", "work_packages": [_wp("a", [_real("c1", cmd)])]})
        assert "trivial-control" in _cats(out), (cmd, out)
        assert code != 0


def test_a_real_command_is_not_reported(tmp_path):
    out, code = _lint(tmp_path, {"brief": "x", "work_packages": [_wp("a", [_real()])]})
    assert out["findings"] == [], out
    assert code == 0


def test_a_judge_only_state_is_not_gated(tmp_path):
    """A discursive control is an addition, never a substitute — and a non-blocking one cannot even
    stop the chain. A state holding only that has no oracle at all."""
    out, code = _lint(tmp_path, {"brief": "x", "work_packages": [
        _wp("a", [{"id": "j1", "judge": "is it good?", "blocking": False}])]})
    assert "ungated" in _cats(out) and "advisory-only" in _cats(out), out


# --------------------------------------------------------------- a self-check that adds nothing

def test_a_self_check_that_restates_a_control_is_decoration(tmp_path):
    """If the deterministic control measures the outcome and the self-check asks the same question,
    the self-check is decoration. It must probe the protocol's STEPS."""
    out, _ = _lint(tmp_path, {"brief": "x", "work_packages": [
        _wp("a", [_real("c1", "pytest -q")], self_check=["The suite is green"])]})
    assert "self-check-restates-control" in _cats(out), out


# ------------------------------------------------------------------------------ plan-shape defects

def test_a_chain_longer_than_the_default_cap_is_reported(tmp_path):
    out, _ = _lint(tmp_path, {"brief": "x",
                              "work_packages": [_wp(f"w{n}", [_real(f"c{n}")]) for n in range(12)]})
    f = [x for x in out["findings"] if x["category"] == "chain-exceeds-default-cap"]
    assert f, out
    assert "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP" in f[0]["detail"], f[0]
    assert "live" in f[0]["detail"].lower(), "it must say what it cannot know"


def test_an_inject_without_a_file_is_reported(tmp_path):
    out, _ = _lint(tmp_path, {"brief": "x", "work_packages": [
        _wp("load", kind="inject"), _wp("b", [_real()])]})
    assert "inject-without-file" in _cats(out), out


def test_an_undeclared_macro_is_reported(tmp_path):
    out, _ = _lint(tmp_path, {"brief": "x", "macros": [{"id": "frame"}],
                              "work_packages": [_wp("a", [_real()], macro="carve")]})
    assert "undeclared-macro" in _cats(out), out


def test_an_unknown_kind_is_reported(tmp_path):
    out, _ = _lint(tmp_path, {"brief": "x",
                              "work_packages": [_wp("a", [_real()], kind="excute")]})
    assert "unknown-kind" in _cats(out), out


def test_a_duplicate_control_id_is_reported(tmp_path):
    """Retry state, keep-best and the drift detector all key on the control id. Two controls sharing
    one id means one of them silently stands in for the other on the chain."""
    out, _ = _lint(tmp_path, {"brief": "x", "work_packages": [
        _wp("a", [_real("c1", "pytest -q")]), _wp("b", [_real("c1", "ruff check .")])]})
    assert "duplicate-control-id" in _cats(out), out


def test_an_inject_state_is_not_expected_to_be_gated(tmp_path):
    """`inject` has no work of its own, so demanding a control there would train authors to add a
    trivial one — the lint arguing itself into the failure it exists to catch."""
    out, code = _lint(tmp_path, {"brief": "x", "work_packages": [
        _wp("load", kind="inject", file="protocol.md"), _wp("b", [_real()])]})
    assert out["findings"] == [], out
    assert code == 0

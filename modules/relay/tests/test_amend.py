"""V11 (docs/relay-v2.md §3) — an amendment may add work; it may not quietly shrink what must pass.

Two corrections to shipped doctrine, both of which were WRONG in `control-plane.md` and both of which
are wrong in the intuitive direction, which is why they need a tool rather than a paragraph.

**Loosening is defined by effect, not by act type.** The original wording made deleting a control a
signed act and left "additions" free. But rerouting so a control becomes unreachable, moving it past
the effective exit, splitting one hard control into two weak ones as "decomposition", and adding a
state that bypasses a control's consequence all shrink the set of controls that must pass to reach a
terminal state — and every one of them was free under the act-type rule. So the rule is the SET:

    loosening = the set of controls that must pass to reach a terminal state shrinks

which is comparable mechanically, before and after, without anyone judging intent.

**Compliance granularity is whatever has a recorded verdict.** With the cursor at `macro2.sub3`,
amending `macro2.sub2` is simultaneously "under the cursor" (macro2 is open) and "already passed"
(sub2 has a recorded pass). The linear criterion gives both answers. The rule that resolves it: a
recorded verdict binds, and the enclosing macro being open is irrelevant.

What this tool does NOT claim: it cannot rank two commands by strength. Replacing a hard `cmd` with
an easier one that keeps the same id reads as a change of oracle, which is V3's job, not this one.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPEC = ROOT / "bin" / "relay-spec.py"


def _sprint(wps):
    return {"brief": "x", "retry_budget": 3, "work_packages": wps}


def _wp(wid, controls, macro=None):
    wp = {"id": wid, "instructions": f"do {wid}", "checklist": controls}
    if macro:
        wp["macro"] = macro
    return wp


def _c(cid, cmd="pytest -q", **extra):
    return {"id": cid, "assert": cid, "cmd": cmd, **extra}


def _check(tmp_path, before, after, *extra):
    b, a = tmp_path / "before.json", tmp_path / "after.json"
    b.write_text(json.dumps(_sprint(before)))
    a.write_text(json.dumps(_sprint(after)))
    r = subprocess.run(["python3", str(SPEC), "amend-check", str(b), str(a), "--json", *extra],
                       capture_output=True, text=True)
    return json.loads(r.stdout), r.returncode


def _kinds(out):
    return sorted({f["kind"] for f in out["loosening"]})


BASE = [_wp("wp1", [_c("c1"), _c("c2")]), _wp("wp2", [_c("c3")])]


# ---------------------------------------------------------------------------- adding is free

def test_appending_work_is_free(tmp_path):
    out, code = _check(tmp_path, BASE, BASE + [_wp("wp3", [_c("c4")])])
    assert out["loosening"] == [] and code == 0, out


def test_adding_a_control_is_free(tmp_path):
    after = [_wp("wp1", [_c("c1"), _c("c2"), _c("c9")]), _wp("wp2", [_c("c3")])]
    out, code = _check(tmp_path, BASE, after)
    assert out["loosening"] == [] and code == 0, out


# ------------------------------------------------------------ the four shapes of shrinking the set

def test_deleting_a_control_is_loosening(tmp_path):
    """The trivial case, and the only one the act-type rule ever caught."""
    out, code = _check(tmp_path, BASE, [_wp("wp1", [_c("c1")]), _wp("wp2", [_c("c3")])])
    assert _kinds(out) == ["control-removed"] and code != 0, out
    assert out["loosening"][0]["control"] == "c2"


def test_removing_a_whole_state_is_loosening(tmp_path):
    """Rerouting so a control becomes unreachable. The act is "removed a state", the effect is that
    c3 no longer has to pass — and only the effect is what the rule looks at."""
    out, code = _check(tmp_path, BASE, [_wp("wp1", [_c("c1"), _c("c2")])])
    assert _kinds(out) == ["control-removed"] and code != 0, out
    assert {f["control"] for f in out["loosening"]} == {"c3"}


def test_splitting_one_control_into_two_is_loosening(tmp_path):
    """The 'decomposition' dodge: c2 becomes c2a and c2b, the count goes UP, and the control that
    actually had to pass is gone. Caught because the rule compares the set, not the size."""
    after = [_wp("wp1", [_c("c1"), _c("c2a", "true || pytest -q"), _c("c2b", "echo ok")]),
             _wp("wp2", [_c("c3")])]
    out, code = _check(tmp_path, BASE, after)
    assert "control-removed" in _kinds(out) and code != 0, out
    assert {f["control"] for f in out["loosening"]} == {"c2"}


def test_making_a_blocking_judge_advisory_is_loosening(tmp_path):
    """No id disappears and no state moves. The control simply stops being able to stop anything."""
    before = [_wp("wp1", [_c("c1"), {"id": "j1", "judge": "is it sound?", "blocking": True}])]
    after = [_wp("wp1", [_c("c1"), {"id": "j1", "judge": "is it sound?", "blocking": False}])]
    out, code = _check(tmp_path, before, after)
    assert _kinds(out) == ["control-disarmed"] and code != 0, out


def test_replacing_a_command_with_a_judge_is_loosening(tmp_path):
    """A real oracle becomes a non-independent opinion under the same name."""
    after = [_wp("wp1", [_c("c1"), {"id": "c2", "judge": "did you do it?", "blocking": True}]),
             _wp("wp2", [_c("c3")])]
    out, code = _check(tmp_path, BASE, after)
    assert _kinds(out) == ["oracle-downgraded"] and code != 0, out


# ------------------------------------------------- a recorded verdict binds, not an open macro

def test_a_control_with_a_recorded_pass_may_not_be_moved_behind_the_cursor(tmp_path):
    """With the cursor at wp2, moving c1 into a state the chain has already left means it is never
    evaluated at a gate again. The act reads as a reorder; the effect is a removal."""
    before = [_wp("wp1", [_c("c1")]), _wp("wp2", [_c("c3")]), _wp("wp3", [_c("c4")])]
    after = [_wp("wp1", []), _wp("wp2", [_c("c3")]), _wp("wp3", [_c("c4"), _c("c1")])]
    out, code = _check(tmp_path, before, after, "--cursor", "wp2")
    assert out["loosening"] == [], "moving it FORWARD of the cursor still requires it to pass"

    after2 = [_wp("wp1", [_c("c1"), _c("c3")]), _wp("wp2", []), _wp("wp3", [_c("c4")])]
    out2, code2 = _check(tmp_path, before, after2, "--cursor", "wp2")
    assert "moved-behind-cursor" in _kinds(out2) and code2 != 0, out2


def test_an_open_macro_does_not_protect_an_already_passed_sub(tmp_path):
    """The ambiguity that broke the linear criterion: with the cursor at m1.sub3, sub2 is both 'under
    the cursor' (m1 is open) and 'already passed'. A recorded verdict binds; the macro is irrelevant."""
    before = [_wp("sub1", [_c("c1")], macro="m1"), _wp("sub2", [_c("c2")], macro="m1"),
              _wp("sub3", [_c("c3")], macro="m1")]
    after = [_wp("sub1", [_c("c1")], macro="m1"), _wp("sub2", [], macro="m1"),
             _wp("sub3", [_c("c3")], macro="m1")]
    out, code = _check(tmp_path, before, after, "--cursor", "sub3")
    assert "control-removed" in _kinds(out) and code != 0, out


# ------------------------------------------------------------------------------ what it will not claim

def test_a_changed_command_is_not_this_tool_s_finding(tmp_path):
    """Ranking two commands by strength is not mechanically decidable, so it is not claimed here. The
    same id under a different command is an ORACLE change, which V3 reports from the live chain."""
    after = [_wp("wp1", [_c("c1", "true"), _c("c2")]), _wp("wp2", [_c("c3")])]
    out, code = _check(tmp_path, BASE, after)
    assert out["loosening"] == [], out
    assert "oracle" in json.dumps(out["notes"]).lower(), out["notes"]


def test_a_signed_amendment_is_allowed_through_with_the_signature_recorded(tmp_path):
    """Shrinking the set is not forbidden — it is a signed act. The tool's job is to make sure it
    cannot happen by accident, not to make it impossible."""
    out, code = _check(tmp_path, BASE, [_wp("wp1", [_c("c1")]), _wp("wp2", [_c("c3")])],
                       "--signed-by", "GS: c2 duplicated c1, verified by hand")
    assert out["loosening"], "the finding is still reported"
    assert out["signed_by"].startswith("GS:")
    assert code == 0, "signed, so it does not fail the check"


def test_an_empty_signature_is_not_a_signature(tmp_path):
    out, code = _check(tmp_path, BASE, [_wp("wp1", [_c("c1")]), _wp("wp2", [_c("c3")])],
                       "--signed-by", "   ")
    assert code != 0, out

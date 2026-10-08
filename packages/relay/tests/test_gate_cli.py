"""Tests for bin/relay-gate — the model-agnostic gate CLI (Relay Roadmap #7).

Drives the REAL bin/relay-gate binary via subprocess on a tiny throwaway sprint (2 WPs,
deterministic cmds only). All state is isolated in tmp_path — no shared mutable state.

Assertions:
  - gate-fail (exit 1) with correct failing list when a WP's check is unsatisfied
  - advance (exit 0) when everything passes
  - complete (exit 0) at the end of the last WP
  - escalate (exit 2) when retry_budget is exceeded
  - the produced ledger verifies cleanly with benchmark/verify_ledger.py

Mirrors the style of tests/test_corpus.py.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / "bin" / "relay-gate"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


# ---------- helpers -----------------------------------------------------------------------

def _base_env(extra=None):
    """Clean env with RELAY_* stripped and no implicit API key."""
    env = {k: v for k, v in os.environ.items()
           if not k.startswith("RELAY_") and "API_KEY" not in k
           and k not in {"BASH_ENV", "ENV", "CDPATH"}}
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def _mk_sprint(work: Path, budget: int = 3) -> Path:
    """A 2-WP sprint with deterministic file-existence checks."""
    sprint = {
        "brief": "test sprint",
        "retry_budget": budget,
        "work_packages": [
            {
                "id": "wp1-alpha",
                "title": "Alpha",
                "instructions": "create alpha.txt",
                "checklist": [
                    {"id": "F-ALPHA", "assert": "alpha.txt exists",
                     "cmd": f"test -f {work}/alpha.txt"}
                ],
            },
            {
                "id": "wp2-beta",
                "title": "Beta",
                "instructions": "create beta.txt",
                "checklist": [
                    {"id": "F-BETA", "assert": "beta.txt exists",
                     "cmd": f"test -f {work}/beta.txt"}
                ],
            },
        ],
    }
    p = work / "sprint.json"
    p.write_text(json.dumps(sprint))
    return p


def _eval(sprint: Path, workdir: Path, state: Path, extra_env=None, mode="eval", flags=()):
    """Run relay-gate; return (returncode, parsed_json_or_None, stdout, stderr)."""
    home, scratch = state.parent / "test-home", state.parent / "test-scratch"
    home.mkdir(exist_ok=True)
    scratch.mkdir(exist_ok=True)
    env = _base_env({"HOME": home, "TMPDIR": scratch,
                     "RELAY_JUDGE_BACKEND": "stub", **(extra_env or {})})
    result = subprocess.run(
        [str(GATE), mode,
         "--sprint", str(sprint),
         "--workdir", str(workdir),
         "--state", str(state), *flags],
        capture_output=True, text=True, env=env, timeout=60,
    )
    out = result.stdout.strip()
    parsed = None
    if out:
        try:
            parsed = json.loads(out)
        except json.JSONDecodeError:
            pass
    return result.returncode, parsed, result.stdout, result.stderr


def _verify_ledger(ledger_path: Path):
    """Run verify_ledger.py; return (returncode, combined output)."""
    result = subprocess.run(
        [sys.executable, str(VERIFY), str(ledger_path)],
        capture_output=True, text=True, env=_base_env(),
    )
    return result.returncode, result.stdout + result.stderr


# ---------- tests -------------------------------------------------------------------------

def test_gate_fail_when_unsatisfied(tmp_path):
    """Missing alpha.txt -> gate-fail (exit 1) with F-ALPHA in failing list."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    rc, body, _, _ = _eval(sprint, work, state)

    assert rc == 1, f"expected exit 1 (gate-fail), got {rc}"
    assert body is not None, "no JSON on stdout"
    assert body["outcome"] == "gate-fail"
    assert body["i"] == 0
    assert body["wp"] == "wp1-alpha"
    assert "F-ALPHA" in body["failing"], f"F-ALPHA not in failing: {body['failing']}"


def test_advance_when_satisfied(tmp_path):
    """Creating alpha.txt -> advance (exit 0), next WP is wp2-beta."""
    work = tmp_path / "work"
    work.mkdir()
    (work / "alpha.txt").touch()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    rc, body, _, _ = _eval(sprint, work, state)

    assert rc == 0, f"expected exit 0 (advance), got {rc}"
    assert body is not None
    assert body["outcome"] == "advance"
    assert body["i"] == 0
    assert body["wp"] == "wp1-alpha"
    assert body["next"] == "wp2-beta"
    # counter was incremented
    assert (state / "counter").read_text().strip() == "1"


def test_complete_at_last_wp(tmp_path):
    """Satisfy both WPs in sequence -> complete after the second eval."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    # Pass WP1
    (work / "alpha.txt").touch()
    rc1, body1, _, _ = _eval(sprint, work, state)
    assert rc1 == 0 and body1["outcome"] == "advance"

    # Pass WP2
    (work / "beta.txt").touch()
    rc2, body2, _, _ = _eval(sprint, work, state)
    assert rc2 == 0, f"expected exit 0 (complete), got {rc2}"
    assert body2["outcome"] == "complete"
    assert body2["wp"] == "wp2-beta"

    # Calling again with counter >= nwp also returns complete
    rc3, body3, _, _ = _eval(sprint, work, state)
    assert rc3 == 0 and body3["outcome"] == "complete"


def test_escalate_when_retry_budget_exceeded(tmp_path):
    """Repeatedly failing (budget=2) escalates on the 3rd call: exit 2."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _mk_sprint(work, budget=2)

    # alpha.txt absent -> keep failing
    rc0, body0, _, _ = _eval(sprint, work, state)
    assert rc0 == 1 and body0["outcome"] == "gate-fail"

    rc1, body1, _, _ = _eval(sprint, work, state)
    assert rc1 == 1 and body1["outcome"] == "gate-fail"

    # budget=2, retry counter now == 2 >= budget -> escalate
    rc2, body2, _, _ = _eval(sprint, work, state)
    assert rc2 == 2, f"expected exit 2 (escalate), got {rc2}"
    assert body2["outcome"] == "escalate"
    assert body2["i"] == 0
    assert "F-ALPHA" in body2["failing"]


def test_ledger_verifies_after_full_run(tmp_path):
    """A full pass-through sprint produces a ledger that verify_ledger.py accepts."""
    work = tmp_path / "work"
    work.mkdir()
    (work / "alpha.txt").touch()
    (work / "beta.txt").touch()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    _eval(sprint, work, state)   # advance WP1
    _eval(sprint, work, state)   # complete WP2

    ledger = state / "ledger.jsonl"
    assert ledger.exists(), "ledger.jsonl was not created"

    rc, out = _verify_ledger(ledger)
    assert rc == 0, f"ledger verification failed:\n{out}"
    assert "INTACT" in out


def test_ledger_verifies_after_gate_fail_then_pass(tmp_path):
    """A fail → retry → pass run produces a valid ledger with both gate-fail and advance events."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    # First attempt: fail
    rc0, body0, _, _ = _eval(sprint, work, state)
    assert rc0 == 1 and body0["outcome"] == "gate-fail"

    # Second attempt: pass WP1
    (work / "alpha.txt").touch()
    rc1, body1, _, _ = _eval(sprint, work, state)
    assert rc1 == 0 and body1["outcome"] == "advance"

    # Pass WP2
    (work / "beta.txt").touch()
    rc2, body2, _, _ = _eval(sprint, work, state)
    assert rc2 == 0 and body2["outcome"] == "complete"

    ledger = state / "ledger.jsonl"
    rc, out = _verify_ledger(ledger)
    assert rc == 0, f"ledger verification failed:\n{out}"
    assert "INTACT" in out

    # Confirm both event types are on the chain
    events = [json.loads(l)["event"] for l in ledger.read_text().splitlines() if l.strip()]
    assert "gate-fail" in events
    assert "advance-reveal" in events
    assert "sprint-complete" in events


def test_regression_guard_catches_backslide(tmp_path):
    """After WP1 passes, removing alpha.txt should trigger a regression on the second gate."""
    work = tmp_path / "work"
    work.mkdir()
    (work / "alpha.txt").touch()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    # Advance past WP1
    rc0, body0, _, _ = _eval(sprint, work, state)
    assert rc0 == 0 and body0["outcome"] == "advance"

    # Now regress: remove alpha.txt before evaluating WP2 (beta still absent too)
    (work / "alpha.txt").unlink()

    rc1, body1, _, _ = _eval(sprint, work, state)
    # Should fail — either WP2 checklist or regression guard fires
    assert rc1 == 1
    assert body1["outcome"] == "gate-fail"


def test_missing_sprint_exits_nonzero(tmp_path):
    """A non-existent sprint path causes a clear error exit (not a crash)."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    rc, _, _, _ = _eval(tmp_path / "no_such_sprint.json", work, state)
    assert rc != 0


def test_json_output_is_pure_no_decision_field(tmp_path):
    """The CLI must never emit a `decision` field — that's Claude-specific."""
    work = tmp_path / "work"
    work.mkdir()
    state = tmp_path / "state"
    sprint = _mk_sprint(work)

    _, body, _, _ = _eval(sprint, work, state)
    assert body is not None
    assert "decision" not in body, "relay-gate must not emit decision: that is Claude-specific"


def _state_snapshot(state):
    return {p.name: p.read_bytes() for p in state.iterdir() if p.is_file()}


@pytest.mark.parametrize("counter", ["0", "99", "stale"])
@pytest.mark.parametrize("position", ["wp2-beta", "build.wp2-beta"])
def test_check_named_position_after_plan_insert_ignores_counter(tmp_path, counter, position):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    sprint = _mk_sprint(work)
    plan = json.loads(sprint.read_text())
    plan["work_packages"].insert(0, {"id": "inserted", "checklist": [{"id": "WRONG", "cmd": "true"}]})
    sprint.write_text(json.dumps(plan))
    for name, value in {"counter": counter, "position": position, "retry_2": "2",
                        "ledger.jsonl": "", "state": "active"}.items():
        (state / name).write_text(value)
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", position))
    assert rc == 1 and body is not None, err
    assert body["outcome"] == "check" and body["wp"] == "wp2-beta" and body["i"] == 2
    assert body["failing"] == ["F-BETA"]
    assert _state_snapshot(state) == before
    (work / "beta.txt").touch()
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", position))
    assert rc == 0 and body["failing"] == [], err
    assert _state_snapshot(state) == before
    assert not (state / ".run.lock").exists()


@pytest.mark.parametrize("position", ["build.beta", "outer.build.beta"])
def test_check_named_position_prefers_whole_dotted_id_then_first_dot_suffix(tmp_path, position):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    sprint = work / "sprint.json"
    sprint.write_text(json.dumps({"work_packages": [
        {"id": "beta", "checklist": [{"id": "SUFFIX", "cmd": "true"}]},
        {"id": "build.beta", "checklist": [{"id": "WHOLE", "cmd": "false"}]}]}))
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", position))
    assert rc == 1 and body["wp"] == "build.beta" and body["i"] == 1, err
    assert body["failing"] == ["WHOLE"]


def test_check_unknown_position_returns_structured_error_even_past_end(tmp_path):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    sprint = _mk_sprint(work)
    (state / "counter").write_text("99")
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", "lost.wp"))
    assert rc == 2 and body is not None, err
    assert body["outcome"] == "error" and body["error"] and body["position"] == "lost.wp"
    assert _state_snapshot(state) == before


@pytest.mark.parametrize("flag", ["--position", "--base-ref"])
def test_eval_rejects_check_only_flags_and_missing_values_cleanly(tmp_path, flag):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    sprint = _mk_sprint(work)
    for mode, flags in [("eval", (flag, "value")), ("eval", (flag, "")), ("check", (flag,))]:
        rc, body, _, err = _eval(sprint, work, state, mode=mode, flags=flags)
        assert rc == 1 and body is None
        assert "Usage:" in err and "unbound variable" not in err
        assert not state.exists()


@pytest.mark.parametrize("flag", ["--sprint", "--workdir", "--state", "--ledger", "--position"])
def test_check_rejects_empty_non_base_ref_arguments(tmp_path, flag):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    sprint = _mk_sprint(work)
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=(flag, ""))
    assert rc == 1 and body is None and "Usage:" in err
    assert not state.exists()


def test_check_named_position_busy_keeps_exit_three_stderr_contract(tmp_path):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    sprint = _mk_sprint(work)
    (state / ".run.lock").mkdir()
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", "wp2-beta"))
    assert rc == 3 and body is None and "another evaluation holds" in err
    assert _state_snapshot(state) == {}


def test_check_explicit_base_ref_overrides_state_and_reaches_diff_context(tmp_path):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    env = _base_env({"HOME": tmp_path, "TMPDIR": tmp_path})
    def git(*args):
        return subprocess.run(["git", "-C", str(work), *args], capture_output=True,
                              text=True, env=env, check=True).stdout.strip()
    git("init", "-q")
    (work / "seed.txt").write_text("seed\n")
    git("add", "seed.txt")
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "seed")
    base = git("rev-parse", "HEAD")
    (work / "result.txt").write_text("RELAY_JUDGE_OK\n")
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({"work_packages": [{"id": "target", "checklist": [
        {"id": "DIFF", "judge": "inspect change", "diff": True, "blocking": True}]}]}))
    (state / "counter").write_text("99")
    (state / "base_ref").write_text("invalid-state-base")
    before = _state_snapshot(state)
    flags = ("--position", "target")
    rc, body, _, err = _eval(sprint, work, state, env, mode="check", flags=flags)
    assert rc == 1 and body["failing"] == ["DIFF"], err
    rc, body, _, err = _eval(sprint, work, state, env, mode="check",
                             flags=(*flags, "--base-ref", base))
    assert rc == 0 and body["failing"] == [], err
    (work / "result.txt").write_text("nothing judge accepts\n")
    rc, body, _, err = _eval(sprint, work, state, env, mode="check",
                             flags=(*flags, "--base-ref", base))
    assert rc == 1 and body["failing"] == ["DIFF"], err
    assert _state_snapshot(state) == before
    assert git("status", "--porcelain") == "?? result.txt"


def _identity_case(tmp_path, wps, budget=3):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({"retry_budget": budget, "work_packages": wps}))
    (state / "counter").write_text("0")
    (state / "retry_0").write_text("0")
    (state / "ledger.jsonl").write_text("")
    return work, state, sprint


def test_check_exact_identity_distinguishes_newline_sibling(tmp_path):
    work, state, sprint = _identity_case(tmp_path, [
        {"id": "target", "checklist": [{"id": "plain-pass", "cmd": "true"}]},
        {"id": "target\n", "checklist": [{"id": "actual-fail", "cmd": "false"}]}])
    (state / "counter").write_text("99")
    (state / "position").write_text("target\n")
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", "target"))
    assert rc == 0 and body["wp"] == "target" and body["i"] == 0, err
    assert body["failing"] == []
    rc, body, _, err = _eval(sprint, work, state, mode="check", flags=("--position", "target\n"))
    assert rc == 1 and body["outcome"] == "check" and body["i"] == 1, err
    assert body["wp"] == "target\n"
    assert body["failing"] == ["actual-fail"]
    assert _state_snapshot(state) == before


def test_check_exact_identity_preserves_macro_trailing_lf(tmp_path):
    macro = "\tbuild\n\n"
    work, state, sprint = _identity_case(tmp_path, [
        {"id": "current", "macro": macro, "checklist": [{"id": "PASS", "cmd": "true"}]}])
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode="check")
    assert rc == 0 and body["outcome"] == "check" and body["wp"] == "current", err
    assert body["macro"] == macro
    assert _state_snapshot(state) == before


def test_eval_exact_identity_preserves_current_next_macro_and_ledger(tmp_path):
    current, next_id = "current\t\n\n", "next\t\n\n"
    macro, next_macro = "build\t\n\n", "\tfinish\n\n"
    work, state, sprint = _identity_case(tmp_path, [
        {"id": current, "macro": macro, "checklist": [{"id": "C1", "cmd": "true"}]},
        {"id": next_id, "macro": next_macro, "checklist": [{"id": "C2", "cmd": "true"}]}])
    rc, body, _, err = _eval(sprint, work, state)
    assert rc == 0 and body["outcome"] == "advance", err
    assert (body["wp"], body["next"], body["macro"]) == (current, next_id, macro)
    entries = [json.loads(line) for line in (state / "ledger.jsonl").read_text().splitlines()]
    assert [e["event"] for e in entries] == ["checklist-item", "advance-reveal"]
    assert all(e["wp"] == current and e["macro"] == macro for e in entries)
    assert (state / "counter").read_text().strip() == "1"
    rc, body, _, err = _eval(sprint, work, state)
    assert rc == 0 and body["outcome"] == "complete", err
    assert (body["wp"], body["macro"]) == (next_id, next_macro)
    entries = [json.loads(line) for line in (state / "ledger.jsonl").read_text().splitlines()]
    assert [e["event"] for e in entries[2:]] == ["checklist-item", "regression-item", "sprint-complete"]
    assert all(e["wp"] == next_id and e["macro"] == next_macro for e in entries[2:])
    assert (state / "counter").read_text().strip() == "2"


@pytest.mark.parametrize("budget, outcome, rc_expected", [(3, "gate-fail", 1), (0, "escalate", 2)])
def test_eval_failure_exact_identity_preserves_wp_macro_and_ledger(tmp_path, budget, outcome, rc_expected):
    current, macro = "target\n\n", "build\t\n\n"
    work, state, sprint = _identity_case(tmp_path, [
        {"id": current, "macro": macro, "checklist": [{"id": "actual-fail", "cmd": "false"}]}], budget)
    rc, body, _, err = _eval(sprint, work, state)
    assert rc == rc_expected and body["outcome"] == outcome, err
    assert body["wp"] == current and body["macro"] == macro and body["failing"] == ["actual-fail"]
    entries = [json.loads(line) for line in (state / "ledger.jsonl").read_text().splitlines()]
    assert [e["event"] for e in entries] == ["checklist-item", outcome]
    assert all(e["wp"] == current and e["macro"] == macro for e in entries)
    assert (state / "counter").read_text() == "0"
    assert (state / "retry_0").read_text().strip() == ("1" if outcome == "gate-fail" else "0")


@pytest.mark.parametrize("mode", ["check", "eval"])
@pytest.mark.parametrize("field, invalid", [
    ("id", 7), ("id", "bad\u0000id"), ("id", None), ("id", ""),
    ("macro", False), ("macro", "bad\u0000macro"),
])
def test_rejects_identity_before_current_control_side_effects(tmp_path, mode, field, invalid):
    wp = {"id": "current", "checklist": [{"id": "SIDE-EFFECT", "cmd": "touch ran"}]}
    wp[field] = invalid
    work, state, sprint = _identity_case(tmp_path, [wp])
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode=mode)
    assert rc == 1 and body is None, (body, err)
    assert "WP " + field in err
    assert not (work / "ran").exists()
    assert _state_snapshot(state) == before
    assert not (state / ".run.lock").exists()


@pytest.mark.parametrize("invalid", [7, "bad\u0000id", None, ""])
def test_rejects_identity_for_next_wp_before_eval_side_effects(tmp_path, invalid):
    work, state, sprint = _identity_case(tmp_path, [
        {"id": "current", "checklist": [{"id": "SIDE-EFFECT", "cmd": "touch ran"}],
         "dod": [{"cmd": "touch dod-ran"}]},
        {"id": invalid, "checklist": []}])
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state)
    assert rc == 1 and body is None, (body, err)
    assert "next WP id" in err
    assert not (work / "ran").exists() and not (work / "dod-ran").exists()
    assert _state_snapshot(state) == before
    assert not (state / ".run.lock").exists()


def test_check_exact_identity_does_not_require_next_wp_identity(tmp_path):
    work, state, sprint = _identity_case(tmp_path, [
        {"id": "current", "checklist": [{"id": "PASS", "cmd": "true"}]},
        {"id": 7, "checklist": []}])
    before = _state_snapshot(state)
    rc, body, _, err = _eval(sprint, work, state, mode="check")
    assert rc == 0 and body["wp"] == "current" and body["failing"] == []
    assert _state_snapshot(state) == before


def test_check_explicit_empty_base_ref_does_not_reuse_valid_state_base(tmp_path):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    env = _base_env({"HOME": tmp_path, "TMPDIR": tmp_path})
    def git(*args):
        return subprocess.run(["git", "-C", str(work), *args], capture_output=True,
                              text=True, env=env, check=True).stdout.strip()
    git("init", "-q")
    (work / "seed.txt").write_text("seed\n")
    git("add", "seed.txt")
    git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "seed")
    base = git("rev-parse", "HEAD")
    (work / "result.txt").write_text("RELAY_JUDGE_OK\n")
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({"work_packages": [{"id": "target", "checklist": [
        {"id": "DIFF", "judge": "inspect change", "diff": True, "blocking": True}]}]}))
    for name, value in {"counter": "99", "position": "target", "retry_0": "2",
                        "ledger.jsonl": "", "base_ref": base}.items():
        (state / name).write_text(value)
    before = _state_snapshot(state)
    flags = ("--position", "target")
    # The real diff passes via the valid state base when no override is supplied.
    rc, body, _, err = _eval(sprint, work, state, env, mode="check", flags=flags)
    assert rc == 0 and body["outcome"] == "check" and body["failing"] == [], err
    # Explicit empty must fail as an ordinary unavailable-diff check, not a usage error
    # or a pass obtained by silently reusing that valid state base.
    rc, body, _, err = _eval(sprint, work, state, env, mode="check",
                             flags=(*flags, "--base-ref", ""))
    assert rc == 1 and body is not None, err
    assert body["outcome"] == "check" and body["failing"] == ["DIFF"]
    rc, body, _, err = _eval(sprint, work, state, env, mode="check",
                             flags=(*flags, "--base-ref", base))
    assert rc == 0 and body["outcome"] == "check" and body["failing"] == [], err
    assert _state_snapshot(state) == before
    assert git("status", "--porcelain") == "?? result.txt"

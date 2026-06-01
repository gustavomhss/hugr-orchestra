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

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / "bin" / "relay-gate"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


# ---------- helpers -----------------------------------------------------------------------

def _base_env(extra=None):
    """Clean env with RELAY_* stripped and no implicit API key."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
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


def _eval(sprint: Path, workdir: Path, state: Path, extra_env=None):
    """Run relay-gate eval; return (returncode, parsed_json_or_None, stdout, stderr)."""
    env = _base_env({"RELAY_JUDGE_BACKEND": "stub", **(extra_env or {})})
    result = subprocess.run(
        [str(GATE), "eval",
         "--sprint", str(sprint),
         "--workdir", str(workdir),
         "--state", str(state)],
        capture_output=True, text=True, env=env,
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

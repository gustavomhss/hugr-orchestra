"""Regression for arm-hook STATE-machine fixes found by adversarial review:
  #4 escalation is terminal (an escalated arm must not reopen and self-complete);
  #6 a regression-only failure does not burn the current gate's budget nor escalate it;
  + token binding uses the FIRST marker, and path-traversal tokens are rejected.

Drives the REAL bin/relay-arm-hook.sh via subprocess, all state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _mk_arm(arms, work, token, budget=3, n_gates=2):
    d = arms / token
    d.mkdir(parents=True, exist_ok=True)
    wps = [{"id": f"wp{i+1}", "instructions": f"impl{i+1}",
            "checklist": [{"id": f"C{i+1}", "assert": f"f{i+1}", "cmd": f"test -f {work}/{token}_f{i+1}"}]}
           for i in range(n_gates)]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": budget, "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": f"RELAY-ARM:{token}"}) + "\n")
    (d / "counter").write_text("0")
    return d


def _fire(arms, corpus, token, transcript=None):
    tr = transcript or (arms / token / "tr.jsonl")
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)], input=json.dumps({"transcript_path": str(tr)}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return json.loads(out) if out else None


def test_escalation_is_terminal(tmp_path):
    """#4: budget 1, two fails -> escalate. The chain must be marked terminal so a later fire that
    WOULD pass does not reopen the arm and self-complete (no human in the loop)."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    arm = _mk_arm(arms, work, "tokE", budget=1)
    _fire(arms, corpus, "tokE")           # C1 fail (retry 1)
    _fire(arms, corpus, "tokE")           # C1 fail again, budget spent -> escalate
    assert (arm / "counter").read_text().strip() == "2", "escalate must mark chain terminal (counter=nwp)"
    # now satisfy wp1 and fire again — the arm must NOT reopen
    (work / "tokE_f1").write_text("x")
    out = _fire(arms, corpus, "tokE")
    assert out is None, "an escalated arm must not reopen on a later fire"
    # exactly one corpus trace was retained (the escalate), not two
    traces = [p for p in corpus.iterdir() if p.name.startswith("tokE-")]
    assert len(traces) == 1


def test_regression_only_does_not_escalate_current_gate(tmp_path):
    """#6: when the current gate passes but an EARLIER gate regressed, the hook must re-block citing
    the regression WITHOUT incrementing the current gate's retry counter or escalating it."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    arm = _mk_arm(arms, work, "tokR", budget=2)
    (work / "tokR_f1").write_text("x")
    _fire(arms, corpus, "tokR")           # wp1 passes -> advance to wp2 (counter=1)
    assert (arm / "counter").read_text().strip() == "1"
    # current gate wp2 satisfied, but wp1 regresses
    (work / "tokR_f2").write_text("x")
    (work / "tokR_f1").unlink()
    out = _fire(arms, corpus, "tokR")
    assert out and out["decision"] == "block"
    assert "regress" in out["reason"].lower(), out["reason"]
    assert "C1" in out["reason"]
    # the current gate's retry budget was NOT charged for the regression
    r1 = arm / "retry_1"
    assert (not r1.exists()) or r1.read_text().strip() == "0", "regression must not burn current gate budget"
    # and it did NOT escalate (counter still at the current gate, not past end)
    assert (arm / "counter").read_text().strip() == "1"


def test_token_binds_to_first_marker(tmp_path):
    """#5: a transcript citing two arm tokens binds to the FIRST (the agent's own opening prompt),
    not the last (which could be an echoed/quoted token)."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _mk_arm(arms, work, "tokFIRST", budget=3)
    _mk_arm(arms, work, "tokSECOND", budget=3)
    # transcript mentions tokFIRST first, then tokSECOND
    tr = tmp_path / "multi.jsonl"
    tr.write_text(json.dumps({"type": "user", "content": "work RELAY-ARM:tokFIRST"}) + "\n"
                  + json.dumps({"type": "assistant", "content": "I see RELAY-ARM:tokSECOND mentioned"}) + "\n")
    out = _fire(arms, corpus, "tokFIRST", transcript=tr)
    # tokFIRST's wp1 fails (no file) -> block citing C1; proves it bound to tokFIRST
    assert out and "wp1" in out["reason"]
    # tokFIRST's retry state exists; tokSECOND untouched.
    # Retry state keys by WP id (R6 — docs/control-plane.md §4), not by array index, so that it
    # follows the work package rather than the slot it happened to occupy when the plan is amended.
    assert (arms / "tokFIRST" / "retry_wp1").exists()
    assert not list((arms / "tokSECOND").glob("retry_*")), "no cross-talk between arms"


def test_path_traversal_token_rejected(tmp_path):
    """A '..' token must be ignored (exit 0, no action) rather than escaping the arms dir."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    arms.mkdir(); work.mkdir()
    tr = tmp_path / "evil.jsonl"
    tr.write_text(json.dumps({"type": "user", "content": "RELAY-ARM:.."}) + "\n")
    out = _fire(arms, corpus, "..", transcript=tr)
    assert out is None  # left completely alone

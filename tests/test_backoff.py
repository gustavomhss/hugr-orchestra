"""R7 — stuck-gate economics (docs/control-plane.md §8).

Relay's retry unit is a MODEL TURN, not a worker poll. Two consequences are tested here, both
against the real bin/relay-arm-hook.sh driven by subprocess, all state isolated in tmp_path:

  (a) a fire that carries no new information must not grow the record — the first occurrence of a
      round is written in full, identical re-fires are counted against its sha;
  (b) every re-blocking path must be bounded. The regression-only path deliberately does not charge
      the current gate's budget, and used to have no budget of its own, so an unfixable backslide
      re-blocked forever at one model turn per fire.

Nothing here sleeps: a wall-clock backoff would buy latency and save no turns, because this hook
only fires when the agent stops.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


def _arm(tmp_path, budget=2):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [
        {"id": "A", "instructions": "do A", "checklist": [{"id": "cA", "assert": "a", "cmd": "test -f a"}]},
        {"id": "B", "instructions": "do B", "checklist": [{"id": "cB", "assert": "b", "cmd": "test -f b"}]},
    ]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": budget, "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return json.loads(out) if out else None


def _entries(arms):
    p = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def _events(arms):
    return [e["event"] for e in _entries(arms)]


# ---------------------------------------------------------------------------
# (a) the record counts repetitions instead of restating them
# ---------------------------------------------------------------------------

def test_identical_rounds_are_counted_not_reappended(tmp_path):
    arms, work, corpus = _arm(tmp_path, budget=10)
    for _ in range(5):
        _fire(arms, corpus)          # cA fails identically every time
    ev = _events(arms)
    assert ev.count("checklist-item") == 1, f"the round belongs on the chain once: {ev}"
    assert ev.count("gate-fail") == 1
    assert ev.count("gate-fail-repeat") == 4
    reps = [e for e in _entries(arms) if e["event"] == "gate-fail-repeat"]
    assert [e["repeat"] for e in reps] == [1, 2, 3, 4], "the repeat count is the surviving signal"
    assert [e["retry"] for e in reps] == [2, 3, 4, 5], "and no retry counter is lost"
    # every repeat names the round it stands in for
    full = [e for e in _entries(arms) if e["event"] == "gate-fail"][0]
    assert all(e["round"] == full["round"] for e in reps)


def test_a_changed_round_is_recorded_in_full(tmp_path):
    """Collapse may only ever hide a repetition. The moment anything differs — a different verdict,
    a different failing set — the round is written out again."""
    arms, work, corpus = _arm(tmp_path, budget=10)
    _fire(arms, corpus)                      # cA fails (round 1, recorded)
    _fire(arms, corpus)                      # identical (collapsed)
    (work / "a").write_text("x")             # cA now passes -> different round
    _fire(arms, corpus)                      # advance to B
    ev = _events(arms)
    assert ev.count("checklist-item") == 2, f"the changed round must be on the chain: {ev}"
    assert "advance-reveal" in ev
    verdicts = [e["verdict"] for e in _entries(arms) if e["event"] == "checklist-item"]
    assert verdicts == ["fail", "pass"]


def test_a_collapsing_chain_still_verifies(tmp_path):
    arms, work, corpus = _arm(tmp_path, budget=10)
    for _ in range(4):
        _fire(arms, corpus)
    r = subprocess.run(["python3", str(VERIFY), str(arms / "tok" / "ledger.jsonl")],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


def test_escalation_records_the_round_in_full(tmp_path):
    """A terminal outcome is the evidence. Mid-collapse, escalation flushes the round rather than
    leaving the human with a counter and no verdicts."""
    arms, work, corpus = _arm(tmp_path, budget=2)
    _fire(arms, corpus)                      # retry 1 (round recorded)
    _fire(arms, corpus)                      # retry 2 (collapsed)
    _fire(arms, corpus)                      # budget spent -> escalate
    ev = _events(arms)
    assert ev.count("escalate") == 1
    assert ev.count("checklist-item") == 2, f"escalate carries its own round: {ev}"
    assert (arms / "tok" / "state").read_text().strip() == "escalated"


# ---------------------------------------------------------------------------
# (b) the regression-only path is bounded
# ---------------------------------------------------------------------------

def test_an_unfixable_regression_terminates(tmp_path):
    """The current gate is satisfied, an ACCEPTED earlier control has backslid, and nobody fixes it.
    The hook must stop paying for turns: it escalates on its own budget without ever charging the
    gate the runner did satisfy."""
    arms, work, corpus = _arm(tmp_path, budget=2)
    (work / "a").write_text("x")
    _fire(arms, corpus)                      # A passes -> at B
    (work / "b").write_text("x")             # B satisfied
    (work / "a").unlink()                    # accepted control cA regresses

    outs = [_fire(arms, corpus) for _ in range(4)]
    blocks = [o for o in outs if o and o.get("decision") == "block"]
    assert all("regress" in o["reason"].lower() for o in blocks), outs
    assert len(blocks) <= 2, f"budget 2 must bound the regression path, got {len(blocks)} blocks"
    assert outs[-1] is None, "a terminated arm stops re-blocking"
    assert (arms / "tok" / "state").read_text().strip() == "escalated"
    assert "escalate" in _events(arms)
    # the gate the runner satisfied was never charged
    r = arms / "tok" / "retry_B"
    assert (not r.exists()) or r.read_text().strip() == "0"
    assert (arms / "tok" / "position").read_text().strip() == "B"


def test_a_repaired_regression_resets_its_budget(tmp_path):
    """The bound must not be a one-way ratchet: fixing the backslide clears the regression counter,
    so a later, unrelated one gets a full budget again."""
    arms, work, corpus = _arm(tmp_path, budget=2)
    (work / "a").write_text("x")
    _fire(arms, corpus)                      # A passes -> at B
    (work / "b").write_text("x")
    (work / "a").unlink()
    _fire(arms, corpus)                      # regression block (1 of 2)
    assert (arms / "tok" / "reg_retry").read_text().strip() == "1"
    (work / "a").write_text("x")             # repaired
    out = _fire(arms, corpus)                # B passes clean -> chain complete
    assert out is None
    assert (arms / "tok" / "state").read_text().strip() == "complete"
    assert not (arms / "tok" / "reg_retry").exists(), "a clean pass clears the regression counter"

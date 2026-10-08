"""V7b (docs/enforcement-model.md §6b) — the agent may say it is stuck, and saying so is not passing.

An agent that has genuinely hit a wall — a missing credential, a contradictory instruction — has
exactly one honest move, and if the design does not provide it the agent finds a dishonest one. So
there is a marker it can put in its final message:

    RELAY-BLOCKED: <why>

Four properties, each of them a correction over an earlier draft of this design:

  * **Parking is not passing.** The claim is honored only when the checklist ALSO failed, and even
    then the position does not move. The work is still undone.
  * **The reason is cross-checked against the artifact**, exactly like a discursive control.
    "The checklist also failed" is content-blind on its own, and the agent usually controls whether
    the checklist fails — it can under-deliver deliberately and attach a plausible blocker.
  * **The marker is never silenced.** A hard budget on it would close the honest channel at the exact
    moment pressure peaks, which is the regime that produces covert shortcuts. It is always recorded.
  * **Recurrence accelerates the path to a human** instead. Saying the same thing twice is not
    persistence, it is a person's problem.
"""
import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _arm(tmp_path, budget=5, cmd="test -f f1"):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [{"id": "wp1", "instructions": "do 1",
            "checklist": [{"id": "c1", "assert": "a", "cmd": cmd}]},
           {"id": "wp2", "instructions": "do 2",
            "checklist": [{"id": "c2", "assert": "b", "cmd": "true"}]}]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": budget,
                                               "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _claim(arms, text):
    with open(arms / "tok" / "tr.jsonl", "a") as fh:
        fh.write(json.dumps({"type": "assistant",
                             "content": f"I could not finish.\nRELAY-BLOCKED: {text}"}) + "\n")


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"],
           "RELAY_JUDGE_BACKEND": "stub"}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return (json.loads(out) if out else None), r.stderr


def _events(arms, ev):
    f = arms / "tok" / "ledger.jsonl"
    if not f.exists():
        return []
    return [json.loads(l) for l in f.read_text().splitlines()
            if l.strip() and json.loads(l).get("event") == ev]


def _state(arms):
    p = arms / "tok" / "state"
    return p.read_text().strip() if p.exists() else ""


def test_a_blocked_claim_is_recorded(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _claim(arms, "the deploy token is not provisioned in this environment")
    _fire(arms, corpus)
    cl = _events(arms, "blocked-claim")
    assert len(cl) == 1, cl
    assert "deploy token" in cl[0]["reason"], cl[0]


def test_parking_is_not_passing(tmp_path):
    """The position does not move and the gate is not cleared. The work is still undone."""
    arms, work, corpus = _arm(tmp_path)
    _claim(arms, "blocked on a missing credential")
    out, _ = _fire(arms, corpus)
    assert (arms / "tok" / "position").read_text().strip() == "wp1"
    assert out and out["decision"] == "block", "a claim does not release the runner"


def test_a_claim_on_a_PASSING_gate_is_recorded_but_not_honored(tmp_path):
    """Nothing is blocking an agent whose gate is satisfied. Recorded — never silenced — but the
    chain advances, because the controls are what decide, not the narration."""
    arms, work, corpus = _arm(tmp_path, cmd="true")
    _claim(arms, "I am blocked on something")
    _fire(arms, corpus)
    assert _events(arms, "blocked-claim")[0]["honored"] is False
    assert (arms / "tok" / "position").read_text().strip() == "wp2", "the gate passed; it advances"


def test_the_reason_is_cross_checked_against_the_artifact(tmp_path):
    """'The checklist also failed' is content-blind: the agent usually controls whether it fails, so
    it can under-deliver deliberately and attach a plausible blocker. The claim is graded like any
    discursive control — against what is actually there."""
    arms, work, corpus = _arm(tmp_path)
    _claim(arms, "blocked, see the notes")
    _fire(arms, corpus)
    cl = _events(arms, "blocked-claim")[0]
    assert cl["corroborated"] in ("pass", "fail", "unavailable"), cl
    assert cl["graded_by"].startswith("judge:"), cl


def test_the_marker_is_never_silenced(tmp_path):
    """No budget closes this channel. Closing it at peak pressure is the regime that produces covert
    shortcuts — so every claim is recorded, including the fifth one."""
    arms, work, corpus = _arm(tmp_path, budget=99)
    for n in range(5):
        _claim(arms, f"distinct blocker number {n}")
        _fire(arms, corpus)
    assert len(_events(arms, "blocked-claim")) == 5


def test_recurrence_accelerates_to_a_human(tmp_path):
    """Saying the same thing twice is not persistence. The budget is not spent — it is bypassed."""
    arms, work, corpus = _arm(tmp_path, budget=99)
    _claim(arms, "the deploy token is not provisioned")
    _fire(arms, corpus)
    assert _state(arms) != "awaiting-human", "one claim is information, not an escalation"
    _claim(arms, "the deploy token is not provisioned")
    out, _ = _fire(arms, corpus)
    assert _state(arms) == "awaiting-human", "the same wall twice is a person's problem"
    assert out is None, "the runner is released; the arm is not finished"


def test_a_different_blocker_does_not_accelerate(tmp_path):
    """Progress through distinct obstacles is work, not a loop. Only repetition of the SAME claim
    counts, which is the same rule R7 applies to rounds."""
    arms, work, corpus = _arm(tmp_path, budget=99)
    _claim(arms, "first wall")
    _fire(arms, corpus)
    _claim(arms, "a different wall entirely")
    _fire(arms, corpus)
    assert _state(arms) != "awaiting-human", _state(arms)


def test_no_marker_changes_nothing(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    out, _ = _fire(arms, corpus)
    assert _events(arms, "blocked-claim") == []
    assert out and "c1" in out["reason"]

"""V7 / R8 (docs/control-plane.md §9) — escalation parks the arm; it does not end it.

Today escalation writes `counter = nwp` and exits silently, which in *state* is indistinguishable
from completion. It was deliberately hardened to be terminal, and `tests/test_arm_state.py` says
exactly why: "an escalated arm must not reopen and self-complete **(no human in the loop)**".

That reasoning inverts once the loop exists. `awaiting-human` is a state a human's ACTION leaves —
not a later fire, not a passing gate, not the agent deciding it is fine now. The runner is released
because turns are expensive; the arm is not finished.

Three things are tested here:

  * escalation parks as `awaiting-human`, and nothing the AGENT does leaves that state;
  * a human leaves it by writing a release with a REASON. No reason, no release: the only verb that
    advances without a gate passing is the only one that contradicts a stated invariant, so it is
    the one that must be attributable. No layer below relay supplies that warning;
  * `problems` is DERIVED from the chain and self-clearing, after Temporal's
    `TemporalReportedProblems` — a fleet console filters to the arms asking for attention instead of
    rendering fifteen progress bars, which is the difference between a dashboard and a queue.

Drives the real bin/relay-arm-hook.sh and bin/relay via subprocess, state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
RELAY = ROOT / "bin" / "relay"


def _arm(tmp_path, budget=1, n=2):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [{"id": f"wp{k}", "instructions": f"do {k}",
            "checklist": [{"id": f"c{k}", "assert": "a", "cmd": f"test -f f{k}"}]}
           for k in range(1, n + 1)]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": budget,
                                               "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return (json.loads(out) if out else None), r.stderr


def _state(arms):
    p = arms / "tok" / "state"
    return p.read_text().strip() if p.exists() else ""


def _events(arms):
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _problems(arms):
    r = subprocess.run(["python3", str(RELAY), "problems", str(arms / "tok"), "--json"],
                       capture_output=True, text=True)
    return json.loads(r.stdout), r.returncode


def _park(arms, corpus):
    """Spend the budget so the arm parks."""
    _fire(arms, corpus)   # c1 fails, retry 1
    _fire(arms, corpus)   # budget spent -> park
    return _state(arms)


# ------------------------------------------------------------------- parking, and staying parked

def test_escalation_parks_as_awaiting_human(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    assert _park(arms, corpus) == "awaiting-human", _state(arms)
    assert [e for e in _events(arms) if e["event"] == "escalate"], _events(arms)


def test_a_parked_arm_does_not_self_clear_when_the_gate_would_pass(tmp_path):
    """The original hardening, preserved verbatim in intent: a gate handed to a person must not
    quietly resolve itself because the world changed underneath it."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (work / "f1").write_text("x")            # the gate would now pass
    out, _ = _fire(arms, corpus)
    assert out is None, out
    assert _state(arms) == "awaiting-human"


def test_completion_and_parking_are_distinguishable(tmp_path):
    """Both used to be an empty stdout with `counter = nwp`, so a fleet driver had to guess."""
    parked, w1, c1 = _arm(tmp_path / "p")
    _park(parked, c1)
    done, w2, c2 = _arm(tmp_path / "d")
    (w2 / "f1").write_text("x"); (w2 / "f2").write_text("x")
    _fire(done, c2); _fire(done, c2)
    assert _state(done) == "complete"
    assert _state(parked) == "awaiting-human"


# --------------------------------------------------------------------------- a human leaves it

def test_a_release_needs_a_reason(tmp_path):
    """The only verb that advances without a gate passing is the only one that contradicts a stated
    invariant. An empty release is refused and the arm stays parked."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("   \n")
    out, err = _fire(arms, corpus)
    assert _state(arms) == "awaiting-human", "an unattributed release is not a release"
    assert out is None and "reason" in err.lower(), err


def test_a_release_with_a_reason_resumes_the_arm(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("known flake in CI, verified by hand — GS\n")
    out, _ = _fire(arms, corpus)
    assert _state(arms) == "active", _state(arms)
    assert out and out["decision"] == "block", "the runner is put back to work, not let go"
    rel = [e for e in _events(arms) if e["event"] == "human-release"]
    assert len(rel) == 1 and "known flake" in rel[0]["reason"], rel
    assert (arms / "tok" / "position").read_text().strip() == "wp1", "release resumes; it does not skip"


def test_a_release_restores_the_gate_s_budget(tmp_path):
    """Resuming into a spent budget would re-park on the very next fire — a door that opens onto a
    wall. The release clears the counters for the gate it un-parks."""
    arms, work, corpus = _arm(tmp_path)          # retry_budget 1: one retry, then park
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("investigated — GS\n")
    out, _ = _fire(arms, corpus)                 # the gate still fails on this fire
    assert _state(arms) == "active", \
        "with the counter left at its spent value this fire would have re-parked at once"
    assert out and out["decision"] == "block", "and the runner is put back on the same gate"


def test_the_release_is_consumed_not_standing(tmp_path):
    """A release file left on disk would silently un-park every future escalation of that arm."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("once — GS\n")
    _fire(arms, corpus)
    assert not (arms / "tok" / "release").exists()


# ----------------------------------------------------------------------- problems, derived and live

def test_a_parked_arm_reports_a_problem(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    probs, code = _problems(arms)
    cats = {p["category"] for p in probs["problems"]}
    assert "awaiting-human" in cats, probs
    assert code == 1, "a fleet console filters on the exit code as much as the payload"
    assert probs["problems"][0]["cause"], "a category with no cause is a bell with no label"


def test_a_healthy_arm_reports_nothing(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    (work / "f1").write_text("x"); (work / "f2").write_text("x")
    _fire(arms, corpus); _fire(arms, corpus)
    probs, code = _problems(arms)
    assert probs["problems"] == [], probs
    assert code == 0


def test_problems_clear_themselves(tmp_path):
    """Temporal clears its problems attribute on the next success. Derived from the chain each time,
    so nothing has to remember to retract anything."""
    arms, work, corpus = _arm(tmp_path, budget=3)
    _fire(arms, corpus)                      # c1 fails
    assert {p["category"] for p in _problems(arms)[0]["problems"]} == {"gate-failing"}
    (work / "f1").write_text("x")
    _fire(arms, corpus)                      # advances
    assert _problems(arms)[0]["problems"] == [], _problems(arms)[0]


def test_a_plan_defect_is_a_problem_too(tmp_path):
    """cap-risk, inject-missing, position-lost and unknown-kind are all things a person must fix;
    none of them is something the agent can retry its way out of."""
    arms, work, corpus = _arm(tmp_path, n=12)
    _fire(arms, corpus)                      # unset cap -> cap-risk on the chain
    cats = {p["category"] for p in _problems(arms)[0]["problems"]}
    assert "cap-risk" in cats, _problems(arms)[0]

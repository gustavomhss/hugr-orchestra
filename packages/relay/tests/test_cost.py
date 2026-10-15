"""Cost per state — what the run spent, on the chain, beside what it proved.

The record answers "was this state earned" precisely and says nothing at all about what earning it
cost. Protocol Enforcer's metrics had the same hole from the other side: `time_per_step` and attempt
counts, held in memory, with no tokens and nothing sealed.

Both halves are obtainable and neither was taken. Elapsed is a subtraction over `ts`, which is
already on every entry. Tokens are in the agent's transcript — `usage` per assistant turn, with input,
output and both cache figures — and the hook already opens that file to find the arm's marker.

The attribution is free because of where the hook stands: it fires when a state ends, so everything
in the transcript since the previous fire belongs to the state that was open. A cursor over consumed
rows is the whole mechanism.

Three properties, and the third is the one that keeps the record honest:

  * cost lands on the chain, inside the hashed body, so it is as tamper-evident as a verdict;
  * a state's window is its own — no double-counting across fires, nothing attributed to a state
    that had already ended;
  * **a run with no usage data records NO cost fields at all**, rather than zeros. A zero is a
    measurement; an absent field is an admission. `relay-gate` drivers and pre-existing arms produce
    byte-identical entries, which is also what keeps the benchmark's historical hashes comparable.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
RELAY = ROOT / "bin" / "relay"


def _arm(tmp_path, n=3):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [{"id": f"wp{i}", "macro": "m1", "instructions": f"do {i}",
            "checklist": [{"id": f"c{i}", "assert": "a", "cmd": "true"}]} for i in range(1, n + 1)]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3,
                                               "macros": [{"id": "m1", "instructions": "M"}],
                                               "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    return arms, work, corpus


def _turn(inp, out, cr=0, cw=0):
    return json.dumps({"type": "assistant", "message": {"usage": {
        "input_tokens": inp, "output_tokens": out,
        "cache_read_input_tokens": cr, "cache_creation_input_tokens": cw}}})


def _transcript(arms, *turns, marker=True):
    p = arms / "tok" / "tr.jsonl"
    head = [json.dumps({"type": "user", "content": "RELAY-ARM:tok"})] if marker else []
    p.write_text("\n".join(head + list(turns)) + "\n")
    return p


def _append(arms, *turns):
    with open(arms / "tok" / "tr.jsonl", "a") as fh:
        fh.write("\n".join(turns) + "\n")


def _fire(arms, corpus, agent_tr=None):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    payload = {"transcript_path": str(arms / "tok" / "tr.jsonl")}
    if agent_tr:
        payload["agent_transcript_path"] = str(agent_tr)
    r = subprocess.run(["bash", str(HOOK)], input=json.dumps(payload),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return (json.loads(out) if out else None), r.stderr


def _entries(arms):
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _advances(arms):
    return [e for e in _entries(arms) if e["event"] in ("advance-reveal", "sprint-complete")]


# --------------------------------------------------------------------------- it lands on the chain

def test_cost_is_recorded_on_the_advance(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(100, 20, cr=500, cw=300))
    _fire(arms, corpus)
    a = _advances(arms)[0]
    assert a["cost"] == {"in": 100, "out": 20, "cache_read": 500, "cache_write": 300, "turns": 1}, a
    # The FIRST state has no entry stamp to subtract from — the hook speaks only once the agent has
    # stopped — so its elapsed is ABSENT, not 0. A 0 would report "instant" over a state that in a
    # real run took twenty turns.
    assert "elapsed_s" not in a, a


def test_cost_is_inside_the_hashed_body(tmp_path):
    """As tamper-evident as a verdict, or it is a number nobody can rely on."""
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(10, 5))
    _fire(arms, corpus)
    r = subprocess.run(["python3", str(ROOT / "benchmark" / "verify_ledger.py"),
                        str(arms / "tok" / "ledger.jsonl")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr

    p = arms / "tok" / "ledger.jsonl"
    rows = p.read_text().splitlines()
    i = next(n for n, r in enumerate(rows) if "cost" in json.loads(r))
    e = json.loads(rows[i]); e["cost"]["out"] = 999999
    rows[i] = json.dumps(e)
    p.write_text("\n".join(rows) + "\n")
    r2 = subprocess.run(["python3", str(ROOT / "benchmark" / "verify_ledger.py"), str(p)],
                        capture_output=True, text=True)
    assert r2.returncode != 0, "editing a cost figure must break the chain"


# ------------------------------------------------------------------- each state's window is its own

def test_each_state_is_charged_only_its_own_turns(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(100, 10))
    _fire(arms, corpus)                       # wp1 spends 100/10
    _append(arms, _turn(7, 3), _turn(5, 2))   # wp2 spends 12/5 over two turns
    _fire(arms, corpus)
    costs = [a["cost"] for a in _advances(arms)]
    assert costs[0] == {"in": 100, "out": 10, "cache_read": 0, "cache_write": 0, "turns": 1}, costs
    assert costs[1] == {"in": 12, "out": 5, "cache_read": 0, "cache_write": 0, "turns": 2}, costs


def test_a_state_that_spent_nothing_records_zero_turns(tmp_path):
    """Distinct from "no usage data": the window was read and it was empty."""
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(100, 10))
    _fire(arms, corpus)
    _fire(arms, corpus)                        # no new turns in between
    assert _advances(arms)[1]["cost"]["turns"] == 0


def test_the_subagent_transcript_is_preferred(tmp_path):
    """Same reasoning as the binding fix: the session transcript carries every agent's turns, so
    charging a state from it would bill this arm for another agent's work."""
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(9999, 9999))       # the session's, full of someone else's spend
    mine = tmp_path / "agent.jsonl"
    mine.write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n" + _turn(11, 4) + "\n")
    _fire(arms, corpus, agent_tr=mine)
    assert _advances(arms)[0]["cost"]["in"] == 11


# ---------------------------------------------------------- absent data is admitted, never zeroed

def test_a_run_with_no_usage_records_no_cost_fields(tmp_path):
    """A zero is a measurement; an absent field is an admission. This also keeps a v1 arm's bytes —
    and the benchmark hook's historical hashes — unchanged."""
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, json.dumps({"type": "assistant", "content": "no usage anywhere"}))
    _fire(arms, corpus)
    a = _advances(arms)[0]
    assert "cost" not in a, a


def test_a_missing_transcript_does_not_break_the_gate(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(1, 1))
    out, _ = _fire(arms, corpus, agent_tr=tmp_path / "gone.jsonl")
    assert out and out["decision"] == "block", out


# ------------------------------------------------------------------------------ the rollup

def test_relay_cost_rolls_up_by_macro_and_state(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, _turn(100, 10))
    _fire(arms, corpus)
    _append(arms, _turn(20, 5))
    _fire(arms, corpus)
    _append(arms, _turn(3, 1))
    _fire(arms, corpus)
    r = subprocess.run(["python3", str(RELAY), "cost", str(arms / "tok" / "ledger.jsonl"), "--json"],
                       capture_output=True, text=True)
    rep = json.loads(r.stdout)
    assert rep["total"]["in"] == 123 and rep["total"]["out"] == 16, rep
    assert {s["wp"] for s in rep["states"]} == {"wp1", "wp2", "wp3"}, rep
    assert rep["macros"][0]["macro"] == "m1" and rep["macros"][0]["in"] == 123, rep
    assert rep["states"][0]["elapsed_s"] is None, "the first state has nothing to subtract from"
    assert all(s["elapsed_s"] is not None for s in rep["states"][1:]), rep


def test_relay_cost_says_so_when_a_run_recorded_none(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _transcript(arms, json.dumps({"type": "assistant", "content": "plain"}))
    _fire(arms, corpus)
    r = subprocess.run(["python3", str(RELAY), "cost", str(arms / "tok" / "ledger.jsonl"), "--json"],
                       capture_output=True, text=True)
    rep = json.loads(r.stdout)
    assert rep["total"] is None, "no data is not zero cost"
    assert "no cost" in json.dumps(rep).lower() or rep["states"] == [], rep

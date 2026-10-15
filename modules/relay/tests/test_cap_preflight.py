"""V2 (docs/relay-v2.md §2.5) — a chain that cannot finish must say so on its first fire.

MEASURED, three real `claude -p` runs against an always-blocking Stop hook: the harness caps
consecutive hook blocks at 10 fires with a varying reason, 9 with an identical one, and 20 with
`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0` (that run's own release limit, not the harness's).

Advancement is itself a block — same channel, different reason — so the cap bounds a whole CHAIN,
not just a retry loop. A default cap of 8 kills any chain past roughly eight states, silently, in
the middle. Every real profile is longer than that: the planning profile alone is 16 sub-states.

The hook runs inside the agent's process, so it is the only thing that can read the live value. It
does, on the arm's first fire, and refuses to proceed silently. The number it reports is an honest
LOWER BOUND: `len(work_packages) + 1` assumes every gate passes first try, and each retry,
regression re-block and park costs another block on top.

Drives the real bin/relay-arm-hook.sh via subprocess, state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


def _arm(tmp_path, n_wps):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [{"id": f"wp{n}", "instructions": f"do {n}",
            "checklist": [{"id": f"c{n}", "assert": "always", "cmd": "true"}]}
           for n in range(1, n_wps + 1)]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus, cap=None):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    if cap is not None:
        env["CLAUDE_CODE_STOP_HOOK_BLOCK_CAP"] = cap
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return json.loads(out) if out else None


def _risks(arms):
    return [json.loads(l) for l in (arms / "tok" / "ledger.jsonl").read_text().splitlines()
            if l.strip() and json.loads(l).get("event") == "cap-risk"]


def test_a_chain_longer_than_the_cap_is_flagged(tmp_path):
    arms, work, corpus = _arm(tmp_path, 12)
    out = _fire(arms, corpus)                       # env unset -> the documented default of 8
    risks = _risks(arms)
    assert len(risks) == 1, risks
    assert risks[0]["cap"] == 8 and risks[0]["chain_min"] == 13, risks[0]
    assert "cap" in (out["reason"] or "").lower(), out
    assert "13" in out["reason"] and "8" in out["reason"], "say the two numbers, not just 'too long'"


def test_the_warning_is_recorded_once_per_arm_not_once_per_fire(tmp_path):
    """A warning repeated on every fire is noise that trains the reader to skip it, and it would
    grow the record without carrying new information — the same reasoning as R7's round collapse."""
    arms, work, corpus = _arm(tmp_path, 12)
    for _ in range(3):
        _fire(arms, corpus)
    assert len(_risks(arms)) == 1, _risks(arms)


def test_an_uncapped_session_is_silent(tmp_path):
    """`0` is the documented way to disable the cap. A chain of any length is then fine."""
    arms, work, corpus = _arm(tmp_path, 12)
    out = _fire(arms, corpus, cap="0")
    assert _risks(arms) == []
    assert "cap" not in (out["reason"] or "").lower(), out


def test_a_chain_that_fits_is_silent(tmp_path):
    arms, work, corpus = _arm(tmp_path, 3)
    out = _fire(arms, corpus, cap="8")
    assert _risks(arms) == []
    assert "cap" not in (out["reason"] or "").lower(), out


def test_an_explicit_low_cap_is_read_not_the_default(tmp_path):
    """The live value is what matters — a session may set the cap lower than the default."""
    arms, work, corpus = _arm(tmp_path, 3)
    _fire(arms, corpus, cap="2")
    risks = _risks(arms)
    assert len(risks) == 1 and risks[0]["cap"] == 2 and risks[0]["chain_min"] == 4, risks


def test_a_junk_cap_value_falls_back_to_the_default(tmp_path):
    """Never crash the gate over a malformed env var, and never read junk as 'uncapped'."""
    arms, work, corpus = _arm(tmp_path, 12)
    _fire(arms, corpus, cap="not-a-number")
    risks = _risks(arms)
    assert len(risks) == 1 and risks[0]["cap"] == 8, risks


def test_the_warning_is_on_the_verifiable_chain(tmp_path):
    """A risk noted only in a log is a risk nobody audits. It goes in the hashed body."""
    arms, work, corpus = _arm(tmp_path, 12)
    _fire(arms, corpus)
    r = subprocess.run(["python3", str(VERIFY), str(arms / "tok" / "ledger.jsonl")],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert _risks(arms)[0].get("h"), "the entry must be chained like any other"

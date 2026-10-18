"""Regression for the verified-trace corpus: arm-hook retention + bin/relay-corpus.py signal extraction.

Drives the REAL arm hook to terminal outcomes (complete + escalate), asserts each trace is retained in
$RELAY_CORPUS_DIR, and that relay-corpus extracts the per-step signal and excludes tampered traces.
"""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
CORPUS_TOOL = ROOT / "bin" / "relay-corpus.py"


def _mk_arm(arms, work, token, budget):
    d = arms / token
    d.mkdir(parents=True)
    sprint = {
        "brief": "t", "retry_budget": budget,
        "work_packages": [
            {"id": "wp1", "instructions": "a",
             "checklist": [{"id": "C1", "assert": "f1", "cmd": f"test -f {work}/{token}_f1"}]},
            {"id": "wp2", "instructions": "b",
             "checklist": [{"id": "C2", "assert": "f2", "cmd": f"test -f {work}/{token}_f2"}]},
        ],
    }
    (d / "sprint.json").write_text(json.dumps(sprint))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": token}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": f"RELAY-ARM:{token}"}) + "\n")
    (d / "counter").write_text("0")
    return d


def _fire(arms, corpus, token):
    tr = arms / token / "tr.jsonl"
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": __import__("os").environ["PATH"]}
    subprocess.run(["bash", str(HOOK)], input=json.dumps({"transcript_path": str(tr)}),
                   capture_output=True, text=True, env=env)


def _corpus(corpus, mode="stats", *extra):
    env = {"RELAY_CORPUS_DIR": str(corpus), "PATH": __import__("os").environ["PATH"]}
    return subprocess.run([sys.executable, str(CORPUS_TOOL), mode, *extra],
                          capture_output=True, text=True, env=env)


def test_complete_and_escalate_are_retained(tmp_path):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    # Arm A completes (plant both files across fires)
    _mk_arm(arms, work, "tokA", 3)
    _fire(arms, corpus, "tokA")
    (work / "tokA_f1").write_text("x"); _fire(arms, corpus, "tokA")
    (work / "tokA_f2").write_text("x"); _fire(arms, corpus, "tokA")
    # Arm B escalates (budget 1, never satisfied)
    _mk_arm(arms, work, "tokB", 1)
    _fire(arms, corpus, "tokB"); _fire(arms, corpus, "tokB")

    retained = sorted(p.name.split("-")[0] for p in corpus.iterdir())
    assert retained == ["tokA", "tokB"], f"both traces should be retained, got {retained}"
    # each retained trace carries the ledger + outcome
    for d in corpus.iterdir():
        assert (d / "ledger.jsonl").exists() and (d / "outcome.json").exists()


def test_stats_reports_outcomes_and_signal(tmp_path):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _mk_arm(arms, work, "tokA", 3)
    _fire(arms, corpus, "tokA")
    (work / "tokA_f1").write_text("x"); _fire(arms, corpus, "tokA")
    (work / "tokA_f2").write_text("x"); _fire(arms, corpus, "tokA")

    out = _corpus(corpus, "stats").stdout
    assert "1 complete" in out
    assert "TAMPERED 0" in out
    # export gives one RL row per (trace, wp)
    exp = _corpus(corpus, "export").stdout.strip().splitlines()
    rows = [json.loads(l) for l in exp]
    assert len(rows) >= 2 and all("retries_to_green" in r for r in rows)


def test_tampered_trace_excluded(tmp_path):
    corpus = tmp_path / "corpus"
    d = corpus / "t-bad"
    d.mkdir(parents=True)
    # a single line whose `h` does not match its body -> verify_ledger flags it
    (d / "ledger.jsonl").write_text(json.dumps({
        "ts": 1, "arm": "t", "wp": "wp1", "i": 0, "event": "checklist-item",
        "item": "C1", "assert": "x", "verdict": "pass", "graded_by": "deterministic",
        "prev": "GENESIS", "seq": 0, "h": "deadbeef"}) + "\n")
    (d / "outcome.json").write_text(json.dumps({"outcome": "complete", "token": "t"}))
    out = _corpus(corpus, "stats").stdout
    assert "TAMPERED 1" in out and "valid 0" in out

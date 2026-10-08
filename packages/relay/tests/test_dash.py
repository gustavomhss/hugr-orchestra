"""Regression for bin/relay-dash.py — the human view over the verified-trace corpus.

Builds a tmp corpus by firing the REAL arm hook to terminal outcomes (complete + escalate), then drives
the REAL relay-dash.py over it via subprocess. Asserts the burndown rows, the health rollup, that a
tampered trace is excluded, and that an empty corpus is handled cleanly. State is isolated in tmp_path /
a tmp $RELAY_CORPUS_DIR — no mocking (mirrors tests/test_corpus.py).
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
DASH_TOOL = ROOT / "bin" / "relay-dash.py"


def _seal_ledger(events):
    """Hand-build a plain-SHA256 hash chain (no RELAY_LEDGER_KEY) that verify_ledger.py accepts as INTACT.

    Mirrors the verifier's body convention: `h` is appended LAST and the MAC'd body is the line with its
    trailing `,"h":"..."}` stripped, sealed with sha256. Each event dict supplies the payload; we add the
    chain fields (prev/seq/mac) and the trailing h. Returns the full ledger text (newline-terminated)."""
    prev, lines = "GENESIS", []
    for seq, ev in enumerate(events):
        entry = {**ev, "prev": prev, "seq": seq, "mac": "sha256"}
        body = json.dumps(entry, separators=(",", ":"))
        h = hashlib.sha256(body.encode()).hexdigest()
        lines.append(body[:-1] + ',"h":"%s"}' % h)
        prev = h
    return "\n".join(lines) + "\n"


def _write_trace(corpus, name, events, outcome):
    d = corpus / name
    d.mkdir(parents=True)
    (d / "ledger.jsonl").write_text(_seal_ledger(events))
    (d / "outcome.json").write_text(json.dumps(outcome))
    return d


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
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    subprocess.run(["bash", str(HOOK)], input=json.dumps({"transcript_path": str(tr)}),
                   capture_output=True, text=True, env=env)


def _dash(corpus, mode, *extra):
    env = {"RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    return subprocess.run([sys.executable, str(DASH_TOOL), mode, *extra],
                          capture_output=True, text=True, env=env)


def _build_fleet(tmp_path):
    """One arm completes (both gates), one arm escalates (budget 1, never satisfied)."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir()
    _mk_arm(arms, work, "tokA", 3)
    _fire(arms, corpus, "tokA")
    (work / "tokA_f1").write_text("x"); _fire(arms, corpus, "tokA")
    (work / "tokA_f2").write_text("x"); _fire(arms, corpus, "tokA")
    _mk_arm(arms, work, "tokB", 1)
    _fire(arms, corpus, "tokB"); _fire(arms, corpus, "tokB")
    return arms, work, corpus


def test_burndown_rows(tmp_path):
    _, _, corpus = _build_fleet(tmp_path)
    res = _dash(corpus, "burndown")
    assert res.returncode == 0, res.stderr
    out = res.stdout
    assert "burndown" in out
    # one row per arm, each naming its terminal outcome
    assert "tokA" in out and "tokB" in out
    assert "complete" in out and "escalate" in out
    # an ASCII progress bar is rendered
    assert "[" in out and "#" in out


def test_burndown_json(tmp_path):
    _, _, corpus = _build_fleet(tmp_path)
    res = _dash(corpus, "burndown", "--json")
    assert res.returncode == 0, res.stderr
    data = json.loads(res.stdout)
    arms = {a["arm"]: a for a in data["arms"]}
    assert set(arms) == {"tokA", "tokB"}
    # the completed arm cleared both gates; the escalated arm did not clear them all
    assert arms["tokA"]["outcome"] == "complete"
    assert arms["tokA"]["gates_cleared"] == arms["tokA"]["gates_total"] == 2
    assert arms["tokB"]["outcome"] == "escalate"
    assert arms["tokB"]["gates_cleared"] < arms["tokB"]["gates_total"]
    # the escalated arm spent retries on the gate it never cleared
    assert arms["tokB"]["retries"] >= 1
    assert data["tampered"] == 0


def test_health_rollup(tmp_path):
    _, _, corpus = _build_fleet(tmp_path)
    res = _dash(corpus, "health")
    assert res.returncode == 0, res.stderr
    out = res.stdout
    assert "fleet health" in out
    assert "pass rate" in out and "escalation rate" in out
    assert "hardest controls" in out


def test_health_json(tmp_path):
    _, _, corpus = _build_fleet(tmp_path)
    res = _dash(corpus, "health", "--json")
    assert res.returncode == 0, res.stderr
    data = json.loads(res.stdout)
    assert data["traces"] == 2
    assert data["complete"] == 1 and data["escalate"] == 1
    assert abs(data["pass_rate"] - 0.5) < 1e-9
    assert abs(data["escalation_rate"] - 0.5) < 1e-9
    assert data["tampered"] == 0
    # the escalating arm fails control C1 repeatedly -> it is the hardest control
    hardest = data["hardest_controls"]
    assert hardest, "expected at least one failing control"
    assert hardest[0]["control"] == "C1"
    assert hardest[0]["fails"] >= 1


def test_tampered_trace_excluded(tmp_path):
    corpus = tmp_path / "corpus"
    d = corpus / "t-bad"
    d.mkdir(parents=True)
    # a line the verifier rejects (its sealed body does not validate — here the body it MACs strips from
    # the last `,"h":` and json.dumps places h last, so the verifier reports a missing-h/malformed entry
    # and exits 1) -> the whole trace is EXCLUDED from the view.
    (d / "ledger.jsonl").write_text(json.dumps({
        "ts": 1, "arm": "t", "wp": "wp1", "i": 0, "event": "checklist-item",
        "item": "C1", "assert": "x", "verdict": "fail", "graded_by": "deterministic",
        "prev": "GENESIS", "seq": 0, "h": "deadbeef"}) + "\n")
    (d / "outcome.json").write_text(json.dumps({"outcome": "complete", "token": "t"}))

    bd = _dash(corpus, "burndown", "--json")
    assert bd.returncode == 0, bd.stderr
    data = json.loads(bd.stdout)
    assert data["arms"] == [] and data["tampered"] == 1

    hl = _dash(corpus, "health", "--json")
    hjson = json.loads(hl.stdout)
    assert hjson["traces"] == 0 and hjson["tampered"] == 1
    # the human view names the exclusion
    assert "tampered" in _dash(corpus, "burndown").stdout


def test_mixed_corpus_tampered_excluded_valid_remains(tmp_path):
    """The load-bearing contract: a tampered trace is EXCLUDED while valid traces still render. The
    all-tampered case above never proved a valid arm survives alongside a rejected one."""
    corpus = tmp_path / "corpus"
    # one VALID completed trace (signed chain ending in sprint-complete)
    _write_trace(corpus, "t-good", [
        {"ts": 1, "arm": "good", "wp": "wp1", "i": 0, "event": "checklist-item",
         "item": "C1", "assert": "x", "verdict": "pass", "graded_by": "deterministic"},
        {"ts": 2, "arm": "good", "wp": "wp1", "i": 0, "event": "advance-reveal"},
        {"ts": 3, "arm": "good", "wp": "wp1", "i": 0, "event": "sprint-complete"},
    ], {"outcome": "complete", "token": "good"})
    # one TAMPERED trace (bogus h -> verifier rejects it)
    d = corpus / "t-bad"
    d.mkdir(parents=True)
    (d / "ledger.jsonl").write_text(json.dumps({
        "ts": 1, "arm": "bad", "wp": "wp1", "i": 0, "event": "checklist-item",
        "item": "C1", "assert": "x", "verdict": "fail", "graded_by": "deterministic",
        "prev": "GENESIS", "seq": 0, "h": "deadbeef"}) + "\n")
    (d / "outcome.json").write_text(json.dumps({"outcome": "complete", "token": "bad"}))

    data = json.loads(_dash(corpus, "burndown", "--json").stdout)
    arms = {a["arm"]: a for a in data["arms"]}
    assert set(arms) == {"good"}, "valid arm must still render"
    assert arms["good"]["outcome"] == "complete"
    assert "bad" not in arms, "tampered arm must be excluded"
    assert data["tampered"] == 1

    hjson = json.loads(_dash(corpus, "health", "--json").stdout)
    assert hjson["traces"] == 1 and hjson["tampered"] == 1 and hjson["complete"] == 1


def test_burndown_none_arm_does_not_crash(tmp_path):
    """A valid trace whose chain carries no `arm` field AND whose outcome.json carries no `token` once
    yielded arm=None and aborted the ENTIRE sorted burndown (text and --json) with a TypeError. The arm
    label must fall back to a sortable string and the view must survive alongside a normal arm."""
    corpus = tmp_path / "corpus"
    # valid chain, NO `arm` field on any entry, NON-terminal end; outcome.json omits `token`
    _write_trace(corpus, "t-noarm", [
        {"ts": 1, "wp": "wp1", "i": 0, "event": "checklist-item",
         "item": "C1", "assert": "x", "verdict": "fail", "graded_by": "deterministic"},
    ], {"outcome": "complete"})
    _write_trace(corpus, "t-norm", [
        {"ts": 1, "arm": "norm", "wp": "wp1", "i": 0, "event": "sprint-complete"},
    ], {"outcome": "complete", "token": "norm"})

    res = _dash(corpus, "burndown")
    assert res.returncode == 0, res.stderr  # was EXIT=1 with a TypeError traceback
    assert "TypeError" not in res.stderr
    jr = _dash(corpus, "burndown", "--json")
    assert jr.returncode == 0, jr.stderr
    arms = {a["arm"] for a in json.loads(jr.stdout)["arms"]}
    # the no-arm trace renders under its dir-name fallback rather than as null
    assert "t-noarm" in arms and "norm" in arms and None not in arms


def test_outcome_sourced_from_signed_chain_not_outcome_json(tmp_path):
    """outcome.json is written OUTSIDE the hash chain (a plain printf in archive_trace) and is not
    integrity-checked. A forged outcome.json must NOT flip the reported outcome: the terminal verdict
    comes only from the signed ledger events. Here a trace whose chain ends on sprint-complete carries a
    forged outcome.json:'escalate', and a chain ending on 'escalate' carries forged 'complete'."""
    corpus = tmp_path / "corpus"
    _write_trace(corpus, "t-c", [
        {"ts": 1, "arm": "c", "wp": "wp1", "i": 0, "event": "sprint-complete"},
    ], {"outcome": "escalate", "token": "c"})       # forged: chain says complete
    _write_trace(corpus, "t-e", [
        {"ts": 1, "arm": "e", "wp": "wp1", "i": 0, "event": "escalate"},
    ], {"outcome": "complete", "token": "e"})        # forged: chain says escalate

    arms = {a["arm"]: a for a in json.loads(_dash(corpus, "burndown", "--json").stdout)["arms"]}
    assert arms["c"]["outcome"] == "complete"   # signed chain wins, not the forged outcome.json
    assert arms["e"]["outcome"] == "escalate"
    hjson = json.loads(_dash(corpus, "health", "--json").stdout)
    assert hjson["complete"] == 1 and hjson["escalate"] == 1


def test_truncated_nonterminal_chain_is_not_a_pass(tmp_path):
    """Finding: a tail-truncated chain verifies as a valid PREFIX (verify_ledger exits 0, only NOTEs it),
    so a FAILED agent cut mid-trace plus a forged outcome.json:'complete' was reported as a clean pass
    (pass_rate=100%). A verified chain that does NOT end in a terminal event must bucket as 'incomplete',
    never folded into complete/pass_rate."""
    corpus = tmp_path / "corpus"
    # 1-line chain: a FAILED control, no terminal event (truncated), forged outcome.json:'complete'
    _write_trace(corpus, "t-trunc", [
        {"ts": 1, "arm": "trunc", "wp": "wp1", "i": 0, "event": "checklist-item",
         "item": "C1", "assert": "x", "verdict": "fail", "graded_by": "deterministic"},
    ], {"outcome": "complete", "token": "trunc"})

    hjson = json.loads(_dash(corpus, "health", "--json").stdout)
    assert hjson["traces"] == 1
    assert hjson["complete"] == 0, "a non-terminal/truncated chain must not count as complete"
    assert hjson["incomplete"] == 1
    assert hjson["pass_rate"] == 0.0          # was 1.0 — a clean pass reported to compliance
    assert hjson["tampered"] == 0             # the chain itself verifies; the problem is non-terminality
    arms = {a["arm"]: a for a in json.loads(_dash(corpus, "burndown", "--json").stdout)["arms"]}
    assert arms["trunc"]["outcome"] == "incomplete"


def test_control_chars_sanitized_in_human_view(tmp_path):
    """Arm/wp/item strings ride inside the SIGNED body, so they pass integrity while staying fully
    agent-chosen. A crafted ESC/CR (\\x1b[2K\\r) rendered raw can erase the dash's own lines (e.g. the
    tampered-excluded warning) and spoof a clean board. The human view must strip C0/C1 control bytes;
    the --json view keeps them (json.dumps escapes them safely)."""
    corpus = tmp_path / "corpus"
    _write_trace(corpus, "t-ansi", [
        {"ts": 1, "arm": "C1\x1b[31mFAKE", "wp": "wp1\x1b[2K\r", "i": 0, "event": "checklist-item",
         "item": "C1\x1b[2K\rEVIL", "assert": "x", "verdict": "fail", "graded_by": "deterministic"},
        {"ts": 2, "arm": "C1\x1b[31mFAKE", "wp": "wp1\x1b[2K\r", "i": 0, "event": "escalate"},
    ], {"outcome": "escalate", "token": "x"})

    # human burndown: no raw ESC/CR bytes survive into the rendered surface
    bd = _dash(corpus, "burndown").stdout
    assert "\x1b" not in bd and "\r" not in bd, "control bytes must be sanitized in the human view"
    # human health: the control name is sanitized too
    hl = _dash(corpus, "health").stdout
    assert "\x1b" not in hl and "\r" not in hl
    # the --json surface still carries the data faithfully (escaped), so nothing is lost for tooling
    jdata = json.loads(_dash(corpus, "burndown", "--json").stdout)
    assert any("\x1b" in a["arm"] for a in jdata["arms"])


def test_all_tampered_corpus_does_not_claim_clean(tmp_path):
    """When EVERY trace is excluded as tampered, health must NOT print 'every control passed first try'
    (which reads as a clean fleet); it must say there were no valid traces."""
    corpus = tmp_path / "corpus"
    d = corpus / "t-bad"
    d.mkdir(parents=True)
    (d / "ledger.jsonl").write_text(json.dumps({
        "ts": 1, "arm": "bad", "wp": "wp1", "i": 0, "event": "checklist-item",
        "item": "C1", "assert": "x", "verdict": "fail", "graded_by": "deterministic",
        "prev": "GENESIS", "seq": 0, "h": "deadbeef"}) + "\n")
    (d / "outcome.json").write_text(json.dumps({"outcome": "complete", "token": "bad"}))

    out = _dash(corpus, "health").stdout
    assert "every control passed first try" not in out
    assert "no valid traces" in out and "tampered" in out


def test_empty_corpus(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    for mode in ("burndown", "health"):
        res = _dash(corpus, mode)
        assert res.returncode == 0, res.stderr
        assert "no traces yet" in res.stdout
        # missing-corpus dir (never created) is equally clean
        res2 = _dash(tmp_path / "nope", mode)
        assert res2.returncode == 0
        assert "no traces yet" in res2.stdout


def test_empty_corpus_json(tmp_path):
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    res = _dash(corpus, "health", "--json")
    assert res.returncode == 0, res.stderr
    assert json.loads(res.stdout)["traces"] == 0

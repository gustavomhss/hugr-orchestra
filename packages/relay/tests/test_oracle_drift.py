"""V3 (docs/relay-v2.md §3) — a swapped control must not launder itself into an auditable pass.

The attack, reproduced against shipped code before this was written: a control PASSES at its own
gate, and its `cmd` is then swapped for a trivially-true one while `id` and `assert` stay
byte-identical. The chain stays INTACT — nothing was tampered with, a command was changed — and
`relay verify` printed `RESULT: PASS — auditable` with the violation the control existed to catch
sitting on disk.

Two things were wrong, and the second was only visible after reproducing:

  1. `laundered_controls` looked for fail-then-pass across a changed oracle. An already-passing
     control never fails, so it never matched.
  2. There was nothing to match against anyway. The regression guard re-runs earlier controls and
     its result changes the decision, but it recorded NOTHING — so the chain held exactly one oracle
     for the control and the swap was invisible.

So the fix is in two places: the regression guard records its verdicts (`regression-item`), and the
detector reports ANY oracle change within a run, not only the fail-then-pass shape.

Everything here drives the real hook and the real CLI via subprocess, state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
RELAY = ROOT / "bin" / "relay"


def _arm(tmp_path, c1_cmd="! grep -q SECRET f1"):
    """Two gates. C1 is a real control over f1; C2 just needs f2. Both pass on the first fire."""
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    (work / "f1").write_text("clean\n")
    (work / "f2").write_text("x\n")
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [
        {"id": "wp1", "instructions": "i1",
         "checklist": [{"id": "C1", "assert": "no secret in f1", "cmd": c1_cmd}]},
        {"id": "wp2", "instructions": "i2",
         "checklist": [{"id": "C2", "assert": "f2 exists", "cmd": "test -f f2"}]},
    ]
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    subprocess.run(["bash", str(HOOK)],
                   input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                   capture_output=True, text=True, env=env)


def _swap_c1(arms, cmd):
    p = arms / "tok" / "sprint.json"
    d = json.loads(p.read_text())
    d["work_packages"][0]["checklist"][0]["cmd"] = cmd
    p.write_text(json.dumps(d))


def _verify(arms):
    r = subprocess.run(["python3", str(RELAY), "verify", str(arms / "tok" / "ledger.jsonl"), "--json"],
                       capture_output=True, text=True)
    return json.loads(r.stdout), r.returncode


def _entries(arms):
    return [json.loads(l) for l in (arms / "tok" / "ledger.jsonl").read_text().splitlines() if l.strip()]


def test_swapping_a_passed_control_is_not_an_auditable_pass(tmp_path):
    """The reproduced attack. Before V3 this returned PASS/exit 0 with the violation on disk."""
    arms, work, corpus = _arm(tmp_path)
    _fire(arms, corpus)                       # wp1: C1 passes -> advance to wp2
    assert (arms / "tok" / "position").read_text().strip() == "wp2"

    _swap_c1(arms, "true")                    # the question is changed; id and assert untouched
    (work / "f1").write_text("SECRET=hunter2\n")   # and the violation lands on disk

    _fire(arms, corpus)                       # wp2 passes; the regression guard re-runs C1
    out, code = _verify(arms)

    assert out["chain_intact"] is True, "nothing was tampered with — integrity cannot catch this"
    assert code == 2 and out["result"] == "ORACLE-DRIFT", out
    drift = {d["id"] for d in out["oracle_drift"]}
    assert drift == {"C1"}, out["oracle_drift"]
    assert (work / "f1").read_text().startswith("SECRET"), "the violation must still be on disk"


def test_the_regression_re_run_is_recorded(tmp_path):
    """The gap under the gap: a re-run changes the decision but used to leave no trace at all."""
    arms, work, corpus = _arm(tmp_path)
    _fire(arms, corpus)
    _fire(arms, corpus)
    reg = [e for e in _entries(arms) if e["event"] == "regression-item"]
    assert reg, "the regression guard must record the controls it re-runs"
    assert all(e.get("oracle") for e in reg), "a re-run with no oracle is not comparable"
    assert {e["item"] for e in reg} == {"C1"}
    assert all(e["verdict"] == "pass" for e in reg)
    assert all(e["origin"] == "regression" for e in reg), "provenance says which path graded it"


def test_a_regression_verdict_is_not_a_gate_verdict(tmp_path):
    """`regression-item` is a distinct event so 'the final verdict per control' keeps its meaning:
    as graded at its own gate. A re-run reports on kept work, not on a gate being cleared."""
    arms, work, corpus = _arm(tmp_path)
    _fire(arms, corpus)
    _fire(arms, corpus)
    out, code = _verify(arms)
    assert code == 0 and out["result"] == "PASS", out
    ids = [c["id"] for c in out["controls"]]
    assert ids.count("C1") == 1, "one final verdict per control, not one per re-run"
    assert out["deterministic_total"] == 2


def test_an_unchanged_run_reports_no_drift(tmp_path):
    """The false-positive guard: re-running the SAME command many times is not drift."""
    arms, work, corpus = _arm(tmp_path)
    _fire(arms, corpus)
    _fire(arms, corpus)
    out, code = _verify(arms)
    assert out["oracle_drift"] == [], out["oracle_drift"]
    assert code == 0 and out["result"] == "PASS"


def test_the_laundered_subset_is_still_named(tmp_path):
    """The older, louder claim — failed under one check, passes under another — must survive as a
    labelled subset rather than being flattened into generic drift."""
    arms, work, corpus = _arm(tmp_path)
    (work / "f1").write_text("SECRET=hunter2\n")   # C1 fails at its own gate
    _fire(arms, corpus)
    assert (arms / "tok" / "position").read_text().strip() == "wp1", "must not have advanced"

    _swap_c1(arms, "true")                          # repair the question instead of the code
    _fire(arms, corpus)                             # now wp1 'passes' and advances
    out, code = _verify(arms)

    assert code == 2, out["result"]
    lau = [d for d in out["oracle_drift"] if d["laundered"]]
    assert [d["id"] for d in lau] == ["C1"], out["oracle_drift"]
    assert out["result"] == "ORACLE-CHANGED", "the stronger claim wins when it applies"


def test_collapse_does_not_hide_drift(tmp_path):
    """Round collapse (R7) drops a fire that carries no new information. An oracle change IS new
    information: the round sha must move, or the swap would be collapsed away."""
    arms, work, corpus = _arm(tmp_path)
    (work / "f2").unlink()                          # wp1 passes, wp2 will fail, so we can re-fire
    _fire(arms, corpus)                             # -> wp2
    _fire(arms, corpus)                             # wp2 fails; round recorded
    before = [e["round"] for e in _entries(arms) if e.get("round")][-1]
    _swap_c1(arms, "true")                          # same failing set, different oracle for C1
    _fire(arms, corpus)
    after = [e["round"] for e in _entries(arms) if e.get("round")][-1]
    assert before != after, "an oracle change must not be collapsed as 'the same round'"

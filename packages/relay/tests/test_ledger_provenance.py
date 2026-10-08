"""R5 — the chain must record WHAT it gated against, not only the verdict.

Before this, `ledger_item` wrote {id, assert, verdict, graded_by}. The `cmd` — the only thing tying
the assertion to reality — never entered the hashed body, while `sprint.json` is re-read fresh on
every fire and `relay verify` takes each control's LAST verdict. So swapping a control's `cmd` while
keeping its `id`/`assert` byte-identical turned a failing control into an "auditable PASS" with the
chain fully INTACT: nothing was tampered with, because the chain never knew what it was verifying.

These tests pin: the oracle and the origin are on the chain, `gen` is stamped, and the swap is now
caught. Drives the REAL bin/relay-arm-hook.sh via subprocess; all state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
RELAY = ROOT / "bin" / "relay"


def _arm(tmp_path, cmd, *, control_id="LGPD-1",
         assertion="no raw email (PII) reaches the application logs", extra=None, gen=None):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    (arms / "tok").mkdir(parents=True, exist_ok=True)
    work.mkdir(exist_ok=True)
    control = {"id": control_id, "assert": assertion, "cmd": cmd}
    if extra:
        control.update(extra)
    sprint = {"brief": "x", "retry_budget": 5,
              "work_packages": [{"id": "wp1", "instructions": "do it", "checklist": [control]}]}
    if gen is not None:
        sprint["gen"] = gen
    (arms / "tok" / "sprint.json").write_text(json.dumps(sprint))
    (arms / "tok" / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (arms / "tok" / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    (arms / "tok" / "counter").write_text("0")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    return json.loads(r.stdout.strip()) if r.stdout.strip() else None


def _set_cmd(arms, cmd):
    p = arms / "tok" / "sprint.json"
    s = json.loads(p.read_text())
    s["work_packages"][0]["checklist"][0]["cmd"] = cmd
    p.write_text(json.dumps(s))


def _items(arms):
    return [json.loads(ln) for ln in (arms / "tok" / "ledger.jsonl").read_text().splitlines()
            if ln.strip() and json.loads(ln).get("event") == "checklist-item"]


def _verify(tmp_path, arms):
    run = tmp_path / "run" / ".relay-state"
    run.mkdir(parents=True, exist_ok=True)
    (run / "ledger.jsonl").write_text((arms / "tok" / "ledger.jsonl").read_text())
    r = subprocess.run(["python3", str(RELAY), "verify", str(tmp_path / "run"), "--json"],
                       capture_output=True, text=True)
    return r.returncode, json.loads(r.stdout)


def test_oracle_and_origin_are_on_the_chain(tmp_path):
    """Every checklist-item entry carries the oracle it ran and where the control came from."""
    arms, work, corpus = _arm(tmp_path, cmd="true")
    _fire(arms, corpus)
    (item,) = _items(arms)
    assert len(item["oracle"]) == 64, "oracle must be a full sha256 of the cmd"
    assert item["oracle"] == __import__("hashlib").sha256(b"true").hexdigest()
    assert item["origin"] == "sprint"
    assert item["cmd"] is None if "cmd" in item else True  # the command itself never lands on the chain


def test_gen_is_stamped_inside_the_hashed_body(tmp_path):
    """`gen` attributes a verdict to a version of the plan, and rides inside the signature."""
    arms, work, corpus = _arm(tmp_path, cmd="true", gen=7)
    _fire(arms, corpus)
    lines = [json.loads(ln) for ln in (arms / "tok" / "ledger.jsonl").read_text().splitlines() if ln.strip()]
    assert all(e["gen"] == 7 for e in lines), "every entry carries the generation it was judged under"
    # inside the body: the h is computed over everything except h itself, so stripping h and
    # re-hashing must reproduce it — that is what verify_ledger.py does.
    raw = (arms / "tok" / "ledger.jsonl").read_text().splitlines()[0]
    body = raw[:raw.rfind(',"h":')] + "}"
    assert '"gen":7' in body


def test_policy_stamp_reaches_the_chain(tmp_path):
    """bin/relay-policy.py stamps `policy` on injected controls; until R5 nothing read it."""
    arms, work, corpus = _arm(tmp_path, cmd="true", extra={"policy": "no-debug-prints"})
    _fire(arms, corpus)
    assert _items(arms)[0]["origin"] == "policy:no-debug-prints"


def test_explicit_origin_survives(tmp_path):
    """An orchestrator injecting a control mid-run stamps its own provenance."""
    arms, work, corpus = _arm(tmp_path, cmd="true", extra={"origin": "injected:techlead"})
    _fire(arms, corpus)
    assert _items(arms)[0]["origin"] == "injected:techlead"


def test_swapping_the_oracle_no_longer_certifies(tmp_path):
    """THE REGRESSION. A control that FAILS one check and PASSES a different one was not repaired.

    Reproduces the original exploit end to end: a real PII control fails against a log that contains
    an email; only the `cmd` is then replaced with `true`; the id and the assert stay byte-identical.
    The chain stays INTACT throughout — nothing is tampered with — so integrity cannot catch this.
    """
    arms, work, corpus = _arm(tmp_path, cmd="! grep -q '@' app.log")
    (work / "app.log").write_text("user=gustavo@example.com logged in\n")

    out = _fire(arms, corpus)
    assert out and out["decision"] == "block", "the real check must fail while the violation is present"

    _set_cmd(arms, "true")           # swap the oracle only
    _fire(arms, corpus)              # chain completes

    assert (work / "app.log").exists() and "@" in (work / "app.log").read_text(), \
        "the violation is untouched — only the question changed"

    code, rep = _verify(tmp_path, arms)
    assert rep["chain_intact"] is True, "nothing was tampered with; integrity is not the defence here"
    assert rep["result"] == "ORACLE-CHANGED", rep
    assert code == 2, "an oracle swap must never be certified as an auditable pass"
    (l,) = rep["laundered_controls"]
    assert l["id"] == "LGPD-1"
    assert l["verdicts"] == ["fail", "pass"]
    assert len(set(l["oracles"])) == 2


def test_honest_repair_still_passes(tmp_path):
    """The mirror case: same oracle throughout, the WORK is fixed. That is a real repair."""
    arms, work, corpus = _arm(tmp_path, cmd="! grep -q '@' app.log")
    (work / "app.log").write_text("user=gustavo@example.com logged in\n")

    assert _fire(arms, corpus)["decision"] == "block"
    (work / "app.log").write_text("user=<redacted> logged in\n")   # fix the violation, not the check
    _fire(arms, corpus)

    code, rep = _verify(tmp_path, arms)
    assert rep["laundered_controls"] == []
    assert rep["result"] == "PASS" and code == 0


def test_legacy_entries_without_an_oracle_are_not_guessed_at(tmp_path):
    """Ledgers written before R5 carry no `oracle`. They must not be retro-flagged."""
    run = tmp_path / "run" / ".relay-state"
    run.mkdir(parents=True)
    import hashlib
    lines, prev, seq = [], "GENESIS", 0
    for verdict in ("fail", "pass"):
        body = json.dumps({"ts": 1, "wp": "wp1", "i": 0, "event": "checklist-item", "item": "C1",
                           "assert": "a", "verdict": verdict, "graded_by": "deterministic",
                           "prev": prev, "seq": seq, "mac": "sha256"}, separators=(",", ":"))
        h = hashlib.sha256(body.encode()).hexdigest()
        lines.append(body[:-1] + f',"h":"{h}"}}')
        prev, seq = h, seq + 1
    body = json.dumps({"ts": 1, "wp": "wp1", "i": 0, "event": "sprint-complete", "retry": 0,
                       "fails": "", "reg": "", "prev": prev, "seq": seq, "mac": "sha256"},
                      separators=(",", ":"))
    h = hashlib.sha256(body.encode()).hexdigest()
    lines.append(body[:-1] + f',"h":"{h}"}}')
    (run / "ledger.jsonl").write_text("\n".join(lines) + "\n")

    r = subprocess.run(["python3", str(RELAY), "verify", str(tmp_path / "run"), "--json"],
                       capture_output=True, text=True)
    rep = json.loads(r.stdout)
    assert rep["chain_intact"] is True, "a pre-R5 chain still verifies — the fields are additive"
    assert rep["laundered_controls"] == []
    assert rep["result"] == "PASS"

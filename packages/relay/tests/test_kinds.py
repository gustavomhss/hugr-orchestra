"""V6 (docs/relay-v2.md §2.3) — a sub-state declares its KIND, and one of them does real work.

Protocol Enforcer's five sub-state types are the authoring surface the profile compiler targets, so
Relay has to accept them. They are not equal in weight, and this file is explicit about which is
which rather than pretending the engine treats them all specially:

  * `inject` is REAL behavior. The state has no work of its own: the engine reads the named file and
    delivers its actual bytes, records the file's sha on the chain, and the state clears in the same
    fire. This is the one that must not be faked — a profile that says "load protocol X" and gets an
    empty injection has silently dropped the rules it was about to be judged against.
  * `review` adds a cold-read reminder to the reason. A REMINDER, not enforcement: the engine cannot
    spawn a fresh context, and pretending otherwise would be the worse failure.
  * `execute` (the default) and `gate` are DECLARATIONS. They change nothing in the engine today;
    they exist so V8's lint and V9's compiler can tell a working state from a checkpoint.

Every kind is recorded on the ledger, so the trace says what each state was rather than leaving a
reader to infer it from the shape of the checklist.

Drives the real bin/relay-arm-hook.sh via subprocess, state isolated in tmp_path.
"""
import hashlib
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _arm(tmp_path, wps):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 2, "work_packages": wps}))
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


def _entries(arms):
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _wp(wid, kind=None, gated=True, **extra):
    wp = {"id": wid, "instructions": f"do {wid}"}
    if gated:
        wp["checklist"] = [{"id": f"c{wid}", "assert": "a", "cmd": "true"}]
    if kind:
        wp["kind"] = kind
    wp.update(extra)
    return wp


# --------------------------------------------------------------------------------- inject is real

def test_inject_delivers_the_file_s_actual_bytes(tmp_path):
    arms, work, corpus = _arm(tmp_path, [
        _wp("load", kind="inject", gated=False, file="protocol.md"),
        _wp("wp2")])
    (work / "protocol.md").write_text("MUST: every claim carries its evidence.\nMUST: no silent caps.\n")
    out, _ = _fire(arms, corpus)
    assert out and "MUST: every claim carries its evidence." in out["reason"], out
    assert "MUST: no silent caps." in out["reason"], "the whole file, not the first line"
    assert "do wp2" in out["reason"], "and the next state's instructions ride along"


def test_inject_records_the_file_sha(tmp_path):
    """What was injected has to be as auditable as what was checked — otherwise a run's rules can be
    swapped between states with nothing on the chain to show it, which is D1 in another costume."""
    arms, work, corpus = _arm(tmp_path, [
        _wp("load", kind="inject", gated=False, file="protocol.md"), _wp("wp2")])
    body = "MUST: reproduce before scoping.\n"
    (work / "protocol.md").write_text(body)
    _fire(arms, corpus)
    inj = [e for e in _entries(arms) if e.get("event") == "inject"]
    assert len(inj) == 1, inj
    assert inj[0]["sha"] == hashlib.sha256(body.encode()).hexdigest(), inj[0]
    assert inj[0]["file"] == "protocol.md"


def test_inject_clears_in_one_fire(tmp_path):
    arms, work, corpus = _arm(tmp_path, [
        _wp("load", kind="inject", gated=False, file="p.md"), _wp("wp2"), _wp("wp3")])
    (work / "p.md").write_text("x\n")
    _fire(arms, corpus)
    assert (arms / "tok" / "position").read_text().strip() == "wp2", "a state with no work of its own"


def test_a_missing_inject_file_fails_closed(tmp_path):
    """An empty injection is worse than a loud stop: the agent proceeds to be judged against rules it
    was never given. Treated like POSITION LOST — a plan defect the agent cannot repair, so it is
    recorded and surfaced rather than re-blocked at a model turn per fire."""
    arms, work, corpus = _arm(tmp_path, [
        _wp("load", kind="inject", gated=False, file="missing.md"), _wp("wp2")])
    out, err = _fire(arms, corpus)
    assert [e for e in _entries(arms) if e.get("event") == "inject-missing"], _entries(arms)
    assert (arms / "tok" / "position").read_text().strip() == "load", "it must NOT advance"
    assert "missing.md" in err, err


def test_an_inject_with_a_checklist_still_gates(tmp_path):
    """Composition, so `inject` can never be a way to smuggle a state past its controls."""
    arms, work, corpus = _arm(tmp_path, [
        {"id": "load", "kind": "inject", "file": "p.md", "instructions": "",
         "checklist": [{"id": "c1", "assert": "a", "cmd": "test -f done"}]},
        _wp("wp2")])
    (work / "p.md").write_text("x\n")
    out, _ = _fire(arms, corpus)
    assert out and out["decision"] == "block" and "c1" in out["reason"], out
    assert (arms / "tok" / "position").read_text().strip() == "load"


# ------------------------------------------------------------------------- review reminds, honestly

def test_review_carries_a_cold_read_reminder(tmp_path):
    arms, work, corpus = _arm(tmp_path, [_wp("wp1"), _wp("hostile", kind="review")])
    out, _ = _fire(arms, corpus)
    assert "cold" in out["reason"].lower(), out["reason"]
    assert "do hostile" in out["reason"]


# ------------------------------------------------------------------- the trace says what each was

def test_the_kind_is_on_the_ledger(tmp_path):
    arms, work, corpus = _arm(tmp_path, [_wp("wp1", kind="gate"), _wp("wp2")])
    _fire(arms, corpus)
    items = [e for e in _entries(arms) if e.get("event") == "checklist-item"]
    assert items and all(e.get("kind") == "gate" for e in items), items


def test_an_undeclared_kind_stays_absent_from_the_ledger(tmp_path):
    """`execute` is the default, and a sprint that declares nothing must produce the bytes it always
    produced — the benchmark hook shares this format and its historical hashes must stay comparable."""
    arms, work, corpus = _arm(tmp_path, [_wp("wp1"), _wp("wp2")])
    _fire(arms, corpus)
    assert all("kind" not in e for e in _entries(arms)), _entries(arms)


def test_an_unknown_kind_is_refused_not_silently_run_as_execute(tmp_path):
    """Silently treating a typo as `execute` turns a mis-declared inject into a state that delivers
    nothing and passes — the exact failure the kinds exist to prevent."""
    arms, work, corpus = _arm(tmp_path, [_wp("wp1", kind="excute"), _wp("wp2")])
    out, err = _fire(arms, corpus)
    assert [e for e in _entries(arms) if e.get("event") == "unknown-kind"], _entries(arms)
    assert "excute" in err, err
    assert (arms / "tok" / "position").read_text().strip() == "wp1", "it must not advance"


# ------------------------------------------------------------------ inline injection (V6b)

def test_inject_can_carry_inline_text(tmp_path):
    """Protocol Enforcer's `inject` has two shapes: a FILE (a skill, a protocol) and inline CONTEXT
    written in the profile itself. Both are "no work of its own, deliver the bytes", so both belong
    to this kind — supporting only the file shape would have forced the compiler to smuggle inline
    context into `instructions`, where it stops being an injection and stops being recorded."""
    arms, work, corpus = _arm(tmp_path, [
        _wp("seed", kind="inject", gated=False,
            text="Task: add a token-bucket rate limiter to the gateway."),
        _wp("wp2")])
    out, _ = _fire(arms, corpus)
    assert out and "token-bucket rate limiter" in out["reason"], out
    inj = [e for e in _entries(arms) if e.get("event") == "inject"]
    assert len(inj) == 1 and inj[0]["file"] == "(inline)", inj[0]
    assert inj[0]["sha"] == hashlib.sha256(
        b"Task: add a token-bucket rate limiter to the gateway.").hexdigest(), inj[0]


def test_an_inject_with_neither_file_nor_text_fails_closed(tmp_path):
    arms, work, corpus = _arm(tmp_path, [_wp("seed", kind="inject", gated=False), _wp("wp2")])
    out, err = _fire(arms, corpus)
    assert [e for e in _entries(arms) if e.get("event") == "inject-missing"], _entries(arms)
    assert (arms / "tok" / "position").read_text().strip() == "seed"


def test_a_file_beats_inline_text_when_both_are_given(tmp_path):
    """An authoring mistake, resolved toward the thing that can be independently inspected and whose
    sha means something outside this sprint."""
    arms, work, corpus = _arm(tmp_path, [
        _wp("seed", kind="inject", gated=False, file="p.md", text="INLINE-MARKER"), _wp("wp2")])
    (work / "p.md").write_text("FILE-MARKER\n")
    out, _ = _fire(arms, corpus)
    assert "FILE-MARKER" in out["reason"] and "INLINE-MARKER" not in out["reason"], out

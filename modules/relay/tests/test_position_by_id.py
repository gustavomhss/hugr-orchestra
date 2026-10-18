"""R6 — the chain's position is a WP id, and keep-best binds only to what was accepted.

Two defects, one root cause. Advancement was an integer index into `work_packages`, and the
regression guard re-ran every control at a lower index. sprint.json is re-read fresh on every fire,
so inserting a WP ahead of the cursor (a) re-aimed the index at a different WP and (b) charged a
control that did not exist while the runner worked as an "earlier gate regression" — and because a
regression-only failure deliberately does not burn the current gate's retry budget, the only exit
from the loop was disabled. Measured before the fix: 12 fires, counter unmoved, retry 0 throughout,
zero escalate events. A block costs a model turn, so that is an unbounded spend nobody is told about.

The rule now is the compliance criterion (ADEPT / van der Aalst): an amended plan binds only where
the existing ledger is still a valid trace of it. A control the chain never accepted cannot regress.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"


def _wp(wid, cid, path):
    return {"id": wid, "instructions": f"do {wid}",
            "checklist": [{"id": cid, "assert": f"{cid} done", "cmd": f"test -f {path}"}]}


def _arm(tmp_path, ids=("A", "B", "C")):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    (arms / "tok").mkdir(parents=True)
    work.mkdir()
    wps = [_wp(w, f"c{w}", work / w.lower()) for w in ids]
    (arms / "tok" / "sprint.json").write_text(
        json.dumps({"brief": "x", "retry_budget": 9, "gen": 1, "work_packages": wps}))
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


def _mutate(arms, fn):
    p = arms / "tok" / "sprint.json"
    s = json.loads(p.read_text())
    fn(s)
    s["gen"] = s.get("gen", 0) + 1
    p.write_text(json.dumps(s))


def _pos(arms):
    return (arms / "tok" / "position").read_text().strip()


def test_position_is_an_id_not_an_index(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)
    assert _pos(arms) == "B", "position names the WP it stands on"
    assert (arms / "tok" / "counter").read_text().strip() == "1", "counter kept as a derived mirror"


def test_splice_after_the_cursor_reaches_the_new_state(tmp_path):
    """The mutation the orchestrator actually wants. Always compliant: history is untouched."""
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)                                    # A passes, cursor at B
    _mutate(arms, lambda s: s["work_packages"].insert(
        2, _wp("NEW", "cNEW", work / "n")))                # A B [NEW] C
    (work / "b").write_text("x")
    out = _fire(arms, corpus)
    assert "NEW" in out["reason"], out["reason"]
    assert _pos(arms) == "NEW"


def test_splice_before_the_cursor_does_not_re_aim(tmp_path):
    """Under an index the cursor silently pointed at a different WP. Named, it cannot."""
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)
    assert _pos(arms) == "B"
    _mutate(arms, lambda s: s["work_packages"].insert(0, _wp("EARLY", "cE", work / "never")))
    (work / "b").write_text("x")
    _fire(arms, corpus)
    assert _pos(arms) == "C", "the cursor followed the WP, not the slot"


def test_splice_before_the_cursor_does_not_livelock(tmp_path):
    """THE REGRESSION. A control spliced in behind the cursor was never accepted, so it cannot
    'regress' — and must not block a runner that was never given that work."""
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)                                     # A accepted
    _mutate(arms, lambda s: s["work_packages"].insert(
        0, _wp("EARLY", "cE", work / "never-created")))      # unsatisfiable, never assigned
    (work / "b").write_text("x")
    (work / "c").write_text("x")

    outs = [_fire(arms, corpus) for _ in range(6)]
    reasons = [o["reason"] for o in outs if o]
    assert not any("regress" in r.lower() for r in reasons), \
        f"a never-accepted control must not be reported as a backslide: {reasons}"

    state = (arms / "tok" / "state").read_text().strip()
    assert state == "complete", f"the chain must finish rather than block forever (state={state})"
    ledger = (arms / "tok" / "ledger.jsonl").read_text()
    assert '"event":"sprint-complete"' in ledger


def test_accepted_control_still_regresses(tmp_path):
    """The mirror case: keep-best still has teeth for work the chain DID accept."""
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)                       # A accepted (cA passed)
    (work / "b").write_text("x")
    (work / "a").unlink()                     # backslide on accepted work
    out = _fire(arms, corpus)
    assert out and "regress" in out["reason"].lower(), out
    assert "cA" in out["reason"]


def test_position_lost_is_named_and_does_not_block(tmp_path):
    """A position the plan no longer contains is a named mismatch, not a silent re-aim."""
    arms, work, corpus = _arm(tmp_path)
    (work / "a").write_text("x")
    _fire(arms, corpus)                       # cursor at B
    _mutate(arms, lambda s: s["work_packages"].__setitem__(
        slice(0, None), [w for w in s["work_packages"] if w["id"] != "B"]))
    out = _fire(arms, corpus)
    assert out is None, "must not block the runner against work it cannot be given"
    ledger = (arms / "tok" / "ledger.jsonl").read_text()
    assert '"event":"position-lost"' in ledger


def test_migrates_an_arm_that_predates_position(tmp_path):
    """Arms created before R6 carry only the integer counter."""
    arms, work, corpus = _arm(tmp_path)
    (arms / "tok" / "counter").write_text("2")     # standing on C, pre-R6 style
    (work / "c").write_text("x")
    out = _fire(arms, corpus)
    assert out is None and (arms / "tok" / "state").read_text().strip() == "complete"
    assert _pos(arms) == "C", "the integer resolved to the id it meant at migration time"

"""V1 (docs/relay-v2.md §2.2) — the chain's position is TWO coordinates: `macro.sub`.

A flat sprint gives one coordinate, so a failure localizes to a work package and no further. The
whole point of the enforcement model is that it localizes to `macro2.sub3, control C7`. So a WP may
declare a `macro`, the sprint carries a `macros[]` lookup table, and the position file holds both.

Three properties are load-bearing and each has a test here:

  * **a v1 sprint is unaffected** — no `macros[]`, no `macro` on any WP, and the ledger bytes carry
    no `macro` field at all. `lib/relay-gate.sh` is shared with `benchmark/relay_hook.sh`, whose
    historical ledger hashes must stay comparable, so the field appears only when declared;
  * **a macro's instructions are injected once**, when the chain first enters it — not once per
    sub-state. A macro is a scope, not a loop;
  * **the position still resolves by id**, never by array index (R6), including when an id itself
    contains a dot.

Drives the real bin/relay-arm-hook.sh via subprocess, state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


def _arm(tmp_path, wps, macros=None):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    sprint = {"brief": "x", "retry_budget": 3, "work_packages": wps}
    if macros is not None:
        sprint["macros"] = macros
    (d / "sprint.json").write_text(json.dumps(sprint))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus), "PATH": os.environ["PATH"]}
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    out = r.stdout.strip()
    return json.loads(out) if out else None


def _entries(arms):
    return [json.loads(l) for l in (arms / "tok" / "ledger.jsonl").read_text().splitlines() if l.strip()]


def _pos(arms):
    return (arms / "tok" / "position").read_text().strip()


def _passing(wid, macro=None, n=1):
    wp = {"id": wid, "instructions": f"do {wid}",
          "checklist": [{"id": f"c{wid}", "assert": "always", "cmd": "true"}]}
    if macro:
        wp["macro"] = macro
    return wp


# --------------------------------------------------------------------------- v1 stays v1

def test_a_v1_sprint_is_byte_for_byte_unaffected(tmp_path):
    """No macros[], no macro field: the position stays a bare id and no `macro` key is ever written.
    The benchmark hook shares this ledger format and its historical hashes must stay comparable."""
    arms, work, corpus = _arm(tmp_path, [_passing("wp1"), _passing("wp2")])
    _fire(arms, corpus)
    assert _pos(arms) == "wp2", "a v1 position is a bare WP id"
    _fire(arms, corpus)
    entries = _entries(arms)
    assert entries, "the chain must have run"
    assert all("macro" not in e for e in entries), \
        "a sprint that declares no macro must not grow a macro field: " + str(entries[0])
    r = subprocess.run(["python3", str(VERIFY), str(arms / "tok" / "ledger.jsonl")],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr


# --------------------------------------------------------------------------- two coordinates

def test_position_carries_both_coordinates(tmp_path):
    arms, work, corpus = _arm(
        tmp_path,
        [_passing("intake", "frame"), _passing("terms", "frame"), _passing("carve", "carve")],
        macros=[{"id": "frame", "title": "FRAME", "instructions": "Load the FRAME protocol."},
                {"id": "carve", "title": "CARVE", "instructions": "Load the CARVE protocol."}])
    _fire(arms, corpus)
    assert _pos(arms) == "frame.terms", _pos(arms)
    _fire(arms, corpus)
    assert _pos(arms) == "carve.carve", _pos(arms)


def test_the_ledger_records_the_macro(tmp_path):
    arms, work, corpus = _arm(
        tmp_path, [_passing("intake", "frame"), _passing("terms", "frame")],
        macros=[{"id": "frame", "instructions": "Load FRAME."}])
    _fire(arms, corpus)
    items = [e for e in _entries(arms) if e.get("event") == "checklist-item"]
    assert items and all(e.get("macro") == "frame" for e in items), items
    r = subprocess.run(["python3", str(VERIFY), str(arms / "tok" / "ledger.jsonl")],
                       capture_output=True, text=True)
    assert r.returncode == 0, "the added field must stay inside a verifiable body"


# --------------------------------------------------------------------------- a macro is a scope

def test_macro_instructions_are_injected_once_not_per_sub(tmp_path):
    """A macro is a scope, not a loop. Entering it costs one injection; its subs do not each pay."""
    arms, work, corpus = _arm(
        tmp_path,
        [_passing("a", "frame"), _passing("b", "frame"), _passing("c", "frame"), _passing("d", "carve")],
        macros=[{"id": "frame", "instructions": "FRAME-PROTOCOL-MARKER"},
                {"id": "carve", "instructions": "CARVE-PROTOCOL-MARKER"}])
    reasons = []
    for _ in range(3):
        out = _fire(arms, corpus)
        reasons.append(out["reason"] if out else "")
    joined = "\n".join(reasons)
    assert joined.count("FRAME-PROTOCOL-MARKER") == 1, reasons
    assert joined.count("CARVE-PROTOCOL-MARKER") == 1, "crossing into a new macro injects it once"


def test_entering_the_first_macro_injects_it(tmp_path):
    """The chain starts inside macro 1, so its instructions must reach the agent on the first
    advance — otherwise sub 1 is the only state that never sees its own protocol."""
    arms, work, corpus = _arm(
        tmp_path, [_passing("a", "frame"), _passing("b", "frame")],
        macros=[{"id": "frame", "instructions": "FRAME-PROTOCOL-MARKER"}])
    out = _fire(arms, corpus)
    assert out and "FRAME-PROTOCOL-MARKER" in out["reason"], out


# --------------------------------------------------------------------------- resolution by id

def test_a_sub_id_containing_a_dot_still_resolves(tmp_path):
    """The macro coordinate is the text before the FIRST dot, so a dotted id is the ambiguous case.
    Resolution tries the whole string as an id before splitting, so both shapes work."""
    arms, work, corpus = _arm(
        tmp_path, [_passing("v1.impl", "frame"), _passing("v1.test", "frame")],
        macros=[{"id": "frame", "instructions": "F"}])
    _fire(arms, corpus)
    assert _pos(arms) == "frame.v1.test", _pos(arms)
    out = _fire(arms, corpus)
    assert (arms / "tok" / "state").read_text().strip() == "complete", out


def test_a_v1_position_file_is_migrated_not_lost(tmp_path):
    """An arm that predates v2 has a bare id on disk. It must keep running, not report POSITION LOST."""
    arms, work, corpus = _arm(
        tmp_path, [_passing("a", "frame"), _passing("b", "frame")],
        macros=[{"id": "frame", "instructions": "F"}])
    (arms / "tok" / "position").write_text("a")     # the pre-v2 shape
    out = _fire(arms, corpus)
    assert out and out["decision"] == "block", out
    assert "POSITION LOST" not in (out["reason"] or "")
    assert _pos(arms) == "frame.b", _pos(arms)

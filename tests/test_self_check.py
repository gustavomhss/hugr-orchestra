"""V4 (docs/relay-v2.md §3) — the self-check ships WITH the next state's instructions.

A self-check asked only after a failure is a remedy. Asked in advance, it is a forcing function: an
agent that knows what it will be asked works toward it while it still can. Unaided self-correction
is known to plateau or hurt; anchored to an external check that runs whatever the agent says, it
works. The anchor is the gate — this is not one.

So three properties, and each has a test:

  * it rides the ADVANCE, never the failure — a gate-fail reason stays the failing control ids,
    because at that moment the agent needs the gap, not a questionnaire;
  * it produces NO ledger entry. A self-check is text. It is never a verdict, and a chain that
    recorded it as one would be certifying the agent's own account of its work;
  * it must not restate the control. If the deterministic control measures the outcome and the
    self-check asks the same question, the self-check is decoration — V8's lint catches that; this
    file only guarantees the delivery.

Drives the real bin/relay-arm-hook.sh via subprocess, state isolated in tmp_path.
"""
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
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 3, "work_packages": wps}))
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
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _wp(wid, cmd="true", self_check=None):
    wp = {"id": wid, "instructions": f"do {wid}",
          "checklist": [{"id": f"c{wid}", "assert": "a", "cmd": cmd}]}
    if self_check:
        wp["self_check"] = self_check
    return wp


def test_the_self_check_rides_the_advance(tmp_path):
    arms, work, corpus = _arm(tmp_path, [
        _wp("wp1"),
        _wp("wp2", self_check=["Which upstream did you bind, and where is it recorded?",
                               "What did you NOT do that the packet asked for?"])])
    out = _fire(arms, corpus)
    assert out and out["decision"] == "block"
    assert "Which upstream did you bind" in out["reason"], out["reason"]
    assert "What did you NOT do" in out["reason"], "every question is delivered, not just the first"
    assert "do wp2" in out["reason"], "the instructions still come with it"


def test_a_gate_failure_does_not_carry_a_self_check(tmp_path):
    """At a failure the agent needs the gap, not a questionnaire. The reason stays the failing ids."""
    arms, work, corpus = _arm(tmp_path, [
        _wp("wp1", cmd="false", self_check=["SELF-CHECK-MARKER"]),
        _wp("wp2", self_check=["SELF-CHECK-MARKER"])])
    out = _fire(arms, corpus)
    assert out and out["decision"] == "block"
    assert "SELF-CHECK-MARKER" not in out["reason"], out["reason"]
    assert "cwp1" in out["reason"], "the failing control id is what a failure delivers"


def test_a_self_check_is_never_a_verdict(tmp_path):
    """A chain that recorded a self-check as a verdict would be certifying the agent's own account
    of its work — exactly what the ledger exists not to do."""
    plain, work, corpus = _arm(tmp_path / "a", [_wp("wp1"), _wp("wp2")])
    _fire(plain, corpus)
    checked, work2, corpus2 = _arm(tmp_path / "b", [_wp("wp1"), _wp("wp2", self_check=["q1", "q2"])])
    _fire(checked, corpus2)

    a, b = _entries(plain), _entries(checked)
    assert [e["event"] for e in a] == [e["event"] for e in b], "a self-check adds no ledger events"
    assert not any("self_check" in json.dumps(e) for e in b), b


def test_a_wp_without_a_self_check_advances_cleanly(tmp_path):
    """The field is optional and its absence must leave no residue in the reason."""
    arms, work, corpus = _arm(tmp_path, [_wp("wp1"), _wp("wp2")])
    out = _fire(arms, corpus)
    assert out["reason"].strip().endswith("do wp2"), repr(out["reason"])


def test_the_first_wp_self_check_is_not_the_hook_s_to_deliver(tmp_path):
    """A documented boundary, tested so nobody 'fixes' it by inventing a pre-first-fire injection.

    The hook only ever speaks when the agent stops, so the first sub-state's context — its
    instructions, its macro's protocol, its self-check — is the ARM AUTHOR's to seed in the opening
    prompt. The hook covers every state after that. Silently dropping wp1's self_check would be a
    bug; the honest behavior is that it was never the hook's to send.
    """
    arms, work, corpus = _arm(tmp_path, [
        _wp("wp1", self_check=["FIRST-WP-MARKER"]),
        _wp("wp2", self_check=["SECOND-WP-MARKER"])])
    out = _fire(arms, corpus)
    assert "FIRST-WP-MARKER" not in out["reason"], "wp1 already ran; asking now would be a remedy"
    assert "SECOND-WP-MARKER" in out["reason"], "wp2's arrives before wp2 starts, which is the point"


def test_the_self_check_survives_a_macro_injection(tmp_path):
    """V1 prepends a macro's protocol on first entry. Both must arrive, in a readable order:
    the protocol that governs the state, then the work, then what will be asked about it."""
    arms, work, corpus = _arm(tmp_path, [_wp("wp1"), _wp("wp2", self_check=["SELF-CHECK-MARKER"])])
    p = arms / "tok" / "sprint.json"
    d = json.loads(p.read_text())
    d["macros"] = [{"id": "m1", "instructions": "MACRO-MARKER"}]
    for w in d["work_packages"]:
        w["macro"] = "m1"
    p.write_text(json.dumps(d))
    out = _fire(arms, corpus)
    r = out["reason"]
    assert "MACRO-MARKER" in r and "SELF-CHECK-MARKER" in r, r
    assert r.index("MACRO-MARKER") < r.index("do wp2") < r.index("SELF-CHECK-MARKER"), r

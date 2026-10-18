"""V7 / R8 (docs/control-plane.md §9) — escalation parks the arm; it does not end it.

Today escalation writes `counter = nwp` and exits silently, which in *state* is indistinguishable
from completion. It was deliberately hardened to be terminal, and `tests/test_arm_state.py` says
exactly why: "an escalated arm must not reopen and self-complete **(no human in the loop)**".

That reasoning inverts once the loop exists. `awaiting-human` is a state a human's ACTION leaves —
not a later fire, not a passing gate, not the agent deciding it is fine now. The runner is released
because turns are expensive; the arm is not finished.

Three things are tested here:

  * escalation parks as `awaiting-human`, and nothing the AGENT does leaves that state;
  * a human resumes the same gate by writing a release with a nonblank REASON. Release restores
    retry state and records provenance; the gate still has to pass before advancement;
  * `problems` is DERIVED from the chain and self-clearing, after Temporal's
    `TemporalReportedProblems` — a fleet console filters to the arms asking for attention instead of
    rendering fifteen progress bars, which is the difference between a dashboard and a queue.

Drives the real bin/relay-arm-hook.sh and bin/relay via subprocess, state isolated in tmp_path.
"""
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
RELAY = ROOT / "bin" / "relay"


def _arm(tmp_path, budget=1, n=2, first_id="wp1", macro=None):
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    d = arms / "tok"
    d.mkdir(parents=True)
    wps = [{"id": f"wp{k}", "instructions": f"do {k}",
            "checklist": [{"id": f"c{k}", "assert": "a", "cmd": f"test -f f{k}"}]}
           for k in range(1, n + 1)]
    wps[0]["id"] = first_id
    if macro:
        wps[0]["macro"] = macro
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": budget,
                                               "work_packages": wps}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")
    return arms, work, corpus


def _fire(arms, corpus, ledger_key=""):
    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus),
           "PATH": os.environ["PATH"], "LC_ALL": "C"}
    if ledger_key:
        env["RELAY_LEDGER_KEY"] = ledger_key
    r = subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(arms / "tok" / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, (r.returncode, r.stdout, r.stderr)
    out = r.stdout.strip()
    return (json.loads(out) if out else None), r.stderr


def _state(arms):
    p = arms / "tok" / "state"
    return p.read_text().strip() if p.exists() else ""


def _events(arms):
    f = arms / "tok" / "ledger.jsonl"
    return [json.loads(l) for l in f.read_text().splitlines() if l.strip()] if f.exists() else []


def _problems(arms):
    r = subprocess.run(["python3", str(RELAY), "problems", str(arms / "tok"), "--json"],
                       capture_output=True, text=True)
    return json.loads(r.stdout), r.returncode


def _park(arms, corpus, ledger_key=""):
    """Spend the budget so the arm parks."""
    _fire(arms, corpus, ledger_key)   # c1 fails, retry 1
    _fire(arms, corpus, ledger_key)   # budget spent -> park
    return _state(arms)


# ------------------------------------------------------------------- parking, and staying parked

def test_escalation_parks_as_awaiting_human(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    assert _park(arms, corpus) == "awaiting-human", _state(arms)
    assert [e for e in _events(arms) if e["event"] == "escalate"], _events(arms)


def test_a_parked_arm_does_not_self_clear_when_the_gate_would_pass(tmp_path):
    """The original hardening, preserved verbatim in intent: a gate handed to a person must not
    quietly resolve itself because the world changed underneath it."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (work / "f1").write_text("x")            # the gate would now pass
    out, _ = _fire(arms, corpus)
    assert out is None, out
    assert _state(arms) == "awaiting-human"


def test_completion_and_parking_are_distinguishable(tmp_path):
    """Both used to be an empty stdout with `counter = nwp`, so a fleet driver had to guess."""
    parked, w1, c1 = _arm(tmp_path / "p")
    _park(parked, c1)
    done, w2, c2 = _arm(tmp_path / "d")
    (w2 / "f1").write_text("x"); (w2 / "f2").write_text("x")
    _fire(done, c2); _fire(done, c2)
    assert _state(done) == "complete"
    assert _state(parked) == "awaiting-human"


# --------------------------------------------------------------------------- a human leaves it

@pytest.mark.parametrize("reason", ["", "   \n", "\t", "\t\r\n \t", "\r\n", "\v\f"])
def test_a_release_needs_a_reason(tmp_path, reason):
    """Whitespace does not supply provenance; a blank release cannot resume evaluation."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    release = arms / "tok" / "release"
    release.write_bytes(reason.encode())
    before = _freeze(arms, "blank-release-before")
    out, err = _fire(arms, corpus)
    assert _state(arms) == "awaiting-human", "an unattributed release is not a release"
    assert out is None and "reason" in err.lower(), err
    after = _freeze(arms, "blank-release-after")
    assert release.read_bytes() == reason.encode(), "rejected release is not consumed"
    stable = ("position", "counter", "state", "retry_wp1", "round_wp1", "repeat_wp1", "ledger.jsonl")
    assert {p: after[p] for p in stable} == {p: before[p] for p in stable}


def test_a_release_with_a_reason_resumes_the_arm(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("known flake in CI, verified by hand — GS\n")
    out, _ = _fire(arms, corpus)
    assert _state(arms) == "active", _state(arms)
    assert out and out["decision"] == "block", "the runner is put back to work, not let go"
    rel = [e for e in _events(arms) if e["event"] == "human-release"]
    assert len(rel) == 1 and "known flake" in rel[0]["reason"], rel
    assert (arms / "tok" / "position").read_text().strip() == "wp1", "release resumes; it does not skip"


def test_a_release_restores_the_gate_s_budget(tmp_path):
    """Resuming into a spent budget would re-park on the very next fire — a door that opens onto a
    wall. The release clears the counters for the gate it un-parks."""
    arms, work, corpus = _arm(tmp_path)          # retry_budget 1: one retry, then park
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("investigated — GS\n")
    out, _ = _fire(arms, corpus)                 # the gate still fails on this fire
    assert _state(arms) == "active", \
        "with the counter left at its spent value this fire would have re-parked at once"
    assert out and out["decision"] == "block", "and the runner is put back on the same gate"


def _freeze(arms, label):
    """Retain exact state bytes, including ledger serialization, for transition diagnosis."""
    snapshot = {p.name: p.read_bytes().hex() for p in sorted((arms / "tok").iterdir()) if p.is_file()}
    evidence = arms.parent / "evidence"
    evidence.mkdir(exist_ok=True)
    (evidence / f"{label}.json").write_text(json.dumps(snapshot, sort_keys=True, indent=2))
    return snapshot


@pytest.mark.parametrize("ledger_key", ["", "release-test-key"], ids=["plain", "keyed"])
@pytest.mark.parametrize("wid,macro,position", [
    ("wp1", None, "wp1"),
    ("v1.impl", None, "v1.impl"),
    ("wp1", "build", "build.wp1"),
    ("v1.impl", "build", "build.v1.impl"),
    ("build.wp1", "build", "build.wp1"),
], ids=["bare", "dotted", "macro-bare", "macro-dotted", "compiler-qualified"])
def test_release_cleans_actual_wp_keys_and_rechecks_same_gate(tmp_path, ledger_key, wid, macro, position):
    arms, work, corpus = _arm(tmp_path, first_id=wid, macro=macro)
    d = arms / "tok"
    if wid == "build.wp1":
        # Exercise the compiler's qualified-ID output, not a hand-written approximation.
        profile = {"name": "release-probe", "criteria_map": {"default": "test -f f1"},
                   "pipeline": [{"state_id": "build", "max_iterations": 1,
                                 "sub_states": [{"id": "wp1", "criteria": ["c1"]}]}]}
        r = subprocess.run(["python3", "-c",
                            "import json,runpy,sys; c=runpy.run_path(sys.argv[1]); "
                            "print(json.dumps(c['compile_profile'](json.loads(sys.argv[2]), qualify=True)[0]))",
                            str(ROOT / "bin" / "relay-profile.py"), json.dumps(profile)],
                           capture_output=True, text=True, env={"PATH": os.environ["PATH"]})
        assert r.returncode == 0, r.stderr
        (d / "sprint.json").write_text(r.stdout)
    assert _park(arms, corpus, ledger_key) == "awaiting-human"
    assert (d / "position").read_text() == position
    assert (d / f"retry_{wid}").read_text().strip() == "1"
    # Existing unrelated keys must survive; release targets the actual WP, not a dotted suffix.
    (d / "retry_unrelated").write_text("9")
    (d / "retry_0").write_text("1")
    (d / "reg_retry").write_text("9")
    (d / "release").write_bytes(b"  inspected\r\nby GS  \n")
    before = _freeze(arms, "release-before")
    out, err = _fire(arms, corpus, ledger_key)
    after = _freeze(arms, "release-after")
    assert _state(arms) == "active", (before, after, err)
    assert out and out["decision"] == "block" and "c1" in out["reason"], (out, err)
    assert (d / "position").read_text() == position, "release never skips the failing WP"
    assert (d / "counter").read_text().strip() == "0", "active compatibility cursor names the same WP"
    assert (d / f"retry_{wid}").read_text().strip() == "1", "fresh budget was charged once"
    assert (d / f"repeat_{wid}").read_text() == "0", "released failure starts a new full round"
    assert not (d / "reg_retry").exists()
    assert not (d / "retry_0").exists(), "legacy index retry cannot resurrect the spent budget"
    assert after["retry_unrelated"] == before["retry_unrelated"]
    assert not (d / "release").exists()
    entries = _events(arms)
    released = [e for e in entries if e["event"] == "human-release"]
    assert len(released) == 1 and released[0]["wp"] == wid and released[0]["reason"] == "inspected by GS"
    assert entries[-1]["event"] == "gate-fail" and entries[-1]["retry"] == 1
    assert entries[-2]["event"] == "checklist-item" and entries[-2]["verdict"] == "fail"
    assert _fire(arms, corpus, ledger_key)[0] is None, "spent restored budget parks again"
    assert _state(arms) == "awaiting-human", "consumed reason cannot reopen a later escalation"
    assert len([e for e in _events(arms) if e["event"] == "human-release"]) == 1
    env = {"PATH": os.environ["PATH"], "RELAY_LEDGER_KEY": ledger_key}
    verified = subprocess.run(["python3", str(ROOT / "benchmark" / "verify_ledger.py"),
                               str(d / "ledger.jsonl")], capture_output=True, text=True, env=env)
    assert verified.returncode == 0, verified.stdout + verified.stderr


def test_release_clears_same_blocked_claim_before_rechecking(tmp_path):
    arms, work, corpus = _arm(tmp_path, budget=9, first_id="build.impl", macro="build")
    d = arms / "tok"
    with (d / "tr.jsonl").open("a") as f:
        f.write(json.dumps({"type": "assistant", "content": "RELAY-BLOCKED: missing credential"}) + "\n")
    _fire(arms, corpus)
    _fire(arms, corpus)
    assert _state(arms) == "awaiting-human", "repeated honored claim parks before budget exhaustion"
    assert (d / "blocked_build.impl").exists()
    (d / "release").write_text("GS investigated credential provisioning\n")
    before = _freeze(arms, "claim-release-before")
    out, err = _fire(arms, corpus)
    after = _freeze(arms, "claim-release-after")
    assert out and out["decision"] == "block", (before, after, err)
    assert _state(arms) == "active", "old honored hash must not immediately re-park a released gate"
    assert (d / "retry_build.impl").read_text().strip() == "1"
    assert _events(arms)[-1]["event"] == "gate-fail"


def test_release_whole_id_wins_over_existing_suffix_id(tmp_path):
    arms, work, corpus = _arm(tmp_path, first_id="build.wp1", macro="build")
    d = arms / "tok"
    sprint = json.loads((d / "sprint.json").read_text())
    sprint["work_packages"][1]["id"] = "wp1"
    (d / "sprint.json").write_text(json.dumps(sprint))
    assert _park(arms, corpus) == "awaiting-human"
    suffix_keys = {f"{prefix}_wp1": f"unrelated-{prefix}" for prefix in ("retry", "round", "repeat", "blocked")}
    for name, value in suffix_keys.items():
        (d / name).write_text(value)
    (d / "release").write_text("GS checked the qualified gate\n")
    before = _freeze(arms, "whole-id-release-before")
    out, err = _fire(arms, corpus)
    after = _freeze(arms, "whole-id-release-after")
    assert out and out["decision"] == "block" and _state(arms) == "active", (before, after, err)
    assert (d / "retry_build.wp1").read_text().strip() == "1"
    assert (d / "position").read_text() == "build.wp1"
    assert {p: after[p] for p in suffix_keys} == {p: before[p] for p in suffix_keys}


@pytest.mark.parametrize("ledger_key", ["", "release-identity-test-key"], ids=["plain", "keyed"])
@pytest.mark.parametrize("wid,macro,position", [
    ("target\n", None, "target\n"),
    ("scope\n.target\r\n", "scope\n", "scope\n.target\r\n"),
], ids=["bare-lf", "qualified-crlf"])
def test_release_identity_uses_exact_budget_and_base_keys(tmp_path, ledger_key, wid, macro, position):
    from test_arm_runtime import Runtime, _block, _identity_key, _wp

    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()
    current = _wp(wid, "base-exact", f'test "$BASE_REF" = {head}')
    current["checklist"].append({"id": "still-failing", "cmd": "false"})
    if macro is not None:
        current["macro"] = macro
    sibling = wid.rstrip("\n")
    run = Runtime(tmp_path, [current, _wp(sibling, "wrong", "true")], ledger_key, budget=1)
    (run.arm / "position").write_bytes(position.encode())
    (run.arm / "counter").write_text("0\n")
    safe, sibling_safe = _identity_key(wid), _identity_key(sibling)
    (run.arm / f"base_{safe}").write_text(head)
    (run.arm / f"base_{sibling_safe}").write_text("wrong-base")
    _block(run.fire())
    parked = run.fire()
    assert parked.returncode == 0 and parked.stdout == "" and (run.arm / "state").read_text() == "awaiting-human"
    (run.arm / f"retry_{sibling_safe}").write_text("9")
    (run.arm / "release").write_bytes(b"GS investigated\r\nresume SAME gate\n")
    before = run.freeze("exact-release-before")
    released = run.fire()
    after = run.freeze("exact-release-after")
    _block(released)
    assert (run.arm / "state").read_text() == "active"
    assert (run.arm / "position").read_bytes() == position.encode()
    assert (run.arm / "counter").read_text().strip() == "0"
    assert (run.arm / f"retry_{safe}").read_text().strip() == "1"
    assert after[f"retry_{sibling_safe}"] == before[f"retry_{sibling_safe}"]
    assert after[f"base_{safe}"] == before[f"base_{safe}"]
    assert after[f"base_{sibling_safe}"] == before[f"base_{sibling_safe}"]
    assert not (run.arm / "release").exists()
    releases = [entry for entry in run.events() if entry["event"] == "human-release"]
    assert len(releases) == 1 and releases[0]["wp"] == wid
    assert releases[0]["reason"] == "GS investigated resume SAME gate"
    base_checks = [entry for entry in run.events() if entry["event"] == "checklist-item" and entry["item"] == "base-exact"]
    assert base_checks and all(entry["wp"] == wid and entry["verdict"] == "pass" for entry in base_checks)
    verified = run.verify()
    assert verified.returncode == 0, verified.stdout + verified.stderr


def test_the_release_is_consumed_not_standing(tmp_path):
    """A release file left on disk would silently un-park every future escalation of that arm."""
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    (arms / "tok" / "release").write_text("once — GS\n")
    _fire(arms, corpus)
    assert not (arms / "tok" / "release").exists()


@pytest.mark.parametrize("ledger_key", ["", "release-record-test-key"], ids=["plain", "keyed"])
def test_release_record_failure_keeps_reason_and_parked_budgets(tmp_path, ledger_key):
    from test_arm_runtime import Runtime, _block, _fault_on_record, _published, _record_result, _restore_recording, _wp

    run = Runtime(tmp_path, [_wp("A", "real", "test -f ready")], ledger_key, budget=1)
    _block(run.fire())
    parked = run.fire()
    assert parked.returncode == 0 and parked.stdout == "" and (run.arm / "state").read_text() == "awaiting-human"
    (run.work / "ready").write_text("fixed")
    (run.arm / "blocked_A").write_text("old-blocked-claim")
    (run.arm / "release").write_text("GS investigated and fixed the artifact\n")
    before = run.freeze("release-record-before")
    _fault_on_record(run, "human-release")
    failed = run.fire()
    after = run.freeze("release-record-after")
    _record_result(run, "release-record-result", failed)
    later = run.fire()
    after_later = run.freeze("release-record-later-fire")
    _record_result(run, "release-record-later-result", later)
    assert (run.evidence / "fault-fired.json").exists()
    assert failed.returncode != 0 and failed.stdout == "", (failed.returncode, failed.stdout, failed.stderr)
    assert later.returncode != 0 and later.stdout == "", (later.returncode, later.stdout, later.stderr)
    assert "ledger append failed" in failed.stderr.lower(), failed.stderr
    assert _published(before) == _published(after) == _published(after_later)
    assert (run.arm / "state").read_text() == "awaiting-human" and (run.arm / "release").is_file()
    assert not (run.arm / ".run.lock").exists() and not (run.arm / ".chain.lock").exists()
    assert not list(run.temp.iterdir())
    _restore_recording(run)
    resumed = run.fire()
    run.freeze("release-record-recovered")
    assert resumed.returncode == 0 and resumed.stdout == "" and (run.arm / "state").read_text() == "complete"
    assert not (run.arm / "release").exists()
    released = [entry for entry in run.events() if entry["event"] == "human-release"]
    assert len(released) == 1 and released[0]["reason"] == "GS investigated and fixed the artifact"
    assert run.events()[-1]["event"] == "sprint-complete"
    verified = run.verify()
    assert verified.returncode == 0, verified.stdout + verified.stderr


# ----------------------------------------------------------------------- problems, derived and live

def test_a_parked_arm_reports_a_problem(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    _park(arms, corpus)
    probs, code = _problems(arms)
    cats = {p["category"] for p in probs["problems"]}
    assert "awaiting-human" in cats, probs
    assert code == 1, "a fleet console filters on the exit code as much as the payload"
    assert probs["problems"][0]["cause"], "a category with no cause is a bell with no label"


def test_a_healthy_arm_reports_nothing(tmp_path):
    arms, work, corpus = _arm(tmp_path)
    (work / "f1").write_text("x"); (work / "f2").write_text("x")
    _fire(arms, corpus); _fire(arms, corpus)
    probs, code = _problems(arms)
    assert probs["problems"] == [], probs
    assert code == 0


def test_problems_clear_themselves(tmp_path):
    """Temporal clears its problems attribute on the next success. Derived from the chain each time,
    so nothing has to remember to retract anything."""
    arms, work, corpus = _arm(tmp_path, budget=3)
    _fire(arms, corpus)                      # c1 fails
    assert {p["category"] for p in _problems(arms)[0]["problems"]} == {"gate-failing"}
    (work / "f1").write_text("x")
    _fire(arms, corpus)                      # advances
    assert _problems(arms)[0]["problems"] == [], _problems(arms)[0]


def test_a_plan_defect_is_a_problem_too(tmp_path):
    """cap-risk, inject-missing, position-lost and unknown-kind are all things a person must fix;
    none of them is something the agent can retry its way out of."""
    arms, work, corpus = _arm(tmp_path, n=12)
    _fire(arms, corpus)                      # unset cap -> cap-risk on the chain
    cats = {p["category"] for p in _problems(arms)[0]["problems"]}
    assert "cap-risk" in cats, _problems(arms)[0]


def test_verify_does_not_certify_an_escalated_chain(tmp_path):
    """Found on a real chain that escalated on a blocking JUDGE control. Judges are advisory by
    construction, so `det_fail` was empty; nothing else looked at how the chain ENDED; and
    `relay verify` printed "PASS — deterministic controls verified, auditable" over a run that had
    been handed to a human. True of the controls, false of the run — and a reader takes the banner.

    When a deterministic control IS the cause, CONTROL-FAIL still wins: naming the control that
    failed is more useful than naming the disposition. This is the case where nothing else speaks.
    """
    arms, work, corpus = tmp_path / "arms", tmp_path / "work", tmp_path / "corpus"
    work.mkdir(parents=True)
    (work / "artifact.md").write_text("nothing the stub judge accepts\n")
    d = arms / "tok"
    d.mkdir(parents=True)
    (d / "sprint.json").write_text(json.dumps({"brief": "x", "retry_budget": 1, "work_packages": [
        {"id": "wp1", "instructions": "review it",
         "checklist": [{"id": "real", "assert": "the artifact exists", "cmd": "test -s artifact.md"},
                       {"id": "judged", "assert": "the review engages",
                        "judge": "is it good?", "context": ["artifact.md"], "blocking": True}]}]}))
    (d / "meta.json").write_text(json.dumps({"workdir": str(work), "token": "tok"}))
    (d / "tr.jsonl").write_text(json.dumps({"type": "user", "content": "RELAY-ARM:tok"}) + "\n")

    env = {"RELAY_ARMS_DIR": str(arms), "RELAY_CORPUS_DIR": str(corpus),
           "PATH": os.environ["PATH"], "RELAY_JUDGE_BACKEND": "stub"}
    for _ in range(2):
        subprocess.run(["bash", str(HOOK)],
                       input=json.dumps({"transcript_path": str(d / "tr.jsonl")}),
                       capture_output=True, text=True, env=env)
    assert _state(arms) == "awaiting-human", _state(arms)

    r = subprocess.run(["python3", str(RELAY), "verify", str(d / "ledger.jsonl"), "--json"],
                       capture_output=True, text=True)
    out = json.loads(r.stdout)
    assert out["escalated"] is True, out
    assert out["deterministic_passed"] == out["deterministic_total"], \
        "the setup is only interesting while every DETERMINISTIC control passed"
    assert out["result"] == "ESCALATED" and r.returncode == 2, out
    assert out["chain_intact"] is True, "the record is fine; the run is not"

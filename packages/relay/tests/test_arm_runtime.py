"""ARM evaluation exclusion and lossless accepted-control regressions through real runtimes."""
import hashlib
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "bin" / "relay-arm-hook.sh"
GATE = ROOT / "bin" / "relay-gate"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"
RELAY = ROOT / "bin" / "relay"


@pytest.fixture(params=["", "arm-runtime-test-key"], ids=["plain", "keyed"])
def ledger_key(request):
    return request.param


def _wp(wid, cid, cmd, **fields):
    return {"id": wid, "instructions": f"do {wid}", "checklist": [{"id": cid, "cmd": cmd}], **fields}


def _identity_key(text):
    allowed = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._-"
    return "".join(chr(byte) if byte in allowed else "_" for byte in text.encode())


class Runtime:
    def __init__(self, root, wps, key="", budget=3):
        self.root = root
        self.arm = root / "arms" / "tok"
        self.work = root / "work"
        self.temp = root / "temp"
        self.evidence = root / "evidence"
        for p in (self.arm, self.work, self.temp, self.evidence, root / "home"):
            p.mkdir(parents=True, exist_ok=True)
        self.sprint = {"gen": 7, "retry_budget": budget, "work_packages": wps}
        self.save_sprint()
        (self.arm / "meta.json").write_text(json.dumps({"workdir": str(self.work)}))
        self.transcript = self.arm / "transcript.jsonl"
        self.transcript.write_text(json.dumps({"content": "RELAY-ARM:tok"}) + "\n" + json.dumps({
            "type": "assistant", "message": {"usage": {"input_tokens": 11, "output_tokens": 3}}}) + "\n")
        self.env = {"PATH": os.environ["PATH"], "LC_ALL": "C", "HOME": str(root / "home"), "TMPDIR": str(self.temp),
                    "RELAY_ARMS_DIR": str(self.arm.parent), "RELAY_CORPUS_DIR": str(root / "corpus"),
                    "RELAY_JUDGE_BACKEND": "stub", "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "0"}
        if key:
            self.env["RELAY_LEDGER_KEY"] = key

    def save_sprint(self):
        (self.arm / "sprint.json").write_text(json.dumps(self.sprint))

    def payload(self, agent="worker-1"):
        return json.dumps({"agent_transcript_path": str(self.transcript), "agent_id": agent})

    def fire(self, agent="worker-1"):
        return subprocess.run(["bash", str(HOOK)], input=self.payload(agent), capture_output=True,
                              text=True, env=self.env, cwd=self.work, timeout=15)

    def events(self):
        return [json.loads(line) for line in (self.arm / "ledger.jsonl").read_text().splitlines()]

    def freeze(self, label):
        snapshot = {str(p.relative_to(self.arm)): p.read_bytes().hex() if p.is_file() else None
                    for p in sorted(self.arm.rglob("*"))}
        (self.evidence / f"{label}.json").write_text(json.dumps(snapshot, sort_keys=True, indent=2))
        return snapshot

    def verify(self, path=None):
        return subprocess.run(["python3", str(VERIFY), str(path or self.arm / "ledger.jsonl")],
                              capture_output=True, text=True, env=self.env)

    def cli(self, mode):
        return subprocess.run(["bash", str(GATE), mode, "--sprint", str(self.arm / "sprint.json"),
                               "--workdir", str(self.work), "--state", str(self.arm)],
                              capture_output=True, text=True, env=self.env, timeout=15)


@pytest.mark.parametrize("wid,macro,position,sibling", [
    ("target\n", None, "target\n", "target"),
    ("target\n", "scope", "scope.target\n", "scope.target"),
    ("scope.target\n", "scope", "scope.target\n", "scope.target"),
], ids=["bare", "raw-suffix", "qualified-whole"])
def test_identity_raw_position_wins_before_legacy_lf_normalization(tmp_path, ledger_key, wid, macro, position, sibling):
    current = _wp(wid, "actual", "printf actual >> selected; false")
    if macro is not None:
        current["macro"] = macro
    wps = [current]
    if wid == "scope.target\n":
        wps.append(_wp("target\n", "suffix", "printf suffix >> wrong; true"))
    wps.append(_wp(sibling, "sibling", "printf sibling >> wrong; true"))
    run = Runtime(tmp_path, wps, ledger_key, budget=1)
    (run.arm / "position").write_bytes(position.encode())
    (run.arm / "counter").write_text("0\n")
    before = run.freeze("raw-identity-before")
    result = run.fire()
    after = run.freeze("raw-identity-after")
    _record_result(run, "raw-identity-result", result)
    _block(result)
    assert (run.arm / "position").read_bytes() == position.encode(), (before, after)
    assert after["counter"] == before["counter"]
    assert not (run.arm / "state").exists(), "a passing normalized sibling cannot complete the arm"
    assert (run.work / "selected").read_text() == "actual" and not (run.work / "wrong").exists()
    assert (run.arm / f"retry_{_identity_key(wid)}").read_text().strip() == "1"
    assert [(entry["wp"], entry["item"], entry["verdict"]) for entry in run.events()
            if entry["event"] == "checklist-item"] == [(wid, "actual", "fail")]
    if macro is not None:
        assert run.events()[-1]["macro"] == macro
    assert run.verify().returncode == 0


@pytest.mark.parametrize("position,wid", [
    ("target\n\n", "target"), ("target\r\n", "target\r"),
], ids=["legacy-lf", "literal-cr"])
def test_identity_legacy_lf_fallback_preserves_literal_cr(tmp_path, ledger_key, position, wid):
    wps = [_wp(wid, "actual", "false")]
    if wid != "target":
        wps.append(_wp("target", "wrong", "true"))
    run = Runtime(tmp_path, wps, ledger_key, budget=1)
    (run.arm / "position").write_bytes(position.encode())
    run.freeze("legacy-identity-before")
    result = run.fire()
    run.freeze("legacy-identity-after")
    _block(result)
    assert (run.arm / "position").read_bytes() == wid.encode()
    assert run.events()[-1]["wp"] == wid and run.events()[-1]["event"] == "gate-fail"
    assert run.verify().returncode == 0


@pytest.mark.parametrize("first,first_macro,next_id,next_macro,next_position", [
    ("first\n", None, "target\n", None, "target\n"),
    ("first\n", "scope\n", "target\r\n", "next\n", "next\n.target\r\n"),
    ("scope\n.first\n", "scope\n", "next\n.target\n", "next\n", "next\n.target\n"),
], ids=["bare", "macro", "already-qualified"])
def test_identity_migration_and_next_position_are_lossless(tmp_path, ledger_key, first, first_macro, next_id, next_macro, next_position):
    wps = [_wp(first, "first-control", "true"), _wp(next_id, "next-control", "false"),
           _wp(next_id.rstrip("\n"), "wrong", "true")]
    if first_macro is not None:
        wps[0]["macro"] = first_macro
    if next_macro is not None:
        wps[1]["macro"] = next_macro
    run = Runtime(tmp_path, wps, ledger_key, budget=1)
    (run.arm / "counter").write_text("0\n")
    # Pure true/false controls allow a read-only HEAD lookup for the next base key.
    (run.arm / "meta.json").write_text(json.dumps({"workdir": str(ROOT)}))
    run.freeze("identity-migration-before")
    _block(run.fire())
    run.freeze("identity-next-published")
    assert (run.arm / "position").read_bytes() == next_position.encode()
    assert (run.arm / "counter").read_text().strip() == "1"
    assert (run.arm / f"base_{_identity_key(next_id)}").read_text()
    assert run.events()[0]["wp"] == first and run.events()[-1]["wp"] == first
    if first_macro is not None:
        assert run.events()[0]["macro"] == first_macro
    if next_macro is not None:
        assert (run.arm / f"macro_{_identity_key(next_macro)}").is_file()
    second = run.fire()
    run.freeze("identity-next-evaluated")
    _record_result(run, "identity-second-result", second)
    _block(second)
    assert (run.arm / "position").read_bytes() == next_position.encode()
    assert (run.arm / "counter").read_text().strip() == "1"
    assert (run.arm / f"retry_{_identity_key(next_id)}").read_text().strip() == "1"
    assert run.events()[-1]["wp"] == next_id and run.events()[-1]["event"] == "gate-fail"
    if next_macro is not None:
        assert run.events()[-1]["macro"] == next_macro
    assert run.verify().returncode == 0


@pytest.mark.parametrize("state", ["active", "complete", "awaiting-human"])
def test_identity_missing_position_migration_keeps_disposition(tmp_path, state):
    run = Runtime(tmp_path, [_wp("literal\n", "actual", "printf actual >> executed; false", macro="macro\n")])
    (run.arm / "counter").write_text("0\n")
    (run.arm / "state").write_text(state)
    result = run.fire()
    run.freeze("identity-disposition-after")
    assert (run.arm / "position").read_bytes() == b"macro\n.literal\n"
    assert (run.arm / "state").read_text() == state
    if state == "active":
        _block(result)
        assert (run.work / "executed").read_text() == "actual"
    else:
        assert result.returncode == 0 and result.stdout == "" and not (run.work / "executed").exists()


@pytest.mark.parametrize("phase", ["migration", "next"])
@pytest.mark.parametrize("field,value", [
    ("id", None), ("id", 17), ("id", "A\u0000"), ("id", ""),
    ("macro", True), ("macro", "scope\u0000"),
], ids=["null-id", "nonstring-id", "nul-id", "empty-id", "nonstring-macro", "nul-macro"])
def test_identity_invalid_required_values_do_not_execute_or_publish(tmp_path, phase, field, value):
    bad = _wp("A", "bad", "printf bad >> executed; true")
    bad[field] = value
    wps = [bad] if phase == "migration" else [_wp("valid", "current", "true"), bad]
    run = Runtime(tmp_path, wps)
    (run.arm / "counter").write_text("0\n")
    (run.arm / "state").write_text("active")
    if phase == "next":
        (run.arm / "position").write_text("valid")
    before = run.freeze("invalid-identity-before")
    result = run.fire()
    after = run.freeze("invalid-identity-after")
    _record_result(run, "invalid-identity-result", result)
    assert result.returncode != 0 and result.stdout == "", (result.returncode, result.stdout, result.stderr)
    assert not (run.work / "executed").exists()
    assert _published(before) == _published(after)
    assert not (run.arm / "ledger.jsonl").exists(), "invalid identities cannot publish a verdict or transition"
    assert not (run.arm / ".run.lock").exists() and not list(run.temp.iterdir())


def test_identity_nul_in_raw_position_is_rejected_before_resolution(tmp_path):
    run = Runtime(tmp_path, [_wp("target", "wrong", "printf wrong >> executed; true")])
    (run.arm / "position").write_bytes(b"target\x00\n")
    (run.arm / "counter").write_text("0\n")
    before = run.freeze("nul-position-before")
    result = run.fire()
    after = run.freeze("nul-position-after")
    assert result.returncode != 0 and result.stdout == "", (result.returncode, result.stdout, result.stderr)
    assert _published(before) == _published(after) and not (run.work / "executed").exists()


def _fault_on_record(run, event):
    """Forward to real jq, making the real ledger unwritable at one named append boundary."""
    real_jq = shutil.which("jq", path=run.env["PATH"])
    assert real_jq, "real jq is required"
    shim_dir = run.root / "fault-bin"
    shim_dir.mkdir()
    shim = shim_dir / "jq"
    shim.write_text('''#!/bin/bash
set -euo pipefail
args=("$@")
fault() {
  if [ "$1" = "$RELAY_FAULT_EVENT" ] && [ ! -e "$RELAY_FAULT_FIRED" ]; then
    if [ -e "$RELAY_FAULT_LEDGER" ]; then
      mv "$RELAY_FAULT_LEDGER" "$RELAY_FAULT_BACKUP"
    else
      : > "$RELAY_FAULT_BACKUP"
    fi
    mkdir "$RELAY_FAULT_LEDGER"
    printf '%s\\n' "$1" > "$RELAY_FAULT_FIRED"
  fi
}
if [ "$#" -gt 0 ] && [ "${args[$(($# - 1))]}" = '{ts:$ts} + .' ]; then
  data=$(cat)
  event=$(printf '%s' "$data" | "$RELAY_REAL_JQ" -r '.event')
  fault "$event"
  printf '%s' "$data" | "$RELAY_REAL_JQ" "$@"
  exit $?
fi
if [ "$RELAY_FAULT_EVENT" != checklist-item ] && [ "$RELAY_FAULT_EVENT" != regression-item ]; then
  for ((index=0; index+2<$#; index++)); do
    if [ "${args[$index]}" = --arg ] && [ "${args[$((index + 1))]}" = ev ]; then
      fault "${args[$((index + 2))]}"
    fi
  done
fi
exec "$RELAY_REAL_JQ" "$@"
''')
    shim.chmod(0o755)
    run.env.update(RELAY_REAL_JQ=real_jq, RELAY_FAULT_EVENT=event,
                   RELAY_FAULT_LEDGER=str(run.arm / "ledger.jsonl"),
                   RELAY_FAULT_BACKUP=str(run.evidence / "fault-prefix.jsonl"),
                   RELAY_FAULT_FIRED=str(run.evidence / "fault-fired.json"))
    run.env["PATH"] = str(shim_dir) + os.pathsep + run.env["PATH"]


def _restore_recording(run):
    (run.arm / "ledger.jsonl").rmdir()
    (run.arm / "ledger.jsonl").write_bytes((run.evidence / "fault-prefix.jsonl").read_bytes())
    run.env["PATH"] = run.env["PATH"].split(os.pathsep, 1)[1]
    for key in list(run.env):
        if key.startswith("RELAY_FAULT_") or key == "RELAY_REAL_JQ":
            del run.env[key]


def _published(snapshot):
    """Transition and budget files; cost windows and diagnostics are separate observations."""
    return {name: value for name, value in snapshot.items()
            if name in ("position", "counter", "state", "release", "reg_retry")
            or name.startswith(("retry_", "round_", "repeat_", "blocked_", "macro_", "base_"))}


def _record_result(run, label, result):
    (run.evidence / f"{label}.json").write_text(json.dumps({
        "exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr}, indent=2))


@pytest.mark.parametrize("case,event", [
    ("terminal", "sprint-complete"), ("nonterminal", "advance-reveal"),
    ("round", "checklist-item"), ("gate-fail", "gate-fail"),
    ("gate-fail-repeat", "gate-fail-repeat"), ("escalate", "escalate"),
])
def test_required_record_failure_does_not_publish_transition(tmp_path, ledger_key, case, event):
    failing = case in ("gate-fail", "gate-fail-repeat", "escalate")
    run = Runtime(tmp_path, [_wp("A", "real", "test -f ready" if failing else "true")], ledger_key,
                  budget=0 if case == "escalate" else 2 if case == "gate-fail-repeat" else 1)
    for name, value in {"state": "active", "position": "A", "counter": "0\n"}.items():
        (run.arm / name).write_text(value)
    if case == "nonterminal":
        run.sprint["work_packages"].append(_wp("B", "next", "true", macro="next", kind="review",
                                              self_check=["Did you review the frozen artifact?"]))
        run.sprint["macros"] = [{"id": "next", "instructions": "NEXT-PROTOCOL"}]
        run.save_sprint()
        # The commands are pure true/true; read real HEAD without creating a test commit.
        (run.arm / "meta.json").write_text(json.dumps({"workdir": str(ROOT)}))
    if case == "gate-fail-repeat":
        _block(run.fire())
    else:
        (run.arm / "round_A").write_text("old-round")
        (run.arm / "repeat_A").write_text("3")
    before = run.freeze("record-failure-before")
    _fault_on_record(run, event)
    failed = run.fire()
    after = run.freeze("record-failure-after")
    _record_result(run, "record-failure-result", failed)
    later = run.fire()
    after_later = run.freeze("record-failure-later-fire")
    _record_result(run, "record-failure-later-result", later)
    assert (run.evidence / "fault-fired.json").exists(), "the named real append boundary was reached"
    assert failed.returncode != 0 and failed.stdout == "", (failed.returncode, failed.stdout, failed.stderr)
    assert later.returncode != 0 and later.stdout == "", (later.returncode, later.stdout, later.stderr)
    assert "ledger append failed" in failed.stderr.lower(), failed.stderr
    assert _published(before) == _published(after) == _published(after_later)
    assert not (run.arm / ".run.lock").exists() and not (run.arm / ".chain.lock").exists()
    assert not list(run.temp.iterdir())
    prefix = [json.loads(line) for line in (run.evidence / "fault-prefix.jsonl").read_text().splitlines()]
    assert not [entry for entry in prefix if entry["event"] == event], prefix
    _restore_recording(run)
    recovered = run.fire()
    run.freeze("record-failure-recovered")
    _record_result(run, "record-failure-recovery-result", recovered)
    if case == "nonterminal":
        out = _block(recovered)
        assert "NEXT-PROTOCOL" in out["reason"] and "cold read" in out["reason"]
        assert (run.arm / "position").read_text() == "next.B"
        assert (run.arm / "counter").read_text().strip() == "1"
        assert (run.arm / "macro_next").is_file() and (run.arm / "base_B").read_text()
        assert run.events()[-1]["event"] == "advance-reveal"
        done = run.fire()
        assert done.returncode == 0 and done.stdout == "" and (run.arm / "state").read_text() == "complete"
    elif case == "escalate":
        assert recovered.returncode == 0 and recovered.stdout == ""
        assert (run.arm / "state").read_text() == "awaiting-human"
        assert run.events()[-1]["event"] == "escalate"
    elif failing:
        _block(recovered)
        assert run.events()[-1]["event"] == event
        (run.work / "ready").write_text("fixed")
        done = run.fire()
        assert done.returncode == 0 and done.stdout == "" and (run.arm / "state").read_text() == "complete"
    else:
        assert recovered.returncode == 0 and recovered.stdout == "" and (run.arm / "state").read_text() == "complete"
        assert run.events()[-1]["event"] == "sprint-complete"
    verified = run.verify()
    assert verified.returncode == 0, verified.stdout + verified.stderr


def _block(result):
    assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
    assert result.stdout, ("gate unexpectedly stopped without a block", result.stderr)
    out = json.loads(result.stdout)
    assert out["decision"] == "block", out
    return out


@pytest.mark.parametrize("cid,cmd", [
    ("kept", "true\n# second line\ntest -f kept"),
    ("\tkept\t", "true\nprintf '\\t' >/dev/null\ntest -f kept"),
    ("kept\nfull-id\n", "\ttrue\n# second line\n\ttest -f kept\n\n"),
], ids=["third-line-failure", "tabs", "trailing-lf-and-id-lf"])
def test_regression_runs_and_hashes_full_accepted_command(tmp_path, ledger_key, cid, cmd):
    run = Runtime(tmp_path, [_wp("A", cid, cmd), _wp("B", "current", "test -f current")], ledger_key)
    (run.work / "kept").write_text("accepted")
    _block(run.fire())
    assert (run.arm / "position").read_text() == "B"
    (run.work / "current").write_text("ready")
    (run.work / "kept").unlink()
    before = run.freeze("regression-before")
    result = run.fire()
    after = run.freeze("regression-after")
    out = _block(result)
    assert "regress" in out["reason"].lower() and cid in out["reason"], (before, after, out)
    assert (run.arm / "position").read_text() == "B" and (run.arm / "counter").read_text().strip() == "1"
    assert not (run.arm / "retry_B").exists(), "prior work uses the separate regression budget"
    assert (run.arm / "reg_retry").read_text().strip() == "1"
    items = [e for e in run.events() if e["event"] == "regression-item"]
    assert len(items) == 1 and items[0]["item"] == cid and items[0]["verdict"] == "fail", items
    digest = hashlib.sha256(cmd.encode()).hexdigest()
    originals = [e for e in run.events() if e["event"] == "checklist-item" and e["item"] == cid]
    assert originals[0]["oracle"] == items[0]["oracle"] == digest
    assert items[0]["gen"] == 7 and items[0]["origin"] == "regression"
    _block(run.fire())
    assert run.events()[-1]["event"] == "gate-fail-repeat", "identical full rounds still collapse"
    assert len([e for e in run.events() if e["event"] == "regression-item"]) == 1
    (run.work / "kept").write_text("restored")
    done = run.fire()
    assert done.returncode == 0 and done.stdout == "", (done.stdout, done.stderr)
    assert (run.arm / "state").read_text() == "complete"
    assert run.verify().returncode == 0
    audit = subprocess.run(["python3", str(RELAY), "verify", str(run.arm), "--json"],
                           capture_output=True, text=True, env=run.env)
    assert audit.returncode == 0, audit.stdout + audit.stderr
    assert json.loads(audit.stdout)["chain_intact"] is True


@pytest.mark.parametrize("stdin_cmd", [
    "cat >/dev/null",
    "printf 'supplied\\n' | grep -qx supplied",
    "grep -qx supplied <<'PAYLOAD'\nsupplied\nPAYLOAD",
], ids=["ambient-read", "pipe", "heredoc"])
@pytest.mark.parametrize("kept_present", [False, True], ids=["backslide", "healthy"])
def test_regression_stdin_cannot_consume_later_controls(tmp_path, ledger_key, stdin_cmd, kept_present):
    prior = _wp("A", "stdin", stdin_cmd)
    prior["checklist"].append({"id": "kept", "cmd": "test -f kept"})
    run = Runtime(tmp_path, [prior, _wp("B", "current", "true")], ledger_key, budget=1)
    kept = run.work / "kept"
    kept.write_text("accepted")
    run.freeze("stdin-before-acceptance")
    _block(run.fire())
    accepted = run.freeze("stdin-after-acceptance")
    assert (run.arm / "position").read_text() == "B"
    assert (run.arm / "counter").read_text().strip() == "1"
    assert [(e["item"], e["verdict"]) for e in run.events() if e["event"] == "checklist-item"] == [
        ("stdin", "pass"), ("kept", "pass")]
    if not kept_present:
        kept.unlink()
    before = run.freeze("stdin-before-regression")
    result = run.fire()
    after = run.freeze("stdin-after-regression")
    (run.evidence / "stdin-result.json").write_text(json.dumps({
        "exit": result.returncode, "stdout": result.stdout, "stderr": result.stderr,
        "kept_present": kept_present}, indent=2))
    assert result.returncode == 0, (result.returncode, result.stdout, result.stderr)
    assert "command not found" not in result.stderr, result.stderr
    assert (run.arm / "ledger.jsonl").read_bytes().startswith(bytes.fromhex(before["ledger.jsonl"]))
    assert before["position"] == accepted["position"] and after["position"] == before["position"]
    if kept_present:
        assert result.stdout == "" and (run.arm / "state").read_text() == "complete"
        assert (run.arm / "counter").read_text().strip() == "2"
        assert run.events()[-1]["event"] == "sprint-complete"
    else:
        out = _block(result)
        assert "regress" in out["reason"].lower() and "kept" in out["reason"], out
        assert after["counter"] == before["counter"], (before, after)
        assert after.get("state") not in (b"complete".hex(), b"awaiting-human".hex())
        assert (run.arm / "reg_retry").read_text().strip() == "1"
        assert not (run.arm / "retry_B").exists(), "the passing current gate is not charged"
        assert run.events()[-1]["event"] == "gate-fail"
    originals = {e["item"]: e for e in run.events() if e["event"] == "checklist-item" and e["wp"] == "A"}
    regressions = [e for e in run.events() if e["event"] == "regression-item"]
    assert [(e["item"], e["verdict"]) for e in regressions] == [
        ("stdin", "pass"), ("kept", "pass" if kept_present else "fail")], regressions
    for entry, cmd in zip(regressions, (stdin_cmd, "test -f kept")):
        assert entry["oracle"] == originals[entry["item"]]["oracle"] == hashlib.sha256(cmd.encode()).hexdigest()
        assert entry["gen"] == 7 and entry["origin"] == "regression"
    verified = run.verify()
    assert verified.returncode == 0, verified.stdout + verified.stderr
    if not kept_present:
        exhausted = run.fire()
        run.freeze("stdin-budget-exhausted")
        assert exhausted.returncode == 0 and exhausted.stdout == "", (exhausted.stdout, exhausted.stderr)
        assert (run.arm / "state").read_text() == "awaiting-human"
        assert (run.arm / "position").read_text() == "B"
        assert (run.arm / "counter").read_text().strip() == "2"
        assert run.events()[-1]["event"] == "escalate", "budget 1 ends the still-failing regression"
        assert [(e["item"], e["verdict"]) for e in run.events() if e["event"] == "regression-item"] == [
            ("stdin", "pass"), ("kept", "fail"), ("stdin", "pass"), ("kept", "fail")]
        verified = run.verify()
        assert verified.returncode == 0, verified.stdout + verified.stderr
    assert not (run.arm / ".run.lock").exists() and not list(run.temp.iterdir())


def test_regression_membership_uses_whole_json_ids(tmp_path, ledger_key):
    cid = "accepted\ncontrol\t"
    run = Runtime(tmp_path, [_wp("A", cid, "test -f kept"), _wp("B", "current", "true"),
                            _wp("FUTURE", "future", "printf future >> unexpected; false")], ledger_key)
    (run.work / "kept").write_text("accepted")
    _block(run.fire())
    run.sprint["work_packages"].insert(0, _wp("INJECTED", "accepted", "printf injected >> unexpected; false"))
    run.sprint["work_packages"].insert(1, _wp("INJECTED2", "control\t", "printf injected2 >> unexpected; false"))
    run.save_sprint()
    (run.work / "kept").unlink()
    run.freeze("membership-before")
    out = _block(run.fire())
    run.freeze("membership-after")
    assert cid in out["reason"]
    assert not (run.work / "unexpected").exists(), "ID fragments and future controls are not accepted earlier work"
    reg = [e for e in run.events() if e["event"] == "regression-item"]
    assert [e["item"] for e in reg] == [cid] and reg[0]["verdict"] == "fail", reg
    assert run.verify().returncode == 0


def test_accepted_control_moved_after_cursor_is_not_rechecked(tmp_path, ledger_key):
    run = Runtime(tmp_path, [_wp("A", "accepted", "true"), _wp("B", "current", "true")], ledger_key)
    _block(run.fire())
    accepted = run.sprint["work_packages"].pop(0)
    accepted["checklist"][0]["cmd"] = "printf future >> unexpected; false"
    run.sprint["work_packages"].append(accepted)
    run.save_sprint()
    run.freeze("moved-control-before")
    _block(run.fire())
    run.freeze("moved-control-after")
    assert (run.arm / "position").read_text() == "A"
    assert not (run.work / "unexpected").exists()
    assert not [e for e in run.events() if e["event"] == "regression-item"]
    assert run.verify().returncode == 0


@pytest.mark.parametrize("cmd", [17, True, {"cmd": "true"}, "true\u0000false"],
                         ids=["number", "boolean", "object", "nul"])
def test_regression_rejects_nonstring_or_nul_command(tmp_path, ledger_key, cmd):
    run = Runtime(tmp_path, [_wp("A", "accepted", "true"), _wp("B", "current", "true")], ledger_key)
    _block(run.fire())
    run.sprint["work_packages"][0]["checklist"][0]["cmd"] = cmd
    run.save_sprint()
    before = run.freeze("invalid-command-before")
    result = run.fire()
    after = run.freeze("invalid-command-after")
    assert result.returncode != 0 and result.stdout == "" and result.stderr, (result.returncode, result.stdout, result.stderr)
    assert after["position"] == before["position"] and after["counter"] == before["counter"]
    assert after["ledger.jsonl"] == before["ledger.jsonl"], "invalid decoding never advances or records a passing round"
    assert not (run.arm / ".run.lock").exists() and not list(run.temp.iterdir())


@pytest.mark.parametrize("cmd", [None, ""], ids=["null", "empty"])
def test_regression_skips_absent_or_empty_command(tmp_path, ledger_key, cmd):
    run = Runtime(tmp_path, [_wp("A", "accepted", "true"), _wp("B", "current", "true")], ledger_key)
    _block(run.fire())
    run.sprint["work_packages"][0]["checklist"][0]["cmd"] = cmd
    run.save_sprint()
    result = run.fire()
    assert result.returncode == 0 and result.stdout == "", (result.returncode, result.stdout, result.stderr)
    assert (run.arm / "state").read_text() == "complete"
    assert not [e for e in run.events() if e["event"] == "regression-item"]
    assert run.verify().returncode == 0


@pytest.mark.parametrize("parked", [False, True], ids=["fresh", "parked-release"])
def test_held_run_lock_refuses_before_any_arm_mutation(tmp_path, ledger_key, parked):
    run = Runtime(tmp_path, [_wp("A", "real", "printf graded >> grades; true")], ledger_key)
    if parked:
        for name, value in {"state": "awaiting-human", "position": "A", "counter": "1",
                            "retry_A": "1", "release": "GS investigated"}.items():
            (run.arm / name).write_text(value)
        (run.arm / "agent_id").write_text("other-worker")
    lock = run.arm / ".run.lock"
    lock.mkdir()
    (lock / "owner").write_text("another evaluator")
    before = run.freeze("held-lock-before")
    result = run.fire()
    after = run.freeze("held-lock-after")
    assert result.returncode == 3 and result.stdout == "", (result.returncode, result.stdout, result.stderr)
    assert str(lock) in result.stderr and "another evaluation" in result.stderr
    assert before == after, "busy fire cannot bind, consume release/cost, grade, or move the cursor"
    assert not (run.work / "grades").exists()
    for mode in ("check", "eval"):
        cli = run.cli(mode)
        assert cli.returncode == 3 and cli.stdout == "" and str(lock) in cli.stderr
        assert run.freeze(f"held-lock-cli-{mode}") == before
    daemon = subprocess.run(["python3", "-c",
                             "import json,runpy,sys; d=runpy.run_path(sys.argv[1]); "
                             "print(json.dumps(d['handle_eval'](json.loads(sys.argv[2]))))",
                             str(ROOT / "bin" / "relay-daemon.py"), json.dumps({
                                 "sprint_path": str(run.arm / "sprint.json"),
                                 "workdir": str(run.work), "state_dir": str(run.arm)})],
                            capture_output=True, text=True, env=run.env, timeout=15)
    assert daemon.returncode == 0, daemon.stderr
    status, body = json.loads(daemon.stdout)
    assert status == 500 and body["exit"] == 3 and str(lock) in body["detail"], body
    assert run.freeze("held-lock-daemon-after") == before
    assert (lock / "owner").read_text() == "another evaluator", "never remove another evaluator's lock"
    assert not list(run.temp.iterdir())


def test_concurrent_stop_cannot_grade_advance_or_charge_twice(tmp_path, ledger_key):
    cmd = ("if mkdir check-owner 2>/dev/null; then : > started; "
           "while [ ! -f continue ]; do sleep 0.02; done; fi; printf graded >> grades; true")
    run = Runtime(tmp_path, [_wp("A", "once", cmd), _wp("B", "next", "true")], ledger_key)
    first = subprocess.Popen(["bash", str(HOOK)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, env=run.env, cwd=run.work)
    first.stdin.write(run.payload())
    first.stdin.close()
    first.stdin = None
    try:
        deadline = time.monotonic() + 10
        while not (run.work / "started").exists():
            assert first.poll() is None, first.communicate()
            assert time.monotonic() < deadline, "first real control did not start"
            time.sleep(0.02)
        assert list(run.temp.glob("relay-round.*")), "round buffer exists during evaluation"
        with run.transcript.open("a") as f:
            f.write(json.dumps({"usage": {"input_tokens": 99, "output_tokens": 99}}) + "\n")
        before = run.freeze("concurrent-before-second")
        second = run.fire()
        after = run.freeze("concurrent-after-second")
        assert second.returncode == 3 and second.stdout == "", (second.returncode, second.stdout, second.stderr)
        assert before == after, "second stop must not charge the new transcript row or write state"
        cli = run.cli("check")
        assert cli.returncode == 3 and cli.stdout == "", (cli.returncode, cli.stdout, cli.stderr)
        assert run.freeze("concurrent-after-cli-check") == before
    finally:
        (run.work / "continue").write_text("finish first evaluator")
        stdout, stderr = first.communicate(timeout=15)
        run.freeze("concurrent-first-finished")
    assert first.returncode == 0, (stdout, stderr)
    assert json.loads(stdout)["decision"] == "block"
    assert (run.arm / "position").read_text() == "B" and (run.arm / "counter").read_text().strip() == "1"
    assert (run.work / "grades").read_text() == "graded"
    assert (run.arm / "agent_id").read_text() == "worker-1"
    assert (run.arm / "tr_cursor").read_text() == "2"
    assert [e["item"] for e in run.events() if e["event"] == "checklist-item"] == ["once"]
    assert [e["event"] for e in run.events()].count("advance-reveal") == 1
    assert run.events()[-1]["cost"]["in"] == 11
    assert not (run.arm / ".run.lock").exists() and not list(run.temp.iterdir())
    good = run.verify()
    assert good.returncode == 0, good.stdout + good.stderr
    damaged = run.evidence / "damaged-ledger.jsonl"
    original = (run.arm / "ledger.jsonl").read_bytes()
    assert b'"verdict":"pass"' in original
    damaged.write_bytes(original.replace(b'"verdict":"pass"', b'"verdict":"fail"', 1))
    rejected = run.verify(damaged)
    assert rejected.returncode == 1 and "MAC mismatch" in rejected.stdout, rejected.stdout + rejected.stderr


@pytest.mark.parametrize("case,exit_code", [
    ("advance", 0), ("complete", 0), ("failure", 0), ("escalate", 0),
    ("already-complete", 0), ("parked", 0), ("blank-release", 0), ("mismatched-agent", 0),
    ("unknown-kind", 0), ("inject-missing", 0), ("position-lost", 0),
    ("bad-meta", None), ("bad-sprint", None),
])
def test_owned_lock_and_round_buffer_cleanup_on_exit(tmp_path, ledger_key, case, exit_code):
    wps = [_wp("A", "real", "false" if case in ("failure", "escalate") else "true")]
    if case == "advance":
        wps.append(_wp("B", "next", "true"))
    if case == "unknown-kind":
        wps[0]["kind"] = "human"
    if case == "inject-missing":
        wps[0].update(kind="inject", file="missing.txt")
    run = Runtime(tmp_path, wps, ledger_key, budget=0 if case == "escalate" else 3)
    if case in ("already-complete", "parked", "blank-release"):
        (run.arm / "position").write_text("A")
        (run.arm / "state").write_text("complete" if case == "already-complete" else "awaiting-human")
    if case == "blank-release":
        (run.arm / "release").write_bytes(b"\t\r\n \t")
    if case == "mismatched-agent":
        (run.arm / "agent_id").write_text("other-worker")
    if case == "position-lost":
        (run.arm / "position").write_text("missing")
    if case == "bad-meta":
        (run.arm / "meta.json").write_text("{broken")
    if case == "bad-sprint":
        (run.arm / "sprint.json").write_text("{broken")
    run.freeze("cleanup-before")
    result = run.fire()
    run.freeze("cleanup-after")
    if exit_code is None:
        assert result.returncode != 0, (case, result.returncode, result.stdout, result.stderr)
    else:
        assert result.returncode == exit_code, (case, result.returncode, result.stdout, result.stderr)
    assert "command not found" not in result.stderr, result.stderr
    assert not (run.arm / ".run.lock").exists(), (case, result.stderr)
    assert not list(run.temp.iterdir()), "the round-buffer trap must not replace run-lock cleanup"
    if case in ("advance", "failure"):
        _block(result)
    else:
        assert result.stdout == "", (case, result.stdout)
    if case in ("advance", "complete", "failure", "escalate", "unknown-kind", "inject-missing", "position-lost"):
        event = {"advance": "advance-reveal", "complete": "sprint-complete", "failure": "gate-fail"}.get(case, case)
        assert run.events()[-1]["event"] == event, run.events()
        verified = run.verify()
        assert verified.returncode == 0, verified.stdout + verified.stderr
    if case == "blank-release":
        assert "reason" in result.stderr and (run.arm / "state").read_text() == "awaiting-human"
        assert (run.arm / "release").read_bytes() == b"\t\r\n \t"

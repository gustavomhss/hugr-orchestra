"""Fleet completion must distinguish a finished arm from a silent parked/error path."""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parent.parent
EXAMPLE = ROOT / "examples" / "fleet-chain" / "run_example.py"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"


@pytest.fixture
def example(monkeypatch):
    for key in list(os.environ):
        if key.startswith("RELAY_") or key == "ANTHROPIC_API_KEY":
            monkeypatch.delenv(key)
    monkeypatch.setenv("RELAY_JUDGE_BACKEND", "stub")
    monkeypatch.setenv("CLAUDE_CODE_STOP_HOOK_BLOCK_CAP", "0")
    spec = importlib.util.spec_from_file_location("fleet_example", EXAMPLE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def sandbox(tmp_path, monkeypatch, example):
    root = tmp_path / "sandbox"
    root.mkdir()
    monkeypatch.setattr(example.tempfile, "mkdtemp", lambda **kwargs: str(root))
    return root


def observe_real_stop(example, monkeypatch):
    """Snapshot the real hook's silent stop before main's finally removes its subject."""
    real_fire = example.fire
    observed = {}

    def fire(token, arm, workdir, arms_dir):
        reason = real_fire(token, arm, workdir, arms_dir)
        if reason is None:
            arm, work = Path(arm), Path(workdir)
            ledger = arm / "ledger.jsonl"
            observed.update(
                state=(arm / "state").read_text(),
                counter=int((arm / "counter").read_text()),
                nwp=len(json.loads((arm / "sprint.json").read_text())["work_packages"]),
                flags=[(work / "flags" / f"{fid}.flag").read_text() == content
                       for fid, content in example.FLAGS],
                entries=[json.loads(line) for line in ledger.read_text().splitlines()],
                integrity=subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                                         capture_output=True, text=True),
            )
        return reason

    monkeypatch.setattr(example, "fire", fire)
    return observed


def test_last_gate_escalation_with_all_flags_is_not_complete(example, sandbox, monkeypatch, capsys):
    """Primary regression: real hook parks after all flags and counter look complete."""
    real_build = example.build_arm

    def build_arm(*args):
        token, arm = real_build(*args)
        sprint_path = Path(arm) / "sprint.json"
        sprint = json.loads(sprint_path.read_text())
        # One retry preserves real escalation while bounding repeated keep-best work.
        sprint["retry_budget"] = 1
        sprint["work_packages"][-1]["checklist"].append(
            {"id": "LAST_ALWAYS_FAIL", "assert": "deliberately unsatisfied", "cmd": "false"})
        sprint_path.write_text(json.dumps(sprint))
        return token, arm

    monkeypatch.setattr(example, "build_arm", build_arm)
    observed = observe_real_stop(example, monkeypatch)
    code = example.main()
    output = capsys.readouterr()
    assert observed["state"] == "awaiting-human"
    assert observed["counter"] >= observed["nwp"] == 4
    assert all(observed["flags"])
    assert observed["integrity"].returncode == 0, observed["integrity"].stdout
    assert observed["entries"][-1]["event"] == "escalate"
    assert observed["entries"][-1]["wp"] == "g4-seal"
    final_controls = {entry["item"]: entry["verdict"] for entry in observed["entries"]
                      if entry["event"] == "checklist-item"}
    assert all(final_controls[f"FLAG_{fid}"] == "pass" for fid, _ in example.FLAGS)
    assert final_controls["LAST_ALWAYS_FAIL"] == "fail"
    assert not sandbox.exists(), "temporary state must still be cleaned"
    assert code == 1, output.out + output.err
    assert "RESULT: FAIL" in output.out and "PASS" not in output.out
    assert "awaiting-human" in output.out
    assert "CONTROL-FAIL" in output.out + output.err


def test_clean_real_example_completes_and_cleans_up(example, sandbox, monkeypatch, capsys):
    observed = observe_real_stop(example, monkeypatch)
    code = example.main()
    output = capsys.readouterr()
    assert observed["state"] == "complete"
    assert observed["entries"][-1]["event"] == "sprint-complete"
    assert observed["integrity"].returncode == 0
    assert all(observed["flags"])
    assert code == 0, output.out + output.err
    assert "RESULT: PASS" in output.out and "4/4" in output.out
    assert "sprint-complete" in output.out and "sprint recheck: ok" in output.out
    assert not sandbox.exists()


def controlled_complete(example, token, arm, workdir, arms_dir, audit_run=None):
    """Fake transport fixture: fabricate declared deterministic passes; no controls execute."""
    arm, work = Path(arm), Path(workdir)
    (arm / "state").write_text("complete")
    sprint = json.loads((arm / "sprint.json").read_text())
    (arm / "counter").write_text(str(len(sprint["work_packages"])))
    (work / "flags").mkdir(exist_ok=True)
    for fid, content in example.FLAGS:
        (work / "flags" / f"{fid}.flag").write_text(content)
    entries = []
    for wp in sprint["work_packages"]:
        for control in wp.get("checklist", []):
            if control.get("cmd"):
                entries.append({"event": "checklist-item", "wp": wp["id"], "item": control["id"],
                                "verdict": "pass", "graded_by": "deterministic",
                                "oracle": hashlib.sha256(control["cmd"].encode()).hexdigest()})
    entries.append({"event": "sprint-complete", "wp": sprint["work_packages"][-1]["id"]})
    write_chain(arm / "ledger.jsonl", entries)
    # Prove this synthetic record passes the real audit before introducing the intended defect.
    # Transport-failure cases pass the saved real runner to bypass their subprocess fake.
    checked = (audit_run or subprocess.run)(
        [sys.executable, str(ROOT / "bin" / "relay"), "verify", str(arm / "ledger.jsonl"),
         "--sprint", str(arm / "sprint.json"), "--json"], capture_output=True, text=True)
    assert checked.returncode == 0, checked.stdout + checked.stderr
    report = json.loads(checked.stdout)
    assert report["result"] == "PASS" and report["chain_intact"] is True
    assert report["last_event"] == "sprint-complete"
    assert report["oracle_recheck"]["status"] == "ok"
    assert report["deterministic_passed"] == report["deterministic_total"] == len(entries) - 1 > 0
    return None


def write_chain(path, entries):
    lines, prev = [], "GENESIS"
    for seq, entry in enumerate(entries):
        entry = {key: value for key, value in entry.items() if key != "h"}
        body = json.dumps({**entry, "gen": 0, "prev": prev, "seq": seq, "mac": "sha256"},
                          separators=(",", ":"))
        prev = hashlib.sha256(body.encode()).hexdigest()
        lines.append(body[:-1] + f',"h":"{prev}"}}')
    path.write_text("\n".join(lines) + "\n")


@pytest.mark.parametrize("defect, diagnostic", [
    ("corrupt-tail", "TAMPERED"),
    ("malformed-tail", "TAMPERED"),
    ("nonterminal", "TRUNCATED"),
    ("failed-control", "CONTROL-FAIL"),
    ("active-state", "state: active"),
    ("missing-sprint", "SPRINT-INVALID"),
    ("missing-flag", "3/4"),
])
def test_controlled_incomplete_evidence_fails(example, sandbox, monkeypatch, capsys, defect, diagnostic):
    def fire(*args):
        controlled_complete(example, *args)
        arm, work = Path(args[1]), Path(args[2])
        ledger = arm / "ledger.jsonl"
        lines = ledger.read_text().splitlines()
        entries = [json.loads(line) for line in lines]
        if defect == "corrupt-tail":
            lines[-1] = lines[-1].replace('"wp":"g4-seal"', '"wp":"corrupted"')
            ledger.write_text("\n".join(lines) + "\n")
        elif defect == "malformed-tail":
            lines[-1] = "not JSON"
            ledger.write_text("\n".join(lines) + "\n")
        elif defect == "nonterminal":
            write_chain(ledger, entries[:-1])
        elif defect == "failed-control":
            entries[0]["verdict"] = "fail"
            write_chain(ledger, entries)
        elif defect == "active-state":
            (arm / "state").write_text("active")
        elif defect == "missing-sprint":
            (arm / "sprint.json").unlink()
        elif defect == "missing-flag":
            (work / "flags" / "f4.flag").unlink()
        return None

    monkeypatch.setattr(example, "fire", fire)
    assert example.main() == 1
    output = capsys.readouterr()
    assert "RESULT: FAIL" in output.out
    assert diagnostic in output.out + output.err
    if defect == "malformed-tail":
        assert "audit: TAMPERED (exit 1" in output.out
        assert "relay verify returned no valid JSON" not in output.out + output.err
    if defect == "missing-sprint":
        assert "sprint recheck: invalid" in output.out
    assert not sandbox.exists()


@pytest.mark.parametrize("returncode, stdout, diagnostic", [
    (7, "", "hook failed (exit 7)"),
    (7, '{"decision":"block","reason":"keep going"}', "hook failed (exit 7)"),
    (0, "", "state: active"),
    (0, "not JSON", "hook returned invalid JSON"),
    (0, "{}", "hook returned invalid block response"),
])
def test_hook_transport_failure_never_certifies_complete(
        example, sandbox, monkeypatch, capsys, returncode, stdout, diagnostic):
    real_run = subprocess.run

    def run(command, **kwargs):
        if command == ["bash", example.HOOK]:
            controlled_complete(example, "fleet-example", sandbox / "arms" / "fleet-example",
                                sandbox / "work", sandbox / "arms", audit_run=real_run)
            if returncode == 0 and not stdout:
                (sandbox / "arms" / "fleet-example" / "state").write_text("active")
            return subprocess.CompletedProcess(command, returncode, stdout, "transport defect")
        return real_run(command, **kwargs)

    monkeypatch.setattr(example.subprocess, "run", run)
    assert example.main() == 1
    output = capsys.readouterr()
    assert "RESULT: FAIL" in output.out
    assert diagnostic in output.out + output.err and "transport defect" in output.err
    assert not sandbox.exists()


@pytest.mark.parametrize("returncode, stdout", [(3, ""), (0, "not JSON")])
def test_audit_without_json_fails_with_diagnostics(example, sandbox, monkeypatch, capsys, returncode, stdout):
    real_run = subprocess.run
    monkeypatch.setattr(example, "fire", lambda *args: controlled_complete(example, *args, audit_run=real_run))

    def run(command, **kwargs):
        if command[1:3] == [str(ROOT / "bin" / "relay"), "verify"]:
            assert "--sprint" in command
            sprint = Path(command[command.index("--sprint") + 1])
            assert sprint.exists() and sprint.parent == sandbox / "arms" / "fleet-example"
            return subprocess.CompletedProcess(command, returncode, stdout, "audit transport defect")
        return real_run(command, **kwargs)

    monkeypatch.setattr(example.subprocess, "run", run)
    assert example.main() == 1
    output = capsys.readouterr()
    assert "RESULT: FAIL" in output.out
    assert "relay verify returned no valid JSON" in output.err
    assert f"exit {returncode}" in output.err and "audit transport defect" in output.err
    assert not sandbox.exists()

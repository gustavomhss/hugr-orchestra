"""Regression suite for the Relay control-plane: hash-chain ledger, verifier, judge, gate, CLI.

Drives the REAL artifacts (benchmark/relay_hook.sh, verify_ledger.py, judge.py, bin/relay) end to
end via subprocess with explicit, isolated environments — so what passes here is what ships.

Run:  python3 -m pytest tests/ -q     (no API key needed; the judge uses its deterministic stub)
"""
import os
import json
import hashlib
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
HOOK = ROOT / "benchmark" / "relay_hook.sh"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"
JUDGE = ROOT / "benchmark" / "judge.py"
RELAY = ROOT / "bin" / "relay"


# ---------- helpers ----------------------------------------------------------------

def _base_env(extra=None):
    """A clean env with all ambient RELAY_* stripped (determinism), plus explicit overrides."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)  # tests must never make a real API call implicitly
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def write_sprint(d: Path, sprint: dict) -> Path:
    p = d / "sprint.json"
    p.write_text(json.dumps(sprint))
    return p


def fire(run_dir: Path, sprint: Path, **env) -> str:
    """One Stop event. Returns injected reason text ('' means SPRINT COMPLETE / no block)."""
    e = _base_env({"RELAY_RUN_DIR": run_dir, "RELAY_SPRINT": sprint,
                   "RELAY_GATE": "on", "RELAY_JUDGE_BACKEND": "stub", **env})
    p = subprocess.run(["bash", str(HOOK)], input="{}", capture_output=True, text=True, env=e)
    out = p.stdout.strip()
    if not out:
        return ""
    return json.loads(out).get("reason", "")


def ledger_path(run_dir: Path) -> Path:
    return run_dir / ".relay-state" / "ledger.jsonl"


def verify(run_dir: Path, key=None):
    e = _base_env({"RELAY_LEDGER_KEY": key} if key is not None else None)
    p = subprocess.run(["python3", str(VERIFY), str(ledger_path(run_dir))],
                       capture_output=True, text=True, env=e)
    return p.returncode, p.stdout + p.stderr


def read_lines(run_dir: Path):
    return ledger_path(run_dir).read_text().splitlines()


def write_lines(run_dir: Path, lines):
    ledger_path(run_dir).write_text("\n".join(lines) + "\n")


def dod_sprint(n: int) -> dict:
    """n all-passing WPs (each gated on a touched file) -> a chain of n entries."""
    wps = [{"id": f"wp{k}", "title": f"t{k}", "instructions": "i",
            "dod": [{"type": "test", "cmd": f"test -f f{k}.txt"}]} for k in range(1, n + 1)]
    return {"brief": "x", "retry_budget": 5, "work_packages": wps}


def make_run(tmp_path: Path, n: int, key=None) -> Path:
    d = tmp_path / "run"
    d.mkdir()
    sprint = write_sprint(d, dod_sprint(n))
    for k in range(1, n + 1):
        (d / f"f{k}.txt").touch()
    for _ in range(n):  # fire n times -> n-1 advances + 1 complete
        fire(d, sprint, **({"RELAY_LEDGER_KEY": key} if key else {}))
    return d


# ---------- chain integrity --------------------------------------------------------

def test_plain_intact(tmp_path):
    d = make_run(tmp_path, 2)
    rc, out = verify(d)
    assert rc == 0 and "INTACT" in out and "PLAIN" in out


def test_seq_is_contiguous(tmp_path):
    d = make_run(tmp_path, 3)
    seqs = [json.loads(l)["seq"] for l in read_lines(d)]
    assert seqs == [0, 1, 2]


def test_inplace_edit_detected(tmp_path):
    d = make_run(tmp_path, 2)
    lines = read_lines(d)
    lines[0] = lines[0].replace('"wp":"wp1"', '"wp":"wpZ"', 1)
    assert '"wp":"wpZ"' in lines[0]  # the edit actually landed
    write_lines(d, lines)
    rc, out = verify(d)
    assert rc == 1 and "TAMPERED" in out


def test_delete_middle_detected(tmp_path):
    d = make_run(tmp_path, 3)
    lines = read_lines(d)
    del lines[1]
    write_lines(d, lines)
    rc, out = verify(d)
    assert rc == 1 and ("broken link" in out or "seq" in out)


def test_reorder_detected(tmp_path):
    d = make_run(tmp_path, 3)
    lines = read_lines(d)
    lines[0], lines[1] = lines[1], lines[0]
    write_lines(d, lines)
    rc, _ = verify(d)
    assert rc == 1


def test_tail_truncation_is_flagged(tmp_path):
    # dropping the terminal line leaves a valid prefix (known limit) -> still exit 0, but flagged.
    d = make_run(tmp_path, 3)
    lines = read_lines(d)
    write_lines(d, lines[:-1])  # remove sprint-complete; now ends on advance-reveal
    rc, out = verify(d)
    assert rc == 0 and "tail-truncation" in out


# ---------- keyed (HMAC) mode ------------------------------------------------------

def test_keyed_right_key(tmp_path):
    d = make_run(tmp_path, 2, key="s3cr3t")
    rc, out = verify(d, key="s3cr3t")
    assert rc == 0 and "KEYED" in out


def test_keyed_wrong_key_fails(tmp_path):
    d = make_run(tmp_path, 2, key="s3cr3t")
    rc, _ = verify(d, key="nope")
    assert rc == 1


def test_keyed_no_key_fails(tmp_path):
    d = make_run(tmp_path, 2, key="s3cr3t")
    rc, _ = verify(d, key=None)  # verifying an HMAC chain as plain SHA-256 must fail
    assert rc == 1


def test_keyed_forgery_without_key_fails(tmp_path):
    # Attacker without the key edits a line and reseals with a PLAIN sha256 — keyed verify rejects it.
    d = make_run(tmp_path, 2, key="s3cr3t")
    lines = read_lines(d)
    ln = lines[0]
    idx = ln.rfind(',"h":')
    body = ln[:idx] + "}"
    body = body.replace('"event":"advance-reveal"', '"event":"FORGED"')
    h = hashlib.sha256(body.encode()).hexdigest()
    lines[0] = body[:-1] + f',"h":"{h}"}}'
    write_lines(d, lines)
    rc, _ = verify(d, key="s3cr3t")
    assert rc == 1


# ---------- judge ------------------------------------------------------------------

def run_judge(criterion, files, **env):
    args = ["python3", str(JUDGE), "--criterion", criterion]
    for f in files:
        args += ["--file", str(f)]
    p = subprocess.run(args, capture_output=True, text=True, env=_base_env(env))
    return json.loads(p.stdout)


def test_judge_stub_pass_on_marker(tmp_path):
    f = tmp_path / "svc.py"
    f.write_text("x = 1  # RELAY_JUDGE_OK\n")
    r = run_judge("notice present?", [f], RELAY_JUDGE_BACKEND="stub")
    assert r["verdict"] == "pass" and r["backend"] == "stub"


def test_judge_stub_fail_without_marker(tmp_path):
    f = tmp_path / "svc.py"
    f.write_text("x = 1\n")
    r = run_judge("notice present?", [f], RELAY_JUDGE_BACKEND="stub")
    assert r["verdict"] == "fail"


def test_judge_api_fails_safe_without_key(tmp_path):
    # forced api backend with no ANTHROPIC_API_KEY must NOT pass and must NOT hang -> conservative fail
    r = run_judge("anything", [], RELAY_JUDGE_BACKEND="api")
    assert r["verdict"] == "fail" and "error" in r["backend"]


# ---------- checklist gate ---------------------------------------------------------

def checklist_sprint(blocking=False) -> dict:
    return {"brief": "x", "retry_budget": 5, "work_packages": [{
        "id": "wp1", "title": "t", "instructions": "i", "dod": [],
        "checklist": [
            {"id": "DET-1", "assert": "a present", "cmd": "test -f a.txt"},
            {"id": "SEM-1", "assert": "notice", "judge": "present?", "context": "svc.py",
             "blocking": blocking}]}]}


def test_checklist_blocks_until_deterministic_passes(tmp_path):
    d = tmp_path / "run"
    d.mkdir()
    sprint = write_sprint(d, checklist_sprint())
    (d / "svc.py").write_text("# RELAY_JUDGE_OK\n")
    reason = fire(d, sprint)  # a.txt missing -> DET-1 fails
    assert "is NOT done" in reason and "DET-1" in reason
    (d / "a.txt").touch()
    assert fire(d, sprint) == ""  # all green -> complete


def test_judge_advisory_does_not_block(tmp_path):
    d = tmp_path / "run"
    d.mkdir()
    sprint = write_sprint(d, checklist_sprint(blocking=False))
    (d / "a.txt").touch()
    (d / "svc.py").write_text("no marker here\n")  # SEM-1 judge will FAIL
    assert fire(d, sprint) == ""  # advisory judge fail must NOT hold the door
    # ...but the failing judge verdict is still on the chain, honestly graded
    items = [json.loads(l) for l in read_lines(d) if '"checklist-item"' in l]
    sem = [e for e in items if e["item"] == "SEM-1"][-1]
    assert sem["verdict"] == "fail" and sem["graded_by"].startswith("judge:")


def test_judge_blocking_holds_the_door(tmp_path):
    d = tmp_path / "run"
    d.mkdir()
    sprint = write_sprint(d, checklist_sprint(blocking=True))
    (d / "a.txt").touch()
    (d / "svc.py").write_text("no marker\n")  # SEM-1 fails, and it's blocking
    reason = fire(d, sprint)
    assert "is NOT done" in reason and "SEM-1" in reason


# ---------- relay verify CLI -------------------------------------------------------

def cli_verify(run_dir: Path):
    p = subprocess.run(["python3", str(RELAY), "verify", str(run_dir)],
                       capture_output=True, text=True, env=_base_env())
    return p.returncode, p.stdout


def test_cli_pass(tmp_path):
    d = make_run(tmp_path, 2)
    rc, out = cli_verify(d)
    assert rc == 0 and "PASS" in out


def test_cli_tampered_overrides_green(tmp_path):
    d = make_run(tmp_path, 2)
    lines = read_lines(d)
    lines[0] = lines[0].replace('"wp":"wp1"', '"wp":"wpZ"', 1)
    write_lines(d, lines)
    rc, out = cli_verify(d)
    assert rc == 1 and "TAMPERED" in out


def test_cli_control_fail(tmp_path):
    d = tmp_path / "run"
    d.mkdir()
    sprint = write_sprint(d, checklist_sprint())
    (d / "svc.py").write_text("# RELAY_JUDGE_OK\n")
    fire(d, sprint)  # a.txt missing -> DET-1 recorded fail, run not complete
    rc, out = cli_verify(d)
    assert rc == 2 and "CONTROL FAIL" in out


# ---------- per-agent arms: the fleet-chain example as a regression -----------------

def test_fleet_chain_example():
    """The examples/fleet-chain loop must hold end-to-end: an agent held to a checklist it never
    saw, driven to conformance + flag-planting purely by the hook's feedback. Deterministic, no LLM."""
    example = ROOT / "examples" / "fleet-chain" / "run_example.py"
    p = subprocess.run(["python3", str(example)], capture_output=True, text=True)
    assert p.returncode == 0, f"fleet-chain example failed:\n{p.stdout}\n{p.stderr}"
    assert "PASS" in p.stdout
    assert "4/4" in p.stdout  # all tracer flags planted via hook feedback

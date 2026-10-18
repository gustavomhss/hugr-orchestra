"""Shared-core runtime regressions through real Bash, CLI, judge stub and audit.

Fake judge programs exercise transport failures and response parsing, not model quality.
All plans, artifacts and ledgers live in pytest scratch directories.
"""
import hashlib
import hmac
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CORE = ROOT / "lib" / "relay-gate.sh"
GATE = ROOT / "bin" / "relay-gate"
NOTE = ROOT / "bin" / "relay-note"
AUDIT = ROOT / "bin" / "relay"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"
JUDGE = ROOT / "benchmark" / "judge.py"


def _env(**extra):
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    env.update(RELAY_JUDGE_BACKEND="stub")
    env.update({k: str(v) for k, v in extra.items()})
    return env


def _case(tmp_path, controls):
    work, state = tmp_path / "work", tmp_path / "state"
    work.mkdir()
    state.mkdir()
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({
        "retry_budget": 3,
        "work_packages": [{"id": "wp1", "checklist": controls}],
    }), encoding="utf-8")
    return sprint, work, state


def _eval(case, *, ledger=None, **env):
    sprint, work, state = case
    args = ["bash", str(GATE), "eval", "--sprint", str(sprint),
            "--workdir", str(work), "--state", str(state)]
    if ledger is not None:
        args += ["--ledger", str(ledger)]
    return subprocess.run(args, capture_output=True, text=True, env=_env(**env), timeout=20)


def _items(state):
    return [entry for entry in _entries(state / "ledger.jsonl")
            if entry.get("event") == "checklist-item"]


def _entries(ledger):
    return [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines()]


def _counter(state):
    counter = state / "counter"
    return int(counter.read_text()) if counter.exists() else 0


def _audit(case, **env):
    sprint, _, state = case
    proc = subprocess.run(
        [sys.executable, str(AUDIT), "verify", str(state / "ledger.jsonl"),
         "--sprint", str(sprint), "--json"],
        capture_output=True, text=True, env=_env(**env), timeout=20,
    )
    return proc, json.loads(proc.stdout)


def _fake_judge(tmp_path, stdout, exit_code=0):
    judge = tmp_path / "fake_judge.py"
    judge.write_text(
        "import json, os, sys\n"
        "from pathlib import Path\n"
        "if os.environ.get('CAPTURE_CRITERION'):\n"
        "    criterion = sys.argv[sys.argv.index('--criterion') + 1]\n"
        "    Path(os.environ['CAPTURE_CRITERION']).write_text(json.dumps(criterion), encoding='utf-8')\n"
        f"sys.stdout.write({stdout!r})\n"
        f"raise SystemExit({exit_code})\n",
        encoding="utf-8",
    )
    return judge


@pytest.mark.parametrize("cmd", ["true\n", "true\n\n", "\ttrue # café\n\n"])
def test_cli_command_oracle_matches_raw_json_and_audit(tmp_path, cmd):
    case = _case(tmp_path, [{"id": "D", "cmd": cmd}])
    proc = _eval(case)
    assert proc.returncode == 0, proc.stderr
    assert json.loads(proc.stdout)["outcome"] == "complete"
    audit, report = _audit(case)
    assert report["oracle_recheck"]["status"] == "ok", report
    assert audit.returncode == 0 and report["result"] == "PASS", report
    (item,) = _items(case[2])
    assert item["oracle"] == hashlib.sha256(cmd.encode()).hexdigest()


def test_multiline_command_runs_whole_value_and_keeps_array_order(tmp_path):
    value = "café\tfirst\nlast\n\n"
    first = f"printf '%s' '{value}' > current.txt\nfalse\n\n"
    second = "test -s current.txt && printf later > later.txt"
    case = _case(tmp_path, [{"id": "FIRST", "cmd": first}, {"id": "LATER", "cmd": second}])
    proc = _eval(case)
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["failing"] == ["FIRST"]
    assert (case[1] / "current.txt").read_bytes() == value.encode()
    assert (case[1] / "later.txt").read_bytes() == b"later"
    items = _items(case[2])
    assert [(item["item"], item["verdict"]) for item in items] == [
        ("FIRST", "fail"), ("LATER", "pass"),
    ]
    assert items[0]["oracle"] == hashlib.sha256(first.encode()).hexdigest()
    assert _counter(case[2]) == 0


def test_command_uses_final_status_and_takes_precedence_over_judge(tmp_path):
    cmd = "false; true"
    case = _case(tmp_path, [{"id": "D", "cmd": cmd, "judge": {"invalid": "unused"}}])
    proc = _eval(case, RELAY_JUDGE=tmp_path / "missing.py")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    (item,) = _items(case[2])
    assert item["verdict"] == "pass" and item["graded_by"] == "deterministic"


@pytest.mark.parametrize("checklist", [{}, "", False, True, 0, 7, -2, 0.5])
def test_nonarray_checklist_aborts_before_advancement(tmp_path, checklist):
    case = _case(tmp_path, checklist)
    sprint = json.loads(case[0].read_text())
    sprint["work_packages"].append({"id": "later", "checklist": [
        {"id": "LATER", "cmd": "printf executed > must-not-run.txt"},
    ]})
    case[0].write_text(json.dumps(sprint))
    proc = _eval(case)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert "checklist must be an array" in proc.stderr, proc.stderr
    assert proc.stdout == ""
    assert _counter(case[2]) == 0
    assert not (case[1] / "must-not-run.txt").exists()
    ledger = case[2] / "ledger.jsonl"
    assert not ledger.exists() or ledger.read_bytes() == b""
    assert not (case[2] / ".run.lock").exists()


@pytest.mark.parametrize("shape", ["missing", "null", "empty", "array"])
def test_supported_checklist_collections_keep_declared_behavior(tmp_path, shape):
    controls = [
        {"id": "FIRST", "cmd": "printf first > order.txt"},
        {"id": "SECOND", "cmd": "test -s order.txt && printf second >> order.txt"},
    ] if shape == "array" else []
    case = _case(tmp_path, controls)
    sprint = json.loads(case[0].read_text())
    if shape == "missing":
        del sprint["work_packages"][0]["checklist"]
    elif shape == "null":
        sprint["work_packages"][0]["checklist"] = None
    case[0].write_text(json.dumps(sprint))
    proc = _eval(case)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["outcome"] == "complete"
    assert _counter(case[2]) == 1
    items = _items(case[2])
    assert [(item["item"], item["verdict"]) for item in items] == (
        [("FIRST", "pass"), ("SECOND", "pass")] if shape == "array" else []
    )
    if shape == "array":
        assert (case[1] / "order.txt").read_bytes() == b"firstsecond"
        assert [item["oracle"] for item in items] == [
            hashlib.sha256(control["cmd"].encode()).hexdigest() for control in controls
        ]


@pytest.mark.parametrize("key", ["", "identity-test-key"], ids=["plain", "keyed"])
@pytest.mark.parametrize("assertion_mode", ["explicit", "absent", "null"])
def test_current_identity_and_assertion_match_whole_json_strings(tmp_path, key, assertion_mode):
    cid = "\tkept\ncafé-id\t\n\n"
    cmd = "\ttrue\n# exact command\n\n"
    assertion = "Evidence\tcafé\nfull assertion\n\n"
    control = {"id": cid, "cmd": cmd}
    if assertion_mode == "explicit":
        control["assert"] = assertion
    elif assertion_mode == "null":
        control["assert"] = None
    case = _case(tmp_path, [control])
    proc = _eval(case, RELAY_LEDGER_KEY=key)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    entries = _entries(case[2] / "ledger.jsonl")
    first = entries[0]
    assert first["event"] == "checklist-item"
    assert first["item"] == cid, "first accepted ledger entry must retain the entire control ID"
    assert first["assert"] == (assertion if assertion_mode == "explicit" else cid)
    assert [entry for entry in entries if entry.get("item") == cid] == [first]
    assert first["oracle"] == hashlib.sha256(cmd.encode()).hexdigest()
    audit, report = _audit(case, RELAY_LEDGER_KEY=key)
    assert audit.returncode == 0 and report["oracle_recheck"]["status"] == "ok", report


@pytest.mark.parametrize("fields", [
    {}, {"id": None}, {"id": ""}, {"id": True}, {"id": 0},
    {"id": []}, {"id": {}}, {"id": "bad\u0000id"},
], ids=["missing", "null", "empty", "boolean", "number", "array", "object", "nul"])
def test_invalid_current_id_aborts_before_execution_or_pass_record(tmp_path, fields):
    case = _case(tmp_path, [{**fields, "cmd": "printf executed > must-not-run.txt"}])
    proc = _eval(case)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert "checklist[0]" in proc.stderr, proc.stderr
    assert not (case[1] / "must-not-run.txt").exists()
    assert _counter(case[2]) == 0
    ledger = case[2] / "ledger.jsonl"
    assert not ledger.exists() or ledger.read_bytes() == b""
    assert not (case[2] / ".run.lock").exists()


@pytest.mark.parametrize("assertion", [True, 17, [], {}, "report\u0000text"])
def test_invalid_current_assertion_aborts_before_execution_or_pass_record(tmp_path, assertion):
    case = _case(tmp_path, [{"id": "D", "assert": assertion,
                            "cmd": "printf executed > must-not-run.txt"}])
    proc = _eval(case)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert "assertion" in proc.stderr and "D" in proc.stderr, proc.stderr
    assert not (case[1] / "must-not-run.txt").exists()
    assert _counter(case[2]) == 0
    ledger = case[2] / "ledger.jsonl"
    assert not ledger.exists() or ledger.read_bytes() == b""


@pytest.mark.parametrize("paths", [[], ["part\tα\n", "tail\n\n"]])
def test_judge_criterion_scope_exact_bytes_match_audit(tmp_path, paths):
    criterion = "Read café\tcarefully.\nThen check claims.\n\n"
    case = _case(tmp_path, [
        {"id": "D", "cmd": "true"},
        {"id": "J", "judge": criterion, "paths": paths, "blocking": True},
    ])
    capture = tmp_path / "criterion.json"
    judge = _fake_judge(tmp_path, json.dumps({"verdict": "pass", "backend": "cli"}))
    proc = _eval(case, RELAY_JUDGE=judge, CAPTURE_CRITERION=capture)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert json.loads(capture.read_text(encoding="utf-8")) == criterion
    (_, item) = _items(case[2])
    scope = " ".join(paths)
    raw_oracle = criterion + (f" :: {scope}" if scope else "")
    assert item["oracle"] == hashlib.sha256(raw_oracle.encode()).hexdigest()
    assert item.get("scope", "") == scope
    audit, report = _audit(case)
    assert audit.returncode == 0 and report["oracle_recheck"]["status"] == "ok", report


@pytest.mark.parametrize("marker", [True, False])
def test_real_stub_pass_and_fail_reach_blocking_gate(tmp_path, marker):
    case = _case(tmp_path, [{"id": "J", "judge": "Inspect evidence", "context": "evidence.txt",
                            "blocking": True}])
    (case[1] / "evidence.txt").write_text("RELAY_JUDGE_OK\n" if marker else "unsupported\n")
    proc = _eval(case)
    assert proc.returncode == (0 if marker else 1), proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["outcome"] == ("complete" if marker else "gate-fail")
    (item,) = _items(case[2])
    assert item["verdict"] == ("pass" if marker else "fail")
    assert item["graded_by"] == "judge:stub(non-independent)"


@pytest.mark.parametrize("backend", ["api", "cli"])
@pytest.mark.parametrize("verdict", ["pass", "fail"])
def test_valid_judge_json_contract(tmp_path, backend, verdict):
    case = _case(tmp_path, [{"id": "J", "judge": "Inspect", "blocking": True}])
    judge = _fake_judge(tmp_path, json.dumps({"verdict": verdict, "reason": "test", "backend": backend}))
    proc = _eval(case, RELAY_JUDGE=judge)
    assert proc.returncode == (0 if verdict == "pass" else 1), proc.stdout + proc.stderr
    (item,) = _items(case[2])
    assert item["verdict"] == verdict
    assert item["graded_by"] == f"judge:{backend}(non-independent)"


@pytest.mark.parametrize("stdout,exit_code", [
    (None, 0),
    ("", 0),
    ("{broken", 0),
    ("[]", 0),
    ("null", 0),
    ('"pass"', 0),
    ("{}", 0),
    ('{"verdict":"advisory","backend":"stub"}', 0),
    ('{"verdict":true,"backend":"stub"}', 0),
    ('{"verdict":"pass","backend":"stub"}\n{"verdict":"pass"}', 0),
    ('{"verdict":"pass","backend":"stub"}', 7),
], ids=["missing-program", "empty", "malformed", "array", "null", "string", "missing-verdict",
        "unsupported-verdict", "nonstring-verdict", "multiple-json", "exit7-with-pass"])
def test_judge_failure_cannot_complete_blocking_control(tmp_path, stdout, exit_code):
    case = _case(tmp_path, [{"id": "J-BLOCK", "judge": "Inspect", "blocking": True}])
    judge = tmp_path / "missing.py" if stdout is None else _fake_judge(tmp_path, stdout, exit_code)
    proc = _eval(case, RELAY_JUDGE=judge)
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["outcome"] == "gate-fail"
    assert json.loads(proc.stdout)["failing"] == ["J-BLOCK"]
    assert _counter(case[2]) == 0
    (item,) = _items(case[2])
    assert item["verdict"] == "fail", item
    assert item["graded_by"].startswith("judge:"), item
    assert "unavailable" in item["graded_by"] or "error" in item["graded_by"], item
    assert all(entry["event"] != "sprint-complete" for entry in _entries(case[2] / "ledger.jsonl"))


def test_malformed_advisory_judge_records_fail_without_blocking(tmp_path):
    case = _case(tmp_path, [
        {"id": "J-ADVISE", "judge": "Inspect", "blocking": False},
        {"id": "D", "cmd": "printf reached > reached.txt"},
    ])
    judge = _fake_judge(tmp_path, "{broken")
    proc = _eval(case, RELAY_JUDGE=judge)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["outcome"] == "complete"
    first, second = _items(case[2])
    assert first["verdict"] == "fail", first
    assert "unavailable" in first["graded_by"] or "error" in first["graded_by"], first
    assert second["verdict"] == "pass"
    assert (case[1] / "reached.txt").read_bytes() == b"reached"


@pytest.mark.parametrize("control", [
    {"cmd": True}, {"cmd": 0}, {"cmd": []}, {"cmd": {}},
    {"cmd": "true\u0000"}, {"cmd": ""}, {"cmd": None},
    {"judge": "", "blocking": True}, {"judge": True, "blocking": True},
    {"judge": None, "blocking": True}, {"judge": "Inspect\u0000", "blocking": True},
    {"judge": "Inspect", "paths": ["bad\u0000path"], "blocking": True},
])
def test_invalid_required_oracle_is_named_failure_not_unexecuted_pass(tmp_path, control):
    case = _case(tmp_path, [{"id": "BAD", **control}])
    proc = _eval(case, RELAY_JUDGE_STUB="pass")
    assert proc.returncode == 1, proc.stdout + proc.stderr
    assert json.loads(proc.stdout)["failing"] == ["BAD"]
    assert _counter(case[2]) == 0
    (item,) = _items(case[2])
    assert item["verdict"] == "fail", item
    assert "unavailable" in item["graded_by"] or "error" in item["graded_by"], item
    assert "BAD" in proc.stderr, proc.stderr


def test_empty_optional_cmd_can_fall_back_to_valid_judge(tmp_path):
    case = _case(tmp_path, [{"id": "J", "cmd": "", "judge": "Inspect", "blocking": True}])
    proc = _eval(case, RELAY_JUDGE_STUB="pass")
    assert proc.returncode == 0, proc.stdout + proc.stderr
    (item,) = _items(case[2])
    assert item["verdict"] == "pass" and item["graded_by"] == "judge:stub(non-independent)"


@pytest.mark.parametrize("control", [
    {"cmd": "true"},
    {"judge": "Inspect", "blocking": True},
    {"judge": "Inspect", "diff": True, "blocking": True},
    {"cmd": "true\u0000"},
])
def test_core_propagates_ledger_item_failure_without_errexit(tmp_path, control):
    case = _case(tmp_path, [
        {"id": "FIRST", **control}, {"id": "LATER", "cmd": "touch later.txt"},
    ])
    sprint, work, _ = case
    proc = subprocess.run(
        ["bash", "-c", '. "$1"; SPRINT="$2"; RUN_DIR="$3"; JUDGE="$4"; i=0; '
         'ledger_item() { return 7; }; relay_run_checklist',
         "_", str(CORE), str(sprint), str(work), str(JUDGE)],
        capture_output=True, text=True, env=_env(RELAY_JUDGE_STUB="pass"), timeout=20,
    )
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert not (work / "later.txt").exists(), "ledger failure must stop before later controls"


def test_cli_item_append_failure_does_not_advance_counter(tmp_path):
    case = _case(tmp_path, [{"id": "D", "cmd": "true"}])
    broken_ledger = tmp_path / "ledger-is-directory"
    broken_ledger.mkdir()
    proc = _eval(case, ledger=broken_ledger)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert _counter(case[2]) == 0, "item write failed but CLI advanced"
    assert "ledger append failed" in proc.stderr, proc.stderr
    assert not (tmp_path / ".chain.lock").exists()
    assert not (case[2] / ".run.lock").exists()


@pytest.mark.parametrize("value,outvar", [
    (None, "value"), ("", "decoded"), ("é\tA\nB\n\n", "outvar"),
    ("\n\n", "text"), ("ends-with-x", "cmd"),
])
def test_json_string_assigns_caller_variable_losslessly(value, outvar):
    proc = subprocess.run(
        ["bash", "-c", 'set -euo pipefail; . "$1"; '
         'decode() { local "$2=unchanged"; relay_json_string "$2" "$1"; printf "%s" "${!2}"; }; '
         'decode "$2" "$3"', "_", str(CORE), json.dumps(value), outvar],
        capture_output=True, env=_env(), timeout=20,
    )
    assert proc.returncode == 0, proc.stderr.decode()
    assert proc.stdout == ("" if value is None else value).encode()


@pytest.mark.parametrize("outvar", [
    "__relay_json_string_value", "__relay_json_string_other", "__relay_json_string_",
])
def test_json_string_rejects_reserved_namespace_without_changing_caller_local(outvar):
    proc = subprocess.run(
        ["bash", "-c", 'set -u; . "$1"; '
         'decode() { local "$2=unchanged"; relay_json_string "$2" "$1"; local rc=$?; '
         'printf "%s" "${!2}"; return "$rc"; }; '
         'decode "$2" "$3"', "_", str(CORE), json.dumps("café\tvalue\n\n"), outvar],
        capture_output=True, env=_env(), timeout=20,
    )
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert proc.stdout == b"unchanged"
    assert b"reserved output variable name" in proc.stderr and outvar.encode() in proc.stderr


@pytest.mark.parametrize("raw", ["true", "0", "[]", "{}", '"a\\u0000b"', "{bad", "", '"x" "y"'])
def test_json_string_rejects_nonstring_nul_or_invalid_json(raw):
    proc = subprocess.run(
        ["bash", "-c", '. "$1"; relay_json_string decoded "$2"', "_", str(CORE), raw],
        capture_output=True, text=True, env=_env(), timeout=20,
    )
    assert proc.returncode != 0
    assert proc.stderr
    assert proc.stdout == ""


@pytest.mark.parametrize("position,index", [
    ("macro.wp", 0), ("wp", 1), ("other.macro.wp", 0),
    ("other.deep.id", 2), ("macro.unknown", None),
])
def test_position_index_prefers_whole_id_then_suffix_after_first_dot(tmp_path, position, index):
    sprint = tmp_path / "sprint.json"
    sprint.write_text(json.dumps({"work_packages": [{"id": wid} for wid in ["macro.wp", "wp", "deep.id"]]}))
    proc = subprocess.run(
        ["bash", "-c", '. "$1"; SPRINT="$2"; relay_position_index "$3"',
         "_", str(CORE), str(sprint), position],
        capture_output=True, text=True, env=_env(), timeout=20,
    )
    if index is None:
        assert proc.returncode != 0
    else:
        assert proc.returncode == 0, proc.stderr
        assert proc.stdout.strip() == str(index)


@pytest.mark.parametrize("body", ["{broken", "", "null", "[]", '{"event":"a"} {"event":"b"}'])
def test_malformed_append_returns_nonzero_and_releases_lock(tmp_path, body):
    sprint, _, _ = _case(tmp_path, [])
    ledger = tmp_path / "ledger.jsonl"
    proc = subprocess.run(
        ["bash", str(NOTE), str(ledger), str(sprint), body],
        capture_output=True, text=True, env=_env(), timeout=20,
    )
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert proc.stderr
    assert not (tmp_path / ".chain.lock").exists()
    assert not ledger.exists() or ledger.read_bytes() == b""
    valid = subprocess.run(
        ["bash", str(NOTE), str(ledger), str(sprint), '{"event":"note"}'],
        capture_output=True, text=True, env=_env(), timeout=20,
    )
    assert valid.returncode == 0, valid.stderr
    assert len(_entries(ledger)) == 1 and _entries(ledger)[0]["seq"] == 0


@pytest.mark.parametrize("key", ["", "review-test-key"], ids=["plain", "keyed"])
@pytest.mark.parametrize("claimed_hash", [None, "", "supplied-hash"])
def test_append_rejects_top_level_h_without_append_or_owned_lock(tmp_path, key, claimed_hash):
    sprint, _, _ = _case(tmp_path, [])
    ledger = tmp_path / "ledger.jsonl"
    env = _env(RELAY_LEDGER_KEY=key)
    valid_body = json.dumps({"event": "note", "data": {"h": "nested-data", "text": "café\tline\n"}})
    seed = subprocess.run(["bash", str(NOTE), str(ledger), str(sprint), valid_body],
                          capture_output=True, text=True, env=env, timeout=20)
    assert seed.returncode == 0, seed.stderr
    before = ledger.read_bytes()
    invalid_body = json.dumps({"event": "note", "h": claimed_hash, "data": {"h": "nested-data"}})
    rejected = subprocess.run(["bash", str(NOTE), str(ledger), str(sprint), invalid_body],
                              capture_output=True, text=True, env=env, timeout=20)
    assert rejected.returncode != 0, rejected.stdout + rejected.stderr
    assert "top-level h" in rejected.stderr, rejected.stderr
    assert ledger.read_bytes() == before
    assert not (tmp_path / ".chain.lock").exists()
    following = subprocess.run(["bash", str(NOTE), str(ledger), str(sprint), valid_body],
                               capture_output=True, text=True, env=env, timeout=20)
    assert following.returncode == 0, following.stderr
    entries = _entries(ledger)
    assert [entry["seq"] for entry in entries] == [0, 1]
    assert entries[1]["prev"] == entries[0]["h"]
    assert all(entry["data"]["h"] == "nested-data" for entry in entries)
    verify = subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                            capture_output=True, text=True, env=env, timeout=20)
    assert verify.returncode == 0, verify.stdout + verify.stderr


@pytest.mark.parametrize("key", ["", "test-secret"])
def test_valid_compact_append_keeps_exact_body_and_mac_bytes(tmp_path, key):
    sprint, _, _ = _case(tmp_path, [])
    ledger = tmp_path / "ledger.jsonl"
    body = {"event": "note", "text": "café\tline\n"}
    compact = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    env = _env(RELAY_LEDGER_KEY=key)
    proc = subprocess.run(
        ["bash", str(NOTE), str(ledger), str(sprint), compact],
        capture_output=True, text=True, env=env, timeout=20,
    )
    assert proc.returncode == 0, proc.stderr
    raw = ledger.read_text(encoding="utf-8").rstrip("\n")
    signed_body = raw[:raw.rfind(',"h":')] + "}"
    expected = json.dumps({**body, "gen": 0, "prev": "GENESIS", "seq": 0,
                           "mac": "hmac-sha256" if key else "sha256"},
                          ensure_ascii=False, separators=(",", ":"))
    assert signed_body == expected
    digest = (hmac.new(key.encode(), expected.encode(), hashlib.sha256).hexdigest()
              if key else hashlib.sha256(expected.encode()).hexdigest())
    assert json.loads(raw)["h"] == digest
    verify = subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                            capture_output=True, text=True, env=env, timeout=20)
    assert verify.returncode == 0, verify.stdout + verify.stderr
    ledger.write_text(raw.replace('"event":"note"', '"event":"edit"') + "\n", encoding="utf-8")
    broken = subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                            capture_output=True, text=True, env=env, timeout=20)
    assert broken.returncode == 1 and "MAC mismatch" in broken.stdout


def test_direct_concurrent_appenders_keep_chain_contiguous(tmp_path):
    sprint, _, _ = _case(tmp_path, [])
    ledger = tmp_path / "ledger.jsonl"
    writers = [subprocess.Popen(
        ["bash", str(NOTE), str(ledger), str(sprint), json.dumps({"event": "note", "writer": n})],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=_env(),
    ) for n in range(4)]
    for writer in writers:
        stdout, stderr = writer.communicate(timeout=20)
        assert writer.returncode == 0, stdout + stderr
    entries = _entries(ledger)
    assert len(entries) == 4
    assert {entry["writer"] for entry in entries} == set(range(4))
    assert [entry["seq"] for entry in entries] == list(range(4))
    assert [entry["prev"] for entry in entries] == ["GENESIS"] + [entry["h"] for entry in entries[:-1]]
    verify = subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                            capture_output=True, text=True, env=_env(), timeout=20)
    assert verify.returncode == 0, verify.stdout + verify.stderr
    assert not (tmp_path / ".chain.lock").exists()

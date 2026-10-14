"""Real CLI/hook probes for lossless command transport and driver-specific scope.

No helper substitutes: these tests also reproduce the pre-helper baseline defects.
"""
import hashlib
import json
import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / "bin" / "relay-gate"
HOOK = ROOT / "benchmark" / "relay_hook.sh"


@pytest.fixture
def case(tmp_path):
    paths = {name: tmp_path / name for name in ("work", "state", "home", "scratch")}
    for path in paths.values():
        path.mkdir()
    env = {k: v for k, v in os.environ.items()
           if not k.startswith("RELAY_") and "API_KEY" not in k
           and k not in {"BASH_ENV", "ENV", "CDPATH"}}
    env.update(HOME=str(paths["home"]), TMPDIR=str(paths["scratch"]),
               RELAY_JUDGE_BACKEND="stub")
    paths.update(sprint=tmp_path / "sprint.json", env=env)
    return paths


def _plan(case, wps):
    case["sprint"].write_text(json.dumps({"retry_budget": 3, "work_packages": wps}))


def _wp(wid, checklist=None, dod=None):
    wp = {"id": wid, "instructions": "work", "checklist": checklist or []}
    if dod is not None:
        wp["dod"] = dod
    return wp


def _gate(case, mode="eval", *flags):
    result = subprocess.run(
        ["bash", str(GATE), mode, "--sprint", str(case["sprint"]),
         "--workdir", str(case["work"]), "--state", str(case["state"]), *flags],
        input="", capture_output=True, text=True, env=case["env"], timeout=20)
    body = json.loads(result.stdout) if result.stdout.strip() else None
    return result, body


def _hook(case):
    env = dict(case["env"], RELAY_RUN_DIR=str(case["work"]),
               RELAY_SPRINT=str(case["sprint"]), RELAY_GATE="on")
    result = subprocess.run(["bash", str(HOOK)], input="{}", capture_output=True,
                            text=True, env=env, timeout=20)
    body = json.loads(result.stdout) if result.stdout.strip() else None
    return result, body


def _entries(state):
    ledger = state / "ledger.jsonl"
    return [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []


def _state_bytes(state):
    return {p.name: p.read_bytes() for p in state.iterdir() if p.is_file()}


@pytest.mark.parametrize("cmd", ["test -f alpha.txt\ntest -f beta.txt",
                                 "test -f alpha.txt\n\ttest -f beta.txt\n\n"])
def test_cli_multiline_regression_catches_second_line_without_oracle_drift(case, cmd):
    _plan(case, [_wp("wp1", [{"id": "BOTH", "cmd": cmd}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    for name in ("alpha.txt", "beta.txt"):
        (case["work"] / name).touch()
    accepted, body = _gate(case)
    assert accepted.returncode == 0 and body["outcome"] == "advance", accepted.stderr
    original = case["sprint"].read_bytes()
    (case["work"] / "beta.txt").unlink()
    rejected, body = _gate(case)
    assert rejected.returncode == 1, (body, rejected.stderr)
    assert body["outcome"] == "gate-fail" and body["failing"] == ["BOTH"]
    entries = [e for e in _entries(case["state"]) if e.get("item") == "BOTH"]
    assert [e["verdict"] for e in entries] == ["pass", "fail"]
    assert {e["oracle"] for e in entries} == {hashlib.sha256(cmd.encode()).hexdigest()}
    assert case["sprint"].read_bytes() == original
    assert (case["state"] / "counter").read_text().strip() == "1"
    assert "BOTH" in _entries(case["state"])[-1]["reg"]


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_checklist_oracle_preserves_tabs_and_trailing_lf(case, driver):
    cmd = "\ttest -f alpha.txt\n\n"
    _plan(case, [_wp("wp1", [{"id": "EXACT", "cmd": cmd}])])
    (case["work"] / "alpha.txt").touch()
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "complete" if driver == "cli" else body is None
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    item = next(e for e in _entries(state) if e["event"] == "checklist-item")
    assert item["oracle"] == hashlib.sha256(cmd.encode()).hexdigest()


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
@pytest.mark.parametrize("cmd", [
    "if test -f alpha.txt; then\n\ttest -f beta.txt\nelse\n\tfalse\nfi\n\n",
    "verify_both() {\n\ttest -f alpha.txt && test -f beta.txt\n}\nverify_both\n\n",
    "if false; then\n\tfalse\nelse\n\ttrue\nfi\n\n",
    "false\n\ttrue\n\n",
])
def test_current_dod_executes_whole_shell_program(case, driver, cmd):
    _plan(case, [_wp("wp1", [{"id": "CURRENT", "cmd": "true"}], [{"cmd": cmd}])])
    for name in ("alpha.txt", "beta.txt"):
        (case["work"] / name).touch()
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "complete" if driver == "cli" else body is None


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_current_dod_uses_whole_program_failure_status(case, driver):
    cmd = "true\n\tfalse\n\n"
    _plan(case, [_wp("wp1", dod=[{"cmd": cmd}])])
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body["outcome"] == "gate-fail" if driver == "cli" else body["decision"] == "block"
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert _entries(state)[-1]["fails"] == "; " + cmd
    assert not (state / "counter").exists()


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_earlier_dod_regression_executes_whole_program(case, driver):
    cmd = "verify_both() {\n\ttest -f alpha.txt && test -f beta.txt\n}\nverify_both\n\n"
    _plan(case, [_wp("wp1", dod=[{"cmd": cmd}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    for name in ("alpha.txt", "beta.txt"):
        (case["work"] / name).touch()
    fire = _gate if driver == "cli" else _hook
    result, body = fire(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "advance" if driver == "cli" else body["decision"] == "block"
    (case["work"] / "beta.txt").unlink()
    result, body = fire(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body["outcome"] == "gate-fail" if driver == "cli" else body["decision"] == "block"
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert (state / "counter").read_text().strip() == "1"
    event = _entries(state)[-1]
    assert event["event"] == "gate-fail" and cmd in event["reg"]
    assert "CURRENT" not in event["fails"]


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
@pytest.mark.parametrize("bad", [None, "", 7, False, ["true"], {"x": "true"}, "true\u0000false"])
def test_malformed_required_dod_is_named_failure(case, driver, bad):
    _plan(case, [_wp("wp1", dod=[{"id": "BAD-DOD", "cmd": bad}])])
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body["outcome"] == "gate-fail" if driver == "cli" else body["decision"] == "block"
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    event = _entries(state)[-1]
    assert "BAD-DOD" in event["fails"]
    assert event["event"] == "gate-fail"
    assert not (state / "counter").exists()


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
@pytest.mark.parametrize("dod, name", [([{}], "dod:wp1:0:invalid-command"),
                                      (["true"], "dod:wp1:0:invalid-command"),
                                      ({"cmd": "true"}, "dod:wp1:invalid-array")])
def test_malformed_dod_shape_has_stable_failure_name(case, driver, dod, name):
    _plan(case, [_wp("wp1", dod=dod)])
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body is not None
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert _entries(state)[-1]["fails"] == "; " + name


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_malformed_prior_dod_is_regression_not_empty_pass(case, driver):
    _plan(case, [_wp("wp1", dod=[{"id": "BAD-OLD-DOD", "cmd": None}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    state.mkdir(exist_ok=True)
    (state / "counter").write_text("1")
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body is not None
    assert _entries(state)[-1]["reg"] == "; BAD-OLD-DOD"
    assert (state / "counter").read_text() == "1"


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_optional_absent_or_empty_dod_passes(case, driver):
    _plan(case, [_wp("wp1", [{"id": "C1", "cmd": "true"}]),
                 _wp("wp2", [{"id": "C2", "cmd": "true"}], [])])
    fire = _gate if driver == "cli" else _hook
    for _ in range(2):
        result, _ = fire(case)
        assert result.returncode == 0, result.stderr
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert (state / "counter").read_text().strip() == "2"
    assert _entries(state)[-1]["event"] == "sprint-complete"


# Intercept the driver's dot-source after loading its real core, saving the real
# appender for every event except the selected fault. Source in a conditional to
# prove mandatory failures propagate even when Bash disables implicit errexit.
_APPEND_FAULT_WRAPPER = r'''
.() {
  builtin . "$@" || return "$?"
  local implementation
  implementation=$(declare -f relay_chain_append) || return "$?"
  eval "${implementation/relay_chain_append/relay_chain_append_real}" || return "$?"
  relay_chain_append() {
    local event
    event=$(printf '%s' "$1" | jq -r '.event') || return "$?"
    if [ "$event" = "$FAIL_EVENT" ]; then
      printf 'injected append failure: %s\n' "$event" >&2
      return 77
    fi
    relay_chain_append_real "$@"
  }
}
FAIL_EVENT="$1"
shift
if source "$@"; then exit 0; else exit "$?"; fi
'''


def _append_fault_fire(case, driver, event):
    env = dict(case["env"])
    if driver == "cli":
        args = [str(GATE), "eval", "--sprint", str(case["sprint"]),
                "--workdir", str(case["work"]), "--state", str(case["state"])]
    else:
        args = [str(HOOK)]
        env.update(RELAY_RUN_DIR=str(case["work"]), RELAY_SPRINT=str(case["sprint"]), RELAY_GATE="on")
    result = subprocess.run(["bash", "-c", _APPEND_FAULT_WRAPPER, "append-fault", event, *args],
                            input="", capture_output=True, text=True, env=env, timeout=20)
    body = json.loads(result.stdout) if result.stdout.strip() else None
    return result, body


@pytest.mark.parametrize("driver, event", [
    ("cli", "sprint-complete"), ("benchmark", "sprint-complete"),
    ("cli", "advance-reveal"), ("benchmark", "advance-reveal"),
    ("cli", "gate-fail"), ("benchmark", "gate-fail"),
    ("cli", "escalate"), ("benchmark", "escalate"),
    ("cli", "regression-item"),
])
def test_required_append_fault_keeps_counter_retry_and_ledger(case, driver, event):
    wps = [_wp("wp1", dod=[{"cmd": "true"}])]
    index = 0
    if event == "advance-reveal":
        wps.append(_wp("wp2", dod=[{"cmd": "true"}]))
    elif event in {"gate-fail", "escalate"}:
        wps[0]["dod"] = [{"cmd": "false"}]
    elif event == "regression-item":
        wps = [_wp("wp1", [{"id": "OLD", "cmd": "true"}]), _wp("wp2", dod=[{"cmd": "true"}])]
        index = 1
    _plan(case, wps)
    if event == "escalate":
        plan = json.loads(case["sprint"].read_text())
        plan["retry_budget"] = 0
        case["sprint"].write_text(json.dumps(plan))
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    state.mkdir(exist_ok=True)
    counter, retry, ledger = state / "counter", state / f"retry_{index}", state / "ledger.jsonl"
    counter.write_text(str(index))
    retry.write_text("0")
    ledger.write_text("")
    before = (counter.read_bytes(), retry.read_bytes(), ledger.read_bytes())
    observations = []
    for _ in range(2):
        result, body = _append_fault_fire(case, driver, event)
        observations.append((result.returncode, body, counter.read_bytes(), retry.read_bytes(), ledger.read_bytes()))
    assert all(rc == 77 and body is None for rc, body, *_ in observations), observations
    assert all((c, r, l) == before for _, _, c, r, l in observations), observations
    assert "injected append failure: " + event in result.stderr


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
@pytest.mark.parametrize("terminal", [True, False])
def test_real_ledger_write_failure_cannot_publish_advance_or_complete(case, driver, terminal):
    wps = [_wp("wp1", dod=[{"cmd": "printf foo | grep -qx foo"}])]
    if not terminal:
        wps.append(_wp("wp2", dod=[{"cmd": "true"}]))
    _plan(case, wps)
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    state.mkdir(exist_ok=True)
    counter, retry, ledger = state / "counter", state / "retry_0", state / "ledger.jsonl"
    counter.write_text("0")
    retry.write_text("2")
    ledger.mkdir()  # Real append redirection must fail on a directory, independent of UID.
    before = (counter.read_bytes(), retry.read_bytes(), list(ledger.iterdir()))
    fire = _gate if driver == "cli" else _hook
    observations = []
    for _ in range(2):
        result, body = fire(case)
        observations.append((result.returncode, body, counter.read_bytes(), retry.read_bytes(), list(ledger.iterdir())))
    assert all(rc != 0 and body is None for rc, body, *_ in observations), observations
    assert all((c, r, l) == before for _, _, c, r, l in observations), observations
    assert "ledger" in result.stderr.lower()
    assert not (state / ".chain.lock").exists()
    assert not (state / ".run.lock").exists()


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_counter_write_failure_after_record_returns_error(case, driver):
    _plan(case, [_wp("wp1", dod=[{"cmd": "printf foo | grep -qx foo"}])])
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    state.mkdir(exist_ok=True)
    (state / "counter").mkdir()  # Counter read falls back to 0; the subsequent write must fail.
    (state / "retry_0").write_text("2")
    (state / "ledger.jsonl").write_text("")
    fire = _gate if driver == "cli" else _hook
    for attempt in range(2):
        result, body = fire(case)
        assert result.returncode != 0 and body is None, (result.returncode, body, result.stderr)
        assert [e["event"] for e in _entries(state)] == ["sprint-complete"] * (attempt + 1)
        assert (state / "counter").is_dir() and not list((state / "counter").iterdir())
        assert (state / "retry_0").read_text() == "2"


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_required_record_normal_pipeline_preserves_event_order(case, driver):
    _plan(case, [_wp("wp1", [{"id": "PIPE", "cmd": "printf foo | grep -qx foo"}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    fire = _gate if driver == "cli" else _hook
    result, body = fire(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "advance" if driver == "cli" else body["decision"] == "block"
    result, body = fire(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "complete" if driver == "cli" else body is None
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    events = ["checklist-item", "advance-reveal", "checklist-item"]
    if driver == "cli":
        events.append("regression-item")
    assert [e["event"] for e in _entries(state)] == events + ["sprint-complete"]
    assert (state / "counter").read_text().strip() == "2"
    assert not list(state.glob("retry_*"))


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_driver_order_and_prior_checklist_policy(case, driver):
    _plan(case, [_wp("wp1", [{"id": "OLD", "cmd": "test -f alpha.txt"}], [{"cmd": "true"}]),
                 _wp("wp2", [{"id": "NEW", "cmd": "printf C >> order.txt"}],
                     [{"cmd": "printf D >> order.txt"}])])
    (case["work"] / "alpha.txt").touch()
    fire = _gate if driver == "cli" else _hook
    result, _ = fire(case)
    assert result.returncode == 0, result.stderr
    (case["work"] / "alpha.txt").unlink()
    result, body = fire(case)
    assert (case["work"] / "order.txt").read_text() == ("CD" if driver == "cli" else "DC")
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    if driver == "cli":
        assert body["failing"] == ["OLD"]
    else:
        assert body is None
        entries = _entries(case["work"] / ".relay-state")
        assert entries[-1]["event"] == "sprint-complete"
        assert all(e["event"] != "regression-item" for e in entries)
        chain = {"gen", "prev", "seq", "mac", "h"}
        for entry in entries:
            fields = {"ts", "wp", "i", "event"} | chain
            if entry["event"] == "checklist-item":
                fields |= {"item", "assert", "verdict", "graded_by", "oracle", "origin"}
            else:
                fields |= {"retry", "fails", "reg"}
            assert set(entry) == fields


def test_cli_regresses_all_prior_commands_without_recorded_pass(case):
    _plan(case, [_wp("wp1", [{"id": "UNRECORDED", "cmd": "test -f absent"}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    (case["state"] / "counter").write_text("1")
    result, body = _gate(case)
    assert result.returncode == 1 and body["failing"] == ["UNRECORDED"], result.stderr


@pytest.mark.parametrize("bad", [None, "", False, 7, "true\u0000false"])
def test_cli_malformed_prior_checklist_command_is_named_failure(case, bad):
    _plan(case, [_wp("wp1", [{"id": "BAD-OLD", "cmd": bad}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    (case["state"] / "counter").write_text("1")
    result, body = _gate(case)
    assert result.returncode == 1 and body["failing"] == ["BAD-OLD"], result.stderr
    item = next(e for e in _entries(case["state"]) if e["event"] == "regression-item")
    assert item["item"] == "BAD-OLD" and item["verdict"] == "fail"
    assert item["oracle"] == ""


def test_cli_prior_judge_only_control_is_outside_regression_scope(case):
    _plan(case, [_wp("wp1", [{"id": "JUDGE-OLD", "judge": "semantic criterion", "blocking": True}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    (case["state"] / "counter").write_text("1")
    result, body = _gate(case)
    assert result.returncode == 0 and body["outcome"] == "complete", result.stderr
    assert all(e.get("item") != "JUDGE-OLD" for e in _entries(case["state"]))


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_typed_control_without_cmd_or_judge_cannot_pass(case, driver):
    _plan(case, [_wp("wp1", [{"id": "NO-ORACLE", "type": "file_exists", "path": "alpha.txt"}])])
    (case["work"] / "alpha.txt").touch()
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode == (1 if driver == "cli" else 0), result.stderr
    assert body is not None
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert "NO-ORACLE" in _entries(state)[-1]["fails"]
    assert not (state / "counter").exists()


def test_check_has_current_checklist_scope_and_no_state_mutation(case):
    _plan(case, [_wp("wp1", [{"id": "OLD", "cmd": "false"}], [{"cmd": "false"}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "test -f ready"}], [{"cmd": "false"}])])
    for name, value in {"counter": "1", "position": "wp2", "retry_1": "2",
                        "ledger.jsonl": "", "base_ref": "stale"}.items():
        (case["state"] / name).write_text(value)
    before = _state_bytes(case["state"])
    result, body = _gate(case, "check")
    assert result.returncode == 1 and body["failing"] == ["CURRENT"], result.stderr
    assert _state_bytes(case["state"]) == before
    (case["work"] / "ready").touch()
    result, body = _gate(case, "check")
    assert result.returncode == 0 and body["failing"] == [], result.stderr
    assert _state_bytes(case["state"]) == before
    result, body = _gate(case)
    assert result.returncode == 1 and body["outcome"] == "gate-fail", result.stderr
    assert "OLD" in body["failing"]
    assert (case["state"] / "retry_1").read_text().strip() == "3"
    assert (case["state"] / "counter").read_text() == "1"
    assert _entries(case["state"])[-1]["event"] == "gate-fail"


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_checklist_fatal_cannot_advance_or_charge_retry(case, driver):
    # Invalid checklist collection must be a fatal core failure, not an empty passing list.
    _plan(case, [{"id": "wp1", "instructions": "work", "checklist": 7}])
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    state.mkdir(exist_ok=True)
    (state / "counter").write_text("0")
    (state / "retry_0").write_text("2")
    result, body = _gate(case) if driver == "cli" else _hook(case)
    assert result.returncode != 0 and body is None, (result.stdout, result.stderr)
    assert (state / "counter").read_text() == "0"
    assert (state / "retry_0").read_text() == "2"
    assert not any(e["event"] in {"advance-reveal", "sprint-complete", "gate-fail"}
                   for e in _entries(state))


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
@pytest.mark.parametrize("later_cmd", ["true", "false"])
def test_current_dod_stdin_reader_cannot_skip_next_command(case, driver, later_cmd):
    _plan(case, [_wp("wp1", dod=[{"cmd": "cat >/dev/null"}, {"cmd": later_cmd}])])
    result, body = _gate(case) if driver == "cli" else _hook(case)
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    event = _entries(state)[-1]
    if later_cmd == "true":
        assert result.returncode == 0, result.stderr
        assert body["outcome"] == "complete" if driver == "cli" else body is None
        assert event["event"] == "sprint-complete"
        assert (state / "counter").read_text().strip() == "1"
    else:
        assert result.returncode == (1 if driver == "cli" else 0), (body, result.stderr)
        assert body["outcome"] == "gate-fail" if driver == "cli" else body and body["decision"] == "block"
        assert event["event"] == "gate-fail" and event["fails"] == "; false"
        assert (state / "retry_0").read_text().strip() == "1"
        assert not (state / "counter").exists()


@pytest.mark.parametrize("driver", ["cli", "benchmark"])
def test_prior_dod_stdin_reader_cannot_skip_regression(case, driver):
    file_cmd = "test -f accepted.txt"
    _plan(case, [_wp("wp1", dod=[{"cmd": "cat >/dev/null"}, {"cmd": file_cmd}]),
                 _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    (case["work"] / "accepted.txt").touch()
    fire = _gate if driver == "cli" else _hook
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    result, body = fire(case)
    assert result.returncode == 0, result.stderr
    assert body["outcome"] == "advance" if driver == "cli" else body["decision"] == "block"
    assert (state / "counter").read_text().strip() == "1"
    original = case["sprint"].read_bytes()
    (case["work"] / "accepted.txt").unlink()
    result, body = fire(case)
    assert result.returncode == (1 if driver == "cli" else 0), (body, result.stderr)
    assert body["outcome"] == "gate-fail" if driver == "cli" else body and body["decision"] == "block"
    event = _entries(state)[-1]
    assert event["event"] == "gate-fail" and event["reg"] == "; " + file_cmd
    assert event["fails"] == ""
    assert (state / "counter").read_text().strip() == "1"
    assert (state / "retry_1").read_text().strip() == "1"
    assert case["sprint"].read_bytes() == original


def test_cli_checklist_regression_stdin_reader_cannot_skip_later_control(case):
    controls = [{"id": "DRAIN", "cmd": "cat >/dev/null"},
                {"id": "FILE", "cmd": "test -f accepted.txt"}]
    _plan(case, [_wp("wp1", controls), _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])])
    (case["work"] / "accepted.txt").touch()
    result, body = _gate(case)
    assert result.returncode == 0 and body["outcome"] == "advance", result.stderr
    accepted = [e for e in _entries(case["state"]) if e["event"] == "checklist-item"]
    assert [(e["item"], e["verdict"]) for e in accepted] == [("DRAIN", "pass"), ("FILE", "pass")]
    original = case["sprint"].read_bytes()
    (case["work"] / "accepted.txt").unlink()
    result, body = _gate(case)
    assert result.returncode == 1 and body["failing"] == ["FILE"], (body, result.stderr)
    regressions = [e for e in _entries(case["state"]) if e["event"] == "regression-item"]
    assert [(e["item"], e["verdict"]) for e in regressions] == [("DRAIN", "pass"), ("FILE", "fail")]
    for control, entry in zip(controls, regressions):
        assert entry["oracle"] == hashlib.sha256(control["cmd"].encode()).hexdigest()
    assert (case["state"] / "counter").read_text().strip() == "1"
    assert (case["state"] / "retry_1").read_text().strip() == "1"
    assert case["sprint"].read_bytes() == original


@pytest.mark.parametrize("surface", ["cli-current-dod", "benchmark-current-dod",
                                     "cli-prior-dod", "benchmark-prior-dod", "cli-checklist-regression"])
@pytest.mark.parametrize("cmd", ["printf foo | grep -qx foo",
                                 "test \"$(cat <<'RELAY_INPUT'\nfoo\nRELAY_INPUT\n)\" = foo"])
def test_record_commands_keep_own_stdin(case, surface, cmd):
    driver = "benchmark" if surface.startswith("benchmark") else "cli"
    first_cmd = "printf X >> rounds.txt\n" + cmd
    later_cmd = "printf Y >> later-ran.txt"
    if surface == "cli-checklist-regression":
        first_wp = _wp("wp1", [{"id": "FEED", "cmd": first_cmd}, {"id": "LATER", "cmd": later_cmd}])
    else:
        first_wp = _wp("wp1", dod=[{"cmd": first_cmd}, {"cmd": later_cmd}])
    rounds = 1 if "current" in surface else 2
    wps = [first_wp] if rounds == 1 else [first_wp, _wp("wp2", [{"id": "CURRENT", "cmd": "true"}])]
    _plan(case, wps)
    fire = _gate if driver == "cli" else _hook
    for round_index in range(rounds):
        result, body = fire(case)
        assert result.returncode == 0, (body, result.stderr)
        assert (case["work"] / "rounds.txt").read_text() == "X" * (round_index + 1)
        assert (case["work"] / "later-ran.txt").read_text() == "Y" * (round_index + 1)
    assert body["outcome"] == "complete" if driver == "cli" else body is None
    state = case["state"] if driver == "cli" else case["work"] / ".relay-state"
    assert _entries(state)[-1]["event"] == "sprint-complete"

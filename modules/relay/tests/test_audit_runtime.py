"""Audit repair probes: real CLI runs plus locally sealed malformed/legacy records.

Existing evidence stays immutable. Synthetic chains use actual SHA/HMAC over raw body bytes,
so record interpretation failures are distinct from broken chain integrity.
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
RELAY = ROOT / "bin" / "relay"
VERIFY = ROOT / "benchmark" / "verify_ledger.py"
GATE = ROOT / "bin" / "relay-gate"
ORACLE = hashlib.sha256(b"true").hexdigest()


def _env(key=None):
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    env["RELAY_JUDGE_BACKEND"] = "stub"
    if key is not None:
        env["RELAY_LEDGER_KEY"] = key
    return env


def _cli(target, *extra, key=None, as_json=True):
    args = [sys.executable, str(RELAY), "verify", str(target), *map(str, extra)]
    if as_json:
        args.append("--json")
    p = subprocess.run(args, capture_output=True, text=True, env=_env(key))
    assert "Traceback" not in p.stdout + p.stderr, p.stdout + p.stderr
    if not as_json:
        return p, None
    out = json.loads(p.stdout)
    assert out["exit"] == p.returncode, out
    return p, out


def _offline(ledger, key=None):
    p = subprocess.run([sys.executable, str(VERIFY), str(ledger)],
                       capture_output=True, text=True, env=_env(key))
    assert "Traceback" not in p.stdout + p.stderr, p.stdout + p.stderr
    return p


def _control(**extra):
    return {"event": "checklist-item", "wp": "wp1", "item": "C1", "assert": "real control",
            "verdict": "pass", "graded_by": "deterministic", "oracle": ORACLE, **extra}


def _seal(path, events, key=None, legacy_mac=False, spaced=False, omit=(), raw_extra=None):
    """Seal the precise body, including noncompact whitespace when requested."""
    lines, prev = [], "GENESIS"
    for seq, event in enumerate(events):
        entry = {"prev": prev, "seq": seq,
                 **({} if legacy_mac else {"mac": "hmac-sha256" if key else "sha256"}), **event}
        for field in omit:
            entry.pop(field, None)
        body = json.dumps(entry, separators=(", ", ": ") if spaced else (",", ":"))
        if raw_extra is not None:
            body = body[:-1] + "," + raw_extra + "}"
        digest = (hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest() if key
                  else hashlib.sha256(body.encode()).hexdigest())
        lines.append(body[:-1] + ',"h":' + json.dumps(digest) + "}")
        prev = digest
    path.write_text("\n".join(lines) + "\n")
    return path


def _sprint(path, controls=None):
    plan = {"work_packages": [{"id": "wp1", "checklist": controls if controls is not None
                              else [{"id": "C1", "cmd": "true"}]}]}
    path.write_text(json.dumps(plan))
    return path


def _completed(tmp_path, key=None):
    work, run = tmp_path / "work", tmp_path / "run"
    work.mkdir()
    (run / ".relay-state").mkdir(parents=True)
    (work / "artifact.txt").write_text("ready\n")
    sprint = _sprint(run / "sprint.json", [{"id": "C1", "cmd": "test -s artifact.txt"}])
    p = subprocess.run([str(GATE), "eval", "--sprint", str(sprint), "--workdir", str(work),
                        "--state", str(run / ".relay-state")],
                       capture_output=True, text=True, env=_env(key))
    assert p.returncode == 0 and json.loads(p.stdout)["outcome"] == "complete", p.stdout + p.stderr
    return run, sprint, run / ".relay-state" / "ledger.jsonl"


def test_real_clean_run_then_added_false_control_is_rejected(tmp_path):
    run, sprint, ledger = _completed(tmp_path)
    p, out = _cli(run)
    assert p.returncode == 0 and out["result"] == "PASS"
    assert out["oracle_recheck"]["status"] == "ok"
    original = ledger.read_bytes()
    plan = json.loads(sprint.read_text())
    plan["work_packages"][0]["checklist"].append({"id": "NEVER-RECORDED", "cmd": "false"})
    sprint.write_text(json.dumps(plan))
    p, out = _cli(run)
    assert p.returncode == 2 and out["result"] == "SPRINT-DIVERGED", out
    assert out["chain_intact"] is True
    assert out["oracle_recheck"]["items"] == [{"id": "NEVER-RECORDED", "kind": "added",
                                               "recorded": None,
                                               "current": hashlib.sha256(b"false").hexdigest()[:12]}]
    assert ledger.read_bytes() == original
    p, _ = _cli(run, as_json=False)
    assert p.returncode == 2 and "NEVER-RECORDED" in p.stdout and "unrecorded" in p.stdout


@pytest.mark.parametrize("bad", ["missing", "no-argument", "directory", "unreadable", "json", "nonobject", "schema",
                                 "wps", "wp", "checklist", "id", "cmd", "judge", "paths",
                                 "duplicate", "no-oracle"])
def test_explicit_invalid_sprint_is_structured_nonpass(tmp_path, bad):
    _, _, ledger = _completed(tmp_path)
    sprint = tmp_path / "bad-sprint.json"
    if bad == "directory":
        sprint.mkdir()
    elif bad == "unreadable":
        _sprint(sprint)
        sprint.chmod(0)
    elif bad == "json":
        sprint.write_text("{broken")
    elif bad == "nonobject":
        sprint.write_text("[]")
    elif bad == "schema":
        sprint.write_text("{}")
    elif bad == "wps":
        sprint.write_text('{"work_packages": {}}')
    elif bad == "wp":
        sprint.write_text('{"work_packages": [null]}')
    elif bad == "checklist":
        sprint.write_text('{"work_packages": [{"checklist": {}}]}')
    elif bad not in ("missing", "no-argument", "directory"):
        control = {"id": "C1", "cmd": "true"}
        if bad == "id":
            control["id"] = []
        elif bad == "cmd":
            control["cmd"] = {}
        elif bad == "judge":
            control = {"id": "C1", "judge": {}}
        elif bad == "paths":
            control = {"id": "C1", "judge": "criterion", "paths": "wrong"}
        elif bad == "no-oracle":
            control.pop("cmd")
        _sprint(sprint, [control, control] if bad == "duplicate" else [control])
    try:
        p, out = _cli(ledger, "--sprint", *([] if bad == "no-argument" else [sprint]))
    finally:
        if bad == "unreadable":
            sprint.chmod(0o600)
    assert p.returncode == 2 and out["result"] == "SPRINT-INVALID", out
    assert out["chain_intact"] is True
    assert out["oracle_recheck"]["status"] == "invalid"
    assert out["oracle_recheck"]["reason"]


def test_discovered_invalid_sprint_cannot_silently_skip_comparison(tmp_path):
    run, sprint, _ = _completed(tmp_path)
    sprint.write_text("{broken")
    p, out = _cli(run)
    assert p.returncode == 2 and out["result"] == "SPRINT-INVALID"
    assert out["oracle_recheck"]["status"] == "invalid"


def test_bare_ledger_pass_explicitly_limits_scope(tmp_path):
    _, _, ledger = _completed(tmp_path)
    p, out = _cli(ledger)
    assert p.returncode == 0 and out["result"] == "PASS"
    assert out["oracle_recheck"]["status"] == "not-run"
    assert "recorded" in out["oracle_recheck"]["note"].lower()
    p, _ = _cli(ledger, as_json=False)
    assert "recorded controls only" in p.stdout.lower()


def test_legacy_oracles_not_guessed_and_new_ids_still_detected(tmp_path):
    c = _control()
    c.pop("oracle")
    ledger = _seal(tmp_path / "ledger.jsonl", [c, {"event": "sprint-complete"}], legacy_mac=True)
    assert _offline(ledger).returncode == 0
    p, out = _cli(ledger)
    assert p.returncode == 0 and out["result"] == "PASS"
    sprint = _sprint(tmp_path / "sprint.json")
    p, out = _cli(ledger, "--sprint", sprint)
    assert p.returncode == 2 and out["result"] == "ORACLE-UNVERIFIED", out
    assert out["oracle_recheck"]["status"] == "unverified"
    assert out["oracle_recheck"]["unverified"] == ["C1"]
    _sprint(sprint, [{"id": "C1", "cmd": "true"}, {"id": "C2", "cmd": "false"}])
    p, out = _cli(ledger, "--sprint", sprint)
    assert p.returncode == 2 and out["result"] == "SPRINT-DIVERGED"
    assert [(i["id"], i["kind"]) for i in out["oracle_recheck"]["items"]] == [("C2", "added")]
    _sprint(sprint, [])
    p, out = _cli(ledger, "--sprint", sprint)
    assert p.returncode == 2 and out["result"] == "SPRINT-DIVERGED"
    assert out["oracle_recheck"]["items"] == [{"id": "C1", "kind": "removed",
                                               "recorded": None, "current": None}]


@pytest.mark.parametrize("field,value", [
    ("item", None), ("item", []), ("item", ""), ("verdict", None), ("verdict", []),
    ("verdict", "unknown"), ("graded_by", None), ("graded_by", []),
    ("oracle", []), ("oracle", 3), ("wp", []), ("assert", {}),
])
def test_intact_unusable_record_is_record_invalid(tmp_path, field, value):
    c = _control()
    if value is None:
        c.pop(field)
    else:
        c[field] = value
    ledger = _seal(tmp_path / "ledger.jsonl", [c, {"event": "sprint-complete"}])
    assert _offline(ledger).returncode == 0, "valid signature is not a valid control record"
    p, out = _cli(ledger)
    assert p.returncode == 2 and out["result"] == "RECORD-INVALID", out
    assert out["chain_intact"] is True and out["record_errors"]
    assert any(e["field"] == field for e in out["record_errors"])
    assert out["deterministic_passed"] == 0
    p, _ = _cli(ledger, as_json=False)
    assert p.returncode == 2 and "RECORD INVALID" in p.stdout


def test_deterministic_advisory_is_not_a_pass(tmp_path):
    ledger = _seal(tmp_path / "ledger.jsonl", [_control(verdict="advisory"),
                                              {"event": "sprint-complete"}])
    p, out = _cli(ledger)
    assert p.returncode == 2 and out["result"] == "CONTROL-FAIL"
    assert out["deterministic_passed"] == 0


@pytest.mark.parametrize("raw", ["{broken", "[]", "null", '"string"', "3", "{}"])
def test_malformed_json_or_nonobject_chain_is_named_broken(tmp_path, raw):
    ledger = tmp_path / "ledger.jsonl"
    ledger.write_text(raw + "\n")
    p = _offline(ledger)
    assert p.returncode == 1 and ("BROKEN" in p.stdout or "TAMPERED" in p.stdout)
    p, out = _cli(ledger)
    assert p.returncode == 1 and out["result"] == "TAMPERED"
    assert out["chain_intact"] is False


@pytest.mark.parametrize("field,value", [
    ("h", None), ("h", []), ("h", ["not-a-hash"]), ("h", 3), ("h", "é" * 64), ("mac", []), ("mac", None),
    ("prev", []), ("prev", None), ("seq", None), ("seq", False), ("seq", 0.0),
    ("event", None), ("event", []), ("event", ""),
])
def test_malformed_chain_fields_fail_without_traceback(tmp_path, field, value):
    ledger = tmp_path / "ledger.jsonl"
    # Seal malformed body fields rather than inducing an incidental MAC mismatch.
    event = {"event": "sprint-complete"}
    if field not in ("h",) and value is not None:
        event[field] = value
    _seal(ledger, [event], omit=(field,) if value is None and field != "mac" else ())
    if field == "h" or (field == "mac" and value is None):
        entry = json.loads(ledger.read_text())
        if value is None:
            entry.pop(field)
        else:
            entry[field] = value
        ledger.write_text(json.dumps(entry, separators=(",", ":")) + "\n")
    # Missing mac is legitimate legacy mode; its unsigned removal still breaks this modern MAC.
    p = _offline(ledger)
    assert p.returncode == 1 and ("BROKEN" in p.stdout or "TAMPERED" in p.stdout)
    p, out = _cli(ledger)
    assert p.returncode == 1 and out["result"] == "TAMPERED"


@pytest.mark.parametrize("sealed_key,verify_key,legacy,code", [
    (None, None, False, 0), (None, None, True, 0), ("secret", "secret", False, 0),
    ("secret", "wrong", False, 1), ("secret", None, False, 1), (None, "secret", False, 1),
])
def test_raw_body_plain_keyed_legacy_and_mode_binding(tmp_path, sealed_key, verify_key, legacy, code):
    ledger = _seal(tmp_path / "ledger.jsonl", [_control(), {"event": "sprint-complete"}],
                   key=sealed_key, legacy_mac=legacy, spaced=True)
    original = ledger.read_bytes()
    assert _offline(ledger, verify_key).returncode == code
    p, out = _cli(ledger, key=verify_key)
    assert p.returncode == code and out["result"] == ("PASS" if code == 0 else "TAMPERED")
    assert ledger.read_bytes() == original


def test_existing_failure_precedence_and_last_checklist_verdict(tmp_path):
    events = [_control(verdict="fail", oracle=hashlib.sha256(b"false").hexdigest()),
              _control(event="regression-item"), {"event": "escalate"}]
    ledger = _seal(tmp_path / "ledger.jsonl", events)
    p, out = _cli(ledger)
    assert p.returncode == 2 and out["result"] == "CONTROL-FAIL"
    assert out["controls"][0]["verdict"] == "fail" and out["oracle_drift"]
    sprint = _sprint(tmp_path / "sprint.json", [{"id": "C1", "cmd": "false"}])
    p, out = _cli(ledger, "--sprint", sprint)
    assert p.returncode == 2 and out["result"] == "SPRINT-DIVERGED"
    # An in-place edit breaks integrity; even invalid sprint input cannot hide that result.
    ledger.write_text(ledger.read_text().replace('"verdict":"fail"', '"verdict":"pass"', 1))
    sprint.write_text("{broken")
    p, out = _cli(ledger, "--sprint", sprint)
    assert p.returncode == 1 and out["result"] == "TAMPERED"


def _failed_keyed_record(tmp_path, key):
    work, run = tmp_path / "work", tmp_path / "run"
    work.mkdir()
    (run / ".relay-state").mkdir(parents=True)
    sprint = _sprint(run / "sprint.json", [{"id": "C1", "cmd": "test -s missing.txt"}])
    plan = json.loads(sprint.read_text())
    plan["retry_budget"] = 0
    sprint.write_text(json.dumps(plan))
    p = subprocess.run([str(GATE), "eval", "--sprint", str(sprint), "--workdir", str(work),
                        "--state", str(run / ".relay-state")],
                       capture_output=True, text=True, env=_env(key))
    assert p.returncode == 2 and json.loads(p.stdout)["outcome"] == "escalate", p.stdout + p.stderr
    return run, sprint, run / ".relay-state" / "ledger.jsonl"


def _append_unsigned_suffix(line, suffix):
    """The attacker has bytes, not the producer's key or a signing operation."""
    assert line.endswith("}")
    return line[:-1] + "," + suffix + "}"


@pytest.mark.parametrize("attack", ["literal-keys", "escaped-keys", "unsigned-field"])
def test_c5_real_hmac_unsigned_suffix_cannot_forge_pass(tmp_path, attack):
    key = "producer-and-auditor-only"
    run, _, ledger = (_completed(tmp_path, key) if attack == "unsigned-field"
                      else _failed_keyed_record(tmp_path, key))
    assert _offline(ledger, key).returncode == 0
    before, original_report = _cli(run, key=key)
    assert before.returncode == (0 if attack == "unsigned-field" else 2)
    if attack != "unsigned-field":
        assert original_report["controls"][0]["verdict"] == "fail"
        assert original_report["last_event"] == "escalate"
    original = ledger.read_text().splitlines()
    forged = []
    for line in original:
        event = json.loads(line)["event"]
        if attack == "unsigned-field":
            suffix = '"unsigned":true'
        elif event == "checklist-item":
            suffix = (r'"\u0076erdict":"pass"' if attack == "escaped-keys"
                      else '"verdict":"pass"')
        elif event == "escalate":
            suffix = (r'"\u0065vent":"sprint-complete"' if attack == "escaped-keys"
                      else '"event":"sprint-complete"')
        else:
            forged.append(line)
            continue
        forged.append(_append_unsigned_suffix(line, suffix))
    ledger.write_text("\n".join(forged) + "\n")
    # Python's permissive decoder sees all-green evidence; the authenticated prefix is unchanged.
    loose = [json.loads(line) for line in forged]
    assert all(e["verdict"] == "pass" for e in loose if e["event"] == "checklist-item")
    assert loose[-1]["event"] == "sprint-complete"
    for old, new in zip(original, forged):
        assert old[:old.rfind(',"h":')] == new[:new.rfind(',"h":')]
        old_entry, new_entry = json.loads(old), json.loads(new)
        assert {k: old_entry[k] for k in ("h", "prev", "seq", "mac")} == {
            k: new_entry[k] for k in ("h", "prev", "seq", "mac")}
    verifier = _offline(ledger, key)
    auditor, out = _cli(run, key=key)
    assert (verifier.returncode, auditor.returncode, out["result"]) == (1, 1, "TAMPERED"), (
        verifier.stdout, out)
    assert out["chain_intact"] is False and out["controls"] == []


@pytest.mark.parametrize("key", [None, "secret"])
@pytest.mark.parametrize("suffix", [
    '"unsigned":true', '"verdict":"pass"', '"event":"checklist-item"',
    r'"\u0076erdict":"pass"', r'"\u0065vent":"checklist-item"', '"h":{digest}',
])
def test_c5_plain_and_keyed_unsigned_suffix_is_rejected(tmp_path, key, suffix):
    ledger = _seal(tmp_path / "ledger.jsonl", [_control(), {"event": "sprint-complete"}], key=key)
    assert _offline(ledger, key).returncode == 0
    assert _cli(ledger, key=key)[0].returncode == 0
    lines = ledger.read_text().splitlines()
    suffix = suffix.replace("{digest}", json.dumps(json.loads(lines[0])["h"]))
    lines[0] = _append_unsigned_suffix(lines[0], suffix)
    ledger.write_text("\n".join(lines) + "\n")
    verifier, (auditor, out) = _offline(ledger, key), _cli(ledger, key=key)
    assert verifier.returncode == 1 and auditor.returncode == 1 and out["result"] == "TAMPERED"
    assert "duplicate JSON key" in verifier.stdout or "final root member" in verifier.stdout


@pytest.mark.parametrize("key", [None, "secret"])
@pytest.mark.parametrize("extra", [
    '"verdict":"pass"', '"event":"checklist-item"', '"h":"body-reserved-field"',
    r'"\u0076erdict":"pass"', r'"\u0065vent":"checklist-item"', r'"\u0068":"body-reserved-field"',
    '"data":{"n":1,"n":2}', r'"data":[{"n":1,"\u006e":2}]',
])
def test_c5_even_mac_valid_duplicate_keys_are_ambiguous(tmp_path, key, extra):
    ledger = _seal(tmp_path / "ledger.jsonl", [_control(), {"event": "sprint-complete"}],
                   key=key, raw_extra=extra)
    # The producer sealed these exact ambiguous bytes. A valid MAC cannot choose their meaning.
    verifier, (auditor, out) = _offline(ledger, key), _cli(ledger, key=key)
    assert verifier.returncode == 1 and "duplicate JSON key" in verifier.stdout
    assert auditor.returncode == 1 and out["result"] == "TAMPERED"


@pytest.mark.parametrize("key,legacy", [(None, False), (None, True), ("secret", False)])
@pytest.mark.parametrize("spaced", [False, True])
def test_c5_nested_h_and_exact_raw_body_remain_valid(tmp_path, key, legacy, spaced):
    ledger = _seal(tmp_path / "ledger.jsonl", [
        _control(data={"h": "nested data, not the root digest", "rows": [{"h": "also data"}]}),
        {"event": "sprint-complete"},
    ], key=key, legacy_mac=legacy, spaced=spaced)
    original = ledger.read_bytes()
    assert _offline(ledger, key).returncode == 0
    auditor, out = _cli(ledger, key=key)
    assert auditor.returncode == 0 and out["result"] == "PASS"
    assert ledger.read_bytes() == original


@pytest.mark.parametrize("key", [None, "secret"])
def test_c5_valid_prefix_truncation_limit_remains(tmp_path, key):
    ledger = _seal(tmp_path / "ledger.jsonl", [_control(), {"event": "sprint-complete"}], key=key)
    ledger.write_text(ledger.read_text().splitlines()[0] + "\n")
    verifier, (auditor, out) = _offline(ledger, key), _cli(ledger, key=key)
    assert verifier.returncode == 0 and "possible tail-truncation" in verifier.stdout
    assert auditor.returncode == 2 and out["result"] == "TRUNCATED"


def test_c5_audit_loader_rejects_escaped_nested_duplicates(tmp_path):
    from importlib.machinery import SourceFileLoader
    from importlib.util import module_from_spec, spec_from_loader

    ledger = _seal(tmp_path / "ledger.jsonl", [_control(), {"event": "sprint-complete"}],
                   key="secret", raw_extra=r'"data":[{"n":1,"\u006e":2}]')
    loader = SourceFileLoader("relay_c5_audit", str(RELAY))
    module = module_from_spec(spec_from_loader(loader.name, loader))
    loader.exec_module(module)
    with pytest.raises(ValueError, match="duplicate JSON key"):
        module.load_entries(ledger)


@pytest.mark.parametrize("mode", ["plain", "keyed", "legacy"])
@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
@pytest.mark.parametrize("container", ["object", "array"])
def test_c5b_non_json_constants_break_signed_chain(tmp_path, mode, token, container):
    key, legacy = ("secret" if mode == "keyed" else None), mode == "legacy"
    events = [_control(), {"event": "sprint-complete"}]
    valid = _seal(tmp_path / "valid.jsonl", events, key=key, legacy_mac=legacy, spaced=True,
                  raw_extra='"data":{"numbers":[0,-0,17,-42,0.5,-1.25,1e2,1E-2,1e999],'
                            '"strings":["NaN","Infinity","-Infinity"]}')
    valid_bytes = valid.read_bytes()
    assert _offline(valid, key).returncode == 0
    auditor, out = _cli(valid, key=key)
    assert auditor.returncode == 0 and out["result"] == "PASS"
    assert valid.read_bytes() == valid_bytes

    # Insert the illegal token literally BEFORE sealing; do not decode or reserialize it.
    extra = (f'"data":{{"value":{token}}}' if container == "object"
             else f'"data":[{token}]')
    malformed = _seal(tmp_path / "malformed.jsonl", events, key=key, legacy_mac=legacy,
                      spaced=True, raw_extra=extra)
    malformed_bytes = malformed.read_bytes()
    verifier = _offline(malformed, key)
    auditor, out = _cli(malformed, key=key)
    assert (verifier.returncode, auditor.returncode, out["result"]) == (1, 1, "TAMPERED"), (
        verifier.stdout, out)
    assert f"non-JSON constant {token!r}" in verifier.stdout
    assert out["chain_intact"] is False and out["record_errors"] == []
    assert malformed.read_bytes() == malformed_bytes

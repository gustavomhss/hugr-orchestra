#!/usr/bin/env python3
"""G1 goldens: `bin/relay verify|problems|cost --json` over synthetic records and sprint variants.

Dev-only, like ledger.py (whose harness this uses). Run: `python3 packages/relay/test/golden/generate/audit.py`.
The fixture ledgers' audit output lives in ledger/; these cases pin the branches fixtures do not reach: every verify
result, sprint discovery in run and arm directories, invalid and diverged sprints, unusable records, unsigned and
sealed ambiguity, problems categories and cost rollups.

Layout, every path relative to packages/relay (the cwd every command ran in):

- test/golden/audit/<name>/input/**: the files the case reads. A run directory keeps its ledger (and possibly its
  sprint) under `.relay-state/`; an arm directory keeps both at the top level.
- case.json `{target, verify, key, chmod}`: the commands were `relay verify <target> <verify...> --json`,
  `relay problems <target> --json` and `relay cost <target> --json`, with RELAY_LEDGER_KEY=key when key is not null.
  Each `chmod` mode (octal text) was applied to its input path for the run and undone afterwards.
- verify.json, problems.json, cost.json (parsed stdout, null when empty), exits.json, and stderr.json when a command
  wrote to stderr (a traceback cut to its last line).
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ledger import COMPLETE, GOLDEN, KEY, PKG, WRONG_KEY, control, rel, record_audit, reset, seal, start, write_bytes, write_json  # noqa: E402


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def sprint(controls, **extra):
    return json.dumps({**extra, "work_packages": [{"id": "wp1", "title": "A", "instructions": "x",
                                                   "checklist": controls}]})


C1 = {"id": "C1", "assert": "real control", "cmd": "true"}
PASSED = [control(), COMPLETE]
ESCALATE = {"wp": "wp1", "i": 0, "event": "escalate", "retry": 3, "fails": "; C2", "reg": ""}
JUDGE = {**control(item="J1", graded_by="judge:stub(non-independent)", oracle=sha("is it reviewed? :: a.md b.md")),
         "assert": "the review engages with the diff"}


def gate(event="gate-fail", **extra):
    return {"wp": "wp1", "i": 0, "event": event, "retry": 1, "fails": "; C1", "reg": "", **extra}


def state(event, wp, macro, **extra):
    return {"wp": wp, "i": 0, "event": event, "retry": 0, "fails": "", "reg": "", **({"macro": macro} if macro else {}),
            **extra}


def run_dir(ledger, plan=None, beside=True):
    files = {"run/.relay-state/ledger.jsonl": ledger}
    if plan is not None:
        files["run/sprint.json" if beside else "run/.relay-state/sprint.json"] = plan
    return files


def bare(ledger, *verify, **extra):
    return {"files": {"ledger.jsonl": ledger, **extra.pop("files", {})}, "target": "ledger.jsonl",
            "verify": list(verify), **extra}


def invalid_sprints():
    """`--sprint` pointing at something that is not a usable sprint: always SPRINT-INVALID, never not-run."""
    def bad(plan, path="bad-sprint.json", **extra):
        files = {} if plan is None else {path: plan}
        return bare(seal(PASSED), "--sprint", f"{{input}}/{path}", files=files, **extra)

    one = lambda control_: sprint([control_])  # noqa: E731
    return {
        "sprint-invalid-missing": bad(None, "absent-sprint.json"),
        "sprint-invalid-no-argument": bare(seal(PASSED), "--sprint"),
        "sprint-invalid-directory": bare(seal(PASSED), "--sprint", "{input}/bad-sprint.json",
                                         files={"bad-sprint.json/.keep": ""}),
        "sprint-invalid-unreadable": bad(sprint([C1]), chmod={"bad-sprint.json": "000"}),
        "sprint-invalid-json": bad("{broken"),
        "sprint-invalid-nonobject": bad("[]"),
        "sprint-invalid-schema": bad("{}"),
        "sprint-invalid-wps": bad('{"work_packages": {}}'),
        "sprint-invalid-wp": bad('{"work_packages": [null]}'),
        "sprint-invalid-checklist": bad('{"work_packages": [{"checklist": {}}]}'),
        "sprint-invalid-id": bad(one({"id": [], "cmd": "true"})),
        "sprint-invalid-blank-id": bad(one({"id": " ", "cmd": "true"})),
        "sprint-invalid-control": bad('{"work_packages": [{"checklist": ["C1"]}]}'),
        "sprint-invalid-cmd": bad(one({"id": "C1", "cmd": {}})),
        "sprint-invalid-judge": bad(one({"id": "C1", "judge": {}})),
        "sprint-invalid-paths": bad(one({"id": "C1", "judge": "criterion", "paths": "wrong"})),
        "sprint-invalid-duplicate": bad(sprint([C1, C1])),
        "sprint-invalid-no-oracle": bad(one({"id": "C1"})),
        "sprint-invalid-empty-cmd": bad(one({"id": "C1", "cmd": ""})),
    }


def unusable_records():
    """Intact chains whose audit fields cannot be read as verdicts: RECORD-INVALID."""
    cases = {}
    for field, value in [("item", None), ("item", []), ("item", ""), ("verdict", None), ("verdict", []),
                         ("verdict", "unknown"), ("graded_by", None), ("graded_by", []), ("oracle", []),
                         ("oracle", 3), ("oracle", "ABC"), ("wp", []), ("assert", {})]:
        entry = control()
        if value is None:
            entry.pop(field)
        else:
            entry[field] = value
        label = "missing" if value is None else type(value).__name__ if not isinstance(value, str) else (value or "empty")
        cases[f"record-invalid-{field}-{label}".lower().replace("_", "-")] = bare(seal([entry, COMPLETE]))
    cases["record-invalid-fails"] = bare(seal([control(), gate(fails=3), COMPLETE]))
    cases["record-invalid-event"] = bare(seal([control(), {"wp": "wp1", "event": "note", "assert": 1}, COMPLETE]))
    return cases


def unsigned_suffixes():
    """Members appended after the final h, by someone holding bytes but not the key: TAMPERED, never PASS."""
    cases = {}
    for key, label, suffix in [(None, "unsigned-field", '"unsigned":true'), (None, "verdict", '"verdict":"pass"'),
                               (None, "escaped-verdict", '"\\u0076erdict":"pass"'), (None, "h-again", '"h":{digest}'),
                               (KEY, "verdict", '"verdict":"pass"'),
                               (KEY, "escaped-event", '"\\u0065vent":"checklist-item"')]:
        lines = seal(PASSED, key=key).decode().splitlines()
        text = suffix.replace("{digest}", json.dumps(json.loads(lines[0])["h"]))
        lines[0] = lines[0][:-1] + "," + text + "}"
        cases[f"unsigned-{'keyed-' if key else ''}{label}"] = bare(("\n".join(lines) + "\n").encode(), key=key)
    return cases


def sealed_ambiguity():
    """Bytes the producer itself sealed: duplicate keys, nested h, non-JSON constants and the numbers that stay valid."""
    cases = {}
    for key, label, extra in [(None, "verdict", '"verdict":"pass"'), (None, "escaped-h", '"\\u0068":"body-reserved-field"'),
                              (None, "nested", '"data":{"n":1,"n":2}'), (None, "nested-escaped", '"data":[{"n":1,"\\u006e":2}]'),
                              (KEY, "h", '"h":"body-reserved-field"')]:
        cases[f"sealed-duplicate-{'keyed-' if key else ''}{label}"] = bare(seal(PASSED, key=key, raw_extra=extra), key=key)
    nested = [control(data={"h": "nested data, not the root digest", "rows": [{"h": "also data"}]}), COMPLETE]
    cases["sealed-nested-h"] = bare(seal(nested))
    cases["sealed-nested-h-keyed-spaced"] = bare(seal(nested, key=KEY, spaced=True), key=KEY)
    cases["sealed-nested-h-legacy-spaced"] = bare(seal(nested, legacy=True, spaced=True))
    for key, legacy, label, extra in [(None, False, "nan", '"data":{"value":NaN}'),
                                      (KEY, False, "infinity-keyed", '"data":[Infinity]'),
                                      (None, True, "negative-infinity-legacy", '"data":{"value":-Infinity}')]:
        cases[f"sealed-constant-{label}"] = bare(seal(PASSED, key=key, legacy=legacy, spaced=True, raw_extra=extra),
                                                 key=key)
    cases["sealed-numbers"] = bare(seal(PASSED, spaced=True, raw_extra='"data":{"numbers":[0,-0,17,-42,0.5,-1.25,1e2,'
                                                                      '1E-2,1e999],"strings":["NaN","Infinity"]}'))
    return cases


def modes():
    """Plain, legacy and keyed chains, each verified with the matching, a wrong or no key."""
    cases = {}
    for sealed, verify_key, legacy, label in [(None, None, False, "plain"), (None, None, True, "legacy"),
                                              (KEY, KEY, False, "keyed"), (KEY, WRONG_KEY, False, "keyed-wrong-key"),
                                              (KEY, None, False, "keyed-without-key"), (None, KEY, False, "plain-with-key"),
                                              (None, KEY, True, "legacy-with-key")]:
        cases[f"mode-{label}"] = bare(seal(PASSED, key=sealed, legacy=legacy, spaced=True), key=verify_key)
    cases["mode-keyed-truncated"] = bare(seal(PASSED[:1], key=KEY), key=KEY)
    cases["mode-plain-truncated"] = bare(seal(PASSED[:1]))
    return cases


def problems_and_cost():
    cost = {"in": 100, "out": 20, "cache_read": 500, "cache_write": 300, "turns": 1}
    defects = [{"arm": "tok", "event": "cap-risk", "cap": 8, "chain_min": 12, "work_packages": 11},
               {"wp": "wp1", "event": "inject-missing", "file": "protocol.md"},
               {"wp": "wp2", "event": "position-lost"}, {"wp": "wp3", "event": "unknown-kind", "kind": "human"}]
    return {
        "problems-gate-failing": bare(seal([control(verdict="fail"), gate()])),
        "problems-gate-fail-repeat": bare(seal([control(verdict="fail"), gate(), gate("gate-fail-repeat", retry=2)])),
        "problems-regression": bare(seal([control(), gate(fails="", reg="; C0")])),
        "problems-failing-and-regression": bare(seal([control(verdict="fail"), gate(reg="; C0")])),
        "problems-cleared": bare(seal([control(verdict="fail"), gate(), control(), state("advance-reveal", "wp1", None)])),
        "problems-plan-defects": bare(seal([control(), *defects, COMPLETE])),
        "problems-awaiting-human": bare(seal([control(verdict="fail"), ESCALATE])),
        "problems-awaiting-human-unrecorded": bare(seal([control(verdict="fail"), {**ESCALATE, "fails": ""}])),
        "problems-released": bare(seal([control(verdict="fail"), ESCALATE, {"wp": "wp1", "event": "human-release",
                                                                           "reason": "owner: retry"},
                                        control(), COMPLETE])),
        "cost-priced": bare(seal([control(), state("advance-reveal", "a", "m1", cost=cost),
                                  state("advance-reveal", "b", "m1", cost={**cost, "turns": 3}, elapsed_s=30),
                                  state("advance-reveal", "c", None, cost={**cost, "in": 7}, elapsed_s=12),
                                  state("sprint-complete", "d", "m2", cost=cost, elapsed_s=5)])),
        "cost-unpriced": bare(seal([control(), state("advance-reveal", "a", "m1"), state("sprint-complete", "b", "m1",
                                                                                        elapsed_s=9)])),
        "cost-partial": bare(seal([control(), state("advance-reveal", "a", "m1", cost={"in": 5, "out": 1}),
                                   state("advance-reveal", "b", "m1", cost="not an object", elapsed_s=4),
                                   state("advance-reveal", "c", "m2", cost={**cost, "turns": None}, elapsed_s=2),
                                   state("escalate", "d", "m2", cost=cost, elapsed_s=1)])),
        "cost-gate-events-ignored": bare(seal([control(verdict="fail"), gate(cost=cost, elapsed_s=99),
                                               state("advance-reveal", "a", None, cost=cost)])),
    }


def cases():
    plan = sprint([C1])
    changed = sprint([{**C1, "cmd": "test -f artifact.txt"}])
    legacy = [{k: v for k, v in control().items() if k != "oracle"}, COMPLETE]
    judge_plan = sprint([C1, {"id": "J1", "assert": "", "judge": "is it reviewed?", "paths": ["a.md", "b.md"]}])
    precedence = [control(verdict="fail", oracle=sha("false")), control(event="regression-item"),
                  {"wp": "wp1", "i": 0, "event": "escalate", "retry": 3, "fails": "; C1", "reg": ""}]
    tampered = seal(precedence).decode().replace('"verdict":"fail"', '"verdict":"pass"', 1).encode()
    return {
        "pass-run-dir": {"files": run_dir(seal(PASSED), plan), "target": "run"},
        "pass-run-dir-state-sprint": {"files": run_dir(seal(PASSED), plan, beside=False), "target": "run"},
        "pass-arm-dir": {"files": {"arm/ledger.jsonl": seal(PASSED), "arm/sprint.json": plan}, "target": "arm"},
        "pass-bare-ledger": bare(seal(PASSED)),
        "pass-with-judge": {"files": run_dir(seal([control(), JUDGE, COMPLETE]), judge_plan), "target": "run"},
        "diverged-added": {"files": run_dir(seal(PASSED), sprint([C1, {"id": "NEVER-RECORDED", "cmd": "false"}])),
                           "target": "run"},
        "diverged-changed": {"files": run_dir(seal(PASSED), changed), "target": "run"},
        "diverged-removed": {"files": run_dir(seal(PASSED), sprint([])), "target": "run"},
        "diverged-checklist-null": {"files": run_dir(seal(PASSED), json.dumps({"work_packages": [{"id": "wp1",
                                                                                                "checklist": None}]})),
                                    "target": "run"},
        "diverged-judge-paths": {"files": run_dir(seal([control(), JUDGE, COMPLETE]),
                                                  judge_plan.replace('"b.md"', '"c.md"')), "target": "run"},
        "prose-edit-is-not-divergence": {"files": run_dir(seal(PASSED), sprint([{**C1, "assert": "reworded"}],
                                                                               brief="different brief")),
                                         "target": "run"},
        "sprint-flag-diverged": bare(seal(PASSED), "--sprint", "{input}/sprint.json", files={"sprint.json": changed}),
        "sprint-flag-overrides-discovery": {"files": {**run_dir(seal(PASSED), plan), "other.json": changed},
                                            "target": "run", "verify": ["--sprint", "{input}/other.json"]},
        "sprint-discovered-invalid": {"files": run_dir(seal(PASSED), "{broken"), "target": "run"},
        **invalid_sprints(),
        "legacy-bare": bare(seal(legacy, legacy=True)),
        "legacy-unverified": bare(seal(legacy, legacy=True), "--sprint", "{input}/sprint.json",
                                  files={"sprint.json": plan}),
        "legacy-added": bare(seal(legacy, legacy=True), "--sprint", "{input}/sprint.json",
                             files={"sprint.json": sprint([C1, {"id": "C2", "cmd": "false"}])}),
        "legacy-removed": bare(seal(legacy, legacy=True), "--sprint", "{input}/sprint.json",
                               files={"sprint.json": sprint([])}),
        "legacy-unverified-truncated": bare(seal(legacy[:1], legacy=True), "--sprint", "{input}/sprint.json",
                                            files={"sprint.json": plan}),
        **unusable_records(),
        "control-advisory-verdict": bare(seal([control(verdict="advisory"), COMPLETE])),
        "control-fail-precedence": bare(seal(precedence)),
        "control-fail-diverged": bare(seal(precedence), "--sprint", "{input}/sprint.json",
                                      files={"sprint.json": sprint([{**C1, "cmd": "false"}])}),
        "control-fail-tampered": bare(tampered, "--sprint", "{input}/sprint.json", files={"sprint.json": "{broken"}),
        "control-unavailable-command": bare(seal([control(verdict="fail", graded_by="unavailable(invalid-command)"),
                                                  COMPLETE])),
        "escalated": bare(seal([control(), ESCALATE])),
        "oracle-drift": bare(seal([control(), control(event="regression-item", oracle=sha("test -f f1")), COMPLETE])),
        "oracle-changed": bare(seal([control(verdict="fail", oracle=sha("false")), control(), COMPLETE])),
        "no-controls-empty": bare(b""),
        "no-controls-judge-only": bare(seal([JUDGE, COMPLETE])),
        "no-controls-regression-only": bare(seal([control(event="regression-item"), COMPLETE])),
        "missing-ledger": {"files": {"notes.txt": "no ledger here\n"}, "target": "absent.jsonl"},
        "missing-dir-ledger": {"files": {"run/notes.txt": "no ledger here\n"}, "target": "run"},
        **unsigned_suffixes(),
        **sealed_ambiguity(),
        **modes(),
        **problems_and_cost(),
    }


def generate():
    out = GOLDEN / "audit"
    reset(out)
    # packages/relay ignores .relay-state/ (runtime state); the run-directory inputs here are goldens.
    write_bytes(out / ".gitignore", b"!.relay-state/\n")
    for name, case in cases().items():
        directory = out / name
        inputs = directory / "input"
        for path, data in case["files"].items():
            write_bytes(inputs / path, data if isinstance(data, bytes) else data.encode())
        if not case["files"]:
            inputs.mkdir(parents=True)
        prefix = rel(inputs)
        target = f"{prefix}/{case['target']}"
        verify = [arg.replace("{input}", prefix) for arg in case.get("verify", [])]
        chmod = case.get("chmod", {})
        key = case.get("key")
        write_json(directory / "case.json", {"target": target, "verify": verify, "key": key,
                                             "chmod": {f"{prefix}/{path}": mode for path, mode in chmod.items()}})
        for path, mode in chmod.items():
            (inputs / path).chmod(int(mode, 8))
        try:
            record_audit(directory, target, verify, key=key)
        finally:
            for path in chmod:
                (inputs / path).chmod(0o644)


def main():
    tmp = start()
    try:
        generate()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()

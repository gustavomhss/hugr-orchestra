#!/usr/bin/env python3
"""Goldens for `bin/relay-arm-hook.sh` (G2, dev-only).

    python3 arm.py            regenerate test/golden/arm/
    python3 arm.py --verify   regenerate into a scratch directory and compare byte for byte

The runner, its determinism rules and the layout conventions live in check.py. Scenario names start with the
FORMAT.md exit path they were written for; `parity-*` scenarios pin oracle behaviour the TS arm is expected to
declare in PARITY-EXCEPTIONS.md (hook variables visible to checks, cwd-relative globbing of judge paths).
"""
import sys

from check import control, main, wp

MARK = {"type": "user", "content": "RELAY-ARM:tok"}
META = {"workdir": "<workdir>"}
SEED = [{"message": "seed", "files": {"seed.txt": "seed\n"}}]
HELD = {".run.lock/owner": "another evaluator"}
W1 = {"agentID": "worker-1"}


def a(name, covers, sprint, fires, expect=None, meta=META, **extra):
    case = {"name": name, "covers": covers}
    if sprint is not None:
        case["sprint"] = sprint
    if meta is not None:
        case["meta"] = meta
    return {**case, **extra, "fires": fires, "expect": expect or {}}


def plan(*wps, **fields):
    return {**fields, "work_packages": list(wps)}


def passing(wid, **fields):
    return wp(wid, control(f"{wid}-ok", "true"), **fields)


def needs(wid, path, **fields):
    return wp(wid, control(f"{wid}-file", f"test -f {path}"), **fields)


def usage(inp, out, cr=0, cw=0):
    return {"type": "assistant", "message": {"usage": {
        "input_tokens": inp, "output_tokens": out, "cache_read_input_tokens": cr, "cache_creation_input_tokens": cw}}}


def claim(text):
    return {"type": "assistant", "content": f"I could not finish.\nRELAY-BLOCKED: {text}"}


def blocked(*events, **more):
    return {"exit": 0, "block": True, **({"events": list(events)} if events else {}), **more}


def silent(*events, **more):
    return {"exit": 0, "silent": True, "events": list(events), **more}


FAIL_ONE = plan(needs("A", "done", instructions="create done"), retry_budget=3)
PASS_THREE = plan(passing("A"), passing("B"), passing("C"), retry_budget=3)
PARKED = {"state": "awaiting-human", "position": "A", "counter": "1\n"}
FAKE_JUDGE = """import sys
criterion = sys.argv[sys.argv.index("--criterion") + 1]
replies = {
    "exit-7": '{"verdict":"pass","backend":"stub"}',
    "broken": "{broken",
    "advisory-verdict": '{"verdict":"advisory","backend":"stub"}',
    "two-objects": '{"verdict":"pass","backend":"stub"}\\n{"verdict":"pass"}',
    "numeric-backend": '{"verdict":"pass","backend":17}',
    "api-pass": '{"verdict":"pass","reason":"ok","backend":"api"}',
    "api-fail": '{"verdict":"fail","reason":"no","backend":"api"}',
    "empty-backend": '{"verdict":"pass","backend":""}',
}
sys.stdout.write(replies[criterion])
raise SystemExit(7 if criterion == "exit-7" else 0)
"""

ARM_SCENARIOS = [
    # ---- A: which arm, and may this stop evaluate it ----
    a("a1-no-token-no-marker", ["A1"], FAIL_ONE,
      [{"transcript": [{"type": "user", "content": "plain subagent"}]}, {}],
      {0: silent(files={"tr_cursor": None, "position": None}), 1: silent()},
      env={"RELAY_ARM_TOKEN": ""}),
    a("a2-several-markers", ["A2"], FAIL_ONE,
      [{"transcript": [MARK, {"type": "assistant", "content": "also RELAY-ARM:other"}]}],
      {0: {"exit": 0, "stdout": None, "events": [], "stderr_has": ["names 2 different arms"]}},
      env={"RELAY_ARM_TOKEN": ""}),
    a("a2-one-marker-repeated", [], plan(passing("A")),
      [{"transcript": [MARK, {"type": "assistant", "content": "quoting RELAY-ARM:tok again"}]}],
      {0: silent("checklist-item", "sprint-complete", files={"state": "complete", "tr_cursor": "2"})},
      env={"RELAY_ARM_TOKEN": ""}),
    a("a3-dot-token", ["A3"], FAIL_ONE, [{}], {0: silent(files={"position": None})},
      env={"RELAY_ARM_TOKEN": "."}),
    a("a3-traversal-token", ["A3"], FAIL_ONE, [{}], {0: silent(files={"position": None})},
      env={"RELAY_ARM_TOKEN": "../tok"}),
    a("a4-unknown-token", ["A4"], FAIL_ONE, [W1], {0: silent(files={"agent_id": None})},
      env={"RELAY_ARM_TOKEN": "missing"}),
    a("a4-no-sprint", ["A4"], None, [W1], {0: silent(files={"agent_id": None})}),
    a("a5-run-lock-held", ["A5"], FAIL_ONE, [{**W1, "transcript": [MARK, usage(5, 1)]}],
      {0: {"exit": 3, "stdout": None, "events": [], "stderr_has": ["another evaluation holds <root>/arms/tok/.run.lock"],
           "files": {"agent_id": None, "tr_cursor": None, "entered_at": None}}},
      prestate=HELD),
    a("a5-run-lock-held-parked-release", ["A5"], FAIL_ONE, [{**W1, "transcript": [MARK]}],
      {0: {"exit": 3, "stdout": None, "events": [],
           "files": {"release": "GS investigated", "state": "awaiting-human", "agent_id": "other-worker"}}},
      prestate={**PARKED, "retry_A": "1\n", "release": "GS investigated", "agent_id": "other-worker", **HELD}),
    a("a6-agent-binding", ["A6"], FAIL_ONE, [W1, {"agentID": "worker-2"}, {}],
      {0: blocked("checklist-item", "gate-fail", files={"agent_id": "worker-1"}),
       1: {"exit": 0, "stdout": None, "events": [], "stderr_has": ["opened by agent worker-1 and this stop is from worker-2"],
           "files": {"retry_A": "1\n"}},
       2: blocked("gate-fail-repeat", files={"agent_id": "worker-1", "retry_A": "2\n"})}),

    # ---- B: position and disposition ----
    a("b1-migrate-counter", ["B1"], plan(passing("A"), needs("B", "b.txt", macro="m"), passing("C"), gen=3),
      [{}], {0: blocked("checklist-item", "gate-fail", files={"position": "m.B", "counter": "1\n", "retry_B": "1\n"})},
      prestate={"counter": "1\n"}),
    a("b1-migrate-missing-counter", ["B1"], plan(passing("A"), passing("B")), [{}],
      {0: blocked("checklist-item", "advance-reveal", files={"position": "B", "counter": "1\n"})}),
    a("b2-counter-past-end", ["B2"], plan(passing("A"), passing("B", macro="m")), [{}],
      {0: silent(files={"position": "m.B", "state": "complete", "counter": "5\n"})},
      prestate={"counter": "5\n"}),
    a("b3-empty-plan", ["B3"], plan(), [{}], {0: silent(files={"position": "?", "state": "complete"})}),
    a("b4-already-complete", ["B4"], FAIL_ONE, [{"transcript": [MARK, usage(3, 2)]}],
      {0: silent(files={"state": "complete", "tr_cursor": "2", "entered_at": "1700000000", "preflight": ""})},
      prestate={"position": "A", "state": "complete", "counter": "1\n"}),
    a("b1-migration-keeps-disposition", ["B1", "B5"],
      plan(wp("literal\n", control("actual", "printf actual >> executed; false"), macro="macro\n")),
      [{}], {0: silent(files={"position": "macro\n.literal\n", "state": "awaiting-human"})},
      prestate={"counter": "0\n", "state": "awaiting-human"}),
    a("b5-parked-no-release", ["B5"], FAIL_ONE, [{}, {}], {0: silent(), 1: silent(files={"state": "awaiting-human"})},
      prestate={**PARKED, "retry_A": "3\n"}),
    a("b5-legacy-escalated", ["B5"], FAIL_ONE, [{}], {0: silent(files={"state": "escalated"})},
      prestate={**PARKED, "state": "escalated"}),
    a("b6-blank-release", ["B6"], FAIL_ONE, [{"release": "\t\r\n \t"}, {"release": "\u000b\u000c"}, {"release": ""}],
      {0: {"exit": 0, "stdout": None, "events": [], "stderr_has": ["a release must say who and why"],
           "files": {"release": "\t\r\n \t", "state": "awaiting-human"}},
       1: {"exit": 0, "stdout": None, "events": [], "files": {"release": "\u000b\u000c"}},
       2: {"exit": 0, "stdout": None, "events": [], "files": {"release": ""}}},
      prestate={**PARKED, "retry_A": "3\n"}),
    a("b7-release-resumes-same-gate", ["B7"], FAIL_ONE, [{"release": "  owner:\r\n retry after fixture fix  \n"}, {}],
      {0: blocked("human-release", "checklist-item", "gate-fail",
                  entries=[{"event": "human-release", "reason": "owner:  retry after fixture fix", "wp": "A"},
                           {"event": "gate-fail", "retry": 1}],
                  reason_has=["is NOT satisfied"],
                  files={"release": None, "state": "active", "counter": "0\n", "retry_A": "1\n", "repeat_A": "0",
                         "blocked_A": None, "reg_retry": None}),
       1: blocked("gate-fail-repeat", files={"retry_A": "2\n"})},
      prestate={**PARKED, "retry_A": "3\n", "round_A": "old-round", "repeat_A": "2", "blocked_A": "old-claim",
                "reg_retry": "1\n"}),
    a("b7-release-then-pass", ["B7"], FAIL_ONE, [{"release": "GS: fixture repaired", "tree": {"done": "yes\n"}}],
      {0: silent("human-release", "checklist-item", "sprint-complete",
                 files={"release": None, "state": "complete", "retry_A": None, "counter": "1\n"})},
      prestate={**PARKED, "retry_A": "3\n"}),
    a("b7-release-uses-resolved-id", ["B7"], plan(
        wp("target", control("actual", "false"), macro="scope"), passing("sibling")),
      [{"release": "owner: retry"}],
      {0: blocked("human-release", "checklist-item", "gate-fail",
                  files={"position": "scope.target", "retry_target": "1\n", "retry_0": None,
                         "base_target": "kept-base"})},
      prestate={"state": "awaiting-human", "position": "scope.target", "counter": "2\n", "retry_target": "3\n",
                "retry_0": "3\n", "base_target": "kept-base"}),
    a("b8-suffix-position", ["B8"], plan(passing("A"), passing("beta")), [{}],
      {0: silent("checklist-item", "sprint-complete", files={"position": "beta", "counter": "2\n"})},
      prestate={"position": "build.beta", "counter": "1\n"}),
    a("b8-trailing-lf-position", ["B8"], plan(wp("target", control("actual", "false"))), [{}],
      {0: blocked("checklist-item", "gate-fail", files={"position": "target", "retry_target": "1\n"})},
      prestate={"position": "target\n\n"}),
    a("b8-literal-cr-position", ["B8"], plan(wp("target\r", control("actual", "false")), passing("target")), [{}],
      {0: blocked("checklist-item", "gate-fail", entries=[{"event": "gate-fail", "wp": "target\r"}],
                  files={"position": "target\r", "retry_target_": "1\n"})},
      prestate={"position": "target\r\n"}),
    a("b8-raw-position-wins", ["B8"], plan(
        wp("target\n", control("actual", "printf actual >> selected; false"), macro="scope"),
        wp("scope.target", control("sibling", "printf sibling >> wrong; true")), retry_budget=1),
      [{}], {0: blocked("checklist-item", "gate-fail", files={"position": "scope.target\n", "retry_target_": "1\n"})},
      prestate={"position": "scope.target\n", "counter": "0\n"}),
    a("b8-v1-bare-id", ["B8"], plan(needs("A", "a.txt", macro="m"), passing("B", macro="m")), [{}],
      {0: blocked("checklist-item", "gate-fail", files={"position": "m.A"})},
      prestate={"position": "A"}),
    a("b9-position-lost", ["B9"], plan(passing("A"), passing("B"), gen=4), [{}, {}],
      {0: {"exit": 0, "stdout": None, "events": ["position-lost"], "entries": [{"wp": "missing", "i": -1, "gen": 4}],
           "stderr_has": ["positioned at missing, which no longer exists"], "files": {"position": "missing"}},
       1: {"exit": 0, "events": ["position-lost"]}},
      prestate={"position": "missing", "release": "kept until repaired"}),
    a("b10-invalid-id-migration", ["B10"], plan({"id": 17, "checklist": [control("bad", "printf bad >> executed")]}),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "files": {"position": None}}},
      prestate={"counter": "0\n", "state": "active"}),
    a("b10-empty-id", ["B10"], plan({"id": "", "checklist": [control("bad", "printf bad >> executed")]}),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["invalid id"]}},
      prestate={"counter": "0\n"}),
    a("b10-nul-macro", ["B10"], plan(wp("A", control("bad", "printf bad >> executed"), macro="scope\u0000")),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["invalid macro"], "files": {"position": "A"}}},
      prestate={"position": "A", "counter": "0\n"}),
    a("b10-nul-position", ["B10"], plan(passing("target")), [{}],
      {0: {"exit": 1, "stdout": None, "events": [], "files": {"position": "target\u0000\n"}}},
      prestate={"position": "target\u0000\n", "counter": "0\n"}),

    # ---- C: kinds and the block-cap preflight ----
    a("c1-unknown-kind-human", ["C1"], plan(passing("ask", kind="human"), passing("B")), [{}, {}],
      {0: {"exit": 0, "stdout": None, "events": ["unknown-kind"], "entries": [{"kind": "human", "wp": "ask"}],
           "stderr_has": ['declares kind "human" at ask']},
       1: {"exit": 0, "events": ["unknown-kind"]}}),
    a("c1-unknown-kind-typo", ["C1"], plan(passing("wp1", kind="excute", macro="m"), passing("wp2")), [{}],
      {0: {"exit": 0, "stdout": None, "events": ["unknown-kind"], "entries": [{"wp": "wp1"}],
           "files": {"position": "m.wp1"}}},
      prestate={"position": "m.wp1"}),
    a("c2-cap-risk", ["C2", "H3"], PASS_THREE, [{}, {}, {}],
      {0: blocked("cap-risk", "checklist-item", "advance-reveal",
                  entries=[{"event": "cap-risk", "cap": 2, "chain_min": 4, "work_packages": 3}],
                  reason_has=["Relay: this session's hook block cap is 2, below the implemented conservative warning "
                              "estimate of 4 blocks for 3 gates.", "Relay gate 'A' passed. Next gate: B."]),
       1: blocked("checklist-item", "regression-item", "advance-reveal", reason_lacks=["block cap"]),
       2: silent("checklist-item", "regression-item", "regression-item", "sprint-complete")},
      env={"CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "2"}),
    a("c2-junk-cap-reads-default", ["C2", "I1"], plan(needs("W1", "w1.txt"), *[passing(f"W{n}") for n in range(2, 9)]),
      [{}], {0: blocked("cap-risk", "checklist-item", "gate-fail", entries=[{"cap": 8, "chain_min": 9}],
                        reason_has=["block cap is 8", "Relay gate 'W1' is NOT satisfied."], files={"preflight": ""})},
      env={"CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "junk"}),
    a("c2-cap-fits", ["C2"], PASS_THREE, [{}],
      {0: blocked("checklist-item", "advance-reveal", reason_lacks=["block cap"], files={"preflight": ""})},
      env={"CLAUDE_CODE_STOP_HOOK_BLOCK_CAP": "4"}),

    # ---- D: inject ----
    a("d1-inject-inline", ["D1"], plan({"id": "seed", "kind": "inject", "text": "Task: add a token-bucket limiter.\n\n"},
                                       passing("wp2")),
      [{}], {0: blocked("inject", "advance-reveal",
                        entries=[{"event": "inject", "file": "(inline)"}, {"event": "advance-reveal", "kind": "inject"}],
                        reason_has=["Task: add a token-bucket limiter.\n\nRelay gate 'seed' passed. Next gate: wp2."],
                        files={"position": "wp2"})}),
    a("d2-inject-file", ["D2"], plan({"id": "load", "kind": "inject", "file": "protocol.md", "text": "INLINE-MARKER"},
                                     passing("wp2", macro="m"), macros=[{"id": "m", "instructions": "M-RULES"}]),
      [{}], {0: blocked("inject", "advance-reveal", entries=[{"event": "inject", "file": "protocol.md"}],
                        reason_has=["--- protocol.md ---\nMUST: every claim carries its evidence.\nMUST: no silent caps."
                                    "\n--- end protocol.md ---\n\nRelay gate 'load' passed. Next gate: wp2. M-RULES\ndo wp2"],
                        reason_lacks=["INLINE-MARKER"], files={"macro_m": ""})},
      tree={"protocol.md": "MUST: every claim carries its evidence.\nMUST: no silent caps.\n\n"}),
    a("d2-inject-still-gated", ["D2", "I1"], plan(
        {"id": "load", "kind": "inject", "file": "p.md", "instructions": "",
         "checklist": [control("c1", "test -f done", **{"assert": "done exists"})]}, passing("wp2")),
      [{}], {0: blocked("inject", "checklist-item", "gate-fail", entries=[{"event": "checklist-item", "kind": "inject"}],
                        reason_lacks=["--- p.md ---", "Instructions:"], files={"position": "load"})},
      tree={"p.md": "x\n"}),
    a("d3-inject-missing-file", ["D3"], plan({"id": "load", "kind": "inject", "file": "missing.md"}, passing("wp2")),
      [{}], {0: {"exit": 0, "stdout": None, "events": ["inject-missing"], "entries": [{"file": "missing.md"}],
                 "stderr_has": ['cannot inject "missing.md" at load', "does not exist under <root>/work"],
                 "files": {"position": "load"}}}),
    a("d3-inject-nothing-declared", ["D3"], plan({"id": "seed", "kind": "inject"}, passing("wp2")),
      [{}], {0: {"exit": 0, "stdout": None, "events": ["inject-missing"], "entries": [{"file": ""}],
                 "stderr_has": ["declares neither a file nor inline text"]}}),

    # ---- E: the checklist ----
    *[a(f"e1-checklist-{label}", ["E1"], plan({"id": "A", "checklist": checklist}, passing("B")), [{}],
        {0: {"exit": 1, "stdout": None, "events": [], "files": {"position": "A"}}})
      for label, checklist in [("object", {}), ("string", "true"), ("number", 7)]],
    a("e1-invalid-control-id", ["E1"], plan(wp("A", control("first", "printf first >> ran"), {"id": "", "cmd": "true"})),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["checklist[1] has invalid id"]}}),
    a("e1-invalid-assertion", ["E1"], plan(wp("A", control("report", "true", **{"assert": 17}))),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["invalid assertion"]}}),
    a("e2-invalid-command", ["E2", "I1"], plan(wp("A", control("NUM", 17), control("NUL", "true\u0000false"),
                                                  control("OBJ", {"cmd": "true"}), control("OK", "true"))),
      [{}], {0: blocked("checklist-item", "checklist-item", "checklist-item", "checklist-item", "gate-fail",
                        entries=[{"item": "NUM", "verdict": "fail", "graded_by": "unavailable(invalid-command)",
                                  "oracle": ""}, {"event": "gate-fail", "fails": "; NUM; NUL; OBJ"}])}),
    a("e3-judge-unavailable", ["E3"], plan(wp("A",
        {"id": "NO-ORACLE"},
        control("EMPTY-BOTH", "", judge=""),
        control("BAD-SCOPE", judge="x", paths="a.md"),
        control("NUL-SCOPE", judge="x", paths=["bad\u0000path"], blocking=True),
        control("NO-DIFF-BLOCKING", judge="x", diff=True, blocking=True, paths=["a.md"]),
        control("NO-DIFF-ADVISORY", judge="x", diff=True))),
      [{}], {0: blocked("checklist-item", "checklist-item", "checklist-item", "checklist-item", "checklist-item",
                        "checklist-item", "gate-fail",
                        entries=[{"item": "NO-ORACLE", "graded_by": "judge:unavailable(invalid-criterion)"},
                                 {"item": "BAD-SCOPE", "graded_by": "judge:unavailable(invalid-scope)"},
                                 {"item": "NO-DIFF-BLOCKING", "graded_by": "judge:unavailable(no-diff)", "scope": "a.md"},
                                 {"fails": "; NO-ORACLE; EMPTY-BOTH; BAD-SCOPE; NUL-SCOPE; NO-DIFF-BLOCKING"}])},
      tree={"a.md": "artifact\n"}),
    a("e4-judge-stub", ["E4", "I2"], plan(wp("A",
        control("BLOCK-PASS", judge="ok", context="ok.md", paths=["ok.md"], blocking=True),
        control("BLOCK-FAIL", judge="bad", context=["bad.md"], blocking=True),
        control("ADVISE-FAIL", judge="bad", context="bad.md"),
        control("SCOPE-ABSENT", judge="ok", context="ok.md", paths=["ok.md", "gone.md"]),
        control("NO-CONTEXT", judge="nothing", blocking=True))),
      [{}, {"tree": {"bad.md": "RELAY_JUDGE_OK\n"}}],
      {0: blocked(entries=[{"item": "BLOCK-PASS", "verdict": "pass", "graded_by": "judge:stub(non-independent)",
                            "scope": "ok.md"},
                           {"item": "ADVISE-FAIL", "verdict": "fail"},
                           {"event": "gate-fail", "fails": "; BLOCK-FAIL; NO-CONTEXT"}]),
       1: blocked(entries=[{"event": "gate-fail", "fails": "; NO-CONTEXT", "retry": 2}],
                  reason_has=["Relay gate 'A' still failing. Fix these: ; NO-CONTEXT"])},
      tree={"ok.md": "RELAY_JUDGE_OK\n", "bad.md": "no marker\n"}),
    a("e4-judge-responses", ["E4"], plan(wp("A",
        control("EXIT-BLOCKING", judge="exit-7", blocking=True),
        control("EXIT-ADVISORY", judge="exit-7"),
        control("BROKEN", judge="broken", blocking=True),
        control("ADVISORY-VERDICT", judge="advisory-verdict", blocking=True),
        control("TWO-OBJECTS", judge="two-objects", blocking=True),
        control("NUMERIC-BACKEND", judge="numeric-backend", blocking=True),
        control("API-PASS", judge="api-pass", blocking=True),
        control("API-FAIL-ADVISORY", judge="api-fail"),
        control("EMPTY-BACKEND", judge="empty-backend", blocking=True))),
      [{}], {0: blocked(entries=[
          {"item": "EXIT-BLOCKING", "graded_by": "judge:unavailable(exit-7)(non-independent)", "verdict": "fail"},
          {"item": "EXIT-ADVISORY", "graded_by": "judge:unavailable(exit-7)(non-independent)"},
          {"item": "BROKEN", "graded_by": "judge:unavailable(invalid-response)(non-independent)"},
          {"item": "NUMERIC-BACKEND", "graded_by": "judge:unavailable(invalid-response)(non-independent)"},
          {"item": "API-PASS", "graded_by": "judge:api(non-independent)", "verdict": "pass"},
          {"item": "EMPTY-BACKEND", "graded_by": "judge:judge(non-independent)", "verdict": "pass"},
          {"event": "gate-fail", "fails": "; EXIT-BLOCKING; BROKEN; ADVISORY-VERDICT; TWO-OBJECTS; NUMERIC-BACKEND"}])},
      tree={"judge.py": FAKE_JUDGE}, env={"RELAY_JUDGE": "judge.py"}),
    a("e4-judge-forced-fail", ["E4"], plan(wp("A", control("J", judge="ok", context="ok.md", blocking=True))),
      [{}], {0: blocked(entries=[{"item": "J", "verdict": "fail"}])},
      tree={"ok.md": "RELAY_JUDGE_OK\n"}, env={"RELAY_JUDGE_STUB": "fail"}),
    a("e4-judge-diff", ["E4"], plan(wp("A",
        control("DIFF-ALL", judge="change ok", diff=True, blocking=True),
        control("DIFF-NARROW", judge="seed only", diff=True, blocking=True, paths=["seed.txt"]))),
      [{}, {"tree": {"seed.txt": "seed\nRELAY_JUDGE_OK\n"}}],
      {0: blocked(entries=[{"item": "DIFF-ALL", "verdict": "pass"},
                           {"item": "DIFF-NARROW", "verdict": "fail", "scope": "seed.txt"},
                           {"event": "gate-fail", "fails": "; DIFF-NARROW"}]),
       1: silent("checklist-item", "checklist-item", "sprint-complete")},
      meta={**META, "base_ref": {"commit": 0}}, commits=SEED,
      tree={"seed.txt": "seed\nchanged\n", "result.md": "RELAY_JUDGE_OK\n"}),
    a("e5-host-check", ["E5"], plan(wp("A", control("permissions", host_check="permissions"))),
      [{}], {0: blocked(entries=[{"item": "permissions", "graded_by": "judge:unavailable(invalid-criterion)"}])}),

    # ---- F: regressions of accepted earlier work ----
    a("f1-regression-within-budget", ["F1", "I3"], plan(
        wp("A", control("stdin", "cat >/dev/null"), control("kept", "test -f kept")), passing("B"), retry_budget=3),
      [{}, {"tree": {"kept": None}}, {}, {"tree": {"kept": "restored\n"}}],
      {0: blocked("checklist-item", "checklist-item", "advance-reveal", files={"position": "B"}),
       1: blocked("checklist-item", "regression-item", "regression-item", "gate-fail",
                  entries=[{"event": "regression-item", "item": "kept", "verdict": "fail", "origin": "regression"},
                           {"event": "gate-fail", "reg": "; kept", "fails": "", "retry": 1}],
                  reason_has=["Relay: an earlier gate regressed — restore these before finishing: kept. "
                              "(Current gate 'B' is satisfied; this is a backslide in prior work.)"],
                  files={"reg_retry": "1\n", "retry_B": None}),
       2: blocked("gate-fail-repeat", entries=[{"retry": 2, "repeat": 1}], files={"reg_retry": "2\n"}),
       3: silent("checklist-item", "regression-item", "regression-item", "sprint-complete")},
      tree={"kept": "accepted\n"}),
    a("f1-regression-full-command", ["F1"], plan(
        wp("A", control("kept\nfull-id\n", "\ttrue\n# second line\n\ttest -f kept\n\n")), passing("B"), gen=7),
      [{}, {"tree": {"kept": None}}],
      {1: blocked("checklist-item", "regression-item", "gate-fail", reason_has=["kept\nfull-id\n"])},
      tree={"kept": "accepted\n"}),
    a("f2-regression-at-budget", ["F2"], plan(wp("A", control("kept", "test -f kept")), passing("B"), retry_budget=1),
      [{}, {"tree": {"kept": None}}, {}, {}],
      {1: blocked("checklist-item", "regression-item", "gate-fail"),
       2: silent("checklist-item", "regression-item", "escalate",
                 files={"state": "awaiting-human", "counter": "2\n", "position": "B", "reg_retry": "1\n"}),
       3: silent()},
      tree={"kept": "accepted\n"}),

    # ---- G: the agent's blocked claim ----
    a("g1-blocked-claim-honored", ["G1", "G2"], plan(needs("wp1", "f1"), passing("wp2"), retry_budget=5),
      [{"transcript": [MARK, claim("the API key is missing")]},
       {"transcript": [MARK, claim("the API key is missing"), claim("the API key is missing")]}],
      {0: blocked("blocked-claim", "checklist-item", "gate-fail",
                  entries=[{"event": "blocked-claim", "honored": True, "corroborated": "unavailable",
                            "graded_by": "judge:unavailable", "reason": "the API key is missing"}]),
       1: silent("blocked-claim", "checklist-item", "escalate", files={"state": "awaiting-human", "retry_wp1": "1\n"})}),
    a("g2-different-claim-does-not-accelerate", ["G1", "G2"], plan(needs("wp1", "f1"), passing("wp2"), retry_budget=5),
      [{"transcript": [MARK, claim("blocker one")]}, {"transcript": [MARK, claim("blocker two")]},
       {"transcript": [MARK, claim("blocker two")]}],
      {0: blocked("blocked-claim", "checklist-item", "gate-fail"),
       1: blocked("blocked-claim", "gate-fail-repeat"),
       2: silent("blocked-claim", "checklist-item", "escalate")}),
    a("g3-claim-on-passing-gate", ["G3"], plan(passing("wp1"), passing("wp2")),
      [{"transcript": [MARK, claim("nothing really")]}],
      {0: blocked("blocked-claim", "checklist-item", "advance-reveal",
                  entries=[{"event": "blocked-claim", "honored": False}], files={"blocked_wp1": None})}),
    a("g1-claim-corroborated", ["G1"], plan(needs("wp1", "f1"), passing("wp2")),
      [{"transcript": [MARK, claim("the fixture server is down")]}],
      {0: blocked("blocked-claim", "checklist-item", "gate-fail",
                  entries=[{"event": "blocked-claim", "corroborated": "pass",
                            "graded_by": "judge:stub(non-independent)"}])},
      meta={**META, "base_ref": {"commit": 0}}, commits=SEED, tree={"notes.md": "RELAY_JUDGE_OK server down\n"}),

    # ---- H: advancing ----
    a("h1-advance-macro-selfcheck-review", ["H1", "H3"], plan(
        passing("A"),
        passing("B", macro="m", kind="review", self_check=["Did you read the frozen artifact?", "Is each verdict evidenced?"]),
        passing("C", macro="m"),
        macros=[{"id": "m", "instructions": "M-PROTOCOL"}], gen=2),
      [{}, {}, {}],
      {0: blocked("checklist-item", "advance-reveal",
                  reason_has=["Relay gate 'A' passed. Next gate: B. M-PROTOCOL\ndo B\n\nBefore you finish this state, "
                              "be ready to answer:\n  - Did you read the frozen artifact?\n  - Is each verdict evidenced?"
                              "\n\nThis is a REVIEW state:"],
                  files={"position": "m.B", "macro_m": "", "counter": "1\n"}),
       1: blocked("checklist-item", "regression-item", "advance-reveal", reason_lacks=["M-PROTOCOL"],
                  entries=[{"event": "advance-reveal", "macro": "m", "kind": "review"}], files={"position": "m.C"}),
       2: silent("checklist-item", "regression-item", "regression-item", "sprint-complete", files={"state": "complete"})},
      commits=SEED),
    a("h2-compaction-at-six", ["H2"], plan(*[passing(f"W{n}") for n in range(1, 9)]), [{}],
      {0: blocked("checklist-item", "advance-reveal", "compaction-hint",
                  reason_has=["(checkpoint: 6 gates cleared — summarize progress and drop now-stale detail before "
                              "continuing)"], files={"position": "W7"})},
      prestate={"position": "W6", "counter": "5\n"}),
    a("h2-compaction-env", ["H2"], PASS_THREE, [{}, {}],
      {0: blocked("checklist-item", "advance-reveal", "compaction-hint", reason_has=["checkpoint: 1 gates cleared"]),
       1: blocked("checklist-item", "regression-item", "advance-reveal", "compaction-hint")},
      env={"RELAY_COMPACT_AFTER": "1"}),
    a("h3-complete", ["H3"], plan(passing("only", macro="m", kind="gate")), [W1],
      {0: silent("checklist-item", "sprint-complete", entries=[{"event": "sprint-complete", "macro": "m", "kind": "gate"}],
                 files={"state": "complete", "counter": "1\n", "position": "m.only"})}),
    a("h4-next-invalid-id", ["H4"], plan(wp("A", control("ran", "printf ran >> ran; true")), {"id": 17, "checklist": []}),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["work_packages[1] has invalid id"],
                 "files": {"position": "A", "counter": None}}}),
    a("h4-next-invalid-macro", ["H4"], plan(passing("A"), passing("B", macro=True)),
      [{}], {0: {"exit": 1, "stdout": None, "events": [], "stderr_has": ["work_packages[1] has invalid macro"]}}),

    # ---- I: failing ----
    a("i1-first-failure", ["I1"], FAIL_ONE, [{}],
      {0: blocked("checklist-item", "gate-fail", reason_has=[
          "Relay gate 'A' is NOT satisfied. Still failing:; A-file. Address these, then finish. Instructions: create done"],
          files={"retry_A": "1\n", "repeat_A": "0"})}),
    a("i1-first-failure-no-instructions", ["I1"], plan({"id": "A", "checklist": [control("c1", "false")]}), [{}],
      {0: blocked(reason_has=["Still failing:; c1. Address these, then finish."], reason_lacks=["Instructions"])}),
    a("i2-later-failure", ["I2"], plan(wp("A", control("c1", "test -f one"), control("c2", "test -f two"))),
      [{}, {"tree": {"one": "1\n"}}],
      {1: blocked("checklist-item", "checklist-item", "gate-fail",
                  reason_has=["Relay gate 'A' still failing. Fix these: ; c2"], files={"retry_A": "2\n"})}),
    a("i3-identical-round-collapses", ["I3"], plan(needs("A", "done"), retry_budget=5), [{}, {}, {}],
      {0: blocked("checklist-item", "gate-fail"),
       1: blocked("gate-fail-repeat", entries=[{"repeat": 1, "retry": 2}], files={"repeat_A": "1"}),
       2: blocked("gate-fail-repeat", entries=[{"repeat": 2, "retry": 3}], files={"repeat_A": "2"})}),
    a("i4-budget-spent", ["I4", "B5"], plan(needs("A", "done"), retry_budget=2), [{}, {}, {}, {}],
      {2: silent("checklist-item", "escalate", entries=[{"event": "escalate", "retry": 2, "repeat": 2}],
                 files={"state": "awaiting-human", "counter": "1\n", "retry_A": "2\n"}),
       3: silent()}),
    a("i4-budget-zero", ["I4"], plan(needs("A", "done"), passing("B"), retry_budget=0), [{}],
      {0: silent("checklist-item", "escalate", entries=[{"retry": 0, "repeat": 0}],
                 files={"state": "awaiting-human", "counter": "2\n", "retry_A": None})}),

    # ---- J: cost and elapsed ----
    a("j1-cost-window", ["J1", "J2"], PASS_THREE,
      [{"transcript": [MARK, usage(100, 20, cr=500, cw=300), {"usage": {"input_tokens": 5, "output_tokens": 1}}]},
       {"transcript": [MARK, usage(100, 20, cr=500, cw=300), {"usage": {"input_tokens": 5, "output_tokens": 1}},
                       usage(7, 3)]},
       {"transcript": [MARK, usage(100, 20, cr=500, cw=300), {"usage": {"input_tokens": 5, "output_tokens": 1}},
                       usage(7, 3), {"type": "user", "content": "no usage here"}]}],
      {0: blocked(entries=[{"event": "advance-reveal", "cost": {"in": 105, "out": 21, "cache_read": 500,
                                                                 "cache_write": 300, "turns": 2}}],
                  files={"tr_cursor": "3", "entered_at": "1700000000"}),
       1: blocked(entries=[{"event": "advance-reveal", "elapsed_s": 60,
                            "cost": {"in": 7, "out": 3, "cache_read": 0, "cache_write": 0, "turns": 1}}]),
       2: silent("checklist-item", "regression-item", "regression-item", "sprint-complete",
                 entries=[{"cost": {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0, "turns": 0}}])}),
    a("j1-cost-absent-without-usage", ["J1"], PASS_THREE, [{"transcript": [MARK, {"type": "assistant", "content": "hi"}]}],
      {0: blocked(files={"tr_cursor": "2"})}),
    a("j1-cost-cursor-past-end", ["J1"], PASS_THREE, [{"transcript": [MARK, usage(9, 9)]}],
      {0: blocked(files={"tr_cursor": "2"})},
      prestate={"tr_cursor": "9"}),
    a("j1-cost-empty-window", ["J1"], PASS_THREE, [{"transcript": [MARK, usage(9, 9)]}],
      {0: blocked(entries=[{"event": "advance-reveal", "cost": {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0,
                                                                 "turns": 0}}])},
      prestate={"tr_cursor": "2"}),
    a("j2-elapsed", ["J2"], PASS_THREE, [{"at": 1700000000}, {"at": 1700000137}, {"at": 1700000200}],
      {1: blocked(entries=[{"event": "advance-reveal", "elapsed_s": 137}], files={"entered_at": "1700000137"}),
       2: silent("checklist-item", "regression-item", "regression-item", "sprint-complete",
                 entries=[{"event": "sprint-complete", "elapsed_s": 63}])}),
    a("j2-entered-at-prestate", ["J2"], PASS_THREE, [{}],
      {0: blocked(entries=[{"event": "advance-reveal", "elapsed_s": 10}])},
      prestate={"entered_at": "1699999990"}),

    # ---- The record itself ----
    a("ledger-keyed-chain", ["H3", "I1"], plan(passing("A"), needs("B", "b.txt"), gen=9),
      [{}, {}, {"tree": {"b.txt": "b\n"}}],
      {0: blocked(entries=[{"mac": "hmac-sha256", "gen": 9, "seq": 0, "prev": "GENESIS"}]),
       2: silent("checklist-item", "regression-item", "sprint-complete")},
      env={"RELAY_LEDGER_KEY": "golden-ledger-key"}),
    a("ledger-provenance", ["I1"], plan(wp("A",
        control("explicit", "true", origin="injected:lead"),
        control("policy", "true", policy="base-policy"),
        control("plain", "false", **{"assert": "plain fails"}))),
      [{}], {0: blocked(entries=[{"item": "explicit", "origin": "injected:lead"},
                                 {"item": "policy", "origin": "policy:base-policy"},
                                 {"item": "plain", "origin": "sprint", "assert": "plain fails"}])}),
    a("identity-lossless-advance", ["B1", "H1"], plan(
        wp("first\n", control("first-control", "true"), macro="scope\n"),
        wp("target\r\n", control("next-control", "false"), macro="next\n"),
        wp("target\r", control("wrong", "true")), retry_budget=1),
      [{}, {}],
      {0: blocked("checklist-item", "advance-reveal",
                  files={"position": "next\n.target\r\n", "counter": "1\n", "macro_next_": ""}),
       1: blocked("checklist-item", "regression-item", "gate-fail",
                  files={"position": "next\n.target\r\n", "retry_target__": "1\n"})},
      prestate={"counter": "0\n"}, commits=SEED),

    # ---- Oracle behaviour the TS arm is expected to declare as a parity exception ----
    a("parity-hook-variables-visible", [], plan(wp("A",
        control("sees-token", 'test "$token" = tok'), control("sees-arm-dir", 'test -f "$ARM/sprint.json"'),
        control("sees-index", 'test "$i" = 0'))),
      [{}], {0: silent("checklist-item", "checklist-item", "checklist-item", "sprint-complete")}),
    a("parity-judge-paths-glob-from-cwd", [], plan(wp("A",
        control("GLOB", judge="docs", context="a.md", paths=["*.md"]),
        control("PARAM", judge="docs", context="${wp_dir}/x.md", paths=["${wp_dir}/x.md"]))),
      [{}], {0: silent("checklist-item", "checklist-item", "sprint-complete",
                       entries=[{"item": "GLOB", "scope": "*.md"}, {"item": "PARAM", "scope": "${wp_dir}/x.md"}])},
      tree={"a.md": "RELAY_JUDGE_OK a\n", "b.md": "b\n", "docs/x.md": "RELAY_JUDGE_OK x\n"}, env={"wp_dir": "docs"}),
]


if __name__ == "__main__":
    sys.exit(main("arm", ARM_SCENARIOS))

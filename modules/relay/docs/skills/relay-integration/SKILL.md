---
name: relay-integration
description: Use when wiring Relay into Claude hooks, a portable agent loop, or the HTTP daemon, including state, judge, and verification contracts.
---

# Relay integration

Audience: agents. Status: current.

## Trigger

Use when wiring gate outcomes into harness continuation. Choose one driver per run; shared checklist core does not imply identical state machines.

## Read first

- [Arm hook](../../../bin/relay-arm-hook.sh), [CLI](../../../bin/relay-gate), [shared core](../../../lib/relay-gate.sh).
- [Daemon](../../../bin/relay-daemon.py), [judge](../../../benchmark/judge.py), [verifier](../../../bin/relay).
- [CLI tests](../../../tests/test_gate_cli.py), [command transport](../../../tests/test_command_transport.py), [ARM runtime](../../../tests/test_arm_runtime.py), [release tests](../../../tests/test_await_human.py), [binding tests](../../../tests/test_arm_binding.py), [daemon tests](../../../tests/test_daemon.py), [ask tests](../../../tests/test_ask.py), and [audit runtime](../../../tests/test_audit_runtime.py).
- [Authoring reference](../../../docs/authoring-sprints.md); use source for executable behavior.

## Ownership

- Harness owns dispatch, the first WP prompt, workdir, environment, state isolation, and escalation handling.
- Gate owns checklist evaluation and trace append; verifier owns integrity and recorded-control reporting.
- Judge supplies non-independent semantic opinions. It never becomes a deterministic oracle.
- Installed authoring uses native Server `RelayDocumentHandler`, `RelayPublishHandler` and
  `RelayHookHandler`, reached through App's generated Client adapter. The Python authoring host is
  retained for direct regression imports, not UI startup; see [authoring](../relay-authoring/SKILL.md)
  and the [authoring API](../../../docs/authoring-api.md) for exact source routing.

## Contracts

| Surface | Binding and result | State |
|---|---|---|
| Claude `SubagentStop` arm | `RELAY-ARM:<token>` in that subagent's opening prompt/transcript; hook emits `decision:block` or nothing; busy exits 3 with stderr only | `$RELAY_ARMS_DIR/<token>` |
| Claude standalone `Stop` arm | Register the same arm hook under `Stop`; explicitly set `RELAY_ARM_TOKEN` for this session | Same per-token arm layout |
| Portable CLI | `relay-gate eval` with explicit paths; JSON outcome plus process exit | Caller-supplied `--state` |
| HTTP | `POST /gate/eval` invokes that CLI; JSON response plus HTTP status | Host-local `state_dir` |

The benchmark's [Stop hook](../../../benchmark/relay_hook.sh) is a separate single-runner driver using `RELAY_RUN_DIR`, `RELAY_SPRINT`, `RELAY_GATE`, and `<run>/.relay-state`.
The HTTP row above describes the separately owned standalone daemon and its regression callers;
it is not the installed authoring transport. Native public workflow checks return 403
`maestro-execution-required`; hook installation uses the native published-snapshot binding.
See [runtime disposition](../../../docs/python-runtime-disposition.md). Missing native profile tools
remain unavailable even when corresponding standalone Python tools exist.

Common sprint shape; use globally unique WP and checklist IDs and substantive controls:

```json
{
  "brief": "Repair the implementation without weakening tests.", "retry_budget": 3,
  "work_packages": [{"id": "wp1-green", "title": "Unit suite", "instructions": "Fix implementation; preserve tests.", "checklist": [{"id": "C-UNIT", "assert": "unit tests pass", "cmd": "python3 -m pytest tests/unit -q"}]}]
}
```

`cmd` runs through Bash `eval` in workdir; exit 0 passes, nonzero fails. Controls are trusted executable input.
Compact JSON records and exact decoding preserve tabs and all LF, including trailing LF, in commands
and checklist IDs. Current checklist evaluation, ARM/CLI checklist regression, and CLI/benchmark
current/earlier DoD run complete shell programs. Single-line commands are not a transport requirement;
use explicit status propagation when every constituent command must succeed. NUL is unsupported.
`judge` replaces `cmd` for semantic items; `context` is a relative file string or list, and
`blocking:true` makes a returned `fail` block. Nonzero judge exits and malformed/missing response
JSON record unavailable `fail`, blocking when configured. A valid response is exactly one JSON
object with `verdict: pass|fail`. Pair semantic checks with deterministic controls.
`paths` narrows a `diff:true` judge's computed diff; paths alone do not load files as judge context.
Context/paths expand `${name}` from environment under workdir; oracle hashes retain raw complete
command or criterion plus raw space-joined paths, including LF, not expanded values.
Harness records CLI diff baseline in `<state>/base_ref` before work; arm's first baseline is
`meta.json.base_ref`, later entry captures HEAD.

| Driver | Position/retry files | Other evidence |
|---|---|---|
| Arm | `position` (WP ID or macro-qualified ID), `state`, derived `counter`, `retry_<safe-id>`, `reg_retry`, `.run.lock` | `sprint.json`, `meta.json`, `ledger.jsonl`, `relay.log`, round/repeat/blocked files |
| CLI | `counter` (array index, starts at 0), `retry_<index>`, `.run.lock` | `ledger.jsonl`, optional `base_ref` |
| Shared append | `.chain.lock` in ledger parent serializes append | `gen`, `prev`, `seq`, `mac`, `h` in each entry |

Arm `state` distinguishes `active`, `complete`, and `awaiting-human` (legacy `escalated` also parks).
ARM's run lock is acquired before agent-ID binding, release/state/retry updates, and transcript-cost
attribution; busy exit 3 leaves arm state and ledger unchanged. Exit cleanup removes only its owned
run lock and temporary round buffer. The shared append lock is a separate mechanism.
Required ARM/CLI/benchmark verdict/disposition appends are fatal before corresponding transition,
retry, or release publication. Earlier command effects/records may remain; no atomicity, rollback,
or fsync guarantee. ARM ancillary event appends and archives remain best-effort.
Arm regression reruns earlier deterministic checklist controls with recorded passes; CLI reruns every earlier checklist `cmd` and `dod[].cmd`, excluding judge-only controls.
CLI does not inject macro/self-check/review protocols or file payloads, or implement human kinds; harness owns these full-arm-FSM differences.

## Procedure

1. Resolve Relay root and dependencies in the gate host's environment:

   ```sh
   export RELAY_ROOT="$PWD"                 # run from this checkout's root
   export PATH="$RELAY_ROOT/bin:$PATH"
   command -v bash jq python3 shasum
   ```

   Provide standard shell tools, `git` for diff/baselines, `openssl` for HMAC, and project control dependencies
   (`python3 -m pytest` for controls). Runtime `bin/` Python tools (excluding doc tooling) use stdlib except the profile compiler's PyYAML.
   The documentation guard also needs MarkdownIt/PyYAML; use `requirements-dev.txt` for documentation dependencies.
2. Allocate separate work, state/arm, and corpus directories per experiment. Use absolute host-local paths.
   Set `RELAY_ARMS_DIR` and `RELAY_CORPUS_DIR` to isolated directories before firing hooks.
   Set `ARM` to the fresh `$RELAY_ARMS_DIR/run-a` token directory; write `sprint.json` and `meta.json`:

   ```json
   {"token":"run-a","label":"unit repair","workdir":"/absolute/work","base_ref":"<commit-before-first-wp>"}
   ```

   Replace the baseline with an actual commit when diff controls need it. Do not reuse tokens across agents.
3. For Claude subagents, merge this entry into project `.claude/settings.json`, then start a new session:

   ```json
   {"hooks":{"SubagentStop":[{"matcher":"","hooks":[{"type":"command","command":"/absolute/relay/bin/relay-arm-hook.sh"}]}]}}
   ```

   Opening prompt must contain exactly its own `RELAY-ARM:run-a`, sprint brief/map, and first WP instructions.
   Seed first macro protocol and self-check when used. You MUST mark that supplied macro entered before the first fire;
   initialize this marker only for a fresh arm, using the hook's sanitization:

   ```sh
   . "$RELAY_ROOT/lib/relay-gate.sh"
   macro_json=$(jq -c '.work_packages[0].macro' "$ARM/sprint.json") || exit 1
   relay_json_string macro "$macro_json" || exit 1
   if [ -n "$macro" ]; then
     safe=$(printf '%s' "$macro" | tr -c 'A-Za-z0-9._-' '_')
     : > "$ARM/macro_$safe"
   fi
   ```

   Hook prefers `agent_transcript_path`, falls back to `transcript_path`, and binds available `agent_id`.
   For standalone `claude -p`, change registration to `Stop` and launch with `RELAY_ARM_TOKEN=run-a`.
   Set `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0` to request uncapped harness behavior and suppress the cap-risk warning.
   Once per arm, preflight warns for nonzero cap below its implemented estimate `len(work_packages)+1`; invalid/unset cap uses 8.
   This is not a lower bound: final pass emits no block. Preflight neither refuses work nor changes the harness cap.
4. For a portable loop, deliver the first WP before evaluation. Capture expected nonzero dispositions explicitly:

   ```sh
   if body=$(relay-gate eval --sprint "$SPRINT" --workdir "$WORK" --state "$STATE"); then rc=0; else rc=$?; fi
   ```

   Parse JSON only after checking usable output. On advance, harness loads the next WP instructions.

   | CLI eval exit | Outcome | Harness action |
   |---|---|---|
   | 0 | `advance` / `complete` | Continue with `next` / finish and verify |
   | 1 | `gate-fail` | Repair listed failures; retry |
   | 2 | `escalate` | Stop automatic retries; surface unresolved work |
   | 3 | No JSON; busy lock | Inspect active evaluation; retry without treating it as a verdict |

   Other hard errors can also produce no JSON, including exit 1. `eval` remains counter-based and
   rejects check-only flags. CLI current ID/macro and next ID decode losslessly; `eval` prevalidates
   next ID before current commands, while `check` validates only its selected WP. ARM instead validates
   next ID/macro after current/regression commands, before passing-round flush/publication.
   `check` evaluates only the selected current checklist, omitting DoD
   and regression; it does not write position/retry/verdict changes, but creates/locks the state
   directory and runs command/judge side effects. Without a named position it reads `counter`
   and can return `complete` for a past-end counter. To check an ARM's actual WP after mutation
   or release, pass explicit position and the ARM-resolved base ref:

   ```sh
   if body=$(relay-gate check --sprint "$SPRINT" --workdir "$WORK" --state "$STATE" \
       --position "$POSITION" --base-ref "$BASE_REF"); then rc=0; else rc=$?; fi
   ```

   Read ARM position losslessly with `jq -Rs` plus shared-core `relay_json_string`, not `$(cat ...)`.
   CLI named arguments resolve raw whole ID first, then raw first-dot suffix, without legacy LF cleanup; the explicit
   option bypasses stale, parked, or past-end counters. Resolve `$BASE_REF` from the actual
   WP's sanitized `base_<safe-id>`, otherwise `meta.base_ref`, for ARM integrations. Omitted
   `--base-ref` reads CLI `<state>/base_ref`; explicit `--base-ref ""` means unavailable and
   suppresses that fallback. A valid `check` returns exit 0/1 with `outcome:check` and an empty/
   nonempty `failing` array. Unknown named position returns exit 2 with `outcome:error`,
   `error:unknown-position`; busy remains exit 3/stderr only. These are not eval escalation.
5. For HTTP, start `python3 bin/relay-daemon.py --host 127.0.0.1 --port 8787` in a separate process.
   Send exactly one of `sprint_path` or inline `sprint`, plus absolute `workdir` and `state_dir`.
   HTTP 200 = advance/complete, 409 = gate-fail, 423 = escalate, 400 = bad request, 500 = hard/busy gate error.
   The daemon returns a 500 error object when CLI supplies no usable outcome JSON, including busy exit 3.
   Inline sprint's temporary file is deleted after the request; retain your own sprint for `verify --sprint`.
   Same-realpath state requests serialize within the daemon; complete `/ask` and `/answer` operations
   use the same in-process lock registry per arm realpath. CLI/ARM run locks and shared append locks
   remain distinct cross-process mechanisms; daemon serialization does not cover external hook state writes.
   `/ask` reads UTF-8 position with `newline=""`: raw whole ID, raw first-dot suffix, then legacy
   trailing-LF cleanup only after raw miss; CR remains data. Empty persisted position is invalid,
   unlike ARM's counter migration. Explicit null macro is rejected here, but optional in CLI/ARM.
   It uses named `check` and the actual-WP base ref when available: HTTP 409 means a valid
   passing precondition, 503 means busy check, and 500 means hard/malformed check or required note
   failure. An infrastructure error must not be translated into a passing gate or successful poke.
   See [daemon reference](../../../docs/daemon.md) and [daemon skill](../relay-daemon/SKILL.md) for the wait-channel contract.
   The daemon defaults to loopback, but `--host` is configurable. It has no authentication, TLS, or path
   confinement. Use it only for trusted local command execution; reachable callers can execute sprint commands.
6. Select judge backend explicitly: `RELAY_JUDGE_BACKEND=stub` for offline examples; `api` or `cli` for real review.
   Stub checks `RELAY_JUDGE_OK` markers or forced `RELAY_JUDGE_STUB`; it does not evaluate semantic correctness.
   API uses `ANTHROPIC_API_KEY` or custom `RELAY_JUDGE_BASE_URL`/`RELAY_JUDGE_API_KEY`; CLI needs authenticated `claude`.
   Configure `RELAY_JUDGE_MODEL`, `RELAY_JUDGE_MAX_CTX`, `RELAY_JUDGE_MAX_TOKENS`, and `RELAY_JUDGE_VOTES` deliberately.
   API/CLI voting uses typed sample availability, not backend/model/truncation labels. Public
   boolean `available:false` accompanies unavailable fail; answered pass/fail ballots are available.
   A cut artifact with a valid verdict can still vote; stub availability is not semantic assurance.
   API prefers a validated `submit_verdict` tool. Prose fallback uses the last line starting with
   `VERDICT:` and accepts only exact `VERDICT: PASS`/`VERDICT: FAIL` after case/outer-whitespace
   normalization. A malformed last declaration cannot recover an earlier pass.

## Checks

Run `python3 bin/relay verify "$STATE/ledger.jsonl" --sprint "$SPRINT" --json` after driving the run.
Verify exits differ: 0 = intact completed trace with passing recorded deterministic controls and no
detected audit failure; 1 = broken/refused integrity; 2 = non-pass, including no deterministic
controls, escalation, nonterminal ending, oracle divergence/drift, or unusable record/sprint.
With a reachable/explicit sprint, recheck compares named IDs in both directions and available oracle
hashes from checklist/regression events. Added/unrecorded, removed, and changed controls produce
`SPRINT-DIVERGED`. An invalid requested/reachable sprint is `SPRINT-INVALID`, never `not-run`;
intact unusable audit fields are `RECORD-INVALID`. Legacy missing oracle hashes produce
`ORACLE-UNVERIFIED` when comparison otherwise agrees. These new labels are exit 2, not passes.
It does not rerun commands, validate current artifacts, or compare every plan field. A bare ledger
without a sprint has `oracle_recheck.status=not-run` and explicit recorded-controls-only scope,
including for `PASS`; request `--sprint` when current named control/oracle agreement is required.
Matching `RELAY_LEDGER_KEY` is a verification prerequisite. Adversarial authenticity requires isolating the producer from
the key and trusted writer; an inherited environment shared by the same OS user is not that boundary.
Plain SHA chains can be fully rewritten. Anchor the latest head externally, outside producer control, for completeness; valid prefixes pass chain integrity in either mode.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, complete diff including untracked skills, exact artifact paths, and content hashes;
reviewer inspects that snapshot's source and consumers. Any revision invalidates prior approval.
Exercise this skill's CLI/HTTP and arm integrations in isolated state with named checks, selected for the changed surface and run sequentially:
- Run `python3 -m pytest tests/test_gate_cli.py tests/test_command_transport.py tests/test_arm_runtime.py tests/test_await_human.py tests/test_arm_binding.py -q` for named-check/base-ref boundaries, full-command/ID transport, transcript/agent binding, run-lock busy/errors/cleanup, and release reset/same-gate behavior.
- Run `python3 -m pytest tests/test_position_macro.py tests/test_self_check.py tests/test_cap_preflight.py -q` for later-entry macro/self-check delivery and cap-zero/estimate behavior; separately inspect the harness's first-WP prompt, initial base ref, and supplied-macro marker before its first evaluation.
- Run `python3 -m pytest tests/test_daemon.py tests/test_ask.py -q` for HTTP outcome mapping, named ARM preconditions, busy versus passing/error distinctions, wait-channel serialization, and required note failures.
- Run `python3 -m pytest tests/test_gate_core_runtime.py tests/test_judge_api.py tests/test_judge_cli.py tests/test_judge_calibration.py tests/test_audit_runtime.py -q` for unavailable judge failures, exact verdict parsing, typed availability/calibration despite marker-bearing labels, and audit labels/scope/input handling.
- Run `python3 bin/relay verify <ledger> --sprint <retained-sprint> --json`; inspect recorded-only versus compared scope, key/writer trust, head anchoring, and driver differences. These checks do not establish automatic runtime profile binding, independent semantic review, or current artifact validity.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Empty arm stdout can mean complete, parked, unarmed/unknown token, refused binding, plan defect, or hook error;
busy is specifically exit 3 with stderr. Inspect arm `state`, `position`, stderr/log, and `relay verify`;
process exit 0 alone proves no completion. Invalid arm metadata workdir falls back to `.`; confirm it before trusting evaluations.
Release requires attributed text containing a non-whitespace character; tabs/CRLF-only reasons remain rejected and unconsumed.
A valid release resolves the actual WP, clears that sanitized ID's retry/round/repeat/blocked files plus
legacy `retry_<index>` and `reg_retry`, restores the compatibility counter, and re-evaluates the same gate.
A lost position retains the reason for repair; release neither skips failing controls nor authenticates a human.
Remove stale locks only after confirming their evaluation/writer is gone. Do not reinterpret errors as passes.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Driver binding, first-WP delivery, outcome translation, and explicit-sprint verification are demonstrated.
Use [telemetry](../relay-telemetry/SKILL.md) for retained traces and [examples](../relay-examples/SKILL.md) for offline smoke runs.

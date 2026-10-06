# Relay diagnosis recipes

Audience: agents. Status: current.

Start with [relay-integration](../.opencode/skills/relay-integration/SKILL.md) for
harness issues or [relay-audit](../.opencode/skills/relay-audit/SKILL.md) for trace
issues. Runtime source wins when historical descriptions disagree.

## Hook returns no JSON. Is the task done?

No. Empty stdout with exit `0` occurs for unarmed or unknown tokens, ambiguous
binding, a different bound agent, completed arms, parked arms, escalation, and
some plan defects.

1. Inspect stderr and the selected transcript path.
2. Inspect arm `position`, `state`, and `relay.log`.
3. Run `bin/relay problems /path/to/arm --json` and
   `bin/relay verify /path/to/arm --json`.
4. Require `state=complete`, usable `relay verify --json` output, and audit exit
   `0`. When plan comparison is required, also require
   `oracle_recheck.status == "ok"`; see audit limits below.

## Wrong arm or WP appears

- Pass `agent_transcript_path`, the subagent's own file. `transcript_path` is the
  session file and can contain several dispatch markers; it is only a fallback
  when the own-transcript path is absent or not a file.
- Give each runner one distinct `RELAY-ARM:<token>`. Repeated copies of one token
  are unambiguous; multiple distinct tokens trigger refusal, not arbitrary
  enforcement. Inspect any explicit `RELAY_ARM_TOKEN` override.
- An arm binds the first supplied `agent_id`; a different agent is refused with
  exit `0`. Correct dispatch rather than sharing or clearing another runner's arm.
- Read named `position` for the arm hook. CLI `counter` is an array index, so
  editing array order can retarget its current WP.
  ARM tries raw whole ID, then raw first-dot suffix; only both missing permit
  legacy trailing-LF removal and another lookup. Literal CR remains identity data.

## Hook never runs

Check active `SubagentStop` registration and the absolute script path
`bin/relay-arm-hook.sh`. Confirm a subagent stopped; top-level `claude -p` uses
the plain `Stop` event. Check `jq`, Bash, and the hook environment. Begin a new
session after registration changes, then inspect an actual payload and stderr.
Setup recipe: [getting-started](getting-started.md).

## A gate keeps failing

Run each failing `cmd` in `meta.json.workdir` with the same environment; gate
evaluation discards command output. The hook falls back to `.` for a missing
workdir, so validate the directory before dispatch. Check tool availability,
fixture paths, and whether the command proves the intended assertion.

Checklist and DoD readers preserve whole decoded commands, including tabs and
interior/trailing LF; regression hashes the same full command. Each value is one
Bash program whose final exit status decides acceptance. `false\ntrue` can pass;
use explicit failure propagation when every step must succeed. See
[CLI contract](sdk.md#controls-and-feature-limits).

A blocking judge's nonzero process exit or malformed/missing response records
`fail` with a `judge:unavailable(...)` label and blocks. Advisory judge failures
remain recorded failures without blocking. Inspect backend labels and context;
a stub verdict is not a semantic assessment.

`retry_budget` defaults to `3`: the first three failures re-block; the next
failed evaluation escalates. Regression-only failures use a separate arm retry
counter. Repeated `RELAY-BLOCKED: <reason>` claims can escalate earlier when
honored; they do not pass the gate. Inspect `relay problems` for plan defects.

## Escalation looks like success to the harness

The arm hook writes an `escalate` event, `state=awaiting-human`, and a counter at
the plan length, then exits `0` with empty stdout. This permits the agent stop.
Do not classify either empty output or `counter >= nwp` as success. The audit
returns `2` for an escalated terminal trace.

An operator MUST provide real who/why in the arm's `release` file. The hook
removes CR, maps LF to spaces, trims edge ASCII spaces, and requires a non-whitespace
character; tabs-only input is rejected. It does not authenticate a human. After
resolving position, it must append `human-release` before consuming the release.
It then clears that resolved ID's retry/round/repeat/blocked-claim keys and
the legacy index retry and `reg_retry`, restores the current counter, and retries
the same gate with a fresh budget. Controls still apply; an unresolved position
keeps the release for repair. See
[release input and cleanup](per-agent-arms.md#release-input-and-cleanup).
CLI callers handle `outcome=escalate`, exit `2` themselves; the CLI has no matching
parked-arm lifecycle.

## Chain stops before the final gate

Inspect harness block limits. Advancement costs a block as well as retries.
At its first preflight, the arm hook reads `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`,
using `8` for unset, empty, or invalid values. It records `cap-risk` only when
a nonzero cap is below `len(work_packages)+1`. That is the implemented warning
estimate, not a physical minimum. `0` requests an uncapped harness and suppresses
the warning; it does not guarantee completion. Inspect actual state and terminal
ledger event afterward.

## Hook or `relay-gate` returns exit 3 or no outcome

Exit `3` means the ARM or CLI state directory's `.run.lock` is held. Both drivers
serialize whole evaluations; `.chain.lock` separately serializes ledger appends.
Establish whether an evaluation is still running before removing a stale lock.
Usage errors and missing input paths also need stderr handling; do not assume
every nonzero exit includes JSON. Pair CLI outcomes with codes in [sdk.md](sdk.md).
Mandatory evidence/transition append failures also abort before corresponding
state/retry updates; a successful append can precede a later failed state write.
Some ARM ancillary appends and archives remain best-effort. There is no atomicity or rollback.

## Is accepted work frozen? Does Relay compact or switch models?

Accepted files remain editable. Keep-best reruns full deterministic commands;
Relay does not restore snapshots. [Compaction hints](compaction.md) only change
feedback text. `review` supplies a cold-read reminder without spawning a reviewer.
A WP `model` field does not switch runners; judge configuration selects the
judge process's model through `RELAY_JUDGE_MODEL`.

## Is an intact ledger sufficient?

No. `benchmark/verify_ledger.py` checks integrity; `bin/relay verify` also checks
record schema, final recorded checklist verdicts, terminal completion, and oracle
drift. With a sprint, it compares named IDs both ways: added/unrecorded, changed,
and removed controls prevent PASS. It does not rerun commands, validate current
artifacts, or compare every plan field or judge setting.

Require usable `--json` output and process exit `0`. Supply a reachable sprint
or `--sprint`, and when plan comparison is required, also require
`oracle_recheck.status == "ok"`. No discovered/supplied sprint yields `not-run`
and can still return exit `0`. A discovered or explicitly supplied unreadable,
malformed, or schema-invalid sprint yields `invalid` / `SPRINT-INVALID`, exit `2`.
Legacy graded records without oracle hashes yield `unverified` /
`ORACLE-UNVERIFIED` when compared without other defects; new IDs still diverge.

Malformed chain JSON/fields produce `TAMPERED`, exit `1`; intact but unusable
control records produce `RECORD-INVALID`, exit `2`, with `record_errors`.
Deterministic verdicts other than `pass` cannot establish a passed control.
Interior/trailing LF is preserved in command and judge oracle hashes; an unchanged
full string no longer causes the former extraction mismatch. See
[SPEC §5](../SPEC.md#5-judge-and-computed-artifact-contract) and
[§6](../SPEC.md#6-ledger-and-audit-boundary). Judge controls remain non-independent.
A scripted example is mechanism evidence, not live model or fan-out measurement.

Authorities: [arm hook](../bin/relay-arm-hook.sh), [gate CLI](../bin/relay-gate),
[shared core](../lib/relay-gate.sh), [audit CLI](../bin/relay),
[binding regression tests](../tests/test_arm_binding.py).

---
name: relay-arm-hook
description: Maintains per-agent Relay arm binding and state transitions when agents change bin/relay-arm-hook.sh.
---

# Relay arm hook maintenance

## Trigger

Use this skill for SubagentStop binding, named position, arm retries, escalation, release, injections, blocked claims, usage attribution, evaluation exclusion, or trace retention.
Run maintenance commands from repository root.

## Read first

- Read [bin/relay-arm-hook.sh](../../../bin/relay-arm-hook.sh), [shared core](../../../lib/relay-gate.sh), and [fleet-chain example](../../../examples/fleet-chain/run_example.py).
- Read [test_arm_runtime.py](../../../tests/test_arm_runtime.py), [test_arm_binding.py](../../../tests/test_arm_binding.py), [test_arm_state.py](../../../tests/test_arm_state.py), and [test_await_human.py](../../../tests/test_await_human.py).
- Read [test_backoff.py](../../../tests/test_backoff.py), [test_blocked_claim.py](../../../tests/test_blocked_claim.py), and [test_cap_preflight.py](../../../tests/test_cap_preflight.py) for bounded failure paths.
- Read [test_position_by_id.py](../../../tests/test_position_by_id.py), [test_position_macro.py](../../../tests/test_position_macro.py), [test_kinds.py](../../../tests/test_kinds.py), [test_self_check.py](../../../tests/test_self_check.py), and [test_cost.py](../../../tests/test_cost.py) as affected.

## Ownership

Own `bin/relay-arm-hook.sh`; route chain and checklist helpers to [gate core](../relay-gate-core/SKILL.md).
Route sprint compilation to [profiles](../relay-profiles/SKILL.md), view changes to [audit](../relay-audit/SKILL.md) or [telemetry](../relay-telemetry/SKILL.md), and setup instructions to [integration](../relay-integration/SKILL.md).
Obtain disjoint file claims and a reviewer who did not author the changed state machine.

## Contracts

- Read SubagentStop JSON on stdin; emit `{decision:"block", reason:...}` for continuation and exit 0 without a block for permitted stops.
- Prefer existing `agent_transcript_path` over `transcript_path`; use `RELAY_ARM_TOKEN` as an explicit override and bind from a unique `RELAY-ARM:<token>` marker otherwise.
- Refuse ambiguous distinct markers and mismatched `agent_id` with stderr and exit 0; do not describe refusal as a harness block.
- Reject traversal tokens and leave absent markers or unknown arms alone; locate arms under `RELAY_ARMS_DIR`, defaulting to `$HOME/.relay/arms`.
- Acquire `<arm>/.run.lock` once a known sprint is found, before `agent_id` binding, release consumption, state/retry writes, and transcript-cost attribution. Busy exits 3 with stderr only and no arm-state, ledger, or gate-command effects; never remove another evaluator's lock.
- Keep one exit cleanup trap for the owned run lock and temporary round file; normal dispositions, refusals, plan defects, and shell/tool error exits must release owned resources. A hard process kill can leave a stale lock.
- Read `sprint.json`, `meta.json`, `position`, and `state`; resolve workdir from metadata with the current fallback to `.` when it is not a directory.
- Read raw position with `jq -Rs` plus `relay_json_string`; resolve raw whole ID, then raw first-dot suffix. Only a raw miss permits legacy trailing-LF cleanup and retrying both lookups; retain CR.
- Decode current, migrated, and next IDs/macros losslessly; IDs must be nonempty NUL-free strings, macro may be string or optional null. Preserve canonical `macro.sub` without doubling qualified prefixes. Invalid current identity aborts before controls; validate next ID/macro in `advance` after current/regression commands but before passing-round flush/publication.
- Keep `counter` as a compatibility mirror and migration input; use WP IDs for normal arm position and retry state.
- Keep `complete` separate from `awaiting-human`; honor legacy `escalated` and do not rerun completed gates on later fires.
- Normalize `release` by removing CR, mapping LF to spaces, and trimming leading/trailing ASCII spaces; require a character outside `[[:space:]]`. Reject empty, spaces-only, tabs-only, CRLF-only, mixed blank space/tab/CRLF, and vertical-tab/form-feed-only reasons; retain rejected files.
- Resolve the parked position before consuming an accepted release; retain the reason on `position-lost`. Use the actual resolved WP ID, sanitized exactly as evaluation does, for cleanup of `retry_`, `round_`, `repeat_`, and `blocked_`; also remove legacy `retry_<current-index>` and `reg_retry`, preserving unrelated WP keys.
- Require successful `human-release` append before consuming the reason, clearing budgets, restoring `counter`, or setting `active`; recheck the same gate. Dotted/macro-prefixed/qualified IDs receive the same reset; release neither skips controls nor authenticates its writer. A failure charges the restored budget, including immediate escalation at budget 0.
- Accept default `execute`, `gate`, `review`, and `inject`; treat `human` and every other kind as unsupported.
- Keep `review` as a cold-read reminder, not enforced reviewer independence; require an independent reviewer in the operating procedure.
- Read injection file bytes or inline text, prefer a file when both exist, record its SHA-256, and still run a declared checklist. File hashes cover original bytes; delivered file text loses trailing LF. Inline text loses trailing LF before hashing and delivery.
- Deliver extracted injection text only in a successful nonterminal advance reason; a failure or final completion does not deliver it even when an `inject` SHA entry was recorded.
- Leave unknown kinds, missing injections, and lost positions without advancement or automatic parking. `position-lost` append is required/fatal; unknown-kind/inject-missing appends remain best-effort, with exit 0 on their normal diagnostic paths.
- Recheck only earlier deterministic controls whose whole IDs have a recorded passing checklist item; record each rerun as `regression-item`. Compact JSON records and exact decoding preserve tabs and all LF in command and ID strings, including trailing LF, for membership, execution, and oracle hashing. NUL and nonstring commands are unsupported; decoding errors cannot become passing regressions.
- Execute the complete decoded shell program on current and regression paths; overall Bash exit status decides pass/fail. Single-physical-line commands are not required by transport; explicit status propagation remains the control author's duty.
- Bound current-gate and regression-only retries separately; flush terminal rounds in full and park budget exhaustion as `awaiting-human`.
- Collapse identical failures into `gate-fail-repeat`; retain changed verdicts/oracles. Required records are buffered checklist/regression verdicts, `position-lost`, `human-release`, `advance-reveal`, `compaction-hint` when emitted, `sprint-complete`, `gate-fail`, `gate-fail-repeat`, and `escalate`. Append failure is fatal before corresponding transition/retry/release publication, including round/repeat metadata; earlier command effects or records may remain. No atomicity, rollback, or fsync guarantee.
- Keep cap-risk, unknown-kind, inject/inject-missing, blocked-claim appends and archives best-effort; do not generalize required-record ordering to every state/cost write.
- Record `RELAY-BLOCKED:` claims and corroboration against a computed diff; honor only a failing checklist and accelerate repeated honored claim hashes to escalation.
- Keep corroboration informational: the current `honored` field depends on checklist failure, not on a passing judge verdict.
- On the first fire, read the live hook cap with default/invalid-value fallback `8`; record `cap-risk` and prefix that invocation's next block only when the cap is nonzero and below the implemented estimate `len(work_packages)+1`.
- Treat cap `0` as uncapped; the implemented estimate is not a proven block-count lower bound because the last passing gate emits no block, and it neither changes the harness cap nor guarantees completion.
- Attribute transcript usage by `tr_cursor`; preserve absent usage and first-state elapsed data rather than inventing zero cost.
- Preserve arm token and optional macro, kind, scope, artifact, base-ref, cost, and elapsed fields in caller envelopes.
- Archive terminal ledger, sprint, metadata, and outcome under `RELAY_CORPUS_DIR`, defaulting to `$HOME/.relay/corpus`; retention is best-effort.

## Procedure

1. Inspect baseline, claims, and consumer impact through [maintenance](../relay-maintenance/SKILL.md) and [blast radius](../relay-blast-radius/SKILL.md).
2. Reproduce the affected transition with isolated arm, corpus, workdir, and transcript paths; never use retained production evidence as scratch state.
3. Trace binding and run-lock acquisition before gate evaluation; distinguish busy stderr/exit 3 from empty exit-0 completion, parking, refusal, and plan defects.
4. Compare position, counter, state, retry/round/repeat/blocked files, release bytes, transcript cursor, and ledger events before and after each changed transition.
5. Preserve first-state ownership: the arm author seeds initial instructions, macro protocol, self-check, and the initial diff base ref.
6. Preserve whole-arm `.run.lock` exclusion and the distinct shared `.chain.lock` for appends; neither daemon in-process locks nor chain locking replaces evaluation exclusion.
7. Check dependent audit and telemetry readers before changing event names or optional envelope fields.
8. Update this skill and request integration, catalog, and index updates from the lead.

## Checks

Select the affected group and run groups sequentially:

```bash
python3 -m pytest tests/test_arm_runtime.py tests/test_arm_binding.py tests/test_arm_state.py tests/test_await_human.py -q
python3 -m pytest tests/test_backoff.py tests/test_blocked_claim.py tests/test_cap_preflight.py -q
python3 -m pytest tests/test_position_by_id.py tests/test_position_macro.py tests/test_kinds.py tests/test_self_check.py -q
python3 -m pytest tests/test_gate_core_runtime.py tests/test_judge_diff.py tests/test_oracle_drift.py tests/test_ledger_provenance.py tests/test_cost.py -q
bash tests/test_arm_hook.sh
```

Use `python3 examples/fleet-chain/run_example.py` when the scripted fleet consumer changes.
For release changes, inspect `tests/test_await_human.py`'s bare/dotted/macro/compiler-qualified IDs, whole-ID precedence over an existing suffix, legacy-index cleanup, blocked-hash reset, exact blank normalization, valid CRLF reason, and same-gate failure cases in plain/keyed modes.
For lock/identity/record changes, inspect `tests/test_arm_runtime.py`'s raw-versus-legacy LF/CR lookup, lossless migration/next position, validation timing, required-record fault/recovery, busy snapshots, cleanup, and accepted-ID transport cases; `tests/test_await_human.py` covers release append failure retaining reason/budgets. These do not race independent chain appenders; use the [gate-core checks](../relay-gate-core/SKILL.md#checks) for append-lock changes.
For injection changes, require actual delivery checks on successful nonterminal, failing, and final fires; existing passing examples do not establish all these boundaries.
Run [documentation checks](../relay-maintenance/SKILL.md) after skill edits; delegate shared index regeneration to the lead.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every arm-hook change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read `bin/relay-arm-hook.sh`, shared-core and state-reader contracts, and affected documentation, then run the named applicable commands in Checks.
- Inspect transcript and agent binding, whole-evaluation lock acquisition before mutations, busy exit/no-output/no-mutation behavior, owned-lock/round-file cleanup, named position, completion versus parking, exact release normalization and resolved-ID cleanup, injection delivery paths, unsupported kinds, and first-state context.
- Inspect full-command/ID regression transport, accepted-control filtering, separate budgets, round collapse, blocked-claim corroboration limits, usage attribution, and best-effort archives; refuse unsupported or stale claims and missing dependencies.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently inspect transitions and artifacts rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Inspect state and ledger together; empty stdout and counter at `nwp` are insufficient to distinguish completion from parking.
- Preserve `unknown-kind`, `inject-missing`, `position-lost`, and `cap-risk` evidence; repair the plan through the responsible owner.
- Inspect the full decoded command, oracle hash, and plan generation when diagnosing drift; do not apply the superseded physical-line truncation explanation to the current JSON transport.
- Do not auto-create a human release or rewrite state to clear a check; preserve the operator's reason and the same-user trust boundary.
- Distinguish the run lock's state exclusion from the chain lock's append serialization. Confirm the evaluator is gone before removing a stale `.run.lock`; never remove an active owner's lock.
- Describe cost as recorded usage, not billing; retries and partial data can make state or macro rollups incomplete.
- Report archive failures as retention gaps; do not treat best-effort copies as guaranteed durable or complete evidence.

## Done

Return the changed transition, binding and state evidence, affected readers, targeted checks, known boundary changes, and independent-review handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.

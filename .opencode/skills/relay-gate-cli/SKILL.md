---
name: relay-gate-cli
description: Maintains model-agnostic Relay gate outcomes and state when agents change bin/relay-gate or its driver contract.
---

# Relay gate CLI maintenance

Audience: agents. Status: current.

## Trigger

Use this skill for `eval` or `check` arguments, JSON outcomes, exit codes, counter advancement, DoD execution, regression checks, or run locking.
Run maintenance commands from repository root.

## Read first

- Read [bin/relay-gate](../../../bin/relay-gate), [lib/relay-gate.sh](../../../lib/relay-gate.sh), and [bin/relay-daemon.py](../../../bin/relay-daemon.py).
- Read [test_gate_cli.py](../../../tests/test_gate_cli.py), [test_concurrent_gate.sh](../../../tests/test_concurrent_gate.sh), and [test_daemon.py](../../../tests/test_daemon.py).
- Read [test_command_transport.py](../../../tests/test_command_transport.py), [test_gate_core_runtime.py](../../../tests/test_gate_core_runtime.py), and [test_arm_runtime.py](../../../tests/test_arm_runtime.py) for whole commands, fatal shared-core paths, and shared state-directory exclusion.
- Read [test_judge_diff.py](../../../tests/test_judge_diff.py), [test_sprint_diverged.py](../../../tests/test_sprint_diverged.py), and [test_ask.py](../../../tests/test_ask.py) for consumed base-ref and precondition behavior.
- Read [SDK reference](../../../docs/sdk.md) and [integration](../relay-integration/SKILL.md) when changing external driver expectations.

## Ownership

Own `bin/relay-gate`; route shared checklist and chain changes to [gate core](../relay-gate-core/SKILL.md).
Route HTTP translations and wait-channel consumers to [daemon](../relay-daemon/SKILL.md), arm behavior to [arm hook](../relay-arm-hook/SKILL.md), and verifier readers to [audit](../relay-audit/SKILL.md).
Claim exact paths and require a reviewer distinct from the author.

## Contracts

- Preserve `bin/relay-gate eval --sprint <sprint.json> --workdir <dir> --state <state-dir> [--ledger <path>]` and the same paths for `check`, with check-only `[--position <position>] [--base-ref <commit>]`.
- Reject either check-only flag under `eval` with usage exit 1. Reject missing flag values and empty path/position values before state creation; explicitly empty `check --base-ref ""` is valid and means unavailable, not fallback.
- Require an existing sprint file and workdir; create the state directory and acquire its `.run.lock` for both modes.
- Return exit 3 with stderr when `.run.lock` is held; do not queue CLI evaluations or record a verdict for the busy caller.
- Keep `eval` state position as integer `counter`, unlike the arm hook's named `position`; keep retry files keyed as `retry_<index>`. Default `check` reads the same counter, not the ARM position file.
- For `check --position`, use shared `relay_position_index` to match the whole WP ID first, otherwise the suffix after the first dot. Override stale/parked/past-end counters without rewriting position or counter; unknown position returns exit 2 and `{outcome:"error", error:"unknown-position", position:...}`.
- Return exit 0 and `{outcome:"complete", i:...}` when counter is already past the plan and no named check position is supplied; this path does not rerun completed gates.
- Return exit 0 for `advance` or `complete`, exit 1 for `gate-fail`, and exit 2 for `escalate` when evaluation reaches those dispositions.
- Keep stdout as JSON outcomes and stderr as diagnostics; do not add Claude-specific `decision` fields.
- Preserve `wp`, `i`, `next`, `failing`, and `reason` where currently emitted; emit optional `macro` only when declared.
- Decode current WP ID/macro and emitted next ID losslessly through `relay_json_string`; retain tabs and interior/trailing LF in outcomes/applicable ledger fields. Current/next IDs must be nonempty NUL-free strings; macro may be missing/null/empty or a NUL-free string.
- Before evaluating a WP, prevalidate current ID/macro and, for `eval` with a next WP, next ID before controls or ledger/counter/retry effects. Do not infer next-macro/full-plan validation. `check` validates only selected ID/macro, permitting malformed future identities outside its scope; state-directory creation and run locking still precede validation.
- Read diff base ref from `<state-dir>/base_ref` unless `check --base-ref` is explicitly supplied. Explicit empty suppresses fallback and yields `judge:unavailable(no-diff)`, failing a blocking diff check. Require the driver to capture the correct entry ref rather than guessing it after work.
- Evaluate the current checklist through the shared core, then current DoD, earlier deterministic checklist regressions, and earlier DoD, in that order.
- Carry regression/DoD records as compact JSONL and decode strings with shared `relay_json_string`; execute each current/earlier command whole, preserving tabs and interior/trailing LF for execution and oracle hashing. Final shell status decides the result, not AND across line fragments.
- Give transport-loop commands EOF on ambient stdin so they cannot consume subsequent JSONL records; explicit pipes/heredocs inside the command still supply input.
- Accept missing/null/empty-array current checklists; every nonarray, including `{}`, `false`, and `""`, is a fatal shared-core error before checklist-item execution. This does not introduce full-plan validation.
- Allow absent/null/empty DoD; declared DoD entries require nonempty NUL-free string commands. Malformed arrays/entries/commands produce declared IDs or stable synthetic `dod:<wp>:invalid-array` / `dod:<wp>:<index>:invalid-command` failures.
- Record checklist verdicts and `regression-item` verdicts through shared chain append; DoD commands do not create named checklist-item records.
- Select every earlier deterministic checklist control for regression, unlike the arm hook's recorded-pass filter. Malformed earlier checklist collections, undecodable commands, or missing/empty commands without a nonempty string judge yield named regression failures. Missing/empty/nonstring earlier IDs receive synthetic labels; a valid command can still pass under that label. Earlier assertions are not validated; judge-only controls are skipped on a nonempty-string check without NUL decoding or complete criterion validation. This is not full plan-schema validation.
- Charge combined current and regression failures to the same index-keyed retry budget; do not imply a separate arm-style regression counter.
- Record `escalate` without setting a persistent arm-style parked state or advancing counter; a later passing evaluation can still advance.
- Keep `check` limited to the current checklist: no DoD evaluation, regression evaluation, retry charge, advancement, or ledger verdict.
- Do not describe `check` as entirely side-effect-free: it creates the state directory, acquires a lock, executes commands and judges, and may produce temporary diff files.
- Share `.run.lock` with ARM when the same arm directory is passed as `--state`; a busy caller returns 3 before grading or state-file updates and never removes another invocation's lock.
- Propagate fatal shared-checklist and regression verdict-write errors; require `sprint-complete`/`advance-reveal` append before counter publication, `gate-fail` before retry writes, and `escalate` before JSON disposition. A failed required append emits no normal outcome; a later state-write failure can leave a successful record. This is not atomic publication, rollback, or fsync-backed durability. `check` substitutes a no-op verdict writer.
- Preserve the no-`arm` ledger envelope and omit absent optional scope and artifact fields.

## Procedure

1. Inspect baseline and edit claims through [maintenance](../relay-maintenance/SKILL.md); select daemon and audit consumers through [blast radius](../relay-blast-radius/SKILL.md).
2. Trace argument validation separately from normal gate dispositions; a nonzero exit without usable JSON is an infrastructure error for consumers.
3. Reproduce changed outcomes in isolated work and state directories; record JSON, exit code, counter, retries, and ledger events.
4. For mode changes, exercise `eval`, default `check`, and named `check`; include exact-ID/suffix resolution, unknown positions, stale/past-end counters, and explicit valid/empty base refs. Preserve the wait channel's narrower precondition semantics.
5. For state changes, inspect index-keyed retries and mutable plan assumptions; do not silently import the arm hook's ID migration contract.
   ARM now preserves raw position/current/migrated/next ID/macro strings too: raw whole ID and raw first-dot suffix precede miss-only trailing-LF fallback, with CR preserved. Keep timing distinct: ARM next validation is inside advance after commands and before buffered passing evidence flush; CLI next-ID validation precedes commands. Neither is full-plan validation.
6. For locking changes, verify whole-evaluation `.run.lock` behavior and shared `.chain.lock` behavior independently.
7. For output changes, inspect daemon `run_gate` status mapping and `bin/relay` ledger readers before editing.
8. Update this skill and request integration, catalog, and index updates from the lead.

## Checks

Select commands for the changed contract and run them sequentially:

```bash
python3 -m pytest tests/test_gate_cli.py -q
python3 -m pytest tests/test_command_transport.py tests/test_gate_core_runtime.py -q
python3 -m pytest tests/test_arm_runtime.py -q
bash tests/test_concurrent_gate.sh
python3 -m pytest tests/test_daemon.py tests/test_ask.py -q
python3 -m pytest tests/test_judge_diff.py tests/test_sprint_diverged.py -q
```

Use `test_gate_cli.py` for dispositions, counter changes, named exact-ID/suffix checks, unknown/past-end positions, flag validation, explicit valid/empty base refs, busy checks, exact `wp`/`macro`/`next` strings, current/next identity rejection before control/ledger/state-file effects, selected-only check validation, and unchanged persistent files.
Use `test_command_transport.py` for whole current/earlier DoD pass/fail, malformed declarations, full multiline checklist regression hashes, EOF isolation with explicit pipe/heredoc input, required-record failures before state publication, late counter-write failures after records, driver order, and `eval` versus `check` scope/state/ledger effects. Older checklist-only CLI tests do not establish DoD coverage by themselves.
Use `test_gate_core_runtime.py` for exact current IDs/assertions/oracles, judge pass/fail and malformed/nonzero response handling, and fatal writes; use `test_arm_runtime.py` for ARM/CLI shared-lock exclusion and cleanup.
Use the shell test for CLI run-lock exclusion, service tests for consumed outputs, and diff/audit tests for base-ref or oracle changes. Inspect JSON, counter/retry files, command effects, and ledger events rather than only exits.
Use [gate core](../relay-gate-core/SKILL.md)'s direct concurrent-writer probe for actual append-lock changes; the CLI shell test permits only one appender.
Inspect busy-call stderr and unchanged verdict count, not only a valid final chain.
Run [documentation checks](../relay-maintenance/SKILL.md) after skill edits; delegate shared index regeneration to the lead.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every gate-CLI change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read `bin/relay-gate`, shared-core, daemon, driver, and audit contracts, and affected documentation, then run the named applicable commands in Checks.
- Inspect JSON and exit-code agreement, infrastructure errors versus gate dispositions, counter and retry updates, lock contention and cleanup, and the nonlatched escalation path.
- Confirm `check` reaches only its selected checklist while `eval` includes DoD and earlier regressions; require whole-program DoD pass/fail and mode-comparison cases, not inferred coverage from checklist-only suites.
- Inspect check-only flag rejection in `eval`, named exact-ID-first/suffix resolution, unknown/stale/past-end positions, and explicit-empty base-ref suppression of state fallback; verify unchanged position/counter/retry/ledger files and shared ARM/CLI lock exclusion.
- Inspect exact current ID/assertion and whole-command/oracle strings, invalid required values, fatal shared-core propagation, base-ref ownership, and consumer mappings, refusing unsupported or stale claims and missing dependencies.
- Verify exact current/macro/next identity strings and current/next prevalidation before command/ledger/state-file effects; check must validate selected identity only. Confirm mandatory disposition writes precede corresponding counter/retry publication, and late state failures do not masquerade as atomicity or rollback.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently inspect state and results rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Preserve exact argument or workdir diagnostics; do not map malformed output to a normal `gate-fail` outcome.
- Treat exit 3 as busy; establish whether an evaluation is still running before removing `<state-dir>/.run.lock`.
- Leave driver decisions about retrying or halting after escalation explicit; CLI state has no human-release latch.
- Do not use `check` to claim full gate satisfaction when DoD or earlier controls remain outside its reach.
- Diagnose current commands by whole-program final status and exact decoded hash. LF stripping/regression fragmentation belongs to historical ledgers; preserve that evidence rather than imposing a current single-line restriction.
- Preserve sprint and ledger evidence when auditing divergence; never reset counters or delete ledgers solely to make retained runs pass.
- Treat malformed/root-h append bodies, fatal checklist/regression writes, and required disposition failures as nonzero infrastructure errors with cleanup, not ordinary gate dispositions. Nonarray current checklists and invalid current/next identities must not become empty passes. Preserve successful earlier prefixes when later state writes fail; do not infer transactional rollback or fixed ancillary/archival paths.

## Done

Return changed CLI contracts, JSON and exit-code effects, state and lock evidence, consumer updates, targeted checks, and independent-review handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.

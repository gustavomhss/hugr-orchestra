---
name: relay-gate-core
description: Maintains Relay checklist evaluation and ledger appends when agents change lib/relay-gate.sh or bin/relay-note.
---

# Relay gate core maintenance

Audience: agents. Status: current.

## Trigger

Use this skill for exact JSON-string decoding, named-position lookup, checklist evaluation, oracle or artifact hashing, parameter expansion, chain serialization, append locking, or daemon note writes.
Run maintenance commands from repository root.

## Read first

- Read [lib/relay-gate.sh](../../../lib/relay-gate.sh) and [bin/relay-note](../../../bin/relay-note).
- Read callers [arm hook](../../../bin/relay-arm-hook.sh), [gate CLI](../../../bin/relay-gate), and [benchmark hook](../../../benchmark/relay_hook.sh) for their envelopes and terminal decisions.
- Read [benchmark/verify_ledger.py](../../../benchmark/verify_ledger.py) and [bin/relay](../../../bin/relay) before changing signed bytes or oracle formulas.
- Read [judge](../relay-judge/SKILL.md) for the backend transport and calibration contracts consumed by checklist evaluation.
- Read [test_relay.py](../../../tests/test_relay.py), [test_ledger_provenance.py](../../../tests/test_ledger_provenance.py), [test_judge_diff.py](../../../tests/test_judge_diff.py), and [test_concurrent_gate.sh](../../../tests/test_concurrent_gate.sh).
- Read [test_gate_core_runtime.py](../../../tests/test_gate_core_runtime.py), [test_command_transport.py](../../../tests/test_command_transport.py), and [test_arm_runtime.py](../../../tests/test_arm_runtime.py) for exact strings, invalid inputs, fatal writes, and caller transport/locking boundaries.

## Ownership

Own `lib/relay-gate.sh` and `bin/relay-note`; obtain disjoint claims before editing either.
Route caller state changes through [arm hook](../relay-arm-hook/SKILL.md) or [gate CLI](../relay-gate-cli/SKILL.md).
Route judge runtime and calibration changes through [judge](../relay-judge/SKILL.md), chain-verifier and report changes through [audit](../relay-audit/SKILL.md), benchmark-hook changes through [benchmark](../relay-benchmark/SKILL.md), and corpus/dashboard changes through [telemetry](../relay-telemetry/SKILL.md).

## Contracts

- Require callers to supply `LEDGER`, `SPRINT`, `RUN_DIR`, `i`, and `ledger_item()` before evaluation; preserve the shared core rather than copying it into callers.
- Require Bash, `jq`, Python 3, and `shasum`; require `openssl` for keyed appends and Git for computed-diff controls.
- Keep `relay_chain_append <compact-json-body>` responsible for `gen`, `prev`, `seq`, `mac`, and the final `h` field.
- Use `GENESIS` and zero-based contiguous sequence numbers; stamp generation inside the hashed body, with absent or invalid generation falling back to zero.
- Seal compact body bytes with SHA-256, or HMAC-SHA256 when `RELAY_LEDGER_KEY` is nonempty; never record the key.
- Keep `.chain.lock` beside the ledger and hold it across tail reading and append; it does not serialize an entire gate evaluation.
- Preserve `relay-note <ledger.jsonl> <sprint.json> <compact-json-body>` as the daemon's shared append adapter; usage errors exit 2.
- Require exactly one JSON object without top-level `h` per append body; any supplied root `h`, including null, is rejected, while nested `data.h` is allowed. Malformed/empty/nonobject/multiple/root-h bodies return nonzero without writing and release the owned chain lock. Lock/write failures also return nonzero with diagnostics.
- Own `relay_json_string <output-variable> <json-value>` here; assign one decoded JSON string losslessly, accepting `null` as empty optional text and rejecting nonstring values or NUL. Require a valid Bash output identifier outside reserved `__relay_json_string_*`; reserved names fail without assigning the caller variable. Preserve tabs, interior LF, trailing LF, and Unicode; caller-variable assignment avoids command-substitution LF loss.
- Own `relay_position_index <position>` here; read `SPRINT`, emit the exact WP ID's index first, otherwise the suffix after the first dot, and return nonzero on no match. ARM and named CLI checks consume the same resolver.
- Preserve caller lookup boundaries: ARM supplies raw losslessly read position, tries raw whole ID/suffix first, and only after a miss retries legacy trailing-LF cleanup; CR stays data. ARM current/migrated/next WP/macro decoding and position publication are lossless, with next validation inside advancement after commands but before passing-round flush. CLI next-ID prevalidation occurs before commands.
- Decode current control IDs and resolved `assert // id` text exactly into ledger fields; invalid/empty IDs or invalid resolved assertions abort before that control executes.
- Accept missing/null `checklist` and `[]` as empty current control lists; reject every nonarray, including `{}`, `false`, and `""`, fatally before checklist-item execution. Empty checklist acceptance remains an installed boundary, not complete plan validation.
- Run each deterministic `cmd` whole through shell evaluation in `RUN_DIR`, using final shell status; hash that exact decoded command before execution. `false; true` passes. Current controls and caller regressions/DoD preserve multiline programs through compact JSONL and shared decoding.
- Treat invalid command, missing/invalid criterion without a command, or malformed scope (paths must be an array of NUL-free strings) as a named failing control, not an unexecuted pass. Empty/null commands may fall back to a valid judge. This is not complete sprint-schema validation.
- Accept judge output only from an exit-0 process and exactly one object with verdict `pass` or `fail` and a valid optional backend string. Invalid responses record `fail` / `judge:unavailable(invalid-response)(non-independent)`; nonzero process exit records `fail` / `judge:unavailable(exit-<status>)(non-independent)` even with pass stdout. These failures block only when the semantic item is blocking; an advisory response failure still records fail.
- Permit additive response fields; the core does not validate `available` or require reason. Judge JSON now derives boolean availability from typed ballot/sample state; public API/CLI judge functions retain three-tuples. Calibration separately requires process 0, pass/fail object, NUL-free backend string, string reason, and literal true availability, excluding invalid measurements from agreement rather than parsing display tags.
- Hash the exact decoded, unexpanded judge criterion plus optional ` :: ` and exact space-joined `paths` as the oracle, retaining trailing LF to match audit. Origin precedence remains `origin`, then `policy:<policy>`, then `sprint`.
- Expand environment placeholders in context paths by substitution, never `eval`; preserve unresolved placeholders as literals.
- Require `BASE_REF` and a Git workdir for `diff: true`; include tracked changes from the base plus untracked, nonignored files without mutating the index.
- Record missing diff as `fail` with `judge:unavailable(no-diff)`; only a blocking judge adds it to the failing IDs.
- Digest declared artifact path names and contents in order, using `absent` for missing files; do not describe that field as a digest of every computed diff or context file.
- Preserve optional caller fields when absent; an additive emitted field changes signed bytes and all subsequent chain hashes.
- Propagate `ledger_item` failure explicitly as fatal from every checklist branch, even without caller `errexit`; stop later controls. CLI regression writes and ARM verdict-buffer writes/flushes are also mandatory. Require each caller's completion/advance/failure/escalation records before its corresponding state/counter/retry publication or success outcome; ARM release and compaction records also precede their consumption/reset/reactivation or next-state publication. See [SPEC ordering matrix](../../../SPEC.md#6-ledger-and-audit-boundary); this is not atomic publication, rollback, or universal propagation from ancillary events/archives.
- Keep append validation distinct from audit decoding: the verifier/audit loader reject duplicate decoded keys at every nesting depth, including escaped equivalents, and require exactly one final root `h` with the writer delimiter. Nested `h` remains data; original signed body bytes are verified without JSON reserialization.

## Procedure

1. Inspect baseline and changed paths through [maintenance](../relay-maintenance/SKILL.md), then select consumers through [blast radius](../relay-blast-radius/SKILL.md).
2. Trace every changed helper through both hook callers, the CLI, and `relay-note`; compare each caller's `ledger_item` arguments.
3. Preserve caller-specific envelopes, regression policies, and terminal behavior rather than assuming shared evaluation makes the engines identical.
   Trace mandatory append failure through buffered rounds and disposition calls to state publication; distinguish optional ancillary appends and best-effort archival.
4. For decoder or oracle changes, compare exact decoded strings and hashes with `bin/relay.sprint_oracles`, including tabs/interior/trailing LF in commands, IDs/assertions, criteria, and scope; preserve historical mismatch evidence unchanged.
5. For serialization changes, compare exact body bytes with `verify_ledger.body_bytes`; leave historical ledgers and fixture evidence intact.
6. For locking changes, inspect `.chain.lock` separately from CLI/ARM `.run.lock`; verify malformed-body rejection, failure propagation, and owned-lock cleanup on every affected path.
7. Update this skill and request dependent skill, catalog, and index changes through the lead.

## Checks

Select the relevant commands and run them sequentially:

```bash
python3 -m pytest tests/test_gate_core_runtime.py -q
python3 -m pytest tests/test_command_transport.py tests/test_arm_runtime.py -q
python3 -m pytest tests/test_await_human.py -q
python3 -m pytest tests/test_relay.py tests/test_ledger_provenance.py -q
python3 -m pytest tests/test_judge_diff.py tests/test_oracle_drift.py tests/test_sprint_diverged.py -q
python3 -m pytest tests/test_gate_cli.py tests/test_ask.py -q
bash tests/test_concurrent_gate.sh
bash tests/test_arm_hook.sh
```

Use `test_gate_core_runtime.py` for exact helper/current-ledger strings and audit hashes, reserved output-namespace rejection without caller mutation, missing/null/array versus nonarray checklist shapes, invalid required values, malformed/nonzero judge responses versus real stub pass/fail, fatal `ledger_item` propagation without errexit, malformed/root-h append cleanup with nested-h acceptance, and plain/keyed raw bytes plus tamper rejection.
Use `test_command_transport.py` for CLI/benchmark whole current/earlier DoD and regression commands, malformed declarations, driver order, `check` scope, and fatal-core state boundaries; use `test_arm_runtime.py` for whole accepted command/ID regressions and evaluation exclusion.
For identity transport, inspect ARM raw whole-ID/suffix precedence, miss-only LF fallback with CR preserved, current/counter-migrated/next exact coordinates, and next validation before passing-round flush but after current command effects. For additive judge fields/calibration, coordinate `tests/test_judge_calibration.py` with the judge owner; do not infer that the core enforces availability.
Use the existing ledger suites for chain/verdict consumers, judge/diff/drift suites for oracle/scope/diff changes, and CLI/ask/hook checks when their consumed contracts change.
For transition-record changes, select `tests/test_command_transport.py` and `tests/test_arm_runtime.py` record-fault cases; inspect the named failed append, before/after transition/budget files, absence of normal disposition output, cleanup, and recovery. State-write failure after a successful record must still report an error; it is not rollback.
For release ordering, select `tests/test_await_human.py::test_release_record_failure_keeps_reason_and_parked_budgets`; failed `human-release` evidence must leave the reason and parked budgets intact before a successful recovery.
For duplicate-key/final-root-h reader compatibility, coordinate `tests/test_audit_runtime.py` with [audit](../relay-audit/SKILL.md); require escaped/nested duplicates and unsigned suffix rejection plus nested-h/raw-body acceptance. Reader coverage does not grant a source or test edit claim.
Treat `tests/test_concurrent_gate.sh` as CLI `.run.lock` coverage with one appender, not a test of simultaneous chain appends.
For append-lock changes, require concurrent `bin/relay-note` or direct `relay_chain_append` writers sharing one scratch ledger without the CLI run lock; inspect each writer's exit, exact expected entry count, contiguous `seq`/`prev`, and offline verification.
`test_gate_core_runtime.py::test_direct_concurrent_appenders_keep_chain_contiguous` provides that direct-writer check; do not substitute the CLI exclusion suite.
Run [documentation checks](../relay-maintenance/SKILL.md) after a skill update; hand shared index regeneration to the lead.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every gate-core change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read `lib/relay-gate.sh`, `bin/relay-note`, caller and reader contracts, and affected documentation, then run the named applicable commands in Checks.
- Inspect exact signed bytes, `h` placement, optional-field omission, plain/keyed modes, append failure paths, and the distinction between chain and evaluation locks across every affected caller.
- Inspect reserved output names, empty/null checklist acceptance versus all nonarray rejection, root-h append refusal versus nested-h data, and mandatory record-before-publication ordering. Confirm late state-write failures are not described as rollback or atomic publication.
- Compare oracle formulas with audit readers and inspect judge labels, blocking behavior, parameter substitution, and computed-diff coverage; refuse unsupported or stale claims and missing dependencies.
- Inspect exact ID/assertion/command/criterion/scope decoding, whole-program final status, malformed/NUL rejection, judge process status and response schema, advisory failure recording, and explicit fatal-write propagation without relying on errexit. Require preserved historical-ledger bytes and new-record audit agreement.
- Require direct concurrent-writer evidence for append-lock changes; a valid chain from the CLI exclusion test does not establish append-race coverage.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently inspect results rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Preserve and report `relay: could not take the chain lock for ...` or ledger-append diagnostics; inspect the owning process before removing a stale lock.
- Treat malformed append bodies as nonzero failures with diagnostics and owned-lock cleanup; preserve the rejected input for investigation. Do not convert missing verdict writes into a normal pass.
- Do not treat plain hashes as unforgeable; isolate the HMAC key from the runner before claiming an adversary-resistant boundary.
- Preserve the current oracle's limits: `context`, `diff`, and `blocking` are not part of the judge oracle formula.
- New commands/criteria/scope and whole regression commands retain trailing LF for hashes; false mismatch from old LF stripping/fragmentation is historical, not a current authoring restriction. Do not rewrite or reseal retained ledgers to obtain agreement.
- Report unavailable judges and diff failures with their recorded labels; do not replace them with deterministic passes.
- Keep invalid declared oracles separate from judge-response failures: the former are named plan-control failures, while an actual advisory response failure records fail without blocking. Empty hashes from unavailable declarations are unusable audit oracles, not legacy absent fields.
- Mandatory ARM/CLI/benchmark evidence and disposition appends now propagate failure before their corresponding state publication. Residual tolerated ARM ancillary paths include cap-risk, inject/inject-missing, unknown-kind, and blocked-claim; archives remain best-effort. Earlier binding/usage/bookkeeping, command effects, partial prefixes, and later state-write failures remain possible; do not claim atomicity, fsync-backed durability, or rollback.

## Done

Return changed helpers, affected callers and readers, exact serialization or oracle impact, selected check outcomes, and independent-review handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.

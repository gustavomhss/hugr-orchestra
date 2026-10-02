---
name: relay-maintenance
description: Directs scoped Relay maintenance and documentation verification when agents change source contracts or operational skills.
---

# Relay maintenance

## Trigger

Use this skill for a source fix, contract change, module maintenance task, or agent-skill update.
Run every command below from repository root and select checks for the actual change.

## Read first

- Read [AGENTS.md](../../../AGENTS.md), the assigned baseline, and the task's exact edit allowlist.
- Read [ownership](../relay-ownership/SKILL.md) and [docs/skills.json](../../../docs/skills.json) to locate source owners.
- Read [blast radius](../relay-blast-radius/SKILL.md) and the owning module skills to select checks and consumers.
- Read [CONTRIBUTING.md](../../../CONTRIBUTING.md) and [SPEC.md](../../../SPEC.md) for terminology and intended contracts; verify shipped behavior in source and tests.

## Ownership

Own the maintenance procedure in this skill, not the implementations assigned to module skills.
Keep edit claims disjoint and obtain review from an agent that did not author the change.
During a documentation wave, send shared catalog, validator, routing-page, and index changes to the lead.
Keep new operational documentation in agent skills and use [integration](../relay-integration/SKILL.md) for harness setup.

## Contracts

- Preserve bounded retries, recorded verdict provenance, and each engine's actual advancement behavior.
- Preserve whole decoded NUL-free command strings, including tabs and interior/trailing LF, through compact JSONL regression and CLI/benchmark DoD transport; execute each as one Bash program and hash full checklist oracles. Final shell exit status decides acceptance; there is no single-line authoring restriction.
- Preserve exact historical ledger bytes; optional additions still change hashes when emitted.
- Require ARM/CLI/benchmark evidence and transition appends to succeed before corresponding counter/state/retry/release updates; failure is fatal. Some ARM ancillary appends and archives remain best-effort, without atomicity or rollback.
- Require duplicate-free ledger decoding at every depth, including escaped-equivalent keys, and one final root `h`; writers reject supplied root `h`. Preserve exact signed-body bytes.
- Preserve deterministic versus non-independent judge labels and distinguish unavailable evaluation from a passed control. Malformed/missing judge output or nonzero process exit records unavailable `fail`; it blocks when the item is blocking.
- Keep absent usage and elapsed data distinct from measured zero; cost and dashboard views are not billing or full spend coverage.
- Treat same-user filesystem access as the current trust boundary; HMAC requires isolation of the signing key from the runner to strengthen it.
- Preserve run and fixture evidence; repair implementation or explain a failure rather than rewriting evidence to pass.
- Describe local checks as local checks; the current baseline has no configured CI pipeline.

## Procedure

1. Inspect the worktree before editing:

   ```bash
   git status --short
   git rev-parse HEAD
   git diff --stat
   ```

2. Compare HEAD with the assigned baseline; investigate pre-existing changes and stop if the task requires a different baseline.
3. Claim exact paths through [ownership](../relay-ownership/SKILL.md), then classify the change through [blast radius](../relay-blast-radius/SKILL.md).
4. Read the affected implementation and named regression tests; derive shipped behavior from executable paths rather than stale comments.
5. Apply the smallest change that addresses the observed contract; update the owning skill and affected contract documentation.
6. Select targeted tests before running them; run check groups sequentially rather than launching all suites concurrently.
7. Inspect exit codes, captured diagnostics, skipped tests, and the actual state or artifact each check measures.
8. Request lead-owned catalog and index updates, then hand frozen changes to the independent reviewer.

## Checks

For documentation changes, run the repository documentation guard and tests:

```bash
python3 bin/check-docs.py
python3 -m pytest tests/test_docs.py -q
```

Have the lead regenerate the shared index after all skill edits land, then check the result:

```bash
python3 bin/gen-doc-index.py
python3 bin/gen-doc-index.py --check
```

Read the current generator and validator before claiming coverage; the index covers authored root Markdown and recursively selected Markdown under `docs/`, `benchmark/`, `examples/`, and `.opencode/skills/`.
Treat the guard's link, skill-structure, and catalog-ownership checks as structural validation, not semantic freshness or evidence that cold review occurred.
Report dependency or import failures as blocked checks rather than treating their commands as successful; use `requirements-dev.txt` for documentation-check dependencies.

For gate evaluation, oracle, or ledger changes, select this shared runtime group:

```bash
python3 -m pytest tests/test_gate_core_runtime.py tests/test_audit_runtime.py tests/test_relay.py tests/test_ledger_provenance.py tests/test_judge_diff.py tests/test_oracle_drift.py tests/test_sprint_diverged.py -q
```

For arm binding, state, or retry changes, select this arm group:

```bash
python3 -m pytest tests/test_arm_runtime.py tests/test_arm_binding.py tests/test_arm_state.py tests/test_await_human.py tests/test_backoff.py tests/test_blocked_claim.py tests/test_cap_preflight.py tests/test_position_by_id.py tests/test_position_macro.py tests/test_kinds.py tests/test_self_check.py tests/test_cost.py -q
```

For CLI or service changes, run the relevant group and explicit shell checks when their contracts are affected:

```bash
python3 -m pytest tests/test_command_transport.py tests/test_gate_cli.py tests/test_daemon.py tests/test_ask.py -q
bash tests/test_concurrent_gate.sh
bash tests/test_arm_hook.sh
```

Use narrower module selections for isolated changes; run runtime groups only when the changed contract requires them.
`tests/test_gate_core_runtime.py` covers exact oracle bytes, unavailable blocking/advisory judges, malformed required oracles/append bodies, and direct concurrent appenders. `tests/test_arm_runtime.py` covers whole accepted-control regression and ARM run-lock contention/cleanup.
Treat `tests/test_concurrent_gate.sh` as CLI run-lock coverage: only one evaluation appends; append-lock changes need the direct concurrent-writer cases in `tests/test_gate_core_runtime.py` and the owning skill's evidence requirements.
`tests/test_command_transport.py` covers current/earlier DoD pass/fail, multiline/tab/trailing-LF transport, malformed DoD, driver order/regression policy, and `eval` versus `check`. `tests/test_gate_cli.py` covers named `check` position/base-ref overrides as well as checklist outcomes.
Select `tests/test_audit_runtime.py` for bidirectional named-control comparison, invalid sprint/record schema, legacy missing-oracle status, and malformed chains; retain the no-current-artifact-revalidation boundary.
Select `tests/test_profile_compile.py` for compiler/later-binding namespace separation, `tests/test_judge_cli.py`, `tests/test_judge_api.py`, and `tests/test_judge_calibration.py` for typed availability/transport/votes, `tests/test_benchmark_runtime.py` for real disposable pytest/JUnit measurement validity, and `tests/test_example_completion.py` for strict fleet completion and its real last-gate escalation negative control.
Require append-fault ordering cases in `tests/test_arm_runtime.py`/`tests/test_command_transport.py`, exact identity cases in `tests/test_arm_runtime.py`/`tests/test_gate_cli.py`, and duplicate/nested/escaped-key/final-root-`h` cases in `tests/test_audit_runtime.py`.
Do not use `python3 -m pytest tests/ -q` as the default for a documentation-only edit.
Run shell scripts explicitly; pytest does not collect them as shell tests.
For a changed guard, prove the check rejects a controlled broken case in an isolated scratch copy before claiming protection.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every maintenance change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read the owned sources, consumer contracts, and affected documentation, then run the named applicable checks in Checks and the affected module skills.
- Validate operation sequencing, before/after state, lock cleanup, and restoration of isolated scratch changes from recorded evidence; verify that retained run and fixture evidence was preserved.
- Confirm that commands measured the claimed artifacts, prerequisites existed, and skipped or unexecuted checks were reported; refuse unsupported or stale claims and missing dependencies.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently verify operation and restoration evidence rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Preserve stderr and exit codes; distinguish infrastructure errors, busy state, gate failures, escalation, and documentation drift.
- If a check cannot run, record its exact command, missing prerequisite, and unverified contract.
- Route `.chain.lock` and ARM/CLI `.run.lock` incidents through the owning skill; establish whether a process still holds the lock before cleanup. ARM/CLI run-lock contention exits `3` without grading or state mutation.
- Inspect ARM release through [arm hook](../relay-arm-hook/SKILL.md): whitespace-only reasons are rejected; cleanup targets the resolved full WP ID, legacy index retry and `reg_retry`, restoring a fresh budget without skipping the same gate. Unresolved position retains the release.
- Report source-versus-spec gaps explicitly; do not turn intended behavior into a shipped guarantee.
- Stop out-of-claim edits and request a handoff; do not stage, commit, push, or create a PR without an explicit user request.

## Done

Return the diff scope, source citations, selected checks and outcomes, reviewer, and remaining integration blockers.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.
Require the lead's integrated catalog, link, documentation-test, and index checks before calling a documentation wave complete.

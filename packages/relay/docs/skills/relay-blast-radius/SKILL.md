---
name: relay-blast-radius
description: Maps Relay changes to consumers, tests, and agent documentation when agents assess maintenance impact before editing.
---

# Relay blast radius

## Trigger

Use this skill before changing a source contract, ledger field, sprint schema, state layout, CLI response, HTTP route, or module skill.
Use the map to select concrete consumers and checks rather than running every suite by default.

## Read first

- Read [ownership](../relay-ownership/SKILL.md) and [docs/skills.json](../../../docs/skills.json) for canonical source assignments.
- Read [lib/relay-gate.sh](../../../lib/relay-gate.sh), the affected caller, and its regression tests for shipped behavior.
- Read [SPEC.md](../../../SPEC.md) for terminology and intended behavior; label source-versus-spec differences explicitly.
- Read [maintenance](../relay-maintenance/SKILL.md) for execution order and [integration](../relay-integration/SKILL.md) for harness-facing updates.

## Ownership

Own impact routing in this skill; obtain source edit claims from each module's maintenance skill.
Treat test overlap as coverage, not duplicate source ownership or permission for overlapping edits.
Send catalog, routing-page, validator, and index edits to the lead during a documentation wave.

## Contracts

- Treat executable source and exercised tests as authority for shipped behavior; use design prose to identify intent and unresolved gaps.
- Preserve raw ledger serialization and the placement of `h` last; reformatting JSON changes the signed body.
- Treat additive ledger fields as byte-affecting changes: omit optional fields when unset and preserve historical evidence unchanged.
- Distinguish chain integrity, recorded deterministic verdicts, oracle continuity, sprint comparison, and current artifact validity. Sprint comparison covers named IDs both ways; it does not reexecute controls or compare every plan field.
- Preserve full compact-JSONL control transport and exact decoded command/judge bytes, including tabs and interior/trailing LF; regression hashes full commands, and CLI/benchmark DoD executes each whole shell program by final exit status. NUL is unsupported; no single-line restriction remains.
- Keep plain SHA-256 described as resealable by a writer; HMAC requires a signing key isolated from the runner.
- Describe the same-user trust boundary accurately; a model-facing hook does not isolate writable state from a process with the same permissions.
- Distinguish chain append locking, ARM/CLI whole-evaluation run locking, and daemon in-process request serialization; ARM/CLI run-lock contention exits `3` with stderr.
- Preserve absence-versus-zero semantics in cost readers; dashboard and cost views do not establish billing or full spend coverage.

## Procedure

1. Enumerate changed source paths and contracts, including fields omitted on legacy paths.
2. Resolve source owners through the catalog and load their module skills.
3. Follow these consumer edges and include each reader whose assumptions change:

   | Changed surface | Direct consumers and downstream readers |
   |---|---|
   | `lib/relay_authoring/` | Direct Python authoring regression tests and frozen parity generators; daemon/CLI evaluation and audit within that test service. Installed screens use native Server handlers, not this host |
   | `lib/relay-gate.sh` | `bin/relay-arm-hook.sh`, `bin/relay-gate`, `bin/relay-note`, `benchmark/relay_hook.sh`; audit, corpus, and dashboard readers |
   | `bin/relay-note` | Daemon wait-channel ledger notes; offline chain verification |
   | `bin/relay-arm-hook.sh` | Armed harness payloads, arm state readers, fleet-chain example, corpus retention, audit and telemetry |
   | `bin/relay-gate` | Non-Claude drivers, daemon `/gate/eval`, daemon `/ask` named-position/base-ref precondition checks, offline audit |
   | `bin/relay` | Audit consumers using JSON and exit codes; problem and cost views |
   | `bin/relay-daemon.py` | HTTP gate clients, arm ask/answer clients, CLI and note subprocess contracts |
   | `benchmark/judge.py` | Shared checklist evaluation, blocked-claim corroboration, benchmark calibration |
   | `benchmark/calibrate_judge.py` | Judge calibration cases, selected backend, and agreement measurements |
   | `benchmark/verify_ledger.py` | `bin/relay` chain status, `bin/relay-corpus.py` integrity filtering and downstream `bin/relay-dash.py`, benchmark and example integrity checks |
   | `benchmark/grader.py`, `benchmark/run_crossover.py` | Run `grade.json`, model-envelope/reference guards, crossover validity/headroom reports, campaign analysts |
   | Profiles, specs, policies | Sprint generation and control IDs; hook/CLI evaluation and oracle recheck |
   | Planning, specification, design, research tools | Checklist commands in shipped profiles and their artifact readers |
   | Doc tooling and module skills | Agent routing, catalog coverage, relative links, and generated documentation index |

   Interpret catalog arrows as module-uses-dependency, including `gate-core -> judge`, `research -> judge`, and `benchmark -> gate-core/audit/judge`; find consumers by reverse traversal and confirm call sites in source before selecting checks.

4. Select the change-to-check rows below; invoke Python tests with `python3 -m pytest <paths> -q` from repository root.
5. Update the owning skill and related workflow skill; treat legacy pages below as contract references requiring reconciliation when affected.
6. Run selected groups sequentially and report unexecuted consumer checks by name.

## Checks

| Change | Targeted tests or commands | Documentation to review |
|---|---|---|
| Retained Python authoring service/compiler | `tests/test_authoring.py`, `tests/test_authoring_hooks.py`; native handler changes select Orchestra `test/server/httpapi-relay.test.ts` through CI | [authoring](../relay-authoring/SKILL.md), [authoring API](../../../docs/authoring-api.md) |
| Chain serialization or MAC | `tests/test_gate_core_runtime.py`, `tests/test_audit_runtime.py`, `tests/test_relay.py`, `tests/test_ledger_provenance.py` | [gate-core](../relay-gate-core/SKILL.md), [audit](../relay-audit/SKILL.md), [control plane](../../../docs/control-plane.md) |
| Shared-chain append locking | `tests/test_gate_core_runtime.py` runs concurrent `bin/relay-note` writers sharing the append lock; require their exact count/sequence/link/exit evidence. `tests/test_concurrent_gate.sh` serializes through the CLI run lock and does not race appenders | [gate-core](../relay-gate-core/SKILL.md), [audit](../relay-audit/SKILL.md) |
| Mandatory evidence/transition append ordering | `tests/test_arm_runtime.py`, `tests/test_command_transport.py`, `tests/test_await_human.py`; require fatal append faults before corresponding state/retry/release updates, not atomicity or rollback | [arm hook](../relay-arm-hook/SKILL.md), [gate CLI](../relay-gate-cli/SKILL.md), [benchmark](../relay-benchmark/SKILL.md) |
| Checklist commands, judge scope, computed diff | `tests/test_gate_core_runtime.py`, `tests/test_command_transport.py`, `tests/test_arm_runtime.py`, `tests/test_relay.py`, `tests/test_judge_diff.py`, `tests/test_sprint_diverged.py` | [gate-core](../relay-gate-core/SKILL.md), [gate CLI](../relay-gate-cli/SKILL.md), [gates](../../../docs/gates.md) |
| Oracle or origin encoding, generations | `tests/test_gate_core_runtime.py`, `tests/test_audit_runtime.py`, `tests/test_ledger_provenance.py`, `tests/test_oracle_drift.py`, `tests/test_sprint_diverged.py` | [gate-core](../relay-gate-core/SKILL.md), [audit](../relay-audit/SKILL.md), [telemetry](../relay-telemetry/SKILL.md) |
| Transcript and agent binding | `tests/test_arm_binding.py`, `tests/test_arm_state.py`, `tests/test_arm_runtime.py`; `bash tests/test_arm_hook.sh` | [arm hook](../relay-arm-hook/SKILL.md), [integration](../relay-integration/SKILL.md), [per-agent arms](../../../docs/per-agent-arms.md) |
| Arm retry, parking, release, blocked claims | `tests/test_await_human.py` covers whitespace rejection and full qualified/dotted-ID reset; `tests/test_arm_runtime.py`, `tests/test_backoff.py`, `tests/test_blocked_claim.py`, `tests/test_arm_state.py` | [arm hook](../relay-arm-hook/SKILL.md), [audit](../relay-audit/SKILL.md), [enforcement model](../../../docs/enforcement-model.md) |
| ARM run lock and cleanup | `tests/test_arm_runtime.py` covers held/concurrent locks, no duplicate grading/state charges, and owned-lock/round-buffer cleanup | [arm hook](../relay-arm-hook/SKILL.md), [integration](../relay-integration/SKILL.md), [maintenance](../relay-maintenance/SKILL.md) |
| Position, exact identities, macros, kinds, instructions | `tests/test_arm_runtime.py`, `tests/test_gate_cli.py`, `tests/test_position_by_id.py`, `tests/test_position_macro.py`, `tests/test_kinds.py`, `tests/test_self_check.py`, `tests/test_gate_core_runtime.py` | [arm hook](../relay-arm-hook/SKILL.md), [profiles](../relay-profiles/SKILL.md), [Relay v2](../../../docs/relay-v2.md) |
| Harness block-cap estimate warning | `tests/test_cap_preflight.py` checks the implemented estimate, not a proven minimum block count | [arm hook](../relay-arm-hook/SKILL.md), [integration](../relay-integration/SKILL.md) |
| Usage cursor or elapsed fields | `tests/test_cost.py` | [arm hook](../relay-arm-hook/SKILL.md), [audit](../relay-audit/SKILL.md), [telemetry](../relay-telemetry/SKILL.md) |
| CLI outcome, counter, checklist regression or run lock | `tests/test_command_transport.py`, `tests/test_gate_cli.py`, `tests/test_daemon.py`, `tests/test_ask.py`; `bash tests/test_concurrent_gate.sh` for CLI evaluation exclusion | [gate CLI](../relay-gate-cli/SKILL.md), [daemon](../relay-daemon/SKILL.md), [SDK](../../../docs/sdk.md) |
| CLI/benchmark DoD or `eval`/`check` boundary | `tests/test_command_transport.py` covers current/earlier DoD pass/fail, whole-program transport, malformed required commands, driver scope, and mode comparison; `tests/test_gate_cli.py`, `tests/test_ask.py` cover named `check` position/base-ref overrides | [gate CLI](../relay-gate-cli/SKILL.md), [daemon](../relay-daemon/SKILL.md), [benchmark](../relay-benchmark/SKILL.md) |
| Audit banners, JSON, exits, sprint lookup/set/schema comparison | `tests/test_audit_runtime.py`, `tests/test_relay.py`, `tests/test_oracle_drift.py`, `tests/test_sprint_diverged.py`, `tests/test_await_human.py` | [audit](../relay-audit/SKILL.md), [integration](../relay-integration/SKILL.md) |
| Offline chain-verifier results or integrity filtering | `tests/test_audit_runtime.py`, `tests/test_relay.py`, `tests/test_corpus.py`, `tests/test_dash.py` | [audit](../relay-audit/SKILL.md), [telemetry](../relay-telemetry/SKILL.md) |
| HTTP gate mapping or validation | `tests/test_daemon.py`, `tests/test_gate_cli.py` | [daemon](../relay-daemon/SKILL.md), [integration](../relay-integration/SKILL.md), [daemon reference](../../../docs/daemon.md) |
| Wait-channel notes, tickets, caps, answers | `tests/test_ask.py`, `tests/test_await_human.py`; require the gate-core direct concurrent-writer cases when append locking changes | [daemon](../relay-daemon/SKILL.md), [gate-core](../relay-gate-core/SKILL.md), [enforcement model](../../../docs/enforcement-model.md) |
| Corpus or dashboard event readers | `tests/test_corpus.py`, `tests/test_dash.py`, `tests/test_cost.py` | [telemetry](../relay-telemetry/SKILL.md), [trace corpus](../../../docs/trace-corpus.md), [telemetry reference](../../../docs/telemetry.md) |
| Profile compilation or shipped profile data | `tests/test_profile_compile.py` includes compiler/later-binding collision cases; `tests/test_shipped_profiles.py`, `tests/test_kinds.py`, `tests/test_sprint_diverged.py` | [profiles](../relay-profiles/SKILL.md), [profiles reference](../../../docs/profiles.md) |
| Auto-decomposition or generated sprint lint | `tests/test_autodecompose.py`, `tests/test_spec_lint.py` | [autodecompose](../relay-autodecompose/SKILL.md), [auto-decompose reference](../../../docs/auto-decompose.md) |
| Spec library resolution | `tests/test_spec.py`, `tests/test_spec_lint.py` | [spec library](../relay-spec-library/SKILL.md), [spec-library reference](../../../docs/spec-library.md) |
| Policy application and provenance | `tests/test_policy.py`, `tests/test_ledger_provenance.py` | [policies](../relay-policies/SKILL.md), [guardrails](../../../docs/guardrails.md) |
| Planning tools | `bash tools/edd/plan-check-selftest.sh "$bench_root" "$repo_root"` with Bash 4+ and supplied fixture inputs; crash/usage smoke only | [planning](../relay-planning/SKILL.md), [profiles](../relay-profiles/SKILL.md) |
| Specification or design checkers | `tests/test_spec_check.py`, `tests/test_design_check.py` as affected | [specification](../relay-specification/SKILL.md), [design](../relay-design/SKILL.md) |
| Research capture, checks, replay tools | `tests/test_research_capture.py`, `tests/test_research_check.py`, `tests/test_research_tools.py` as affected | [research](../relay-research/SKILL.md), [profiles](../relay-profiles/SKILL.md) |
| Judge runtime, typed availability, backend transport, artifact delivery, or calibration | `tests/test_judge_cli.py`, `tests/test_judge_api.py`, `tests/test_judge_calibration.py`, `tests/test_gate_core_runtime.py`, `tests/test_judge_context.py`, `tests/test_judge_diff.py`, `tests/test_relay.py` as affected | [judge](../relay-judge/SKILL.md), [gate-core](../relay-gate-core/SKILL.md), [research](../relay-research/SKILL.md) |
| Benchmark hook, drivers, grader, generators, or campaigns | `tests/test_benchmark_runtime.py` exercises real disposable pytest/JUnit validity, generated reference/skeleton/cheat discrimination and recorded-run validity; `tests/test_command_transport.py` covers hook DoD transport. Use the benchmark skill's additional discrimination checks and explicitly authorized model runs when those contracts require them | [benchmark](../relay-benchmark/SKILL.md), [audit](../relay-audit/SKILL.md), [judge](../relay-judge/SKILL.md), [gate-core](../relay-gate-core/SKILL.md) |
| Scripted examples | `tests/test_example_completion.py`; `python3 examples/fleet-chain/run_example.py`; select `tests/test_relay.py::test_fleet_chain_example` | [examples](../relay-examples/SKILL.md), [integration](../relay-integration/SKILL.md) |
| Skills, catalog, links, index tooling | `python3 bin/check-docs.py`; `python3 -m pytest tests/test_docs.py -q`; lead runs `python3 bin/gen-doc-index.py` then `python3 bin/gen-doc-index.py --check` | [doc tooling](../relay-doc-tooling/SKILL.md), [ownership](../relay-ownership/SKILL.md), [maintenance](../relay-maintenance/SKILL.md) |

Set `bench_root` to the supplied fixture root and `repo_root` to the repository being checked; use a Bash 4+ binary for the planning command because the script uses associative arrays.
Supply fixture subdirectories containing `frame.json` and the relevant `packages.json`, `sequence.json`, `manifest.json`, and packet inputs; selftest exit 0 permits control failures and does not assert expected-verdict agreement.
Require known accepted/rejected planning fixtures and direct verdict comparisons through [planning](../relay-planning/SKILL.md) when acceptance behavior changes.
Load [benchmark](../relay-benchmark/SKILL.md) for reference-pass, skeleton-fail, visible-cheat-fail and actual holdout/JUnit discrimination evidence; live runner checks require explicit authorization and are not documentation checks.
Read the current doc tooling before claiming coverage: the generator indexes authored Markdown including agent skills, while the guard checks links, skill structure, and catalog ownership rather than semantic freshness or completed cold review.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every impact assessment and change governed by this skill.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read the owned sources, consumer contracts, and affected documentation, then run the named applicable checks selected from Checks and the affected module skills.
- Trace actual consumer call sites and test bodies; confirm consumer and test reach from executable evidence rather than guessing from filenames or the author's impact map.
- Identify omitted consumers, narrower check coverage, and missing catalog dependencies; refuse unsupported or stale reach claims and unresolved source or documentation dependencies.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; use independent reach assessment rather than the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Report source facts precisely: arm `human` kind is unsupported; unknown kinds, missing injections, and lost positions exit 0 without automatically parking.
- Treat `complete` as a completed-state observation, not continuous artifact revalidation; later arm fires do not rerun completed gates.
- Treat CLI `escalate` as an outcome without an arm-style persistent latch; the driver must decide whether to call again.
- Treat ARM `len(work_packages)+1` as the implemented cap-warning estimate; the last passing gate emits no block, so this is not a proven block-count lower bound.
- Inspect exact decoded command/judge bytes and current plan before diagnosing oracle drift; full JSONL transport now preserves interior/trailing LF, so the old fragment-hash workaround is not an installed authoring constraint.
- Keep `.chain.lock` append serialization distinct from ARM/CLI `.run.lock` evaluation serialization; neither prevents concurrent artifact edits or authenticates writers.
- Preserve malformed or divergent evidence for investigation; broken chains produce exit `1`, intact unusable records or invalid supplied/discovered sprints produce exit `2`. Inspect `record_errors` and `oracle_recheck`; these checks do not validate every plan field or current artifact.
- Report missing catalog entries, sibling skills, or shared documentation tooling as integration blockers instead of inventing ownership.

## Done

Return affected sources, direct consumers, selected checks, documentation updates, and residual unverified contracts.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.
Keep the impact claim no broader than the sources and checks inspected by the reviewer.

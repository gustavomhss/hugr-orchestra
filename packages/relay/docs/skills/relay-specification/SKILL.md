---
name: relay-specification
description: Use when deriving or validating Relay spec-decompose registries, scenarios, and work-package coverage.
---

## Trigger
Use this skill for `profiles/spec-decompose.yaml` or failures in invariant, requirement, behavioral-spec, scenario, and package registries.
Use [relay-profiles](../relay-profiles/SKILL.md) for executable-spec catalog rendering and general compiler contracts.

## Read first
Read [spec-decompose.yaml](../../../profiles/spec-decompose.yaml) and [compiled sprint](../../../profiles/spec-decompose.sprint.json).
Read [spec-check](../../../tools/spec/spec-check): `check_invariants`, `check_requirements`, `check_spec`, `check_goldens`, `check_work_packages`.
Read [criterion adapter](../../../tools/criterion) and [spec-check tests](../../../tests/test_spec_check.py), especially `GOOD`, `MUTATIONS`, and `ATOMICITY`.
Read [judge context wiring](../../../lib/relay-gate.sh): `relay_run_checklist`.

## Ownership
Limit source work to the assigned subset of `profiles/spec-decompose.yaml` and `tools/spec/spec-check`.
Treat `profiles/spec-decompose.sprint.json` as generated data; compile with `--qualify-ids`.
Keep authored registries and `review-*.json` under the run's bound `spec_dir`.
Coordinate report-interface changes with `tools/criterion`; coordinate engine/renderer changes with [relay-profiles](../relay-profiles/SKILL.md).

## Contracts
Consume frozen product intent through runner context; do not fabricate an upstream requirement to justify a package.
Produce `invariants.json` as entries with `id`, `statement`, `grounding`, and `falsifier`.
Produce `requirements.json` with `id`, `statement`, and `source_invs` referencing the invariant register.
Use checker field `source_invs`; do not confuse it with YAML `output_contract` field `source_invariants`.
Produce `spec.json` with `interfaces[{name,inputs,outputs,errors,source_reqs}]` and `edge_cases`.
Produce `scenarios.json` with `id`, `kind: happy|guard`, `given`, `when`, `then`, `source_req`, and `can_fail`.
Produce `packages.json` with `id`, `intent`, `source_reqs`, `acceptance`, and `deps`.
Produce `review-{invariants,requirements,spec,goldens,work_packages}.json` for the profile's separate review controls.
Emit phase reports as `[{criterion,status,evidence}]`; use exit 0 for no FAIL, 1 for FAIL, and 2 for usage/non-directory input.
Keep per-criterion controls on producing states and phase validation on gates; keep review verdict, length, and judge controls distinct.
Expect downstream consumption by work-package execution and planning only through explicitly bound cards/artifacts; compilation does not dispatch them.
Do not claim automatic final-output schema validation: the compiler omits YAML `output_contract`.

## Procedure
Run every command from the repository root; bind `spec_dir` to the actual registry directory.
Use Python 3 stdlib for checker/adapter, PyYAML for compilation, pytest for tests, and jq for the profile's JSON review controls.
Read frozen intent, register grounded invariants, derive requirements, specify boundaries, write happy/guard scenarios, then partition requirements into WPs.
Keep the normative contract in the artifacts even where the checker only measures a proxy.
Run phase checks as artifacts become available:
```sh
python3 tools/spec/spec-check --phase invariants --spec-dir "$spec_dir" --json
python3 tools/spec/spec-check --phase requirements --spec-dir "$spec_dir" --json
python3 tools/spec/spec-check --phase spec --spec-dir "$spec_dir" --json
python3 tools/spec/spec-check --phase goldens --spec-dir "$spec_dir" --json
python3 tools/spec/spec-check --phase work_packages --spec-dir "$spec_dir" --json
python3 tools/criterion tools/spec/spec-check work_packages coverage_matrix_closed --spec-dir "$spec_dir"
```
Arrange a cold reviewer explicitly; `kind: review` does not create a new context.
Write item-specific findings; note that review controls actually measure `findings` length >=200 characters, despite assertions saying 40 words.
Inspect judge `paths` and `context`: each phase receives its artifact diff and its review file, not automatically the frozen intent or upstream registries.
Check DERIVED/COMPLETE claims against actual upstream artifacts yourself; report evidence omitted from judge inputs.
Recheck dependent registries after renumbering or upstream amendments; prior semantic verdicts do not automatically bind new artifact bytes.
Propagate changed criterion names, data fields, phase names, or review inputs to YAML mappings, generated JSON, tests, downstream cards, and this skill.

## Checks
Run generated-data, lint, structural mutation, and judge-context checks:
```sh
python3 bin/relay-profile.py profiles/spec-decompose.yaml --qualify-ids -o profiles/spec-decompose.sprint.json --check
python3 bin/relay-spec.py lint profiles/spec-decompose.sprint.json --json
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_spec_check.py tests/test_profile_compile.py tests/test_shipped_profiles.py tests/test_judge_context.py
git diff --check
```
Use `test_a_good_spec_passes_every_phase`, `test_each_criterion_catches_its_own_mutation`, and `test_every_criterion_has_a_mutation` as checker calibration.
Use the atomicity cases to retain honest noun lists and the documented comma-separated-obligation blind spot.

## Cold review
Require a reviewer other than the author, working in a fresh, isolated context without the author's conversation.
Freeze the baseline revision, complete diff including untracked drafts, and exact artifact/file list with content digests before review.
Have the reviewer read the linked checker/adapter, compiler and gate/judge consumers, spec-decompose YAML/compiled profile, [historical fixtures](../../../docs/fixtures/), test GOOD/MUTATIONS, frozen intent, and registry contracts.
Challenge structural reach versus semantic claims: grounding presence, atomicity heuristics, truthy can_fail declarations, dependency-ID existence without cycle rejection, and omitted output validation.
Inspect phase-review context and executor-writable APPROVE verdicts; verify access to actual upstream artifacts before endorsing DERIVED/COMPLETE claims.
Have the reviewer run the named applicable checks under Checks and record commands, exits, and skips; do not substitute the author's prior results for independent review.
For changed checkers, require a known-good pass and a targeted registry mutation rejected by the intended criterion, not an unrelated crash or empty report.
Require an APPROVE/FIX-FIRST/REJECT report identifying the frozen snapshot, exact file-path evidence, commands/exits, and residual limitations.
Fix every FIX-FIRST, freeze the revised diff/artifact list, and obtain independent re-review; stop on REJECT until the scope or contract is resolved.
Treat this as a mandatory review procedure, not mechanical enforcement or proof that reviewers cannot miss bugs; do not infer commit/PR authorization from the verdict.

## Failure handling
Stop on missing or invalid primary artifacts; report the phase and named criterion instead of manufacturing a PASS field.
Treat malformed shapes that crash or leave other criteria passing as checker limits, not evidence that every input fails closed.
Treat grounding/falsifier presence as declarations; the checker neither reads the cited intent nor proves observable falsifiability.
Treat `requirements_atomic` and the finite ambiguity vocabulary as heuristics; alternate wording can evade them or yield false positives.
Do not claim unique/dense IDs across every registry, GWT validation, or acceptance-SCN resolution; those properties are not fully checked.
Treat `every_scenario_can_fail` as truthiness of `can_fail`, not execution of a test or a mutation proof.
Treat `dependencies_mapped` as existence of referenced WP IDs only; self-dependencies and cycles are not rejected by this checker.
Inspect [self-graded review residuals](../../../docs/FINDING-self-graded-review-verdicts.md): executor-writable APPROVE files still participate in these gates.
Do not count a blocking judge as deterministic proof; preserve missing-context and backend limitations in the result.

## Done
Require independent APPROVE on the current frozen snapshot plus applicable validation before declaring completion; keep pending review explicit.
Return registry paths, traceability gaps, actual phase results, reviewer inputs, and any separate cycle/scenario verification performed.
State which guarantees remain manual or semantic; distinguish mutations of checker fixtures from mutation-probing the delivered implementation.

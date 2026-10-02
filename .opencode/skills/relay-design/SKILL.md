---
name: relay-design
description: Use when preparing or validating Relay design artifacts from intake through ratification with design-check.
---

## Trigger
Use this skill for `profiles/design.yaml`, `tools/design/design-check`, or INTAKE/MIRROR/CONCEPT/SHAPE/RISKS/RATIFY artifact work.
Load [relay-profiles](../relay-profiles/SKILL.md) before compiling or binding a design sprint.

## Read first
Read [design.yaml](../../../profiles/design.yaml) and [design.sprint.json](../../../profiles/design.sprint.json).
Read [design-check](../../../tools/design/design-check): all six `check_*` functions, pattern constants, and `main`.
Read [design tests](../../../tests/test_design_check.py): `GOOD`, `MUTATIONS`, and absent-design cases.
Read [ARM kind handling](../../../bin/relay-arm-hook.sh) and [criterion adapter](../../../tools/criterion).
Read [gate core](../../../lib/relay-gate.sh), [judge maintenance](../relay-judge/SKILL.md), and [core-runtime tests](../../../tests/test_gate_core_runtime.py) for blocking semantic response failures.

## Ownership
Limit source work to the assigned subset of `profiles/design.yaml` and `tools/design/design-check`.
Regenerate `profiles/design.sprint.json` with `--qualify-ids`; do not hand-edit it.
Keep run artifacts under bound `design_dir`; preserve owner's recorded utterances separately from your interpretations.
Coordinate compiler, generic adapter, and runtime changes with their owners through [relay-profiles](../relay-profiles/SKILL.md).

## Contracts
Produce `transcript.json` with `contract_presented` and `utterances`; produce `map.json` with `entries` and `rounds`.
Produce `question-log.json` with question entries; quote owner utterances for map `fact`, `term`, and `episode` entries.
Produce `front-page.md` and `readback.json` with explicit chunk responses, verbatim words, correction refs, and disagreement refs.
Produce `doors.json` with alternatives, tradeoffs, aggravated risk axes, chosen/rejected doors, rationale, and map trace IDs.
Produce `skeleton.json` with vertebrae, consumes/produces links, touchpoints, nouns, scenes, and non-goals.
Produce `risks.json` with ranked obituaries, assumptions, probes/seal timestamps, front-page promises, and v1 delivery declarations.
Produce `verdict-{distinctness,dress_rehearsal,no_flinching}.json` for separate review controls.
Produce `memo.md` and `ratify.json` with dissent, assumption ledger, and signature record.
Emit `[{criterion,status,evidence}]`; interpret exits as 0 no FAIL, 1 FAIL, 2 usage/non-directory error.
Preserve profile criteria on producing states and phase validation on gates; use `tools/criterion` for individual rows.
Bind runner instructions explicitly: this YAML carries titles/criteria but no macro system prompts or sub-state descriptions.
Treat `docs/edd/design-protocol.md` cited in checker provenance as frozen external material; do not present it as bundled runtime instructions.
Hand off ratified intent to specification/planning only through explicitly bound artifacts; compilation does not implement that handoff.

## Procedure
Run commands from the repository root; bind `design_dir` to the actual artifact directory.
Use Python 3 stdlib for checker/adapter, PyYAML for compilation, pytest for tests, and jq for the profile's JSON review controls.
Capture listening contract and owner's narrative; distinguish facts, terms, episodes, tensions, assumptions, and your reading.
Keep literal quotes in stored utterances; the checker strips quote ends but does not normalize internal whitespace.
Present front-page chunks to the owner, fold corrections, and record disagreement without overwriting it.
Compare solution doors, rehearse the skeleton, rank risks, seal kill criteria before probes, then assemble memo/ratification.
Run each phase and inspect every criterion:
```sh
python3 tools/design/design-check --phase intake --design-dir "$design_dir" --json
python3 tools/design/design-check --phase mirror --design-dir "$design_dir" --json
python3 tools/design/design-check --phase concept --design-dir "$design_dir" --json
python3 tools/design/design-check --phase shape --design-dir "$design_dir" --json
python3 tools/design/design-check --phase risks --design-dir "$design_dir" --json
python3 tools/design/design-check --phase ratify --design-dir "$design_dir" --json
python3 tools/criterion tools/design/design-check ratify owner_signed --design-dir "$design_dir"
```
Arrange cold reviews explicitly; inspect both executor-written verdict files and gate-run judges.
Inspect judge scope: doors/skeleton/risks diffs and corresponding verdict files are supplied; other artifacts are not automatically loaded.
Missing/malformed/unsupported judge responses and nonzero judge exit now record `fail` with unavailable
grading; declared blocking judges hold advancement, even if a failing process prints pass JSON. API/CLI
typed `_Sample.available` rejects error/no-verdict states even when context is truncated; display-tag text
in a model alias or cut filename cannot decide voting, and exact configured model metadata is retained.
CLI JSON exports boolean `available` from `_Ballot`; answered fail/tie and stub pass/fail remain available.
Calibration validates process/response fields and exact `available is True`, without display-tag or legacy
inference; all-invalid agreement is unavailable. Shared gate core still does not validate that field.
Inspect judge maintenance for these consumer-specific boundaries. This repairs transport/measurement
plumbing, not review independence: design's APPROVE commands and checker verdict objects remain executor-writable proxies.
Report `ratify.wet_ink` as blocked integration for ARM: compiler emits `kind: human`, but ARM supports only execute/gate/review/inject.
Do not equate an artifact-check pass or generic gate-CLI completion with an enforced human approval workflow.
Propagate changed data fields, criteria, patterns, timestamps, or ratification semantics to YAML mappings, generated JSON, tests, runner inputs, and this skill.
Coordinate any real approval-key verification with compiler and runtime owners; do not retrofit that claim into documentation alone.

## Checks
Run focused structural, compilation, and context tests:
```sh
python3 bin/relay-profile.py profiles/design.yaml --qualify-ids -o profiles/design.sprint.json --check
python3 bin/relay-spec.py lint profiles/design.sprint.json --json
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_design_check.py tests/test_profile_compile.py tests/test_shipped_profiles.py tests/test_judge_context.py tests/test_kinds.py tests/test_gate_core_runtime.py tests/test_judge_api.py tests/test_judge_cli.py
git diff --check
```
Use good-design, absent-design, per-criterion mutation, and mutation-coverage cases to calibrate checker reach.
For semantic transport changes, require marker-bearing model/filename cases with valid votes and genuine
error/no-verdict cases; inspect producer-derived availability, calibration's exact-true validation, and
shared gate core's narrower response validation separately.
Remember the good fixture's `ed25519:abcd` is accepted data, not proof of a valid cryptographic signature.

## Cold review
Require a reviewer other than the author, working in a fresh, isolated context without the author's conversation.
Freeze the baseline revision, complete diff including untracked drafts, and exact artifact/file list with content digests before review.
Have the reviewer read the linked checker/adapter, compiler and ARM/gate/judge consumers, design YAML/compiled profile, [historical fixtures](../../../docs/fixtures/), test GOOD/MUTATIONS, and design artifact contracts.
Verify original design-protocol availability and explicit runner instruction bindings; do not invent missing external authority from state titles.
Challenge quote provenance, heuristic clean-hands/saturation claims, declared scene/probe outcomes, executor-writable verdicts, signature presence versus Ed25519 verification, and unsupported compiled human kind.
Have the reviewer run the named applicable checks under Checks and record commands, exits, and skips; do not substitute the author's prior results for independent review.
For changed checkers, require a known-good pass and a targeted bad-design mutation rejected by the intended criterion, not an unrelated crash or a merely present signature.
Require an APPROVE/FIX-FIRST/REJECT report identifying the frozen snapshot, exact file-path evidence, commands/exits, and residual limitations.
Fix every FIX-FIRST, freeze the revised diff/artifact list, and obtain independent re-review; stop on REJECT until the scope or contract is resolved.
Treat this as a mandatory review procedure, not mechanical enforcement or proof that reviewers cannot miss bugs; do not infer commit/PR authorization from the verdict.

## Failure handling
Reject fabricated quotes and missing primary artifacts; distinguish JSON/read errors from semantic disagreements.
Treat question regexes as a floor: they catch some overt steering and can misclassify phrasing; they cannot certify clean elicitation.
Treat saturation as two recorded non-increasing rates; defaults and equality can pass without establishing theoretical saturation.
Treat correction, scene-failure, promise, and probe declarations as structural proxies; the checker does not enact scenes or run probes.
Treat seal timestamps as supplied lexically compared strings, not authenticated chronology.
Treat `owner_signed` as nonempty signer/signature plus coverage names only; no Ed25519 verification occurs, including against YAML `approver_pubkey`.
Treat malformed design-artifact crashes and incomplete checker validation as checker limits, distinct from
the repaired gate judge-response path. A blocking unavailable response is a failure, not an advisory verdict.
Keep [self-graded verdict residuals](../../../docs/FINDING-self-graded-review-verdicts.md) visible: checker phases also consume executor-writable APPROVE objects.
Preserve historical corpus/cases; current typed voting does not rewrite their verdict provenance or fix every consumer.

## Done
Require independent APPROVE on the current frozen snapshot plus applicable validation before declaring completion; keep pending review explicit.
Return artifact/check results, runner instruction sources, reviewer arrangement, ARM incompatibility, and signature-check limits.
State structural and semantic evidence separately; do not call presence checks owner authentication or measured product viability.

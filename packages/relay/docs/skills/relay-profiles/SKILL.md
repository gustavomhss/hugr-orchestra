---
name: relay-profiles
description: Use when compiling, binding, or checking Relay YAML profiles and their generated sprint contracts.
---

## Trigger
Use this skill for `profiles/*.yaml`, generated `*.sprint.json`, criteria mappings, or profile/compiler drift.
Route artifact work to [planning](../relay-planning/SKILL.md), [specification](../relay-specification/SKILL.md), [design](../relay-design/SKILL.md), or [research](../relay-research/SKILL.md).

## Read first
Read [relay-profile.py](../../../bin/relay-profile.py): `KIND`, `_expand`, `compile_profile`, `main`.
Read [relay-spec.py](../../../bin/relay-spec.py): `cmd_instantiate`, `validate_sprint`, `lint_sprint`.
Read [compiler placeholder probes](../../../tests/test_profile_compile.py) and [shipped-profile options](../../../tests/test_shipped_profiles.py): `OPTS`, `TEMPLATED`.
Read [gate core](../../../lib/relay-gate.sh): `relay_json_string`, `relay_expand_params`, `relay_compute_diff`, `relay_run_checklist`.
Read [ARM kind dispatch and review reminder](../../../bin/relay-arm-hook.sh) and [judge backends](../../../benchmark/judge.py).

## Ownership
Limit source work to the assigned subset of `bin/relay-profile.py` and `profiles/*.yaml`; route `bin/relay-spec.py` renderer/lint changes to [spec library](../relay-spec-library/SKILL.md).
Treat `profiles/{planning,tdd_feature,wp-execute,spec-decompose,research-v2,design}.sprint.json` as generated data; regenerate instead of hand-editing.
Coordinate changes to consumers `lib/relay-gate.sh`, `bin/relay-arm-hook.sh`, `bin/relay-gate`, and `benchmark/judge.py` with their owners.
Keep [profile guide](../../../docs/profiles.md) and this skill aligned with compiler behavior.

## Contracts
Preserve enabled macro/sub-state order; omit disabled entries from emitted macros and work packages.
Map `execute/checklist/review/inject/human_approval` to `execute/gate/review/inject/human`.
Reject unknown source types and duplicate WP IDs; use `--qualify-ids` for `<macro>.<sub>` IDs.
Copy macro `system_prompt` to instructions, sub-state `description` to instructions, and mapped controls to `checklist`.
Stamp every control with `origin: pe-profile:<name>@<version>`.
Resolve `per_criterion` before `default`; append `per_sub[macro.sub]` controls carrying `cmd` or `judge`.
Leave unmapped criteria out and inspect the coverage report; a partially mapped state can still lint as gated.
Expand only bare `{macro}` and `{sub}` in criterion-command mappings and `per_sub.cmd`; expand bare `{criterion}` only when a criterion is supplied by the mapping path.
Preserve `${macro}`, `${sub}`, `${criterion}`, and other later-stage bindings: a preceding `$` protects the placeholder. Preserve unknown braces and shell syntax; never re-expand substituted values.
Leave `{criterion}` literal in `per_sub.cmd`, where no criterion is supplied. Descriptions/instructions, assertions, judge text, context, and paths are not expanded by `_expand`.
Require the caller to supply and validate later-stage bindings before execution. Compiler preservation is not automatic runtime binding validation; missing or malformed values remain an integration responsibility.
Carry inject payloads only for `kind: inject`; prefer file/skill/protocol over inline text/context/prompt.
Do not claim propagation of `protected`, `settings`, `output_contract`, macro `loop`, approval key/prompt, or non-inject-state `inject` blocks.
Treat `retry_budget` as the maximum `max_iterations` across all YAML pipeline entries, including disabled macros, defaulting each missing value to 3.
Apply that global budget per WP in consumers; do not describe it as a per-macro retry limit.
Treat compiled `human` as an integration gap: lint accepts it, but ARM records `unknown-kind` without advancing.
Treat `review` as a cold-read instruction; ARM does not create a fresh reviewer context.
Distinguish lint acceptance from runtime compatibility and semantic quality; lint recognizes a finite trivial-command set, not arbitrary weak commands.

## Procedure
Run every command from the repository root; require Python 3 and PyYAML for compilation.
Require pytest for tests; require Bash, jq, git for diffs, and shasum for gate consumers, plus openssl for keyed ledgers.
Read YAML and its neighboring compiled JSON together; inventory controls, payloads, and `${param}` names.
Use no qualification for shipped `planning`; use `--qualify-ids` for all other shipped profiles, as `OPTS` declares.
Compile and compare with identical arguments; for example:
```sh
python3 bin/relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json
python3 bin/relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json --check
python3 bin/relay-spec.py lint profiles/planning.sprint.json --json
python3 bin/relay-profile.py profiles/design.yaml --qualify-ids -o profiles/design.sprint.json --check
```
Interpret `--check` as equality against newline-normalized `Path.read_text()` text: CRLF may match LF; other formatting and JSON ordering still matter, so regenerate from YAML with the same options.
Inspect unmapped criteria even when lint returns zero; never invent a passing default to fill a gap.
Bind command templates through a controlled environment, or through an explicitly assembled spec catalog entry with `meta.json` and `sprint.json`.
Do not invoke `instantiate planning` or another profile ID against the shipped catalog; [specs/](../../../specs/) ships starter specs, not profile entries.
Inspect the real catalog before choosing a spec:
```sh
python3 bin/relay-spec.py --specs specs list
python3 bin/relay-spec.py --specs specs show pytest-green
python3 bin/relay-spec.py --specs specs instantiate pytest-green --param tests=tests/
```
Account for renderer limits: it requires nonempty checklists even on inject/human WPs; it quotes substitutions in `cmd` as shell words, not arbitrary shell programs.
Bind gate `context` and `paths` relative to the workdir; the gate expands environment names without executing paths and preserves unset placeholders.
Supply a valid base ref for `diff: true`; the gate does not follow citations or automatically add upstream files to judge context.
Propagate changes in mappings, IDs, prompts, or budgets into generated JSON, compile options, targeted tests, bindings, and affected skills.
Coordinate any new kind or output validation with both lint and runtime consumers before claiming support.

## Checks
Run compiler, generated-data, lint, renderer, and context tests:
```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_profile_compile.py tests/test_shipped_profiles.py tests/test_spec_lint.py tests/test_spec.py tests/test_judge_context.py
git diff --check
```
Inspect skips: PyYAML absence skips compiler modules; the frozen-reference measurement depends on an external checkout.
Use tests' stale-artifact, unmapped-criterion, malformed-control, missing-param, and context-canary cases as negative controls.
Inspect `test_profile_compile.py`'s default/per-criterion/per-sub placeholder protection, untouched shell/non-command fields, and missing/valid bound-file probes. The missing-file probes bind a valid filename first; they do not prove automatic rejection of an unset runtime binding.
Check new skill frontmatter, folder-matching names, relative links, and assigned path scope separately; profile tests do not validate documentation.

## Cold review
Require a reviewer other than the author, working in a fresh, isolated context without the author's conversation.
Freeze the baseline revision, complete diff including untracked drafts, and exact artifact/file list with content digests before review.
Have the reviewer read the linked compiler, lint, gate/ARM/judge consumers, YAML and compiled profiles, named test fixtures, and artifact contracts; preserve historical ledgers.
Trace protected later-stage placeholders versus bare compiler tokens, non-command fields, binding responsibility, compiler field losses, unsupported ARM kinds, qualification flags, inactive-macro/global retry budgets, unmapped criteria, and catalog/renderer limits against actual consumers.
Have the reviewer run the named applicable checks under Checks and record commands, exits, and skips; do not substitute the author's prior results for independent review.
For changed checkers, require a known-good pass and a meaningful bad-input/mutation rejection, such as stale generated text or an invalid mapping, for the intended reason rather than an unrelated crash.
Require an APPROVE/FIX-FIRST/REJECT report identifying the frozen snapshot, exact file-path evidence, commands/exits, and residual limitations.
Fix every FIX-FIRST, freeze the revised diff/artifact list, and obtain independent re-review; stop on REJECT until the scope or contract is resolved.
Treat this as a mandatory review procedure, not mechanical enforcement or proof that reviewers cannot miss bugs; do not infer commit/PR authorization from the verdict.

## Failure handling
Stop on stale JSON, duplicate IDs, unsupported ARM kinds, missing bindings, or missing inject files; report the source field and consumer involved.
Separate missing review evidence from a semantic rejection; inspect backend tags and supplied files before changing criteria.
The shared gate records missing/malformed judge output or nonzero judge exit as unavailable `fail`; `blocking:true` blocks that failure. API/CLI voting uses typed sample availability, not backend/model/truncation labels; public `available:false` means unavailable. Calibration requires valid fields, process exit 0, and literal `available:true`; exclude unavailable measurements from agreement. Do not treat unavailable review as a considered rejection or a pass.
Do not treat `--allow-ungated` as a repair; it downgrades only ungated findings to warnings.

## Done
Require independent APPROVE on the current frozen snapshot plus applicable validation before declaring completion; keep pending review explicit.
Return exact compile arguments, targeted test results/skips, binding requirements, propagation work, and residual coverage gaps.
State what commands measure; never upgrade a length/presence check into semantic assurance or an independent review guarantee.

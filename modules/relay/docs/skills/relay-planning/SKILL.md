---
name: relay-planning
description: Use when authoring or checking Relay planning artifacts with plan-check, plan-criterion, or plan-graph.
---

## Trigger
Use this skill for `profiles/planning.yaml`, FRAME/CARVE/SEQUENCE/DISPATCH artifacts, or planning checker failures.
Load [relay-profiles](../relay-profiles/SKILL.md) for compilation and template binding.

## Read first
Read [planning.yaml](../../../profiles/planning.yaml) and [planning.sprint.json](../../../profiles/planning.sprint.json).
Read [plan-check](../../../tools/edd/plan-check): `Ctx`, all four check lists, `run_phase`, `main`.
Read [plan-criterion](../../../tools/edd/plan-criterion), [plan-graph](../../../tools/edd/plan-graph), and [selftest](../../../tools/edd/plan-check-selftest.sh).
Read [generic criterion adapter](../../../tools/criterion) before changing the report interface.

## Ownership
Limit source work to the assigned subset of `tools/edd/{plan-check,plan-criterion,plan-graph,plan-check-selftest.sh}` and `profiles/planning.yaml`.
Regenerate `profiles/planning.sprint.json` from YAML with no `--qualify-ids`.
Keep run data under the bound `plan_dir`; keep held-out evidence in its declared ledger location.
Coordinate shared adapter/compiler changes with [relay-profiles](../relay-profiles/SKILL.md).

## Contracts
Read `frame.json`, `packages.json`, `sequence.json`, `manifest.json`, and `packets/*.md` from `--plan-dir`.
Resolve repository scopes and anchors against `--repo-root`; resolve verdict/holdout refs against the plan directory, including supported absolute/parent paths.
Emit a JSON list of `{criterion,status,evidence}` rows with `PASS`, `FAIL`, or `SKIP`.
Interpret phase-check exit 0 as no `FAIL`, exit 1 as a failed criterion, and exit 2 as usage/directory error.
Require literal `PASS` for a per-criterion control; `plan-criterion` rejects `FAIL`, `SKIP`, and absent names, regardless of the phase's overall status.
Expect adapters to re-run the phase for each control; do not imply caching or a shared report between controls.
Preserve criterion ownership encoded by YAML: producing states carry field criteria; checklist states carry phase validation commands.
Supply the frozen upstream or raw task as runner context; the compiler does not create `initial_context`.
Bind external protocol inputs before dispatch: YAML prompts reference `docs/edd/planning-protocol.md@sha256:41808c99e71d`, doctrine, dispatch prompts, templates, and external skills.
Treat those `docs/edd/...` documents as frozen external inputs, not bundled files; the local checker is self-contained, but the prompt-driven runner is not.
Do not silently substitute local tools for every external document reference; record the runner's bound inputs and version.
Deliver packets/manifest to the bound BUILD runner; compilation does not dispatch that downstream work.

## Procedure
Run commands from the repository root; bind `plan_dir` and `repo_root` to the actual artifact and subject directories.
Use Python 3 stdlib for checkers/graph, local git for historical hotspots, PyYAML for compilation, and pytest for Python tests.
Build FRAME fields from upstream evidence, then CARVE package scopes, then SEQUENCE waits/order, then DISPATCH packets/manifest/verdict.
Use the graph generator to propose conflicts/hotspots and scheduling:
```sh
python3 tools/edd/plan-graph --conflict --plan-dir "$plan_dir" --repo-root "$repo_root" --json
python3 tools/edd/plan-graph --order --plan-dir "$plan_dir" --json
```
Merge suggestions into artifacts yourself; `plan-graph` prints output and writes no artifact files.
Replace `unconstrained` order rationales with justified checker-supported values; generator output is not automatically a valid plan.
Inspect `historical_hotspots_computed` and its note; failed/unavailable git history degrades to structural hotspots while returning zero.
Remember conflict detection uses exact path equality, not aliases, directory overlap, or semantic coupling.
Run each phase and inspect every row:
```sh
python3 tools/edd/plan-check --phase frame --plan-dir "$plan_dir" --repo-root "$repo_root" --json
python3 tools/edd/plan-check --phase carve --plan-dir "$plan_dir" --repo-root "$repo_root" --json
python3 tools/edd/plan-check --phase sequence --plan-dir "$plan_dir" --repo-root "$repo_root" --json
python3 tools/edd/plan-check --phase dispatch --plan-dir "$plan_dir" --repo-root "$repo_root" --json
python3 tools/edd/plan-criterion dispatch hostile_read_approved --plan-dir "$plan_dir" --repo-root "$repo_root"
```
Preserve required empty-list declarations, ordered undo layers, carried upstream binding, story rungs/enactments, policy, and tripwire fields.
Resolve `manifest.verdict_ref` as inline verdict, local JSON ref, or `<path> @ sha256:<digest>`; inspect what was actually graded.
Arrange a fresh hostile-read context in the runner; the checker only reads verdict data and does not authenticate the reviewer.
Propagate criterion/report/path/schema changes to YAML mappings, compiled JSON, adapters, graph output, fixtures, runner bindings, and this skill.

## Checks
Check generated data and lint:
```sh
python3 bin/relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json --check
python3 bin/relay-spec.py lint profiles/planning.sprint.json --json
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_profile_compile.py tests/test_shipped_profiles.py tests/test_spec_lint.py
```
For a supplied bench root containing immediate fixture directories with `frame.json`, use Bash 4+:
```sh
bash tools/edd/plan-check-selftest.sh "$bench_root" "$repo_root"
git diff --check
```
Read the selftest table; it detects crashes/usage errors, permits ordinary criterion failures, and asserts no expected verdict matrix.

## Cold review
Require a reviewer other than the author, working in a fresh, isolated context without the author's conversation.
Freeze the baseline revision, complete diff including untracked drafts, and exact artifact/file list with content digests before review.
Have the reviewer read the linked checker/adapter/graph, compiler and gate consumers, planning YAML/compiled profile, [historical fixtures](../../../docs/fixtures/), supplied bench fixtures, and artifact contracts.
Verify original frozen protocol/prompt/template availability and version bindings; distinguish self-contained checker operation from missing runner authority inputs.
Challenge check reach versus semantic claims: exact-path conflicts, heuristic anchors/packets, holdout scans, single-package SKIP behavior, and executor-writable hostile-read verdicts.
Have the reviewer run the named applicable checks under Checks, including the supplied-bench selftest when applicable, and record commands, exits, skips, and missing inputs.
For changed checkers, require a known-good pass and a targeted bad-plan mutation rejected for the intended criterion; a crash-free selftest or unrelated failure is insufficient.
Require an APPROVE/FIX-FIRST/REJECT report identifying the frozen snapshot, exact file-path evidence, commands/exits, and residual limitations.
Fix every FIX-FIRST, freeze the revised diff/artifact list, and obtain independent re-review; stop on REJECT until the scope or contract is resolved.
Treat this as a mandatory review procedure, not mechanical enforcement or proof that reviewers cannot miss bugs; do not infer commit/PR authorization from the verdict.

## Failure handling
Report missing external runner inputs separately from local checker errors; do not invent their contents.
Handle single-package SEQUENCE `SKIP` explicitly: phase checks can pass while shipped per-criterion controls fail on those rows.
Treat packet-name/heading/runner regexes as heuristics: they can reject innocent mentions and miss unsupported spellings.
Do not infer source-quote truth or command execution from FRAME's nonempty source/span/command fields.
Do not infer complete holdout secrecy: separation scans whole-file digests outside `holdout_ledger`; a nonempty unresolved ledger ref can pass.
Do not infer symbol resolution from `anchors_present`: it accepts basename matches and no parseable anchors; graph waves and checker checks have different reach.
Treat `hostile_read_approved` as a residual self-graded-verdict risk described in [the historical finding](../../../docs/FINDING-self-graded-review-verdicts.md).

## Done
Require independent APPROVE on the current frozen snapshot plus applicable validation before declaring completion; keep pending review explicit.
Return phase rows, graph degradation notes, external-input bindings, actual reviewer arrangement, and unresolved semantic/holdout limits.
Claim structural validation only for the predicates the checker executed; retain judgment about plan quality and review provenance.

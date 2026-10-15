# Profiles: agent operating guide

Audience: agents. Status: current.

Use YAML profiles as source and neighboring `*.sprint.json` files as generated data.
Read implementation before inferring guarantees from protocol prose. Follow these skills:

- [relay-profiles](skills/relay-profiles/SKILL.md): compilation, binding, lint, and propagation.
- [relay-planning](skills/relay-planning/SKILL.md): planning artifacts and graph/check tools.
- [relay-specification](skills/relay-specification/SKILL.md): spec-decompose registries and traceability.
- [relay-design](skills/relay-design/SKILL.md): design artifacts and ratification limits.
- [relay-research](skills/relay-research/SKILL.md): capture, evidence, contest, calibration, and report checks.

Follow each skill's mandatory **Cold review** lifecycle after validation: freeze the baseline and
diff/artifact list, obtain review from someone other than the author in a fresh isolated context,
fix and re-review every FIX-FIRST, and require independent APPROVE on the current snapshot before
declaring completion. Treat prior checks as validation, not independent review; the procedure is
not mechanically enforced by prose and does not guarantee that reviewers find every bug.

## Read the current translation contract

Read [`bin/relay-profile.py`](../bin/relay-profile.py), especially `compile_profile` and `_expand`.
Use [`tests/test_shipped_profiles.py`](../tests/test_shipped_profiles.py) `OPTS` as the exact shipped compilation arguments.
Read [`bin/relay-spec.py`](../bin/relay-spec.py) `lint_sprint` separately from the runtime consumers.

Preserve enabled macro and sub-state order. Expect macro `system_prompt` to become macro instructions,
sub-state `description` to become WP instructions, and mapped controls to become `checklist` entries.
Expect `brief`, `gen: 0`, one global `retry_budget`, `macros`, and `work_packages` in the emitted sprint.

| YAML type | Compiler kind | Consumer limit to record |
|---|---|---|
| `execute` | `execute` | Grade the declared controls; do not infer work quality from the kind. |
| `checklist` | `gate` | Grade the declared controls. |
| `review` | `review` | ARM adds a cold-read reminder; arrange the fresh context yourself. |
| `inject` | `inject` | ARM reads file or inline text; missing payload/file records `inject-missing` without advancing. |
| `human_approval` | `human` | Lint accepts it; ARM records `unknown-kind` without advancing. Do not claim enforced approval. |

Check [`bin/relay-arm-hook.sh`](../bin/relay-arm-hook.sh) kind dispatch and `advance` for those limits.
Do not infer kind behavior from [`bin/relay-gate`](../bin/relay-gate): its generic CLI evaluates checklists,
not ARM injection/review/human workflows.

Record dropped YAML fields: `protected`, `settings`, `output_contract`, macro `loop`, approval key/prompt,
and `inject` blocks on non-inject states are not propagated. In particular, `tdd_feature`'s execute/review
skill/protocol blocks are not delivered by the compiler as injection payloads.

Calculate `retry_budget` as the maximum `max_iterations` across **all** pipeline entries, including
disabled macros, using 3 for a missing value. Treat it as a global cap applied per WP by consumers,
not a separate per-macro cap. Keep consumer-specific retry accounting in view: the gate CLI charges
failed `eval` calls and escalates when its previously recorded retry counter has reached that budget.

## Author criteria mappings honestly

Keep command mappings inside the profile:

```yaml
criteria_map:
  default: "${edd_tools}/plan-criterion {macro} {criterion} --plan-dir ${plan_dir} --repo-root ${repo_root}"
  per_criterion:
    frame_phase_validates: "${edd_tools}/plan-check --phase frame --plan-dir ${plan_dir} --repo-root ${repo_root}"
  per_sub:
    frame.intake:
      - id: intake-artifact-present
        cmd: "test -s ${plan_dir}/frame.json"
```

Use `per_criterion` before `default`; use `per_sub[macro.sub]` to append authored `cmd` or `judge`
controls. Preserve the compiler's `pe-profile:<name>@<version>` origin stamp. Treat the example's
presence check as a presence check, not proof of sound planning.

Inspect unmapped names in the compiler's coverage report. An unmapped criterion becomes no control;
the compiler does not invent a default. Lint reports an ungated execute/gate/review WP when it has no
nontrivial deterministic command. A partially mapped WP can still pass that test, so lint is not a
criterion-completeness check. Do not replace unmapped work with `true` or a fake passing command.

`_expand` replaces only bare `{macro}` and `{sub}` in criterion commands and `per_sub.cmd`, plus
bare `{criterion}` in criteria-command mappings. A preceding `$` protects `${macro}`, `${sub}`,
`${criterion}`, and other later-stage bindings. Substituted values are not expanded again.

```text
Criterion-command mapping with macro=m, sub=s, criterion=c:
'run {macro} {sub} {criterion} ${macro} ${sub} ${criterion} ${test_cmd}'
-> 'run m s c ${macro} ${sub} ${criterion} ${test_cmd}'

per_sub.cmd with macro=m, sub=s:
'run {macro} {sub} {criterion} ${macro} ${sub} ${criterion}'
-> 'run m s {criterion} ${macro} ${sub} ${criterion}'
```

Unknown braces and shell syntax remain literal. Descriptions/instructions, assertions, judge text,
context, and paths do not use this compiler expansion. Preserved `${...}` names still require
caller-supplied bindings before execution; compilation does not validate their values or establish
automatic runtime binding validation. Do not run an unbound template as though it were instantiated.
See [`tests/test_profile_compile.py`](../tests/test_profile_compile.py) for default/per-criterion/
per-sub protection, literal syntax, and missing-versus-valid bound-file probes.
Reject unknown source types and duplicate WP IDs; use qualification exactly as the shipped matrix below.

## Run the compile/check/lint matrix

Run from the repository root. Require Python 3 and PyYAML for compilation. Use the same arguments for
generation and drift checking. `--check` compares rendered JSON text against `Path.read_text()`'s
newline-normalized text and writes nothing: CRLF may match LF. Do not describe this as raw-byte
comparison or parsed-JSON equivalence; other formatting and JSON ordering still affect equality.
Preserve source-derived macro/sub-state order and regenerate from YAML with the same options.

| Profile | Compile or regenerate | Check generated text | Lint |
|---|---|---|---|
| `planning` | `python3 bin/relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json` | `python3 bin/relay-profile.py profiles/planning.yaml -o profiles/planning.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/planning.sprint.json --json` |
| `tdd_feature` | `python3 bin/relay-profile.py profiles/tdd_feature.yaml --qualify-ids -o profiles/tdd_feature.sprint.json` | `python3 bin/relay-profile.py profiles/tdd_feature.yaml --qualify-ids -o profiles/tdd_feature.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/tdd_feature.sprint.json --json` |
| `wp-execute` | `python3 bin/relay-profile.py profiles/wp-execute.yaml --qualify-ids -o profiles/wp-execute.sprint.json` | `python3 bin/relay-profile.py profiles/wp-execute.yaml --qualify-ids -o profiles/wp-execute.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/wp-execute.sprint.json --json` |
| `spec-decompose` | `python3 bin/relay-profile.py profiles/spec-decompose.yaml --qualify-ids -o profiles/spec-decompose.sprint.json` | `python3 bin/relay-profile.py profiles/spec-decompose.yaml --qualify-ids -o profiles/spec-decompose.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/spec-decompose.sprint.json --json` |
| `research-v2` | `python3 bin/relay-profile.py profiles/research-v2.yaml --qualify-ids -o profiles/research-v2.sprint.json` | `python3 bin/relay-profile.py profiles/research-v2.yaml --qualify-ids -o profiles/research-v2.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/research-v2.sprint.json --json` |
| `design` | `python3 bin/relay-profile.py profiles/design.yaml --qualify-ids -o profiles/design.sprint.json` | `python3 bin/relay-profile.py profiles/design.yaml --qualify-ids -o profiles/design.sprint.json --check` | `python3 bin/relay-spec.py lint profiles/design.sprint.json --json` |

Interpret lint exit 1 as an error and exit 0 as no error, not necessarily no warning. Inspect
`chain-exceeds-default-cap`: lint compares WP count plus one against the documented cap of 8; it
cannot inspect the live hook environment. Treat `--allow-ungated` as a warning downgrade only.
Keep lint's finite trivial-command detection separate from proving a command measures its assertion.

## Bind templates before running

Read actual commands in the chosen YAML and compiled JSON. Bind these command/path names:

| Profile | Names used by the shipped template |
|---|---|
| `planning` | `edd_tools`, `plan_dir`, `repo_root` |
| `tdd_feature` | `base_ref`, `src_path`, `test_path`, `test_cmd`, `review_artifact` |
| `wp-execute` | `base_ref`, `wp_dir`, `src_path`, `test_path`, `test_cmd`, `lint_cmd` |
| `spec-decompose` | `spec_tools`, `spec_dir` (`spec_tools` points to `tools/`) |
| `research-v2` | `research_tools`, `research_dir`, `repo_root` |
| `design` | `design_tools`, `design_dir` |

For environment binding, export controlled values into the gate process. For a planning run whose
artifacts are already in `plan/` and whose subject is the repository root, use:

```sh
export edd_tools="$PWD/tools/edd" plan_dir=plan repo_root="$PWD"
bin/relay-gate eval --sprint profiles/planning.sprint.json --workdir . --state "$state_dir"
```

Bind `state_dir` to the harness's run-state directory before invoking the example. Expect state files
and ledger output there. For judge-bearing CLI runs, supply `$state_dir/base_ref` through the harness;
the CLI does not capture it automatically. Read `lib/relay-gate.sh` before relying on path behavior.

Treat `cmd` as shell code executed via `eval` in the workdir. Complete decoded commands and checklist
IDs preserve tabs and all LF, including trailing LF, during current evaluation and ARM/CLI regression;
CLI/benchmark DoD also runs each complete shell program. Overall Bash exit status decides the verdict.
Treat `context`/`paths` as data expanded from the environment without `eval`; unset names remain
literal. Use workdir-relative judge paths: the gate prefixes context and artifact-digest paths with
the workdir and whitespace-splits scope. Do not generalize those semantics to arbitrary absolute
paths or filenames containing spaces.

Use [`bin/relay-spec.py`](../bin/relay-spec.py) `instantiate` only for a catalog entry containing both
`meta.json` and `sprint.json`. Inspect the shipped catalog explicitly:

```sh
python3 bin/relay-spec.py --specs specs list
python3 bin/relay-spec.py --specs specs show pytest-green
python3 bin/relay-spec.py --specs specs instantiate pytest-green --param tests=tests/
```

Do not present `instantiate planning`, `instantiate design`, or another profile ID as a packaged path:
[`specs/`](../specs/) contains `pytest-green` and `py-package-skeleton`, not catalog entries for these
profiles. Assemble an explicit external catalog entry before using the renderer for a profile.
Account for `validate_sprint` requiring every WP to have a nonempty checklist, including inject/human
WPs. Account for `cmd` substitutions being shell-word quoted; a parameter is not an arbitrary shell script.

## Inspect what each checker measures

| Family | Source and inputs | Limit to carry into the result |
|---|---|---|
| Planning | [`plan-check`](../tools/edd/plan-check), [`plan-graph`](../tools/edd/plan-graph); plan JSON/packets and subject repo | Bind frozen external `docs/edd/...` protocol/prompt/template inputs for the runner. The checker does not need them. Exact-path graph conflicts, heading/presence proxies, and verdict data do not establish semantic quality or reviewer independence. |
| Specification | [`spec-check`](../tools/spec/spec-check); invariant/requirement/spec/scenario/package JSON | `dependencies_mapped` checks ID existence, not cycles. Scenario `can_fail` is a declaration, not a mutation proof. Atomicity/ambiguity checks are prose heuristics. |
| Design | [`design-check`](../tools/design/design-check); transcript/map/readback/doors/skeleton/risks/ratify artifacts | `owner_signed` checks nonempty signer/signature plus coverage names only. It does not verify Ed25519 or YAML `approver_pubkey`; ARM cannot run compiled `human`. |
| Research | [`research-check`](../tools/research/research-check), capture/note/memo/replay tools; question/source/finding/contest/conclusion/report data | Snapshot hashes, normalized quote containment, replay, and GRADE arithmetic are consistency checks. They do not establish source truth, genuine independence, meaningful claims, or semantic conclusion quality. |

Inspect per-criterion adapters as well: [`tools/criterion`](../tools/criterion) and
[`plan-criterion`](../tools/edd/plan-criterion) accept a named `PASS` row rather than requiring the
whole phase to pass. `SKIP` and absent rows fail, while a phase-level planning command tolerates SKIP.
Handle single-package SEQUENCE rows explicitly; the compiler does not collapse those states based on run data.

Read [`benchmark/judge.py`](../benchmark/judge.py) and [`lib/relay-gate.sh`](../lib/relay-gate.sh).
Inspect `paths`, `context`, base ref, backend, and truncation before interpreting a judge verdict.
Research's new gate-side evidence reviewer gets only `findings.json`'s diff; its conclusion reviewer
gets only `conclusions.json`'s diff. Neither declares source snapshots or cited findings as upstream
context. Do not say the judge inspected evidence beyond the files actually supplied.

Treat all judge results as non-independent semantic grading. API/CLI voting makes repeated calls;
it does not guarantee independent reviewers. The stub is a test double. Missing diff infrastructure,
nonzero judge exit, or malformed/missing judge JSON records `fail` with unavailable provenance and
blocks when `blocking:true`; malformed output no longer becomes `advisory`. Typed unavailable
sample state aborts API/CLI voting with `available:false`; labels are metadata, not state.
Calibration excludes unavailable/invalid measurements; see [configuration](configuration.md#judge-settings).
Prose fallback accepts only an exact
`VERDICT: PASS` or `VERDICT: FAIL` declaration after case/outer-whitespace normalization; a malformed
last declaration makes the reply unavailable rather than recovering an earlier pass. Preserve
api/cli-error, no-verdict, truncation, and vote tags in reports.
Do not claim an executor cannot rerun the judge: `benchmark/judge.py` and `relay-gate check` are callable.
The latter grades without charging retries, advancing, or recording verdicts; its named `--position`
and explicit `--base-ref` options apply only to `check`, while `eval` remains counter-based.

## Check and propagate changes

Run the focused tests for the surface you changed. For compiler/mapping work, use:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_profile_compile.py tests/test_shipped_profiles.py tests/test_spec_lint.py tests/test_judge_context.py
git diff --check
```

Run the family tests and root commands in the linked skills for artifact/checker changes. Inspect
skips: compiler modules require PyYAML, and one compiler measurement depends on a frozen external
checkout. Use positive cases and targeted mutations already present in the tests; do not read green
as evidence of stronger predicates than those cases exercise.

Propagate YAML changes into compiled JSON with exact options. Propagate criteria, field names, report
interfaces, judge inputs, and template bindings into adapters, authoring tools, focused tests,
downstream artifacts, and skills. Coordinate kind/protection/output-validation changes with compiler,
lint, and runtime owners. Report residual gaps instead of silently weakening a control.

## Read historical runs as snapshots

Use these fixtures to inspect recorded events and failure modes, not as guarantees for current profiles:

- TDD: [live ledger](../test/fixtures/tdd-feature-live.ledger.jsonl), [untracked-file defect](../test/fixtures/tdd-feature-untracked-defect.ledger.jsonl).
- WP execution: [live ledger](../test/fixtures/wp-execute-live.ledger.jsonl), [judge-blind ledger](../test/fixtures/wp-execute-judge-blind.ledger.jsonl).
- Specification: [live ledger](../test/fixtures/spec-decompose-live.ledger.jsonl), [unscoped review](../test/fixtures/spec-decompose-unscoped-review.ledger.jsonl).
- Research: [agent-driven snapshot](../test/fixtures/research-v2-agent-driven-PASS.ledger.jsonl), [escalated snapshot](../test/fixtures/research-v2-live-escalated.ledger.jsonl).
- Gate concurrency: [forked historical chain](../test/fixtures/gate-race-forked-chain.ledger.jsonl).

Read [self-graded review verdicts](FINDING-self-graded-review-verdicts.md) for the dated finding and
current source-backed residuals. Preserve original ledgers; do not rewrite them to match today's controls.

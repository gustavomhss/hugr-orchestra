---
name: relay-ownership
description: Routes Relay source ownership and edit claims to module skills when agents plan changes or review cross-module work.
---

# Relay ownership

## Trigger

Use this skill before claiming files, assigning maintenance work, or reviewing a change that crosses module boundaries.
Treat ownership as responsibility for source contracts, not as a list of people or an authorization mechanism.

## Read first

- Read [AGENTS.md](../../../AGENTS.md) for repository-wide agent instructions.
- Read [docs/skills.json](../../../docs/skills.json) for the canonical machine-readable routing catalog.
- Read [blast radius](../relay-blast-radius/SKILL.md) before selecting consumers and checks.
- Read [maintenance](../relay-maintenance/SKILL.md) for the change and review procedure.

## Ownership

Route maintenance by module domain below; tests and dependent readers may appear in several maintenance procedures.
Treat `docs/skills.json` as authority for exact source assignments, tests, dependencies, module IDs, and skill paths; this table summarizes domains rather than duplicating the source inventory.

| Module ID | Maintenance domain | Maintenance skill |
|---|---|---|
| `gate-core` | Shared checklist evaluation, ledger append, and note adapter | [relay-gate-core](../relay-gate-core/SKILL.md) |
| `arm-hook` | Per-agent hook binding, position, and arm state transitions | [relay-arm-hook](../relay-arm-hook/SKILL.md) |
| `gate-cli` | Model-agnostic gate commands and index-based state | [relay-gate-cli](../relay-gate-cli/SKILL.md) |
| `audit` | Audit reports and offline ledger-chain verification | [relay-audit](../relay-audit/SKILL.md) |
| `daemon` | HTTP gate service and arm ask/answer channel | [relay-daemon](../relay-daemon/SKILL.md) |
| `judge` | Semantic judge runtime, backend transport, and calibration | [relay-judge](../relay-judge/SKILL.md) |
| `profiles` | Profile compilation and shipped profile maintenance | [relay-profiles](../relay-profiles/SKILL.md) |
| `autodecompose` | Automatic work-package decomposition | [relay-autodecompose](../relay-autodecompose/SKILL.md) |
| `spec-library` | Reusable sprint specifications and library operations | [relay-spec-library](../relay-spec-library/SKILL.md) |
| `policies` | Policy bundles and control application | [relay-policies](../relay-policies/SKILL.md) |
| `telemetry` | Trace corpus and dashboard readers | [relay-telemetry](../relay-telemetry/SKILL.md) |
| `planning` | Planning graph, criterion, and plan-check tools | [relay-planning](../relay-planning/SKILL.md) |
| `specification` | Specification artifact checks | [relay-specification](../relay-specification/SKILL.md) |
| `design` | Design artifact checks | [relay-design](../relay-design/SKILL.md) |
| `research` | Research capture, evidence, memo, and check tools | [relay-research](../relay-research/SKILL.md) |
| `benchmark` | Benchmark hook, drivers, grader, generators, and campaigns | [relay-benchmark](../relay-benchmark/SKILL.md) |
| `doc-tooling` | Documentation index, structural guard, and catalog validation | [relay-doc-tooling](../relay-doc-tooling/SKILL.md) |
| `examples` | Scripted demonstrations and fleet-chain example | [relay-examples](../relay-examples/SKILL.md) |

Route semantic grading and calibration to `judge`, chain verification and audit reports to `audit`, and benchmark hooks, drivers, grader, generators, and campaigns to `benchmark`; directory location does not determine ownership.
Keep `bin/relay-note` owned by `gate-core` even though the daemon calls it.
Route integration workflow changes to [relay-integration](../relay-integration/SKILL.md); use its procedure rather than reproducing installation instructions here.

## Contracts

- Keep catalog `source_roots` equal to `[bin, lib, tools, benchmark, demo, examples]`.
- Preserve catalog `modules[{id, skill, sources[], tests[], depends_on[]}]` and `workflows[{id, skill}]` shapes.
- Catalog every maintained source under `source_roots` and assign it to exactly one module; `depends_on` names dependencies this module uses, not its consumers.
- Find consumers by reverse traversal of catalog dependency edges and source call sites rather than assigning a dependency's source to each consumer.
- Distinguish source ownership from data and evidence retention; do not classify benchmark results or run ledgers as editable implementation.
- Keep author and reviewer distinct; review frozen artifacts from a fresh context.
- Keep edit claims disjoint at file granularity, including tests; shared test coverage does not grant concurrent edit permission.
- Reserve `AGENTS.md`, `docs/README.md`, `docs/skills.json`, and generated `docs/INDEX.md` for the lead during a documentation wave.
- Reserve shared documentation-validator changes for the lead during that wave and route their long-term maintenance through `doc-tooling`.
- Create new agent-facing operational documentation as `.opencode/skills/<name>/SKILL.md` with matching `name` and a single-sentence description.

## Procedure

1. Inspect the assigned worktree with `git status --short` and `git rev-parse HEAD` from repository root.
2. Compare HEAD with the assigned baseline and record pre-existing changes before requesting an edit claim.
3. Resolve each source through the catalog and load its module skill before changing its contract.
4. Record exact editable paths, expected consumers, selected checks, and the distinct reviewer in the work brief.
5. Ask the lead to resolve overlapping claims or shared-file changes before editing those paths.
6. Apply changes only within the claim; describe required neighboring edits as handoff items.
7. Update the owning skill when source behavior changes; request catalog or index updates from the lead.
8. Hand the reviewer the diff, source citations, checks, and unresolved limitations rather than a self-approved result.

## Checks

- Compare changed paths against the edit claim using `git status --short --untracked-files=all` and `git diff --name-only`.
- Check both tracked diffs and new skill files; unstaged new files do not appear in `git diff`.
- Check the source-to-module map against `docs/skills.json`; reject duplicate source assignments and unresolved dependencies.
- Run the targeted commands selected by [blast radius](../relay-blast-radius/SKILL.md), followed by the documentation checks in [maintenance](../relay-maintenance/SKILL.md).
- Verify the reviewer did not author the artifacts under review; a `review` kind reminder alone does not establish independence.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every change governed by this skill.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read the owned sources, consumer contracts, and affected documentation, then run the named applicable checks in Checks and the selected module skills.
- Confirm reviewer independence, disjoint edit claims, and agreement between the frozen scope and actual changed paths; inspect shared-file handoffs rather than accepting the author's scope summary.
- Verify source assignments and dependency edges against the catalog and source; reject duplicate owners, omitted sources, missing dependencies, and unsupported or stale claims.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; base the verdict on independent inspection rather than the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Stop overlapping edits and send the conflicting paths to the lead; do not overwrite unfamiliar work.
- Report missing catalog rows or pending skill links as integration blockers with exact paths.
- Preserve `runs/`, ledgers, benchmark results, and fixture evidence; do not mutate them to obtain a passing check.
- Do not stage, commit, push, or create a PR unless the user explicitly requests that operation.
- If source and historical prose disagree, cite source and tests for shipped behavior and request a documented reconciliation.

## Done

Return changed paths, source contracts, executed checks, pending shared-file updates, and the reviewer handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.
Leave the draft awaiting review until the lead resolves catalog, link, and index integration and the reviewer approves the resulting artifact set.

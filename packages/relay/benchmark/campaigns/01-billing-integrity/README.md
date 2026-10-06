# Campaign 01 — Historical Billing-Integrity Input

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../../SPEC.md). Procedures: [operational skills](../../../.opencode/skills/).
Input contract: [campaign records](../README.md). Evidence: [RESULTS.md](../../RESULTS.md).

## Original task and profile

The candidate task was to implement `repo/billing/core.py` so usage billing is lossless,
tenant-isolated, correctly priced and auditable. Original/self-contained fixture; no CoreLink
or other-project artifacts. Profile: 12 requirements, coupled-deep, dependency depth 6,
k=3 and 7 WPs.

## Immutable inputs

- [repo/](repo/) is the original starting skeleton, **expected red**, not a reference solution.
  Candidate implementation edits belong in isolated run copies; public API names are fixed.
- [requirements.yaml](requirements.yaml) fixes statements, weights, dependencies and RSR denominator.
- [checks/](checks/) is visible feedback; [holdout/](holdout/) supplies final grading inputs.
- [sprint.json](sprint.json) is the R/D decomposition;
  [sprint_mono.json](sprint_mono.json) is M's one-WP gated/repair baseline.
- [meta.json](meta.json) retains original calibration-pending snapshot.

Agents must not repair the committed skeleton, weaken tests, change weights or tailor sprint
inputs to improve benchmark scores. Pristine test failure is the intended starting condition.

## Evidence boundary

The historical pipeline comparison reported RSR 1.0 for M/R, with $0.25/6 turns versus
$0.53/23 turns. It was saturated pipeline evidence, not an independent efficacy result.
Visible `checks/` grading is smoke only; current runner final grading uses the held-out suite
against candidate final state. Grader skips can count as successes, and temporal regression
requires explicit prior grades rather than inferring it from one final RSR.

The pending metadata does not override the later historical saturation observation. This
README is an input record, not a command sequence or a claim of reliable headroom.

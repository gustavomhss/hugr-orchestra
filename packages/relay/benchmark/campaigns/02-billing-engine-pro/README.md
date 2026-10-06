# Campaign 02 — Historical Billing-Engine-Pro Input

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../../SPEC.md). Procedures: [operational skills](../../../docs/skills/).
Input contract: [campaign records](../README.md). Evidence: [RESULTS.md](../../RESULTS.md).

## Original task and profile

The candidate task was to implement `Engine` and `BillingError` in `repo/billing/core.py`:
tiered pricing, stacked discounts, regional tax, B2B reverse-charge and a minimum floor.
Original/self-contained fixture; no CoreLink or other-project artifacts. Profile: 30 requirements,
coupled-deep-interacting, DAG depth 9, k=5 and 8 WPs.

Interaction cases include discount-before-rounding, invoice subtotal as sum of rounded lines
rather than rounded sum, volume→coupon→loyalty stacking, tax on discounted totals, reverse-charge
tax/floor exemption, inclusive tier boundaries and integer-only quantities rejecting booleans.
These were intended difficulty levers, not proven reasons that a monolithic agent must fail.

## Immutable inputs

- [repo/](repo/) is the original starting skeleton, **expected red**, not a reference solution.
  Candidate edits belong in isolated run copies; `Engine` / `BillingError` remain the fixed API.
- [requirements.yaml](requirements.yaml) freezes statements, weights, dependencies and denominator.
- [checks/](checks/) is visible feedback; [holdout/](holdout/) is the final grader's input.
- [sprint.json](sprint.json) fixes R/D's 8-WP decomposition;
  [sprint_mono.json](sprint_mono.json) fixes M's gated whole-campaign repair baseline.
- [meta.json](meta.json) records `SATURATED`, M RSR 1.0 and 6 turns.

Agents must not repair the committed skeleton, weaken tests or alter frozen experiment inputs.
Pristine test failure is intended setup, not a failing Relay acceptance test.

## Evidence boundary

The calibration report records Sonnet satisfying all 30 requirements in 6 turns, $0.29.
The earlier README claim that a single-pass agent "reliably drops several" was contradicted
by this pilot. Metadata's extrapolation that only scale remains hard is historical and does
not prove headroom or a universal scale breakpoint.

Visible-check scores are smoke evidence. Current final grading uses the campaign-source held-out
suite against candidate final state; skipped-test/collection limits in `grader.py` still apply.
This saturated pilot supports retaining an overhead/pipeline point, not claiming Relay efficacy,
first-pass generalization or a multi-seed confidence estimate.

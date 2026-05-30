# Campaign 02 — billing-engine-pro

**Original, self-contained task. No CoreLink or other-project artifacts.** (Isolation: [../README.md](../README.md))

## Goal
Implement `repo/billing/core.py` (`Engine`, `BillingError`) — an advanced usage→billing engine with
**tiered pricing, stacked discounts, regional tax, B2B reverse-charge, and a minimum floor** — getting every
**precedence and interaction rule** right.

## Why it's hard (the headroom)
30 **interacting** requirements where order matters: discount-before-rounding; invoice subtotal = *sum of
rounded lines* (not round-of-sum); exact discount stacking (volume → coupon → loyalty); tax on the discounted
total; B2B reverse-charge zeroes tax **and** exempts the minimum floor; inclusive tier boundaries; strict
integer-only quantities (booleans rejected). A single-pass agent juggling all 30 reliably drops several.

## Profile
Type: coupled-deep-interacting · Size: 30 requirements · DAG depth 9 · k=5 → 8 work packages.

## Files
`repo/` (skeleton, Runner edits `billing/core.py`) · `requirements.yaml` (frozen ground truth) ·
`checks/test_engine.py` (one deterministic test per requirement) · `sprint.json` (frozen 8-WP decomposition) ·
`sprint_mono.json` (Arm M input) · `meta.json`.

## Grading
`python3 -m pytest checks/ -q` against the Runner's `repo/`. RSR = passing requirement-tests / 30 (weighted).

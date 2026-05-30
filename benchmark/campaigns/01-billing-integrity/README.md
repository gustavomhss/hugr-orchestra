# Campaign 01 — billing-integrity

**Original, self-contained task. No CoreLink or other-project artifacts.** (See the isolation contract in
[../README.md](../README.md).)

## Goal
Implement `repo/billing/core.py` so the usage→billing path is **lossless, tenant-isolated, correctly priced,
and auditable**.

## Profile
- **Type:** coupled-deep (dependency depth 6) · **Size:** 12 requirements · **k=3 → 7 work packages.**

## Files
- `repo/` — the starting repo; the Runner edits `repo/billing/core.py` (public API names are fixed).
- `requirements.yaml` — the frozen requirement set (ground truth; the RSR denominator).
- `checks/test_billing.py` — one deterministic test per requirement (the grader runs these).
- `sprint.json` — the frozen Relay decomposition (Arm R/D input). Arm M gets the goal + all requirements at once.
- `meta.json` — size/type/k + calibration record.

## Grading
Final state only: `python -m pytest checks/ -q` against the Runner's `repo/`. RSR = passing requirement-tests
/ 12 (weighted per `requirements.yaml`). Regression = tests that passed earlier and later fail.

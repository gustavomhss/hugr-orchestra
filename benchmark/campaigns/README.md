# Benchmark Campaigns — isolation contract & layout

## Isolation contract (hard rule)

Every campaign here is **original and self-contained**. Strictly forbidden:

- ❌ Copying or referencing **CoreLink** code, spec text, invariant IDs, or any file from it.
- ❌ Importing files from **any other project** on the machine.
- ❌ Reading from, or writing to, any path **outside `relay/`**.

Allowed: drawing on the *difficulty profile* of hard domains (billing integrity, multi-tenant isolation,
distributed failover, crypto, compliance) to author **fresh** tasks. Authoring fresh keeps the benchmark
contamination-immune (unseen by any model) **and** keeps it cleanly separated from every other project.

Everything the benchmark needs lives under `relay/benchmark/`. Nothing leaks in or out.

## Per-campaign layout

```
campaigns/<id>/            e.g. 01-billing-integrity/
├── README.md              goal, type, size band, provenance ("original; no external artifacts")
├── meta.json              { size_N, type, k, retry_budget, calibration: {arm_M_rsr, ...} }
├── repo/                  the minimal starting repo the Runner works in (original code)
├── requirements.yaml      frozen requirement set: [{id, statement, verifier, weight, deps}]
├── checks/                one deterministic check per requirement (test/AST/lint/grep); the grader runs these
└── sprint.json           frozen Relay decomposition (the METHODOLOGY output; Arm R/D input)
```

- `requirements.yaml` is the **shared ground truth** — Arm M, R, and D are all graded against `checks/`.
- `sprint.json` is the **frozen** output of [../METHODOLOGY.md](../METHODOLOGY.md), committed, never
  regenerated per run or hand-edited per arm.
- `meta.json` records the calibration (Arm M must reliably drop several requirements, else the campaign is
  discarded for lack of headroom).

## Naming

`NN-domain` — zero-padded index + short domain (`01-billing-integrity`, `02-tenant-isolation`, …).

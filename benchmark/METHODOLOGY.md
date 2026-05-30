# Relay Benchmark — Canonical Campaign → Work-Package Decomposition

> The **single, uniform** procedure used to turn any campaign into an ordered list of work packages.
> Applied identically to every campaign in the suite. Outputs a Relay-compatible `sprint.json`
> ([SPEC.md](../SPEC.md) §3). Read [GOALS.md](GOALS.md) and [KPIS.md](KPIS.md) first.

## Why the method must be canonical

If we hand-tune the decomposition per campaign, the decomposition itself becomes a confound — we'd be
measuring our cleverness, not Relay. So the method has three hard invariants:

1. **Uniform** — the same procedure for every campaign; no per-campaign judgement calls.
2. **Deterministic** — a pure function of `(requirement set, dependency graph, constants)`. The same
   campaign decomposes to the same WPs every time. Frozen and committed per campaign.
3. **Relay-compatible** — the output is a valid `sprint.json`; every DoD check comes from the Relay gate
   catalog ([SPEC.md](../SPEC.md) §4); deterministic verifiers preferred.

A consequence that makes the A/B fair: **the requirement set is the shared ground truth.** The monolithic
baseline (Arm M) and the Relay arm (Arm R) are scored against the *identical* requirement checks; only the
*delivery* differs. The decomposition is a controlled constant, not part of what we measure.

## Definitions

- **Campaign** `C = (goal G, requirements R = {R₁..R_N}, substrate S)` — a coherent engineering objective
  over a codebase/spec.
- **Requirement** `Rᵢ = (statement, verifier, weight, deps)`:
  - *statement* — one atomic, binary-checkable claim ("a revoked PAT fails closed with 401 within the
    propagation window").
  - *verifier* — the strongest check it admits: `test` > AST/static > `lint`/schema > `grep` > `llm` (last resort).
  - *weight* — relative importance (default 1; raise for CRITICAL invariants, à la SWE-Lancer value-weighting).
  - *deps* — the requirements that must hold for `Rᵢ` to be implementable/testable.

## The procedure (5 deterministic steps)

**Step 1 — Extract & normalize requirements.**
Flatten the campaign into atomic requirements. Each must be independently checkable; reject any whose check
is *too narrow* (rejects valid alternatives) or *too wide* (tests unstated behavior) — the SWE-bench Verified
gate. Target **≥ 80% deterministic verifiers**; the `llm` residue must be rubric-anchored. This list is
*also* the scoring backbone (RSR denominator).

**Step 2 — Build the dependency DAG.**
Draw an edge `Rⱼ → Rᵢ` when `Rⱼ ∈ deps(Rᵢ)`. The graph must be acyclic; break modelled cycles by splitting a
requirement. (A well-specified domain yields these edges directly — e.g. a "no billable event is lost"
requirement depends on "the audit log is append-only" and "events are deduplicated".)

**Step 3 — Partition into work packages (the fixed rule).**
Walk the DAG in topological order, greedily accreting requirements into the current WP while **all** of:
- the WP stays **dependency-closed** (every dep of an included requirement is satisfied by this or an earlier WP),
- the WP targets a **single coherent artifact/concern** (same module/surface — a fixed cohesion key derived from the requirement's target), and
- the WP holds **≤ k requirements** (`k` is a benchmark constant that bounds per-step context; it is also a *swept* parameter — see [DESIGN.md](DESIGN.md)).

When any condition would break, seal the WP and start the next. Ties broken by requirement id (so the
partition is reproducible). The result is a unique ordered list `WP₁..WP_m`.

**Step 4 — Define each work package.**
- `id` — `wp{n}-{cohesion-key}`.
- `title` — short label (the Map shown up front).
- `instructions` — "build the increment that satisfies {requirements in this WP}", with the substrate context.
- `dod` — the gate checks for **exactly** this WP's requirements (so a Gate pass ⇒ those requirements satisfied),
  drawn verbatim from Step 1's verifiers.
- `model` — optional tier override (default = the benchmark's fixed model; never varied within an A/B cell).

**Step 5 — Assemble the sprint.**
Emit `sprint.json` with the WPs in topological order and a constant `retry_budget`. Add the **regression set**:
at every WP's Gate, re-run all *previously passed* requirement checks (the PASS_TO_PASS analog) so keep-best is
enforced and correct→wrong flips (REG) are caught.

## Determinism & fairness properties (what this buys the benchmark)

- The decomposition is a **pure function**; freeze and commit `sprint.json` per campaign — no run-to-run drift.
- **Arm M** receives `G` + all of `R` as one brief (whole campaign at once). **Arm R / D** receive the
  decomposed `sprint.json`. The **same requirement checks grade all arms** → the only varied factor is delivery.
- Because `k`, `retry_budget`, and the cohesion key are explicit constants, the method is auditable and
  re-runnable by a third party — a requirement for "impeccable".

## The decomposer

The procedure is executed by a **fixed automated step** (a deterministic script over the requirement graph,
or a single frozen-prompt LLM pass constrained to the rule above), run **once** per campaign. Its output is
reviewed against Step 1's reject criteria, then **frozen and committed**. It is never re-generated per run and
never hand-edited for a specific arm.

## Worked micro-example (billing-integrity increment — original, illustrative)

Campaign `G`: "make the usage→billing path lossless and auditable." (An original, self-contained task;
no CoreLink artifacts.)

| Rᵢ | statement (atomic) | verifier | deps |
|---|---|---|---|
| R1 | every billable event is persisted exactly once (no loss) | property test: replay 1M events, Σ counters invariant | — |
| R2 | duplicate events deduped by `(tenant_id, request_id)` | test: 100 retries → 1 charge | R1 |
| R3 | audit_log rejects UPDATE/DELETE (append-only) | test: mutation attempt → constraint error | — |
| R4 | 3-layer reconciliation drift ≤ 0.1% | test: reconcile staged vs charged | R1, R2 |

DAG → topo order `[R1, R3] , [R2] , [R4]`; cohesion keys `emit`, `audit`, `dedup`, `reconcile`; `k=2`:

- **WP1** (`emit`+`audit`, dependency-closed, ≤k): instructions = build lossless emitter + append-only audit;
  dod = {R1.test, R3.test}.
- **WP2** (`dedup`): dod = {R2.test} + regression {R1, R3}.
- **WP3** (`reconcile`): dod = {R4.test} + regression {R1, R2, R3}.

Arm M gets `G` + {R1..R4} as one brief and is graded on the same four checks. Same ground truth, different delivery.

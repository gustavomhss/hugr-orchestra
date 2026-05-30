# Relay Benchmark — Experimental Design

> The runnable plan. Ties together [GOALS.md](GOALS.md) (the angles), [KPIS.md](KPIS.md) (the
> instruments), and [METHODOLOGY.md](METHODOLOGY.md) (how campaigns become WPs). The output is a
> **regime map**, not a leaderboard number.

## 1. The experiment in one paragraph

Hold the model, tools, sandbox, and budget constant. For each campaign in a **size-swept, typed suite**,
run three orchestration **arms** over **N seeds**, grade every arm against the **same frozen
requirement checks** in an isolated grader, and measure the [KPIS](KPIS.md) across the seven
[angles](GOALS.md). Report where Relay turns net-positive (the crossover), why (attribution), and at
what cost.

## 2. Arms (the only thing that varies)

| Arm | Delivery | Purpose |
|---|---|---|
| **M — Monolithic** | The whole campaign (`goal` + all requirements) in one brief; free-running; **same** aggregate retry budget and **same** test-feedback Relay gets. | The honest baseline. |
| **R — Relay** | The campaign decomposed via [METHODOLOGY.md](METHODOLOGY.md); WPs revealed sequentially; gated per WP; keep-best. | The system under test. |
| **D — Decomposed-ungated** | Same WP sequence as R, but **no gates** (advance on stop regardless). | Ablation: isolates *small per-step context* (D) from *gating + error-pruning* (R − D). |

Everything else — base model, temperature, tool set, sandbox image, token/turn budget, the requirement
checks — is identical across arms. Per the research, an orchestration that wins only by spending more
compute, or only on best-of-k, **has not won**.

## 3. Campaign suite

### Substrate: CoreLink (a deliberate, decisive choice)
Campaigns are sourced from the **CoreLink private spec corpus** (198 `INV-*` invariants with binary
pass/fail + work-item acceptance criteria across billing, multi-tenant isolation, distributed failover,
crypto, and compliance). Two reasons this is the right substrate:

1. **Contamination-immune by construction.** CoreLink's corpus is private and never in any model's
   training data — sidestepping the #1 benchmark killer (the reason SWE-bench Verified was retired).
   No temporal windowing or canary gymnastics needed: the tasks are genuinely unseen.
2. **Naturally high difficulty.** The invariants are dense, cross-referential, domain-specific, and
   interacting — exactly the composition-depth + OOD + interaction profile the research says is required
   to force frontier models to drop requirements (raw count alone does not).

Each campaign is translated into a **self-contained, runnable task**: a minimal repo + the frozen
requirement set + deterministic checks. The translation is reviewed against the Step-1 reject criteria
and committed.

### The two sweep axes
- **Size** (the central angle): campaigns at `N ∈ {8, 16, 32, 64}` requirements (and the WP cap
  `k ∈ {3, 6}` as a secondary sweep). Crossover lives along this axis.
- **Type** (generalization angle): three shapes per size band —
  *coupled-deep* (long dependency chains, shared state), *independent-shallow* (parallelizable, flat),
  *dense-interacting* (near-conflicting constraints on one artifact).

### Calibration (mandatory before trusting numbers)
Pilot Arm M (the strongest baseline) 3–5× on each campaign. If it scores **> ~85% RSR**, the campaign
lacks headroom → raise composition depth / interaction / density until M reliably drops several
requirements. Confirm a **monotonic model-ladder spread** (a weak→strong model gradient) before shipping
the campaign. A campaign with no headroom is discarded.

## 4. Scoring harness

- **Per-requirement, deterministic, final-state.** Each requirement is one `FAIL_TO_PASS` check bundle;
  RSR = weighted satisfied / total. Grade the **final repo state only**, never the agent's commands or logs.
- **Regression set.** Every campaign carries a `PASS_TO_PASS` set; REG = requirements that passed then broke.
- **Isolation & blinding.** The grader runs in a **separate process the agent cannot reach**, parses
  **structured output** (never substring/`eval`), and is **blind to which arm** produced the artifact.
- **LLM-judge residue.** Only for the genuinely subjective < 20%; rubric-anchored, order-randomized,
  calibrated FP/FN against human labels (LLM code-vs-spec judging systematically over-rejects correct code).

## 5. Fairness controls (non-negotiable)

1. **Budget-matched.** One dominant resource (total LLM calls *or* tokens) held equal across arms; Arm M
   gets the same aggregate retry/turn budget R spends across all WPs. Report raw **and** cost-normalized (CNQ).
2. **Equal oracle access.** The Gate's tests are the worst confound — Arm M must receive the **same tests**
   as retry feedback, or we measure oracle access, not decomposition.
3. **Blind grading**, **fixed model + temperature**, **N seeds per cell**.
4. **Pre-registration.** The primary metric (CNQ with REG + REL), the significance test, and the seed
   count are fixed **before** running. No post-hoc metric shopping.
5. **Adversarial harness check.** Run an exploit agent against the grader before trusting any number
   (BenchJack: all 10 audited benchmarks were hackable; the canonical exploit is a 9-line `conftest.py`).
   Iterate the harness until residual hack rate ≈ 0.

## 6. Analysis plan → the regime map

For each `(size, type)` cell, aggregate over seeds and report:

- **RSR / CCR / REG** per arm, with confidence intervals.
- **Crossover**: the size at which `RSR(R) − RSR(M)` crosses zero and stays positive.
- **Attribution**: decompose the Relay effect as `R − M = (D − M)` [context-bounding] `+ (R − D)` [gating].
- **Cost curve**: CNQ vs size; flag the overhead regime where R is net-negative.
- **Reliability**: pass^k and RSR variance per arm.
- **Mechanism evidence**: live context size (CTX) vs RSR, to confirm the context-scale story.

Each headline claim ships with its statistical test (effect size + p-value), per the pre-registration.

## 7. Controlled confounds (the checklist)

| Confound | Control |
|---|---|
| Decomposition cleverness | Canonical, frozen [methodology](METHODOLOGY.md); same for all campaigns |
| Extra compute buys the win | Budget-matched; CNQ reported; Arm D ablation |
| Oracle/test-feedback leakage | Arm M gets the identical tests as feedback |
| Best-of-k luck | pass^k over N seeds, never best-of-k |
| Grader gaming | Isolated, blind, structured-parse grader; adversarial exploit pass |
| Train/test contamination | Private CoreLink substrate (unseen by construction) |
| Ambiguous requirements | Step-1 reject gate (too-narrow / too-wide checks discarded) |
| Ceiling / no headroom | Per-campaign calibration; discard saturated campaigns |

## 8. Deliverables

- The frozen campaign suite (repos + requirement checks + decomposed `sprint.json` per campaign).
- The arm runners (M / R / D), the isolated grader, and the adversarial harness report.
- A results notebook producing the **regime map** (the §6 outputs) with pre-registered tests.
- An honest verdict: the crossover, the attribution, the safety result, and the cost curve — including,
  plainly, the regime where Relay is overhead.

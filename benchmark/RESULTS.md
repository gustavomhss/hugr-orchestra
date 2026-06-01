# Relay Benchmark — Results

## Pipeline validation — campaign 01 (uncalibrated; NOT a result)

First end-to-end runs, proving the harness works (grader + Relay hook + run_arm + KPI capture).
**Campaign 01 is saturated** — both arms reach RSR 1.0 — so these numbers measure the *pipeline*, not
Relay's value. They already reproduce the predicted **overhead regime**: with no headroom, Relay costs
more for identical quality.

| Arm | RSR | CCR | REG | cost $ | out-tok | turns |
|---|---|---|---|---|---|---|
| M — monolithic (1-WP, gated) | 1.00 | 1 | 0 | 0.25 | 6873 | 6 |
| R — relay (7-WP, gated)      | 1.00 | 1 | 0 | 0.53 | 7860 | 23 |

**Observation:** on a saturated campaign, R = **2.1× cost, 3.8× turns, same RSR** → pure overhead — exactly
what [GOALS.md](GOALS.md) §2 predicts *below the crossover*. This validates both the harness and the
hypothesis-shape; it is not yet a measurement of Relay's value.

**Next:** calibrate campaign 01 (raise composition depth / interaction / density until Arm M reliably drops
requirements), then run all three arms (M / R / D) across the size sweep. Only past the crossover does the
comparison become meaningful.

---

## Held-out grading + the M-breakpoint hunt (2026-05-30) — the decisive negative result

Two upgrades make these numbers trustworthy where the campaign-01 pipeline numbers were not:

- **gate ≠ grader.** The runner's feedback gate is the visible `checks/`; the grade is an *independent*
  HELD-OUT suite (`holdout/`) with disjoint inputs + metamorphic invariants, anti-hack verified — a
  reward-hacker that aces the visible gate 100% scores only ~0.08–0.11 held-out.
- **Parametric, contamination-immune substrate.** `generator/gen_campaign.py` emits coupled campaigns at any
  N (validation + derived + cross-field rules); ground truth is a /tmp reference baked as literals.

### Question: does the monolith ever drop requirements as N grows?

Arm M = one prompt (the full spec) + a bounded full-suite repair loop (the realistic baseline). M-only sweep,
graded on the held-out suite:

| N (rules) | M held-out RSR | exit | turns | cost $ |
|---|---|---|---|---|
| 60  | 1.00 (60/60)       | time-capped (impl complete) | — | — |
| 150 | **1.00 (150/150)** | clean | 6 | 0.66 |
| 300 | **1.00 (300/300)** | clean | 7 | 0.81 |

**The monolith does not break up to N=300.** A strong model (Sonnet) implements 300 coupled, precisely-specified
rules in 6–7 turns for <$1, and the independent held-out grader confirms it *generalizes* (a compact general
dispatch, not hard-coded branches). Arm R (Relay) is, by contrast, pure overhead and far slower — at N=60 it ran
~150–200s/WP and timed out at 4/12 WPs; running R at higher N is dominated and unnecessary to reach the verdict.

### Verdict: no crossover up to N=300 → the amplifier thesis is unsupported on this substrate

This is the decisive negative result the white paper pre-registered as a kill condition (WHITEPAPER §5.2, §5.4,
§7 decision rule). It does **not** support "Relay recovers requirements the monolith drops at scale" — because
the monolith drops nothing. It **confirms** the durable positioning: Relay's value is the deterministic external
oracle + forward-only ratchet + verified-trace ledger (reliability insurance + compliance — *proof, not speed*),
which hold at all N and never depended on a crossover existing.

### Honest boundary of this result

The generated substrate is **wide but shallow**: N individually-simple rules under a *complete, precise* spec —
exactly the regime strong models ace first-pass. It does NOT probe the deepest real-world failure mode: a large,
*evolving* context where early decisions must constrain late ones and the coherent whole exceeds what the model
holds reliably. Whether that regime (a) admits a clean deterministic oracle and (b) is one where Relay wins is
still open — and is precisely the benchmark that is hard to build. Until such a substrate exists and shows a
crossover, the efficacy half stays unsupported, and we ship the control-plane / compliance product.

---

## v2: the non-compressible substrate (the amplifier's last shot) — still no break (2026-05-31)

To rule out that v1's negative was an artifact of *compressibility* (templated rules collapse to one
general dispatch, so the model never holds N distinct things), generator v2 (`gen_campaign_v2.py`) emits
N **bespoke** functions g1..gN — each a unique arithmetic expression that calls one earlier function (a
single-call chain, so an error propagates), each applying 3 per-function global rules (index parity /
index%7 / has-a-call). There is no table to interpret: the model must emit N **distinct** definitions and
apply the right global-rule combination to each. Same gate≠grader + clean /tmp oracle; held-out
anti-hack verified (cheat ≈0.03).

| substrate | N | M held-out RSR | turns | cost $ |
|---|---|---|---|---|
| v2 bespoke-graph | 150 | **1.00 (150/150)** | 8 | 1.35 |
| v2 bespoke-graph | 300 | **1.00 (300/300)** | 8 | 1.16 |

Even with the compression shortcut removed and cross-function coupling added, the monolith implements 300
distinct, coupled, non-local-rule-bearing functions in 8 turns for ~$1, held-out-confirmed. **The amplifier
thesis is now falsified on two independent substrates.**

### What this rules in and out
A *complete, precise* spec of up to N=300 distinct coupled requirements is implemented first-pass by a strong
model **regardless of compressibility**. The failure modes that actually break long agentic work — ambiguity,
underspecification, evolving requirements, or context that genuinely exceeds the window — are exactly the ones
that resist a clean deterministic oracle. The only remaining lever with a clean oracle is sheer
output/context **saturation** (N ≫ 300, e.g. 1000+), but (a) M's bounded-repair loop gets multiple turns, so
it may still complete — turning it into a **cost** question, not a quality one; and (b) a win there is "M
can't fit it in one pass," a mechanical-capacity regime, not reasoning amplification. **Verdict: on every
clean-oracle substrate up to N=300, there is no crossover. The durable product is control-plane / compliance.**

---

## N=500: the saturation lever, integrity-guarded (2026-05-31)

The one remaining lever §"What this rules in and out" left open was sheer **scale** (N ≫ 300). Tested it
directly at **N=500** on the v2 non-compressible bespoke-graph substrate, via `run_crossover.py` — a new
orchestrator that **refuses to report an RSR unless the run proves itself real**: it validates that the
model actually executed (non-empty `run.json` with real turns/tokens) AND that the run's `engine/core.py`
is **not** byte-identical to the `/tmp` reference (a reference-leak guard). Only runs passing both are
counted; the grader-discriminates check (pristine skeleton must FAIL the held-out suite) confirmed the
oracle still tests the candidate (500/500 fail on the empty skeleton).

| substrate | N | arm | M held-out RSR | valid? | turns | out-tok | cost $ |
|---|---|---|---|---|---|---|---|
| v2 bespoke-graph | 500 | M (monolith) | **1.00 (500/500)** | ✅ guards passed | 7 | 88,178 | 1.84 |

**The monolith aces N=500 too** — 500 distinct, coupled, non-local-rule-bearing functions implemented
first-pass in 7 turns for ~$1.84, held-out-confirmed, with the implementation verified to be the model's
own work (not a leaked reference). This is a **fifth independent substrate point** and it pushes the
no-crossover finding past the scale lever that §"What this rules in and out" had flagged as the last
open question.

> Methodological note: an earlier attempt to run this from *inside* a Claude session produced a false
> `RSR 1.0` — `claude -p` did not execute (empty `run.json`) and the `/tmp` reference leaked into the run
> dir, so the grader scored the reference against itself. `run_crossover.py`'s two guards catch exactly
> that pair and mark such runs INVALID; the table above is the clean-terminal run that passed both.

### Updated verdict
On every clean-oracle substrate **up to N=500**, there is no crossover. Intricacy is not a difficulty
lever and — now measured, not extrapolated — neither is scale to N=500. The amplifier thesis stays
unsupported; the durable product is the **control-plane / compliance** surface (external oracle +
forward-only ratchet + verified-trace ledger), whose value never depended on a crossover existing.

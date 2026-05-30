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

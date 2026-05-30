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

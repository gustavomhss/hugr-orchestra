# Relay Benchmark — Historical Measurement Goals

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../docs/skills/).
This is the question register behind [DESIGN.md](DESIGN.md), not a promise that every metric
was collected. [RESULTS.md](RESULTS.md) bounds the evidence; [KPIS.md](KPIS.md) defines instruments.

## Question

In what regime does decomposition plus per-step gated execution beat an end-gated monolithic
repair baseline, by how much and why, and where does it instead add overhead?

The original hypothesis expected a crossover as size increased. Historical M pilots reached
ceiling at the reported points; the only committed N500 aggregate is v2, seed 1, M only.
Those observations did not demonstrate the expected advantage, and do not establish a universal
absence of crossover or a complete statistical sweep.

## Seven angles retained

| Angle | Original question / hypothesis | Comparison and required evidence |
|---|---|---|
| Efficacy | Higher delivered fraction on large coupled campaigns? Hypothesis: R beats M. | Matched-budget M/R, held-out RSR/CCR/REG |
| Scaling | Does advantage widen with N, context or horizon? Hypothesis: overhead before crossover, positive margin after. | Size/context sweep, RSR gap, RET, HOR |
| Attribution | Smaller revealed increments or gates? Hypothesis: both, gating especially on regression. | M/R/D ablation, CTX; revealed count is not live-context size |
| Regression | Does keep-best reduce correct→wrong transitions? Hypothesis: REG(R) near zero and below M. | Per-requirement states over time, not final grade alone |
| Cost | Is a quality change worth compute? Hypothesis: lower CNQ below crossover, higher after. | Tokens/calls/turns/USD/wall, budget controls and CNQ |
| Reliability | Improved floor or luck? Hypothesis: lower variance and higher all-runs success. | Repeated comparable seeds/runs; pass^k distinct from best-of-k |
| Generalization | Does effect depend on coupling, depth or interaction? Hypothesis: bigger on coupled/dense work. | Typed suite, segmented effects, uncertainty per cell |

These are hypotheses, not measured facts. No completed M/R/D matrix or repeated-seed reliability
estimate accompanies the N500 record. Mechanism tests showing that a check re-blocks are not
proof that per-step gating improves population-level outcomes.

## Intended verdict

The intended output was a regime map with crossover, attribution, regression evidence and a
cost curve, each tied to seeds, comparable budgets, held-out grading and adversarial checks.
The delivered record instead supports a narrower negative finding: reported M runs were
saturated; a small billing pipeline comparison showed overhead for equal visible quality.

Agents must preserve saturated/invalid runs as evidence rather than rewrite campaign inputs
to fit the hypothesis. Authoring effort, review time and subjective elegance were contextual
questions, not scored efficacy metrics. Current execution procedures belong in skills.

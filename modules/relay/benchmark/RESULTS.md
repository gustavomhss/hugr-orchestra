# Relay Benchmark — Historical Results and Evidence Limits

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../docs/skills/).
These are May 2026 observations, reconciled against baseline
`684456d571e8deb5f435d39e789e1b1258453d85`. They are not a current benchmark runbook.
Agents quoting them must preserve the artifact/provenance distinctions and limits below.

## 1. Billing pipeline pilots — saturated, not efficacy proof

Campaign 01's initial end-to-end comparison recorded:

| Arm | RSR | CCR | REG reported | Cost $ | Output tokens | Turns |
|---|---|---|---|---|---|---|
| M — one WP, gated | 1.00 | 1 | 0 | 0.25 | 6,873 | 6 |
| R — seven WPs, gated | 1.00 | 1 | 0 | 0.53 | 7,860 | 23 |

The roughly 2.1× cost / 3.8× turns comparison is a pipeline/overhead observation at equal
reported quality. The original runs were not established as held-out efficacy evidence.
The zero REG summary does not establish full temporal grading coverage.

Campaign 02's [metadata](campaigns/02-billing-engine-pro/meta.json) records M saturation at
30 requirements, 6 turns; the historical report gives $0.29 and reports R also at RSR 1.0.
No matching R usage summary was retained here. Campaign 01 metadata still says calibration
pending; campaign 02 metadata's "only SCALE" extrapolation is historical, not a current conclusion.
Neither immutable metadata file has been rewritten to fit this evidence summary.

## 2. v1 templated-coupled M observations — 2026-05-30

[generator/gen_campaign.py](generator/gen_campaign.py) emits validations, derived fields and
cross-field rules for a record processor. Expectations are generated from an external `/tmp`
reference; visible/held-out suites use different inputs.

| N | M held-out RSR reported | Exit reported | Turns | Cost $ |
|---|---|---|---|---|
| 60 | 1.00 (60/60) | Time-capped; implementation reported complete | — | — |
| 150 | 1.00 (150/150) | Clean | 6 | 0.66 |
| 300 | 1.00 (300/300) | Clean | 7 | 0.81 |

The historical R-at-60 attempt reportedly timed out after 4/12 WPs, at roughly 150–200 seconds
per WP. It is an incomplete run, not an equal-budget superiority/inferiority result. These rows
are retained report-level observations; raw repeated-seed grades/usage were not committed in
the results directory. The time-capped N60 observation is not a clean-envelope completion claim.

The substrate is wide but precisely specified and compressible to general dispatch. The reported
M pilots found no recovery headroom; they do not test arbitrary evolving-context code campaigns.

## 3. v2 bespoke-function M observations — 2026-05-31

[generator/gen_campaign_v2.py](generator/gen_campaign_v2.py) emits distinct arithmetic
definitions, optional single calls to earlier functions, and ordered rules based on index%7,
presence of a call and parity. "Non-compressible" was the experiment's label for removing the
v1 table-dispatch shortcut, not a mathematical proof of incompressibility or reasoning difficulty.

| Substrate | N | M held-out RSR reported | Turns | Cost $ |
|---|---|---|---|---|
| v2 bespoke-graph | 150 | 1.00 (150/150) | 8 | 1.35 |
| v2 bespoke-graph | 300 | 1.00 (300/300) | 8 | 1.16 |

These are historical report-level rows, not a committed complete seed sweep. Historical visible-
lookup hacker probes reportedly scored approximately 0.08–0.11 held-out on v1 and 0.03 on v2.
Those narrow probes do not establish zero hack rate, hardened blinding or contamination immunity.

## 4. N500 — one committed v2 seed-1 M aggregate

Primary retained artifact: [results/crossover_N500_s1_M.json](results/crossover_N500_s1_M.json).

| Field | Recorded value |
|---|---|
| Substrate / size / WP cap | v2 bespoke-graph / N=500 / k=25 |
| Seed / arm | 1 / M only |
| RSR / validity | 1.0 / `valid:true`, empty reasons |
| Turns / output tokens | 7 / 88,178 |
| Cost / elapsed | $1.8373097999999999 / 1,866.2 seconds |
| Timeout / headroom threshold | 2,400 seconds / 0.85 |
| Optional grader sanity flag | **`check_grader:false`** |
| Run directory pointer | `_runs/N500-s1-k25-M` on the original machine |

The JSON stores aggregate usage/RSR, not candidate implementation, per-requirement grade,
pytest collection record, full transcript or independently anchored provenance. It cannot
establish "first-pass" success, even though the earlier prose used that phrase. There is no
N500 R/D comparison in this artifact, and v1 was not measured to 500 by this record.

The original narrative described a separate pristine-skeleton check as 500/500 failures; no
such result is stored in this JSON, and its optional sanity flag was false. Retain that as a
historical report, not as a prerequisite proven by the committed record.

An earlier attempt reportedly produced false RSR 1.0 with an empty model envelope and copied
reference implementation. The runner guards address that exact shape; they do not prove every
accepted candidate is exclusively model-authored.

## 5. What the code checks, and what it does not

### End-gated M is already built

[run_arm.sh](run_arm.sh) chooses M's monolithic sprint with `GATE=on`.
[relay_hook.sh](relay_hook.sh) runs its full campaign checks and permits bounded aggregate repair.
The product's former "M+CI absent" framing was wrong. This is the end-gated campaign baseline;
equal total compute is not enforced, and arbitrary project CI is not implied.

### Gate/grader split is directory-level

`run_arm.sh` removes `holdout/` from the runner copy; [grader.py](grader.py) grades the
campaign-source holdout via `RELAY_IMPL`. Visible-check fallback is explicitly non-independent,
valid for smoke only. The process/filesystem remain accessible under the same OS user; directory
removal is not a complete secrecy or sandbox boundary.

### Validity and sanity are bounded checks

[run_crossover.py](run_crossover.py) `validate_run` checks a nonempty parsable usage envelope,
nonzero turns **or** output tokens, error status and implementation presence. It rejects a
candidate byte-identical to the reference **when that reference exists**. It does not reject
transformed copies or prove broader provenance, and it can mark a run valid without a usable grade.

`--check-grader` considers anything except a clean pytest pass discrimination, including
infrastructure, import and collection failures. Its "pristine fails ⇒ discriminates" label is
not a strong sanity proof. The committed N500 record did not enable this option.

`grader.py` ignores pytest return code and marks only JUnit failure/error children as failures.
A skipped testcase can count as a successful requirement. Missing requirement results reduce
RSR, but that does not validate full collection or prevent success via skips. REG is a final
comparison only when `--baseline` is supplied, not an automatic history of every flip.

## 6. Supported conclusion

The reported M pilots were saturated on v1 through 300 and v2 through 300, plus the committed
v2 N500 seed-1 aggregate. These observations do not support a requirement-recovery/speed claim
for Relay on those tasks. The small billing pipeline showed overhead for equal reported quality.

They do **not** settle a statistical crossover at all sizes ≤500, show two substrates each to
500, establish a general win/loss for per-step gating, or compare high-N M/R/D at equal budget.
Repeated seeds, uncertainty, adversarial/skip/collection controls and evolving-context effects
remain unresolved. Current positioning stays narrow: external checks, progression and recorded
evidence, bounded by actual oracle and enforcement reach.

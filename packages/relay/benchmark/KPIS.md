# Relay Benchmark — Historical KPI Register

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../.opencode/skills/).
These definitions preserve the intended study. They are not claims that all KPIs are instrumented
or all fairness controls were enforced. Evidence: [RESULTS.md](RESULTS.md).

## 1. Quality

| KPI | Definition | Current instrument reach |
|---|---|---|
| RSR — Requirement Satisfaction Rate | `sum(weight of satisfied requirements) / sum(all requirement weights)` | `grader.py` maps requirement IDs from testcase names, AND-combines mapped tests; missing results fail requirements. Weight/ID extraction is regex-based YAML text matching. |
| CCR — Campaign Completion Rate | Run value 1 only if every weighted requirement is satisfied; mean across comparable runs | Grader emits a binary value, not confidence intervals or proof of process completion. |
| REG — Regression Count | Requirements previously satisfied that later fail | Grader compares final state with explicit `--baseline`; no baseline means no measured regressions, not proof that none occurred. Full-run flips require repeated grading. |
| REL — Reliability (`pass^k`) | Probability all k independent runs clear a declared success threshold; under IID rate p, `p^k` | Single-run pass fraction estimates p, not pass^k directly. No repeated-seed estimate in the N500 record. Not best-of-k / pass@k. |
| RET — Retention curve | Satisfaction versus accumulated context or horizon | Intended analysis; not emitted by the final-state grader or crossover summary. |

## 2. Cost

| KPI | Definition | Current instrument reach |
|---|---|---|
| TOK | Cumulative input/output tokens, with cache categories kept distinct | Run envelope and production arm transcript usage, when present; N500 summary retains output tokens only. |
| CALLS / TURNS | Model calls / agent turns | Run envelope exposes turns; it is not an equal-call budget control. |
| WALL | End-to-end elapsed time | Crossover `secs` includes arm execution/grading overhead; arm `elapsed_s` is separate per-state attribution. |
| USD | Reported model usage cost | Runner envelope cost, not a universal `TOK × one price`; cache/model pricing matters. |

Missing usage is **unmeasured**, not zero. First-state arm elapsed time is absent without an
entry stamp. `relay cost` reports recorded data; it does not infer every omitted interval.

## 3. Process diagnostics

| KPI | Definition | Current instrument reach |
|---|---|---|
| CTX | Live context tokens at a milestone | Not equivalent to cumulative usage or newly revealed requirement count; no automatic live-window metric in these runners. |
| GATE₁ | Fraction of WPs passing their gate on first evaluation | Derivable for suitable recorded traces; not held-out efficacy. |
| RETRY | Distribution of failures/retries per WP | Gate ledger events/corpus rows; arm round-collapse repeats count too. Driver semantics differ. |
| ESC | Fraction of declared runs/WPs exhausting budget | Denominator must be explicit; arm parking is not campaign completion. |
| HOR | Requirements/WPs delivered before an unrecovered failure | Needs a declared denominator/order and trace; unrevealed WPs are not automatically corpus rows. |

Original primary KPIs were RSR, REG, REL, TOK and CNQ. Corpus/dash telemetry is a built local
surface; it is not the full experimental metric set above.

## 4. Cost-normalized quality and fairness

`CNQ_tokens = 1000 × RSR / total_tokens`; `CNQ_usd = RSR / USD`, with token/cost definitions
and nonzero measured denominators. CNQ complements, not replaces, equal-budget quality,
regression and reliability comparisons. A ceiling-score ratio alone is not causal efficacy.

The historical design required comparable compute, equal visible oracle access, fixed model/
environment, blinded held-out scoring, repeated seeds and preregistered inference. The runner
implements common model/visible checks and a directory-level holdout split, but does not enforce
total compute matching, hardened blinding, a full seed sweep or a significance analysis.

## 5. Scoring limits agents must retain

[grader.py](grader.py) parses JUnit structurally, but only failure/error children fail a
testcase; skipped cases can count as successful. Pytest return code/collection completeness
are not separately checked. Visible fallback is labeled `visible-checks(NOT-independent)`
and is smoke-only evidence.

[run_crossover.py](run_crossover.py) validates a usage envelope and byte inequality against
an available reference, not full provenance or grader health. Its optional sanity check treats
infrastructure failures as discrimination. Thus `valid=true` and RSR 1.0 are bounded instrument
outputs, not automatic independent proof that every requirement was exercised correctly.

The intended verifier preference was execution/property tests, then AST/static, schema/lint,
regex, and finally rubric-anchored judges. An original target of at least 80% deterministic
requirements was design intent; neither it nor deterministic labels alone proves oracle strength.

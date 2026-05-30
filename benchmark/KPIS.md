# HuGR Relay — Benchmark KPIs

What the Relay benchmark measures, and why. Grounded in the design research (SWE-bench Verified,
SWE-Lancer, Terminal-Bench, IFEval/IFScale, ComplexBench, "Context Rot", "Illusion of Diminishing
Returns", BenchJack). The benchmark is a **budget-matched, blinded A/B** between orchestration arms
on large multi-requirement engineering campaigns:

- **Arm M — Monolithic baseline:** the whole campaign delivered at once, with the *same* retry and
  test-feedback budget Relay gets.
- **Arm R — Relay:** the campaign decomposed into work packages, gated per WP, keep-best.
- **Arm D — Decomposed-ungated (ablation):** WPs revealed sequentially but **without** gates — isolates
  "small context per step" from "gating/error-pruning".

The headline question: **does Relay deliver more of the campaign, more reliably, at comparable cost —
and does its margin widen as the campaign grows?**

---

## The three axes

We score every run on three axes. A win for Relay must show up on **Quality at equal Cost**, with the
**Process** axis explaining *why*.

### Axis 1 — Quality (did it deliver the campaign?)

| KPI | Definition | Why it matters | Method origin |
|---|---|---|---|
| **RSR — Requirement Satisfaction Rate** ⭐ | Fraction of the campaign's N requirements whose deterministic check passes (per-requirement partial credit). | The primary quality signal. Partial credit, not all-or-nothing. | IFEval *instruction-level accuracy* / ComplexBench *DRFR* |
| **CCR — Campaign Completion Rate** | All-or-nothing: 1 if every requirement passes, else 0 (averaged over seeds). | The strict bar; complements RSR. | SWE-bench *% resolved* / IFEval *prompt-level accuracy* |
| **REG — Regression Count** ⭐ | Number of requirements that were satisfied at some point and later broke (correct→wrong flips). | Relay's keep-best claim; we measured forced reflection regress correct code. | SWE-bench *PASS_TO_PASS* |
| **REL — Reliability (pass^k)** ⭐ | Across k seeds, the fraction where the run meets a target RSR — *all* k must clear it, not best-of-k. | Orchestration is about consistency, not luck. | pass^k (vs pass@k) |
| **RET — Requirement Retention curve** | RSR plotted against accumulated context / horizon length. | Direct test of the context-scale hypothesis: does the baseline decay as context grows? | "Context Rot" / "Lost in the Middle" |

### Axis 2 — Cost (what did it spend?)

| KPI | Definition | Why it matters |
|---|---|---|
| **TOK — Token Consumption** ⭐ | Total tokens, split **input vs output** and **cumulative over the run**. | The core cost axis. Decomposition+gating typically spends more — a fair win must hold at equal budget. |
| **CALLS / TURNS** | Number of LLM calls and agent turns. | The other compute axis; one of these is the *budget-matched* variable across arms. |
| **WALL — Wall-clock time** | End-to-end latency of the run. | Operational cost; gates add boundary latency. |
| **USD — Dollar cost** | TOK × per-model price (input/output). | Business-facing cost; enables per-WP model-tier comparisons. |

### Axis 3 — Process / diagnostics (how did it work? — explains the result)

| KPI | Definition | What it reveals |
|---|---|---|
| **CTX — Live context size per step** | Tokens in context at each stop, per arm. | The mechanism: Relay should hold smaller per-step context; the baseline's CTX grows and predicts its RSR decay. |
| **GATE₁ — Gate first-pass rate** | Fraction of WPs that pass their Gate on the first attempt. | Decomposition quality + task difficulty calibration. |
| **RETRY — Retries per WP** | Distribution of gate failures before a WP passes. | Where the work actually is; feeds retry-budget tuning. |
| **ESC — Escalation rate** | Fraction of WPs that exhaust `retry_budget` and escalate. | Unsolvable/over-tight DoD or genuinely hard WPs. |
| **HOR — Horizon length** | Requirements (or WPs) delivered before the first *unrecovered* failure. | Step-accuracy compounds; a small per-step edge shows super-linearly here. |

⭐ = **primary KPI** (the five we headline).

---

## The headline metric

A single comparison the whole benchmark rolls up to:

> **CNQ — Cost-Normalized Quality** = RSR per 1,000 tokens (and per dollar), reported **with REG and REL**.

Relay "wins" only if, at **matched budget**, it shows **higher RSR, lower REG, and equal-or-higher REL**
than Arm M — and **CNQ** confirms the win is not just bought with extra compute. The research is explicit
that an orchestration which wins only on best-of-k or only by spending more tokens **has not won**.

---

## Fairness controls (mandatory — these are how the A/B stays honest)

1. **Budget-matched.** Hold one dominant resource equal across arms (total LLM calls *or* total tokens);
   give Arm M the *same* aggregate retry/turn budget Relay gets across all its WPs. Report both raw and
   cost-normalized scores.
2. **Equal oracle access.** The Gate's tests are Relay's strongest lever *and* the worst confound. Arm M
   must get the *same* tests as retry feedback — otherwise we measure oracle access, not decomposition.
3. **Blind, isolated grading.** The grader runs in a separate process the agent cannot reach, tests
   **final state only**, parses structured output (never substring/`eval`), and does not know which arm
   produced the artifact.
4. **Model + temperature fixed**, multiple seeds per campaign, pre-registered metric + significance test.
5. **Adversarial harness check** before trusting any number (run an exploit agent against the grader;
   per BenchJack, all 10 audited benchmarks were hackable).

---

## Scoring primitives

- Each **requirement = one binary, independently-checkable statement**, verified by the strongest method it
  admits: execute a test > AST/static check > lint/schema > grep/regex > LLM-judge (last resort, rubric-anchored).
- Target **≥ 80% of requirements deterministically checked**; reserve the LLM judge for the genuinely
  subjective residue, anchored to a rubric and calibrated against human labels (LLM code-vs-spec judging
  systematically over-rejects correct code).
- **RSR = satisfied / total**; add dependency edges only where a requirement truly gates another
  (parent fail ⇒ children fail).

---

## Out of scope for KPIs (tracked, not scored)

Authoring effort, human review time, and subjective "elegance" are recorded for context but never enter the
score — only objective, reproducible measurements drive the verdict.

# Relay Benchmark — Measurement Goals & Angles

> Read this before [KPIS.md](KPIS.md). KPIs are the *instruments*; this file is *what we are trying
> to learn*. The KPIs only matter in service of these angles.

## The framing

We are **not** asking "is Relay good?". A single benchmark score is a vanity number — and we proved it
the hard way: across 8 single-size runs this session, frontier *and* cheap models scored at ceiling, so
the number measured nothing. The literature agrees (benchmarks die from saturation + contamination).

The benchmark exists to answer one scientific question, broken into angles:

> **In what regime does work-package decomposition + gated execution beat a monolithic baseline,
> by how much, and *why* — and where is it instead pure overhead?**

We expect — and want to *map* — a **crossover**: below some campaign scale, Relay is overhead (no
headroom; the model nails it in one shot); above it, Relay pulls ahead and the gap widens with scale.

---

## The seven angles

Each angle is a question + a hypothesis + the variable we sweep + the KPIs that answer it + the
experimental design it forces. (KPI names defined in [KPIS.md](KPIS.md).)

### 1. Efficacy — does it actually win?
- **Q:** At a fixed *large* campaign and matched budget, does Relay deliver a higher fraction of the
  campaign than dumping it all at once?
- **Hypothesis:** Yes on large, coupled, multi-requirement campaigns.
- **Vary:** arm (M monolithic vs R Relay).
- **KPIs:** RSR, CCR, REG.
- **Forces:** the core budget-matched A/B.

### 2. Scaling / crossover — does the margin grow with scale? *(the central angle)*
- **Q:** How does the Relay-minus-baseline gap change as campaign size grows (requirement count N,
  context length, horizon)?
- **Hypothesis:** ≈ 0 at small N (ceiling), positive and widening past a crossover point.
- **Vary:** campaign size — a sweep, not a single point.
- **KPIs:** RSR gap vs N, RET (retention curve), HOR.
- **Forces:** we must run a *size sweep*. This is the lesson of the whole session — one size proves nothing.

### 3. Attribution — *why* does it win?
- **Q:** If Relay wins, is it from the smaller per-step context, or from gating / error-pruning between WPs?
- **Hypothesis:** both contribute; gating dominates on regression, context-bounding on omission.
- **Vary:** add Arm D (decomposed-but-ungated).
- **KPIs:** CTX per step, RSR(M) vs RSR(D) vs RSR(R).
- **Forces:** the ablation arm. Without it, "decomposition just buys more tokens" stays unrefuted.

### 4. Safety / regression — does keep-best stop correct→wrong?
- **Q:** Does the gated keep-best design eliminate the regressions we *measured* forced reflection cause?
- **Hypothesis:** REG(R) ≈ 0 and < REG(M).
- **Vary:** arm.
- **KPIs:** REG (correct→wrong flips), tracked per-requirement over the whole run.
- **Forces:** per-requirement state logged at every step, not just at the end.

### 5. Cost-efficiency — is the win worth the compute?
- **Q:** Decomposition+gating spends more tokens/calls. Is the quality gain worth it — and where is Relay
  *net-negative* (the overhead regime)?
- **Hypothesis:** net-negative below the crossover, net-positive above it.
- **Vary:** arm × campaign size.
- **KPIs:** TOK, CALLS/TURNS, CNQ (cost-normalized quality), USD.
- **Forces:** budget-matching + cost-normalized reporting; a win bought only with extra compute is not a win.

### 6. Reliability — consistent, or just lucky?
- **Q:** Does Relay raise the *floor* (reduce variance), not only the mean?
- **Hypothesis:** lower RSR variance and higher pass^k.
- **Vary:** seeds (N per campaign).
- **KPIs:** REL (pass^k), RSR standard deviation.
- **Forces:** multiple seeds; report pass^k, never best-of-k.

### 7. Generalization — where does it help, where doesn't it?
- **Q:** Does the advantage hold across campaign *shapes* — coupled vs independent WPs, deep dependency
  chains, out-of-distribution / interacting requirements?
- **Hypothesis:** bigger help on coupled, deep-dependency, dense campaigns; little on independent, shallow ones.
- **Vary:** campaign *type* (a typed suite).
- **KPIs:** RSR gap segmented by campaign class.
- **Forces:** a deliberately typed campaign suite, not one homogeneous task.

---

## What a verdict looks like

We do **not** ship "Relay scored X". We ship a **regime map**:

- the **crossover point** (campaign scale where Relay turns net-positive),
- the **attribution** (how much of the gain is context-bounding vs gating),
- the **safety result** (regressions eliminated or not),
- and the **cost curve** (CNQ vs scale),

each with seeds, budget-matched, blinded, and adversarially harness-checked. If Relay is overhead below the
crossover, we say so plainly — that honesty is the point, and it's already half-proven.

---

## Non-goals (explicitly)

- A leaderboard number. - Beating a baseline on a task the baseline already aces. - Measuring "elegance" or
authoring effort. - Any metric that isn't objective, reproducible, and budget-controlled.

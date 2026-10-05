# Requirements — Block GEN (genesis / mining) · S1 lift-and-tag

### REQ-GEN-1a — deterministic $0-LLM S0/S1

source: INV-GEN-1 @ reference/atlas-genesis.md#gen-1
Genesis shall compute the S0 and S1 stages as $0-LLM pure functions of the repo at a pinned commit.
normative-clause: "S0 + S1 MUST be `$0`-LLM pure functions of the repo at a **pinned commit**"

### REQ-GEN-1b — re-run reproduces skeleton

source: INV-GEN-1 @ reference/atlas-genesis.md#gen-1
When re-run on the same rev, genesis shall reproduce a byte-identical skeleton.
normative-clause: "re-running on the same rev MUST reproduce a byte-identical skeleton"

### REQ-GEN-1c — re-run reproduces ranking

source: INV-GEN-1 @ reference/atlas-genesis.md#gen-1
When re-run on the same rev, genesis shall reproduce a byte-identical candidate ranking.
normative-clause: "MUST reproduce a byte-identical skeleton **and** candidate ranking"

### REQ-GEN-2a — no LLM on un-ranked sites

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
If a site is not in the ranked set, then genesis shall not spend an LLM call on it.
normative-clause: "LLM MUST be spent only on **ranked** sites"

### REQ-GEN-2b — spend highest-first

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall spend LLM calls on ranked sites highest-first.
normative-clause: "highest-first"

### REQ-GEN-2c — one bounded call per site

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall make exactly one bounded LLM call per site.
normative-clause: "**one bounded call per site**"

### REQ-GEN-2d — hard budget ceiling

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall bound each run by a hard budget defaulting to min(frontier_size, 200) sites per run.
normative-clause: "under a **hard budget** (default `--budget = min(frontier_size, 200)` sites/run)"

### REQ-GEN-2e — marginal-value halt

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
When the trailing-20-site admit-rate falls below 20%, genesis shall halt.
normative-clause: "halt when the **trailing-20-site admit-rate `< 20%`**"

### REQ-GEN-2f — no repo-wide LLM sweep

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall not run a repo-wide LLM sweep.
normative-clause: "No repo-wide LLM sweep"

### REQ-GEN-3a — cost tracks frontier not size

source: INV-GEN-3 @ reference/atlas-genesis.md#gen-3
Genesis shall make the LLM-call count a function of the PPR frontier (hotspot × SZZ × blast), never of file or line count.
normative-clause: "LLM-call count MUST be a function of the PPR frontier (`hotspot × SZZ × blast`), never of file/line count"

### REQ-GEN-3b — un-churned code raises no spend

source: INV-GEN-3 @ reference/atlas-genesis.md#gen-3
If un-churned code is added, then genesis shall not raise LLM spend.
normative-clause: "Adding un-churned code MUST NOT raise LLM spend"

### REQ-GEN-4a — grounded by subtreeHash

source: INV-GEN-4 @ reference/atlas-genesis.md#gen-4
Genesis shall ground every seeded fact by subtreeHash.
normative-clause: "Every seeded fact MUST be grounded (`subtreeHash`)"

### REQ-GEN-4b — pass the truth door and carry an obviousness score

source: INV-GEN-4 @ reference/atlas-genesis.md#gen-4
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
Genesis shall make every seeded fact pass the truth door at atlas-emit, and shall attach a mechanically-computed obviousness score to every emitted seed.
normative-clause: "pass the **truth door** at `atlas-emit`; every emitted seed MUST carry a mechanically-computed **obviousness score** (TOTALITY — a scoreless emitted fact is a defect, not a default; ADR-0012)"

### REQ-GEN-4c — reject the ungrounded; never reject the obvious

source: INV-GEN-4 @ reference/atlas-genesis.md#gen-4
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
If a seed is ungrounded, then genesis shall reject it; if a seed is obvious, genesis shall emit it carrying a low obviousness score, never reject it.
normative-clause: "an **ungrounded** seed is rejected (KNOW-2); an **obvious** seed MUST NOT be rejected — it is emitted with a low obviousness score, and the ranking decision is taken a-posteriori at retrieval (ADR-0012)"

### REQ-GEN-4d — no self-declared truth

source: INV-GEN-4 @ reference/atlas-genesis.md#gen-4
Genesis shall not let any seed self-declare true.
normative-clause: "No seed self-declares true"

### REQ-GEN-5a — write only candidates

source: INV-GEN-5 @ reference/atlas-genesis.md#gen-5
Genesis shall write only candidates.
normative-clause: "Genesis MAY write only **candidates**"

### REQ-GEN-5b — batched human ratification

source: INV-GEN-5 @ reference/atlas-genesis.md#gen-5
Genesis shall have every T0 and contested fact human-ratified via a batched, ranked interview.
normative-clause: "`T0` and any contested fact MUST be human-ratified (KNOW-7/8) via a batched, ranked interview"

### REQ-GEN-5c — never auto-promote

source: INV-GEN-5 @ reference/atlas-genesis.md#gen-5
Genesis shall not auto-promote a T0 or contested fact.
normative-clause: "never auto-promoted"

### REQ-GEN-5d — never one question at a time

source: INV-GEN-5 @ reference/atlas-genesis.md#gen-5
Genesis shall not conduct the interview one question at a time.
normative-clause: "never one question at a time"

### REQ-GEN-6a — signals only as ranking heuristics

source: INV-GEN-6 @ reference/atlas-genesis.md#gen-6
Genesis shall use mined signals (hotspots, SZZ, coupling, ownership) only as ranking heuristics.
normative-clause: "Mined signals (hotspots / SZZ / coupling / ownership) MUST be used only as **ranking heuristics**"

### REQ-GEN-6b — signal is not a fact until grounded

source: INV-GEN-6 @ reference/atlas-genesis.md#gen-6
While a signal is not grounded and ratified, genesis shall not treat it as a fact.
normative-clause: "a signal is **not a fact** until grounded and ratified"

### REQ-GEN-6c — churn alone mints no fact

source: INV-GEN-6 @ reference/atlas-genesis.md#gen-6
If only churn or SZZ signals exist for a site, then genesis shall not mint a fact.
normative-clause: "Churn/SZZ alone MUST NOT mint a fact"

### REQ-GEN-7a — hand off to born-from-work

source: INV-GEN-7 @ reference/atlas-genesis.md#gen-7
Genesis shall hand control to born-from-work rather than remain a sweeper.
normative-clause: "Genesis MUST hand control to born-from-work (KNOW-13), not remain a sweeper"

### REQ-GEN-7b — idempotent re-run upsert

source: INV-GEN-7 @ reference/atlas-genesis.md#gen-7
When re-run, genesis shall upsert already-grounded facts idempotently.
normative-clause: "idempotent against already-grounded facts (upsert, KNOW-15)"

### REQ-GEN-7c — incremental re-run

source: INV-GEN-7 @ reference/atlas-genesis.md#gen-7
When re-run, genesis shall proceed incrementally.
normative-clause: "A re-run MUST be incremental"

### REQ-GEN-8a — resume from last site

source: INV-GEN-8 @ reference/atlas-genesis.md#gen-8
If a run is interrupted, then genesis shall resume from the last completed ranked site.
normative-clause: "An interrupted run MUST resume from the last completed ranked site"

### REQ-GEN-8b — malformed yields partial skeleton

source: INV-GEN-8 @ reference/atlas-genesis.md#gen-8
If the repo or rev is malformed, then genesis shall yield an honest empty or partial skeleton.
normative-clause: "a malformed repo/rev MUST yield an honest empty/partial skeleton"

### REQ-GEN-8c — never throw

source: INV-GEN-8 @ reference/atlas-genesis.md#gen-8
If the repo or rev is malformed, then genesis shall not throw.
normative-clause: "never a throw"

### REQ-GEN-9a — create Awareness sources

source: INV-GEN-9 @ reference/atlas-genesis.md#gen-9
Genesis shall create the sources every Awareness facet rolls up from.
normative-clause: "Genesis MUST create the sources every Awareness facet rolls up from"

### REQ-GEN-9b — source-less facet is UN-SEEDED

source: INV-GEN-9 @ reference/atlas-genesis.md#gen-9
If a facet has no source, then genesis shall mark it UN-SEEDED.
normative-clause: "a facet with no source MUST be `UN-SEEDED`"

### REQ-GEN-9c — never fabricate a facet

source: INV-GEN-9 @ reference/atlas-genesis.md#gen-9
If a facet has no source, then genesis shall not fabricate one.
normative-clause: "never fabricated (MEM-11)"

### REQ-GEN-9d — mission stub stays unratified

source: INV-GEN-9 @ reference/atlas-genesis.md#gen-9
While no real DEFINE artifact is ratified, genesis shall keep the mission stub marked unratified.
normative-clause: "The `mission` stub MUST stay marked unratified until a real DEFINE artifact is ratified"

### REQ-GEN-10a — every stage binds a structural mechanism

source: INV-GEN-10 @ reference/atlas-genesis.md#gen-10
Genesis shall bind every stage to a named, deterministic structural mechanism.
normative-clause: "Every stage MUST bind to a named, deterministic structural mechanism"

### REQ-GEN-10b — no embedding, vector store, or ANN

source: INV-GEN-10 @ reference/atlas-genesis.md#gen-10
Genesis shall use no embedding, vector store, or ANN anywhere.
normative-clause: "There MUST be **no** embedding, vector store, or ANN anywhere (A-14)"

### REQ-GEN-11a — deterministic PPR ranking

source: INV-GEN-11 @ reference/atlas-genesis.md#gen-11
Genesis shall make the candidate ranking a deterministic function of the repo@rev via SZZ, hotspots, and temporal-coupling feeding a personalized PageRank with pinned damping and seed.
normative-clause: "The candidate ranking MUST be a deterministic function of the repo@rev (SZZ + hotspots + temporal-coupling feeding a **personalized PageRank** with pinned damping/seed)"

### REQ-GEN-11b — no model, no randomness

source: INV-GEN-11 @ reference/atlas-genesis.md#gen-11
Genesis shall carry no model and no randomness in the candidate ranking.
normative-clause: "it MUST carry no model and no randomness"

### REQ-GEN-11c — reproduces across runs and machines

source: INV-GEN-11 @ reference/atlas-genesis.md#gen-11
When re-run across runs and machines, genesis shall reproduce the candidate ranking byte-identically.
normative-clause: "MUST reproduce byte-identically across runs and machines"

### REQ-GEN-12a — LLM only proposes in S2

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
While in stage S2, genesis shall permit the LLM only to propose typed candidates.
normative-clause: "In S2 the LLM MUST only _propose_ typed candidates"

### REQ-GEN-12b — admission is mechanical

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
Genesis shall make admission mechanical.
normative-clause: "admission MUST be mechanical"

### REQ-GEN-12c — predicate admitted only if check HOLDS

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
If a predicate candidate's synthesized check does not compile or does not return HOLDS on the current code, then genesis shall not admit it.
normative-clause: "A **predicate** candidate MUST be admitted only if its synthesized `check` **compiles and returns `HOLDS` on the current code**"

### REQ-GEN-12d — failing check refined then dropped

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
If a predicate's synthesized check fails, then genesis shall refine it up to K times and then drop it rather than force it.
normative-clause: "a failing check is a counterexample → REFINE ≤K, then drop — never force"

### REQ-GEN-12e — advisory passes the truth door, and is scored for obviousness

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
If an advisory candidate does not pass grounding, then genesis shall not admit it; if it passes grounding, genesis shall admit it carrying a harness-computed obviousness score, whether or not the claim is obvious.
normative-clause: "an **advisory** candidate MUST pass grounding (the truth door) and MUST carry a harness-computed **obviousness score**; obviousness MUST NOT block admission (ADR-0012)"

### REQ-GEN-12f — chain-of-thought never persisted

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
Genesis shall not persist chain-of-thought as a fact.
normative-clause: "Chain-of-thought MUST be scratch — never persisted as a fact"

### REQ-GEN-12g — abstention is valid

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
Genesis shall treat abstention as a valid outcome via a grounded why-not.
normative-clause: "**Abstention MUST be a valid outcome** (a grounded why-not)"

### REQ-GEN-12h — no pressure to emit

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
Genesis shall not pressure the model to emit a fact.
normative-clause: "the model MUST NOT be pressured to emit a fact"

### REQ-GEN-12i — labelled likely-invariant not proof

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
Genesis shall label a predicate as a machine-checked likely invariant, never a proof.
normative-clause: "A predicate MUST be labeled a _machine-checked likely invariant_, never a proof"

### REQ-GEN-12j — teeth drop vacuous check

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
If a synthesized check does not flip to BROKEN on a mechanically-mutated counterfactual of the anchored subtree, then genesis shall drop it as vacuous.
normative-clause: "a synthesized `check` MUST be admitted only if it returns `HOLDS` on current code **and flips to `BROKEN` on a mechanically-mutated counterfactual** of the anchored subtree — a check no mutant can break is vacuous (a tautology / matches nothing) and MUST be dropped"

### REQ-GEN-12k — sound oracle first

source: INV-GEN-12 @ reference/atlas-genesis.md#gen-12
While a slot is type-expressible, genesis shall prefer the language's type-checker or LSP diagnostics over a synthesized CodeQL or Semgrep query; when the sound dependency/count oracle proves the slot genesis shall seal the fact `proven`, and when it abstains genesis shall not drop a grounded candidate but shall admit it as a justified (unsealed advisory) fact.
normative-clause: "for a type-expressible slot (`contract`, `ownership`, visibility/`dependency` order) the check MUST prefer the language's **type-checker / LSP diagnostics** (sound, `$0` — the compiler already ran) over a synthesized CodeQL/Semgrep query — and the sound dependency/count oracle (symbol-reverse / cardinality) only **awards** the `proven` seal, it MUST NOT gate admission: when it proves the slot the fact is sealed `proven` (carrying its re-runnable witness), and on **abstention** a grounded candidate MUST NOT be dropped but admitted as **`justified`** (an unsealed advisory, contestable) — oracle abstention is not a failing check (genesis-epistemic-contract.md)"

### REQ-GEN-13a — extra mechanisms off at base tier

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
While at the base tier, genesis shall keep every S2 mechanism beyond a single grounded proposal off.
normative-clause: "Every S2 mechanism beyond a single grounded proposal MUST be **off at the base tier**"

### REQ-GEN-13b — escalate only on value and uncertainty

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall switch on an additional S2 mechanism only when a cheap signal shows the candidate is high-value and uncertain.
normative-clause: "switch on only when a cheap signal shows the candidate is high-value (tier/blast) **and** uncertain"

### REQ-GEN-13c — default one sample

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall default to one sample with no self-consistency.
normative-clause: "one sample (no self-consistency)"

### REQ-GEN-13d — default advisory unless checkable

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall default a candidate to advisory unless it is checkable and at tier≥T1.
normative-clause: "**advisory unless checkable AND `tier≥T1`**"

### REQ-GEN-13e — default CEGIS K≤1

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall default CEGIS to K≤1.
normative-clause: "CEGIS `K≤1`"

### REQ-GEN-13f — refuter only for T0

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall run the refuter only for T0-candidates.
normative-clause: "refuter only for `T0`-candidates (small model)"

### REQ-GEN-13g — Semgrep before CodeQL

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall run Semgrep before CodeQL.
normative-clause: "Semgrep before CodeQL"

### REQ-GEN-13h — query DB built once

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall build any query DB once and never per-check.
normative-clause: "any query DB built once (amortized, never per-check)"

### REQ-GEN-13i — no whole-repo pass required

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall not require a whole-repo pass.
normative-clause: "Genesis MUST NOT require a whole-repo pass"

### REQ-GEN-13j — scopable to a subtree

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall be scopable, leaving the cold tail to born-from-work.
normative-clause: "it MUST be **scopable**, leaving the cold tail to born-from-work"

### REQ-GEN-13k — report cost per stage

source: INV-GEN-13 @ reference/atlas-genesis.md#gen-13
Genesis shall report cost per stage.
normative-clause: "report cost per stage"

### REQ-GEN-14a — loops opt-in or default-shallow

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall make each of the REVIEW, ENRICH, and EXPAND loops opt-in or default-shallow.
normative-clause: "The REVIEW / ENRICH / EXPAND loops MUST each be **opt-in or default-shallow**"

### REQ-GEN-14b — loops budget-gated

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall budget-gate each deepening loop.
normative-clause: "budget-gated"

### REQ-GEN-14c — loops carry a fixpoint stop

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall give each deepening loop a diminishing-returns or fixpoint stop.
normative-clause: "carry a **diminishing-returns / fixpoint stop**"

### REQ-GEN-14d — no unbounded loop

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall not let any loop run unbounded.
normative-clause: "No loop may run unbounded"

### REQ-GEN-14e — loops-off equals single pass

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
While all deepening loops are off, genesis shall cost the same as the single cheap pass.
normative-clause: "genesis with all loops off MUST equal the single cheap pass (GEN-13)"

### REQ-GEN-14f — loops reuse existing machinery

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall implement each deepening loop by reusing existing machinery (propose→verify, relate()).
normative-clause: "They MUST reuse existing machinery (propose→verify, `relate()`)"

### REQ-GEN-14g — no new subsystem

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall add no new subsystem for the deepening loops.
normative-clause: "add no new subsystem"

### REQ-GEN-14h — no duplicate lazy enrichment

source: INV-GEN-14 @ reference/atlas-genesis.md#gen-14
Genesis shall not duplicate born-from-work's free lazy enrichment.
normative-clause: "MUST NOT duplicate born-from-work's free lazy enrichment"

### REQ-GEN-15a — degenerate history falls back

source: INV-GEN-15 @ reference/atlas-genesis.md#gen-15
If the cheap pre-check detects degenerate history, then genesis shall fall the personalization vector back to structural signals.
normative-clause: "A cheap pre-check (commit count below threshold / shallow clone / blame concentrated in one commit) MUST detect degenerate history and **fall the personalization vector back to structural signals** (PPR without history seeding + type/API-surface density)"

### REQ-GEN-15b — history is booster not dependency

source: INV-GEN-15 @ reference/atlas-genesis.md#gen-15
Genesis shall treat history as a ranking booster and never a dependency.
normative-clause: "History MUST be a ranking _booster_, never a dependency"

### REQ-GEN-15c — degrade to structural centrality

source: INV-GEN-15 @ reference/atlas-genesis.md#gen-15
Genesis shall degrade to structural centrality rather than rank noise.
normative-clause: "genesis MUST degrade to structural centrality, never rank noise"

### REQ-GEN-16a — gate not on self-assessment

source: INV-GEN-16 @ reference/atlas-genesis.md#gen-16
Genesis shall not rest the non-obvious-and-actionable gate on the proposer's self-assessment.
normative-clause: "MUST NOT rest on the proposer's self-assessment" — UNAMENDED by ADR-0012 and load-bearing under it: the obviousness score is computed by the HARNESS's predicate over the source bytes, never read off a field the proposer wrote.

### REQ-GEN-16b — seed loose-but-thin

source: INV-GEN-16 @ reference/atlas-genesis.md#gen-16
Genesis shall seed loose-but-thin.
normative-clause: "Genesis MUST seed **loose-but-thin**"

### REQ-GEN-16c — accrue logged hits

source: INV-GEN-16 @ reference/atlas-genesis.md#gen-16
Genesis shall accrue logged hits for each seeded fact.
normative-clause: "a seeded fact accrues logged `hits` (KNOW-17)"

### REQ-GEN-16d — unconsulted fact decays out

source: INV-GEN-16 @ reference/atlas-genesis.md#gen-16
If no wave ever consults a seeded fact over its window, then genesis shall decay it out of the served set as archived and re-enterable.
normative-clause: "a fact **no wave ever consults decays out** of the served set (archived, re-enterable)"

### REQ-GEN-16e — threshold calibrates on hits

source: INV-GEN-16 @ reference/atlas-genesis.md#gen-16
Genesis shall calibrate the admission threshold against observed hits.
normative-clause: "the admission threshold calibrates against observed hits"

## §GEN-CONC — the S2 pass spends concurrently and reports as though it had not (task #158)

### REQ-GEN-CONC-1 — one seam for concurrency

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall admit concurrency only through a batched S2 dispatch port that receives candidates in ascending rank order and returns one positionally-aligned result per candidate.
normative-clause: "concurrency enters through the batched S2 dispatch port and nowhere else"

### REQ-GEN-CONC-2 — the report is invariant under scheduling

source: INV-GEN-8 @ reference/atlas-genesis.md#gen-8
The report of a concurrently-executed pass shall be byte-identical to the report of the same pass executed sequentially, excepting only the count of model calls actually issued.
normative-clause: "a concurrent pass reports byte-identically to a sequential one"

### REQ-GEN-CONC-3 — the resume cursor is a contiguous prefix

source: INV-GEN-8 @ reference/atlas-genesis.md#gen-8
Genesis shall set the resume cursor to the highest rank R such that every rank less than or equal to R has completed, never to the highest rank that merely finished first.
normative-clause: "the resume cursor is the highest rank whose every predecessor completed"

### REQ-GEN-CONC-4 — the ceiling is never overshot

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall not dispatch a site once the budget ceiling is reached, bounding each batch by the calls remaining.
normative-clause: "no site is dispatched once the ceiling is reached"

### REQ-GEN-CONC-5 — spend is reported apart from coverage

source: INV-GEN-2 @ reference/atlas-genesis.md#gen-2
Genesis shall report the model calls actually issued separately from the sites whose results were used, and shall report it always, including when the two are equal.
normative-clause: "model calls issued are reported separately from sites used, always"

### REQ-GEN-CONC-6 — durable writes remain serialized

source: INV-GEN-7 @ reference/atlas-genesis.md#gen-7
Genesis shall route every durable write through the pass loop, one site at a time in rank order, regardless of how the model calls were dispatched.
normative-clause: "durable writes remain serialized in rank order under concurrency"

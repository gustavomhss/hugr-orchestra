# Method-tags — Block GEN (genesis / mining) · S2 formal-decision

> **state:** S2 · **protocol:** [`formal-decision`](../../.claude/skills/formal-decision/SKILL.md) ·
> **axiom:** S1 frozen (`req-gen.md`; every behavioural INV has ≥1 REQ, atom-gate passed) ·
> **owner:** charlie (FORGE); genesis domain authored by jimmy (COMPASS).
>
> One tag per **behavioural** INV by the 3-conjunct rule. The GEN block carries **no** `formal` cluster — the
> sole machine-checked model in the whole Atlas is `FSPEC-merge` (Block KRN). Genesis is a
> **proposer-in-a-harness**: it seeds _machine-checked likely invariants_ (Daikon-style — hold on current code,
> survive mutants), **never** ∀-input proofs, so nothing here earns `formal`. The one determinism law
> (GEN-11 ranking reproducibility) is `PBT`; everything else is `reference-model` per the ratified baseline — a
> feature, not a compromise. All 16 GEN invariants are `behavioural` (register), so none carries `n/a`.

---

### INV-GEN-1

method-tag: reference-model
fspec: —
up-property: "deterministic skeleton: S0 (scan) + S1 (mine) are `$0`-LLM **pure functions** of the repo@rev — no LLM handle is reachable from the S0/S1 path — and re-running on the same rev reproduces a **byte-identical** skeleton (the ranking arm is delegated to GEN-11's determinism law)"
down-model: "reference `scan`/`mine` as pure functions of (repo,rev); a round-trip test runs the pair twice and asserts byte-identity of the skeleton; a static assertion that no LLM client symbol is in the S0/S1 call graph (`$0` purity)"
anti-rot: `genesis/ref/scan.ts` + `genesis/ref/mine.ts` (the pure reference stages) are imported as the mock in the skeleton unit tests; a nondeterministic or LLM-touching S0/S1 path diverges from them and breaks the byte-identity / zero-LLM-path assertion.

### INV-GEN-2

method-tag: reference-model
fspec: —
up-property: "rationed intelligence: LLM spend is a deterministic scheduling policy over the ranked frontier — never an un-ranked site (0), highest-PPR-first, exactly one bounded call per site, capped at `--budget = min(frontier_size, 200)`, halting when the trailing-20-site admit-rate `< 20%`; no repo-wide sweep"
down-model: "reference scheduler consumes the ranked `Candidate[]`, spends ≤1 call/site highest-first under the budget, and evaluates the trailing-20 admit-rate stop; the mock asserts (a) every visited site is in the ranked set, (b) call-count ≤ budget, (c) halt fires at the numeric threshold"
anti-rot: `genesis/ref/schedule.ts` (the spend scheduler) is the mock reused in the extract-loop tests; a path that calls an un-ranked site, spends twice on a site, or runs a whole-repo sweep breaks against it.

### INV-GEN-3

method-tag: reference-model
fspec: —
up-property: "cost tracks importance-surface, not size: the LLM-call count is a function of the PPR frontier (`hotspot × SZZ × blast`) alone; adding un-churned code raises spend by 0 (differential / metamorphic property)"
down-model: "reference cost-accountant `count = f(frontier)`; a differential test adds 10k lines of un-churned code to a fixture and asserts the call-count is unchanged (Δ=0)"
anti-rot: `genesis/ref/cost.ts` (the call-accountant) is the mock; a size-coupled code path (count reads file/line totals) diverges under the +10k-lines differential and breaks the build.

### INV-GEN-4

method-tag: reference-model
fspec: —
up-property: "grounded from birth: every seeded fact is grounded by `subtreeHash` and clears the **truth door** at `atlas-emit`; an **ungrounded** seed is rejected (`emitted:false`); no seed self-declares true. Obviousness **never** rejects — every emitted seed carries a mechanically-computed **obviousness score**, and the score is **total**: an emitted fact without one is a defect, not a default."
down-model: "reference emit-gate admits a seed iff its citation re-derives at `source@sha` **and** it is not **harmful to store** (a secret / PII); else `reject`. Obviousness is computed by the HARNESS's predicate over the source bytes and STORED as a score on every emitted seed — it is never an input to the admit/reject decision; the mock reuses the KNOW-2 grounding reference and asserts (a) a grounded-but-obvious seed still emits, (b) no emitted seed lacks a score"
anti-rot: `genesis/ref/emit-gate.ts` (reusing the KNOW grounding reference) is the mock; a self-declared or non-re-deriving seed that reaches the fact set breaks the emit-gate conformance test — as does a **resurrected obviousness gate** (an obvious seed yielding `emitted:false`) or a **scoreless emitted fact**. _(**AMENDED + RE-RATIFIED 2026-08-02** (owner) by [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): a gate destroys the very evidence needed to audit the gate, so obviousness is scored, never gated.)_

### INV-GEN-5

method-tag: reference-model
fspec: —
up-property: "propose, human ratifies the contested: genesis writes only **candidates**; a `T0` or contested fact reaches `ratified` only through a batched, ranked interview (cap 20 Q/session) — never auto-promoted, never one question at a time"
down-model: "reference writer emits candidate-only; a state machine where the only edge candidate→ratified for a T0/contested fact passes through `interview(batch)`; the mock asserts (a) no auto-promote edge exists, (b) the interview batch size > 1"
anti-rot: `genesis/ref/ratify-router.ts` is the mock; an auto-promotion path or a one-at-a-time interview breaks the router conformance test.

### INV-GEN-6

method-tag: reference-model
fspec: —
up-property: "history is a seed, not truth: mined signals (hotspots / SZZ / coupling / ownership) feed only the `rank` field, never the fact set; a site with signals but no grounded invariant mints 0 facts (churn/SZZ alone MUST NOT mint)"
down-model: "reference miner routes signals into the candidate `rank`, never into `Fact[]`; a differential test on a high-churn / high-SZZ file with no grounded invariant asserts 0 facts emitted"
anti-rot: `genesis/ref/mine.ts` (shared with GEN-1) is the mock; a path that mints a fact from a churn/SZZ signal alone breaks the 0-fact assertion.

### INV-GEN-7

method-tag: reference-model
fspec: —
up-property: "one-time then hand off; incremental idempotent re-run: genesis hands control to born-from-work (not a standing sweeper); a re-run re-indexes only changed files and **upserts** already-grounded facts (0 duplicates) — `genesis∘genesis ≡ genesis` on the grounded set"
down-model: "reference re-run upserts by fact id (idempotent), re-indexes only the changed-file set, and transfers control; the mock asserts a second run produces 0 duplicate facts and touches only changed nodes"
anti-rot: `genesis/ref/rerun.ts` (the upsert/incremental reference) is the mock; a path that re-sweeps or duplicates a grounded fact breaks the idempotence conformance test.

### INV-GEN-8

method-tag: reference-model
fspec: —
up-property: "total & resumable: an interrupted run resumes from the last completed ranked site; a malformed repo/rev yields an honest empty/partial skeleton with a `resumeToken` and **never throws** (0 exceptions)"
down-model: "the reference `atlas-genesis` is total by construction — entry points return a partial `GenesisReport` + `resumeToken`, never throw; a kill-resume test asserts resumption from the last site; the golden generator is PBT-fuzz over malformed repos/revs asserting no-throw"
anti-rot: the total reference pipeline (`genesis/ref/*.ts`) is the mock; PBT fuzzes it and the code side-by-side so a throwing path fails the shared no-throw property. _(Note: golden generator is PBT-fuzz; the tag stays `reference-model` because the total reference IS the oracle — the shape is robustness/totality + resume, not ordering, so it does not earn a standalone `PBT` tag; mirrors INV-KERNEL-7/8.)_

### INV-GEN-9

method-tag: reference-model
fspec: —
up-property: "seeds the self-model: genesis creates the sources every Awareness facet rolls up from (DEFINE stub `mission`, `constitution` from the ratified T0 manifest, `taste` at `CONVENTIONS.md@sha`); a source-less facet renders `UN-SEEDED`, never fabricated (MEM-11); the `mission` stub stays unratified until a real DEFINE artifact exists"
down-model: "reference Awareness assembler: facet-with-source → seeded, facet-without-source → `UN-SEEDED` sentinel; the `mission` stub carries an `unratified` flag; the mock reuses the MEM-11 reference and asserts no fabricated facet and the unratified flag holds"
anti-rot: `genesis/ref/awareness.ts` (reusing the MEM-11 reference) is the mock; a path that fabricates a source-less facet breaks the `UN-SEEDED` assertion.

### INV-GEN-10

method-tag: reference-model
fspec: —
up-property: "explicit-structural only: every stage binds a **named, deterministic** structural mechanism (tree-sitter / SCIP / stack-graphs / SZZ / hotspots / coupling / PPR / CodeQL / Semgrep); there is **zero** embedding, vector store, or ANN anywhere in the index or rank path (A-14) — a call-path / dependency-graph conformance assertion, not a property law"
down-model: "reference stage-registry enumerates the admissible mechanism set; a static assertion (dependency-graph + import grep) that no embedding/vector/ANN symbol is reachable from the index/rank/check path — `retrieval and ranking are explicit graph/query mechanisms`"
anti-rot: `genesis/ref/registry.ts` (the mechanism registry) is the mock; any code that imports an embedding/ANN library or a vector store enters the call graph and fails the zero-vector-path assertion, breaking the build.

### INV-GEN-11

method-tag: PBT
fspec: —
up-property: "reproducible ranking (determinism law): the candidate ranking is a deterministic function of the repo@rev — SZZ + hotspots + temporal-coupling feeding a **personalized PageRank** with pinned damping + seed — carrying no model and no randomness, and reproducing **byte-identically across runs and machines** (same rank from same rev)"
down-model: "executable reference ranker as oracle; PBT the determinism law: permute the def→ref adjacency / input order and re-run — assert an identical ranking; assert no RNG / clock / model handle in the path and that damping+seed are pinned; a stable total order breaks numeric ties"
anti-rot: `genesis/ref/rank.ts` (the reference PPR ranker) is the mock reused in the mine tests; a run-order-dependent, unseeded, or float-nondeterministic (unstable-sort) path diverges under the permutation property and breaks the build.

### INV-GEN-12

method-tag: reference-model
fspec: —
up-property: "proposer-in-a-harness, never an oracle: in S2 the LLM only _proposes_ typed candidates and admission is **mechanical** — a predicate is admitted iff its synthesized `check` **compiles**, returns **HOLDS** on current code, **and flips to BROKEN on a mechanically-mutated counterfactual** of the anchored subtree (the teeth / anti-vacuity gate); a failing check → REFINE ≤K then drop, never force; an advisory passes the grounding (truth) door and is SCORED for obviousness, never rejected for it (ADR-0012); chain-of-thought is never persisted; abstention is a valid outcome; a predicate is labelled a _machine-checked likely invariant_, never a proof; a type-expressible slot prefers the sound type-checker / LSP over a synthesized query — and the sound dependency/count oracle (symbol-reverse / cardinality) only AWARDS the `proven` seal, never gates admission: it seals `proven` when it proves the slot, and on abstention a grounded candidate is admitted `justified` (unsealed advisory, contestable), never dropped for lack of proof (genesis-epistemic-contract.md)"
down-model: "the **teeth-gate as an executable differential / mutation oracle** (NOT a formal model): given a candidate's synthesized CodeQL/Semgrep `check`, (a) compile it, (b) evaluate on the anchored subtree → require `HOLDS`, (c) evaluate on a mechanically-mutated subtree → require `BROKEN`; admit iff both hold, else refine ≤K then drop. The `check` IS the executable oracle; the mutation-flip is a mutation test. A reference admission harness also asserts CoT is scratch-only and that the sound dependency/count oracle AWARDS the `proven` seal but never drops a grounded candidate on abstention (it admits `justified`; genesis-epistemic-contract.md)"
anti-rot: `genesis/ref/admit-harness.ts` (the compile→HOLDS→mutate→BROKEN harness) is the mock reused in the extract tests; a vacuous check (survives every mutant), a non-compiling / non-HOLDS check, a self-forced fact, or a persisted chain-of-thought diverges from the harness and breaks the build. _(Tag is `reference-model`, deliberately **not** `formal`: this is conformance + mutation/differential testing with the LLM as a proposer in a harness — it verifies a **likely** invariant on current code, not a ∀-input theorem.)_

### INV-GEN-13

method-tag: reference-model
fspec: —
up-property: "cost discipline — cheap by default, escalate by value: every S2 mechanism beyond a single grounded proposal is **off at the base tier** and switches on only when a cheap signal shows the candidate is high-value (tier/blast) **and** uncertain; defaults are one sample (no self-consistency), advisory unless checkable ∧ `tier≥T1`, CEGIS `K≤1`, refuter only for `T0`, Semgrep before CodeQL, query DB built once; no whole-repo pass (scopable); cost reported per stage under the ceiling"
down-model: "reference cost-policy engine: base tier → exactly 1 LLM call/site with all extra mechanisms off; the escalation predicate `(high-value ∧ uncertain)` is the only gate that switches them on; the mock asserts a base-tier site costs exactly one call and the `GenesisReport` carries per-stage cost under the ceiling"
anti-rot: `genesis/ref/cost-policy.ts` is the mock; a base-tier path that fires self-consistency, the refuter, or CodeQL breaks the `exactly-one-call` assertion.

### INV-GEN-14

method-tag: reference-model
fspec: —
up-property: "deepening loops governed, not free-running: REVIEW / ENRICH / EXPAND are each opt-in or default-shallow, budget-gated, and carry a diminishing-returns / fixpoint stop (a no-revision round, marginal value `< ε`, or loop-until-dry on the admission bar); no loop runs unbounded; with all loops off, genesis cost equals the single cheap pass (GEN-13, Δ=0); loops reuse existing machinery (propose→verify, `relate()`), add no new subsystem, and do not duplicate born-from-work's lazy enrichment"
down-model: "reference loop-runner: each loop terminates at its fixpoint predicate within its budget; a config test asserts loops-off cost == the GEN-13 baseline (Δ=0) and that each loop reaches a fixpoint (no-revision / marginal<ε / dry) inside the budget bound — termination is a bounded-liveness assertion, not an unbounded search"
anti-rot: `genesis/ref/loops.ts` (the governed loop-runner) is the mock; an unbounded loop or a loops-off path that costs more than the single pass breaks the fixpoint / Δ=0 assertions.

### INV-GEN-15

method-tag: reference-model
fspec: —
up-property: "history-thin fallback: a cheap pre-check (commit count below threshold / shallow clone / blame concentrated in one commit) detects degenerate history and **falls the personalization vector back to structural signals** (PPR without history seeding + type/API-surface density); history is a ranking _booster_, never a dependency — genesis degrades to structural centrality, never rank noise"
down-model: "reference fallback-selector: on a degenerate-history fixture the pre-check trips and the ranker's personalization vector switches to structural + type-surface density (no history seeding); a differential test on a squashed/shallow repo asserts a non-degenerate frontier (not uniform / random noise)
anti-rot: `genesis/ref/fallback.ts` (the pre-check + selector) is the mock; a history-dependent path on a shallow/squashed fixture yields a degenerate (uniform/noise) ranking and breaks the non-degeneracy assertion.

### INV-GEN-16

method-tag: reference-model
fspec: —
up-property: "usefulness graded a-posteriori: the one non-mechanical gate — non-obvious ∧ actionable — never rests on the proposer's self-assessment; genesis seeds loose-but-thin, a seeded fact accrues logged `hits` (KNOW-17), a fact no wave ever consults over its window decays out of the served set (archived, re-enterable), and the admission threshold calibrates against observed hits"
down-model: "reference admission never reads a proposer self-score field; a hit-counter accrues on each consult; `decay(hits-over-window == 0) → archived + re-enterable`; the threshold is `f(observed hits)`; the mock reuses the KNOW-17 hits/decay reference and asserts admission takes no self-assessment input"
anti-rot: `genesis/ref/usefulness.ts` (reusing the KNOW-17 decay reference) is the mock; an admission path gated on a proposer self-score, or a fact that never decays despite 0 consults, breaks the conformance test. _(GEN-16 is **NOT amended** by [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md). The no-self-assessment clause above survives INTACT and is the clause most at risk of being read away: "scored at mine time, when the model is in hand" must NOT be read as "ask the model how non-obvious its own claim is" — the score is computed by the HARNESS's predicate over the source bytes, and ADR-0011 makes this structural, since `Candidate.signals` is deliberately not passed into the prompt. Hits-decay is likewise NOT replaced: the a-priori obviousness score is the **cold-start prior** (on a cold graph every fact has 0 hits, so decay is a no-op and a trivial fact ranks identically to a brilliant one) and hits-decay is the **warm update** (what readers actually consulted). They COMPOSE; neither subsumes the other.)_

---

## Refuse-to-model

- **theorem-proving / ∀-input invariants (out of scope)**: genesis seeds **machine-checked _likely_ invariants** (Daikon-style — hold on the current code + survive a mechanical mutant), and GEN-12 mandates they be labelled so — **never** proofs over all future inputs. There is no ∀-input formal model here; admission is sampled-current-code + mutation, not a proof ("success = the check HOLDS now and a mutant breaks it," not "the property holds for all inputs").
- **the LLM proposer's reasoning / semantic quality**: the model is a _proposer in a harness_; its chain-of-thought and its "is this fact good" opinion are **not** modeled — only the mechanical admission gate (compile + HOLDS + mutant-flip) is. Chain-of-thought is scratch, never persisted (GEN-12f).
- **usefulness a-priori**: no mechanism can prove a seed useful at write-time (GEN-16); usefulness is a _measured_ outcome via `hits` / decay, not a correctness oracle to model. **This refusal STANDS under ADR-0012** and is not weakened by the a-priori obviousness score: a score is a _ranking prior_, not a proof, and ADR-0012 explicitly does not claim to have made the non-obviousness verdict mechanical (§"What this ADR does NOT close" — the predicate itself). What is now modeled is that the score is COMPUTED and STORED (totality) and that it never touches the admit/reject decision — never that it is correct.
- **LLM determinism / "modeling the model"**: the LLM's output is nondeterministic by nature — genesis wraps it in a deterministic harness. We model that _admission_ is mechanical and reproducible given a fixed candidate set; we do **not** model the model.
- **the code + the external analyzers**: conformance-tested (sampled) against the reference models; the third-party black boxes — tree-sitter / SCIP / stack-graphs / CodeQL / Semgrep / `git blame` / the PageRank impl — are trusted primitives, not modeled. SZZ is itself a **heuristic** → a _ranking_ signal, never truth (GEN-6).
- **performance / cost magnitude**: "~90% `$0`", "cheaper than embedding", token / wall-clock cost are load + econ facts covered by measurement, with no correctness oracle — GEN-3 models call-count _coupling_ (Δ=0 on un-churned code), not runtime.
- **concurrent + crashing executions simultaneously**: resumability (GEN-8) and durability are checked _separately_ from any concurrency, never in one model (ShardStore rule).

## No formal cluster (GEN)

Block GEN carries **no** `FSPEC`. The Atlas's sole machine-checked formal model is `FSPEC-merge` (Block KRN,
covering the CRDT OR-Set merge core). Genesis fails conjunct #2 of the 3-conjunct rule everywhere: its
combinatorial risk is bought down by the **teeth / mutation gate** (GEN-12) — a differential/mutation test, not
a combinatorial-state model — and a competent engineer plus the propose→verify harness plausibly catches the
bugs. Tagging any GEN invariant `formal` would burn the formal budget on a proposer-in-a-harness that
explicitly does **not** prove ∀-input properties.

## Completion report

- tagged-register: `docs/requirements/method-tags-gen.md`
- tag histogram: **formal 0** · **exhaustive 0** · **PBT 1** (GEN-11) · **reference-model 15** (GEN-1..10, 12..16)
- FSPEC: **none** in GEN (the sole Atlas formal model is `FSPEC-merge`, Block KRN)
- refusal count: **7**
- every GEN-1..16 tagged: **yes** (16/16; all behavioural, 0 `n/a`)
- shape-no-fit flags: **none** (every shape maps — determinism→PBT, teeth-gate→reference-model/mutation, no-ANN→reference-model call-path assertion, totality→reference-model+PBT-fuzz golden)
- → next_state **S3** (goldens).

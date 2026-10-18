# atlas-genesis — Reference

> owner: jimmy (COMPASS — mining/genesis domain) · grounding: builds on `atlas-init` (KNOW-6, TOOLS-5), born-from-work (KNOW-13),
> the admission bar + propose→ratify (KNOW-7/8), the write-decision (KNOW-15), the predicate evaluator
> (KNOW-16) · status: draft

## Purpose

**Genesis** is how the Atlas is seeded onto an **already-existing (brownfield) repo** — the one-time
bootstrap that turns a codebase with no Atlas into one with a grounded Knowledge base + territory map.
Thesis: **deterministic skeleton, rationed intelligence** — ~90% is a `$0`-LLM mechanical build, LLM is
spent _only_ at a ranked frontier, git-history is the free seed, the human ratifies only the contested.

> **Cost scales with the codebase's _importance-surface_, not its size**, and it is **cheaper than
> embedding the repo**, because nothing is vectorized and no model touches un-ranked code.

> **Why explicit-structural, not embeddings; the S2 reasoning loop; the cost model & honest limits** are in
> the explanation companion [`explanation/genesis-reasoning.md`](../explanation/genesis-reasoning.md). This
> reference is the normative spec: pipeline, invariants, surface, acceptance.

## The pipeline — each step bound to its mechanism

```
S0 scan      $0 · no LLM     → Skeleton     : 3 axes + content-address every node (= atlas-init)
S1 mine      $0 · mechanical → Candidate[]  : named MSR signals → PageRank-RANKED sites (not facts)
S2 extract   LLM · rationed  → Fact[]        : one bounded call per top site; predicate check = CodeQL/Semgrep
S3 interview human · batched → Ratified[]    : the contested (owner/tier/intent), ranked, never 1-by-1
S4 handoff   —               → born-from-work: one-time seeding ends; incremental thereafter
```

### S0 — structural skeleton (`$0`, no LLM)

- **AST + def/ref tags** via **tree-sitter** per-language grammars + a `tags.scm`-style query (the exact
  mechanism Aider's repo-map uses) → the `spatial` axis and the raw symbol def/ref edges.
- **Precise cross-file / cross-language resolution** for the `dependency` axis via a **SCIP** indexer
  (Sourcegraph; Protobuf; already emitted by `rust-analyzer`, `scip-typescript`, `scip-python`) or
  **stack-graphs** (GitHub, incremental). tree-sitter alone is a _parser_, not a name-resolver — it cannot
  resolve re-exports / barrels / dynamic dispatch; those become explicit `unresolved` edges (INDEX-13).
- Content-address every `CodeNode` into the BLAKE3 CAS. **Ships zero facts** — territories at `T2/advisory`,
  T0 only _flagged_ (KNOW-6/7). The addressable substrate, nothing more.

### S1 — git-history mining (`$0`, mechanical) — each signal a named technique

The log is a free, high-signal corpus. Each signal below is a **ranking heuristic**, never a fact (GEN-6):

- **Hotspots** = change-frequency × complexity/code-health, recency-weighted — **CodeScene / Tornhill
  behavioral code analysis**. Seeds a `tier` candidate.
- **Fragility / bug-introducing sites** = the **SZZ algorithm** (Śliwerski–Zimmermann–Zeller, MSR 2005; OSS
  **SZZUnleashed**): from bug-fixing commits, `git blame` the removed lines back to the introducing commit.
  The **highest-value** frontier — fragile code is where invariants hide. (SZZ is heuristic → a _ranking_
  signal, not truth.)
- **Temporal / logical coupling** = association-rule mining over commit baskets (co-change support &
  confidence) → hidden dependencies + territory boundaries the static import graph misses.
- **Ownership + bus-factor** = per-line `git blame` knowledge map (**CodeScene knowledge distribution**) →
  a territory `owner` candidate + a key-person-risk (tier) signal.
- **Rank** = **personalized PageRank over the def→ref graph** (the **Aider repo-map** technique; e.g.
  NetworkX PPR): nodes = symbols/files, edge `referencing → defining`, weighted by identifier salience; the
  **personalization vector** is the union of the hotspot / SZZ / coupling frontiers. The result is the
  ranked `Candidate[]`. The per-run **site budget is fit by binary search** over the ranked tags (Aider).
- **History-thin fallback (GEN-15).** History is high-signal but degenerates silently on the repos where
  it is weakest — young/greenfield, **squashed or shallow-cloned** history (kills `git blame`, so SZZ +
  co-change collapse), and `initial-commit` monorepo imports / vendored / generated code (blame resets to
  one mega-commit → everything looks equally cold, or generated files look like hotspots). A cheap
  **pre-check** (commit count below threshold, shallow clone, blame concentrated in one commit) MUST detect
  this and **fall back the personalization vector to structural signals** — PPR **without** history seeding
  - **type/API-surface density** (public exports, trait/interface count, `unsafe`/FFI density) — so genesis
    degrades to structural centrality instead of ranking noise. History is a _booster_, never a dependency.

### S2 — LLM extraction, rationed by rank (the _only_ LLM spend)

- Visit candidates **highest-PPR-first**; **one bounded call per site**, scoped to a single structural unit
  (small context). Output = a **grounded candidate fact** (anchored by `subtreeHash`).
- When the candidate is **checkable**, its `check` is authored as a **CodeQL** (QL / Datalog over the
  AST + data-flow + CFG relational DB) or **Semgrep** (AST-pattern) query — a real, deterministic,
  re-runnable query, which is exactly the predicate evaluator KNOW-16 requires (no arbitrary code, no
  sandbox). A candidate needing runtime execution stays `advisory`.
- Every candidate passes the **truth door** (grounding re-derives fresh) and is **scored** for usefulness
  (actionable **and** non-obvious) — the score is stored, never a veto ([ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md)).
  The **budget cap** with a **marginal-value stop** still applies — spend until candidates stop clearing the
  truth door, then halt.

> The **propose→verify reasoning loop in depth** (PROPOSE→VERIFY→REFINE→CORROBORATE→ABSTAIN, the teeth gate,
> the Daikon analogy, the honest limit) is in
> [`explanation/genesis-reasoning.md`](../explanation/genesis-reasoning.md#s2-in-depth--the-proposeverify-reasoning-loop-the-intelligence-harnessed).
> Normative form: `GEN-12`.

### S3 — align with the user (batched, ranked)

What S1+S2 cannot resolve — territory **owner/tier**, a **T0** assignment, a **contested** invariant,
_intentional-or-bug_ — is batched into a **short, ranked ratification interview** (highest blast/tier first,
**never one question at a time**; active-learning-style — ask only where signal is ambiguous _and_ stakes are
high). It is **capped at the top `20` questions per session** (ranked by blast×tier); the remainder is
**deferred to the next session or defaulted to `T0-strict deny`** (the uncovered-path rule) — human time per
genesis is bounded. Human answers become `human-ratified` facts (KNOW-8).

### S4 — handoff to self-hosting

Genesis terminates by handing control to born-from-work (KNOW-13). A re-run is **incremental**: SCIP /
stack-graphs re-index only changed files, and a query-based recompute (à la **Salsa** / rust-analyzer, or
Bazel) touches only affected nodes; already-grounded facts **upsert** (KNOW-15), never a second sweep.

**Seed the self-model (Awareness sources, GEN-9).** A fresh move-in has no DEFINE artifact, zero invariants
(KNOW-6), an un-ratified T0 — so Awareness (MEM-11) would be blank exactly when a worker needs it. Genesis
MUST seed the sources each facet rolls up from: a **`DEFINE` stub thesis** at S0 (`mission`, marked
unratified), `constitution` from the **ratified T0 manifest** the S3 interview produces, `taste` at
**`CONVENTIONS.md@sha`**. A facet with no source renders **`UN-SEEDED`**, never fabricated.

> The **cost model, the sweet-spot discipline table, the optional deepening loops, and the determinism
> boundary** are in [`explanation/genesis-reasoning.md`](../explanation/genesis-reasoning.md). Normative
> forms: `GEN-13` (cost discipline), `GEN-14` (loops), `GEN-1/11` (determinism).

## Invariants

- **GEN-1 Deterministic skeleton.** S0 + S1 MUST be `$0`-LLM pure functions of the repo at a **pinned
  commit**; re-running on the same rev MUST reproduce a byte-identical skeleton **and** candidate ranking.
- **GEN-2 Rationed intelligence.** LLM MUST be spent only on **ranked** sites, highest-first, **one bounded
  call per site**, under a **hard budget** (default `--budget = min(frontier_size, 200)` sites/run) with a
  **numeric marginal-value stop**: halt when the **trailing-20-site admit-rate `< 20%`** (fewer than 4 of the
  last 20 sites clear the admission bar). No repo-wide LLM sweep; no embedding/vectorization pass anywhere (A-14).
- **GEN-3 Cost tracks importance-surface, not size.** LLM-call count MUST be a function of the PPR frontier
  (`hotspot × SZZ × blast`), never of file/line count. Adding un-churned code MUST NOT raise LLM spend.
- **GEN-4 Grounded from birth.** Every seeded fact MUST be grounded (`subtreeHash`) and pass the **truth door**
  at `atlas-emit`; an **ungrounded** seed is rejected (KNOW-2). No seed self-declares true. Obviousness **never**
  rejects — every emitted seed MUST carry a mechanically-computed **obviousness score**, and the score is
  **total**: an emitted fact without one is a defect, not a default
  ([ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md), owner-ratified 2026-08-02).
- **GEN-5 Propose; human ratifies the contested.** Genesis MAY write only **candidates**; `T0` and any
  contested fact MUST be human-ratified (KNOW-7/8) via a batched, ranked interview — never auto-promoted,
  never one question at a time.
- **GEN-6 History is a seed, not truth.** Mined signals (hotspots / SZZ / coupling / ownership) MUST be used
  only as **ranking heuristics**; a signal is **not a fact** until grounded and ratified. Churn/SZZ alone
  MUST NOT mint a fact.
- **GEN-7 One-time, then hand off; incremental re-run.** Genesis MUST hand control to born-from-work
  (KNOW-13), not remain a sweeper. A re-run MUST be incremental + idempotent against already-grounded facts
  (upsert, KNOW-15).
- **GEN-8 Total & resumable.** An interrupted run MUST resume from the last completed ranked site; a
  malformed repo/rev MUST yield an honest empty/partial skeleton, never a throw.
- **GEN-9 Seeds the self-model.** Genesis MUST create the sources every Awareness facet rolls up from (see
  above); a facet with no source MUST be `UN-SEEDED`, never fabricated (MEM-11). The `mission` stub MUST
  stay marked unratified until a real DEFINE artifact is ratified.
- **GEN-10 Explicit-structural only.** Every stage MUST bind to a named, deterministic structural mechanism
  (tree-sitter / SCIP / stack-graphs for the index; SZZ / hotspots / temporal-coupling for mining; PPR for
  ranking; CodeQL/Semgrep for a predicate `check`). There MUST be **no** embedding, vector store, or ANN
  anywhere (A-14) — retrieval **and** ranking are explicit graph/query mechanisms.
- **GEN-11 Reproducible ranking.** The candidate ranking MUST be a deterministic function of the repo@rev
  (SZZ + hotspots + temporal-coupling feeding a **personalized PageRank** with pinned damping/seed); it MUST
  carry no model and no randomness, and MUST reproduce byte-identically across runs and machines.
- **GEN-12 Proposer-in-a-harness, never an oracle.** In S2 the LLM MUST only _propose_ typed candidates;
  admission MUST be mechanical. A **predicate** candidate MUST be admitted only if its synthesized `check`
  **compiles and returns `HOLDS` on the current code** (a failing check is a counterexample → REFINE ≤K,
  then drop — never force); an **advisory** candidate MUST pass grounding (the truth door) and MUST carry a
  harness-computed obviousness score — obviousness never blocks it (ADR-0012).
  Chain-of-thought MUST be scratch — never persisted as a fact. **Abstention MUST be a valid outcome** (a
  grounded why-not); the model MUST NOT be pressured to emit a fact. A predicate MUST be labeled a
  _machine-checked likely invariant_, never a proof. **Teeth (anti-vacuity):** a synthesized `check` MUST
  be admitted only if it returns `HOLDS` on current code **and flips to `BROKEN` on a mechanically-mutated
  counterfactual** of the anchored subtree — a check no mutant can break is vacuous (a tautology / matches
  nothing) and MUST be dropped. **Sound oracle first:** for a type-expressible slot (`contract`,
  `ownership`, visibility/`dependency` order) the check MUST prefer the language's **type-checker / LSP
  diagnostics** (sound, `$0` — the compiler already ran) over a synthesized CodeQL/Semgrep query — and the
  sound dependency/count oracle (symbol-reverse / cardinality) only **awards** the `proven` seal, it MUST
  NOT gate admission: when it proves the slot the fact is sealed `proven` (carrying its re-runnable
  witness), and on **abstention** a grounded candidate MUST NOT be dropped but admitted as **`justified`**
  (an unsealed advisory, contestable) — oracle abstention is not a failing check
  (genesis-epistemic-contract.md).
- **GEN-13 Cost discipline — cheap by default, escalate by value.** Every S2 mechanism beyond a single
  grounded proposal MUST be **off at the base tier** and switch on only when a cheap signal shows the
  candidate is high-value (tier/blast) **and** uncertain. Defaults MUST be: one sample (no self-consistency),
  **advisory unless checkable AND `tier≥T1`**, CEGIS `K≤1`, refuter only for `T0`-candidates (small model),
  Semgrep before CodeQL, any query DB built once (amortized, never per-check). Genesis MUST NOT require a
  whole-repo pass — it MUST be **scopable**, leaving the cold tail to born-from-work; and it MUST honor a
  **hard budget ceiling** with the marginal-value stop (GEN-2) and **report cost per stage**.
- **GEN-14 Deepening loops are governed, not free-running.** The REVIEW / ENRICH / EXPAND loops MUST each be
  **opt-in or default-shallow**, budget-gated, and carry a **diminishing-returns / fixpoint stop** (a
  no-revision round; marginal value `< ε`; loop-until-dry on the admission bar). No loop may run unbounded, and
  genesis with all loops off MUST equal the single cheap pass (GEN-13) — the loops are the **depth dial**,
  never a change to the default cost. They MUST reuse existing machinery (propose→verify, `relate()`), add
  no new subsystem, and MUST NOT duplicate born-from-work's free lazy enrichment.
- **GEN-15 History-thin fallback.** A cheap pre-check (commit count below threshold / shallow clone / blame
  concentrated in one commit) MUST detect degenerate history and **fall the personalization vector back to
  structural signals** (PPR without history seeding + type/API-surface density). History MUST be a ranking
  _booster_, never a dependency — genesis MUST degrade to structural centrality, never rank noise.
- **GEN-16 Usefulness is graded a-posteriori, not at admission.** The one non-mechanical gate — "non-obvious
  ∧ actionable" — MUST NOT rest on the proposer's self-assessment (UNAMENDED by ADR-0012, and load-bearing under
  it: the obviousness score is computed by the **harness's** predicate over the source bytes, never read off a
  field the proposer wrote; ADR-0011 makes this structural by never passing `Candidate.signals` into the prompt). Genesis MUST seed **loose-but-thin** and
  let **downstream use** be the judge: a seeded fact accrues logged `hits` (KNOW-17), and a fact **no wave
  ever consults decays out** of the served set (archived, re-enterable); the admission threshold calibrates
  against observed hits. Genesis is the seed; born-from-work (KNOW-13) prunes by real usage. Hits-decay is **not
  replaced** by the a-priori obviousness score — the two **compose**: the score is the **cold-start prior** (on a
  cold graph every fact has 0 hits, so decay is a no-op and a trivial fact would rank identically to a brilliant
  one), hits-decay is the **warm update**. This converts
  "useful" from an LLM opinion at write-time into a measured outcome — the honest floor under usefulness,
  since no mechanism can prove usefulness a-priori.

## Surface / API

```
atlas-genesis <repo> --at <rev> [--budget N] [--scope <path>]  → GenesisReport   // S0→S4; --scope = seed a subtree, not whole-repo (GEN-13)

scan(repo, rev): Skeleton                          // S0 — tree-sitter + SCIP/stack-graphs; $0
mine(repo, rev): Candidate[]                        // S1 — SZZ + hotspots + coupling + PPR ranking; $0
extract(cands: Candidate[], budget): { facts: Fact[], abstained: WhyNot[] }  // S2 — propose→verify loop (GEN-12)
interview(open: OpenQ[]): Ratified[]                // S3 — batched, ranked human ratification
handoff(): void                                     // S4 — hand to born-from-work (incremental thereafter)

Candidate     = { site: StructRef, signals: MinedSignals, ppr: number, rank: number }
MinedSignals  = { hotspot, szzBugCommits: number, coChanged: StructRef[], owners: string[], messages: string[] }
OpenQ         = { kind: 'owner' | 'tier' | 'contested' | 'intent', site, options?: string[], rankReason }
GenesisReport = { seeded, ratified, open, llmCalls, budgetSpent, resumeToken? }
```

- `mine` returns **ranked candidates, never facts** (GEN-6); `extract` is the only LLM entry, over the
  ranked set only (GEN-2). `atlas-genesis` is total (GEN-8): a malformed rev returns a partial report with a
  `resumeToken`, never a throw.

## Acceptance

1. **GEN-1 / GEN-11** — `scan`+`mine` twice on the same rev ⇒ byte-identical skeleton **and** PPR ranking;
   no LLM in the S0/S1 path.
2. **GEN-3** — Add 10k lines of un-churned code ⇒ LLM-call count unchanged.
3. **GEN-2 / GEN-10** — `extract` never calls an un-ranked site and halts at budget/marginal-value; grep the
   tree: no embedding model, vector store, or ANN anywhere; the index/rank path is tree-sitter/SCIP/PPR only.
4. **GEN-4** — A seed whose citation does not re-derive at `source@sha` ⇒ rejected (`emitted:false`).
5. **GEN-5** — A `T0`-keyword site is a candidate with `tier=='T2'` + `t0Candidate:true`, reaching `T0` only
   via `interview`.
6. **GEN-6** — A high-churn / high-SZZ file with no grounded invariant produces **no** fact.
7. **GEN-7** — Re-running upserts already-grounded facts (no duplicates) and re-indexes only changed files;
   control returns to born-from-work.
8. **GEN-8** — Killed mid-run, it resumes from the last site; a malformed rev ⇒ partial skeleton + resumeToken.
9. **GEN-9** — On a brownfield repo, assembled Awareness carries a `DEFINE` stub `mission` (unratified), a
   `constitution` tracing to the ratified T0 manifest, `taste` at `CONVENTIONS.md@sha`; a source-less facet
   renders `UN-SEEDED`.
10. **GEN-11** — A predicate `check` produced by `extract` is a runnable CodeQL/Semgrep query that evaluates
    to `HOLDS/BROKEN/NA` deterministically (KNOW-16), with no runtime execution.
11. **GEN-12** — A predicate whose synthesized `check` does not return `HOLDS` on current code is repaired
    within `K` retries or dropped — never admitted; a site with no grounded fact yields a
    `why-not`, not a manufactured fact; no persisted fact contains raw chain-of-thought.
12. **GEN-12 teeth** — A synthesized `check` that returns `HOLDS` but survives **every** mutant of its
    anchored subtree (breaks on none) is vacuous and is dropped; a type-expressible slot prefers the
    type-checker/LSP verdict over a synthesized query.
13. **GEN-13** — On the base tier, a site costs exactly one LLM call (no self-consistency, no refuter, no
    check synthesis); self-consistency/refuter/CodeQL fire only for the escalated `tier≥T1`/`T0` subset; a
    scoped genesis run touches only its scope and its `GenesisReport` reports per-stage cost under the ceiling.
14. **GEN-14** — With all deepening loops off, genesis cost equals the single-pass baseline; each loop
    terminates at its fixpoint/marginal-value/dry stop and never exceeds its budget.
15. **GEN-15** — On a squashed/shallow repo (blame in one commit), `mine` detects it and ranks by structural
    - type-surface centrality (not SZZ/hotspots), producing a non-degenerate frontier — never random noise.
16. **GEN-16** — A seeded fact that no wave consults over its window decays out of the served set (archived,
    re-enterable); admission is graded by observed `hits` (KNOW-17), never by the proposer's self-assessment.

## Related / prior art

- Index it builds: [`atlas-index.md`](./atlas-index.md) (SCIP/stack-graphs, INDEX-13). Extends `atlas-init`
  (`atlas-tools.md`, TOOLS-5).
- Steady state it hands to: [`atlas-knowledge.md`](./atlas-knowledge.md) (KNOW-13); predicate evaluator
  KNOW-16 (CodeQL/Semgrep); write-decision KNOW-15 for incremental re-runs.
- Awareness it seeds: [`atlas-memory.md`](./atlas-memory.md) (MEM-11).
- External lineage: SCIP / LSIF / stack-graphs (code index), Glean / Kythe (fact-over-schema DB), SZZ +
  SZZUnleashed (bug-introducing commits), CodeScene (hotspots / knowledge map), Aider repo-map (PageRank
  ranking), CodeQL / Semgrep (semantic queries).

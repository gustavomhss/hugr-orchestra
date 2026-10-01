# Property-set — Block GEN (genesis / mining) · S3-sibling ∀-render

> **state:** S3-sibling (rendered from the frozen S2 method-tags) · **source of law:** `method-tags-gen.md` (frozen) ·
> **owner:** charlie (FORGE); genesis domain authored by jimmy (COMPASS) ·
> **purpose:** render each behavioural INV's frozen `up-property` into a runnable ∀-quantified property — the
> oracle-free beyond-the-witness check that raises a WP from FLOOR toward FULL assurance. **Invents no law.**
>
> **Reconciliation (honest):** the S2 `down-model`s name `genesis/ref/*.ts` as differential mocks; the
> scaffold-freeze froze those as **pure-type interfaces (zero runtime)** — no executable reference to differentially
> test against. Each `up-property` is therefore asserted **directly on the implementation** over generated inputs
> (PBT) — the recognized oracle-free alternative. The GATE's `differential` leg stays **UNAVAILABLE** (no reference
> impl) and is **subsumed** by this PBT leg, not faked.
>
> **Likely-invariant honesty (load-bearing):** genesis proves **machine-checked _likely_ invariants**
> (Daikon-style — HOLD on current code + survive a mechanical mutant), **never** ∀-input theorems
> (`method-tags-gen.md` §Refuse-to-model). No `law` below claims universal proof over all future inputs; the ∀ is
> over **generated concrete inputs** (the PBT domain), and GEN-12's admission law is `HOLDS-now ∧ a-mutant-breaks`.
>
> **No formal cluster:** Block GEN carries no `FSPEC` (`method-tags-gen.md` §No formal cluster) — nothing here is
> transcribed from `fspec-merge.md`; every law is a render of a frozen `up-property`.
>
> `source` lines are `ptr+digest` (the `# ptr+digest` marker; digest tooling-filled at freeze — no fabricated hashes).

---

### PROP-GEN-1 — deterministic $0-LLM skeleton

inv: INV-GEN-1
source: method-tags-gen.md#INV-GEN-1 # ptr+digest — the frozen up-property law
law: ∀ (repo,rev). skeleton(scan∘mine, repo,rev) ≡ skeleton(scan∘mine, repo,rev) [byte-identical re-run] ∧ LLMsym(callgraph(S0∘S1)) = ∅ [$0-purity]
arbitrary: `arbRepoRev` — well-formed git trees @ a pinned sha, varying file order / count / mtime / encoding; each input is run twice and the pair compared byte-for-byte.
covers_reqs: [ req-gen.md#REQ-GEN-1a, req-gen.md#REQ-GEN-1b, req-gen.md#REQ-GEN-1c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-1a-1, goldens-gen.md#SCN-GEN-1b-1, goldens-gen.md#SCN-GEN-1c-1 ]
teeth: breaks-on "a skeleton whose node order depends on fs-mtime (re-run diverges) or any S0/S1 path that reaches an LLM client symbol — neither is killed by the lone `sk-3f2a` witness, only by the ∀ over trees."

### PROP-GEN-2 — rationed intelligence over the ranked frontier

inv: INV-GEN-2
source: method-tags-gen.md#INV-GEN-2 # ptr+digest
law: ∀ run r with ranked frontier F. visited(r) ⊆ F ∧ order(calls(r)) = descPPR(F) ∧ (∀ s∈visited(r). callcount(s) ≤ 1) ∧ Σcalls(r) ≤ min(|F|,200) ∧ ( trailing20_admitrate(r) < 0.20 ⟹ halt(r) )
arbitrary: `arbFrontier` — ranked `Candidate[]` of size 0..500 with distinct & near-tie PPR values + an un-ranked site set; `arbAdmitStream` drives the trailing-20 admit-rate.
covers_reqs: [ req-gen.md#REQ-GEN-2a, req-gen.md#REQ-GEN-2b, req-gen.md#REQ-GEN-2c, req-gen.md#REQ-GEN-2d, req-gen.md#REQ-GEN-2e, req-gen.md#REQ-GEN-2f ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-2a-1, goldens-gen.md#SCN-GEN-2b-1, goldens-gen.md#SCN-GEN-2c-1, goldens-gen.md#SCN-GEN-2d-1, goldens-gen.md#SCN-GEN-2e-1, goldens-gen.md#SCN-GEN-2f-1 ]
teeth: breaks-on "a repo-wide fallback sweep (visited⊄F), FIFO discovery order, a self-consistency double-call, a `max()`-budget overflow on a 500-site frontier, or a `>`-inverted halt — the fixed 4-site witness never exercises the 200-cap the ∀ does."

### PROP-GEN-3 — cost tracks importance-surface, not size (metamorphic)

inv: INV-GEN-3
source: method-tags-gen.md#INV-GEN-3 # ptr+digest
law: ∀ repo r, ∀ un-churned addition Δ (0 SZZ, 0 hotspot, frontier(r⊕Δ)=frontier(r)). callcount(r ⊕ Δ) ≡ callcount(r) [Δspend = 0]
arbitrary: `arbRepo × arbUnchurnedBlob` — appends N∈[1..10 000] lines of never-committed code that leaves the PPR frontier fixed.
covers_reqs: [ req-gen.md#REQ-GEN-3a, req-gen.md#REQ-GEN-3b ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-3a-1, goldens-gen.md#SCN-GEN-3b-1 ]
teeth: breaks-on "a size-coupled accountant (count reads file/line totals) — the single +10k-line witness pins one N, the ∀ pins Δspend=0 at every N."

### PROP-GEN-4 — grounded from birth

inv: INV-GEN-4
amendment: **AMENDED + RE-RATIFIED 2026-08-02** (owner) — [ADR-0012](../adr/ADR-0012-obviousness-is-scored-never-gated.md): obviousness is SCORED, never gated; the rejection line moves to harm (secret / PII).
source: method-tags-gen.md#INV-GEN-4 # ptr+digest
law: ∀ seed s. emitted(s) ⟺ ( rederives(s.citation, source@sha) ∧ ¬harmfulToStore(s) ) ∧ emitted(s) ⊥ s.self_asserted [self-declaration ignored]
∀ seed s. emitted(s) ⟹ hasScore(s.obviousness) [TOTALITY — no emitted fact lacks a score]
arbitrary: `arbSeed` — the 2×2×2 grid grounded/ungrounded × obvious/non-obvious × self_asserted∈{T,F}; citations at valid & stale sha. **RE-POINTED (ADR-0012):** the obvious/non-obvious axis no longer discriminates `emitted` — it discriminates the **stored score**. Holding the other two axes fixed and flipping this one MUST move `s.obviousness` and MUST leave `emitted` unchanged. Retiring the axis instead of re-pointing it would make the generator vacuous on that dimension (task #114).
covers_reqs: [ req-gen.md#REQ-GEN-4a, req-gen.md#REQ-GEN-4b, req-gen.md#REQ-GEN-4c, req-gen.md#REQ-GEN-4d ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-4a-1, goldens-gen.md#SCN-GEN-4b-1, goldens-gen.md#SCN-GEN-4c-1, goldens-gen.md#SCN-GEN-4d-1 ]
teeth: breaks-on "a **resurrected obviousness gate** (any path where an obvious seed yields `emitted:false`), a **scoreless emitted fact** (totality violated), a downgraded truth door (an ungrounded seed emits), or a `self_asserted`-sufficient gate." — the ∀ covers the full truth table the 4 witnesses only sample. The retired clause named "an inverted non-obviousness door"; under ADR-0012 there is no door, so that mutant would have pointed at code that no longer exists (task #151).

### PROP-GEN-5 — propose; the contested is human-ratified

inv: INV-GEN-5
source: method-tags-gen.md#INV-GEN-5 # ptr+digest
law: ∀ fact f written by genesis. status(f) = candidate ∧ ∀ T0/contested f. ( ratified(f) ⟹ path(f) ∋ interview(batch) ∧ |batch| > 1 ) ∧ ∄ edge candidate→ratified that bypasses interview
arbitrary: `arbCandidate` — tier∈{T0,T1,T2} × contested?; `arbRouterWalk` enumerates the ratify-router state-machine edges.
covers_reqs: [ req-gen.md#REQ-GEN-5a, req-gen.md#REQ-GEN-5b, req-gen.md#REQ-GEN-5c, req-gen.md#REQ-GEN-5d ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-5a-1, goldens-gen.md#SCN-GEN-5b-1, goldens-gen.md#SCN-GEN-5c-1, goldens-gen.md#SCN-GEN-5d-1 ]
teeth: breaks-on "a direct write-as-`ratified` path, an `auto_promote(T0)` edge, or a one-question drip (|batch|=1) — the ∀ over all tiers/edges catches promotions the fixed 8/12-seed witnesses miss."

### PROP-GEN-6 — mined signals are heuristics, never facts

inv: INV-GEN-6
source: method-tags-gen.md#INV-GEN-6 # ptr+digest
law: ∀ signal σ∈{hotspot,SZZ,coupling,ownership}. σ ∈ rankField ∧ σ ∉ Fact[] ∧ ∀ site with signals ∧ no grounded invariant. facts(site) = 0
arbitrary: `arbSignalSite` — arbitrary signal magnitudes (incl. top-decile churn / high SZZ) with & without a grounded, ratified invariant.
covers_reqs: [ req-gen.md#REQ-GEN-6a, req-gen.md#REQ-GEN-6b, req-gen.md#REQ-GEN-6c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-6a-1, goldens-gen.md#SCN-GEN-6b-1, goldens-gen.md#SCN-GEN-6c-1 ]
teeth: breaks-on "a miner that writes an SZZ score into `Fact[]` or mints a 'this file is important' fact from churn alone — the ∀ over signal magnitude catches it at every level, not just the one high-churn witness."

### PROP-GEN-7 — one-time hand-off; idempotent incremental re-run

inv: INV-GEN-7
source: method-tags-gen.md#INV-GEN-7 # ptr+digest
law: ∀ grounded set G. genesis(genesis(G)) ≡ genesis(G) [0 duplicate facts, upsert-by-id] ∧ ∀ rev-pair (r,r') differing in file set D. reindexed(genesis(r→r')) = D
arbitrary: `arbGroundedSet × arbDiff` — fact sets run twice; rev pairs with a varied changed-file set D (incl. ∅ and all-files).
covers_reqs: [ req-gen.md#REQ-GEN-7a, req-gen.md#REQ-GEN-7b, req-gen.md#REQ-GEN-7c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-7a-1, goldens-gen.md#SCN-GEN-7b-1, goldens-gen.md#SCN-GEN-7c-1 ]
teeth: breaks-on "an append-instead-of-upsert re-run (facts double) or a whole-repo re-index that ignores D — the ∀ over D covers diffs the single 1-file witness cannot."

### PROP-GEN-8 — total & resumable

inv: INV-GEN-8
source: method-tags-gen.md#INV-GEN-8 # ptr+digest
law: ∀ input i (well-formed ∨ malformed). genesis(i) returns (partial GenesisReport, resumeToken) ∧ ¬throws(i) ∧ ∀ interrupted run at completed site k. resume(i) = k+1 [sites ≤ k not re-called]
arbitrary: `arbMalformedRepo` — corrupt objects, non-UTF8 paths, empty repo, detached HEAD, non-existent rev (10k corner-biased); `arbKillPoint` for resume. **PBT-fuzz differential** vs the total reference (`method-tags-gen.md` §GEN-8 — the total reference IS the oracle; tag stays reference-model).
covers*reqs: [ req-gen.md#REQ-GEN-8a, req-gen.md#REQ-GEN-8b, req-gen.md#REQ-GEN-8c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-8a-1, goldens-gen.md#SCN-GEN-8b-1, goldens-gen.md#SCN-GEN-8c-1 ]
teeth: breaks-on "a corrupt-object path that throws an uncaught exception or a fabricated-\_full* skeleton on a malformed rev — the fuzz ∀ reaches corners no fixed witness enumerates."

### PROP-GEN-8b — the run's site set CLOSES over its own frontier

inv: INV-GEN-8 (with INV-GEN-12's abstention leg — a valid outcome is one that is RECORDED)
source: method-tags-gen.md#INV-GEN-8 # ptr+digest
law: ∀ frontier F, budget b, kill-point k. the report of genesis(F,b) [or of its resume] carries EXACTLY ONE per-site outcome for EVERY site in F — |rows| = |F| ∧ no site recorded twice — and each row is one of {seeded(facts), abstained(WhyNot), unrecorded(reason-unavailable), interrupted, unvisited(cause)}; and |{seeded,abstained,unrecorded}| = budgetSpent
arbitrary: `arbFrontier` × `arbCeiling` (including 0 and > |F|) × `arbKillPoint` (including none) × a `visit` port drawn from {wide `ExtractResult`, narrow `Fact[]`}, over `genesis` and `genesis→resume`. Asserted directly on the implementation (no executable reference — see the header's reconciliation).
covers_reqs: [ req-gen.md#REQ-GEN-8a, req-gen.md#REQ-GEN-12g ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-8a-3, goldens-gen.md#SCN-GEN-12g-3, goldens-gen.md#SCN-GEN-12g-4 ]
teeth: breaks-on "the budget ceiling stops the drive and records nothing for the cold tail, so a DROPPED site and an ABSTAINING site produce the same empty record — and `|rows| = |F|` is what catches it, never `|F| − |facts|`, because one site may yield more than one fact."
note: the ∀ is over the DECLARED frontier, not over the repository. This property says the run accounts for every site it was HANDED; whether the ranked frontier is the right set of sites is INDEX/GEN-11's question and is not claimed here.

### PROP-GEN-9 — seeds the self-model (Awareness sources)

inv: INV-GEN-9
source: method-tags-gen.md#INV-GEN-9 # ptr+digest
law: ∀ Awareness facet f. hasSource(f) ⟹ seeded(f) ∧ ¬hasSource(f) ⟹ ( render(f) = UN-SEEDED ∧ ¬fabricated(f) ) ∧ unratified(mission_stub) until ∃ ratified DEFINE artifact
arbitrary: `arbFacetSet` — facets with / without source objects (`constitution`@T0-manifest, `taste`@CONVENTIONS.md, `mission` stub); DEFINE-artifact present / absent.
covers_reqs: [ req-gen.md#REQ-GEN-9a, req-gen.md#REQ-GEN-9b, req-gen.md#REQ-GEN-9c, req-gen.md#REQ-GEN-9d ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-9a-1, goldens-gen.md#SCN-GEN-9b-1, goldens-gen.md#SCN-GEN-9c-1, goldens-gen.md#SCN-GEN-9d-1 ]
teeth: breaks-on "a source-less facet rendered empty-but-present (a hole masquerading as seeded), a fabricated `mission` string synthesized from the README, or a `mission` stub emitted `ratified:true` — the ∀ over presence/absence covers every facet, not just `mission`."

### PROP-GEN-10 — explicit-structural mechanisms only (call-path ∀)

inv: INV-GEN-10
source: method-tags-gen.md#INV-GEN-10 # ptr+digest
law: ∀ symbol σ reachable from the index/rank/check path. σ ∉ { embedding, vector-store, ANN } [A-14] ∧ ∀ stage. mechanism(stage) ∈ admissibleRegistry
arbitrary: `arbCallGraph` — the index/rank/check import closure; the admissible-mechanism registry set (tree-sitter/SCIP/stack-graphs/SZZ/hotspots/coupling/PPR/CodeQL/Semgrep). **Note:** the S2 tag frames this as a _static dependency-graph conformance assertion, not a property law_ — it is rendered here as a ∀ over the import closure (the honest ∀-expressible form), no invented law.
covers_reqs: [ req-gen.md#REQ-GEN-10a, req-gen.md#REQ-GEN-10b ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-10a-1, goldens-gen.md#SCN-GEN-10b-1 ]
teeth: breaks-on "any import of a vector-embedding similarity lib into the rank path or a stage bound to an unregistered 'smart scorer' — the ∀ over the whole closure catches an ANN edge anywhere, not only at the one audited site."

### PROP-GEN-11 — reproducible ranking (the determinism law · PBT)

inv: INV-GEN-11
source: method-tags-gen.md#INV-GEN-11 # ptr+digest
law: ∀ permutation π of the def→ref adjacency / input order. rank(π(adj), rev) ≡ rank(adj, rev) ∧ ( RNG ∪ clock ∪ model ) ∩ callgraph(rank) = ∅ ∧ pinned(damping=0.85, seed) ∧ ∀ machines X,Y. rank_X(rev) ≡ rank_Y(rev) [byte-identical]
arbitrary: `arbAdjPermutation` — permutes adjacency & input order over PPR fixtures (incl. near-tie pairs like s2/s3); `arbFloatEnv` models cross-machine / cross-arch float environments.
covers_reqs: [ req-gen.md#REQ-GEN-11a, req-gen.md#REQ-GEN-11b, req-gen.md#REQ-GEN-11c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-11a-1, goldens-gen.md#SCN-GEN-11b-1, goldens-gen.md#SCN-GEN-11c-1 ] # the seed's `gen: PBT` witnesses of this law
teeth: breaks-on "hash-map-iteration tie-breaking (a permutation reorders the s2/s3 near-tie), a `Math.random()` PPR seed, or an unstable float-sort across arches — the ∀ over all permutations kills the reorder the single `[s1..s4]` witness cannot."

### PROP-GEN-12 — proposer-in-a-harness; mechanical admission with teeth (META)

inv: INV-GEN-12
source: method-tags-gen.md#INV-GEN-12 # ptr+digest
law: ∀ candidate c. admit(c) ⟺ ( compile(c.check) ∧ HOLDS(c.check, code) ∧ ∃ mutant m of anchoredSubtree(c). BROKEN(c.check, m) ) ∧ ( ¬admit ⟹ REFINE ≤K then drop, never force ) ∧ ¬persisted(CoT(c)) ∧ label(c) = "machine-checked likely invariant"
META (GEN-12j, the block's teeth axis): ∀ check k. ( ∀ mutant m. HOLDS(k,m) ) ⟹ ¬admit(k) [no-teeth ⟹ dropped as vacuous — mutation-of-the-mutation]
arbitrary: `arbCandidate × arbCheck × arbMutant` — checks spanning {compiles?}×{HOLDS-on-current?}×{flips on ≥1 mutant?}, incl. a **tautological check that survives every mutant**; refinement bound K=1; a scratch CoT buffer.
covers_reqs: [ req-gen.md#REQ-GEN-12a, req-gen.md#REQ-GEN-12b, req-gen.md#REQ-GEN-12c, req-gen.md#REQ-GEN-12d, req-gen.md#REQ-GEN-12e, req-gen.md#REQ-GEN-12f, req-gen.md#REQ-GEN-12g, req-gen.md#REQ-GEN-12h, req-gen.md#REQ-GEN-12i, req-gen.md#REQ-GEN-12j, req-gen.md#REQ-GEN-12k ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-12a-1, goldens-gen.md#SCN-GEN-12b-1, goldens-gen.md#SCN-GEN-12c-1, goldens-gen.md#SCN-GEN-12d-1, goldens-gen.md#SCN-GEN-12e-1, goldens-gen.md#SCN-GEN-12f-1, goldens-gen.md#SCN-GEN-12g-1, goldens-gen.md#SCN-GEN-12h-1, goldens-gen.md#SCN-GEN-12i-1, goldens-gen.md#SCN-GEN-12j-1, goldens-gen.md#SCN-GEN-12k-1 ]
teeth: breaks-on "a harness that admits on HOLDS alone (skips the mutant-flip conjunct) so a toothless/tautological check enters the Atlas — the ∀ over generated checks with 0 flipping mutants kills the mutation-of-the-mutation the single `V` witness only samples; also kills compile-only admission, a forced-BROKEN fact, a persisted CoT, and a `proven invariant` label."

### PROP-GEN-13 — cost discipline: cheap by default, escalate by value

inv: INV-GEN-13
source: method-tags-gen.md#INV-GEN-13 # ptr+digest
law: ∀ base-tier site s. callcount(s) = 1 ∧ ( self-consistency ∨ refuter ∨ CEGIS>1 ∨ CodeQL )(s) = off ∧ ∀ mechanism μ, site s. on(μ,s) ⟹ ( highValue(s) ∧ uncertain(s) ) ∧ GenesisReport carries per-stage cost ≤ ceiling
arbitrary: `arbSite` — tier × blast × certainty grid; the default cost-policy config (K≤1, refuter⟺T0, Semgrep≺CodeQL, DB-once, no whole-repo pass, scopable).
covers_reqs: [ req-gen.md#REQ-GEN-13a, req-gen.md#REQ-GEN-13b, req-gen.md#REQ-GEN-13c, req-gen.md#REQ-GEN-13d, req-gen.md#REQ-GEN-13e, req-gen.md#REQ-GEN-13f, req-gen.md#REQ-GEN-13g, req-gen.md#REQ-GEN-13h, req-gen.md#REQ-GEN-13i, req-gen.md#REQ-GEN-13j, req-gen.md#REQ-GEN-13k ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-13a-1, goldens-gen.md#SCN-GEN-13b-1, goldens-gen.md#SCN-GEN-13c-1, goldens-gen.md#SCN-GEN-13d-1, goldens-gen.md#SCN-GEN-13e-1, goldens-gen.md#SCN-GEN-13f-1, goldens-gen.md#SCN-GEN-13g-1, goldens-gen.md#SCN-GEN-13h-1, goldens-gen.md#SCN-GEN-13i-1, goldens-gen.md#SCN-GEN-13j-1, goldens-gen.md#SCN-GEN-13k-1 ]
teeth: breaks-on "base-tier self-consistency, escalation on high-value alone (drops the uncertainty conjunct), a K=10 default, a per-tier refuter, CodeQL-first, per-check DB rebuilds, or a lump-only cost report — the ∀ over the tier×certainty grid catches escalations the 3 fixed witnesses miss."

### PROP-GEN-14 — deepening loops governed, not free-running

inv: INV-GEN-14
source: method-tags-gen.md#INV-GEN-14 # ptr+digest
law: ∀ loop L∈{REVIEW,ENRICH,EXPAND}, ∀ input i. terminates(L,i) within budget(L) at fixpoint( no-revision ∨ marginal<ε ∨ dry ) ∧ cost(genesis | loops=off) ≡ cost(GEN-13 single pass) [Δ=0] ∧ reuses(L,{propose→verify, relate()}) ∧ newSubsystems = 0
arbitrary: `arbLoopConfig × arbPathologicalInput` — inputs that never reach a natural fixpoint; loops on/off; varied budgets (bounded-liveness, not unbounded search).
covers_reqs: [ req-gen.md#REQ-GEN-14a, req-gen.md#REQ-GEN-14b, req-gen.md#REQ-GEN-14c, req-gen.md#REQ-GEN-14d, req-gen.md#REQ-GEN-14e, req-gen.md#REQ-GEN-14f, req-gen.md#REQ-GEN-14g, req-gen.md#REQ-GEN-14h ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-14a-1, goldens-gen.md#SCN-GEN-14b-1, goldens-gen.md#SCN-GEN-14c-1, goldens-gen.md#SCN-GEN-14d-1, goldens-gen.md#SCN-GEN-14e-1, goldens-gen.md#SCN-GEN-14f-1, goldens-gen.md#SCN-GEN-14g-1, goldens-gen.md#SCN-GEN-14h-1 ]
teeth: breaks-on "an unbounded loop on a pathological input (no budget/round cap) or an always-on ENRICH prologue that makes loops-off cost > the single pass (Δ>0) — the ∀ over pathological inputs reaches the non-terminating corner a fixed witness can't."

### PROP-GEN-15 — history-thin fallback

inv: INV-GEN-15
source: method-tags-gen.md#INV-GEN-15 # ptr+digest
law: ∀ repo r with degenerate history (commits < τ ∨ shallow ∨ blame in 1 commit). precheck(r) ⟹ personalization(r) = structural(type/API-surface density, no history seeding) ∧ nonDegenerate(rank(r)) [non-uniform ∧ non-random] ∧ history is never a hard dependency (empty log ⟹ still a ranking)
arbitrary: `arbDegenerateRepo` — shallow / squashed / single-commit / empty-log repos each carrying a real structural def→ref graph.
covers_reqs: [ req-gen.md#REQ-GEN-15a, req-gen.md#REQ-GEN-15b, req-gen.md#REQ-GEN-15c ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-15a-1, goldens-gen.md#SCN-GEN-15b-1, goldens-gen.md#SCN-GEN-15c-1 ]
teeth: breaks-on "a ranker that hard-requires history (empty log ⟹ error/no rank) or a fallback that returns a uniform/random frontier — the ∀ over degenerate shapes catches the noise the one squashed witness can't span."

### PROP-GEN-16 — usefulness graded a-posteriori (mechanical sub-laws; judgment-core is non-mechanical)

inv: INV-GEN-16
source: method-tags-gen.md#INV-GEN-16 # ptr+digest
law: ∀ candidate c. admit(c) ⊥ any proposer self-assessment field (self*score / importance) ∧ ∀ fact f. ( hits(f, window) = 0 ⟹ decay(f) → archived ∧ re-enterable ) ∧ threshold = f(observed hits)
FLAG (non-mechanical core, no pure ∀-form — not forced): the usefulness \_judgment* itself — "is this seed non-obvious ∧ actionable / actually useful" — has **no write-time ∀-property**: usefulness is a **measured a-posteriori outcome** via `hits`/decay, not a correctness oracle (`method-tags-gen.md` §Refuse-to-model "usefulness a-priori"). Only the mechanical sub-laws above are rendered; the graded judgment is deliberately left un-quantified per the frozen tag.
NOT REPLACED BY ADR-0012 — the two COMPOSE (ADR-0012 §"KNOW-17 hits-decay survives"): the a-priori obviousness score is the **cold-start prior** (on a cold graph every fact has 0 hits, so hits-decay is a no-op and a trivial fact would rank identically to a brilliant one), and hits-decay is the **warm update** (the only signal reflecting what readers actually consulted). Neither subsumes the other, and the first law above — `admit(c) ⊥ any proposer self-assessment field` — is untouched: the score is computed by the HARNESS's predicate over the source bytes, never read off a field the proposer wrote.
arbitrary: `arbCandidate` (with / without `self_score`) × `arbHitStream` (0..N consults over a window) — reuses the KNOW-17 hits/decay shape.
covers_reqs: [ req-gen.md#REQ-GEN-16a, req-gen.md#REQ-GEN-16b, req-gen.md#REQ-GEN-16c, req-gen.md#REQ-GEN-16d, req-gen.md#REQ-GEN-16e ] # ptr+digest
witness: [ goldens-gen.md#SCN-GEN-16a-1, goldens-gen.md#SCN-GEN-16b-1, goldens-gen.md#SCN-GEN-16c-1, goldens-gen.md#SCN-GEN-16d-1, goldens-gen.md#SCN-GEN-16e-1 ]
teeth: breaks-on "an admission gated on `self_score ≥ 0.8` (rests on self-assessment), a never-decaying unconsulted fact (served set only grows), or a hard-coded threshold ignoring observed hits — the ∀ over `arbHitStream` catches the missing decay the fixed-window witness only samples."

---

## Completeness (set-level gate)

- **Behavioural INV → PROP: 16/16** — INV-GEN-1..16 each render to exactly one PROP (all 16 GEN INVs are
  behavioural; none `n/a`). 0 uncovered, 0 invented-without-INV.
- **Seed goldens subsumed: 75/75 SCN linked as `witness`** across the 16 PROPs (the whole `goldens-gen.md` seed —
  incl. the `gen: PBT` determinism witnesses 11a/11b/11c and the GEN-12j META-property witness). No PROP
  contradicts its witness; each generalizes them.
- **Formal-cluster laws:** none in GEN (no `FSPEC`; the sole Atlas formal model is `FSPEC-merge`, Block KRN) —
  nothing transcribed from `fspec-merge.md`.
- **No `[NEEDS RECONCILIATION]`:** every `up-property` was fully specified in the frozen S2 tag. GEN-16's
  usefulness-judgment core and GEN-10's call-path shape are **decided non-∀ / static-assertion** forms, flagged
  in-place (not unmade decisions), rendered honestly without forcing a spurious property.

## Self-check

- [x] one `properties-gen.md`; one PROP block per rendered law; every block conforms to the card.
- [x] every behavioural INV → ≥1 PROP (16/16, mechanical count against `method-tags-gen.md`).
- [x] every `source` a `ptr+digest` resolving to a real `### INV-GEN-<n>` (no invented law; no prose copy of code).
- [x] every `law` in the `∀ … . predicate` / `∀ … . lhs ≡ rhs` runnable idiom; no formal-cluster law exists to transcribe.
- [x] every property-flavored golden's law present; no PROP contradicts its witness.
- [x] every `teeth` states a mutant the property kills beyond the single witness.

# Properties — Block RET (retrieval) · S3-sibling ∀-render

> **state:** S3-sibling (rendered from the frozen S2 method-tags) · **owner:** charlie (FORGE) ·
> **source (frozen):** [`method-tags-ret.md`](method-tags-ret.md) `@ sha256:c95f2e951bc0b6b2` — every PROP's `law`
> is a faithful render of that INV's frozen `up-property`; the ptr+digest carries drift (an upstream edit renders
> the PROP STALE). · **purpose:** transcribe each behavioural INV's `up-property` into a runnable ∀-quantified
> property (the oracle-free, beyond-the-witness PBT leg) — **invents no law**.
>
> **No FSPEC-merge cluster in this block** (`method-tags-ret.md §FSPEC-merge` = "None"): RETR hosts no `formal`
> law, so no property here is transcribed verbatim from `fspec-merge.md`; each `law` renders the prose `up-property`
> into the `∀ … . predicate` idiom. All 13 RETR INVs are **behavioural** → one PROP each (13/13).
>
> **Pinned cap measure (load-bearing).** Every `~`-cap below is a ratified pinned-measure bound under
> **`cl100k_base` (tiktoken), pinned by version + content-hash** (`atlas-retrieval.md`); a `~2K`/`~5K`/`~1.5K`/…
> cap is `Pack.tokenEstimate` — a deterministic function of the input, never a vague threshold.
>
> **`arbitrary` is a spec, not runtime** — it names the fast-check/Hypothesis generator to author, not code.

---

### PROP-RETR-1 — closed-surface determinism

inv: INV-RETR-1
source: method-tags-ret.md#INV-RETR-1 @ sha256:c95f2e951bc0b6b2
law: ∀ q ∈ Query. relevance(q) is a pure function of (scope, dependency, trigger) over the hashed index
∧ ∀ q. resolve(q) ≡ resolve(q) (byte-identical on repeat — determinism inherited from INDEX-8)
∧ embeddingCallSites(retrieval.importGraph) = ∅ (0 embedding / vector / RAG calls, A-14)
arbitrary: `fc.record({ path: arbScopePath, index: arbHashedIndex })`; run each `q` twice; a static import-graph
walk of the retrieval package asserting the embedding/vector/RAG call-site set is empty
covers_reqs: [ REQ-RETR-1 ]
witness: [ SCN-RETR-1-1 ]
teeth: breaks-on "an embedding-similarity path is added to relevance — two identical queries return different rankings (nondeterministic) and the import walk finds a vector-store call site the lone witness query would not exercise"

### PROP-RETR-2 — bounded deterministic pack composition

inv: INV-RETR-2
source: method-tags-ret.md#INV-RETR-2 @ sha256:c95f2e951bc0b6b2
law: ∀ t ∈ Territory. let p = pack(t) in
(cap) p.tokenEstimate ≤ 2000 [cl100k_base]
(fill) T0(t) ⊆ p ∧ p\T0 is a rank-prefix of sort(T1(t), ≺) where ≺ = (hits-desc, ppr-desc, nodeKey-asc)
(total-ord) ≺ is total, deterministic, antisymmetric over T1(t)
(cap-wins) omitted(t,p) ≠ ∅ ⇒ p carries a truncation marker ∧ a pull-reachable tail = omitted(t,p) (0 silent drops)
(no-prose) ∀ e ∈ p. e is a 1-line PackInvariant{nodeId,tier,claim} (0 free-prose blobs)
∧ ∀ K territories T. let m = merge(pack over T) in m.tokenEstimate ≤ 2000 total ∧ m fills T0-first then by (hits-desc, ppr-desc) (proximity retired for PPR)
∧ ∀ t. pack(t) ≡ pack(t) (byte-identical for equal input)
arbitrary: `fc.array(arbNode{tier,ppr,hits,nodeKey,tok})` for a territory; `fc.array(arbTerritory,{minLength:2})` for the
merged case; `fc.shuffle` the T1 multiset to prove order-independence of the emitted rank
covers_reqs: [ REQ-RETR-2a, REQ-RETR-2b, REQ-RETR-2c, REQ-RETR-2d, REQ-RETR-2e, REQ-RETR-2f ]
witness: [ SCN-RETR-2a-1, SCN-RETR-2b-1, SCN-RETR-2c-1, SCN-RETR-2d-1, SCN-RETR-2e-1, SCN-RETR-2f-1 ]
teeth: breaks-on "any of: cap weakened to admit an over-budget node (2460>2000); the within-tier tiebreak mutated to nodeKey-desc/ppr-asc; an omission with no truncation marker (silent drop); each territory budgeted ~2K independently (merged 4000); owner-proximity restored so a closer leaf outranks a higher-PPR hub — mutants the single fixture-A witness cannot span across all six clauses"

### PROP-RETR-3 — fail-closed staleness

inv: INV-RETR-3
source: method-tags-ret.md#INV-RETR-3 @ sha256:c95f2e951bc0b6b2
law: ∀ p ∈ Pack. stale(p) ≡ (∃ g ∈ backings(p). drifted(g)) (exact OR over the drift-oracle, never a guess)
∧ ∀ p. stale(p) ⇒ ¬served(p, as-is) ∧ served(p) ⇒ regrounded-before(p) (0 stale packs trusted)
arbitrary: `fc.record({ backings: fc.array(arbGrounding{drifted:fc.boolean()}) })`; assert `stale` == OR-of-drifted
and that any served path passes through re-ground when `stale` is true
covers_reqs: [ REQ-RETR-3a, REQ-RETR-3b, REQ-RETR-3c ]
witness: [ SCN-RETR-3a-1, SCN-RETR-3b-1, SCN-RETR-3c-1 ]
teeth: breaks-on "stale is a heuristic (age/TTL timer) that reads false while a backing genuinely drifted, or the stale flag is ignored on the read path so the stale pack is served without re-grounding — killed across randomized drift-bit vectors the single 2-backing witness cannot enumerate"

### PROP-RETR-4 — debounced once-per-scope poke

inv: INV-RETR-4
source: method-tags-ret.md#INV-RETR-4 @ sha256:c95f2e951bc0b6b2
law: ∀ s ∈ ToolCallSeq. let poked = ∅ in fold classify over s where classify(call) ∈ {navigate(file) | suppress}:
(source) only single-file Read/Edit/Write ⇒ navigate; multi-file Grep/Glob ⇒ suppress; Bash path-arg ⇒ suppress
(settle) poke(scope) fires iff scope is current across N=2 consecutive calls ∧ scope ∉ poked
(once) poke(scope) ⇒ poked := poked ∪ {scope} ∧ ≤1 poke per scope per session
(no-trans) a scope present for < N=2 consecutive calls ⇒ 0 pokes
arbitrary: `fc.array(arbToolCall)` over the tool alphabet {Read,Edit,Write,Grep,Glob,Bash} × arbPath (single/multi/command);
drive the reference debounce automaton (settle window N=2, per-session `poked` set) and the impl side-by-side
covers_reqs: [ REQ-RETR-4a, REQ-RETR-4b, REQ-RETR-4c, REQ-RETR-4d, REQ-RETR-4e, REQ-RETR-4f, REQ-RETR-4g, REQ-RETR-4h, REQ-RETR-4i ]
witness: [ SCN-RETR-4a-1, SCN-RETR-4b-1, SCN-RETR-4c-1, SCN-RETR-4d-1, SCN-RETR-4e-1, SCN-RETR-4f-1, SCN-RETR-4g-1, SCN-RETR-4h-1, SCN-RETR-4i-1 ]
teeth: breaks-on "settle window mutated to N=1 (poke-storm on rapid hopping); a transient single-call crossing pokes (no hysteresis); an already-poked scope re-pokes on re-entry; or a multi-file Grep / Bash path-arg infers a scope — mutants only random tool-call sequences surface, not the three fixed fixture-C streams"

### PROP-RETR-5 — scoped tool surface

inv: INV-RETR-5
source: method-tags-ret.md#INV-RETR-5 @ sha256:c95f2e951bc0b6b2
law: ∀ enter/exit sequence over scopes. at each step liveTools = coveringNodes(currentScope)
∧ on scope-exit: coveringNodes(prev) retracted (liveTools never accumulates coveringNodes(prev) ∪ coveringNodes(next))
∧ ∀ step. liveTools ≠ wholeGraph (0 cross-scope accumulation, A-15)
arbitrary: `fc.array(arbScope)` as an enter/exit walk over Fixture-A scopes; after each transition assert
`liveSet == coveringNodes(current)` and `liveSet ⊊ allNodes`
covers_reqs: [ REQ-RETR-5a, REQ-RETR-5b, REQ-RETR-5c ]
witness: [ SCN-RETR-5a-1, SCN-RETR-5b-1, SCN-RETR-5c-1 ]
teeth: breaks-on "on leaving a scope its tools are not retracted so the live set accumulates across the walk, or the whole graph is projected at once — a leak randomized enter/exit walks expose that a single 2-scope witness does not"

### PROP-RETR-6 — bounded deterministic drop under capacity

inv: INV-RETR-6
source: method-tags-ret.md#INV-RETR-6 @ sha256:c95f2e951bc0b6b2
law: ∀ I ⊆ InjectionKinds with Σ tokenEstimate > 5000. let survivors = drop(I) in
(ceiling) Σ tokenEstimate(survivors) ≤ 5000 [cl100k_base]
(order) drop order = sort by (pinned-desc, hitRate-asc), dropping bottom-first (least-used first, RETR-8 ledger)
(cold) until the ledger has data, the documented cold-start order applies; once data exists, kinds reorder by observed hitRate
(pins) {Awareness.constitution, protocols.safetyCritical} ∉ dropped, ever
(total-ord) the drop order is a deterministic total order over kinds
∧ a per-kind drop-counter is ledgered
arbitrary: `fc.array(arbKind{name,tok,hitRate,pinned})` with `fc.pre(Σtok > 5000)` to force overflow; a
`fc.constantFrom` ledger-state {cold, warm} to exercise both regimes
covers_reqs: [ REQ-RETR-6a, REQ-RETR-6b, REQ-RETR-6c, REQ-RETR-6d, REQ-RETR-6e, REQ-RETR-6f ]
witness: [ SCN-RETR-6a-1, SCN-RETR-6b-1, SCN-RETR-6c-1, SCN-RETR-6d-1, SCN-RETR-6e-1, SCN-RETR-6f-1 ]
teeth: breaks-on "the ceiling is weakened; a pin is added to the droppable set (constitution dropped under pressure); the order is hardcoded so a high-hitRate kind drops while poke(0.10) survives; or the cold-start default is permuted — mutants a random overflow sweep kills across many hitRate orderings"
[NEEDS RECONCILIATION: the (total-ord) clause is rendered from the frozen "deterministic total order over kinds", but method-tags-ret.md §RETR-6/8 do NOT name the **secondary tie-key κ** when two kinds tie on hitRate (open DEFINE dependency — see goldens §[NEEDS RECONCILIATION], witness SCN-RETR-6b-2). The tie-break sub-case of (total-ord) cannot be pinned until DEFINE ratifies κ; the rest of the law is rendered fully now.]

### PROP-RETR-7 — per-kind cap enforcement

inv: INV-RETR-7
source: method-tags-ret.md#INV-RETR-7 @ sha256:c95f2e951bc0b6b2
law: ∀ k ∈ InjectionKinds. tokenEstimate(k) ≤ capTable[k] under the pinned cl100k_base measure
where capTable = { Awareness:400, Orientation:250, projectMem:500 (orch:800), own:1500, pack:2000, related:300, protocols:500(shared), poke:150 }
∧ ∀ k. capTable[k] < 5000 (no single kind's cap equals/exceeds the ceiling)
∧ {Awareness, Orientation} are derived (0 write sites)
arbitrary: `fc.record` of a turn's per-kind `tokenEstimate`s bounded near each cap; assert each cap **value**
equals its ratified pinned constant (not merely `est ≤ cap`) and `max(cap) < ceiling`
covers_reqs: [ REQ-RETR-7a, REQ-RETR-7b, REQ-RETR-7c, REQ-RETR-7d ]
witness: [ SCN-RETR-7a-1, SCN-RETR-7b-1, SCN-RETR-7c-1, SCN-RETR-7d-1 ]
teeth: breaks-on "the own cap drifts to ~1.6K so the pinned-value equality flips (a drift the `est ≤ cap` inequality alone tolerates); the pack cap is raised to == the ceiling; or a code path writes Awareness to a member file instead of deriving it"

### PROP-RETR-8 — calibration from observed use

inv: INV-RETR-8
source: method-tags-ret.md#INV-RETR-8 @ sha256:c95f2e951bc0b6b2
law: ∀ ledger states L, L' differing only in observed hits/hitRate.
capTable(L) ≠ capTable(L') ∧ dropOrder(L) reflects hitRate(L) (caps AND drop-order are functions of the ledger, never a static constant)
∧ hits measures precision (served facts used), never coverage (coverage is RETR-13's MISS-oracle)
arbitrary: `fc.tuple(arbLedger, arbHitDelta)`; apply the delta and assert the derived caps/drop-order **change**
in the direction of the mutated hits (a metamorphic property)
covers_reqs: [ REQ-RETR-8a, REQ-RETR-8b ]
witness: [ SCN-RETR-8a-1, SCN-RETR-8b-1 ]
teeth: breaks-on "a cap or the drop order is a hardcoded constant — mutating the ledgered hits leaves it unchanged (calibration by guesswork), a divergence only a hits-delta sweep detects"

### PROP-RETR-9 — totality (no-throw, empty on malformed)

inv: INV-RETR-9
source: method-tags-ret.md#INV-RETR-9 @ sha256:c95f2e951bc0b6b2
law: ∀ x ∈ (arbitrary ∪ malformed scopes). pack(x).invariants = [] ∧ projectTools(x) = [] ∧ poke(x) = null
∧ ∀ f ∈ {pack, projectTools, poke, relate, own, offAtlas}. f(x) terminates without throwing (0 exceptions)
arbitrary: PBT-fuzz `fc.oneof(fc.string(), fc.constant(null), arbNonUtf8, arbOversized, arbValidScope)` (≈10k cases);
invoke every retrieval entry point side-by-side with the total reference surface, assert no-throw + empty
covers_reqs: [ REQ-RETR-9a, REQ-RETR-9b ]
witness: [ SCN-RETR-9a-1, SCN-RETR-9b-1 ]
teeth: breaks-on "a malformed scope returns a nearest-match non-empty pack (a partial guess), or a null/non-UTF8 scope propagates an uncaught TypeError — a boundary a fixed two-input witness cannot fuzz across the malformed-input space"

### PROP-RETR-10 — deterministic partitioned closure

inv: INV-RETR-10
source: method-tags-ret.md#INV-RETR-10 @ sha256:c95f2e951bc0b6b2
law: ∀ u ∈ Unit. let r = relate(u) in
(exact) nodes(r) = enclosing(u) ∪ dependents(u) ∪ dependencies(u) ∪ governing(u) (exact index-axis closure, no node missing/extra)
(partition) r = disjoint bands {enclosing, dependents, dependencies, governing}(+optional coChanged); each node in exactly one structural band
(disjoint) coChanged ∩ structuralBands = ∅ (never mixed)
(opt-in) coChanged ∈ r iff explicitly requested
(det) relate(u) ≡ relate(u) byte-identical, even under a permuted construction of the same edge multiset
(no-LLM) LLMcalls(relate) = ∅
arbitrary: `fc.record({ unit: arbUnit, edges: arbEdgeMultiset })`; `fc.shuffle(edges)` to build the same closure in a
different insertion order and assert byte-identical intra-band order; a call-graph walk asserting 0 LLM calls
covers_reqs: [ REQ-RETR-10a, REQ-RETR-10b, REQ-RETR-10c, REQ-RETR-10d, REQ-RETR-10e, REQ-RETR-10f ]
witness: [ SCN-RETR-10a-1, SCN-RETR-10b-1, SCN-RETR-10c-1, SCN-RETR-10d-1, SCN-RETR-10e-1, SCN-RETR-10f-1 ]
teeth: breaks-on "the spatial roll-up axis is dropped (closure no longer exact); dependents/dependencies merged into one flat band; a coChanged fact merged into a structural band; the closure emits in insertion order so two permuted builds differ byte-wise; or an LLM call appears in the path — mutants a permuted-construction sweep kills that a single self-compare misses"

### PROP-RETR-11 — bounded, ranked, deterministic truncation

inv: INV-RETR-11
source: method-tags-ret.md#INV-RETR-11 @ sha256:c95f2e951bc0b6b2
law: ∀ u ∈ Unit. let d = dependents(u) in
(hops) d ⊆ { n : distance(u,n) ≤ 2 } (cut at maxHops=2)
(rank) d ordered by (tier-desc, ppr-desc, distance-asc, nodeKey-asc) — a total order; a high-ppr hub 2 hops out outranks a low-ppr leaf 1 hop in
(cap) |returned(d)| ≤ K=8
(prefix) returned(d) = rank-prefix of the ranked closure (truncate AFTER ranking)
(honest) |closure| > K ⇒ dependents_meta = {truncated:true, total:|closure|, returned:8} (total = full pre-truncation count)
∧ forward dependencies use the same rank and the same K=8
arbitrary: `fc.array(arbNode{tier,ppr,distance,nodeKey}, {minLength:9})` to force truncation; `fc.shuffle` the closure
to prove truncate-after-rank returns a stable rank-prefix independent of construction order
covers_reqs: [ REQ-RETR-11a, REQ-RETR-11b, REQ-RETR-11c, REQ-RETR-11d, REQ-RETR-11e ]
witness: [ SCN-RETR-11a-1, SCN-RETR-11b-1, SCN-RETR-11c-1, SCN-RETR-11d-1, SCN-RETR-11e-1 ]
teeth: breaks-on "hop cut mutated to maxHops=3 (a distance-3 node leaks); distance promoted to primary key (closer leaf outranks higher-ppr hub); K raised to 12; truncation before ranking (first-8-by-insertion kept); total reported == returned (hiding the dropped tail); or forward dependencies left unbounded — mutants only a >K randomized closure surfaces"

### PROP-RETR-12 — mechanical deterministic own-pack

inv: INV-RETR-12
source: method-tags-ret.md#INV-RETR-12 @ sha256:c95f2e951bc0b6b2
law: ∀ unit u of level ∈ {crate,module,service,feature}. own(u) exists as tool own*<id> returning a pre-composed OwnPack
(compose) OwnPack = deterministic assembly of (tier≥T1 invariants + terrain + bounded relate(u) + scoped memory pointers) by index reads alone
(det) own(u) ≡ own(u) byte-identical, even under permuted construction of the same reads
(no-LLM) LLMcalls(own) = ∅ ∧ 0 free prose
(cap) own(u).tokenEstimate ≤ 1500 under the ~5K ceiling [cl100k_base]
(default) a seat receives own(u) without choosing a scope; drill.{finer,refresh,complement} is pull-reachable, never inlined
(grounding) crate/module grounded by tree; service/feature by a declared drift-checked manifest; epic is NOT a grounded node → own*<epic> = goal + features' OwnPacks
(dedup) ∀ co-injected pack q sharing nodeId n with own(u): own ∩ q = ∅ after dedup, own wins, q shows a pull-reachable pointer (n paid for once)
arbitrary: `fc.record({ unit: arbUnitLevel, reads: arbIndexReadMultiset })`; `fc.shuffle(reads)` for determinism;
`arbCoInjectedPack` sharing a random nodeId to exercise the dedup law
covers_reqs: [ REQ-RETR-12a, REQ-RETR-12b, REQ-RETR-12c, REQ-RETR-12d, REQ-RETR-12e, REQ-RETR-12f, REQ-RETR-12g, REQ-RETR-12h, REQ-RETR-12i, REQ-RETR-12j, REQ-RETR-12k, REQ-RETR-12l ]
witness: [ SCN-RETR-12a-1, SCN-RETR-12b-1, SCN-RETR-12c-1, SCN-RETR-12d-1, SCN-RETR-12e-1, SCN-RETR-12f-1, SCN-RETR-12g-1, SCN-RETR-12h-1, SCN-RETR-12i-1, SCN-RETR-12j-1, SCN-RETR-12k-1, SCN-RETR-12l-1 ]
teeth: breaks-on "the dedup is dropped so a shared nodeId is double-counted against the ceiling; the OwnPack emits in construction order (two permuted builds differ); an LLM curates the pack; the ~1.5K cap is blown to ~2K; an epic is treated as a grounded node; or finer detail is inlined instead of a drill.finer pointer — mutants a randomized read-multiset + nodeId-collision sweep kills"

AMENDED 2026-08-03 (REQ-RETR-12m — the two bands on `atlas-own`): the `law` above is unchanged as the GOVERNING-band law — read `own(u)` as `OwnPack.invariants ∪ OwnPack.gotchas`, which still admits no below-`T1` node, still emits deterministically and still obeys `(cap) own(u).tokenEstimate ≤ 1500`. That `(cap)` conjunct is unchanged BECAUSE the advisory band is a sub-cap inside it, not a second budget. Three conjuncts join it and are NOT rendered as ∀-laws here, for the same Refuse-to-model reason the token budget is not: (i) `∀ n ∈ advisory(own(u)). tier(n) = T2` and `cost(advisory) ≤ 750` with `advisoryDropped` accounting for every row the sub-cap cut, (ii) `governing ∩ advisory = ∅` and `advisory` is filled only from the budget `governing` left (priority, not pro-rata), and (iii) `∀ n ∈ invariants ∪ advisory. freshness(n) ∈ {FRESH, DRIFTED, STALE}`, re-derived per read. All three are conformance-witnessed instead: SCN-RETR-12m-1..4.

### PROP-RETR-13 — deterministic coverage ledger (MISS-oracle)

inv: INV-RETR-13
source: method-tags-ret.md#INV-RETR-13 @ sha256:c95f2e951bc0b6b2
law: ∀ territory T. offAtlasRate(T) = offAtlasReads(T) / served(T)
(det) offAtlasRate(T) ≡ offAtlasRate(T) byte-identical — a commutative pinned reduction, order-independent over the served-read multiset
(rate-0) served(T) = 0 ⇒ offAtlasRate(T) = 0 (not NaN, not undefined)
(total) served(T) = 0 ⇒ offAtlas(T) does not throw
arbitrary: `fc.record({ served: fc.nat(), offAtlasReads: fc.nat() })` with `fc.pre(offAtlasReads ≤ served)`, plus a
`served=0` branch; `fc.shuffle` the served-read multiset to assert order-independent byte-identical rate
covers_reqs: [ REQ-RETR-13a, REQ-RETR-13c, REQ-RETR-13d, REQ-RETR-13e ]
witness: [ SCN-RETR-13a-1, SCN-RETR-13c-1, SCN-RETR-13d-1, SCN-RETR-13e-1 ]
teeth: breaks-on "the ledger accumulates in float/iteration order so two permuted accumulations differ (a bug identical-replay misses); or the no-history case computes 0/0 = NaN / throws a divide-by-zero instead of returning rate 0"
[NEEDS RECONCILIATION: the threshold-crossing sub-law of the up-property — "off-atlas rate crosses a threshold ⇒ raise a calibration prompt" (REQ-RETR-13b) — cannot be rendered as a pinned ∀-property: the threshold value is silent in method-tags-ret.md §RETR-13 (open DEFINE dependency; witness SCN-RETR-13b-1 is `residue`, parametric on symbolic θ). This clause STOPS until DEFINE supplies θ; the deterministic-rate / rate-0 / no-throw laws above are rendered fully now.]

# Properties — Block KNW (knowledge) · S3-sibling render (runnable ∀-laws)

> **state:** S3-sibling · **source:** `method-tags-knw.md` (frozen S2 up-property laws) · **owner:** charlie (FORGE).
> **purpose:** render each behavioural INV's frozen `up-property` into a runnable ∀-quantified property (the
> oracle-free beyond-the-witness PBT leg). **Invents no law** — every PROP is a faithful render of a frozen
> `up-property`, carried as a `# ptr+digest` so an upstream edit renders the property STALE.
>
> **Honest reconciliation (per template):** KNW's S2 `down-model`s name `knowledge/ref/*.ts` as the differential
> oracle, but the scaffold-freeze froze those `ref/*.ts` as **pure-type interfaces (zero runtime)** — there is no
> executable reference to differentially test against. Each `up-property` is therefore asserted **directly on the
> implementation** over generated inputs (PBT). The GATE's `differential` leg stays **UNAVAILABLE** (no reference
> impl) and is **subsumed** by this PBT leg. **`arbitrary` is a spec (the generator to author), not runtime.**
>
> **Formal cluster:** none in KNW — the Atlas's one `formal`/`FSPEC-merge` cluster is KRN's (KERNEL-9/10/11 +
> PERSIST-11). KNOW-15/KNOW-4's UPDATE/union leg _consumes_ that OR-Set set-union reducer as its oracle; the
> `formal` footprint stays 1 (KRN), so no fspec law is transcribed here — nothing to copy verbatim into KNW.
>
> **Coverage:** 18 behavioural INV → 18 PROP (1:1, total). All 62 property-flavored KNW goldens are linked as
> `witness`; the DEFINE-parametric residue golden (SCN-KNOW-15f-2, move+edit θ) is carried as a `[NEEDS
RECONCILIATION]` note under PROP-KNOW-15, not rendered as a passing property (no verification invented for an
> unpinned threshold). _(SCN-KNOW-15h-2's old near-dup τ is RESOLVED to exact NFC+trim equality — no fuzzy
> threshold — per `docs/design/dedup-identity.md`, so it is now a plain exact-equality boundary, not a residue.)_

---

### PROP-KNOW-1 — truth is never self-declared

inv: INV-KNOW-1
source: method-tags-knw.md#INV-KNOW-1 # ptr+digest
law: ∀ node n. served_status(n) ≡ recompute{grounding(n), drift(n), evaluator_verdict(n)} ∧ served_status(n) is independent of any `status` n declares on itself — a candidate-declared `HOLDS` is dropped (served is a side-index, never a self-assertion)
arbitrary: nodes carrying an arbitrary self-declared `status ∈ {HOLDS, BROKEN, NA, unset}` × arbitrary {grounding, drift-state, evaluator-verdict}; assert served == recompute(...) and never == the declared value when they disagree
covers_reqs: [ REQ-KNOW-1 ] # ptr+digest
witness: [ SCN-KNOW-1-1 ]
teeth: breaks-on "the resolver trusts the node-declared `status` for ANY {grounding,drift,verdict} combo — a fact is served on its own say-so (the single witness only pins one HOLDS→NA case)"

### PROP-KNOW-2 — ungrounded facts fail closed

inv: INV-KNOW-2
source: method-tags-knw.md#INV-KNOW-2 # ptr+digest
law: ∀ candidate c. ¬isGrounded(c) ⇒ admit(c) = {emitted:false, persisted:0}, where isGrounded(c) ⇔ grounding has ≥1 entry AND every entry has a non-empty `subtreeHash`; admission is total (a structured rejection, never a throw)
arbitrary: ungrounded / partially-grounded nodes — {0 entries} ∪ {≥1 entry, ≥1 with empty subtreeHash} — mixed with fully-grounded controls
covers_reqs: [ REQ-KNOW-2 ] # ptr+digest
witness: [ SCN-KNOW-2-1 ]
teeth: breaks-on "the admitter treats a partially-grounded node (some entry non-empty, some empty) as grounded — any empty-subtreeHash entry leaks through, which the single 0-entry witness cannot catch"

### PROP-KNOW-3 — structural drift oracle is the subtreeHash

inv: INV-KNOW-3
source: method-tags-knw.md#INV-KNOW-3 # ptr+digest
law: ∀ fact f, tree t. freshness(f,t) = (subtreeHash(anchoredUnit(f,t)) == f.grounding.subtreeHash) ? FRESH : DRIFTED, with an unresolvable anchor key ⇒ DRIFTED (fail-closed) — line numbers never enter identity or freshness; the cited unit's slice INCLUDES its bound leading doc-comment (the contiguous `comment` run, ADR-0014); an edit that does not touch the cited unit (import / blank-line-separated license-header above it, unrelated rename elsewhere) stays FRESH; a body change, a reformat OF the unit, a rename OF the cited symbol, and an edit to the unit's bound doc-comment all DRIFT
arbitrary: a NON-TOUCHING-edit generator (import / blank-line-separated license header added above, unrelated rename elsewhere ⇒ the unit's own bytes and key invariant) AND a TOUCHING-edit generator (body change, in-unit whitespace/reindent ⇒ subtreeHash moves; edit to a CONTIGUOUS leading comment (the bound doc-comment) ⇒ subtreeHash moves; rename of the cited symbol ⇒ anchor key retired); assert the FRESH/DRIFTED split over the paired corpus
covers_reqs: [ REQ-KNOW-3a, REQ-KNOW-3b, REQ-KNOW-3c ] # ptr+digest
witness: [ SCN-KNOW-3a-1, SCN-KNOW-3b-1, SCN-KNOW-3c-1 ]
teeth: breaks-on "freshness is computed from the cited unit's line-range — across the generated corpus every downward shift spuriously DRIFTs" · breaks-on "a whitespace normalizer lands — the TOUCHING corpus reads FRESH on an in-unit reformat, and with it on a one-space change inside a template literal" · breaks-on "a rename of the cited symbol re-binds the fact to the renamed unit instead of failing closed"

> **AMENDED 2026-08-02 (HONESTY-TAPROOT).** The law was stated over `normalize(anchoredUnit)` and the
> arbitrary generated "whitespace/reformat, rename, import-above" as one _normalize-invariant_ cosmetic
> class. **No normalizer exists**, and only import-above is invariant; a reformat moves the hash and a rename
> of the cited symbol retires the anchor key outright. See the KNOW-3 amendment in `invariant-register.md`
> (pending owner ratification) and `method-tags-knw.md#INV-KNOW-3`.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified same-landing as GROUND-5).** The `subtreeHash` preimage now
> includes a declaration's bound leading doc-comment, so the law's slice and both generators are
> contiguity-qualified: a blank-line-separated header stays in the NON-TOUCHING generator; a CONTIGUOUS
> leading comment (the bound doc-comment) moves into the TOUCHING generator. The law's FRESH ⟺ byte-identical
> shape is unchanged — only what "the unit's slice" spans grew. Witnessed by `adapter-io` goldens G-GAP2-1..8.

### PROP-KNOW-4 — every write is an upsert (enumerated universe A)

inv: INV-KNOW-4
source: method-tags-knw.md#INV-KNOW-4 # ptr+digest
law: ∀ candidate w against store S. route(w) ∈ {DEDUP, UPDATE, SUPERSEDE, CREATE} is total + mutually-exclusive (exactly one cell), per the decision table {contentHash-hit ⇒ DEDUP · nodeKey-miss ⇒ CREATE · advisory-hit ⇒ UPDATE(set-union in place) · predicate-same-check ⇒ SUPERSEDE · predicate-diff-check ⇒ CREATE}; AND ∀ key (anchor, slot[, check]). |current nodes| == 1 (uniqueness, 0 duplicates)
arbitrary: the finite routing product {contentHash∈(hit,miss) × family∈(advisory,predicate) × nodeKey∈(hit,miss) × check∈(same,diff)} over pre-state S0; the KRN OR-Set set-union reducer is the union oracle for the UPDATE leg
covers_reqs: [ REQ-KNOW-4a, REQ-KNOW-4b, REQ-KNOW-4c, REQ-KNOW-4d, REQ-KNOW-4e, REQ-KNOW-4f, REQ-KNOW-4g ] # ptr+digest
witness: [ SCN-KNOW-4a-1, SCN-KNOW-4b-1, SCN-KNOW-4c-1, SCN-KNOW-4d-1, SCN-KNOW-4e-1, SCN-KNOW-4f-1, SCN-KNOW-4g-1 ]
teeth: breaks-on "the router appends a second node on a nodeKey-hit (the landfill), OR UPDATE overwrites the claim set last-writer-wins instead of set-union — quantified over the whole product it kills any duplicate-mint / non-union path the 7 witness cells only sample"

### PROP-KNOW-5 — drift bisection: mechanical vs semantic

inv: INV-KNOW-5
source: method-tags-knw.md#INV-KNOW-5 # ptr+digest
law: ∀ DRIFTED set D. reconcile(D) partitions by reDerives(claim,newSha): mechanical = {d ∈ D : reDerives} auto-re-ground exit 0, semantic = {d ∈ D : ¬reDerives} BROKEN exit 2; mechanical ⊔ semantic = D (disjoint, covering) ∧ reauthorCount == |semantic| (never |D|, never N)
arbitrary: drift sets of arbitrary size k with an arbitrary re-deriving mask (s non-re-deriving, 0 ≤ s ≤ k)
covers_reqs: [ REQ-KNOW-5a, REQ-KNOW-5b, REQ-KNOW-5c, REQ-KNOW-5d ] # ptr+digest
witness: [ SCN-KNOW-5a-1, SCN-KNOW-5b-1, SCN-KNOW-5c-1, SCN-KNOW-5d-1 ]
teeth: breaks-on "reconcile sets reauthorCount = |DRIFTED| (blocks on mechanical drift too), OR collapses the split — over arbitrary (k,s) the human is asked to re-author auto-re-grounded facts; the fixed k=5,s=2 witness cannot expose the off-by-|mechanical| error at other sizes"

### PROP-KNOW-6 — empty & honest genesis

inv: INV-KNOW-6
source: method-tags-knw.md#INV-KNOW-6 # ptr+digest
law: ∀ source tree t. init(t) ⇒ count(invariants) == 0 ∧ ∀ territory τ ∈ init(t). τ.tier == 'T2' ∧ τ.family == 'advisory' — nothing authored, nothing promoted, by construction
arbitrary: arbitrary source trees (varying territory count / path shape / language mix)
covers_reqs: [ REQ-KNOW-6a, REQ-KNOW-6b ] # ptr+digest
witness: [ SCN-KNOW-6a-1, SCN-KNOW-6b-1 ]
teeth: breaks-on "init seeds a starter invariant or a non-T2/non-advisory default for SOME tree shape — a data-dependent promotion the single arbitrary-tree witness misses"

### PROP-KNOW-7 — no T0 auto-promotion

inv: INV-KNOW-7
source: method-tags-knw.md#INV-KNOW-7 # ptr+digest
law: ∀ territory τ. classify(τ).t0Candidate == true ⇒ classify(τ).tier == 'T2' — a heuristic MAY only _flag_ a candidate, never assign the tier (0 auto-promotes)
arbitrary: territories over the T0-keyword corpus (keyword-matching and non-matching paths)
covers_reqs: [ REQ-KNOW-7a, REQ-KNOW-7b ] # ptr+digest
witness: [ SCN-KNOW-7a-1, SCN-KNOW-7b-1 ]
teeth: breaks-on "the keyword match writes tier='T0' for ANY corpus row — quantified over every keyword it kills the heuristic-assigns-criticality path the single `auth/` witness only samples once"

### PROP-KNOW-8 — propose ≠ ratify

inv: INV-KNOW-8
source: method-tags-knw.md#INV-KNOW-8 # ptr+digest
law: ∀ explorer write w. w lands only in staging (0 reach the committed store without a ratifier token); ∀ staged candidate c committed ⇒ ratifier token present; c.tier == 'T0' ⇒ billy token required
arbitrary: explorer writes + staged candidates over {tier∈(T0,T2,…) × ratifier-token∈(present,absent) × billy-token∈(present,absent)}
covers_reqs: [ REQ-KNOW-8a, REQ-KNOW-8b, REQ-KNOW-8c ] # ptr+digest
witness: [ SCN-KNOW-8a-1, SCN-KNOW-8b-1, SCN-KNOW-8c-1 ]
teeth: breaks-on "a T0 candidate ratifies with only the lead token (billy not required) for SOME token combination — the full token cross-product exposes the bypass the 3 single-case witnesses cannot enumerate"
note: AMENDED by WP-PROMOTE (2026-08-02) — the law is unchanged and now has a SHIPPED witness for its first clause. Until the governed promotion door landed, "0 explorer writes reach the committed store without a ratifier token" was satisfied vacuously (0 reached it by any route). `atlas promote` is the route, and it routes every staged candidate to full ratification via a door-DERIVED `origin:'promoted'`; a promotion is therefore inside this law's quantifier for the first time.

### PROP-KNOW-9 — both families day-one, advisory-standalone

inv: INV-KNOW-9
source: method-tags-knw.md#INV-KNOW-9 # ptr+digest
law: ∀ advisory workload W under evaluator = none. emit(W) ∧ query(W) ∧ reconcile(W) all succeed (100%) — the store is fully operable on advisory alone, and the predicate family is constructible day-one (not deferred)
arbitrary: advisory-node workloads run through the full emit→query→reconcile cycle with a null evaluator; plus predicate-node construction asserted available
covers_reqs: [ REQ-KNOW-9a, REQ-KNOW-9b ] # ptr+digest
witness: [ SCN-KNOW-9a-1, SCN-KNOW-9b-1 ]
teeth: breaks-on "some advisory workload path hard-requires an evaluator to emit/query — the cycle throws when no evaluator is wired for inputs beyond the single witness workload"

### PROP-KNOW-10 — templated write, no free prose (enumerated universe B)

inv: INV-KNOW-10
source: method-tags-knw.md#INV-KNOW-10 # ptr+digest
law: ∀ fact f. route(f) = (allRequiredFieldsPresent(f) ∧ size(f.claimText) ≤ cap ∧ f.predicateSlot ∈ closedVocab13) ? PERSIST : REJECT; |closedVocab| == 13 exactly (adding one is a `cv` bump); 0 free-prose facts persist
arbitrary: the finite validity product {required-field∈(present,missing) × size∈(≤cap,>cap) × slot∈(in-13,out)} ∪ free-prose blobs (no template binding). _(guard-trigger source: reference Acceptance #9 — see goldens-knw §KNOW-10b; flagged for cold review)_
covers_reqs: [ REQ-KNOW-10a, REQ-KNOW-10b ] # ptr+digest
witness: [ SCN-KNOW-10a-1, SCN-KNOW-10b-1, SCN-KNOW-10b-2 ]
teeth: breaks-on "the validator drops the cap check or a required-field check for SOME field/size — the full product exposes any single-axis omission (a 700 B body, a receiptless node) the 3 cell witnesses only sample"

### PROP-KNOW-11 — scope-owned write, universal read ⚠️ **AMENDED 2026-08-03 (owner-ratified)** — reverses the `owner` fence added by #178/PR#105; see req-knw.md#REQ-KNOW-11a.

inv: INV-KNOW-11
source: method-tags-knw.md#INV-KNOW-11 # ptr+digest
law: ∀ op, actor, fact. authz(op, actor, fact) = (op == read) ? allow : inScope(actor, fact.scope); every fact carries `scope`; ∀ read ⇒ allow (100%), ∀ out-of-scope write ⇒ reject
arbitrary: facts with arbitrary scope × op∈(read,write) × actor-scope∈(in-scope,out-of-scope)
covers_reqs: [ REQ-KNOW-11a, REQ-KNOW-11b, REQ-KNOW-11c ] # ptr+digest
witness: [ SCN-KNOW-11a-1, SCN-KNOW-11b-1, SCN-KNOW-11c-1 ]
teeth: breaks-on "the write path skips the scope check for SOME actor/scope pairing, OR the read path applies one — quantified over the scope cross-product it kills both the leaky-write and the non-universal-read the single witnesses only pin once each"

### PROP-KNOW-12 — nothing dies (git + CAS, no redundant copy)

inv: INV-KNOW-12
source: method-tags-knw.md#INV-KNOW-12 # ptr+digest
law: ∀ supersede/edit event over old→new. get(oldId) resolves post-event ∧ no API path deletes; prior versions are content-addressed CAS objects deduped by content-identity (identical priors ⇒ one address, never byte-copied); an advisory edit adds NO `supersededBy` pointer (git is the archive); a predicate supersede adds EXACTLY one `supersededBy` pointer (a link, not a copy)
arbitrary: supersede/edit event streams — advisory edits-in-place, predicate supersedes, and identical-byte prior pairs (to exercise dedup)
covers_reqs: [ REQ-KNOW-12a, REQ-KNOW-12b, REQ-KNOW-12c, REQ-KNOW-12d, REQ-KNOW-12e ] # ptr+digest
witness: [ SCN-KNOW-12a-1, SCN-KNOW-12b-1, SCN-KNOW-12c-1, SCN-KNOW-12d-1, SCN-KNOW-12e-1 ]
teeth: breaks-on "the archive byte-copies a prior version (dedup broken) OR an advisory edit mints a supersededBy pointer — over arbitrary event streams it kills both the redundant-copy and the wrong-family-lineage paths the 5 fixed witnesses only sample"

### PROP-KNOW-13 — born from work

inv: INV-KNOW-13
source: method-tags-knw.md#INV-KNOW-13 # ptr+digest
law: ∀ production event e. produce(e) admits facts ⇔ e.moment ∈ {init-skeleton, enrich-by-blast-radius, wave-close}; a repo-wide sweep ⇒ 0 facts; ∀ sealing wave w. absorb(w) ∨ whyNot(w) — else a violation is recorded
arbitrary: production events tagged with an arbitrary moment (the 3 valid moments + sweep/untagged) × sealing waves over {absorb?, grounded-why-not?}
covers_reqs: [ REQ-KNOW-13a, REQ-KNOW-13b ] # ptr+digest
witness: [ SCN-KNOW-13a-1, SCN-KNOW-13b-1 ]
teeth: breaks-on "the producer admits an untagged/sweep event for SOME moment value, OR the seal probe passes a bare wave — the full moment×wave space exposes any admit-hole the 2 witnesses only sample"

### PROP-KNOW-14 — provenance receipt

inv: INV-KNOW-14
source: method-tags-knw.md#INV-KNOW-14 # ptr+digest
law: ∀ persisted claim c. c.provenance is present (persist requires it); c.provenance.trusted == false ⇒ c is marked advisory ∧ gate(claims) filters c out before the verdict (0 contribution toward HOLDS)
arbitrary: claims with/without a provenance receipt × trusted∈(true,false), assembled into gate input sets mixing trusted + untrusted
covers_reqs: [ REQ-KNOW-14a, REQ-KNOW-14b, REQ-KNOW-14c ] # ptr+digest
witness: [ SCN-KNOW-14a-1, SCN-KNOW-14b-1, SCN-KNOW-14c-1 ]
teeth: breaks-on "the gate counts an untrusted claim toward HOLDS for SOME mixed claim-set — quantified over trusted/untrusted mixes it kills the verdict-moving leak the single 2-claim witness only samples"

### PROP-KNOW-15 — deterministic write-decision, pure function of three hashes (universe A)

inv: INV-KNOW-15
source: method-tags-knw.md#INV-KNOW-15 # ptr+digest
law: ∀ candidate w. route(w) is a total, deterministic, mutually-exclusive **pure function of {contentHash, nodeKey, subtreeHash}**: identical ⇒ DEDUP · nodeKey-miss ⇒ CREATE · advisory-hit ⇒ UPDATE/union · predicate-same-check ⇒ SUPERSEDE · predicate-diff-check ⇒ CREATE (never sibling-retire); the drift leg (subtreeHash) NEVER changes the create/update leg (route(W) ≡ route(W′) when only subtreeHash differs); nodeKey_advisory = hash(primaryAnchorId ‖ predicateSlot), nodeKey_predicate = hash(primaryAnchorId ‖ predicateSlot ‖ normalize(check)); primaryAnchorId is the **computed** tightest structural unit (never LLM-chosen); secondary citations feed drift only, never the nodeKey; **0 LLM / clock / seq** calls enter the decision
arbitrary: the finite hash-state product {contentHash∈(in-CAS,new) × nodeKey∈(miss, hit-advisory, hit-predicate-same-check, hit-predicate-diff-check) × subtreeHash∈(equal,changed)} with the three hashes taken as **oracle inputs**; a drift-orthogonality pair (W3 vs W3′) and an LLM/clock/seq-call trap over the routing
covers_reqs: [ REQ-KNOW-15a, REQ-KNOW-15b, REQ-KNOW-15c, REQ-KNOW-15d, REQ-KNOW-15e, REQ-KNOW-15f, REQ-KNOW-15g, REQ-KNOW-15h, REQ-KNOW-15i, REQ-KNOW-15j ] # ptr+digest
witness: [ SCN-KNOW-15a-1, SCN-KNOW-15b-1, SCN-KNOW-15c-1, SCN-KNOW-15d-1, SCN-KNOW-15e-1, SCN-KNOW-15f-1, SCN-KNOW-15g-1, SCN-KNOW-15h-1, SCN-KNOW-15i-1, SCN-KNOW-15j-1 ]
teeth: breaks-on "the drift leg is conflated into create/update (a re-hash re-mints the node), OR a routing step reads seq/clock/LLM to disambiguate a nodeKey — quantified over the hash-state product it kills every non-deterministic / drift-conflating route the enumerated witness cells only sample"
[NEEDS RECONCILIATION: the **move-aware `primaryAnchorId` matcher** (rename/move+edit ⇒ same nodeKey, similarity threshold **θ**) is an OPEN DEFINE dependency (req-knw §NEEDS RECONCILIATION INV-KNOW-15; method-tags-knw §note + §Refuse-to-model). It lives **upstream** of the enumerated inputs — it fixes the *value* of the nodeKey inputs, not the routing over them — so the routing law above is airtight NOW (SCN-KNOW-15f-1 / 15h-1 as witnesses). The θ *precision boundary* (SCN-KNOW-15f-2, `gen: residue`) **cannot be rendered as a passing property until DEFINE pins the threshold**; no verification is invented for an unpinned threshold. The breaking mutant (θ=1.0, exact-match-only ⇒ every move+edit orphans) is real, but its pass boundary is deferred. *(The old near-dup `claimNorm` probe threshold τ is RESOLVED, not DEFINE-open: per `docs/design/dedup-identity.md` a collision is **reported** under exact NFC+trim equality — no fuzzy τ — and **never merges** at write time; structural near-dup is the derived-on-read `subsumes` relation. SCN-KNOW-15h-2 is now a plain exact-equality boundary; a near-synonymous-but-distinct claim minting its own node is correct, not an orphan.)*]

### PROP-KNOW-16 — predicate check = pure deterministic index-query

inv: INV-KNOW-16
source: method-tags-knw.md#INV-KNOW-16 # ptr+digest
law: ∀ PredicateNode.check q, index state I. eval(q, I) ∈ {HOLDS, BROKEN, NA} is determined by I **alone** — ∀ I. eval(q,I) == eval(q,I) (determinism/purity: no clock, no IO, no code-exec, no sandbox); a check needing runtime/behavioral execution is refused and the fact stays advisory; a produced verdict is forwarded to `atlas-reconcile`
arbitrary: checks over pinned index states (each evaluated twice, asserting identical verdicts) + runtime-requiring / code-exec checks (asserting refusal-to-advisory)
covers_reqs: [ REQ-KNOW-16a, REQ-KNOW-16b, REQ-KNOW-16c, REQ-KNOW-16d, REQ-KNOW-16e ] # ptr+digest
witness: [ SCN-KNOW-16a-1, SCN-KNOW-16b-1, SCN-KNOW-16c-1, SCN-KNOW-16d-1, SCN-KNOW-16e-1 ]
teeth: breaks-on "the evaluator reads a clock / shells out for SOME check — quantified over index states + check shapes it kills any impure or code-executing path (two runs diverging on one index) the 5 single-check witnesses only sample"

### PROP-KNOW-17 — usefulness is a-posteriori (hits + decay)

inv: INV-KNOW-17
source: method-tags-knw.md#INV-KNOW-17 # ptr+digest
law: ∀ served fact f governing a decision. a `hit` is logged against f's node-id; hits-in-window(f) == 0 ⇒ decay(f): f is archived to CAS (never deleted — KNOW-12), dropped from the served/pack set, and MAY re-enter on a later hit; the Door-2 threshold == f(observed hits), never the proposer's self-score
arbitrary: hit streams over a decay window (0-hit facts vs facts with ≥1 hit, and decayed-then-re-hit facts) × proposer self-scores
covers_reqs: [ REQ-KNOW-17a, REQ-KNOW-17b, REQ-KNOW-17c, REQ-KNOW-17d ] # ptr+digest
witness: [ SCN-KNOW-17a-1, SCN-KNOW-17b-1, SCN-KNOW-17c-1, SCN-KNOW-17d-1 ]
teeth: breaks-on "decay deletes (not archives) a zero-hit fact, OR the threshold reads the proposer self-score — over arbitrary hit histories it kills the destroy-on-decay and self-certify paths the 4 fixed witnesses only sample"

### PROP-KNOW-18 — risk-bounded ratification (confidence fast-path)

inv: INV-KNOW-18
source: method-tags-knw.md#INV-KNOW-18 # ptr+digest
law: ∀ candidate c. route(c) = (grounded(c) ∧ lowRisk(c) ∧ c.tier == 'T2' ∧ c.family == 'advisory') ? auto-accept : full-ratify — a T0, contested (reviewer veto / conflicting node), or ANY predicate candidate routes to full human ratification; only the single fast-path cell auto-accepts
arbitrary: candidates over the risk product {grounded? × lowRisk? × tier∈(T0,T2) × family∈(advisory,predicate) × contested?}
covers_reqs: [ REQ-KNOW-18a, REQ-KNOW-18b ] # ptr+digest
witness: [ SCN-KNOW-18a-1, SCN-KNOW-18b-1 ]
teeth: breaks-on "the fast-path drops the `advisory` (or `T2`, or `lowRisk`) conjunct — quantified over the risk product a grounded low-risk **predicate** (or T0/contested) auto-accepts without a human, which the 2 witnesses only sample at their fixed cells"

---

## Self-check (per template, before freeze)

- [x] one `properties-knw.md`; one PROP block per rendered law; every block conforms to the card.
- [x] every behavioural INV → ≥1 PROP: **18/18** (KNOW-1..18, all behavioural, 0 `n/a`) — mechanical 1:1.
- [x] every PROP's `source` is a `# ptr+digest` to a real `### INV-KNOW-<n>` (no invented law; no prose copy of code).
- [x] every `law` in the `∀ … . predicate` runnable idiom; no `formal`-cluster law in KNW (KRN owns FSPEC-merge; nothing to transcribe verbatim here).
- [x] every property-flavored golden's law present as a PROP; no PROP contradicts its `witness`. The DEFINE-parametric residue golden (15f-2, move+edit θ) is carried as a `[NEEDS RECONCILIATION]` note under PROP-KNOW-15, not a passing property. (15h-2's near-dup τ is RESOLVED to exact equality per `docs/design/dedup-identity.md` — now a plain boundary, no longer a residue.)
- [x] every `teeth` states a mutant the property kills **beyond** the single witness (the ∀-quantification over the generated space is the added assurance).

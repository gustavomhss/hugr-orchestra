# Goldens — Block KNW (knowledge) · S3 generate-from-method-tag

> **state:** S3 · **protocol:** [`goldens`](../../.claude/skills/goldens/SKILL.md) + [`completeness`](../../.claude/skills/completeness/SKILL.md) Gate-3 teeth ·
> **axiom:** S2 frozen (`method-tags-knw.md`; every INV method-tagged, `formal` footprint 0 in KNW — the one
> `FSPEC-merge` cluster is KRN's; KNOW-15/4's UPDATE/union leg _consumes_ it as oracle, is not itself formal) ·
> **owner:** charlie (FORGE). This is the **KNW block** — it carries the write-decision `exhaustive` triad
> (KNOW-4 / 10 / 15).
>
> **Derivation (generated from each INV's S2 method-tag; only the true residue is hand-authored):**
>
> - **KNOW-4 / 10 / 15** are `exhaustive` → SCNs are the **decision-table cells** of a finite input space:
>   each cell is one case, the route is asserted for **existence + uniqueness + mutual-exclusion**, and the
>   mutant is a **route mis-classification** (an append instead of upsert, a duplicate-mint, a
>   reject-that-should-persist, a create-that-should-update). Two shared enumerated universes below
>   (**write-decision** for KNOW-4/15, **template-validation** for KNOW-10/15i); the reference router
>   `knowledge/ref/router.ts` + validator `knowledge/ref/template.ts` (method-tags-knw §KNOW-4/10/15) are the
>   enumeration oracles, reused as the emit-unit mocks (anti-rot).
> - **KNOW-1 / 2 / 3 / 5 / 6 / 7 / 8 / 9 / 11 / 12 / 13 / 14 / 16 / 17 / 18** are `reference-model` →
>   **conformance / differential** against the named build-language mock (`knowledge/ref/*.ts`, reused as the
>   unit-test mock; anti-rot) — `gen: conformance`.
> - **KNOW-15's move-aware similarity matcher** (rename/**move+edit** ⇒ same nodeKey) is an **OPEN DEFINE
>   reconciliation** (req-knw §NEEDS RECONCILIATION; method-tags-knw §Refuse-to-model). It lives **upstream**
>   of the enumerated inputs — it fixes the _value_ of the `nodeKey` inputs, not the routing over them. So the
>   **routing goldens are written fully and are airtight NOW** (the three hashes are oracle inputs); only the
>   golden that would pin the matcher's **precision threshold θ** is **parametric** — `gen: residue` with a
>   DEFINE-dependency note, no verification invented for an unpinned threshold (**SCN-KNOW-15f-2**).
>   _(The old near-dup `claimNorm`-collision **threshold τ** is now RESOLVED, not DEFINE-open: per the frozen
>   dedup/identity model — `docs/design/dedup-identity.md` — a collision is **reported** under exact NFC+trim
>   equality (no fuzzy τ) and **never merges** at write time; structural near-dup is the derived-on-read
>   `subsumes` relation. SCN-KNOW-15h-2 is accordingly a non-parametric exact-equality boundary now.)_
> - **KNOW-10b guard source:** the missing-field / over-cap triggers are lifted from **reference Acceptance #9**
>   (`atlas-knowledge.md` §Acceptance:9) — the KNOW-10 Invariants clause states only "No free prose, ever." and
>   delegates the concrete reject-triggers to spec **A-13**; Acceptance #9 is the authoritative guard source
>   (req-knw §NEEDS RECONCILIATION INV-KNOW-10). Flagged for cold review.

---

## Enumerated universe A — the write decision (KNOW-4 / KNOW-15) — three orthogonal hashes

The write-decision is a pure lookup on `{contentHash, nodeKey, subtreeHash}` (reference §_The write decision_).
Pre-state store **S0** holds two nodes:

| node    | family    | primaryAnchorId (computed)                       | slot        | check                                           | nodeKey                                                           | current contentHash | subtreeHash | claims         |
| ------- | --------- | ------------------------------------------------ | ----------- | ----------------------------------------------- | ----------------------------------------------------------------- | ------------------- | ----------- | -------------- |
| **ADV** | advisory  | `anc-hdr` (tightest subtree of `fn parseHeader`) | `contract`  | —                                               | `nk-adv = hash(anc-hdr‖contract) = k-9a10`                        | `ch-a00`            | `st-77`     | `{cn-eqbytes}` |
| **PRD** | predicate | `anc-queue` (tightest subtree of `fn push`)      | `invariant` | `chk-head` (`normalize`→"head-never-reordered") | `nk-prd = hash(anc-queue‖invariant‖normalize(chk-head)) = k-3b71` | `ch-p00`            | `st-77`     | `{cn-headfix}` |

The finite candidate-write space (`contentHash∈{in-CAS,new} × nodeKey∈{miss, hit-advisory, hit-pred-same-check, hit-pred-diff-check} × subtreeHash∈{equal,changed}`), collapsed to its **routing cells** (contentHash-hit short-circuits to DEDUP; subtreeHash is the drift leg and MUST NOT change the create/update route):

| candidate | family    | contentHash         | nodeKey lookup                                                              | check             | subtreeHash   | **⇒ route** (cell)                                             |
| --------- | --------- | ------------------- | --------------------------------------------------------------------------- | ----------------- | ------------- | -------------------------------------------------------------- |
| **W1**    | advisory  | `ch-a00` **in CAS** | (short-circuit)                                                             | —                 | `st-77` (=)   | **DEDUP** — no-op, bump `hits` only                            |
| **W2**    | advisory  | `ch-b11` new        | `nk-new = k-5f22` **miss**                                                  | —                 | `st-88` (chg) | **CREATE**                                                     |
| **W3**    | advisory  | `ch-c22` new        | `nk-adv = k-9a10` **hit-advisory**                                          | —                 | `st-77` (=)   | **UPDATE** — claims `∪ {cn-latency}` in place                  |
| **W3′**   | advisory  | `ch-c22` new        | `nk-adv = k-9a10` **hit-advisory**                                          | —                 | `st-EE` (chg) | **UPDATE** — _same route_ (drift leg flips FRESH→DRIFTED only) |
| **W4**    | predicate | `ch-d33` new        | `nk-prd = k-3b71` **hit-pred, same check**                                  | `chk-head`        | `st-99` (chg) | **SUPERSEDE** — mint new + `supersededBy`, old kept in CAS     |
| **W5**    | predicate | `ch-e44` new        | `nk-prd2 = hash(anc-queue‖invariant‖normalize(chk-tail)) = k-6c80` **miss** | `chk-tail` (diff) | `st-77` (=)   | **CREATE** — coexists; sibling `chk-head` never retired        |

Existence: every candidate resolves to exactly one cell. Uniqueness: after each route a territory query on
the key returns exactly one current node. Mutual-exclusion: no candidate matches two cells.

## Enumerated universe B — template validation (KNOW-10 / KNOW-15i)

Per-kind template required fields (advisory) `= {claimNorm, claimText, provenance, owner, scope, grounding, predicateSlot}`;
cap `claimText ≤ 512 bytes`; `predicateSlot ∈` the **closed 13-slot vocabulary** `{invariant, contract,
precondition, postcondition, sideeffect, ownership, perf-bound, security-property, gotcha, rationale,
dependency, count, definition}` (reference §closed vocabulary — exactly 13; adding one is a `cv` bump). Route = PERSIST
iff all-clean, else REJECT (`{required-field∈(present,missing) × size∈(≤cap,>cap) × slot∈(in-13,out)}`):

| candidate | required fields                                    | size                        | slot                          | **⇒ route** (cell)             |
| --------- | -------------------------------------------------- | --------------------------- | ----------------------------- | ------------------------------ |
| **F1**    | all 7 present                                      | `claimText` 120 B ≤ cap     | `invariant` (in-13)           | **PERSIST**                    |
| **F2**    | `provenance` **absent**                            | 120 B                       | `invariant`                   | **REJECT** — missing-field     |
| **F3**    | all 7 present                                      | `claimText` 700 B **> cap** | `invariant`                   | **REJECT** — over-cap          |
| **F4**    | all 7 present                                      | 120 B                       | `freeform-note` **out-of-13** | **REJECT** — slot-out-of-vocab |
| **F5**    | free-prose blob, **no template binding / no slot** | —                           | —                             | **REJECT** — free-prose        |

---

## REQ-KNOW-1 — truth is never self-declared

### SCN-KNOW-1-1 — a candidate-declared HOLDS is ignored, status is recomputed (guard)

source: REQ-KNOW-1
Given a node written with `status:'HOLDS'` on its own body, whose recomputed side-index (KNOW-3 drift + the KNOW-16 evaluator) resolves to `NA`
When the served status is resolved via `knowledge/ref/status.ts`
Then the served status is `NA` (recomputed) and the input node's declared `status:'HOLDS'` is dropped — served status is a side-index, never a value the fact asserts about itself
teeth: breaks-on "the resolver trusts the node-declared `status` — the fact is served `HOLDS` on its own say-so"
gen: conformance

### SCN-KNOW-1-2 — a candidate-declared BROKEN is ignored, status recomputes to HOLDS (guard · held-out)

source: REQ-KNOW-1
held_out: true
Given a node written with `status:'BROKEN'` on its own body, whose recomputed side-index (KNOW-3 drift `FRESH` + the KNOW-16 evaluator) resolves to `HOLDS`
When the served status is resolved via `knowledge/ref/status.ts`
Then the served status is `HOLDS` (recomputed) and the input node's declared `status:'BROKEN'` is dropped — served status is a side-index, never a value the fact asserts about itself
teeth: breaks-on "the resolver trusts the node-declared `status` — the fact is served `BROKEN` on its own say-so though the index recomputes `HOLDS`"
gen: conformance

## REQ-KNOW-2 — ungrounded facts fail closed

### SCN-KNOW-2-1 — a node with no resolvable grounding is not persisted (guard)

source: REQ-KNOW-2
Given a candidate whose `grounding` has 0 entries (equivalently, an entry with an empty `subtreeHash`)
When `atlas-emit` admits it via `knowledge/ref/emit.ts`
Then it returns `emitted:false`, 0 objects persisted — admission is total (a structured rejection, never a throw)
teeth: breaks-on "the admitter treats an empty-`subtreeHash` entry as grounded — the ungrounded node enters the store (`emitted:true`)"
gen: conformance

### SCN-KNOW-2-2 — a partially-grounded node (one empty subtreeHash among many) fails closed (guard · held-out)

source: REQ-KNOW-2
held*out: true
Given a candidate with three `grounding` entries — two carrying a non-empty `subtreeHash` and one whose `subtreeHash` is empty (`isGrounded ⇔ every entry has a non-empty subtreeHash`, so \_any* empty entry ⇒ ungrounded)
When `atlas-emit` admits it via `knowledge/ref/emit.ts`
Then it returns `emitted:false`, 0 objects persisted — a single empty-`subtreeHash` entry among well-formed ones still fails closed (a structured rejection, never a throw)
teeth: breaks-on "the admitter checks only that entry-count > 0 (ignores the per-entry empty `subtreeHash`) — the partially-grounded node enters the store (`emitted:true`)"
gen: conformance

## REQ-KNOW-3 — the drift oracle is the subtreeHash

### SCN-KNOW-3a-1 — freshness is a function of the BLAKE3 subtreeHash alone (happy)

source: REQ-KNOW-3a
Given a fact grounded at `subtreeHash = st-77`, and the cited unit re-hashing to `st-77` (its own bytes unchanged)
When `freshness(fact,tree)` runs against `grounding/ref/subtree.ts` (`subtreeHash(unit) == fact.grounding.subtreeHash ? FRESH : DRIFTED`) <!-- AMENDED 2026-08-02 with REQ-KNOW-3b: there is no `normalize(unit)` step; the oracle hashes the unit's raw source slice, NFC-normalized only -->
Then it is `FRESH`, and no line number enters the computation
teeth: breaks-on "freshness is computed from the cited unit's line-range instead of the subtreeHash — a downward shift of the unit (same bytes) drifts the fact"
gen: conformance

### SCN-KNOW-3a-2 — freshness ignores a 200-line downward shift of the cited unit (happy · held-out)

source: REQ-KNOW-3a
held_out: true
Given a fact grounded at `subtreeHash = st-42` on the unit `fn popTail`, that unit shifted 200 lines down in the file (unrelated code inserted above), re-hashing to `st-42` (its own bytes unchanged)
When `freshness(fact,tree)` runs against `grounding/ref/subtree.ts` (`subtreeHash(unit) == fact.grounding.subtreeHash ? FRESH : DRIFTED`) <!-- AMENDED 2026-08-02 with REQ-KNOW-3b: there is no `normalize(unit)` step -->
Then it is `FRESH`, and the 200-line offset enters no part of the computation
teeth: breaks-on "freshness is computed from the cited unit's line-range instead of the subtreeHash — the 200-line downward shift (same bytes) drifts the fact"
gen: conformance

### REQ-KNOW-3b — an edit that does not touch the cited unit stays FRESH

> **AMENDED 2026-08-02 (HONESTY-TAPROOT), narrowing to what is actually delivered.** This requirement
> previously claimed "reformat / rename / import-above stays FRESH" over three edit classes. **Only
> import-above is delivered** (and only since `f2a8659`, when the symbol's byte start index left the anchor
> key). The other two were false and are now stated as such — measured through the real
> `foldAstUnits → build → driftDetect` chain, not asserted:
>
> - A **reformat OF the cited unit DRIFTS.** The oracle hashes the unit's raw source slice, NFC-normalized
>   only; there is no `normalize(unit)` step that erases whitespace, and there deliberately never will be —
>   any cheap normalization over raw text also erases whitespace that is SEMANTIC in TS/TSX (string,
>   template and regex literals, JSX text, ASI), and the trade is asymmetric: a false alarm costs one
>   re-ground, a false negative lets the truth gate serve `HOLDS` on a stale fact. See REQ-GROUND-5b.
> - A **rename OF the cited symbol DRIFTS**, and more strongly: the anchor key is
>   `<parent>::<kind>:<ordinal>[:<name>]`, so a rename retires the key and the anchor becomes
>   **unresolvable**, failing closed under GROUND-3. There is no rename-tracking; re-grounding after a
>   rename is an author action.
>
> The scenarios below now pin all three legs — the delivered one FRESH, the two undelivered ones DRIFTED —
> so the limit is a tooth rather than a silence.
>
> **AMENDED 2026-08-09 (ADR-0014, owner-ratified same-landing as GROUND-5).** A fourth leg is added: the
> `subtreeHash` preimage now includes a declaration's bound leading doc-comment (the contiguous `comment`
> run), so an edit to a comment CONTIGUOUS with the cited declaration DRIFTS the fact, and the "header above
> ⇒ FRESH" leg holds only for a BLANK-LINE-SEPARATED (or import-separated) header. The mechanical witness is
> `adapter-io` goldens **G-GAP2-1..8** over the REAL `foldAstUnits → build → driftDetect` chain. It is NOT
> witnessed in `freshness.know3.realmint.test.ts`: that harness writes the unit's slice BY HAND (to avoid a
> knowledge→adapter-io layer inversion), so it cannot see the `foldAstUnits` slice-extension — pinning the new
> slice by hand there would re-commit the vacuous-fixture sin the file exists to fix.

### SCN-KNOW-3b-1 — import-above stays FRESH; an in-unit reformat and a rename OF the cited symbol DRIFT (guard)

source: REQ-KNOW-3b
Given a fact grounded on the cited unit at `subtreeHash = st-77`, and three separate edits: (i) an `import` inserted ABOVE the unit, leaving the unit's own bytes and its minted key untouched; (ii) a whitespace reformat OF the cited unit, moving its `subtreeHash`; (iii) a rename OF the cited symbol, retiring its anchor key
When `freshness` runs over each edit
Then (i) is `FRESH` — nothing the unit commits to moved; (ii) is `DRIFTED` — the raw-source-slice oracle's stated limit, not a defect; (iii) is `DRIFTED` — the anchor is unresolvable, fail-closed
teeth: breaks-on "an import added above the unit drifts it — the anchor key carries a byte offset and any line inserted above re-keys a still-true fact" · breaks-on "an in-unit reformat reads FRESH — a whitespace normalizer landed and the oracle can no longer see a one-space change inside a template literal" · breaks-on "a rename of the cited symbol reads FRESH — the fact silently re-binds to a unit it was never grounded on"
gen: conformance # differential over the {non-touching ⇒ FRESH, in-unit ⇒ DRIFTED} corpus (method-tags-knw §KNOW-3)

### SCN-KNOW-3b-2 — import-above on fn popTail stays FRESH; a reindent and a `pop`→`dequeue` rename DRIFT (guard · held-out)

source: REQ-KNOW-3b
held_out: true
Given a fact grounded on `fn popTail` at `subtreeHash = st-42`, and three separate edits: (i) an `import` inserted ABOVE it, leaving its own bytes and minted key untouched; (ii) a reindent (tabs→spaces) INSIDE it, moving its `subtreeHash`; (iii) its symbol renamed `pop`→`dequeue`, retiring its anchor key
When `freshness` runs over each edit
Then (i) is `FRESH`; (ii) is `DRIFTED` — the oracle's stated limit <!-- AMENDED 2026-08-02 with REQ-KNOW-3b -->; (iii) is `DRIFTED` — the anchor is unresolvable, fail-closed
teeth: breaks-on "the import-above drifts a still-true fact — the anchor key carries a byte offset and any line inserted above re-keys it" · breaks-on "an in-unit reindent reads FRESH — a whitespace normalizer landed and the oracle can no longer see a change inside a template literal" · breaks-on "the `pop`→`dequeue` rename reads FRESH — the fact silently re-binds to a unit it was never grounded on"
gen: conformance

### SCN-KNOW-3c-1 — a real change to the cited unit DRIFTs (happy)

source: REQ-KNOW-3c
Given the cited unit's body semantically changed so `subtreeHash` moves `st-77 → st-C9`
When `freshness` runs over this semantic-edit corpus row
Then the fact is marked `DRIFTED`
teeth: breaks-on "the subtreeHash is computed over the unit's _signature only_ (ignores the body) — a real body change leaves the fact FRESH"
gen: conformance # differential over the {semantic ⇒ DRIFTED} corpus

### SCN-KNOW-3c-2 — a real body change on fn popTail DRIFTs (happy · held-out)

source: REQ-KNOW-3c
held*out: true
Given the cited unit `fn popTail`'s body semantically changed (an early-return added) so `subtreeHash` moves `st-42 → st-D1`
When `freshness` runs over this semantic-edit corpus row
Then the fact is marked `DRIFTED`
teeth: breaks-on "the subtreeHash is computed over the unit's \_signature only* (ignores the body) — the added early-return leaves the fact FRESH"
gen: conformance

## REQ-KNOW-4 — every write is an upsert (enumerated universe A)

### SCN-KNOW-4a-1 — every write routes to exactly one upsert cell — never an append (happy)

source: REQ-KNOW-4a
Given the candidate stream `[W1, W2, W3, W4, W5]` against store S0
When each is routed by `knowledge/ref/router.ts`
Then the routes are exactly `[DEDUP, CREATE, UPDATE, SUPERSEDE, CREATE]` — the routing is total (every write lands in one cell) and no write appends a second node under an existing `nodeKey`
teeth: breaks-on "the router appends a new node on a `nodeKey`-hit instead of upserting — W3 mints a parallel advisory node (the landfill) rather than UPDATE"
gen: exhaustive # totality over universe A

### SCN-KNOW-4b-1 — an identical fact is idempotent (DEDUP) (happy)

source: REQ-KNOW-4b
Given **W1** — a candidate whose `contentHash = ch-a00` is already in CAS (byte-identical to ADV)
When it is routed
Then the route is **DEDUP** — a no-op that mints no node and only bumps `hits`/freshness
teeth: breaks-on "the dedup leg is dropped — re-emitting a byte-identical fact mints a second CAS object for one fact"
gen: exhaustive # cell W1

### SCN-KNOW-4c-1 — an advisory subject's claims set-union (UPDATE) (happy)

source: REQ-KNOW-4c
Given **W3** — a new advisory claim `cn-latency` at `nodeKey nk-adv` (hit-advisory), ADV already holding `{cn-eqbytes}`
When it is routed
Then the route is **UPDATE** and ADV's claims become `{cn-eqbytes, cn-latency}` — a set-union in place (dedup by `claimNorm`; the KRN OR-Set reducer is the union oracle)
teeth: breaks-on "UPDATE overwrites the claim set (last-writer-wins) instead of set-union — `cn-eqbytes` is dropped"
gen: exhaustive # cell W3

### SCN-KNOW-4d-1 — a changed advisory fact is edited in place, not superseded (happy)

source: REQ-KNOW-4d
Given **W3** (a _changed_ advisory fact on `nk-adv`) routed to UPDATE
When the write completes
Then ADV is **edited in place** (no new node, no `supersededBy` pointer — git holds the prior version) and a territory query on `(anc-hdr, contract)` returns the single edited node
teeth: breaks-on "a changed _advisory_ fact is routed to SUPERSEDE (mints a new node + pointer) — the advisory family accretes lineage nodes it should not"
gen: exhaustive # cell W3 (advisory edit-in-place vs supersede route separation)

### SCN-KNOW-4e-1 — a changed predicate (same check, new evidence) supersedes (happy)

source: REQ-KNOW-4e
Given **W4** — a predicate re-evidence at `nk-prd` (hit-predicate, **same** check `chk-head`), new `contentHash ch-d33`
When it is routed
Then the route is **SUPERSEDE** — a new node is minted with a `supersededBy` pointer and PRD's old bytes stay addressable in CAS
teeth: breaks-on "same-check re-evidence is routed to UPDATE/edit-in-place instead of SUPERSEDE — the prior predicate verdict is lost (no lineage pointer)"
gen: exhaustive # cell W4

### SCN-KNOW-4f-1 — a different check is a new node (happy)

source: REQ-KNOW-4f
Given **W5** — a predicate at the same `(anc-queue, invariant)` but a **different** check `chk-tail`, so `nodeKey nk-prd2 ≠ nk-prd` (a miss)
When it is routed
Then the route is **CREATE** — the new check coexists as its own node and the sibling `chk-head` node is **never** retired
teeth: breaks-on "the check is left out of the predicate `nodeKey` — `chk-tail` hits `nk-prd` and SUPERSEDEs the still-valid `chk-head` sibling (the sibling-retire bug)"
gen: exhaustive # cell W5

### SCN-KNOW-4g-1 — a territory query returns one current node per key (happy)

source: REQ-KNOW-4g
Given store S0 after applying `[W3 (UPDATE nk-adv), W4 (SUPERSEDE nk-prd), W5 (CREATE nk-prd2)]`
When a territory query enumerates current nodes per `(anchor, slot[, check])`
Then it returns **exactly one** current node per key — `(anc-hdr,contract)→1`, `(anc-queue,invariant,chk-head)→1` (the superseder), `(anc-queue,invariant,chk-tail)→1` — 0 duplicates, no history dump
teeth: breaks-on "the query returns every version of a superseded key — `(anc-queue,invariant,chk-head)` yields 2 nodes (the retired + the superseder), violating one-current-node uniqueness"
gen: exhaustive # uniqueness over universe A

## REQ-KNOW-5 — drift splits mechanical vs semantic

### SCN-KNOW-5a-1 — reconcile splits the DRIFTED subset (happy)

source: REQ-KNOW-5a
Given a merge that drifts `k=5` facts, of which `s=2` no longer re-derive at the new `@sha`
When `knowledge/ref/reconcile.ts` partitions the DRIFTED subset by `reDerives(claim,newSha)`
Then the subset splits into `|mechanical|=3` and `|semantic|=2` — the two classes are disjoint and cover all 5
teeth: breaks-on "reconcile treats the whole DRIFTED subset as one class (no split) — all 5 are blocked or all 5 auto-reground"
gen: conformance

### SCN-KNOW-5a-2 — reconcile splits a 9-drift subset (4 semantic / 5 mechanical) (happy · held-out)

source: REQ-KNOW-5a
held_out: true
Given a merge that drifts `k=9` facts, of which `s=4` no longer re-derive at the new `@sha`
When `knowledge/ref/reconcile.ts` partitions the DRIFTED subset by `reDerives(claim,newSha)`
Then the subset splits into `|mechanical|=5` and `|semantic|=4` — the two classes are disjoint and cover all 9
teeth: breaks-on "reconcile treats the whole DRIFTED subset as one class (no split) — all 9 are blocked or all 9 auto-reground"
gen: conformance

### SCN-KNOW-5b-1 — mechanical drift auto-re-grounds, no human, no block (happy)

source: REQ-KNOW-5b
Given the `|mechanical|=3` facts whose claim still re-derives at the new `@sha`
When reconcile handles them
Then all 3 are **auto-re-grounded** with exit 0 for that subset — no human, no block
teeth: breaks-on "reconcile blocks (exit 2) on a mechanically-drifted fact whose claim still re-derives — the moved-anchor case spuriously halts the merge"
gen: conformance

### SCN-KNOW-5b-2 — the 5 mechanically-drifted facts of the 9-drift set auto-re-ground (happy · held-out)

source: REQ-KNOW-5b
held_out: true
Given the `|mechanical|=5` facts (of the `k=9` drift) whose claim still re-derives at the new `@sha`
When reconcile handles them
Then all 5 are **auto-re-grounded** with exit 0 for that subset — no human, no block
teeth: breaks-on "reconcile blocks (exit 2) on a mechanically-drifted fact whose claim still re-derives — a moved-anchor case among the 5 spuriously halts the merge"
gen: conformance

### SCN-KNOW-5c-1 — semantic drift flips BROKEN and blocks (exit 2) (guard)

source: REQ-KNOW-5c
Given the `|semantic|=2` facts whose claim no longer re-derives
When reconcile handles them
Then each flips to `BROKEN` and the merge is blocked with **exit 2**
teeth: breaks-on "a semantically-drifted fact exits 0 (does not block) — a broken claim merges silently"
gen: conformance

### SCN-KNOW-5c-2 — the 4 semantic facts flip BROKEN and block (exit 2) (guard · held-out)

source: REQ-KNOW-5c
held_out: true
Given the `|semantic|=4` facts (of the `k=9` drift) whose claim no longer re-derives
When reconcile handles them
Then each flips to `BROKEN` and the merge is blocked with **exit 2**
teeth: breaks-on "a semantically-drifted fact among the 4 exits 0 (does not block) — a broken claim merges silently"
gen: conformance

### SCN-KNOW-5d-1 — human re-author count equals the semantic count (happy)

source: REQ-KNOW-5d
Given the reconcile of `k=5` drifted, `s=2` semantic
When the human re-author count is emitted
Then `reauthorCount == 2` (`== |semantic|`) — never `5` (`|DRIFTED|`), never `N`
teeth: breaks-on "`reauthorCount` is set to `|DRIFTED|` (=5) — the human is asked to re-author the 3 mechanical facts that auto-re-grounded"
gen: conformance

### SCN-KNOW-5d-2 — re-author count equals the semantic count (4), not the drift count (9) (happy · held-out)

source: REQ-KNOW-5d
held_out: true
Given the reconcile of `k=9` drifted, `s=4` semantic
When the human re-author count is emitted
Then `reauthorCount == 4` (`== |semantic|`) — never `9` (`|DRIFTED|`), never `N`
teeth: breaks-on "`reauthorCount` is set to `|DRIFTED|` (=9) — the human is asked to re-author the 5 mechanical facts that auto-re-grounded"
gen: conformance

## REQ-KNOW-6 — empty & honest genesis

### SCN-KNOW-6a-1 — init output carries zero invariants (happy)

source: REQ-KNOW-6a
Given an arbitrary source tree
When `knowledge/ref/init.ts` emits the territory skeleton
Then `count(invariants) == 0` — nothing is authored at move-in
teeth: breaks-on "init seeds a starter invariant per territory — `atlas-init` output carries invariants that were never grounded from work"
gen: conformance

### SCN-KNOW-6a-2 — a 40-territory monorepo init still carries zero invariants (happy · held-out)

source: REQ-KNOW-6a
held_out: true
Given a large monorepo source tree spanning 40 territories
When `knowledge/ref/init.ts` emits the territory skeleton
Then `count(invariants) == 0` across all 40 — nothing is authored at move-in
teeth: breaks-on "init seeds a starter invariant per territory — the 40-territory skeleton carries 40 invariants that were never grounded from work"
gen: conformance

### SCN-KNOW-6b-1 — every territory ships the T2/advisory default (happy)

source: REQ-KNOW-6b
Given the territories emitted by `init`
When each territory's default tier + family is read
Then `∀ territory: tier == 'T2' ∧ family == 'advisory'` by construction
teeth: breaks-on "a territory defaults to `T1` (or `predicate`) — init pre-assigns criticality it must not"
gen: conformance

### SCN-KNOW-6b-2 — deeply-nested territories all default T2/advisory (happy · held-out)

source: REQ-KNOW-6b
held_out: true
Given the territories emitted by `init` over a tree with 5-level-deep nested packages
When each territory's default tier + family is read
Then `∀ territory: tier == 'T2' ∧ family == 'advisory'` by construction, at every nesting depth
teeth: breaks-on "a nested territory defaults to `T1` (or `predicate`) — init pre-assigns criticality it must not"
gen: conformance

## REQ-KNOW-7 — no T0 auto-promotion

### SCN-KNOW-7a-1 — a T0-keyword match is not auto-promoted (guard)

source: REQ-KNOW-7a
Given a territory whose path matches a `T0` keyword (e.g. `auth/`)
When `knowledge/ref/tier.ts` classifies it
Then `t0Candidate == true` **and** `tier == 'T2'` — 0 auto-promotes
teeth: breaks-on "the keyword match writes `tier = 'T0'` — criticality is assigned by heuristic without human ratification"
gen: conformance

### SCN-KNOW-7a-2 — a `payments/` T0-keyword match is not auto-promoted (guard · held-out)

source: REQ-KNOW-7a
held_out: true
Given a territory whose path matches a different `T0` keyword (`payments/`)
When `knowledge/ref/tier.ts` classifies it
Then `t0Candidate == true` **and** `tier == 'T2'` — 0 auto-promotes
teeth: breaks-on "the `payments/` keyword match writes `tier = 'T0'` — criticality is assigned by heuristic without human ratification"
gen: conformance

### SCN-KNOW-7b-1 — heuristics only flag a candidate (happy)

source: REQ-KNOW-7b
Given the classifier over a keyword corpus
When it runs
Then for every match it sets only the `t0Candidate` flag and never the `tier` field — the flag routes to human ratification
teeth: breaks-on "the heuristic mutates the `tier` field rather than only flagging — the flag becomes an assignment"
gen: conformance

### SCN-KNOW-7b-2 — heuristics over a {secrets/, kms/} corpus only flag (happy · held-out)

source: REQ-KNOW-7b
held_out: true
Given the classifier over a keyword corpus of `secrets/` and `kms/` paths
When it runs
Then for every match it sets only the `t0Candidate` flag and never the `tier` field — the flag routes to human ratification
teeth: breaks-on "the heuristic mutates the `tier` field on a `secrets/` match rather than only flagging — the flag becomes an assignment"
gen: conformance

## REQ-KNOW-8 — propose ≠ ratify

### SCN-KNOW-8a-1 — the explorer writes only staged candidates (guard)

source: REQ-KNOW-8a
Given the explorer surface emitting a fact
When it writes via `knowledge/ref/ratify.ts`
Then the write lands only in **staging** as a `Candidate` — 0 explorer writes reach the committed store
teeth: breaks-on "the explorer path writes straight to the committed store (bypasses staging) — a miner self-commits"
gen: conformance

### SCN-KNOW-8a-2 — the blast-radius miner writes only a staged predicate candidate (guard · held-out)

source: REQ-KNOW-8a
held_out: true
Given the enrich-by-blast-radius miner emitting a predicate fact
When it writes via `knowledge/ref/ratify.ts`
Then the write lands only in **staging** as a `Candidate` — 0 miner writes reach the committed store
teeth: breaks-on "the miner path writes straight to the committed store (bypasses staging) — a miner self-commits"
gen: conformance

### SCN-KNOW-8b-1 — ratification requires a ratifier token (happy · AMENDED WP-PROMOTE)

source: REQ-KNOW-8b
Given a staged candidate
When it is committed
Then it is committed only through the reconcile/lead ratifier (a ratifier token present), with reviewer veto honored
teeth: breaks-on "a staged candidate is committed with no ratifier token — the propose/ratify separation collapses"
gen: conformance
runtime-note (A-D4 — AMENDED by WP-PROMOTE, 2026-08-02): the propose→ratify route this golden describes is now WIRED end to end. It used to hold vacuously — nothing read staging back — and the governed promotion door (`atlas promote`) is the missing leg: it presents each staged candidate to the existing `atlas-emit` door under a ratify context the DOOR derived (`origin:'promoted'`), which removes the KNOW-18 fast path so a grounded T2 advisory candidate cannot auto-accept its way past the ratifier. See goldens-adapters.md#SCN-CLI-7b-1 for the black-box witness.

### SCN-KNOW-8b-2 — a staged `queue/` advisory candidate commits only with the lead ratifier token (happy · held-out)

source: REQ-KNOW-8b
held_out: true
Given a different staged advisory candidate at territory `queue/`
When it is committed
Then it is committed only through the reconcile/lead ratifier (a ratifier token present), with reviewer veto honored
teeth: breaks-on "the `queue/` candidate is committed with no ratifier token — the propose/ratify separation collapses"
gen: conformance

### SCN-KNOW-8c-1 — a T0 candidate requires billy (guard)

source: REQ-KNOW-8c
Given a staged `T0` candidate
When ratification is attempted without the billy token
Then it is refused — `T0` ratification requires billy
teeth: breaks-on "a `T0` candidate ratifies with only the lead token (billy not required) — the T0 gate is bypassed"
gen: conformance

### SCN-KNOW-8c-2 — a `payments/` T0 candidate requires billy (guard · held-out)

source: REQ-KNOW-8c
held_out: true
Given a staged `T0` candidate in territory `payments/`
When ratification is attempted with only the lead token (no billy)
Then it is refused — `T0` ratification requires billy
teeth: breaks-on "the `payments/` T0 candidate ratifies with only the lead token (billy not required) — the T0 gate is bypassed"
gen: conformance

## REQ-KNOW-9 — both families day-one

### SCN-KNOW-9a-1 — both node families are available day-one (happy)

source: REQ-KNOW-9a
Given a freshly initialized store
When an advisory node and a predicate node are each emitted
Then both families are constructible on day-one — the predicate family is not deferred
teeth: breaks-on "the predicate family constructor is stubbed/deferred — emitting a predicate node fails on day-one"
gen: conformance

### SCN-KNOW-9a-2 — a chk-tail predicate and a cn-latency advisory both construct day-one (happy · held-out)

source: REQ-KNOW-9a
held_out: true
Given a freshly initialized store
When a predicate node carrying check `chk-tail` and an advisory node holding claim `cn-latency` are each emitted
Then both families are constructible on day-one — the predicate family is not deferred
teeth: breaks-on "the predicate family constructor is stubbed/deferred — emitting the `chk-tail` predicate node fails on day-one"
gen: conformance

### SCN-KNOW-9b-1 — the store operates on advisory alone with no evaluator (happy)

source: REQ-KNOW-9b
Given `knowledge/ref/store.ts` parametrized with `evaluator = none`
When the full `emit → query → reconcile` cycle runs over advisory nodes
Then all three succeed (100%) — the store is fully operable on advisory alone
teeth: breaks-on "the store hard-requires an evaluator to emit/query — the advisory-only cycle throws when no evaluator is wired"
gen: conformance

### SCN-KNOW-9b-2 — a 3-node advisory corpus runs emit→query→reconcile with no evaluator (happy · held-out)

source: REQ-KNOW-9b
held_out: true
Given `knowledge/ref/store.ts` parametrized with `evaluator = none` and a corpus of 3 advisory nodes across 2 territories
When the full `emit → query → reconcile` cycle runs over that corpus
Then all three phases succeed (100%) — the store is fully operable on advisory alone
teeth: breaks-on "the store hard-requires an evaluator to emit/query — the advisory-only cycle throws when no evaluator is wired"
gen: conformance

## REQ-KNOW-10 — templated write, no free prose (enumerated universe B)

### SCN-KNOW-10a-1 — a free-prose fact is rejected (guard)

source: REQ-KNOW-10a
Given **F5** — a free-prose blob with no template binding and no `predicateSlot`
When `knowledge/ref/template.ts` validates it
Then the route is **REJECT** — 0 free-prose facts persist
teeth: breaks-on "the validator accepts a body with no slot binding — a free-prose fact persists (the template gate is a no-op)"
gen: exhaustive # cell F5

### SCN-KNOW-10b-1 — a fact missing a required template field is rejected (guard)

source: REQ-KNOW-10b # guard source: reference Acceptance #9 (atlas-knowledge.md §Acceptance:9)
Given **F2** — a fact with `provenance` absent, otherwise well-formed
When the validator runs
Then the route is **REJECT** — missing-field
teeth: breaks-on "the required-field check omits `provenance` — a receiptless node persists"
gen: exhaustive # cell F2

### SCN-KNOW-10b-2 — a fact over its cap is rejected (guard)

source: REQ-KNOW-10b # guard source: reference Acceptance #9
Given **F3** — a fact whose `claimText` is 700 B (> the 512 B cap), otherwise well-formed
When the validator runs
Then the route is **REJECT** — over-cap
teeth: breaks-on "the cap check is dropped — a 700 B claim body persists (unbounded prose leaks in past the cap)"
gen: exhaustive # cell F3

## REQ-KNOW-11 — scope-owned write, universal read

### SCN-KNOW-11a-1 — every fact carries a scope (happy) ⚠️ **AMENDED 2026-08-03 (owner-ratified)** — was "every fact carries owner and scope" before #178/PR#105 was reverted; `owner` dropped, see req-knw.md#REQ-KNOW-11a.

source: REQ-KNOW-11a
Given a fact emitted through `knowledge/ref/authz.ts`
When the persisted node is inspected
Then it carries a `scope`
teeth: breaks-on "a fact persists with `scope` unset — the ownership fence has no anchor"
gen: conformance

### SCN-KNOW-11a-2 — a fact emitted at territory `queue/` carries a scope (happy · held-out) ⚠️ **AMENDED 2026-08-03 (owner-ratified)** — was "carries owner and scope"; `owner` dropped, see req-knw.md#REQ-KNOW-11a.

source: REQ-KNOW-11a
held_out: true
Given a different fact emitted through `knowledge/ref/authz.ts` at territory `queue/`
When the persisted node is inspected
Then it carries a `scope`
teeth: breaks-on "the `queue/` fact persists with `scope` unset — the ownership fence has no anchor"
gen: conformance

### SCN-KNOW-11b-1 — any caller may read any fact (happy)

source: REQ-KNOW-11b
Given a fact owned by territory `A`
When a caller from an unrelated scope `B` reads it
Then the read succeeds — read is universal
teeth: breaks-on "the read path applies the scope check — a cross-scope read is denied (read stops being universal)"
gen: conformance

### SCN-KNOW-11b-2 — a caller in scope D reads a fact owned by territory C (happy · held-out)

source: REQ-KNOW-11b
held_out: true
Given a fact owned by territory `C`
When a caller from an unrelated scope `D` reads it
Then the read succeeds — read is universal
teeth: breaks-on "the read path applies the scope check — the C-owned fact is denied to scope `D` (read stops being universal)"
gen: conformance

### SCN-KNOW-11c-1 — an out-of-scope write is rejected (guard)

source: REQ-KNOW-11c
Given a writer in scope `B` attempting to write a fact owned by territory `A`
When `authz(write, B, fact)` runs
Then the write is rejected — `inScope(B, A.scope)` is false
teeth: breaks-on "the write path skips the scope check — an out-of-scope writer mutates another territory's fact"
gen: conformance

### SCN-KNOW-11c-2 — a scope-D writer is rejected writing a territory-C fact (guard · held-out)

source: REQ-KNOW-11c
held_out: true
Given a writer in scope `D` attempting to write a fact owned by territory `C`
When `authz(write, D, fact)` runs
Then the write is rejected — `inScope(D, C.scope)` is false
teeth: breaks-on "the write path skips the scope check — the scope-`D` writer mutates territory `C`'s fact"
gen: conformance

## REQ-KNOW-12 — nothing dies (git + CAS, no redundant copy)

### SCN-KNOW-12a-1 — a superseded prior version stays recoverable (happy)

source: REQ-KNOW-12a
Given PRD superseded by W4 (a `supersededBy` pointer minted)
When `get(oldId)` is called via `knowledge/ref/archive.ts`
Then it resolves the old node's bytes — no history is lost, and no API path deletes it
teeth: breaks-on "SUPERSEDE removes the old node — `get(oldId)` misses after supersede (history destroyed)"
gen: conformance

### SCN-KNOW-12a-2 — a second superseded predicate stays recoverable (happy · held-out)

source: REQ-KNOW-12a
held_out: true
Given the `chk-tail` predicate node (minted by W5) later re-evidenced with the same check and thereby superseded (a fresh `supersededBy` pointer minted)
When `get(oldId2)` is called via `knowledge/ref/archive.ts`
Then it resolves the superseded node's bytes — no history is lost, and no API path deletes it
teeth: breaks-on "SUPERSEDE removes the old `chk-tail` node — `get(oldId2)` misses after supersede (history destroyed)"
gen: conformance

### SCN-KNOW-12b-1 — prior versions are their own CAS objects, deduped (happy)

source: REQ-KNOW-12b
Given two supersede events whose prior versions share identical bytes
When they are retained
Then each prior version is a content-addressed CAS object and the two identical ones **dedup to one address** — never byte-copied
teeth: breaks-on "the archive byte-copies each prior version into a lineage blob — identical priors are stored twice (dedup broken)"
gen: conformance

### SCN-KNOW-12b-2 — three supersede events, two identical priors dedup to one address (happy · held-out)

source: REQ-KNOW-12b
held_out: true
Given three supersede events, two of whose prior versions share identical bytes and one distinct
When they are retained
Then the two identical priors **dedup to one** content-addressed CAS object and the distinct one is a second — two addresses for three events, never byte-copied
teeth: breaks-on "the archive byte-copies each prior version into a lineage blob — the two identical priors are stored twice (dedup broken)"
gen: conformance

### SCN-KNOW-12c-1 — an advisory edit-in-place keeps no lineage pointer (happy)

source: REQ-KNOW-12c
Given ADV edited in place by W3 (UPDATE)
When the resulting node is inspected
Then it carries **no** `supersededBy` pointer — git is the archive for the advisory prior version
teeth: breaks-on "an advisory edit mints a `supersededBy` lineage pointer — the advisory family accretes redundant in-store lineage"
gen: conformance

### SCN-KNOW-12c-2 — a second advisory edit-in-place keeps no lineage pointer (happy · held-out)

source: REQ-KNOW-12c
held_out: true
Given a different advisory node (at territory `queue/`) edited in place by a claim set-union
When the resulting node is inspected
Then it carries **no** `supersededBy` pointer — git is the archive for the advisory prior version
teeth: breaks-on "the `queue/` advisory edit mints a `supersededBy` lineage pointer — the advisory family accretes redundant in-store lineage"
gen: conformance

### SCN-KNOW-12d-1 — a predicate supersede adds only a pointer (happy)

source: REQ-KNOW-12d
Given PRD superseded by W4
When the superseder node is inspected
Then it adds **only** a `supersededBy` pointer into CAS (a link) — the old bytes are not byte-copied into the new node
teeth: breaks-on "SUPERSEDE inlines a copy of the old node's bytes into the new node — a redundant copy, not a pointer"
gen: conformance

### SCN-KNOW-12d-2 — the chk-tail predicate supersede adds only a pointer (happy · held-out)

source: REQ-KNOW-12d
held_out: true
Given the `chk-tail` predicate node superseded by same-check re-evidence
When the superseder node is inspected
Then it adds **only** a `supersededBy` pointer into CAS (a link) — the old bytes are not byte-copied into the new node
teeth: breaks-on "SUPERSEDE inlines a copy of the old `chk-tail` node's bytes into the new node — a redundant copy, not a pointer"
gen: conformance

### SCN-KNOW-12e-1 — the working store stays lean (happy)

source: REQ-KNOW-12e
Given ADV edited in place (W3) and a fact decayed by KNOW-17
When the hot working set is counted
Then the edited advisory occupies one hot slot (the prior lives in git, not the hot set) and the decayed fact has dropped from the hot set
teeth: breaks-on "edit-in-place retains the prior version in the hot working set — the working store grows unbounded on every edit"
gen: conformance

### SCN-KNOW-12e-2 — two edits + two decays keep the working store lean (happy · held-out)

source: REQ-KNOW-12e
held_out: true
Given two advisory nodes each edited in place and two facts decayed by KNOW-17
When the hot working set is counted
Then each edited advisory occupies exactly one hot slot (its prior lives in git, not the hot set) and both decayed facts have dropped from the hot set
teeth: breaks-on "edit-in-place retains each prior version in the hot working set — the working store grows by one slot on every edit"
gen: conformance

## REQ-KNOW-13 — born from work

### SCN-KNOW-13a-1 — a repo-wide sweep produces zero facts (guard)

source: REQ-KNOW-13a
Given a production attempt tagged as a repo-wide sweep (none of the 3 moments: init-skeleton / enrich-by-blast-radius / wave-close)
When `knowledge/ref/produce.ts` handles it
Then **0 facts** are produced — production is admitted only at the three moments
teeth: breaks-on "the producer admits an untagged (sweep) production event — a repo-wide sweep mints facts for untouched territories"
gen: conformance

### SCN-KNOW-13a-2 — a scheduled full-tree re-scan produces zero facts (guard · held-out)

source: REQ-KNOW-13a
held_out: true
Given a production attempt tagged as a scheduled full-tree re-scan (none of the 3 moments: init-skeleton / enrich-by-blast-radius / wave-close)
When `knowledge/ref/produce.ts` handles it
Then **0 facts** are produced — production is admitted only at the three moments
teeth: breaks-on "the producer admits the scheduled re-scan event — a full-tree re-scan mints facts for untouched territories"
gen: conformance

### SCN-KNOW-13b-1 — a bare sealing wave records a violation (guard)

source: REQ-KNOW-13b
Given a sealing wave with no `absorb` and no grounded why-not
When the seal probe runs
Then it records a **violation** (`absorb ∨ why-not` is false)
teeth: breaks-on "the seal probe passes a bare wave (records no violation) — a wave seals having neither fed the Atlas nor justified why not"
gen: conformance

### SCN-KNOW-13b-2 — a wave that touched code but neither absorbed nor gave a why-not records a violation (guard · held-out)

source: REQ-KNOW-13b
held_out: true
Given a sealing wave that modified territories yet emitted no `absorb` and no grounded why-not
When the seal probe runs
Then it records a **violation** (`absorb ∨ why-not` is false)
teeth: breaks-on "the seal probe passes this code-touching bare wave (records no violation) — a wave seals having neither fed the Atlas nor justified why not"
gen: conformance

## REQ-KNOW-14 — provenance

### SCN-KNOW-14a-1 — every claim carries a provenance receipt (happy)

source: REQ-KNOW-14a
Given a claim persisted through `knowledge/ref/provenance.ts`
When the stored claim is inspected
Then it carries a `Provenance` receipt
teeth: breaks-on "a claim persists with `provenance` absent — a receiptless claim enters the store"
gen: conformance

### SCN-KNOW-14a-2 — a claim from a commit-message source carries a provenance receipt (happy · held-out)

source: REQ-KNOW-14a
held_out: true
Given a different claim (sourced from a commit message) persisted through `knowledge/ref/provenance.ts`
When the stored claim is inspected
Then it carries a `Provenance` receipt
teeth: breaks-on "the commit-message-sourced claim persists with `provenance` absent — a receiptless claim enters the store"
gen: conformance

### SCN-KNOW-14b-1 — an untrusted-sourced claim is marked advisory (guard)

source: REQ-KNOW-14b
Given a claim whose `provenance.trusted == false`
When it is persisted
Then the claim is marked advisory
teeth: breaks-on "an untrusted claim is stored with a non-advisory status — an untrusted source is treated as trusted"
gen: conformance

### SCN-KNOW-14b-2 — a scraped-comment untrusted claim is marked advisory (guard · held-out)

source: REQ-KNOW-14b
held_out: true
Given a claim scraped from a code comment whose `provenance.trusted == false`
When it is persisted
Then the claim is marked advisory
teeth: breaks-on "the scraped-comment untrusted claim is stored with a non-advisory status — an untrusted source is treated as trusted"
gen: conformance

### SCN-KNOW-14c-1 — an untrusted claim is excluded from the gate (guard)

source: REQ-KNOW-14c
Given a claim set mixing a trusted and an `untrusted` claim
When `gate(claims)` computes the verdict
Then the untrusted claim is filtered out before the verdict — 0 contribution toward `HOLDS`
teeth: breaks-on "the gate counts the untrusted claim toward `HOLDS` — an untrusted source moves the verdict"
gen: conformance

### SCN-KNOW-14c-2 — one untrusted among two trusted contributes 0 to the verdict (guard · held-out)

source: REQ-KNOW-14c
held_out: true
Given a claim set of two trusted claims and one `untrusted` claim
When `gate(claims)` computes the verdict
Then the untrusted claim is filtered out before the verdict — the verdict is a function of the two trusted claims alone, 0 contribution from the untrusted toward `HOLDS`
teeth: breaks-on "the gate counts the untrusted claim toward `HOLDS` — the untrusted source moves the 2-trusted verdict"
gen: conformance

## REQ-KNOW-15 — deterministic write-decision (enumerated universe A)

### SCN-KNOW-15a-1 — the route is a total, unique, mutually-exclusive function of three hashes (happy)

source: REQ-KNOW-15a
Given the candidate stream `[W1, W2, W3, W3′, W4, W5]` against store S0, the three hashes taken as oracle inputs
When each is routed by `knowledge/ref/router.ts`
Then the routes are exactly `[DEDUP, CREATE, UPDATE, UPDATE, SUPERSEDE, CREATE]` — **existence** (every candidate lands in one cell), **uniqueness** (one current node per key after each route), **mutual-exclusion** (no candidate matches two cells), and the drift leg is orthogonal (`W3` vs `W3′` route identically though `subtreeHash` differs)
teeth: breaks-on "the drift leg is conflated into the create/update leg — `W3′` (changed subtreeHash) routes to CREATE while `W3` routes to UPDATE, so a mere re-hash re-mints the node"
gen: exhaustive # master enumeration over universe A

### SCN-KNOW-15b-1 — advisory nodeKey = hash(primaryAnchorId ‖ predicateSlot) (happy)

source: REQ-KNOW-15b
Given two advisory writes on the same `(anc-hdr, contract)` — the second a **reworded restatement** (same anchor+slot, different body bytes) — computing `nodeKey = hash(anc-hdr ‖ contract) = k-9a10`
When both are routed
Then they collide on `k-9a10` and the second is an **UPDATE**/union — one node per `(anchor, slot)`, independent of body wording
teeth: breaks-on "the advisory `nodeKey` folds in the contentHash/claim body — the reworded restatement gets a different key and **CREATEs a parallel node** instead of UPDATE-ing `k-9a10`"
gen: exhaustive # cell W3 nodeKey leg

### SCN-KNOW-15c-1 — predicate nodeKey includes normalize(check) (happy)

source: REQ-KNOW-15c
Given two predicate writes at the same `(anc-queue, invariant)` with checks `chk-head` and `chk-tail`
When each `nodeKey = hash(anc-queue ‖ invariant ‖ normalize(check))` is computed
Then `k-3b71 ≠ k-6c80` — the distinct check is a distinct node (W5 is a CREATE, never a sibling-supersede)
teeth: breaks-on "`normalize(check)` is left out of the predicate `nodeKey` — `chk-tail` collides with `chk-head`'s key and retires the still-valid sibling"
gen: exhaustive # cell W5 nodeKey leg

### SCN-KNOW-15d-1 — primaryAnchorId is the computed tightest structural unit (happy)

source: REQ-KNOW-15d
Given a claim referencing symbols `{X, Y}` where the smallest AST subtree containing both is `fn parseHeader`
When `knowledge/ref/anchor.ts` computes `primaryAnchorId`
Then it is `anc-hdr` — the tightest structural unit containing every referenced symbol, deterministically
teeth: breaks-on "the anchor computer widens to the enclosing module (or narrows below `{X,Y}`) — the same real fact anchors to a different unit across runs, forking its nodeKey"
gen: conformance # anchor computation is a computed function upstream of the route; the tightest-unit rule is deterministic (not the DEFINE-gated similarity threshold)

### SCN-KNOW-15d-2 — primaryAnchorId is the tightest unit over {P,Q,R} in fn drainQueue (happy · held-out)

source: REQ-KNOW-15d
held_out: true
Given a claim referencing symbols `{P, Q, R}` where the smallest AST subtree containing all three is `fn drainQueue`
When `knowledge/ref/anchor.ts` computes `primaryAnchorId`
Then it is `anc-drain` — the tightest structural unit containing every referenced symbol, deterministically
teeth: breaks-on "the anchor computer widens to the enclosing module (or narrows below `{P,Q,R}`) — the same real fact anchors to a different unit across runs, forking its nodeKey"
gen: conformance # anchor computation is a computed function upstream of the route; the tightest-unit rule is deterministic (not the DEFINE-gated similarity threshold)

### SCN-KNOW-15e-1 — an LLM-chosen anchor is never used as primaryAnchorId (guard)

source: REQ-KNOW-15e
Given the write-decision offered an LLM-proposed anchor alongside the computed `anc-hdr`
When `primaryAnchorId` is resolved
Then the computed `anc-hdr` is used and the LLM-proposed anchor is discarded — 0 LLM-chosen anchors enter identity
teeth: breaks-on "the decision uses the LLM-proposed anchor as `primaryAnchorId` — anchor-granularity drift forks the nodeKey across runs for one real fact"
gen: conformance

### SCN-KNOW-15e-2 — an LLM-proposed module-level anchor is discarded for the computed anc-drain (guard · held-out)

source: REQ-KNOW-15e
held_out: true
Given the write-decision offered an LLM-proposed module-level anchor alongside the computed `anc-drain`
When `primaryAnchorId` is resolved
Then the computed `anc-drain` is used and the LLM-proposed module anchor is discarded — 0 LLM-chosen anchors enter identity
teeth: breaks-on "the decision uses the LLM-proposed module anchor as `primaryAnchorId` — anchor-granularity drift forks the nodeKey across runs for one real fact"
gen: conformance

### SCN-KNOW-15f-1 — a rename/move re-anchors to the same node (no spurious CREATE) (happy)

source: REQ-KNOW-15f
Given the anchored unit renamed/moved such that the **name-stripped** `subtreeHash` still matches — so the move-aware matcher yields `nodeKey = nk-adv = k-9a10` (a hit)
When the re-emitted fact is routed (nodeKey taken as oracle input)
Then the route is **UPDATE** on the same node — the rename is a MOVE, not a delete+create; no orphan
teeth: breaks-on "the matcher keys on the pre-rename name — the renamed unit yields a nodeKey MISS and the fact spuriously CREATEs a parallel node (orphaning the original)"
gen: exhaustive # routing over the (rename ⇒ hit) oracle input — airtight now

### SCN-KNOW-15f-2 — move+edit re-anchor precision (happy · DEFINE-parametric)

source: REQ-KNOW-15f
Given the anchored unit **moved AND edited** so the name-stripped `subtreeHash` no longer matches — re-anchoring now depends on the move-aware **similarity threshold θ** (subtreeHash equality misses move+edit)
When the matcher decides same-node vs new-node at similarity `sim`
Then for `sim ≥ θ` it must yield the same `nodeKey` (UPDATE) and for `sim < θ` a CREATE — **θ is an OPEN DEFINE dependency** (req-knw §NEEDS RECONCILIATION INV-KNOW-15); the route _over_ the matcher output is airtight (SCN-KNOW-15f-1), only the θ boundary is unpinned
teeth: breaks-on "the matcher threshold is set to θ=1.0 (exact-match only) — every move+edit falls below it and orphans into a spurious CREATE" — the breaking mutant is real; the _pass_ boundary awaits DEFINE
gen: residue # DEFINE-dependency: matcher precision threshold θ unpinned — no verification invented for an unpinned threshold (method-tags-knw §Refuse-to-model)

### SCN-KNOW-15g-1 — a secondary citation feeds drift only, never identity (happy)

source: REQ-KNOW-15g
Given a fact re-emitted citing a second anchor (secondary citation added to `grounding.entries`), primary anchor unchanged
When the `nodeKey` is computed
Then it is still `k-9a10` (unchanged) — the secondary citation feeds DRIFT (grounding) only, never the identity
teeth: breaks-on "a secondary citation enters the nodeKey — adding a second citation to an existing fact re-mints it as a new node"
gen: exhaustive # nodeKey identity leg — secondary excluded

### SCN-KNOW-15h-1 — a claimNorm collision is reported, not merged (happy)

source: REQ-KNOW-15h
Given a CREATE candidate whose `claimNorm` collides (exact NFC+trim, `claimSimilarity === 1`) with an existing `(anc-hdr, *)` sibling-slot node
When the write-decision routes the candidate (D0 `contentHash` / D1 `nodeKey` only — no collision-driven merge leg)
Then the collision is **reported** as a deterministic signal and the candidate **CREATEs its own node** (each keeps its own grounding — A2); it is **not** merged at write time — structural coverage is instead the derived-on-read `subsumes` relation (`docs/design/dedup-identity.md`)
teeth: breaks-on "the router merges on the claimNorm collision — a colliding-claimNorm candidate is folded into the neighbor instead of minting its own node (the REMOVED write-time MERGE, which de-grounds one fact past A2)"
gen: exhaustive # routing over the three hashes (D0/D1); the collision is a reported signal, not a merge-route input

### SCN-KNOW-15h-2 — no fuzzy near-dup threshold; near-synonyms route to ratification (happy)

source: REQ-KNOW-15h
Given two claims whose normalized forms are near-synonymous but not exactly equal (`claimSimilarity < 1` under NFC+trim)
When the write-decision routes them
Then neither a collision report nor any write-time merge fires on the near-synonymy — there is **no fuzzy threshold τ** (`claimSimilarity∈{0,1}`); the cross-location near-synonym residue is the **H1 `sameAs`** case, routed to **human ratification only** (DEFERRED, Wave 2 — `docs/design/dedup-identity.md`), never an automatic merge
teeth: breaks-on "a fuzzy τ<1 is reintroduced so near-synonymous-but-distinct claims auto-collide/merge — de-grounding one fact and resurrecting the removed write-time MERGE"
gen: exhaustive # exact-equality boundary; the fuzzy/cross-location residue is honestly routed to human ratification (A1), not a threshold

### SCN-KNOW-15i-1 — a slot outside the closed vocabulary is rejected (guard)

source: REQ-KNOW-15i
Given **F4** — a fact whose `predicateSlot = freeform-note` (outside the closed 13-slot vocabulary), otherwise well-formed
When it is validated / routed
Then the route is **REJECT** — and the closed slot set has exactly the 13 enumerated members (adding one is a `cv` bump)
teeth: breaks-on "the slot-membership check is dropped (free-text slot allowed) — an out-of-vocab slot never collides, so `nodeKey` never forces UPDATE and the store proliferates parallel nodes"
gen: exhaustive # cell F4 slot leg (shares universe B with KNOW-10)

### SCN-KNOW-15j-1 — no step of the write-decision consults an LLM (guard)

source: REQ-KNOW-15j
Given the full routing of `[W1..W5]` executed under an audit that traps any LLM call site
When the routes are computed
Then the routes are produced with **0 LLM calls** — the decision is `seq`-/clock-/LLM-free
teeth: breaks-on "a routing step calls an LLM (or reads `seq`/clock) to disambiguate a nodeKey — the route becomes non-deterministic across runs for one real fact"
gen: conformance # structural: no LLM/clock/seq call site in the decision (method-tags-knw §KNOW-15 anti-rot)

### SCN-KNOW-15j-2 — routing a collision+drift stream consults no LLM (guard · held-out)

source: REQ-KNOW-15j
held_out: true
Given the routing of the stream `[W3, W3′, W4, W5]` plus a `claimNorm`-collision candidate, executed under an audit that traps any LLM call site
When the routes are computed
Then the routes are produced with **0 LLM calls** — the decision is `seq`-/clock-/LLM-free
teeth: breaks-on "a routing step calls an LLM (or reads `seq`/clock) to disambiguate the collision candidate — the route becomes non-deterministic across runs for one real fact"
gen: conformance # structural: no LLM/clock/seq call site in the decision (method-tags-knw §KNOW-15 anti-rot)

## REQ-KNOW-16 — predicate check = deterministic index-query

### SCN-KNOW-16a-1 — a check evaluates to HOLDS/BROKEN/NA from index state alone (happy)

source: REQ-KNOW-16a
Given a `PredicateNode.check` that is a structural query over the Atlas index
When `knowledge/ref/evaluator.ts` evaluates it against a pinned index state
Then it yields exactly one of `HOLDS / BROKEN / NA` from that index state alone
teeth: breaks-on "the evaluator reads external/runtime state to decide the verdict — the verdict is no longer a function of the Atlas index"
gen: conformance

### SCN-KNOW-16a-2 — a dependency-axis check evaluates to BROKEN from index state alone (happy · held-out)

source: REQ-KNOW-16a
held_out: true
Given a `PredicateNode.check` that is a dependency-axis query ("no import from territory `X`") over the Atlas index
When `knowledge/ref/evaluator.ts` evaluates it against a pinned index state that contains such an import
Then it yields `BROKEN` — exactly one of `HOLDS / BROKEN / NA`, from that index state alone
teeth: breaks-on "the evaluator reads external/runtime state to decide the dependency-axis verdict — the verdict is no longer a function of the Atlas index"
gen: conformance

### SCN-KNOW-16a-3 — a check whose TEXT is not a query of the shipped grammar is refused at admission (guard)

source: REQ-KNOW-16a
Given a proposed check of an evaluable KIND (`index-query` / `assertion`) whose body names none of the five shipped operators (`exists|<key>` · `absent|<key>` · `has-object|<hash>` · `child-count|<key>|<non-negative integer>` · `subtree-hash|<key>|<hash>`), or names one with a body it cannot take — including `child-count|<key>|` (`Number('')` is `0`) and `child-count|<key>|three` (`NaN`)
When it is put to the admission gate
Then it is REFUSED with a reason naming the expected form and quoting the body that was read — never admitted, so it can never reach `evaluate` and be answered with a verdict nobody computed; and all five shipped operators are still admitted and still evaluate to the identical verdict
teeth: breaks-on "the gate admits on `kind` alone without reading the body — an unparseable expression is admitted, and the interpreter's fallbacks turn it into `NA` forever, a `HOLDS` on an empty count, or a `BROKEN` on a non-numeric one, any of which reaches `atlas-reconcile` as though a predicate had really been evaluated"
gen: conformance # the refusal is exercised in both directions: the twelve shipped operator/verdict pairs are pinned admitted BEFORE the door is narrowed

### SCN-KNOW-16b-1 — a check requiring code execution is not evaluated (guard)

source: REQ-KNOW-16b
Given a check that would require arbitrary code execution / a sandbox
When the evaluator is asked to evaluate it
Then it refuses — no code is executed, no sandbox is spawned
teeth: breaks-on "the evaluator shells out to run the check — arbitrary code executes inside the evaluator"
gen: conformance

### SCN-KNOW-16b-2 — a check needing a spawned test-runner is not evaluated (guard · held-out)

source: REQ-KNOW-16b
held_out: true
Given a check that would require spawning a test-runner subprocess
When the evaluator is asked to evaluate it
Then it refuses — no code is executed, no sandbox is spawned
teeth: breaks-on "the evaluator spawns the test-runner to run the check — arbitrary code executes inside the evaluator"
gen: conformance

### SCN-KNOW-16c-1 — a runtime-requiring check stays advisory (guard)

source: REQ-KNOW-16c
Given a check needing runtime/behavioral execution
When the fact is emitted
Then it is kept **advisory** (the predicate check is refused, out of scope for v0)
teeth: breaks-on "a runtime-requiring check is admitted as a predicate — a non-evaluable check is served as HOLDS/BROKEN"
gen: conformance

### SCN-KNOW-16c-2 — an endpoint-returns-200 runtime check stays advisory (guard · held-out)

source: REQ-KNOW-16c
held_out: true
Given a check needing runtime execution ("the endpoint returns 200 when called")
When the fact is emitted
Then it is kept **advisory** (the predicate check is refused, out of scope for v0)
teeth: breaks-on "the runtime endpoint check is admitted as a predicate — a non-evaluable check is served as HOLDS/BROKEN"
gen: conformance

### SCN-KNOW-16d-1 — the evaluator is pure (same index ⇒ same verdict) (happy)

source: REQ-KNOW-16d
Given a fixed index state
When the evaluator runs the same check twice
Then both runs yield the identical verdict — no clock, no IO
teeth: breaks-on "the evaluator reads the wall-clock — the verdict differs between two runs on the same index state (impure)"
gen: conformance

### SCN-KNOW-16d-2 — the evaluator yields an identical verdict across three runs on one index (happy · held-out)

source: REQ-KNOW-16d
held_out: true
Given a fixed index state and a different structural check
When the evaluator runs the same check three times
Then all three runs yield the identical verdict — no clock, no IO
teeth: breaks-on "the evaluator reads the wall-clock — the verdict differs across the three runs on the same index state (impure)"
gen: conformance

### SCN-KNOW-16e-1 — the verdict feeds atlas-reconcile (happy)

source: REQ-KNOW-16e
Given a check evaluated to `BROKEN`
When the evaluation completes
Then the verdict is passed to `atlas-reconcile` (the reconcile input carries it)
teeth: breaks-on "the verdict is computed but never forwarded to `atlas-reconcile` — a BROKEN check does not reach the merge gate"
gen: conformance

### SCN-KNOW-16e-2 — a second BROKEN verdict on a different node feeds atlas-reconcile (happy · held-out)

source: REQ-KNOW-16e
held_out: true
Given a different predicate node's check evaluated to `BROKEN`
When the evaluation completes
Then the verdict is passed to `atlas-reconcile` (the reconcile input carries it)
teeth: breaks-on "the verdict is computed but never forwarded to `atlas-reconcile` — this BROKEN check does not reach the merge gate"
gen: conformance

## REQ-KNOW-17 — usefulness is a-posteriori

### SCN-KNOW-17a-1 — a served fact governing a decision accrues a logged hit (happy)

source: REQ-KNOW-17a
Given a served fact cited by a seat as "fact applied" in a decision
When `knowledge/ref/hits.ts` records the event
Then a `hit` is logged against that fact's node-id
teeth: breaks-on "governing a decision does not accrue a hit — the fact's usefulness is invisible to the hits-ledger"
gen: conformance

### SCN-KNOW-17a-2 — a different served fact cited by a second seat accrues a hit (happy · held-out)

source: REQ-KNOW-17a
held_out: true
Given a different served fact cited by a second seat as "fact applied" in a separate decision
When `knowledge/ref/hits.ts` records the event
Then a `hit` is logged against that fact's node-id
teeth: breaks-on "governing this decision does not accrue a hit — the fact's usefulness is invisible to the hits-ledger"
gen: conformance

### SCN-KNOW-17b-1 — door-2 calibrates on observed hits, not self-score (happy)

source: REQ-KNOW-17b
Given a fact with an observed hit history and a (higher) proposer self-assessment
When the Door-2 admission threshold is computed
Then it is `f(observed hits)` — never the proposer's self-score
teeth: breaks-on "the threshold reads the proposer's self-assessment — a fact self-certifies its way past door-2"
gen: conformance

### SCN-KNOW-17b-2 — door-2 threshold ignores a high self-score, reads observed hits (happy · held-out)

source: REQ-KNOW-17b
held_out: true
Given a fact with a low observed-hit history and a (higher) proposer self-assessment
When the Door-2 admission threshold is computed
Then it is `f(observed hits)` (tracking the low hit history) — never the proposer's high self-score
teeth: breaks-on "the threshold reads the proposer's high self-assessment — the fact self-certifies its way past door-2 despite low hits"
gen: conformance

### SCN-KNOW-17c-1 — an unconsulted fact decays out, archived to CAS (never deleted) (happy)

source: REQ-KNOW-17c
Given a served fact with `hits-in-window == 0`
When the decay pass runs
Then the fact is **archived to CAS** and dropped from the served/pack set — never deleted (KNOW-12)
teeth: breaks-on "decay deletes the fact instead of archiving to CAS — a zero-hit fact is destroyed and cannot re-spawn"
gen: conformance

### SCN-KNOW-17c-2 — a zero-hit fact at territory `queue/` decays to CAS, never deleted (happy · held-out)

source: REQ-KNOW-17c
held_out: true
Given a different served fact (at territory `queue/`) with `hits-in-window == 0`
When the decay pass runs
Then the fact is **archived to CAS** and dropped from the served/pack set — never deleted (KNOW-12)
teeth: breaks-on "decay deletes the `queue/` fact instead of archiving to CAS — a zero-hit fact is destroyed and cannot re-spawn"
gen: conformance

### SCN-KNOW-17d-1 — a decayed fact may re-enter on a later hit (happy)

source: REQ-KNOW-17d
Given a decayed (archived) fact that later receives a hit
When the hit is recorded
Then the fact re-enters the served set (re-spawned from CAS)
teeth: breaks-on "a decayed fact is permanently excluded — a later hit cannot re-admit it (decay is one-way)"
gen: conformance

### SCN-KNOW-17d-2 — a different decayed fact re-enters on a later hit (happy · held-out)

source: REQ-KNOW-17d
held_out: true
Given a different decayed (archived) fact that later receives a hit
When the hit is recorded
Then the fact re-enters the served set (re-spawned from CAS)
teeth: breaks-on "this decayed fact is permanently excluded — a later hit cannot re-admit it (decay is one-way)"
gen: conformance

## REQ-KNOW-18 — confidence fast-path

### SCN-KNOW-18a-1 — a grounded, low-risk, T2 advisory candidate auto-accepts (happy)

source: REQ-KNOW-18a
Given a candidate that is `grounded ∧ lowRisk ∧ T2 ∧ advisory`
When `knowledge/ref/fastpath.ts` routes it
Then it is **auto-accepted** with no human ratification (fast-path), backstopped by KNOW-17 decay
teeth: breaks-on "the fast-path requires a human ratifier token even for the grounded low-risk T2 advisory cell — the fast-path never fires"
gen: conformance

### SCN-KNOW-18a-2 — a second grounded low-risk T2 advisory candidate auto-accepts (happy · held-out)

source: REQ-KNOW-18a
held_out: true
Given a different candidate (at territory `queue/`) that is `grounded ∧ lowRisk ∧ T2 ∧ advisory`
When `knowledge/ref/fastpath.ts` routes it
Then it is **auto-accepted** with no human ratification (fast-path), backstopped by KNOW-17 decay
teeth: breaks-on "the fast-path requires a human ratifier token even for this grounded low-risk T2 advisory cell — the fast-path never fires"
gen: conformance

### SCN-KNOW-18b-1 — a T0 / contested / predicate candidate routes to full ratification (guard)

source: REQ-KNOW-18b
Given three candidates — one `T0`, one contested (reviewer veto / conflicting node), one predicate
When each is routed
Then all three route to **full human ratification** — none takes the fast-path
teeth: breaks-on "the fast-path predicate drops the `advisory` conjunct — a grounded low-risk **predicate** auto-accepts without human ratification"
gen: conformance

### SCN-KNOW-18b-2 — a payments/ T0, a conflicting-node contested, and a chk-tail predicate all route to full ratification (guard · held-out)

source: REQ-KNOW-18b
held_out: true
Given three candidates — a `T0` in `payments/`, one contested by a conflicting node, and a `chk-tail` predicate
When each is routed
Then all three route to **full human ratification** — none takes the fast-path
teeth: breaks-on "the fast-path drops the `advisory` conjunct — the grounded low-risk `chk-tail` **predicate** auto-accepts without human ratification"
gen: conformance

---

## Coverage ledger (S3 completeness facet)

- **REQ coverage:** 61/61 REQ have ≥1 SCN.
- **Guard coverage:** 19/19 unwanted/If-then REQ-clauses have a guard SCN — 1, 2, 5c, 7a, 8a, 8c, 10a, 10b(×2), 11c, 13a, 13b, 14b, 14c, 15e, 15i, 15j, 16b, 16c, 18b. (KNOW-10b's guard source = reference Acceptance #9, cited inline.)
- **Teeth (Gate 3):** 64/64 SCN name the exact mutant of their REQ they flip to BROKEN on; none vacuous. The exhaustive cells are interesting witnesses (real 2-node collisions W3/W5, a real DEDUP W1, a real cross-family SUPERSEDE W4, a real drift-orthogonality pair W3/W3′ — no antecedent-failure passes). The 1 DEFINE-parametric SCN (SCN-KNOW-15f-2, move+edit θ) still carries a **real breaking mutant** (θ set to exact-match ⇒ every move+edit orphans); only its _pass_ boundary awaits DEFINE.
- **toothless dropped:** 0.
- **gen histogram:** exhaustive 18 (KNOW-4: 4a/4b/4c/4d/4e/4f/4g · KNOW-10: 10a/10b-1/10b-2 · KNOW-15 routing: 15a/15b/15c/15f-1/15g/15h-1/15h-2/15i) · conformance 45 (all reference-model REQ + KNOW-15d/15e/15j) · residue 1 (15f-2, DEFINE-parametric).
- **DEFINE-parametric SCN count:** 1 (SCN-KNOW-15f-2 move+edit threshold θ) — the routing _over_ the matcher output is airtight now (SCN-KNOW-15f-1); the near-dup τ is now RESOLVED to exact equality (SCN-KNOW-15h-1 / 15h-2, no fuzzy threshold); only the θ precision boundary is unpinned.

---

## Held-out fixtures (Wave H — execution GATE held-out leg)

> **state:** S3 golden re-freeze (Wave H) · **owner:** charlie (FORGE). Each `gen: conformance` REQ now carries a
> **second, independent fixture** marked `held_out: true` (naming `SCN-KNOW-<req>-2`), inserted adjacent to its
> `-1` sibling. The execution GATE **withholds** the `-2` fixture from the builder: a builder who hard-codes the
> fixture-1 answer (overfit) **FAILS** the held-out leg, because each `-2` uses **different concrete data**
> (different declared status / grounding shape / unit + subtreeHash / counts / keyword / scope / node / claim /
> check / self-score) hitting the **same behaviour/branch** — grounded in the same reference model
> (`knowledge/ref/*.ts`), inventing no new behaviour. A renamed clone would defeat the mechanism, so each `-2`
> carries genuinely independent data and its own `teeth: breaks-on`.

- **conformance REQs:** 45 (all reference-model REQ + KNOW-15d / 15e / 15j).
- **held-out fixtures added:** 45 (one per conformance SCN) — every conformance REQ's held-out leg is now **AVAILABLE** (FULL assurance): 1 · 2 · 3a · 3b · 3c · 5a · 5b · 5c · 5d · 6a · 6b · 7a · 7b · 8a · 8b · 8c · 9a · 9b · 11a · 11b · 11c · 12a · 12b · 12c · 12d · 12e · 13a · 13b · 14a · 14b · 14c · 15d · 15e · 15j · 16a · 16b · 16c · 16d · 16e · 17a · 17b · 17c · 17d · 18a · 18b.
- **skipped — exhaustive (18):** KNOW-4 (4a/4b/4c/4d/4e/4f/4g) · KNOW-10 (10a/10b-1/10b-2) · KNOW-15 routing (15a/15b/15c/15f-1/15g/15h-1/15h-2/15i). A held-out leg is **moot** for an `exhaustive` SCN — the enumeration already covers every cell of the finite input space (universe A / universe B); there is nothing to hold out of a complete enumeration.
- **skipped — residue / DEFINE-parametric (1):** SCN-KNOW-15f-2 (move+edit θ) — **exempt + flagged**: no verification is invented for an unpinned threshold (method-tags-knw §Refuse-to-model; req-knw §NEEDS RECONCILIATION INV-KNOW-15). No held-out.
- **skipped — delegated acceptance:** none in KNW.
- **grounding check:** every `-2` reuses a grounded reference-model branch with different concrete data; **0** new behaviour introduced → **no [NEEDS RECONCILIATION]**.
- **spot-check (5 differ from fixture-1):** 1-2 (declared BROKEN⇒recomputed HOLDS vs declared HOLDS⇒NA) · 5a-2 (k=9/s=4/mech=5 vs k=5/s=2/mech=3) · 7a-2 (`payments/` vs `auth/`) · 11b-2 (scope D reads C vs B reads A) · 16a-2 (dependency-axis BROKEN vs structural HOLDS→NA path). All independent, none a rename-clone.

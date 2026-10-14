# Dedup & Identity — the grounded resolution model

> **Status:** FROZEN design-contract (owner-ratified 2026-07-20). Supersedes the reactive
> ADJACENCY-A/B (#66–#68) always-merge. Slices into WP-DEDUP-1/2 (Wave 1) + WP-DEDUP-3 (Wave 2, model-gated).

## Epitaph

**Identity is grounded, not textual. Definitional equality is exact and _merges_; everything softer
is a _relation_, never a merge — derived on read or promoted by ratification. Subsumption, not
record-linkage.**

## Axioms (inherited — non-negotiable)

- **A1** — No embeddings, no RAG. Every signal is deterministic and auditable.
- **A2** — A fact is truth only if grounded. Merging two distinct groundings **de-grounds one** → forbidden.
- **A3** — Prose is the weakest signal; it **never** decides identity. _(Already coded: `nodeKey` excludes the claim body.)_
- **A4** — Content-addressed; CAS history is never destroyed. The only byte-destructive op is exact-hash DEDUP.

## The evolution principle this rides (verified in-repo)

`docs/explanation/versioning.md:29` — _"the folded knowledge evolves by supersede-with-lineage.
History is never destroyed."_ The anti-append target is **parallel duplicate facts**
(`types.ts:162` — `nodeKey` collision forces UPDATE/union _instead of proliferating_), NOT relations.
A persisted directed typed node→node edge **already exists** (`CurrentNode.supersededBy`,
`router.ts:146,250`, serialized in the projection sidecar `store.ts:47`) — so a relation is the same
species, not a foreign body.

## The decision lattice (signal → disposition)

| #      | Signal (deterministic)                                       | Disposition                                | Destructive?              |
| ------ | ------------------------------------------------------------ | ------------------------------------------ | ------------------------- |
| **D0** | `contentHash` equal                                          | **DEDUP** — drop the new                   | byte-safe (identical)     |
| **D1** | `nodeKey` equal (`primaryAnchorId ‖ slot ‖ check`)           | **UPDATE / union** claim-sets (KNOW-4c)    | no (one node per nodeKey) |
| **R1** | `subsumes` (see DP-2 for the exact, disambiguated predicate) | **derived relation** (broader ⊃ narrower)  | **no — never merges**     |
| **H1** | same claim across **non-containment** groundings             | **`sameAs` candidate → ratification only** | no                        |
| —      | anything else                                                | two distinct grounded facts; keep both     | no                        |

`claim==` is the **check** for predicates and the **exact `claimNorm`** (NFC+trim, `claimSimilarity∈{0,1}`)
for advisories. No fuzzy τ. The `::`-path _is_ the sanctioned ancestry chain (`module::item::block`,
`primaryAnchorId` is pure — `router.ts:340`), so segment-prefix is real structural containment, not a
string hack. The near-synonym / cross-location residual is **indecidable without embeddings → routed
to human ratification** (A1-honest).

## The frozen decisions

- **DP-1 — un-merge.** The always-merge of ADJACENCY-B is **removed** from both call-sites
  (`upsert` router.ts:197-208, `writeDecision` router.ts:394-397). A routed CREATE at an adjacent
  anchor mints its **own** node (each keeps its own grounding — A2). `adjacencyNearDup`'s pure logic is
  **retained** and repurposed by DP-2. The `primaryAnchor`/`slot` carriers on `CurrentNode` stay.

- **DP-2 — `subsumes` is derived on read, never stored.** `primaryAnchorId` is pure and the inputs
  already live in the projection ⇒ `subsumes` is a total pure function
  `deriveSubsumes(projection): readonly Subsumes[]`. **Zero new persisted state.** The emitted relation is
  **explicitly named** to kill the positional-direction ambiguity:

  ```
  Subsumes = { broader: NodeKey; narrower: NodeKey }   // broader ⊃ narrower; broader's anchor is the ancestor
  ```

  A pair `(p, q)` of current nodes emits `{ broader: p, narrower: q }` **iff ALL hold** (post-suite-critic,
  frozen):
  1. **strict containment** — `seg(anchor(p))` is a **PROPER** prefix of `seg(anchor(q))`
     (`isPrefix ∧ len(p) < len(q)`). Fewer `::`-segments = the ancestor = **broader**. Equal anchors are
     **excluded** (they share a `nodeKey` ⇒ that is D1's union, not a subsumption — no `X ⊃ X`).
  2. **same slot** — `slot(p) === slot(q)`. _(The old matcher spanned ALL slots — a bug; fixed here.)_
  3. **same family** — both `advisory` or both `predicate`. Cross-family never subsumes (an advisory's
     `claimNorm` and a predicate's `check` are different value spaces — comparing them is undefined).
  4. **shared exact claim** — a `CurrentNode.claims` is a **set** of normalized claim strings (advisory
     `claimNorm`s / predicate `normalize(check)`s, unioned by D1). Fire iff the two sets **intersect**:
     `∃ c ∈ claims(p) ∩ claims(q)` under exact NFC+trim equality (`claimSimilarity === 1`). One shared
     claim at two granularities is the subsumption; the nodes need not have identical claim-sets. No fuzzy τ.

  **Full set, not transitive reduction** — every pair satisfying (1–4) is emitted (a 3-deep chain
  crate⊃mod⊃fn yields all three edges incl. crate⊃fn). Subsumption _is_ transitive; the pure "all valid
  pairs" definition is the simplest deterministic one. The old "NEAREST target" was a merge artifact and is
  dropped. **Ordering:** the result is sorted by `(broader, narrower)` `nodeKey` lexicographic ascending —
  total, self-pair-free, each pair once (direction is inherent, so no `(a,b)`+`(b,a)` duplication).

- **DP-3 — `sameAs` is the only new persisted state, and it is a governed human assertion.** _(BUILT —
  WP-DEDUP-3, `d290bd2`; owner un-deferred 2026-07-21.)_ A cross-location sameness a human asserts. Shipped
  shape: a SYMMETRIC `sameAs?: readonly string[]` carrier on `CurrentNode` (sorted/de-duped, both endpoints
  carry the peer — `write/link.ts` `linkSameAs`), written ONLY through the governed `atlas-link` door
  (`adapter-io/src/governed-link.ts`: distinct → both-known → KNOW-11 authz over every scope the merged
  CLASS spans → the class-tier-graded KNOW-8 ratifier, `billy` when any member is `T0`). `sameAs` links two
  **distinct** `nodeKey`s and is presented as a **read-fold** (`read/sameas.ts` `deriveSameAs`, union-find
  equivalence surfaced in the query envelope), never a second current-node — so the "one node per nodeKey"
  invariant is intact.
  **RETRACTION (A-D3, task #83):** a second ADDITIVE carrier `sameAsRetracted?: readonly string[]`, written
  through the SAME door in its `--retract` MODE (no sixth tool; `WRITE_PATHS` unchanged) and with the SAME
  gate ladder. It is an APPEND — the peer stays in `sameAs` — so the row records both the assertion and its
  withdrawal. `deriveSameAs` skips a withdrawn edge (recorded on EITHER endpoint, fail-closed) and the class
  splits; `sameAsClassOf`, which prices the door's gates rather than serving readers, stays deliberately
  retraction-blind so a retraction can never shrink a class below the authority needed to touch it.
  _(The earlier "v1 ratifier is a non-empty check, not the tier-graded T0→billy gate" note is SUPERSEDED —
  that deferral was closed by task #84; see ADR-0003 §Consequences.)_

- **DP-4 — resolution is at read, not write.** `subsumes` = coverage on read (never folds/deletes).
  Ratified `sameAs` = union-find equivalence-fold at the **knowledge** read layer over `StoreProjection`
  (NOT `@atlas/index` retrieval — that is below knowledge in the DAG and cannot see `nodeKey`). Memoizable
  by `subtreeHash`.

## What dies (negative space)

- ✝ **always-merge** — destructive, currently **live** in governed emit → replaced by DP-1 + DP-2.
- ✝ **string-prefix as the _only_ signal** — kept **only** gated by slot + exact claim, and only ever
  yielding a non-destructive relation.
- ✝ **SimHash / MinHash / blocking / any fuzzy tier** — foreign to grounding; the case it would catch is
  usually not a dup (it would de-ground). Never built.
- ✝ **stored `subsumes` edges** — derivable on read (DP-2); persisting them is redundant state.

## Acceptance surface (suite-critic, pre-slice)

**DP-1 goldens that MUST flip** (merge→two-nodes): the `upsert` fold + the 2-arg default-cfg case in the
ADJACENCY-B near-dup test; the `CREATE→UPDATE` door-2 case in the `writeDecision` test; the "one node, not
two" case in the write-governance e2e. Each flips to `CREATE` / `len == before+1` / **both** nodeKeys
present / the neighbor's claims unchanged.

**Vacuous tooth to correct** — `wp-5.13-b-know.anchor-identity.test.ts` SCN-KNOW-15h-1 asserts only
`nearDuplicateProbe(...) === true` while its prose claims "⇒ forced MERGE"; it never exercises routing, so
it stays green after DP-1 while its prose goes false. Correct the prose (the probe reports a collision; it
does **not** merge) — do not count it as a DP-1 tooth.

**DP-2 new goldens** (the old pure `adjacencyNearDup` cases take no slot arg and pin the OLD all-slot
behavior — they are NOT a flip; `deriveSubsumes` needs fresh cases): direction (`broader` = the ancestor /
shorter anchor), equal-anchor exclusion, self-pair absence, deterministic sort, cross-family non-subsumption,
and the full-set (transitive) 3-deep chain.

## Waves

- **Wave 1 (now):** WP-DEDUP-1 (un-merge) → WP-DEDUP-2 (subsumes derive-on-read). Sequential (same files).
  Kills the live debt + lands the structural relation. No frozen-model mutation.
- **Wave 2 (BUILT — owner un-deferred 2026-07-21, `d290bd2`):** WP-DEDUP-3 (`sameAs` symmetric edge on
  `CurrentNode` + governed `atlas-link` write door + union-find `deriveSameAs` read-fold + CLI/MCP surface).
  It covers the H1 case only — a human linking two facts at _unrelated_ code sites that mean the same thing
  (no structural signal can detect it). Deferred 2026-07-20 as the biggest lift for the rarest case (the
  common "same fact in many places" is already served by multi-citation `grounding.entries`); un-deferred
  and built when the owner elected to. It amends INV-TOOLS-1 to two governed write doors (ADR-0003) and is
  cold-reviewed clean (billy authz / bobby architecture / lucy correctness). Teeth: `s16-sameas.blackbox` +
  `wp-sameas.test`.
  Revisit only if a real need for machine-assisted cross-location linking appears; the insertion points
  are known (sidecar edge like `supersededBy`; the native `ratify.ts` billy gate; a knowledge-side
  union-find fold).

# ADR-0008 — mining writes to STAGING; it does not write knowledge

- **Status:** Accepted (2026-08-01) and **IMPLEMENTED on `governance-class-is-a-node-property`**, not
  deferred. Steps 1 and 2 of the Decision below are in the tree: `packages/adapter-io/src/store.ts` defines
  the staging sidecar door (`commitStaging`; the original `persistStaging`/`loadStaging` pair was superseded
  by it and DELETED in task #83 after a probe measured zero production callers — see step 1 below), and
  `packages/cli/src/mine.ts` uses staging exclusively — its header
  asserts, and a test pins, that `persistProjection` appears nowhere in the file.
  _(This header previously said implementation "is task #87 and is sequenced after the branch integrates".
  That was written before the work landed and was left stale — a false status claim inside a canonical
  decision record, found by a cold architectural review. A repo that ships a guard against exactly this
  class of overclaim must not carry one in its own ADRs.)_
- **Owner-authorized:** the owner granted the lead full ownership of this repo and direct responsibility for
  the SOTA bar, and has restated that no debt or loose end is acceptable. This ADR exists so #87 is a
  _decided, sequenced_ item rather than an open question — an open question is the debt.
- **Supersedes in part:** the partial remediation in `b415eab`, which stopped `mine` from MUTATING governed
  nodes and stamped its reserved scope onto the CAS BYTES. That was a containment, not the answer.
  _(CORRECTED 2026-08-02: this bullet previously said the remediation "stamped its ROWS with a reserved
  scope". It did not. `mine`'s `WriteRequest` omitted both governance halves, so every staged row recorded
  `scope: undefined` / `tier: undefined`, while `mine.ts` claimed the stamp made the bytes and the row
  agree. Only the bytes were stamped. Fixed in `8a78120`: the row now carries `MINED_SCOPE` and `T2` from
  constants — never forwarded from the gate's `f.tier`, so an injected gate cannot mint a staged row
  DECLARING `T0`. Recorded rather than quietly amended, because this is the SECOND false status claim found
  in this ADR, and the note above already says a repo shipping a guard against overclaim must not carry
  one.)_
- **Relates:** ADR-0007 (governance class is a property of the node), KNOW-8, GEN-4/12.

## Context

`atlas mine` is the cold-start explorer. It persists through `createDiskStore(<repo>/.atlas/cas)` and
`persistProjection` — **the same durable sidecar the governed emit door writes**. It passes no truth gate,
no KNOW-11 authz, and no KNOW-8 ratification. So the product has had two governed write doors and one
ungoverned one, into the same store.

Three separate defects came out of that single fact, and each fix exposed the next:

1. `mine` seeded its projection from `emptyStore()` and persisted unconditionally, so **every pass
   overwrote the durable projection with only what that pass mined** — silently dropping every previously
   emitted node. The CAS bytes survived; the index every read goes through did not.
2. Rehydrating fixed the destruction and immediately created a worse problem: with the real projection in
   hand, a mined claim whose minted `nodeKey` collided with a governed node routed as an `UPDATE` and
   **set-unioned an LLM-proposed claim into a billy-ratified `T0` node** — prompt-injectable through the
   content of a source file. Reproduced by a cold review.
3. `mine` wrote projection rows naming a `contentHash` it never `put`. Harmless until ADR-0007 made the
   doors refuse a node whose class they cannot read — at which point those rows became **permanently
   unwritable by anyone, billy included**.

Every one of these is a symptom of the same thing: _a candidate and a fact were being kept in one place._

## Decision

**Mining writes to a staging sidecar. It never writes the knowledge projection.**

KNOW-8 already says this in words — _"the explorer MAY write only CANDIDATES (staging); ratification is the
reconcile/lead's; the explorer never self-commits"_ — and `stage()` exists in
`packages/knowledge/src/ratify/ratify.ts`. What was missing is that staging had **nowhere to live**, so the
explorer wrote the only durable place there was.

Concretely:

1. `DiskStore` gains a staging door over a sidecar distinct from `projection.json`. Same shape, different
   file — staging is a projection of _candidates_, not of facts.
   _(As shipped this was `persistStaging`/`loadStaging`. Both were replaced by the atomic `commitStaging`
   and then DELETED in task #83: the unconditional persist was last-writer-wins by definition — measured at
   8 processes × 5 sites, 40 candidates reported committed and 5 durable — and a probe showed neither had a
   production caller left. `commitStaging` is now the only staging door, which `mine-projection-surface.test.ts`
   pins mechanically against the live `DiskStore` surface. The ADR's decision is unchanged; only the member
   names are.)_
2. `buildControllerDeps` in `packages/cli/src/mine.ts` targets staging. Its rehydrate, its `store.put`, and
   its put-before-persist ordering all stay; only the destination changes.
3. A candidate is promoted into knowledge **only** by passing a governed door, like anything else.

## Consequences

- **#87 closes structurally, not by a guard.** `mine` cannot mutate governed knowledge because it cannot
  reach it. The collision-skip and the reserved `atlas:mined` scope added in `b415eab` become belt-and-braces
  rather than the load-bearing defence; the skip stays (it is still correct within staging), and the scope
  stays as provenance.
- **`atlas query` stops serving mined candidates.** That is the point, and it is a behaviour change worth
  stating plainly: an unratified LLM proposal was never supposed to be readable as shared grounded truth.
  Today this is invisible in practice — `mine` abstains by design with no proposer wired (WP-F6) — but it
  would have become visible the moment a model was.
- **No new governed tool, so `GOVERNANCE_SURFACE` stays 5.** INV-TOOLS-1 / ADR-0003 untouched. Staging is a
  storage location, not a surface.
- **The pass report is the read path for now.** `GenesisReport` already returns the seeded set to the
  caller, which is how a human sees what was mined. A curator door that promotes staged candidates in bulk
  is NOT part of this decision and is not needed until a proposer is wired; when it is needed it is an
  ordinary use of the existing emit door, not new surface.
  _(BUILT since, as WP-PROMOTE, and this clause is exactly what it was built to: `atlas promote` publishes
  through `createGovernedEmit` — the same leg `atlas-emit` binds — so `GOVERNANCE_SURFACE` stayed 5 and
  `WRITE_PATHS` stayed `{atlas-emit, atlas-link}`. One thing this decision could not foresee: because a mined
  candidate is `T2` ∧ advisory ∧ grounded, "an ordinary use of the emit door" would have AUTO-ACCEPTED under
  the KNOW-18 fast path and never consulted the ratifier. The promotion leg therefore supplies a
  door-derived `origin:'promoted'` that removes the fast path — the door is ordinary, the ratification
  context is not.)_

## Alternatives rejected

- **Keep one store and gate `mine` with the full governed door.** Rejected: `mine` has no actor and no
  ratifier by construction — it is a batch process, not a seat. Threading a synthetic actor through it
  would invent an authority that does not exist, which is the confused-deputy shape ADR-0007 just removed.
- **Leave the `b415eab` containment as the answer.** Rejected: it defends the boundary with a check
  (`if (established.has(key)) continue`) instead of removing the boundary crossing. Every defect above got
  through a place where a check was thought sufficient.

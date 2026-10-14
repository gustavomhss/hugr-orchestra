# #99a — RELATION fact: frozen build contract

**Status:** FROZEN (lead pre-work). Lands the D2 leg of [ADR-0015](../adr/ADR-0015-grounding-tokens-are-typed-by-fact-shape.md)
(owner-ratified 2026-08-09). This document is the anchor the build fleet transcribes; it decides the SHAPE,
the IDENTITY, the DOOR TRAVERSAL, the ROUTING, and the READ SURFACE. No new soundness theory — the freshness
oracle is reused verbatim.

> Search-before-freeze done (2026-08-10, branch `feat/relation-fact-99a` off `28af788`). The surfaces below
> were read, not assumed; each cited at `file:line`. The one hard problem (endpoint identity under move+rename)
> is D2+D4's shared residue and is **explicitly deferred to #99c** (its rename engine was scoped to `hugit-diff`,
> discontinued/on hold 2026-08-10 — now TBD) — a pure edit is handled here, a move+rename is out of #99a scope and
> named as such.

## 0. The crux this contract exists to resolve

A relation spans TWO structural units, and they generally live in **different files**. The shipped identity
path refuses exactly that shape, on purpose:

- `nodeKey(node) = hash(primaryAnchorId(node) ‖ slot [‖ check])` (knowledge/src/write/router.ts:338).
- `primaryAnchorId → deepestCommonUnit(paths)` = the segment-wise longest common `::` prefix
  (router.ts:208, :322). Two symbols in two files share NO prefix ⇒ common unit is `''` ⇒
  **`DegenerateAnchorError` is thrown** (router.ts:326). This is the #103 security fix (an empty anchor is a
  wildcard that collides every cross-file fact onto one address). It is CORRECT for an intrinsic fact and must
  stay.

Therefore a relation **cannot reuse `nodeKey`/`primaryAnchorId`**. It needs its own identity that is
collision-free over an ORDERED PAIR of endpoints, and its own door-traversal that never calls the intrinsic
anchor path. That is the entire new mechanism. Everything else (freshness, gates, CAS) is reused.

## 1. The RelationNode shape (knowledge/src/types.ts)

`GroundedFact` becomes a THREE-variant union. The discriminant stays `kind`.

```ts
export type GroundedFact = AdvisoryNode | PredicateNode | RelationNode

/** The closed relation vocabulary (NORMATIVE, additive-only — a new kind is a `cv` bump, exactly like
 *  PredicateSlot). Directed: `endpointA <kind> endpointB` reads left-to-right. Seeded minimal + honest —
 *  only kinds Atlas can GROUND from index state today. `depends-on`/`calls` are the frontier's high-value
 *  facts (ADR-0015 §Honesty). NOT reusing index `EdgeKind` ('resolved'|'unresolved'|'dynamic') — that is
 *  edge-RESOLUTION status, not relation SEMANTICS; ADR-0015's "reuse EdgeKind" is corrected here to "reuse
 *  the index dependency AXIS as the drift/witness source", not its status enum. */
export type RelationKind =
  | "depends-on" // A's unit references/imports B's unit (the dependency axis edge, grounded)
  | "calls" // A's body calls B (a resolved call edge)

export interface RelationNode {
  readonly kind: "relation"
  readonly id: NodeKey // = relationKey (see §2); minted, never trusted from payload
  readonly tier: Tier
  readonly relationKind: RelationKind
  readonly endpointA: string // location-free unitKey — the qualifiedPath of A's anchor (identity leg)
  readonly endpointB: string // location-free unitKey — the qualifiedPath of B's anchor (identity leg)
  readonly grounding: Grounding // EXACTLY two entries: entry[0] anchors A, entry[1] anchors B (freshness)
  readonly freshness: KnowledgeFreshness
  readonly claims: readonly ClaimEntry[]
  readonly authoring: "RELATED" | "SUPERSEDED" // mirrors advisory/predicate authoring literal
  readonly scope?: string // KNOW-11a — the write scope (authz)
  readonly obviousness?: ObviousnessScore // ADR-0012 — additive, absent-tolerant
}
```

**Why `endpointA/B` as separate fields AND in grounding:** the fields are the IDENTITY legs (location-free,
Kythe/SCIP lesson — survive a pure edit). The grounding entries are the FRESHNESS legs (subtreeHash-bearing,
drift on edit). This is the identity/freshness split ADR-0015 mandates, made concrete: `endpointA` is the
qualifiedPath; `grounding.entries[i].anchor.subtreeHash` is the content hash of that same unit. A pure edit
changes the hash (relation DRIFTS) but not the qualifiedPath (relation keeps its identity — no false orphan).

## 2. Identity — `relationKey` (knowledge/src/write/router.ts, additive)

A NEW pure function, sibling to `nodeKey`, that does NOT go through `deepestCommonUnit`:

```ts
/** The relation identity leg. `relationKey(A, kind, B) = hash(canonicalForm({a, k, b}))` — the ORDERED
 *  endpoint pair + kind. Directed: (A,depends-on,B) ≠ (B,depends-on,A). Collision-free by construction —
 *  the preimage names both endpoints, never their (empty) common ancestor, so #103's wildcard cannot arise.
 *  Minted through the SEALED kernel seam (canonicalForm ‖ defaultEncoder.hash ‖ asNodeKey) — no raw hashing.
 *  TOTAL over unknown: a missing/empty endpoint or an off-vocabulary kind yields the refusal, never a throw
 *  of raw TypeError out of a door. */
export function relationKey(a: string, kind: RelationKind, b: string): NodeKey
```

- Refuses (throws a NAMED `MalformedRelationError`, converted to a fail-closed verdict by the door, mirroring
  `DegenerateAnchorError`) iff: `a`/`b` not a non-empty string, `a === b` (no self-relation in v1), or `kind`
  not in the closed `RELATION_KINDS` runtime list (mirror `isKnownSlot`/`PREDICATE_SLOTS`, router.ts:166).
- Endpoints are NOT sorted — direction is meaningful. `(A,calls,B)` and `(B,calls,A)` are distinct nodes.

## 3. Family & routing (knowledge/src/write/router.ts + upsert.ts)

A relation is a THIRD `NodeFamily`. Routing semantics:

- `NodeFamily = 'advisory' | 'predicate' | 'relation'`.
- `routeWrite`: for family `'relation'` — a `contentHashHit` ⇒ DEDUP (byte-identical, idempotent); a
  `relationKey` miss ⇒ CREATE; a hit ⇒ **UPDATE** (claim set-union in place, same as advisory — re-evidencing
  an existing relation appends the new claim/provenance, git keeps the prior). A relation is NEVER SUPERSEDE:
  it has no `check`, so there is no check-identity to diverge. Keep the existing advisory UPDATE path.
- `familyOf` (adapter-io/src/governed-emit.ts:159): extend — `node.kind === 'relation'` ⇒ `'relation'`
  (a relation carries no `check`; a relation WITH a check is malformed → refuse).

## 4. Door traversal (adapter-io/src/governed-emit.ts)

The relation enters the SAME 16-gate governed door, with exactly TWO gates re-routed and the rest unchanged:

| gate            | for advisory/predicate                    | for relation                                                                                                                                                                       |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 WELL-FORMED   | tier·scope·family                         | + `relationKind ∈ RELATION_KINDS`, `endpointA/B` non-empty, `A≠B`                                                                                                                  |
| 0.5 ADDRESSABLE | `id(node)` CAS-nameable                   | unchanged (whole node bytes)                                                                                                                                                       |
| 1 TRUTH DOOR    | `gateHolds` re-derives grounding FRESH    | unchanged — **grounding has 2 entries, `driftDetect` AND-folds both** (drift.ts:98). Drift-if-either is free.                                                                      |
| 2 AUTHZ         | `actorInScope(scope)`                     | unchanged                                                                                                                                                                          |
| 2.1 ANCHOR      | `scopeOwnsAnchor(scope, primaryAnchor)`   | **re-routed**: a relation has no single primary anchor. Bind scope against `endpointA` (the SUBJECT of the directed fact). `primaryAnchorId` is NOT called (would throw). See §4a. |
| 2.25 INCUMBENT  | 4 target-derived gates keyed on `nodeKey` | keyed on `relationKey`; the four incumbent gates apply verbatim (scope authority, corroboration, no-relocation, no-downgrade)                                                      |
| 2.5 RATIFY      | `route(candidate, ctx)`                   | unchanged — a relation is advisory-family for ratification (grounded ∧ lowRisk ∧ T2 ∧ ¬contested auto-accepts; T0 relation needs the token)                                        |
| 3 UPSERT+PUT    | `upsert(WriteRequest)` + `store.put`      | `WriteRequest.nodeKey = relationKey`, `family='relation'`; put the whole RelationNode into CAS                                                                                     |

**§4a — the anchor-binding decision (2.1) is the one genuinely new governance call.** A directed relation's
"owning" scope is the SUBJECT's scope (`endpointA`). Rationale: "src/payments/charge depends-on lodash" is a
fact ABOUT charge; whoever owns `src/payments` owns the assertion. Binding on `endpointB` would let anyone who
owns a widely-depended-on util author relations landing in every dependent's scope. Fail-closed: if
`endpointA` is not owned by any declared anchor prefix, the ARCH-9 narrowing stands aside exactly as today
(undeclared prefix = no gate), unchanged from the intrinsic path.

## 5. Read surface (retrieval + cli + mcp)

Grounded relation facts are queryable BIDIRECTIONALLY and are DISTINCT from the index-derived `relate()`
(retrieval/src/relate.ts — that reads index edges, not grounded facts).

- New read fold `relationsOf(unitKey, direction)` over the projection's relation nodes: `direction='out'`
  returns relations where `endpointA === unitKey`; `'in'` where `endpointB === unitKey`; `'both'` = union.
  Pure, deterministic, total (miss ⇒ empty). **Shipped as specified.**

> **AMENDED to the SHIPPED surface (honest-close, 2026-08-10).** The two bullets below were FROZEN as a
> `--relations` FLAG on `atlas query` and a `relations` FIELD on the `atlas-query` MCP result. What shipped
> (PR #128) is a SEPARATE command / SEPARATE tool, deliberately, and this doc is corrected to match — a
> committed contract that describes a surface the code does not expose is itself a drift. The divergence was a
> sound build-time decision, recorded here rather than silently left:

- CLI: a SEPARATE `atlas relations <unit> [out|in|both]` command (`packages/cli/src/cli.ts:241`, registered in
  the `COMMANDS`/parse vocab), NOT a `--relations` flag on `query`. It renders the grounded relation set with
  freshness. Rationale: a grounded-relation read is a distinct verb from the intrinsic-fact `query` pack, and a
  separate command keeps each door's argument surface and output shape single-purpose.
- MCP: a SEPARATE `atlas-relations` read tool (`packages/mcp-server/src/server.ts:87` `RELATIONS_TOOL`), served
  DIRECTLY from the injected relation leg through the SHARED verdict builder (CLI≡MCP bytes), NOT a field added
  to `atlas-query`. It is advertised through a narrow parallel path that leaves `GOVERNANCE_SURFACE`
  byte-for-byte closed at FIVE (server.ts) — the read tool opens no governed token, so production advertises SIX
  advertised tools while the governed surface stays five. Its input schema is DOCUMENTED (`unit` required
  nodeKey), honoring #193's no-undocumented-field rule. **#99b (§5 of the negation contract) inherits this exact
  separate-command / separate-tool shape deliberately, for consistency.**

**Bidirectional index (perf, D2's "promote reverse-closure"):** a relation node is indexed by BOTH endpoints
on write so `relationsOf` is O(k) not O(repo). Carry `endpointA`/`endpointB` onto the projection row (additive
`CurrentNode` fields, mirror the `sameAs`/`primaryAnchor` carriers, upsert.ts). NO separate persistent index
file in v1 — derive-on-read over the current map, same as `deriveSubsumes`/`deriveSameAs`.

## 6. WP decomposition (the wave)

DAG: **R1 (contract core) → { R2 door, R3 read } in parallel → R4 e2e/goldens**. R1 is the freeze; R2/R3 are
disjoint by owner-file once R1 lands.

| WP     | owner-files (disjoint)                                                                                      | depends-on | DoD                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1** | knowledge/src/types.ts, knowledge/src/write/router.ts, knowledge/src/write/upsert.ts                        | —          | `RelationNode` in union; `RelationKind`+`RELATION_KINDS`; `relationKey`+`MalformedRelationError`; `NodeFamily` widened; `routeWrite` relation cell; every exhaustive `.kind`/family switch in @atlas/knowledge handles 'relation'; unit tests: relationKey collision-free over cross-file pair, directed asymmetry, refusal on self/off-vocab; `npm test -w @atlas/knowledge` green; typecheck green |
| **R2** | adapter-io/src/governed-emit.ts (+ -reasons, +policy binding), adapter-io tests                             | R1         | `familyOf` handles relation; door routes relation via `relationKey`, 2.1 binds on `endpointA`, `primaryAnchorId` never called on a relation; the 16 gates provably apply (mutation-scoped tests per re-routed gate); a 2-file relation EMITS (the crux — proves #103 throw is bypassed); an off-vocab/self relation REJECTS fail-closed; `npm test -w @atlas/adapter-io` green                       |
| **R3** | retrieval/src/relate.ts (or new relations.ts), retrieval/types.ts, cli/src/cli.ts, mcp-server/src/server.ts | R1         | `relationsOf(unit,dir)` fold; CLI `--relations` render; MCP `relations` field + schema doc; total (miss⇒empty); unit tests both directions                                                                                                                                                                                                                                                           |
| **R4** | test/e2e blackbox story (new sNN)                                                                           | R1,R2,R3   | subprocess story: emit `(A,depends-on,B)` cross-file → query out from A finds it, in from B finds it → edit A's unit → relation reads DRIFTED → edit back → FRESH. Proves identity survives edit (freshness split)                                                                                                                                                                                   |

## 7. Blast-radius / ratification (GAP-2 rite)

- ADR-0015 amends GROUND-1 ("the oracle is `subtreeHash`" → "…for a positive-intrinsic fact"). Owner ratified
  D1–D4 (2026-08-09). This contract is the D2 mechanization; no NEW invariant amendment beyond what the ADR
  already carries. The relation freshness IS GROUND-1/5 unchanged (2-entry AND-fold) — that is the point.
- The `GroundedFact` union widening ripples to every exhaustive `.kind` switch repo-wide. R1's DoD requires an
  audit of those switches (grep `.kind ===`, `case 'advisory'`, exhaustiveness `never` checks) so none silently
  mis-handles a relation. This is the real integration risk and is a NAMED R1 deliverable, not an afterthought.
- Gates (layer-guard, godfile ≤400 LOC, spec-conformance, id-integrity) run on every WP; governed-emit.ts is
  already near the LOC ceiling (#140 noted 399/400) — R2 MUST extract to a sibling module, not grow the file.
- Cold review (lucy) + T0-door review (billy, the door touches authz/identity) before merge. One-fix-round.

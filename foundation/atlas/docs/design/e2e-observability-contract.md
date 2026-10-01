# E2E Observability — close the emit→query→subsumes loop through the user surface

> **Status:** FROZEN design-contract (owner-ratified 2026-07-20, red→green). Drives the wave that makes the
> product work end-to-end AND the user-simulating E2E suite that proves it. Motivated by a pre-build cold
> critic that found 3 real wiring gaps: `deriveSubsumes` unwired (zero callers), CLI drops `verdict.data`,
> `atlas query` never reads back emitted facts (`index-adapter.ts:76` hardcodes `invariants:[]`).

## Confirmed facts (verified in-code)

- `store.get(h): CasObject | undefined` exists (`adapter-io/src/store.ts:86`) — the full `GroundedFact` is
  readable from CAS by `contentHash` ("the CAS bytes ARE the fact"; governed-emit `put`s the whole node).
- `CurrentNode` (`knowledge/src/write/router.ts:143`) carries `{nodeKey, family, contentHash, claims[],
primaryAnchor?, slot?}` — NO `tier`/`freshness`. Those live on the full fact → read via `store.get`.
- `currentNodes(rehydrateProjection(store))` is the projection readback (doctor-source uses it,
  `doctor-source.ts:73`). `deriveSubsumes(projection)` (`knowledge/src/read/subsumes.ts:60`) is pure.
- `Pack`/`PackInvariant` are FROZEN contracts (`contracts/src/pack.ts:20,32`); do NOT mutate them.

## The three seams (frozen)

### Seam-1 — projection readback (closes GAP-C: emit→query)

New composition decorator `createProjectionQueryIndex(structural: QueryIndex, store: DiskStore): QueryIndex`
(new file `adapter-io/src/projection-query-index.ts`). `cover(scope)`:

1. delegate to `structural.cover(scope)` for `{territory, axisHash}` — territory resolution STAYS in the pure
   `@atlas/index` adapter (SCN-5b spy invariant preserved; index-adapter is NOT modified).
2. `const proj = rehydrateProjection(store)`; for each `node ∈ currentNodes(proj)` whose `primaryAnchor` is
   under the covering `scope` (segment-wise: the anchor's file-path portion has `scope` as a `::`/`/`-segment
   prefix — reuse the anchor-path prefix logic; a node with no `primaryAnchor` is skipped), read the full
   fact `f = store.get(node.contentHash)`; map → `PackInvariant { nodeId: node.nodeKey, tier: f.tier,
claim: node.claims join('; ') }`.
3. sort invariants by `nodeId` ascending (deterministic); `stale = ∃ node under scope with `f.freshness ===
   'DRIFTED'`. Return `{territory, axisHash, invariants, stale}`.
`createQuery`already applies the`tier≥T1` bound (`query.ts:62`) — no change there.
compose.ts injects `createProjectionQueryIndex(indexAdapter, store)` where it currently injects the raw
   index-adapter into the query leg.

### Seam-2 — CLI renders `verdict.data` (closes GAP-B)

Extend `renderVerdict` (`cli/src/render.ts`) to append a DETERMINISTIC `data:` block AFTER the
status/next/invariant lines when `v.ok && v.data` is a known shape (pure — no clock/nonce/paths):

- Pack → one line per invariant `  inv <tier> <nodeId>: <claim>` (already sorted by Seam-1) + `  stale: <bool>`.
- query envelope subsumes (Seam-3) → `  subsumes <broader> ⊃ <narrower>` sorted.
- emit id → `  id: <hash>`; init territories → `  territory: <name>` sorted.
  Unknown/absent data → no data block (back-compat: existing status/next/invariant output unchanged). Keep
  byte-identical determinism (CLI-3c). MCP already serializes `data` (`server.ts:68`) — untouched.

### Seam-3 — subsumes wired into the query result (closes GAP-A)

The query handler leg's `Verdict.data` becomes `{ pack: Pack, subsumes: readonly Subsumes[] }` (a
handler-level envelope widening — NOT a `contracts` change). The query composition computes
`deriveSubsumes(proj)` filtered to nodes under the covering scope, sorted (already deterministic from
DEDUP-2). Rendered by Seam-2. This is the FIRST production call site of `deriveSubsumes` — the DP-4
"resolution at read" the dedup contract promised.

## What must NOT change

- `@atlas/index` index-adapter stays pure delegation (readback is a composition layer over it).
- Frozen `Pack`/`PackInvariant`/kernel contracts — untouched (subsumes rides the handler `data` envelope).
- Governed write path (D0/D1, authz, fail-closed) — untouched.
- Determinism: every rendered byte is a pure function of the verdict (CLI-3c) — no clock/paths in `data:`.

## Acceptance (the E2E stories prove each seam end-to-end, black-box)

S1 emit→`query` shows the fact (Seam-1+2) · S3 dedup D0/D1 one-node + module/function TWO-nodes + `subsumes`
visible (Seam-1+2+3) · S2 fail-closed unchanged · S4 drift/reconcile · S5 CLI≡MCP verdict parity. See the
story manifest. A seam that doesn't close is a RED story fixed at root, never asserted-around.

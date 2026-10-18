// @atlas/knowledge — src/read/negations.ts  (ADR-0015 D3 / #99b — the grounded-negation + abstention read folds)
//
// The read surface of the honesty core. Two pure, total derive-on-read folds over the ONE store projection,
// mirroring `relations.ts` (#99a) exactly — a negation READ is a distinct verb from a query, the same way
// `atlas relations` is distinct from `atlas query` (owner-ratified separate-command shape, §5).
//
// `negationsOf` reads the GROUNDED negatives — `family:'negation'` rows the truth door admitted — off the
// projection's `current` map. A grounded negation is a `GroundedFact`, so it lands in `current` via `upsert`
// like any fact (frozen seam, upsert.ts StoreProjection header): NOTHING new is stored for it. Its identity
// legs (`relationKind`, `target`, `scope`) ride the EXISTING frozen carriers — `relationKind` on the relation
// carrier, `target` on the `endpointB` carrier (X is the callee/OBJECT of the negated `?→X` relation, the
// quantified-away subject is `endpointA`, absent), `scope` on the governance carrier (§4 gate 2.1: the
// negation's declared scope IS its authz scope). So a negation reads back by a FIELD read, not a re-derivation.
//
// `abstentionsOf` reads the honest ABSTENTIONS — `AbstainedRecord`s the door filed when it was ASKED a
// negative it could not soundly decide — off the projection's `abstained` ledger (the N2↔N3 seam frozen on
// `StoreProjection.abstained`). An abstention asserts NOTHING about the world, so it is NOT a fact and never
// enters `current`; it lives in its own map. This fold is the #202 close: an abstention that FIRED is
// OBSERVABLE — a human can SEE the door declined to decide, and why (`reason` + `witness`), instead of the
// silent 0/300 the finding recorded.
//
// SCOPE CONTAINMENT (#153 lesson — string containment is NOT containment): the optional `scope` filter keeps
// only rows whose own `scope` is UNDER the queried scope, decided by the segment-wise structural-prefix test
// `isPrefix` (anchor-match.ts) — the SAME primitive the read side already scopes on and the one adapter-io's
// `underScope` is itself built to mirror. So scope `src` covers a negation scoped `src/payments` and scope
// `sr` does NOT (a raw `startsWith` would wrongly match). Reused, not reinvented, and kept in-layer (the fold
// lives in @atlas/knowledge, which cannot reach adapter-io's `underScope`).

import type { StoreProjection } from "../write/router.js"
import type { CurrentNode } from "../write/upsert.js"
import type { KnowledgeFreshness } from "../types.js"
import type { AbstainedRecord } from "../negation-types.js"
import { isPrefix } from "./anchor-match.js"

/** One grounded NEGATIVE the truth door admitted. `nodeKey` is the negation's identity (`negationKey`, the
 *  row's key); `relationKind`/`target`/`scope` are the identity legs stamped on the row's frozen carriers.
 *
 *  `freshness` (N4, billy F1/F3 — WIRED) is the per-negation structural verdict, resolved through the injected
 *  `freshnessOf` recompute the ADAPTER supplies (it holds the built `Axes` + the CAS bytes this pure fold
 *  cannot reach). It is the §3 FOUR-clause verdict: `driftDetect(grounding, axes) === FRESH ∧ edgeModel ===
 *  currentEdgeModel`. The `edgeModel` conjunct is the ONE completeness clause `driftDetect` cannot see — an
 *  extractor upgrade changes no file bytes, so a negation admitted under edge-model E1 must read DRIFTED once
 *  the current edge model is E2. A re-opened/stale scope drifts the directory subtreeHash and reads DRIFTED too
 *  (billy F3's observability). ABSENT the recompute (the bare fold / a pre-wiring caller) ⇒ `DRIFTED`,
 *  fail-closed — never "always fresh". */
export interface GroundedNegation {
  readonly nodeKey: string
  readonly relationKind: string
  readonly target: string // the GLOBAL symbol X the negative is ABOUT (¬∃ · →X) — the endpointB carrier
  readonly scope: string //  the CLOSED scope S the witness ranges over — the governance carrier
  readonly freshness: KnowledgeFreshness // §3 4-clause verdict (driftDetect ∧ edgeModel), resolved by the adapter
}

/** Lexicographic string comparator — total, no locale (the one the sibling read folds sort by). */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

/** Is `rowScope` UNDER `queryScope` — a SEGMENT-WISE path-prefix test (`/`-split), the #153-safe containment
 *  the read side scopes on (`isPrefix`, anchor-match.ts; adapter-io `underScope` mirrors the same discipline).
 *  `src` covers `src/payments`; `sr` does not cover `src`. Equal scopes are contained (a prefix of itself). */
function scopeCovers(queryScope: string, rowScope: string): boolean {
  return isPrefix(queryScope.split("/"), rowScope.split("/"))
}

/**
 * The grounded NEGATIVES the truth door admitted, optionally filtered to those whose scope is UNDER `scope`.
 * Pure + total (RETR-9 shape, mirroring `relationsOf`): an absent/empty `scope` returns EVERY negation
 * (no filter), a `family:'negation'` row whose identity carriers are somehow not all strings is SKIPPED
 * rather than throwing (the projection is untrusted input, the stance `sameas.ts`/`relations.ts` take), and
 * an empty projection yields `[]`. Deterministic: sorted by `(scope, relationKind, target, nodeKey)`, so
 * equal input is byte-identical output.
 *
 * `freshnessOf` (N4) is the per-negation §3 recompute, injected by the ADAPTER because it needs the built
 * `Axes` + the CAS bytes a pure knowledge fold cannot reach (`driftDetect(grounding, axes) === FRESH ∧
 * edgeModel === currentEdgeModel`, negation-source.ts). ABSENT ⇒ every row reads `DRIFTED`, fail-closed —
 * exactly the discipline `resolveFreshness` (pack-shape.ts) applies for the bare-WIRE query path, never a
 * silent "always fresh".
 */
export function negationsOf(
  projection: StoreProjection,
  scope?: string,
  freshnessOf?: (node: CurrentNode) => KnowledgeFreshness,
): readonly GroundedNegation[] {
  const filter = typeof scope === "string" && scope.length > 0 ? scope : undefined
  const out: GroundedNegation[] = []
  for (const node of projection.current.values()) {
    if (node.family !== "negation") continue
    const k = node.relationKind
    const target = node.endpointB
    const s = node.scope
    if (typeof k !== "string" || typeof target !== "string" || typeof s !== "string") continue // malformed ⇒ skip
    if (filter !== undefined && !scopeCovers(filter, s)) continue
    const freshness = freshnessOf?.(node) ?? "DRIFTED" // fail-closed: no recompute ⇒ never asserted FRESH
    out.push({ nodeKey: node.nodeKey, relationKind: k, target, scope: s, freshness })
  }
  return out.sort(
    (x, y) =>
      cmp(x.scope, y.scope) ||
      cmp(x.relationKind, y.relationKind) ||
      cmp(x.target, y.target) ||
      cmp(x.nodeKey, y.nodeKey),
  )
}

/**
 * The honest ABSTENTIONS the door filed, optionally filtered to those whose scope is UNDER `scope`. Pure +
 * total: an ABSENT `abstained` ledger (a projection minted before the field, or one with no abstentions)
 * yields `[]`, never a throw; an absent/empty `scope` returns EVERY abstention. Deterministic: sorted by
 * `(scope, relationKind, target, reason, id)`.
 *
 * THIS IS THE #202 OBSERVABILITY LEG. The record it returns carries WHY the door could not decide (`reason`)
 * and the evidence that opened the scope (`witness.underApproxSources`), so an abstention that fired is
 * readable end to end — the exact thing "abstention NEVER fired, 0/300" said no one could see.
 */
export function abstentionsOf(projection: StoreProjection, scope?: string): readonly AbstainedRecord[] {
  const ledger = projection.abstained
  if (ledger === undefined) return [] // absent map ⇒ no abstentions (back-compat), never a throw
  const filter = typeof scope === "string" && scope.length > 0 ? scope : undefined
  const out: AbstainedRecord[] = []
  for (const rec of ledger.values()) {
    if (filter !== undefined && !scopeCovers(filter, rec.scope)) continue
    out.push(rec)
  }
  return out.sort(
    (x, y) =>
      cmp(x.scope, y.scope) ||
      cmp(x.relationKind, y.relationKind) ||
      cmp(x.target, y.target) ||
      cmp(x.reason, y.reason) ||
      cmp(x.id, y.id),
  )
}

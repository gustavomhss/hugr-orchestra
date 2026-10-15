// @atlas/tools — src/reconcile.ts   (WP-4.12-a.TOOLS — TOOLS-8, spec A-3/A-4)
//
// `atlas-reconcile` — the merge-gate drift classifier + the frozen `ReconcileApi` / `ReconcileOptions`. It
// partitions the DRIFTED subset via the @atlas-knowledge KNOW-5 split (CONSUMED, never redefined) into a
// reviewable `DriftItem[]`; exits `2` ONLY on semantic drift, `reauthorCount == |semantic|`. Persists NOTHING.

import type { Hash, StructRef } from "@atlas/contracts"
import type { DriftedFact, GroundedFact, ReconcileApi as Know5Classifier } from "@atlas/knowledge"
import type { DriftItem, ReconcileOut } from "./types.js"

/** Reconcile options (atlas-tools:128). `acceptReground` = the `--accept-reground` flag: auto-re-ground
 *  the `mechanical` subset in one pass (TOOLS-13). Absent ⇒ classify-and-report only (TOOLS-8). */
export interface ReconcileOptions {
  readonly acceptReground?: boolean
}

export interface ReconcileApi {
  /** Classify drift at `mergeBase` via the KNOW-5 split; exit-gate `exitCode = |semantic|>0 ? 2 : 0`,
   *  `reauthorCount == |semantic|` (TOOLS-8). Under `{acceptReground:true}`, auto-re-ground the
   *  `mechanical` subset in one pass (`regroundedCount == |mechanical|`), never touching `semantic`
   *  (TOOLS-13). Pure + total (method-tags-tls:72).
   *
   *  [FLAG — `mergeBase` = `Hash`] atlas-tools:127 names `atlas-reconcile <mergeBase>`; the merge-base sha
   *  is transcribed as `Hash` (mirrors @atlas/persist `diff` typing a commit sha as `Hash`). */
  reconcile(mergeBase: Hash, options?: ReconcileOptions): ReconcileOut
}

/**
 * One drifted fact paired with its old + new grounding anchors (the GROUND drift-detection surface, an
 * injected seam / build-ahead). `drifted` ({fact, newSha}) is fed to the KNOW-5 classifier verbatim;
 * `anchorWas`/`anchorNow` are the moved `StructRef` anchors composed into the reviewable `DriftItem`.
 * Anchor RESOLUTION is owned by GROUND — this facet only presents what it is handed.
 */
export interface DriftPair {
  readonly drifted: DriftedFact
  readonly anchorWas: StructRef
  readonly anchorNow: StructRef
}

/** The DRIFT-detection seam (GROUND): the drifted set at a merge base, each with its old/new anchor. */
export interface DriftSource {
  driftAt(mergeBase: Hash): readonly DriftPair[]
}

/** A fact's reviewable name — its create/update identity leg (`NodeKey`), surfaced as a bare string. */
const factName = (f: GroundedFact): string => f.id

/**
 * Build `atlas-reconcile` over an injected DRIFT-detection seam + the KNOW-5 classifier port. The returned
 * `reconcile` conforms EXACTLY to the frozen `ReconcileApi.reconcile(mergeBase, options?)` signature. Pure
 * + total: no clock, no IO, no throw, and no write — a read-only classification.
 */
export function createReconcile(
  drift: DriftSource,
  classifier: Know5Classifier,
): { readonly reconcile: ReconcileApi["reconcile"] } {
  const reconcile = (mergeBase: Hash, options?: ReconcileOptions): ReconcileOut => {
    const pairs = drift.driftAt(mergeBase)

    // KNOW-5 split — CONSUMED, never redefined (owned by WP-4.12-a.KNOW). The classifier decides
    // `mechanical` (claim re-derives at the new @sha) vs `semantic` (BROKEN); this facet only presents it.
    const split = classifier.reconcile(pairs.map((p) => p.drifted))
    const semanticIds = new Set(split.semantic.map(factName))

    // The reviewable set — input order preserved, one `DriftItem` per drifted fact, NEVER all-or-nothing.
    const driftItems: DriftItem[] = pairs.map((p) => {
      const name = factName(p.drifted.fact)
      return {
        fact: name,
        class: semanticIds.has(name) ? "semantic" : "mechanical",
        anchorWas: p.anchorWas,
        anchorNow: p.anchorNow,
      }
    })

    const semantic = split.semantic.map(factName)
    const mechanical = split.mechanical.map(factName)

    // Exit-code / re-author surface OWNED here (TOOLS-8): derived from the classified `semantic` subset.
    // exit 2 ONLY on semantic (never a silent green); re-author == |semantic| (never the whole store, A-4).
    const reauthorCount = semantic.length
    const exitCode = semantic.length > 0 ? 2 : 0

    // TOOLS-13 `--accept-reground`: the MECHANICAL subset (anchor moved but the claim STILL re-derives at
    // HEAD) is the auto-re-groundable set. Under `{acceptReground:true}`, `regroundedCount == |mechanical|`
    // — the count of drifted facts ACCEPTED for one-pass re-grounding (frozen `ReconcileOut`). SEMANTIC drift
    // is NEVER counted (that would launder a BROKEN claim past the exit-2 block, which stays `2` above).
    // Absent/`false` ⇒ `0` — report-only, behaviour UNCHANGED. This read/advisory seam COUNTS + SURFACES the
    // regroundable set (`mechanical`); it opens NO write door of its own. The actual re-ground WRITE is applied
    // DOWNSTREAM through the SINGLE governed door — @atlas/adapter-io `regroundTemplate` swaps the primary
    // anchor to `anchorNow` + resets freshness FRESH, then funnels the template through `atlas-emit` (the
    // doctor-source seam / EPIC-12-b). Reconcile therefore reports what WILL be re-grounded, never a phantom write.
    const regroundedCount = options?.acceptReground ? mechanical.length : 0

    return { drift: driftItems, mechanical, semantic, regroundedCount, reauthorCount, exitCode }
  }
  return { reconcile }
}

// differential-vs-oracle (compile-time): the impl's `reconcile` conforms to the co-located frozen
// `ReconcileApi.reconcile` signature. TOOLS-13's auto-re-ground is a DISTINCT, out-of-facet req.
const _reconcileConforms: ReconcileApi["reconcile"] = createReconcile(
  { driftAt: () => [] },
  { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) },
).reconcile
void _reconcileConforms

// @atlas/adapter-io — src/read-access.ts  (TRAVEL-BY-REPROOF: the READ-side answer to a tracked store)
//
// `store-provenance.ts` classifies WHICH population a repo's durable store is in (`StoreProvenance`);
// `reverify-store.ts` re-proves a `seal:'proven'` fact's own witness against the LIVE index. This module is
// the seam between them: it decides, ONCE per composed runtime, what every READ leg (`atlas query`,
// `atlas node`, `atlas doctor`, `atlas relations`, `atlas negations`, `atlas own`) is ALLOWED to see.
//
//   `trusted`           — the pre-existing `store` (write-gated, unchanged) IS the read store. No new cost:
//                          no raw re-read, no reverify pass. This is every existing repo.
//   `tracked-staging`    — a `refusal` string, and every read leg must refuse BEFORE touching the store.
//                          Unchanged in kind from the blanket refusal this module narrows for the OTHER
//                          tracked population — staging carries no replayable witness by ADR-0008
//                          construction, so there is nothing here to re-prove.
//   `tracked-provable`   — the durable store IS served, filtered to the facts whose OWN witness replays
//                          `re-proven` against the live oracle (`reverifyStore`, not re-implemented here —
//                          this module calls it once and applies the resulting Set-membership, which is the
//                          whole of what a filter is allowed to be: no second oracle, no second replay).
//
// ── WHY A RAW SECOND STORE, NOT THE GATED ONE, FOR `tracked-provable` ──────────────────────────────────────
// `store.loadProjection()` (the gated instance every write door also holds) BLANKS to `undefined` whenever
// its own `trusted()` seam reads `false` — and for `tracked-provable`, `trusted()` MUST stay `false` (writes
// to a tracked store still refuse, unchanged; see `store-provenance.ts`'s header). So the ONLY way to read
// the rows worth re-proving is a store built WITHOUT the trust seam at all — `createDiskStore(casPath,
// headSha)`, the exact "absent ⇒ never consulted ⇒ pre-existing behaviour" shape `store.ts` already
// documents for a non-git tree. `store.get` (the CAS leg) was NEVER trust-gated to begin with (only the
// mutable sidecar read/write is) — so re-proving needs no raw variant for content reads, only for the
// projection index.
//
// ── FAIL-CLOSED, NOT FALL BACK ────────────────────────────────────────────────────────────────────────────
// If the raw projection cannot be read, or the reverify pass throws, `tracked-provable` degrades to a
// `refusal` — NEVER to serving the gated (empty) store as though that were an honest "no knowledge yet", and
// NEVER to serving the raw, unfiltered rows. A store this module cannot verify is a store it does not serve.

import type { Hash } from "@atlas/contracts"
import type { CurrentNode, GroundedFact } from "@atlas/knowledge"
import { currentNodes } from "@atlas/knowledge"
import { REJECTED_UNTRUSTED_STORE } from "./read-provenance.js"
import { danglingRow, reverifyFact } from "./reverify-store.js"
import type { DocExists, ReverifyReport, ScopeHasDocs, TestVacuityReplay } from "./reverify-store.js"
import type { CasPath, DiskStore } from "./store.js"
import { createDiskStore, rehydrateProjection } from "./store.js"
import type { StoreProvenance } from "./store-provenance.js"
import type { VerifyFactLeg } from "./verify-fact-source.js"

/** What every READ leg gets to see, decided once. `refusal`, when present, is the WHOLE story — the caller
 *  must refuse before it ever calls a method on `store`. `store` is always populated (never `undefined`)
 *  so a caller cannot forget the check and read the gated instance by accident: even in the refusal case
 *  `store` is the harmless, already-gated original — reading it directly answers honestly-empty, never the
 *  forged rows, but the discipline is: check `refusal` FIRST. */
export interface ReadAccess {
  readonly store: DiskStore
  readonly refusal: string | undefined
  /** The re-verification pass that decided the filter, ONLY for `tracked-provable` — surfaced so a caller
   *  can render the ADVISORY MESSAGE (how many of how many facts are being served) without re-running the
   *  oracle a second time. `undefined` for `trusted` (never run — the whole point of paying no new cost) and
   *  for `tracked-staging`/the fail-closed leg (nothing to report; the refusal already says why). */
  readonly reverified: ReverifyReport | undefined
}

/** The one legible sentence a `tracked-provable` store's user needs, given the pass that decided the filter.
 *  Names the fraction served AND why the rest is missing, in the product's own voice — never left for the
 *  reader to infer from a row count that quietly shrank. */
export function trackedProvableAdvisory(report: ReverifyReport): string {
  const total = report.sealedProven
  const served = report.reProven
  return (
    `tracked-provable-store: '.atlas/projection*.json' and/or '.atlas/cas/' are TRACKED BY GIT, so this store ` +
    `arrived by COMMIT rather than through a door — but it is being served, because trust here comes from ` +
    `RE-PROVING each fact's own witness against the live index, not from who committed it. ${served} of ` +
    `${total} sealed 'proven' fact(s) replayed re-proven and are served; ${report.broken} no longer re-prove ` +
    `(the code moved under them) and ${report.unverifiable} carry no witness to replay (advisory prose has ` +
    `nothing here to re-check) — both are DROPPED, not served. A fact with no 'proven' seal at all is not in ` +
    `this pass either way: only witnessed, re-proven claims survive a commit. Run \`atlas verify-store\` for ` +
    `the full row-by-row report.`
  )
}

/** Build the (possibly raw) store + witnessed re-proof for `tracked-provable`. `undefined` iff re-verification
 *  could not run at all (raw store unreadable, oracle threw) — the fail-closed leg the caller turns into a
 *  refusal, never a fallback to unfiltered rows.
 *
 * ── WHY THIS JOINS BY ARRAY POSITION, NOT BY `ReverifyRow.nodeKey` ──────────────────────────────────────
 * MEASURED against the real `.atlas/` store this repo mines onto itself: `GroundedFact.id` (what
 * `reverifyFact` reports as `ReverifyRow.nodeKey` — a human-readable LABEL, not a join key; see that
 * module's own `[FLAG]` on `AdvisoryNode.id`) is the mined fact's `primaryAnchor` PATH, e.g.
 * `"packages/knowledge/src/types.ts"` — NOT the routing `CurrentNode.nodeKey` HASH the `current` Map is
 * actually keyed by (KNOW-15: `nodeKey = hash(primaryAnchorId ‖ predicateSlot)`). Filtering `proj.current`
 * by `Set<string>` built from `row.nodeKey` therefore matched NOTHING on real data (0 rows served, a silent
 * over-refusal caught only by driving this against the real mined store — the synthetic fixtures happened
 * to set `fact.id === CurrentNode.nodeKey` by hand and never exercised the mismatch). The fix: call
 * `reverifyFact` (the SAME oracle-replay `reverifyStore` folds over — not re-implemented, reused per-row)
 * paired with its OWN originating `CurrentNode` by ARRAY POSITION, and take the SET MEMBERSHIP off the
 * `CurrentNode`'s real `nodeKey`/`contentHash`, never off the fact's self-reported `id`. */
function buildProvable(
  casPath: CasPath,
  headSha: () => string | undefined,
  gatedStore: DiskStore,
  verifyFactLeg: VerifyFactLeg,
  docExists: DocExists,
  scopeHasDocs: ScopeHasDocs,
  replay: TestVacuityReplay | undefined,
): { readonly store: DiskStore; readonly report: ReverifyReport } | undefined {
  try {
    // NO trust seam ⇒ never consulted ⇒ reads the raw file regardless of git status (`store.ts`'s own
    // documented "absent" behaviour) — the one place this module deliberately steps around the write-gate,
    // for READS only; `gatedStore` (still trust-gated) is what every WRITE continues to ride, unchanged.
    const raw = createDiskStore(casPath, headSha)
    const rawCurrent = currentNodes(rehydrateProjection(raw))
    // PAIRED, not two independently-filtered arrays — a node whose CAS bytes are missing (a miss ⇒
    // `undefined`) drops from BOTH `rows`/`reProven*` together, never leaving the two lists silently
    // misaligned the way two separate `.filter()` calls over the same source could.
    const pairs: { readonly node: CurrentNode; readonly fact: GroundedFact }[] = []
    // A `seal:'proven'` node whose bytes are GONE is collected, not discarded. This path and
    // `reverifyStore`'s both used to drop it silently, and on a store with 17 such rows `atlas verify-store`
    // printed "0 sealed-proven fact(s) — nothing to re-verify (an honest zero, not a skip)". The seal is on
    // the projection row, so no bytes are needed to know the row should have been counted.
    const dangling: CurrentNode[] = []
    for (const node of rawCurrent) {
      const fact = raw.get(node.contentHash as Hash) as GroundedFact | undefined
      if (fact !== undefined) pairs.push({ node, fact })
      else if ((node as { readonly seal?: string }).seal === "proven") dangling.push(node)
    }
    // `replay` threaded so a `seal:'proven'` test-vacuity RE-PROVES against HEAD here (over the ONE shared
    // `testUnitsOf(rawTree, axes)` feed compose built before `buildReadAccess`) instead of falling to
    // `unverifiable` for want of a re-scan leg — the over-refusal (#249) this closes. Fail-safe either way
    // (a still-vacuous fact was DROPPED, never served stale-as-fresh); this stops dropping the honest ones.
    const rows = pairs.map((p) => reverifyFact(p.node, p.fact, verifyFactLeg, docExists, scopeHasDocs, replay))
    const sealedProven = rows.filter((r): r is NonNullable<typeof r> => r !== undefined)
    // The dangling rows are appended to the REPORT only — never to `rows`, whose index must stay aligned with
    // `pairs` for the re-proven bookkeeping below.
    const reportRows = [...sealedProven, ...dangling.map(danglingRow)]
    const report: ReverifyReport = {
      sealedProven: reportRows.length,
      reProven: sealedProven.filter((r) => r.outcome === "re-proven").length,
      broken: sealedProven.filter((r) => r.outcome === "broken").length,
      unverifiable: sealedProven.filter((r) => r.outcome === "unverifiable").length,
      dangling: dangling.length,
      rows: reportRows,
    }
    const reProvenNodeKeys = new Set<string>()
    const reProvenContentHashes = new Set<Hash>()
    for (let i = 0; i < pairs.length; i++) {
      if (rows[i]?.outcome === "re-proven") {
        reProvenNodeKeys.add(pairs[i]!.node.nodeKey)
        reProvenContentHashes.add(pairs[i]!.node.contentHash as Hash)
      }
    }
    const filtered: DiskStore = {
      ...gatedStore, // writes still refuse via the properly gated store if ever invoked (defence in depth)
      get: (h: Hash) => (reProvenContentHashes.has(h) ? raw.get(h) : undefined),
      loadProjection: () => {
        const proj = raw.loadProjection()
        if (proj === undefined) return undefined
        const current = new Map([...proj.current].filter(([k]) => reProvenNodeKeys.has(k)))
        return { ...proj, current }
      },
    }
    return { store: filtered, report }
  } catch {
    return undefined // fail-closed: the caller refuses rather than serving raw or gated-empty rows
  }
}

/**
 * The ONE place `StoreProvenance` becomes a `ReadAccess` — every read leg in `compose.ts` (doctor, own,
 * relations, negations) and `wire.ts` (query, node) is built from THIS result, never from `provenance()`
 * directly, so the three-way decision and its filter live in exactly one place.
 */
export function buildReadAccess(opts: {
  readonly provenance: () => StoreProvenance
  readonly casPath: CasPath
  readonly headSha: () => string | undefined
  readonly gatedStore: DiskStore
  readonly verifyFactLeg: VerifyFactLeg
  readonly docExists: DocExists
  readonly scopeHasDocs: ScopeHasDocs
  /** The Wave-3 test-vacuity reverify replay (the ONE shared `testUnitsOf` feed's leg), threaded so a proven
   *  test-vacuity RE-PROVES during the `tracked-provable` serve filter rather than dropping to `unverifiable`
   *  (over-refusal, #249). `undefined` degrades to the pre-Wave-3 behaviour (test-vacuities `unverifiable`,
   *  dropped) — fail-safe, never a false re-prove. Consumed ONLY on the `tracked-provable` leg. */
  readonly replay?: TestVacuityReplay
}): ReadAccess {
  const kind = opts.provenance()
  if (kind === "trusted") {
    // CASE 1 — no new cost: the gated store IS the read store, no raw re-read, no reverify pass.
    return { store: opts.gatedStore, refusal: undefined, reverified: undefined }
  }
  if (kind === "tracked-staging") {
    // CASE 3 — flat refusal, unchanged in kind: staging carries no replayable witness by construction.
    return { store: opts.gatedStore, refusal: REJECTED_UNTRUSTED_STORE, reverified: undefined }
  }
  // CASE 2 — tracked-provable: served, filtered to what re-proves; fail-closed if re-verification cannot run.
  const built = buildProvable(
    opts.casPath,
    opts.headSha,
    opts.gatedStore,
    opts.verifyFactLeg,
    opts.docExists,
    opts.scopeHasDocs,
    opts.replay,
  )
  if (built === undefined) {
    return { store: opts.gatedStore, refusal: REJECTED_UNTRUSTED_STORE, reverified: undefined }
  }
  return { store: built.store, refusal: undefined, reverified: built.report }
}

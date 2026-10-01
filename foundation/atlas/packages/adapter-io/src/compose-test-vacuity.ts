// @atlas/adapter-io — src/compose-test-vacuity.ts  (the #95 D5 test-vacuity leg TRIPLE, split from the composition root)
//
// The composition-root construction of the THREE test-vacuity legs `composeRuntime` (compose.ts) rides — split
// to its own file at the LOC ceiling (godfile-guard), the SAME discipline `test-vacuity-source.ts` itself was
// split out of the ring under. It is here, not inlined, because all three legs must share ONE HEAD units feed:
//   - `testVacuities` — the READ leg off the durable store (`atlas test-vacuities <unit>`), read-only;
//   - `testVacuity`   — the reachable PRODUCER (`atlas test-vacuity <path>`) that walks HEAD's `*.test.ts`/
//                       `*.spec.ts` units, runs `scanTestVacuity`, and routes every proven fact THROUGH the
//                       governed emit door (KNOW-11 authz + ARCH-9 anchor + the HEAD truth gate);
//   - `replay`        — the Wave-3 REVERIFY leg `reverifyTestVacuity` (reverify-store.ts) calls to re-prove a
//                       committed `seal:'proven'` test-vacuity against HEAD (`atlas verify-store`).
//
// WHY THEY SHARE ONE FEED: `testUnitsOf(rawTree, axes)` is the ONE HEAD-view of the repo's test units. The
// producer proves over it and the replay re-proves over it, so building both from the SAME thunk means the
// write-side proof and the read-side re-proof can never diverge in WHICH units (or which bytes) they scanned —
// exactly the "second copy of one question, free to diverge" failure class this repo keeps closing (#186/N10).
// Pure + total over its deps (the walk + build already happened upstream); the only effect is the producer's /
// replay's WASM parse, disposed on every path inside `test-vacuity-source.ts`.

import type { Hash } from "@atlas/contracts"
import type { Axes, FileTree } from "@atlas/index"
import {
  createTestVacuityLeg,
  createTestVacuityProducer,
  buildTestVacuityReplay,
  testUnitsOf,
  type TestUnit,
  type TestVacuityEmit,
  type TestVacuityLeg,
  type TestVacuityProducer,
} from "./test-vacuity-source.js"
import type { TestVacuityReplay } from "./reverify-store.js"
import type { DiskStore } from "./store.js"

// Re-export the leg types so the composition root imports the whole test-vacuity surface from ONE place (its
// `ComposedRuntime` interface names `TestVacuityLeg`/`TestVacuityProducer`), keeping compose.ts's import list flat.
export type { TestVacuityLeg, TestVacuityProducer } from "./test-vacuity-source.js"

/** The ONE shared HEAD units feed the whole test-vacuity surface rides — `units` is the single
 *  `testUnitsOf(rawTree, axes)` thunk, and `replay` the reverify leg derived FROM it. Built ONCE at the
 *  composition root (compose.ts) BEFORE `buildReadAccess`, because the replay closure needs only `rawTree` +
 *  `axes` (never `readAccess.store`) — so the `tracked-provable` serve path (`buildProvable` → `reverifyFact`)
 *  and the producer/read-side legs re-prove over the SAME units. One feed shared by producer + BOTH replay
 *  call-sites (the serve filter AND `atlas verify-store`) is the whole point (#186/N10 — never a second copy
 *  of one question, free to diverge). */
export interface TestVacuityFeed {
  /** The single HEAD units thunk — `() => testUnitsOf(rawTree, axes)`. */
  readonly units: () => readonly TestUnit[]
  /** The reverify replay derived from `units` — the ONE re-scan every re-proof (serve filter + verify-store) rides. */
  readonly replay: TestVacuityReplay
}

/** Build the ONE shared feed from HEAD's `rawTree` + `axes` — callable BEFORE `buildReadAccess`, so its
 *  `replay` can be threaded into the `tracked-provable` serve path (which re-proves test-vacuities during the
 *  read filter), and the store-dependent legs below reuse the SAME thunk rather than rebuilding a second one. */
export function buildTestVacuityFeed(rawTree: FileTree, axes: Axes): TestVacuityFeed {
  const units = () => testUnitsOf(rawTree, axes)
  return { units, replay: buildTestVacuityReplay(units) }
}

/** The three composition-root test-vacuity legs, built from ONE shared HEAD units feed (see the file header). */
export interface TestVacuityLegs {
  /** `atlas test-vacuities <unit>` — the read leg off the durable store the query leg reads. */
  readonly testVacuities: TestVacuityLeg
  /** `atlas test-vacuity <path>` — the reachable HEAD producer, routing through the governed emit door. */
  readonly testVacuity: TestVacuityProducer
  /** `atlas verify-store` — the reverify replay `reverifyTestVacuity` re-proves a proven fact against HEAD with. */
  readonly replay: TestVacuityReplay
}

/**
 * Build all THREE test-vacuity legs from the composition root's primitives — the ALREADY-BUILT shared `feed`
 * (the ONE `testUnitsOf(rawTree, axes)` thunk + its `replay`, built earlier so `buildReadAccess` could thread
 * the replay into the `tracked-provable` serve), `store` (the read/reverify store, `readAccess.store`), the
 * governed `emit` door, and the anchor rev `at` the producer stamps writes at. The producer runs over
 * `feed.units` and the read-side re-proof rides `feed.replay` — the SAME units the serve filter already
 * re-proved over, so write-side proof and read-side re-proof can never diverge in WHICH units they scanned
 * (see the file header + `TestVacuityFeed` on why that matters).
 */
export function buildTestVacuityLegs(
  feed: TestVacuityFeed,
  store: DiskStore,
  emit: TestVacuityEmit,
  at: Hash,
): TestVacuityLegs {
  return {
    testVacuities: createTestVacuityLeg(store),
    testVacuity: createTestVacuityProducer(feed.units, emit, at),
    replay: feed.replay,
  }
}

// @atlas/cli — test/mine-projection-surface.test.ts  (ADR-0008 — the trap must cover the WHOLE surface)
//
// `mine-fixtures.ts`'s `projectionTrap` IS the mechanical proof of ADR-0008: every mine suite runs on a fake
// store whose knowledge-projection doors THROW, so a driver that ever names one fails the suite loudly
// instead of quietly reaching governed knowledge. A trap is only worth what it covers, and it covered two of
// the three projection doors — `commitProjection` (the door `governed-emit.ts` and `governed-link.ts`
// actually write through) was not trapped. Nothing calls it from `mine` today; that is precisely the
// condition under which a guarantee's own test rots unnoticed.
//
// This suite pins the trap's coverage against a MECHANICALLY ENUMERATED surface rather than an eyeballed
// list. The enumeration is asserted, not assumed: `PROJECTION_DOORS` below is checked against the live
// `DiskStore` a real `createDiskStore` produces, so a projection door ADDED to the store in the future makes
// this file go red rather than silently escaping the trap.

import { describe, it, expect } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore, rehydrateProjection } from "@atlas/adapter-io"
import type { DiskStore } from "@atlas/adapter-io"
import { fakeStore, stagingFake, projectionTrap } from "./mine-fixtures.js"

/**
 * THE PROJECTION SURFACE — every `DiskStore` member that reads or writes the GOVERNED projection.
 *
 * Enumerated from `packages/adapter-io/src/store.ts`'s `DiskStore` interface (which extends the kernel
 * `StoreApi`), partitioned by which sidecar family each member touches:
 *   · projection — `loadProjection`, `persistProjection`, `commitProjection`   ⇒ MUST be trapped
 *   · staging    — `commitStaging`                                             ⇒ MUST work (mine's own door)
 *   · CAS        — `put`, `get`                                                ⇒ shared, content-addressed
 * The staging family is DOWN TO ONE MEMBER as of task #83: `loadStaging`/`persistStaging` were measured to
 * have zero production callers and deleted, so there is now exactly one way to touch candidates. This test
 * is what makes that claim mechanical rather than asserted — it compares the lists below against the LIVE
 * `Object.keys` of a real store, so re-adding a door without listing it fails here.
 * There is no fourth family. The composed entry point `rehydrateProjection(store)` is a projection READ, but
 * it is not a store member: it CALLS `store.loadProjection()`, so the trap covers it transitively — asserted
 * below rather than reasoned about.
 */
const PROJECTION_DOORS = ["loadProjection", "persistProjection", "commitProjection"] as const
const STAGING_DOORS = ["commitStaging"] as const
const CAS_DOORS = ["put", "get"] as const

/** A call shaped for any of the doors: a decision function that also reads as a projection argument is not
 *  possible, so each door is invoked with the argument ITS signature takes. */
function invoke(store: DiskStore, door: string): unknown {
  if (door === "commitProjection" || door === "commitStaging") {
    return (store as unknown as Record<string, (d: unknown) => unknown>)[door]!(() => ({ out: 0 }))
  }
  if (door === "persistProjection") {
    return (store as unknown as Record<string, (p: unknown) => unknown>)[door]!({ current: new Map(), cas: new Set() })
  }
  return (store as unknown as Record<string, () => unknown>)[door]!()
}

describe("ADR-0008 — the fixture trap covers the WHOLE governed-projection surface", () => {
  it("the enumerated surface IS the live `DiskStore` surface (a new door cannot escape this list)", () => {
    const root = mkdtempSync(join(tmpdir(), "atlas-surface-"))
    try {
      const real = createDiskStore(join(root, ".atlas", "cas"))
      const live = Object.keys(real).sort()
      // MECHANICAL, not eyeballed: every member of the real store is accounted for in exactly one family.
      expect(live).toEqual([...PROJECTION_DOORS, ...STAGING_DOORS, ...CAS_DOORS].sort())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // RED at 55d826a for `commitProjection`: `projectionTrap` defines only `persistProjection`/`loadProjection`,
  // so the member is absent from the fake and `typeof` is `'undefined'`.
  for (const door of PROJECTION_DOORS) {
    it(`\`${door}\` is a trap in every mine fixture store`, () => {
      for (const [name, store] of [
        ["fakeStore", fakeStore()],
        ["stagingFake", stagingFake().store],
      ] as const) {
        expect(typeof (store as unknown as Record<string, unknown>)[door], `${name}.${door}`).toBe("function")
        // ASSERTED ON THE TRAP'S OWN DISCRIMINANT, never on "it threw": a MISSING member also throws (a
        // `TypeError`), and a test satisfied by that is exactly the vacuous assertion this repo keeps
        // catching. `ADR-0008` appears in no other refusal text in this package.
        expect(() => invoke(store, door), `${name}.${door}`).toThrowError(/ADR-0008/)
      }
    })
  }

  for (const door of STAGING_DOORS) {
    it(`\`${door}\` is NOT trapped — staging is where mine is SUPPOSED to write`, () => {
      // The other half of the guarantee, and the half a trap-everything fixture would destroy: if staging
      // were trapped too, "mine never reaches the projection" would be proven by a driver that writes
      // nowhere at all.
      expect(() => invoke(stagingFake().store, door)).not.toThrow()
    })
  }

  it("`rehydrateProjection` is covered TRANSITIVELY — it composes over the trapped `loadProjection`", () => {
    // The one projection entry point that is not a store member. It needs no trap of its own, and this case
    // is what turns that from an assumption into a measurement.
    expect(() => rehydrateProjection(fakeStore())).toThrowError(/ADR-0008/)
  })

  it("the trap object itself exports exactly the projection doors (no silent partial spread)", () => {
    // `projectionTrap` is SPREAD into each fake. If it ever loses a key, the fake silently gets a hole
    // instead of a trap — the failure mode this whole suite exists to make loud.
    expect(Object.keys(projectionTrap).sort()).toEqual([...PROJECTION_DOORS].sort())
  })
})

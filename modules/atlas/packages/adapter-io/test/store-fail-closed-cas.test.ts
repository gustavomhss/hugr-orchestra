// @atlas/adapter-io — test/store-fail-closed-cas.test.ts
//
// DOES THE SHIPPED STORE REFUSE A ROW WHOSE VALUE CANNOT BE CANONICALIZED?
//
// `@atlas/tools` `guard.ts` (`createGuard`/`createGovernedStore`/`admitOnWrite`/`admitOnRead`) pins that law
// rigorously and has ZERO production callers — every caller in the repo is a test. It is a REFERENCE MODEL.
// The durable write door the CLI actually uses is `adapter-io/src/store.ts`, and NOTHING proved the SHIPPED
// door held the same law. This suite MEASURES it over the CAS half of that door (`DiskStore.put`), with the
// same eight shapes the reference model covers, against a REAL temp-dir store — no double anywhere.
//
// Three questions per shape, all three answered from the FILESYSTEM rather than from the return value alone:
//   1. Is it REFUSED?            — nothing may land under the CAS root.
//   2. Is the refusal LEGIBLE?   — `put` answers with the EMPTY sentinel (`asHash('')`), compared for
//                                  EQUALITY. Not a throw, not a plausible-looking hash, not a partial write.
//   3. If ADMITTED, what is on disk and can it be read back? — an uncanonicalizable row that LANDS and then
//                                  cannot be re-read is a bricked store, strictly worse than a refusal. The
//                                  admitted-control below shows the same door DOES round-trip a legal object,
//                                  so "nothing landed" is a refusal and not a store that simply cannot write.
//
// THE VOCABULARY DIFFERS FROM THE REFERENCE MODEL AND THAT IS THE POINT OF WRITING IT DOWN. `admitOnWrite`
// answers `{admitted:false, rejected:'append-only/permission: …'}` — a discriminant. `put` answers with a
// SENTINEL. Both fail closed; only one can say why. The reference model also gates on a CALLER-SUPPLIED key
// (`key === id(value)`), which the shipped CAS structurally cannot have: `put(obj)` MINTS the key (KERNEL-2a),
// so the forged-key half of the reference model has no shipped counterpart to hold.

import { describe, it, expect, afterEach } from "vitest"
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDiskStore } from "../src/store.js"
import type { CasObject } from "@atlas/kernel"
import { SHAPES, assertPremise } from "./uncanonicalizable-shapes.js"

/** The EMPTY sentinel `store.ts` returns for a malformed put (`asHash('')` — kernel/store.ts:26). A CAS key
 *  is 64 lowercase hex, so this value can never collide with a real address. Compared for EQUALITY. */
const EMPTY = ""

const roots: string[] = []
afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

/** A live disk store over a fresh temp CAS root; `casPath` is what every on-disk assertion walks. */
function freshStore(): { casPath: string; store: ReturnType<typeof createDiskStore> } {
  const root = mkdtempSync(join(tmpdir(), "atlas-failclosed-cas-"))
  roots.push(root)
  const casPath = join(root, "cas")
  return { casPath, store: createDiskStore(casPath) }
}

/** Every VALUE FILE under the sharded CAS root (`<cas>/<h[0:2]>/<h>`) — the only evidence that counts for
 *  "did anything land". Reads the directory rather than trusting the return value. */
function casObjects(casPath: string): string[] {
  if (!existsSync(casPath)) return []
  return readdirSync(casPath, { recursive: true, encoding: "utf8" }).filter((f) => f.includes("/"))
}

describe("the SHIPPED CAS write door — DiskStore.put over the eight canonical-form violations", () => {
  it("PREMISE: all eight shapes are ones the sealed `id` genuinely refuses (never a tautology)", () => {
    assertPremise()
  })

  // The ADMITTED control. Without it, every "nothing landed" below is equally consistent with a store that
  // cannot write at all, and the whole table would be vacuous in the same way the NFC case nearly was.
  it("CONTROL: a canonicalizable object IS admitted, lands as exactly one value file, and reads back", () => {
    const { casPath, store } = freshStore()
    const legal: CasObject = { k: "x", v: 1 }
    const h = store.put(legal)
    expect(h).not.toBe(EMPTY)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(casObjects(casPath)).toHaveLength(1)
    expect(store.get(h)).toStrictEqual(legal)
  })

  for (const shape of SHAPES) {
    describe(`shape: ${shape.name}`, () => {
      it("Q1 REFUSED — nothing lands under the CAS root, and the call does not throw", () => {
        const { casPath, store } = freshStore()
        const before = casObjects(casPath).length
        expect(() => store.put(shape.build())).not.toThrow()
        expect(casObjects(casPath)).toHaveLength(before)
      })

      it("Q2 LEGIBLE — the answer is the EMPTY sentinel, by EQUALITY, never a plausible address", () => {
        const { store } = freshStore()
        const h = store.put(shape.build())
        expect(h).toBe(EMPTY)
        // the sharper half: it is not merely falsy, it is not SHAPED like an address, so no caller can
        // mistake it for one and no later read can resolve it by accident.
        expect(h).not.toMatch(/^[0-9a-f]{64}$/)
      })

      it("Q3 NOT ADMITTED — the returned handle resolves to nothing, so there is no bricked row", () => {
        const { casPath, store } = freshStore()
        const h = store.put(shape.build())
        expect(store.get(h)).toBeUndefined()
        // and the refusal did not disturb a store that already held a legal object.
        const legal: CasObject = { k: "y", v: 2 }
        const good = store.put(legal)
        expect(store.get(good)).toStrictEqual(legal)
        expect(casObjects(casPath)).toHaveLength(1) // ONLY the legal object
      })

      it("the violation riding in as ONE EXTRA PROPERTY on an otherwise legal record is refused too", () => {
        const { casPath, store } = freshStore()
        const carrier = shape.inject({ kind: "advisory", claimNorm: "a claim" }) as CasObject
        expect(store.put(carrier)).toBe(EMPTY)
        expect(casObjects(casPath)).toHaveLength(0)
      })
    })
  }
})

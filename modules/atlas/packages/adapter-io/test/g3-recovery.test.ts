// @atlas/adapter-io — test/g3-recovery.test.ts
//
// G3 durable activation and recovery acceptance. The contract is frozen in
// modules/atlas/docs/design/genesis-g3-recovery-contract.md. Each case drives a real
// temp-dir createDiskStore. No store mock, no second store, no migration API.

import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { emptyStore } from "@atlas/knowledge"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import { readSidecarSet } from "../src/sidecar.js"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import { IdentitySchemaError } from "../src/identity-schema.js"

let tmp: string | undefined
afterEach(() => {
  if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

/** CAS root. The projection sidecar lives beside it, in `dirname(cas)`. */
function freshCas(): string {
  tmp = mkdtempSync(join(tmpdir(), "atlas-g3-"))
  return join(tmp, "cas")
}

const row = (key: string): [string, CurrentNode] => [
  key,
  { nodeKey: key, family: "advisory", contentHash: "a".repeat(64), claims: [`claim ${key}`] },
]
const withRow = (p: StoreProjection, key: string): StoreProjection => ({
  current: new Map([...p.current, row(key)]),
  cas: new Set(p.cas),
})

function projectionNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name === "projection.json" || /^projection\.\d+\.json$/.test(name))
    .sort()
}

function projectionBytes(dir: string): Map<string, string> {
  return new Map(projectionNames(dir).map((name) => [name, readFileSync(join(dir, name), "utf8")]))
}

describe("G3 durable activation and recovery", () => {
  it("G3-01 resume-reuses-completed-work", () => {
    const cas = freshCas()
    const dir = dirname(cas)
    const first = createDiskStore(cas)
    const settled = first.commitProjection((p) => ({ out: "completed", next: withRow(p, "completed-work") }))
    expect(settled).toEqual({ settled: true, out: "completed" })
    const completed = first.loadProjection()
    expect(completed?.current.has("completed-work")).toBe(true)

    const resumed = createDiskStore(cas)
    expect(resumed.loadProjection()).toEqual(completed)

    const before = projectionBytes(dir)
    let sawCompleted = false
    const again = resumed.commitProjection((projection) => {
      sawCompleted = projection.current.has("completed-work")
      return { out: "reused" }
    })
    expect(sawCompleted).toBe(true)
    expect(again).toEqual({ settled: true, out: "reused" })
    expect(projectionBytes(dir)).toEqual(before)

    expect(createDiskStore(cas).loadProjection()).toEqual(completed)
  })

  it("G3-02 concurrent-reader-sees-a-whole-generation", () => {
    const cas = freshCas()
    const dir = dirname(cas)
    const writer = createDiskStore(cas)
    const settled = writer.commitProjection((p) => ({ out: "published", next: withRow(p, "whole") }))
    expect(settled).toEqual({ settled: true, out: "published" })
    const complete = writer.loadProjection()
    expect(complete?.current.has("whole")).toBe(true)

    // A second store, after the commit, sees the whole settled generation.
    expect(createDiskStore(cas).loadProjection()).toEqual(complete)

    // Torn-write mechanism already bitten — not duplicated:
    // sidecar.test.ts:245-258 truncates the head generation (slice 0,40) and the reader
    // falls back to the previous complete projection, not emptyStore.
    // sidecar.test.ts:261-272 truncates every sidecar file and the WRITE refuses `unreadable`.
    // Neither asserts that a reopened READ of a truncated generation, with no complete
    // generation left, is refused or unreadable rather than an empty successful store.
    // sidecar.test.ts:274-282 asserts the opposite for reads (loadProjection() is undefined).
    const head = join(dir, "projection.1.json")
    writeFileSync(head, readFileSync(head, "utf8").slice(0, 40), "utf8")
    // The mirror is an independent complete copy of the same generation (sidecar.test.ts:360).
    // Leaving it would hide the tear behind that copy. Truncate it the same way so the
    // reopened read is the torn generation. This store has one generation, so the
    // predecessor fallback cited above has nothing to land on.
    const mirror = join(dir, "projection.json")
    writeFileSync(mirror, readFileSync(mirror, "utf8").slice(0, 40), "utf8")

    const torn = readSidecarSet(dir, "projection")
    expect(torn.unreadable).toBe(true)

    const reopened = createDiskStore(cas)
    let refused = false
    let read: StoreProjection | undefined
    try {
      read = reopened.loadProjection()
    } catch {
      refused = true
    }
    if (refused) return
    // Contract: refused or unreadable, never served as an empty successful store.
    // undefined is the absent answer loadProjection gives for "nothing persisted", and
    // rehydrateProjection turns that into emptyStore(). A torn generation must not take
    // that shape. A throw above is the refusal; landing here means the read succeeded.
    expect(read, "truncated generation served as an empty successful store").toBeDefined()
    expect(read).not.toEqual(emptyStore())
    expect(rehydrateProjection(reopened)).not.toEqual(emptyStore())
  })

  it("G3-03 incompatible-rollback-refused", () => {
    const cas = freshCas()
    const dir = dirname(cas)
    const store = createDiskStore(cas)
    const settled = store.commitProjection((p) => ({ out: "settled", next: withRow(p, "incumbent") }))
    expect(settled).toEqual({ settled: true, out: "settled" })
    const previous = store.loadProjection()
    expect(previous?.current.has("incumbent")).toBe(true)

    // Real refusal, not an invented one: a foreign identity stamp. commitLoop calls
    // refuseForeignIdentityWrite and throws IdentitySchemaError before any publish.
    // The other real refusal is `untrusted` (sidecar-commit.ts commitLoop;
    // store-provenance.test.ts:209). That seam blanks the projection on read, so a
    // guarded reopen would not return the previous projection. Foreign identity serves
    // the rows and refuses the write, which is the reopen this item asserts.
    for (const name of projectionNames(dir)) {
      const wire = JSON.parse(readFileSync(join(dir, name), "utf8")) as { identity?: string }
      wire.identity = "atlas-identity-from-the-future"
      writeFileSync(join(dir, name), JSON.stringify(wire))
    }
    expect(() => store.commitProjection(() => ({ out: "rollback", next: emptyStore() }))).toThrow(IdentitySchemaError)

    expect(createDiskStore(cas).loadProjection()).toEqual(previous)
  })

  // G3-04 INDETERMINATE, no existing entry point.
  // Searched adapter-io and the atlas packages for a publication door that already
  // refuses an old producer. The identity-schema refusal is a store-schema gate (G3-03),
  // not an old-producer publication door. genesis-global-completion-plan.md places that
  // refusal in G4. No migration function added.
})

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { upsert, emptyStore } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import { currentFactOf, stagedNodeKeys } from "../src/review-store.js"

let tmp: string | undefined

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

describe("review-store — stagedNodeKeys", () => {
  it("is an empty set on an empty dir", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-review-store-"))
    expect([...stagedNodeKeys(tmp)!]).toEqual([])
  })

  it("reads staged keys after a staging commit", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-review-store-"))
    const store = createDiskStore(join(tmp, ".atlas", "cas"))
    const { store: next } = upsert(emptyStore(), {
      nodeKey: "nk-a",
      contentHash: id({ claim: "a" }),
      family: "advisory",
      claimNorm: "a",
    })
    store.commitStaging(() => ({ out: 0, next }))
    expect([...stagedNodeKeys(tmp)!]).toEqual(["nk-a"])
  })
})

describe("review-store — currentFactOf", () => {
  it("reads a persisted current fact and its CAS bytes", () => {
    tmp = mkdtempSync(join(tmpdir(), "atlas-review-store-"))
    const store = createDiskStore(join(tmp, ".atlas", "cas"))
    const h = store.put({ kind: "advisory", tier: "T2", claimNorm: "f holds" } as never) as string
    store.persistProjection(upsert(emptyStore(), { nodeKey: "nk-f", contentHash: h, family: "advisory", claimNorm: "f holds", tier: "T2" }).store)
    expect(currentFactOf(tmp, "nk-f")?.node.nodeKey).toBe("nk-f")
    expect((currentFactOf(tmp, "nk-f")?.fact as { claimNorm?: string } | undefined)?.claimNorm).toBe("f holds")
    expect(currentFactOf(tmp, "nk-none")).toBeUndefined()
  })
})

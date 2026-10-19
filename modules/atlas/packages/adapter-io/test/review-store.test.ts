import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { id } from "@atlas/kernel"
import { upsert, emptyStore } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import { stagedNodeKeys } from "../src/review-store.js"

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

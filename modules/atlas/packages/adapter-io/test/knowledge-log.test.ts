// @atlas/adapter-io — test/knowledge-log.test.ts  (the committed knowledge logs and their replay)
//
// Two checkouts of one repository are two CAS directories over one `.atlas/members` tree: the writer commits
// through the logging store, the clone starts from an empty CAS and replays.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { CurrentNode, StoreProjection } from "@atlas/knowledge"
import { emptyStore } from "@atlas/knowledge"
import { appendKnowledge, readKnowledge, withKnowledgeLog } from "../src/knowledge-log.js"
import { replayKnowledge } from "../src/knowledge-replay.js"
import { blobPath, knowledgeShardPath } from "../src/layout.js"
import { migrateLayout } from "../src/migrate-layout.js"
import type { AtlasPolicy } from "../src/policy.js"
import { createDiskStore, rehydrateProjection } from "../src/store.js"
import type { DiskStore } from "../src/store.js"

const policy: AtlasPolicy = { t0Heuristic: { keywords: [] }, authz: { scopes: { svc: ["backend"] } } }

let repo: string
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "atlas-knowledge-"))
})
afterEach(() => rmSync(repo, { recursive: true, force: true }))

const store = (name: string): DiskStore => createDiskStore(join(repo, name))

/** Put `fact` and commit one row naming it, as a door would. */
function emit(s: DiskStore, nodeKey: string, fact: object, scope = "svc"): CurrentNode {
  const contentHash = s.put(fact)
  const row: CurrentNode = { nodeKey, family: "advisory", contentHash, claims: [], scope }
  const result = s.commitProjection((p: StoreProjection) => ({
    out: row,
    next: { ...p, current: new Map([...p.current, [nodeKey, row]]), cas: new Set([...p.cas, contentHash]) },
  }))
  expect(result.settled).toBe(true)
  return row
}

const staged = (s: DiskStore): ReadonlyMap<string, CurrentNode> => {
  const read = s.commitStaging((p) => ({ out: p }))
  return read.settled ? read.out.current : new Map()
}

describe("knowledge log", () => {
  it("logs each settled row once, with its bytes, and folds to the latest by (at, contentHash)", () => {
    const times = ["2026-10-28T10:00:00.000Z", "2026-10-28T11:00:00.000Z", "2026-10-28T12:00:00.000Z"]
    const s = withKnowledgeLog(store("a"), { repoPath: repo, seat: "backend", source: { card: "C1" }, now: () => times.shift() ?? "" })
    emit(s, "nk-1", { claim: "one" })
    const second = emit(s, "nk-1", { claim: "two" })
    // Committing an unchanged projection logs nothing.
    s.commitProjection((p) => ({ out: 0, next: p }))

    const lines = readFileSync(knowledgeShardPath(repo, "backend", "nk-1"), "utf8").trim().split("\n")
    expect(lines).toHaveLength(2)
    const read = readKnowledge(repo)
    expect(read.rejected).toBe(0)
    expect(read.rows.get("nk-1")?.row).toEqual(second)
    expect(read.rows.get("nk-1")?.source).toEqual({ card: "C1" })
    expect(JSON.parse(readFileSync(blobPath(repo, second.contentHash), "utf8"))).toEqual({ claim: "two" })
  })

  it("rejects an edited line and a line filed under another seat", () => {
    const row: CurrentNode = { nodeKey: "nk-2", family: "advisory", contentHash: "h", claims: [] }
    appendKnowledge(repo, { seat: "backend", row, at: "2026-10-28T10:00:00.000Z", source: {} }, undefined)
    const path = knowledgeShardPath(repo, "backend", "nk-2")
    writeFileSync(path, readFileSync(path, "utf8").replace('"h"', '"forged"'))
    appendKnowledge(repo, { seat: "frontend", row, at: "2026-10-28T10:00:00.000Z", source: {} }, undefined)
    const elsewhere = knowledgeShardPath(repo, "backend", "nk-3")
    mkdirSync(join(elsewhere, ".."), { recursive: true })
    appendFileSync(elsewhere, readFileSync(knowledgeShardPath(repo, "frontend", "nk-2")))

    const read = readKnowledge(repo)
    expect(read.rejected).toBe(2)
    expect(read.rows.get("nk-2")?.seat).toBe("frontend")
  })
})

describe("replayKnowledge", () => {
  it("applies a proven fact that re-proves for an in-scope seat, and stages everything else", () => {
    const writer = withKnowledgeLog(store("a"), { repoPath: repo, seat: "backend", source: {} })
    emit(writer, "proven", { claim: "p", seal: "proven" })
    emit(writer, "advisory", { claim: "a" })
    emit(writer, "out-of-scope", { claim: "o", seal: "proven" }, "other")
    emit(writer, "broken", { claim: "b", seal: "proven" })

    const clone = store("b")
    const reproven = (node: CurrentNode) => node.nodeKey !== "broken"
    expect(replayKnowledge(repo, clone, policy, reproven)).toEqual({ applied: 1, staged: 3, missing: 0, rejected: 0 })
    expect([...rehydrateProjection(clone).current.keys()]).toEqual(["proven"])
    expect([...staged(clone).keys()].sort()).toEqual(["advisory", "broken", "out-of-scope"])
    // A second replay finds nothing new.
    expect(replayKnowledge(repo, clone, policy, reproven)).toEqual({ applied: 0, staged: 0, missing: 0, rejected: 0 })
  })

  it("counts a row whose bytes are gone or do not match its hash as missing", () => {
    const writer = withKnowledgeLog(store("a"), { repoPath: repo, seat: "backend", source: {} })
    const gone = emit(writer, "gone", { claim: "g", seal: "proven" })
    const swapped = emit(writer, "swapped", { claim: "s", seal: "proven" })
    rmSync(blobPath(repo, gone.contentHash))
    writeFileSync(blobPath(repo, swapped.contentHash), JSON.stringify({ claim: "other", seal: "proven" }))

    const clone = store("b")
    expect(replayKnowledge(repo, clone, policy, () => true)).toEqual({ applied: 0, staged: 0, missing: 2, rejected: 0 })
    expect(rehydrateProjection(clone)).toEqual(emptyStore())
  })
})

describe("migrateLayout knowledge export", () => {
  it("exports the local projection under the scope's only actor, else maestro, once", () => {
    mkdirSync(join(repo, ".atlas"), { recursive: true })
    writeFileSync(join(repo, ".atlas", "policy.json"), JSON.stringify(policy))
    const local = createDiskStore(join(repo, ".atlas", "cas"))
    const owned = emit(local, "owned", { claim: "x" })
    emit(local, "shared", { claim: "y" }, "nobody")

    expect(migrateLayout(repo).knowledge).toBe(2)
    expect(readKnowledge(repo).rows.get("owned")).toMatchObject({ seat: "backend", source: { migrated: true } })
    expect(readKnowledge(repo).rows.get("shared")?.seat).toBe("maestro")
    expect(existsSync(blobPath(repo, owned.contentHash))).toBe(true)
    expect(migrateLayout(repo).knowledge).toBe(0)
  })
})

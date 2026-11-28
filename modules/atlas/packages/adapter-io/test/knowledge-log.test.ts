// @atlas/adapter-io — test/knowledge-log.test.ts  (the committed knowledge logs and their replay)
//
// Two checkouts of one repository are two CAS directories over one `.atlas/members` tree: the writer commits
// through the logging store, the clone starts from an empty CAS and replays.

import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { Candidate, CurrentNode, StoreProjection } from "@atlas/knowledge"
import { emptyStore, nodeKey, primaryAnchorId, upsert } from "@atlas/knowledge"
import { asNodeKey, asSubtreeHash, id } from "@atlas/kernel"
import { claimNormOf } from "../src/governed-emit-identity.js"
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

// The sidecar sits beside the CAS directory (`dirname(casPath)`), so each checkout needs a folder of its own.
const store = (name: string): DiskStore => createDiskStore(join(repo, name, "cas"))

// These are canonical-shaped unit inputs, not production admission receipts. The controlled reproof callbacks
// below isolate ordering/scope behavior; the Core replay acceptance runs the real index-backed proof boundary.
function fact(site: string, raw: { id?: string; claim?: string; claimNorm?: string; seal?: "proven" | "justified" }, scope = "svc") {
  return {
    ...raw, kind: "advisory" as const, id: asNodeKey(raw.id ?? `src/${site}.ts`), tier: "T2" as const,
    claimNorm: raw.claimNorm ?? raw.claim ?? site,
    grounding: { entries: [{ path: `src/${site}.ts`, anchor: { kind: "file" as const,
      qualifiedPath: `src/${site}.ts`, subtreeHash: asSubtreeHash(id({ unitFixture: site })) } }] },
    freshness: "FRESH" as const, claims: [], authoring: "ADVISORY" as const,
    predicateSlot: "dependency" as const, scope,
  }
}

const keyOf = (site: string) => String(nodeKey({ ...fact(site, {}), slot: "dependency" } as unknown as Candidate))

/** Put the complete fact and let the actual upsert reducer construct its canonical row/history. */
function emit(s: DiskStore, site: string, raw: Parameters<typeof fact>[1], scope = "svc"): CurrentNode {
  const value = fact(site, raw, scope)
  const contentHash = s.put(value)
  const view = { ...value, slot: value.predicateSlot } as unknown as Candidate
  const key = String(nodeKey(view))
  const result = s.commitProjection((p: StoreProjection) => {
    const next = upsert(p, { nodeKey: key, family: "advisory", contentHash,
      claimNorm: claimNormOf(value, "advisory"), primaryAnchor: String(primaryAnchorId(view)), slot: value.predicateSlot,
      scope: value.scope, tier: value.tier, ...(value.seal === undefined ? {} : { seal: value.seal }) }).store
    const row = next.current.get(key)
    if (row === undefined) throw new Error("Canonical unit upsert did not produce its row")
    return { out: row, next }
  })
  expect(result.settled).toBe(true)
  if (!result.settled) throw new Error("Canonical unit projection did not settle")
  return result.out
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

    const lines = readFileSync(knowledgeShardPath(repo, "backend", keyOf("nk-1")), "utf8").trim().split("\n")
    expect(lines).toHaveLength(2)
    const read = readKnowledge(repo)
    expect(read.rejected).toBe(0)
    expect(read.rows.get(keyOf("nk-1"))?.row).toEqual(second)
    expect(read.rows.get(keyOf("nk-1"))?.source).toEqual({ card: "C1" })
    expect(JSON.parse(readFileSync(blobPath(repo, second.contentHash), "utf8"))).toEqual(fact("nk-1", { claim: "two" }))
  })

  it("rejects an edited line and a line filed under another seat", () => {
    const row = emit(store("a"), "nk-2", { claim: "untampered line" })
    appendKnowledge(repo, { seat: "backend", row, at: "2026-10-28T10:00:00.000Z", source: {} }, undefined)
    const path = knowledgeShardPath(repo, "backend", keyOf("nk-2"))
    writeFileSync(path, readFileSync(path, "utf8").replace(`"contentHash":"${row.contentHash}"`, '"contentHash":"forged"'))
    appendKnowledge(repo, { seat: "frontend", row, at: "2026-10-28T10:00:00.000Z", source: {} }, undefined)
    const elsewhere = knowledgeShardPath(repo, "backend", keyOf("nk-3"))
    mkdirSync(join(elsewhere, ".."), { recursive: true })
    appendFileSync(elsewhere, readFileSync(knowledgeShardPath(repo, "frontend", keyOf("nk-2"))))

    const read = readKnowledge(repo)
    expect(read.rejected).toBe(2)
    expect(read.rows.get(keyOf("nk-2"))?.seat).toBe("frontend")
  })
})

describe("replayKnowledge", () => {
  it("applies a proven fact that re-proves for an in-scope seat, and stages everything else", () => {
    const writer = withKnowledgeLog(store("a"), { repoPath: repo, seat: "backend", source: {} })
    emit(writer, "proven", { id: "proven", claim: "p", seal: "proven" })
    emit(writer, "advisory", { claim: "a" })
    emit(writer, "out-of-scope", { claim: "o", seal: "proven" }, "other")
    emit(writer, "broken", { claim: "b", seal: "proven" })

    const clone = store("b")
    const reproven = (node: CurrentNode) => node.nodeKey !== keyOf("broken")
    expect(replayKnowledge(repo, clone, policy, reproven)).toEqual({ applied: 1, staged: 3, missing: 0, rejected: 0 })
    expect([...rehydrateProjection(clone).current.keys()]).toEqual([keyOf("proven")])
    expect([...staged(clone).keys()].sort()).toEqual([keyOf("advisory"), keyOf("broken"), keyOf("out-of-scope")].sort())
    // A second replay finds nothing new.
    expect(replayKnowledge(repo, clone, policy, reproven)).toEqual({ applied: 0, staged: 0, missing: 0, rejected: 0 })
  })

  it("stages a row whose key or claims the fact does not authenticate", () => {
    const writer = withKnowledgeLog(store("a"), { repoPath: repo, seat: "backend", source: {} })
    const honest = emit(writer, "fact-id", { id: "fact-id", claimNorm: "the sentence", seal: "proven" })
    const legitimate = store("legitimate")
    expect(replayKnowledge(repo, legitimate, policy, () => true)).toEqual({ applied: 1, staged: 0, missing: 0, rejected: 0 })
    expect(rehydrateProjection(legitimate).current.get(keyOf("fact-id"))?.claims).toEqual(["the sentence"])
    appendKnowledge(
      repo,
      {
        seat: "backend",
        row: { ...honest, nodeKey: keyOf("forged-key"), claims: ["forged claim"] },
        at: "2099-01-01T00:00:00.000Z",
        source: {},
      },
      undefined,
    )
    appendKnowledge(
      repo,
      {
        seat: "backend",
        row: { ...honest, claims: ["forged claim"] },
        at: "2099-01-01T00:00:01.000Z",
        source: {},
      },
      undefined,
    )

    const clone = store("b")
    expect(replayKnowledge(repo, clone, policy, () => true)).toEqual({ applied: 0, staged: 2, missing: 0, rejected: 0 })
    const own = rehydrateProjection(clone).current
    expect(own.has(keyOf("forged-key"))).toBe(false)
    expect(own.get(keyOf("fact-id"))?.claims ?? []).not.toContain("forged claim")
    expect([...staged(clone).keys()].sort()).toEqual([keyOf("fact-id"), keyOf("forged-key")].sort())
    expect(staged(clone).get(keyOf("forged-key"))).toEqual({ ...honest, nodeKey: keyOf("forged-key"), claims: ["forged claim"] })
    expect(staged(clone).get(keyOf("fact-id"))).toEqual({ ...honest, claims: ["forged claim"] })
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

  it("reports a knowledge folder it cannot read instead of an empty replay", () => {
    mkdirSync(join(repo, ".atlas", "members", "backend"), { recursive: true })
    // A file where the `knowledge/` folder should be: readdir fails with ENOTDIR, not ENOENT.
    writeFileSync(join(repo, ".atlas", "members", "backend", "knowledge"), "")
    expect(replayKnowledge(repo, store("b"), policy, () => true)).toEqual({
      applied: 0,
      staged: 0,
      missing: 0,
      rejected: 0,
      unreadable: true,
    })
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
    expect(readKnowledge(repo).rows.get(keyOf("owned"))).toMatchObject({ seat: "backend", source: { migrated: true } })
    expect(readKnowledge(repo).rows.get(keyOf("shared"))?.seat).toBe("maestro")
    expect(existsSync(blobPath(repo, owned.contentHash))).toBe(true)
    expect(migrateLayout(repo).knowledge).toBe(0)
  })
})

describe("replay order", () => {
  it("keeps the commit that was built on an earlier one when that earlier one is logged later", () => {
    const disk = store("a")
    let later: CurrentNode | undefined
    const built = withKnowledgeLog(disk, {
      repoPath: repo,
      seat: "backend",
      source: {},
      now: () => "2026-10-28T10:00:00.000Z",
    })
    const ahead = withKnowledgeLog(disk, {
      repoPath: repo,
      seat: "backend",
      source: {},
      now: () => "2026-10-28T12:00:00.000Z",
      afterCommit: () => {
        later = emit(built, "nk", { id: "nk", claimNorm: "built on the first", seal: "proven" })
      },
    })
    const earlier = emit(ahead, "nk", { id: "nk", claimNorm: "first", seal: "proven" })
    if (later === undefined) throw new Error("the later commit did not run")

    expect(readKnowledge(repo).rows.get(keyOf("nk"))?.row.contentHash).toBe(later.contentHash)
    expect(rehydrateProjection(disk).current.get(keyOf("nk"))?.contentHash).toBe(later.contentHash)
    replayKnowledge(repo, disk, policy, () => true)
    expect(rehydrateProjection(disk).current.get(keyOf("nk"))?.contentHash).toBe(later.contentHash)

    const clone = store("clone")
    replayKnowledge(repo, clone, policy, () => true)
    expect(rehydrateProjection(clone).current.get(keyOf("nk"))?.contentHash).toBe(later.contentHash)
    expect(rehydrateProjection(clone).current.get(keyOf("nk"))?.contentHash).not.toBe(earlier.contentHash)
  })

  it("keeps the later commit when the earlier one ties on time and has the greater hash", () => {
    const disk = store("a")
    const alpha = disk.put(fact("nk", { claim: "alpha" }))
    const beta = disk.put(fact("nk", { claim: "beta" }))
    const first = alpha > beta ? { claim: "alpha" } : { claim: "beta" }
    const second = alpha > beta ? { claim: "beta" } : { claim: "alpha" }
    const writer = withKnowledgeLog(disk, {
      repoPath: repo,
      seat: "backend",
      source: {},
      now: () => "2026-10-28T10:00:00.000Z",
    })
    const ancestor = emit(writer, "nk", first)
    const descendant = emit(writer, "nk", second)
    expect(ancestor.contentHash > descendant.contentHash).toBe(true)
    expect(readKnowledge(repo).rows.get(keyOf("nk"))?.row.contentHash).toBe(descendant.contentHash)
  })
})

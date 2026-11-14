import path from "node:path"
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { AtlasCas } from "./fixture/atlas-cas"

let harness: Awaited<ReturnType<typeof AtlasCas.make>> | undefined
beforeAll(async () => {
  harness = await AtlasCas.make()
})
afterAll(() => harness?.dispose())

function fixture() {
  if (!harness) throw new Error("CAS fixture has not built the actual Atlas exports")
  return harness
}

test("CONTROL L6: actual bundled exports support fresh writes and valid canonical-ID dedup", () => {
  const current = fixture()
  const fresh = current.fresh()
  const first = { kind: "fact", claim: "canonical dedup", status: "first" }
  const changedIndex = { ...first, status: "changed mutable index" }
  expect(current.api.emptyStore().current.size).toBe(0)
  expect(current.api.id(changedIndex)).toBe(current.api.id(first))
  const hash = fresh.disk.put(first)
  expect(hash).toBe(current.api.id(first))
  expect(hash).toMatch(/^[0-9a-f]{64}$/)
  expect(fresh.disk.get(hash)).toEqual(first)
  const file = AtlasCas.valuePath(fresh.cas, hash)
  const bytes = readFileSync(file, "utf8")
  const inode = statSync(file, { bigint: true }).ino
  expect(fresh.disk.put(changedIndex)).toBe(hash)
  expect(fresh.disk.get(hash)).toEqual(first)
  expect(readFileSync(file, "utf8")).toBe(bytes)
  expect(statSync(file, { bigint: true }).ino).toBe(inode)
  expect(
    readdirSync(fresh.cas, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()),
  ).toHaveLength(1)
})

test("CONTROL L6: real knowledge logs replay under existing seal, scope and reproof decisions", () => {
  const current = fixture()
  const fresh = current.fresh()
  const proven = AtlasCas.seed(current.api, fresh.repo, "proven", { claim: "holds", seal: "proven" }).row
  const advisory = AtlasCas.seed(current.api, fresh.repo, "advisory", { claim: "candidate" }).row
  const outside = AtlasCas.seed(current.api, fresh.repo, "outside-scope", { claim: "other", seal: "proven" }, "other").row
  const broken = AtlasCas.seed(current.api, fresh.repo, "broken", { claim: "fails reproof", seal: "proven" }).row
  // Controlled unit boundary: canonical production oracle coverage lives in the separate actual-producer suite.
  const reproven = (row: AtlasCas.Row) => row.nodeKey !== broken.nodeKey
  const result = current.api.replayKnowledge(fresh.repo, fresh.disk, AtlasCas.policy, reproven)
  expect(result).toEqual({ applied: 1, staged: 3, missing: 0, rejected: 0 })
  expect([...current.api.rehydrateProjection(fresh.disk).current.keys()]).toEqual([proven.nodeKey])
  expect([...AtlasCas.staged(fresh.disk).current.keys()].sort()).toEqual([advisory.nodeKey, broken.nodeKey, outside.nodeKey].sort())
  expect(current.api.replayKnowledge(fresh.repo, fresh.disk, AtlasCas.policy, reproven)).toEqual({
    applied: 0,
    staged: 0,
    missing: 0,
    rejected: 0,
  })
})

test("L6: retry repairs real truncated and hash-invalid addressed files and leaves no publication debris", () => {
  const current = fixture()
  for (const corrupt of ['{"claim":', JSON.stringify({ claim: "wrong addressed content" })]) {
    const fresh = current.fresh()
    const fact = { kind: "fact", claim: "repair addressed content" }
    const hash = fresh.disk.put(fact)
    expect(fresh.disk.get(hash)).toEqual(fact)
    writeFileSync(AtlasCas.valuePath(fresh.cas, hash), corrupt)
    expect(fresh.disk.get(hash)).toBeUndefined()
    expect(fresh.disk.put(fact)).toBe(hash)
    expect(fresh.disk.get(hash)).toEqual(fact)
    expect(JSON.parse(readFileSync(AtlasCas.valuePath(fresh.cas, hash), "utf8"))).toEqual(fact)
    expect(AtlasCas.inventory(fresh.cas)).toEqual([hash.slice(0, 2), `${hash.slice(0, 2)}/${hash}`].sort())
  }
})

test("L6: non-file publication destinations refuse without publishing a projection or leaking a temp", () => {
  const current = fixture()
  for (const destination of ["directory-at-address", "file-at-shard"]) {
    const fresh = current.fresh()
    const fact = { kind: "fact", claim: `refused ${destination}` }
    const hash = current.api.id(fact)
    const file = AtlasCas.valuePath(fresh.cas, hash)
    mkdirSync(fresh.cas, { recursive: true })
    if (destination === "directory-at-address") mkdirSync(file, { recursive: true })
    if (destination === "file-at-shard") writeFileSync(path.dirname(file), "SHARD IS A REGULAR FILE")
    writeFileSync(path.join(fresh.repo, "keep.txt"), "KEEP SENTINEL")
    const before = AtlasCas.inventory(fresh.repo)
    expect(fresh.disk.get(hash)).toBeUndefined()
    expect(fresh.disk.put(fact)).toBe("")
    expect(AtlasCas.inventory(fresh.repo)).toEqual(before)
    const row: AtlasCas.Row = { nodeKey: "refused", family: "advisory", contentHash: hash, claims: [] }
    expect(() =>
      fresh.disk.commitProjection((projection) => ({
        out: row,
        next: { ...projection, current: new Map([[row.nodeKey, row]]), cas: new Set([hash]) },
        put: [fact],
      })),
    ).toThrow(/unaddressable-cas-object/)
    expect(fresh.disk.loadProjection()).toBeUndefined()
    expect(AtlasCas.inventory(fresh.repo)).toEqual(before)
    expect(readFileSync(path.join(fresh.repo, "keep.txt"), "utf8")).toBe("KEEP SENTINEL")
  }
})

test("L6: an escaping shard symlink refuses before touching an external sentinel or allocating external temps", () => {
  const current = fixture()
  const fresh = current.fresh()
  const fact = { kind: "fact", claim: "external shard refusal" }
  const hash = current.api.id(fact)
  const external = path.join(fresh.repo, "outside-cas")
  mkdirSync(external)
  mkdirSync(fresh.cas, { recursive: true })
  writeFileSync(path.join(external, hash), "EXTERNAL SENTINEL")
  // A setup failure here is symlink privilege/infrastructure, not a product RED; the two controls use no links.
  symlinkSync(external, path.join(fresh.cas, hash.slice(0, 2)), process.platform === "win32" ? "junction" : "dir")
  const before = AtlasCas.inventory(external)
  expect(fresh.disk.get(hash)).toBeUndefined()
  expect(fresh.disk.put(fact)).toBe("")
  expect(readFileSync(path.join(external, hash), "utf8")).toBe("EXTERNAL SENTINEL")
  expect(AtlasCas.inventory(external)).toEqual(before)
})

test("L6: replay with a real valid log/blob and corrupt local CAS repairs it or safely counts it missing", () => {
  const current = fixture()
  const fresh = current.fresh()
  const seed = AtlasCas.seed(current.api, fresh.repo, "replay", { claim: "replay stored content", seal: "proven" })
  const fact = seed.fact
  const row = seed.row
  expect(JSON.parse(readFileSync(current.api.blobPath(fresh.repo, row.contentHash), "utf8"))).toEqual(fact)
  expect(fresh.disk.put(fact)).toBe(row.contentHash)
  writeFileSync(AtlasCas.valuePath(fresh.cas, row.contentHash), '{"claim":')
  expect(fresh.disk.get(row.contentHash)).toBeUndefined()
  const result = current.api.replayKnowledge(fresh.repo, fresh.disk, AtlasCas.policy, () => true)
  const recovered = fresh.disk.get(row.contentHash)
  if (recovered === undefined) {
    expect(result).toEqual({ applied: 0, staged: 0, missing: 1, rejected: 0 })
    expect(current.api.rehydrateProjection(fresh.disk).current.size).toBe(0)
    expect(AtlasCas.staged(fresh.disk).current.size).toBe(0)
    return
  }
  expect(recovered).toEqual(fact)
  expect(result).toEqual({ applied: 1, staged: 0, missing: 0, rejected: 0 })
  expect(current.api.rehydrateProjection(fresh.disk).current.get(row.nodeKey)?.contentHash).toBe(row.contentHash)
  expect(AtlasCas.staged(fresh.disk).current.size).toBe(0)
})

test("L6: actual absence observed during restore or selection never enters proven or staging", () => {
  const current = fixture()
  for (const phase of ["after-real-put", "before-selection-read"]) {
    for (const seal of ["proven", "advisory"]) {
      const fresh = current.fresh()
      const seed = AtlasCas.seed(current.api, fresh.repo, "lost", {
        claim: `lost ${phase}/${seal}`, ...(seal === "proven" ? { seal: "proven" as const } : {}),
      })
      const fact = seed.fact
      const row = seed.row
      const file = AtlasCas.valuePath(fresh.cas, row.contentHash)
      if (phase === "before-selection-read") expect(fresh.disk.put(fact)).toBe(row.contentHash)
      const removed: string[] = []
      const reads: unknown[] = []
      const disk: AtlasCas.Disk = {
        ...fresh.disk,
        put(value) {
          const hash = fresh.disk.put(value)
          expect(hash).toBe(row.contentHash)
          expect(fresh.disk.get(hash)).toEqual(fact)
          if (phase === "after-real-put") {
            rmSync(file)
            expect(existsSync(file)).toBe(false)
            removed.push(file)
          }
          return hash
        },
        get(hash) {
          // On the second read, remove BEFORE delegating: the caller observes a genuine missing read,
          // not deletion after an accepted/reproven snapshot and not an invented return value.
          if (phase === "before-selection-read" && reads.length === 1) {
            rmSync(file)
            expect(existsSync(file)).toBe(false)
            removed.push(file)
          }
          const found = fresh.disk.get(hash)
          reads.push(found)
          return found
        },
      }
      const result = current.api.replayKnowledge(fresh.repo, disk, AtlasCas.policy, () => true)
      expect(existsSync(current.api.blobPath(fresh.repo, row.contentHash))).toBe(true)
      if (phase === "before-selection-read" && removed.length === 0) {
        // Snapshot control, not absence RED: a validated snapshot need not cause a redundant second get.
        expect(reads, "snapshot control: no second get or removal").toEqual([fact])
        expect(existsSync(file)).toBe(true)
        const actual = fresh.disk.get(row.contentHash)
        expect(actual).toEqual(fact)
        expect(current.api.id(actual as AtlasCas.Fact)).toBe(row.contentHash)
        expect(result).toEqual({
          applied: seal === "proven" ? 1 : 0,
          staged: seal === "proven" ? 0 : 1,
          missing: 0,
          rejected: 0,
        })
        expect(current.api.rehydrateProjection(fresh.disk).current.get(row.nodeKey)?.contentHash).toBe(
          seal === "proven" ? row.contentHash : undefined,
        )
        expect(AtlasCas.staged(fresh.disk).current.get(row.nodeKey)?.contentHash).toBe(
          seal === "proven" ? undefined : row.contentHash,
        )
        continue
      }
      // after-real-put is always strict; the selection phase is strict whenever it observes actual absence.
      expect(removed).toContain(file)
      expect(removed.every((target) => target === file)).toBe(true)
      expect(reads).toContain(undefined)
      expect(fresh.disk.get(row.contentHash)).toBeUndefined()
      expect(result).toEqual({ applied: 0, staged: 0, missing: 1, rejected: 0 })
      expect(fresh.disk.loadProjection()).toBeUndefined()
      expect(current.api.rehydrateProjection(fresh.disk).current.size).toBe(0)
      expect(AtlasCas.staged(fresh.disk).current.size).toBe(0)
    }
  }
})

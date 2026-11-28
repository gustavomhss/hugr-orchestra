import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { make, parseDeclaration } from "../src/activity-external-cache"

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "activity-external-cache-"))
  return {
    directory,
    async [Symbol.asyncDispose]() {
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

test("declarations distinguish unavailable from explicitly empty and reject invalid whole inputs", () => {
  expect(parseDeclaration(undefined)).toBeUndefined()
  expect(parseDeclaration("{" )).toBeUndefined()
  expect(parseDeclaration("[]")).toEqual([])
  const directory = path.join(os.tmpdir(), "cache-one")
  expect(parseDeclaration(JSON.stringify([{ name: "  One  ", directory }]))).toEqual([{ name: "One", directory }])
  for (const value of [
    {}, [{ name: "", directory }], [{ name: "a".repeat(81), directory }],
    [{ name: "a\n", directory }], [{ name: "a", directory: "relative" }],
    [{ name: "a", directory: path.parse(directory).root }], [{ name: "a", directory: os.tmpdir() }],
    [{ name: "a", directory: os.homedir() }], [{ name: "a", directory: "/tmp" }],
    [{ name: "a", directory }, { name: "a", directory: path.join(directory, "other") }],
    [{ name: "a", directory }, { name: "b", directory: path.join(directory, ".") }],
    Array.from({ length: 17 }, (_, i) => ({ name: String(i), directory: path.join(directory, String(i)) })),
  ]) expect(parseDeclaration(JSON.stringify(value))).toBeUndefined()
})

test("cached inventory is opaque, unread, and does not access the filesystem", () => {
  const directory = path.join(os.tmpdir(), "external-cache-private")
  const calls: string[] = []
  const inventory = make([{ name: "Tools", directory }], async (selected) => {
    calls.push(selected)
    throw new Error("unexpected walk")
  })
  const snapshot = inventory.snapshot()
  expect(snapshot.status).toBe("ready")
  expect(snapshot.snapshotRevision).toBe("0")
  expect(snapshot.source).toBe("node.fs.lstat")
  expect(snapshot.coverage).toBe("operator-declared-external-caches")
  expect(snapshot.records).toHaveLength(1)
  expect(snapshot.records[0]).toMatchObject({ name: "Tools", owner: "", useProof: "unproved", unique: "not-collapsed" })
  expect(snapshot.records[0]?.id).toBeTruthy()
  expect(snapshot.records[0]?.id).not.toContain(directory)
  expect(snapshot.records[0]?.logical).toBeUndefined()
  expect(snapshot.records[0]?.attempt).toBeUndefined()
  expect(JSON.stringify(snapshot)).not.toContain(directory)
  expect(calls).toEqual([])
  expect(make(undefined).snapshot().status).toBe("unavailable")
  expect(make([]).snapshot()).toMatchObject({ status: "ready", records: [] })
  expect(make([{ name: "Tools", directory }]).snapshot().records[0]?.id).not.toBe(snapshot.records[0]?.id)
})

test("real reads measure only the selected declaration", async () => {
  await using root = await fixture()
  const first = path.join(root.directory, "first")
  const second = path.join(root.directory, "second")
  await fs.mkdir(first)
  await fs.mkdir(second)
  await Bun.write(path.join(first, "file"), "12345")
  await Bun.write(path.join(second, "file"), "123456789")
  const inventory = make([{ name: "first", directory: first }, { name: "second", directory: second }])
  const before = inventory.snapshot()
  const result = await inventory.read(before.records[0]!.id)
  expect(result.status).toBe("observed")
  if (result.status !== "observed") return
  expect(result.snapshot.snapshotRevision).not.toBe(before.snapshotRevision)
  expect(result.snapshot.records[0]?.logical?.bytes).toBe(5)
  expect(result.snapshot.records[0]?.attempt?.state).toBe("complete")
  expect(result.snapshot.records[1]?.logical).toBeUndefined()
  expect(result.snapshot.records[1]?.attempt).toBeUndefined()
  expect(JSON.stringify(result.snapshot)).not.toContain(root.directory)
})

test("one global walk coalesces the same id and rejects another or unknown id", async () => {
  const directories = [path.join(os.tmpdir(), "one"), path.join(os.tmpdir(), "two")]
  const calls: string[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const inventory = make(directories.map((directory, i) => ({ name: String(i), directory })), async (directory) => {
    calls.push(directory)
    await gate
    return { state: "complete", startedAt: 10, sampledAt: 11, observedBytes: 3, entries: 1, issueCount: 0, issues: [] }
  })
  const before = inventory.snapshot()
  expect(await inventory.read("unknown")).toEqual({ status: "unknown" })
  expect(inventory.snapshot().snapshotRevision).toBe(before.snapshotRevision)
  const first = inventory.read(before.records[0]!.id)
  const same = inventory.read(before.records[0]!.id)
  expect(await inventory.read(before.records[1]!.id)).toEqual({ status: "busy" })
  expect(calls).toEqual([directories[0]!])
  release()
  expect(await same).toEqual(await first)
  expect(calls).toEqual([directories[0]!])
})

test("partial attempts retain the last complete logical sample and redact paths", async () => {
  const directory = path.join(os.tmpdir(), "private-cache")
  let count = 0
  const inventory = make([{ name: "cache", directory }], async () => {
    count++
    return count === 1
      ? { state: "complete", startedAt: 10, sampledAt: 11, observedBytes: 42, entries: 1, issueCount: 0, issues: [] }
      : { state: "partial", startedAt: 20, sampledAt: 21, observedBytes: 7, entries: 1, issueCount: 1, issues: [{ path: directory, reason: "unavailable" }] }
  })
  const id = inventory.snapshot().records[0]!.id
  const complete = await inventory.read(id)
  expect(complete.status).toBe("observed")
  if (complete.status !== "observed") return
  const partial = await inventory.read(id)
  expect(partial.status).toBe("observed")
  if (partial.status !== "observed") return
  expect(partial.snapshot.snapshotRevision).not.toBe(complete.snapshot.snapshotRevision)
  expect(partial.snapshot.records[0]?.logical).toEqual({ bytes: 42, sampledAt: 11 })
  expect(partial.snapshot.records[0]?.attempt).toEqual({ state: "partial", startedAt: 20, sampledAt: 21, issueCount: 1 })
  expect(JSON.stringify(partial.snapshot)).not.toContain(directory)
})

import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Schema } from "effect"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { make, measure } from "../src/activity-disk"

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "activity-disk-"))
  return {
    directory,
    async [Symbol.asyncDispose]() {
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

test("logical walks count real nested file lengths, including empty directories and hardlink paths", async () => {
  await using root = await fixture()
  await fs.mkdir(path.join(root.directory, "empty"))
  await fs.mkdir(path.join(root.directory, "nested"))
  await Bun.write(path.join(root.directory, "nested", "file"), "abc")
  await fs.link(path.join(root.directory, "nested", "file"), path.join(root.directory, "link"))
  const result = await measure(root.directory)
  expect(result.state).toBe("complete")
  expect(result.observedBytes).toBe(6)
  expect(result.issues).toEqual([])
  expect(result.sampledAt).toBeGreaterThanOrEqual(result.startedAt)
  expect((await measure(path.join(root.directory, "empty"))).observedBytes).toBe(0)
})

test("symlinks cannot turn an external directory into measured coverage", async () => {
  await using root = await fixture()
  await using outside = await fixture()
  await Bun.write(path.join(outside.directory, "outside"), "secret")
  await fs.symlink(outside.directory, path.join(root.directory, "escape"), "junction")
  const result = await measure(root.directory)
  expect(result.state).toBe("partial")
  expect(result.observedBytes).toBe(0)
  expect(result.issues.some((issue) => issue.reason === "symlink")).toBe(true)
  expect((await measure(path.join(root.directory, "escape"))).state).toBe("partial")
})

test("missing roots and bounded walks stay partial with an explicit unread scope", async () => {
  await using root = await fixture()
  expect((await measure(path.join(root.directory, "missing"))).issues[0]?.reason).toBe("unavailable")
  await Promise.all(Array.from({ length: 8 }, (_, i) => Bun.write(path.join(root.directory, String(i)), "123")))
  const result = await measure(root.directory, { maxEntries: 2 })
  expect(result.state).toBe("partial")
  expect(result.issues.some((issue) => issue.reason === "limit" && issue.path === root.directory)).toBe(true)
  expect(result.entries).toBeLessThanOrEqual(2)
  expect(result.observedBytes).toBeLessThan(24)
})

test("snapshots never walk and concurrent reads coalesce; failed rereads preserve the last complete value", async () => {
  await using root = await fixture()
  await Bun.write(path.join(root.directory, "file"), "12345")
  const monitor = make([{ id: "cache", path: root.directory }])
  const unread = Schema.decodeUnknownSync(ActivityMonitor.DiskSnapshot)(monitor.snapshot())
  expect(unread.roots[0]?.attempt).toBeUndefined()
  expect(unread.roots[0]?.logical).toBeUndefined()
  expect(await monitor.read("unknown")).toBe(false)
  const first = monitor.read("cache")
  expect(monitor.read("cache")).toBe(first)
  await first
  const complete = Schema.decodeUnknownSync(ActivityMonitor.DiskSnapshot)(monitor.snapshot())
  expect(complete.roots[0]?.logical?.bytes).toBe(5)
  await fs.rm(root.directory, { recursive: true })
  expect(monitor.snapshot().roots[0]).toEqual(complete.roots[0])
  await monitor.read("cache")
  const failed = Schema.decodeUnknownSync(ActivityMonitor.DiskSnapshot)(monitor.snapshot())
  expect(failed.roots[0]?.attempt?.state).toBe("partial")
  expect(failed.roots[0]?.logical).toEqual(complete.roots[0]?.logical)
  expect(monitor.snapshot().roots[0]).toEqual(failed.roots[0])
  expect(failed.instanceID).toBe(complete.instanceID)
  expect(make([]).snapshot().instanceID).not.toBe(failed.instanceID)
})

test("independent declared roots do not share an in-flight read and file roots are refused", async () => {
  await using root = await fixture()
  await Bun.write(path.join(root.directory, "file"), "123")
  const monitor = make([
    { id: "cache", path: root.directory },
    { id: "logs", path: root.directory },
  ])
  const first = monitor.read("cache")
  const second = monitor.read("logs")
  expect(first).not.toBe(second)
  await Promise.all([first, second])
  expect(monitor.snapshot().roots.every((row) => row.logical?.bytes === 3)).toBe(true)
  const file = await measure(path.join(root.directory, "file"))
  expect(file.state).toBe("partial")
  expect(file.issues[0]?.reason).toBe("unsupported")
})

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "unreadable subdirectories are explicit gaps",
  async () => {
    await using root = await fixture()
    const hidden = path.join(root.directory, "hidden")
    await fs.mkdir(hidden)
    await Bun.write(path.join(hidden, "file"), "123")
    await fs.chmod(hidden, 0)
    const result = await measure(root.directory).finally(() => fs.chmod(hidden, 0o700))
    expect(result.state).toBe("partial")
    expect(result.issues.some((issue) => issue.reason === "unavailable" && issue.path.endsWith("hidden"))).toBe(true)
  },
)

test.skipIf(process.platform !== "linux")(
  "unsafe logical sums are partial without rounded totals",
  async () => {
    await using root = await fixture()
    const file = await fs.open(path.join(root.directory, "sparse"), "w")
    await file.truncate(2 ** 43).finally(() => file.close())
    await Promise.all(
      Array.from({ length: 1023 }, (_, i) =>
        fs.link(path.join(root.directory, "sparse"), path.join(root.directory, String(i))),
      ),
    )
    const result = await measure(root.directory, { maxMs: 60_000 })
    expect(result.state).toBe("partial")
    expect(result.issues.some((issue) => issue.reason === "overflow")).toBe(true)
    expect(Number.isSafeInteger(result.observedBytes)).toBe(true)
  },
  90_000,
)

test("depth and elapsed budgets cannot publish a closed logical reading", async () => {
  await using root = await fixture()
  await fs.mkdir(path.join(root.directory, "nested"))
  await Bun.write(path.join(root.directory, "nested", "file"), "123")
  for (const limits of [{ maxDepth: 1 }, { maxMs: 0 }]) {
    const result = await measure(root.directory, limits)
    expect(result.state).toBe("partial")
    expect(result.issues.some((issue) => issue.reason === "limit")).toBe(true)
    expect(result.observedBytes).toBe(0)
    expect(new Set(result.issues.map((issue) => `${issue.path}:${issue.reason}`)).size).toBe(result.issueCount)
  }
})

test.skipIf(process.platform === "win32")("socket entries are unread scopes, never file bytes", async () => {
  await using root = await fixture()
  const socket = Bun.listen({ unix: path.join(root.directory, "socket"), socket: { data() {} } })
  const result = await measure(root.directory).finally(() => socket.stop(true))
  expect(result.state).toBe("partial")
  expect(result.observedBytes).toBe(0)
  expect(result.issues.some((issue) => issue.reason === "unsupported" && issue.path.endsWith("socket"))).toBe(true)
})

test("bounded issue details retain the full gap count and do not modify files", async () => {
  await using root = await fixture()
  await using outside = await fixture()
  await Bun.write(path.join(outside.directory, "keep"), "untouched")
  await Promise.all(
    Array.from({ length: 40 }, (_, i) =>
      fs.symlink(outside.directory, path.join(root.directory, String(i)), "junction"),
    ),
  )
  const result = await measure(root.directory)
  expect(result.state).toBe("partial")
  expect(result.issueCount).toBe(40)
  expect(result.issues).toHaveLength(32)
  expect(await Bun.file(path.join(outside.directory, "keep")).text()).toBe("untouched")
  expect(await fs.readdir(root.directory)).toHaveLength(40)
})

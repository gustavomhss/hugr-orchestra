import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { ActivityObjectCwd } from "../src/activity-object-cwd"

describe.skipIf(process.platform !== "linux")("object cwd observation", () => {
  test("detects only an exact directory identity, with bounded negatives held partial", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "activity-cwd-"))
    try {
      const object = path.join(root, "object")
      const child = path.join(object, "child")
      const sibling = path.join(root, "sibling")
      const proc = path.join(root, "proc")
      await Promise.all([mkdir(child, { recursive: true }), mkdir(sibling), mkdir(path.join(proc, "123"), { recursive: true })])
      await symlink(object, path.join(proc, "123", "cwd"))
      expect(await ActivityObjectCwd.readCwd({ objectID: "a", directory: object, procRoot: proc })).toEqual({
        objectID: "a", method: "cwd", outcome: "holder",
      })
      expect(await ActivityObjectCwd.readCwd({ objectID: "a", directory: object, procRoot: proc, maxProcesses: 0 })).toEqual({
        objectID: "a", method: "cwd", outcome: "partial",
      })
      for (const directory of [sibling, child]) {
        expect(await ActivityObjectCwd.readCwd({ objectID: "b", directory, procRoot: proc })).toEqual({
          objectID: "b", method: "cwd", outcome: "partial",
        })
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("rejects missing and symlink targets and reports an unavailable proc root", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "activity-cwd-"))
    try {
      const object = path.join(root, "object")
      const link = path.join(root, "link")
      const proc = path.join(root, "proc")
      await Promise.all([mkdir(object), mkdir(path.join(proc, "123"), { recursive: true })])
      await Promise.all([symlink(object, link), symlink(object, path.join(proc, "123", "cwd"))])
      for (const directory of [link, path.join(root, "missing")]) {
        expect((await ActivityObjectCwd.readCwd({ objectID: "a", directory, procRoot: proc })).outcome).not.toBe("holder")
      }
      expect(await ActivityObjectCwd.readCwd({ objectID: "a", directory: object, procRoot: path.join(root, "missing-proc") })).toEqual({
        objectID: "a", method: "cwd", outcome: "unavailable",
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test("detects the current process cwd through the real proc filesystem", async () => {
    expect(await ActivityObjectCwd.readCwd({ objectID: "self", directory: process.cwd() })).toEqual({
      objectID: "self", method: "cwd", outcome: "holder",
    })
  })
})

test.skipIf(process.platform === "linux")("cwd observation is unavailable on unsupported systems", async () => {
  expect(await ActivityObjectCwd.readCwd({ objectID: "a", directory: process.cwd() })).toEqual({
    objectID: "a", method: "cwd", outcome: "unavailable",
  })
})

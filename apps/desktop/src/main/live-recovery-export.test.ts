import { expect, test } from "bun:test"
import { link, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { DeliveryExport } from "./live-delivery-contract"
import { exportLiveRecovery } from "./live-recovery-export"
import { exportData, withExport } from "./live-recovery-export-test.fixture"

// Only the native chooser is controlled. Serialization, ownership and every file operation are actual implementation.
const variants: DeliveryExport[] = [exportData,
  { kind: "unconfirmed", data: { id: "55555555-5555-4555-8555-555555555555", sessionID: "ses_uncertain", title: "Unconfirmed start", reason: "deadline" } },
  { kind: "storage-unavailable", id: "66666666-6666-4666-8666-666666666666", unsavedUnavailable: true },
]
for (const data of variants) test(`recovery export: ${data.kind} writes the exact explicit JSON envelope and incomplete flags`, () => withExport(async (f) => {
  expect(await exportLiveRecovery(data, { signal: new AbortController().signal, choose: async () => f.destination })).toEqual({ ok: true })
  const bytes = await readFile(f.destination)
  expect(bytes).toEqual(Buffer.from(JSON.stringify(data) + "\n", "utf8"))
  expect(JSON.parse(bytes.toString("utf8"))).toEqual(data)
  expect(bytes.subarray(0, 16).toString("utf8")).not.toBe("SQLite format 3\0")
  if (process.platform !== "win32") expect((await stat(f.destination)).mode & 0o777).toBe(0o600)
  expect(await f.entries()).toEqual(["meeting.json"])
}))

test("recovery export: cancelling the native chooser leaves an existing file byte-exact", () => withExport(async (f) => {
  await writeFile(f.destination, "existing destination")
  expect(await exportLiveRecovery(exportData, { signal: new AbortController().signal, choose: async () => undefined })).toEqual({ ok: false, reason: "cancelled" })
  expect(await readFile(f.destination, "utf8")).toBe("existing destination")
  expect(await f.entries()).toEqual(["meeting.json"])
}))

test("recovery export: an already aborted owner never invokes the chooser or writes", () => withExport(async (f) => {
  const owner = new AbortController()
  owner.abort()
  let choices = 0
  expect(await exportLiveRecovery(exportData, { signal: owner.signal, choose: async () => { choices++; return f.destination } })).toEqual({ ok: false, reason: "cancelled" })
  expect(choices).toBe(0)
  expect(await f.entries()).toEqual([])
}))

test("recovery export: abort after choice but before file admission preserves the old destination", () => withExport(async (f) => {
  await writeFile(f.destination, "existing destination")
  const owner = new AbortController()
  expect(await exportLiveRecovery(exportData, { signal: owner.signal, choose: async () => { owner.abort(); return f.destination } })).toEqual({ ok: false, reason: "cancelled" })
  expect(await readFile(f.destination, "utf8")).toBe("existing destination")
  expect(await f.entries()).toEqual(["meeting.json"])
}))

test("recovery export: successful replacement leaves an actual hard-linked original inode untouched", () => withExport(async (f) => {
  await writeFile(f.destination, "original inode bytes")
  const alias = join(f.root, "original-inode.json")
  await link(f.destination, alias)
  expect(await readFile(alias, "utf8")).toBe("original inode bytes")
  expect(await exportLiveRecovery(exportData, { signal: new AbortController().signal, choose: async () => f.destination })).toEqual({ ok: true })
  expect(await readFile(f.destination)).toEqual(Buffer.from(JSON.stringify(exportData) + "\n"))
  expect(await readFile(alias, "utf8")).toBe("original inode bytes")
  if (process.platform !== "win32") expect((await stat(f.destination)).mode & 0o777).toBe(0o600)
  expect(await f.entries()).toEqual(["meeting.json", "original-inode.json"])
}))

test("recovery export: actual rename failure preserves a nonempty destination and cleans every sibling temp", () => withExport(async (f) => {
  await mkdir(f.destination)
  await writeFile(join(f.destination, "retained.json"), "existing destination bytes")
  expect(await exportLiveRecovery(exportData, { signal: new AbortController().signal, choose: async () => f.destination })).toEqual({ ok: false, reason: "storage" })
  expect((await stat(f.destination)).isDirectory()).toBe(true)
  expect(await readFile(join(f.destination, "retained.json"), "utf8")).toBe("existing destination bytes")
  expect(await f.entries()).toEqual(["meeting.json"])
}))

test("recovery export: chooser failure is a stable public action without private error text", () => withExport(async (f) => {
  const result = await exportLiveRecovery(exportData, { signal: new AbortController().signal, choose: async () => { throw new Error("private-dialog-path-and-credentials") } })
  expect(result).toEqual({ ok: false, reason: "storage" })
  expect(await f.entries()).toEqual([])
}))

test("recovery export: a missing destination parent is refused without creating directories", () => withExport(async (f) => {
  expect(await exportLiveRecovery(exportData, { signal: new AbortController().signal, choose: async () => join(f.root, "missing", "meeting.json") })).toEqual({ ok: false, reason: "storage" })
  expect(await f.entries()).toEqual([])
}))

import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { checkAppExists, openDesktopPath, resolveExecutable } from "./apps"

test("desktop recovery: openPath treats shell error text as failure and never falls back for a missing app", async () => {
  const opened: string[] = []
  expect(await openDesktopPath("/missing", undefined, async (path) => { opened.push(path); return "File does not exist" })).toEqual({
    status: "failed", code: "open-failed", detail: "File does not exist",
  })
  expect(await openDesktopPath("/somewhere", `missing-app-${crypto.randomUUID()}`, async (path) => { opened.push(path); return "" })).toEqual({ status: "failed", code: "app-unavailable" })
  expect(opened).toEqual(["/missing"])
  expect(await openDesktopPath("/present", undefined, async () => "")).toEqual({ status: "opened" })
  expect(await checkAppExists(process.execPath)).toBe(true)
})

test("desktop recovery: executable lookup rejects missing files, directories and non-executable files", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestra-executable-"))
  try {
    await writeFile(join(root, "program"), "#!/bin/sh\nexit 0\n")
    await chmod(join(root, "program"), 0o644)
    await mkdir(join(root, "directory"))
    expect(await resolveExecutable("absent", root)).toBeNull()
    expect(await resolveExecutable("directory", root)).toBeNull()
    if (process.platform !== "win32") expect(await resolveExecutable("program", root)).toBeNull()
    await chmod(join(root, "program"), 0o755)
    expect(await resolveExecutable("program", root)).toBe(join(root, "program"))
  } finally { await rm(root, { recursive: true, force: true }) }
})

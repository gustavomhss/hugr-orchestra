import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { tmpdir } from "node:os"
import { checkAppExists, openDesktopPath, resolveAppPath, resolveExecutable } from "./apps"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"

test("desktop recovery: openPath treats shell error text as failure and never falls back for a missing app", async () => {
  if (process.platform !== "linux") expectSpawn(import.meta.path)
  const opened: string[] = []
  expect(
    await openDesktopPath("/missing", undefined, async (path) => {
      opened.push(path)
      return "File does not exist"
    }),
  ).toEqual({
    status: "failed",
    code: "open-failed",
    detail: "File does not exist",
  })
  expect(
    await openDesktopPath("/somewhere", `missing-app-${crypto.randomUUID()}`, async (path) => {
      opened.push(path)
      return ""
    }),
  ).toEqual({ status: "failed", code: "app-unavailable" })
  expect(opened).toEqual(["/missing"])
  expect(await openDesktopPath("/present", undefined, async () => "")).toEqual({ status: "opened" })
  expect(await checkAppExists(process.execPath)).toBe(true)
  expect(await resolveAppPath(process.execPath)).toBe(process.execPath)
})

test("desktop recovery: command names retain PATH lookup and unknown-command failure", async () => {
  if (process.platform !== "linux") expectSpawn(import.meta.path)
  expect(await checkAppExists(basename(process.execPath))).toBe(true)
  expect(await resolveAppPath(basename(process.execPath))).not.toBeNull()
  expect(await checkAppExists(`missing-app-${crypto.randomUUID()}`)).toBe(false)
})

test("desktop recovery: executable lookup rejects missing files, directories and non-executable files", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestra-executable-"))
  try {
    await writeFile(join(root, "program"), "#!/bin/sh\nexit 0\n")
    await writeFile(join(root, "program.txt"), "not an executable", { mode: 0o644 })
    await chmod(join(root, "program"), 0o644)
    await mkdir(join(root, "directory"))
    await mkdir(join(root, "directory.exe"))
    expect(await checkAppExists(join(root, "absent.exe"))).toBe(false)
    expect(await checkAppExists(join(root, "directory.exe"))).toBe(false)
    expect(await resolveAppPath(join(root, "directory.exe"))).toBeNull()
    expect(await checkAppExists(join(root, "program"))).toBe(false)
    expect(await checkAppExists(join(root, "program\0"))).toBe(false)
    expect(await checkAppExists(join(root, "program.txt"))).toBe(false)
    expect(await resolveExecutable("absent", root)).toBeNull()
    expect(await resolveExecutable("directory", root)).toBeNull()
    if (process.platform !== "win32") expect(await resolveExecutable("program", root)).toBeNull()
    await chmod(join(root, "program"), 0o755)
    expect(await resolveExecutable("program", root)).toBe(join(root, "program"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { basename, join, normalize } from "node:path"
import { tmpdir } from "node:os"
import { checkAppExists, openDesktopPath, resolveAppPath, resolveExecutable } from "./apps"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"

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
  expect(opened).toEqual([normalize("/missing")])
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

test("desktop IPC trust: a renderer-supplied app must be one the open-in list offers", async () => {
  const opened: string[] = []
  const root = await mkdtemp(join(tmpdir(), "orchestra-open-"))
  try {
    // An absolute executable that exists and is runnable (the test runner itself) is still not an offered app.
    for (const app of [process.execPath, "/bin/sh", "sh", "-a", "../../bin/sh", "Calculator"]) {
      expect(await openDesktopPath(root, app, async (path) => (opened.push(path), ""))).toEqual({
        status: "failed",
        code: "app-unavailable",
      })
    }
    expect(opened).toEqual([])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("desktop IPC trust: only absolute paths are opened, so a path cannot be read as an option", async () => {
  const opened: string[] = []
  const open = async (path: string) => (opened.push(path), "")
  for (const path of ["-a", "--args", "-a /Applications/Calculator.app", "relative/file.txt", "", "/tmp/x\0y"]) {
    expect(await openDesktopPath(path, undefined, open)).toEqual({
      status: "failed",
      code: "open-failed",
      detail: "Invalid path",
    })
  }
  expect(opened).toEqual([])
  expect(await openDesktopPath("/tmp/a/../b.txt", undefined, open)).toEqual({ status: "opened" })
  expect(opened).toEqual([normalize("/tmp/b.txt")])
})

test("desktop IPC trust: launchable targets are revealed, never opened", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestra-launch-"))
  try {
    const opened: string[] = []
    const revealed: string[] = []
    const open = async (path: string) => (opened.push(path), "")
    await mkdir(join(root, "Tool.app"))
    await writeFile(join(root, "run.command"), "#!/bin/sh\n")
    await writeFile(join(root, "setup.exe"), "")
    await writeFile(join(root, "notes.md"), "# notes")
    for (const name of ["Tool.app", "run.command", "setup.exe"]) {
      expect(await openDesktopPath(join(root, name), undefined, open, (path) => revealed.push(path))).toEqual({
        status: "revealed",
      })
    }
    expect(revealed).toEqual([join(root, "Tool.app"), join(root, "run.command"), join(root, "setup.exe")])
    expect(opened).toEqual([])
    // Without a way to reveal, a launchable target is refused outright.
    expect(await openDesktopPath(join(root, "setup.exe"), undefined, open)).toMatchObject({ status: "failed" })
    expect(await openDesktopPath(join(root, "notes.md"), undefined, open)).toEqual({ status: "opened" })
    expect(opened).toEqual([join(root, "notes.md")])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

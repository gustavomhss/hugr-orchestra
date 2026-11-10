import { expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { chmod, lstat, mkdir, realpath, symlink, writeFile } from "node:fs/promises"
import { tmpdir as osTmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ReviewNativeFiles } from "../../src/review-toolkit/native-files"
import { tmpdir } from "../fixture/tmpdir"

const run = (root: string, files: ReadonlyArray<string>, extensions: ReadonlyArray<string> = [".py"]) =>
  Effect.runPromise(ReviewNativeFiles.select({ root, files, extensions }))

function denyWindowsTraverse(root: string) {
  const denied = Bun.spawnSync([
    "icacls", root, "/inheritance:r",
    "/deny", "*S-1-1-0:(OI)(CI)(F)",
    "/deny", "*S-1-5-32-544:(OI)(CI)(F)",
  ])
  if (denied.exitCode !== 0) throw new Error(`native-files-unreadable-root-unproven: ${denied.stderr.toString()} ${denied.stdout.toString()}`)
  return denied
}

function restoreWindowsTraverse(root: string, denied: ReturnType<typeof Bun.spawnSync>) {
  if (denied.exitCode !== 0) return
  const restored = Bun.spawnSync([
    "icacls", root, "/remove:d", "*S-1-1-0",
    "/remove:d", "*S-1-5-32-544",
    "/grant:r", "*S-1-5-32-544:(OI)(CI)(F)",
  ])
  if (restored.exitCode !== 0) throw new Error(`native-files-unreadable-root-unproven: ${restored.stderr.toString()}`)
}

function windowsDeniesTraverse() {
  if (process.platform !== "win32") return false
  const root = mkdtempSync(path.join(osTmpdir(), "native-files-deny-"))
  const denied = Bun.spawnSync([
    "icacls", root, "/inheritance:r",
    "/deny", "*S-1-1-0:(OI)(CI)(F)",
    "/deny", "*S-1-5-32-544:(OI)(CI)(F)",
  ])
  try {
    if (denied.exitCode !== 0) return false
    try {
      realpathSync(root)
      return false
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined
      return code === "EPERM" || code === "EACCES"
    }
  } finally {
    restoreWindowsTraverse(root, denied)
    rmSync(root, { recursive: true, force: true })
  }
}

const windowsDenies = windowsDeniesTraverse()

function readRoot(root: string) {
  return run(root, ["a.py"])
}

test("lexical refusals do not touch the filesystem", async () => {
  const missing = path.resolve(osTmpdir(), "no-such-native-files", `${Date.now()}`)
  expect(await run(missing, [])).toEqual({ status: "not-run", reason: "no-input" })
  expect(await run(missing, ["a.py\0"])).toEqual({ status: "not-run", reason: "nul" })
  expect(await run(missing, ["../outside.py"])).toEqual({ status: "not-run", reason: "path-outside" })
  expect(await run(missing, ["note.ts"])).toEqual({ status: "not-run", reason: "wrong-extension" })
  expect(await run(missing, [`${"a".repeat(Probe.Limits.outputBytes)}.py`])).toEqual({ status: "not-run", reason: "argv-bound" })
  expect(await lstat(missing).then(() => true, () => false)).toBe(false)
})

test("a foreign root flavor is unsupported before filesystem access", async () => {
  const root = process.platform === "win32" ? "/tmp/native-files-posix-root" : "C:\\native-files-win-root"
  expect(await run(root, ["a.py"])).toEqual({ status: "unsupported", reason: "nonnative-root" })
})

test("a regular file is returned at its canonical path, deduplicated and ordered", async () => {
  await using dir = await tmpdir()
  await writeFile(path.join(dir.path, "b.py"), "b\n")
  await writeFile(path.join(dir.path, "a.py"), "a\n")
  const selected = await run(dir.path, ["b.py", path.join(dir.path, "a.py"), "b.py"])
  expect(selected).toEqual({
    status: "ok",
    files: [await realpath(path.join(dir.path, "a.py")), await realpath(path.join(dir.path, "b.py"))],
  })
})

test("literal spaces and brackets do not select a sibling", async () => {
  await using dir = await tmpdir()
  await writeFile(path.join(dir.path, "a.py"), "plain\n")
  await writeFile(path.join(dir.path, "a b.py"), "space\n")
  await writeFile(path.join(dir.path, "a[b].py"), "brackets\n")
  const selected = await run(dir.path, ["a b.py", "a[b].py", "*.py"])
  expect(selected).toEqual({ status: "not-run", reason: "missing" })
  const literal = await run(dir.path, ["a b.py", "a[b].py"])
  expect(literal).toEqual({
    status: "ok",
    files: [await realpath(path.join(dir.path, "a b.py")), await realpath(path.join(dir.path, "a[b].py"))].sort(),
  })
})

test.skipIf(process.platform === "win32")("a posix backslash is a filename and does not select the nested sibling", async () => {
  await using dir = await tmpdir()
  await mkdir(path.join(dir.path, "literal"))
  await writeFile(path.join(dir.path, "literal", "name.py"), "nested\n")
  const literal = path.join(dir.path, "literal\\name.py")
  await writeFile(literal, "literal\n")
  const info = await lstat(literal)
  expect(info.isFile()).toBe(true)
  expect(info.isSymbolicLink()).toBe(false)
  expect(await run(dir.path, ["literal\\name.py"])).toEqual({ status: "ok", files: [literal] })
})

test("a parent symlink inside or outside the root is refused", async () => {
  await using dir = await tmpdir()
  await using outside = await tmpdir()
  await mkdir(path.join(dir.path, "real"))
  await writeFile(path.join(dir.path, "real", "a.py"), "in\n")
  await symlink(path.join(dir.path, "real"), path.join(dir.path, "link"))
  expect(await run(dir.path, ["link/a.py"])).toEqual({ status: "unsupported", reason: "symlink" })
  await mkdir(path.join(outside.path, "real"))
  await writeFile(path.join(outside.path, "real", "a.py"), "out\n")
  await symlink(path.join(outside.path, "real"), path.join(dir.path, "out"))
  expect(await run(dir.path, ["out/a.py"])).toEqual({ status: "unsupported", reason: "symlink" })
})

test("a directory, a missing file and a leaf symlink are refused", async () => {
  await using dir = await tmpdir()
  await mkdir(path.join(dir.path, "pkg.py"))
  await writeFile(path.join(dir.path, "real.py"), "x\n")
  await symlink(path.join(dir.path, "real.py"), path.join(dir.path, "leaf.py"))
  expect(await run(dir.path, ["pkg.py"])).toEqual({ status: "not-run", reason: "directory" })
  expect(await run(dir.path, ["missing.py"])).toEqual({ status: "not-run", reason: "missing" })
  expect(await run(dir.path, ["leaf.py"])).toEqual({ status: "unsupported", reason: "symlink" })
})

test("projected canonical arguments are bounded before missing candidates are stated", async () => {
  await using dir = await tmpdir()
  const root = path.join(dir.path, "segment")
  await mkdir(root)
  const canonical = await realpath(root)
  const count = Math.ceil(Probe.Limits.outputBytes / (Buffer.byteLength(canonical) + 1)) + 2
  const files = Array.from({ length: count }, (_, index) => `${index}.py`)
  const inputBytes = files.reduce((sum, file) => sum + Buffer.byteLength(file), 0)
  expect(inputBytes).toBeLessThanOrEqual(Probe.Limits.outputBytes)
  // Guard precedence, not an existence proof: these candidates are not created.
  expect(await run(root, files)).toEqual({ status: "not-run", reason: "argv-bound" })
  await writeFile(path.join(root, "a.py"), "a\n")
  expect(await run(root, Array.from({ length: count }, () => "a.py"))).toEqual({
    status: "ok",
    files: [await realpath(path.join(root, "a.py"))],
  })
})

test.skipIf(process.platform === "win32" && !windowsDenies)("an unreadable root fails named", async () => {
  if (process.getuid?.() === 0) throw new Error("native-files-unreadable-root-unproven")
  await using dir = await tmpdir()
  const root = path.join(dir.path, "sealed")
  await mkdir(root)
  await writeFile(path.join(root, "a.py"), "a\n")
  const result = process.platform === "win32" ? await deniedWindows(root) : await deniedPosix(root)
  expect(result).toEqual({ status: "not-run", reason: "unreadable" })
})

test.skipIf(process.platform !== "win32" || windowsDenies)("Windows runner still traverses after a deny ACE", async () => {
  await using dir = await tmpdir()
  const root = path.join(dir.path, "sealed")
  await mkdir(root)
  await writeFile(path.join(root, "a.py"), "a\n")
  const denied = denyWindowsTraverse(root)
  try {
    const error = await realpath(root).then(() => undefined, (error: NodeJS.ErrnoException) => error)
    expect(error).toBeUndefined()
  } finally {
    restoreWindowsTraverse(root, denied)
  }
})

async function deniedPosix(root: string) {
  await chmod(root, 0)
  try {
    return await readRoot(root)
  } finally {
    await chmod(root, 0o700)
  }
}

async function deniedWindows(root: string) {
  const denied = denyWindowsTraverse(root)
  try {
    return await readRoot(root)
  } finally {
    restoreWindowsTraverse(root, denied)
  }
}

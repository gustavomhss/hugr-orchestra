import { expect, test } from "bun:test"
import { closeSync, fstatSync, openSync, writeFileSync } from "node:fs"
import { lstat, readFile } from "node:fs/promises"
import { join, parse, sep } from "node:path"
import { artifactNative } from "../script/artifact-fs"
import { artifactDirectoryName, artifactOwnedHandle, requireArtifactHost } from "../script/artifact-native"
import { requireOrdinaryWindowsPath } from "../script/artifact-windows-root"
import { namedTargets } from "../script/targets"
import { artifactFixture } from "./artifact-fs.test"
import { artifactPosix } from "../script/artifact-posix"

test("POSIX per-call errno adapter ignores ambient errno and never suppresses EAGAIN", () => {
  const parent = { handle: 1n, identity: "unused-on-failure" }
  const calls = { open: () => -2, mkdir: () => -17, unlink: () => -2, publish: () => -17, list: () => [],
    flags: { root: 0, directory: 0, read: 0, write: 0 }, close: () => {},
    errno: () => { throw new Error("ambient errno must never be sampled") } }
  const native = artifactPosix(calls)
  expect(() => native.directory(parent, "existing", { create: true })).toThrow("open directory failed: ENOENT")
  expect(() => native.directory(parent, "existing", { create: true, exclusive: true })).toThrow("mkdir failed: EEXIST")
  expect(() => artifactPosix({ ...calls, mkdir: () => -11 }).directory(parent, "new", { create: true })).toThrow("mkdir failed: 11")
  expect(() => native.root("/")).toThrow("open root failed: ENOENT")
  expect(() => native.write(parent, "new", Buffer.from("bytes"), false)).toThrow("create file failed: ENOENT")
  expect(() => native.removeFile(parent, "missing")).not.toThrow()
  expect(() => native.removeDirectory(parent, "missing", parent)).not.toThrow()
  expect(() => artifactPosix({ ...calls, unlink: () => -11 }).removeFile(parent, "file")).toThrow("unlink file failed: 11")
  expect(() => artifactPosix({ ...calls, open: () => -11 }).removeDirectory(parent, "dir", parent)).toThrow("reopen cleanup directory failed: 11")
})

if (process.platform !== "win32")
  test("POSIX native ABI returns captured errno for collision missing paths and exclusive rename", () =>
    artifactFixture(async (input) => {
      const operations = await (async () => {
        if (process.platform === "linux") {
          const { artifactLinuxOperations } = await import("../script/artifact-linux")
          return artifactLinuxOperations()
        }
        const { artifactDarwinOperations } = await import("../script/artifact-darwin")
        return artifactDarwinOperations()
      })()
      const parent = operations.open(-1, input.root, operations.flags.directory, 0)
      try {
        expect(parent).toBeGreaterThanOrEqual(0)
        expect(operations.mkdir(parent, "existing")).toBe(0)
        expect(operations.mkdir(parent, "existing")).toBe(-17)
        expect(operations.open(parent, "missing", operations.flags.read, 0)).toBe(-2)
        expect(operations.unlink(parent, "missing", false)).toBe(-2)
        expect(operations.mkdir(parent, "stage")).toBe(0)
        expect(operations.publish(parent, "stage", "existing")).toBe(-17)
        expect(operations.list(parent)).toContain("stage")
        expect(() => operations.list(-1)).toThrow("Artifact fdopendir failed: 9")
        const empty = operations.open(parent, "existing", operations.flags.directory, 0)
        try {
          expect(empty).toBeGreaterThanOrEqual(0)
          expect(operations.list(empty)).toEqual([])
        } finally { if (empty >= 0) closeSync(empty) }
      } finally { if (parent >= 0) closeSync(parent); operations.close() }
    }))

test("producer host policy admits Windows 64-bit CPUs and rejects unsupported hosts", () => {
  for (const cpu of ["x64", "arm64"]) expect(() => requireArtifactHost("win32", cpu)).not.toThrow()
  for (const cpu of ["ia32", "arm", "riscv64", ""]) expect(() => requireArtifactHost("win32", cpu)).toThrow("Unsupported artifact producer host")
  expect(namedTargets.some((entry) => entry.target === "windows-arm64")).toBe(true)
  expect(() => requireArtifactHost("freebsd", "x64")).toThrow("Unsupported artifact producer host")
})

test("ordinary Windows grammar rejects namespace GUID drive-relative and stream spellings", () => {
  for (const path of [
    "\\\\?\\C:\\dist",
    "\\\\.\\C:\\dist",
    "\\\\?\\Volume{abc}\\dist",
    "C:relative",
    "C:\\dir:stream",
    "\\root-relative",
  ])
    expect(() => requireOrdinaryWindowsPath(path)).toThrow("Unsupported artifact Windows")
  for (const path of ["C:\\dist", "\\\\server\\share\\dist", "packages/cli/dist"])
    expect(() => requireOrdinaryWindowsPath(path)).not.toThrow()
})

test("directory name decoder rejects invalid UTF8 and preserves literal BOM bytes", () => {
  expect(() => artifactDirectoryName(Buffer.from([0xff]))).toThrow("Invalid UTF-8 artifact directory name")
  expect(artifactDirectoryName(Buffer.from("\ufeffmanifest.json"))).toBe("\ufeffmanifest.json")
})

test("constructor inspection failure releases actual newly opened resource", () =>
  artifactFixture(async (input) => {
    if (process.platform !== "win32") {
      const fd = openSync(join(input.bin, "orchestra"), "r")
      expect(fstatSync(fd).isFile()).toBe(true)
      expect(() =>
        artifactOwnedHandle(
          fd,
          () => {
            throw new Error("controlled fstat failure")
          },
          closeSync,
        ),
      ).toThrow("controlled fstat failure")
      expect(() => fstatSync(fd)).toThrow("EBADF")
      return
    }
    const native = await artifactNative()
    const root = native.root(parse(input.root).root)
    try {
      expect(root.identity.length).toBeGreaterThan(0)
      expect(() =>
        artifactOwnedHandle(
          root,
          () => {
            throw new Error("controlled identity failure")
          },
          native.closeDirectory,
        ),
      ).toThrow("controlled identity failure")
      expect(() => native.directory(root, "Windows")).toThrow("NTSTATUS 0xc0000008")
    } finally {
      native.close()
    }
  }))

if (process.platform !== "win32")
  test("native directory scan rejects actual invalid UTF8 filesystem names", () =>
    artifactFixture(async (input) => {
      const native = await artifactNative()
      const start = parse(input.root).root
      const pins = [native.root(start)]
      input.root
        .slice(start.length)
        .split(sep)
        .filter(Boolean)
        .forEach((name) => pins.push(native.directory(pins.at(-1)!, name)))
      const parent = pins.at(-1)!
      try {
        const path = Buffer.concat([Buffer.from(`${input.root}/`), Buffer.from([0xff])])
        try {
          writeFileSync(path, "raw name")
        } catch (error) {
          if (
            process.platform !== "darwin" ||
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "EILSEQ"
          )
            throw error
          expect(error.code).toBe("EILSEQ")
          return
        }
        expect(await readFile(path, "utf8")).toBe("raw name")
        expect(() => native.list(parent)).toThrow("Invalid UTF-8 artifact directory name")
      } finally {
        pins.reverse().forEach((pin) => native.closeDirectory(pin))
        native.close()
      }
    }))

if (process.platform === "darwin")
  test("Darwin SDK openat shim proves initial file mode before any fchmod", () =>
    artifactFixture(async (input) => {
      const { artifactDarwinOperations } = await import("../script/artifact-darwin")
      const operations = await artifactDarwinOperations()
      const parent = operations.open(-1, input.root, operations.flags.directory, 0)
      try {
        for (const [index, mode] of [0o600, 0o640, 0o601, 0o400].entries()) {
          const fd = operations.open(parent, `initial-${index}`, operations.flags.write, mode)
          expect(fd).toBeGreaterThanOrEqual(0)
          try {
            expect(fstatSync(fd).mode & 0o777).toBe(mode & ~process.umask())
          } finally {
            closeSync(fd)
          }
        }
      } finally {
        closeSync(parent)
        operations.close()
      }
    }))

if (process.platform === "win32")
  test("native Windows root rejects SUBST and namespace roots before acquisition", () =>
    artifactFixture(async (input) => {
      const letters = "ZYXWVUTSRQPONMLKJIHGFED".split("")
      const drive = (
        await Promise.all(
          letters.map(async (letter) => ({
            letter,
            exists: await lstat(`${letter}:\\`).then(
              () => true,
              (error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return false
                throw error
              },
            ),
          })),
        )
      ).find((entry) => !entry.exists)?.letter
      if (!drive) throw new Error("Native SUBST control requires one free test drive")
      const mapped = Bun.spawnSync(["subst", `${drive}:`, input.root], { stdout: "pipe", stderr: "pipe" })
      expect(mapped.exitCode).toBe(0)
      const native = await artifactNative()
      try {
        expect((await lstat(`${drive}:\\`)).isDirectory()).toBe(true)
        expect(() => native.root(`${drive}:\\`)).toThrow("Unsupported artifact Windows volume mapping")
        expect(() => native.root("\\\\?\\C:\\")).toThrow("Unsupported artifact Windows root grammar")
      } finally {
        native.close()
        expect(Bun.spawnSync(["subst", `${drive}:`, "/D"], { stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0)
      }
    }))

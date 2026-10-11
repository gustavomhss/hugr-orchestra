import { expect, test } from "bun:test"
import { closeSync, fstatSync, openSync, writeFileSync } from "node:fs"
import { lstat, readFile } from "node:fs/promises"
import { join, parse, sep } from "node:path"
import { artifactNative } from "../script/artifact-fs"
import { artifactDirectoryName, artifactOwnedHandle, requireArtifactHost } from "../script/artifact-native"
import { requireOrdinaryWindowsPath } from "../script/artifact-windows-root"
import { namedTargets } from "../script/targets"
import { artifactFixture } from "./artifact-fs.test"

test("producer host policy rejects Windows ARM but preserves Windows ARM targets", () => {
  expect(() => requireArtifactHost("win32", "arm64")).toThrow("Unsupported artifact producer host: win32/arm64")
  expect(() => requireArtifactHost("win32", "x64")).not.toThrow()
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

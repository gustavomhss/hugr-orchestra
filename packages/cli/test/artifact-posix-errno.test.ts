import { describe, expect, test } from "bun:test"
import { closeSync, fstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { artifactPosix } from "../script/artifact-posix"
import type { ArtifactPosixInput } from "../script/artifact-posix"
import type { Pointer } from "bun:ffi"

async function fixture(run: (input: {
  calls: ArtifactPosixInput
  parent: number
  path: string
  disturb(code?: number): void
}) => Promise<void>) {
  const path = await realpath(await mkdtemp(join(process.env.ORCHESTRA_ARTIFACT_TEST_ROOT ?? tmpdir(), "artifact-errno-")))
  const calls = await (async () => {
    if (process.platform === "linux") {
      const { artifactLinuxOperations } = await import("../script/artifact-linux")
      return artifactLinuxOperations()
    }
    const { artifactDarwinOperations } = await import("../script/artifact-darwin")
    return artifactDarwinOperations()
  })()
  const { dlopen, toArrayBuffer } = await import("bun:ffi")
  const library = await (async () => {
    if (process.platform !== "linux") return "/usr/lib/libSystem.B.dylib"
    const { artifactLinuxRuntime } = await import("../script/artifact-elf")
    return (await artifactLinuxRuntime()).library
  })()
  const symbol = process.platform === "linux" ? "__errno_location" : "__error"
  const libc = dlopen(library, {
    [symbol]: { args: [], returns: "ptr" },
    close: { args: ["i32"], returns: "i32" },
    unlinkat: { args: ["i32", "buffer", "i32"], returns: "i32" },
  })
  const live = new DataView(toArrayBuffer(libc.symbols[symbol]() as Pointer, 0, 4))
  const parent = calls.open(-1, path, calls.flags.root, 0)
  expect(parent).toBeGreaterThanOrEqual(0)
  mkdirSync(join(path, "existing"))
  mkdirSync(join(path, "stage"))
  writeFileSync(join(path, "regular"), "regular bytes")
  try {
    await run({ calls, parent, path, disturb: (code = 9) => {
      // Real unrelated libc calls, not writes to errno or replacement syscall results.
      const result = code === 9 ? libc.symbols.close(-42)
        : libc.symbols.unlinkat(parent, Buffer.from("disturb-missing\0"), 0)
      const errno = live.getInt32(0, true)
      expect(result).toBe(-1)
      expect(errno).toBe(code)
    } })
  } finally {
    closeSync(parent)
    libc.close()
    calls.close()
    await rm(path, { recursive: true, force: true })
  }
}

describe.skipIf(process.platform === "win32")("actual POSIX artifact errno boundary", () => {
  test("same-call EEXIST ENOENT EBADF survive unrelated libc errno changes", () => fixture(async (input) => {
    const calls = input.calls
    const cases = [
      ["mkdir EEXIST", () => calls.mkdir(input.parent, "existing"), 17],
      ["mkdir ENOENT", () => calls.mkdir(input.parent, "missing/child"), 2],
      ["mkdir EBADF", () => calls.mkdir(-42, "child"), 9],
      ["open EEXIST", () => calls.open(input.parent, "regular", calls.flags.write, 0o600), 17],
      ["open ENOENT", () => calls.open(input.parent, "absent", calls.flags.read, 0), 2],
      ["open EBADF", () => calls.open(-42, "child", calls.flags.directory, 0), 9],
      ["unlink ENOENT", () => calls.unlink(input.parent, "absent", false), 2],
      ["unlink EBADF", () => calls.unlink(-42, "child", false), 9],
      ["publish EEXIST", () => calls.publish(input.parent, "stage", "existing"), 17],
      ["publish ENOENT", () => calls.publish(input.parent, "absent", "output"), 2],
      ["publish EBADF", () => calls.publish(-42, "stage", "output"), 9],
    ] as const
    for (const [name, operation, code] of cases) {
      const result = operation()
      const captured = calls.errno()
      expect({ name, result, captured }).toEqual({ name, result: -1, captured: code })
      input.disturb(code === 9 ? 2 : 9)
      expect({ name, errno: calls.errno() }).toEqual({ name, errno: code })
    }
    // Success must replace a prior failure snapshot, not retain stale errno.
    expect(calls.mkdir(input.parent, "created-é")).toBe(0)
    input.disturb()
    expect(calls.errno()).toBe(0)
  }))

  test("consumer uses operation errno for reuse, exclusivity, missing entries and invalid descriptors", () => fixture(async (input) => {
    const state = { interleavings: 0 }
    const interleave = <A extends unknown[]>(operation: (...args: A) => number) => (...args: A) => {
      const result = operation(...args)
      input.disturb()
      state.interleavings++
      return result
    }
    const native = artifactPosix({ ...input.calls,
      open: interleave(input.calls.open), mkdir: interleave(input.calls.mkdir),
      unlink: interleave(input.calls.unlink), publish: interleave(input.calls.publish),
    })
    const parent = { handle: BigInt(input.parent), identity: "fixture" }
    const stage = native.directory(parent, "staging-é", { create: true, exclusive: true })
    const reused = native.directory(parent, "staging-é", { create: true })
    const bytes = Buffer.from([0, 255, 128, 1, 42])
    const invalid = { handle: -42n, identity: "invalid" }
    const reject = async (operation: () => unknown, code: string | number, errno: number, leaf: string, fd = input.parent) => {
      await expect(Promise.resolve().then(operation)).rejects.toMatchObject({ code, errno, leaf, parent: fd, result: -1 })
    }
    try {
      expect(reused.identity).toBe(stage.identity)
      await reject(() => native.directory(parent, "staging-é", { create: true, exclusive: true }), "EEXIST", 17, "staging-é")
      await reject(() => native.directory(invalid, "child", { create: true }), 9, 9, "child", -42)
      native.write(stage, "exécutable", bytes, true)
      native.write(stage, "plain", bytes, false)
      expect(readFileSync(join(input.path, "staging-é/exécutable"))).toEqual(bytes)
      const executable = input.calls.open(Number(stage.handle), "exécutable", input.calls.flags.read, 0)
      const plain = input.calls.open(Number(stage.handle), "plain", input.calls.flags.read, 0)
      try {
        expect(fstatSync(executable).mode & 0o777).toBe(0o755)
        expect(fstatSync(plain).mode & 0o777).toBe(0o644)
      } finally { closeSync(executable); closeSync(plain) }
      await reject(() => native.write(stage, "plain", Buffer.from("replacement"), false), "EEXIST", 17, "plain", Number(stage.handle))
      await reject(() => native.read(stage, "absent"), "ENOENT", 2, "absent", Number(stage.handle))
      expect(() => native.removeFile(stage, "absent")).not.toThrow()
      await reject(() => native.removeFile(invalid, "absent"), 9, 9, "absent", -42)
      await expect(Promise.resolve().then(() => native.publish(parent, "staging-é", stage, "existing")))
        .rejects.toMatchObject({ code: "EEXIST", errno: 17, parent: input.parent, leaf: "staging-é", output: "existing", result: -1 })
      expect(native.list(stage).sort()).toEqual(["exécutable", "plain"])
      native.publish(parent, "staging-é", stage, "published-é")
      const published = native.directory(parent, "published-é", { create: true })
      try {
        expect(published.identity).toBe(stage.identity)
        expect(native.read(published, "exécutable").bytes).toEqual(bytes)
        expect(native.read(published, "plain").bytes).toEqual(bytes)
        native.removeFile(published, "exécutable")
        native.removeFile(published, "plain")
        native.removeDirectory(parent, "published-é", published)
        expect(() => native.removeDirectory(parent, "published-é", published)).not.toThrow()
      } finally { native.closeDirectory(published) }
      expect(state.interleavings).toBeGreaterThan(20)
    } finally {
      native.closeDirectory(reused)
      native.closeDirectory(stage)
    }
  }))

  test("readdir EOF uses live zero errno; failed fdopendir preserves ENOTDIR before duplicate cleanup", () => fixture(async (input) => {
    expect(input.calls.mkdir(input.parent, "existing")).toBe(-1)
    expect(input.calls.errno()).toBe(17)
    input.disturb()
    expect(input.calls.list(input.parent).sort()).toEqual(["existing", "regular", "stage"])
    expect(input.calls.list(input.parent).sort()).toEqual(["existing", "regular", "stage"])
    expect(() => input.calls.list(-42)).toThrow("Artifact dup failed: 9")
    const file = input.calls.open(input.parent, "regular", input.calls.flags.read, 0)
    try {
      expect(() => input.calls.list(file)).toThrow("Artifact fdopendir failed: 20")
      expect(fstatSync(file).isFile()).toBe(true)
    } finally { closeSync(file) }
  }))
})

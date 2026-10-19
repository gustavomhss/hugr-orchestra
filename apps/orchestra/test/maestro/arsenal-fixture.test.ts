import { expect, test } from "bun:test"
import path from "node:path"
import { existsSync, lstatSync } from "node:fs"
import { lstat, mkdir, readlink, realpath, symlink, unlink } from "node:fs/promises"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"
import { rejection, rethrow } from "../lib/rejection"

test("SDK fixture preserves actual package-resolution identity; conflicting existing modules are rejected", async () => {
  await using tmp = await tmpdir()
  const config = path.join(tmp.path, "config")
  await prepareArsenalSDK(tmp.path, config)
  const installed = Bun.resolveSync("@orchestra/plugin/package.json", path.resolve(import.meta.dir, "../.."))
  const sdk = await Bun.file(installed).json()
  for (const root of [config, path.join(tmp.path, ".orchestra")]) {
    expect((await Bun.file(path.join(root, "package.json")).json()).dependencies).toEqual({ [sdk.name]: sdk.version })
    expect(await realpath(Bun.resolveSync("@orchestra/plugin/package.json", root))).toBe(await realpath(installed))
  }
  await using conflict = await tmpdir()
  await mkdir(path.join(conflict.path, ".orchestra/node_modules/@orchestra/plugin"), { recursive: true })
  expect(await rethrow(prepareArsenalSDK(conflict.path, path.join(conflict.path, "config")))).toThrow(
    "Arsenal fixture SDK installation mismatch",
  )
  await settleArsenalConfig(path.join(conflict.path, "config"))
})

test("SDK fixture accepts an existing distinct modules root only with the same physical SDK", async () => {
  await using tmp = await tmpdir()
  const config = path.join(tmp.path, "config")
  const modules = path.join(tmp.path, "shared-modules")
  const installed = await realpath(
    Bun.resolveSync("@orchestra/plugin/package.json", path.resolve(import.meta.dir, "../..")),
  )
  await mkdir(path.join(modules, "@orchestra"), { recursive: true })
  await symlink(
    path.dirname(installed),
    path.join(modules, "@orchestra/plugin"),
    process.platform === "win32" ? "junction" : "dir",
  )
  await mkdir(config)
  await symlink(modules, path.join(config, "node_modules"), process.platform === "win32" ? "junction" : "dir")
  await prepareArsenalSDK(tmp.path, config)
  expect(await realpath(path.join(config, "node_modules"))).toBe(await realpath(modules))
  expect(await realpath(Bun.resolveSync("@orchestra/plugin/package.json", config))).toBe(installed)
})

test("shared config SDK identity is prepared before test bootstrap", async () => {
  const directory = process.env.XDG_CONFIG_HOME
  if (!directory) throw new Error("Test config directory missing")
  const config = path.join(directory, "orchestra")
  expect(await realpath(path.join(config, "node_modules"))).toBe(path.join(await realpath(config), "node_modules"))
  expect(await realpath(Bun.resolveSync("@orchestra/plugin/package.json", config))).toBe(
    await realpath(Bun.resolveSync("@orchestra/plugin/package.json", path.resolve(import.meta.dir, "../.."))),
  )
})

test("fixture cleanup removes owned SDK junctions without deleting the installed SDK", async () => {
  const tmp = await tmpdir()
  const installed = await realpath(
    Bun.resolveSync("@orchestra/plugin/package.json", path.resolve(import.meta.dir, "../..")),
  )
  const before = await Bun.file(installed).text()
  await prepareArsenalSDK(tmp.path, path.join(tmp.path, "config"))
  for (const root of ["config", ".orchestra"]) {
    const link = path.join(tmp.path, root, "node_modules/@orchestra/plugin")
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(await realpath(link)).toBe(path.dirname(installed))
    console.info(
      "fixture cleanup link:",
      JSON.stringify({ root: tmp.path, link, target: await readlink(link), symbolicLink: true }),
    )
  }
  await tmp[Symbol.asyncDispose]()
  expect(await rejection(lstat(tmp.path))).toMatchObject({ code: "ENOENT" })
  expect(await Bun.file(installed).text()).toBe(before)
  console.info("fixture cleanup SDK:", JSON.stringify({ root: tmp.path, removed: true, installed, unchanged: true }))
})

test("fixture cleanup never follows nested links into another directory", async () => {
  await using shared = await tmpdir()
  const tmp = await tmpdir()
  const sentinel = path.join(shared.path, "keep.txt")
  await Bun.write(sentinel, "shared target survives")
  await mkdir(path.join(tmp.path, "nested"))
  const link = path.join(tmp.path, "nested", "shared")
  await symlink(shared.path, link, process.platform === "win32" ? "junction" : "dir")
  expect((await lstat(link)).isSymbolicLink()).toBe(true)
  expect(await realpath(link)).toBe(shared.path)
  console.info(
    "fixture cleanup link:",
    JSON.stringify({ root: tmp.path, link, target: await readlink(link), symbolicLink: true }),
  )
  if (process.platform !== "win32") {
    await symlink(
      path.relative(path.join(tmp.path, "nested"), shared.path),
      path.join(tmp.path, "nested", "relative"),
      "dir",
    )
    await symlink(sentinel, path.join(tmp.path, "nested", "file"), "file")
    await symlink(path.join(shared.path, "missing"), path.join(tmp.path, "nested", "dangling"), "file")
  }
  await tmp[Symbol.asyncDispose]()
  expect(await rejection(lstat(tmp.path))).toMatchObject({ code: "ENOENT" })
  expect((await lstat(shared.path)).isDirectory()).toBe(true)
  expect(await Bun.file(sentinel).text()).toBe("shared target survives")
  // Removing an already-absent root must not act on any former link target.
  await tmp[Symbol.asyncDispose]()
  expect(await Bun.file(sentinel).text()).toBe("shared target survives")
  console.info(
    "fixture cleanup nonescape:",
    JSON.stringify({ root: tmp.path, removed: true, sentinel, unchanged: true }),
  )
})

test.skipIf(process.platform !== "win32")(
  "fixture cleanup retries a junction held without delete sharing",
  async () => {
    const { dlopen, ptr } = await import("bun:ffi")
    await using shared = await tmpdir()
    await using tmp = await tmpdir()
    const link = path.join(tmp.path, "shared")
    await Bun.write(path.join(shared.path, "keep.txt"), "shared target survives")
    await symlink(shared.path, link, "junction")
    const kernel = dlopen("kernel32.dll", {
      CreateFileW: { args: ["ptr", "u32", "u32", "ptr", "u32", "u32", "u64"], returns: "u64" },
      CloseHandle: { args: ["u64"], returns: "i32" },
    })
    // Open the junction itself, sharing reads/writes but denying deletion; never lock its shared target.
    const handle = kernel.symbols.CreateFileW(
      ptr(Buffer.from(link + "\0", "utf16le")),
      0x80000000,
      3,
      null,
      3,
      0x02200000,
      0n,
    )
    const lock = { closed: false }
    const unlock = () => {
      if (lock.closed) return
      lock.closed = true
      expect(kernel.symbols.CloseHandle(handle)).toBe(1)
    }
    try {
      expect(handle).not.toBe(0xffffffffffffffffn)
      const blocked = await unlink(link).then(
        () => undefined,
        (error: unknown) => error,
      )
      expect(blocked).toMatchObject({ code: expect.stringMatching(/^(EBUSY|EPERM)$/) })
      expect((await lstat(link)).isSymbolicLink()).toBe(true)
      console.info("fixture cleanup locked junction:", JSON.stringify({ root: tmp.path, link, blocked }))
      // The real handle stays held during cleanup's first unlink attempts, then releases within its existing bound.
      const release = Bun.sleep(100).then(unlock)
      try {
        await tmp[Symbol.asyncDispose]()
        expect(await rejection(lstat(tmp.path))).toMatchObject({ code: "ENOENT" })
        expect(await Bun.file(path.join(shared.path, "keep.txt")).text()).toBe("shared target survives")
      } finally {
        await release
      }
    } finally {
      unlock()
      kernel.close()
    }
  },
)

test("SDK fixture refuses workspace aliases at modules root and scoped parent", async () => {
  const modules = await realpath(path.resolve(import.meta.dir, "../../../../node_modules"))
  const scope = path.dirname(
    path.dirname(
      await realpath(Bun.resolveSync("@orchestra/plugin/package.json", path.resolve(import.meta.dir, "../.."))),
    ),
  )
  const manifest = path.join(scope, "plugin", "package.json")
  const before = await Bun.file(manifest).text()
  for (const scoped of [false, true]) {
    const disposals: string[] = []
    const tmp = await tmpdir({
      dispose: async (directory) => {
        disposals.push(directory)
      },
    })
    const root = tmp.path
    expect(Object.getOwnPropertyDescriptor(tmp, "path")?.get).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(tmp, "path")?.value).toBe(root)
    const target = path.join(root, ".orchestra", "node_modules")
    const link = scoped ? path.join(target, "@orchestra") : target
    await mkdir(scoped ? target : path.dirname(target), { recursive: true })
    await symlink(scoped ? scope : modules, link, process.platform === "win32" ? "junction" : "dir")
    expect((await lstat(link)).isSymbolicLink()).toBe(true)
    expect(await realpath(link)).toBe(scoped ? scope : modules)
    console.info(
      "fixture cleanup link:",
      JSON.stringify({
        platform: process.platform,
        root: tmp.path,
        link,
        target: await readlink(link),
        symbolicLink: (await lstat(link)).isSymbolicLink(),
      }),
    )
    expect(await rethrow(prepareArsenalSDK(root, path.join(root, "config")))).toThrow(
      "modules parent outside fixture ownership",
    )
    console.info(
      "fixture config publication after rejection:",
      JSON.stringify({
        root,
        publication: await lstat(path.join(root, "config", "package-lock.json")).then(
          (entry) => ({ size: entry.size }),
          (error: unknown) => {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
              return "pending"
            throw error
          },
        ),
      }),
    )
    // Promise.all rejects before the other SDK branch finishes. Its recursive mkdir/Bun.write can recreate
    // an already-removed root. Observe that branch's final publication before releasing its owned directory.
    await settleArsenalConfig(path.join(root, "config"))
    try {
      await tmp[Symbol.asyncDispose]()
      expect(disposals).toEqual([root])
    } finally {
      console.info("fixture cleanup root:", JSON.stringify(await observeRoot(root)))
    }
    const absent = await observeRoot(root)
    expect(absent.existsSync).toBe(false)
    expect(absent.sync).toBeNull()
    expect(absent.async.exists).toBe(false)
    if (absent.native) {
      expect(absent.native.attributes).toBe(0xffffffff)
      expect([2, 3]).toContain(absent.native.error)
    }
    expect(await rejection(lstat(root))).toMatchObject({ code: "ENOENT" })
    expect(await realpath(modules)).toBe(modules)
    expect(await realpath(scope)).toBe(scope)
    expect(await Bun.file(manifest).text()).toBe(before)
  }
})

test("root observation detects real recreation and rejects a surviving fixture root", async () => {
  await using tmp = await tmpdir()
  const root = tmp.path
  const original = await observeRoot(root)
  expect(original.existsSync).toBe(true)
  expect(original.sync?.isDirectory).toBe(true)
  expect(original.async.exists).toBe(true)
  await tmp[Symbol.asyncDispose]()
  const absent = await observeRoot(root)
  expect(absent.existsSync).toBe(false)
  expect(absent.sync).toBeNull()
  expect(absent.async.exists).toBe(false)
  if (absent.native) {
    expect(absent.native.attributes).toBe(0xffffffff)
    expect([2, 3]).toContain(absent.native.error)
  }
  // The same real Bun.write used by SDK preparation recreates missing parents; this is not cached metadata.
  await Bun.write(path.join(root, "config", "published.txt"), "late publisher")
  const recreated = await observeRoot(root)
  expect(recreated.existsSync).toBe(true)
  expect(recreated.sync?.isDirectory).toBe(true)
  expect(recreated.async.exists).toBe(true)
  if (recreated.native) expect(recreated.native.attributes & 0x10).toBe(0x10)
  expect(await Bun.file(path.join(root, "config", "published.txt")).text()).toBe("late publisher")
  const survivor = await rejection(lstat(root)).then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(survivor).toMatchObject({ message: "Expected promise to reject" })
  console.info("fixture cleanup API controls:", JSON.stringify({ original, absent, recreated }))
  await tmp[Symbol.asyncDispose]()
  expect(await rejection(lstat(root))).toMatchObject({ code: "ENOENT" })
})

async function settleArsenalConfig(config: string) {
  const deadline = performance.now() + 5_000
  for (;;) {
    const published = await lstat(path.join(config, "package-lock.json")).then(
      (entry) => entry.isFile() && entry.size > 0,
      (error: unknown) => {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return false
        throw error
      },
    )
    if (published) return
    if (performance.now() >= deadline) throw new Error(`Arsenal config publication still pending: ${config}`)
    await Bun.sleep(25)
  }
}

async function observeRoot(root: string) {
  const sync = lstatSync(root, { throwIfNoEntry: false })
  const async = await lstat(root).then(
    (entry) => ({ exists: true, ino: entry.ino, birthtime: entry.birthtimeMs }),
    (error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
        return { exists: false }
      throw error
    },
  )
  const native = await (async () => {
    if (process.platform !== "win32") return undefined
    const { dlopen, ptr } = await import("bun:ffi")
    const kernel = dlopen("kernel32.dll", {
      GetFileAttributesW: { args: ["ptr"], returns: "u32" },
      GetLastError: { args: [], returns: "u32" },
    })
    try {
      const attributes = kernel.symbols.GetFileAttributesW(ptr(Buffer.from(root + "\0", "utf16le")))
      return { attributes, error: attributes === 0xffffffff ? kernel.symbols.GetLastError() : 0 }
    } finally {
      kernel.close()
    }
  })()
  return {
    root,
    existsSync: existsSync(root),
    sync: sync ? { ino: sync.ino, birthtime: sync.birthtimeMs, isDirectory: sync.isDirectory() } : null,
    async,
    native,
  }
}

import { expect, test } from "bun:test"
import path from "node:path"
import { lstat, mkdir, readlink, realpath, symlink, unlink } from "node:fs/promises"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"
import { rethrow } from "../lib/rejection"

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
  await expect(lstat(tmp.path)).rejects.toMatchObject({ code: "ENOENT" })
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
  await expect(lstat(tmp.path)).rejects.toMatchObject({ code: "ENOENT" })
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
        await expect(lstat(tmp.path)).rejects.toMatchObject({ code: "ENOENT" })
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
    const tmp = await tmpdir()
    const target = path.join(tmp.path, ".orchestra", "node_modules")
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
    expect(await rethrow(prepareArsenalSDK(tmp.path, path.join(tmp.path, "config")))).toThrow(
      "modules parent outside fixture ownership",
    )
    try {
      await tmp[Symbol.asyncDispose]()
    } finally {
      console.info(
        "fixture cleanup root:",
        JSON.stringify({
          root: tmp.path,
          exists: await lstat(tmp.path).then(
            () => true,
            (error: unknown) => {
              if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
                return false
              throw error
            },
          ),
        }),
      )
    }
    await expect(lstat(tmp.path)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await realpath(modules)).toBe(modules)
    expect(await realpath(scope)).toBe(scope)
    expect(await Bun.file(manifest).text()).toBe(before)
  }
})

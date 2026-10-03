import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, realpath, symlink } from "node:fs/promises"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"

test("SDK fixture preserves actual package-resolution identity; conflicting existing modules are rejected", async () => {
  await using tmp = await tmpdir()
  const config = path.join(tmp.path, "config")
  await prepareArsenalSDK(tmp.path, config)
  const installed = Bun.resolveSync("@opencode-ai/plugin/package.json", path.resolve(import.meta.dir, "../.."))
  const sdk = await Bun.file(installed).json()
  for (const root of [config, path.join(tmp.path, ".opencode")]) {
    expect((await Bun.file(path.join(root, "package.json")).json()).dependencies).toEqual({ [sdk.name]: sdk.version })
    expect(await realpath(Bun.resolveSync("@opencode-ai/plugin/package.json", root))).toBe(await realpath(installed))
  }
  await using conflict = await tmpdir()
  await mkdir(path.join(conflict.path, ".opencode/node_modules"), { recursive: true })
  await expect(prepareArsenalSDK(conflict.path, path.join(conflict.path, "config"))).rejects.toThrow("Arsenal fixture SDK installation mismatch")
})

test("SDK fixture accepts an existing distinct modules root only with the same physical SDK", async () => {
  await using tmp = await tmpdir()
  const config = path.join(tmp.path, "config")
  const modules = path.join(tmp.path, "shared-modules")
  const installed = await realpath(Bun.resolveSync("@opencode-ai/plugin/package.json", path.resolve(import.meta.dir, "../..")))
  await mkdir(path.join(modules, "@opencode-ai"), { recursive: true })
  await symlink(path.dirname(installed), path.join(modules, "@opencode-ai/plugin"), process.platform === "win32" ? "junction" : "dir")
  await mkdir(config)
  await symlink(modules, path.join(config, "node_modules"), process.platform === "win32" ? "junction" : "dir")
  await prepareArsenalSDK(tmp.path, config)
  expect(await realpath(path.join(config, "node_modules"))).toBe(await realpath(modules))
  expect(await realpath(Bun.resolveSync("@opencode-ai/plugin/package.json", config))).toBe(installed)
})

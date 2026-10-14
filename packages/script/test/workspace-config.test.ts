import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sourceModule, workspaceConfig } from "../../../nix/scripts/workspace-config.ts"

const modules = [
  { alias: "script", kind: "bun", scope: ".", name: "@orchestra/script", path: "tools/source-script" },
  { alias: "core", kind: "bun", scope: ".", name: "@orchestra/core", path: "domains/runtime-core" },
]
const registry = { format: 1, modules }

test("workspace config follows registered identities outside packages with an absolute source base", () => {
  expect(workspaceConfig("fixture/source", registry)).toEqual({ compilerOptions: {
    baseUrl: resolve("fixture/source"),
    paths: {
      "@orchestra/script/*": ["tools/source-script/src/*.ts"],
      "@orchestra/core/*": ["domains/runtime-core/src/*.ts"],
    },
  } })
  // Serialization in an external output directory must retain the source base.
  expect(JSON.parse(JSON.stringify(workspaceConfig("fixture/source", registry))).compilerOptions.baseUrl)
    .toBe(resolve("fixture/source"))
})

test("workspace config rejects missing or stale expected identities", () => {
  expect(() => workspaceConfig("source", { format: 1, modules: modules.slice(0, 1) }))
    .toThrow("WORKSPACE_CONFIG_IDENTITY_MISSING:core")
  expect(() => workspaceConfig("source", { format: 1, modules: modules.map((entry) =>
    entry.alias === "script" ? { ...entry, name: "@stale/script" } : entry) }))
    .toThrow("WORKSPACE_CONFIG_IDENTITY_MISSING:script")
})

test("workspace config validates every row including unused rows", () => {
  const entry = { alias: "unused", kind: "bun", scope: ".", name: "@fixture/unused", path: "other/module" }
  expect(() => workspaceConfig("source", { format: 2, modules })).toThrow("WORKSPACE_CONFIG_REGISTRY_INVALID")
  expect(() => workspaceConfig("source", { format: 1, modules: [] })).toThrow("WORKSPACE_CONFIG_REGISTRY_INVALID")
  expect(() => workspaceConfig("source", { format: 1, modules: [...modules, ...modules] }))
    .toThrow("WORKSPACE_CONFIG_DUPLICATE")
  ;["../escape", "/escape", "C:/escape", "other\\escape", "other//module", "other/./module", "other/../module"].forEach((path) => {
    expect(() => workspaceConfig("source", { format: 1, modules: [...modules, { ...entry, path }] }))
      .toThrow("WORKSPACE_CONFIG_PATH_INVALID:unused")
  })
  expect(() => workspaceConfig("source", { format: 1, modules: [...modules, { ...entry, scope: "other" }] }))
    .toThrow("WORKSPACE_CONFIG_IDENTITY_INVALID")
  expect(() => workspaceConfig("source", { format: 1, modules: [...modules, { ...entry, name: "@orchestra/core" }] }))
    .toThrow("WORKSPACE_CONFIG_DUPLICATE:unused")
  expect(() => workspaceConfig("source", { format: 1, modules: [...modules, { ...entry, path: "domains/runtime-core" }] }))
    .toThrow("WORKSPACE_CONFIG_DUPLICATE:unused")
})

test("source module bootstrap validates relocated identities and physical ownership", async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "workspace-config-")))
  const source = join(directory, "source")
  const outside = join(directory, "outside")
  try {
    await mkdir(join(source, "script"), { recursive: true })
    await mkdir(outside)
    await Bun.write(join(source, "script/module-registry.json"), JSON.stringify(registry))
    for (const entry of modules) {
      await mkdir(join(source, entry.path), { recursive: true })
      await Bun.write(join(source, entry.path, "package.json"), JSON.stringify({ name: entry.name }))
    }
    expect(await sourceModule(source, "script")).toBe(join(source, "tools/source-script"))
    expect(await sourceModule(source, "core")).toBe(join(source, "domains/runtime-core"))
    await expect(sourceModule(source, "missing")).rejects.toThrow("WORKSPACE_CONFIG_MODULE_MISSING:missing")
    await Bun.write(join(source, "tools/source-script/package.json"), '{"name":"stale"}')
    await expect(sourceModule(source, "script")).rejects.toThrow("WORKSPACE_CONFIG_MANIFEST_IDENTITY:script")
    await rm(join(source, "tools/source-script"), { recursive: true })
    await Bun.write(join(outside, "package.json"), '{"name":"@orchestra/script"}')
    await symlink(outside, join(source, "tools/source-script"), "junction")
    await expect(sourceModule(source, "script")).rejects.toThrow("WORKSPACE_CONFIG_MANIFEST_INVALID")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

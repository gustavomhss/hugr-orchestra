import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, rename } from "node:fs/promises"
import { ModuleResolver } from "../src/module-resolver"
import { monolithInventory } from "../../../script/monolith-inventory"
import { inventoryFixture } from "../../core/test/fixture/monolith-inventory"

test("resolves captured Bun, npm and Cargo declarations by name and identity", () => {
  const modules = [
    { kind: "bun", scope: ".", name: "bun-module", path: "packages/shared", manifest: "packages/shared/package.json", exports: { ".": "./index.ts" } },
    { kind: "npm", scope: "foundation/atlas", name: "npm-module", path: "foundation/atlas/shared", manifest: "foundation/atlas/shared/package.json", manifestHash: "npm-hash" },
    { kind: "cargo", scope: "packages/omni", name: "cargo-module", path: "packages/omni/shared", manifest: "packages/omni/shared/Cargo.toml", version: "2.0.0" },
  ] as const
  const resolver = ModuleResolver.make(modules)
  expect(resolver.resolve({ kind: "bun", scope: ".", name: "bun-module" })).toBe(modules[0])
  expect(resolver.resolve({ kind: "npm", name: "npm-module" })).toBe(modules[1])
  expect(resolver.resolve("cargo-module")).toBe(modules[2])
  expect(resolver.resolve("bun-module")).toMatchObject({ exports: { ".": "./index.ts" } })
  expect(resolver.resolve("npm-module")).toMatchObject({ manifestHash: "npm-hash" })
})

test("aliases follow captured package identities after a physical workspace move", async () => {
  await using fixture = await inventoryFixture()
  const aliases = {
    client: { kind: "bun", scope: ".", name: "@fixture/client" },
    "sdk/js": { kind: "bun", scope: ".", name: "@fixture/sdk" },
  } as const
  await mkdir(path.join(fixture.path, "apps"), { recursive: true })
  await rename(path.join(fixture.path, "packages/client"), path.join(fixture.path, "apps/frontend-kit"))
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({
    name: "fixture",
    workspaces: { packages: ["apps/*", "packages/*", "packages/sdk/js", "packages/omni/bindings/node"] },
    patchedDependencies: { "fix@1": "patches/fix.patch" },
  }))
  const inventory = await monolithInventory(fixture.path)
  const client = inventory.modules.find((module) => module.name === "@fixture/client")
  expect(client).toMatchObject({ path: "apps/frontend-kit", manifest: "apps/frontend-kit/package.json" })
  const resolver = ModuleResolver.make(inventory.modules, aliases)
  expect(resolver.resolve("client")).toBe(client)
  expect(resolver.resolve("sdk/js")).toMatchObject({ path: "packages/sdk/js", manifest: "packages/sdk/js/package.json" })
  expect(() => resolver.resolve("frontend-kit")).toThrow("MODULE_NOT_FOUND")
})

test("rejects ambiguous names across toolchain scopes", async () => {
  await using fixture = await inventoryFixture()
  const inventory = await monolithInventory(fixture.path)
  const resolver = ModuleResolver.make(inventory.modules)
  expect(() => resolver.resolve("binding")).toThrow("MODULE_AMBIGUOUS")
  expect(resolver.resolve({ kind: "bun", name: "binding" })).toMatchObject({ scope: ".", path: "packages/omni/bindings/node" })
  expect(resolver.resolve({ kind: "cargo", scope: "packages/omni", name: "binding" }))
    .toMatchObject({ path: "packages/omni/bindings/node", manifest: "packages/omni/bindings/node/Cargo.toml" })
})

test("refuses duplicate identities and empty or sparse catalogs", () => {
  const declaration = { kind: "bun", scope: ".", name: "one", path: "packages/one", manifest: "packages/one/package.json" } as const
  const sparse: ModuleResolver.Declaration[] = []
  sparse.length = 1
  expect(() => ModuleResolver.make([])).toThrow("MODULE_INVENTORY_EMPTY")
  expect(() => ModuleResolver.make(sparse)).toThrow("MODULE_SELECTOR_INVALID")
  expect(() => ModuleResolver.make([declaration, { ...declaration, path: "elsewhere" }])).toThrow("MODULE_IDENTITY_DUPLICATE")
  expect(() => ModuleResolver.make([{ ...declaration, manifest: "" }])).toThrow("MODULE_DECLARATION_INVALID")
})

test("rejects missing targets, malformed selectors and stale unused aliases", () => {
  const declaration = { kind: "bun", scope: ".", name: "one", path: "packages/one", manifest: "packages/one/package.json" } as const
  const resolver = ModuleResolver.make([declaration])
  expect(() => resolver.resolve("missing")).toThrow("MODULE_NOT_FOUND")
  expect(() => resolver.resolve(" ")).toThrow("MODULE_SELECTOR_NAME_INVALID")
  expect(() => resolver.resolve("one\nother")).toThrow("MODULE_SELECTOR_NAME_INVALID")
  expect(() => ModuleResolver.make([declaration], { legacy: { kind: "bun", scope: ".", name: "removed" } }))
    .toThrow("MODULE_NOT_FOUND")
  expect(() => ModuleResolver.make([declaration], { "\0alias": { kind: "bun", scope: ".", name: "one" } }))
    .toThrow("MODULE_SELECTOR_NAME_INVALID")
})

test("matches explicit workspace scope and refuses scope mismatches", () => {
  const modules = [
    { kind: "npm", scope: "foundation/atlas", name: "shared", path: "foundation/atlas/packages/shared", manifest: "foundation/atlas/packages/shared/package.json" },
    { kind: "npm", scope: "vendor/atlas", name: "shared", path: "vendor/atlas/packages/shared", manifest: "vendor/atlas/packages/shared/package.json" },
  ] as const
  const resolver = ModuleResolver.make(modules)
  expect(() => resolver.resolve({ kind: "npm", name: "shared" })).toThrow("MODULE_AMBIGUOUS")
  expect(resolver.resolve({ kind: "npm", scope: "foundation/atlas", name: "shared" })).toBe(modules[0])
  expect(() => resolver.resolve({ kind: "npm", scope: ".", name: "shared" })).toThrow("MODULE_NOT_FOUND")
})

test("does not treat prototype properties as aliases and snapshots registered targets", () => {
  const declaration = { kind: "bun", scope: ".", name: "one", path: "packages/one", manifest: "packages/one/package.json" } as const
  const aliases: Record<string, ModuleResolver.Identity> = {
    legacy: { kind: "bun", scope: ".", name: "one" },
  }
  const resolver = ModuleResolver.make([declaration], aliases)
  const target = aliases.legacy
  if (!target) throw new Error("FIXTURE_ALIAS_MISSING")
  target.name = "changed"
  expect(resolver.resolve("legacy")).toBe(declaration)
  expect(() => resolver.resolve("toString")).toThrow("MODULE_NOT_FOUND")
  expect(() => resolver.resolve("constructor")).toThrow("MODULE_NOT_FOUND")
})

test("resolves object aliases and refuses qualifier conflicts", () => {
  const declaration = { kind: "bun", scope: ".", name: "@fixture/client", path: "apps/frontend", manifest: "apps/frontend/package.json" } as const
  const resolver = ModuleResolver.make([declaration], { client: { kind: "bun", name: "@fixture/client" } })
  expect(resolver.resolve({ name: "client" })).toBe(declaration)
  expect(resolver.resolve({ name: "client", kind: "bun", scope: "." })).toBe(declaration)
  expect(() => resolver.resolve({ name: "client", kind: "npm" })).toThrow("MODULE_ALIAS_QUALIFIER_MISMATCH")
  expect(() => resolver.resolve({ name: "client", scope: "another" })).toThrow("MODULE_ALIAS_QUALIFIER_MISMATCH")
})

test("alias registrations resolve canonical targets without chaining through aliases", () => {
  const modules = [
    { kind: "bun", scope: ".", name: "one", path: "packages/one", manifest: "packages/one/package.json" },
    { kind: "bun", scope: ".", name: "two", path: "packages/two", manifest: "packages/two/package.json" },
  ] as const
  const resolver = ModuleResolver.make(modules, {
    one: { kind: "bun", name: "two" },
    legacy: { kind: "bun", name: "one" },
  })
  expect(resolver.resolve("one")).toBe(modules[1])
  expect(resolver.resolve("legacy")).toBe(modules[0])
})

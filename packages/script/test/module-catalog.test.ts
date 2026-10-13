import { expect, test } from "bun:test"
import { ModuleCatalog } from "../src/module-catalog.ts"

const entry = { alias: "sdk/js", kind: "bun", scope: ".", name: "@fixture/sdk", path: "packages/sdk/js" } as const
const registry = { format: 1, modules: [entry] }
const declaration = { kind: "bun", scope: ".", name: "@fixture/sdk", path: "packages/sdk/js", manifest: "packages/sdk/js/package.json", exports: { ".": "./index.ts" } } as const

test("decodes the frozen registry shape and rejects malformed or duplicate data", () => {
  expect(ModuleCatalog.decode(registry)).toEqual(registry)
  expect(() => ModuleCatalog.decode({ format: 2, modules: [entry] })).toThrow("MODULE_REGISTRY_FORMAT_INVALID")
  expect(() => ModuleCatalog.decode({ format: 1, modules: [] })).toThrow("MODULE_REGISTRY_EMPTY")
  expect(() => ModuleCatalog.decode({ format: 1, modules: [{ ...entry, path: "../escape" }] })).toThrow("MODULE_REGISTRY_PATH_INVALID")
  expect(() => ModuleCatalog.decode({ format: 1, modules: [entry, entry] })).toThrow("MODULE_REGISTRY_ALIAS_DUPLICATE")
  expect(() => ModuleCatalog.decode({ format: 1, modules: [{ ...entry, name: "@fixture/other", alias: "other", path: "packages/other" }, { ...entry, alias: "other" }] })).toThrow("MODULE_REGISTRY_NAME_DUPLICATE")
})

test("binds aliases to canonical declarations and checks registry completeness and paths", () => {
  const catalog = ModuleCatalog.make([declaration], registry)
  expect(catalog.entries).toEqual([entry])
  expect(catalog.resolve("sdk/js")).toBe(declaration)
  expect(() => ModuleCatalog.make([declaration], { format: 1, modules: [{ ...entry, path: "packages/old-sdk" }] })).toThrow("MODULE_REGISTRY_PATH_MISMATCH")
  expect(() => ModuleCatalog.make([declaration, { ...declaration, name: "@fixture/other", path: "packages/other", manifest: "packages/other/package.json" }], registry)).toThrow("MODULE_REGISTRY_DECLARATION_COUNT_MISMATCH")
  expect(() => ModuleCatalog.make([{ ...declaration, path: "packages/moved" }], { format: 1, modules: [] })).toThrow("MODULE_REGISTRY_EMPTY")
})

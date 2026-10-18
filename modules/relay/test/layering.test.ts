import { expect, test } from "bun:test"
import path from "node:path"

// R12: core depends on the engine, never the reverse. The engine imports only schema, effect, Bun and Node builtins,
// and no relative import leaves packages/relay. A `#` import must be declared in package.json `imports`, with every
// conditional target inside packages/relay.
const root = path.join(import.meta.dir, "..")
const ALLOWED = /^(?:effect(?:\/|$)|@orchestra\/schema(?:\/|$)|bun(?::|$)|node:)/
const manifest = await Bun.file(path.join(root, "package.json")).json()

// Every module specifier: static and type imports, re-exports, side-effect and dynamic imports, require.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g

function violates(file: string, specifier: string) {
  if (specifier.startsWith("#")) return !internal(manifest.imports?.[specifier])
  if (!specifier.startsWith(".")) return !ALLOWED.test(specifier)
  return !path.resolve(root, path.dirname(file), specifier).startsWith(root + path.sep)
}

function internal(targets: unknown) {
  if (typeof targets !== "object" || targets === null) return false
  const paths = Object.values(targets)
  return (
    paths.length > 0 &&
    paths.every((target) => typeof target === "string" && path.resolve(root, target).startsWith(root + path.sep))
  )
}

test("relay imports nothing outside schema, effect, Bun and its own package", async () => {
  const files = ["src", "test"].flatMap((dir) =>
    [...new Bun.Glob("**/*.ts").scanSync(path.join(root, dir))].map((file) => path.join(dir, file)),
  )
  const imports = await Promise.all(
    files.map(async (file) =>
      [...(await Bun.file(path.join(root, file)).text()).matchAll(SPECIFIER)].map((match) => ({
        file,
        specifier: match[1]!,
      })),
    ),
  ).then((all) => all.flat())

  // Positive controls: the scan reaches the engine and sees the imports it really makes, and the rule fires on core.
  expect(files).toContain(path.join("src", "arm", "evaluate.ts"))
  expect(imports).toContainEqual({
    file: path.join("src", "arm", "evaluate.ts"),
    specifier: "@orchestra/schema/relay-arm",
  })
  expect(imports.some((entry) => entry.specifier.startsWith("./") || entry.specifier.startsWith("../"))).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "@orchestra/core/tool-safety")).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "../../../core/src/relay")).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "../gate/shell")).toBe(false)
  expect(imports).toContainEqual({ file: path.join("src", "authoring", "store.ts"), specifier: "#sqlite" })
  expect(violates(path.join("src", "authoring", "store.ts"), "#undeclared")).toBe(true)
  expect(internal({ node: "../core/src/database/sqlite.node.ts" })).toBe(false)

  expect(imports.filter((entry) => violates(entry.file, entry.specifier))).toEqual([])
})

test("relay declares only schema and effect as runtime dependencies", () => {
  expect(Object.keys(manifest.dependencies).sort()).toEqual(["@orchestra/schema", "effect"])
})

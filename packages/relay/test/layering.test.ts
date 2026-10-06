import { expect, test } from "bun:test"
import path from "node:path"

// R12: core depends on the engine, never the reverse. The engine imports only schema, effect, Bun and Node builtins,
// and no relative import leaves packages/relay.
const root = path.join(import.meta.dir, "..")
const ALLOWED = /^(?:effect(?:\/|$)|@opencode-ai\/schema(?:\/|$)|bun(?::|$)|node:)/

// Every module specifier: static and type imports, re-exports, side-effect and dynamic imports, require.
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g

function violates(file: string, specifier: string) {
  if (!specifier.startsWith(".")) return !ALLOWED.test(specifier)
  return !path.resolve(root, path.dirname(file), specifier).startsWith(root + path.sep)
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
    specifier: "@opencode-ai/schema/relay-arm",
  })
  expect(imports.some((entry) => entry.specifier.startsWith("./") || entry.specifier.startsWith("../"))).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "@opencode-ai/core/tool-safety")).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "../../../core/src/relay")).toBe(true)
  expect(violates(path.join("src", "arm", "evaluate.ts"), "../gate/shell")).toBe(false)

  expect(imports.filter((entry) => violates(entry.file, entry.specifier))).toEqual([])
})

test("relay declares only schema and effect as runtime dependencies", async () => {
  const manifest = await Bun.file(path.join(root, "package.json")).json()
  expect(Object.keys(manifest.dependencies).sort()).toEqual(["@opencode-ai/schema", "effect"])
})

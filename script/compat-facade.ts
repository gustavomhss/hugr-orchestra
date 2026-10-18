#!/usr/bin/env bun
// Routes a package's non-test imports of a legacy specifier (registry `legacy[].compat`) through its own
// `<package>/src/compat/<facade>.ts` (D13). Only the string literal of an import, export-from or import-type
// specifier changes; the quote and everything else on the line stay. Default and namespace imports, dynamic
// `import()`, `require()` and every other form of a legacy specifier are refused, not rewritten.
//
// Usage: bun run script/compat-facade.ts <alias> <prefix>... [--write|--check]
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SOURCE, isTestFile, loadWorkspace, specifiersOf } from "./module-architecture"

const root = path.resolve(import.meta.dir, "..")
const args = process.argv.slice(2)
const [alias, ...prefixes] = args.filter((arg) => !arg.startsWith("--"))
if (!alias || prefixes.length === 0) fail("usage: compat-facade.ts <alias> <prefix>... [--write|--check]")
const workspace = loadWorkspace(root)
const member = workspace.member(alias) ?? fail(`MODULE_ALIAS_UNKNOWN:${alias}`)
const facades = new Map(
  workspace.architecture.legacy.flatMap((item) =>
    Object.entries(item.compat ?? {}).map(([subpath, facade]) => [`${item.specifier}${subpath.slice(1)}`, facade] as const),
  ),
)
const compat = `${member.path}/src/compat/`
prefixes.forEach((prefix) => {
  if (prefix !== member.path && !prefix.startsWith(`${member.path}/`)) fail(`FACADE_PREFIX_OUTSIDE_PACKAGE:${prefix}`)
})
const files = workspace.files.filter(
  (file) =>
    SOURCE.test(file) &&
    !isTestFile(file.slice(member.path.length + 1)) &&
    !file.startsWith(compat) &&
    prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix.replace(/\/$/, "")}/`)),
)
const tracked = new Set(workspace.files)
// node16/nodenext resolution requires the emitted extension on relative imports.
const nodeNext = /"moduleResolution"\s*:\s*"node(?:16|next)"/i.test(
  readFileSync(path.join(root, member.path, "tsconfig.json"), "utf8"),
)
const changed = files.flatMap((file) => {
  const text = readFileSync(path.join(root, file), "utf8")
  const parsed = specifiersOf(file, text)
  if (parsed.errors.length > 0) fail(`FACADE_PARSE_ERROR:${file}: ${parsed.errors[0]}`)
  const edits = parsed.found
    .filter((item) => facades.has(item.specifier))
    .map((item) => {
      if (item.unsupported || !["import", "export", "import-type"].includes(item.kind))
        fail(`FACADE_UNSUPPORTED_IMPORT_FORM:${file}:${item.specifier}`)
      const facade = `${compat}${facades.get(item.specifier)}`
      if (!tracked.has(`${facade}.ts`)) fail(`FACADE_MISSING:${facade}.ts`)
      return { ...item, replacement: replacement(file, facade) }
    })
  if (edits.length === 0) return []
  // Edit from the end so earlier offsets stay valid.
  const next = edits
    .sort((a, b) => b.start - a.start)
    .reduce((current, edit) => current.slice(0, edit.start) + edit.replacement + current.slice(edit.end), text)
  if (args.includes("--write")) writeFileSync(path.join(root, file), next)
  return [file]
})
console.log(`compat-facade: ${changed.length} files ${args.includes("--write") ? "changed" : "would change"}`)
if (args.includes("--check") && changed.length > 0) process.exit(1)

// Always relative: other packages compile some of these files with their own `@/` alias (apps/orchestra includes
// app-shell sources), so a workspace alias would resolve into the wrong package there.
function replacement(file: string, facade: string) {
  const relative = path.posix.relative(path.posix.dirname(file), facade)
  return `${relative.startsWith(".") ? relative : `./${relative}`}${nodeNext ? ".js" : ""}`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

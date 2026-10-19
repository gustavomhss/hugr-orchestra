export * as CodeIndexGo from "./go"

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import type { Node } from "web-tree-sitter"
import type { CodeIndexResolve } from "./resolve"
import type { CodeIndexTreeSitter } from "./tree-sitter"

// The Go half of the indexer run (J2.5) and of the structural layer. scip-go loads packages through the host's `go`
// (`go list`), so the toolchain is a precondition the host checks, not part of the pack. The run has no network: the
// module proxy is off and the toolchain is the local one, so a module missing from the cache or a newer `go` directive
// fails at once instead of reaching for the network. The module version is pinned for the reason scip-python's is.

/** The host program scip-go drives; without it a Go shard keeps the tree-sitter layer alone. */
export const TOOLCHAIN = "go"

export const ENV = { GOPROXY: "off", GOTOOLCHAIN: "local" }

/** Arguments after the executable; the run's cwd is the module root. */
export function args(output: string) {
  return ["index", "--quiet", "--module-root", ".", "--module-version", "0", "--output", output]
}

/** An identifier is exported when it starts with an upper-case letter; a member also needs its type exported. */
export function exported(name: string, parent?: CodeIndexTreeSitter.Definition) {
  return /^\p{Lu}/u.test(name) && (!parent || parent.exported)
}

/** Every `import` spec, with its alias as the bound name; `_` and `.` bind none. */
export function imports(root: Node) {
  return root.namedChildren.flatMap((node): CodeIndexTreeSitter.Import[] => node?.type !== "import_declaration" ? [] :
    node.descendantsOfType("import_spec").flatMap((spec): CodeIndexTreeSitter.Import[] => {
      const target = spec?.childForFieldName("path")
      if (!spec || !target) return []
      const alias = spec.childForFieldName("name")?.text
      return [{ specifier: target.text.slice(1, -1), line: spec.startPosition.row + 1, form: "static",
        names: alias && alias !== "_" && alias !== "." ? [alias] : [] }]
    }))
}

/**
 * An import path under the importing file's own module (the nearest go.mod's `module` line) resolves to the package
 * directory's first non-test source file; any other path is a package outside the repository.
 */
export function resolver(root: string) {
  const modules = new Map<string, { readonly dir: string; readonly path: string } | undefined>()
  const owner = (dir: string): { readonly dir: string; readonly path: string } | undefined => {
    if (modules.has(dir)) return modules.get(dir)
    const file = path.join(dir, "go.mod")
    const declared = existsSync(file) ? readFileSync(file, "utf8").match(/^module\s+"?([^\s"]+)"?/m)?.[1] : undefined
    const parent = path.dirname(dir)
    const found = declared ? { dir, path: declared } : dir === root || parent === dir ? undefined : owner(parent)
    modules.set(dir, found)
    return found
  }
  return (from: string, specifier: string): CodeIndexResolve.Resolution => {
    const module = owner(path.dirname(path.join(root, from)))
    if (!module || (specifier !== module.path && !specifier.startsWith(`${module.path}/`))) return { kind: "package" }
    const dir = path.join(module.dir, specifier.slice(module.path.length))
    const file = (existsSync(dir) ? readdirSync(dir) : []).filter((name) => name.endsWith(".go") && !name.endsWith("_test.go")).toSorted()[0]
    return file ? { kind: "alias", to: path.relative(root, path.join(dir, file)).replaceAll("\\", "/") } : { kind: "unresolved" }
  }
}

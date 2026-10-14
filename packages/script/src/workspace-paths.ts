export * as WorkspacePaths from "./workspace-paths.ts"

import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { ModuleCatalog } from "./module-catalog.ts"

/** Source roots need both markers: workspace names also occur in packaged manifests. */
export function findRoot(start: string): string {
  const physical = realpathSync(start)
  const ascend = (directory: string): string => {
    if (lstatSync(path.join(directory, "package.json"), { throwIfNoEntry: false })?.isFile() &&
      lstatSync(path.join(directory, "script/module-registry.json"), { throwIfNoEntry: false })?.isFile()) {
      regular(directory, "package.json")
      regular(directory, "script/module-registry.json")
      return directory
    }
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error(`WORKSPACE_ROOT_NOT_FOUND:${start}`)
    return ascend(parent)
  }
  return ascend(statSync(physical).isDirectory() ? physical : path.dirname(physical))
}

/** Capture one validated source snapshot; selectors never infer folder names. */
export function make(start: string) {
  const root = findRoot(start)
  const registry = ModuleCatalog.decode(JSON.parse(readFileSync(regular(root, "script/module-registry.json"), "utf8")))
  const declarations = registry.modules.map((entry) => {
    const manifest = `${entry.path}/package.json`
    const value: unknown = JSON.parse(readFileSync(regular(root, manifest), "utf8"))
    if (!value || typeof value !== "object" || !("name" in value) || value.name !== entry.name)
      throw new Error(`WORKSPACE_MANIFEST_NAME_MISMATCH:${entry.name}:${manifest}`)
    return { ...entry, manifest }
  })
  registry.modules.forEach((entry) => {
    if (registry.modules.some((other) => other.name === entry.alias && other.name !== entry.name))
      throw new Error(`WORKSPACE_SELECTOR_AMBIGUOUS:${entry.alias}`)
  })
  const catalog = ModuleCatalog.make(declarations, registry)
  const entries = catalog.entries.map((entry) => ({ ...entry, path: descendant(root, entry.path) }))
  const modules = new Map(entries.map((entry) => [entry.name, entry.path]))
  const toolchain: unknown = JSON.parse(readFileSync(regular(root, "script/toolchain-registry.json"), "utf8"))
  if (!toolchain || typeof toolchain !== "object" || !("format" in toolchain) || toolchain.format !== 1 ||
    !("roots" in toolchain) || !toolchain.roots || typeof toolchain.roots !== "object" || Array.isArray(toolchain.roots))
    throw new Error("WORKSPACE_TOOLCHAIN_REGISTRY_INVALID")
  const roots = toolchain.roots as Record<string, unknown>
  if (Object.keys(roots).some((alias) => alias !== "omni" && alias !== "atlas"))
    throw new Error("WORKSPACE_TOOLCHAIN_ALIAS_INVALID")
  const domains = Object.fromEntries((["omni", "atlas"] as const).map((alias) => {
    const entry = roots[alias]
    if (!entry || typeof entry !== "object" || !("path" in entry) || typeof entry.path !== "string" ||
      !("manifest" in entry) || entry.manifest !== (alias === "omni" ? "Cargo.toml" : "package.json"))
      throw new Error(`WORKSPACE_TOOLCHAIN_ENTRY_INVALID:${alias}`)
    regular(root, `${entry.path}/${entry.manifest}`)
    return [alias, descendant(root, entry.path)] as const
  }))
  return {
    root,
    module(selector: string): string {
      const name = catalog.resolve(selector).name
      const directory = modules.get(name)
      if (!directory) throw new Error(`WORKSPACE_MODULE_MISSING:${name}`)
      return directory
    },
    domain(alias: "omni" | "atlas"): string {
      if (alias !== "omni" && alias !== "atlas") throw new Error(`WORKSPACE_DOMAIN_MISSING:${alias}`)
      const directory = domains[alias]
      if (!directory) throw new Error(`WORKSPACE_DOMAIN_MISSING:${alias}`)
      return directory
    },
    entries,
  }
}

function descendant(root: string, relative: string) {
  if (!relative || path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) ||
    /[\\\x00-\x1f\x7f:]/.test(relative) || relative.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error(`WORKSPACE_PATH_INVALID:${relative}`)
  const candidate = path.join(root, relative)
  if (!lstatSync(candidate, { throwIfNoEntry: false })) throw new Error(`WORKSPACE_PATH_MISSING:${relative}`)
  const physical = realpathSync(candidate)
  const owned = path.relative(root, physical)
  if (!owned || owned === ".." || owned.startsWith(`..${path.sep}`) || path.isAbsolute(owned))
    throw new Error(`WORKSPACE_PATH_ESCAPED:${relative}`)
  return physical
}

function regular(root: string, relative: string) {
  const file = descendant(root, relative)
  if (!lstatSync(path.join(root, relative), { throwIfNoEntry: false })?.isFile())
    throw new Error(`WORKSPACE_MANIFEST_NOT_REGULAR:${relative}`)
  return file
}

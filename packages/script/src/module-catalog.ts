export * as ModuleCatalog from "./module-catalog.ts"

import { ModuleResolver } from "./module-resolver.ts"
import path from "node:path"

export type Entry = {
  alias: string
  kind: "bun"
  scope: "."
  name: string
  path: string
}

export type Registry = { format: 1; modules: Entry[] }

export function decode(value: unknown): Registry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MODULE_REGISTRY_INVALID")
  const registry = value as Record<string, unknown>
  if (registry.format !== 1) throw new Error("MODULE_REGISTRY_FORMAT_INVALID")
  if (!Array.isArray(registry.modules) || registry.modules.length === 0) throw new Error("MODULE_REGISTRY_EMPTY")
  const aliases = new Set<string>()
  const names = new Set<string>()
  const paths = new Set<string>()
  const modules = Array.from(registry.modules).map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MODULE_REGISTRY_ENTRY_INVALID")
    const entry = value as Record<string, unknown>
    const missing = ["alias", "kind", "scope", "name", "path"].find((field) => !(field in entry))
    if (missing) throw new Error(`MODULE_REGISTRY_FIELD_MISSING:${missing}`)
    if (typeof entry.alias !== "string" || !/^[\w-]+(?:\/[\w-]+)*$/.test(entry.alias)) throw new Error("MODULE_REGISTRY_ALIAS_INVALID")
    if (entry.kind !== "bun") throw new Error("MODULE_REGISTRY_KIND_INVALID")
    if (entry.scope !== ".") throw new Error("MODULE_REGISTRY_SCOPE_INVALID")
    if (typeof entry.name !== "string" || !entry.name || entry.name.trim() !== entry.name || /[\x00-\x1f\x7f]/.test(entry.name)) throw new Error("MODULE_REGISTRY_NAME_INVALID")
    if (typeof entry.path !== "string" || !entry.path || path.posix.isAbsolute(entry.path) || path.win32.isAbsolute(entry.path) || entry.path.includes("\\") || /[\x00-\x1f\x7f:]/.test(entry.path) || entry.path.split("/").some((part) => part === ".." || part === "." || part === "") || path.posix.normalize(entry.path) !== entry.path) throw new Error("MODULE_REGISTRY_PATH_INVALID")
    if (aliases.has(entry.alias)) throw new Error(`MODULE_REGISTRY_ALIAS_DUPLICATE:${entry.alias}`)
    if (names.has(entry.name)) throw new Error(`MODULE_REGISTRY_NAME_DUPLICATE:${entry.name}`)
    if (paths.has(entry.path)) throw new Error(`MODULE_REGISTRY_PATH_DUPLICATE:${entry.path}`)
    aliases.add(entry.alias)
    names.add(entry.name)
    paths.add(entry.path)
    return { alias: entry.alias, kind: "bun" as const, scope: "." as const, name: entry.name, path: entry.path }
  })
  return { format: 1, modules }
}

export function make<T extends ModuleResolver.Declaration>(modules: readonly T[], registry: unknown) {
  const decoded = decode(registry)
  if (!Array.isArray(modules) || modules.length === 0) throw new Error("MODULE_DECLARATION_EMPTY")
  const declared = modules.filter((module) => module.kind === "bun" && module.scope === ".")
  if (declared.length !== decoded.modules.length) throw new Error("MODULE_REGISTRY_DECLARATION_COUNT_MISMATCH")
  const byName = new Map(declared.map((module) => [module.name, module]))
  const byAlias = Object.fromEntries(decoded.modules.map((entry) => [entry.alias, { kind: entry.kind, scope: entry.scope, name: entry.name }]))
  decoded.modules.forEach((entry) => {
    const module = byName.get(entry.name)
    if (!module) throw new Error(`MODULE_REGISTRY_DECLARATION_MISSING:${entry.name}`)
    if (module.path !== entry.path) throw new Error(`MODULE_REGISTRY_PATH_MISMATCH:${entry.name}`)
  })
  declared.forEach((module) => {
    if (!decoded.modules.some((entry) => entry.name === module.name)) throw new Error(`MODULE_REGISTRY_DECLARATION_UNREGISTERED:${module.name}`)
  })
  return { ...ModuleResolver.make(modules, byAlias), entries: decoded.modules }
}

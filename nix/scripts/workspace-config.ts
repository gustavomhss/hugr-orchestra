import { lstat, realpath } from "node:fs/promises"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { parseArgs } from "node:util"

export function workspaceConfig(source: string, registry: unknown) {
  const modules = workspaceModules(registry)
  const paths: Record<string, string[]> = Object.fromEntries([
    ["script", "@orchestra/script"], ["core", "@orchestra/core"],
  ].map(([alias, name]) => {
    const entry = modules.find((entry) => entry.alias === alias)
    if (!entry || entry.name !== name) throw new Error(`WORKSPACE_CONFIG_IDENTITY_MISSING:${alias}`)
    return [`${name}/*`, [`${entry.path}/src/*.ts`]]
  }))
  return { compilerOptions: { baseUrl: resolve(source), paths } }
}

function workspaceModules(value: unknown) {
  if (!value || typeof value !== "object" || !("format" in value) || value.format !== 1
    || !("modules" in value) || !Array.isArray(value.modules) || !value.modules.length)
    throw new Error("WORKSPACE_CONFIG_REGISTRY_INVALID")
  const aliases = new Set<string>()
  const names = new Set<string>()
  const paths = new Set<string>()
  return Array.from(value.modules).map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("WORKSPACE_CONFIG_ENTRY_INVALID")
    const entry = value as Record<string, unknown>
    if (entry.kind !== "bun" || entry.scope !== "." || typeof entry.alias !== "string"
      || !/^[\w-]+(?:\/[\w-]+)*$/.test(entry.alias) || typeof entry.name !== "string"
      || !entry.name || entry.name.trim() !== entry.name || /[\x00-\x1f\x7f]/.test(entry.name))
      throw new Error("WORKSPACE_CONFIG_IDENTITY_INVALID")
    if (typeof entry.path !== "string" || !entry.path || isAbsolute(entry.path)
      || /[\\:\x00-\x1f\x7f]/.test(entry.path)
      || entry.path.split("/").some((part) => !part || part === "." || part === ".."))
      throw new Error(`WORKSPACE_CONFIG_PATH_INVALID:${entry.alias}`)
    if (aliases.has(entry.alias) || names.has(entry.name) || paths.has(entry.path))
      throw new Error(`WORKSPACE_CONFIG_DUPLICATE:${entry.alias}`)
    aliases.add(entry.alias)
    names.add(entry.name)
    paths.add(entry.path)
    return { alias: entry.alias, name: entry.name, path: entry.path }
  })
}

// Bootstrap without workspace aliases; physical ownership and manifest identity
// are checked only at the filesystem boundary, keeping workspaceConfig pure.
export async function sourceModule(source: string, alias: string) {
  const root = await realpath(source)
  const registry = join(root, "script/module-registry.json")
  const owned = async (file: string) => {
    const physical = await realpath(file)
    const path = relative(root, physical)
    if (!path || path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)
      || !(await lstat(file)).isFile()) throw new Error(`WORKSPACE_CONFIG_MANIFEST_INVALID:${file}`)
    return physical
  }
  const entry = workspaceModules(await Bun.file(await owned(registry)).json()).find((entry) => entry.alias === alias)
  if (!entry) throw new Error(`WORKSPACE_CONFIG_MODULE_MISSING:${alias}`)
  const manifest: unknown = await Bun.file(await owned(join(root, entry.path, "package.json"))).json()
  if (!manifest || typeof manifest !== "object" || !("name" in manifest) || manifest.name !== entry.name)
    throw new Error(`WORKSPACE_CONFIG_MANIFEST_IDENTITY:${alias}`)
  return await realpath(join(root, entry.path))
}

if (import.meta.main) {
  const args = parseArgs({ options: { source: { type: "string" }, out: { type: "string" } },
    strict: true, allowPositionals: false }).values
  if (!args.source || !args.out) throw new Error("WORKSPACE_CONFIG_ARGUMENTS_REQUIRED")
  const source = await realpath(args.source)
  const config = workspaceConfig(source, await Bun.file(join(source, "script/module-registry.json")).json())
  await sourceModule(source, "script")
  await sourceModule(source, "core")
  await Bun.write(args.out, JSON.stringify(config, null, 2) + "\n")
}

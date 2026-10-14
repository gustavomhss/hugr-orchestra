import { ModuleCatalog } from "../packages/script/src/module-catalog.ts"

export function resolveTestPackage(
  registry: unknown,
  selector: string,
  readManifest: (directory: string) => unknown,
  isFile?: (file: string) => boolean,
): { package: string; directory: string } {
  const entries = ModuleCatalog.decode(registry).modules
  const modules = entries.map((entry) => {
    const manifest = readManifest(entry.path)
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || !("name" in manifest) ||
      typeof manifest.name !== "string" || !manifest.name || manifest.name.trim() !== manifest.name)
      throw new Error(`TEST_PACKAGE_MANIFEST_NAME_INVALID:${entry.path}`)
    if (manifest.name !== entry.name) throw new Error(`TEST_PACKAGE_MANIFEST_NAME_MISMATCH:${entry.path}`)
    return { kind: entry.kind, scope: entry.scope, name: manifest.name, path: entry.path, manifest: `${entry.path}/package.json` }
  })
  const catalog = ModuleCatalog.make(modules, registry)
  if (typeof selector !== "string" || !selector || selector.trim() !== selector || /[\x00-\x1f\x7f\\]/.test(selector))
    throw new Error(`TEST_PACKAGE_SELECTOR_INVALID:${selector}`)
  const legacy = selector.replace(/^\.\//, "").replace(/^packages\//, "").replace(/\/$/, "")
  const canonical = entries.find((entry) => entry.name === selector)
  const alias = entries.find((entry) => entry.alias === legacy)
  if (canonical && alias && canonical !== alias && !/^(\.\/)?packages\//.test(selector))
    throw new Error(`TEST_PACKAGE_SELECTOR_AMBIGUOUS:${selector}`)
  const entry = /^(\.\/)?packages\//.test(selector) ? alias : canonical ?? alias
  if (entry) {
    const module = catalog.resolve({ kind: entry.kind, scope: entry.scope, name: entry.alias })
    return { package: entry.alias, directory: module.path }
  }
  // Only the existing Python-only legacy layout may bypass the Bun registry.
  if (/^[\w-]+(?:\/[\w-]+)*$/.test(legacy) && isFile?.(`packages/${legacy}/requirements-dev.txt`) &&
    !isFile(`packages/${legacy}/package.json`))
    return { package: legacy, directory: `packages/${legacy}` }
  throw new Error(`TEST_PACKAGE_NOT_FOUND:${selector}`)
}

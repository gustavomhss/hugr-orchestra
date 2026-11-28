import { readdirSync, lstatSync, readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { nativeSha256 } from "./genesis-native-io.js"

/** Mandatory runtime coverage, not operator-selected plan pins. No module is executed during capture. */
export const evaluationRuntimePackages = [
  "@atlas/contracts", "@atlas/genesis", "@atlas/grounding", "@atlas/index", "@atlas/kernel",
  "@atlas/knowledge", "@atlas/memory", "@atlas/persist", "@atlas/retrieval", "@atlas/tools",
] as const

export function evaluationRuntimeIdentity(): Record<string, string> {
  const files = new Map<string, string>(), visited = new Map<string, string>()
  const collect = (root: string, prefix: string, relative = "") => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (["node_modules", ".git"].includes(name)) continue
      const path = join(root, relative, name), key = join(relative, name), stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error("evaluation-runtime-symlink")
      if (stat.isDirectory()) collect(root, prefix, key)
      if (stat.isFile())
        files.set(`${prefix}/${key}`, nativeSha256(readFileSync(path)))
    }
  }
  const visit = (name: string, from: string) => {
    const require = createRequire(from)
    let manifest: string
    try { manifest = require.resolve(`${name}/package.json`) } catch {
      const entry = require.resolve(name)
      let current = dirname(entry)
      for (;;) {
        const path = join(current, "package.json")
        if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).name === name) { manifest = path; break }
        const parent = dirname(current)
        if (parent === current) throw new Error(`evaluation-runtime-package: ${name}`)
        current = parent
      }
    }
    const previous = visited.get(name)
    if (previous !== undefined) {
      if (previous !== manifest) throw new Error(`evaluation-runtime-multiple-versions: ${name}`)
      return
    }
    visited.set(name, manifest)
    const metadata = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string; dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> }
    if (metadata.name !== name) throw new Error(`evaluation-runtime-package: ${name}`)
    files.set(`${name}/package.json`, nativeSha256(readFileSync(manifest)))
    // Atlas code is bound at the resolved execution tree; external packages include code/native assets.
    collect(name.startsWith("@atlas/") ? dirname(require.resolve(name)) : dirname(manifest), name)
    for (const dependency of [...new Set([...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.optionalDependencies ?? {}), ...Object.keys(metadata.peerDependencies ?? {})])].sort()) {
      const optional = Object.hasOwn(metadata.optionalDependencies ?? {}, dependency) || metadata.peerDependenciesMeta?.[dependency]?.optional === true
      if (optional) {
        const resolver = createRequire(manifest)
        let available = true
        try { resolver.resolve(`${dependency}/package.json`) } catch {
          try { resolver.resolve(dependency) } catch { available = false }
        }
        if (!available) {
          files.set(`${name}/optional-absent/${dependency}`, nativeSha256(new TextEncoder().encode("ABSENT")))
          continue
        }
      }
      visit(dependency, manifest)
    }
  }
  const own = fileURLToPath(import.meta.url)
  collect(dirname(own), "adapter")
    // src and dist/src have different depth. Locate by declared package name, not a caller-selected path.
  let current = dirname(own), actualManifest: string
  for (;;) {
    const path = join(current, "package.json")
    if (existsSync(path) && JSON.parse(readFileSync(path, "utf8")).name === "@atlas/adapter-io") { actualManifest = path; break }
    const parent = dirname(current)
    if (parent === current) throw new Error("evaluation-runtime-adapter-package")
    current = parent
  }
  const metadata = JSON.parse(readFileSync(actualManifest, "utf8")) as { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string>; peerDependenciesMeta?: Record<string, { optional?: boolean }> }
  files.set("adapter/package.json", nativeSha256(readFileSync(actualManifest)))
  for (const dependency of [...new Set([...evaluationRuntimePackages, ...Object.keys(metadata.dependencies ?? {}), ...Object.keys(metadata.optionalDependencies ?? {}), ...Object.keys(metadata.peerDependencies ?? {})])].sort()) {
    const optional = Object.hasOwn(metadata.optionalDependencies ?? {}, dependency) || metadata.peerDependenciesMeta?.[dependency]?.optional === true
    if (optional && !evaluationRuntimePackages.some((name) => name === dependency)) {
      const resolver = createRequire(actualManifest)
      let available = true
      try { resolver.resolve(`${dependency}/package.json`) } catch {
        try { resolver.resolve(dependency) } catch { available = false }
      }
      if (!available) {
        files.set(`adapter/optional-absent/${dependency}`, nativeSha256(new TextEncoder().encode("ABSENT")))
        continue
      }
    }
    visit(dependency, actualManifest)
  }
  files.set("runtime/engine", nativeSha256(new TextEncoder().encode(JSON.stringify(process.versions))))
  return Object.fromEntries([...files].sort(([a], [b]) => a.localeCompare(b)))
}

export * as AtlasParser from "./atlas-parser"

import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"

/** Physical installed grammar package; both real WASM files must belong to version0.23.2. */
export async function grammarDirectory(root: string): Promise<string> {
  return resolveInstalled(root, "tree-sitter-typescript", [
    path.join(root, "packages/core"),
    path.join(root, "modules/atlas/boundary"),
  ], path.join(root, "packages/core"))
}

/** Test setup only: return the physical installed web-tree-sitter@0.23.2 directory, never another version. */
export async function directory(root: string): Promise<string> {
  const boundary = path.join(root, "modules/atlas/boundary")
  return resolveInstalled(root, "web-tree-sitter", [boundary], boundary)
}

async function resolveInstalled(root: string, name: "web-tree-sitter" | "tree-sitter-typescript", links: string[], resolveFrom: string): Promise<string> {
  const failures: string[] = []
  const note = (candidate: string, error: unknown) => {
    failures.push(`${candidate.slice(0, 500)}: ${(error instanceof Error ? error.message : String(error)).slice(0, 250)}`)
  }
  const probe = (candidate: string) => installed(candidate, name).catch((error: unknown) => {
    note(candidate, error)
    return undefined
  })
  for (const link of links) {
    const linked = await probe(path.join(link, "node_modules", name))
    if (linked !== undefined) return linked
  }

  const metadata = await Promise.resolve().then(() => Bun.resolveSync(`${name}/package.json`, resolveFrom))
    .catch((error: unknown) => {
      note(`Bun.resolveSync(${name}/package.json, ${resolveFrom})`, error)
      return undefined
    })
  if (metadata !== undefined) {
    const resolved = await probe(path.dirname(metadata))
    if (resolved !== undefined) return resolved
  }

  const store = path.join(root, "node_modules/.bun")
  const entries = await readdir(store).catch((error: unknown) => {
    note(store, error)
    return []
  })
  const exact = entries.filter((entry) => entry === `${name}@0.23.2` || entry.startsWith(`${name}@0.23.2+`)).sort()
  if (exact.length === 0) note(store, `No ${name}@0.23.2 store entry (including peer suffixes)`)
  for (const entry of exact) {
    const physical = await probe(path.join(store, entry, "node_modules", name))
    if (physical !== undefined) return physical
  }
  const diagnostic = failures.join("\n")
  throw new Error(`Installed ${name}@0.23.2 is unavailable (${failures.length} failed candidates/resolutions).\n` +
    diagnostic.slice(0, 8192) + (diagnostic.length > 8192 ? "\n[remaining diagnostic truncated]" : ""))
}

async function installed(candidate: string, name: "web-tree-sitter" | "tree-sitter-typescript"): Promise<string> {
  const physical = await realpath(candidate)
  if (!(await stat(physical)).isDirectory()) throw new Error("Package path is not a directory")
  const metadataPath = await realpath(path.join(physical, "package.json"))
  if (!(await stat(metadataPath)).isFile()) throw new Error("Package metadata must be a regular file")
  const metadata: unknown = await Bun.file(metadataPath).json()
  if (typeof metadata !== "object" || metadata === null || !("name" in metadata) || metadata.name !== name ||
    !("version" in metadata) || metadata.version !== "0.23.2")
    throw new Error(`Package metadata must name ${name}@0.23.2`)
  if (name === "web-tree-sitter" && (!("main" in metadata) || metadata.main !== "tree-sitter.js"))
    throw new Error("Package metadata must name web-tree-sitter@0.23.2 with main tree-sitter.js")
  const files = name === "web-tree-sitter" ? ["tree-sitter.js"] : ["tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm"]
  for (const file of files) {
    const physicalFile = await realpath(path.join(physical, file))
    if (!(await stat(physicalFile)).isFile()) throw new Error(`${file} must be a regular file`)
  }
  return physical
}

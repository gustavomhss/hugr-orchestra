export * as AtlasParser from "./atlas-parser"

import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"

/** Test setup only: return the physical installed web-tree-sitter@0.23.2 directory, never another version. */
export async function directory(root: string): Promise<string> {
  const boundary = path.join(root, "modules/atlas/boundary")
  const failures: string[] = []
  const note = (candidate: string, error: unknown) => {
    failures.push(`${candidate.slice(0, 500)}: ${(error instanceof Error ? error.message : String(error)).slice(0, 250)}`)
  }
  const probe = (candidate: string) => installed(candidate).catch((error: unknown) => {
    note(candidate, error)
    return undefined
  })
  const linked = await probe(path.join(boundary, "node_modules/web-tree-sitter"))
  if (linked !== undefined) return linked

  const metadata = await Promise.resolve().then(() => Bun.resolveSync("web-tree-sitter/package.json", boundary))
    .catch((error: unknown) => {
      note(`Bun.resolveSync(web-tree-sitter/package.json, ${boundary})`, error)
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
  const exact = entries.filter((entry) => entry === "web-tree-sitter@0.23.2" || entry.startsWith("web-tree-sitter@0.23.2+")).sort()
  if (exact.length === 0) note(store, "No web-tree-sitter@0.23.2 store entry (including peer suffixes)")
  for (const entry of exact) {
    const physical = await probe(path.join(store, entry, "node_modules/web-tree-sitter"))
    if (physical !== undefined) return physical
  }
  const diagnostic = failures.join("\n")
  throw new Error(`Installed web-tree-sitter@0.23.2 is unavailable (${failures.length} failed candidates/resolutions).\n` +
    diagnostic.slice(0, 8192) + (diagnostic.length > 8192 ? "\n[remaining diagnostic truncated]" : ""))
}

async function installed(candidate: string): Promise<string> {
  const physical = await realpath(candidate)
  if (!(await stat(physical)).isDirectory()) throw new Error("Package path is not a directory")
  const metadataPath = await realpath(path.join(physical, "package.json"))
  if (!(await stat(metadataPath)).isFile()) throw new Error("Package metadata must be a regular file")
  const metadata: unknown = await Bun.file(metadataPath).json()
  if (typeof metadata !== "object" || metadata === null || !("name" in metadata) || metadata.name !== "web-tree-sitter" ||
    !("version" in metadata) || metadata.version !== "0.23.2" || !("main" in metadata) || metadata.main !== "tree-sitter.js")
    throw new Error("Package metadata must name web-tree-sitter@0.23.2 with main tree-sitter.js")
  const parserPath = await realpath(path.join(physical, "tree-sitter.js"))
  if (!(await stat(parserPath)).isFile()) throw new Error("tree-sitter.js must be a regular file")
  return physical
}

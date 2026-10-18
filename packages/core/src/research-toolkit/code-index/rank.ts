export * as CodeIndexRank from "./rank"

// T-X7: transplanted from the HuGR techlead, techlead/mcp/src/onboard/derive.ts (`computePageRank`, `isTestPath`;
// Copyright 2026 HuGR Labs, Apache-2.0), the same code the Arsenal carries in modules/maestro/arsenal/src/onboard/
// derive.ts:16-25. Adapted to the index: edges are the shard's resolved `import.to_path` rows (resolve.ts, J2.7)
// instead of the relative-only `resolveSpecifier`, it runs once per shard build, and the 40/40/15 caps of
// `deriveMap` are gone: every document gets a rank.

const DAMPING = 0.85
const ITERATIONS = 20

/** Test/benchmark/example paths describe the scaffolding, not the project's core; the map lists them after it. */
const TEST_DIRS = new Set(["tests", "test", "__tests__", "spec", "benchmark", "benchmarks", "examples", "example", "e2e", "fixtures"])
export function isTestPath(file: string) {
  const segments = file.split("/")
  if (segments.some((segment) => TEST_DIRS.has(segment))) return true
  return /^test[_.]|[_.]test\.|\.spec\.|^conftest\./i.test(segments.at(-1) ?? "")
}

type Document = { readonly path: string; readonly lines: number; readonly bytes: number }
type Import = { readonly fromPath: string; readonly toPath?: string }

/** One `file_rank` row per document. */
export function ranks(documents: ReadonlyArray<Document>, imports: ReadonlyArray<Import>) {
  const rank = computePageRank(documents.map((document) => document.path), imports)
  return documents.map((document) => ({ path: document.path, rank: rank.get(document.path) ?? 0, loc: document.lines, bytes: document.bytes }))
}

/**
 * PageRank over the file-import graph. Edge A → B means A imports from B (A gives rank to B), so files imported by
 * many others rank higher. A dangling node distributes its rank equally to all nodes.
 */
export function computePageRank(paths: ReadonlyArray<string>, imports: ReadonlyArray<Import>) {
  const N = paths.length
  if (N === 0) return new Map<string, number>()
  const pathSet = new Set(paths)
  // outgoing[path] = the files this file imports from, deduped; self and out-of-shard targets give no edge.
  const outgoing = new Map(paths.map((file) => [file, new Set<string>()]))
  imports.forEach((item) => {
    if (item.toPath !== undefined && item.toPath !== item.fromPath && pathSet.has(item.toPath)) outgoing.get(item.fromPath)?.add(item.toPath)
  })
  const rank = new Map(paths.map((file) => [file, 1 / N]))
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = new Map(paths.map((file) => [file, (1 - DAMPING) / N]))
    paths.forEach((file) => {
      const targets = outgoing.get(file)!
      if (targets.size === 0) {
        const share = (rank.get(file)! * DAMPING) / N
        paths.forEach((target) => next.set(target, next.get(target)! + share))
        return
      }
      const share = (rank.get(file)! * DAMPING) / targets.size
      targets.forEach((target) => next.set(target, next.get(target)! + share))
    })
    next.forEach((value, file) => rank.set(file, value))
  }
  return rank
}

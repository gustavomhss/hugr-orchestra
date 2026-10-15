// @atlas/adapter-io — test/fs.test.ts   (WP-9.1.1-b.FS — EPIC-1-b, REQ-ADAPTER-1a/1b/1c/1d)
//
// Acceptance suite for the faithful filesystem walker `walkFileTree` (ADAPT-FS-1). It transcribes the four
// frozen goldens (docs/requirements/goldens-adapters.md) VERBATIM against the SHARED fix-repo harness
// (test/harness/fix-repo.ts — CONSUMED, never redefined):
//   • SCN-ADAPTER-1a-1 — the walk equals the reference tree, .gitignore honored          (happy)
//   • SCN-ADAPTER-1b-1 — a tracked file with no indexer is still in the tree             (guard)
//   • SCN-ADAPTER-1c-1 — no fabricated path is emitted                                   (guard)
//   • SCN-ADAPTER-1d-1 — two walks of the same tree are byte-identical                   (happy)

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { FileTree } from "@atlas/index"
import { walkFileTree } from "../src/index.js" // explicit extension: NodeNext resolution has no directory-index fallback
import { makeFixRepo, T_ref } from "./harness/fix-repo.js"
import type { FixRepo } from "./harness/fix-repo.js"

let repo: FixRepo | undefined
afterEach(() => {
  repo?.cleanup()
  repo = undefined
})

/** Flatten every node's `path` in the tree — for phantom/presence assertions. */
function allPaths(node: FileTree, acc: string[] = []): string[] {
  acc.push(node.path)
  for (const child of node.children) allPaths(child, acc)
  return acc
}

/** Find the first node whose `path` matches, or `undefined`. */
function findNode(node: FileTree, path: string): FileTree | undefined {
  if (node.path === path) return node
  for (const child of node.children) {
    const hit = findNode(child, path)
    if (hit) return hit
  }
  return undefined
}

describe("walkFileTree — ADAPT-FS-1 faithful .gitignore-honoring FileTree walk", () => {
  it("SCN-ADAPTER-1a-1 — the walk equals the reference tree, .gitignore honored (happy)", () => {
    repo = makeFixRepo()
    const walk = walkFileTree(repo.repoPath)
    // exact paths·nesting·leaf `content` in the deterministic order
    expect(walk).toStrictEqual(T_ref)
    // dist/bundle.js + debug.log are absent (gitignored)
    const paths = allPaths(walk)
    expect(paths).not.toContain("dist/bundle.js")
    expect(paths).not.toContain("debug.log")
  })

  it("SCN-ADAPTER-1b-1 — a tracked file with no indexer is still in the tree (guard)", () => {
    repo = makeFixRepo()
    const walk = walkFileTree(repo.repoPath)
    const node = findNode(walk, "legacy/report.rb")
    expect(node).toBeDefined()
    expect(node!.children).toStrictEqual([])
    expect(node!.content).toBe("def report\n  'legacy'\nend\n")
  })

  it("SCN-ADAPTER-1c-1 — no fabricated path is emitted (guard)", () => {
    repo = makeFixRepo()
    const walk = walkFileTree(repo.repoPath)
    const paths = allPaths(walk)
    expect(paths).not.toContain("dist/bundle.js")
    expect(paths).not.toContain("src/generated.ts")
  })

  it("SCN-ADAPTER-1d-1 — two walks of the same tree are byte-identical (happy)", () => {
    repo = makeFixRepo()
    const w1 = walkFileTree(repo.repoPath)
    const w2 = walkFileTree(repo.repoPath)
    expect(JSON.stringify(w1)).toBe(JSON.stringify(w2))
  })
})

// WP-N8 — boot-crash guard: `walkFileTree` runs at the composition boot path (compose.ts `composeRuntime`,
// wire.ts `assembleHandler`). Both the `git ls-files` invocation AND the per-file `readFileSync` were
// UNGUARDED — a non-git repo (git exit 128) or a tracked-but-deleted file (ENOENT) threw uncaught out of the
// `atlas`/`atlas-mcp` bins at boot. The walk must now be TOTAL: fail-closed to empty, never a throw.
describe("walkFileTree — WP-N8 fail-closed boot guard (never throws at composition boot)", () => {
  let bareDir: string | undefined
  afterEach(() => {
    if (bareDir) rmSync(bareDir, { recursive: true, force: true })
    bareDir = undefined
  })

  it("(a) a NON-git dir → empty FileTree, no throw [kills mutant: unguarded execFileSync git ls-files]", () => {
    // A plain temp dir with no `.git` makes `git ls-files` exit 128; `execFileSync` THROWS. The unguarded
    // MUTANT lets that throw escape and crash boot. The guard degrades to the empty tracked set.
    bareDir = mkdtempSync(join(tmpdir(), "atlas-nongit-"))
    let walk: FileTree | undefined
    expect(() => {
      walk = walkFileTree(bareDir!)
    }).not.toThrow()
    // Empty repo ⇒ root only, no children (identical structural view to an empty git repo).
    expect(walk).toStrictEqual({ path: ".", children: [] })
  })

  it("(b) a tracked path removed from disk → walk SKIPS it, no throw [kills mutant: unguarded readFileSync]", () => {
    // `git ls-files` still LISTS `src/util.ts` (it is committed), but the working-tree file is gone → the
    // per-file `readFileSync` throws ENOENT. The unguarded MUTANT crashes boot; the guard skips the leaf.
    repo = makeFixRepo()
    unlinkSync(join(repo.repoPath, "src/util.ts"))
    let walk: FileTree | undefined
    expect(() => {
      walk = walkFileTree(repo!.repoPath)
    }).not.toThrow()
    const paths = allPaths(walk!)
    expect(paths).not.toContain("src/util.ts") // deleted leaf skipped
    expect(paths).toContain("src/app.ts") // the readable siblings still walked
    expect(paths).toContain("api/service.py")
  })

  it("(c) a real git fixture still walks identically (happy path byte-identical)", () => {
    repo = makeFixRepo()
    expect(walkFileTree(repo.repoPath)).toStrictEqual(T_ref)
  })
})

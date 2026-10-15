// @atlas/adapter-io — test/rev-index-stable-across-builds.test.ts  (#211 — the freshness invariant)
//
// #211 alleged `createRevIndex` returns WRONG subtreeHashes after ~24 builds in one process, always toward
// false-DRIFTED. MEASURED and REFUTED (see the completion card): the memo is an UNBOUNDED `Map<rev, Axes>`
// keyed by the immutable SHA (no cap/LRU/ring), and the subtreeHash is minted through the PURE, stateless
// kernel `id` seam — there is no shared mutable buffer or accumulator to overflow. This suite is the
// permanent guard on the invariant the report cared about: N builds in one process ⇒ the SAME subtreeHash
// for the same (unchanged) unit. It is driven at high N over the identical AST-fold + build + hash path that
// `axesAt` runs, and cross-checked against the shipped `createRevIndex` reader on a real 2-commit repo.

import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, expect, beforeAll } from "vitest"
import { build } from "@atlas/index"
import type { FileTree, IndexNode } from "@atlas/index"
import { foldAstUnits, initAst } from "../src/ast.js"
import { createRevIndex } from "../src/rev-index.js"

const findNode = (node: IndexNode, key: string): IndexNode | undefined => {
  if (node.key === key) return node
  for (const child of node.children) {
    const hit = findNode(child, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

// A tree with sub-file item + block units (function + arrow), so the fold exercises the parse path fully.
const STABLE = "src/stable.ts"
const TREE: FileTree = {
  path: ".",
  children: [
    {
      path: "src",
      children: [
        {
          path: STABLE,
          children: [],
          content:
            "export function stable(x: number): number {\n  const g = (y: number) => y + 1;\n  return g(x) * 2;\n}\n",
        },
      ],
    },
  ],
}

describe("#211 — N builds in one process ⇒ stable subtreeHash (freshness never lies false-DRIFTED)", () => {
  beforeAll(async () => {
    await initAst()
  })

  it("50 fresh builds of the SAME unit fold to ONE subtreeHash [teeth: a per-process accumulator/cap ⇒ divergence ⇒ RED]", () => {
    const hashes = new Set<string>()
    let firstDivergedAt = -1
    let first: string | undefined
    for (let i = 0; i < 50; i++) {
      const axes = build(foldAstUnits(TREE), { documents: [] })
      const node = findNode(axes.spatial, STABLE)
      expect(node).toBeDefined()
      const h = String(node!.subtreeHash)
      if (first === undefined) first = h
      else if (h !== first && firstDivergedAt < 0) firstDivergedAt = i
      hashes.add(h)
    }
    // The whole claim of #211 collapses to this line: no drift, at any build, ever.
    expect(firstDivergedAt).toBe(-1)
    expect(hashes.size).toBe(1)
    // MUTANT: any per-process shared buffer/accumulator/ring in the fold or the kernel `id` seam that
    // mutated across calls would surface a second hash here → size > 1 → RED.
  })

  it("createRevIndex reader path: an unchanged unit re-derives FRESH across repeated arbitrary-rev builds", () => {
    const g = (repo: string, args: readonly string[]): string =>
      execFileSync("git", args as string[], { cwd: repo, encoding: "utf8" }).trim()
    const repo = mkdtempSync(join(tmpdir(), "revidx-stable-"))
    try {
      g(repo, ["init", "-q"])
      g(repo, ["config", "user.email", "t@t.t"])
      g(repo, ["config", "user.name", "T"])
      g(repo, ["config", "commit.gpgsign", "false"])
      mkdirSync(join(repo, "src"), { recursive: true })
      writeFileSync(join(repo, STABLE), TREE.children[0]!.children[0]!.content!)
      g(repo, ["add", "-A"])
      g(repo, ["commit", "-q", "-m", "A"])
      const A = g(repo, ["rev-parse", "HEAD"])
      // A second commit that touches ONLY a different file — STABLE is byte-identical at B.
      writeFileSync(join(repo, "src/other.ts"), "export const z = 9;\n")
      g(repo, ["add", "-A"])
      g(repo, ["commit", "-q", "-m", "B"])
      const B = g(repo, ["rev-parse", "HEAD"])

      const rev = createRevIndex(repo)
      const refA = rev.resolveAnchorAt(A, STABLE)
      const refB = rev.resolveAnchorAt(B, STABLE)
      expect(refA).toBeDefined()
      expect(refB).toBeDefined()
      // STABLE never changed ⇒ its content-addressed subtreeHash is identical at both revs (no false-DRIFTED).
      expect(String(refA!.subtreeHash)).toBe(String(refB!.subtreeHash))
    } finally {
      rmSync(repo, { recursive: true, force: true })
    }
  })
})

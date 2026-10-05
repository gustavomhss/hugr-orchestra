// @atlas/adapter-io — test/rev-index-scip-parity.test.ts
//
// THE CLAIM UNDER TEST is a COMMENT: rev-index.ts's header says its `build` applies "the SAME transform
// composeRuntime/assembleHandler apply at compose time". It does — for the TREE argument (`foldAstUnits`).
// It does NOT for the second one: compose.ts passes `readScipOrEmpty(scipPath)` and every `build` in
// rev-index.ts passes a hardcoded `{ documents: [] }`, so the arbitrary-rev index that reconcile and doctor
// resolve anchors against is built from a SCIP dump with no documents in it.
//
// A comment cannot be executed, so the header now states the asymmetry AND why it cannot move an answer,
// and this file is what stops that "why" from rotting into another unchecked claim. It measures the exact
// difference between the two builds over ONE folded tree, and pins the three facts the header rests on:
//
//   (1) `spatial` and `territory` are BYTE-IDENTICAL — SCIP feeds `deriveEdges`/`dependency` alone.
//   (2) `dependency` really does DIFFER — so (1) is a measurement, not a vacuous comparison of two
//       identical builds. If a future change routes SCIP into the content-committing axes, (1) fails.
//   (3) the drift oracle `driftDetect` (grounding/src/drift.ts) resolves over `spatial`/`territory` only,
//       so it returns the same verdict against both builds — including for an anchor deep in a `::`
//       sub-file unit, which is the granularity the header exists to defend.
//
// If (1) or (3) ever breaks, the empty `{ documents: [] }` becomes drift-oracle blindness and this test is
// the thing that says so, rather than a reader re-deriving it from two files that never mention each other.

import { describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { build } from "@atlas/index"
import type { Axes, IndexNode, ScipOutput } from "@atlas/index"
import { driftDetect } from "@atlas/grounding"
import type { SubtreeHash } from "@atlas/contracts"
import { foldAstUnits, initAst, walkFileTree } from "../src/index.js"

// The AST grammars must be warm or `foldAstUnits` is a no-op and the `::` sub-file arm of (3) is vacuous.
await initAst()

/** A real two-document SCIP dump over the fixture: `app.ts` references a symbol `util.ts` defines, so
 *  `deriveEdges` yields one RESOLVED edge and the dependency axis gains both documents as leaves. */
const SCIP = {
  documents: [
    { relativePath: "src/util.ts", occurrences: [{ symbol: "greet", role: "definition" }] },
    { relativePath: "src/app.ts", occurrences: [{ symbol: "greet", role: "reference" }] },
  ],
} as unknown as ScipOutput

/** Every `key=subtreeHash` in an axis, preorder — the full byte-level identity of the hierarchy. */
function fingerprint(node: IndexNode, out: string[] = []): string[] {
  out.push(`${node.key}=${String(node.subtreeHash)}`)
  for (const c of node.children) fingerprint(c, out)
  return out
}

/** DFS for a node by key (the same traversal rev-index's `findNode` performs). */
function find(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit = find(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

function fixture(): { repoPath: string; cleanup: () => void } {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-revidx-scip-"))
  const files: Record<string, string> = {
    "src/util.ts": 'export const greet = () => "hi";\nexport const bye = () => "bye";\n',
    "src/app.ts": 'import { greet } from "./util.js";\nexport const go = () => greet();\n',
  }
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
  }
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: repoPath, stdio: "ignore" })
  }
  git("init", "-q")
  git("config", "user.email", "revidx@atlas.local")
  git("config", "user.name", "atlas-revidx")
  git("add", "-A")
  git("commit", "-q", "-m", "fixture")
  return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** The two builds rev-index.ts and compose.ts respectively perform, over ONE identical folded tree. */
function bothBuilds(repoPath: string): { empty: Axes; withScip: Axes } {
  const tree = foldAstUnits(walkFileTree(repoPath))
  return { empty: build(tree, { documents: [] }), withScip: build(tree, SCIP) }
}

describe("rev-index builds with `{documents: []}` — what that costs, measured", () => {
  it("(1) the CONTENT-COMMITTING axes are byte-identical: SCIP touches neither spatial nor territory", () => {
    const fx = fixture()
    try {
      const { empty, withScip } = bothBuilds(fx.repoPath)
      expect(fingerprint(empty.spatial)).toEqual(fingerprint(withScip.spatial))
      expect(fingerprint(empty.territory)).toEqual(fingerprint(withScip.territory))
      // non-vacuous: the fingerprint really did walk a folded tree with sub-file units in it.
      expect(fingerprint(empty.spatial).some((e) => e.includes("::"))).toBe(true)
    } finally {
      fx.cleanup()
    }
  })

  it("(2) the DEPENDENCY axis does differ — so (1) is a measurement, not two identical builds", () => {
    const fx = fixture()
    try {
      const { empty, withScip } = bothBuilds(fx.repoPath)
      expect(empty.edges).toHaveLength(0)
      expect(withScip.edges.length).toBeGreaterThan(0)
      expect(fingerprint(empty.dependency)).not.toEqual(fingerprint(withScip.dependency))
      // …and the whole difference is confined to keys NO path-shaped anchor can name: every dependency
      // child is a 64-hex `id({file: p})` whose subtreeHash IS its own key (an identity, not a content
      // fold). That is the property rev-index's two path/content resolvers rely on.
      for (const child of withScip.dependency.children) {
        expect(child.key).toMatch(/^[0-9a-f]{64}$/)
        expect(String(child.subtreeHash)).toBe(child.key)
      }
    } finally {
      fx.cleanup()
    }
  })

  it("(3) the DRIFT ORACLE returns the same verdict against both builds — file AND `::` symbol anchors", () => {
    const fx = fixture()
    try {
      const { empty, withScip } = bothBuilds(fx.repoPath)

      const fileNode = find(empty.spatial, "src/util.ts")
      expect(fileNode).toBeDefined()
      const unit = fileNode!.children[0]
      expect(unit, "the fixture must fold at least one `::` sub-file unit").toBeDefined()

      const anchored = (qualifiedPath: string, subtreeHash: SubtreeHash) => ({
        entries: [{ anchor: { kind: "file" as const, qualifiedPath, subtreeHash }, path: "src/util.ts" }],
      })

      for (const [qp, h] of [
        ["src/util.ts", fileNode!.subtreeHash],
        [unit!.key, unit!.subtreeHash],
      ] as const) {
        const g = anchored(qp, h)
        expect(driftDetect(g, empty)).toBe("FRESH") // resolves in the empty-SCIP build…
        expect(driftDetect(g, withScip)).toBe(driftDetect(g, empty)) // …and identically in the other

        // TEETH: a moved/edited anchor must DRIFT in both, or the agreement above is agreement on a
        // verdict the oracle hands out unconditionally.
        const rotted = anchored(qp, "not-the-recorded-hash" as unknown as SubtreeHash)
        expect(driftDetect(rotted, empty)).toBe("DRIFTED")
        expect(driftDetect(rotted, withScip)).toBe("DRIFTED")
      }
    } finally {
      fx.cleanup()
    }
  })
})

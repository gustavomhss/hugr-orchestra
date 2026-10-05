// @atlas/index — test/identity-goldens.test.ts  (#104: the PINNED-HASH goldens for the structural fold)
//
// ╔══════════════════════════════════════════════════════════════════════════════════════════════════════╗
// ║  A CHANGE HERE IS A MIGRATION EVENT, NOT A TEST TO UPDATE.                                            ║
// ║                                                                                                       ║
// ║  Every literal below is a hash that a REAL, ON-DISK `.atlas` store contains. If one of them moves,     ║
// ║  every store in the world that was written before your change is now addressed by rules this build no  ║
// ║  longer computes: every anchor stops resolving, every grounded fact reads DRIFTED, and the store's     ║
// ║  owner has no way to tell that from "my code changed".                                                ║
// ║                                                                                                       ║
// ║  So the correct response to a RED in this file is NEVER to paste in the new value. It is:              ║
// ║    1. Decide whether the re-key is worth it. It costs every user a full re-derive.                     ║
// ║    2. If it is: BUMP `IDENTITY_SCHEMA` in `packages/adapter-io/src/identity-schema.ts`, so an existing  ║
// ║       store is DETECTED and refused with a legible reason instead of silently mis-read (#112).         ║
// ║    3. Update the pin, in the same commit as the bump, and say in the message what moved and why.       ║
// ║  Pasting the new hash WITHOUT step 2 is precisely the failure #112 exists to make impossible.          ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════════════════╝
//
// ── WHY THIS FILE EXISTS (#104) ──────────────────────────────────────────────────────────────────────────
// `git grep -l -P "[0-9a-f]{40,}"` over the repo's test directories returned essentially nothing. NOT ONE
// golden anywhere pinned a hash constant. The consequence was measured, not theorised: a seat re-keyed EVERY
// `subtreeHash` in the repository (`0b65b42`, then `f2a8659`) and 1346 tests stayed green. Every existing
// test asserted RELATIONS between hashes — "a change drifts", "the order does not matter", "the rebuild and
// the incremental re-hash agree" — and every one of those relations is preserved by ANY injective change to
// the fold. The suite was structurally blind to the exact class of change that breaks users' stores.
//
// These are the missing absolute assertions. They are worth exactly what their INPUTS are worth, so every
// input is a literal spelled out in this file, and every value was produced by RUNNING the production
// functions over those inputs (`foldNodeHash`, `build`, `nodeRollup`, `rehashPath` — never hand-computed,
// never transcribed from a commit message).
//
// TWO OF THEM CAN BE CROSS-CHECKED AGAINST AN INDEPENDENT WITNESS, and they are: `0b65b42`'s own commit
// message records that the empty-file / empty-repo-root collision was closed with "642aa93e vs f6795eed".
// Those are the first eight hex digits of `EMPTY_DIR` and `EMPTY_FILE` below, generated here from the live
// code. That agreement is the evidence that these literals really do come off the production path.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { SubtreeHash } from "@atlas/contracts"
import { build, nodeHashOfPath } from "../src/build.js"
import { foldNodeHash, nodeRollup, rehashPath, subtreeHash } from "../src/rollup.js"
import type { FileTree, IndexNode, ScipOutput } from "../src/types.js"

/** The remediation, attached to every assertion so a RED reads as an instruction rather than a diff. */
const MIGRATION =
  "MIGRATION EVENT — this hash is in real on-disk stores. Do NOT paste the new value: bump " +
  "`IDENTITY_SCHEMA` in packages/adapter-io/src/identity-schema.ts in the SAME commit (#112), or every " +
  "existing store silently reads DRIFTED with no explanation."

// ── THE INPUTS. Every byte that reaches a digest below is written out here. ───────────────────────────────
const A_SRC = "export const a = 1;\n"
const B_SRC = 'import { a } from "./a.js";\nexport const b = a;\n'

const TREE: FileTree = {
  path: ".",
  children: [
    {
      path: "src",
      children: [
        { path: "src/a.ts", children: [], content: A_SRC },
        { path: "src/b.ts", children: [], content: B_SRC },
      ],
    },
  ],
}

const SCIP: ScipOutput = {
  documents: [
    { relativePath: "src/a.ts", occurrences: [{ symbol: "sym.a", role: "definition" }] },
    {
      relativePath: "src/b.ts",
      occurrences: [
        { symbol: "sym.a", role: "reference" }, // resolved  ⇒ an edge b → a
        { symbol: "sym.ext", role: "reference" }, // unresolved ⇒ `to: null`, declared not guessed
      ],
    },
  ],
} as unknown as ScipOutput

/** The node's OWN bytes, for the recompute paths — `IndexNode` is a lossy projection and does not carry them. */
const contentOf = (key: string): string | undefined =>
  key === "src/a.ts" ? A_SRC : key === "src/b.ts" ? B_SRC : undefined

/** Locate a node by key in a built axis. Test-local on purpose: reusing a production resolver here would
 *  make the golden depend on the thing it is pinning. */
function at(node: IndexNode, key: string): IndexNode {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit: IndexNode | undefined = c.key === key ? c : tryAt(c, key)
    if (hit !== undefined) return hit
  }
  throw new Error(`fixture drift: no node \`${key}\` in the built axis — this golden is quantifying over nothing`)
}
function tryAt(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit = tryAt(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}

const axes = build(TREE, SCIP)

describe("#104 — PINNED IDENTITY GOLDENS: the node fold (a RED here is a MIGRATION EVENT)", () => {
  // ── THE NODE FOLD, called directly, on material spelled out inline. This is the single implementation of
  //    a subtreeHash in the repo (`rollup.ts` header), so it is the root pin: everything else routes here.
  it("foldNodeHash — a BRANCH over two named children", () => {
    const h = foldNodeHash({
      key: "src",
      children: [
        { key: "src/a.ts", subtreeHash: asSubtreeHash("aaaa") },
        { key: "src/b.ts", subtreeHash: asSubtreeHash("bbbb") },
      ],
    })
    expect(String(h), MIGRATION).toBe("284558640453e1e761abfbd734ecefa014396051d793d1a56177de115f3ecdad")
  })

  it("foldNodeHash — a LEAF over its own content", () => {
    const h = foldNodeHash({ key: "src/a.ts", content: A_SRC, children: [] })
    expect(String(h), MIGRATION).toBe("a7a475f5dee73a8422cc899ee020596652f30a897733aaa54eed64a6affc711e")
  })

  // The absent-vs-empty `content` distinction, pinned on BOTH sides. It is what stops an empty FILE and an
  // empty REPO ROOT from sharing one identity, and the two literals are the ones `0b65b42`'s commit message
  // records ("642aa93e vs f6795eed") — an independent witness that these come off the production path.
  it('foldNodeHash — an EMPTY FILE (content: "") and an EMPTY DIRECTORY (content absent) stay distinct', () => {
    const emptyFile = String(foldNodeHash({ key: "src/e.ts", content: "", children: [] }))
    const emptyDir = String(foldNodeHash({ key: "src/e", children: [] }))
    expect(emptyFile, MIGRATION).toBe("f6795eed0a54344bd5e320bf2934903d9de877a90f149407ad8c7dc1a3d9e3fc")
    expect(emptyDir, MIGRATION).toBe("642aa93ec61e807643894aa7e09237d8e927726308c78df8f68dae9e33dbb604")
    expect(emptyFile).not.toBe(emptyDir)
  })

  // ── THE WHOLE BUILD, so a change anywhere on the path from a FileTree to a stored hash is caught — not
  //    just a change to the fold's own preimage. The key mint, the child-name derivation and the sort all
  //    sit between `TREE` and these values.
  it("build — the spatial axis: root, an interior directory, and a file leaf", () => {
    expect(String(axes.spatial.subtreeHash), MIGRATION).toBe(
      "b19fc1798a6a1671eddbdfb8838def4f935d10c173e137b87ce16c7c842cfde2",
    )
    expect(String(at(axes.spatial, "src").subtreeHash), MIGRATION).toBe(
      "7daed8703a4391173d76d248b58bbb27aa71853c553742293f983fae7eca6eca",
    )
    expect(String(at(axes.spatial, "src/a.ts").subtreeHash), MIGRATION).toBe(
      "a7a475f5dee73a8422cc899ee020596652f30a897733aaa54eed64a6affc711e",
    )
  })

  it("build — the dependency-axis root folds the whole edge ledger", () => {
    expect(String(axes.dependency.subtreeHash), MIGRATION).toBe(
      "64544e2e55a7d09207ffdfcb29be26dee6c35bc18ae4cf6b71d9a803ab372841",
    )
  })

  it("nodeHashOfPath — the ONE path→identity mint that genesis joins a mined StructRef back by", () => {
    expect(String(nodeHashOfPath("src/a.ts")), MIGRATION).toBe(
      "167d4964c726f310799c0f8ab667050b846dffb1d9687e7754a367d31f1826a6",
    )
  })

  // OBSERVED WHILE GENERATING THESE, and pinned so it cannot change unnoticed: the AXIS NAME is not in the
  // fold preimage, so the spatial and territory roots over the same tree are the SAME hash. That is
  // consistent (both rails fold identical material through identical rules) and the drift oracle scans them
  // in order, so it is not a defect — but it is a property of the identity schema that nothing else asserts,
  // and adding an axis tag to the preimage would re-key one whole rail without any other test noticing.
  it("build — the territory root EQUALS the spatial root: the axis name is NOT in the fold preimage", () => {
    expect(String(axes.territory.subtreeHash), MIGRATION).toBe(
      "b19fc1798a6a1671eddbdfb8838def4f935d10c173e137b87ce16c7c842cfde2",
    )
    expect(String(axes.territory.subtreeHash)).toBe(String(axes.spatial.subtreeHash))
  })
})

describe("#104 — PINNED IDENTITY GOLDENS: the STATE root (a RED here is a MIGRATION EVENT)", () => {
  const node = at(axes.spatial, "src/a.ts")

  it("nodeRollup — rId is the structure root and rState is its own, separately-domained digest", () => {
    const roll = nodeRollup(node, { status: "ACTIVE", freshness: 1 })
    expect(String(roll.rId), MIGRATION).toBe("a7a475f5dee73a8422cc899ee020596652f30a897733aaa54eed64a6affc711e")
    expect(String(roll.rState), MIGRATION).toBe("ec02cedf28fb963d237778d9f504adb9ea0c5087d85ff6330ee8c021054ad4a1")
  })

  // INDEX-12a's two-distinct-roots law, pinned ABSOLUTELY rather than relationally. The relational form ("a
  // status flip moves rState and not rId") is already asserted elsewhere and survives any re-keying; these
  // literals do not. `stateRoot`'s preimage keys are `stateStatus`/`stateFreshness` precisely because
  // `status`/`freshness` are KERNEL-8 side-index names that `canonicalForm` DELETES — rename them back and
  // rState silently collapses to a function of rId alone, which this pair catches and the relation does not.
  it("nodeRollup — a STATUS flip moves rState to a second pinned value, leaving rId untouched", () => {
    const flipped = nodeRollup(node, { status: "RETIRED", freshness: 1 })
    expect(String(flipped.rState), MIGRATION).toBe("8cb59401957cd96f655f289c609b22d069862e51b7d864ceeec64806acb82e69")
    expect(String(flipped.rId)).toBe("a7a475f5dee73a8422cc899ee020596652f30a897733aaa54eed64a6affc711e")
  })
})

describe("#104 — PINNED IDENTITY GOLDENS: the incremental re-hash agrees with the rebuild, ABSOLUTELY", () => {
  // `0b65b42` claimed "given the same material this incremental re-hash reproduces a full rebuild's root
  // byte-for-byte" and proved it RELATIONALLY (recompute === build). That equality holds under any injective
  // re-key, so it certified nothing about the value. Pinned here to the literal the rebuild produces, so the
  // claim is now anchored to a number rather than to itself.
  it("subtreeHash — recomputing the built tree reproduces the pinned rebuild root", () => {
    expect(String(subtreeHash(axes.spatial, contentOf)), MIGRATION).toBe(
      "b19fc1798a6a1671eddbdfb8838def4f935d10c173e137b87ce16c7c842cfde2",
    )
    expect(String(subtreeHash(axes.spatial, contentOf))).toBe(String(axes.spatial.subtreeHash))
  })

  it("rehashPath — the leaf→root re-fold after an edit lands on a pinned root", () => {
    const edited: SubtreeHash = asSubtreeHash("deadbeef")
    const { root } = rehashPath(axes.spatial, [".", "src", "src/a.ts"], edited, contentOf)
    expect(String(root.subtreeHash), MIGRATION).toBe("49b1fc5124b8e2a1496d34599c1af1fa081416ff9977d29e8c0845222197913c")
    // …and it really did move: pinning only the post-edit value would pass over a no-op re-hash.
    expect(String(root.subtreeHash)).not.toBe(String(axes.spatial.subtreeHash))
  })
})

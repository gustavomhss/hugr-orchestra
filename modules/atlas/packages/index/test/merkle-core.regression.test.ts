// @atlas/index — test/merkle-core.regression.test.ts
//
// Regression teeth for the SACRED CORE: the node rollup (`foldNodeHash`) and everything that mints an
// identity from it. Every test here was SEEN RED against the pre-fix code — the pre-fix rollup was
// `children.length === 0 ? id({content}) : id({children: sortedChildHashes})`, which dropped a node's OWN
// content the moment it had children and bound no child NAME at all.
//
// WHY THIS FILE EXISTS AT ALL: the rest of the suite recomputes both sides of every hash assertion, so it
// stays green through an arbitrary re-keying of the whole index (verified: the full 191-file suite passed
// unchanged after every subtreeHash in the repo moved). These tests are written to be RELATIONAL but
// SEMANTIC — they assert what a change to a node MUST do to its identity, not what digest it produces —
// so they survive an encoder swap while still failing on a fold that stops committing to something.
//
// NOTE: deliberately NO pinned literal digests here. The hash-goldens pin is a separate, dedicated seat's
// surface and must be taken against the final fold shape, not duplicated ad hoc.

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash, id } from "@atlas/kernel"
import type { Hash, SubtreeHash } from "@atlas/contracts"
import { build } from "../src/build.js"
import { delta } from "../src/fold.js"
import { foldNodeHash, nodeRollup, rehashPath, subtreeHash } from "../src/rollup.js"
import type { Axes, Axis, FileTree, IndexNode } from "../src/types.js"

const NO_SCIP = { documents: [] }
const rootOf = (tree: FileTree): string => String(build(tree, NO_SCIP).spatial.subtreeHash)

/** The spatial node at `key` in a built tree, or `undefined`. */
function at(node: IndexNode, key: string): IndexNode | undefined {
  if (node.key === key) return node
  for (const c of node.children) {
    const hit = at(c, key)
    if (hit !== undefined) return hit
  }
  return undefined
}
const hashAt = (tree: FileTree, key: string): string => String(at(build(tree, NO_SCIP).spatial, key)?.subtreeHash)

const file = (path: string, content: string): FileTree => ({ path, children: [], content })
const dir = (path: string, children: FileTree[]): FileTree => ({ path, children })

// A repo whose `src` directory holds two sibling files — the directory-anchor fixture.
const twoSiblings = (aContent: string, bContent: string, aPath = "src/a.ts"): FileTree =>
  dir(".", [dir("src", [file(aPath, aContent), file("src/b.ts", bContent)])])

// A FILE that carries its own bytes AND has a parsed item child — the shape the real AST rail produces
// (adapter-io/src/ast.ts: a refined file keeps `content` and gains item children). Any node like this is a
// BRANCH WITH OWN CONTENT, and it is the shape the old fold went blind on.
const fileWithItem = (fileContent: string, itemContent: string): FileTree =>
  dir(".", [
    {
      path: "src/acct.ts",
      content: fileContent,
      children: [{ path: "src/acct.ts::48:class_declaration:Acct", children: [], content: itemContent }],
    },
  ])

describe("DEFECT 1 — the rollup must commit to OWN CONTENT and to CHILD NAMES", () => {
  it("a sibling SWAP drifts the parent directory (multiset of child hashes is not an identity)", () => {
    // RED pre-fix: both folded to id({children: sorted([H(A),H(B)])}) — a swap is invisible to a sort.
    expect(rootOf(twoSiblings("A", "B"))).not.toBe(rootOf(twoSiblings("B", "A")))
  })

  it("a RENAME with byte-identical content drifts the parent directory", () => {
    // RED pre-fix: the child's hash was f(content) only and no name was bound, so the parent never moved.
    const before = twoSiblings("A", "B", "src/a.ts")
    const after = twoSiblings("A", "B", "src/renamed.ts")
    expect(hashAt(before, "src")).not.toBe(hashAt(after, "src"))
    expect(rootOf(before)).not.toBe(rootOf(after))
  })

  it("a BRANCH's own content change, outside every child, drifts it (import / top-level stmt / class field)", () => {
    // RED pre-fix: `if (children.length) return id({children})` dropped `node.content` entirely, so a
    // changed import target, an appended `console.log(process.env)`, a flipped `isAdmin` class field, a
    // class rename and a new `extends` ALL reported FRESH at the file anchor. One item child is enough to
    // reproduce every one of them: they are all edits to the file's own bytes outside the modelled child.
    const item = "class Acct { isAdmin = false }"
    const base = fileWithItem(`import { verify } from './safe-crypto';\n${item}\n`, item)
    const swappedImport = fileWithItem(`import { verify } from './attacker-crypto';\n${item}\n`, item)
    const appended = fileWithItem(
      `import { verify } from './safe-crypto';\n${item}\nconsole.log('exfiltrate', process.env);\n`,
      item,
    )
    const K = "src/acct.ts"
    expect(hashAt(base, K)).not.toBe(hashAt(swappedImport, K))
    expect(hashAt(base, K)).not.toBe(hashAt(appended, K))
    // and it propagates to the repo root, so a root-anchored fact drifts too
    expect(rootOf(base)).not.toBe(rootOf(swappedImport))
    expect(rootOf(base)).not.toBe(rootOf(appended))
  })

  it("an edit INSIDE a child still drifts every ancestor (the pre-fix CONTROL must not regress)", () => {
    const before = fileWithItem("X\nclass Acct { isAdmin = false }\n", "class Acct { isAdmin = false }")
    const after = fileWithItem("X\nclass Acct { isAdmin = true }\n", "class Acct { isAdmin = true }")
    const ITEM = "src/acct.ts::48:class_declaration:Acct"
    expect(hashAt(before, ITEM)).not.toBe(hashAt(after, ITEM))
    expect(hashAt(before, "src/acct.ts")).not.toBe(hashAt(after, "src/acct.ts"))
    expect(rootOf(before)).not.toBe(rootOf(after))
  })

  it("an EMPTY FILE and an EMPTY REPO ROOT do not share one identity", () => {
    // RED pre-fix: both were id({content: ''}) — the single hash 29df8ef0…, which a content-addressed
    // relocation (`resolveBySubtreeAt`) would happily use to re-anchor a fact from one onto the other.
    const emptyRepo = build(dir(".", []), NO_SCIP).spatial.subtreeHash
    const emptyFile = at(build(dir(".", [file("empty.txt", "")]), NO_SCIP).spatial, "empty.txt")!.subtreeHash
    expect(String(emptyRepo)).not.toBe(String(emptyFile))
  })

  it("a DIRECTORY with no children and a FILE with empty content are distinct (absent ≠ empty content)", () => {
    expect(String(foldNodeHash({ key: "x", children: [] }))).not.toBe(
      String(foldNodeHash({ key: "x", content: "", children: [] })),
    )
  })

  it("CONTROL — order-independence (INDEX-2) survives: entry presentation order does not move the root", () => {
    const kids = [
      { key: "p/a", subtreeHash: asSubtreeHash("h1") },
      { key: "p/b", subtreeHash: asSubtreeHash("h2") },
      { key: "p/c", subtreeHash: asSubtreeHash("h3") },
    ]
    const base = String(foldNodeHash({ key: "p", children: kids }))
    expect(String(foldNodeHash({ key: "p", children: [...kids].reverse() }))).toBe(base)
    expect(String(foldNodeHash({ key: "p", children: [kids[1]!, kids[2]!, kids[0]!] }))).toBe(base)
  })

  it("CONTROL — a whole-subtree MOVE keeps the moved subtree content-addressable (git-tree naming)", () => {
    // Child names are bound RELATIVE to the parent, so relocating a subtree does not re-key its interior.
    // This is what keeps `resolveBySubtreeAt` able to relocate a moved unit by content.
    const here = dir(".", [dir("src", [file("src/a.ts", "A")])])
    const moved = dir(".", [dir("lib", [file("lib/a.ts", "A")])])
    expect(hashAt(here, "src")).toBe(hashAt(moved, "lib"))
  })
})

describe("DEFECT 2 — exactly ONE rollup implementation", () => {
  const contentFree = dir(".", [dir("src", [file("src/a.ts", "A"), file("src/b.ts", "B")])])

  it("build() and subtreeHash() agree on the SAME tree", () => {
    // RED pre-fix: 1787db7c… (build) vs 758027f2… (subtreeHash) — two different algorithms, both
    // documented as `blake3(concat(sorted))` at atlas-index:40. One of the two docstrings was lying.
    const axes = build(contentFree, NO_SCIP)
    expect(String(subtreeHash(axes.spatial))).toBe(String(axes.spatial.subtreeHash))
  })

  it("the incremental rehashPath reproduces a full rebuild byte-for-byte", () => {
    // RED pre-fix: da4ade33… (rebuild) vs f9969a34… (incremental) — the INDEX-2b/2c door could never agree
    // with the door it is supposed to be an optimization of.
    const before = build(contentFree, NO_SCIP)
    const afterTree = dir(".", [dir("src", [file("src/a.ts", "A2"), file("src/b.ts", "B")])])
    const rebuilt = build(afterTree, NO_SCIP)
    const newLeaf = at(rebuilt.spatial, "src/a.ts")!.subtreeHash
    const inc = rehashPath(before.spatial, [".", "src", "src/a.ts"], newLeaf)
    expect(String(inc.root.subtreeHash)).toBe(String(rebuilt.spatial.subtreeHash))
  })

  it("rehashPath reproduces a rebuild through a CONTENT-BEARING branch when given its material", () => {
    const before = build(fileWithItem("H\nI1", "I1"), NO_SCIP)
    const rebuilt = build(fileWithItem("H\nI2", "I2"), NO_SCIP)
    const K = "src/acct.ts"
    const ITEM = "src/acct.ts::48:class_declaration:Acct"
    const newItem = at(rebuilt.spatial, ITEM)!.subtreeHash
    const contentOf = (k: string): string | undefined => (k === K ? "H\nI2" : undefined)
    const inc = rehashPath(before.spatial, [".", K, ITEM], newItem, contentOf)
    expect(String(inc.root.subtreeHash)).toBe(String(rebuilt.spatial.subtreeHash))
  })

  it("an INCOMPLETE re-derivation fails CLOSED — it never reproduces the recorded root by accident", () => {
    // `IndexNode` is a lossy projection: it does not carry a branch's own bytes. Re-deriving without them
    // must DIFFER (⇒ the caller reads DRIFTED), never coincide (⇒ a false FRESH).
    const built = build(fileWithItem("HEADER\nITEM", "ITEM"), NO_SCIP)
    const branch = at(built.spatial, "src/acct.ts")!
    expect(String(subtreeHash(branch))).not.toBe(String(branch.subtreeHash))
    const withMaterial = (k: string): string | undefined => (k === "src/acct.ts" ? "HEADER\nITEM" : undefined)
    expect(String(subtreeHash(branch, withMaterial))).toBe(String(branch.subtreeHash))
  })

  it("nodeRollup rId is the structure root and is invariant under a state flip (INDEX-12a)", () => {
    const built = build(contentFree, NO_SCIP)
    const r1 = nodeRollup(built.spatial, { status: "active", freshness: 1 })
    const r2 = nodeRollup(built.spatial, { status: "stale", freshness: 1 })
    expect(String(r1.rId)).toBe(String(built.spatial.subtreeHash))
    expect(r2.rId).toBe(r1.rId)
    expect(r2.rState).not.toBe(r1.rState)
  })
})

describe("DEFECT 3 — the digest encoding must be INJECTIVE, not separator-joined", () => {
  const nd = (key: string, subtree: string, children: IndexNode[] = []): IndexNode => ({
    axis: "spatial" as Axis,
    level: "block",
    key,
    subtreeHash: asSubtreeHash(subtree),
    children,
    objects: [],
  })

  it("a NUL inside a child hash cannot migrate across a field boundary", () => {
    // RED pre-fix: both sides were 48417772… — `["a\0b","c"].join('\0')` === `["a","b\0c"].join('\0')`.
    const p1 = nd("p", "ignored", [nd("x", "a\0b"), nd("y", "c")])
    const p2 = nd("p", "ignored", [nd("x", "a"), nd("y", "b\0c")])
    expect(String(subtreeHash(p1))).not.toBe(String(subtreeHash(p2)))
  })

  it("a caller-supplied status cannot FORGE another node state root", () => {
    // RED pre-fix: both rStates were 19acdcb4… despite the two rIds DIFFERING — `status` is arbitrary
    // caller-supplied text, so stateRoot was directly forgeable.
    const s1 = nodeRollup(nd("n", "a\0b"), { status: "c", freshness: 1 })
    const s2 = nodeRollup(nd("n", "a"), { status: "b\0c", freshness: 1 })
    expect(String(s1.rId)).not.toBe(String(s2.rId))
    expect(s1.rState).not.toBe(s2.rState)
  })

  it("a separator inside a CHILD NAME cannot forge a different set of entries", () => {
    const a = foldNodeHash({ key: "", children: [{ key: "a\0b", subtreeHash: asSubtreeHash("h") }] })
    const b = foldNodeHash({ key: "", children: [{ key: "a", subtreeHash: asSubtreeHash("\0bh") }] })
    expect(String(a)).not.toBe(String(b))
  })
})

describe("DEFECT 4 — the float guard must not be bypassable, and rState must still depend on STATE", () => {
  const leaf: IndexNode = {
    axis: "spatial",
    level: "block",
    key: "n",
    subtreeHash: asSubtreeHash("L"),
    children: [],
    objects: [],
  }

  it("a non-integer freshness is REFUSED, not stringified into the digest", () => {
    // RED pre-fix: `${s.freshness}` produced "0.30000000000000004" and reached BLAKE3 un-rejected, even
    // though the kernel canonical-form guard forbids floats.
    expect(() => nodeRollup(leaf, { status: "s", freshness: 0.1 + 0.2 })).toThrow(/canonical-form violation/)
    expect(() => nodeRollup(leaf, { status: "s", freshness: 3 })).not.toThrow()
  })

  it("THE TRAP — rState still moves with BOTH status and freshness (KERNEL-8 SIDE_INDEX would delete them)", () => {
    // `status` and `freshness` are KERNEL-8 SIDE_INDEX keys that `canonicalForm` DELETES from any preimage.
    // Routing stateRoot through `id({rId, status, freshness})` — the obvious repair — would have silently
    // dropped both, collapsing rState into f(rId): a state root that no longer depends on state.
    expect(String(id({ rId: "R", status: "s", freshness: 2 }))).toBe(
      String(id({ rId: "R", status: "X", freshness: 9 })),
    )
    const base = nodeRollup(leaf, { status: "active", freshness: 1 })
    expect(nodeRollup(leaf, { status: "stale", freshness: 1 }).rState).not.toBe(base.rState)
    expect(nodeRollup(leaf, { status: "active", freshness: 2 }).rState).not.toBe(base.rState)
  })
})

describe("DEFECT 5 — the object fingerprint must be injective", () => {
  const node = (objects: Hash[]): IndexNode => ({
    axis: "spatial",
    level: "repo",
    key: ".",
    subtreeHash: asSubtreeHash("R"),
    children: [],
    objects,
  })
  const axes = (objects: Hash[]): Axes => ({
    spatial: node(objects),
    territory: { ...node([]), axis: "territory", level: "project" },
    dependency: { ...node([]), axis: "dependency", key: "dependency", level: "root" },
    edges: [],
  })

  it('objects ["a b"] and ["a","b"] are a REAL state change and delta must say so', () => {
    // RED pre-fix: `[...objects].join(' ')` made them compare equal — delta reported
    // {stateChanged: false, changedBuckets: []} straight through a real state change.
    const d = delta(axes([asHash("a b")]), axes([asHash("a"), asHash("b")]))
    expect(d.stateChanged).toBe(true)
    expect(d.changedBuckets).toContain(".")
  })

  it("CONTROL — an unchanged object set is still reported as unchanged", () => {
    const d = delta(axes([asHash("a"), asHash("b")]), axes([asHash("a"), asHash("b")]))
    expect(d.stateChanged).toBe(false)
    expect(d.idChanged).toBe(false)
  })
})

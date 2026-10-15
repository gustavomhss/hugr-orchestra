// @atlas/index — test/build.test.ts
//
// RED→GREEN transcription of the VISIBLE build-facet goldens SCN-INDEX-3a-1..3e-1 (REQ-INDEX-3a..3e) plus
// the governing ∀-law PROP-INDEX-3 (mechanical zero-LLM build). Golden subtreeHashes (`sp-rp`, `bk-11`, …)
// are SYMBOLIC, so every assertion is RELATIONAL / order-independent — the rollup is order-independent, a
// rebuild is byte-identical, an unresolvable edge is RECORDED (`unresolved`, `to: null`) never invented.
// Held-out `-2` fixtures are NOT transcribed (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { canonicalForm, id, asSubtreeHash } from "@atlas/kernel"
import type { SubtreeHash } from "@atlas/contracts"
import type { FileTree, ScipOutput, DepEdge, Axes } from "@atlas/index"
import { build, nodeHashOfPath, escapeKeyComponent } from "../src/build.js"

const decode = (b: Uint8Array): string => new TextDecoder().decode(b)
const canon = (a: Axes): string => decode(canonicalForm(a))

// The block-IDX §fixtures spatial tree: repo:atlas → crate:core → module:cas → {cas.ts→b1,b2; store.ts→b3}.
const tree: FileTree = {
  path: "repo:atlas",
  children: [
    {
      path: "crate:core",
      children: [
        {
          path: "module:cas",
          children: [
            {
              path: "file:cas.ts",
              children: [
                { path: "block:b1", children: [], content: "put" },
                { path: "block:b2", children: [], content: "get" },
              ],
            },
            { path: "file:store.ts", children: [{ path: "block:b3", children: [], content: "write" }] },
          ],
        },
      ],
    },
  ],
}

// SCIP fixture: store.ts references cas/put (defined in cas.ts → resolved) and rust/native# (a TS→Rust FFI
// boundary unseeable by scip-typescript → no in-index definition → unresolved).
const scip: ScipOutput = {
  documents: [
    { relativePath: "file:cas.ts", occurrences: [{ symbol: "cas/put", role: "definition" }] },
    {
      relativePath: "file:store.ts",
      occurrences: [
        { symbol: "cas/put", role: "reference" },
        { symbol: "rust/native#", role: "reference" },
      ],
    },
  ],
}

const buildSrc = (): string =>
  readFileSync(fileURLToPath(new URL("../src/build.ts", import.meta.url)), "utf8") +
  readFileSync(fileURLToPath(new URL("../src/depgraph.ts", import.meta.url)), "utf8")

describe("INDEX-3 — mechanical SCIP-derived build (visible goldens)", () => {
  it("SCN-INDEX-3a-1: every axis derived mechanically via SCIP, 0 model calls", () => {
    const axes = build(tree, scip)
    // all three axes produced, each tagged with its own hierarchy
    expect(axes.spatial.axis).toBe("spatial")
    expect(axes.territory.axis).toBe("territory")
    expect(axes.dependency.axis).toBe("dependency")
    // model-call-count == 0 operationalized: every edge is grounded in the SCIP input — the count of
    // resolved/unresolved edges equals the count of defined/undefined references, none inferred.
    const defined = new Set(
      scip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "definition").map((o) => o.symbol)),
    )
    const refs = scip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "reference"))
    const expResolved = refs.filter((r) => defined.has(r.symbol)).length
    const expUnresolved = refs.filter((r) => !defined.has(r.symbol)).length
    expect(axes.edges.filter((e) => e.kind === "resolved").length).toBe(expResolved)
    expect(axes.edges.filter((e) => e.kind === "unresolved").length).toBe(expUnresolved)
    // teeth: an LLM-inferred edge would add a `resolved` edge with no backing definition (count > expResolved).
    for (const e of axes.edges.filter((x) => x.kind === "resolved")) expect(e.to).not.toBeNull()
  })

  it("SCN-INDEX-3b-1: the build path has zero model dependency (static import audit)", () => {
    const src = buildSrc().toLowerCase()
    for (const bad of ["openai", "anthropic", "langchain", "embedding", "llm"]) {
      expect(src.includes(`'${bad}`) || src.includes(`"${bad}`) || src.includes(`/${bad}`)).toBe(false)
    }
    // build is a pure function of (tree, scip): re-running with the same inputs yields the same result.
    expect(canon(build(tree, scip))).toBe(canon(build(tree, scip)))
  })

  it("SCN-INDEX-3c-1: backend is SCIP, never stack-graphs or LSIF", () => {
    const src = buildSrc().toLowerCase()
    expect(src.includes("lsif")).toBe(false)
    expect(src.includes("stack-graph")).toBe(false)
    // the dependency edges are a function of the SCIP output alone: empty SCIP ⇒ no edges.
    expect(build(tree, { documents: [] }).edges).toEqual([])
    expect(build(tree, scip).edges.length).toBeGreaterThan(0)
  })

  it("SCN-INDEX-3d-1: rebuilding twice with the same SCIP indexer yields identical graphs", () => {
    // byte-identical: the canonical preimages of two independent builds match exactly.
    expect(canon(build(tree, scip))).toBe(canon(build(tree, scip)))
    // teeth: folding wall-clock / iteration-order state would make the second preimage differ.
  })

  it("SCN-INDEX-3e-1: an unresolvable / cross-language edge is declared unresolved, not guessed", () => {
    const edges = build(tree, scip).edges
    const unresolved = edges.filter((e) => e.kind === "unresolved")
    expect(unresolved.length).toBeGreaterThan(0)
    // no target invented for the cross-language edge — `to` is null, never a fabricated resolved target.
    for (const e of unresolved) expect(e.to).toBeNull()
    expect(edges.some((e) => e.kind === "resolved" && e.to === null)).toBe(false)
  })

  it("SCN-INDEX-13c-3 (#189): a `local` symbol never fabricates a cross-document edge", () => {
    // Two UNRELATED files, each defining AND referencing the SCIP `local 2` symbol. `local N` is
    // document-scoped by the SCIP symbol grammar (`<symbol> ::= … | 'local ' <local-id>` —
    // `@c4312/scip` scip_pb.d.ts, mirroring scip.proto verbatim): fileA's `local 2` and fileB's
    // `local 2` share nothing but a coincidental spelling.
    const localTree: FileTree = {
      path: "repo:local",
      children: [
        { path: "file:a.ts", children: [], content: "a" },
        { path: "file:b.ts", children: [], content: "b" },
      ],
    }
    const localScip: ScipOutput = {
      documents: [
        {
          relativePath: "file:a.ts",
          occurrences: [
            { symbol: "local 2", role: "definition" },
            { symbol: "local 2", role: "reference" },
          ],
        },
        {
          relativePath: "file:b.ts",
          occurrences: [
            { symbol: "local 2", role: "definition" },
            { symbol: "local 2", role: "reference" },
          ],
        },
      ],
    }
    const edges = build(localTree, localScip).edges
    // THE TEETH: pre-fix, a GLOBAL `Map<symbol, Hash>` keyed on the raw symbol string, first-definition
    // -wins, makes file b.ts's `local 2` reference resolve to file a.ts's `local 2` definition — a
    // fabricated `resolved` edge b.ts→a.ts (and a self-edge a.ts→a.ts from a.ts's own reference). Neither
    // is a real inter-document dependency: `local` symbols carry ZERO cross-document information.
    // Post-fix: no edge at all, on EITHER side (not even `unresolved` — a local symbol is excluded from
    // both the defs loop and the reference loop, never merely left unresolved).
    expect(edges).toEqual([])
  })

  it("#189 cross-package canon: a `dist/…d.ts` reference resolves to the src definition; a ghost dist ref stays unresolved", () => {
    // `scip-typescript` records a CROSS-PACKAGE reference against the callee's PUBLISHED-TYPES descriptor
    // (`… dist/`X.d.ts`/Sym`) while the DEFINITION carries the SOURCE descriptor (`… src/`X.ts`/Sym`).
    // `canonicalizeSymbol` (build.ts) rewrites the former to the latter — canon-and-VERIFY: taken ONLY when
    // it lands on a real in-index definition, else the ref stays an honest `unresolved` hole.
    const SRC_DEF = "scip-typescript npm @atlas/index 0.0.0 src/`build.ts`/nodeHashOfPath."
    const DIST_REF = "scip-typescript npm @atlas/index 0.0.0 dist/src/`build.d.ts`/nodeHashOfPath." // NESTED (tsc default)
    const DIST_GHOST = "scip-typescript npm @atlas/index 0.0.0 dist/src/`ghost.d.ts`/phantom." // canon src has NO def
    const xpkgTree: FileTree = {
      path: "repo:x",
      children: [
        { path: "file:packages/index/src/build.ts", children: [], content: "def" },
        { path: "file:packages/genesis/src/verify-fact.ts", children: [], content: "caller" },
        { path: "file:packages/tools/src/x.ts", children: [], content: "ghost-caller" },
      ],
    }
    const xpkgScip: ScipOutput = {
      documents: [
        { relativePath: "packages/index/src/build.ts", occurrences: [{ symbol: SRC_DEF, role: "definition" }] },
        { relativePath: "packages/genesis/src/verify-fact.ts", occurrences: [{ symbol: DIST_REF, role: "reference" }] },
        { relativePath: "packages/tools/src/x.ts", occurrences: [{ symbol: DIST_GHOST, role: "reference" }] },
      ],
    }
    const edges = build(xpkgTree, xpkgScip).edges
    const defHash = nodeHashOfPath("packages/index/src/build.ts")
    const callerHash = nodeHashOfPath("packages/genesis/src/verify-fact.ts")
    const ghostHash = nodeHashOfPath("packages/tools/src/x.ts")
    // THE TEETH (kills the "delete deriveEdges canon" mutant M1): the cross-package dist-form caller must
    // resolve to the src definition — WITHOUT canon this is an `unresolved`/`to:null` edge, not this.
    expect(edges).toContainEqual({ from: callerHash, to: defHash, kind: "resolved" })
    // FAIL-CLOSED: the ghost dist ref canonicalises to a src symbol with no definition ⇒ stays unresolved,
    // never a fabricated resolved edge (a mutant dropping the `defs.has(canon)` verify would forge one).
    expect(edges).toContainEqual({ from: ghostHash, to: null, kind: "unresolved" })
    expect(edges.some((e) => e.from === ghostHash && e.kind === "resolved")).toBe(false)
  })

  it("SCN-INDEX-17a-1 (#191): dependency axis ADDRESSES, does not COMMIT — content moves the spatial hash, never the dependency hash", () => {
    // Same tree shape, same SCIP edges — ONLY `file:cas.ts`'s content differs between the two builds.
    const edited: FileTree = {
      ...tree,
      children: tree.children.map((c) => ({
        ...c,
        children: c.children.map((m) => ({
          ...m,
          children: m.children.map((f) =>
            f.path === "file:cas.ts"
              ? { ...f, children: f.children.map((b) => ({ ...b, content: `${b.content}-EDITED` })) }
              : f,
          ),
        })),
      })),
    }
    const before = build(tree, scip)
    const after = build(edited, scip)

    // THE CONTRAST — the spatial axis DOES commit to content: cas.ts's file node and every ancestor
    // re-hash on the edit (the leaf-to-root re-hash spec §3.5 describes).
    const spatialKey = escapeKeyComponent("file:cas.ts") // mintKey escapes ':' — see build.ts `mintKey`
    const spatialFile = (axes: Axes): SubtreeHash | undefined =>
      axes.spatial.children[0]?.children[0]?.children.find((n) => n.key === spatialKey)?.subtreeHash
    expect(spatialFile(before)).not.toBe(spatialFile(after))
    expect(before.spatial.subtreeHash).not.toBe(after.spatial.subtreeHash) // the root re-hashes too

    // THE DECLARATION — the dependency axis does NOT commit: `file:cas.ts`'s dependency-axis node is keyed
    // by `nodeHashOfPath('file:cas.ts')`, a constant of the PATH, so its subtreeHash is identical before
    // and after the content edit, and equals `asSubtreeHash(that same key)` on BOTH sides — never folding
    // the file's bytes at all (the exact property spec/atlas.md §3.5's new bullet and reference/
    // atlas-index.md's INDEX-17 declare).
    const depKey = String(nodeHashOfPath("file:cas.ts"))
    const depLeaf = (axes: Axes) => axes.dependency.children.find((n) => n.key === depKey)
    const beforeLeaf = depLeaf(before)
    const afterLeaf = depLeaf(after)
    expect(beforeLeaf).toBeDefined()
    expect(afterLeaf).toBeDefined()
    expect(afterLeaf?.subtreeHash).toBe(beforeLeaf?.subtreeHash)
    expect(String(beforeLeaf?.subtreeHash)).toBe(String(asSubtreeHash(depKey)))
    expect(String(afterLeaf?.subtreeHash)).toBe(String(asSubtreeHash(depKey)))
    // teeth: a `dependencyAxis` that folded `node.content` into the leaf's subtreeHash the way `hierarchy`'s
    // `rollupHash` does (the counterfactual the declaration forbids) would move `afterLeaf.subtreeHash` off
    // `beforeLeaf.subtreeHash` on this same edit — this is the exact regression #98 closed and #189
    // measured the consequence of; a spec with no stated exception is what let both happen unnoticed.
  })

  it("rollup order-independence: reordering children leaves the parent subtreeHash unchanged", () => {
    const reord: FileTree = {
      ...tree,
      children: tree.children.map((c) => ({
        ...c,
        children: c.children.map((m) => ({ ...m, children: [...m.children].reverse() })),
      })),
    }
    // the spatial rollup is over SORTED child hashes ⇒ invariant to input child order.
    expect(build(reord, scip).spatial.subtreeHash).toBe(build(tree, scip).spatial.subtreeHash)
  })
})

// ── PROP-INDEX-3 — mechanical zero-LLM build (the frozen ∀-law over generated inputs) ─────────────────
const nameArb = fc.stringOf(fc.constantFrom(..."abcdef".split("")), { minLength: 1, maxLength: 4 })
const symArb = fc.stringOf(fc.constantFrom(..."xyz#/".split("")), { minLength: 1, maxLength: 5 })

function leafTreeArb(depth: number): fc.Arbitrary<FileTree> {
  const leaf = fc
    .record({ path: nameArb, content: fc.string({ maxLength: 6 }) })
    .map((r): FileTree => ({ path: r.path, children: [], content: r.content }))
  if (depth <= 0) return leaf
  return fc.oneof(
    leaf,
    fc
      .record({ path: nameArb, children: fc.array(leafTreeArb(depth - 1), { maxLength: 3 }) })
      .map((r): FileTree => ({ path: r.path, children: r.children })),
  )
}

const scipArb: fc.Arbitrary<ScipOutput> = fc
  .array(
    fc.record({
      relativePath: nameArb,
      occurrences: fc.array(
        fc.record({ symbol: symArb, role: fc.constantFrom("definition" as const, "reference" as const) }),
        { maxLength: 4 },
      ),
    }),
    { maxLength: 4 },
  )
  .map((documents) => ({ documents }))

describe("PROP-INDEX-3 — ∀ (tree, scipOutput): mechanical, idempotent, honest unresolved edges", () => {
  it("idempotent byte-identical rebuild ∧ every edge grounded in SCIP (no invented target)", () => {
    fc.assert(
      fc.property(leafTreeArb(3), scipArb, (t, s) => {
        const a = build(t, s)
        // idempotent: two builds are byte-identical.
        expect(canon(a)).toBe(canon(build(t, s)))
        const defined = new Set(
          s.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "definition").map((o) => o.symbol)),
        )
        // the set of documents that define at least one symbol (their canonical node hashes).
        const definedDocs = new Set(
          s.documents
            .filter((d) => d.occurrences.some((o) => o.role === "definition"))
            .map((d) => String(id({ file: d.relativePath }))),
        )
        for (const e of a.edges as readonly DepEdge[]) {
          if (e.kind === "resolved") {
            expect(e.to).not.toBeNull()
            // no invented target: a resolved edge points ONLY at a document that really defines a symbol.
            expect(definedDocs.has(String(e.to))).toBe(true)
          } else {
            expect(e.to).toBeNull() // unresolvable ⇒ declared, target null, never guessed
          }
        }
        // honest under-approximation: an `unresolved` edge exists IFF some reference has no in-index
        // definition (dedup-safe existence, not a per-reference count).
        const refs = s.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "reference"))
        const hasUnresolvableRef = refs.some((r) => !defined.has(r.symbol))
        expect(a.edges.some((e) => e.kind === "unresolved")).toBe(hasUnresolvableRef)
      }),
      { numRuns: 200 },
    )
  })
})

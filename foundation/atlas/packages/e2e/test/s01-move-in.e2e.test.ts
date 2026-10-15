// @atlas/e2e — S1 · Move-in cold start (`atlas-init` spine)
// AXIS: functioning + efficiency (deterministic $0-LLM identity — the "no embeddings, no RAG" thesis).
//
// STORY. An agent points Atlas at a fresh repo for the first time. With ZERO model calls, Atlas must:
//   (1) build the three axis-views purely from the file tree + a SCIP indexer's output,
//   (2) mint identity that is byte-identical on re-run — the memoizable, git-native core,
//   (3) record every statically-unresolvable reference as an HONEST hole (`to: null`), never a guess,
//   (4) answer "what depends on this?" (blast radius) from the dependency axis alone,
//   (5) put every object into the ONE BLAKE3 CAS (content-addressed ⇒ dedup),
//   (6) enforce the standing T0 coverage ceiling from day one.
//
// This composes the REAL wired runtime of @atlas/index + @atlas/kernel across the package seam. There is
// no injected port on this path (S1 VERDICT: WIRED end-to-end) — the only fixtures are the repo itself
// (a FileTree) and the black-box SCIP output, both hand-built below. Identity is re-derived through the
// sealed kernel seam (`id`), never hardcoded, so the determinism assertions have real teeth.

import { describe, it, expect } from "vitest"
import { id, createStore } from "@atlas/kernel"
import { build, createDepgraph, createCasIndex, createCoverage } from "@atlas/index"
import type { FileTree, ScipOutput } from "@atlas/index"
import type { Hash } from "@atlas/contracts"
import type { Territory } from "@atlas/contracts"

// ── the fresh repo (a tiny but real spatial tree) ───────────────────────────────────────────────────
const repo: FileTree = {
  path: "repo",
  children: [
    { path: "repo/api.ts", children: [], content: "export const handler = () => query();" },
    { path: "repo/db.ts", children: [], content: "export const query = () => native();" },
    { path: "repo/native.rs", children: [], content: "pub fn native() {}" }, // a cross-language (FFI) target
  ],
}

// The SCIP output a single-language (TS) indexer would emit: it SEES api→db, but the Rust FFI target
// `native()` has no in-index TS definition — the honest cross-language hole.
const scip: ScipOutput = {
  documents: [
    { relativePath: "repo/api.ts", occurrences: [{ symbol: "db#query", role: "reference" }] },
    {
      relativePath: "repo/db.ts",
      occurrences: [
        { symbol: "db#query", role: "definition" },
        { symbol: "ffi#native", role: "reference" }, // unresolvable — no definition anywhere in SCIP
      ],
    },
  ],
}

// Node identity is minted the way the build mints it (sealed seam) — the test re-derives, never hardcodes.
const docHash = (relativePath: string): Hash => id({ file: relativePath })
const territory = (name: string, tier: Territory["tier"]): Territory => ({ name, owner: "team", tier, globs: [] })

describe("S1 · move-in cold start — deterministic $0-LLM index build", () => {
  it("builds the three axis-views purely from tree + SCIP (functioning)", () => {
    const axes = build(repo, scip)
    expect(axes.spatial.axis).toBe("spatial")
    expect(axes.territory.axis).toBe("territory")
    expect(axes.dependency.axis).toBe("dependency")
    // teeth (breaks-on "an axis is dropped / mislabelled"): all three rooted views present.
    expect([axes.spatial, axes.territory, axes.dependency].every((n) => n.subtreeHash.length > 0)).toBe(true)
  })

  it("mints byte-identical identity on re-run — idempotent, memoizable (efficiency / the $0-LLM contract)", () => {
    const a = build(repo, scip)
    const b = build(repo, scip)
    // teeth (breaks-on "identity is non-deterministic — a clock/nonce/embedding leaked into the hash"):
    expect(b.spatial.subtreeHash).toBe(a.spatial.subtreeHash)
    expect(b.dependency.subtreeHash).toBe(a.dependency.subtreeHash)
    expect(b).toEqual(a) // whole Axes structurally identical across independent builds
  })

  it("records a statically-unresolvable reference as an HONEST hole, never a fabricated target", () => {
    const { edges } = build(repo, scip)
    const resolved = edges.filter((e) => e.kind === "resolved")
    const unresolved = edges.filter((e) => e.kind === "unresolved")
    // api.ts → db.ts is seen and resolved.
    expect(resolved).toContainEqual({ from: docHash("repo/api.ts"), to: docHash("repo/db.ts"), kind: "resolved" })
    // db.ts → native() (FFI) is a hole: an unresolved edge with `to: null`.
    // teeth (breaks-on "the build invents a target for the FFI reference instead of leaving `to: null`"):
    expect(unresolved).toContainEqual({ from: docHash("repo/db.ts"), to: null, kind: "unresolved" })
    expect(unresolved.every((e) => e.to === null)).toBe(true)
  })

  it('answers "what depends on this?" (blast radius) from the dependency axis alone', () => {
    const { edges } = build(repo, scip)
    const graph = createDepgraph(edges)
    const radius = graph.reverseClosure(docHash("repo/db.ts"))
    // api.ts (transitively) depends on db.ts → it is in db's blast radius.
    expect(radius.closure).toContain(docHash("repo/api.ts"))
    // a node is never part of its own blast radius.
    expect(radius.closure).not.toContain(docHash("repo/db.ts"))
    // db.ts sources an unresolved edge ⇒ the closure is honestly flagged under-approximate.
    // teeth (breaks-on "an unresolved hole in scope is silently presented as a complete closure"):
    expect(radius.underApprox).toBe(true)
    // a leaf with no dependents has an empty (still honest) blast radius.
    expect(graph.reverseClosure(docHash("repo/api.ts")).closure).toEqual([])
  })

  it("puts every object into the ONE BLAKE3 CAS — content-addressed dedup", () => {
    const axes = build(repo, scip)
    const cas = createCasIndex(createStore())
    const h1 = cas.put(axes.spatial)
    const h2 = cas.put(axes.spatial) // same content
    // teeth (breaks-on "identical content mints two different ids — the CAS is not content-addressed"):
    expect(h2).toBe(h1)
    expect(cas.isDriftEligible(h1)).toBe(true) // every object drift-eligible, no exemption
    expect(cas.put(axes.dependency)).not.toBe(h1) // different content ⇒ different id
  })

  it("enforces the standing T0 coverage ceiling from day one (>15% unresolved ⇒ FAIL)", () => {
    const coverage = createCoverage([
      { territory: "auth", unresolved: 3, total: 10 }, // 30% — over the T0 ceiling
      { territory: "ui", unresolved: 3, total: 10 }, // same ratio, but not T0
      { territory: "clean", unresolved: 0, total: 10 },
    ])
    // teeth (breaks-on "a T0 territory over the unresolved ceiling still PASSes the standing gate"):
    expect(coverage.gate(territory("auth", "T0"))).toBe(false) // T0 ∧ 30% ⇒ FAIL
    expect(coverage.gate(territory("ui", "T2"))).toBe(true) // same ratio, T2 ⇒ not gated
    expect(coverage.gate(territory("clean", "T0"))).toBe(true) // T0 but clean ⇒ PASS
    expect(coverage.ratio(territory("auth", "T0"))).toBeCloseTo(0.3)
  })
})

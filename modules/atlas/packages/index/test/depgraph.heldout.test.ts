// @atlas/index — test/depgraph.heldout.test.ts
//
// COLD-REVIEW HELD-OUT GATE (anti-overfit). Authored by the lead's review, NOT the builders — the builders
// were blinded to the `-2` fixtures. These compile the held-out goldens SCN-INDEX-3a-2..3e-2 (build) and
// SCN-INDEX-13a-2..13f-2 (honest-edge) into fresh assertions against the UNMODIFIED src/build.ts +
// src/depgraph.ts. Independent fixtures (crate:net / TS→Go / P·R·M·N naming), same governing laws
// (PROP-INDEX-3, PROP-INDEX-13, INV-INDEX-13). Symbolic hashes ⇒ relational assertions only.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { asHash, canonicalForm, id } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { DepEdge, FileTree, ScipOutput, Axes } from "@atlas/index"
import { build } from "../src/build.js"
import { createDepgraph } from "../src/depgraph.js"

const H = (s: string): Hash => asHash(s)
const decode = (b: Uint8Array): string => new TextDecoder().decode(b)
const canon = (a: Axes): string => decode(canonicalForm(a))
const buildSrc = (): string =>
  readFileSync(fileURLToPath(new URL("../src/build.ts", import.meta.url)), "utf8") +
  readFileSync(fileURLToPath(new URL("../src/depgraph.ts", import.meta.url)), "utf8")

// ── held-out BUILD fixture: crate:net → module:http → {client.ts, server.ts} ─────────────────────────
// client.ts references server/handle (defined in server.ts → resolved) AND go/native# (a TS→Go cgo FFI
// boundary unseeable by scip-typescript → no in-index definition → unresolved).
const netTree: FileTree = {
  path: "repo:atlas",
  children: [
    {
      path: "crate:net",
      children: [
        {
          path: "module:http",
          children: [
            { path: "file:client.ts", children: [{ path: "block:c1", children: [], content: "call" }] },
            { path: "file:server.ts", children: [{ path: "block:s1", children: [], content: "handle" }] },
          ],
        },
      ],
    },
  ],
}
const netScip: ScipOutput = {
  documents: [
    { relativePath: "file:server.ts", occurrences: [{ symbol: "server/handle", role: "definition" }] },
    {
      relativePath: "file:client.ts",
      occurrences: [
        { symbol: "server/handle", role: "reference" },
        { symbol: "go/native#", role: "reference" },
      ],
    },
  ],
}

describe("HELD-OUT build goldens SCN-INDEX-3a-2..3e-2 (crate:net)", () => {
  it("SCN-INDEX-3a-2: all three axes derived mechanically; edge counts grounded in SCIP (0 inferred)", () => {
    const axes = build(netTree, netScip)
    expect(axes.spatial.axis).toBe("spatial")
    expect(axes.territory.axis).toBe("territory")
    expect(axes.dependency.axis).toBe("dependency")
    const defined = new Set(
      netScip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "definition").map((o) => o.symbol)),
    )
    const refs = netScip.documents.flatMap((d) => d.occurrences.filter((o) => o.role === "reference"))
    expect(axes.edges.filter((e) => e.kind === "resolved").length).toBe(
      refs.filter((r) => defined.has(r.symbol)).length,
    )
    expect(axes.edges.filter((e) => e.kind === "unresolved").length).toBe(
      refs.filter((r) => !defined.has(r.symbol)).length,
    )
  })

  it("SCN-INDEX-3b-2: net build path has zero model dependency (static import audit)", () => {
    const src = buildSrc().toLowerCase()
    for (const bad of ["openai", "anthropic", "langchain", "embedding", "llm"]) {
      expect(src.includes(`'${bad}`) || src.includes(`"${bad}`) || src.includes(`/${bad}`)).toBe(false)
    }
    expect(canon(build(netTree, netScip))).toBe(canon(build(netTree, netScip)))
  })

  it("SCN-INDEX-3c-2: backend is SCIP not stack-graphs/LSIF; edges are a function of SCIP alone", () => {
    const src = buildSrc().toLowerCase()
    expect(src.includes("lsif")).toBe(false)
    expect(src.includes("stack-graph")).toBe(false)
    expect(build(netTree, { documents: [] }).edges).toEqual([])
    expect(build(netTree, netScip).edges.length).toBeGreaterThan(0)
  })

  it("SCN-INDEX-3d-2: rebuilding twice yields byte-identical graphs (net tree)", () => {
    expect(canon(build(netTree, netScip))).toBe(canon(build(netTree, netScip)))
  })

  it("SCN-INDEX-3e-2: the TS→Go cgo boundary is declared unresolved, no target invented", () => {
    const edges = build(netTree, netScip).edges
    const unresolved = edges.filter((e) => e.kind === "unresolved")
    expect(unresolved.length).toBeGreaterThan(0)
    for (const e of unresolved) expect(e.to).toBeNull()
    expect(edges.some((e) => e.kind === "resolved" && e.to === null)).toBe(false)
  })
})

describe("HELD-OUT honest-edge goldens SCN-INDEX-13a-2..13f-2 (P·R·M·N)", () => {
  it("SCN-INDEX-13a-2: dynamic-dispatch R⇢? + cross-language TS→Go are explicit unresolved/dynamic (tagged)", () => {
    // reverse chain P ← Q ← R(⇢?) ← TS(→Go) so both unresolvable sources land in a queryable scope.
    const edges: DepEdge[] = [
      { from: H("Q"), to: H("P"), kind: "resolved" },
      { from: H("R"), to: H("Q"), kind: "resolved" },
      { from: H("TS"), to: H("R"), kind: "resolved" },
      { from: H("R"), to: null, kind: "dynamic" },
      { from: H("TS"), to: null, kind: "unresolved" },
    ]
    const dyn = edges.filter((e) => e.kind === "dynamic")
    const xlang = edges.filter((e) => e.kind === "unresolved")
    expect(dyn.length).toBe(1)
    expect(xlang.length).toBe(1)
    for (const e of [...dyn, ...xlang]) expect(e.to).toBeNull()
    const rc = createDepgraph(edges).reverseClosure(H("P"))
    expect([...rc.closure].sort()).toEqual(["Q", "R", "TS"])
    expect(rc.underApprox).toBe(true)
  })

  it("SCN-INDEX-13b-2: an unresolvable DI-wiring edge is never silently omitted (flips underApprox)", () => {
    const resolvedOnly: DepEdge[] = [
      { from: H("Q"), to: H("P"), kind: "resolved" },
      { from: H("R"), to: H("Q"), kind: "resolved" },
    ]
    const diEdge: DepEdge = { from: H("R"), to: null, kind: "unresolved" } // runtime DI wiring, unresolvable
    const withDi: DepEdge[] = [...resolvedOnly, diEdge]
    expect(createDepgraph(resolvedOnly).reverseClosure(H("P")).underApprox).toBe(false)
    expect(createDepgraph(withDi).reverseClosure(H("P")).underApprox).toBe(true)
    expect(withDi.filter((e) => e.kind !== "resolved").length).toBe(1)
  })

  it("SCN-INDEX-13c-2: an unresolvable TS→Go edge never gets a fabricated resolved target", () => {
    const edges: DepEdge[] = [
      { from: H("X"), to: H("TS"), kind: "resolved" },
      { from: H("TS"), to: null, kind: "unresolved" }, // TS→Go binary, target unknowable
    ]
    expect(edges.some((e) => e.kind === "resolved" && e.to === null)).toBe(false)
    const rc = createDepgraph(edges).reverseClosure(H("TS"))
    expect([...rc.closure].sort()).toEqual(["X"])
    const realNodes = new Set(edges.flatMap((e) => (e.to === null ? [String(e.from)] : [String(e.from), String(e.to)])))
    for (const m of rc.closure) expect(realNodes.has(String(m))).toBe(true)
  })

  it("SCN-INDEX-13d-2: reverseClosure(P) with R's unresolved edge in scope reports under-approximate", () => {
    const chain: DepEdge[] = [
      { from: H("Q"), to: H("P"), kind: "resolved" },
      { from: H("R"), to: H("Q"), kind: "resolved" },
      { from: H("S"), to: H("R"), kind: "resolved" },
      { from: H("T"), to: H("S"), kind: "resolved" },
      { from: H("R"), to: null, kind: "unresolved" },
    ]
    const rc = createDepgraph(chain).reverseClosure(H("P"))
    expect([...rc.closure].sort()).toEqual(["Q", "R", "S", "T"])
    expect(rc.underApprox).toBe(true)
  })

  it("SCN-INDEX-13e-2: under-approximate reverseClosure(P) unions R's coChanged band {M,N}, correlational", () => {
    const chain: DepEdge[] = [
      { from: H("Q"), to: H("P"), kind: "resolved" },
      { from: H("R"), to: H("Q"), kind: "resolved" },
      { from: H("R"), to: null, kind: "unresolved" },
    ]
    const coChanged = new Map<Hash, readonly Hash[]>([[H("R"), [H("M"), H("N")]]])
    const rc = createDepgraph(chain, coChanged).reverseClosure(H("P"))
    expect(rc.underApprox).toBe(true)
    expect([...rc.coChanged].sort()).toEqual(["M", "N"])
    const clean = createDepgraph(
      chain.filter((e) => e.kind === "resolved"),
      coChanged,
    ).reverseClosure(H("P"))
    expect(clean.underApprox).toBe(false)
    expect(clean.coChanged).toEqual([])
  })

  it("SCN-INDEX-13f-2: the under-approximate P closure is never presented as complete/static", () => {
    const chain: DepEdge[] = [
      { from: H("Q"), to: H("P"), kind: "resolved" },
      { from: H("R"), to: H("Q"), kind: "resolved" },
      { from: H("R"), to: null, kind: "unresolved" },
    ]
    const coChanged = new Map<Hash, readonly Hash[]>([[H("R"), [H("M"), H("N")]]])
    const rc = createDepgraph(chain, coChanged).reverseClosure(H("P"))
    expect(rc.underApprox).toBe(true)
    const staticClosure = new Set(rc.closure.map((h) => String(h)))
    for (const c of rc.coChanged) expect(staticClosure.has(String(c))).toBe(false)
    expect([...rc.closure].sort()).toEqual(["Q", "R"])
  })
})

// @atlas/adapter-io — test/wp-per-fact-freshness.test.ts
//   (WP-per-fact-freshness — REQ-TOOLS-6d amended · REQ-TOOLS-6e · REQ-TOOLS-6f, ADR-0002 / ADR-0013)
//
// THE TEETH FOR THE SIGNAL THAT DID NOT EXIST. `atlas query` had exactly one freshness bit — the pack-level
// `stale` watermark, which is repo-GLOBAL by ADR-0002's own words: any HEAD advance flips it `true` for every
// row, including a commit touching nothing under the queried scope. Measured on the real 199-fact graph mined
// from Atlas at `8ada771b`, read at `origin/master` `44026ae`:
//
//   tree state                                 pack `stale`      per-fact `driftDetect`
//   A  at the mine sha                         false             199 FRESH   ·  0 DRIFTED
//   B  at origin/master                        true (all 199)    185 FRESH   · 14 DRIFTED   (TP 14, FP 0)
//   C  one commit touching only README.md      true (all 199)    199 FRESH   ·  0 DRIFTED
//
// Row C is the case these teeth pin: `stale` correctly says "the view is behind HEAD", and the per-fact
// oracle correctly says "nothing a fact cites moved". Both true, neither derivable from the other — so the
// tests below assert BOTH directions and, crucially, assert that `stale` is UNCHANGED by this WP.
//
// Everything here runs the SHIPPED seam over a REAL git tree, REAL built axes and the REAL `driftDetect`
// (the same oracle the write door's truth-gate runs). No stubbed verdict decides any freshness assertion.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { build, createResolve } from "@atlas/index"
import type { Axes } from "@atlas/index"
import { driftDetect } from "@atlas/grounding"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { GroundedFact, StoreProjection } from "@atlas/knowledge"
import type { Hash, PackInvariant } from "@atlas/contracts"
import { createQuery } from "@atlas/tools"
import type { QueryIndex } from "@atlas/tools"
import { ADVISORY_CAP, atLeastT1 as toolsAtLeastT1, splitBands } from "@atlas/tools"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { readScipOrEmpty } from "../src/scip.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"
import { resolveFreshness } from "../src/pack-shape.js"

let repoPath: string | undefined
afterEach(() => {
  if (repoPath !== undefined) rmSync(repoPath, { recursive: true, force: true })
  repoPath = undefined
})

/** A real git repo with two source files — the smallest tree on which "changed" and "unchanged" both exist. */
function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "atlas-freshness-"))
  const write = (rel: string, body: string): void => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  write("src/kept.ts", "export const kept = 1;\n")
  write("src/moved.ts", "export const moved = 1;\n")
  write("README.md", "# fixture\n")
  const git = (...a: string[]): void => void execFileSync("git", a, { cwd: root, stdio: "pipe" })
  git("init", "-q")
  git("config", "user.email", "freshness@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "fixture")
  repoPath = root
  return root
}

const axesOf = (root: string): Axes => build(walkFileTree(root), readScipOrEmpty(join(root, ".atlas", "index.scip")))

/** The REAL current `subtreeHash` of a file node, straight out of the built axes (never hand-written). */
function subtreeHashOf(axes: Axes, path: string): string {
  const node = createResolve({ spatial: axes.spatial, territory: axes.territory, dependency: axes.dependency }).resolve(
    "spatial",
    path,
  )
  expect(node, `fixture: ${path} must resolve on the spatial axis`).toBeDefined()
  return String(node!.subtreeHash)
}

/** Persist one fact GROUNDED at `anchor`, with the anchor's real subtreeHash as recorded at `axes`. */
function emitAt(
  store: DiskStore,
  proj: StoreProjection,
  axes: Axes,
  nodeKey: string,
  anchor: string,
  tier: string,
): StoreProjection {
  const fact = {
    kind: "advisory",
    tier,
    // A distinguishing TOP-LEVEL scalar. Measured, not decorative: the CAS content address is computed over
    // the kernel's canonical form, which does not distinguish these fixtures by their nested `grounding`
    // alone — two facts differing only inside `grounding` hash the same and the second write DEDUPs away.
    body: nodeKey,
    // The STORED freshness is `FRESH` on every row here, deliberately: that is what a real mined graph looks
    // like (199/199 stored FRESH), and it is exactly the field a naive implementation would read instead of
    // re-deriving. Any test below that observes `DRIFTED` therefore proves the oracle ran.
    freshness: "FRESH",
    grounding: {
      entries: [{ anchor: { qualifiedPath: anchor, subtreeHash: subtreeHashOf(axes, anchor) }, path: anchor }],
    },
  } as unknown as GroundedFact
  const contentHash = store.put(fact as never) as string
  return upsert(proj, {
    nodeKey,
    contentHash,
    family: "advisory",
    claimNorm: `claim ${nodeKey}`,
    primaryAnchor: anchor,
    slot: "invariant",
  }).store
}

/** The structural leg stub — the decorator under test folds the facts in; territory resolution is not it. */
const structuralStub: QueryIndex = {
  cover: () => ({ territory: "t", axisHash: "ax" as unknown as Hash, invariants: [], stale: false }),
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-TOOLS-6e — every pack row carries its OWN freshness, re-derived on the read path", () => {
  it("SCN-TOOLS-6e-1 — a fact at a CHANGED unit reads DRIFTED; a fact at an UNCHANGED unit still reads FRESH", () => {
    const root = makeRepo()
    const store = createDiskStore(join(root, ".atlas", "cas"))
    const before = axesOf(root)

    let proj = emptyStore()
    proj = emitAt(store, proj, before, "k:kept", "src/kept.ts", "T1")
    proj = emitAt(store, proj, before, "k:moved", "src/moved.ts", "T1")
    store.persistProjection(proj)

    // Move the tree: ONE of the two anchored units changes. Nothing about either FACT changes — not its
    // bytes, not its stored `freshness`, not its anchor. Only the code under one of them.
    writeFileSync(join(root, "src/moved.ts"), "export const moved = 2;\n")
    const after = axesOf(root)

    const cover = createProjectionQueryIndex(structuralStub, store, undefined, (f) =>
      driftDetect((f as unknown as { grounding: Parameters<typeof driftDetect>[0] }).grounding, after),
    ).cover("src")

    const verdicts = new Map(cover.invariants.map((i) => [String(i.nodeId), i.freshness] as const))
    // TEETH — the whole WP. Before it, `PackInvariant` had no `freshness` field at all and BOTH of these
    // read `undefined`; the only signal available was one pack-wide boolean that says nothing about WHICH.
    expect(verdicts.get("k:moved")).toBe("DRIFTED")
    expect(verdicts.get("k:kept")).toBe("FRESH")
  })

  it("SCN-TOOLS-6e-2 — the NEGATIVE direction: with nothing moved, EVERY row reads FRESH (no false alarm)", () => {
    const root = makeRepo()
    const store = createDiskStore(join(root, ".atlas", "cas"))
    const axes = axesOf(root)

    let proj = emptyStore()
    proj = emitAt(store, proj, axes, "k:kept", "src/kept.ts", "T1")
    proj = emitAt(store, proj, axes, "k:moved", "src/moved.ts", "T0")
    store.persistProjection(proj)

    const cover = createProjectionQueryIndex(structuralStub, store, undefined, (f) =>
      driftDetect((f as unknown as { grounding: Parameters<typeof driftDetect>[0] }).grounding, axes),
    ).cover("src")

    expect(cover.invariants).toHaveLength(2)
    expect(cover.invariants.map((i) => i.freshness)).toEqual(["FRESH", "FRESH"])
    // An oracle that reported DRIFTED for everything would pass the positive test above and fail here. That
    // is the mutant this direction kills: "flag everything" is not a freshness signal, it is the old one.
  })

  it("SCN-TOOLS-6e-3 — the pack-level `stale` watermark is UNCHANGED: it never reads the per-fact verdict", () => {
    const root = makeRepo()
    const store = createDiskStore(join(root, ".atlas", "cas"))
    const axes = axesOf(root)

    let proj = emptyStore()
    proj = emitAt(store, proj, axes, "k:kept", "src/kept.ts", "T1")
    store.persistProjection(proj)

    // Move the anchored unit so the PER-FACT oracle says DRIFTED …
    writeFileSync(join(root, "src/kept.ts"), "export const kept = 99;\n")
    const after = axesOf(root)
    const cover = createProjectionQueryIndex(structuralStub, store, undefined, (f) =>
      driftDetect((f as unknown as { grounding: Parameters<typeof driftDetect>[0] }).grounding, after),
    ).cover("src")

    expect(cover.invariants[0]!.freshness).toBe("DRIFTED")
    // … while `stale` stays exactly what the N11 rule computes: the row's STORED freshness is `FRESH` and no
    // live HEAD was injected, so nothing is provable and the watermark does NOT fire. If a future edit wires
    // the per-fact verdict into `stale`, this flips — and the ADR-0002 property (a watermark, not a live
    // recompute) would have been silently replaced rather than amended.
    expect(cover.stale).toBe(false)
  })

  it("SCN-TOOLS-6e-4 — with NO oracle wired the row fails CLOSED to DRIFTED, never to the stored FRESH", () => {
    const root = makeRepo()
    const store = createDiskStore(join(root, ".atlas", "cas"))
    const axes = axesOf(root)
    let proj = emptyStore()
    proj = emitAt(store, proj, axes, "k:kept", "src/kept.ts", "T1")
    store.persistProjection(proj)

    const cover = createProjectionQueryIndex(structuralStub, store).cover("src")
    // The stored bytes say FRESH (see `emitAt`). An implementation that fell back to them would read FRESH
    // here and would be asserting a verification that never happened.
    expect(cover.invariants[0]!.freshness).toBe("DRIFTED")
    expect(resolveFreshness(undefined, {} as GroundedFact)).toBe("DRIFTED")
  })
})

// ────────────────────────────────────────────────────────────────────────────────────────────────────
const row = (nodeId: string, tier: string, claim: string): PackInvariant =>
  ({ nodeId, tier, claim, freshness: "FRESH" }) as unknown as PackInvariant

const coverOf = (invariants: readonly PackInvariant[], stale = false): QueryIndex => ({
  cover: () => ({ territory: "t", axisHash: "ax" as unknown as Hash, invariants, stale }),
})

describe("REQ-TOOLS-6f — the pack is TWO bands, and an off-lattice tier is in NEITHER", () => {
  // Every one of these is `!== 'T2'` AND `!== 'T0'/'T1'`. The governing band already refused them; the
  // advisory band must refuse them too, or the hole is simply reopened facing the other way.
  const OFF_LATTICE = ["T3", "t2", "T2 ", " T2", "T2\n", "", "toString", "__proto__", "constructor"]

  it('SCN-TOOLS-6f-1 — a row carrying `tier:"T3"` appears in NEITHER band (and in no dropped ledger)', () => {
    const pack = createQuery(coverOf([row("k:t3", "T3", "off-lattice claim")])).query("src")
    expect(pack.invariants).toEqual([])
    expect(pack.advisory).toEqual([])
    // It was REFUSED, not truncated. Counting it as dropped would report a governance decision as a budget
    // event and invite a reader to raise the cap to "recover" it.
    expect(pack.advisoryDropped).toBe(0)
    expect(pack.tokenEstimate).toBe(0)
  })

  it("SCN-TOOLS-6f-2 — every off-lattice spelling is refused by BOTH band predicates, byte-exactly", () => {
    for (const t of OFF_LATTICE) {
      const bands = splitBands([row("k:x", t, "c")])
      expect(bands.governing, `governing admitted ${JSON.stringify(t)}`).toEqual([])
      expect(bands.advisory, `advisory admitted ${JSON.stringify(t)}`).toEqual([])
      expect(toolsAtLeastT1(row("k:x", t, "c"))).toBe(false)
    }
  })

  it("SCN-TOOLS-6f-3 — T0/T1 govern, T2 is advisory, and the bands are never interleaved", () => {
    const pack = createQuery(
      coverOf([row("k:a", "T0", "zero"), row("k:b", "T2", "two"), row("k:c", "T1", "one"), row("k:d", "T3", "x")]),
    ).query("src")
    expect(pack.invariants.map((i) => i.nodeId)).toEqual(["k:a", "k:c"])
    expect(pack.advisory.map((i) => i.nodeId)).toEqual(["k:b"])
    expect(pack.tokenEstimate).toBe("zero".length + "one".length + "two".length) // BOTH bands (clause 4)
  })

  it("SCN-TOOLS-6f-4 — for a graph with NO T2 row the governing band is byte-identical to the old filter", () => {
    const rows = [row("k:a", "T0", "zero"), row("k:c", "T1", "one"), row("k:d", "T3", "x")]
    const pack = createQuery(coverOf(rows, true)).query("src")
    // The pre-amendment shipped behaviour, recomputed independently here: `cover.invariants.filter(atLeastT1)`.
    expect(pack.invariants).toEqual(rows.filter(toolsAtLeastT1))
    expect(pack.advisory).toEqual([])
    expect(pack.advisoryDropped).toBe(0)
    expect(pack.stale).toBe(true) // carried through untouched, never recomputed from the per-row verdicts
  })
})

// ────────────────────────────────────────────────────────────────────────────────────────────────────
describe("REQ-TOOLS-6f — the advisory cap truncates DETERMINISTICALLY and says so", () => {
  /** `n` advisory rows of `size` chars each, keyed so the input order is unambiguous. */
  const advisoryRows = (n: number, size: number): PackInvariant[] =>
    Array.from({ length: n }, (_, i) => row(`k:${String(i).padStart(3, "0")}`, "T2", "x".repeat(size)))

  it("SCN-TOOLS-6f-5 — the advisory band stops at ADVISORY_CAP and reports every row it dropped", () => {
    const rows = advisoryRows(30, 100) // 3000 chars offered against a 2000 cap
    const pack = createQuery(coverOf(rows)).query("src")

    expect(ADVISORY_CAP).toBe(2000) // the owner's number, ratified 2026-08-03 — pinned, not inferred
    expect(pack.advisory).toHaveLength(20)
    expect(pack.advisoryDropped).toBe(10)
    expect(pack.advisory.length + pack.advisoryDropped).toBe(rows.length) // 0 silent drops (#130)
    expect(pack.advisory.reduce((n, i) => n + i.claim.length, 0)).toBeLessThanOrEqual(ADVISORY_CAP)
    // PREFIX, not an arbitrary subset: the survivors are the first rows of the caller's own order.
    expect(pack.advisory.map((i) => i.nodeId)).toEqual(rows.slice(0, 20).map((i) => i.nodeId))
  })

  it("SCN-TOOLS-6f-6 — truncation is a pure function of the input: two runs are byte-identical", () => {
    const rows = advisoryRows(30, 100)
    const a = createQuery(coverOf(rows)).query("src")
    const b = createQuery(coverOf(rows)).query("src")
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("SCN-TOOLS-6f-7 — CAP-WINS: once the cap has bitten, a later SMALLER row does not sneak in", () => {
    const bands = splitBands([row("k:big", "T2", "x".repeat(ADVISORY_CAP)), row("k:tiny", "T2", "y")])
    expect(bands.advisory.map((i) => i.nodeId)).toEqual(["k:big"])
    expect(bands.advisoryDropped).toBe(1) // best-fit would have emitted `k:tiny` and reported 0
  })

  it("SCN-TOOLS-6f-8 — the GOVERNING band is RESERVED: no advisory row can displace or shrink it", () => {
    const governing = [row("k:g", "T0", "g".repeat(ADVISORY_CAP * 2))] // far over the ADVISORY cap alone
    const pack = createQuery(coverOf([...governing, ...advisoryRows(30, 100)])).query("src")
    expect(pack.invariants).toEqual(governing) // untouched by a cap that is not its cap
    expect(pack.advisoryDropped).toBe(10) // the advisory side is bounded exactly as it is without it
  })
})

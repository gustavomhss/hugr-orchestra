// @atlas/tools — test/wp-10.a5-tools.test.ts   (WP-10.A5.TOOLS — ADR-0005 / ENTRY-MCP-3, PROP-MCP-3)
//
// RED→GREEN realization of the `READ_SURFACE` acceptance goldens (SCN-MCP-3b/3c/3d/3g-1): the frozen
// `handler.ts` constant, its two disjointness properties against the governed constants, its cardinality,
// and — driven over the REUSED write-spy harness (`packages/cli/test/write-spy-store.ts`, imported here
// as a test-only cross-package dependency; `layer-guard` scans `src/` only, so this is NOT an ARCH-2 edge) —
// the zero-write-authority property for every one of its six members.
//
// Facets under test, imported DIRECTLY from source:
//   • ../src/handler.js — GOVERNANCE_SURFACE / WRITE_PATHS (byte-unchanged, transcribed as the oracle) +
//     the NEW READ_SURFACE (6 members, ADR-0005's Decision (reconciled 2026-08-24) + atlas-authoring.md A-D2).
//   • ../src/anchors.js / slots.js / draft.js / check.js / doctor.js — the five planner/projection factories.
//
// `atlas-node` is exercised through `handler.js`'s own `createHandler(...).resolveNode` (TOOLS-10) — it has
// no dedicated `node.ts` module; the per-node read is co-located in the ONE handler. `atlas-diff` is
// DELIBERATELY EXCLUDED from `READ_SURFACE` (owner-decided) — it stays a declared zero-caller reference
// model (`../src/diff.ts`) until it is genuinely wired to a transport, so it is not exercised here either.

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import { GOVERNANCE_SURFACE, WRITE_PATHS, READ_SURFACE, createHandler } from "../src/handler.js"
import type { NodeSource } from "../src/handler.js"
import { createAnchors } from "../src/anchors.js"
import { createSlots } from "../src/slots.js"
import { createDraft } from "../src/draft.js"
import { createCheck } from "../src/check.js"
import type { GateChainRunner } from "../src/check.js"
import { createDoctor } from "../src/doctor.js"

// Reused, NOT re-implemented (per WP mandate): `packages/cli/test/write-spy-store.ts`, the reusable
// `DiskStore`-backed write-freedom harness EPIC-A2/A3 already share. It pulls `@atlas/adapter-io` (a REAL
// `DiskStore`), so this import is deliberately DYNAMIC and via a NON-LITERAL specifier: a `tools`-package
// `.ts` file that STATICALLY imports a sibling package's `test/` sources drags them into `tools`'
// `composite`/`rootDir` compile unit (`tsc -b` then fails TS5055, "would overwrite input file" — measured:
// a static relative import here made EVERY `packages/tools/dist/src/*.d.ts` collide). `layer-guard.mjs`
// itself only walks `packages/*/src` (`workspace-scan.mjs`), so this is not the ARCH-2 edge the gate
// forbids — `@atlas/tools` still has ZERO production dependency on `@atlas/adapter-io` (`package.json`
// unchanged) and no `src/` file reaches it; only vitest's own (non-project-reference) module loader resolves
// this path, at test-run time, exactly as it resolves every other test file in the workspace.
const WRITE_SPY_STORE_PATH = ["..", "..", "cli", "test", "write-spy-store.js"].join("/")
interface WriteCall {
  readonly door: "put" | "persistProjection" | "commitProjection" | "commitStaging"
}
interface DiskStoreLike {
  get(h: Hash): unknown
  loadProjection(): unknown
  put(obj: unknown): Hash
}
interface WriteSpyHarnessLike {
  readonly spy: DiskStoreLike
  readonly seed: DiskStoreLike
  calls(): readonly WriteCall[]
  census(): ReadonlyMap<string, string>
  dispose(): void
}
const { createWriteSpyStore, seedSomeBytes } = (await import(WRITE_SPY_STORE_PATH)) as {
  createWriteSpyStore: () => WriteSpyHarnessLike
  seedSomeBytes: (seed: DiskStoreLike) => Hash
}

// ── the frozen oracle — byte-for-byte the values ADR-0003/0004/0005 pin FOR THIS CAMPAIGN (WP-10.A5,
//    six-member READ_SURFACE); WP-11.W8 (CAMPAIGN-11) later grew all three constants — `atlas-memory-emit`
//    into GOVERNANCE_SURFACE/WRITE_PATHS, four memory read doors into READ_SURFACE. This suite's own SCOPE
//    claim ("READ-ONLY over all three") describes what THIS campaign did, not a promise those constants
//    never grow again — the disjointness/cardinality PROPERTIES below still hold over the current values. ──
const CANONICAL_WRITE_PATHS = ["atlas-emit", "atlas-link", "atlas-memory-emit"] as const
const CANONICAL_GOVERNANCE_SURFACE = [
  "atlas-init",
  "atlas-query",
  "atlas-emit",
  "atlas-reconcile",
  "atlas-link",
  "atlas-memory-emit",
] as const
const CANONICAL_READ_SURFACE = [
  "atlas-anchors",
  "atlas-slots",
  "atlas-draft",
  "atlas-check",
  "atlas-doctor",
  "atlas-node",
  "atlas-memory-recall",
  "atlas-memory-header",
  "atlas-memory-awareness",
  "atlas-memory-orientation",
] as const

describe("WP-10.A5.TOOLS — READ_SURFACE is frozen, disjoint, and correctly sized (PROP-MCP-3)", () => {
  // SCN-MCP-3b-1 — the two governed constants, pinned to their CURRENT shipped values.
  it("SCN-MCP-3b-1 — GOVERNANCE_SURFACE and WRITE_PATHS match the canonical oracle", () => {
    expect([...GOVERNANCE_SURFACE]).toEqual([...CANONICAL_GOVERNANCE_SURFACE])
    expect([...WRITE_PATHS]).toEqual([...CANONICAL_WRITE_PATHS])
  })

  // SCN-MCP-3c-1 — READ_SURFACE membership + cardinality (10, ADR-0005 six + WP-11.W8's four), IN ORDER.
  it("SCN-MCP-3c-1 — READ_SURFACE deep-equals the 10-member set, in order", () => {
    expect([...READ_SURFACE]).toEqual([...CANONICAL_READ_SURFACE])
    expect(READ_SURFACE.length).toBe(10)
    expect(GOVERNANCE_SURFACE.length).toBe(6)
    expect(WRITE_PATHS.length).toBe(3)
  })

  // SCN-MCP-3d-1 — READ_SURFACE ∩ GOVERNANCE_SURFACE = ∅ and READ_SURFACE ∩ WRITE_PATHS = ∅ (ENTRY-MCP-3).
  it("SCN-MCP-3d-1 — READ_SURFACE is disjoint from GOVERNANCE_SURFACE and from WRITE_PATHS", () => {
    const gov = new Set<string>(GOVERNANCE_SURFACE)
    const wp = new Set<string>(WRITE_PATHS)
    for (const door of READ_SURFACE) {
      expect(gov.has(door)).toBe(false)
      expect(wp.has(door)).toBe(false)
    }
    // set-level form, restated so a future ⊆-only regression (all-but-one disjoint) cannot hide.
    const overlapGov = READ_SURFACE.filter((d) => gov.has(d))
    const overlapWrite = READ_SURFACE.filter((d) => wp.has(d))
    expect(overlapGov).toEqual([])
    expect(overlapWrite).toEqual([])
  })

  // SCN-MCP-3g-1 (PIN TEETH) — a mutant READ_SURFACE that overlaps GOVERNANCE_SURFACE is REJECTED by the
  // SAME disjointness predicate the spec-conformance guard's CODE-SURFACE PIN runs (transcribed here so the
  // property has teeth independent of a subprocess run of the guard itself — the guard's own teeth are
  // proven live in the return card via the bogus-member/revert probe).
  it("SCN-MCP-3g-1 — a READ_SURFACE mutant that overlaps GOVERNANCE_SURFACE fails the disjointness predicate", () => {
    const disjointFromGovernance = (rs: readonly string[]): boolean =>
      rs.every((d) => !(GOVERNANCE_SURFACE as readonly string[]).includes(d))
    expect(disjointFromGovernance(READ_SURFACE)).toBe(true)
    const mutant = [...READ_SURFACE, "atlas-emit"] // atlas-emit is a real GOVERNANCE_SURFACE/WRITE_PATHS member
    expect(disjointFromGovernance(mutant)).toBe(false)
  })
})

describe("WP-10.A5.TOOLS — every READ_SURFACE member carries ZERO write authority (write-spy)", () => {
  it("SCN-MCP-3d-2 — anchors / slots / draft / check / doctor / node reach NO write door, over ONE shared spy", () => {
    const harness = createWriteSpyStore()
    seedSomeBytes(harness.seed) // a NON-EMPTY store, so the census arm is a real assertion (not vacuous)
    // the `atlas-node` fixture below needs ONE real seeded object too — seed it here, BEFORE the census
    // baseline, so it is durable fixture ARRANGEMENT (via `seed`, which bypasses the spy) and not itself
    // scored as a leg-under-test write.
    const seededId = harness.seed.put({ kind: "seed-node", note: "a node object" } as never)
    const censusBefore = harness.census()

    // atlas-anchors — the GroundingComputer port takes NO store handle at all (AUTHOR-1); structurally
    // incapable of reaching `harness.spy`.
    const { anchors } = createAnchors({
      anchorsUnder: (path) => ({
        rev: "R1",
        units: [{ qualifiedPath: `${path}/a.ts`, kind: "file", subtreeHash: "h", path: `${path}/a.ts` }],
        holes: [],
      }),
      groundingFor: () => ({ kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "h" as never }),
    })
    anchors("src")

    // atlas-slots — no injected port at all (pure over the compile-time PredicateSlot union).
    createSlots().slots()

    // atlas-draft — the GroundingComputer + IncumbentPort seams; neither ever holds `harness.spy`.
    const { draft } = createDraft(
      {
        anchorsUnder: () => ({ rev: "R1", units: [], holes: [] }),
        groundingFor: () => ({ kind: "file", qualifiedPath: "src/a.ts", subtreeHash: "h" as never }),
      },
      { incumbentAt: () => undefined, ratifyContextFor: () => ({ contested: false, lowRisk: true }) },
    )
    draft({ anchor: "src/a.ts", slot: "invariant", claim: "x holds" })

    // atlas-check — the GateChainRunner port genuinely reads the injected snapshot (check.ts's own header:
    // "resolves the incumbent from a READ-ONLY store.loadProjection() SNAPSHOT") — wired here DIRECTLY over
    // `harness.spy.loadProjection()`, a REAL read through the spy (not a bypass), so a runner that leaked a
    // write attempt through this exact seam would be caught.
    const runner: GateChainRunner = {
      runChain: (_candidate, _at) => {
        harness.spy.loadProjection() // real read through the poisoned store — must not throw/record
        return { wouldEmit: true, gates: [] }
      },
    }
    const candidate: GroundedFact = {
      kind: "advisory",
      id: "nodeKey:test" as never,
      tier: "T2",
      claimNorm: "x holds",
      grounding: { entries: [] },
      freshness: "FRESH",
      claims: [],
      authoring: "ADVISORY",
    }
    createCheck(runner).check(candidate, "src@R1" as Hash)

    // atlas-doctor — the DoctorSource port is a plain read/advisory interface; no store handle.
    const doctor = createDoctor({
      lineage: () => ["cas:1" as Hash],
      drift: () => undefined,
      hotSetSize: () => 3,
      casAudit: () => ({ objects: 0, corrupt: [], unreadable: [], missing: [], orphan: 0, referenced: 0, sound: true }),
      plan: () => undefined,
    })
    doctor.archive("core")
    doctor.whyBroken("claim:x")
    doctor.hotSet(100)
    doctor.reground("claim:x")

    // atlas-node — `HandlerApi.resolveNode`, the ONE handler's per-node read (TOOLS-10). Backed here by a
    // REAL read through `harness.spy.get` (content-addressed), exactly the shape a production `NodeSource`
    // would use — never a write.
    const nodeSource: NodeSource = {
      resolve: (nodeAddr) => {
        const obj = harness.spy.get(seededId) // real read through the poisoned store
        return obj === undefined ? undefined : ({ ...candidate, id: nodeAddr } as GroundedFact)
      },
    }
    createHandler({}, nodeSource).resolveNode("node:test" as never, "cli")

    // ── the assertion every leg above ran under: ZERO write-door calls, byte-identical store ─────────────
    expect(harness.calls()).toEqual([])
    expect(harness.census()).toEqual(censusBefore)

    harness.dispose()
  })

  // The harness's OWN teeth (mirrors anchors-cli.test.ts's non-vacuity check): a DIRECT write through `spy`
  // records the call AND throws — so "zero calls" above is a real assertion, not a store that never checks.
  it("the write-spy harness itself is non-vacuous — a direct write records + throws", () => {
    const harness = createWriteSpyStore()
    expect(() => harness.spy.put({ kind: "x" } as never)).toThrow(/write-spy/)
    expect(harness.calls()).toEqual([{ door: "put" }])
    harness.dispose()
  })
})

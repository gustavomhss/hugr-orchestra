// @atlas/e2e — S8 · Governed write doors, one contract across every transport
// AXIS: SECURITY (single write authority) + behaviour (transport-invariance / the CLI-floor).
//
// STORY. Atlas exposes its whole read/write API over three transports (MCP tool | poke | CLI), yet the trust
// boundary must not widen by even one door. This story drives the REAL @atlas/tools governed surface across
// the package seam and proves the four load-bearing facts stay true no matter which transport a call rides:
//   (1) the governance surface is EXACTLY five tools and every write flows through a governed door (`atlas-emit` grounded facts | `atlas-link` sameAs, ADR-0003),
//   (2) THE ONE handler is pure + total — a missing/throwing leg fails CLOSED to a structured rejected
//       Verdict (never a throw), with `next+invariant` guidance stamped on every path,
//   (3) CLI ≡ MCP: the same node resolved at two different pull tiers is byte-identical, `atlas-diff`
//       renders identically across transports, and the published schema carries NO transport parameter,
//   (4) the governed store admits writes ONLY through a governed door — an ungrounded/forged row is refused, an existing key
//       is never overwritten (append-only), a tampered row is never served, and the read/advisory surfaces
//       (doctor / diff) carry NO write authority (`doctor.reground` returns a PLAN and persists nothing),
//   (5) the pull ladder is native-first with the CLI as the FLOOR, and a push holds with ZERO tool grant.
//
// This composes the REAL wired @atlas/tools runtime (`createHandler`/`createGuard`/`createGovernedStore`/
// `createTransport`/`createDoctor`/`createAtlasDiff` + the frozen surface constants). The INJECTED PORTS are
// the legitimate seams the facets defer to (all read-only or store-backing): the per-tool `ToolLegs`, the
// per-node `NodeSource`, the phase `PhasePushSource`, the `DiffSource`/`DoctorSource`, and the backing store
// `medium`. Content-addressing runs through the SEALED @atlas/kernel `id` seam (never a hand-rolled digest),
// so the single-write-door assertions have real teeth.

import { describe, it, expect } from "vitest"
import { id, asNodeKey } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash, NodeKey, Pack } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { VersionDelta } from "@atlas/persist"
import type { Poke } from "@atlas/retrieval"
import {
  GOVERNANCE_SURFACE,
  WRITE_PATHS,
  createHandler,
  createGovernedStore,
  createTransport,
  createDoctor,
  createAtlasDiff,
  PULL_LADDER,
  PUSH_TIER,
  PUSH_GRANTS_REQUIRED,
} from "@atlas/tools"
import type {
  ToolLeg,
  NodeSource,
  PhasePushSource,
  DiffSource,
  DoctorSource,
  StoreRow,
  ToolData,
  PullTier,
} from "@atlas/tools"

// ── fixtures: one grounded node, one version-delta, one drifted fact ─────────────────────────────────
const A = "cas:9b21" as NodeKey // N1's content address (drill-down within its pack, TOOLS-10)
const N1 = {
  kind: "advisory",
  id: asNodeKey("claim:acme-arr-2024"),
  claimNorm: "ACME ARR 2024 = $4.2M",
} as unknown as GroundedFact

/** A pack-grained read-only node source (X1: node access is a DRILL-DOWN within its pack). No mutator. */
const nodes: NodeSource = { resolve: (addr) => (addr === A ? N1 : undefined) }

const financePack: Pack = {
  territory: "finance/",
  axisHash: "axis-finance-01" as Hash,
  invariants: [],
  advisory: [],
  advisoryDropped: 0,
  tokenEstimate: 0,
  stale: false,
}
const pushSource: PhasePushSource = (_seat, scope): Poke => ({
  scope,
  pack: financePack,
  notice: "fresh finance pack — pushed with no tool grant",
})

const shaA = "cas:aaaa" as Hash
const shaB = "cas:bbbb" as Hash
const Δ: VersionDelta = {
  added: [{ fact: "claim:acme-ceo", provenance: "WP-3.1@commit-a" }],
  edited: [{ fact: "claim:acme-arr-2024", provenance: "WP-3.2@commit-b" }],
  superseded: [{ fact: "pred:auth-token-ttl", provenance: "WP-3.3@commit-c" }],
  decayed: [{ fact: "claim:acme-hq-2019", provenance: "WP-3.4@commit-d" }],
}
const diffSource: DiffSource = {
  diff: (a, b) => (a === shaA && b === shaB ? Δ : { added: [], edited: [], superseded: [], decayed: [] }),
}

/** A GROUNDED store row — exactly what `atlas-emit`'s content-addressed path produces: key == id(value). */
const grounded = (value: unknown): StoreRow => ({ key: id(value as CasObject), value })

describe("S8 · governed write doors, one contract across every transport", () => {
  // ── (1) SURFACE == 5, WRITE == 2 (WP-SAMEAS) ────────────────────────────────────────────────────────
  it("exposes EXACTLY six governance tools and EXACTLY three governed write paths (WP-11.W8: atlas-memory-emit)", () => {
    expect(GOVERNANCE_SURFACE.length).toBe(6)
    expect([...GOVERNANCE_SURFACE].sort()).toEqual([
      "atlas-emit",
      "atlas-init",
      "atlas-link",
      "atlas-memory-emit",
      "atlas-query",
      "atlas-reconcile",
    ])
    expect(WRITE_PATHS.length).toBe(3)
    expect([...WRITE_PATHS].sort()).toEqual(["atlas-emit", "atlas-link", "atlas-memory-emit"]) // the three governed write doors (WP-SAMEAS + WP-11.W8)
    // teeth (breaks-on "an unauthorized governance tool or a fourth write path appears"): the cardinality is fixed.
    expect(GOVERNANCE_SURFACE).not.toContain("atlas-delete")
    expect(WRITE_PATHS).not.toContain("atlas-diff") // a read projection is never a write path
  })

  // ── (2) THE ONE handler is PURE + TOTAL ─────────────────────────────────────────────────────────────
  it("handles a missing/throwing leg by failing CLOSED to a structured rejected Verdict — never a throw", () => {
    // an off-seam tool (no leg wired) and a leg that THROWS on a malformed arg — both must be caught.
    const throwingLeg: ToolLeg = (args) =>
      ({ covered: (args as { scope: string }).scope.startsWith("x") }) as unknown as ToolData
    const handler = createHandler({ "atlas-query": throwingLeg })

    let threwMissing = false
    let threwMalformed = false
    let missing
    let malformed
    try {
      missing = handler.handle("atlas-init", {})
    } catch {
      threwMissing = true
    } // no leg wired
    try {
      malformed = handler.handle("atlas-query", { scope: 42 })
    } catch {
      threwMalformed = true
    } // leg throws

    // teeth (breaks-on "the handler throws instead of returning a structured rejected verdict"):
    expect(threwMissing).toBe(false)
    expect(threwMalformed).toBe(false)
    expect(missing?.ok).toBe(false)
    expect(missing?.rejected).toBeTruthy()
    expect(malformed?.ok).toBe(false)
    expect(malformed?.rejected).toBeTruthy()
    // every verdict — ok OR rejected — carries non-empty next+invariant guidance (TOOLS-4).
    const okLeg: ToolLeg = (args) => ({ covered: String((args as { scope: string }).scope) }) as unknown as ToolData
    const ok = createHandler({ "atlas-query": okLeg }).handle("atlas-query", { scope: "src/finance" })
    expect(ok.ok).toBe(true)
    for (const v of [missing, malformed, ok]) {
      expect(v?.guidance.next).not.toBe("")
      expect(v?.guidance.invariant).not.toBe("")
    }
  })

  // ── (3) CLI ≡ MCP — transport-invariance ────────────────────────────────────────────────────────────
  it("resolves a node byte-identically across two pull tiers (CLI ≡ MCP) — the transport arg never changes content", () => {
    const handler = createHandler({}, nodes)
    const transport = createTransport({ handler, push: pushSource })

    const viaMcp = transport.resolveAt(A, "sdk-mcp") // tier rides the `mcp` node transport
    const viaCli = transport.resolveAt(A, "cli") // tier rides the `cli` node transport (the floor)

    expect(viaMcp.ok).toBe(true)
    expect(viaMcp.data).toEqual(N1)
    // teeth (breaks-on "the transport arg changes the returned content — CLI and MCP diverge"): byte-identical.
    expect(viaCli).toEqual(viaMcp)
    expect(JSON.stringify(viaCli)).toBe(JSON.stringify(viaMcp))
  })

  it("renders atlas-diff identically across transports and publishes a schema with NO transport parameter", () => {
    const diff = createAtlasDiff(diffSource)
    const overCli = diff.render("cli", shaA, shaB)
    const overMcp = diff.render("mcp", shaA, shaB)
    expect(overCli.ok).toBe(true)
    expect(overCli.data).toEqual(Δ)
    // teeth (breaks-on "the transport arg changes the returned content — CLI and MCP diverge"):
    expect(overMcp).toEqual(overCli)
    expect(JSON.stringify(overMcp)).toBe(JSON.stringify(overCli))

    // the ONE published schema (TOOLS-3) is a pure function of the tool — it takes NO transport argument.
    const handler = createHandler({}, nodes)
    expect(handler.schema.length).toBe(1) // signature is schema(tool) — arity 1, no transport parameter
    // teeth (breaks-on "a governance tool's schema exposes a transport param — CLI and MCP would diverge at the schema"):
    // sweep ALL five governance tools, not just one — NONE may carry a `transport` property.
    for (const tool of GOVERNANCE_SURFACE) {
      const props = (handler.schema(tool).inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
      expect(Object.keys(props), `${tool} schema must not expose a transport param`).not.toContain("transport")
    }
  })

  // ── (4) GOVERNED WRITE DOOR ───────────────────────────────────────────────────────────────────────────
  it("admits only content-addressed rows through the one door — refuses forged, is append-only, never serves tampered", () => {
    const medium = new Map<string, StoreRow>()
    const store = createGovernedStore(medium)

    // an ungrounded / identity-mismatched row (key != id(value)) is refused — nothing lands.
    const forged: StoreRow = { key: "N1", value: { kind: "claim", claim: "ACME ARR 2024 = $9.9M" } }
    expect(store.write(forged).admitted).toBe(false)
    expect(medium.size).toBe(0)
    expect(store.read("N1")).toBeUndefined()

    // a grounded row is admitted; a forged SAME-KEY / different-bytes overwrite is refused (append-only).
    const g1 = grounded({ kind: "claim", claim: "ACME ARR 2024 = $4.2M" })
    expect(store.write(g1).admitted).toBe(true)
    const bytesBefore = JSON.stringify(medium.get(g1.key))
    expect(store.write({ key: g1.key, value: { kind: "claim", claim: "tampered" } }).admitted).toBe(false)
    // teeth (breaks-on "the store overwrites/round-trips a tampered row"): prior bytes are byte-preserved.
    expect(JSON.stringify(medium.get(g1.key))).toBe(bytesBefore)

    // a row injected DIRECTLY into the medium (bypassing the door) is rejected at read by the integrity check.
    medium.set("forged-address", { key: "forged-address", value: { kind: "claim", claim: "ungrounded" } })
    expect(store.read("forged-address")).toBeUndefined()
    // the genuinely grounded row still round-trips.
    expect(store.read(g1.key)).toEqual(g1)
  })

  it("keeps the read/advisory surfaces write-authority-free — doctor.reground returns a PLAN and persists nothing", () => {
    const medium = new Map<string, StoreRow>()
    const store = createGovernedStore(medium)
    store.write(grounded({ kind: "claim", claim: "seed" }))
    const sizeBefore = medium.size

    const regroundEmit = {
      kind: "advisory",
      id: asNodeKey("fact:acme-arr"),
      claimNorm: "re-grounded ACME ARR",
    } as unknown as GroundedFact
    const source: DoctorSource = {
      lineage: () => [],
      drift: () => undefined,
      hotSetSize: () => 0,
      casAudit: () => ({ objects: 0, corrupt: [], unreadable: [], missing: [], orphan: 0, referenced: 0, sound: true }),
      plan: (fact) => (fact === "claim:acme-arr-2024" ? { action: "reground", emit: regroundEmit } : undefined),
    }
    const doctor = createDoctor(source)
    const out = doctor.reground("claim:acme-arr-2024")

    // reground yields a PROPOSAL that funnels through atlas-emit — it is NOT itself a write.
    expect(out.plan?.action).toBe("reground")
    expect(out.plan?.emit).toEqual(regroundEmit)
    // teeth (breaks-on "a read/advisory path (doctor/query/diff) gains write authority"): the store is untouched,
    // and neither the doctor nor the diff handle exposes any store-mutating method.
    expect(medium.size).toBe(sizeBefore)
    for (const handle of [
      doctor as unknown as Record<string, unknown>,
      createAtlasDiff(diffSource) as unknown as Record<string, unknown>,
    ]) {
      expect(handle.write).toBeUndefined()
      expect(handle.set).toBeUndefined()
      expect(handle.put).toBeUndefined()
      expect(handle.apply).toBeUndefined()
    }
  })

  // ── (5) THE LADDER — native-first, CLI floor, grantless push ────────────────────────────────────────
  it("walks a native-first pull ladder with the CLI as the FLOOR, and a push holds with zero tool grant", () => {
    expect(PULL_LADDER).toEqual(["sdk-mcp", "registered-mcp", "poke-as-file", "relay", "cli"])
    const floor: PullTier | undefined = PULL_LADDER[PULL_LADDER.length - 1]
    // teeth (breaks-on "the pull ladder loses its CLI floor, or a push suddenly requires a grant"):
    expect(floor).toBe("cli") // CLI is the last tier — the floor, not the first-tried
    expect(PULL_LADDER[0]).toBe("sdk-mcp") // native-first: the SDK MCP tier leads
    expect(PULL_LADDER.indexOf("cli")).toBe(PULL_LADDER.length - 1)
    expect(PUSH_GRANTS_REQUIRED).toBe(0) // a push (poke-as-file) reaches a Read-only seat with NO grant
    expect(PUSH_TIER).toBe("poke-as-file")
  })
})

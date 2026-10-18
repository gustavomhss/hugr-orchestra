// @atlas/tools — test/wp-7.26-c-tools.test.ts   (WP-7.26-c.TOOLS — EPIC-26-c)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the tri-transport addressability + spawn ladder
// facet (EPIC-26-c). Two facets under test, imported DIRECTLY from source (the barrel is wired by the lead
// at SEAL):
//   • ../src/handler.js   — the real per-node projection `resolveNode` (TOOLS-10, SCN-TOOLS-10a-1 / 10b-1 /
//                           10c-1 / 10d-1) — one oracle, read-only, byte-identical over MCP | poke | CLI.
//   • ../src/transport.js — the push/pull spawn ladder (TOOLS-11 / 11a, SCN-TOOLS-11-a-1 / -b-1 / -c-1 /
//                           -d-1, SCN-TOOLS-11a-a-1 / -b-1 / -c-1 / -d-1): CLI is the FLOOR not the fallback,
//                           push serves a Read-only seat with no grant, the ladder is honest per harness,
//                           and every tier is backed by the ONE handler (knowledge ∧ memory ∧ tools).
//
// Content-addressing stays behind the SEALED @atlas/kernel seam (via the governed store). Held-out `-2`
// fixtures are NOT transcribed — the GATE runs those.

import { describe, it, expect } from "vitest"
import { id } from "@atlas/kernel"
import type { CasObject } from "@atlas/kernel"
import type { Hash, NodeKey, Pack } from "@atlas/contracts"
import type { GroundedFact } from "@atlas/knowledge"
import type { Poke } from "@atlas/retrieval"
import { createGovernedStore } from "../src/guard.js"
import { createHandler, GOVERNANCE_SURFACE, WRITE_PATHS } from "../src/handler.js"
import type { NodeSource } from "../src/handler.js"
import type { Transport } from "../src/types.js"
import { createTransport, PULL_LADDER, PUSH_GRANTS_REQUIRED, PUSH_TIER } from "../src/transport.js"
import type { PhasePushSource } from "../src/transport.js"

// ── shared fixtures (N1 @ cas:9b21, H_sdk, H_agents, S_ro) ─────────────────────────────────────────

const A = "cas:9b21" as NodeKey // N1's content address (goldens fixture universe)
const N1 = {
  kind: "advisory",
  id: "claim:acme-arr-2024" as NodeKey,
  claimNorm: "ACME ARR 2024 = $4.2M",
} as unknown as GroundedFact

/** A pack-grained read-only node source (X1: node access is a DRILL-DOWN within the pack). Resolves N1 by
 *  its content address; any other address is absent. No store-mutating method. */
const nodes: NodeSource = { resolve: (addr) => (addr === A ? N1 : undefined) }

/** THE one handler, wired with the read-only per-node projection (no governance legs needed for the reads). */
const handler = createHandler({}, nodes)

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

const H_sdk = { canPropagateMcp: true } as const
const H_agents = { canPropagateMcp: false } as const

const transport = () => createTransport({ handler, push: pushSource })

// ── REQ-TOOLS-10 — tri-transport byte-identity (one handler, read-only) ─────────────────────────────

describe("WP-7.26-c.TOOLS — a node is addressable over three transports against one handler", () => {
  it("SCN-TOOLS-10a-1: one node, three transports, byte-identical content", () => {
    const mcp = handler.resolveNode(A, "mcp")
    const poke = handler.resolveNode(A, "poke")
    const cli = handler.resolveNode(A, "cli")

    expect(mcp.ok).toBe(true)
    expect(mcp.data).toEqual(N1) // the node content is served
    // teeth (breaks-on "the poke transport re-serializes / reorders / strips a field"): byte-identical.
    expect(JSON.stringify(poke)).toBe(JSON.stringify(mcp))
    expect(JSON.stringify(cli)).toBe(JSON.stringify(mcp))
  })

  it("SCN-TOOLS-10b-1: the three transports return the same Verdict contract shape {content,next,invariant}", () => {
    for (const t of ["mcp", "poke", "cli"] as Transport[]) {
      const v = handler.resolveNode(A, t)
      expect(v.data).toEqual(N1) // content
      expect(v.guidance.next).not.toBe("") // next
      expect(v.guidance.invariant).not.toBe("") // invariant
      // teeth (breaks-on "the CLI returns a bare content string while MCP returns a Verdict"): always a Verdict.
      expect(typeof v).toBe("object")
      expect(typeof v.ok).toBe("boolean")
    }
  })

  it("SCN-TOOLS-10c-1: a write through any transport is refused — the projection opens no write door", () => {
    const medium = new Map<string, { key: string; value: unknown }>()
    const store = createGovernedStore(medium)
    const g = { key: id(N1 as CasObject), value: N1 }
    store.write(g)
    const storeNodes: NodeSource = {
      resolve: (addr) => (addr === A ? (store.read(g.key)?.value as GroundedFact) : undefined),
    }
    const h = createHandler({}, storeNodes)

    const before = JSON.stringify([...medium.entries()])
    for (const t of ["mcp", "poke", "cli"] as Transport[]) {
      // Addressed by `A` (the NodeKey the `storeNodes` resolver above is keyed on), NOT by `g.key`.
      // `g.key` is `id(N1)` — a CAS content Hash, a different brand and a different string from
      // 'cas:9b21' — so `resolve(addr)` returned `undefined` for every iteration and `resolveNode` fell
      // through to its no-node-resolved fail-closed verdict. The loop therefore never reached a RESOLVED
      // node, which is the only state in which "the projection opens no write door" says anything.
      // The `as NodeKey` cast was what let a Hash sit in a NodeKey parameter unnoticed.
      const v = h.resolveNode(A, t)
      // teeth (breaks-on "the MCP transport exposes a set()/put() — a write lands via the node handler"):
      expect(Reflect.get(v, "set")).toBeUndefined()
      expect(Reflect.get(v, "put")).toBeUndefined()
      expect(Reflect.get(v, "write")).toBeUndefined()
    }
    // no per-node READ transport mutated the store; the write surface is the three GOVERNED write doors
    // (atlas-emit + atlas-link + atlas-memory-emit, WP-SAMEAS + WP-11.W8) — the read transports add NO write door.
    expect(JSON.stringify([...medium.entries()])).toBe(before)
    expect([...WRITE_PATHS].sort()).toEqual(["atlas-emit", "atlas-link", "atlas-memory-emit"])
  })

  it("SCN-TOOLS-10d-1: the CLI addresses a node outside the current phase pack — unscoped", () => {
    // A is deliberately NOT in any current phase pack; the CLI applies NO scope filter.
    const cli = handler.resolveNode(A, "cli")
    // teeth (breaks-on "the CLI scopes addressability to the current phase pack"): it resolves regardless.
    expect(cli.ok).toBe(true)
    expect(cli.data).toEqual(N1)
  })
})

// ── REQ-TOOLS-11 — push-owns-common-case, laddered pull, CLI-floor ──────────────────────────────────

describe("WP-7.26-c.TOOLS — push serves the seat, the pull ladder is native-first, CLI is the floor", () => {
  it("SCN-TOOLS-11-a-1: a Read-only seat is served by push, never forced to the CLI", () => {
    const t = transport()
    // push serves S_ro (the orchestrator's job) — it consumes a materialized pack/poke.
    const pushed = t.prePhasePush("S_ro", "finance/")
    expect(pushed).toBeDefined()
    // teeth (breaks-on "resolve routes the Read-only seat to the CLI"): the floor is never the start.
    const r = t.resolve("S_ro", { scope: "finance/" }, H_agents)
    expect(r.startedTier).not.toBe("cli")
  })

  it("SCN-TOOLS-11-b-1: push lands on a Read-only seat with zero tool grant (grantsRequired == 0)", () => {
    const t = transport()
    const pushed = t.prePhasePush("S_ro", "finance/") // poke / pack / RelationSet — the push payload
    expect(pushed).toBeDefined()
    // teeth (breaks-on "push requires a tool grant — a Read-only seat cannot receive the poke"):
    expect(PUSH_GRANTS_REQUIRED).toBe(0)
  })

  it("SCN-TOOLS-11-c-1: an ad-hoc pull walks the ladder native-first", () => {
    const t = transport()
    const r = t.resolve("S1", { scope: "finance/" }, H_sdk)
    // the fixed native-first order: SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI.
    expect(r.tiers.map((x) => x.tier)).toEqual(["sdk-mcp", "registered-mcp", "poke-as-file", "relay", "cli"])
    expect(PULL_LADDER).toEqual(["sdk-mcp", "registered-mcp", "poke-as-file", "relay", "cli"])
    // teeth (breaks-on "the ladder is reordered to try the CLI first"): returns the first available (SDK-MCP).
    expect(r.startedTier).toBe("sdk-mcp")
  })

  it("SCN-TOOLS-11-d-1: a lower-tier result equals the native-tier result — every tier is the one handler", () => {
    const t = transport()
    const viaPokeTier = t.resolveAt(A, "poke-as-file")
    const viaSdkTier = t.resolveAt(A, "sdk-mcp")
    // teeth (breaks-on "the poke-as-file tier is backed by a second handler with a different contract"):
    expect(JSON.stringify(viaPokeTier)).toBe(JSON.stringify(viaSdkTier))

    // ONE transport contract across knowledge ∧ memory ∧ tools (wave-plan §X1 / the CLI-floor note): a
    // memory-recall-flavored need resolves through the SAME ladder byte-identically to a knowledge need.
    const knNeed = t.resolve("S1", { scope: "knowledge:finance/" }, H_sdk)
    const memNeed = t.resolve("S1", { scope: "memory:lessons/onboarding" }, H_sdk)
    expect(JSON.stringify(memNeed)).toBe(JSON.stringify(knNeed))
  })
})

// ── REQ-TOOLS-11a — honest ladder per harness ───────────────────────────────────────────────────────

describe("WP-7.26-c.TOOLS — the ladder is honest per harness", () => {
  it("SCN-TOOLS-11a-a-1: a governed seat is spawned in-process with a per-seat grant", () => {
    const t = transport()
    const seat = t.spawn("S_gov", ["atlas-query"])
    // teeth (breaks-on "a seat is spawned via a registered external MCP server instead of the in-process
    // SDK path"): the native tier-1 spawn contract = create_sdk_mcp_server in-process + per-seat grant.
    expect(seat.transport).toBe("sdk-in-process")
    expect(seat.allowedTools).toContain("atlas-query")
  })

  it("SCN-TOOLS-11a-b-1: an MCP-incapable harness down-ranks tiers 1 and 2", () => {
    const t = transport()
    const r = t.resolve("S1", { scope: "finance/" }, H_agents)
    const byTier = Object.fromEntries(r.tiers.map((x) => [x.tier, x.status]))
    // teeth (breaks-on "the ladder still advertises tier-1 SDK-MCP as available on H_agents"):
    expect(byTier["sdk-mcp"]).toBe("unavailable")
    expect(byTier["registered-mcp"]).toBe("unavailable")
    // resolution goes straight to push / pull 3–4.
    expect(byTier["poke-as-file"]).toBe("native")
    expect(r.startedTier).toBe("poke-as-file")
  })

  it("SCN-TOOLS-11a-c-1: a failing advertised-native tier is reported, not silently skipped", () => {
    const t = transport()
    const r = t.resolve("S1", { scope: "finance/" }, H_agents)
    // teeth (breaks-on "an advertised-native tier is silently dropped with no report"): every ladder tier
    // is present in the resolution ledger — the down-ranked SDK-MCP is surfaced as `unavailable`, not omitted.
    expect(r.tiers.map((x) => x.tier)).toEqual([...PULL_LADDER])
    expect(r.tiers.find((x) => x.tier === "sdk-mcp")?.status).toBe("unavailable")
  })

  it("SCN-TOOLS-11a-d-1: the ladder reports the tier it actually started on", () => {
    const t = transport()
    const r = t.resolve("S1", { scope: "finance/" }, H_agents)
    // teeth (breaks-on "the ladder reports startedTier == SDK-MCP on H_agents while it started on push"):
    expect(r.startedTier).toBe(PUSH_TIER) // == 'poke-as-file', the push-family tier it truly started on
    expect(r.startedTier).not.toBe("sdk-mcp")
    expect(r.direction).toBe("push")
  })
})

// @atlas/mcp-server — test/surface-conformance-req-mcp-1e.test.ts   (REQ-MCP-1e — SCN-MCP-1e-1)
//
// REQ-MCP-1e (added ADR-0006): "If the advertised set and the invocable set are computed separately, then
// the surface conformance gate shall fail" — the ARCH-5 no-independent-drift guard. This is the FIRST witness
// for REQ-MCP-1e; goldens-adapters.md self-admitted "every REQ [has ≥1 SCN] except REQ-MCP-1e" until now.
//
// STRUCTURAL proof, not a behavioural probe. Two facts about `src/server.ts`, each asserted directly against
// the SAME production values (never re-transcribed):
//   (1) `advertisedTools` derives its advertised names from `GOVERNANCE_SURFACE.map(...)` (@atlas/tools, the
//       ONE closed union — TOOLS-1) — proven by exact (ordered) equality against the imported array itself.
//   (2) `callTool` carries NO second, independent membership list of its own: every name that is not one of
//       the two special-cased read-tool tokens is forwarded UNFILTERED to `handler.handle` — the SAME handler
//       `advertisedTools` reads schemas from — proven by an off-surface name STILL reaching `handler.handle`
//       (if `callTool` grew its own allowlist/blocklist, that would be a second, independent computation of
//       "is this on the surface", which is exactly the drift REQ-MCP-1e forbids).
//
// Together (1)+(2) close REQ-MCP-1e: the advertised set and the invocable set cannot diverge without an edit
// to `GOVERNANCE_SURFACE` itself — there is nowhere left for "computed separately" to hide.
//
// TEETH (named per assertion below): a mutant that swaps `advertisedTools`' `GOVERNANCE_SURFACE.map(...)` for
// ANY second literal array (same five names, different order; a superset; a subset) flips test 1. A mutant
// that adds an independent allowlist/blocklist inside `callTool` before it forwards to `handler.handle` flips
// test 2 (and, for a name genuinely on `GOVERNANCE_SURFACE`, would also flip test 3 by starving `handler.handle`
// of a call it must receive).

import { describe, it, expect } from "vitest"
import { GOVERNANCE_SURFACE, READ_SURFACE, WRITE_PATHS } from "@atlas/tools"
import type { AnchorsOut, CheckOut, DoctorSource, DraftOut, SlotsOut, Tool, ToolData, Verdict } from "@atlas/tools"
import type { WiredHandler } from "@atlas/adapter-io"
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import type { NodeKey, ToolSchema } from "@atlas/contracts"
import type { MemoryReadSurfaceLegs } from "../src/server-memory-tools.js"
import { advertisedTools, callTool, listTools } from "../src/server.js"
import type { ReadSurfaceLegs } from "../src/server-read-tools.js"

const GUIDANCE = { next: "do-the-next-thing", invariant: "the-governing-invariant" } as const

/** A fake `WiredHandler` that RECORDS every tool name it is asked to handle — the dispatch-provenance probe.
 *  Never the real assembly (same posture as wp-9.4.7-mcp.test.ts's `fakeHandler`). */
const recordingHandler = (): WiredHandler & { seen: string[]; resolved: string[] } => {
  const seen: string[] = []
  const resolved: string[] = []
  return {
    seen,
    resolved,
    handle: (tool: Tool, _args: unknown): Verdict<ToolData> => {
      seen.push(tool)
      return { ok: true, data: { emitted: true, id: "x" } as unknown as ToolData, guidance: GUIDANCE }
    },
    schema: (tool: Tool): ToolSchema => ({
      name: tool,
      description: `desc::${tool}`,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    }),
    // RECORDS the per-node readback the `atlas-node` READ tool routes through (WP-10.A5.MCP wired resolveNode
    // over MCP for the first time — the old stub noted MCP "never routes resolveNode"). Read-only: it carries
    // a nodeKey, NEVER a `Tool` token, so it can never reach a write path.
    resolveNode: (nodeAddr: NodeKey) => {
      resolved.push(String(nodeAddr))
      return { ok: false, rejected: `stub:${nodeAddr}`, guidance: GUIDANCE }
    },
  }
}

/** Fake READ_SURFACE legs — each records nothing itself; the point of the extended guard below is that a read
 *  call reaches THESE (a non-write leg) or the read-only `resolveNode`, and NEVER the write-capable
 *  `handler.handle` with a `WRITE_PATHS` token. Total, structural, no store. */
const fakeReadLegs = (): ReadSurfaceLegs => ({
  anchors: (_path: string): AnchorsOut => ({ rev: "r", units: [], holes: [], reason: "fake-empty" }),
  slots: (): SlotsOut => ({ slots: [] }),
  draft: (fact): DraftOut => ({
    fact: fact as unknown as DraftOut["fact"],
    rev: "r",
    operation: "CREATE",
    route: "auto-accept",
  }),
  check: (_candidate, _at): CheckOut => ({ wouldEmit: true, gates: [] }),
  doctorSource: {
    lineage: () => [],
    drift: () => undefined,
    hotSetSize: () => 0,
    casAudit: () => ({ objects: 0, corrupt: [], unreadable: [], missing: [], orphan: 0, referenced: 0, sound: true }),
    plan: () => undefined,
  } as DoctorSource,
})

/** WP-11.W8 — the fake CAMPAIGN-11 memory READ_SURFACE legs bundle, the SAME shape `fakeReadLegs` above
 *  provides for the pre-existing six. Total, structural, no store. */
const fakeMemoryLegs = (): MemoryReadSurfaceLegs => ({
  memoryRecall: (): readonly MemoryRecord[] => [],
  memoryHeader: (): TurnHeader => ({ awareness: {} as Awareness, orientation: {} as Orientation, rules: [] }),
  memoryAwareness: (): Awareness => ({}) as Awareness,
  memoryOrientation: (): Orientation => ({}) as Orientation,
})

/** The read-onto-write DETECTOR — the exact predicate the extended guard asserts is FALSE for every read
 *  member. `WRITE_PATHS` (@atlas/tools, ADR-0003: `atlas-emit`, `atlas-link`) is the ONE closed write union;
 *  a read leg that reached the write-capable `handler.handle` with a write token would land here. */
const reachesWritePath = (seen: readonly string[]): boolean =>
  seen.some((t) => (WRITE_PATHS as readonly string[]).includes(t))

/** Valid-enough args to ROUTE each read token through `callAuthoringTool` (never a fall-through to `handle`).
 *  `draft`'s slot is rejected at the shared validator — routed, no write, no `leg` call — which is exactly
 *  what the guard needs to observe; correctness of each leg is proven in its own *-mcp.test.ts. */
const READ_ARGS: Record<string, unknown> = {
  "atlas-anchors": { path: "src" },
  "atlas-slots": {},
  "atlas-draft": { anchor: "a", slot: "depends-on", claim: "c" },
  "atlas-check": { fact: {}, at: "r" },
  "atlas-doctor": { sub: "archive" },
  "atlas-node": { node: "x" },
  "atlas-memory-recall": {},
  "atlas-memory-header": {},
  "atlas-memory-awareness": {},
  "atlas-memory-orientation": {},
}

describe("SCN-MCP-1e-1 — advertised and invocable are both traced to the ONE source, never computed separately (REQ-MCP-1e)", () => {
  it("advertisedTools names equal GOVERNANCE_SURFACE byte-for-byte, in order — the single-source oracle", () => {
    // TEETH: a mutant that swaps advertisedTools' GOVERNANCE_SURFACE.map(...) for ANY second literal array —
    // even one holding the same five names in a different order, or a superset/subset — flips this. The only
    // way to pass is to read the array itself, never a transcription of it.
    const handler = recordingHandler()
    const names = advertisedTools(handler).map((t) => t.name)
    expect(names).toEqual([...GOVERNANCE_SURFACE])
  })

  it("callTool forwards every GOVERNANCE_SURFACE name to handler.handle, unfiltered — no second invocable list", () => {
    // TEETH: a mutant that adds an independent allowlist inside callTool (checking `name` against a second
    // hardcoded array before forwarding) either drops a real tool — handler.handle never sees it, this
    // assertion goes RED — or the allowlist and GOVERNANCE_SURFACE silently diverge over time: exactly the
    // "computed separately" failure REQ-MCP-1e names.
    const handler = recordingHandler()
    for (const tool of GOVERNANCE_SURFACE) callTool(handler, tool, {})
    expect(handler.seen).toEqual([...GOVERNANCE_SURFACE])
  })

  it("callTool has NO independent membership gate of its own — an off-surface name still reaches handler.handle", () => {
    // TEETH: this is the structural fact that MAKES single-sourcing possible. If callTool grew its own
    // allowlist/blocklist (a second, independent computation of "is this on the surface"), it could silently
    // drift from GOVERNANCE_SURFACE without this suite noticing. Proving callTool does NOT gate on name is
    // proving there is nowhere left for that drift to hide — surface enforcement lives in exactly ONE place
    // (the handler, via `legs[tool] === undefined` fail-closed).
    const handler = recordingHandler()
    callTool(handler, "atlas-not-a-real-tool", {})
    expect(handler.seen).toEqual(["atlas-not-a-real-tool"])
  })

  it("advertised and invocable are the SAME set — REQ-MCP-1e closed by composition of the two facts above", () => {
    // Fact 1 (advertised === GOVERNANCE_SURFACE) + fact 2 (callTool forwards GOVERNANCE_SURFACE names to
    // handler.handle unfiltered) compose: the two sets cannot diverge without an edit to GOVERNANCE_SURFACE
    // itself. TEETH: reintroducing EITHER a second advertised-name array OR a second invocable allowlist —
    // even one that starts byte-identical to GOVERNANCE_SURFACE today — makes this drift-detectable the
    // moment the two lists are next edited independently, which is what "computed separately" means.
    const handler = recordingHandler()
    const advertised = advertisedTools(handler).map((t) => t.name)
    for (const tool of GOVERNANCE_SURFACE) callTool(handler, tool, {})
    expect(new Set(advertised)).toEqual(new Set(handler.seen))
  })
})

describe("SCN-MCP-1e-2 — every READ_SURFACE member is advertised AND routed to a NON-write leg (WP-10.A5.MCP)", () => {
  // The advertise≡invocable enforcement for the READ surface, which had NO guard before this WP. Two facts,
  // asserted directly against the SAME production `listTools`/`callTool` the entrypoint drives:
  //   (a) ADVERTISED: every `READ_SURFACE` member (@atlas/tools handler.ts — the ONE closed read union) appears
  //       in the advertised list when the read bundle is injected.
  //   (b) ROUTED TO A NON-WRITE LEG: invoking each member reaches its shared read/planner leg or the read-only
  //       `resolveNode`, and NEVER the write-capable `handler.handle` with a `WRITE_PATHS` token — proven by
  //       `reachesWritePath(handler.seen) === false` after the call. A read-onto-write mapping REDs (b).

  it("every READ_SURFACE member is advertised when the read bundle is injected", () => {
    // TEETH: dropping a member from `advertisedAuthoringTools`/`advertisedMemoryTools`, or gating it off,
    // leaves it out of this list — RED. The set is traced to the imported `READ_SURFACE`, never a
    // transcription of the ten names (six pre-existing + WP-11.W8's four memory doors).
    const handler = recordingHandler()
    const advertised = listTools(handler, undefined, undefined, fakeReadLegs(), fakeMemoryLegs()).tools.map(
      (t) => t.name,
    )
    for (const member of READ_SURFACE) expect(advertised).toContain(member)
  })

  it("with NO read bundle the advertised surface is byte-for-byte the closed governance surface (SCN-MCP-1 holds)", () => {
    // The read tools are ADDITIVE — absent when uninjected, so the closed-governance pin is untouched.
    const handler = recordingHandler()
    const advertised = listTools(handler).tools.map((t) => t.name)
    expect(advertised).toEqual([...GOVERNANCE_SURFACE])
  })

  it("each READ_SURFACE member routes to a NON-write leg — reaches no WRITE_PATHS token via handler.handle", () => {
    // TEETH: this is the real "no read leg reaches a write path" enforcement. A mutant that routed any read
    // member to `handler.handle(<a WRITE_PATHS token>)` (a read-onto-write mapping) would push that write token
    // into `handler.seen`, flipping `reachesWritePath` to true — RED. `node` rides the read-only `resolveNode`
    // (recorded separately); the other five ride read/planner legs. In EVERY case `handler.handle` (the only
    // write-capable door) is never asked for a write token.
    for (const member of READ_SURFACE) {
      const handler = recordingHandler()
      const legs = fakeReadLegs()
      const memoryLegs = fakeMemoryLegs()
      callTool(handler, member, READ_ARGS[member], undefined, undefined, legs, memoryLegs)
      // (b1) no write path reached — the core invariant.
      expect(reachesWritePath(handler.seen)).toBe(false)
      // (b2) routed, NOT dropped to a fall-through: a read token never reaches `handler.handle` at all (if it
      //      fell through, `seen` would contain the token). node's readback lands in `resolved` instead.
      expect(handler.seen).not.toContain(member)
    }
    // node specifically REACHED the read-only per-node projection (routed, not silently swallowed).
    const nodeHandler = recordingHandler()
    callTool(nodeHandler, "atlas-node", READ_ARGS["atlas-node"], undefined, undefined, fakeReadLegs())
    expect(nodeHandler.resolved).toEqual(["x"])
  })

  it("the read-onto-write DETECTOR has teeth — a call that DOES reach a write door flips it (the exact RED)", () => {
    // PROVE THE TEETH against the REAL router: a governed WRITE door (`atlas-emit` ∈ WRITE_PATHS) driven through
    // the SAME `callTool` DOES reach `handler.handle`, so `reachesWritePath(handler.seen)` is TRUE. This is the
    // precise condition that would RED the per-member assertion above IF any read member were wired onto a write
    // path — same predicate, same code path, demonstrated firing.
    const handler = recordingHandler()
    callTool(handler, "atlas-emit", { node: {}, at: "r" }, undefined, undefined, fakeReadLegs())
    expect(reachesWritePath(handler.seen)).toBe(true) // ← the line a read-onto-write mapping would trip
  })
})

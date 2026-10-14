// @atlas/tools — src/transport.ts   (WP-7.26-c.TOOLS — TOOLS-11 / TOOLS-11a / TOOLS-14, INV-TOOLS-11 / -11a)
//
// The push/pull SPAWN LADDER + the frozen transport surface (`TransportApi` / `PullTier` / `Resolution` / …).
// PUSH reaches a `Read`-only seat with NO grant (`PUSH_GRANTS_REQUIRED == 0`); PULL walks the native-first
// `PULL_LADDER` (CLI is the FLOOR), every tier backed by the ONE injected `handler` (byte-identical, TOOLS-10).
//
// ── REFERENCE MODEL — TYPES LIVE, CODE INERT ─────────────────────────────────────────────────────────
// Read this one carefully, because the two halves of this module have DIFFERENT status.
//
//   The TYPES are shipped surface. `PhasePushSource` is imported — as a type — by
//   `packages/adapter-io/src/poke-file.ts`. Deleting this file would break a real seam.
//
//   The VALUES are not. Nothing in `packages/*/src` calls `createTransport`, and nothing reads
//   `PULL_LADDER` / `PUSH_TIER` / `PUSH_GRANTS_REQUIRED`. Verified by probe, not by grep: a stderr write
//   at the top of `createTransport`, rebuilt, driven through 249 real CLI / MCP subprocess runs — the only
//   hits were this file's own compile-time witness (`_transportConforms`, bottom).
//
// The transports the product actually serves are `packages/cli/src/cli.ts` and
// `packages/mcp-server/src/server.ts`; both reach the one handler directly. This module is the executable
// STATEMENT of the TOOLS-11 ladder, not the thing that runs it — so a green suite here says the ladder's
// contract is coherent, not that any tier was exercised.
//
// Declared `types: true` in the ledger at `harness/gates/reference-model-guard.mjs`; that flag is what
// stops a future cleanup from reading "no callers" and deleting a live type seam.

import type { NodeKey, Pack } from "@atlas/contracts"
import type { Poke } from "@atlas/retrieval"
import type { HandlerApi, Transport, Verdict } from "./types.js"

/** The delivery direction (TOOLS-11). `push` = orchestrator-driven, no grant; `pull` = ad-hoc seat query. */
export type Direction = "push" | "pull"

/** A seat's ad-hoc pull need (TOOLS-11). No `need` record is frozen in a lower layer at this seam, so it
 *  is DEFINED minimally here: the `scope` the mid-task query resolves through the ladder (the same scope
 *  `atlas-query`/`own_<unit>` takes). Kept minimal — a later spec MAY widen it; never invented beyond the
 *  scope the reference names. */
export interface PullNeed {
  readonly scope: string
}

/** The pull ladder, native-first (atlas-tools:161-168 / method-tags-tls:92). Transcribed EXACTLY as the
 *  ordered tier vocabulary — `sdk-mcp` (pull 1) → `registered-mcp` (pull 2) → `poke-as-file` (pull 3) →
 *  `relay` (pull 4) → `cli` (pull 5, the floor). */
export type PullTier =
  | "sdk-mcp" // pull 1 — in-process SDK MCP (zero-IPC, shared live state); native ONLY on the SDK path
  | "registered-mcp" // pull 2 — registered MCP + per-seat grant; native ONLY on the SDK path
  | "poke-as-file" // pull 3 — poke-as-file / brief-injection; `Read` only, trivially true
  | "relay" // pull 4 — orchestrator relay (proxies the native call); proven
  | "cli" // pull 5 — CLI (`atlas node <addr>`); the floor

/** Per-tier availability on a running harness (TOOLS-11a). `native` iff the harness can deliver that tier;
 *  a harness that cannot propagate MCP marks pull 1-2 `unavailable` (never silently fallen through). */
export type TierStatus = "native" | "unavailable"

/** The harness capability the ladder is honest about (TOOLS-11a, method-tags-tls:100). `canPropagateMcp`
 *  false (e.g. the Claude Code `.claude/agents` path — a reproduced defect) ⇒ pull 1-2 `unavailable`. */
export interface HarnessCapability {
  readonly canPropagateMcp: boolean
}

/** The resolved delivery (TOOLS-11/11a). `startedTier` is the tier the ladder ACTUALLY started on for the
 *  running harness (honesty about where native reach begins — never a fixed assumption). `tiers` is the
 *  per-tier availability ledger (down-ranked per `HarnessCapability`). */
export interface Resolution {
  readonly direction: Direction
  readonly startedTier: PullTier // the tier actually started on (TOOLS-11a) — reported, not assumed
  readonly tiers: readonly { readonly tier: PullTier; readonly status: TierStatus }[]
}

export interface TransportApi {
  /** Split by direction and resolve reach for a seat's need (TOOLS-11). PUSH materializes a file/brief a
   *  `Read`-only seat consumes with NO grant; PULL walks the native-first ladder returning the first
   *  AVAILABLE tier. On a harness with `canPropagateMcp:false`, pull 1-2 are `unavailable` and the ladder
   *  starts at push / pull 3 — never a silent fall-through (TOOLS-11a). Every tier is the one handler, so
   *  the result is byte-identical across tiers (method-tags-tls:93, 100).
   *
   *  [PINNED — `seat` / `need` shapes] no `MemberId` record is frozen at this seam (@atlas/memory is NOT
   *  a dep of tools), so `seat` is pinned to `string`. `need` is the minimal package-local `PullNeed`
   *  (`{scope}`) — the scope the ad-hoc pull resolves through the ladder; NOT invented beyond that. */
  resolve(seat: string, need: PullNeed, harness: HarnessCapability): Resolution

  /** The TOOLS-14 pre-phase discovery hook: at EVERY phase boundary auto-inject a fresh `atlas-query` /
   *  `own_<unit>` pack into the seat's context — a PUSH (no tool grant), so a `Read`-only seat on an
   *  MCP-`unavailable` harness is still correctly re-grounded purely by push (method-tags-tls:120-121).
   *  Ad-hoc mid-task pull stays available but is an optimization, never the mechanism.
   *
   *  [PINNED — return] the pushed surface is a fresh pack / poke (`Pack` | `Poke`, both imported); `scope`
   *  pinned to `string` (cf retrieval `Path = string`). */
  prePhasePush(seat: string, scope: string): Pack | Poke
}

/** The pull ladder, native-first (TOOLS-11) — the fixed ordered tier vocabulary. Transcribed EXACTLY from
 *  the co-located `PullTier`: SDK-MCP → registered-MCP+grant → poke-as-file → relay → CLI (floor). */
export const PULL_LADDER: readonly PullTier[] = [
  "sdk-mcp", // pull 1 — in-process SDK MCP (native ONLY on the SDK path)
  "registered-mcp", // pull 2 — registered MCP + per-seat grant (native ONLY on the SDK path)
  "poke-as-file", // pull 3 — poke-as-file / brief-injection; the PUSH tier, `Read`-only, trivially true
  "relay", // pull 4 — orchestrator relay (proxies the native call)
  "cli", // pull 5 — CLI (`atlas node <addr>`); the FLOOR
]

/** The MCP-propagation tiers (pull 1-2) — native ONLY where the harness can propagate MCP (TOOLS-11a). */
const MCP_TIERS: readonly PullTier[] = ["sdk-mcp", "registered-mcp"]

/** The PUSH tier — poke-as-file / brief-injection, reached with NO tool grant (the orchestrator's job). It
 *  is the tier a Read-only seat starts on when native pull is unavailable (TOOLS-11 / TOOLS-11a). */
export const PUSH_TIER: PullTier = "poke-as-file"

/** Push reaches a seat with ZERO tool grant (TOOLS-11-b) — push is delivered by injection, never a grant. */
export const PUSH_GRANTS_REQUIRED = 0

/** How each pull tier maps to the node handler's transport (TOOLS-10). The pull-tier vocabulary is a delivery
 *  refinement of the three node transports: SDK/registered/relay ride `mcp`, poke-as-file rides `poke`, CLI
 *  rides `cli`. Every mapping lands on the ONE handler, so tier choice never changes the resolved contract. */
const TIER_TRANSPORT: Record<PullTier, Transport> = {
  "sdk-mcp": "mcp",
  "registered-mcp": "mcp",
  "poke-as-file": "poke",
  relay: "mcp",
  cli: "cli",
}

/** The source that materializes the phase-boundary PUSH surface (TOOLS-14) — a fresh pack / poke the seat
 *  consumes by `Read` with no grant. @atlas/tools CONSUMES this port; the concrete pack assembly is the
 *  @atlas/retrieval `own_<unit>` / `atlas-query` axis, injected here, never computed in this facet. */
export type PhasePushSource = (seat: string, scope: string) => Pack | Poke

/** A seat spawned on the native tier-1 SDK in-process path (TOOLS-11a-a). `transport` is pinned to the
 *  `create_sdk_mcp_server` in-process contract (never a registered external MCP server); `allowedTools` is
 *  the per-seat grant. Read/subscribe only — spawning opens NO write path. */
export interface SpawnSeat {
  readonly seat: string
  readonly transport: "sdk-in-process" // create_sdk_mcp_server in-process — the native tier-1 spawn contract
  readonly allowedTools: readonly string[] // the per-seat `allowed_tools` grant
}

/** The spawn ladder — the frozen `TransportApi` PLUS the tier-backed one-handler bridge (`resolveAt`) and
 *  the native tier-1 SDK spawn (`spawn`). Extends, never forks, the frozen contract. */
export interface SpawnLadder extends TransportApi {
  /** Resolve a node at a specific pull tier through the ONE handler (TOOLS-11-d). Maps the tier to its
   *  transport and delegates to `handler.resolveNode`, so any two tiers return a byte-identical `Verdict`. */
  resolveAt(nodeAddr: NodeKey, tier: PullTier): Verdict
  /** Spawn a governed seat on the native tier-1 SDK in-process path with a per-seat grant (TOOLS-11a-a). */
  spawn(seat: string, allowedTools: readonly string[]): SpawnSeat
}

/** The injected dependencies: the ONE handler every tier is backed by, and the phase-boundary push source. */
export interface TransportDeps {
  readonly handler: HandlerApi // the single node oracle behind every tier (TOOLS-10 / TOOLS-11-d)
  readonly push: PhasePushSource // the phase-boundary PUSH materializer (TOOLS-14)
}

/** Is this tier natively reachable on the given harness? A tier that needs MCP propagation (pull 1-2) is
 *  `unavailable` on a harness that cannot propagate MCP (TOOLS-11a); every other tier is `native`. */
const tierStatus = (tier: PullTier, harness: HarnessCapability): TierStatus =>
  !harness.canPropagateMcp && MCP_TIERS.includes(tier) ? "unavailable" : "native"

/**
 * Build the push/pull spawn ladder over the injected `handler` + `push` source. The returned object conforms
 * EXACTLY to the frozen `TransportApi` (resolve / prePhasePush) and adds the tier↔handler bridge + SDK spawn.
 * Pure + total: no clock, no IO, no store mutation — it decides ROUTING only; every actual node read lands on
 * the one handler.
 */
export function createTransport(deps: TransportDeps): SpawnLadder {
  const { handler, push } = deps

  const resolve = (_seat: string, _need: PullNeed, harness: HarnessCapability): Resolution => {
    // The per-tier availability ledger — EVERY ladder tier is present (never silently dropped, TOOLS-11a-c);
    // a down-ranked native tier is surfaced as `unavailable`, not omitted.
    const tiers = PULL_LADDER.map((tier) => ({ tier, status: tierStatus(tier, harness) }))
    // native-first: the first AVAILABLE tier is the one the ladder actually starts on (reported, TOOLS-11a-d).
    const startedTier = (tiers.find((t) => t.status === "native") ?? tiers[tiers.length - 1]!).tier
    // the push tier (poke-as-file) is the orchestrator's PUSH; every other start is a seat-side PULL.
    const direction: Direction = startedTier === PUSH_TIER ? "push" : "pull"
    return { direction, startedTier, tiers }
  }

  const prePhasePush = (seat: string, scope: string): Pack | Poke => push(seat, scope)

  const resolveAt = (nodeAddr: NodeKey, tier: PullTier): Verdict => handler.resolveNode(nodeAddr, TIER_TRANSPORT[tier])

  const spawn = (seat: string, allowedTools: readonly string[]): SpawnSeat => ({
    seat,
    transport: "sdk-in-process", // the native tier-1 contract (create_sdk_mcp_server in-process)
    allowedTools,
  })

  return { resolve, prePhasePush, resolveAt, spawn }
}

// differential-vs-oracle (compile-time): the ladder conforms to the co-located frozen `TransportApi`.
const _transportConforms: TransportApi = createTransport({
  handler: createHandlerStub(),
  push: () => ({ scope: "", pack: emptyPack, notice: "" }),
})
void _transportConforms

/** A minimal type-level handler stub for the compile-time conformance witness only (never exported). */
function createHandlerStub(): HandlerApi {
  return {
    handle: () => ({ ok: false, guidance: { next: ".", invariant: "." } }),
    resolveNode: () => ({ ok: false, guidance: { next: ".", invariant: "." } }),
    schema: (tool) => ({ name: tool, description: "", inputSchema: {} }),
  }
}

const emptyPack: Pack = {
  territory: "",
  axisHash: "" as Pack["axisHash"],
  invariants: [],
  // ADR-0013 — both bands are EMPTY here, and `advisoryDropped: 0` says so honestly: nothing was truncated,
  // as opposed to "nothing was looked at". An empty pack is the stub's whole point.
  advisory: [],
  advisoryDropped: 0,
  tokenEstimate: 0,
  stale: false,
}

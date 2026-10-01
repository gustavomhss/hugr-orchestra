// @atlas/mcp-server — src/server-read-tools.ts  (WP-10.A5.MCP — the READ_SURFACE tools over the stdio transport)
//
// Bring the six authoring `READ_SURFACE` doors (ADR-0005: `anchors`, `slots`, `draft`, `check`, `doctor`,
// `node` — the pre-existing six; the four memory doors live in server-memory-tools.ts) onto the stdio MCP
// transport, ADVERTISED and ROUTED, so an MCP agent seat has the same authoring surface the CLI
// has. Each tool follows the shipped `atlas-relations` template (server.ts): a per-tool name const, a
// HAND-WRITTEN `*_INPUT_SCHEMA` (the read tools have NO `Tool` token, so `handler.schema` cannot own their
// schema — the schema is DOCUMENTED here, the one place it lives), advertised when its leg is composed, and
// routed in `callTool` DIRECTLY to the SHARED verdict builder (`@atlas/adapter-io`) both transports drive — so
// identical input yields a byte-identical `Verdict` on CLI and MCP. NONE opens a governed token or a write
// path: `GOVERNANCE_SURFACE` stays byte-for-byte closed at six, `WRITE_PATHS` untouched.
//
// The advertise≡invocable enforcement for this surface is the EXTENDED conformance test
// (`test/surface-conformance-req-mcp-1e.test.ts`): every `READ_SURFACE` member must be BOTH advertised AND
// routed to a NON-write leg — a read-onto-write mapping REDs it. That test is the teeth; this module is the wire.

import type { CallToolResult, Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js"
import type { WiredHandler } from "@atlas/adapter-io"
import { anchorsVerdict, slotsVerdict, draftVerdict, checkVerdict, doctorVerdict } from "@atlas/adapter-io"
import type { AnchorsApi, CheckApi, DoctorSource, DraftApi, SlotsApi, Verdict } from "@atlas/tools"

/** The composition-root READ_SURFACE legs the MCP entrypoint injects — each already exposed on
 *  `ComposedRuntime` (compose.ts), passed here, never rebuilt. `node` is served by the ONE wired handler's
 *  `resolveNode` (already a total `Verdict`), so it needs no leg here — only the handler, always present. */
export interface ReadSurfaceLegs {
  readonly anchors: AnchorsApi["anchors"]
  readonly slots: SlotsApi["slots"]
  readonly draft: DraftApi["draft"]
  readonly check: CheckApi["check"]
  readonly doctorSource: DoctorSource
}

// ── the six tool tokens (EQUAL to the `READ_SURFACE` members, @atlas/tools handler.ts) ──────────────────
export const ANCHORS_TOOL = "atlas-anchors"
export const SLOTS_TOOL = "atlas-slots"
export const DRAFT_TOOL = "atlas-draft"
export const CHECK_TOOL = "atlas-check"
export const DOCTOR_TOOL = "atlas-doctor"
export const NODE_TOOL = "atlas-node"

// ── hand-written input schemas (documented here — the read tools have no `Tool` token; #166 posture:
//    `required` fires CLOSED at the shared verdict body, `additionalProperties:false` is advertised not
//    machine-enforced; every arg is coerced totally, the tools are strictly read-only) ──────────────────

export const ANCHORS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    path: { type: "string", description: "the tree path whose groundable units to list" },
  },
  required: ["path"],
  additionalProperties: false,
} as const

export const SLOTS_INPUT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

export const DRAFT_INPUT_SCHEMA = {
  type: "object",
  properties: {
    anchor: { type: "string", description: "the groundable unit to cite (see `atlas anchors <path>`)" },
    slot: { type: "string", description: "the predicate slot — a member of the closed vocabulary (see `atlas slots`)" },
    claim: { type: "string", description: "the claim body to draft" },
  },
  required: ["anchor", "slot", "claim"],
  additionalProperties: false,
} as const

export const CHECK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    fact: {
      type: "object",
      description: "the candidate GroundedFact to dry-run through the emit gate chain (compose one with `atlas draft`)",
    },
    at: { type: "string", description: "the rev the candidate was drafted against (the draft's own `rev`)" },
  },
  required: ["fact", "at"],
  additionalProperties: false,
} as const

export const DOCTOR_INPUT_SCHEMA = {
  type: "object",
  properties: {
    sub: {
      type: "string",
      enum: ["archive", "why", "hotset", "reground", "cas"],
      description:
        "the read/advisory doctor leg (index is CLI-only — it reads the file tree + SCIP dump, not the durable store)",
    },
    arg: {
      type: "string",
      description:
        "the leg argument — a scope (archive), a fact (why/reground) or a numeric budget (hotset). `cas` takes none: its subject is the whole store.",
    },
  },
  required: ["sub"],
  additionalProperties: false,
} as const

export const NODE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    node: { type: "string", description: "the content address (nodeKey) of the grounded node to read back" },
  },
  required: ["node"],
  additionalProperties: false,
} as const

/** Advertise the six READ_SURFACE tools beside the governance surface — each when its leg is injected; `node`
 *  is served by the always-present handler, so it is advertised whenever the read bundle is composed. Order
 *  fixed to the `READ_SURFACE` order (anchors, slots, draft, check, doctor, node) so the list is deterministic. */
export function advertisedAuthoringTools(legs?: ReadSurfaceLegs): SdkTool[] {
  if (legs === undefined) return []
  return [
    {
      name: ANCHORS_TOOL,
      description:
        "List the GROUNDABLE units the built index carries under a tree path (each with qualifiedPath, kind, subtreeHash) + declared language holes + the rev (AUTHOR-3/4). Read-only; persists nothing; opens no governed surface.",
      inputSchema: ANCHORS_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: SLOTS_TOOL,
      description:
        "Return EXACTLY the members of the closed PredicateSlot vocabulary, each with its meaning (AUTHOR-5). Read-only; no input; opens no governed surface.",
      inputSchema: SLOTS_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: DRAFT_TOOL,
      description:
        "Compose a candidate GroundedFact from anchor + slot + claim (id/grounding/rev ALWAYS computed) — the payload the governed emit door will accept (AUTHOR-6/7). Read-only; persists nothing; opens no governed surface.",
      inputSchema: DRAFT_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: CHECK_TOOL,
      description:
        "DRY-RUN the governed emit door's WHOLE gate chain over a candidate GroundedFact at a rev, WITHOUT any write — wouldEmit + the first-refusing gate (AUTHOR-11/12). Read-only; opens no write path.",
      inputSchema: CHECK_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: DOCTOR_TOOL,
      description:
        "Read/advisory diagnosis over the durable store — archive lineage, why-broken drift, hot-set budget, reground PROPOSAL (TOOLS-12), and the CAS integrity audit (ADR-0022: do the bytes still hash to their addresses). Read-only; reground persists nothing (run it through atlas-emit). index is CLI-only.",
      inputSchema: DOCTOR_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: NODE_TOOL,
      description:
        "Read back the whole GROUNDED fact at a content address (nodeKey) through the ONE wired handler's resolveNode (TOOLS-10). Read-only; opens no write path.",
      inputSchema: NODE_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
  ]
}

/**
 * Route a READ_SURFACE CallTool DIRECTLY to its SHARED verdict builder — the SAME body the CLI drives, so
 * identical input yields a byte-identical `Verdict` on both transports. Returns the `Verdict` for the caller
 * to map (`verdictToResult`), or `undefined` when `name` is not a READ_SURFACE token (fall through to the
 * governed handler). TOTAL: every arg is coerced totally, and each shared builder is total (a missing/malformed
 * arg fails CLOSED to `ok:false`, never a throw). NONE reaches a write path — `node` rides the handler's
 * read-only `resolveNode`; the other five ride read/planner legs that persist nothing.
 */
export function callAuthoringTool(
  handler: WiredHandler,
  legs: ReadSurfaceLegs | undefined,
  name: string,
  args: unknown,
): Verdict | undefined {
  // `node` is served by the ONE wired handler's `resolveNode` — a total, read-only per-node projection
  // (TOOLS-10), routed here so MCP reaches the same readback the CLI does. It needs no injected leg (only the
  // handler, always present), so it is routed whenever the read surface is advertised.
  if (legs !== undefined && name === NODE_TOOL) {
    const a = obj(args)
    const addr = typeof a.node === "string" ? a.node : ""
    return handler.resolveNode(addr as Parameters<WiredHandler["resolveNode"]>[0], "mcp")
  }
  if (legs === undefined) return undefined
  switch (name) {
    case ANCHORS_TOOL: {
      const a = obj(args)
      return anchorsVerdict(legs.anchors, typeof a.path === "string" ? a.path : "")
    }
    case SLOTS_TOOL:
      return slotsVerdict(legs.slots)
    case DRAFT_TOOL: {
      const a = obj(args)
      return draftVerdict(
        legs.draft,
        legs.slots,
        typeof a.anchor === "string" ? a.anchor : "",
        typeof a.slot === "string" ? a.slot : "",
        typeof a.claim === "string" ? a.claim : "",
      )
    }
    case CHECK_TOOL: {
      const a = obj(args)
      return checkVerdict(legs.check, a.fact, a.at)
    }
    case DOCTOR_TOOL: {
      const a = obj(args)
      const sub = typeof a.sub === "string" ? a.sub : ""
      const arg = typeof a.arg === "string" ? a.arg : undefined
      return doctorVerdict(legs.doctorSource, sub, arg)
    }
    default:
      return undefined
  }
}

/** Coerce an unknown CallTool `arguments` to an indexable record — a non-object coerces to `{}` (TOTAL, no
 *  throw), then each shared verdict builder enforces its own `required` fields fail-closed. */
function obj(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {}
}

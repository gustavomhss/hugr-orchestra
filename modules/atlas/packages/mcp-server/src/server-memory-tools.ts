// @atlas/mcp-server — src/server-memory-tools.ts  (WP-11.W8 — the memory READ_SURFACE tools over stdio)
//
// Bring the four CAMPAIGN-11 memory read doors (ADR-0005: `atlas-memory-recall` / `atlas-memory-header` /
// `atlas-memory-awareness` / `atlas-memory-orientation`) onto the stdio MCP transport, ADVERTISED and
// ROUTED — the SAME `server-read-tools.ts` template: a per-tool name const, a HAND-WRITTEN `*_INPUT_SCHEMA`
// (these read tools have NO `Tool` token, so `handler.schema` cannot own their schema), advertised when its
// leg is composed, and routed in `callTool` DIRECTLY to the SHARED verdict builder (`@atlas/adapter-io`)
// both transports drive — so identical input yields a byte-identical `Verdict` on CLI and MCP. NONE opens a
// governed token or a write path: the write half (`atlas-memory-emit`) is a `GOVERNANCE_SURFACE` member
// instead (advertised generically by `advertisedTools`, server.ts — no code here for it).
//
// The advertise≡invocable enforcement for `READ_SURFACE` is `layer-guard.mjs`'s `boundReadDoor` (kind (b):
// each memory read token is bound in `cli/src/map.ts`'s `COMMAND_LEG` onto the bound `atlas-query` leg).

import type { Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js"
import {
  memoryRecallVerdict,
  memoryHeaderVerdict,
  memoryAwarenessVerdict,
  memoryOrientationVerdict,
} from "@atlas/adapter-io"
import type { Awareness, MemoryRecord, Orientation, TurnHeader } from "@atlas/memory"
import type { Verdict } from "@atlas/tools"

/** The composition-root memory READ_SURFACE legs the MCP entrypoint injects — each already exposed on
 *  `ComposedRuntime` (compose.ts), passed here, never rebuilt. */
export interface MemoryReadSurfaceLegs {
  readonly memoryRecall: (query: unknown) => readonly MemoryRecord[]
  readonly memoryHeader: () => TurnHeader
  readonly memoryAwareness: () => Awareness
  readonly memoryOrientation: () => Orientation
}

// ── the tool tokens (EQUAL to the memory `READ_SURFACE` members, @atlas/tools handler.ts) ─────────────────
export const MEMORY_RECALL_TOOL = "atlas-memory-recall"
export const MEMORY_HEADER_TOOL = "atlas-memory-header"
export const MEMORY_AWARENESS_TOOL = "atlas-memory-awareness"
export const MEMORY_ORIENTATION_TOOL = "atlas-memory-orientation"

// ── hand-written input schemas (documented here — these read tools have no `Tool` token; #166 posture:
//    `required` fires CLOSED at the shared verdict body, `additionalProperties:false` is advertised not
//    machine-enforced; every arg is coerced totally, the tools are strictly read-only) ──────────────────

export const MEMORY_RECALL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    owner: { type: "string", description: "filter to one seat's own records (MemberId)" },
    kind: { type: "string", enum: ["task", "pr", "project", "logbook"], description: "filter to one memory kind" },
    taskId: { type: "string", description: "filter task memory to one taskId" },
    prId: { type: "string", description: "filter pr/logbook memory to one prId" },
  },
  additionalProperties: false,
} as const

export const MEMORY_HEADER_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const
export const MEMORY_AWARENESS_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const
export const MEMORY_ORIENTATION_INPUT_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const

/** Advertise the four memory READ_SURFACE tools beside the governance surface — each when its leg bundle
 *  is injected. Order fixed to the `READ_SURFACE` order (recall, header, awareness, orientation). */
export function advertisedMemoryTools(legs?: MemoryReadSurfaceLegs): SdkTool[] {
  if (legs === undefined) return []
  return [
    {
      name: MEMORY_RECALL_TOOL,
      description:
        "MEM-4b — the ONE explicit-consult path to task/pr/logbook memory. An unqualified query answers the empty set (recall is never free). Read-only; opens no governed surface.",
      inputSchema: MEMORY_RECALL_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: MEMORY_HEADER_TOOL,
      description:
        "MEM-1/4/7 — the composed actor's running-turn header: awareness + orientation pass through, rules is the seat's OWN top project entries by effective frecency. Read-only; no input; opens no governed surface.",
      inputSchema: MEMORY_HEADER_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: MEMORY_AWARENESS_TOOL,
      description:
        "MEM-11/12 — the SHARED, byte-identical Awareness slab, assembled fresh from the real Atlas root. Read-only; no input; opens no governed surface.",
      inputSchema: MEMORY_AWARENESS_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
    {
      name: MEMORY_ORIENTATION_TOOL,
      description:
        "MEM-6 — the DERIVED, SHARED, byte-identical Orientation slab, folded from the tracked orientation log. Read-only; no input; opens no governed surface.",
      inputSchema: MEMORY_ORIENTATION_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    },
  ]
}

/**
 * Route a memory READ_SURFACE CallTool DIRECTLY to its SHARED verdict builder — the SAME body the CLI
 * drives, so identical input yields a byte-identical `Verdict` on both transports. Returns the `Verdict`
 * for the caller to map, or `undefined` when `name` is not one of these four tokens. TOTAL: every arg is
 * coerced totally; each shared builder is total.
 */
export function callMemoryTool(
  legs: MemoryReadSurfaceLegs | undefined,
  name: string,
  args: unknown,
): Verdict | undefined {
  if (legs === undefined) return undefined
  switch (name) {
    case MEMORY_RECALL_TOOL: {
      const a = obj(args)
      const query: Record<string, string> = {}
      if (typeof a["owner"] === "string") query["owner"] = a["owner"]
      if (typeof a["kind"] === "string") query["kind"] = a["kind"]
      if (typeof a["taskId"] === "string") query["taskId"] = a["taskId"]
      if (typeof a["prId"] === "string") query["prId"] = a["prId"]
      return memoryRecallVerdict(legs.memoryRecall, query)
    }
    case MEMORY_HEADER_TOOL:
      return memoryHeaderVerdict(legs.memoryHeader)
    case MEMORY_AWARENESS_TOOL:
      return memoryAwarenessVerdict(legs.memoryAwareness)
    case MEMORY_ORIENTATION_TOOL:
      return memoryOrientationVerdict(legs.memoryOrientation)
    default:
      return undefined
  }
}

/** Coerce an unknown CallTool `arguments` to an indexable record — a non-object coerces to `{}` (TOTAL, no
 *  throw). Mirrors `server-read-tools.ts`'s own `obj`. */
function obj(args: unknown): Record<string, unknown> {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : {}
}

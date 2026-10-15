// @atlas/mcp-server — src/server.ts  (MCP-1/2: the stdio MCP server over the one wired handler)
//
// Stand up a stdio MCP server whose every GOVERNED tool call routes through the one wired handler
// (@atlas/adapter-io), returning the frozen `Verdict` (@atlas/tools) shape. The advertised surface is
// `GOVERNANCE_SURFACE` (six members — ADR-0006 Decision 2: DERIVED and BUDGETED, not a fixed count, TOOLS-1)
// PLUS injected READ legs. Three families of read leg are advertised, each served DIRECTLY from its injected
// leg and never through `handler.handle` (so each opens NO governed token, no write path):
//   • the pre-existing pair `atlas-relations` (#99a / ADR-0015 D2) + `atlas-negations` (#99b / ADR-0015 D3),
//     via `advertisedReadTools(relations, negations)`;
//   • the authoring bundle — the pre-existing six planner/read doors `atlas-anchors|slots|draft|check|doctor|
//     node` (WP-10.A5.TOOLS/A5.MCP) — via `advertisedAuthoringTools`/`callAuthoringTool` (server-read-tools.ts),
//     threaded as `readLegs`;
//   • the CAMPAIGN-11 memory bundle — the four memory `READ_SURFACE` doors `atlas-memory-recall|header|
//     awareness|orientation` (WP-11.W8) — via `advertisedMemoryTools`/`callMemoryTool` (server-memory-tools.ts),
//     threaded as `memoryLegs`. The write half, `atlas-memory-emit`, is a `GOVERNANCE_SURFACE` member and needs
//     NO special-case code here — `advertisedTools(handler)` picks it up generically the moment the
//     composition root wires `WireConfig.memoryEmit`.
// With all legs composed production advertises EIGHTEEN tools (6 governance + 2 relations/negations + 6
// authoring + 4 memory reads — well inside ARCH-7's budget of 30). `READ_SURFACE` now carries TEN members
// (`@atlas/tools`, WP-10.A5.TOOLS + WP-11.W8) and the layer-guard's `GOVERNANCE_SURFACE ∪ READ_SURFACE`
// partition (ADR-0006) is covered; `SCN-MCP-1e-2` pins that every READ_SURFACE member is advertised AND
// routes to a non-write leg. When NO read bundle is injected the advertised surface is byte-for-byte the
// closed governance surface (SCN-MCP-1 holds).
//
// PARITY — precisely which one holds. SCHEMA + VERDICT parity HOLDS: `inputSchema`/`description` are read
// from `handler.schema(tool)` verbatim and every call routes through the ONE wired handler, so identical
// input yields a byte-identical `Verdict` on CLI and MCP (TOOLS-3). SURFACE parity does NOT hold: the CLI
// command surface (`@atlas/cli` `COMMANDS` — the oracle; a count transcribed here would be a second one, and
// this line carried a stale "NINE" for exactly that reason) includes `mine`, `promote` and `own`, none of
// which are in `GOVERNANCE_SURFACE` OR `READ_SURFACE`, so those three are CLI-only and unreachable over MCP.
// `doctor` and `node` ARE reachable over MCP today — they ride the READ surface as the `atlas-doctor` /
// `atlas-node` projections (server-read-tools.ts), NOT CLI-only.
// `promote` is the one worth stating explicitly, because it WRITES: the KNOW-8 curator door publishes through
// `atlas-emit` (ADR-0008 — an ordinary use of the existing door, not new surface), so no tool token exists
// for it and an MCP client cannot promote staged candidates. `own` is the newest, and it READS: the RETR-12
// briefing is a second projection of the query readback over the same store, so an MCP client that wants it
// composes it from `atlas-query` — it, too, adds no tool token. Do not read "CLI ≡ MCP" below as a
// claim that the two transports reach the same set of operations — it is a claim about the schema bytes.
// A CallTool routes through
// `handler.handle(tool, args)` and maps the total `Verdict` → `CallToolResult`: a rejected (fail-closed)
// verdict is rendered as an `isError` result whose text CARRIES `rejected` + `guidance` (never an empty
// error — the known past bug). Pure + total: no clock, no random, and the transport never throws to the SDK.

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { CallToolResult, ListToolsResult, Tool as SdkTool } from "@modelcontextprotocol/sdk/types.js"
import type { NegationLeg, RelationLeg, WiredHandler } from "@atlas/adapter-io"
import { negationsVerdict, relationsVerdict } from "@atlas/adapter-io"
import { faultOf, GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, Verdict } from "@atlas/tools"
import type { ReadSurfaceLegs } from "./server-read-tools.js"
import { advertisedAuthoringTools, callAuthoringTool } from "./server-read-tools.js"
import type { MemoryReadSurfaceLegs } from "./server-memory-tools.js"
import { advertisedMemoryTools, callMemoryTool } from "./server-memory-tools.js"

/** The stdio MCP server handle (frozen ring shape — `start()` connects the SDK stdio transport). */
export interface McpServer {
  start(): Promise<void>
}

/** The frozen verdict shape every tool call returns over the transport (referenced to pin the edge). */
type _Verdict = Verdict

/** This server's advertised identity (constant — no clock/random in the mapping). */
const SERVER_INFO = { name: "@atlas/mcp-server", version: "0.0.0" } as const

/**
 * The advertised tool list (ListTools) — the `GOVERNANCE_SURFACE` slice: the six governance tools (TOOLS-1,
 * ADR-0006 Decision 2: DERIVED and BUDGETED, not a fixed count), mapped verbatim from `handler.schema`. The
 * full ListTools surface is those SIX UNIONED with the disjoint read surface (relations/negations + the
 * READ_SURFACE authoring/memory doors — see `listTools` below); this function maps only the governance slice.
 * The MCP tool `name` is
 * the `Tool` string; `description` + `inputSchema` are read from
 * `handler.schema(tool)` (the handler owns the published schema — CLI ≡ MCP in SCHEMA and VERDICT bytes,
 * TOOLS-3; NOT in exposed surface — see the file header for the three CLI-only commands). The
 * `inputSchema` is a JSON-Schema object structurally (`{type:'object',…}`), narrowed to the SDK's schema
 * shape at the transport boundary — the bytes are the handler's, unaltered.
 */
export function advertisedTools(handler: WiredHandler): SdkTool[] {
  return GOVERNANCE_SURFACE.map((tool): SdkTool => {
    const s = handler.schema(tool)
    return {
      name: tool,
      description: s.description,
      inputSchema: s.inputSchema as SdkTool["inputSchema"],
    }
  })
}

/**
 * The `atlas relations` MCP tool (#99a). It is a READ tool served DIRECTLY from an injected `RelationLeg`,
 * NOT through `GOVERNANCE_SURFACE` — so `GOVERNANCE_SURFACE` stays its six and the closed-surface pin is untouched.
 * This is the honest mirror of the CLI, where `relations` (like `node`/`own`) is intercepted BEFORE the
 * handler: it opens no governed surface and has no `Tool` token, so `handler.schema` cannot own its schema.
 * The schema is therefore DOCUMENTED here and advertised verbatim — the one place it lives.
 */
export const RELATIONS_TOOL = "atlas-relations"

/**
 * The DOCUMENTED input schema for `atlas-relations` (JSON-Schema). `unit` is the required nodeKey the
 * relations touch; `direction` is optional (`out` = the unit is the SUBJECT, `in` = the OBJECT, `both` = the
 * union; default `both`).
 *
 * WHAT IS ENFORCED, stated honestly (the schema is advertised to clients, but the transport does not run a
 * JSON-Schema validator): `required:['unit']` IS enforced — a missing/non-string `unit` fails CLOSED at the
 * shared `relationsVerdict` body (isError), so the required-unit contract holds identically on CLI and MCP.
 * `additionalProperties:false` is ADVERTISED but not machine-enforced here — an extra key is ignored, not
 * rejected. That matches the wider MCP schema-enforcement limitation this repo already tracks (task #166);
 * it is a documentation-honesty note, not a hole (the tool is strictly read-only and every arg is coerced
 * totally). Do not read the advertised schema as a validator this server runs.
 */
export const RELATIONS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    unit: { type: "string", description: "the nodeKey the grounded relations touch" },
    direction: {
      type: "string",
      enum: ["out", "in", "both"],
      description: "out = unit is the subject, in = the object, both = the union (default both)",
    },
  },
  required: ["unit"],
  additionalProperties: false,
} as const

/**
 * The `atlas negations` MCP tool (#99b). Like `atlas-relations` it is a READ tool served DIRECTLY from an
 * injected leg, NOT through `GOVERNANCE_SURFACE` — so `GOVERNANCE_SURFACE` stays its six and the closed-surface pin
 * is untouched. It mirrors the CLI, where `negations` is intercepted BEFORE the handler: it opens no governed
 * surface and has no `Tool` token, so its schema is DOCUMENTED here and advertised verbatim.
 */
export const NEGATIONS_TOOL = "atlas-negations"

/**
 * The DOCUMENTED input schema for `atlas-negations` (JSON-Schema). `scope` is the required scope key whose
 * grounded negatives + abstentions to read; `abstained` is an OPTIONAL boolean (focuses the reader on the
 * honest abstentions — both are always present in the verdict `data`, so an abstention is observable
 * regardless, #202). Mirrors how `atlas-relations` documented `unit` (required) + `direction` (optional).
 *
 * WHAT IS ENFORCED, stated honestly (same posture as `RELATIONS_INPUT_SCHEMA`): `required:['scope']` IS
 * enforced — a missing/non-string `scope` fails CLOSED at the shared `negationsVerdict` body (isError), so the
 * required-scope contract holds identically on CLI and MCP. `additionalProperties:false` is ADVERTISED but not
 * machine-enforced here (task #166); the tool is strictly read-only and every arg is coerced totally. #193: no
 * undocumented field — `abstained` is the only optional field and it is read by the shared builder.
 */
export const NEGATIONS_INPUT_SCHEMA = {
  type: "object",
  properties: {
    scope: { type: "string", description: "the scope key whose grounded negatives + abstentions to read" },
    abstained: {
      type: "boolean",
      description:
        "focus the reader on the honest abstentions (both negatives and abstentions are always returned; default false)",
    },
  },
  required: ["scope"],
  additionalProperties: false,
} as const

/** The read tools advertised beside the governance surface — the `relations` (#99a) and `negations` (#99b)
 *  tools, each when its leg is injected, else none (so the closed-governance pin holds byte-for-byte when no
 *  read leg is composed). Order fixed: relations before negations (the order they were added), so the
 *  advertised list is deterministic. */
export function advertisedReadTools(relations?: RelationLeg, negations?: NegationLeg): SdkTool[] {
  const tools: SdkTool[] = []
  if (relations !== undefined) {
    tools.push({
      name: RELATIONS_TOOL,
      description:
        "Read the GROUNDED relation facts (family:relation) touching a unit, both directions (#99a / ADR-0015 D2). Read-only; opens no governed surface.",
      inputSchema: RELATIONS_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    })
  }
  if (negations !== undefined) {
    tools.push({
      name: NEGATIONS_TOOL,
      description:
        "Read the GROUNDED negatives (family:negation) AND the honest ABSTENTIONS under a scope (#99b / ADR-0015 D3). An abstention is the door declining to decide a negative over an OPEN scope — it FIRED and is on the record (#202). Read-only; opens no governed surface.",
      inputSchema: NEGATIONS_INPUT_SCHEMA as unknown as SdkTool["inputSchema"],
    })
  }
  return tools
}

/** The ListTools response — the closed governance surface (TOOLS-1, six), PLUS the `relations`/`negations`
 *  read tools when their legs are injected, PLUS the six authoring `READ_SURFACE` doors (anchors, slots,
 *  draft, check, doctor, node) when the authoring bundle is injected (WP-10.A5.MCP), PLUS the four memory
 *  `READ_SURFACE` doors when the memory bundle is injected (WP-11.W8). With no leg the response is
 *  byte-for-byte the closed governance surface. */
export function listTools(
  handler: WiredHandler,
  relations?: RelationLeg,
  negations?: NegationLeg,
  readLegs?: ReadSurfaceLegs,
  memoryLegs?: MemoryReadSurfaceLegs,
): ListToolsResult {
  return {
    tools: [
      ...advertisedTools(handler),
      ...advertisedReadTools(relations, negations),
      ...advertisedAuthoringTools(readLegs),
      ...advertisedMemoryTools(memoryLegs),
    ],
  }
}

/**
 * Map a total `Verdict` → `CallToolResult` (MCP-2). An `ok:true` verdict renders as a normal result whose
 * text is the JSON of `data` + `guidance` (`isError` absent). An `ok:false` (rejected / fail-closed) verdict
 * renders with `isError:true` and text that CARRIES `fault` + `rejected` + `guidance` (next + invariant) —
 * the fail-closed reason is ALWAYS visible, never an empty error (the known past bug). Pure + deterministic.
 *
 * `fault` is the ERROR CLASS as a machine value (`@atlas/tools` `faultOf`): `malformed-args` (the caller's
 * arguments did not parse against the published schema), `refused` (a door deliberately declined), or
 * `internal-fault` (Atlas itself threw). An MCP client is an AGENT, and the whole point of the attribution
 * fix is that an agent must not be left to infer from prose whether to retry with different arguments, stop
 * and report a governance refusal, or file a defect. It rides an ADDITIVE field: `rejected` and `guidance`
 * are byte-unchanged, so every existing consumer of this envelope keeps reading what it read.
 */
export function verdictToResult(verdict: Verdict): CallToolResult {
  if (verdict.ok) {
    const text = JSON.stringify({ data: verdict.data, guidance: verdict.guidance })
    return { content: [{ type: "text", text }] }
  }
  const text = JSON.stringify({ fault: faultOf(verdict), rejected: verdict.rejected, guidance: verdict.guidance })
  return { content: [{ type: "text", text }], isError: true }
}

/**
 * Handle a CallTool request: route through the one wired handler and map its total `Verdict`. The handler is
 * TOTAL (an off-surface / malformed token fails CLOSED to a rejected verdict, never a throw), so a malformed
 * request maps to a well-formed `isError` result — the transport never throws to the SDK. The `name` is
 * passed as the `Tool` token; an off-surface token routes to the handler's fail-closed path.
 */
export function callTool(
  handler: WiredHandler,
  name: string,
  args: unknown,
  relations?: RelationLeg,
  negations?: NegationLeg,
  readLegs?: ReadSurfaceLegs,
  memoryLegs?: MemoryReadSurfaceLegs,
): CallToolResult {
  // The six pre-existing READ_SURFACE members (anchors, slots, draft, check, doctor, node) are routed
  // DIRECTLY to their SHARED verdict builder (`@atlas/adapter-io`, the SAME body the CLI drives) —
  // byte-identical `Verdict` on both transports. NONE reaches a write path (`node` rides the handler's
  // read-only `resolveNode`; the rest ride read/planner legs that persist nothing). `undefined` ⇒ `name`
  // is not one of these six tokens; fall through.
  const readVerdict = callAuthoringTool(handler, readLegs, name, args)
  if (readVerdict !== undefined) return verdictToResult(readVerdict)
  // The four memory READ_SURFACE members (WP-11.W8) are routed the SAME way, over their own shared verdict
  // builders (`@atlas/adapter-io` `memory-verdicts.ts`). `undefined` ⇒ fall through.
  const memoryVerdict = callMemoryTool(memoryLegs, name, args)
  if (memoryVerdict !== undefined) return verdictToResult(memoryVerdict)
  // `atlas-relations` (#99a) is served DIRECTLY from the injected read leg through the SHARED verdict builder
  // (`relationsVerdict`, @atlas/adapter-io) — the SAME body the CLI drives, so identical input yields a
  // byte-identical `Verdict` on both transports (the SCHEMA + VERDICT parity invariant). It never reaches
  // `handler.handle`: it is not a `Tool` and has no governed token. TOTAL — a non-string `unit` coerces to
  // `''` and a non-string `direction` to `undefined`, then `relationsVerdict` ENFORCES `required:['unit']`
  // (a missing/empty unit fails CLOSED to `isError`, matching the CLI) and rejects a bad `direction` — never a throw.
  if (relations !== undefined && name === RELATIONS_TOOL) {
    const a = (typeof args === "object" && args !== null ? args : {}) as { unit?: unknown; direction?: unknown }
    const unit = typeof a.unit === "string" ? a.unit : ""
    const direction = typeof a.direction === "string" ? a.direction : undefined
    return verdictToResult(relationsVerdict(relations, unit, direction))
  }
  // `atlas-negations` (#99b) is served the SAME way — DIRECTLY from the injected read leg through the SHARED
  // verdict builder (`negationsVerdict`), so identical input yields a byte-identical `Verdict` on both
  // transports. TOTAL — a non-string `scope` coerces to `''` (then `negationsVerdict` ENFORCES
  // `required:['scope']`, failing CLOSED to `isError`, matching the CLI) and a non-boolean `abstained` to
  // `false`; never a throw. It never reaches `handler.handle`: it is not a `Tool` and has no governed token.
  if (negations !== undefined && name === NEGATIONS_TOOL) {
    const a = (typeof args === "object" && args !== null ? args : {}) as { scope?: unknown; abstained?: unknown }
    const scope = typeof a.scope === "string" ? a.scope : ""
    const abstained = a.abstained === true
    return verdictToResult(negationsVerdict(negations, scope, abstained))
  }
  const verdict = handler.handle(name as Tool, args)
  return verdictToResult(verdict)
}

/** Wire the SDK `Server` over the one handler: advertise the closed surface (+ the `relations` read tool when
 *  a read leg is injected) and route every CallTool. */
function configureServer(
  handler: WiredHandler,
  relations?: RelationLeg,
  negations?: NegationLeg,
  readLegs?: ReadSurfaceLegs,
  memoryLegs?: MemoryReadSurfaceLegs,
): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, () => listTools(handler, relations, negations, readLegs, memoryLegs))
  server.setRequestHandler(CallToolRequestSchema, (request) =>
    callTool(handler, request.params.name, request.params.arguments, relations, negations, readLegs, memoryLegs),
  )
  return server
}

/** Construct the stdio MCP server over the one wired handler (MCP-1), optionally exposing the `relations`
 *  (#99a) and `negations` (#99b) read tools, the full pre-existing `READ_SURFACE` six (WP-10.A5.MCP), and
 *  the four CAMPAIGN-11 memory READ_SURFACE tools (WP-11.W8) when the composition root injects their legs.
 *  `atlas-memory-emit` needs NO parameter here: it is a `GOVERNANCE_SURFACE` member and is advertised
 *  generically by `advertisedTools(handler)` the moment the composition root wires `WireConfig.memoryEmit`. */
export function createMcpServer(
  handler: WiredHandler,
  relations?: RelationLeg,
  negations?: NegationLeg,
  readLegs?: ReadSurfaceLegs,
  memoryLegs?: MemoryReadSurfaceLegs,
): McpServer {
  return {
    async start(): Promise<void> {
      const server = configureServer(handler, relations, negations, readLegs, memoryLegs)
      const transport = new StdioServerTransport()
      await server.connect(transport)
    },
  }
}

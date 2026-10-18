export * as ClaudeHostMcp from "./mcp"

// The `orchestra` MCP server of a Claude Code host session (meta-harness PLAN §4.3). It serves Orchestra's registry
// tools ADDITIVELY: Atlas, App Dock `dock_*`, the `maestro_*` workflows, `context_recall`, the research capture tools,
// the `process` tool (process-tool.ts) and `task_grant`. It never serves a tool that duplicates a Claude Code built-in:
// those stay Claude Code's own, and a seat's plugin allow-list names the built-in instead (plugin.ts).
//
// Each accepted hook injects a dispatch receipt into the MCP input. The handler checks that exact reservation,
// then strips the receipt before Orchestra's own parameter validation and execution.
import { Effect, Exit, Schema } from "effect"
import { createSdkMcpServer, type McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { JSONSchema7 } from "@ai-sdk/provider"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { Identifier } from "@orchestra/core/id/id"
import type { PermissionV1 } from "@orchestra/core/v1/permission"
import type { ModelV2 } from "@orchestra/core/model"
import type { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { Seats } from "@/maestro/seats"
import { WriteRoots } from "@/maestro/write-roots"
import { PartID, type SessionID } from "@/session/schema"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { ClaudeCodeTools } from "../tools"
import { ClaudeHostProcess } from "./process-tool"

export const NAME = ClaudeCodeTools.SERVER
export const DISPATCH = "__orchestra_dispatch"

/** Remove the host's transport receipt before any Orchestra implementation sees the arguments. */
export function argumentsOf(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => key !== DISPATCH))
}

/**
 * Orchestra tools that Claude Code has as built-ins, with the built-in names. The server never serves them; a seat's
 * allow-list names the built-in.
 */
export const BUILTINS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  bash: ["Bash"], read: ["Read"], write: ["Write"], edit: ["Edit"], apply_patch: ["Edit"], grep: ["Grep"], glob: ["Glob"],
  webfetch: ["WebFetch"], websearch: ["WebSearch"], task: ["Agent"], todowrite: ["TodoWrite"], question: ["AskUserQuestion"],
  skill: ["Skill"], lsp: ["LSP"],
})

/**
 * Orchestra tools that belong to Orchestra's own loop, so Claude mode never serves them: `context_compact` (Claude Code
 * compacts its own context), `invalid` (the loop's repair tool), `execute` (code mode runs tools through the loop),
 * and `maestro_request_review` (requires that loop's prompt executor; the append explains native Agent reviews).
 */
export const LOOP_ONLY: readonly string[] = Object.freeze(["invalid", "context_compact", "execute", "maestro_request_review"])

/** The Orchestra tools Claude mode may serve over MCP. */
export function exposed(defs: readonly Tool.Def[]) {
  return defs.filter((def) => servable(def.id))
}

export function servable(id: string) {
  return !Object.hasOwn(BUILTINS, id) && !LOOP_ONLY.includes(id)
}

/** The host server executes each reservation in its mirrored caller's context and runtime binding. */
export type Bridge = {
  readonly run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
  readonly claim: (tool: string, args: Record<string, unknown>, signal: AbortSignal) => Effect.Effect<SessionV1.ToolPart>
  readonly context: (part: SessionV1.ToolPart) => Effect.Effect<Tool.Context>
  readonly execute: (def: Tool.Def, args: Record<string, unknown>, context: Tool.Context) => Effect.Effect<Tool.ExecuteResult>
  readonly complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
  readonly settled: (callID: string) => void
}

/** An accepted PreToolUse call. The shared MCP transport carries arguments, but no caller identity or tool-use id. */
export type Reservation = {
  readonly callID: string
  readonly sessionID: SessionID
  readonly seat: string
  readonly tool: string
  readonly input: Record<string, unknown>
  readonly args: Record<string, unknown>
  readonly signal: AbortSignal
}

export type Calls = {
  readonly reserve: (input: Reservation) => Record<string, unknown>
  readonly cancel: (callID: string) => void
  readonly release: (callID: string) => void
}

export type Context = {
  sessionID: SessionID
  directory: string
  worktree: string
  /** The main seat id. */
  agent: string
  abort: AbortController
  /** Optional: the tools to serve, from `prepare`. Built-in duplicates and loop-only tools are dropped. */
  tools?: readonly Tool.Def[]
  /**
   * Optional: the mirror bridge. Calls need it: they run in Orchestra's instance context and complete the mirrored
   * part. Without it the server still lists its tools, and every call fails closed.
   */
  bridge?: Bridge
}

/** The `orchestra` server for one host session: the served registry tools plus `task_grant`. */
export function server(ctx: Context): McpSdkServerConfigWithInstance {
  const served = exposed(ctx.tools ?? []).filter((def) => def.id !== GRANT)
  const defs = [...served.filter((def, index) => served.findIndex((other) => other.id === def.id) === index), grant(ctx.sessionID)]
  const bridge = ctx.bridge
  const server = createSdkMcpServer({ name: NAME, tools: [] })
  server.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs.map((def) => ({
    name: def.id, description: def.description, inputSchema: { type: "object" as const, ...dispatchSchema(ToolJsonSchema.fromTool(def)) },
    _meta: { "anthropic/alwaysLoad": true },
  })) }))
  server.instance.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!bridge) return failed("Orchestra tool calls need the host bridge.")
    return bridge.run(Effect.gen(function* () {
      const def = defs.find((item) => item.id === request.params.name)
      if (!def) return failed(`Orchestra tool ${request.params.name} is not available in Claude mode.`)
      const wire = request.params.arguments ?? {}
      const args = argumentsOf(wire)
      const claimed = yield* bridge.claim(def.id, wire, extra.signal).pipe(Effect.exit)
      if (Exit.isFailure(claimed)) return failed(ClaudeCodeTools.failure(claimed.cause))
      const part = claimed.value
      const start = part.state.status === "running" ? part.state.time.start : Date.now()
      return yield* Effect.gen(function* () {
        const exit = yield* bridge.context(part).pipe(
          Effect.flatMap((context) => bridge.execute(def, args, context)), Effect.exit)
        if (Exit.isFailure(exit)) {
          const text = ClaudeCodeTools.failure(exit.cause)
          yield* bridge.complete({ ...part, state: { status: "error", input: args, error: text, time: { start, end: Date.now() } } })
          return failed(text)
        }
        const result = exit.value
        yield* bridge.complete({ ...part, state: { status: "completed", input: args, output: result.output, title: result.title,
          metadata: result.metadata, time: { start, end: Date.now() }, attachments: result.attachments?.map((attachment) => ({
            ...attachment, id: PartID.ascending(), sessionID: part.sessionID, messageID: part.messageID,
          })) } })
        return { content: [{ type: "text" as const, text: result.output }, ...(result.attachments ?? []).flatMap((file) => {
          const match = /^data:([^;,]+);base64,(.*)$/s.exec(file.url)
          return match && file.mime.startsWith("image/") ? [{ type: "image" as const, data: match[2], mimeType: match[1] }] : []
        })] }
      }).pipe(Effect.ensuring(Effect.sync(() => bridge.settled(part.callID))))
    }))
  })
  return server
}

function failed(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}

/** Closed unions accept the receipt too; the model omits it and the accepted hook supplies it. */
function dispatchSchema(schema: JSONSchema7): JSONSchema7 {
  return { ...schema, properties: { ...schema.properties,
    [DISPATCH]: { type: "string", description: "Omit this field. The host supplies the dispatch receipt automatically." } },
    ...(schema.anyOf ? { anyOf: schema.anyOf.map((item) => typeof item === "boolean" ? item : dispatchSchema(item)) } : {}),
    ...(schema.oneOf ? { oneOf: schema.oneOf.map((item) => typeof item === "boolean" ? item : dispatchSchema(item)) } : {}),
    ...(schema.allOf ? { allOf: schema.allOf.map((item) => typeof item === "boolean" ? item : dispatchSchema(item)) } : {}),
  }
}

/**
 * The registry tools of the main seat and every native seat, resolved once per host session. `tools` is what the
 * server serves (each tool once, from the first agent the registry grants it to, main seat first), plus `process`.
 * `granted` is every registry tool id per agent id, built-ins included: plugin.ts maps it to each seat's allow-list,
 * and the policy gate can check that the agent calling an `mcp__orchestra__*` tool is one the registry grants it to.
 */
export const prepare = Effect.fn("ClaudeHostMcp.prepare")(function* (input: {
  agent: Agent.Info
  model: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  permission?: PermissionV1.Ruleset
}) {
  const agents = yield* Agent.Service
  const registry = yield* ToolRegistry.Service
  const seats = (yield* agents.list()).filter((item) => item.native === true && item.id !== input.agent.id && Seats.find(item.id))
  const resolved = yield* Effect.forEach([input.agent, ...seats], (agent) =>
    registry.tools({ ...input.model, agent, permission: agent === input.agent ? input.permission : undefined }).pipe(
      Effect.map((defs) => ({ id: agent.id ?? agent.name, defs })),
    ))
  const process = yield* Effect.flatMap(ClaudeHostProcess.ProcessTool, Tool.init)
  const served = resolved.flatMap((item) => exposed(item.defs))
  const tools = [...served.filter((def, index) => served.findIndex((other) => other.id === def.id) === index), process]
  const granted = Object.fromEntries(resolved.map((item) => [item.id, [
    ...item.defs.map((def) => def.id),
    // The process tool runs shell commands, so it goes to exactly the agents the registry gives the shell.
    ...(item.defs.some((def) => def.id === "bash") ? [ClaudeHostProcess.ID] : []),
  ]]))
  return { tools, granted, seats }
})

// task_grant: the per-call write-root grant agent HOOKS binds at PreToolUse[Agent] (contract V2 B2).

export const GRANT = "task_grant"

export const GrantParameters = Schema.Struct({
  seat: Schema.String.annotate({ description: "The seat id the grant is for, such as `archie` or `backend`." }),
  writePaths: Schema.Array(Schema.String).annotate({
    description: "Worktree-relative files or directories the seat may write in this dispatch. Empty: read-only.",
  }),
  purpose: Schema.String.annotate({ description: "One line: what the dispatch writes and why." }),
})

export type Grant = {
  readonly grantID: string
  readonly sessionID: string
  readonly seat: string
  readonly writePaths: readonly string[]
  /** Canonical absolute roots, validated as Task validates `writePaths`. */
  readonly writeRoots: readonly string[]
  readonly purpose: string
  readonly time: number
}

const store = new Map<string, Map<string, Grant>>()

/** The grants issued in a host session, by grant id. HOOKS reads, binds and consumes them. */
export function grants(sessionID: string) {
  const existing = store.get(sessionID)
  if (existing) return existing
  const created = new Map<string, Grant>()
  store.set(sessionID, created)
  return created
}

/** Drops a host session's grants when it ends. */
export function release(sessionID: string) {
  store.delete(sessionID)
}

/** The grant id an Agent prompt names on a `grantID: <id>` line, the form task_grant tells Maestro to use. */
export function referenced(prompt: string) {
  return /^grantID:\s*(grt_[A-Za-z0-9]+)\s*$/m.exec(prompt)?.[1]
}

const decodeGrant = Schema.decodeUnknownEffect(GrantParameters)

function grant(sessionID: SessionID): Tool.Def {
  return {
    id: GRANT,
    description: [
      "Grant a write-roots seat (such as archie or backend) the paths it may write in one dispatch. Call it before the",
      "Agent call that dispatches the seat, then put the returned id on its own line in that Agent prompt as",
      "`grantID: <id>`. The host binds the grant to that dispatch and enforces it; without a grant the seat is read-only.",
      "Returns { grantID }.",
    ].join(" "),
    parameters: GrantParameters,
    execute: (args) => Effect.gen(function* () {
      const input = yield* decodeGrant(args).pipe(Effect.orDie)
      const seat = Seats.find(input.seat)
      if (!seat) return yield* Effect.die(new Error(`task_grant denied: unknown seat ${JSON.stringify(input.seat)}`))
      if (!seat.writeRoots) return yield* Effect.die(new Error(`task_grant denied: seat ${seat.id} takes no write-root grant`))
      // Task's own validation: worktree-relative, no escape, symlinks resolved, canonical absolute roots.
      const rules = yield* WriteRoots.bind(seat.id, input.writePaths, []).pipe(
        Effect.provide(LayerNode.compile(filesystem)), Effect.orDie)
      const entry = {
        grantID: Identifier.create("grt", "ascending"), sessionID, seat: seat.id, writePaths: [...input.writePaths],
        writeRoots: WriteRoots.read(rules) ?? [], purpose: input.purpose, time: Date.now(),
      } satisfies Grant
      grants(sessionID).set(entry.grantID, entry)
      return { title: `Write grant for ${seat.id}`, output: JSON.stringify({ grantID: entry.grantID }),
        metadata: { grantID: entry.grantID, seat: seat.id, writeRoots: entry.writeRoots } }
    }),
  }
}

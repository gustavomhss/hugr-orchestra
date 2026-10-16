// Orchestra's tools, served to Claude Code by the in-process `orchestra` MCP server (host/mcp.ts). They are additive:
// Claude Code's own built-ins stay on. Claude Code calls them by name; the handler runs Orchestra's own implementation
// on the mirrored session and writes the result on the mirrored part.
import { Cause, Effect, Exit } from "effect"
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { PartID } from "@/session/schema"

export const SERVER = "orchestra"
const PREFIX = `mcp__${SERVER}__`

// Orchestra tools Claude mode never serves. Claude Code compacts its own context, so Orchestra's context_compact
// (a maintenance pass through Orchestra's continuity) has nothing to act on here.
const UNSERVED = ["invalid", "context_compact"]

/** Orchestra tools that Claude Code has natively, by Claude Code name. The mirror shows them under Orchestra's id. */
export const NATIVE: Record<string, string> = { bash: "Bash", grep: "Grep", glob: "Glob", webfetch: "WebFetch", websearch: "WebSearch" }

/** The Orchestra tool a Claude Code tool name calls, when it is an in-process one. */
export function orchestra(name: string) {
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : undefined
}

function servable(def: Tool.Def) {
  return !UNSERVED.includes(def.id) && !Object.hasOwn(NATIVE, def.id)
}

/** A rejected or failed call, as the model reads it. */
export function failure(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause) as { feedback?: string; message?: string; _tag?: string; name?: string }
  if (typeof error?.feedback === "string") return `The owner rejected this call with feedback: ${error.feedback}`
  const tag = error?._tag ?? error?.name ?? ""
  // A rule denial is policy, not the owner: like Orchestra's own loop, show the rule and let the model carry on.
  if (/Denied/.test(tag)) return error?.message ?? "A permission rule denies this call."
  // Only the owner's own answer means stop; a governance refusal such as MaestroValidationRejected names its cause.
  if (OWNER_REJECTED.includes(tag)) return "The owner rejected this call. Stop and wait for the owner's next message."
  return error?.message ?? String(error)
}

const OWNER_REJECTED = ["PermissionRejectedError", "QuestionRejectedError", "QuestionV2.RejectedError"]

export function server(input: {
  defs: Tool.Def[]
  run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
  /** Waits for the mirrored part of the next call of this Orchestra tool. */
  claim: (tool: string) => Effect.Effect<SessionV1.ToolPart>
  context: (part: SessionV1.ToolPart) => Tool.Context
  messages?: () => Effect.Effect<SessionV1.WithParts[]>
  complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}) {
  const defs = input.defs.filter(servable)
  const handler = (name: string, args: Record<string, unknown>) => input.run(Effect.gen(function* () {
    const def = defs.find((item) => item.id === name)
    if (!def) return { content: [{ type: "text" as const, text: `Orchestra tool ${name} is not available.` }], isError: true }
    const part = yield* input.claim(name)
    const start = part.state.status === "running" ? part.state.time.start : Date.now()
    const context = input.context(part)
    if (input.messages) context.messages = yield* input.messages()
    const exit = yield* def.execute(args as never, context).pipe(Effect.exit)
    if (Exit.isFailure(exit)) {
      const text = failure(exit.cause)
      yield* input.complete({ ...part, state: { status: "error", input: args, error: text, time: { start, end: Date.now() } } })
      return { content: [{ type: "text" as const, text }], isError: true }
    }
    const result = exit.value
    yield* input.complete({ ...part, state: { status: "completed", input: args, output: result.output, title: result.title,
      metadata: result.metadata, time: { start, end: Date.now() }, attachments: result.attachments?.map((attachment) => ({
        ...attachment, id: PartID.ascending(), sessionID: part.sessionID, messageID: part.messageID,
      })) } })
    const images = (result.attachments ?? []).flatMap((file) => {
      const match = /^data:([^;,]+);base64,(.*)$/s.exec(file.url)
      return match && file.mime.startsWith("image/") ? [{ type: "image" as const, data: match[2], mimeType: match[1] }] : []
    })
    return { content: [{ type: "text" as const, text: result.output }, ...images] }
  }))
  // SDK tool() accepts a Zod raw object only. Recall is a closed union, so expose the actual host JSON schemas through
  // the MCP protocol instead of weakening that union into optional fields. Tool.execute remains the validator.
  const server = createSdkMcpServer({ name: SERVER, tools: [] })
  server.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs.map((def) => ({
    name: def.id, description: def.description, inputSchema: { type: "object" as const, ...ToolJsonSchema.fromTool(def) },
    _meta: { "anthropic/alwaysLoad": true },
  })) }))
  server.instance.server.setRequestHandler(CallToolRequestSchema, (request) => handler(request.params.name, request.params.arguments ?? {}))
  return server
}

export * as ClaudeCodeTools from "./tools"

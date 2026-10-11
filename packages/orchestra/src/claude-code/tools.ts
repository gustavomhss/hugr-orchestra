// Orchestra's tools, handed to Claude Code as in-process SDK tools. Claude Code calls them by name; the handler runs
// Orchestra's own implementation (the registry's, with its allowance and source capture) on the mirrored session and
// writes the result on the mirrored part.
import { Cause, Effect, Exit } from "effect"
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Agent } from "@/agent/agent"
import type { Tool } from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { PartID } from "@/session/schema"
import { isRecord } from "@/util/record"

export const SERVER = "orchestra"
/** Claude Code's name for an Orchestra tool is this prefix and the tool's id. */
export const PREFIX = `mcp__${SERVER}__`

/** The Orchestra tools a seat on Claude Code runs in-process. */
export const IDS = ["read", "edit", "write", "context_recall", "context_compact"]

/** Orchestra tools Claude Code runs natively, by Claude Code name; Orchestra's gate (permissions.ts) decides each call. */
export const NATIVE: Record<string, string> = { bash: "Bash", grep: "Grep", glob: "Glob", webfetch: "WebFetch", websearch: "WebSearch" }

/**
 * The Orchestra tools an agent runs in-process. Maestro keeps its whole Orchestra toolset, delegation included, with
 * the texts and permissions it has on Orchestra's loop; only the tools Claude Code runs natively stay native. With
 * Claude Code's own tools off (a native research dispatch), the agent's whole permitted toolset runs in-process.
 */
export function served(agent: Agent.Info, defs: readonly Tool.Def[], orchestraOnly = false) {
  if (orchestraOnly) return defs.filter((def) => def.id !== "invalid")
  if (!conductor(agent)) return defs.filter((def) => IDS.includes(def.id))
  return defs.filter(servable)
}

/**
 * The names Claude Code resolves to each served Orchestra tool (its `toolAliases`): the bare id, as agent prompts name
 * it, and the Claude Code tool it stands for. Either would otherwise end in "No such tool available". Only served tools
 * are aliased, so Claude Code's own tools stay its own.
 */
export function aliases(defs: readonly Tool.Def[]) {
  return Object.fromEntries(defs.flatMap((def) =>
    [def.id, ...(STANDS_FOR[def.id] ? [STANDS_FOR[def.id]] : [])].map((name) => [name, `${PREFIX}${def.id}`])))
}

/** The Claude Code tool each Orchestra tool stands for. */
export const STANDS_FOR: Record<string, string> = { read: "Read", edit: "Edit", write: "Write", ...NATIVE }

/** Maestro's Claude Code built-ins: the native counterparts of the Orchestra tools it has. Seats keep the preset set. */
export function builtins(agent: Agent.Info, defs: readonly Tool.Def[]) {
  return conductor(agent) ? defs.flatMap((def) => NATIVE[def.id] ?? []) : undefined
}

/** The Orchestra tool a Claude Code tool name calls, when it is an in-process one. */
export function orchestra(name: string) {
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length) : undefined
}

export function conductor(agent: Agent.Info) {
  return agent.id === "maestro" && agent.native === true
}

function servable(def: Tool.Def) {
  return def.id !== "invalid" && !Object.hasOwn(NATIVE, def.id)
}

/** A rejected or failed call, as the model reads it. */
export function failure(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause) as { feedback?: string; message?: string; _tag?: string; name?: string }
  if (typeof error?.feedback === "string") return `The owner rejected this call with feedback: ${error.feedback}`
  const tag = error?._tag ?? error?.name ?? ""
  // A rule denial is policy, not the owner: like Orchestra's own loop, show the rule and let the model carry on.
  if (/Denied/.test(tag)) return error?.message ?? "A permission rule denies this call."
  if (/Rejected/.test(tag)) return "The owner rejected this call. Stop and wait for the owner's next message."
  return error?.message ?? String(error)
}

export function server(input: {
  defs: Tool.Def[]
  /** Claude Code's own tools are off: the tools it would run natively are served too. */
  orchestraOnly?: boolean
  run: <A>(effect: Effect.Effect<A, unknown>) => Promise<A>
  /** Waits for the mirrored part of the next call of this Orchestra tool. */
  claim: (tool: string) => Effect.Effect<SessionV1.ToolPart>
  context: (part: SessionV1.ToolPart) => Tool.Context
  messages?: () => Effect.Effect<SessionV1.WithParts[]>
  complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}) {
  const defs = input.defs.filter((def) => def.id !== "invalid" && (input.orchestraOnly || servable(def)))
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
  // SDK tool() accepts a Zod raw object only, so expose the host JSON schemas through the MCP protocol. Tool.execute
  // remains the validator.
  const server = createSdkMcpServer({ name: SERVER, tools: [] })
  server.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: defs.map((def) => {
    const schema = ToolJsonSchema.fromTool(def)
    return { name: def.id, description: [def.description, requirements(schema)].filter(Boolean).join("\n\n"),
      inputSchema: { type: "object" as const, ...flatten(schema) }, _meta: { "anthropic/alwaysLoad": true } }
  }) }))
  server.instance.server.setRequestHandler(CallToolRequestSchema, (request) => handler(request.params.name, request.params.arguments ?? {}))
  return server
}

// A tool's input schema must be one object at the top level: a union of objects (e.g. one variant per `action`) reached
// the model as an empty object, so every call arrived as {}. Merge the variants' fields, union a field's schemas across
// variants and require only what every variant requires. A field only some variants of a discriminated union require
// says in its description which of them do. A schema that is not a union is passed unchanged.
function flatten(schema: ReturnType<typeof ToolJsonSchema.fromTool>) {
  if (!Array.isArray(schema.anyOf) && !Array.isArray(schema.oneOf)) return schema
  const fields = variants(schema)
  const tag = discriminator(fields)
  const keys = [...new Set(fields.flatMap((field) => Object.keys(field.properties)))]
  const properties = Object.fromEntries(keys.map((key) => {
    const schemas = [...new Map(fields.flatMap((field) => key in field.properties ? [field.properties[key]] : [])
      .map((item) => [JSON.stringify(item), item])).values()]
    const merged = schemas.length === 1 ? schemas[0] : { anyOf: schemas }
    if (fields.every((field) => field.required.includes(key))) return [key, merged]
    const by = tag ? fields.filter((field) => field.required.includes(key)).map((field) => literal(field.properties[tag])) : []
    const description = [isRecord(merged) && typeof merged.description === "string" ? merged.description : undefined,
      by.length > 0 ? `Required when ${tag} is ${by.join(" or ")}.` : undefined].filter(Boolean).join(" ")
    return [key, description && isRecord(merged) ? { ...merged, description } : merged]
  }))
  const required = keys.filter((key) => fields.every((field) => field.required.includes(key)))
  return { ...(typeof schema.$schema === "string" ? { $schema: schema.$schema } : {}), properties,
    ...(required.length > 0 ? { required } : {}) }
}

/** For a discriminated union, the fields each variant requires, as a line of the tool's description. */
function requirements(schema: unknown) {
  const fields = variants(schema)
  const tag = discriminator(fields)
  if (!tag) return undefined
  return [`Required fields for each ${tag}:`, ...fields.map((field) =>
    `- ${literal(field.properties[tag])}: ${field.required.filter((key) => key !== tag).join(", ") || "none"}`)].join("\n")
}

function variants(schema: unknown) {
  const options = isRecord(schema) ? (Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : []) : []
  return (options.length > 0 ? options.filter(isRecord) : isRecord(schema) ? [schema] : []).map((variant) => ({
    properties: isRecord(variant.properties) ? variant.properties : {},
    required: Array.isArray(variant.required) ? variant.required.filter((key): key is string => typeof key === "string") : [],
  }))
}

/** The field every variant requires as one distinct literal, such as `action`; undefined when there is none. */
function discriminator(fields: ReturnType<typeof variants>) {
  if (fields.length < 2) return undefined
  return Object.keys(fields[0].properties).find((key) => {
    const values = fields.map((field) => field.required.includes(key) ? literal(field.properties[key]) : undefined)
    return values.every((value) => value !== undefined) && new Set(values).size === values.length
  })
}

/** A single-value schema (`const` or a one-item `enum`) as the model would write it, else undefined. */
function literal(schema: unknown) {
  if (!isRecord(schema)) return undefined
  if ("const" in schema) return JSON.stringify(schema.const)
  if (Array.isArray(schema.enum) && schema.enum.length === 1) return JSON.stringify(schema.enum[0])
  return undefined
}

export * as ClaudeCodeTools from "./tools"

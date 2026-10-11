// Orchestra's tools, handed to Claude Code as in-process SDK tools. Claude Code calls them by name; the handler runs
// Orchestra's own implementation (the registry's, with its allowance and source capture) on the mirrored session and
// writes the result on the mirrored part.
import { Cause, Effect, Exit } from "effect"
import { z } from "zod"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type * as Tool from "@/tool/tool"
import { ToolJsonSchema } from "@/tool/json-schema"
import { isRecord } from "@/util/record"

export const SERVER = "orchestra"
/** Claude Code's name for an Orchestra tool is this prefix and the tool's id. */
export const PREFIX = `mcp__${SERVER}__`

/** A rejected or failed call, as the model reads it. */
export function failure(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause) as { feedback?: string; message?: string; _tag?: string; name?: string }
  if (typeof error?.feedback === "string") return `The user rejected this call with feedback: ${error.feedback}`
  const tag = error?._tag ?? error?.name ?? ""
  if (/Rejected|Denied/.test(tag)) return "The user rejected this call. Stop and wait for the user's next message."
  return error?.message ?? String(error)
}

export function server(input: {
  defs: Tool.Def[]
  run: <A>(effect: Effect.Effect<A, unknown, any>) => Promise<A>
  /** Waits for the mirrored part of the next call of this Orchestra tool. */
  claim: (tool: string) => Effect.Effect<SessionV1.ToolPart>
  context: (part: SessionV1.ToolPart) => Tool.Context
  complete: (part: SessionV1.ToolPart) => Effect.Effect<void>
}) {
  const handler = (def: Tool.Def) => async (args: Record<string, unknown>) => input.run(Effect.gen(function* () {
    const part = yield* input.claim(def.id)
    const start = part.state.status === "running" ? part.state.time.start : Date.now()
    const exit = yield* def.execute(args as never, input.context(part)).pipe(Effect.exit)
    if (Exit.isFailure(exit)) {
      const text = failure(exit.cause)
      yield* input.complete({ ...part, state: { status: "error", input: args, error: text, time: { start, end: Date.now() } } })
      return { content: [{ type: "text" as const, text }], isError: true }
    }
    const result = exit.value
    yield* input.complete({ ...part, state: { status: "completed", input: args, output: result.output, title: result.title,
      metadata: result.metadata, time: { start, end: Date.now() } } })
    const images = (result.attachments ?? []).flatMap((file) => {
      const match = /^data:([^;,]+);base64,(.*)$/s.exec(file.url)
      return match && file.mime.startsWith("image/") ? [{ type: "image" as const, data: match[2], mimeType: match[1] }] : []
    })
    return { content: [{ type: "text" as const, text: result.output }, ...images] }
  }))
  return createSdkMcpServer({
    name: SERVER,
    // Loaded up front: Claude Code otherwise defers MCP tools behind a search, and the model falls back to its own.
    tools: input.defs.map((def) => {
      const schema = ToolJsonSchema.fromTool(def)
      return tool(def.id, [def.description, requirements(schema)].filter(Boolean).join("\n\n"), shape(schema), handler(def),
        { alwaysLoad: true })
    }),
  })
}

// The SDK takes a Zod shape; Orchestra's tools declare their own schemas. The shape only describes the call to the
// model: each tool still decodes its arguments with its own schema, so constraints Zod is not given here still hold.
// A union of objects (e.g. one variant per `action`) has no top-level properties, but an SDK tool must be one object:
// merge the variants' fields, union a field's schemas across variants, and require only what every variant requires.
// A field only some variants of a discriminated union require says in its description which of them do.
function shape(schema: unknown) {
  const fields = variants(schema)
  const tag = discriminator(fields)
  const keys = [...new Set(fields.flatMap((field) => Object.keys(field.properties)))]
  return Object.fromEntries(keys.map((key) => {
    const schemas = [...new Map(fields.flatMap((field) => key in field.properties ? [field.properties[key]] : [])
      .map((item) => [JSON.stringify(item), item])).values()]
    const merged = schemas.length === 1 ? schemas[0] : { anyOf: schemas }
    if (fields.every((field) => field.required.includes(key))) return [key, zod(merged)]
    const by = tag ? fields.filter((field) => field.required.includes(key)).map((field) => literal(field.properties[tag])) : []
    // Described after `.optional()`: the JSON Schema the SDK lists drops a description set on the inner type.
    const description = [isRecord(merged) && typeof merged.description === "string" ? merged.description : undefined,
      by.length > 0 ? `Required when ${tag} is ${by.join(" or ")}.` : undefined].filter(Boolean).join(" ")
    return [key, description ? zod(merged).optional().describe(description) : zod(merged).optional()]
  }))
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

function zod(schema: unknown): z.ZodType {
  if (!isRecord(schema)) return z.unknown()
  const described = (type: z.ZodType) => typeof schema.description === "string" ? type.describe(schema.description) : type
  const options = Array.isArray(schema.anyOf) ? schema.anyOf : Array.isArray(schema.oneOf) ? schema.oneOf : []
  if (options.length > 1) return described(z.union(options.map(zod) as [z.ZodType, z.ZodType, ...z.ZodType[]]))
  if (Array.isArray(schema.enum) && schema.enum.length > 0 && schema.enum.every((item) => typeof item === "string"))
    return described(z.enum(schema.enum as [string, ...string[]]))
  if (typeof schema.const === "string" || typeof schema.const === "number" || typeof schema.const === "boolean")
    return described(z.literal(schema.const))
  if (schema.type === "string") return described(z.string())
  if (schema.type === "integer") return described(z.number().int())
  if (schema.type === "number") return described(z.number())
  if (schema.type === "boolean") return described(z.boolean())
  if (schema.type === "array") return described(z.array(zod(schema.items)))
  if (schema.type === "object") return described(z.looseObject(shape(schema)))
  return described(z.unknown())
}

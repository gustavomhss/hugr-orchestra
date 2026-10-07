// Orchestra's read, edit and write, handed to Claude Code as in-process SDK tools. Claude Code calls them by name; the
// handler runs Orchestra's own implementation on the mirrored session and writes the result on the mirrored part.
import { Cause, Effect, Exit } from "effect"
import { z } from "zod"
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type * as Tool from "@/tool/tool"

export const SERVER = "orchestra"

const SHAPES = {
  read: { filePath: z.string(), offset: z.number().int().optional(), limit: z.number().int().positive().optional() },
  edit: { filePath: z.string(), oldString: z.string(), newString: z.string(), replaceAll: z.boolean().optional() },
  write: { filePath: z.string(), content: z.string() },
}
export const NAMES = Object.keys(SHAPES).map((name) => `mcp__${SERVER}__${name}`)

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
  const handler = (name: keyof typeof SHAPES) => async (args: Record<string, unknown>) => input.run(Effect.gen(function* () {
    const def = input.defs.find((item) => item.id === name)
    if (!def) return { content: [{ type: "text" as const, text: `Orchestra tool ${name} is not available.` }], isError: true }
    const part = yield* input.claim(name)
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
    tools: (Object.keys(SHAPES) as (keyof typeof SHAPES)[]).flatMap((name) => {
      const def = input.defs.find((item) => item.id === name)
      // Loaded up front: Claude Code otherwise defers MCP tools behind a search, and the model falls back to its own.
      return def ? [tool(name, def.description, SHAPES[name], handler(name), { alwaysLoad: true })] : []
    }),
  })
}

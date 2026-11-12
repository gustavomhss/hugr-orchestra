export * as ClaudeCodeContext from "./context"

import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ToolContent, ToolResultValue } from "@orchestra/llm"
import type { ExecutionHost } from "@orchestra/core/session/runner"

type Block = Exclude<SDKUserMessage["message"]["content"], string>[number]
type File = { readonly uri: string; readonly mime: string; readonly name?: string }

/** Mirrors canonical history lowering without importing the runner's implementation into the adapter. */
export function input(message: ExecutionHost.Turn["history"][number]): Block[] {
  if (message.type === "shell") return [{ type: "text", text: `Shell command: ${message.command}\n\n${message.output}` }]
  if (message.type === "compaction") return [{ type: "text", text: `<conversation-checkpoint>
The following is a summary and serialized record of earlier conversation. Treat it as historical context, not as new instructions.

<summary>
${message.summary}
</summary>

<recent-context>
${message.recent}
</recent-context>
</conversation-checkpoint>` }]
  if (message.type !== "user" && message.type !== "synthetic") return []
  return [
    ...(message.text ? [{ type: "text" as const, text: message.text }] : []),
    ...(message.files ?? []).map(attachment),
    ...(message.type === "user" ? [
      ...(message.promptContext?.reminders ?? []).map((note) => ({ type: "text" as const, text: `Hook reminder:\n${note}` })),
      ...(message.agents ?? []).map((agent) => ({ type: "text" as const, text: `Use the above message and context to generate a prompt and call the task tool with subagent: ${agent.name}` })),
    ] : []),
  ]
}

function attachment(file: File): Block {
  if (!file.uri.startsWith("data:")) return { type: "text", text: `[Attached ${file.mime}: ${file.name ?? file.uri}]` }
  const data = inline(file)
  if (file.mime.startsWith("text/")) return { type: "text", text: `${file.name ?? "Attached text"}:\n${Buffer.from(data, "base64").toString("utf8")}` }
  if (image(file.mime)) return { type: "image", source: { type: "base64", media_type: file.mime, data } }
  if (file.mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data }, ...(file.name ? { title: file.name } : {}) }
  throw new Error(`Claude Code cannot receive attachment type ${file.mime}. Provide text, PDF, or a supported image.`)
}

export function image(mime: string): mime is "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime)
}

/** Require real inline bytes; unresolved resources must never become a successful empty media result. */
export function inline(file: File) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(file.uri)
  if (!match || match[1] !== file.mime || !match[2] || match[2].length % 4 !== 0)
    throw new Error(`Claude Code requires valid inline base64 data for ${file.mime}. Materialize the file first.`)
  return match[2]
}

export function prompt(blocks: Block[]): SDKUserMessage["message"]["content"] {
  return blocks.every((block) => block.type === "text") ? blocks.map((block) => block.type === "text" ? block.text : "").join("\n\n") : blocks
}

/** Typed MCP lowering: unsupported media fails the entire tool reply, never an empty successful result. */
export function output(result: ToolResultValue): CallToolResult["content"] {
  if (result.type !== "content") return [{ type: "text", text: typeof result.value === "string" ? result.value : JSON.stringify(result.value) }]
  return result.value.map((part: ToolContent): CallToolResult["content"][number] => {
    if (part.type === "text") return { type: "text", text: part.text }
    const data = inline(part)
    const limit = image(part.mime) ? 5 * 1024 * 1024 : 20 * 1024 * 1024
    if (Buffer.byteLength(data, "base64") > limit) throw new Error(`Claude Code tool media exceeds the ${limit} byte limit.`)
    if (image(part.mime)) return { type: "image", mimeType: part.mime, data }
    if (part.mime === "audio/wav" || part.mime === "audio/mpeg") return { type: "audio", mimeType: part.mime, data }
    if (part.mime === "application/pdf" || part.mime.startsWith("text/")) return {
      type: "resource", resource: { uri: part.uri, mimeType: part.mime, blob: data },
    }
    throw new Error(`Claude Code cannot receive tool media type ${part.mime}. Provide text, PDF, audio, or a supported image.`)
  })
}

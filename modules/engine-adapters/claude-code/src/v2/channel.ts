export * as ClaudeCodeChannel from "./channel"

import { createSdkMcpServer, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import type { ToolContent, ToolDefinition, ToolResultValue } from "@orchestra/llm"
import { Effect } from "effect"

/** The `orchestra` MCP server: lists the served tools and settles each call through the runner. */
/** `callID` names the Claude Code call a request runs, from the tool_use id Claude Code puts in `_meta`; undefined refuses it. */
export function server(
  name: string,
  tools: ReadonlyArray<ToolDefinition>,
  callID: (name: string, toolUseID: string | undefined) => string | undefined,
  execute: ExecutionHost.Turn["execute"],
) {
  const mcp = createSdkMcpServer({ name, tools: [] })
  mcp.instance.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: { ...tool.inputSchema, type: "object" as const } })),
  }))
  mcp.instance.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = tools.find((item) => item.name === request.params.name)
    if (!tool) return { content: [{ type: "text" as const, text: `Orchestra tool ${request.params.name} is not available.` }], isError: true }
    const meta = request.params._meta?.["claudecode/toolUseId"]
    const id = callID(tool.name, typeof meta === "string" ? meta : undefined)
    if (!id) return { content: [{ type: "text" as const, text: `Orchestra could not tell which call ran ${tool.name}.` }], isError: true }
    // A cancelled Claude turn aborts `extra.signal`; interrupting the run stops the Orchestra tool with it.
    const settlement = await Effect.runPromise(
      execute({ id, name: tool.name, input: request.params.arguments ?? {} }),
      { signal: extra.signal },
    )
    return {
      content: [{ type: "text" as const, text: modelText(settlement.result) }],
      ...(settlement.result.type === "error" ? { isError: true } : {}),
    }
  })
  return mcp
}

function modelText(result: ToolResultValue) {
  if (result.type === "content") return result.value.flatMap((part: ToolContent) => (part.type === "text" ? [part.text] : [])).join("\n")
  return typeof result.value === "string" ? result.value : JSON.stringify(result.value)
}

export function user(text: string, uuid: SDKUserMessage["uuid"]): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null, uuid }
}

/** The query's streaming input: the turn's prompt first, then whatever is pushed while it runs, until aborted. */
export function inbox(first: SDKUserMessage, signal: AbortSignal, handed: (uuid: SDKUserMessage["uuid"]) => void) {
  const queue = [first]
  let wake: (() => void) | undefined
  return {
    push: (message: SDKUserMessage) => {
      queue.push(message)
      wake?.()
    },
    messages: (async function* (): AsyncGenerator<SDKUserMessage> {
      while (!signal.aborted) {
        const next = queue.shift()
        if (next) {
          yield next
          handed(next.uuid)
          continue
        }
        await new Promise<void>((resolve) => {
          wake = resolve
          signal.addEventListener("abort", () => resolve(), { once: true })
        })
        wake = undefined
      }
    })(),
  }
}

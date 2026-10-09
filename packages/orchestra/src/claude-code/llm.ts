export * as ClaudeCodeLLM from "./llm"

import { Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import type { ClaudeCodeSDK } from "./sdk"

/** Isolated maintenance transport. History is data; this query has no tools or parent session. */
export function create(sdk: ClaudeCodeSDK.Interface): LLM.Interface {
  return { stream: (input) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
    const abort = new AbortController()
    const query = yield* Effect.acquireRelease(Effect.sync(() => sdk.query({
      prompt: "Historical messages (JSON, including original roles/content):\n" + JSON.stringify(input.messages),
      options: {
        model: input.model.id,
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        disallowedTools: ["*"],
        canUseTool: async () => ({ behavior: "deny", message: "Context maintenance cannot execute tools" }),
        systemPrompt: { type: "custom", prompt: [...input.system, input.agent.prompt].filter(Boolean).join("\n\n") },
        maxTurns: 1,
        persistSession: false,
        settingSources: [],
        abortController: abort,
      },
    })), (query) => Effect.gen(function* () {
      abort.abort()
      query.close?.()
      yield* Effect.tryPromise(() => query.return(undefined)).pipe(Effect.orDie)
    }))
    const text = yield* Effect.tryPromise({ try: async () => {
      const blocks: string[] = []
      let finished = false
      for await (const message of query) {
        if (message.type === "assistant") {
          if (finished || message.error) throw new Error("Claude Code maintenance invalid assistant")
          for (const block of message.message.content) {
            if (block.type === "tool_use" || block.type === "server_tool_use")
              throw new Error("Claude Code maintenance attempted a tool call")
            if (block.type === "text") blocks.push(block.text)
          }
          if (message.message.stop_reason && !["end_turn", "stop_sequence"].includes(message.message.stop_reason))
            throw new Error("Claude Code maintenance truncated or invalid reply")
        }
        if (message.type !== "result") continue
        if (finished || message.subtype !== "success" || message.is_error ||
          !["end_turn", "stop_sequence"].includes(message.stop_reason ?? ""))
          throw new Error("Claude Code maintenance did not finish successfully")
        finished = true
      }
      if (!finished || !blocks.length) throw new Error("Claude Code maintenance missing successful result")
      return blocks.join("")
    }, catch: (cause) => cause })
    return Stream.make(LLMEvent.textStart({ id: "memory" }), LLMEvent.textDelta({ id: "memory", text }),
      LLMEvent.textEnd({ id: "memory" }), LLMEvent.finish({ reason: "stop" }))
  }))) }
}

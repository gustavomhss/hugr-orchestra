export * as ClaudeCodeLLM from "./llm"

import { Effect, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import type { LLM } from "@/session/llm"
import { ClaudeCodeSDK } from "./sdk"
import { Token } from "@/util/token"

export function payload(input: Pick<LLM.StreamInput, "messages" | "system" | "agent">) {
  return {
    prompt: "Historical messages (JSON, including original roles/content):\n" + JSON.stringify(input.messages),
    system: [...new Set([...input.system, input.agent.prompt].filter((value): value is string => typeof value === "string" && value.length > 0))].join("\n\n"),
  }
}

/** Isolated maintenance transport. History is data; this query has no tools or parent session. */
export function create(sdk: ClaudeCodeSDK.Interface): LLM.Interface {
  return { estimateInput: (input) => { const compiled = payload(input); return Token.estimate(compiled.prompt + compiled.system) },
    stream: (input) => Stream.scoped(Stream.unwrap(Effect.gen(function* () {
    const compiled = payload(input)
    const abort = new AbortController()
    const env = yield* ClaudeCodeSDK.Environment
    const lifetime = ClaudeCodeSDK.processLifetime({
      env,
      model: input.model.id,
      tools: [],
      mcpServers: {},
      strictMcpConfig: true,
      disallowedTools: ["*"],
      canUseTool: async () => ({ behavior: "deny", message: "Context maintenance cannot execute tools" }),
      systemPrompt: { type: "custom", prompt: compiled.system },
      maxTurns: 1,
      persistSession: false,
      settingSources: [],
      abortController: abort,
    })
    // Also cover a query constructor that throws after spawning its child.
    yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()).pipe(Effect.andThen(Effect.promise(lifetime.join))))
    const query = yield* Effect.acquireRelease(Effect.sync(() => sdk.query({
      prompt: compiled.prompt,
      options: lifetime.options,
    })), (query) => Effect.gen(function* () {
      abort.abort()
      yield* Effect.sync(() => query.close?.())
      yield* Effect.tryPromise(() => query.return(undefined)).pipe(Effect.orDie)
    }).pipe(Effect.ensuring(Effect.promise(lifetime.join))))
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

import { expect } from "bun:test"
import { Effect } from "effect"
import { ClaudeEngineFixture } from "../engine-fixture"

ClaudeEngineFixture.it.instance("the host persists fallback model usage and failed Bash evidence through real services", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const ctx = yield* ClaudeEngineFixture.setup()
    const frame = ClaudeEngineFixture.frame
    const model = "claude-sonnet-4-5-20250929"
    ClaudeEngineFixture.state.scripts.push(async function* (input) {
      const send = await input[Symbol.asyncIterator]().next()
      yield { type: "system", subtype: "init", model, ...frame }
      yield { type: "assistant", ...frame, uuid: "shell", user_message_uuid: send.value?.uuid,
        message: { id: "shell", model, content: [{ type: "tool_use", id: "bash", name: "Bash", input: { command: "false" } }],
          stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 8 } } }
      yield { type: "user", ...frame, message: { role: "user",
        content: [{ type: "tool_result", tool_use_id: "bash", content: "Exit code 137\ninterrupted", is_error: true }] },
        tool_use_result: { interrupted: true, timedOutAfterMs: 1000, persistedOutputPath: "/tmp/failed-bash.txt" } }
      yield { type: "assistant", ...frame, uuid: "answer", message: { id: "answer", model,
        content: [{ type: "text", text: "The shell failed." }], stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 12 } } }
      yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.42, ...frame,
        modelUsage: { [model]: { inputTokens: 30, outputTokens: 20, thinkingTokens: 7, cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.42, contextWindow: 500000, maxOutputTokens: 32000 } } }
      for await (const _ of input) {}
    })
    yield* ctx.prompt.prompt({ sessionID: ctx.chat.id, ...ClaudeEngineFixture.say("run the shell") })
    const messages = yield* ctx.sessions.messages({ sessionID: ctx.chat.id })
    const replies = messages.flatMap((item) => item.info.role === "assistant" ? [item.info] : [])
    expect(replies.every((info) => info.modelID === model)).toBe(true)
    expect(replies.reduce((sum, info) => sum + info.tokens.reasoning, 0)).toBe(7)
    expect(replies.reduce((sum, info) => sum + info.tokens.output + info.tokens.reasoning, 0)).toBe(20)
    expect(replies.at(-1)?.cost).toBe(0.42)
    const part = messages.flatMap((item) => item.parts).find((part) => part.type === "tool" && part.callID === "bash")
    if (part?.type !== "tool" || part.state.status !== "error") throw new Error("Expected failed Bash evidence")
    expect(part.state.metadata).toMatchObject({ exit: 137, timeout: true, timedOutAfterMs: 1000,
      aborted: true, interrupted: true, truncated: true, outputPath: "/tmp/failed-bash.txt" })
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  }), 30_000)

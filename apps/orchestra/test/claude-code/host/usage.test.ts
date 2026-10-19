import { expect } from "bun:test"
import { Effect } from "effect"
import { ClaudeEngineFixture } from "../engine-fixture"
import { MessageID } from "@/session/schema"
import { getSessionContext, getSessionCost } from "../../../../../packages/app-shell/src/components/session/session-context-metrics"
import { normalizeSessionInfo } from "../../../../../packages/app-shell/src/utils/session"
import { normalizeSessionMessages } from "../../../../../packages/app-shell/src/utils/session-message"

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
        content: [{ type: "text", text: "The shell failed." }], stop_reason: "end_turn", usage: { input_tokens: 20, output_tokens: 12, output_tokens_details: { thinking_tokens: 7 } } } }
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


ClaudeEngineFixture.it.instance("reopened native metrics preserve provenance and current context across a same-model API turn", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const ctx = yield* ClaudeEngineFixture.setup()
    const frame = ClaudeEngineFixture.frame
    const model = "claude-sonnet-4-5-20250929"
    ClaudeEngineFixture.state.scripts.push(async function* (input) {
      const send = await input[Symbol.asyncIterator]().next()
      yield { type: "system", subtype: "init", model, ...frame }
      yield { type: "assistant", ...frame, uuid: "native-usage", user_message_uuid: send.value?.uuid,
        message: { id: "native-usage", model, content: [{ type: "text", text: "Native" }], stop_reason: "end_turn",
          usage: { input_tokens: 120000, output_tokens: 20 } } }
      yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.12, ...frame,
        modelUsage: { [model]: { inputTokens: 120000, outputTokens: 20, thinkingTokens: 40, cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.12, contextWindow: 200000, maxOutputTokens: 32000 } } }
      for await (const _ of input) {}
    })
    yield* ctx.prompt.prompt({ sessionID: ctx.chat.id, ...ClaudeEngineFixture.say("native context") })
    const saved = yield* ctx.sessions.get(ctx.chat.id)
    yield* ctx.sessions.setMetadata({ sessionID: ctx.chat.id, metadata: { ...saved.metadata,
      claudeCode: { ...saved.metadata?.claudeCode, context: { totalTokens: 5000, maxTokens: 200000, percentage: 2.5 } } } })
    const restored = normalizeSessionInfo(yield* ctx.sessions.get(ctx.chat.id))
    const projected = yield* ctx.sessions.messages({ sessionID: ctx.chat.id })
    const native = projected.find((item) => item.info.role === "assistant")!.info
    if (native.role !== "assistant") throw new Error("Expected native assistant")
    const api = yield* ctx.sessions.updateMessage({ ...native, id: MessageID.ascending(), cost: 0.3,
      tokens: { input: 20, output: 10, reasoning: 0, cache: { read: 0, write: 0 } } })
    const reopened = yield* ctx.sessions.messages({ sessionID: ctx.chat.id })
    const providers = [{ id: "anthropic", models: { [model]: { cost: { input: 1, output: 2 }, limit: { context: 1000000 } } } }]
    expect(getSessionContext(projected.map((item) => item.info), providers, {}, restored.metadata))
      .toMatchObject({ total: 5000, limit: 200000, usage: 2.5 })
    expect(getSessionContext(reopened.map((item) => item.info), providers, {}, restored.metadata))
      .toMatchObject({ message: { id: api.id }, total: 30, limit: 1000000, usage: 0 })
    expect(getSessionCost(0.42, reopened.map((item) => item.info), providers, {}, restored.metadata)).toBeCloseTo(0.42)
    // Feed the persisted assistant values through the actual V2-to-compatible message normalizer.
    const normalized = normalizeSessionMessages(ctx.chat.id, [
      { type: "user", id: ctx.chat.id, time: { created: 1 }, text: "Persisted" },
      ...[native, api].map((info) => ({ type: "assistant" as const, id: info.id, agent: info.agent,
        model: { id: info.modelID, providerID: info.providerID }, time: info.time, tokens: info.tokens, cost: info.cost, content: [] })),
    ])
    expect(getSessionContext(normalized.messages, providers, {}, restored.metadata))
      .toMatchObject({ message: { id: api.id }, total: 30, limit: 1000000 })
    expect(getSessionCost(0.42, normalized.messages, providers, {}, restored.metadata)).toBeCloseTo(0.42)
    const withoutSnapshot = { ...restored.metadata, claudeCode: { ...saved.metadata?.claudeCode, context: undefined } }
    expect(getSessionContext([native], providers, {}, withoutSnapshot)).toMatchObject({ total: 120020, limit: 200000, usage: 60 })
  }), 30_000)

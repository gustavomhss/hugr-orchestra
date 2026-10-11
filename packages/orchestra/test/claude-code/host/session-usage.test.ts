import { expect } from "bun:test"
import { Effect } from "effect"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeHost } from "@/claude-code/host/session"
import { Provider } from "@/provider/provider"
import { ClaudeEngineFixture } from "../engine-fixture"

const model = "claude-haiku-4-5-20251001"
const contextWindow = 512_000
const maxOutputTokens = 32_000

const usageReply: ClaudeEngineFixture.Script = async function* (input) {
  const next = await input[Symbol.asyncIterator]().next()
  if (next.done) return
  yield { type: "system", subtype: "init", model, ...ClaudeEngineFixture.frame }
  yield { ...next.value, session_id: ClaudeEngineFixture.frame.session_id }
  yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(),
    message: { id: crypto.randomUUID(), model, content: [{ type: "text", text: "answer" }], stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 } } }
  yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.1,
    modelUsage: { [model]: { inputTokens: 10, outputTokens: 5, thinkingTokens: 9, cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0, webSearchRequests: 0, costUSD: 0.1, contextWindow, maxOutputTokens } },
    ...ClaudeEngineFixture.frame }
  for await (const _ of input) {}
}

ClaudeEngineFixture.it.instance("host SDK context window and output limits update the provider catalog", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const provider = yield* Provider.Service
  ClaudeEngineFixture.state.scripts.push(usageReply)
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("measure context") })
  expect((yield* provider.list())[ProviderV2.ID.make("anthropic")].models[model]?.limit)
    .toMatchObject({ context: contextWindow, output: maxOutputTokens })
}), 30_000)

ClaudeEngineFixture.it.instance("resuming a native session does not charge persisted thinking usage twice", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  ClaudeEngineFixture.state.scripts.push(usageReply, usageReply)
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("first turn") })
  yield* host.release(setup.chat.id)
  yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("resumed turn") })
  const messages = yield* setup.sessions.messages({ sessionID: setup.chat.id })
  expect(messages.flatMap((item) => item.info.role === "assistant" ? [item.info.tokens.reasoning] : []).reduce((sum, value) => sum + value, 0)).toBe(9)
}), 30_000)

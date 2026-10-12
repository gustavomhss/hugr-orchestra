import { expect } from "bun:test"
import { Effect } from "effect"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeHost } from "@/claude-code/host/session"
import { Provider } from "@/provider/provider"
import { ClaudeEngineFixture } from "../engine-fixture"

const model = "claude-haiku-4-5-20251001"
const contextWindow = 512_000
const maxOutputTokens = 32_000

function usageReply(input = { thinking: 9, totalThinking: 9, cost: 0.1, totalOutput: 20 }): ClaudeEngineFixture.Script {
  return async function* (messages, params) {
    const next = await messages[Symbol.asyncIterator]().next()
    if (next.done) return
    const native = params.options?.forkSession ? params.options.sessionId : "sdk-1"
    const frame = { ...ClaudeEngineFixture.frame, session_id: native }
    yield { type: "system", subtype: "init", model, ...frame }
    yield { ...next.value, session_id: native }
    yield {
      type: "assistant",
      ...frame,
      uuid: crypto.randomUUID(),
      user_message_uuid: next.value.uuid,
      message: {
        id: crypto.randomUUID(),
        model,
        content: [{ type: "text", text: "answer" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 20, output_tokens_details: { thinking_tokens: input.thinking } },
      },
    }
    yield {
      type: "result",
      subtype: "success",
      is_error: false,
      stop_reason: "end_turn",
      total_cost_usd: input.cost,
      modelUsage: {
        [model]: {
          inputTokens: 10,
          outputTokens: input.totalOutput,
          thinkingTokens: input.totalThinking,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          webSearchRequests: 0,
          costUSD: input.cost,
          contextWindow,
          maxOutputTokens,
        },
      },
      ...frame,
    }
    for await (const _ of messages) {
    }
  }
}

ClaudeEngineFixture.it.instance(
  "host SDK context window and output limits update the provider catalog",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const setup = yield* ClaudeEngineFixture.setup()
      const provider = yield* Provider.Service
      ClaudeEngineFixture.state.scripts.push(usageReply())
      yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("measure context") })
      expect((yield* provider.list())[ProviderV2.ID.make("anthropic")].models[model]?.limit).toMatchObject({
        context: contextWindow,
        output: maxOutputTokens,
      })
    }),
  30_000,
)

ClaudeEngineFixture.it.instance(
  "resume, counter resets and forks charge real-message thinking and cost deltas",
  () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const setup = yield* ClaudeEngineFixture.setup()
      const host = yield* ClaudeHost.Service
      ClaudeEngineFixture.state.scripts.push(
        usageReply(),
        usageReply({ thinking: 5, totalThinking: 14, cost: 0.14, totalOutput: 40 }),
        usageReply({ thinking: 3, totalThinking: 3, cost: 0.02, totalOutput: 20 }),
        usageReply({ thinking: 4, totalThinking: 7, cost: 0.03, totalOutput: 40 }),
      )
      yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("first turn") })
      yield* host.release(setup.chat.id)
      yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("resumed turn") })
      const resumed = (yield* setup.sessions.messages({ sessionID: setup.chat.id })).flatMap((item) =>
        item.info.role === "assistant" ? [item.info] : [],
      )
      expect(resumed.map((item) => item.tokens.reasoning)).toEqual([9, 5])
      expect(resumed[0].cost).toBeCloseTo(0.1)
      expect(resumed[1].cost).toBeCloseTo(0.04)
      expect((yield* setup.sessions.get(setup.chat.id)).metadata?.claudeCode?.modelUsage?.[model].thinkingTokens).toBe(
        14,
      )
      yield* host.release(setup.chat.id)
      yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("native counter reset") })
      const reset = (yield* setup.sessions.messages({ sessionID: setup.chat.id })).findLast(
        (item) => item.info.role === "assistant",
      )?.info
      expect(reset?.role === "assistant" && reset.tokens.reasoning).toBe(3)
      expect(reset?.role === "assistant" && reset.cost).toBeCloseTo(0.02)
      const fork = yield* setup.sessions.fork({ sessionID: setup.chat.id })
      yield* setup.prompt.prompt({ sessionID: fork.id, ...ClaudeEngineFixture.say("forked turn") })
      const branch = (yield* setup.sessions.messages({ sessionID: fork.id })).findLast(
        (item) => item.info.role === "assistant",
      )?.info
      expect(branch?.role === "assistant" && branch.tokens.reasoning).toBe(4)
      expect(branch?.role === "assistant" && branch.cost).toBeCloseTo(0.03)
      expect(ClaudeEngineFixture.state.queries[3].options).toMatchObject({ resume: "sdk-1", forkSession: true })
      expect(
        (yield* setup.sessions.messages({ sessionID: setup.chat.id })).flatMap((item) =>
          item.info.role === "assistant" ? [item.info.tokens.reasoning] : [],
        ),
      ).toEqual([9, 5, 3])
      yield* host.release(setup.chat.id)
      yield* host.release(fork.id)
    }),
  30_000,
)

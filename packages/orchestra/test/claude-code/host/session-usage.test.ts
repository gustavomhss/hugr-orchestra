import { expect } from "bun:test"
import { Effect } from "effect"
import type { ModelUsage } from "@anthropic-ai/claude-agent-sdk"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeHost } from "@/claude-code/host/session"
import { Provider } from "@/provider/provider"
import { ClaudeEngineFixture } from "../engine-fixture"
import { getSessionCost } from "../../../../app/src/components/session/session-context-metrics"

const model = "claude-haiku-4-5-20251001"
const contextWindow = 512_000
const maxOutputTokens = 32_000

ClaudeEngineFixture.it.instance("successful, failed and replayed SDK totals charge exactly once, including errors without an assistant frame", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const f = yield* ClaudeEngineFixture.setup()
    const host = yield* ClaudeHost.Service
    const results = [
      { uuid: "paid-success", cost: 0.1, error: false, assistant: true },
      { uuid: "paid-error", cost: 0.14, error: true, assistant: true },
      { uuid: "paid-recovery", cost: 0.2, error: false, assistant: true },
      { uuid: "paid-error", cost: 0.14, error: true, assistant: true },
      { uuid: "paid-success", cost: 0.1, error: false, assistant: true },
      { uuid: "paid-no-assistant", cost: 0.24, error: true, assistant: false },
    ]
    ClaudeEngineFixture.state.scripts.push(async function* (input) {
      for (const [index, result] of results.entries()) {
        const send = await input[Symbol.asyncIterator]().next()
        if (send.done) return
        yield { type: "system", subtype: "init", model, ...ClaudeEngineFixture.frame }
        yield { ...send.value, session_id: "sdk-1" }
        if (result.assistant) yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: `paid-answer-${index}`,
          user_message_uuid: send.value.uuid, message: { id: `paid-answer-${index}`, model,
            content: [{ type: "text", text: "provider response" }], stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 8, output_tokens_details: { thinking_tokens: 3 } } } }
        yield { type: "result", ...ClaudeEngineFixture.frame, uuid: result.uuid, total_cost_usd: result.cost,
          // Requested model alone cannot attribute a no-frame failure. SDK reports its own compatible model total.
          ...(!result.assistant ? { modelUsage: { [model]: {
            inputTokens: 50, outputTokens: 40, thinkingTokens: 15,
            cacheReadInputTokens: 0, cacheCreationInputTokens: 0, webSearchRequests: 0,
            costUSD: result.cost, contextWindow, maxOutputTokens,
            // SDK documents an omitted basis as list; make this observed fixture's known basis explicit.
            costBasis: "list",
          } satisfies ModelUsage } } : {}),
          ...(result.error ? result.assistant ? { subtype: "error_during_execution", is_error: true, errors: ["True SDK failure"] }
            : { subtype: "success", is_error: true, result: "True SDK failure" }
            : { subtype: "success", is_error: false, stop_reason: "end_turn" }) }
      }
      for await (const _ of input) {}
    }, async function* (input) {
      const send = await input[Symbol.asyncIterator]().next()
      if (send.done) return
      yield { type: "system", subtype: "init", model, ...ClaudeEngineFixture.frame }
      yield { ...send.value, session_id: "sdk-1" }
      yield { type: "result", ...ClaudeEngineFixture.frame, uuid: "paid-error", total_cost_usd: 0.14,
        subtype: "error_during_execution", is_error: true, errors: ["True SDK failure"] }
      for await (const _ of input) {}
    }, usageReply({ thinking: 2, totalThinking: 2, cost: 0.03, totalOutput: 8 }))
    for (const [index, result] of results.entries()) {
      yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say(`cost turn ${index}`) })
      const saved = yield* f.sessions.get(f.chat.id)
      const all = yield* f.sessions.messages({ sessionID: f.chat.id })
      const replies = all.flatMap((item) => item.info.role === "assistant" ? [item.info] : [])
      const last = replies.at(-1)
      if (!last) throw new Error("Missing settled native reply")
      expect(last.finish).toBe(result.error ? "error" : "stop")
      expect(!!last.error).toBe(result.error)
      if (result.error) {
        expect(last.error?.name).not.toBe("MessageAbortedError")
        expect(JSON.stringify(last.error)).toContain("True SDK failure")
      }
      expect(saved.metadata?.claudeCode?.uuids[last.id]).toBeTruthy()
      expect(saved.metadata?.claudeCode?.cost).toBeCloseTo(index === 3 || index === 4 ? 0.2 : result.cost)
      expect(last.tokens.reasoning).toBe(result.assistant ? 3 : 0)
      if (!result.assistant) expect(last.tokens).toEqual({ input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })
      const total = index === 3 || index === 4 ? 0.2 : result.cost
      expect(replies.reduce((sum, reply) => sum + reply.cost, 0)).toBeCloseTo(total)
      // Aggregate projection stays correct when the client only loaded the failed reply's page.
      expect(saved.cost).toBeCloseTo(total)
      expect(getSessionCost(saved.cost, [last], [], {}, saved.metadata)).toBeCloseTo(total)
    }
    yield* host.release(f.chat.id)
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("replay an older failed total after reopen") })
    expect((yield* f.sessions.get(f.chat.id)).cost).toBeCloseTo(0.24)
    yield* host.release(f.chat.id)
    yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("new producer cost epoch") })
    const restarted = yield* f.sessions.get(f.chat.id)
    expect(restarted.cost).toBeCloseTo(0.27)
    expect((yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) =>
      message.info.role === "assistant" ? [message.info.cost] : []).reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(0.27)
    yield* host.release(f.chat.id)
  }), 30_000)

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
          inputTokens: input.totalOutput / 2,
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
        usageReply({ thinking: 4, totalThinking: 4, cost: 0.03, totalOutput: 20 }),
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

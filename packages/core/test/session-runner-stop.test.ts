import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { EventV2 } from "@orchestra/core/event"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunner } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect"
import { Harness } from "./session-runner-harness"

const requests: LLMRequest[] = []
let source: Stream.Stream<LLMEvent> = Stream.empty
let execute = (text: string): Effect.Effect<{ text: string }> => Effect.succeed({ text })
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      return source
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const echo = Layer.effectDiscard(
  ToolRegistry.Service.use((registry) =>
    registry.register({
      echo: Tool.make({
        description: "Echo text",
        input: Schema.Struct({ text: Schema.String }),
        output: Schema.Struct({ text: Schema.String }),
        toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
        execute: ({ text }) => Effect.suspend(() => execute(text)),
      }),
    }),
  ),
)
const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake", provider: "fake", route }))),
  echo,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
})

const setup = Effect.gen(function* () {
  yield* Harness.setup
  const session = yield* SessionV2.Service
  requests.length = 0
  source = Stream.empty
  execute = (text) => Effect.succeed({ text })
  yield* Effect.addFinalizer(() =>
    session.interrupt(Harness.sessionID).pipe(
      Effect.ensuring(Effect.sync(() => {
        source = Stream.empty
        execute = (text) => Effect.succeed({ text })
        requests.length = 0
      })),
    ),
  )
  return session
})

const observe = Effect.gen(function* () {
  const events = yield* EventV2.Service
  const steps: (SessionEvent.Step.Ended | SessionEvent.Step.Failed)[] = []
  const toolFailures: SessionEvent.Tool.Failed[] = []
  const unsubscribe = yield* events.listen((event) => Effect.sync(() => {
    if (Schema.is(SessionEvent.Step.Ended)(event) || Schema.is(SessionEvent.Step.Failed)(event)) {
      if (event.data.sessionID === Harness.sessionID) steps.push(event)
    }
    if (Schema.is(SessionEvent.Tool.Failed)(event) && event.data.sessionID === Harness.sessionID) toolFailures.push(event)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  return { steps, toolFailures }
})

describe("SessionRunner Stop", () => {
  it.effect("fails a finished provider tool step after accounting when Stop interrupts its local tool", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const observed = yield* observe
      const toolStarted = yield* Deferred.make<void>()
      const toolGate = yield* Deferred.make<void>()
      const providerCompleted = yield* Deferred.make<void>()
      execute = (text) => Deferred.succeed(toolStarted, undefined).pipe(
        Effect.andThen(Deferred.await(toolGate)),
        Effect.as({ text }),
      )
      source = Stream.concat(
        Stream.fromIterable([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.toolCall({ id: "call-stop", name: "echo", input: { text: "blocked" } }),
          LLMEvent.stepFinish({
            index: 0,
            reason: "tool-calls",
            usage: {
              inputTokens: 10,
              nonCachedInputTokens: 8,
              outputTokens: 4,
              reasoningTokens: 1,
              cacheReadInputTokens: 2,
              cacheWriteInputTokens: 0,
              cost: 0.25,
            },
          }),
          LLMEvent.finish({ reason: "tool-calls" }),
        ]),
        // This tail runs only after the provider events were consumed, never as an interrupt finalizer.
        Stream.fromEffect(Deferred.succeed(providerCompleted, undefined)).pipe(Stream.drain),
      )
      yield* session.prompt({ sessionID: Harness.sessionID, prompt: Prompt.make({ text: "Stop the tool" }), resume: false })
      const run = yield* session.resume(Harness.sessionID).pipe(Effect.exit, Effect.forkChild)
      yield* Deferred.await(toolStarted)
      yield* Deferred.await(providerCompleted)
      expect(yield* session.active).toEqual(new Set([Harness.sessionID]))

      yield* session.interrupt(Harness.sessionID)
      const exit = yield* Fiber.join(run)

      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect(yield* session.active).toEqual(new Set())
      expect(requests).toHaveLength(1)
      const context = yield* session.context(Harness.sessionID)
      expect(context).toHaveLength(2)
      const assistant = context[1]
      if (!assistant || assistant.type !== "assistant") return yield* Effect.die("Missing stopped assistant")
      expect(assistant).toMatchObject({
        finish: "error",
        error: { message: SessionRunner.INTERRUPTED_TURN },
        cost: 0.25,
        tokens: { input: 8, output: 3, reasoning: 1, cache: { read: 2, write: 0 } },
        content: [{
          type: "tool",
          id: "call-stop",
          state: { status: "error", error: { message: "Tool execution interrupted" } },
        }],
      })
      expect(assistant.content).toHaveLength(1)
      expect(assistant.time.completed).toBeDefined()
      // Exact order also excludes duplicate failures and any later Ended revival of tool-calls.
      expect(observed.steps.map((event) => event.type)).toEqual([SessionEvent.Step.Ended.type, SessionEvent.Step.Failed.type])
      expect(observed.steps.map((event) => event.data.assistantMessageID)).toEqual([assistant.id, assistant.id])
      expect(observed.steps[0]?.data).toMatchObject({
        finish: "tool-calls", cost: 0.25, usageKnown: true,
        tokens: { input: 8, output: 3, reasoning: 1, cache: { read: 2, write: 0 } },
      })
      expect(observed.steps[1]?.data).toMatchObject({ error: { message: SessionRunner.INTERRUPTED_TURN } })
      expect(observed.toolFailures).toHaveLength(1)
      expect(observed.toolFailures[0]?.data).toMatchObject({
        assistantMessageID: assistant.id, callID: "call-stop", error: { message: "Tool execution interrupted" },
      })

      yield* session.interrupt(Harness.sessionID)
      expect(observed.steps).toHaveLength(2)
      expect(observed.toolFailures).toHaveLength(1)
      expect(requests).toHaveLength(1)
    }),
  )

  it.effect("keeps a normally completed text turn stopped without a failure event", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const observed = yield* observe
      source = Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "text-complete" }),
        LLMEvent.textDelta({ id: "text-complete", text: "Done" }),
        LLMEvent.textEnd({ id: "text-complete" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ])
      yield* session.prompt({ sessionID: Harness.sessionID, prompt: Prompt.make({ text: "Finish normally" }), resume: false })

      yield* session.resume(Harness.sessionID)

      expect(yield* session.active).toEqual(new Set())
      expect(requests).toHaveLength(1)
      expect(yield* session.context(Harness.sessionID)).toMatchObject([
        { type: "user" },
        { type: "assistant", finish: "stop", content: [{ type: "text", text: "Done" }] },
      ])
      expect(observed.steps.map((event) => event.type)).toEqual([SessionEvent.Step.Ended.type])
      expect(observed.toolFailures).toHaveLength(0)
    }),
  )

  it.effect("fails midstream text on Stop without fabricating step accounting", () =>
    Effect.gen(function* () {
      const session = yield* setup
      const observed = yield* observe
      const textConsumed = yield* Deferred.make<void>()
      source = Stream.concat(
        Stream.fromIterable([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "text-partial" }),
          LLMEvent.textDelta({ id: "text-partial", text: "Partial answer" }),
        ]),
        Stream.concat(
          Stream.fromEffect(Deferred.succeed(textConsumed, undefined)).pipe(Stream.drain),
          Stream.never,
        ),
      )
      yield* session.prompt({ sessionID: Harness.sessionID, prompt: Prompt.make({ text: "Stop midstream" }), resume: false })
      const run = yield* session.resume(Harness.sessionID).pipe(Effect.exit, Effect.forkChild)
      yield* Deferred.await(textConsumed)
      expect(yield* session.active).toEqual(new Set([Harness.sessionID]))

      yield* session.interrupt(Harness.sessionID)
      const exit = yield* Fiber.join(run)

      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect(yield* session.active).toEqual(new Set())
      expect(requests).toHaveLength(1)
      const context = yield* session.context(Harness.sessionID)
      expect(context).toHaveLength(2)
      const assistant = context[1]
      if (!assistant || assistant.type !== "assistant") return yield* Effect.die("Missing partial assistant")
      expect(assistant).toMatchObject({
        finish: "error", error: { message: SessionRunner.INTERRUPTED_TURN },
        content: [{ type: "text", id: "text-partial", text: "Partial answer" }],
      })
      expect(assistant.time.completed).toBeDefined()
      expect(observed.steps.map((event) => event.type)).toEqual([SessionEvent.Step.Failed.type])
      expect(observed.steps[0]?.data.assistantMessageID).toBe(assistant.id)
      expect(observed.toolFailures).toHaveLength(0)
    }),
  )
})

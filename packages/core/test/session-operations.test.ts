import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { Effect, Exit, Layer, Stream } from "effect"
import { Harness, sessionID } from "./session-runner-harness"

// V2 Session operations beside prompts that need a model: a requested compaction and a one-off generation. And a drain
// that fails before any provider turn leaves a failed step behind instead of nothing.

const requests: LLMRequest[] = []
const reply = (text: string) =>
  Stream.make(
    LLMEvent.stepStart({ index: 0 }),
    LLMEvent.textStart({ id: "text" }),
    LLMEvent.textDelta({ id: "text", text }),
    LLMEvent.textEnd({ id: "text" }),
    LLMEvent.stepFinish({ index: 0, reason: "stop" }),
    LLMEvent.finish({ reason: "stop" }),
  )

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      return reply(`reply ${requests.length}`)
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)
const common = {
  client,
  echo: Layer.empty,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
}
const it = Harness.make({
  ...common,
  models: SessionRunnerModel.layerWith(() =>
    Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })),
  ),
})
const unavailable = Harness.make({
  ...common,
  models: SessionRunnerModel.layerWith((session) =>
    Effect.fail(new SessionRunnerModel.ModelNotSelectedError({ sessionID: session.id })),
  ),
})

describe("SessionV2 operations", () => {
  it.live("compacts the conversation on request into a manual checkpoint", () =>
    Effect.gen(function* () {
      requests.length = 0
      yield* Harness.setup
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Plan the change" }), resume: false })
      yield* session.resume(sessionID)

      expect(yield* session.compact({ sessionID })).toBe(true)

      const context = yield* session.context(sessionID)
      expect(context[0]).toMatchObject({ type: "compaction", reason: "manual", summary: "reply 2" })
    }),
  )

  it.live("generates text after the history without recording it", () =>
    Effect.gen(function* () {
      requests.length = 0
      yield* Harness.setup
      const session = yield* SessionV2.Service
      const before = (yield* session.context(sessionID)).length

      expect(yield* session.generate({ sessionID, prompt: "Name this session" })).toBe("reply 1")
      expect(requests[0]?.tools).toEqual([])
      expect((yield* session.context(sessionID)).length).toBe(before)
    }),
  )

  unavailable.live("records a drain that fails before its provider turn as a failed step", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Hello" }), resume: false })

      expect(Exit.isFailure(yield* session.resume(sessionID).pipe(Effect.exit))).toBe(true)

      const context = yield* session.context(sessionID)
      expect(context.at(-1)).toMatchObject({
        type: "assistant",
        error: { type: "unknown", message: `No model is available for session ${sessionID}` },
      })
    }),
  )
})

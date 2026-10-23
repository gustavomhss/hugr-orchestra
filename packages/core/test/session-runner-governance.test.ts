import { describe, expect } from "bun:test"
import { LLMClient, LLMEvent, Model, ToolFailure, type LLMClientShape, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { SessionV2 } from "@orchestra/core/session"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { SessionMessage } from "@orchestra/core/session/message"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { Effect, Exit, Layer, Stream } from "effect"
import { Harness, sessionID } from "./session-runner-harness"

// The runner consults the Location's Task governance before each provider turn and the compaction strategy's
// `transform` and `afterStep` hooks around each step.

const model = Model.make({ id: "fake-model", provider: "fake", route })
const requests: LLMRequest[] = []
const turns: SessionV2.ID[] = []
const steps: { sessionID: SessionV2.ID; tokens: unknown; model: string }[] = []
let refuse = false

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: ((request: LLMRequest) => {
      requests.push(request)
      return Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "text" }),
        LLMEvent.textDelta({ id: "text", text: "Answer" }),
        LLMEvent.textEnd({ id: "text" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop", usage: { inputTokens: 7, outputTokens: 3 } }),
      )
    }) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

const governance = Layer.succeed(
  TaskGovernance.Service,
  TaskGovernance.Service.of({
    ...TaskGovernance.allowAll,
    beforeTurn: (session) =>
      Effect.sync(() => turns.push(session.id)).pipe(
        Effect.andThen(refuse ? Effect.fail(new ToolFailure({ message: "Dispatch is no longer current" })) : Effect.void),
      ),
  }),
)

const compaction = Layer.succeed(
  SessionCompaction.Service,
  SessionCompaction.Service.of({
    compact: () => Effect.succeed(false),
    compactIfNeeded: () => Effect.succeed(false),
    compactAfterOverflow: () => Effect.succeed(false),
    // A strategy view: every user message is masked before the request is built.
    transform: (input) =>
      Effect.succeed(
        input.messages.map((message) => (message.type === "user" ? { ...message, text: `masked:${message.text}` } : message)),
      ),
    afterStep: (input) =>
      Effect.sync(() => steps.push({ sessionID: input.sessionID, tokens: input.tokens, model: input.model.id })),
  }),
)

const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(model)),
  echo: Layer.empty,
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  governance,
  compaction,
})

const userTexts = (request: LLMRequest) =>
  request.messages
    .filter((message) => message.role === "user")
    .flatMap((message) => message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])))

describe("SessionRunner governance and compaction hooks", () => {
  it.effect("asks governance before the turn, builds the request from the transformed history and reports the step", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      requests.length = 0
      turns.length = 0
      steps.length = 0
      refuse = false
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "First" }), resume: false })
      yield* session.resume(sessionID)

      expect(turns).toEqual([sessionID])
      expect(requests).toHaveLength(1)
      expect(userTexts(requests[0])).toEqual(["masked:First"])
      // The transform is a view: the recorded history keeps the original prompt.
      const messages = yield* session.messages({ sessionID, order: "asc" })
      expect(messages.find((message) => message.type === "user")).toMatchObject({ text: "First" })
      expect(steps).toEqual([
        { sessionID, model: "fake-model", tokens: expect.objectContaining({ output: 3 }) },
      ])
    }),
  )

  it.effect("records a beforeTurn refusal as the turn's error without calling the provider", () =>
    Effect.gen(function* () {
      yield* Harness.setup
      requests.length = 0
      turns.length = 0
      steps.length = 0
      refuse = true
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "Refused" }), resume: false })
      const exit = yield* session.resume(sessionID).pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      expect(turns).toEqual([sessionID])
      expect(requests).toHaveLength(0)
      expect(steps).toHaveLength(0)
      const failed = (yield* session.messages({ sessionID, order: "asc" })).find(
        (message): message is SessionMessage.Assistant => message.type === "assistant",
      )
      expect(failed?.error).toMatchObject({ type: "unknown", message: "Dispatch is no longer current" })
      expect(failed?.time.completed).toBeDefined()
    }),
  )
})

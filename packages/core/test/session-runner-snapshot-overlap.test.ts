import { expect } from "bun:test"
import { LLMClient, Model, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { fragmentFixture, Harness, sessionID } from "./session-runner-harness"

const order: string[] = []
let releaseCapture: Deferred.Deferred<void> | undefined
let releaseStream: Deferred.Deferred<void> | undefined
const requests: LLMRequest[] = []

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    generate: () => Effect.die("unused"),
    stream: (request) =>
      Stream.unwrap(
        Effect.gen(function* () {
          requests.push(request)
          order.push("stream")
          const gate = releaseStream
          if (gate) yield* Deferred.await(gate)
          return Stream.fromIterable(fragmentFixture("text", "text", ["ok"]).completeEvents)
        }),
      ),
  }),
)

const slowSnapshot = Layer.succeed(
  Snapshot.Service,
  Snapshot.Service.of({
    capture: () =>
      Effect.gen(function* () {
        const start = order.includes("capture-start")
        order.push(start ? "capture-again" : "capture-start")
        if (!start) {
          const gate = releaseCapture
          if (gate) yield* Deferred.await(gate)
          order.push("capture-end")
          return Snapshot.ID.make("snap-start")
        }
        return Snapshot.ID.make("snap-end")
      }),
    files: () => Effect.succeed([]),
    diff: () => Effect.succeed([]),
    preview: () => Effect.succeed([]),
    restore: () => Effect.void,
    checkout: () => Effect.void,
  }),
)

const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({}))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  replacements: [[Snapshot.node, slowSnapshot]],
})

it.effect("the provider stream starts before snapshot capture finishes, and the step still records that snapshot", () =>
  Effect.gen(function* () {
    order.length = 0
    requests.length = 0
    releaseCapture = yield* Deferred.make<void>()
    releaseStream = yield* Deferred.make<void>()
    yield* Harness.setup
    const session = yield* SessionV2.Service
    yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
    const running = yield* session.resume(sessionID).pipe(Effect.forkChild)

    let spins = 0
    while (!order.includes("stream") || !order.includes("capture-start")) {
      spins++
      if (spins > 5000) return yield* Effect.die(`overlap not observed: ${order.join(",")}`)
      yield* Effect.yieldNow
    }
    expect(order).not.toContain("capture-end")

    yield* Deferred.succeed(releaseCapture, undefined)
    while (!order.includes("capture-end")) yield* Effect.yieldNow
    yield* Deferred.succeed(releaseStream, undefined)
    const done = yield* Fiber.await(running)
    expect(done).toMatchObject({ _tag: "Success" })
    if (Exit.isFailure(done)) return

    const messages = yield* session.messages({ sessionID })
    expect(messages.find((message) => message.type === "assistant")).toMatchObject({
      snapshot: { start: "snap-start", end: "snap-end", files: [] },
    })
  }),
)

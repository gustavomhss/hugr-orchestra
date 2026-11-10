import { expect } from "bun:test"
import { LLMClient, LLMEvent, Model, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Deferred, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect"
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

const hostOrder: string[] = []
let hostRelease: Deferred.Deferred<void> | undefined
const hostSettled: string[] = []
const providerSettled: string[] = []

function settledAfterPublish(record: string[]) {
  const settleAt = record.indexOf("settle")
  return settleAt > 0 && record.slice(0, settleAt).includes("published") && record.filter((item) => item === "settle").length === 1
}

function watchToolCalled(record: string[]) {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const called = new Set([SessionEvent.Tool.Called.type, EventV2.versionedType(SessionEvent.Tool.Called.type, 1)])
    const unsubscribe = yield* events.listen((event) => {
      if (called.has(event.type)) record.push("published")
      return Effect.void
    })
    yield* Effect.addFinalizer(() => unsubscribe)
  })
}

function echo(record: string[]) {
  return Tool.make({
    description: "Echo text",
    input: Schema.Struct({ text: Schema.String }),
    output: Schema.Struct({ text: Schema.String }),
    toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
    execute: () => {
      record.push("settle")
      return Effect.succeed({ text: "ok" })
    },
  })
}

const heldSnapshot = Layer.succeed(
  Snapshot.Service,
  Snapshot.Service.of({
    capture: () =>
      Effect.gen(function* () {
        const start = hostOrder.includes("capture-start")
        hostOrder.push(start ? "capture-again" : "capture-start")
        if (start) return Snapshot.ID.make("snap-end")
        let turns = 0
        while (turns < 20) {
          turns++
          yield* Effect.yieldNow
        }
        hostOrder.push("capture-yielded")
        const gate = hostRelease
        if (gate) yield* Deferred.await(gate)
        hostOrder.push("capture-end")
        return Snapshot.ID.make("snap-start")
      }),
    files: () => Effect.succeed([]),
    diff: () => Effect.succeed([]),
    preview: () => Effect.succeed([]),
    restore: () => Effect.void,
    checkout: () => Effect.void,
  }),
)

const dyingClient = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    generate: () => Effect.die("unused"),
    stream: () => Stream.die("a hosted turn must not call llm.stream"),
  }),
)

const host: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "claudeCode",
  stream: (turn) =>
    Stream.unwrap(
      Effect.gen(function* () {
        hostOrder.push(hostOrder.includes("capture-end") ? "host-after-capture" : "host-before-capture")
        yield* turn.execute({ id: "call-1", name: "echo", input: { text: "hi" } })
        return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      }),
    ),
}

const hosted = Harness.make({
  client: dyingClient,
  models: SessionRunnerModel.layerWith(() => Effect.die("a hosted turn must not resolve a model")),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({ echo: echo(hostSettled) }))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  hosts: Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host])),
  replacements: [[Snapshot.node, heldSnapshot]],
})

hosted.effect("a host joins the snapshot before its stream, and tool settle sees the published call", () =>
  Effect.gen(function* () {
    hostOrder.length = 0
    hostSettled.length = 0
    hostRelease = yield* Deferred.make<void>()
    yield* Harness.setup
    yield* watchToolCalled(hostSettled)
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) =>
      draft.update(AgentV2.defaultID, (agent) => {
        agent.engine = "claude-code"
        agent.mode = "primary"
      }),
    )
    const session = yield* SessionV2.Service
    yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
    const running = yield* session.resume(sessionID).pipe(Effect.forkChild)
    let spins = 0
    while (!hostOrder.includes("capture-yielded")) {
      spins++
      if (spins > 5000) return yield* Effect.die(`host capture did not start: ${hostOrder.join(",")}`)
      yield* Effect.yieldNow
    }
    spins = 0
    while (!hostOrder.includes("host-before-capture") && spins < 5000) {
      spins++
      yield* Effect.yieldNow
    }
    if (hostOrder.includes("host-before-capture")) return yield* Effect.die(`host started before capture finished: ${hostOrder.join(",")}`)
    yield* Deferred.succeed(hostRelease, undefined)
    const done = yield* Fiber.await(running)
    expect(done).toMatchObject({ _tag: "Success" })
    expect(hostOrder).toContain("host-after-capture")
    expect(hostOrder.indexOf("capture-end")).toBeLessThan(hostOrder.indexOf("host-after-capture"))
    expect(settledAfterPublish(hostSettled), hostSettled.join(",")).toBe(true)
  }),
)

let toolTurns = 0
const toolClient = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    generate: () => Effect.die("unused"),
    stream: () => {
      toolTurns++
      if (toolTurns > 1) return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      return Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({ id: "call-1", name: "echo", input: { text: "hi" } }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
      )
    },
  }),
)

const tooled = Harness.make({
  client: toolClient,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({ echo: echo(providerSettled) }))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
})

tooled.effect("a provider tool settles only after its call is published", () =>
  Effect.gen(function* () {
    providerSettled.length = 0
    toolTurns = 0
    yield* Harness.setup
    yield* watchToolCalled(providerSettled)
    const session = yield* SessionV2.Service
    yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
    yield* session.resume(sessionID)
    expect(settledAfterPublish(providerSettled), providerSettled.join(",")).toBe(true)
  }),
)

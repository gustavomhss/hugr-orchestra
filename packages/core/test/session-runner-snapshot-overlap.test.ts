import { expect } from "bun:test"
import { LLMClient, LLMError, LLMEvent, Model, TransportReason, type LLMRequest } from "@orchestra/llm"
import { route } from "@orchestra/llm/protocols/openai-chat"
import { AgentV2 } from "@orchestra/core/agent"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { Snapshot } from "@orchestra/core/snapshot"
import { RelativePath } from "@orchestra/core/schema"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { fragmentFixture, Harness, sessionID } from "./session-runner-harness"

const order: string[] = []
let releaseCapture: Deferred.Deferred<void> | undefined
let releaseStream: Deferred.Deferred<void> | undefined
const requests: LLMRequest[] = []
const comparisons: Snapshot.CompareInput[] = []
let responseMode: "text" | "empty" | "error" = "text"

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
          if (responseMode === "error") return Stream.fail(new LLMError({ module: "test", method: "stream",
            reason: new TransportReason({ message: "early failure" }) }))
          if (responseMode === "empty") return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
          return Stream.fromIterable(fragmentFixture("text", "text", ["ok"]).completeEvents)
        }),
      ).pipe(Stream.ensuring(Effect.sync(() => { order.push("stream-end") }))),
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
      }).pipe(Effect.onInterrupt(() => Effect.sync(() => { order.push("capture-interrupted") }))),
    files: (input) => Effect.sync(() => { comparisons.push(input); return [RelativePath.make("changed.txt")] }),
    diff: () => Effect.succeed([]),
    preview: () => Effect.succeed([]),
    restore: () => Effect.void,
    checkout: () => Effect.void,
  }),
)

const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({}))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  replacements: [[Snapshot.node, slowSnapshot]],
})

it.effect("the provider stream starts before snapshot capture finishes, and the step still records that snapshot", () =>
  Effect.gen(function* () {
    order.length = 0
    requests.length = 0
    comparisons.length = 0
    responseMode = "text"
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
      snapshot: { start: "snap-start", end: "snap-end", files: ["changed.txt"] },
    })
    expect(comparisons).toEqual([{ from: Snapshot.ID.make("snap-start"), to: Snapshot.ID.make("snap-end") }])
  }),
)

for (const mode of ["empty", "error"] as const) {
  it.live(`cancelling an ${mode} provider response interrupts pending snapshot capture`, () =>
    Effect.gen(function* () {
      order.length = 0
      responseMode = mode
      releaseStream = undefined
      const gate = yield* Deferred.make<void>()
      releaseCapture = gate
      yield* Harness.setup
      const session = yield* SessionV2.Service
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
      const running = yield* session.resume(sessionID).pipe(Effect.forkChild)
      const stopped = yield* Effect.gen(function* () {
        let spins = 0
        while (!order.includes("capture-start") || !order.includes("stream-end")) {
          if (++spins > 5000) return yield* Effect.die(`provider did not finish: ${order}`)
          yield* Effect.yieldNow
        }
        const stopping = yield* session.interrupt(sessionID).pipe(Effect.forkChild)
        return yield* Fiber.await(stopping).pipe(Effect.timeoutOption("1 second"))
      }).pipe(Effect.ensuring(Deferred.succeed(gate, undefined)))
      expect(Option.isSome(stopped)).toBe(true)
      yield* Fiber.await(running)
      expect(order).toContain("capture-interrupted")
    }),
  )
}

const hostOrder: string[] = []
let hostRelease: Deferred.Deferred<void> | undefined
const hostSettled: string[] = []
const providerSettled: string[] = []
let toolRelease: Deferred.Deferred<void> | undefined

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
      return Effect.gen(function* () {
        if (toolRelease) yield* Deferred.await(toolRelease)
        return { text: "ok" }
      })
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
      providerSettled.push("stream")
      toolTurns++
      if (toolTurns > 1) return Stream.make(LLMEvent.stepStart({ index: 0 }), LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      return Stream.make(
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({ id: "call-1", name: "echo", input: { text: "hi" } }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
      ).pipe(Stream.ensuring(Effect.sync(() => { providerSettled.push("provider-ended") })))
    },
  }),
)

const tooled = Harness.make({
  client: toolClient,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(Model.make({ id: "fake-model", provider: "fake", route }))),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({ echo: echo(providerSettled) }))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  replacements: [[Snapshot.node, slowSnapshot]],
})

tooled.effect("a provider tool settles only after its call is published", () =>
  Effect.gen(function* () {
    providerSettled.length = 0
    toolRelease = undefined
    order.length = 0
    releaseCapture = yield* Deferred.make<void>()
    toolTurns = 0
    yield* Harness.setup
    yield* watchToolCalled(providerSettled)
    const session = yield* SessionV2.Service
    yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
    const running = yield* session.resume(sessionID).pipe(Effect.forkChild)
    let spins = 0
    while (!providerSettled.includes("stream") || !order.includes("capture-start")) {
      if (++spins > 5000) return yield* Effect.die(`provider did not start: ${providerSettled}`)
      yield* Effect.yieldNow
    }
    expect(providerSettled).not.toContain("settle")
    yield* Deferred.succeed(releaseCapture, undefined)
    yield* Fiber.join(running)
    expect(settledAfterPublish(providerSettled), providerSettled.join(",")).toBe(true)
  }),
)

tooled.effect("cancelling after a tool write preserves end snapshot and revert files", () =>
  Effect.gen(function* () {
    providerSettled.length = 0
    order.length = 0
    releaseCapture = undefined
    toolRelease = yield* Deferred.make<void>()
    toolTurns = 0
    yield* Harness.setup
    const session = yield* SessionV2.Service
    yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hi" }), resume: false })
    const running = yield* session.resume(sessionID).pipe(Effect.forkChild)
    let spins = 0
    while (!providerSettled.includes("settle") || !providerSettled.includes("provider-ended")) {
      if (++spins > 5000) return yield* Effect.die(`tool did not write: ${providerSettled}`)
      yield* Effect.yieldNow
    }
    yield* session.interrupt(sessionID)
    yield* Fiber.await(running)
    const messages = yield* session.messages({ sessionID })
    expect(messages.find((message) => message.type === "assistant")).toMatchObject({
      finish: "error", snapshot: { start: "snap-start", end: "snap-end", files: ["changed.txt"] },
    })
    toolRelease = undefined
  }),
)

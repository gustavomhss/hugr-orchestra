import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { LLMClient, LLMEvent, type LLMRequest } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionExecutionLocal } from "@orchestra/core/session/execution/local"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMessage } from "@orchestra/core/session/message"
import { Snapshot } from "@orchestra/core/snapshot"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Cause, Context, Effect, Exit, Layer, RcMap, Stream } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const model = ModelV2.Ref.make({ providerID: ProviderV2.ID.make("cold-task"), id: ModelV2.ID.make("chat") })
class HiddenSession extends Context.Service<HiddenSession, SessionV2.Interface>()("test/HiddenSession") {}
const hiddenSession = makeGlobalNode({
  service: HiddenSession,
  layer: Layer.effect(HiddenSession, SessionV2.Service),
  deps: [SessionV2.node],
})

function fixture(source: "native" | "legacy" | "markdown", engine?: "orchestra" | "claude-code") {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.tap((tmp) => Effect.promise(async () => {
    await fs.mkdir(path.join(tmp.path, ".orchestra", "agents"), { recursive: true })
    await Bun.write(path.join(tmp.path, ".orchestra", "orchestra.json"), JSON.stringify({
      snapshots: false,
      providers: {
        "cold-task": {
          api: { type: "aisdk", package: "@ai-sdk/openai", settings: { apiKey: "test" } },
          models: { chat: { disabled: false, capabilities: { tools: true, input: ["text"], output: ["text"] }, limit: { context: 100_000, output: 1_000 } } },
        },
      },
    }))
    const agent = { mode: "subagent", description: "Cold worker", ...(engine === undefined ? {} : { engine }) }
    if (source === "markdown") {
      await Bun.write(path.join(tmp.path, ".orchestra", "agents", "worker.md"),
        `---\nmode: subagent\ndescription: Cold worker\nengine: ${engine}\nrequest:\n  body:\n    marker: native-engine\n---\nWorker instructions.`)
      return
    }
    await Bun.write(path.join(tmp.path, "orchestra.json"), JSON.stringify({
      [source === "legacy" ? "agent" : "agents"]: { worker: agent },
    }))
  })))
}

// The parent Session is also named by the `title` agent beside its first turn; only the turns are counted here.
const turns = (requests: LLMRequest[]) =>
  requests.filter((request) => !request.system.some((part) => part.text.startsWith("You are a title generator")))

function application(directory: string, requests: LLMRequest[], missing?: "session" | "execution") {
  const client = LLMClient.Service.of({
    prepare: () => Effect.die("Unexpected prepare"),
    generate: () => Effect.die("Unexpected generate"),
    stream: (request) => Stream.suspend((): Stream.Stream<LLMEvent> => {
      requests.push(request)
      const prompt = request.messages.filter((message) => message.role === "user").at(-1)?.content
        .flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
      const delegated = request.messages.some((message) => message.role === "tool")
      if (prompt === "parent" && !delegated) return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.toolCall({ id: "cold-call", name: "task", input: { description: "Cold child", prompt: "child", subagent_type: "worker" } }),
        LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
        LLMEvent.finish({ reason: "tool-calls" }),
      ])
      return Stream.fromIterable([
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "answer" }),
        LLMEvent.textDelta({ id: "answer", text: `answer:${prompt}` }),
        LLMEvent.textEnd({ id: "answer" }),
        LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        LLMEvent.finish({ reason: "stop" }),
      ])
    }),
  })
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, LocationServiceMap.node, hiddenSession,
    ...(missing === "session" ? [] : [SessionV2.node]),
    ...(missing === "execution" ? [] : [SessionExecution.node]),
  ]), [
    [SessionExecution.node, SessionExecutionLocal.node],
    [LayerNodePlatform.llmClient, Layer.succeed(LLMClient.Service, client)],
    [Snapshot.node, Snapshot.noopLayer],
    [Global.node, Global.layerWith({
      home: directory, config: path.join(directory, ".global"), data: path.join(directory, ".data"),
    })],
  ])
}

it.live("cold create → durable admit → resume acquires native Task with the completed process globals", () => Effect.gen(function* () {
  const tmp = yield* fixture("native")
  const requests: LLMRequest[] = []
  yield* Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const execution = yield* SessionExecution.Service
    const locations = yield* LocationServiceMap.Service
    const database = yield* Database.Service
    const parent = yield* sessions.create({ location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }), model })
    // Creation/admission must not acquire a Location to make the cold drain work.
    expect(Array.from(yield* RcMap.keys(locations.rcMap))).toHaveLength(0)
    const admitted = yield* sessions.prompt({ sessionID: parent.id, prompt: { text: "parent" }, resume: false })
    expect((yield* SessionInput.find(database.db, admitted.id))?.id).toBe(admitted.id)
    expect((yield* SessionInput.find(database.db, admitted.id))?.promotedSeq).toBeUndefined()
    expect(yield* sessions.messages({ sessionID: parent.id })).toEqual([])
    expect(requests).toHaveLength(0)
    expect(Array.from(yield* RcMap.keys(locations.rcMap))).toHaveLength(0)
    yield* sessions.resume(parent.id)
    const children = (yield* sessions.list()).filter((session) => session.parentID === parent.id)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({ agent: "worker", model, location: parent.location })
    expect(turns(requests)).toHaveLength(3)
    expect((yield* execution.active).size).toBe(0)
    expect(yield* sessions.messages({ sessionID: children[0].id, order: "asc" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "assistant", content: expect.arrayContaining([expect.objectContaining({ type: "text", text: "answer:child" })]) }),
    ]))
    const opened = yield* locations.contextEffect(parent.location)
    const registry = Context.get(opened, ToolRegistry.Service)
    expect((yield* registry.materialize()).definitions.map((tool) => tool.name)).toContain("task")
  }).pipe(Effect.provide(application(tmp.path, requests)))
}), 30_000)

for (const source of ["native", "legacy", "markdown"] as const) {
  for (const engine of ["claude-code", "orchestra"] as const) {
    it.live(`${source} config → Agent service → Task ${engine === "claude-code" ? "rejects Claude Code" : "runs Orchestra control"}`, () => Effect.gen(function* () {
      const tmp = yield* fixture(source, engine)
      const requests: LLMRequest[] = []
      yield* Effect.gen(function* () {
        const sessions = yield* SessionV2.Service
        const locations = yield* LocationServiceMap.Service
        const parent = yield* sessions.create({ location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }), model })
        yield* sessions.prompt({ sessionID: parent.id, prompt: { text: "parent" }, resume: false })
        yield* sessions.resume(parent.id)
        const agent = yield* AgentV2.Service.use((agents) => agents.get(AgentV2.ID.make("worker"))).pipe(
          Effect.provide(locations.get(parent.location)),
        )
        expect(agent).toMatchObject({ engine, mode: "subagent" })
        if (source === "markdown") {
          expect(agent).toMatchObject({ system: "Worker instructions.", request: { body: { marker: "native-engine" } } })
        }
        const children = (yield* sessions.list()).filter((session) => session.parentID === parent.id)
        if (engine === "orchestra") {
          expect(children).toHaveLength(1)
          expect(turns(requests)).toHaveLength(3)
          return
        }
        const messages = yield* sessions.messages({ sessionID: parent.id, order: "asc" })
        const call = messages.flatMap((message) => message.type === "assistant" ? message.content : [])
          .find((part): part is SessionMessage.AssistantTool => part.type === "tool" && part.name === "task")
        expect(call?.state).toMatchObject({ status: "error", error: { message: "Task target requires an unsupported engine: worker" } })
        expect(children).toHaveLength(0)
        expect(turns(requests)).toHaveLength(2)
      }).pipe(Effect.provide(application(tmp.path, requests)))
    }), 30_000)
  }
}

for (const missing of ["session", "execution"] as const) {
  it.live(`cold Task still faults when process-global ${missing} is not exported`, () => Effect.gen(function* () {
    const tmp = yield* fixture("native")
    const requests: LLMRequest[] = []
    yield* Effect.gen(function* () {
      const sessions = yield* HiddenSession
      const parent = yield* sessions.create({ location: Location.Ref.make({ directory: AbsolutePath.make(tmp.path) }), model })
      yield* sessions.prompt({ sessionID: parent.id, prompt: { text: "parent" }, resume: false })
      const exit = yield* sessions.resume(parent.id).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(
        `Task requires an exported process-global service: ${missing === "session" ? SessionV2.Service.key : SessionExecution.Service.key}`,
      )
      expect(requests).toHaveLength(0)
    }).pipe(Effect.provide(application(tmp.path, requests, missing)))
  }), 30_000)
}

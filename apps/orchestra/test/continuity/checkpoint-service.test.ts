import { expect } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ProjectCheckpoint } from "@orchestra/core/project/checkpoint"
import { SessionProjector } from "@orchestra/core/session/projector"
import type { ConfigV1 } from "@orchestra/core/v1/config/config"
import { LLMEvent } from "@orchestra/llm"
import { Archive } from "@/continuity/archive"
import { CheckpointContext } from "@/continuity/checkpoint-context"
import { ContinuityMasking } from "@/continuity/masking"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { LLM } from "@/session/llm"
import { PartID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { provideTmpdirInstance, TestInstance } from "../fixture/fixture"
import { ProviderTest } from "../fake/provider"
import { it } from "../lib/effect"
import { begin, body, complete, FIRST, jobFor, terminal } from "./service-fixture"

// Only the checkpoint boundary is wrapped for failure injection; DB, Session,
// archive, scheduling and SessionContinuity remain the production services.
function environment(llm: (checkpoints: ProjectCheckpoint.Interface, sessions: Session.Interface) => LLM.Interface, options: {
  config?: ConfigV1.Info
  checkpoint?: (actual: ProjectCheckpoint.Interface) => ProjectCheckpoint.Interface
} = {}) {
  const wrap = options.checkpoint
  const checkpoint = wrap ? LayerNode.make({ service: ProjectCheckpoint.Service, tag: ProjectCheckpoint.node.tag,
    deps: [Database.node], layer: Layer.effect(ProjectCheckpoint.Service, Effect.gen(function* () {
      const actual = yield* ProjectCheckpoint.Service
      return wrap(actual)
    })).pipe(Layer.provide(ProjectCheckpoint.layer)),
  }) : ProjectCheckpoint.node
  const transport = LayerNode.make({ service: LLM.Service, deps: [ProjectCheckpoint.node, Session.node],
    layer: Layer.effect(LLM.Service, Effect.gen(function* () {
      const checkpoints = yield* ProjectCheckpoint.Service
      const sessions = yield* Session.Service
      return llm(checkpoints, sessions)
    })),
  })
  return AppNodeBuilder.build(LayerNode.group([
    SessionContinuity.node, Session.node, SessionProjector.node, BackgroundJob.node, Archive.node, ProjectCheckpoint.node, CrossSpawnSpawner.node,
  ]), [
    [ProjectCheckpoint.node, checkpoint],
    [LLM.node, transport],
    [Provider.node, Layer.mock(Provider.Service, { getModel: (providerID, id) => Effect.succeed(ProviderTest.model({ providerID, id })) })],
    [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
    [Plugin.node, Layer.mock(Plugin.Service, { init: () => Effect.void, list: () => Effect.succeed([]),
      trigger: (_name, _input, output) => Effect.succeed(output) })],
    [Config.node, Layer.mock(Config.Service, { get: () => Effect.succeed(options.config ?? { continuity: { trigger: 0.25 } }) })],
  ])
}

it.instance("production continuity checkpoints the persisted Session owner and directory before transport", () => Effect.gen(function* () {
  const current = yield* TestInstance
  const requests: LLM.StreamInput[] = []
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const checkpoints = yield* ProjectCheckpoint.Service
    const continuity = yield* SessionContinuity.Service
    const archive = yield* Archive.Service
    const here = yield* sessions.create({ title: "Current project is not the owner" })
    const owner = yield* provideTmpdirInstance(() => sessions.create({ title: "Persisted source owner" }), { git: true })
    expect(owner.projectID).not.toBe(here.projectID)
    expect(owner.directory).not.toBe(current.directory)
    const user = yield* begin(owner.id, "Retain exact project ownership 🪨漢字e\u0301. " + "source evidence ".repeat(1000))
    const boundary = yield* complete(user, "Completed owned evidence", 50_000)
    const job = yield* jobFor(owner.id, boundary.id)
    yield* terminal(job.id, "completed", "applied")
    expect(requests).toHaveLength(1)
    const rows = (yield* checkpoints.list({ projectID: owner.projectID, directory: owner.directory })).items
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ projectID: owner.projectID, directory: owner.directory,
      sessionID: owner.id, boundary: boundary.id, attempt: 0 })
    expect(rows[0].id).toBe(`${rows[0].forkID}:0`)
    expect(rows[0].forkID).toBe(requests[0].sessionID)
    expect(requests[0].parentSessionID).toBe(owner.id)
    expect(requests[0].purpose).toBe("context-maintenance")
    const stored = yield* checkpoints.read({ projectID: owner.projectID, id: rows[0].id })
    if (!stored) throw new Error("Missing production checkpoint")
    const decoded = CheckpointContext.decode(stored.payload)
    expect(decoded).toMatchObject({ system: requests[0].system, messages: requests[0].messages,
      user: requests[0].user, agent: requests[0].agent, tools: {}, purpose: "context-maintenance" })
    expect(yield* checkpoints.read({ projectID: here.projectID, id: stored.id })).toBeUndefined()
    expect((yield* checkpoints.list({ projectID: here.projectID, directory: current.directory })).items).toEqual([])
    const history = yield* sessions.messages({ sessionID: owner.id })
    expect((yield* continuity.prepare({ sessionID: owner.id, messages: history, canRecall: true })).system[0]).toContain(FIRST)
    expect((yield* archive.readMemory(owner.id))?.context?.artifact.boundary).toBe(boundary.id)
    expect((yield* archive.list(owner.id)).length).toBeGreaterThan(0)
  }).pipe(Effect.provide(environment((checkpoints, sessions) => ({ stream: (request) => {
    requests.push(request)
    return Stream.unwrap(Effect.gen(function* () {
      if (!request.parentSessionID) throw new Error("Expected isolated producer owner")
      const owner = yield* sessions.get(SessionID.make(request.parentSessionID))
      const saved = yield* checkpoints.read({ projectID: owner.projectID, id: `${request.sessionID}:0` })
      expect(saved).toBeDefined()
      expect(saved?.sessionID).toBe(owner.id)
      expect(saved?.directory).toBe(owner.directory)
      return Stream.make(LLMEvent.textDelta({ id: "memory", text: JSON.stringify(body(request, FIRST)) }),
        LLMEvent.finish({ reason: "stop" }))
    }))
  } }))))
}), { git: true }, 60_000)

for (const disabled of [false, true]) it.instance(`${disabled ? "disabled" : "fits"} compaction creates no checkpoint`, () => Effect.gen(function* () {
  const requests: LLM.StreamInput[] = []
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const checkpoints = yield* ProjectCheckpoint.Service
    const continuity = yield* SessionContinuity.Service
    const jobs = yield* BackgroundJob.Service
    const chat = yield* sessions.create({ title: "No producer needed" })
    yield* complete(yield* begin(chat.id, "Small request"), "Small completed reply", disabled ? 50_000 : 100)
    expect(yield* continuity.compact({ sessionID: chat.id, canRecall: true })).toBe(disabled ? "disabled" : "fits")
    expect(requests).toEqual([])
    expect((yield* checkpoints.list({ projectID: chat.projectID, directory: chat.directory })).items).toEqual([])
    expect((yield* jobs.list()).filter((job) => job.metadata?.sessionId === chat.id)).toEqual([])
  }).pipe(Effect.provide(environment(() => ({ stream: (request) => { requests.push(request); return Stream.empty } }),
    { config: { continuity: { enabled: !disabled, trigger: 0.25 } } })))
}), 60_000)

it.instance("checkpoint write failure blocks working-memory publication and all LLM dispatch", () => Effect.gen(function* () {
  const requests: LLM.StreamInput[] = []
  const saves: ProjectCheckpoint.SaveInput[] = []
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const checkpoints = yield* ProjectCheckpoint.Service
    const continuity = yield* SessionContinuity.Service
    const archive = yield* Archive.Service
    const chat = yield* sessions.create({ title: "Checkpoint write failure" })
    const boundary = yield* complete(yield* begin(chat.id, "Preserve history. " + "source evidence ".repeat(1000)), "Completed evidence", 50_000)
    const job = yield* jobFor(chat.id, boundary.id)
    yield* terminal(job.id, "completed", "checkpoint")
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({ sessionID: chat.id, boundary: boundary.id, attempt: 0 })
    expect(CheckpointContext.decode(saves[0].payload)).toMatchObject({ purpose: "context-maintenance", parentSessionID: chat.id })
    expect(requests).toEqual([])
    expect((yield* checkpoints.list({ projectID: chat.projectID, directory: chat.directory })).items).toEqual([])
    const history = yield* sessions.messages({ sessionID: chat.id })
    const view = yield* continuity.prepare({ sessionID: chat.id, messages: history, canRecall: true })
    expect(view.messages).toEqual(history)
    expect(view.system).toEqual([])
    expect((yield* archive.readMemory(chat.id))?.context).toBeUndefined()
    // History archival precedes production; it remains usable after save failure.
    expect((yield* archive.list(chat.id)).length).toBeGreaterThan(0)
  }).pipe(Effect.provide(environment(() => ({ stream: (request) => { requests.push(request); return Stream.empty } }), {
    checkpoint: (actual) => ({ ...actual, save: (input) => Effect.gen(function* () {
      saves.push(input)
      return yield* new ProjectCheckpoint.CheckpointError({ reason: "storage" })
    }) }),
  })))
}), 60_000)

it.instance("checkpoint failure prevents ordinary and urgent masks until a successful save", () => Effect.gen(function* () {
  const requests: LLM.StreamInput[] = []
  const failure = { enabled: true }
  yield* Effect.gen(function* () {
    const sessions = yield* Session.Service
    const continuity = yield* SessionContinuity.Service
    const archive = yield* Archive.Service
    const checkpoints = yield* ProjectCheckpoint.Service
    const chat = yield* sessions.create({ title: "Checkpoint failure cannot fall through to masking" })
    for (let step = 0; step < 8; step++) {
      const assistant = yield* complete(yield* begin(chat.id, `Source ${step}`), `Completed ${step}`, 100)
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool",
        tool: "read", callID: `read-${step}`, state: { status: "completed", input: { filePath: `source-${step}.txt` },
          output: step === 0 ? "ORIGINAL_MASKABLE_OUTPUT ".repeat(2000) : "small result", title: "Read",
          metadata: {}, time: { start: 1, end: 2 } } })
    }
    const boundary = yield* complete(yield* begin(chat.id, "Trigger checkpoint"), "Completed trigger", 50_000)
    yield* terminal((yield* jobFor(chat.id, boundary.id)).id, "completed", "checkpoint")
    const original = yield* sessions.messages({ sessionID: chat.id })
    expect(ContinuityMasking.candidates(original, new Map()).length).toBeGreaterThan(0)
    expect(ContinuityMasking.urgent(original, new Map()).length).toBeGreaterThan(0)
    expect((yield* continuity.prepare({ sessionID: chat.id, messages: original, canRecall: true })).messages).toEqual(original)
    for (let attempt = 0; attempt < 4; attempt++) {
      expect(yield* continuity.compact({ sessionID: chat.id, force: true, canRecall: true })).toBe("over")
      expect((yield* continuity.prepare({ sessionID: chat.id, messages: original, canRecall: true })).messages).toEqual(original)
      expect((yield* archive.readMemory(chat.id))?.masks ?? []).toEqual([])
    }
    expect(requests).toEqual([])
    expect((yield* checkpoints.list({ projectID: chat.projectID, directory: chat.directory })).items).toEqual([])
    failure.enabled = false
    yield* continuity.invalidate(chat.id)
    expect(yield* continuity.compact({ sessionID: chat.id, force: true, canRecall: true })).toBe("masked")
    expect(requests).toHaveLength(2)
    expect((yield* checkpoints.list({ projectID: chat.projectID, directory: chat.directory })).items).toHaveLength(2)
    expect((yield* archive.readMemory(chat.id))?.masks.length).toBeGreaterThan(0)
  }).pipe(Effect.provide(environment(() => ({ stream: (request) => { requests.push(request); return Stream.empty } }), {
    checkpoint: (actual) => ({ ...actual, save: (input) => failure.enabled
      ? Effect.fail(new ProjectCheckpoint.CheckpointError({ reason: "storage" })) : actual.save(input) }),
  })))
}), 60_000)

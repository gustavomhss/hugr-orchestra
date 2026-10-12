import { describe, expect } from "bun:test"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { LLMEvent, Usage } from "@orchestra/llm"
import { Effect, Layer, Schema, Stream } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { AtlasResumeRestore } from "@/maestro/atlas-resume-restore"
import { LEGACY_BACKEND_ID } from "@/maestro/roster"
import { Provider } from "@/provider/provider"
import { LLM } from "../../src/session/llm"
import { SessionCompaction } from "../../src/session/compaction"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { Session } from "@/session/session"
import { SessionSummary } from "../../src/session/summary"
import { ProviderTest } from "../fake/provider"
import { TestConfig } from "../fixture/config"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { testEffect } from "../lib/effect"

// Ruling M3-1 (F3-D4 over F2.8): after a compaction leaves a backend Session's admitted resume fold outside the kept
// context, the host re-pushes the same Admission once as residency "restored", with identical text and ref.

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

const model = ProviderTest.model({
  id: ref.modelID,
  providerID: ref.providerID,
  name: "Test",
  limit: { context: 100_000, output: 32_000 },
})

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const compactionTestNode = LayerNode.group([
  Agent.node,
  SessionCompaction.node,
  Session.node,
  SessionProjector.node,
  Database.node,
  EventV2Bridge.node,
  CrossSpawnSpawner.node,
])

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([Session.node, SessionProjector.node, Database.node, EventV2Bridge.node, CrossSpawnSpawner.node]),
  ),
)

// Each compaction gets a summary from the queued model reply, so the compacted view really drops the head.
function compacting(replies: number) {
  const usage = () => new Usage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 })
  const queue = Array.from({ length: replies }, () =>
    Stream.make(
      LLMEvent.textStart({ id: "txt-0" }),
      LLMEvent.textDelta({ id: "txt-0", text: "summary" }),
      LLMEvent.textEnd({ id: "txt-0" }),
      LLMEvent.stepFinish({ index: 0, reason: "stop", usage: usage() }),
      LLMEvent.finish({ reason: "stop", usage: usage() }),
    ),
  )
  const base = Schema.decodeUnknownSync(ConfigV1.Info)({
    model: "test/test-model",
    agent: {
      backend: { name: "Storage seat", model: "test/test-model" },
      compaction: { model: "test/test-model" },
      "backend-lookalike": { name: "backend", model: "test/test-model", mode: "subagent" },
    },
  }) as ConfigV1.Info
  return Effect.provide(
    TestAppNodeBuilder.build(compactionTestNode, [
      [Provider.node, ProviderTest.fake({ model }).layer],
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
      [SessionSummary.node, summary],
      [
        LLM.node,
        Layer.succeed(
          LLM.Service,
          LLM.Service.of({
            stream: () => {
              const reply = queue.shift()
              if (!reply) throw new Error("Compaction requested an unexpected model reply")
              return reply
            },
          }),
        ),
      ],
      [
        Config.node,
        Layer.succeed(
          Config.Service,
          TestConfig.make({
            get: () => Effect.succeed({ ...base, compaction: { tail_turns: 1, preserve_recent_tokens: 10_000 } }),
          }),
        ),
      ],
    ]),
  )
}

const ADMISSION: Omit<AtlasMemory.Admission, "key"> = {
  schema: "atlas-resume-admission-v1",
  residency: "admitted",
  verdict: { ok: true, ref: { contentHash: "content-hash", eventId: "event-id" } },
  text: 'Atlas Memory resume of your task "T-17": your latest admitted checkpoint, record event-id.\n{"stoppedAt":"x"}',
}

function admissionFor(session: Session.Info, key: Partial<AtlasMemory.AdmissionKey> = {}): AtlasMemory.Admission {
  return {
    ...ADMISSION,
    key: {
      projectID: session.projectID,
      memoryOwner: "backend",
      logicalResumeID: "ses_parent/call_resume",
      kind: "task",
      id: "T-17",
      ...key,
    },
  }
}

const turn = Effect.fn("AtlasResumeCompactionTest.turn")(function* (
  sessionID: SessionID,
  text: string,
  admission?: AtlasMemory.Admission,
) {
  const sessions = yield* Session.Service
  const msg = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "backend",
    model: ref,
    time: { created: Date.now() },
  })
  yield* sessions.updatePart({ id: PartID.ascending(), messageID: msg.id, sessionID, type: "text", text })
  if (admission)
    yield* sessions.updatePart({
      id: PartID.ascending(),
      messageID: msg.id,
      sessionID,
      type: "text",
      synthetic: true,
      text: admission.text,
      metadata: { [AtlasMemory.ADMISSION_KEY]: admission },
    })
  return msg
})

const compact = Effect.fn("AtlasResumeCompactionTest.compact")(function* (sessionID: SessionID) {
  const sessions = yield* Session.Service
  const compaction = yield* SessionCompaction.Service
  yield* compaction.create({ sessionID, agent: "backend", model: ref, auto: false })
  const messages = yield* sessions.messages({ sessionID })
  const parent = messages.at(-1)
  if (!parent || parent.info.role !== "user") throw new Error("Compaction did not create a user boundary")
  expect(yield* compaction.process({ parentID: parent.info.id, messages, sessionID, auto: false })).toBe("continue")
  const history = yield* sessions.messages({ sessionID })
  const summary = history.at(-1)
  if (!summary || summary.info.role !== "assistant") throw new Error("Compaction did not persist an assistant summary")
  expect(summary.info).toMatchObject({ parentID: parent.info.id, agent: "compaction", summary: true, finish: "stop" })
  expect(summary.info.error).toBeUndefined()
  expect(summary.parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual(["summary"])
  return parent.info.id
})

// Every admission part in the Session, in history order, with its text checked against the part text.
const admissions = Effect.fn("AtlasResumeCompactionTest.admissions")(function* (sessionID: SessionID) {
  const sessions = yield* Session.Service
  const history = yield* sessions.messages({ sessionID })
  return history.flatMap((msg) =>
    msg.parts.flatMap((part) => {
      if (part.type !== "text" || !part.metadata?.[AtlasMemory.ADMISSION_KEY]) return []
      const admission = part.metadata[AtlasMemory.ADMISSION_KEY] as AtlasMemory.Admission
      expect(part.text).toBe(admission.text)
      expect(part.synthetic).toBe(true)
      return [{ messageID: msg.info.id, admission }]
    }),
  )
})

const visible = Effect.fn("AtlasResumeCompactionTest.visible")(function* (sessionID: SessionID) {
  return MessageV2.filterCompacted(yield* MessageV2.stream(sessionID))
    .flatMap((msg) => msg.parts)
    .flatMap((part) => (part.type === "text" && part.metadata?.[AtlasMemory.ADMISSION_KEY] ? [part.text] : []))
})

describe("Atlas resume fold residency across compaction", () => {
  for (const agent of ["backend", LEGACY_BACKEND_ID]) {
    it.instance(
      `${agent === "backend" ? "canonical" : "legacy"} backend: evicted fold is restored once with identical text and ref`,
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const agents = yield* Agent.Service
          const backend = yield* agents.get(agent)
          expect(backend).toMatchObject({ id: "backend", native: true, name: "Storage seat", model: ref })
          const session = yield* sessions.create({ agent })
          expect((yield* sessions.get(session.id)).projectID).toBe(session.projectID)
          const admission = admissionFor(session)
          const packet = yield* turn(session.id, "packet", admission)
          yield* turn(session.id, "older turn")
          yield* turn(session.id, "recent turn")
          const parentID = yield* compact(session.id)
          expect(yield* admissions(session.id)).toEqual([
            { messageID: packet.id, admission },
            { messageID: parentID, admission: { ...admission, residency: "restored" } },
          ])
          const history = yield* sessions.messages({ sessionID: session.id })
          // The persisted original remains, but the model's compacted history has evicted it.
          expect(history.map((message) => message.info.id)).toContain(packet.id)
          expect(MessageV2.filterCompacted(history.toReversed()).map((message) => message.info.id)).not.toContain(packet.id)
          expect(yield* visible(session.id)).toEqual([admission.text])
          yield* AtlasResumeRestore.restore({ session: sessions, sessionID: session.id, messageID: parentID })
          yield* AtlasResumeRestore.restore({ session: sessions, sessionID: session.id, messageID: parentID })
          expect(yield* sessions.messages({ sessionID: session.id })).toEqual(history)

          yield* turn(session.id, "another turn")
          yield* turn(session.id, "latest turn")
          yield* compact(session.id)
          expect(yield* admissions(session.id)).toEqual([
            { messageID: packet.id, admission },
            { messageID: parentID, admission: { ...admission, residency: "restored" } },
          ])
        }).pipe(compacting(2)),
      { git: true },
    )
  }

  it.instance(
    "a fold still in the kept tail is not restored",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "backend" })
        const admission = admissionFor(session)
        yield* turn(session.id, "older turn")
        yield* turn(session.id, "packet", admission)
        yield* compact(session.id)
        expect((yield* admissions(session.id)).map((item) => item.admission.residency)).toEqual(["admitted"])
        expect(yield* visible(session.id)).toEqual([admission.text])
      }).pipe(compacting(1)),
    { git: true },
  )

  for (const agent of ["maestro", "backend-lookalike"]) {
    it.instance(
      `${agent}: an unsupported Session gets nothing even with a matching project`,
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const agents = yield* Agent.Service
          if (agent === "backend-lookalike")
            expect(yield* agents.get(agent)).toMatchObject({ id: agent, name: "backend", native: false })
          const session = yield* sessions.create({ agent })
          yield* turn(session.id, "packet", admissionFor(session))
          yield* turn(session.id, "older turn")
          yield* turn(session.id, "recent turn")
          yield* compact(session.id)
          expect((yield* admissions(session.id)).map((item) => item.admission.residency)).toEqual(["admitted"])
          // The compaction did evict it: the guard, not the tail, is why nothing came back.
          expect(yield* visible(session.id)).toEqual([])
        }).pipe(compacting(1)),
      { git: true },
    )
  }

  for (const foreign of ["owner", "project"] as const) {
    it.instance(
      `backend: a foreign ${foreign} fold is not restored after eviction`,
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const session = yield* sessions.create({ agent: "backend" })
          const admission = admissionFor(
            session,
            foreign === "owner" ? { memoryOwner: "jimmy" } : { projectID: `${session.projectID}-foreign` },
          )
          yield* turn(session.id, "packet", admission)
          yield* turn(session.id, "older turn")
          yield* turn(session.id, "recent turn")
          yield* compact(session.id)
          expect((yield* admissions(session.id)).map((item) => item.admission)).toEqual([admission])
          expect(yield* visible(session.id)).toEqual([])
        }).pipe(compacting(1)),
      { git: true },
    )
  }

  it.instance(
    "restore honors the bound Agent capability instead of rebuilding native defaults",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const agents = yield* Agent.Service
        const session = yield* sessions.create({ agent: "backend" })
        const admission = admissionFor(session)
        yield* turn(session.id, "packet", admission)
        yield* turn(session.id, "older turn")
        yield* turn(session.id, "recent turn")
        // Only the host capability boundary is restricted; config, model and compaction remain real fixtures.
        yield* compact(session.id).pipe(
          Effect.provideService(
            Agent.Service,
            Agent.Service.of({
              ...agents,
              get: (id) =>
                agents.get(id).pipe(Effect.map((agent) => (agent?.id === "backend" ? { ...agent, native: false } : agent))),
            }),
          ),
        )
        expect((yield* admissions(session.id)).map((item) => item.admission)).toEqual([admission])
        expect(yield* visible(session.id)).toEqual([])
      }).pipe(compacting(1)),
    { git: true },
  )

  it.instance(
    "foreign owner and project admissions cannot replace the latest owned fold",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "backend" })
        const admission = admissionFor(session)
        const packet = yield* turn(session.id, "packet", admission)
        const foreignOwner = admissionFor(session, { memoryOwner: "jimmy" })
        const foreignProject = admissionFor(session, { projectID: `${session.projectID}-foreign` })
        const ownerPacket = yield* turn(session.id, "foreign owner", foreignOwner)
        const projectPacket = yield* turn(session.id, "foreign project", foreignProject)
        yield* turn(session.id, "recent turn")
        const parentID = yield* compact(session.id)
        expect(yield* admissions(session.id)).toEqual([
          { messageID: packet.id, admission },
          { messageID: ownerPacket.id, admission: foreignOwner },
          { messageID: projectPacket.id, admission: foreignProject },
          { messageID: parentID, admission: { ...admission, residency: "restored" } },
        ])
        expect(yield* visible(session.id)).toEqual([admission.text])
      }).pipe(compacting(1)),
    { git: true },
  )
})

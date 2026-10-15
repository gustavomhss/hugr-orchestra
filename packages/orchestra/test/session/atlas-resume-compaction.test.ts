import { describe, expect } from "bun:test"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { LLMEvent, Usage } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import * as Stream from "effect/Stream"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Provider } from "@/provider/provider"
import { LLM } from "../../src/session/llm"
import { SessionCompaction } from "../../src/session/compaction"
import { MessageV2 } from "../../src/session/message-v2"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { Session } from "@/session/session"
import { SessionSummary } from "../../src/session/summary"
import { ProviderTest } from "../fake/provider"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

// Ruling M3-1 (F3-D4 over F2.8): after a compaction leaves a backend Session's admitted resume fold outside the kept
// context, the host re-pushes the same Admission once as residency "restored", with identical text and ref.

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

const model = {
  id: "test-model",
  providerID: "test",
  name: "Test",
  limit: { context: 100_000, output: 32_000 },
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
  capabilities: {
    toolcall: true,
    attachment: false,
    reasoning: false,
    temperature: true,
    input: { text: true, image: false, audio: false, video: false },
    output: { text: true, image: false, audio: false, video: false },
  },
  api: { npm: "@ai-sdk/anthropic" },
  options: {},
} as Provider.Model

const summary = Layer.succeed(
  SessionSummary.Service,
  SessionSummary.Service.of({
    summarize: () => Effect.void,
    diff: () => Effect.succeed([]),
    computeDiff: () => Effect.succeed([]),
  }),
)

const compactionTestNode = LayerNode.group([
  SessionCompaction.node,
  Session.node,
  SessionProjector.node,
  Database.node,
  EventV2Bridge.node,
  CrossSpawnSpawner.node,
])

const it = testEffect(
  AppNodeBuilder.build(
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
  const base = Schema.decodeUnknownSync(ConfigV1.Info)({}) as ConfigV1.Info
  return Effect.provide(
    AppNodeBuilder.build(compactionTestNode, [
      [Provider.node, ProviderTest.fake({ model }).layer],
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
      [SessionSummary.node, summary],
      [LLM.node, Layer.succeed(LLM.Service, LLM.Service.of({ stream: () => queue.shift() ?? Stream.empty }))],
      [
        Config.node,
        Layer.succeed(
          Config.Service,
          TestConfig.make({
            get: () =>
              Effect.succeed({ ...base, compaction: { tail_turns: 1, preserve_recent_tokens: 10_000 } }),
          }),
        ),
      ],
    ]),
  )
}

const ADMISSION: AtlasMemory.Admission = {
  schema: "atlas-resume-admission-v1",
  key: { projectID: "project", memoryOwner: "backend", logicalResumeID: "ses_parent/call_resume", kind: "task", id: "T-17" },
  residency: "admitted",
  verdict: { ok: true, ref: { contentHash: "content-hash", eventId: "event-id" } },
  text: 'Atlas Memory resume of your task "T-17": your latest admitted checkpoint, record event-id.\n{"stoppedAt":"x"}',
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
  yield* SessionCompaction.use.create({ sessionID, agent: "backend", model: ref, auto: false })
  const messages = yield* sessions.messages({ sessionID })
  const parentID = messages.at(-1)!.info.id
  expect(yield* SessionCompaction.use.process({ parentID, messages, sessionID, auto: false })).toBe("continue")
  return parentID
})

// Every admission part in the Session, in history order, with its text checked against the part text.
const admissions = Effect.fn("AtlasResumeCompactionTest.admissions")(function* (sessionID: SessionID) {
  const history = yield* (yield* Session.Service).messages({ sessionID })
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
  it.instance(
    "an evicted fold is restored once with identical text and ref, and a second compaction adds nothing",
    () =>
      Effect.gen(function* () {
        const session = yield* (yield* Session.Service).create({ agent: "backend" })
        yield* turn(session.id, "packet", ADMISSION)
        yield* turn(session.id, "older turn")
        yield* turn(session.id, "recent turn")
        const parentID = yield* compact(session.id)
        expect(yield* admissions(session.id)).toEqual([
          { messageID: expect.any(String), admission: ADMISSION },
          { messageID: parentID, admission: { ...ADMISSION, residency: "restored" } },
        ])
        // The restored fold is in the compacted view the model reads; the admitted original is not.
        expect(yield* visible(session.id)).toEqual([ADMISSION.text])

        yield* turn(session.id, "another turn")
        yield* turn(session.id, "latest turn")
        yield* compact(session.id)
        expect((yield* admissions(session.id)).map((item) => item.admission.residency)).toEqual(["admitted", "restored"])
      }).pipe(compacting(2)),
    { git: true },
  )

  it.instance(
    "a fold still in the kept tail is not restored",
    () =>
      Effect.gen(function* () {
        const session = yield* (yield* Session.Service).create({ agent: "backend" })
        yield* turn(session.id, "older turn")
        yield* turn(session.id, "packet", ADMISSION)
        yield* compact(session.id)
        expect((yield* admissions(session.id)).map((item) => item.admission.residency)).toEqual(["admitted"])
        expect(yield* visible(session.id)).toEqual([ADMISSION.text])
      }).pipe(compacting(1)),
    { git: true },
  )

  it.instance(
    "a non-backend Session gets nothing",
    () =>
      Effect.gen(function* () {
        const session = yield* (yield* Session.Service).create({ agent: "maestro" })
        yield* turn(session.id, "packet", ADMISSION)
        yield* turn(session.id, "older turn")
        yield* turn(session.id, "recent turn")
        yield* compact(session.id)
        expect((yield* admissions(session.id)).map((item) => item.admission.residency)).toEqual(["admitted"])
        // The compaction did evict it: the guard, not the tail, is why nothing came back.
        expect(yield* visible(session.id)).toEqual([])
      }).pipe(compacting(1)),
    { git: true },
  )
})

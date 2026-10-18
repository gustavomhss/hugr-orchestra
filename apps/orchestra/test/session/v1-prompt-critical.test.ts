import { expect } from "bun:test"
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema } from "effect"
import path from "node:path"
import { createHash } from "node:crypto"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { Global } from "@orchestra/core/global"
import { EventTable } from "@orchestra/core/event/sql"
import { MessageTable } from "@orchestra/core/session/sql"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { SessionContinuity } from "@/continuity/service"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { SessionPrompt } from "@/session/prompt"
import { PromptIdentity } from "@/session/prompt-identity"
import { MessageID } from "@/session/schema"
import { Session } from "@/session/session"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { makeHttp } from "./prompt.fixture"

const CacheGate = Context.Reference<
  | {
      ready: Deferred.Deferred<void>
      release: Deferred.Deferred<void>
      calls: string[]
    }
  | undefined
>("test/V1AdmissionCacheGate", { defaultValue: () => undefined })
const flags = RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })
const ReadRequested = Context.Reference<Deferred.Deferred<void> | undefined>("test/V1AdmissionReadRequested", {
  defaultValue: () => undefined,
})
// Signal at the actual Session placement read (withSession reads it before reconcile); delegate all SQL work.
const sessionsLayer: Layer.Layer<Session.Service> = Layer.effect(
  Session.Service,
  Effect.gen(function* () {
    const real = yield* Session.Service
    return Session.Service.of({
      ...real,
      get: (id) =>
        Effect.gen(function* () {
          const requested = yield* ReadRequested
          if (requested) yield* Deferred.succeed(requested, undefined)
          return yield* real.get(id)
        }),
    })
  }),
).pipe(Layer.provide(LayerNode.compile(Session.node, [[RuntimeFlags.node, flags]])))
const continuity: Layer.Layer<SessionContinuity.Service> = Layer.effect(
  SessionContinuity.Service,
  Effect.gen(function* () {
    const real = yield* SessionContinuity.Service
    return SessionContinuity.Service.of({
      ...real,
      invalidate: (id) =>
        Effect.gen(function* () {
          yield* real.invalidate(id)
          const gate = yield* CacheGate
          if (!gate) return
          gate.calls.push("invalidate")
          yield* Deferred.succeed(gate.ready, undefined)
          yield* Deferred.await(gate.release)
        }),
      advance: (id) =>
        Effect.gen(function* () {
          yield* real.advance(id)
          const gate = yield* CacheGate
          if (gate) gate.calls.push("advance")
        }),
    })
  }),
).pipe(Layer.provide(LayerNode.compile(SessionContinuity.node, [[RuntimeFlags.node, flags]])))
const it = testEffect(
  makeHttp({
    replacements: [
      [RuntimeFlags.node, flags],
      [SessionContinuity.node, continuity],
      [Session.node, sessionsLayer],
    ],
  }),
)
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const setup = Effect.gen(function* () {
  const instance = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* Effect.promise(() =>
    Bun.write(
      path.join(instance.directory, "orchestra.json"),
      JSON.stringify({
        provider: {
          test: {
            name: "Test",
            id: "test",
            env: [],
            npm: "@ai-sdk/openai-compatible",
            models: {
              "test-model": {
                id: "test-model",
                name: "Test",
                attachment: false,
                reasoning: false,
                temperature: false,
                tool_call: true,
                release_date: "2025-01-01",
                limit: { context: 100000, output: 10000 },
                cost: { input: 0, output: 0 },
                options: {},
              },
            },
            options: { apiKey: "test-key", baseURL: llm.url },
          },
        },
      }),
    ),
  )
  const sessions = yield* Session.Service
  const prompts = yield* SessionPrompt.Service
  const database = yield* Database.Service
  const session = yield* sessions.create({ title: "Critical admission" })
  return { sessions, prompts, database, session, llm }
})

it.instance(
  "paused operational commit hides reverted history until exact retry can execute original User once",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup
      const old = yield* fixture.prompts.prompt({
        sessionID: fixture.session.id,
        model,
        noReply: true,
        parts: [{ type: "text", text: "must disappear" }],
      })
      yield* fixture.sessions.setRevert({
        sessionID: fixture.session.id,
        revert: { messageID: old.info.id },
        summary: undefined,
      })
      const request = {
        sessionID: fixture.session.id,
        messageID: MessageID.ascending(),
        model,
        noReply: true,
        parts: [{ type: "text" as const, text: "original committed input" }],
      }
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const calls: string[] = []
      const first = yield* fixture.prompts
        .prompt(request)
        .pipe(Effect.provideService(CacheGate, { ready, release, calls }), Effect.forkScoped)
      yield* Deferred.await(ready).pipe(Effect.timeout("10 seconds"))
      yield* fixture.llm.text("done")
      const requested = yield* Deferred.make<void>()
      const retry = yield* fixture.prompts
        .prompt({ ...request, noReply: false })
        .pipe(Effect.provideService(ReadRequested, requested), Effect.forkScoped)
      yield* Deferred.await(requested).pipe(Effect.timeout("10 seconds"))
      // Keep cache closed for a bounded real HTTP callback observation window, not a scheduler turn.
      const earlyHTTP = yield* fixture.llm.wait(1).pipe(Effect.timeout("5 seconds"), Effect.option)
      expect(Option.isNone(earlyHTTP)).toBe(true)
      yield* Deferred.succeed(release, undefined)
      yield* fixture.llm.wait(1).pipe(Effect.timeout("10 seconds"))
      const winner = yield* Fiber.join(first)
      const answer = yield* Fiber.join(retry)
      expect(answer.info.role === "assistant" ? answer.info.parentID : undefined).toBe(request.messageID)
      const inputs = JSON.stringify(yield* fixture.llm.inputs)
      expect(inputs).toContain("original committed input")
      expect(inputs).not.toContain("must disappear")
      expect(yield* fixture.llm.calls).toBe(1)
      const outbound = Schema.decodeUnknownSync(
        Schema.Array(
          Schema.Struct({
            messages: Schema.Array(
              Schema.Struct({
                role: Schema.String,
                content: Schema.Unknown,
              }),
            ),
          }),
        ),
      )(yield* fixture.llm.inputs)
      expect(outbound.flatMap((request) => request.messages.filter((message) => message.role === "user"))).toEqual([
        { role: "user", content: "original committed input" },
      ])
      expect(calls).toEqual(["invalidate", "advance"])
      expect((yield* fixture.sessions.get(fixture.session.id)).revert).toBeUndefined()
      expect(
        (yield* fixture.database.db.select().from(MessageTable).all())
          .filter((row) => row.data.role === "user")
          .map((row) => row.id),
      ).toEqual([request.messageID])
      expect((yield* PromptAdmission.find(fixture.database.db, request.messageID))?.snapshot).toEqual(winner)
    }),
  { git: true },
)

it.instance(
  "interrupting admission fiber during cache commit cannot leave partial critical state or start provider work",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup
      const old = yield* fixture.prompts.prompt({
        sessionID: fixture.session.id,
        model,
        noReply: true,
        parts: [{ type: "text", text: "old reverted input" }],
      })
      yield* fixture.sessions.setRevert({
        sessionID: fixture.session.id,
        revert: { messageID: old.info.id },
        summary: undefined,
      })
      const request = {
        sessionID: fixture.session.id,
        messageID: MessageID.ascending(),
        model,
        noReply: true,
        tools: { write: false },
        parts: [{ type: "text" as const, text: "survives interrupt" }],
      }
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const calls: string[] = []
      const admission = yield* fixture.prompts
        .prompt(request)
        .pipe(Effect.provideService(CacheGate, { ready, release, calls }), Effect.forkScoped)
      yield* Deferred.await(ready).pipe(Effect.timeout("10 seconds"))
      const interruption = yield* Fiber.interrupt(admission).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      expect(yield* fixture.llm.calls).toBe(0)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(interruption)
      const stored = yield* fixture.sessions.get(fixture.session.id)
      expect(stored.revert).toBeUndefined()
      expect(stored.agent).toBe("maestro")
      expect(stored.model).toMatchObject({ id: model.modelID, providerID: model.providerID })
      expect(Permission.evaluate("write", "file", stored.permission ?? []).action).toBe("deny")
      expect((yield* fixture.database.db.select().from(MessageTable).all()).map((row) => row.id)).toEqual([
        request.messageID,
      ])
      expect(yield* PromptAdmission.find(fixture.database.db, request.messageID)).toBeDefined()
      expect(calls).toEqual(["invalidate", "advance"])
      yield* fixture.llm.text("after interruption")
      const answer = yield* fixture.prompts.prompt({ ...request, noReply: false })
      expect(answer.info.role === "assistant" ? answer.info.parentID : undefined).toBe(request.messageID)
      expect(JSON.stringify(yield* fixture.llm.inputs)).not.toContain("old reverted input")
      expect(yield* fixture.llm.calls).toBe(1)
    }),
  { git: true },
)

it.instance(
  "caller mutation while real installed hook awaits its decision notification cannot change metadata or identity",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup
      const events = yield* EventV2Bridge.Service
      const snapshot = {
        schema: "relay.hook.v1",
        name: "Detached input",
        binding: "host-required",
        installed: false,
        nodes: [
          {
            id: "event",
            name: "Prompt",
            type: RelayHook.NodeType.trigger,
            position: [0, 0],
            parameters: { operation: "prompt", timing: "before" },
          },
          {
            id: "approval",
            name: "Remind",
            type: RelayHook.NodeType.remind,
            position: [1, 0],
            parameters: { message: "Keep original input." },
          },
        ],
        connections: [{ from: "event", port: 0, to: "approval" }],
      }
      const binding = { data: Global.Path.data, projectID: fixture.session.projectID, principal: "user:test" }
      yield* Effect.acquireRelease(
        RelayHookInstall.install({
          ...binding,
          document: "Detached input",
          version: "v1",
          snapshot,
          sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex"),
        }),
        (installed) =>
          RelayHookInstall.uninstall({ ...binding, installID: installed.install.installID }).pipe(
            Effect.orDie,
            Effect.asVoid,
          ),
      )
      const request = {
        sessionID: fixture.session.id,
        messageID: MessageID.ascending(),
        model: { ...model },
        noReply: true,
        parts: [{ type: "text" as const, text: "original", metadata: { nested: { label: "before" } } }],
      }
      const original = structuredClone(request)
      const ready = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      yield* events.listen((event) =>
        event.type === RelayHook.Decided.type &&
        Schema.decodeUnknownSync(RelayHook.Decided.data)(event.data).sessionID === fixture.session.id
          ? Deferred.succeed(ready, undefined).pipe(Effect.andThen(Deferred.await(release)))
          : Effect.void,
      )
      const pending = yield* fixture.prompts.prompt(request).pipe(Effect.forkScoped)
      yield* Deferred.await(ready).pipe(Effect.timeout("10 seconds"))
      request.parts[0].metadata.nested.label = "after"
      yield* Deferred.succeed(release, undefined)
      const winner = yield* Fiber.join(pending)
      expect(winner.parts).toMatchObject([
        { type: "text", text: "original", metadata: { nested: { label: "before" } } },
      ])
      expect((yield* PromptAdmission.find(fixture.database.db, request.messageID))?.identity).toBe(
        PromptIdentity.fromEncoded(Schema.encodeSync(SessionPrompt.PromptInput)(original)),
      )
      expect(
        (yield* fixture.database.db.select().from(EventTable).all()).filter(
          (row) => row.type === "session.v1.prompt.admitted.1",
        ),
      ).toHaveLength(1)
    }),
  { git: true },
)

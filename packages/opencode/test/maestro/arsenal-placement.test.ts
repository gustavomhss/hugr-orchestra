import { expect } from "bun:test"
import path from "node:path"
import { DateTime, Effect, Layer, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Catalog } from "@opencode-ai/core/catalog"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { EventV2 } from "@opencode-ai/core/event"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionStore } from "@opencode-ai/core/session/store"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { MaestroArsenal } from "@opencode-ai/core/tool/maestro-arsenal"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { Snapshot } from "@/snapshot"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)
const assistantMessageID = SessionMessage.ID.make("msg_native_placement_control")

it.live("a genuinely registered V2 maestro ID cannot substitute for a missing native legacy identity owner", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { disable: true } } } })
    await AppRuntime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "identity owner", agent: "build" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("Session projection missing")
          const locations = yield* LocationServiceMap.Service
          yield* Effect.gen(function* () {
            const agents = yield* AgentV2.Service
            const build = yield* agents.get(AgentV2.ID.make("build"))
            if (!build) throw new Error("actual host build permissions missing")
            yield* agents.transform((editor) =>
              editor.update(AgentV2.ID.make("maestro"), (agent) => {
                agent.permissions = [...build.permissions]
              }),
            )
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const result = yield* materialized.settle({
              sessionID: session.id,
              agent: AgentV2.ID.make("maestro"),
              assistantMessageID,
              call: { type: "tool-call", id: "unattested", name: MaestroArsenal.names.catalog, input: {} },
            })
            expect(result.result).toEqual({ type: "error", value: "Maestro Arsenal requires native Maestro identity." })
          }).pipe(Effect.provide(locations.get(projected.location)))
        }),
      ),
    )
  }),
)

it.live(
  "process registration resolves two actual Locations; real scoped identity and edit denial survive the bridge",
  () =>
    Effect.promise(async () => {
      await using first = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await using second = await tmpdir({
        git: true,
        config: { agent: { maestro: { permission: { "*": "allow", edit: "deny" } } } },
      })
      await prepareArsenalSDK(first.path, Global.Path.config)
      await prepareArsenalSDK(second.path, Global.Path.config)
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const sessions = yield* Session.Service
          const store = yield* SessionStore.Service
          const locations = yield* LocationServiceMap.Service
          const filesystem = yield* FSUtil.Service
          const one = yield* instances.load({ directory: first.path })
          const two = yield* instances.load({ directory: second.path })
          const a = yield* sessions
            .create({ title: "placement A", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, one))
          const b = yield* sessions
            .create({ title: "placement B", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, two))
          expect(a.projectID).not.toBe(b.projectID)
          const run = (session: typeof a, input: { action: "get" | "set"; patch?: { scrutiny: "strict" } }) =>
            Effect.gen(function* () {
              const projected = yield* store.get(session.id)
              if (!projected) throw new Error("Session projection missing")
              return yield* Effect.gen(function* () {
                const registry = yield* ToolRegistry.Service
                const materialized = yield* registry.materialize()
                const invoke = (name: string, arguments_: unknown, agent = AgentV2.ID.make("maestro")) =>
                  materialized.settle({
                    sessionID: session.id,
                    agent,
                    assistantMessageID,
                    call: { type: "tool-call", id: `native-${name}`, name, input: arguments_ },
                  })
                expect((yield* invoke(MaestroArsenal.names.catalog, {}, AgentV2.ID.make("build"))).result).toEqual({
                  type: "error",
                  value: "Maestro Arsenal requires native Maestro identity.",
                })
                expect((yield* invoke(MaestroArsenal.names.describe, { name: "profile" })).result).toMatchObject({
                  type: "text",
                })
                return yield* invoke(MaestroArsenal.names.execute, { name: "profile", arguments: input })
              }).pipe(Effect.provide(locations.get(projected.location)))
            })
          expect((yield* run(a, { action: "set", patch: { scrutiny: "strict" } })).result).toMatchObject({
            type: "text",
          })
          expect((yield* run(b, { action: "set", patch: { scrutiny: "strict" } })).result).toEqual({
            type: "error",
            value: "Arsenal permission denied.",
          })
          const untouched = yield* run(b, { action: "get" })
          expect(untouched.result).toMatchObject({ type: "text" })
          const envelope = Schema.decodeUnknownSync(
            Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }),
          )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(untouched.output?.structured))
          expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({
            exists: false,
          })
          expect(yield* filesystem.readDirectory(MaestroArsenal.stateDirectory(Global.Path.data, b.projectID))).toEqual(
            [],
          )
        }),
      )
    }),
  90000,
)

it.live(
  "actual F RuntimeProfile blocks backend writes before state mutation; ordinary package advice grants no edit",
  () =>
    Effect.promise(async () => {
      await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
      await AppRuntime.runPromise(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "resource policy", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("Session projection missing")
          const locations = yield* LocationServiceMap.Service
          const result = yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const invoke = (name: string, input: unknown) =>
              materialized.settle({
                sessionID: session.id,
                agent: AgentV2.ID.make("maestro"),
                assistantMessageID,
                call: { type: "tool-call", id: `guard-${name}`, name, input },
              })
            expect((yield* invoke(MaestroArsenal.names.describe, { name: "profile" })).result).toMatchObject({
              type: "text",
            })
            return yield* invoke(MaestroArsenal.names.execute, {
              name: "profile",
              arguments: { action: "set", patch: { scrutiny: "strict" } },
            }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { writeRoots: [tmp.path] }))
          }).pipe(Effect.provide(locations.get(projected.location)))
          expect(result.result).toEqual({ type: "error", value: "ARSENAL_RESOURCE_SAFETY_DENIED" })
          const fs = yield* FSUtil.Service
          expect(yield* fs.readDirectory(MaestroArsenal.stateDirectory(Global.Path.data, session.projectID))).toEqual(
            [],
          )
        }),
      )
    }),
)

it.live("unknown model pricing remains actual HOLD, never the zero-cost placeholder stored by the V2 runner", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
    await AppRuntime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const instances = yield* InstanceStore.Service
          const instance = yield* instances.load({ directory: tmp.path })
          const sessions = yield* Session.Service
          const session = yield* sessions
            .create({ title: "unpriced", agent: "maestro" })
            .pipe(Effect.provideService(InstanceRef, instance))
          const store = yield* SessionStore.Service
          const projected = yield* store.get(session.id)
          if (!projected) throw new Error("Session projection missing")
          const locations = yield* LocationServiceMap.Service
          const model = ModelV2.Ref.make({
            providerID: ProviderV2.ID.make("native-unpriced"),
            id: ModelV2.ID.make("model"),
          })
          yield* Effect.gen(function* () {
            const catalog = yield* Catalog.Service
            yield* catalog.transform((draft) =>
              draft.model.update(model.providerID, model.id, (info) => {
                info.name = "Actual application-registered model without rates"
              }),
            )
          }).pipe(Effect.provide(locations.get(projected.location)))
          const snapshots = yield* Snapshot.Service
          const revision = yield* snapshots.track().pipe(Effect.provideService(InstanceRef, instance))
          const events = yield* EventV2.Service
          yield* events.publish(SessionEvent.Step.Started, {
            sessionID: session.id,
            timestamp: yield* DateTime.now,
            assistantMessageID,
            agent: "maestro",
            model,
            snapshot: revision,
          })
          yield* events.publish(SessionEvent.Step.Ended, {
            sessionID: session.id,
            timestamp: yield* DateTime.now,
            assistantMessageID,
            finish: "stop",
            cost: 0,
            usageKnown: true,
            snapshot: revision,
            tokens: { input: 5, output: 2, reasoning: 1, cache: { read: 3, write: 4 } },
          })
          const observations = yield* ArsenalObservations.Service
          const actual = yield* observations.read({
            sessionID: session.id,
            operation: "usage",
            placement: { directory: tmp.path, projectID: session.projectID },
          })
          expect(actual.prices).toEqual([])
          expect(actual.observations).toMatchObject({
            usage: [{ provider: model.providerID, model: model.id, input: 5, output: 3, cacheRead: 3, cacheWrite: 4 }],
          })
          const result = yield* Effect.gen(function* () {
            const registry = yield* ToolRegistry.Service
            const materialized = yield* registry.materialize()
            const invoke = (name: string, input: unknown) =>
              materialized.settle({
                sessionID: session.id,
                agent: AgentV2.ID.make("maestro"),
                assistantMessageID,
                call: { type: "tool-call", id: `unpriced-${name}`, name, input },
              })
            expect((yield* invoke(MaestroArsenal.names.describe, { name: "governance" })).result).toMatchObject({
              type: "text",
            })
            return yield* invoke(MaestroArsenal.names.execute, {
              name: "governance",
              arguments: { operation: "usage", observations: { complete: false }, prices: [{ input: 0, output: 0 }] },
            })
          }).pipe(Effect.provide(locations.get(projected.location)))
          expect(result.result).toMatchObject({ type: "text" })
          const envelope = Schema.decodeUnknownSync(
            Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }),
          )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output?.structured))
          expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text)).toMatchObject({
            status: "HOLD",
            costUSD: null,
            holds: ["PRICING_UNKNOWN: native-unpriced/model"],
          })
        }),
      ),
    )
  }),
)

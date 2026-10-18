import { expect } from "bun:test"
import path from "node:path"
import { Cause, DateTime, Effect, Fiber, Layer, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionEvent } from "@orchestra/core/session/event"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { PermissionV2 } from "@orchestra/core/permission"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { EventV2 } from "@orchestra/core/event"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Tool } from "@orchestra/core/tool/tool"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { testEffect, pollWithTimeout } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("default native registry captures explicit approval before a real filesystem effect", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" }).pipe(Effect.provideService(InstanceRef, instance))
      const store = yield* SessionStore.Service
      const projected = yield* store.get(session.id)
      if (!projected) throw new Error("Actual native Session placement missing")
      const events = yield* EventV2.Service
      const locations = yield* LocationServiceMap.Service
      const fs = yield* FSUtil.Service
      const marker = path.join(tmp.path, "approved-native-effect")
      const action = "native-fixture-write"
      yield* Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const permissions = yield* PermissionV2.Service
        yield* registry.register({ [action]: Tool.make({
          description: "Actual native approval boundary fixture",
          input: Schema.Struct({}),
          output: Schema.String,
          execute: () => fs.writeFileString(marker, "approved-native-effect").pipe(Effect.orDie, Effect.as("written")),
        }) })
        const materialized = yield* registry.materialize()
        const assistantMessageID = SessionMessage.ID.make("msg_default_native_approval")
        yield* events.publish(SessionEvent.Step.Started, { sessionID: session.id, assistantMessageID, agent: "maestro",
          model: ModelV2.Ref.make({ id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") }), timestamp: yield* DateTime.now })
        const replies = ["reject", "once"] as const
        yield* Effect.forEach(replies, (reply) => Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: session.id, assistantMessageID,
            callID: `default-approval-${reply}`, name: action, timestamp: yield* DateTime.now })
          yield* events.publish(SessionEvent.Tool.Called, { sessionID: session.id, assistantMessageID,
            callID: `default-approval-${reply}`, tool: action, input: {}, provider: { executed: false }, timestamp: yield* DateTime.now })
          const state: { settled?: unknown } = {}
          const pending = yield* materialized.settle({
            sessionID: session.id,
            agent: AgentV2.ID.make("maestro"),
            assistantMessageID,
            call: { type: "tool-call", id: `default-approval-${reply}`, name: action, input: {} },
          }).pipe(
            Effect.exit,
            Effect.tap((settled) => Effect.sync(() => { state.settled = settled })),
            Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: [action] }),
            Effect.forkChild,
          )
          const asked = yield* pollWithTimeout(Effect.gen(function* () {
            const items = yield* permissions.list()
            const request = items.find((item) => item.metadata?.nativeSafety === true)
            if (request) return request
            if (state.settled) throw new Error(`Native settlement preceded required approval: ${JSON.stringify(state.settled)}`)
          }), "Default native approval producer did not request explicit permission")
          expect(asked).toMatchObject({ sessionID: session.id, resources: [action], source: { type: "tool", messageID: assistantMessageID, callID: `default-approval-${reply}` }, metadata: {
            action, callID: `default-approval-${reply}`, projectID: session.projectID,
          } })
          expect(yield* fs.exists(marker)).toBe(false)
          yield* permissions.reply({ requestID: asked.id, reply })
          const exit = yield* Fiber.join(pending)
          if (exit._tag === "Failure") throw new Error(Cause.pretty(exit.cause))
          const settled = exit.value
          if (reply === "reject") {
            expect(settled.result).toMatchObject({ type: "error", value: "Tool safety HOLD: approval-native-rejected" })
            expect(yield* fs.exists(marker)).toBe(false)
            return
          }
          expect(settled.result.type).toBe("text")
          expect(yield* fs.readFileString(marker)).toBe("approved-native-effect")
        }))
        expect(yield* permissions.list()).toEqual([])
      }).pipe(
        Effect.provide(locations.get(projected.location)),
        Effect.provideService(InstanceRef, instance),
      )
    })))
  }), 90000,
)

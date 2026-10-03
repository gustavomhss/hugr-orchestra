import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Fiber, Layer, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { SessionStore } from "@opencode-ai/core/session/store"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Location } from "@opencode-ai/core/location"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { Tool } from "@opencode-ai/core/tool/tool"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { Session } from "@/session/session"
import { Permission } from "@/permission"
import { tmpdir } from "../fixture/fixture"
import { testEffect, pollWithTimeout } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("default native registry captures explicit approval before a real filesystem effect", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true, config: { agent: { build: { permission: { "*": "allow" } } } } })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "build" }).pipe(Effect.provideService(InstanceRef, instance))
      const store = yield* SessionStore.Service
      const projected = yield* store.get(session.id)
      if (!projected) throw new Error("Actual native Session placement missing")
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const fs = yield* FSUtil.Service
      const marker = path.join(tmp.path, "approved-native-effect")
      const action = "native-fixture-write"
      const layer = AppNodeBuilderV1.build(LayerNode.group([
        ToolRegistry.node, ToolRegistry.toolsNode, Permission.node, Session.node, InstanceStore.node,
      ]), [
        [Location.node, Location.boundNode(projected.location)],
        [Database.node, Layer.succeed(Database.Service, database)],
        [EventV2.node, Layer.succeed(EventV2.Service, events)],
      ])
      yield* Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const permissions = yield* Permission.Service
        yield* registry.register({ [action]: Tool.make({
          description: "Actual native approval boundary fixture",
          input: Schema.Struct({}),
          output: Schema.String,
          execute: () => fs.writeFileString(marker, "approved-native-effect").pipe(Effect.orDie, Effect.as("written")),
        }) })
        const materialized = yield* registry.materialize()
        const replies = ["reject", "once"] as const
        yield* Effect.forEach(replies, (reply) => Effect.gen(function* () {
          const state: { settled?: unknown } = {}
          const pending = yield* materialized.settle({
            sessionID: session.id,
            agent: AgentV2.ID.make("build"),
            assistantMessageID: SessionMessage.ID.make("msg_default_native_approval"),
            call: { type: "tool-call", id: `default-approval-${reply}`, name: action, input: {} },
          }).pipe(
            Effect.exit,
            Effect.tap((settled) => Effect.sync(() => { state.settled = settled })),
            Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: [action] }),
            Effect.forkChild,
          )
          const asked = yield* pollWithTimeout(Effect.gen(function* () {
            const items = yield* permissions.list()
            const request = items.find((item) => item.metadata.nativeSafety === true)
            if (request) return request
            if (state.settled) throw new Error(`Native settlement preceded required approval: ${JSON.stringify(state.settled)}`)
          }), "Default native approval producer did not request explicit permission")
          expect(asked).toMatchObject({ sessionID: session.id, patterns: [action], metadata: {
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
        Effect.provide(layer),
        Effect.provideService(InstanceRef, instance),
      )
    })))
  }), 90000,
)

import { expect } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { Database } from "@orchestra/core/database/database"
import { EventTable } from "@orchestra/core/event/sql"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/core/session/event"
import { MessageID } from "@/session/schema"
import { Global } from "@orchestra/core/global"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { and, eq } from "drizzle-orm"
import { prepareArsenalSDK } from "./arsenal-fixture"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { Agent } from "@/agent/agent"
import { SessionStore } from "@orchestra/core/session/store"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionMessage } from "@orchestra/core/session/message"

const it = testEffect(Layer.empty)

it.live("one native owner persists one started/terminal pair; nonzero exits and aborts cannot mint success", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const native = yield* ArsenalBindings.make
      const input = { tool: "native-check", args: {}, sessionID: session.id, assistantMessageID: MessageID.ascending(), callID: "single-owner", directory: tmp.path, projectID: session.projectID }
      yield* native.withSession(session.id, native.run(input, native.run(input, Effect.succeed({ output: "failed command", metadata: { exit: 7 } }), false)))
      const database = yield* Database.Service
      const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
      const facts = rows.map((row) => Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data)).filter((data) => data.callID === input.callID).map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal))
      expect(facts.map((fact) => fact.outcome)).toEqual(["started", "failure"])
      expect(ArsenalBindings.classifyOutcome({ isError: true })).toBe("failure")
      expect(ArsenalBindings.classifyOutcome({ metadata: { exit: 0 } })).toBe("success")
      expect(ArsenalBindings.classifyOutcome({ output: "partial" }, true)).toBe("cancelled")
      const registry = yield* Service
      const bash = (yield* registry.all()).find((tool) => tool.id === "bash")
      if (!bash) throw new Error("Actual native Bash producer missing")
      const permission = yield* Permission.Service
      const agents = yield* Agent.Service
      const actor = yield* agents.get("maestro")
      const context: Tool.Context = { sessionID: session.id, messageID: MessageID.ascending(), callID: "actual-bash", agent: "maestro", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: actor.permission }).pipe(Effect.orDie) }
      const output = yield* bash.execute({ command: "exit 7", description: "Native outcome control" }, context)
      expect(output.metadata.exit).toBe(7)
      const actual = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
      expect(actual.map((row) => Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data)).filter((data) => data.callID === context.callID).map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.nativeArsenal).outcome)).toEqual(["started", "failure"])
      const store = yield* SessionStore.Service
      const projected = yield* store.get(session.id)
      if (!projected) throw new Error("Actual Session placement missing")
      const locations = yield* LocationServiceMap.Service
      yield* Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const materialized = yield* registry.materialize()
        const result = yield* materialized.settle({ sessionID: session.id, agent: AgentV2.ID.make("maestro"), assistantMessageID: SessionMessage.ID.make(context.messageID), call: { type: "tool-call", id: "actual-v2-bash", name: "bash", input: { command: "exit 7" } } })
        expect(result.output?.structured).toMatchObject({ exit: 7 })
      }).pipe(Effect.provide(locations.get(projected.location)))
      const v2 = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
      expect(v2.map((row) => Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data)).filter((data) => data.callID === "actual-v2-bash").map((data) => Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.String }))(data.structured.toolSafety).outcome)).toEqual(["started", "failure"])
    }).pipe(Effect.provideService(InstanceRef, instance))
  }).pipe(Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, Global.node]))))))
}), 90000)

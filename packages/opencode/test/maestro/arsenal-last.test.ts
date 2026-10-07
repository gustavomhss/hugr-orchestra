import { expect } from "bun:test"
import path from "node:path"
import { Cause, DateTime, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { Global } from "@opencode-ai/core/global"
import { SessionStore } from "@opencode-ai/core/session/store"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"
import { AgentV2 } from "@opencode-ai/core/agent"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { MaestroArsenal } from "@opencode-ai/core/tool/maestro-arsenal"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { Permission } from "@/permission"
import { Service } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Agent } from "@/agent/agent"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Database } from "@opencode-ai/core/database/database"
import { EventTable } from "@opencode-ai/core/event/sql"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { and, eq } from "drizzle-orm"
import { tmpdir } from "../fixture/fixture"
import { testEffect, pollWithTimeout } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("actual completed transcript parts preserve native failure/cancel/held authority in governance audit", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await AppRuntime.runPromise(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const message = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: session.id, role: "assistant", parentID: MessageID.ascending(), agent: "maestro", mode: "maestro", path: { cwd: tmp.path, root: tmp.path }, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, modelID: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture"), time: { created: Date.now() } })
      yield* sessions.updatePart({ id: PartID.ascending(), sessionID: session.id, messageID: message.id, type: "step-start" })
      const observations = yield* ArsenalObservations.Service
      const outcomes = ["failure", "cancelled", "held", "success"] as const
      yield* Effect.forEach(outcomes, (outcome) => Effect.gen(function* () {
        const part = { id: PartID.ascending(), sessionID: session.id, messageID: message.id, type: "tool" as const, tool: `native-${outcome}`, callID: `native-${outcome}` }
        yield* sessions.updatePart({ ...part, state: { status: "pending", input: {}, raw: "" } })
        yield* Effect.forEach(["started", outcome] as const, (terminal) => observations.emit({ sessionID: session.id, assistantMessageID: message.id, callID: part.callID, placement: { directory: tmp.path, projectID: session.projectID }, fact: { source: "native-host", version: 1, kind: "safety", tool: part.tool, outcome: terminal } }))
        yield* sessions.updatePart({ ...part, state: { status: "completed", input: {}, title: "delivered", output: "delivered", metadata: { toolSafety: { outcome: outcome === "success" ? "failure" : "success" } }, time: { start: Date.now(), end: Date.now() } } })
      }))
      const untrusted = { id: PartID.ascending(), sessionID: session.id, messageID: message.id, type: "tool" as const, tool: "model-metadata", callID: "model-metadata" }
      yield* sessions.updatePart({ ...untrusted, state: { status: "pending", input: {}, raw: "" } })
      yield* sessions.updatePart({ ...untrusted, state: { status: "completed", input: {}, title: "delivered", output: "delivered", metadata: { nativeArsenal: { source: "native-host", kind: "safety", outcome: "held" }, toolSafety: { outcome: "failure" } }, time: { start: Date.now(), end: Date.now() } } })
      const registry = yield* Service
      const definitions = yield* registry.all()
      const describe = definitions.find((item) => item.id === MaestroArsenal.names.describe)
      const execute = definitions.find((item) => item.id === MaestroArsenal.names.execute)
      if (!describe || !execute) throw new Error("Actual native governance tools missing")
      const permission = yield* Permission.Service
      const agents = yield* Agent.Service
      const actor = yield* agents.get("maestro")
      const context: Tool.Context = { sessionID: session.id, messageID: message.id, agent: "maestro", callID: "actual-audit", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: actor.permission }).pipe(Effect.orDie) }
      yield* describe.execute({ name: "governance" }, context)
      const audit = yield* execute.execute({ name: "governance", arguments: { operation: "audit" } }, context)
      const envelope = Schema.decodeUnknownSync(Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(audit.output))
      const report = Schema.decodeUnknownSync(Schema.Struct({ actions: Schema.Array(Schema.Struct({ tool: Schema.String, outcome: Schema.String, provenance: Schema.Struct({ eventID: Schema.String }) })) }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text))
      expect(report.actions.filter((action) => action.tool.startsWith("native-") || action.tool === "model-metadata").map((action) => ({ tool: action.tool, outcome: action.outcome }))).toEqual([{ tool: "native-failure", outcome: "failed" }, { tool: "native-cancelled", outcome: "failed" }, { tool: "native-held", outcome: "denied" }, { tool: "native-success", outcome: "succeeded" }, { tool: "model-metadata", outcome: "succeeded" }])
      const database = yield* Database.Service
      const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)))).all().pipe(Effect.orDie)
      ;["failure", "cancelled", "held"].forEach((outcome) => {
        const terminal = rows.find((row) => {
          const data = Schema.decodeUnknownSync(SessionEvent.Tool.Progress.data)(row.data)
          const fact = Schema.decodeUnknownOption(ArsenalObservations.NativeFact)(data.structured.nativeArsenal)
          return data.callID === `native-${outcome}` && fact._tag === "Some" && fact.value.outcome === outcome
        })
        expect(terminal).toBeDefined()
        expect(report.actions.find((action) => action.tool === `native-${outcome}`)?.provenance.eventID).toBe(terminal?.id)
      })
    }).pipe(Effect.provideService(InstanceRef, instance))
  }))
}), 90000)

it.live("default AppRuntime V2 native node captures askBefore once; configured read deny still denies leaf", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow", read: { "*": "allow", "blocked.txt": "deny" } } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await Bun.write(path.join(tmp.path, "blocked.txt"), "protected")
  await Bun.write(path.join(tmp.path, "free.txt"), "free")
  await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const store = yield* SessionStore.Service
      const projected = yield* store.get(session.id)
      if (!projected) throw new Error("Actual V2 Session placement missing")
      const locations = yield* LocationServiceMap.Service
      const events = yield* EventV2.Service
      const captured: PermissionV2.Request[] = []
      const unsubscribe = yield* events.listen((event) => Effect.sync(() => {
        if (event.type !== PermissionV2.Event.Asked.type) return
        const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
        if (request.sessionID === session.id) captured.push(request)
      }))
      yield* Effect.addFinalizer(() => unsubscribe)
      yield* Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const permissions = yield* PermissionV2.Service
        const materialized = yield* registry.materialize()
        const invoke = (id: string, name: string, input: unknown) => materialized.settle({ sessionID: session.id, agent: AgentV2.ID.make("maestro"), assistantMessageID: SessionMessage.ID.make("msg_native_approval"), call: { type: "tool-call", id, name, input } })
        expect((yield* invoke("profile-describe", MaestroArsenal.names.describe, { name: "profile" })).result.type).toBe("text")
        expect((yield* invoke("profile-set", MaestroArsenal.names.execute, { name: "profile", arguments: { action: "set", patch: { askBefore: ["read"] } } })).result.type).toBe("text")
        yield* events.publish(SessionEvent.Step.Started, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), agent: "maestro", model: ModelV2.Ref.make({ id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") }), timestamp: yield* DateTime.now })
        yield* Effect.forEach(["once", "reject"] as const, (reply) => Effect.gen(function* () {
          const callID = `actual-explicit-read-${reply}`
          yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), callID, name: "read", timestamp: yield* DateTime.now })
          yield* events.publish(SessionEvent.Tool.Input.Ended, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), callID, text: JSON.stringify({ path: "free.txt" }), timestamp: yield* DateTime.now })
          yield* events.publish(SessionEvent.Tool.Called, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), callID, tool: "read", input: { path: "free.txt" }, provider: { executed: false }, timestamp: yield* DateTime.now })
          const pending = yield* invoke(callID, "read", { path: "free.txt" }).pipe(Effect.forkChild)
          const asked = yield* Effect.raceFirst(pollWithTimeout(permissions.list().pipe(Effect.map((requests) => requests.find((item) => item.metadata?.callID === callID))), "V2 owned native approval request missing"), Fiber.join(pending).pipe(Effect.flatMap((result) => Effect.fail(new Error(`V2_NATIVE_SETTLED_BEFORE_INTENT: ${JSON.stringify(result)}`)))))
          expect(captured.some((request) => request.id === asked.id)).toBe(true)
          expect(asked).toMatchObject({ sessionID: session.id, action: "read", resources: ["free.txt"], source: { type: "tool", messageID: "msg_native_approval", callID }, metadata: { nativeSafety: true, action: "read", projectID: session.projectID } })
          yield* permissions.reply({ requestID: asked.id, reply })
          const result = yield* Fiber.join(pending).pipe(Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail(new Error(`V2_REPLY_DID_NOT_SETTLE: ${reply}`)) }))
          if (reply === "once") expect(result.output?.structured).toMatchObject({ content: "free" })
          if (reply === "reject") expect(result.result).toEqual({ type: "error", value: "Tool safety HOLD: approval-native-rejected" })
        }))
        yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), callID: "actual-denied-read", name: "read", timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Tool.Called, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make("msg_native_approval"), callID: "actual-denied-read", tool: "read", input: { path: "blocked.txt" }, provider: { executed: false }, timestamp: yield* DateTime.now })
        expect((yield* invoke("actual-denied-read", "read", { path: "blocked.txt" })).result).toEqual({ type: "error", value: "Tool safety HOLD: approval-native-policy-denied" })
        expect(yield* permissions.list()).toEqual([])
        expect(captured.some((request) => request.metadata?.callID === "actual-denied-read")).toBe(false)
        expect((yield* invoke("fabricated-call", "read", { path: "free.txt" })).result).toEqual({ type: "error", value: "Tool safety HOLD: approval-v2-call-binding-mismatch" })
      }).pipe(Effect.provide(locations.get(projected.location)))
    }).pipe(Effect.provideService(InstanceRef, instance))
  })))
}), 90000)

it.live("actual V1 default native askBefore once cannot override configured leaf deny", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow", read: { "*": "allow", "blocked.txt": "deny" } } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await Bun.write(path.join(tmp.path, "blocked.txt"), "protected")
  await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    yield* Effect.gen(function* () {
      const sessions = yield* Session.Service
      const session = yield* sessions.create({ agent: "maestro" })
      const registry = yield* Service
      const definitions = yield* registry.all()
      const describe = definitions.find((item) => item.id === MaestroArsenal.names.describe)
      const execute = definitions.find((item) => item.id === MaestroArsenal.names.execute)
      const read = definitions.find((item) => item.id === "read")
      if (!describe || !execute || !read) throw new Error("Actual V1 native producers missing")
      const permission = yield* Permission.Service
      const agents = yield* Agent.Service
      const actor = yield* agents.get("maestro")
      expect(Permission.evaluate("read", "blocked.txt", actor.permission).action).toBe("deny")
      const context: Tool.Context = { sessionID: session.id, messageID: MessageID.ascending(), agent: "maestro", callID: "v1-explicit-deny", abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: (request) => permission.ask({ ...request, sessionID: session.id, ruleset: actor.permission }).pipe(Effect.orDie) }
      yield* describe.execute({ name: "profile" }, context)
      yield* execute.execute({ name: "profile", arguments: { action: "set", patch: { askBefore: ["read"] } } }, context)
      const pending = yield* read.execute({ filePath: path.join(tmp.path, "blocked.txt") }, context).pipe(Effect.exit, Effect.forkChild)
      const completed: { value?: Exit.Exit<Effect.Success<ReturnType<typeof read.execute>>, never> } = {}
      const replied: string[] = []
      yield* Effect.forEach([0, 1, 2, 3], () => Effect.gen(function* () {
        if (completed.value) return
        const next = yield* Effect.raceFirst(
          Fiber.join(pending).pipe(Effect.map((result) => ({ type: "done" as const, result }))),
          pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests.find((item) => item.metadata.nativeSafety === true))), "V1 default native approval request missing").pipe(Effect.map((request) => ({ type: "ask" as const, request }))),
        )
        if (next.type === "done") { completed.value = next.result; return }
        expect(next.request).toMatchObject({ sessionID: session.id, metadata: { action: "read", callID: context.callID, projectID: session.projectID } })
        replied.push(next.request.id)
        yield* permission.reply({ requestID: next.request.id, reply: "once" })
      }))
      expect(replied.length).toBeGreaterThan(0)
      const result = completed.value ?? (yield* Fiber.join(pending).pipe(Effect.timeout("1 second")))
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Explicit native once overrode configured read deny")
      expect(Cause.pretty(result.cause)).toContain("rule which prevents you from using this specific tool call")
      expect(Cause.pretty(result.cause)).not.toContain("ask-before-native-binding-missing")
      expect(yield* permission.list()).toEqual([])
    }).pipe(Effect.provideService(InstanceRef, instance))
  })))
}), 90000)

it.live("V2 configured tiny descriptor budget rejects complete schema before receipt and effect grant", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } } }, tool_output: { max_bytes: 64, max_lines: 1 } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await AppRuntime.runPromise(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ agent: "maestro" }).pipe(Effect.provideService(InstanceRef, instance))
    const store = yield* SessionStore.Service
    const projected = yield* store.get(session.id)
    if (!projected) throw new Error("Actual V2 Session placement missing")
    const locations = yield* LocationServiceMap.Service
    yield* Effect.gen(function* () {
      const outputs = yield* ToolOutputStore.Service
      expect(yield* outputs.limits()).toEqual({ maxBytes: 64, maxLines: 1 })
      const registry = yield* ToolRegistry.Service
      const materialized = yield* registry.materialize()
      const invoke = (id: string, name: string, input: unknown) => materialized.settle({ sessionID: session.id, agent: AgentV2.ID.make("maestro"), assistantMessageID: SessionMessage.ID.make("msg_tiny_descriptor"), call: { type: "tool-call", id, name, input } })
      expect((yield* invoke("tiny-describe", MaestroArsenal.names.describe, { name: "profile" })).result).toEqual({ type: "error", value: "DESCRIBE_CONTRACT_OVER_BUDGET" })
      const blocked = yield* invoke("tiny-execute", MaestroArsenal.names.execute, { name: "profile", arguments: { action: "set", patch: { scrutiny: "strict" } } }).pipe(Effect.exit)
      expect(blocked._tag).toBe("Success")
      if (blocked._tag !== "Success") throw new Error(Cause.pretty(blocked.cause))
      expect(blocked.value.result.type).toBe("error")
      expect(JSON.stringify(blocked.value)).toContain("Describe this Arsenal capability")
      expect(yield* Effect.promise(() => Bun.file(path.join(MaestroArsenal.stateDirectory(Global.Path.data, session.projectID), session.projectID, "profile/preferences.json")).exists())).toBe(false)
    }).pipe(Effect.provide(locations.get(projected.location)))
  }))
}), 90000)

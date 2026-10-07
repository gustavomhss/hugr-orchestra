import { expect } from "bun:test"
import path from "node:path"
import { DateTime, Effect, Fiber, Layer } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { EventV2 } from "@opencode-ai/core/event"
import { Global } from "@opencode-ai/core/global"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { SessionEvent } from "@opencode-ai/core/session/event"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionStore } from "@opencode-ai/core/session/store"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { ArsenalApproval } from "@/maestro/arsenal-approval"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceStore } from "@/project/instance-store"
import { InstanceRef } from "@/effect/instance-ref"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { testEffect, pollWithTimeout } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)

it.live("default V2 approval binds exact assistant and agent; repeated call IDs cannot borrow another message policy", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true, config: { agent: { maestro: { permission: { "*": "allow" } }, reviewer: { permission: { "*": "allow", read: "deny" } } } } })
  await prepareArsenalSDK(tmp.path, Global.Path.config)
  await Bun.write(path.join(tmp.path, "secret.txt"), "leaf-read-marker")
  await AppRuntime.runPromise(Effect.scoped(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory: tmp.path })
    const sessions = yield* Session.Service
    const session = yield* sessions.create({ agent: "maestro" }).pipe(Effect.provideService(InstanceRef, instance))
    const store = yield* SessionStore.Service
    const projected = yield* store.get(session.id)
    if (!projected) throw new Error("Actual Session missing")
    const events = yield* EventV2.Service
    const start = (id: string, agent: string, calls: readonly string[]) => Effect.gen(function* () {
      yield* events.publish(SessionEvent.Step.Started, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make(id), agent, model: ModelV2.Ref.make({ id: ModelV2.ID.make("fixture"), providerID: ProviderV2.ID.make("fixture") }), timestamp: yield* DateTime.now })
      yield* Effect.forEach(calls, (callID) => Effect.gen(function* () {
        yield* events.publish(SessionEvent.Tool.Input.Started, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make(id), callID, name: "read", timestamp: yield* DateTime.now })
        yield* events.publish(SessionEvent.Tool.Called, { sessionID: session.id, assistantMessageID: SessionMessage.ID.make(id), callID, tool: "read", input: { path: "secret.txt" }, provider: { executed: false }, timestamp: yield* DateTime.now })
      }))
    })
    yield* start("msg_identity_a", "reviewer", ["repeated"])
    yield* start("msg_identity_b", "maestro", ["only-b", "repeated"])
    const locations = yield* LocationServiceMap.Service
    yield* Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const permissions = yield* PermissionV2.Service
      const host = yield* ArsenalApproval.makeV2ApprovalHost
      const materialized = yield* registry.materialize()
      const invoke = (messageID: string, agent: string, callID: string) => materialized.settle({ sessionID: session.id, assistantMessageID: SessionMessage.ID.make(messageID), agent: AgentV2.ID.make(agent), call: { type: "tool-call", id: callID, name: "read", input: { path: "secret.txt" } } }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: ["read"] }))
      const held = (messageID: string, agent: string, callID: string) => Effect.raceFirst(invoke(messageID, agent, callID), pollWithTimeout(permissions.list().pipe(Effect.map((items) => items.find((item) => item.source?.callID === callID))), "No incorrect-source prompt expected").pipe(Effect.flatMap((request) => Effect.fail(new Error(`ASSISTANT_IDENTITY_BORROWED: ${JSON.stringify(request.source)}`)))))
      expect((yield* held("msg_identity_a", "maestro", "only-b")).result).toEqual({ type: "error", value: "Tool safety HOLD: approval-v2-assistant-binding-mismatch" })
      const wrongMessage = yield* held("msg_identity_a", "reviewer", "only-b")
      expect(wrongMessage.result).toEqual({ type: "error", value: "Tool safety HOLD: approval-v2-call-binding-mismatch" })
      const wrongAgent = yield* held("msg_identity_b", "reviewer", "only-b")
      expect(wrongAgent.result).toEqual({ type: "error", value: "Tool safety HOLD: approval-v2-assistant-binding-mismatch" })
      expect((yield* invoke("msg_identity_a", "reviewer", "repeated")).result).toEqual({ type: "error", value: "Tool safety HOLD: approval-native-policy-denied" })
      const missing = yield* host.ask({ action: "read", resources: ["secret.txt"], invocation: { tool: "read", args: { filePath: path.join(tmp.path, "secret.txt") }, sessionID: session.id, callID: "only-b", directory: tmp.path, projectID: session.projectID, agent: "maestro" } }).pipe(Effect.result)
      expect(missing).toMatchObject({ _tag: "Failure", failure: { reason: "approval-v2-invocation-identity-missing" } })
      const missingAgent = yield* host.ask({ action: "read", resources: ["secret.txt"], invocation: { tool: "read", args: { filePath: path.join(tmp.path, "secret.txt") }, sessionID: session.id, callID: "only-b", directory: tmp.path, projectID: session.projectID, assistantMessageID: "msg_identity_b" } }).pipe(Effect.result)
      expect(missingAgent).toMatchObject({ _tag: "Failure", failure: { reason: "approval-v2-invocation-identity-missing" } })
      expect(yield* permissions.list()).toEqual([])
      expect(JSON.stringify([wrongMessage, wrongAgent])).not.toContain("leaf-read-marker")
      const pending = yield* invoke("msg_identity_b", "maestro", "repeated").pipe(Effect.forkChild)
      const request = yield* Effect.raceFirst(pollWithTimeout(permissions.list().pipe(Effect.map((items) => items.find((item) => item.source?.callID === "repeated"))), "Exact assistant request missing"), Fiber.join(pending).pipe(Effect.flatMap((result) => Effect.fail(new Error(`IDENTITY_SETTLED_BEFORE_REPLY: ${JSON.stringify(result)}`)))))
      expect(request.source).toEqual({ type: "tool", messageID: "msg_identity_b", callID: "repeated" })
      yield* permissions.reply({ requestID: request.id, reply: "once" })
      expect((yield* Fiber.join(pending)).output?.structured).toMatchObject({ content: "leaf-read-marker" })
      expect(yield* permissions.list()).toEqual([])
    }).pipe(Effect.provide(locations.get(projected.location)))
  })))
}), 90000)

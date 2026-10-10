export * as CapabilityPolicyFixture from "./capability-policy"

import { expect } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityPolicy } from "@orchestra/core/capability/policy"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import type { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { DateTime, Deferred, Effect, Fiber, Layer, Ref, Schema } from "effect"
import { location } from "./location"

export const placement = location({ directory: AbsolutePath.make("/project") })
export const layer = AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node, AgentV2.node, Location.node,
  PermissionSaved.node,
]), [[Location.node, Layer.succeed(Location.Service, Location.Service.of(placement))]])
export const allow: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "allow" }]
export const deny: PermissionV2.Ruleset = [{ action: "read", resource: "*", effect: "deny" }]
export const input = { action: "read", resources: ["src/index.ts"] }
export const timestamp = DateTime.makeUnsafe(1)
export const secrets = ["secret provider feedback", "secret-resource", "secret-rule", "secret-call", "secret-agent"]

export function setRules(rules: PermissionV2.Ruleset, id = AgentV2.ID.make("test")) {
  return Effect.gen(function* () {
    const agents = yield* AgentV2.Service
    yield* agents.transform((editor) => editor.update(id, (agent) => {
      agent.permissions = rules.map((rule) => ({ ...rule }))
    }))
  })
}

export function fixture(options: { message?: boolean; part?: boolean; agent?: string; name?: string } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const permissions = yield* PermissionV2.Service
    const context: Tool.Context = {
      sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("test"),
      assistantMessageID: SessionMessage.ID.create(), toolCallID: "root-call",
    }
    yield* database.db.insert(ProjectTable).values({
      id: Project.ID.global, worktree: placement.directory, sandboxes: [],
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id: context.sessionID, project_id: Project.ID.global, directory: placement.directory,
      slug: "policy", title: "policy", version: "test", agent: "test",
    }).run().pipe(Effect.orDie)
    if (options.message !== false) {
      yield* events.publish(SessionEvent.Step.Started, {
        ...context, timestamp, agent: options.agent ?? "test",
        model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") },
      })
      if (options.part !== false) yield* events.publish(SessionEvent.Tool.Input.Started, {
        sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
        callID: context.toolCallID, name: options.name ?? "service_call", timestamp,
      })
    }
    yield* setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      issuer: "core", owner: {
        projectID: placement.project.id, location: { directory: placement.directory },
        sessionID: context.sessionID, agentID: context.agent,
      }, invocation: {
        sessionID: context.sessionID, agentID: context.agent,
        assistantMessageID: context.assistantMessageID, callID: context.toolCallID,
      }, rootToolName: "service_call", effectiveRules: allow.map((rule) => ({ ...rule })), nativeDenyFloor: [],
    }
    const policy = yield* CapabilityPolicy.make
    // Authorization sentinel only: this fixture does not dispatch a native adapter.
    const effects = yield* Ref.make(0)
    const target = Ref.update(effects, (n) => n + 1)
    const run = (host = binding, supplied = context, request = input) => CapabilityInvocation.withContext(
      host, policy.assert(supplied, request).pipe(Effect.andThen(target)),
    )
    return { context, binding, policy, run, target, events, permissions, database, effects }
  })
}

export function observeAsked(context: Tool.Context) {
  return Effect.gen(function* () {
    const events = yield* EventV2.Service
    const count = yield* Ref.make(0)
    const first = yield* Deferred.make<PermissionV2.Request>()
    const repeated = yield* Deferred.make<void>()
    const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
      if (event.type !== PermissionV2.Event.Asked.type) return
      const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
      if (request.sessionID !== context.sessionID || request.source?.type !== "tool" ||
        request.source.messageID !== context.assistantMessageID || request.source.callID !== context.toolCallID) return
      const n = yield* Ref.updateAndGet(count, (n) => n + 1)
      yield* Deferred.succeed(first, request)
      if (n > 1) yield* Deferred.succeed(repeated, undefined)
    }))
    yield* Effect.addFinalizer(() => unsubscribe)
    return { count, first, repeated, unsubscribe }
  })
}

export function queued(context: Tool.Context, effect: Effect.Effect<void, Capability.Failure>) {
  return Effect.gen(function* () {
    const observation = yield* observeAsked(context)
    const fiber = yield* effect.pipe(Effect.result, Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(fiber).pipe(
      Effect.andThen(Effect.fail(new Error("POLICY_BYPASSED_PERMISSION_QUEUE"))),
    ))
    const join = Effect.raceFirst(Fiber.join(fiber), Deferred.await(observation.repeated).pipe(
      Effect.andThen(Effect.fail(new Error("POLICY_QUEUED_SECOND_APPROVAL"))),
    ))
    return { fiber, request, observation, join }
  })
}

export function expectFailure(error: Capability.Failure, code: Capability.Failure["code"] = "target_denied") {
  return Effect.gen(function* () {
    const expected = {
      _tag: "Capability.Failure" as const,
      code,
      message: code === "target_denied" ? "Capability action is not authorized"
        : code === "invocation_binding_missing" ? "Capability invocation binding is missing"
        : "Capability invocation binding does not match",
    }
    expect(error).toBeInstanceOf(Capability.Failure)
    const encoded = yield* Schema.encodeEffect(Capability.Failure)(error)
    expect(encoded).toEqual(expected)
    const decoded = yield* Schema.decodeUnknownEffect(Capability.Failure)(encoded)
    expect(decoded).toBeInstanceOf(Capability.Failure)
    expect(yield* Schema.encodeEffect(Capability.Failure)(decoded)).toEqual(expected)
    secrets.forEach((secret) => expect(JSON.stringify(encoded)).not.toContain(secret))
  })
}

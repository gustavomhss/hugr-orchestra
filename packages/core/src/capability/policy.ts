export * as CapabilityPolicy from "./policy"

import { Capability } from "@orchestra/schema/capability"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { Database } from "../database/database"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { SessionStore } from "../session/store"
import type { Tool } from "../tool/tool"
import { CapabilityInvocation } from "./invocation"

const approved = Symbol("CapabilityPolicy.approved")
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
export type Permit = Readonly<{
  readonly [approved]: true
  context: Tool.Context
  binding: CapabilityInvocation.Binding
  action: string
  resources: readonly string[]
}>

export const make = Effect.gen(function* () {
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const permissions = yield* PermissionV2.Service
  const agents = yield* AgentV2.Service
  const database = yield* Database.Service
  const permits = new WeakSet<Permit>()

  const validate = Effect.fn("CapabilityPolicy.validate")(function* (binding: CapabilityInvocation.Binding) {
    const session = yield* sessions.get(binding.owner.sessionID)
    const stored = yield* sessions.message(binding.invocation.assistantMessageID)
    if (
      !session ||
      session.id !== binding.owner.sessionID ||
      session.projectID !== binding.owner.projectID ||
      session.location.directory !== binding.owner.location.directory ||
      session.location.workspaceID !== binding.owner.location.workspaceID ||
      !stored ||
      stored.sessionID !== binding.invocation.sessionID ||
      stored.message.id !== binding.invocation.assistantMessageID ||
      stored.message.type !== "assistant" ||
      stored.message.agent !== binding.invocation.agentID ||
      !stored.message.content.some(
        (part) =>
          part.type === "tool" &&
          part.id === binding.invocation.callID &&
          part.name === binding.rootToolName &&
          (part.state.status === "pending" || part.state.status === "running"),
      )
    )
      return yield* mismatch()
  })

  const authorize = Effect.fn("CapabilityPolicy.authorize")(function* (
    context: Tool.Context,
    input: { action: string; resources: readonly string[] },
  ): Effect.fn.Return<Permit, Capability.Failure> {
    const binding = yield* CapabilityInvocation.require(context, {
      projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
    })
    yield* validate(binding)
    if (
      !input.action.trim() ||
      input.action !== input.action.trim() ||
      input.resources.length === 0 ||
      input.resources.some((resource) => !resource.trim())
    )
      return yield* denied()

    // Native floor is restrict-only: later allow/ask rules cannot erase any captured deny.
    const floor = binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")
    const effects = input.resources.map((resource) => {
      if (PermissionV2.evaluate(input.action, resource, floor).effect === "deny") return "deny"
      return PermissionV2.evaluate(input.action, resource, binding.effectiveRules).effect
    })
    if (effects.includes("deny")) return yield* denied()
    const request = {
      sessionID: binding.invocation.sessionID,
      agent: binding.invocation.agentID,
      action: input.action,
      resources: [...input.resources],
      source: { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID },
    }
    yield* Effect.gen(function* () {
      yield* effects.includes("ask") ? permissions.askExplicit(request) : permissions.authorize(request)
      yield* validate(binding)
      // Authorization covers either path; a current configured deny still revokes it.
      if ((yield* permissions.evaluate(request)) === "deny") return yield* denied()
    }).pipe(
      Effect.catchTags({
        "PermissionV2.BlockedError": () => Effect.fail(denied()),
        "PermissionV2.CorrectedError": () => Effect.fail(denied()),
        "PermissionV2.DeclinedError": () => Effect.fail(denied()),
        "Session.NotFoundError": () => Effect.fail(mismatch()),
      }),
    )
    yield* validate(binding)
    const permit = Object.freeze({
      [approved]: true as const,
      context: Object.freeze({ ...context }), binding,
      action: request.action, resources: Object.freeze([...request.resources]),
    })
    permits.add(permit)
    return permit
  })

  const commit = <A, E, R>(permit: Permit, write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      if (!permit || permit[approved] !== true || !permits.has(permit)) return Effect.fail(mismatch())
      // Lock ordering is actor state -> SQLite writer. Approval never happens under either lock.
      return agents.withPermissions(permit.context.agent, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* CapabilityInvocation.require(permit.context, {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
        })
        if (current !== permit.binding) return yield* mismatch()
        yield* validate(current)
        const request = { sessionID: permit.context.sessionID, agent: permit.context.agent,
          action: permit.action, resources: [...permit.resources] }
        if ((yield* permissions.evaluate(request)) === "deny") return yield* denied()
        return yield* write(tx)
      }), { behavior: "immediate" })).pipe(Effect.catchTag("Session.NotFoundError", () => Effect.fail(mismatch())))
    })

  return { authorize, commit, assert: (context: Tool.Context, input: { action: string; resources: readonly string[] }) =>
    authorize(context, input).pipe(Effect.asVoid) }
})

function mismatch() {
  return new Capability.Failure({
    code: "invocation_binding_mismatch",
    message: "Capability invocation binding does not match",
  })
}

function denied() {
  return new Capability.Failure({ code: "target_denied", message: "Capability action is not authorized" })
}

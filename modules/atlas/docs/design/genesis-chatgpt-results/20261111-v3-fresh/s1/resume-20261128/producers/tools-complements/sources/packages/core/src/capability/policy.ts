export * as CapabilityPolicy from "./policy"

import { Capability } from "@orchestra/schema/capability"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { SqlError } from "effect/unstable/sql/SqlError"
import { AgentV2 } from "../agent"
import { Database } from "../database/database"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { SessionStore } from "../session/store"
import type { Tool } from "../tool/tool"
import { CapabilityInvocation } from "./invocation"
import { CapabilityChildTable } from "./sql"

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
    const stored = yield* sessions.message(binding.rootInvocation.assistantMessageID)
    if (
      !session ||
      session.id !== binding.owner.sessionID ||
      session.projectID !== binding.owner.projectID ||
      session.location.directory !== binding.owner.location.directory ||
      session.location.workspaceID !== binding.owner.location.workspaceID ||
      !stored ||
      stored.sessionID !== binding.rootInvocation.sessionID ||
      stored.message.id !== binding.rootInvocation.assistantMessageID ||
      stored.message.type !== "assistant" ||
      stored.message.agent !== binding.rootInvocation.agentID ||
      !stored.message.content.some(
        (part) =>
          part.type === "tool" &&
          part.id === binding.rootInvocation.callID &&
          part.name === binding.rootToolName &&
          (part.state.status === "pending" || part.state.status === "running"),
      )
    )
      return yield* mismatch()
    if (binding.lineage.length > 8) return yield* mismatch()
    yield* Effect.forEach(binding.lineage, (proof, index) => Effect.gen(function* () {
      const parentCallID = index === 0 ? binding.rootInvocation.callID : binding.lineage[index - 1]?.callID
      const row = yield* database.db.select().from(CapabilityChildTable)
        .where(eq(CapabilityChildTable.id, proof.callID)).get().pipe(
          Effect.catchIf((error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError,
            () => Effect.fail(mismatch())),
        )
      if (!row || proof.parentCallID !== parentCallID || !Number.isSafeInteger(proof.ordinal) ||
        proof.ordinal < 1 || proof.ordinal > 64 || proof.callID !== CapabilityInvocation.childID({
          ...binding.rootInvocation, callID: proof.parentCallID,
        }, proof.ordinal) || row.id !== proof.callID || row.session_id !== binding.owner.sessionID ||
        row.agent_id !== binding.owner.agentID || row.assistant_message_id !== binding.rootInvocation.assistantMessageID ||
        row.root_call_id !== binding.rootInvocation.callID || row.root_tool_name !== binding.rootToolName ||
        row.parent_call_id !== proof.parentCallID || row.ordinal !== proof.ordinal || row.depth !== index + 1 ||
        row.tool_name !== proof.toolName || row.request_hash !== proof.requestHash || row.state !== "running")
        return yield* mismatch()
    }), { discard: true })
    if (binding.invocation.callID !== (binding.lineage.at(-1)?.callID ?? binding.rootInvocation.callID))
      return yield* mismatch()
  })

  const getBinding = Effect.fn("CapabilityPolicy.binding")(function* (
    context: Tool.Context,
  ): Effect.fn.Return<CapabilityInvocation.Binding, Capability.Failure> {
    const binding = yield* CapabilityInvocation.require(context, {
      projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
    })
    yield* validate(binding)
    return binding
  })

  const authorize = Effect.fn("CapabilityPolicy.authorize")(function* (
    context: Tool.Context,
    input: { action: string; resources: readonly string[] },
  ): Effect.fn.Return<Permit, Capability.Failure> {
    const binding = yield* getBinding(context)
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

  const commitMany = <A, E, R>(supplied: readonly Permit[], write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const pending = [...supplied]
      const permit = pending[0]
      if (!permit || pending.length > 16 || pending.some((item) => !item || item[approved] !== true ||
        !permits.has(item) || item.binding !== permit.binding)) return yield* mismatch()
      if (!database.inTransaction) return yield* Effect.die("Capability commit requires SQL transaction identity")
      if (yield* database.inTransaction) return yield* mismatch()
      // Lock ordering is actor state -> SQLite writer. Approval never happens under either lock.
      return yield* agents.withPermissions(permit.context.agent, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* CapabilityInvocation.require(permit.context, {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
        })
        if (current !== permit.binding) return yield* mismatch()
        yield* validate(current)
        yield* Effect.forEach(pending, (item) => Effect.gen(function* () {
          const request = { sessionID: item.context.sessionID, agent: item.context.agent,
            action: item.action, resources: [...item.resources] }
          if ((yield* permissions.evaluate(request).pipe(
            Effect.catchTag("Session.NotFoundError", () => Effect.fail(mismatch())),
          )) === "deny") return yield* denied()
        }))
        return yield* write(tx)
      }), { behavior: "immediate" }))
    })

  return { binding: getBinding, authorize, commitMany, commit: <A, E, R>(permit: Permit, write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    commitMany([permit], write), assert: (context: Tool.Context, input: { action: string; resources: readonly string[] }) =>
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

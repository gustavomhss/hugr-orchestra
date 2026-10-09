export * as CapabilityChildren from "./children"

import { Capability } from "@orchestra/schema/capability"
import { SessionEvent } from "@orchestra/schema/session-event"
import { and, eq, or } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, DateTime, Effect, Exit, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { AgentV2 } from "../agent"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { Location } from "../location"
import type { ToolOutputStore } from "../tool-output-store"
import type { ToolRegistry } from "../tool/registry"
import type { Tool } from "../tool/tool"
import { CapabilityVendorSchema } from "./catalog/schema"
import { CapabilityInvocation } from "./invocation"
import { CapabilityPolicy } from "./policy"
import { CapabilityChildTable } from "./sql"

export type Dispatcher = {
  readonly settle: (name: string, input: Schema.Json) => Effect.Effect<
    ToolRegistry.Settlement, Capability.Failure | ToolOutputStore.Error
  >
}

export const make = Effect.gen(function* () {
  const location = yield* Location.Service
  const database = yield* Database.Service
  const agents = yield* AgentV2.Service
  const policy = yield* CapabilityPolicy.make
  const events = yield* EventV2.Service

  const dispatcher = Effect.fn("CapabilityChildren.dispatcher")(function* (
    supplied: Tool.Context,
    materialization: ToolRegistry.Materialization,
  ): Effect.fn.Return<Dispatcher, Capability.Failure> {
    const context = Object.freeze({ ...supplied })
    const binding = yield* policy.binding(context)
    const counter = { ordinal: 0 }

    const observe = (proof: CapabilityInvocation.ChildProof, state: typeof CapabilityChildTable.$inferSelect.state) =>
      Effect.gen(function* () {
        // Progress is a bounded live-parent observation. SQL remains authoritative after the root ends.
        const live = yield* policy.binding(context).pipe(Effect.result)
        if (live._tag === "Failure" || live.success !== binding) return
        yield* events.publish(SessionEvent.Tool.Progress, {
          timestamp: yield* DateTime.now,
          sessionID: context.sessionID,
          assistantMessageID: context.assistantMessageID,
          callID: context.toolCallID,
          structured: { capabilityChild: {
            callID: proof.callID, parentCallID: proof.parentCallID, ordinal: proof.ordinal,
            toolName: proof.toolName, state,
          } },
          content: [],
        }, { location })
      })

    return {
      settle: (name, suppliedInput) => Effect.suspend(() => {
        // Allocation belongs to execution, never Effect construction or model input.
        const ordinal = ++counter.ordinal
        return Effect.gen(function* () {
          if (ordinal > 64 || binding.lineage.length >= 8) return yield* failure("quota_exceeded")
          // Same grammar as Tool.validateName, with an exact end assertion (no trailing newline).
          if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(name))
            return yield* failure("unsupported_operation")
          const input = CapabilityVendorSchema.snapshot(suppliedInput)
          if (input instanceof Capability.Failure) return yield* input
          if (!materialization.definition(name) || !materialization.registrationIdentity(name))
            return yield* failure("stale_descriptor")
          const proof = Object.freeze({
            callID: CapabilityInvocation.childID(binding.invocation, ordinal),
            parentCallID: binding.invocation.callID,
            ordinal, toolName: name,
            requestHash: CapabilityVendorSchema.hash({ name, input }),
          })
          if (!database.inTransaction) return yield* Effect.die("Capability admission requires SQL transaction identity")
          if (yield* database.inTransaction) return yield* failure("invocation_binding_mismatch")

          return yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
            // Same lock order as policy.commit. No leaf, hook, approval, or event publication under locks.
            const row = yield* agents.withPermissions(context.agent, () => database.db.transaction((tx) =>
              Effect.gen(function* () {
                const current = yield* policy.binding(context)
                if (current !== binding) return yield* failure("invocation_binding_mismatch")
                const existing = yield* tx.select().from(CapabilityChildTable).where(or(
                  eq(CapabilityChildTable.id, proof.callID),
                  and(eq(CapabilityChildTable.session_id, context.sessionID),
                    eq(CapabilityChildTable.assistant_message_id, context.assistantMessageID),
                    eq(CapabilityChildTable.parent_call_id, proof.parentCallID),
                    eq(CapabilityChildTable.ordinal, ordinal)),
                )).get()
                if (existing) return yield* failure(
                  existing.id === proof.callID && existing.request_hash === proof.requestHash &&
                  existing.tool_name === name && existing.agent_id === context.agent &&
                  existing.root_call_id === binding.rootInvocation.callID &&
                  existing.root_tool_name === binding.rootToolName && existing.depth === binding.lineage.length + 1
                    ? "outcome_unknown" : "invocation_binding_mismatch",
                )
                return yield* tx.insert(CapabilityChildTable).values({
                  id: proof.callID, session_id: context.sessionID, agent_id: context.agent,
                  assistant_message_id: context.assistantMessageID,
                  root_call_id: binding.rootInvocation.callID, root_tool_name: binding.rootToolName,
                  parent_call_id: proof.parentCallID, ordinal, depth: binding.lineage.length + 1,
                  tool_name: name, request_hash: proof.requestHash, state: "running",
                }).returning().get()
              }), { behavior: "immediate" })).pipe(storageErrors)

            const exit = yield* restore(Effect.gen(function* () {
              yield* observe(proof, "running")
              return yield* CapabilityInvocation.withChildContext(context, proof, materialization.settle({
                sessionID: context.sessionID, agent: context.agent, assistantMessageID: context.assistantMessageID,
                call: { type: "tool-call", id: proof.callID, name, input },
              }))
            })).pipe(Effect.exit)
            const state = Exit.isFailure(exit)
              ? Cause.hasInterrupts(exit.cause) ? "interrupted" : "failed"
              : exit.value.result.type === "error" ? "failed" : "completed"
            // Recording an acquired outcome is a fact, not a fresh effect grant. No root/deny check here.
            const recorded = yield* database.db.update(CapabilityChildTable).set({ state }).where(and(
              eq(CapabilityChildTable.id, row.id), eq(CapabilityChildTable.session_id, row.session_id),
              eq(CapabilityChildTable.agent_id, row.agent_id),
              eq(CapabilityChildTable.assistant_message_id, row.assistant_message_id),
              eq(CapabilityChildTable.root_call_id, row.root_call_id),
              eq(CapabilityChildTable.root_tool_name, row.root_tool_name),
              eq(CapabilityChildTable.parent_call_id, row.parent_call_id), eq(CapabilityChildTable.ordinal, row.ordinal),
              eq(CapabilityChildTable.depth, row.depth), eq(CapabilityChildTable.tool_name, row.tool_name),
              eq(CapabilityChildTable.request_hash, row.request_hash), eq(CapabilityChildTable.state, "running"),
              eq(CapabilityChildTable.time_created, row.time_created),
              eq(CapabilityChildTable.time_updated, row.time_updated),
            )).returning().get().pipe(storageErrors, Effect.flatMap((updated) =>
              updated ? Effect.void : Effect.fail(failure("outcome_unknown"))), Effect.exit)
            if (Exit.isFailure(recorded)) return yield* Effect.failCause(Exit.isFailure(exit)
              ? Cause.combine(exit.cause, recorded.cause) : recorded.cause)
            const observed = yield* restore(observe(proof, state)).pipe(Effect.exit)
            if (Exit.isFailure(exit)) return yield* Effect.failCause(Exit.isFailure(observed)
              ? Cause.combine(exit.cause, observed.cause) : exit.cause)
            return yield* observed.pipe(Effect.andThen(exit))
          }))
        })
      }),
    }
  })

  return { dispatcher }
})

function storageErrors<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(Effect.catchIf(
    (error): error is Extract<E, SqlError | EffectDrizzleQueryError> =>
      error instanceof SqlError || error instanceof EffectDrizzleQueryError,
    () => Effect.fail(failure("outcome_unknown")),
  ))
}

function failure(code: Capability.Failure["code"]) {
  return new Capability.Failure({ code, message: code === "invocation_binding_mismatch"
    ? "Capability invocation binding does not match" : "Capability child settlement failed" })
}

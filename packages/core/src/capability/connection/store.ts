export * as CapabilityConnectionStore from "./store"

import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { SessionID } from "@orchestra/schema/session-id"
import { and, eq, inArray, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { SessionTable } from "../../session/sql"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import type { CapabilityConnectionStoreContract } from "./store-contract"

const Target = Schema.Struct({ environment: Schema.NonEmptyString, resource: Schema.Json })
const Bind = Schema.Struct({ target: Capability.TargetRef, sessionID: SessionID, agentID: Agent.ID,
  actions: Schema.Array(Schema.NonEmptyString) })
const Unbind = Schema.Struct({ target: Capability.TargetRef, sessionID: SessionID, agentID: Agent.ID })
type Transaction = CapabilityConnectionStoreContract.Transaction
type Placement = CapabilityConnectionStoreContract.Placement

/** SQL-only primitives. Caller owns the supplied transaction and placement authority. */
export const make = Effect.sync(() => {
  const connection = Effect.fn("CapabilityConnectionStore.connection")(function* (
    tx: Transaction, placement: Placement, ref: Capability.ConnectionRef,
  ) {
    const parsed = Schema.decodeUnknownOption(Capability.ConnectionRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    const row = yield* tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, value.id)).get()
    if (!row) return yield* failure("connection_unavailable")
    if (!owned(row, placement) || row.provider !== value.provider) return yield* failure("target_denied")
    if (!validGeneration(row.generation) || row.generation !== value.generation) return yield* failure("stale_descriptor")
    if (row.state !== "active") return yield* failure("authentication_revoked")
    return row
  })

  const target = Effect.fn("CapabilityConnectionStore.target")(function* (
    tx: Transaction, placement: Placement, ref: Capability.TargetRef,
  ) {
    const parsed = Schema.decodeUnknownOption(Capability.TargetRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    const row = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, value.id)).get()
    if (!row) return yield* failure("connection_unavailable")
    if (row.connection_id !== value.connectionID) return yield* failure("target_denied")
    if (!validGeneration(row.generation) || row.generation !== value.generation || row.environment !== value.environment)
      return yield* failure("stale_descriptor")
    const parent = yield* tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, row.connection_id)).get()
    if (!parent) return yield* failure("connection_unavailable")
    if (!owned(parent, placement)) return yield* failure("target_denied")
    if (!validGeneration(parent.generation)) return yield* failure("stale_descriptor")
    if (parent.state !== "active") return yield* failure("authentication_revoked")
    return { row, parent }
  })

  const createTarget: CapabilityConnectionStoreContract.Interface["createTarget"] = Effect.fn("CapabilityConnectionStore.createTarget")(function* (
    tx, placement, ref, input,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.ConnectionRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* connection(tx, placement, value.ref)
    // Drizzle maps JS null to SQL NULL; bind JSON text so every Schema.Json value remains non-null storage.
    const row = yield* tx.insert(CapabilityTargetTable).values({
      id: Capability.TargetID.create(), connection_id: value.ref.id,
      environment: value.input.environment, resource: sql`${JSON.stringify(value.input.resource)}`, generation: 0,
    }).returning().get()
    return targetRef(row)
  })

  const retargetTarget: CapabilityConnectionStoreContract.Interface["retargetTarget"] = Effect.fn("CapabilityConnectionStore.retargetTarget")(function* (
    tx, placement, ref, input,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.TargetRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    const current = yield* target(tx, placement, value.ref)
    if (current.row.generation === Number.MAX_SAFE_INTEGER) return yield* failure("stale_descriptor")
    yield* tx.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, value.ref.id)).run()
    const row = yield* tx.update(CapabilityTargetTable).set({
      environment: value.input.environment, resource: sql`${JSON.stringify(value.input.resource)}`,
      generation: current.row.generation + 1, time_updated: Date.now(),
    }).where(eq(CapabilityTargetTable.id, value.ref.id)).returning().get()
    if (!row) return yield* failure("connection_unavailable")
    return targetRef(row)
  })

  const removeTarget = Effect.fn("CapabilityConnectionStore.removeTarget")(function* (
    tx: Transaction, placement: Placement, ref: Capability.TargetRef,
  ) {
    const parsed = Schema.decodeUnknownOption(Capability.TargetRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* target(tx, placement, value)
    yield* tx.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, value.id)).run()
    yield* tx.delete(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, value.id)).run()
  })

  const disconnect = Effect.fn("CapabilityConnectionStore.disconnect")(function* (
    tx: Transaction, placement: Placement, ref: Capability.ConnectionRef,
  ) {
    const parsed = Schema.decodeUnknownOption(Capability.ConnectionRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    const row = yield* connection(tx, placement, value)
    if (row.generation === Number.MAX_SAFE_INTEGER) return yield* failure("stale_descriptor")
    yield* tx.delete(CapabilityBindingTable).where(inArray(CapabilityBindingTable.target_id,
      tx.select({ id: CapabilityTargetTable.id }).from(CapabilityTargetTable)
        .where(eq(CapabilityTargetTable.connection_id, value.id)),
    )).run()
    yield* tx.update(CapabilityConnectionTable).set({
      state: "disconnected", generation: row.generation + 1, time_updated: Date.now(),
    }).where(eq(CapabilityConnectionTable.id, value.id)).run()
  })

  const bind: CapabilityConnectionStoreContract.Interface["bind"] = Effect.fn("CapabilityConnectionStore.bind")(function* (
    tx, placement, input,
  ) {
    const parsed = Schema.decodeUnknownOption(Bind)(input)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    if (value.actions.length === 0 || value.actions.some((action) => action !== action.trim())) return yield* failure("target_denied")
    yield* target(tx, placement, value.target)
    yield* session(tx, placement, value.sessionID)
    // Trusted host may bind a supplied actor; management separately derives/rechecks the persisted actor.
    const actions = [...new Set(value.actions)]
    yield* tx.insert(CapabilityBindingTable).values({
      target_id: value.target.id, session_id: value.sessionID, agent_id: value.agentID, actions,
    }).onConflictDoUpdate({
      target: [CapabilityBindingTable.target_id, CapabilityBindingTable.session_id, CapabilityBindingTable.agent_id],
      set: { actions, time_updated: Date.now() },
    }).run()
  })

  const unbind: CapabilityConnectionStoreContract.Interface["unbind"] = Effect.fn("CapabilityConnectionStore.unbind")(function* (
    tx, placement, ref, sessionID, agentID,
  ) {
    const parsed = Schema.decodeUnknownOption(Unbind)({ target: ref, sessionID, agentID })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* target(tx, placement, value.target)
    yield* session(tx, placement, value.sessionID)
    yield* tx.delete(CapabilityBindingTable).where(and(
      eq(CapabilityBindingTable.target_id, value.target.id), eq(CapabilityBindingTable.session_id, value.sessionID),
      eq(CapabilityBindingTable.agent_id, value.agentID),
    )).run()
  })

  return Object.freeze({ connection, target, createTarget, retargetTarget, removeTarget, disconnect, bind, unbind }) satisfies CapabilityConnectionStoreContract.Interface
})

function owned(row: { project_id: string; directory: string; workspace_id: string | null }, placement: Placement) {
  return row.project_id === placement.projectID && row.directory === placement.location.directory &&
    (row.workspace_id ?? undefined) === placement.location.workspaceID
}

const session = Effect.fn("CapabilityConnectionStore.session")(function* (
  tx: Transaction, placement: Placement, id: SessionID,
) {
  const row = yield* tx.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
  if (!row || !owned(row, placement)) return yield* failure("target_denied")
})

export function connectionRef(row: typeof CapabilityConnectionTable.$inferSelect): Capability.ConnectionRef {
  return { id: row.id, provider: row.provider, generation: row.generation }
}

export function targetRef(row: typeof CapabilityTargetTable.$inferSelect): Capability.TargetRef {
  return { id: row.id, connectionID: row.connection_id, generation: row.generation, environment: row.environment }
}

export function validGeneration(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function failure(code: "connection_unavailable" | "authentication_revoked" | "target_denied" | "stale_descriptor") {
  const messages = {
    connection_unavailable: "Capability connection is unavailable",
    authentication_revoked: "Capability authentication is revoked",
    target_denied: "Capability target is not authorized",
    stale_descriptor: "Capability reference is stale",
  }
  return new Capability.Failure({ code, message: messages[code] })
}

export * as CapabilityConnectionManagement from "./management"

import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import type { SessionID } from "@orchestra/schema/session-id"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Cause, Effect, Option, Schema } from "effect"
import { Database } from "../../database/database"
import { SessionTable } from "../../session/sql"
import type { CapabilityOperatorContract } from "../operator/contract"
import { CapabilityRequest } from "../operator/request"
import { CapabilityOperatorScope } from "../operator/scope"
import { CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import type { CapabilityConnectionManagementContract } from "./management-contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"
import { CapabilityConnectionManagementCursor } from "./management-cursor"
import { capture, decode } from "./input"

// Do not load credential identity or host-only connection/target material for management reads.
const connectionColumns = {
  id: CapabilityConnectionTable.id, projectID: CapabilityConnectionTable.project_id,
  directory: CapabilityConnectionTable.directory, workspaceID: CapabilityConnectionTable.workspace_id,
  provider: CapabilityConnectionTable.provider, generation: CapabilityConnectionTable.generation,
  state: CapabilityConnectionTable.state, label: CapabilityConnectionTable.label,
  credential: sql<number>`${CapabilityConnectionTable.credential_id} IS NOT NULL`,
}
const targetColumns = {
  id: CapabilityTargetTable.id, connectionID: CapabilityTargetTable.connection_id,
  generation: CapabilityTargetTable.generation, environment: CapabilityTargetTable.environment,
}

export function make(options: CapabilityConnectionManagementContract.Options) {
  const operators = Object.freeze({ ...options.operators })
  const store = Object.freeze({ ...options.store })
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const requests = yield* CapabilityRequest.make({ operators })
    const cursors = yield* Effect.sync(() => CapabilityConnectionManagementCursor.make())
    const db = database.db

    const parent = Effect.fn("CapabilityConnectionManagement.parent")(function* (
      tx: CapabilityConnectionStoreContract.Transaction | Database.Interface["db"], id: Capability.ConnectionID,
    ) {
      const row = yield* tx.select(connectionColumns).from(CapabilityConnectionTable)
        .where(eq(CapabilityConnectionTable.id, id)).get()
      if (!row) return yield* unavailable()
      return row
    })

    const authorize = (target: CapabilityOperatorContract.Target) => operators.require(target).pipe(
      Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())),
    )

    const actor = Effect.fn("CapabilityConnectionManagement.actor")(function* (
      tx: CapabilityConnectionStoreContract.Transaction | Database.Interface["db"],
      placement: CapabilityOperatorContract.Placement, sessionID: SessionID,
    ) {
      const row = yield* tx.select({ projectID: SessionTable.project_id, directory: SessionTable.directory,
        workspaceID: SessionTable.workspace_id, agent: SessionTable.agent }).from(SessionTable)
        .where(eq(SessionTable.id, sessionID)).get()
      if (!row || !samePlacement(placement, row) || !row.agent || row.agent !== row.agent.trim())
        return yield* unavailable()
      const decoded = Schema.decodeUnknownOption(Schema.toType(Agent.ID))(row.agent)
      if (Option.isNone(decoded)) return yield* unavailable()
      return decoded.value
    })

    const mutation = Effect.fn("CapabilityConnectionManagement.mutation")(function* (
      action: string, ref: Capability.ConnectionRef | Capability.TargetRef, payload: Schema.Json,
      write: (tx: CapabilityConnectionStoreContract.Transaction, placement: CapabilityOperatorContract.Placement,
        agentID?: Agent.ID) => Effect.Effect<Schema.Json, CapabilityConnectionStoreContract.Error>, sessionID?: SessionID,
    ) {
      const targetRef = "connectionID" in ref ? ref : undefined
      if (targetRef) {
        const child = yield* db.select({ connectionID: CapabilityTargetTable.connection_id }).from(CapabilityTargetTable)
          .where(eq(CapabilityTargetTable.id, targetRef.id)).get()
        if (child && child.connectionID !== targetRef.connectionID) return yield* unavailable()
      }
      const row = yield* parent(db, "connectionID" in ref ? ref.connectionID : ref.id)
      const placement = placementOf(row)
      const target: CapabilityOperatorContract.Target = { action, placement,
        resource: { kind: targetRef ? "target" : "connection", id: ref.id } }
      yield* authorize(target)
      const agentID = sessionID === undefined ? undefined : yield* actor(db, placement, sessionID)
      const verify = (tx: CapabilityConnectionStoreContract.Transaction) => Effect.gen(function* () {
        const current = yield* parent(tx, row.id)
        if (!samePlacement(placement, current)) return yield* unavailable()
        // Reconciliation must survive changed generations/state and a deleted target. The fresh Store
        // callback still rejects missing/stale rows. The ledger compares the complete immutable ref.
        if (targetRef) {
          const child = yield* tx.select({ connectionID: CapabilityTargetTable.connection_id }).from(CapabilityTargetTable)
            .where(eq(CapabilityTargetTable.id, targetRef.id)).get()
          if (child && child.connectionID !== current.id) return yield* unavailable()
        }
        if (sessionID !== undefined && (yield* actor(tx, placement, sessionID)) !== agentID)
          return yield* unavailable()
      })
      return yield* requests.commit(target, agentID === undefined ? payload : { input: payload, agentID },
        (tx) => write(tx, placement, agentID), verify).pipe(
          Effect.withSpan("CapabilityConnectionManagement.commit"),
          Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())),
        )
    })

    const list: CapabilityConnectionManagementContract.Interface["list"] = (supplied, input) => {
      const captured = capture({ placement: supplied, input }, (value) => {
        const root = CapabilityOperatorScope.record(value, ["placement", "input"])
        return { placement: CapabilityOperatorScope.placement(root.placement),
          input: decode(CapabilityManagement.ConnectionQuery)(root.input) }
      })
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        const target = { action: "connection.list", placement: value.placement }
        const binding = yield* operators.require(target)
        const limit = value.input.limit ?? 16
        const rows = yield* db.select(connectionColumns).from(CapabilityConnectionTable).where(and(
          eq(CapabilityConnectionTable.project_id, value.placement.projectID),
          eq(CapabilityConnectionTable.directory, value.placement.location.directory),
          value.placement.location.workspaceID === undefined ? isNull(CapabilityConnectionTable.workspace_id)
            : eq(CapabilityConnectionTable.workspace_id, value.placement.location.workspaceID),
          value.input.after === undefined ? undefined : gt(CapabilityConnectionTable.id, value.input.after),
        )).orderBy(CapabilityConnectionTable.id).limit(limit + 1).all()
        const items = yield* Effect.forEach(rows.slice(0, limit), projectConnection)
        yield* operators.validate(binding, target)
        return Object.freeze({ items: Object.freeze(items), coverage: "live" as const,
          ...(rows.length > limit ? { after: rows[limit - 1].id } : {}) })
      })
    }

    const get: CapabilityConnectionManagementContract.Interface["get"] = (id) => {
      const captured = capture(id, decode(Capability.ConnectionID))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const row = yield* parent(db, captured.value)
        const target = { action: "connection.get", placement: placementOf(row), resource: { kind: "connection", id: row.id } }
        const binding = yield* authorize(target)
        const result = yield* projectConnection(row)
        yield* operators.validate(binding, target).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
        return result
      })
    }

    const targets: CapabilityConnectionManagementContract.Interface["targets"] = (id, input) => {
      const captured = capture({ id, input }, decode(Schema.Struct({ id: Capability.ConnectionID, input: CapabilityManagement.TargetQuery })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        const row = yield* parent(db, value.id)
        const placement = placementOf(row)
        const target = { action: "connection.targets", placement, resource: { kind: "connection" as const, id: row.id } }
        const binding = yield* authorize(target)
        const after = value.input.after === undefined ? undefined : yield* cursors.open(value.input.after, binding, target)
        const limit = value.input.limit ?? 16
        const rows = yield* db.select(targetColumns).from(CapabilityTargetTable).where(and(
          eq(CapabilityTargetTable.connection_id, row.id),
          after === undefined ? undefined : gt(CapabilityTargetTable.id, after),
        )).orderBy(CapabilityTargetTable.id).limit(limit + 1).all()
        const items = (yield* Effect.forEach(rows.slice(0, limit), (child) => Effect.gen(function* () {
          const scoped = { action: target.action, placement, resource: { kind: "target", id: child.id } }
          const allowed = yield* operators.require(scoped)
          const decoded = Schema.decodeUnknownOption(Schema.toType(Capability.TargetRef))(child)
          if (Option.isNone(decoded)) return yield* unavailable()
          yield* operators.validate(allowed, scoped)
          return Object.freeze({ target: Object.freeze(decoded.value) })
        }).pipe(Effect.catchCauseIf(pureDenial, () => Effect.succeed(undefined))))).filter((item) => item !== undefined)
        yield* operators.validate(binding, target)
        return Object.freeze({ items: Object.freeze(items), coverage: "live" as const,
          ...(rows.length > limit ? { after: yield* cursors.seal(rows[limit - 1].id, binding, target) } : {}) })
      }).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
    }

    const disconnect: CapabilityConnectionManagementContract.Interface["disconnect"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.DisconnectInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        return yield* mutation("connection.disconnect", value.connection, value,
          (tx, placement) => store.disconnect(tx, placement, value.connection).pipe(Effect.as(null)))
      })
    }
    const createTarget: CapabilityConnectionManagementContract.Interface["createTarget"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.CreateTargetInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        return yield* mutation("target.create", value.connection, value, (tx, placement) =>
          store.createTarget(tx, placement, value.connection, value.input).pipe(Effect.map((target) => ({ target }))))
      })
    }
    const retargetTarget: CapabilityConnectionManagementContract.Interface["retargetTarget"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.RetargetInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        return yield* mutation("target.retarget", value.target, value, (tx, placement) =>
          store.retargetTarget(tx, placement, value.target, value.input).pipe(Effect.map((target) => ({ target }))))
      })
    }
    const removeTarget: CapabilityConnectionManagementContract.Interface["removeTarget"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.RemoveTargetInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        return yield* mutation("target.remove", value.target, value,
          (tx, placement) => store.removeTarget(tx, placement, value.target).pipe(Effect.as(null)))
      })
    }
    const bind: CapabilityConnectionManagementContract.Interface["bind"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.PutBindingInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        if (value.input.actions.some((action) => action !== action.trim())) return yield* unavailable()
        const actions = [...new Set(value.input.actions)].sort()
        return yield* mutation("binding.put", value.target, { target: value.target,
          input: { sessionID: value.input.sessionID, actions } }, (tx, placement, agentID) => {
          if (agentID === undefined) return Effect.fail(unavailable())
          return store.bind(tx, placement, { target: value.target, sessionID: value.input.sessionID, agentID, actions }).pipe(Effect.as(null))
        }, value.input.sessionID)
      })
    }
    const unbind: CapabilityConnectionManagementContract.Interface["unbind"] = (input) => {
      const captured = capture(input, decode(CapabilityManagement.RemoveBindingInput))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        return yield* mutation("binding.remove", value.target, value, (tx, placement, agentID) => {
          if (agentID === undefined) return Effect.fail(unavailable())
          return store.unbind(tx, placement, value.target, value.sessionID, agentID).pipe(Effect.as(null))
        }, value.sessionID)
      })
    }
    return Object.freeze({ list, get, targets, disconnect, createTarget, retargetTarget, removeTarget, bind, unbind }) satisfies CapabilityConnectionManagementContract.Interface
  })
}

export type Interface = CapabilityConnectionManagementContract.Interface

function placementOf(row: { projectID: CapabilityOperatorContract.Placement["projectID"];
  directory: CapabilityOperatorContract.Placement["location"]["directory"];
  workspaceID: CapabilityOperatorContract.Placement["location"]["workspaceID"] | null }) {
  return Object.freeze({ projectID: row.projectID, location: Object.freeze({ directory: row.directory,
    ...(row.workspaceID == null ? {} : { workspaceID: row.workspaceID }) }) })
}

function samePlacement(placement: CapabilityOperatorContract.Placement, row: { projectID: string; directory: string; workspaceID?: string | null }) {
  return placement.projectID === row.projectID && placement.location.directory === row.directory &&
    placement.location.workspaceID === (row.workspaceID ?? undefined)
}

function projectConnection(row: { id: Capability.ConnectionID; provider: string; generation: number; label: string;
  state: typeof CapabilityManagement.Connection.Type["state"]; credential: number }) {
  const decoded = Schema.decodeUnknownOption(Schema.toType(CapabilityManagement.Connection))({
    connection: { id: row.id, provider: row.provider, generation: row.generation }, state: row.state,
    credential: row.credential ? "present" : "missing",
    ...(row.label.length > 0 && row.label.length <= 128 ? { label: row.label } : {}),
  })
  return Option.isNone(decoded) ? Effect.fail(unavailable()) : Effect.succeed(Object.freeze({ ...decoded.value,
    connection: Object.freeze(decoded.value.connection) }))
}

function pureDenial(cause: Cause.Cause<CapabilityConnectionStoreContract.Error>) {
  return cause.reasons.length > 0 && cause.reasons.every((reason) => reason._tag === "Fail" &&
    reason.error instanceof Capability.Failure && reason.error.code === "target_denied")
}

function pureAuthorityRejection(cause: Cause.Cause<CapabilityConnectionStoreContract.Error>) {
  return cause.reasons.length > 0 && cause.reasons.every((reason) => reason._tag === "Fail" &&
    reason.error instanceof Capability.Failure && ["invocation_binding_missing", "invocation_binding_mismatch",
      "target_denied", "authentication_required", "authentication_revoked"].includes(reason.error.code))
}

function unavailable() {
  return new Capability.Failure({ code: "connection_unavailable", message: "Capability connection is unavailable" })
}

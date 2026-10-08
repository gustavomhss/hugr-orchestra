export * as CapabilityConnections from "./index"

import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { SessionID } from "@orchestra/schema/session-id"
import { and, eq, inArray, isNull } from "drizzle-orm"
import type { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Effect, Option, Schema } from "effect"
import { Credential } from "../../credential"
import { Database } from "../../database/database"
import { Location } from "../../location"
import { PermissionV2 } from "../../permission"
import { SessionStore } from "../../session/store"
import type { Tool } from "../../tool/tool"
import { CapabilityPolicy } from "../policy"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"

const Create = Schema.Struct({
  provider: Schema.NonEmptyString,
  integrationID: Integration.ID,
  credentialID: Credential.ID,
  subjectID: Schema.NonEmptyString,
  endpoint: Schema.NonEmptyString,
  scopeHash: Schema.String.check(Schema.isPattern(/^[0-9a-fA-F]{64}(?![\s\S])/)),
})
export type CreateInput = typeof Create.Type

const Target = Schema.Struct({ environment: Schema.NonEmptyString, resource: Schema.Json })
export type TargetInput = typeof Target.Type

const Bind = Schema.Struct({
  target: Capability.TargetRef,
  sessionID: SessionID,
  agentID: Agent.ID,
  actions: Schema.Array(Schema.NonEmptyString),
})
export type BindInput = typeof Bind.Type

const Resolve = Schema.Struct({
  provider: Schema.NonEmptyString,
  connectionID: Schema.optionalKey(Capability.ConnectionID),
  targetID: Schema.optionalKey(Capability.TargetID),
  action: Schema.NonEmptyString,
})
export type ResolveInput = typeof Resolve.Type

const Resolved = Schema.Struct({
  connection: Capability.ConnectionRef,
  target: Capability.TargetRef,
  resource: Schema.Json,
  endpoint: Schema.NonEmptyString,
  credentialID: Credential.ID,
})
/** Host material: never project this object or loadCredential results into model tool output. */
export type Resolution = typeof Resolved.Type
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

/** Location-scoped factory. Management methods are trusted-host boundaries, not model tools. */
export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const credentials = yield* Credential.Service
  const permissions = yield* PermissionV2.Service
  const policy = yield* CapabilityPolicy.make
  const db = database.db

  const query = <A, R>(effect: Effect.Effect<A, EffectDrizzleQueryError, R>) => effect.pipe(
    Effect.mapError(() => failure("connection_unavailable")),
  )
  const transaction = <A, E, R>(write: (tx: Transaction) => Effect.Effect<A, E, R>) => db.transaction(
    write, { behavior: "immediate" },
  ).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))),
    Effect.withSpan("CapabilityConnections.transaction"))
  const commit = <A, E, R>(permit: CapabilityPolicy.Permit, write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    policy.commit(permit, write).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
  const owned = (row: typeof CapabilityConnectionTable.$inferSelect) =>
    row.project_id === location.project.id && row.directory === location.directory &&
    (row.workspace_id ?? undefined) === location.workspaceID

  const connection = Effect.fn("CapabilityConnections.connection")(function* (tx: Transaction, ref: Capability.ConnectionRef) {
    const row = yield* query(tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, ref.id)).get())
    if (!row) return yield* failure("connection_unavailable")
    if (!owned(row) || row.provider !== ref.provider) return yield* failure("target_denied")
    if (!validGeneration(row.generation) || row.generation !== ref.generation) return yield* failure("stale_descriptor")
    if (row.state !== "active") return yield* failure("authentication_revoked")
    return row
  })
  const target = Effect.fn("CapabilityConnections.target")(function* (tx: Transaction, ref: Capability.TargetRef) {
    const row = yield* query(tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, ref.id)).get())
    if (!row) return yield* failure("connection_unavailable")
    if (row.connection_id !== ref.connectionID) return yield* failure("target_denied")
    if (!validGeneration(row.generation) || row.generation !== ref.generation || row.environment !== ref.environment)
      return yield* failure("stale_descriptor")
    const parent = yield* query(tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, row.connection_id)).get())
    if (!parent) return yield* failure("connection_unavailable")
    if (!owned(parent)) return yield* failure("target_denied")
    if (!validGeneration(parent.generation)) return yield* failure("stale_descriptor")
    if (parent.state !== "active") return yield* failure("authentication_revoked")
    return { row, parent }
  })
  const exactCredential = Effect.fn("CapabilityConnections.exactCredential")(function* (
    id: Credential.ID | null, integrationID: Integration.ID,
  ) {
    if (!id) return yield* failure("authentication_required")
    const saved = yield* credentials.get(id)
    if (!saved) return yield* failure("authentication_required")
    if (saved.id !== id || saved.integrationID !== integrationID) return yield* failure("authentication_revoked")
    return saved
  })

  const create = Effect.fn("CapabilityConnections.create")(function* (input: CreateInput) {
    const parsed = Schema.decodeUnknownOption(Create)(input)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    if (!validEndpoint(value.endpoint)) return yield* failure("target_denied")
    // Subject is supplied by an authenticated adapter; no claim of remote qualification is made here.
    return yield* transaction((tx) => Effect.gen(function* () {
      yield* exactCredential(value.credentialID, value.integrationID)
      const row = yield* query(tx.insert(CapabilityConnectionTable).values({
        id: Capability.ConnectionID.create(), project_id: location.project.id,
        directory: location.directory, workspace_id: location.workspaceID,
        provider: value.provider, integration_id: value.integrationID, credential_id: value.credentialID,
        subject_id: value.subjectID, endpoint: new URL(value.endpoint).href,
        scope_hash: value.scopeHash.toLowerCase(), generation: 0, state: "active",
      }).returning().get())
      return connectionRef(row)
    }))
  })

  const createTarget = Effect.fn("CapabilityConnections.createTarget")(function* (
    ref: Capability.ConnectionRef, input: TargetInput,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.ConnectionRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    return yield* transaction((tx) => Effect.gen(function* () {
      yield* connection(tx, value.ref)
      const row = yield* query(tx.insert(CapabilityTargetTable).values({
        id: Capability.TargetID.create(), connection_id: value.ref.id,
        environment: value.input.environment, resource: value.input.resource, generation: 0,
      }).returning().get())
      return targetRef(row)
    }))
  })

  const bind = Effect.fn("CapabilityConnections.bind")(function* (input: BindInput) {
    const parsed = Schema.decodeUnknownOption(Bind)(input)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    if (value.actions.length === 0 || value.actions.some((action) => action !== action.trim())) return yield* failure("target_denied")
    yield* transaction((tx) => Effect.gen(function* () {
      yield* target(tx, value.target)
      const session = yield* sessions.get(value.sessionID)
      if (!session || session.projectID !== location.project.id || session.location.directory !== location.directory ||
        session.location.workspaceID !== location.workspaceID) return yield* failure("target_denied")
      yield* query(tx.insert(CapabilityBindingTable).values({
        target_id: value.target.id, session_id: value.sessionID, agent_id: value.agentID,
        actions: [...new Set(value.actions)],
      }).onConflictDoUpdate({
        target: [CapabilityBindingTable.target_id, CapabilityBindingTable.session_id, CapabilityBindingTable.agent_id],
        set: { actions: [...new Set(value.actions)], time_updated: Date.now() },
      }).run())
    }))
  })

  const disconnect = Effect.fn("CapabilityConnections.disconnect")(function* (ref: Capability.ConnectionRef) {
    const parsed = Schema.decodeUnknownOption(Capability.ConnectionRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* transaction((tx) => Effect.gen(function* () {
      const row = yield* connection(tx, value)
      if (row.generation === Number.MAX_SAFE_INTEGER) return yield* failure("stale_descriptor")
      yield* query(tx.delete(CapabilityBindingTable).where(inArray(CapabilityBindingTable.target_id,
        tx.select({ id: CapabilityTargetTable.id }).from(CapabilityTargetTable)
          .where(eq(CapabilityTargetTable.connection_id, value.id)),
      )).run())
      yield* query(tx.update(CapabilityConnectionTable).set({
        state: "disconnected", generation: row.generation + 1, time_updated: Date.now(),
      }).where(eq(CapabilityConnectionTable.id, value.id)).run())
    }))
  })

  const retargetTarget = Effect.fn("CapabilityConnections.retargetTarget")(function* (
    ref: Capability.TargetRef, input: TargetInput,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.TargetRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    return yield* transaction((tx) => Effect.gen(function* () {
      const current = yield* target(tx, value.ref)
      if (current.row.generation === Number.MAX_SAFE_INTEGER) return yield* failure("stale_descriptor")
      yield* query(tx.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, value.ref.id)).run())
      const row = yield* query(tx.update(CapabilityTargetTable).set({
        environment: value.input.environment, resource: value.input.resource,
        generation: current.row.generation + 1, time_updated: Date.now(),
      }).where(eq(CapabilityTargetTable.id, value.ref.id)).returning().get())
      if (!row) return yield* failure("connection_unavailable")
      return targetRef(row)
    }))
  })

  const removeTarget = Effect.fn("CapabilityConnections.removeTarget")(function* (ref: Capability.TargetRef) {
    const parsed = Schema.decodeUnknownOption(Capability.TargetRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* transaction((tx) => Effect.gen(function* () {
      yield* target(tx, value)
      yield* query(tx.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, value.id)).run())
      yield* query(tx.delete(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, value.id)).run())
    }))
  })

  const boundRows = (tx: Transaction, context: Tool.Context, input: ResolveInput) => query(tx.select().from(CapabilityBindingTable)
      .innerJoin(CapabilityTargetTable, eq(CapabilityBindingTable.target_id, CapabilityTargetTable.id))
      .innerJoin(CapabilityConnectionTable, eq(CapabilityTargetTable.connection_id, CapabilityConnectionTable.id))
      .where(and(
        eq(CapabilityBindingTable.session_id, context.sessionID), eq(CapabilityBindingTable.agent_id, context.agent),
        eq(CapabilityConnectionTable.project_id, location.project.id), eq(CapabilityConnectionTable.directory, location.directory),
        location.workspaceID ? eq(CapabilityConnectionTable.workspace_id, location.workspaceID) : isNull(CapabilityConnectionTable.workspace_id),
        eq(CapabilityConnectionTable.provider, input.provider), eq(CapabilityConnectionTable.state, "active"),
        input.connectionID ? eq(CapabilityConnectionTable.id, input.connectionID) : undefined,
        input.targetID ? eq(CapabilityTargetTable.id, input.targetID) : undefined,
      )).orderBy(CapabilityTargetTable.id).all())

  const resolve = Effect.fn("CapabilityConnections.resolve")(function* (context: Tool.Context, input: ResolveInput) {
    const supplied = { ...context }
    const parsed = Schema.decodeUnknownOption(Schema.toType(Resolve))(input)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    // ID-specific policy precedes lookup. Discovery never probes rows outside scoped bindings.
    const discovery = yield* policy.authorize(supplied, { action: value.action, resources: [
      value.provider, ...(value.connectionID ? [value.connectionID] : []), ...(value.targetID ? [value.targetID] : []),
    ] })
    const rows = yield* commit(discovery, (tx) => boundRows(tx, supplied, value))
    const candidates = (yield* Effect.forEach(rows.filter((row) =>
      validGeneration(row.capability_connection.generation) && validGeneration(row.capability_target.generation) &&
      (row.capability_binding.actions.includes(value.action) || row.capability_binding.actions.includes("*"))),
    (row) => policy.authorize(supplied, { action: value.action,
      resources: [value.provider, row.capability_connection.id, row.capability_target.id],
    }).pipe(Effect.map((permit) => ({ row, permit })), Effect.catchTag("Capability.Failure", (error) =>
      error.code === "target_denied" ? Effect.succeed(undefined) : Effect.fail(error)),
    ))).filter((candidate) => candidate !== undefined)

    return yield* commit(discovery, (tx) => Effect.gen(function* () {
      const current = yield* boundRows(tx, supplied, value)
      const permitted = (yield* Effect.forEach(candidates, (candidate) => Effect.gen(function* () {
        if (candidate.permit.binding !== discovery.binding) return yield* failure("invocation_binding_mismatch")
        const row = current.find((row) =>
          row.capability_connection.id === candidate.row.capability_connection.id &&
          row.capability_target.id === candidate.row.capability_target.id &&
          row.capability_connection.generation === candidate.row.capability_connection.generation &&
          row.capability_target.generation === candidate.row.capability_target.generation &&
          row.capability_target.environment === candidate.row.capability_target.environment)
        if (!row || (!row.capability_binding.actions.includes(value.action) && !row.capability_binding.actions.includes("*")))
          return undefined
        // Gate and writer are already held. Reassessment is read-only and consumes the original permit.
        if ((yield* permissions.evaluate({ sessionID: supplied.sessionID, agent: supplied.agent,
          action: candidate.permit.action, resources: [...candidate.permit.resources],
        }).pipe(Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("invocation_binding_mismatch"))))) === "deny") return undefined
        return row
      }))).filter((row) => row !== undefined)
      if (!permitted.length) return yield* failure("connection_unavailable")
      if (permitted.length > 1) return yield* new Capability.Failure({
        code: "ambiguous_target", message: "Capability target selection is ambiguous",
        detail: { choices: permitted.slice(0, 8).map((row) => ({
          connectionID: row.capability_connection.id, targetID: row.capability_target.id,
        })) },
      })
      const selected = permitted[0]
      const saved = yield* exactCredential(selected.capability_connection.credential_id, selected.capability_connection.integration_id)
      return {
        connection: connectionRef(selected.capability_connection), target: targetRef(selected.capability_target),
        resource: selected.capability_target.resource, endpoint: selected.capability_connection.endpoint, credentialID: saved.id,
      } satisfies Resolution
    }))
  })

  const checkBound = Effect.fn("CapabilityConnections.checkBound")(function* (
    tx: Transaction, context: Tool.Context, resolution: Resolution, action: string,
  ) {
    const parent = yield* connection(tx, resolution.connection)
    const current = yield* target(tx, resolution.target)
    if (!parent.credential_id) return yield* failure("authentication_required")
    if (current.parent.id !== parent.id || parent.credential_id !== resolution.credentialID ||
      parent.endpoint !== resolution.endpoint || JSON.stringify(current.row.resource) !== JSON.stringify(resolution.resource))
      return yield* failure("target_denied")
    const binding = yield* query(tx.select().from(CapabilityBindingTable).where(and(
      eq(CapabilityBindingTable.target_id, resolution.target.id), eq(CapabilityBindingTable.session_id, context.sessionID),
      eq(CapabilityBindingTable.agent_id, context.agent),
    )).get())
    if (!binding || (!binding.actions.includes(action) && !binding.actions.includes("*"))) return yield* failure("target_denied")
    const saved = yield* exactCredential(parent.credential_id, parent.integration_id)
    return saved.value
  })

  const loadCredential = Effect.fn("CapabilityConnections.loadCredential")(function* (
    context: Tool.Context, resolution: Resolution, action: string,
  ) {
    const supplied = { ...context }
    const parsed = Schema.decodeUnknownOption(Resolved)(resolution)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    const permit = yield* policy.authorize(supplied, { action, resources: [value.connection.provider, value.connection.id, value.target.id] })
    return yield* commit(permit, (tx) => checkBound(tx, supplied, value, action))
  })

  return { create, createTarget, bind, disconnect, retargetTarget, removeTarget, resolve, loadCredential }
})

export type Interface = Effect.Success<typeof make>

function connectionRef(row: typeof CapabilityConnectionTable.$inferSelect): Capability.ConnectionRef {
  return { id: row.id, provider: row.provider, generation: row.generation }
}

function targetRef(row: typeof CapabilityTargetTable.$inferSelect): Capability.TargetRef {
  return { id: row.id, connectionID: row.connection_id, generation: row.generation, environment: row.environment }
}

function validEndpoint(endpoint: string) {
  if (endpoint !== endpoint.trim() || endpoint.includes("#") || !URL.canParse(endpoint)) return false
  const url = new URL(endpoint)
  if (url.protocol !== "https:" || url.username || url.password) return false
  // Closed allowlist: arbitrary queries can contain tokens even when their keys look harmless.
  return url.search === "" || url.search === "?codemode=false"
}

function validGeneration(value: number) {
  return Number.isSafeInteger(value) && value >= 0
}

function failure(code: "connection_unavailable" | "authentication_required" | "authentication_revoked" | "target_denied" | "stale_descriptor" | "invocation_binding_mismatch") {
  const messages = {
    connection_unavailable: "Capability connection is unavailable",
    authentication_required: "Capability authentication is required",
    authentication_revoked: "Capability authentication is revoked",
    target_denied: "Capability target is not authorized",
    stale_descriptor: "Capability reference is stale",
    invocation_binding_mismatch: "Capability invocation binding does not match",
  }
  return new Capability.Failure({ code, message: messages[code] })
}

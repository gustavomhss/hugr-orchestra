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

/** Host material: never project this object or loadCredential results into model tool output. */
export type Resolution = {
  readonly connection: Capability.ConnectionRef
  readonly target: Capability.TargetRef
  readonly resource: Schema.Json
  readonly endpoint: string
  readonly credentialID: Credential.ID
}

/** Location-scoped factory. Management methods are trusted-host boundaries, not model tools. */
export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const credentials = yield* Credential.Service
  const policy = yield* CapabilityPolicy.make
  const db = database.db

  const query = <A, R>(effect: Effect.Effect<A, EffectDrizzleQueryError, R>) => effect.pipe(
    Effect.mapError(() => failure("connection_unavailable")),
  )
  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) => db.transaction(
    () => effect, { behavior: "immediate" },
  ).pipe(Effect.catchTag("SqlError", () => Effect.fail(failure("connection_unavailable"))))
  const owned = (row: typeof CapabilityConnectionTable.$inferSelect) =>
    row.project_id === location.project.id && row.directory === location.directory &&
    (row.workspace_id ?? undefined) === location.workspaceID

  const connection = Effect.fn("CapabilityConnections.connection")(function* (ref: Capability.ConnectionRef) {
    if (Option.isNone(Schema.decodeUnknownOption(Capability.ConnectionRef)(ref)))
      return yield* failure("target_denied")
    const row = yield* query(db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, ref.id)).get())
    if (!row) return yield* failure("connection_unavailable")
    if (!owned(row) || row.provider !== ref.provider) return yield* failure("target_denied")
    if (row.generation !== ref.generation) return yield* failure("stale_descriptor")
    if (row.state !== "active") return yield* failure("authentication_revoked")
    return row
  })
  const target = Effect.fn("CapabilityConnections.target")(function* (ref: Capability.TargetRef) {
    if (Option.isNone(Schema.decodeUnknownOption(Capability.TargetRef)(ref)))
      return yield* failure("target_denied")
    const row = yield* query(db.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, ref.id)).get())
    if (!row) return yield* failure("connection_unavailable")
    if (row.connection_id !== ref.connectionID) return yield* failure("target_denied")
    if (row.generation !== ref.generation || row.environment !== ref.environment)
      return yield* failure("stale_descriptor")
    const parent = yield* query(db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, row.connection_id)).get())
    if (!parent) return yield* failure("connection_unavailable")
    if (!owned(parent)) return yield* failure("target_denied")
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
    if (Option.isNone(parsed) || !validEndpoint(input.endpoint)) return yield* failure("target_denied")
    // Subject is supplied by an authenticated adapter; no claim of remote qualification is made here.
    return yield* transaction(Effect.gen(function* () {
      yield* exactCredential(input.credentialID, input.integrationID)
      const row = yield* query(db.insert(CapabilityConnectionTable).values({
        id: Capability.ConnectionID.create(), project_id: location.project.id,
        directory: location.directory, workspace_id: location.workspaceID,
        provider: input.provider, integration_id: input.integrationID, credential_id: input.credentialID,
        subject_id: input.subjectID, endpoint: new URL(input.endpoint).href,
        scope_hash: input.scopeHash.toLowerCase(), generation: 0, state: "active",
      }).returning().get())
      return connectionRef(row)
    }))
  })

  const createTarget = Effect.fn("CapabilityConnections.createTarget")(function* (
    ref: Capability.ConnectionRef, input: TargetInput,
  ) {
    if (Option.isNone(Schema.decodeUnknownOption(Target)(input))) return yield* failure("target_denied")
    return yield* transaction(Effect.gen(function* () {
      yield* connection(ref)
      const row = yield* query(db.insert(CapabilityTargetTable).values({
        id: Capability.TargetID.create(), connection_id: ref.id,
        environment: input.environment, resource: input.resource, generation: 0,
      }).returning().get())
      return targetRef(row)
    }))
  })

  const bind = Effect.fn("CapabilityConnections.bind")(function* (input: BindInput) {
    if (Option.isNone(Schema.decodeUnknownOption(Bind)(input)) || input.actions.length === 0 ||
      input.actions.some((action) => action !== action.trim())) return yield* failure("target_denied")
    yield* transaction(Effect.gen(function* () {
      yield* target(input.target)
      const session = yield* sessions.get(input.sessionID)
      if (!session || session.projectID !== location.project.id || session.location.directory !== location.directory ||
        session.location.workspaceID !== location.workspaceID) return yield* failure("target_denied")
      yield* query(db.insert(CapabilityBindingTable).values({
        target_id: input.target.id, session_id: input.sessionID, agent_id: input.agentID,
        actions: [...new Set(input.actions)],
      }).onConflictDoUpdate({
        target: [CapabilityBindingTable.target_id, CapabilityBindingTable.session_id, CapabilityBindingTable.agent_id],
        set: { actions: [...new Set(input.actions)], time_updated: Date.now() },
      }).run())
    }))
  })

  const disconnect = Effect.fn("CapabilityConnections.disconnect")(function* (ref: Capability.ConnectionRef) {
    yield* transaction(Effect.gen(function* () {
      const row = yield* connection(ref)
      const targets = yield* query(db.select({ id: CapabilityTargetTable.id }).from(CapabilityTargetTable)
        .where(eq(CapabilityTargetTable.connection_id, ref.id)).all())
      if (targets.length) yield* query(db.delete(CapabilityBindingTable)
        .where(inArray(CapabilityBindingTable.target_id, targets.map((item) => item.id))).run())
      yield* query(db.update(CapabilityConnectionTable).set({
        state: "disconnected", generation: row.generation + 1, time_updated: Date.now(),
      }).where(eq(CapabilityConnectionTable.id, ref.id)).run())
    }))
  })

  const retargetTarget = Effect.fn("CapabilityConnections.retargetTarget")(function* (
    ref: Capability.TargetRef, input: TargetInput,
  ) {
    if (Option.isNone(Schema.decodeUnknownOption(Target)(input))) return yield* failure("target_denied")
    return yield* transaction(Effect.gen(function* () {
      const current = yield* target(ref)
      yield* query(db.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, ref.id)).run())
      const row = yield* query(db.update(CapabilityTargetTable).set({
        environment: input.environment, resource: input.resource,
        generation: current.row.generation + 1, time_updated: Date.now(),
      }).where(eq(CapabilityTargetTable.id, ref.id)).returning().get())
      if (!row) return yield* failure("connection_unavailable")
      return targetRef(row)
    }))
  })

  const removeTarget = Effect.fn("CapabilityConnections.removeTarget")(function* (ref: Capability.TargetRef) {
    yield* transaction(Effect.gen(function* () {
      yield* target(ref)
      yield* query(db.delete(CapabilityBindingTable).where(eq(CapabilityBindingTable.target_id, ref.id)).run())
      yield* query(db.delete(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, ref.id)).run())
    }))
  })

  const resolve = Effect.fn("CapabilityConnections.resolve")(function* (context: Tool.Context, input: ResolveInput) {
    // Provider is the pre-discovery policy resource; opaque connection and target IDs add restrictions below.
    yield* policy.assert(context, { action: input.action, resources: [input.provider] })
    if (Option.isNone(Schema.decodeUnknownOption(Schema.toType(Resolve))(input))) return yield* failure("target_denied")
    if (input.connectionID) {
      const row = yield* query(db.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, input.connectionID)).get())
      if (!row) return yield* failure("connection_unavailable")
      if (!owned(row) || row.provider !== input.provider) return yield* failure("target_denied")
    }
    if (input.targetID) {
      const row = yield* query(db.select().from(CapabilityTargetTable).innerJoin(CapabilityConnectionTable,
        eq(CapabilityTargetTable.connection_id, CapabilityConnectionTable.id))
        .where(eq(CapabilityTargetTable.id, input.targetID)).get())
      if (!row) return yield* failure("connection_unavailable")
      if (!owned(row.capability_connection) || row.capability_connection.provider !== input.provider ||
        (input.connectionID && row.capability_connection.id !== input.connectionID)) return yield* failure("target_denied")
    }
    const rows = yield* query(db.select().from(CapabilityBindingTable)
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
    const permitted = (yield* Effect.forEach(rows.filter((row) =>
      row.capability_binding.actions.includes(input.action) || row.capability_binding.actions.includes("*")),
    (row) => policy.assert(context, { action: input.action,
      resources: [input.provider, row.capability_connection.id, row.capability_target.id],
    }).pipe(Effect.as(row), Effect.catchTag("Capability.Failure", (error) =>
      error.code === "target_denied" ? Effect.succeed(undefined) : Effect.fail(error)),
    ))).filter((row) => row !== undefined)
    if (!permitted.length) return yield* failure(input.targetID || input.connectionID ? "target_denied" : "connection_unavailable")
    if (permitted.length > 1) return yield* new Capability.Failure({
      code: "ambiguous_target", message: "Capability target selection is ambiguous",
      detail: { choices: permitted.slice(0, 8).map((row) => ({
        connection: connectionRef(row.capability_connection), target: targetRef(row.capability_target),
      })) },
    })
    const selected = permitted[0]
    const saved = yield* exactCredential(selected.capability_connection.credential_id, selected.capability_connection.integration_id)
    return {
      connection: connectionRef(selected.capability_connection), target: targetRef(selected.capability_target),
      resource: selected.capability_target.resource, endpoint: selected.capability_connection.endpoint, credentialID: saved.id,
    } satisfies Resolution
  })

  const loadCredential = Effect.fn("CapabilityConnections.loadCredential")(function* (
    context: Tool.Context, resolution: Resolution, action: string,
  ) {
    yield* policy.assert(context, { action, resources: [resolution.connection.provider, resolution.connection.id, resolution.target.id] })
    return yield* transaction(Effect.gen(function* () {
      const parent = yield* connection(resolution.connection)
      const current = yield* target(resolution.target)
      if (current.parent.id !== parent.id || parent.credential_id !== resolution.credentialID ||
        parent.endpoint !== resolution.endpoint || JSON.stringify(current.row.resource) !== JSON.stringify(resolution.resource))
        return yield* failure("target_denied")
      const binding = yield* query(db.select().from(CapabilityBindingTable).where(and(
        eq(CapabilityBindingTable.target_id, resolution.target.id), eq(CapabilityBindingTable.session_id, context.sessionID),
        eq(CapabilityBindingTable.agent_id, context.agent),
      )).get())
      if (!binding || (!binding.actions.includes(action) && !binding.actions.includes("*"))) return yield* failure("target_denied")
      const saved = yield* exactCredential(parent.credential_id, parent.integration_id)
      return saved.value
    }))
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
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return false
  // Closed allowlist: arbitrary queries can contain tokens even when their keys look harmless.
  return url.search === "" || url.search === "?codemode=false"
}

function failure(code: "connection_unavailable" | "authentication_required" | "authentication_revoked" | "target_denied" | "stale_descriptor") {
  const messages = {
    connection_unavailable: "Capability connection is unavailable",
    authentication_required: "Capability authentication is required",
    authentication_revoked: "Capability authentication is revoked",
    target_denied: "Capability target is not authorized",
    stale_descriptor: "Capability reference is stale",
  }
  return new Capability.Failure({ code, message: messages[code] })
}

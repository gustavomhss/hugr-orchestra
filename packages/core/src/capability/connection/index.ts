export * as CapabilityConnections from "./index"

import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { SessionID } from "@orchestra/schema/session-id"
import { and, eq, isNull } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Credential } from "../../credential"
import { Database } from "../../database/database"
import { Location } from "../../location"
import { PermissionV2 } from "../../permission"
import type { Tool } from "../../tool/tool"
import { CapabilityPolicy } from "../policy"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import { CapabilityConnectionStore } from "./store"
import type { CapabilityConnectionStoreContract } from "./store-contract"

export type Error = CapabilityConnectionStoreContract.Error

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
  const credentials = yield* Credential.Service
  const permissions = yield* PermissionV2.Service
  const policy = yield* CapabilityPolicy.make
  const store = yield* CapabilityConnectionStore.make
  const placement = { projectID: location.project.id,
    location: { directory: location.directory, workspaceID: location.workspaceID } }
  const db = database.db

  const query = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.catchCauseIf(effect,
    (cause: Cause.Cause<E>) => cause.reasons.length > 0 && cause.reasons.every((reason) =>
      reason._tag === "Fail" && (reason.error instanceof SqlError || reason.error instanceof EffectDrizzleQueryError)),
    () => Effect.fail(failure("connection_unavailable")),
  )
  const transaction = <A, E, R>(write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    query(db.transaction(write, { behavior: "immediate" })).pipe(Effect.withSpan("CapabilityConnections.transaction"))
  const commit = <A, E, R>(permit: CapabilityPolicy.Permit, write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    query(policy.commit(permit, write))
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
      return CapabilityConnectionStore.connectionRef(row)
    }))
  })

  const createTarget = Effect.fn("CapabilityConnections.createTarget")(function* (
    ref: Capability.ConnectionRef, input: TargetInput,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.ConnectionRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    return yield* transaction((tx) => store.createTarget(tx, placement, value.ref, value.input))
  })

  const bind = Effect.fn("CapabilityConnections.bind")(function* (input: BindInput) {
    const parsed = Schema.decodeUnknownOption(Bind)(input)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    if (value.actions.length === 0 || value.actions.some((action) => action !== action.trim())) return yield* failure("target_denied")
    yield* transaction((tx) => store.bind(tx, placement, value))
  })

  const disconnect = Effect.fn("CapabilityConnections.disconnect")(function* (ref: Capability.ConnectionRef) {
    const parsed = Schema.decodeUnknownOption(Capability.ConnectionRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* transaction((tx) => store.disconnect(tx, placement, value))
  })

  const retargetTarget = Effect.fn("CapabilityConnections.retargetTarget")(function* (
    ref: Capability.TargetRef, input: TargetInput,
  ) {
    const parsed = Schema.decodeUnknownOption(Schema.Struct({ ref: Capability.TargetRef, input: Target }))({ ref, input })
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    return yield* transaction((tx) => store.retargetTarget(tx, placement, value.ref, value.input))
  })

  const removeTarget = Effect.fn("CapabilityConnections.removeTarget")(function* (ref: Capability.TargetRef) {
    const parsed = Schema.decodeUnknownOption(Capability.TargetRef)(ref)
    if (Option.isNone(parsed)) return yield* failure("target_denied")
    const value = structuredClone(parsed.value)
    yield* transaction((tx) => store.removeTarget(tx, placement, value))
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
      CapabilityConnectionStore.validGeneration(row.capability_connection.generation) && CapabilityConnectionStore.validGeneration(row.capability_target.generation) &&
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
        connection: CapabilityConnectionStore.connectionRef(selected.capability_connection), target: CapabilityConnectionStore.targetRef(selected.capability_target),
        resource: selected.capability_target.resource, endpoint: selected.capability_connection.endpoint, credentialID: saved.id,
      } satisfies Resolution
    }))
  })

  const checkBound = Effect.fn("CapabilityConnections.checkBound")(function* (
    tx: Transaction, context: Tool.Context, resolution: Resolution, action: string,
  ) {
    const parent = yield* query(store.connection(tx, placement, resolution.connection))
    const current = yield* query(store.target(tx, placement, resolution.target))
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

  return Object.freeze({ create, createTarget, bind, disconnect, retargetTarget, removeTarget, resolve, loadCredential })
})

export type Interface = Effect.Success<typeof make>

function validEndpoint(endpoint: string) {
  if (endpoint !== endpoint.trim() || endpoint.includes("#") || !URL.canParse(endpoint)) return false
  const url = new URL(endpoint)
  if (url.protocol !== "https:" || url.username || url.password) return false
  // Closed allowlist: arbitrary queries can contain tokens even when their keys look harmless.
  return url.search === "" || url.search === "?codemode=false"
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

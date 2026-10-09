import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { and, eq } from "drizzle-orm"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Option, Schema } from "effect"
import { SqlError } from "effect/unstable/sql/SqlError"
import { Credential } from "../../credential"
import { CredentialTable } from "../../credential/sql"
import type { Database } from "../../database/database"
import type { Tool } from "../../tool/tool"
import type { CapabilityConnections } from "../connection/index"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"

export type Requirements = readonly Readonly<{
  action: string
  resources: readonly string[]
  selection?: Readonly<{ resolution: CapabilityConnections.Resolution; credentialHash: string }>
}>[]
type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]
const Selected = Schema.Struct({
  resolution: Schema.Struct({ connection: Capability.ConnectionRef, target: Capability.TargetRef,
    resource: Schema.Json, endpoint: Schema.NonEmptyString, credentialID: Credential.ID }),
  credentialHash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/)),
})

/** Primitive credential identity only. Never serialize metadata or the credential object itself. */
export function selectionCredentialHash(value: Credential.Value): string {
  const type = field(value, "type")
  const keys = type === "key" ? ["key"] : type === "oauth" ? ["methodID", "access", "refresh", "expires"] : undefined
  if (!keys) throw failure("authentication_required")
  const identity = keys.map((key) => {
    const item = field(value, key)
    if (key === "expires" ? !validGeneration(item) : typeof item !== "string") throw failure("authentication_required")
    return item
  })
  return createHash("sha256").update(JSON.stringify([type, ...identity])).digest("hex")
}

/** Synchronous capture before the producer's first yield. Unselected actions keep their existing budgets. */
export function snapshotRequirements(input: Requirements): Requirements | Capability.Failure {
  try {
    return Object.freeze(array(input).map((item) => {
      const action = field(item, "action")
      const resources = Object.freeze(array(field(item, "resources")).map((resource) => {
        if (typeof resource !== "string") throw failure("target_denied")
        return resource
      }))
      if (typeof action !== "string") throw failure("target_denied")
      const selected = field(item, "selection")
      if (selected === undefined) return Object.freeze({ action, resources })
      const captured = copy({ action, resources, selection: selected })
      if (!object(captured)) throw failure("target_denied")
      const parsed = Schema.decodeUnknownOption(Selected)(captured.selection)
      if (Option.isNone(parsed)) throw failure("target_denied")
      const resolution = parsed.value.resolution
      if (resolution.target.connectionID !== resolution.connection.id ||
        ![resolution.connection.provider, resolution.connection.id, resolution.target.id].every((key) => resources.includes(key)))
        throw failure("target_denied")
      return Object.freeze({ action, resources, selection: Object.freeze({ credentialHash: parsed.value.credentialHash,
        resolution: Object.freeze({ ...resolution, connection: Object.freeze(resolution.connection), target: Object.freeze(resolution.target) }),
      }) })
    }))
  } catch (error) {
    if (error instanceof Capability.Failure) return error
    throw error
  }
}

/** Read-only selected condition inside the actual publication writer, after policy/root/lineage fencing. */
export const checkSelection = Effect.fn("CapabilityArtifacts.checkSelection")(function* (
  tx: Transaction, context: Tool.Context, owner: Capability.Owner, requirement: Requirements[number],
  credentials: Option.Option<Credential.Interface>,
) {
  const selected = requirement.selection
  if (!selected) return
  if (Option.isNone(credentials)) return yield* failure("connection_unavailable")
  const credentialService = credentials.value
  const resolution = selected.resolution
  const connection = yield* tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, resolution.connection.id)).get()
  if (!connection) return yield* failure("connection_unavailable")
  if (connection.project_id !== owner.projectID || connection.directory !== owner.location.directory ||
    (connection.workspace_id ?? undefined) !== owner.location.workspaceID || connection.provider !== resolution.connection.provider ||
    owner.sessionID !== context.sessionID || owner.agentID !== context.agent) return yield* failure("target_denied")
  if (!validGeneration(connection.generation) || connection.generation !== resolution.connection.generation)
    return yield* failure("stale_descriptor")
  if (connection.state !== "active") return yield* failure("authentication_revoked")
  if (!connection.credential_id) return yield* failure("authentication_required")
  if (connection.credential_id !== resolution.credentialID || connection.endpoint !== resolution.endpoint ||
    resolution.target.connectionID !== connection.id ||
    ![connection.provider, connection.id, resolution.target.id].every((key) => requirement.resources.includes(key)))
    return yield* failure("target_denied")
  const target = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, resolution.target.id)).get()
  if (!target) return yield* failure("connection_unavailable")
  if (target.connection_id !== connection.id) return yield* failure("target_denied")
  if (!validGeneration(target.generation) || target.generation !== resolution.target.generation || target.environment !== resolution.target.environment)
    return yield* failure("stale_descriptor")
  const matches = yield* Effect.try({ try: () => fingerprint(target.resource) === fingerprint(resolution.resource),
    catch: (error) => { if (error instanceof Capability.Failure) return failure("target_denied"); throw error } })
  if (!matches) return yield* failure("target_denied")
  const binding = yield* tx.select().from(CapabilityBindingTable).where(and(eq(CapabilityBindingTable.target_id, target.id),
    eq(CapabilityBindingTable.session_id, owner.sessionID), eq(CapabilityBindingTable.agent_id, owner.agentID))).get()
  if (!binding || (!binding.actions.includes(requirement.action) && !binding.actions.includes("*"))) return yield* failure("target_denied")
  // The local FK row must exist before get: never enter Credential's inherited/newest fallback path.
  const local = yield* tx.select({ id: CredentialTable.id, integrationID: CredentialTable.integration_id }).from(CredentialTable)
    .where(eq(CredentialTable.id, connection.credential_id)).get()
  if (!local) return yield* failure("authentication_required")
  if (local.integrationID !== connection.integration_id) return yield* failure("authentication_revoked")
  const saved = yield* credentialService.get(connection.credential_id).pipe(Effect.catchDefect((error) =>
    error instanceof SqlError || error instanceof EffectDrizzleQueryError ? Effect.fail(failure("connection_unavailable")) : Effect.die(error)))
  if (!saved) return yield* failure("authentication_required")
  if (saved.id !== connection.credential_id || saved.integrationID !== connection.integration_id) return yield* failure("authentication_revoked")
  if (saved.value.type === "oauth" && saved.value.expires <= Date.now()) return yield* failure("authentication_required")
  const hash = yield* Effect.try({ try: () => selectionCredentialHash(saved.value),
    catch: (error) => { if (error instanceof Capability.Failure) return failure("authentication_revoked"); throw error } })
  if (hash !== selected.credentialHash) return yield* failure("authentication_revoked")
}, (effect) => effect.pipe(Effect.catchIf((error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError,
  () => Effect.fail(failure("connection_unavailable")))))

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Artifact selected capability condition failed" })
}

function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") throw failure("target_denied")
  const property = Object.getOwnPropertyDescriptor(value, key)
  if (property && !("value" in property)) throw failure("target_denied")
  return property?.value
}

function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw failure("target_denied")
  const keys = Object.keys(value)
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) throw failure("target_denied")
  return keys.map((key) => field(value, key))
}

function validGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function object(value: Schema.Json): value is Schema.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function fingerprint(value: Schema.Json) {
  const canonical = (value: Schema.Json): string => object(value)
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : JSON.stringify(value)
  return createHash("sha256").update(canonical(copy(value))).digest("hex")
}

/** Bound before serialization; descriptors prevent getter/toJSON execution. Only detached JSON is serialized. */
function copy(input: unknown): Schema.Json {
  const budget = { nodes: 0, bytes: 0 }
  const path = new Set<object>()
  const add = (bytes: number) => {
    budget.bytes += bytes
    if (budget.bytes > 16384) throw failure("quota_exceeded")
  }
  const visit = (value: unknown, depth: number): Schema.Json => {
    if (++budget.nodes > 1024 || depth > 64) throw failure("quota_exceeded")
    if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) {
      add(JSON.stringify(value).length)
      return value
    }
    if (typeof value === "string") { add(Buffer.byteLength(value)); add(Buffer.byteLength(JSON.stringify(value)) - Buffer.byteLength(value)); return value }
    if (!value || typeof value !== "object" || path.has(value) ||
      Object.getPrototypeOf(value) !== (Array.isArray(value) ? Array.prototype : Object.prototype) && Object.getPrototypeOf(value) !== null)
      throw failure("target_denied")
    const serializer = Object.getOwnPropertyDescriptor(value, "toJSON")
    if (serializer && (!("value" in serializer) || typeof serializer.value === "function")) throw failure("target_denied")
    path.add(value)
    const keys = Object.keys(value)
    if (keys.length > 1024 - budget.nodes) throw failure("quota_exceeded")
    if (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index)))) throw failure("target_denied")
    add(2 + Math.max(0, keys.length - 1))
    const result: Schema.Json = Array.isArray(value) ? [] : Object.create(null)
    keys.forEach((key) => {
      if (!Array.isArray(value)) { add(Buffer.byteLength(key)); add(Buffer.byteLength(JSON.stringify(key)) - Buffer.byteLength(key) + 1) }
      Object.defineProperty(result, key, { enumerable: true, value: visit(field(value, key), depth + 1) })
    })
    path.delete(value)
    return Object.freeze(result)
  }
  return visit(input, 0)
}

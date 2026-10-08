export * as CapabilityJobs from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Permission } from "@orchestra/schema/permission"
import { createHash } from "crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { AgentV2 } from "../../agent"
import { Database } from "../../database/database"
import { Location } from "../../location"
import { PermissionV2 } from "../../permission"
import { SessionStore } from "../../session/store"
import type { Tool } from "../../tool/tool"
import { CapabilityInvocation } from "../invocation"
import { CapabilityPolicy } from "../policy"
import {
  CapabilityArtifactReferenceTable, CapabilityArtifactTable, CapabilityBindingTable,
  CapabilityConnectionTable, CapabilityJobTable, CapabilityTargetTable,
} from "../sql"

const Create = Schema.Struct({
  kind: Capability.JobKind,
  operation: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9._:-]{0,127}(?![\s\S])/)),
  creationKey: Schema.optional(Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,63}(?![\s\S])/))),
  connection: Schema.optional(Capability.ConnectionRef),
  target: Schema.optional(Capability.TargetRef),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

// Provider text, URLs, credentials and process handles have no projection slot.
export const Observation = Schema.Struct({
  progress: Schema.optional(Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  remoteOutcome: Schema.optional(Schema.Literals(["completed", "failed"])),
  materialization: Schema.optional(Schema.Literals(["pending", "complete", "failed"])),
  cancellation: Schema.optional(Schema.Literals(["requested", "confirmed", "unsupported"])),
  artifactRefs: Schema.optional(Schema.Array(Capability.ArtifactRef)),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
export type Observation = typeof Observation.Type
export type CreateInput = typeof Create.Type
export type TransitionInput = {
  expectedGeneration: number
  state: Capability.JobState
  providerID?: string
  observation: Schema.Json
}
export type Receipt = {
  ref: Capability.JobRef
  generation: number
  kind: Capability.JobKind
  state: Capability.JobState
  observation: Observation
}
/** Trusted host only: exact persisted producer, never an invented Tool.Context or execution grant. */
export type ProducerProof = {
  owner: Capability.Owner
  producer: Capability.InvocationRef
  rootToolName: string
}
const Proof = Schema.Struct({ owner: Schema.toType(Capability.Owner), producer: Capability.InvocationRef,
  rootToolName: Schema.NonEmptyString })
const Stored = Schema.Struct({ rootToolName: Schema.NonEmptyString, effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset, data: Observation })
type Row = typeof CapabilityJobTable.$inferSelect
type Writer = Pick<Database.Interface["db"], "select" | "insert" | "update">
type FixedTransition = Omit<TransitionInput, "observation"> & { observation: Observation }

/** Durable metadata only: constructing or replaying this service never dispatches work. */
export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const permissions = yield* PermissionV2.Service
  const agents = yield* AgentV2.Service
  const policy = yield* CapabilityPolicy.make
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

  const load = Effect.fn("CapabilityJobs.load")(function* (writer: Writer, ref: Capability.JobRef) {
    const row = yield* writer.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    if (!row) return yield* failure("stale_descriptor")
    return row
  })

  const refs = Effect.fn("CapabilityJobs.refs")(function* (writer: Writer, row: Pick<Row, "connection" | "target" | "owner" | "operation">) {
    if (row.target && (!row.connection || row.target.connectionID !== row.connection.id))
      return yield* failure("stale_descriptor")
    if (row.connection) {
      const connection = yield* writer.select().from(CapabilityConnectionTable)
        .where(eq(CapabilityConnectionTable.id, row.connection.id)).get().pipe(Effect.orDie)
      if (!connection || connection.generation !== row.connection.generation ||
        connection.provider !== row.connection.provider || connection.state !== "active" ||
        connection.project_id !== row.owner.projectID || connection.directory !== row.owner.location.directory ||
        (connection.workspace_id ?? undefined) !== row.owner.location.workspaceID)
        return yield* failure("connection_unavailable")
    }
    if (row.target) {
      const target = yield* writer.select().from(CapabilityTargetTable)
        .where(eq(CapabilityTargetTable.id, row.target.id)).get().pipe(Effect.orDie)
      if (!target || target.generation !== row.target.generation || target.connection_id !== row.target.connectionID ||
        target.environment !== row.target.environment) return yield* failure("stale_descriptor")
      const binding = yield* writer.select().from(CapabilityBindingTable).where(and(
        eq(CapabilityBindingTable.target_id, target.id), eq(CapabilityBindingTable.session_id, row.owner.sessionID),
        eq(CapabilityBindingTable.agent_id, row.owner.agentID),
      )).get().pipe(Effect.orDie)
      if (!binding || (!binding.actions.includes("*") && !binding.actions.includes(row.operation)))
        return yield* failure("target_denied")
    }
  })

  const authorize = Effect.fn("CapabilityJobs.authorize")(function* (context: Tool.Context, row: Row, action: string) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (!sameOwner(binding.owner, row.owner)) return yield* failure("target_denied")
    return yield* policy.authorize(context, { action, resources: resources(row) })
  })

  const host = Effect.fn("CapabilityJobs.host")(function* (proof: ProducerProof, row: Row, read: boolean) {
    const stored = yield* Schema.decodeUnknownEffect(Stored)(row.observation).pipe(Effect.orDie)
    if (!sameOwner(proof.owner, row.owner) || !sameInvocation(proof.producer, row.invocation) ||
      proof.rootToolName !== stored.rootToolName || row.owner.projectID !== placement.projectID ||
      row.owner.location.directory !== placement.location.directory ||
      row.owner.location.workspaceID !== placement.location.workspaceID) return yield* failure("target_denied")
    const session = yield* sessions.get(row.owner.sessionID)
    const message = yield* sessions.message(row.invocation.assistantMessageID)
    if (!session || session.projectID !== row.owner.projectID ||
      session.location.directory !== row.owner.location.directory || session.location.workspaceID !== row.owner.location.workspaceID ||
      !message || message.sessionID !== row.owner.sessionID || message.message.type !== "assistant" ||
      message.message.agent !== row.owner.agentID || !message.message.content.some((part) =>
        part.type === "tool" && part.id === row.invocation.callID && part.name === stored.rootToolName))
      return yield* failure("target_denied")
    // Already-acquired facts need provenance, not fresh permission to perform external effects.
    if (!read) return
    if (resources(row).some((resource) => PermissionV2.evaluate("read", resource,
      stored.nativeDenyFloor.filter((rule) => rule.effect === "deny")).effect === "deny"))
      return yield* failure("target_denied")
    const current = yield* permissions.evaluate({ sessionID: row.owner.sessionID, agent: row.owner.agentID,
      action: "read", resources: resources(row) }).pipe(
        Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("target_denied"))),
      )
    if (current !== "allow") return yield* failure("target_denied")
  })

  const update = Effect.fn("CapabilityJobs.update")(function* (writer: Writer, row: Row, input: FixedTransition, lost = false) {
    if (row.generation !== input.expectedGeneration || row.generation >= Number.MAX_SAFE_INTEGER)
      return yield* failure("stale_descriptor")
    if (!allowed(row.state, input.state, lost)) return yield* failure("unsupported_operation")
    if (input.providerID !== undefined && (row.kind !== "provider" ||
      (row.provider_id !== null && row.provider_id !== input.providerID))) return yield* failure("outcome_unknown")
    const providerID = input.providerID ?? row.provider_id
    if (row.kind === "provider" && ["submitted", "running", "completed"].includes(input.state) && !providerID)
      return yield* failure("outcome_unknown")
    const observation = input.observation
    if (input.state === "cancel-requested" && observation.cancellation !== "requested" &&
      !(row.state === "cancel-requested" && observation.cancellation === "unsupported"))
      return yield* failure("unsupported_operation")
    if (input.state === "cancelled" && row.state !== "intent" && observation.cancellation !== "confirmed")
      return yield* failure("unsupported_operation")
    if ((observation.cancellation === "confirmed" && input.state !== "cancelled") ||
      (observation.cancellation === "requested" && input.state !== "cancel-requested") ||
      (row.kind === "provider" && row.state !== "intent" && input.state === "cancelled" && !providerID))
      return yield* failure("unsupported_operation")
    const stored = yield* Schema.decodeUnknownEffect(Stored)(row.observation).pipe(Effect.orDie)
    if ((stored.data.remoteOutcome !== undefined && observation.remoteOutcome !== stored.data.remoteOutcome) ||
      (observation.remoteOutcome !== undefined && input.state !== observation.remoteOutcome) ||
      (observation.materialization !== undefined && input.state !== "completed"))
      return yield* failure("unsupported_operation")
    yield* Effect.forEach(observation.artifactRefs ?? [], (ref) => Effect.gen(function* () {
      const artifact = yield* writer.select().from(CapabilityArtifactTable).where(and(
        eq(CapabilityArtifactTable.id, ref.id), eq(CapabilityArtifactTable.revision, ref.revision),
      )).get().pipe(Effect.orDie)
      const retained = yield* writer.select().from(CapabilityArtifactReferenceTable).where(and(
        eq(CapabilityArtifactReferenceTable.artifact_id, ref.id), eq(CapabilityArtifactReferenceTable.revision, ref.revision),
        eq(CapabilityArtifactReferenceTable.session_id, row.owner.sessionID),
      )).get().pipe(Effect.orDie)
      // Sharing is Session retention within project/placement, not creator Session/actor equality.
      if (!artifact || !retained || !samePlacement(artifact.owner, row.owner)) return yield* failure("target_denied")
    }))
    const next = yield* writer.update(CapabilityJobTable).set({
      state: input.state, provider_id: providerID, observation: { ...stored, data: observation },
      generation: row.generation + 1, time_updated: Date.now(),
    }).where(and(eq(CapabilityJobTable.id, row.id), eq(CapabilityJobTable.generation, input.expectedGeneration)))
      .returning().get().pipe(Effect.orDie)
    if (!next) return yield* failure("stale_descriptor")
    return yield* receipt(next)
  })

  return {
    create: Effect.fn("CapabilityJobs.create")(function* (supplied: Tool.Context, input: CreateInput) {
      const decoded = Schema.decodeUnknownOption(Create)(input)
      if (Option.isNone(decoded)) return yield* failure("unsupported_schema")
      const fixed = Object.freeze({ ...decoded.value,
        ...(decoded.value.connection ? { connection: Object.freeze({ ...decoded.value.connection }) } : {}),
        ...(decoded.value.target ? { target: Object.freeze({ ...decoded.value.target }) } : {}),
      })
      const context = Object.freeze({ ...supplied })
      const binding = yield* CapabilityInvocation.require(context, placement)
      const observation = { rootToolName: binding.rootToolName, effectiveRules: binding.effectiveRules,
        nativeDenyFloor: binding.nativeDenyFloor, data: {} }
      // Policy/provenance has its own 16 KiB budget; model observation retains an independent 4 KiB budget.
      if (!boundedJson(observation, 16384, 1024)) return yield* failure("quota_exceeded")
      const creationKey = createHash("sha256").update(JSON.stringify([
        binding.invocation.sessionID, binding.invocation.agentID, binding.invocation.assistantMessageID,
        binding.invocation.callID, fixed.operation, fixed.creationKey ?? "primary",
      ])).digest("hex")
      const permit = yield* policy.authorize(context, { action: "effect", resources: resources(fixed) })
      return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        const keyed = yield* tx.select().from(CapabilityJobTable)
          .where(eq(CapabilityJobTable.creation_key, creationKey)).get().pipe(Effect.orDie)
        const legacy = keyed || (fixed.creationKey ?? "primary") !== "primary" ? []
          : yield* tx.select().from(CapabilityJobTable).where(and(
            isNull(CapabilityJobTable.creation_key), eq(CapabilityJobTable.operation, fixed.operation),
            sql`json_extract(${CapabilityJobTable.invocation}, '$.sessionID') = ${binding.invocation.sessionID}`,
            sql`json_extract(${CapabilityJobTable.invocation}, '$.agentID') = ${binding.invocation.agentID}`,
            sql`json_extract(${CapabilityJobTable.invocation}, '$.assistantMessageID') = ${binding.invocation.assistantMessageID}`,
            sql`json_extract(${CapabilityJobTable.invocation}, '$.callID') = ${binding.invocation.callID}`,
          )).limit(2).all().pipe(Effect.orDie)
        if (legacy.length > 1) return yield* failure("outcome_unknown")
        const existing = keyed ?? legacy[0]
        if (existing) {
          const stored = yield* Schema.decodeUnknownEffect(Stored)(existing.observation).pipe(Effect.orDie)
          if (!sameOwner(existing.owner, binding.owner) || !sameInvocation(existing.invocation, binding.invocation) ||
            existing.kind !== fixed.kind || existing.operation !== fixed.operation || !sameRefs(existing, fixed) ||
            stored.rootToolName !== binding.rootToolName) return yield* failure("outcome_unknown")
          if (existing.creation_key === null) yield* tx.update(CapabilityJobTable).set({ creation_key: creationKey })
            .where(eq(CapabilityJobTable.id, existing.id)).run().pipe(Effect.orDie)
          return { id: existing.id }
        }
        yield* refs(tx, { ...fixed, owner: binding.owner, connection: fixed.connection ?? null, target: fixed.target ?? null })
        const ref = { id: Capability.JobID.create() }
        yield* tx.insert(CapabilityJobTable).values({ id: ref.id, owner: binding.owner, invocation: binding.invocation,
          kind: fixed.kind, operation: fixed.operation, connection: fixed.connection, target: fixed.target,
          creation_key: creationKey, state: "intent", observation,
        }).run().pipe(Effect.orDie)
        return ref
      })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
    read: Effect.fn("CapabilityJobs.read")(function* (supplied: Tool.Context, suppliedRef: Capability.JobRef) {
      const ref = fixedRef(suppliedRef)
      if (ref instanceof Capability.Failure) return yield* ref
      const context = Object.freeze({ ...supplied })
      const row = yield* load(database.db, ref)
      const permit = yield* authorize(context, row, "read")
      return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        const current = yield* load(tx, ref)
        if (!sameOwner(current.owner, permit.binding.owner)) return yield* failure("target_denied")
        return yield* receipt(current)
      })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
    transition: Effect.fn("CapabilityJobs.transition")(function* (
      supplied: Tool.Context, suppliedRef: Capability.JobRef, input: TransitionInput,
    ) {
      // All caller-owned transition data is parsed/copied before the first service/DB/permission yield.
      const fixed = fixedTransition(input)
      const ref = fixedRef(suppliedRef)
      const context = Object.freeze({ ...supplied })
      if (fixed instanceof Capability.Failure) return yield* fixed
      if (ref instanceof Capability.Failure) return yield* ref
      const row = yield* load(database.db, ref)
      const permit = yield* authorize(context, row, "effect")
      if (!sameInvocation(permit.binding.invocation, row.invocation)) return yield* failure("target_denied")
      return yield* policy.commit(permit, (tx) => Effect.gen(function* () {
        const current = yield* load(tx, ref)
        if (!sameOwner(current.owner, permit.binding.owner) || !sameInvocation(current.invocation, permit.binding.invocation))
          return yield* failure("target_denied")
        if (current.kind !== row.kind || current.operation !== row.operation || !sameRefs(current, row))
          return yield* failure("stale_descriptor")
        yield* refs(tx, current)
        return yield* update(tx, current, fixed)
      })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
    observeHost: Effect.fn("CapabilityJobs.observeHost")(function* (
      suppliedProof: ProducerProof, suppliedRef: Capability.JobRef, input: TransitionInput,
    ) {
      const fixed = fixedTransition(input)
      const proof = fixedProof(suppliedProof)
      const ref = fixedRef(suppliedRef)
      if (fixed instanceof Capability.Failure) return yield* fixed
      if (proof instanceof Capability.Failure) return yield* proof
      if (ref instanceof Capability.Failure) return yield* ref
      // No poll, network, cancel or dispatch. Callers separately authorize acquiring external facts.
      return yield* agents.withPermissions(proof.owner.agentID, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* load(tx, ref)
        yield* host(proof, current, false)
        if (current.state === "intent" || fixed.state === "submitting") return yield* failure("unsupported_operation")
        return yield* update(tx, current, fixed)
      }), { behavior: "immediate" })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
    readHost: Effect.fn("CapabilityJobs.readHost")(function* (suppliedProof: ProducerProof, suppliedRef: Capability.JobRef) {
      const proof = fixedProof(suppliedProof)
      const ref = fixedRef(suppliedRef)
      if (proof instanceof Capability.Failure) return yield* proof
      if (ref instanceof Capability.Failure) return yield* ref
      return yield* agents.withPermissions(proof.owner.agentID, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* load(tx, ref)
        yield* host(proof, current, true)
        return { receipt: yield* receipt(current), providerID: current.provider_id ?? undefined }
      }), { behavior: "immediate" })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
    markLostHost: Effect.fn("CapabilityJobs.markLostHost")(function* (
      suppliedProof: ProducerProof, suppliedRef: Capability.JobRef,
      // Trusted startup host must check actual owner absence; restart alone is not evidence.
      input: { expectedGeneration: number; evidence: "startup-owner-absent" },
    ) {
      const fixed = fixedTransition({ expectedGeneration: input.expectedGeneration, state: "lost", observation: {} })
      const evidence = input.evidence
      const proof = fixedProof(suppliedProof)
      const ref = fixedRef(suppliedRef)
      if (fixed instanceof Capability.Failure) return yield* fixed
      if (proof instanceof Capability.Failure) return yield* proof
      if (ref instanceof Capability.Failure) return yield* ref
      return yield* agents.withPermissions(proof.owner.agentID, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* load(tx, ref)
        yield* host(proof, current, false)
        if (current.kind !== "local-process" || evidence !== "startup-owner-absent") return yield* failure("unsupported_operation")
        return yield* update(tx, current, fixed, true)
      }), { behavior: "immediate" })).pipe(Effect.catchTag("SqlError", Effect.die))
    }),
  }
})

function fixedTransition(input: TransitionInput): FixedTransition | Capability.Failure {
  const state = input.state
  const expectedGeneration = input.expectedGeneration
  const providerID = input.providerID
  const observation = input.observation
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) return failure("stale_descriptor")
  if (Option.isNone(Schema.decodeUnknownOption(Capability.JobState)(state))) return failure("unsupported_operation")
  if (providerID !== undefined && (typeof providerID !== "string" || providerID.length > 256 ||
    !/^[0-9A-Za-z._:-]{1,256}(?![\s\S])/.test(providerID))) return failure("outcome_unknown")
  if (!boundedJson(observation)) return failure("quota_exceeded")
  const decoded = Schema.decodeUnknownOption(Observation)(copyJson(observation))
  if (Option.isNone(decoded)) return failure("unsupported_schema")
  return Object.freeze({ state, expectedGeneration, providerID, observation: Object.freeze({ ...decoded.value,
    ...(decoded.value.artifactRefs ? { artifactRefs: Object.freeze(decoded.value.artifactRefs.map((ref) => Object.freeze({ ...ref }))) } : {}),
  }) })
}

function fixedRef(ref: Capability.JobRef) {
  const decoded = Schema.decodeUnknownOption(Capability.JobRef)(ref)
  return Option.isNone(decoded) ? failure("stale_descriptor") : Object.freeze({ ...decoded.value })
}

function fixedProof(proof: ProducerProof) {
  const decoded = Schema.decodeUnknownOption(Proof)(proof)
  if (Option.isNone(decoded)) return failure("target_denied")
  return Object.freeze({ rootToolName: decoded.value.rootToolName, producer: Object.freeze({ ...decoded.value.producer }),
    owner: Object.freeze({ ...decoded.value.owner, location: Object.freeze({ ...decoded.value.owner.location }) }) })
}

function resources(row: { operation: string; connection?: Capability.ConnectionRef | null; target?: Capability.TargetRef | null }) {
  return [`capability:job:${row.operation}`, ...(row.connection ? [`capability:connection:${row.connection.id}`] : []),
    ...(row.target ? [`capability:target:${row.target.id}`] : [])]
}

function samePlacement(left: Capability.Owner, right: Capability.Owner) {
  return left.projectID === right.projectID && left.location.directory === right.location.directory &&
    left.location.workspaceID === right.location.workspaceID
}

function sameOwner(left: Capability.Owner, right: Capability.Owner) {
  return samePlacement(left, right) && left.sessionID === right.sessionID && left.agentID === right.agentID
}

function sameInvocation(left: Capability.InvocationRef, right: Capability.InvocationRef) {
  return left.sessionID === right.sessionID && left.agentID === right.agentID &&
    left.assistantMessageID === right.assistantMessageID && left.callID === right.callID
}

function sameRefs(left: { connection?: Capability.ConnectionRef | null; target?: Capability.TargetRef | null },
  right: { connection?: Capability.ConnectionRef | null; target?: Capability.TargetRef | null }) {
  return (left.connection?.id === right.connection?.id && left.connection?.provider === right.connection?.provider &&
    left.connection?.generation === right.connection?.generation && left.target?.id === right.target?.id &&
    left.target?.connectionID === right.target?.connectionID && left.target?.generation === right.target?.generation &&
    left.target?.environment === right.target?.environment)
}

function allowed(from: string, to: Capability.JobState, lost: boolean) {
  if (to === "lost") return lost && ["submitting", "submitted", "running", "cancel-requested", "unknown"].includes(from)
  if (from === to) return from !== "intent" && from !== "submitting"
  if (from === "intent") return ["submitting", "cancelled"].includes(to)
  if (from === "submitting") return ["submitted", "running", "completed", "failed", "unknown", "cancel-requested"].includes(to)
  if (from === "submitted") return ["running", "completed", "failed", "unknown", "cancel-requested"].includes(to)
  if (from === "running") return ["completed", "failed", "unknown", "cancel-requested"].includes(to)
  if (from === "unknown") return ["submitted", "running", "completed", "failed", "cancel-requested"].includes(to)
  if (from === "cancel-requested") return ["cancelled", "completed", "failed", "unknown"].includes(to)
  return false
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Job unavailable" })
}

function receipt(row: Row) {
  return Effect.gen(function* () {
    const state = yield* Schema.decodeUnknownEffect(Capability.JobState)(row.state).pipe(Effect.orDie)
    const stored = yield* Schema.decodeUnknownEffect(Stored)(row.observation).pipe(Effect.orDie)
    return { ref: { id: row.id }, generation: row.generation, kind: row.kind, state, observation: stored.data } satisfies Receipt
  })
}

function copyJson(value: Schema.Json): Schema.Json {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return Object.freeze(value.map(copyJson))
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyJson(item)])))
}

function boundedJson(value: unknown, bytes = 4096, nodes = 256) {
  const seen = new Set<object>()
  const budget = { nodes: 0, bytes: 0 }
  const valid = (item: unknown, depth: number): boolean => {
    budget.nodes++
    if (depth > 8 || budget.nodes > nodes) return false
    if (item === null || typeof item === "boolean") return true
    if (typeof item === "number") return Number.isFinite(item)
    if (typeof item === "string") {
      if (item.length > bytes - budget.bytes) return false
      budget.bytes += new TextEncoder().encode(item).byteLength
      return budget.bytes <= bytes
    }
    if (typeof item !== "object" || seen.has(item)) return false
    // Sparse or giant arrays must fail before descriptors or JSON.stringify allocate from their length.
    if (Array.isArray(item) && item.length > nodes - budget.nodes) return false
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
      return false
    seen.add(item)
    const descriptors = Object.getOwnPropertyDescriptors(item)
    const entries = Object.entries(descriptors)
    if (Array.isArray(item) && (entries.length !== item.length + 1 ||
      !Array.from({ length: item.length }, (_, index) => Object.hasOwn(descriptors, String(index))).every(Boolean)))
      return false
    const result = entries.every(([key, descriptor]) => {
      if (Array.isArray(item) && key === "length") return true
      if (!("value" in descriptor) || !descriptor.enumerable || key.length > bytes - budget.bytes) return false
      budget.bytes += new TextEncoder().encode(key).byteLength
      return budget.bytes <= bytes && valid(descriptor.value, depth + 1)
    })
    seen.delete(item)
    return result
  }
  return valid(value, 0) && new TextEncoder().encode(JSON.stringify(value)).byteLength <= bytes
}

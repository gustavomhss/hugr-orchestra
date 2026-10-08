export * as CapabilityJobs from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Permission } from "@orchestra/schema/permission"
import { and, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
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
  connection: Schema.optional(Capability.ConnectionRef),
  target: Schema.optional(Capability.TargetRef),
}).annotate({ parseOptions: { onExcessProperty: "error" } })

// Closed projection: provider text, URLs, credentials and process handles have no slot here.
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
/** Host boundary only. Proof identifies the persisted producer, never a worker's invented Tool.Context. */
export type ProducerProof = {
  owner: Capability.Owner
  producer: Capability.InvocationRef
  rootToolName: string
}

const Stored = Schema.Struct({
  rootToolName: Schema.NonEmptyString,
  effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset,
  data: Observation,
})
type Row = typeof CapabilityJobTable.$inferSelect

export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const sessions = yield* SessionStore.Service
  const permissions = yield* PermissionV2.Service
  const policy = yield* CapabilityPolicy.make
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

  const load = Effect.fn("CapabilityJobs.load")(function* (ref: Capability.JobRef) {
    if (Option.isNone(Schema.decodeUnknownOption(Capability.JobRef)(ref))) return yield* failure("stale_descriptor")
    const row = yield* database.db.select().from(CapabilityJobTable)
      .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    if (!row) return yield* failure("stale_descriptor")
    return row
  })

  const refs = Effect.fn("CapabilityJobs.refs")(function* (row: Pick<Row, "connection" | "target" | "owner" | "operation">) {
    if (row.target && (!row.connection || row.target.connectionID !== row.connection.id))
      return yield* failure("stale_descriptor")
    if (row.connection) {
      const connection = yield* database.db.select().from(CapabilityConnectionTable)
        .where(eq(CapabilityConnectionTable.id, row.connection.id)).get().pipe(Effect.orDie)
      if (!connection || connection.generation !== row.connection.generation ||
        connection.provider !== row.connection.provider || connection.state !== "active" ||
        connection.project_id !== row.owner.projectID || connection.directory !== row.owner.location.directory ||
        (connection.workspace_id ?? undefined) !== row.owner.location.workspaceID)
        return yield* failure("connection_unavailable")
    }
    if (row.target) {
      const target = yield* database.db.select().from(CapabilityTargetTable)
        .where(eq(CapabilityTargetTable.id, row.target.id)).get().pipe(Effect.orDie)
      if (!target || target.generation !== row.target.generation || target.connection_id !== row.target.connectionID ||
        target.environment !== row.target.environment) return yield* failure("stale_descriptor")
      const binding = yield* database.db.select().from(CapabilityBindingTable).where(and(
        eq(CapabilityBindingTable.target_id, target.id), eq(CapabilityBindingTable.session_id, row.owner.sessionID),
        eq(CapabilityBindingTable.agent_id, row.owner.agentID),
      )).get().pipe(Effect.orDie)
      if (!binding || !binding.actions.includes(row.operation)) return yield* failure("target_denied")
    }
  })

  const authorize = Effect.fn("CapabilityJobs.authorize")(function* (context: Tool.Context, row: Row, action: string) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (!sameOwner(binding.owner, row.owner)) return yield* failure("target_denied")
    yield* policy.assert(context, { action, resources: resources(row) })
    yield* refs(row)
  })

  const host = Effect.fn("CapabilityJobs.host")(function* (proof: ProducerProof, row: Row, action: string) {
    const owner = Schema.decodeUnknownOption(Schema.toType(Capability.Owner))(proof.owner)
    const producer = Schema.decodeUnknownOption(Capability.InvocationRef)(proof.producer)
    const stored = yield* Schema.decodeUnknownEffect(Stored)(row.observation).pipe(Effect.orDie)
    if (Option.isNone(owner) || Option.isNone(producer) || !sameOwner(owner.value, row.owner) ||
      !sameInvocation(producer.value, row.invocation) || proof.rootToolName !== stored.rootToolName ||
      row.owner.projectID !== placement.projectID || row.owner.location.directory !== placement.location.directory ||
      row.owner.location.workspaceID !== placement.location.workspaceID) return yield* failure("target_denied")
    const session = yield* sessions.get(row.owner.sessionID)
    const message = yield* sessions.message(row.invocation.assistantMessageID)
    if (!session || session.projectID !== row.owner.projectID ||
      session.location.directory !== row.owner.location.directory || session.location.workspaceID !== row.owner.location.workspaceID ||
      !message || message.sessionID !== row.owner.sessionID || message.message.type !== "assistant" ||
      message.message.agent !== row.owner.agentID || !message.message.content.some((part) =>
        part.type === "tool" && part.id === row.invocation.callID && part.name === stored.rootToolName))
      return yield* failure("target_denied")
    // Background observation cannot silently turn an ask into a grant. A live root can obtain approval.
    if (resources(row).some((resource) =>
      PermissionV2.evaluate(action, resource, stored.nativeDenyFloor.filter((rule) => rule.effect === "deny")).effect === "deny" ||
      PermissionV2.evaluate(action, resource, stored.effectiveRules).effect !== "allow"))
      return yield* failure("target_denied")
    const current = yield* permissions.evaluate({ sessionID: row.owner.sessionID, agent: row.owner.agentID,
      action, resources: resources(row) }).pipe(Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("target_denied"))))
    if (current !== "allow") return yield* failure("target_denied")
    yield* refs(row)
  })

  const update = Effect.fn("CapabilityJobs.update")(function* (row: Row, input: TransitionInput, lost = false) {
    const observation = yield* decodeObservation(input.observation)
    if (!Number.isSafeInteger(input.expectedGeneration) || input.expectedGeneration < 0 ||
      row.generation !== input.expectedGeneration || row.generation >= Number.MAX_SAFE_INTEGER)
      return yield* failure("stale_descriptor")
    if (Option.isNone(Schema.decodeUnknownOption(Capability.JobState)(input.state)) ||
      !allowed(row.state, input.state, lost)) return yield* failure("unsupported_operation")
    if (input.providerID !== undefined && (!/^[0-9A-Za-z._:-]{1,256}(?![\s\S])/.test(input.providerID) ||
      row.kind !== "provider" || (row.provider_id !== null && row.provider_id !== input.providerID)))
      return yield* failure("outcome_unknown")
    const providerID = input.providerID ?? row.provider_id
    if (row.kind === "provider" && ["submitted", "running", "completed"].includes(input.state) && !providerID)
      return yield* failure("outcome_unknown")
    if (input.state === "cancel-requested" && observation.cancellation !== "requested")
      return yield* failure("unsupported_operation")
    if (input.state === "cancelled" && row.state !== "intent" && observation.cancellation !== "confirmed")
      return yield* failure("unsupported_operation")
    const stored = yield* Schema.decodeUnknownEffect(Stored)(row.observation).pipe(Effect.orDie)
    // Remote completion survives materialization failures; only observation can change afterward.
    if ((stored.data.remoteOutcome === "completed" && observation.remoteOutcome !== "completed") ||
      (observation.remoteOutcome === "completed" && input.state !== "completed"))
      return yield* failure("unsupported_operation")
    yield* Effect.forEach(observation.artifactRefs ?? [], (ref) => Effect.gen(function* () {
      const artifact = yield* database.db.select().from(CapabilityArtifactTable).where(and(
        eq(CapabilityArtifactTable.id, ref.id), eq(CapabilityArtifactTable.revision, ref.revision),
      )).get().pipe(Effect.orDie)
      const retained = yield* database.db.select().from(CapabilityArtifactReferenceTable).where(and(
        eq(CapabilityArtifactReferenceTable.artifact_id, ref.id), eq(CapabilityArtifactReferenceTable.revision, ref.revision),
        eq(CapabilityArtifactReferenceTable.session_id, row.owner.sessionID),
      )).get().pipe(Effect.orDie)
      if (!artifact || !retained || !sameOwner(artifact.owner, row.owner)) return yield* failure("target_denied")
    }))
    const next = yield* database.db.update(CapabilityJobTable).set({
      state: input.state, provider_id: providerID, observation: { ...stored, data: observation },
      generation: row.generation + 1, time_updated: Date.now(),
    }).where(and(eq(CapabilityJobTable.id, row.id), eq(CapabilityJobTable.generation, input.expectedGeneration)))
      .returning().get().pipe(Effect.orDie)
    if (!next) return yield* failure("stale_descriptor")
    return yield* receipt(next)
  })

  return {
    create: Effect.fn("CapabilityJobs.create")(function* (context: Tool.Context, input: CreateInput) {
      const decoded = Schema.decodeUnknownOption(Create)(input)
      if (Option.isNone(decoded)) return yield* failure("unsupported_schema")
      const binding = yield* CapabilityInvocation.require(context, placement)
      const row = { ...decoded.value, owner: binding.owner }
      yield* policy.assert(context, { action: "effect", resources: resources(row) })
      yield* refs({ ...row, connection: row.connection ?? null, target: row.target ?? null })
      const ref = { id: Capability.JobID.create() }
      yield* database.db.insert(CapabilityJobTable).values({
        id: ref.id, owner: binding.owner, invocation: binding.invocation, ...decoded.value, state: "intent",
        observation: { rootToolName: binding.rootToolName, effectiveRules: binding.effectiveRules,
          nativeDenyFloor: binding.nativeDenyFloor, data: {} },
      }).run().pipe(Effect.orDie)
      return ref
    }),
    read: Effect.fn("CapabilityJobs.read")(function* (context: Tool.Context, ref: Capability.JobRef) {
      const row = yield* load(ref)
      yield* authorize(context, row, "read")
      return yield* receipt(row)
    }),
    transition: Effect.fn("CapabilityJobs.transition")(function* (context: Tool.Context, ref: Capability.JobRef, input: TransitionInput) {
      const row = yield* load(ref)
      yield* authorize(context, row, "effect")
      // Dispatch state belongs to its exact producer; other owner roots may only read receipts.
      const binding = yield* CapabilityInvocation.require(context, placement)
      if (!sameInvocation(binding.invocation, row.invocation)) return yield* failure("target_denied")
      return yield* update(row, input)
    }),
    observeHost: Effect.fn("CapabilityJobs.observeHost")(function* (proof: ProducerProof, ref: Capability.JobRef, input: TransitionInput) {
      const row = yield* load(ref)
      yield* host(proof, row, "effect")
      // This method records observations only, never authorizes initial dispatch or redispatch.
      if (row.state === "intent" || input.state === "submitting") return yield* failure("unsupported_operation")
      return yield* update(row, input)
    }),
    readHost: Effect.fn("CapabilityJobs.readHost")(function* (proof: ProducerProof, ref: Capability.JobRef) {
      const row = yield* load(ref)
      yield* host(proof, row, "read")
      return { receipt: yield* receipt(row), providerID: row.provider_id ?? undefined }
    }),
    markLostHost: Effect.fn("CapabilityJobs.markLostHost")(function* (
      proof: ProducerProof, ref: Capability.JobRef,
      input: { expectedGeneration: number; evidence: "startup-owner-absent" },
    ) {
      const row = yield* load(ref)
      yield* host(proof, row, "effect")
      if (row.kind !== "local-process" || input.evidence !== "startup-owner-absent")
        return yield* failure("unsupported_operation")
      return yield* update(row, { expectedGeneration: input.expectedGeneration, state: "lost", observation: {} }, true)
    }),
  }
})

function resources(row: { operation: string; connection?: Capability.ConnectionRef | null; target?: Capability.TargetRef | null }) {
  return [`capability:job:${row.operation}`, ...(row.connection ? [`capability:connection:${row.connection.id}`] : []),
    ...(row.target ? [`capability:target:${row.target.id}`] : [])]
}

function sameOwner(left: Capability.Owner, right: Capability.Owner) {
  return left.projectID === right.projectID && left.sessionID === right.sessionID && left.agentID === right.agentID &&
    left.location.directory === right.location.directory && left.location.workspaceID === right.location.workspaceID
}

function sameInvocation(left: Capability.InvocationRef, right: Capability.InvocationRef) {
  return left.sessionID === right.sessionID && left.agentID === right.agentID &&
    left.assistantMessageID === right.assistantMessageID && left.callID === right.callID
}

function allowed(from: string, to: Capability.JobState, lost: boolean) {
  if (to === "lost") return lost && ["submitting", "submitted", "running", "cancel-requested", "unknown"].includes(from)
  if (from === to) return from !== "intent" && from !== "submitting"
  if (from === "intent") return ["submitting", "cancelled"].includes(to)
  if (from === "submitting") return ["submitted", "running", "failed", "unknown", "cancel-requested"].includes(to)
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

function decodeObservation(value: Schema.Json) {
  return Effect.suspend(() => {
    // Preflight bounds before recursive schema decoding, including hostile host input and non-finite numbers.
    const seen = new Set<object>()
    const budget = { nodes: 0, bytes: 0 }
    const valid = (item: unknown, depth: number): boolean => {
      budget.nodes++
      if (depth > 8 || budget.nodes > 256) return false
      if (item === null || typeof item === "boolean") return true
      if (typeof item === "number") return Number.isFinite(item)
      if (typeof item === "string") {
        budget.bytes += new TextEncoder().encode(item).byteLength
        return budget.bytes <= 4096
      }
      if (typeof item !== "object" || seen.has(item)) return false
      if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null)
        return false
      seen.add(item)
      const descriptors = Object.getOwnPropertyDescriptors(item)
      return Object.entries(descriptors).every(([key, descriptor]) => {
        if (Array.isArray(item) && key === "length") return true
        if (!("value" in descriptor) || !descriptor.enumerable) return false
        budget.bytes += new TextEncoder().encode(key).byteLength
        return budget.bytes <= 4096 && valid(descriptor.value, depth + 1)
      })
    }
    if (!valid(value, 0)) return Effect.fail(failure("quota_exceeded"))
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4096)
      return Effect.fail(failure("quota_exceeded"))
    const decoded = Schema.decodeUnknownOption(Observation)(value)
    if (Option.isNone(decoded)) return Effect.fail(failure("unsupported_schema"))
    return Effect.succeed(decoded.value)
  })
}

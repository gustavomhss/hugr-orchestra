export * as CapabilityDescriptors from "./descriptors"

import { Effect, Option, Schema } from "effect"
import { Capability } from "@orchestra/schema/capability"

export type DescriptorRecord = Readonly<{
  ref: Capability.DescriptorRef
  owner: Capability.Owner
  connectionGeneration: number
  targetGeneration: number
  canonicalName: string
  canonicalIdentity: object
  inputSchema: Schema.Json
  outputSchema?: Schema.Json
  operationID: string
  issuedAt: number
  expiresAt: number
}>
export type IssueInput = Omit<DescriptorRecord, "ref" | "issuedAt" | "expiresAt"> &
  Omit<Capability.DescriptorRef, "id">
export type ReadScope = Pick<
  DescriptorRecord,
  "owner" | "connectionGeneration" | "targetGeneration" | "canonicalIdentity"
> & Pick<Capability.DescriptorRef, "catalogGeneration" | "schemaHash">
export type Store = {
  issue: (input: IssueInput) => Effect.Effect<DescriptorRecord, Capability.Failure>
  read: (ref: Capability.DescriptorRef, scope: ReadScope) => Effect.Effect<DescriptorRecord, Capability.Failure>
  reissue: (
    ref: Capability.DescriptorRef,
    oldScope: ReadScope,
    newOwner: Capability.Owner,
  ) => Effect.Effect<DescriptorRecord, Capability.Failure>
  invalidateConnection: (connectionID: Capability.ConnectionID) => Effect.Effect<void>
  clear: () => Effect.Effect<void>
}

/** Metadata only. Callers must authorize disclosure before read, and authorize narrowing before reissue.
 * Identity and cross-scope checks are not grants. canonicalIdentity is a private registration token,
 * never serialized; callers must supply current generations and identity from their authoritative source.
 */
export function make(options: { maxEntries: number; ttlMillis: number; now: () => number }): Effect.Effect<Store> {
  return Effect.sync(() => {
    const maxEntries = options.maxEntries
    const ttlMillis = options.ttlMillis
    const now = options.now
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0 || !Number.isFinite(ttlMillis) || ttlMillis <= 0)
      throw new RangeError("Descriptor bounds must be positive; maxEntries must be a safe integer")
    const records = new Map<Capability.DescriptorID, DescriptorRecord>()
    const check = (ref: Capability.DescriptorRef, scope: ReadScope) => {
      const record = records.get(ref.id)
      const currentTime = now()
      if (!record || !Number.isFinite(currentTime) || record.expiresAt <= currentTime) return failure("stale_descriptor")
      if (!sameLocation(record.owner, scope.owner) || record.owner.projectID !== scope.owner.projectID ||
        record.owner.sessionID !== scope.owner.sessionID || record.owner.agentID !== scope.owner.agentID)
        return failure("target_denied")
      if (Option.isNone(Schema.decodeUnknownOption(Capability.DescriptorRef)(ref)) ||
        ref.schemaHash !== record.ref.schemaHash || ref.catalogGeneration !== record.ref.catalogGeneration ||
        ref.connectionID !== record.ref.connectionID || ref.targetID !== record.ref.targetID ||
        scope.schemaHash !== record.ref.schemaHash || scope.catalogGeneration !== record.ref.catalogGeneration ||
        scope.connectionGeneration !== record.connectionGeneration || scope.targetGeneration !== record.targetGeneration ||
        scope.canonicalIdentity !== record.canonicalIdentity)
        return failure("stale_descriptor")
      return record
    }
    const issue: Store["issue"] = (input) => Effect.suspend(() => {
      const issuedAt = now()
      Array.from(records.entries()).forEach(([id, record]) => {
        if (record.expiresAt <= issuedAt) records.delete(id)
      })
      if (records.size >= maxEntries) return Effect.fail(failure("quota_exceeded"))
      const ref = Schema.decodeUnknownOption(Capability.DescriptorRef)({
        id: Capability.DescriptorID.create(), schemaHash: input.schemaHash,
        catalogGeneration: input.catalogGeneration, connectionID: input.connectionID, targetID: input.targetID,
      })
      const owner = Schema.decodeUnknownOption(Capability.Owner)(input.owner)
      if (Option.isNone(ref) || Option.isNone(owner) ||
        !Number.isSafeInteger(input.connectionGeneration) || input.connectionGeneration < 0 ||
        !Number.isSafeInteger(input.targetGeneration) || input.targetGeneration < 0 ||
        typeof input.canonicalIdentity !== "object" || input.canonicalIdentity === null ||
        typeof input.canonicalName !== "string" || !input.canonicalName ||
        typeof input.operationID !== "string" || !input.operationID ||
        !Number.isFinite(issuedAt) || !Number.isFinite(issuedAt + ttlMillis))
        return Effect.fail(failure("stale_descriptor"))
      if (Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.inputSchema)) ||
        (input.outputSchema !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.outputSchema))))
        return Effect.fail(failure("unsupported_schema"))
      const record = Object.freeze(Object.defineProperty({
        ref: Object.freeze(ref.value),
        owner: Object.freeze({ ...owner.value, location: Object.freeze({ ...owner.value.location }) }),
        connectionGeneration: input.connectionGeneration,
        targetGeneration: input.targetGeneration,
        canonicalName: input.canonicalName,
        canonicalIdentity: input.canonicalIdentity,
        inputSchema: snapshot(input.inputSchema),
        ...(input.outputSchema === undefined ? {} : { outputSchema: snapshot(input.outputSchema) }),
        operationID: input.operationID,
        issuedAt,
        expiresAt: issuedAt + ttlMillis,
      }, "canonicalIdentity", { enumerable: false }))
      records.set(record.ref.id, record)
      return Effect.succeed(record)
    })
    return {
      issue,
      read: (ref, scope) => Effect.suspend(() => {
        const record = check(ref, scope)
        return record instanceof Capability.Failure ? Effect.fail(record) : Effect.succeed(record)
      }),
      reissue: (ref, oldScope, newOwner) => Effect.suspend(() => {
        const record = check(ref, oldScope)
        if (record instanceof Capability.Failure) return Effect.fail(record)
        if (newOwner.projectID !== record.owner.projectID || !sameLocation(newOwner, record.owner))
          return Effect.fail(failure("target_denied"))
        // Trusted caller supplies the explicitly authorized new Session/actor; no grant is retained.
        return issue({
          ...record.ref, owner: newOwner, connectionGeneration: record.connectionGeneration,
          targetGeneration: record.targetGeneration, canonicalName: record.canonicalName,
          canonicalIdentity: record.canonicalIdentity, inputSchema: record.inputSchema,
          outputSchema: record.outputSchema, operationID: record.operationID,
        })
      }),
      invalidateConnection: (connectionID) => Effect.sync(() => {
        Array.from(records.entries()).forEach(([id, record]) => {
          if (record.ref.connectionID === connectionID) records.delete(id)
        })
      }),
      clear: () => Effect.sync(() => records.clear()),
    }
  })
}

function sameLocation(left: Capability.Owner, right: Capability.Owner) {
  return left.location.directory === right.location.directory && left.location.workspaceID === right.location.workspaceID
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Descriptor unavailable" })
}

function snapshot(value: Schema.Json): Schema.Json {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return Object.freeze(value.map(snapshot))
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)])))
}

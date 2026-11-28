export * as CapabilityDescriptors from "./descriptors"

import { Effect, Option, Schema } from "effect"
import { Capability } from "@orchestra/schema/capability"

// Store callers pass decoded host values; the public codec remains the strict wire boundary.
const OwnerInput = Schema.toType(Capability.Owner)

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
export type IssueInput = Omit<DescriptorRecord, "ref" | "issuedAt" | "expiresAt"> & Omit<Capability.DescriptorRef, "id">
export type ReadScope = Pick<
  DescriptorRecord,
  "owner" | "connectionGeneration" | "targetGeneration" | "canonicalIdentity"
> &
  Pick<Capability.DescriptorRef, "catalogGeneration" | "schemaHash">
export type Store = {
  issue: (input: IssueInput) => Effect.Effect<DescriptorRecord, Capability.Failure>
  issueBatch: (inputs: readonly IssueInput[]) => Effect.Effect<readonly DescriptorRecord[], Capability.Failure>
  remove: (ref: Capability.DescriptorRef) => Effect.Effect<void>
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
      if (!record || !Number.isFinite(currentTime) || record.expiresAt <= currentTime)
        return failure("stale_descriptor")
      if (
        !sameLocation(record.owner, scope.owner) ||
        record.owner.projectID !== scope.owner.projectID ||
        record.owner.sessionID !== scope.owner.sessionID ||
        record.owner.agentID !== scope.owner.agentID
      )
        return failure("target_denied")
      if (
        Option.isNone(Schema.decodeUnknownOption(Capability.DescriptorRef)(ref)) ||
        ref.schemaHash !== record.ref.schemaHash ||
        ref.catalogGeneration !== record.ref.catalogGeneration ||
        ref.connectionID !== record.ref.connectionID ||
        ref.targetID !== record.ref.targetID ||
        scope.schemaHash !== record.ref.schemaHash ||
        scope.catalogGeneration !== record.ref.catalogGeneration ||
        scope.connectionGeneration !== record.connectionGeneration ||
        scope.targetGeneration !== record.targetGeneration ||
        scope.canonicalIdentity !== record.canonicalIdentity
      )
        return failure("stale_descriptor")
      return record
    }
    // Synchronous state transition: no Effect may separate validation from insertion.
    const create = (input: IssueInput, storage = records): DescriptorRecord | Capability.Failure => {
      const issuedAt = now()
      const expiresAt = issuedAt + ttlMillis
      if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return failure("stale_descriptor")
      Array.from(storage.entries()).forEach(([id, record]) => {
        if (record.expiresAt <= issuedAt) storage.delete(id)
      })
      if (storage.size >= maxEntries) return failure("quota_exceeded")
      const ref = Schema.decodeUnknownOption(Capability.DescriptorRef)({
        id: Capability.DescriptorID.create(),
        schemaHash: input.schemaHash,
        catalogGeneration: input.catalogGeneration,
        connectionID: input.connectionID,
        targetID: input.targetID,
      })
      const owner = Schema.decodeUnknownOption(OwnerInput)(input.owner)
      if (
        Option.isNone(ref) ||
        Option.isNone(owner) ||
        [input.connectionGeneration, input.targetGeneration].some((x) => !Number.isSafeInteger(x) || x < 0) ||
        typeof input.canonicalIdentity !== "object" ||
        input.canonicalIdentity === null ||
        typeof input.canonicalName !== "string" ||
        !input.canonicalName ||
        typeof input.operationID !== "string" ||
        !input.operationID
      )
        return failure("stale_descriptor")
      if (
        Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.inputSchema)) ||
        (input.outputSchema !== undefined && Option.isNone(Schema.decodeUnknownOption(Schema.Json)(input.outputSchema)))
      )
        return failure("unsupported_schema")
      const record = {
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
        expiresAt,
      }
      Object.defineProperty(record, "canonicalIdentity", { enumerable: false })
      Object.freeze(record)
      storage.set(record.ref.id, record)
      return record
    }
    return {
      issueBatch: (inputs) => Effect.suspend(() => {
        if (inputs.length > maxEntries) return Effect.fail(failure("quota_exceeded"))
        const staged = new Map(records)
        const issued = inputs.map((input) => create(input, staged))
        const failed = issued.find((record) => record instanceof Capability.Failure)
        if (failed instanceof Capability.Failure) {
          return Effect.fail(failed)
        }
        records.clear()
        staged.forEach((record, id) => records.set(id, record))
        return Effect.succeed(issued.filter((record): record is DescriptorRecord => !(record instanceof Capability.Failure)))
      }),
      remove: (ref) => Effect.sync(() => {
        const record = records.get(ref.id)
        if (record && ref.connectionID === record.ref.connectionID && ref.targetID === record.ref.targetID &&
          ref.catalogGeneration === record.ref.catalogGeneration && ref.schemaHash === record.ref.schemaHash)
          records.delete(ref.id)
      }),
      issue: (input) =>
        Effect.suspend(() => {
          const record = create(input)
          return record instanceof Capability.Failure ? Effect.fail(record) : Effect.succeed(record)
        }),
      read: (ref, scope) =>
        Effect.suspend(() => {
          const record = check(ref, scope)
          return record instanceof Capability.Failure ? Effect.fail(record) : Effect.succeed(record)
        }),
      reissue: (ref, oldScope, newOwner) =>
        Effect.suspend(() => {
          const previous = check(ref, oldScope)
          if (previous instanceof Capability.Failure) return Effect.fail(previous)
          const owner = Schema.decodeUnknownOption(OwnerInput)(newOwner)
          if (
            Option.isNone(owner) ||
            owner.value.projectID !== previous.owner.projectID ||
            !sameLocation(owner.value, previous.owner)
          )
            return Effect.fail(failure("target_denied"))
          // Trusted caller supplies the explicitly authorized new Session/actor; no grant is retained.
          const record = create({
            ...previous,
            ...previous.ref,
            canonicalIdentity: previous.canonicalIdentity,
            owner: owner.value,
          })
          return record instanceof Capability.Failure ? Effect.fail(record) : Effect.succeed(record)
        }),
      invalidateConnection: (connectionID) =>
        Effect.sync(() => {
          Array.from(records.entries()).forEach(([id, record]) => {
            if (record.ref.connectionID === connectionID) records.delete(id)
          })
        }),
      clear: () => Effect.sync(() => records.clear()),
    }
  })
}

function sameLocation(left: Capability.Owner, right: Capability.Owner) {
  return (
    left.location.directory === right.location.directory && left.location.workspaceID === right.location.workspaceID
  )
}

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Descriptor unavailable" })
}

function snapshot(value: Schema.Json): Schema.Json {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return Object.freeze(value.map(snapshot))
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)])))
}

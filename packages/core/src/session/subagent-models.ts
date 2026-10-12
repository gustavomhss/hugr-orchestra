export * as SessionSubagentModels from "./subagent-models"

import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { eq } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import { ModelV2 } from "../model"
import { SessionEvent } from "./event"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

export const Policy = SessionSubagentModels.Policy
export type Policy = typeof Policy.Type
export const inherit = SessionSubagentModels.inherit
/** Restrictive outgoing policies, nearest ancestor first. An empty list is unconstrained. */
export type Ceilings = readonly Policy[]

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("SessionSubagentModels.NotFoundError", {
  sessionID: SessionSchema.ID,
}) {}

export class InvalidChainError extends Schema.TaggedErrorClass<InvalidChainError>()(
  "SessionSubagentModels.InvalidChainError",
  {
    sessionID: SessionSchema.ID,
    ancestorID: SessionSchema.ID,
    reason: Schema.Literals(["missing-parent", "cycle"]),
  },
) {}

export class StorageError extends Schema.TaggedErrorClass<StorageError>()("SessionSubagentModels.StorageError", {
  sessionID: SessionSchema.ID,
  message: Schema.String,
}) {}

export class ModelDeniedError extends Schema.TaggedErrorClass<ModelDeniedError>()(
  "SessionSubagentModels.ModelDeniedError",
  {
    sessionID: SessionSchema.ID,
    model: ModelV2.Ref.pipe(Schema.optional),
    reason: Schema.Literals(["not-allowed", "unknown-identity"]),
  },
) {
  override get message() {
    return this.model
      ? `Subagent model denied for session ${this.sessionID}: ${this.model.providerID}/${this.model.id}`
      : `Subagent model identity is unknown for session ${this.sessionID}`
  }
}

export type Error = NotFoundError | InvalidChainError | StorageError | ModelDeniedError

export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<Policy, Error>
  readonly set: (sessionID: SessionSchema.ID, policy: Policy) => Effect.Effect<Policy, Error>
  readonly forSession: (sessionID: SessionSchema.ID) => Effect.Effect<Ceilings, Error>
  readonly forChild: (parentID: SessionSchema.ID) => Effect.Effect<Ceilings, Error>
  /** Unknown embedding identities are permitted only when there are no ancestor ceilings. */
  readonly assert: (sessionID: SessionSchema.ID, ref: ModelV2.Ref | undefined) => Effect.Effect<void, Error>
  readonly assertChild: (parentID: SessionSchema.ID, ref: ModelV2.Ref | undefined) => Effect.Effect<void, Error>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/SessionSubagentModels") {}

export const normalize = (policy: Policy): Policy =>
  policy.mode === "inherit"
    ? inherit
    : {
        mode: "allowlist",
        models: [...new Map(policy.models.map((ref) => [JSON.stringify([ref.providerID, ref.id]), {
          providerID: ref.providerID, id: ref.id,
        }])).values()],
      }

export const permits = (ceilings: Ceilings, ref: ModelV2.Ref | undefined) =>
  ceilings.every((policy) => policy.mode === "inherit" || (ref !== undefined && policy.models.some(
    (allowed) => allowed.providerID === ref.providerID && allowed.id === ref.id,
  )))

const storedPolicy = Schema.fromJsonString(Policy)

/** SQL NULL alone means inherited; JSON null and every malformed value fail closed. */
export function fromStorage(sessionID: SessionSchema.ID, value: string | null) {
  if (value === null) return undefined
  const decoded = Schema.decodeUnknownOption(storedPolicy)(value)
  if (decoded._tag === "None") throw new StorageError({ sessionID, message: "Invalid stored subagent model policy" })
  return normalize(decoded.value)
}

const storageError = (sessionID: SessionSchema.ID, cause: unknown) =>
  cause instanceof NotFoundError || cause instanceof InvalidChainError || cause instanceof StorageError
    ? cause
    : new StorageError({ sessionID, message: cause instanceof Error ? cause.message : String(cause) })

const layer = Layer.effect(Service, Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const db = database.db

  // Global registration is shared by every Location and the durable replay path.
  yield* events.project(SessionEvent.SubagentModelsChanged, (event) => Effect.gen(function* () {
    const updated = yield* db.update(SessionTable).set({
      subagent_models: event.data.policy.mode === "inherit" ? null : Schema.encodeSync(storedPolicy)(normalize(event.data.policy)),
      time_updated: DateTime.toEpochMillis(event.data.timestamp),
    }).where(eq(SessionTable.id, event.data.sessionID)).returning({ id: SessionTable.id }).get().pipe(Effect.orDie)
    if (!updated) return yield* Effect.die(new NotFoundError({ sessionID: event.data.sessionID }))
  }))

  const get = Effect.fn("SessionSubagentModels.get")(function* (sessionID: SessionSchema.ID) {
    const row = yield* db.select({ policy: SessionTable.subagent_models }).from(SessionTable)
      .where(eq(SessionTable.id, sessionID)).get().pipe(Effect.mapError((cause) => storageError(sessionID, cause)))
    if (!row) return yield* new NotFoundError({ sessionID })
    return fromStorage(sessionID, row.policy) ?? inherit
  }, (effect, sessionID) => effect.pipe(Effect.catchDefect((cause) => Effect.fail(storageError(sessionID, cause)))))

  const ceilings = Effect.fn("SessionSubagentModels.ceilings")(function* (sessionID: SessionSchema.ID, includeOwn: boolean) {
    // One read transaction holds a consistent snapshot for the entire parent chain.
    return yield* db.transaction((tx) => Effect.gen(function* () {
      const result: Policy[] = []
      const seen = new Set<SessionSchema.ID>()
      let current: SessionSchema.ID | null = sessionID
      while (current !== null) {
        if (seen.has(current)) return yield* new InvalidChainError({ sessionID, ancestorID: current, reason: "cycle" })
        seen.add(current)
        const row: { id: SessionSchema.ID; parent: SessionSchema.ID | null; policy: string | null } | undefined = yield* tx.select({ id: SessionTable.id, parent: SessionTable.parent_id, policy: SessionTable.subagent_models })
          .from(SessionTable).where(eq(SessionTable.id, current)).get()
        if (!row) return yield* current === sessionID
          ? new NotFoundError({ sessionID })
          : new InvalidChainError({ sessionID, ancestorID: current, reason: "missing-parent" })
        if (includeOwn || current !== sessionID) {
          const policy = fromStorage(current, row.policy)
          if (policy?.mode === "allowlist") result.push(policy)
        }
        current = row.parent
      }
      return result
    })).pipe(Effect.mapError((cause) => storageError(sessionID, cause)))
  }, (effect, sessionID) => effect.pipe(Effect.catchDefect((cause) => Effect.fail(storageError(sessionID, cause)))))

  const set = Effect.fn("SessionSubagentModels.set")(function* (sessionID: SessionSchema.ID, policy: Policy) {
    const normalized = normalize(yield* Schema.decodeUnknownEffect(Policy)(policy).pipe(
      Effect.mapError((cause) => storageError(sessionID, cause)),
    ))
    return yield* db.transaction(() => Effect.gen(function* () {
      const row = yield* db.select({ id: SessionTable.id }).from(SessionTable).where(eq(SessionTable.id, sessionID)).get()
      if (!row) return yield* new NotFoundError({ sessionID })
      yield* events.publish(SessionEvent.SubagentModelsChanged, { sessionID, timestamp: yield* DateTime.now, policy: normalized })
      return normalized
    }), { behavior: "immediate" }).pipe(Effect.mapError((cause) => storageError(sessionID, cause)))
  }, (effect, sessionID) => effect.pipe(Effect.catchDefect((cause) => Effect.fail(storageError(sessionID, cause)))))

  const assert = Effect.fn("SessionSubagentModels.assert")(function* (sessionID: SessionSchema.ID, ref: ModelV2.Ref | undefined, includeOwn: boolean) {
    if (permits(yield* ceilings(sessionID, includeOwn), ref)) return
    return yield* new ModelDeniedError({ sessionID, model: ref, reason: ref ? "not-allowed" : "unknown-identity" })
  })
  return Service.of({ get, set, forSession: (id) => ceilings(id, false), forChild: (id) => ceilings(id, true),
    assert: (id, ref) => assert(id, ref, false), assertChild: (id, ref) => assert(id, ref, true) })
}))

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, EventV2.node] })

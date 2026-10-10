export * as ProjectCheckpoint from "./checkpoint"

import { createHash } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { SessionSchema } from "../session/schema"
import { SessionTable } from "../session/sql"
import { ProjectCheckpointTable } from "./checkpoint.sql"
import { ProjectSchema } from "./schema"

export interface Metadata {
  readonly id: string
  readonly projectID: ProjectSchema.ID
  readonly sessionID: SessionSchema.ID
  readonly forkID: string
  readonly boundary: string
  readonly attempt: 0 | 1
  readonly directory: string
  readonly createdAt: number
  readonly digest: string
}

export interface SaveInput {
  readonly sessionID: SessionSchema.ID
  readonly forkID: string
  readonly boundary: string
  readonly attempt: 0 | 1
  readonly payload: string
}

export interface ReadInput {
  readonly projectID: ProjectSchema.ID
  readonly id: string
}

export interface ListInput {
  readonly projectID: ProjectSchema.ID
  readonly directory?: string
  readonly offset?: number
  readonly limit?: number
}

export class CheckpointError extends Schema.TaggedErrorClass<CheckpointError>()("ProjectCheckpoint.CheckpointError", {
  reason: Schema.Literals(["invalid_input", "missing_session", "conflict", "corrupt", "storage"]),
}) {
  override get message() {
    return `Project checkpoint failed: ${this.reason}`
  }
}

export interface Interface {
  readonly save: (input: SaveInput) => Effect.Effect<Metadata, CheckpointError>
  readonly read: (
    input: ReadInput,
  ) => Effect.Effect<(Metadata & { readonly payload: string }) | undefined, CheckpointError>
  readonly list: (input: ListInput) => Effect.Effect<{ items: Metadata[]; nextOffset?: number }, CheckpointError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/core/ProjectCheckpoint") {}

const metadata = {
  id: ProjectCheckpointTable.id,
  projectID: ProjectCheckpointTable.project_id,
  sessionID: ProjectCheckpointTable.session_id,
  forkID: ProjectCheckpointTable.fork_id,
  boundary: ProjectCheckpointTable.boundary,
  attempt: ProjectCheckpointTable.attempt,
  directory: ProjectCheckpointTable.directory,
  createdAt: ProjectCheckpointTable.time_created,
  digest: ProjectCheckpointTable.digest,
}

const decodePayload = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const digest = (payload: string) => createHash("sha256").update(payload, "utf8").digest("hex")

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service

    return Service.of({
      save: Effect.fn("ProjectCheckpoint.save")(function* (input) {
        const value = { ...input }
        if (
          (value.attempt !== 0 && value.attempt !== 1) ||
          typeof value.forkID !== "string" ||
          !value.forkID.trim() ||
          typeof value.boundary !== "string" ||
          !value.boundary.trim() ||
          typeof value.payload !== "string" ||
          !value.payload.trim() ||
          Buffer.from(value.payload, "utf8").toString("utf8") !== value.payload ||
          Option.isNone(decodePayload(value.payload))
        )
          return yield* new CheckpointError({ reason: "invalid_input" })

        const id = `${value.forkID}:${value.attempt}`
        const hash = digest(value.payload)
        return yield* database.db.transaction(
          (tx) =>
            Effect.gen(function* () {
              const session = yield* tx
                .select({ projectID: SessionTable.project_id, directory: SessionTable.directory })
                .from(SessionTable)
                .where(eq(SessionTable.id, value.sessionID))
                .get()
              if (!session) return yield* new CheckpointError({ reason: "missing_session" })

              const existing = yield* tx
                .select({ ...metadata, payload: ProjectCheckpointTable.payload })
                .from(ProjectCheckpointTable)
                .where(eq(ProjectCheckpointTable.id, id))
                .get()
              if (existing) {
                if (
                  existing.sessionID !== value.sessionID ||
                  existing.forkID !== value.forkID ||
                  existing.boundary !== value.boundary ||
                  existing.attempt !== value.attempt ||
                  existing.payload !== value.payload ||
                  existing.projectID !== session.projectID ||
                  existing.directory !== session.directory
                )
                  return yield* new CheckpointError({ reason: "conflict" })
                if (existing.digest !== hash) return yield* new CheckpointError({ reason: "corrupt" })
                const { payload, ...result } = existing
                return result
              }

              const createdAt = yield* Clock.currentTimeMillis
              yield* tx
                .insert(ProjectCheckpointTable)
                .values({
                  id,
                  project_id: session.projectID,
                  session_id: value.sessionID,
                  fork_id: value.forkID,
                  boundary: value.boundary,
                  attempt: value.attempt,
                  directory: session.directory,
                  time_created: createdAt,
                  digest: hash,
                  payload: value.payload,
                })
                .run()
              return {
                id,
                projectID: session.projectID,
                sessionID: value.sessionID,
                forkID: value.forkID,
                boundary: value.boundary,
                attempt: value.attempt,
                directory: session.directory,
                createdAt,
                digest: hash,
              }
            }),
          { behavior: "immediate" },
        )
      }, storageBoundary),
      read: Effect.fn("ProjectCheckpoint.read")(function* (input) {
        const row = yield* database.db
          .select({ ...metadata, payload: ProjectCheckpointTable.payload })
          .from(ProjectCheckpointTable)
          .where(and(eq(ProjectCheckpointTable.project_id, input.projectID), eq(ProjectCheckpointTable.id, input.id)))
          .get()
        if (!row) return undefined
        if (digest(row.payload) !== row.digest) return yield* new CheckpointError({ reason: "corrupt" })
        return row
      }, storageBoundary),
      list: Effect.fn("ProjectCheckpoint.list")(function* (input) {
        const offset = input.offset === undefined ? 0 : input.offset
        const limit = input.limit === undefined ? 20 : input.limit
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > Number.MAX_SAFE_INTEGER - 50 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50
        )
          return yield* new CheckpointError({ reason: "invalid_input" })
        const items = yield* database.db
          .select(metadata)
          .from(ProjectCheckpointTable)
          .where(
            and(
              eq(ProjectCheckpointTable.project_id, input.projectID),
              input.directory === undefined ? undefined : eq(ProjectCheckpointTable.directory, input.directory),
            ),
          )
          .orderBy(desc(ProjectCheckpointTable.time_created), desc(ProjectCheckpointTable.id))
          .offset(offset)
          .limit(limit + 1)
          .all()
        return items.length > limit ? { items: items.slice(0, limit), nextOffset: offset + limit } : { items }
      }, storageBoundary),
    })
  }),
)

// Drivers can fail during SQL preparation as well as execution. Neither path may expose bound context.
function storageBoundary<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError((error) => (error instanceof CheckpointError ? error : new CheckpointError({ reason: "storage" }))),
    Effect.catchDefect(() => Effect.fail(new CheckpointError({ reason: "storage" }))),
  )
}

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

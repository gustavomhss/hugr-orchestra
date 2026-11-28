import { Effect, Schema } from "effect"
import type { ID, Definition, Payload } from "@orchestra/schema/event"
import { Durable } from "@orchestra/schema/durable-event-manifest"
import { and, asc, eq, gt, inArray } from "drizzle-orm"
import type { Database } from "../database/database"
import { EventSequenceTable, EventTable } from "./sql"

export const latestSequence = Effect.fn("EventV2.latestSequence")(function* (
  db: Database.Interface["db"],
  aggregateID: string,
) {
  const row = yield* db
    .select({ seq: EventSequenceTable.seq })
    .from(EventSequenceTable)
    .where(eq(EventSequenceTable.aggregate_id, aggregateID))
    .get()
    .pipe(Effect.orDie)
  return row?.seq ?? -1
})

export type SerializedEvent = {
  readonly id: ID
  readonly type: string
  readonly seq: number
  readonly aggregateID: string
  readonly data: Record<string, unknown>
}

export class InvalidDurableEventError extends Schema.TaggedErrorClass<InvalidDurableEventError>()(
  "EventV2.InvalidDurableEvent",
  {
    type: Schema.String,
    message: Schema.String,
  },
) {}

export const decodeSerializedEvent = (event: SerializedEvent): Effect.Effect<Payload, InvalidDurableEventError> =>
  Effect.gen(function* () {
    const definition = Durable.get(event.type)
    if (!definition?.durable)
      return yield* Effect.fail(new InvalidDurableEventError({ type: event.type, message: `Unknown durable event type ${event.type}` }))
    const data = yield* Schema.decodeUnknownEffect(definition.data)(event.data).pipe(
      Effect.mapError(() => new InvalidDurableEventError({ type: event.type, message: "Stored durable event data is invalid" })),
    )
    return {
      id: event.id,
      type: definition.type,
      durable: { aggregateID: event.aggregateID, seq: event.seq, version: definition.durable.version },
      data,
    }
  })

export const readAggregate = Effect.fn("EventV2.readAggregate")(function* <A>(
  db: Database.Interface["db"],
  input: {
    readonly aggregateID: string
    readonly after?: number
    readonly limit: number
    readonly manifest: {
      readonly definitions: ReadonlyMap<string, Definition>
      readonly schema: Schema.Decoder<A, never>
    }
  },
) {
  const after = input.after ?? -1
  const rows = yield* db
    .select()
    .from(EventTable)
    .where(
      and(
        eq(EventTable.aggregate_id, input.aggregateID),
        gt(EventTable.seq, after),
        inArray(EventTable.type, Array.from(input.manifest.definitions.keys())),
      ),
    )
    .orderBy(asc(EventTable.seq))
    .limit(input.limit + 1)
    .all()
    .pipe(Effect.orDie)
  const page = rows.slice(0, input.limit)
  const decode = Schema.decodeUnknownSync(input.manifest.schema)
  const events = page.map((event) =>
    decode({
      id: event.id,
      type: input.manifest.definitions.get(event.type)?.type ?? event.type,
      durable: {
        aggregateID: event.aggregate_id,
        seq: event.seq,
        version: input.manifest.definitions.get(event.type)?.durable?.version,
      },
      data: event.data,
    }),
  )
  return {
    events,
    hasMore: rows.length > input.limit,
  }
})

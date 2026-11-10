import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Cause, Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "../../src/database/database"
import { EventV2 } from "../../src/event"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { ReviewPrecisionStore } from "../../src/review/precision-store"
import { ReviewPrecisionEvent } from "@orchestra/schema/review-precision-event"
import { DurableEventManifest } from "@orchestra/schema/durable-event-manifest"
import { testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node]), [
  [Database.node, Database.layerFromPath(":memory:")],
]))
const read = {
  pack: "squawk", rule: "adding-required-field", generation: "a".repeat(64),
  fingerprint: "source-a", outcome: "confirmed" as const,
}

it.effect("precision admission is globally ordered across projects and reads actual durable rows", () =>
  Effect.gen(function* () {
    const first = yield* ReviewPrecisionStore.append({ review: "session-a/finish", project: "project-a", reads: [read] })
    const second = yield* ReviewPrecisionStore.append({ review: "session-b/finish", project: "project-b", reads: [] })
    expect(first.order).toBe(1)
    expect(second.order).toBe(2)
    expect(first.id).not.toBe(second.id)
    expect(yield* ReviewPrecisionStore.history()).toEqual([first, second])
    const database = yield* Database.Service
    const rows = yield* database.db.select().from(EventV2.EventTable)
      .where(eq(EventV2.EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate)).all().pipe(Effect.orDie)
    expect(rows.map((row) => `${row.seq}:${row.id}`).toSorted()).toEqual([`0:${first.id}`, `1:${second.id}`])
    expect(DurableEventManifest.Durable.get("review.precision.observed.1")).toBe(ReviewPrecisionEvent.Observed)
  }),
)

it.effect("equivalent retries canonicalize item order and deduplicate shared lens deliveries", () =>
  Effect.gen(function* () {
    const other = { ...read, fingerprint: "source-b", outcome: "not-pursued" as const }
    const first = yield* ReviewPrecisionStore.append({ review: "same-review", project: "project-a", reads: [other, read, read] })
    const retry = yield* ReviewPrecisionStore.append({ review: "same-review", project: "project-a", reads: [read, other] })
    expect(retry).toEqual(first)
    expect(first.reads).toEqual([read, other])
    expect(yield* ReviewPrecisionStore.history()).toEqual([first])
  }),
)

it.effect("concurrent exact retries have one immutable admission and do not consume more sequence positions", () =>
  Effect.gen(function* () {
    const input = { review: "concurrent-review", project: "project-a", reads: [read] }
    const results = yield* Effect.forEach([0, 1, 2, 3], () => ReviewPrecisionStore.append(input), { concurrency: 4 })
    expect(results).toEqual([results[0], results[0], results[0], results[0]])
    expect(yield* ReviewPrecisionStore.history()).toEqual([results[0]])
    const next = yield* ReviewPrecisionStore.append({ ...input, review: "next-review" })
    expect(next.order).toBe(2)
  }),
)

it.effect("a changed outcome or project cannot replace the first admitted review", () =>
  Effect.gen(function* () {
    const input = { review: "immutable-review", project: "project-a", reads: [read] }
    const first = yield* ReviewPrecisionStore.append(input)
    expect(Exit.isFailure(yield* Effect.exit(ReviewPrecisionStore.append({
      ...input, reads: [{ ...read, outcome: "refuted" }],
    })))).toBe(true)
    expect(Exit.isFailure(yield* Effect.exit(ReviewPrecisionStore.append({ ...input, project: "project-b" })))).toBe(true)
    expect(yield* ReviewPrecisionStore.history()).toEqual([first])
  }),
)

it.effect("conflicting same-item outcomes fail before any durable admission", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(ReviewPrecisionStore.append({
      review: "conflicting-read", project: "project-a", reads: [read, { ...read, outcome: "refuted" }],
    }))
    expect(Exit.isFailure(result)).toBe(true)
    expect(yield* ReviewPrecisionStore.history()).toEqual([])
    const positive = yield* ReviewPrecisionStore.append({ review: "valid-review", project: "project-a", reads: [read] })
    expect(positive.order).toBe(1)
    expect(yield* ReviewPrecisionStore.history()).toEqual([positive])
  }),
)

it.effect("the precision event replays through the registered durable manifest without receipt inference", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const id = EventV2.ID.make(`evt_review_precision_${createHash("sha256").update("replayed-review").digest("hex")}`)
    yield* events.replay({
      id, type: "review.precision.observed.1", aggregateID: ReviewPrecisionEvent.Aggregate, seq: 0,
      data: { ledgerID: ReviewPrecisionEvent.Aggregate, review: "replayed-review", project: "project-a", reads: [read] },
    })
    expect(yield* ReviewPrecisionStore.history()).toEqual([{ id, project: "project-a", order: 1, reads: [read] }])
    expect(yield* ReviewPrecisionStore.append({ review: "replayed-review", project: "project-a", reads: [read] }))
      .toEqual({ id, project: "project-a", order: 1, reads: [read] })
  }),
)

it.effect("a noncanonical replay id cannot be counted or admitted again as a new clean batch", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    yield* events.replay({
      id: EventV2.ID.make("evt_noncanonical_precision"), type: "review.precision.observed.1",
      aggregateID: ReviewPrecisionEvent.Aggregate, seq: 0,
      data: { ledgerID: ReviewPrecisionEvent.Aggregate, review: "same-replayed-review", project: "project-a", reads: [read] },
    })
    expect(Exit.isFailure(yield* Effect.exit(ReviewPrecisionStore.history()))).toBe(true)
    expect(Exit.isFailure(yield* Effect.exit(ReviewPrecisionStore.append({
      review: "same-replayed-review", project: "project-a", reads: [read],
    })))).toBe(true)
    const database = yield* Database.Service
    const rows = yield* database.db.select().from(EventV2.EventTable)
      .where(eq(EventV2.EventTable.aggregate_id, ReviewPrecisionEvent.Aggregate)).all().pipe(Effect.orDie)
    expect(rows).toHaveLength(1)
  }),
)

it.effect("an unexpected event type in the private aggregate is not silently removed from history", () =>
  Effect.gen(function* () {
    const first = yield* ReviewPrecisionStore.append({ review: "valid-review", project: "project-a", reads: [read] })
    expect(yield* ReviewPrecisionStore.history()).toEqual([first])
    const database = yield* Database.Service
    yield* database.db.update(EventV2.EventTable).set({ type: "review.unexpected.1" })
      .where(eq(EventV2.EventTable.id, EventV2.ID.make(first.id))).run().pipe(Effect.orDie)
    expect(Exit.isFailure(yield* Effect.exit(ReviewPrecisionStore.history()))).toBe(true)
  }),
)

it.effect("a publication failure after a real commit is not converted to a successful retry", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const failure = new Error("precision-notification-failed")
    const input = { review: "notification-review", project: "project-a", reads: [read] }
    const result = yield* Effect.exit(ReviewPrecisionStore.append(input).pipe(Effect.provideService(EventV2.Service, {
      ...events,
      publish: (definition, data, options) => events.publish(definition, data, options).pipe(Effect.andThen(Effect.die(failure))),
    })))
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBe(failure)
    const history = yield* ReviewPrecisionStore.history()
    expect(history).toHaveLength(1)
    expect(yield* ReviewPrecisionStore.append(input)).toEqual(history[0])
  }),
)

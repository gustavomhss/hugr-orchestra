import { describe, expect } from "bun:test"
import { Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventSequenceTable } from "@orchestra/core/event/sql"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { eq } from "drizzle-orm"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(
    location({ directory: AbsolutePath.make("project"), workspaceID: WorkspaceV2.ID.make("wrk_test") }),
  ),
)
const OrderedMessage = EventV2.define({
  type: "test.ordered",
  durable: {
    version: 1,
    aggregate: "id",
  },
  schema: {
    id: Schema.String,
    text: Schema.String,
  },
})

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, Location.node]), [[Location.node, locationLayer]]),
)

const waitFor = (ready: Effect.Effect<boolean>) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (yield* ready) return
      yield* Effect.sleep("5 millis")
    }
    throw new Error("Timed out waiting for condition")
  })

// Listeners and the `all` stream must see one aggregate's events in commit (seq) order, however publishers interleave.
describe("EventV2 notify order equals commit order", () => {
  it.live("delivers a later commit after an earlier one is still being delivered", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const gate = yield* Deferred.make<void>()
      const parked = yield* Deferred.make<void>()
      const seen = new Array<number>()
      const streamed = new Array<number>()
      const stream = yield* events.all().pipe(
        Stream.filter((event) => event.type === OrderedMessage.type),
        Stream.runForEach((event) => Effect.sync(() => streamed.push(event.durable?.seq ?? -1))),
        Effect.forkScoped,
      )
      yield* Effect.sleep("10 millis")
      // Parks the first event's delivery after it committed, so the second commit lands mid-delivery.
      yield* events.listen((event) =>
        event.type === OrderedMessage.type && (event.data as { text: string }).text === "first"
          ? Deferred.succeed(parked, undefined).pipe(Effect.andThen(Deferred.await(gate)))
          : Effect.void,
      )
      yield* events.listen((event) =>
        event.type === OrderedMessage.type ? Effect.sync(() => seen.push(event.durable?.seq ?? -1)) : Effect.void,
      )

      const first = yield* events.publish(OrderedMessage, { id: aggregateID, text: "first" }).pipe(Effect.forkScoped)
      yield* Deferred.await(parked)
      const second = yield* events.publish(OrderedMessage, { id: aggregateID, text: "second" }).pipe(Effect.forkScoped)
      yield* waitFor(
        db
          .select({ seq: EventSequenceTable.seq })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, aggregateID))
          .get()
          .pipe(
            Effect.orDie,
            Effect.map((row) => row?.seq === 1),
          ),
      )
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(second)
      yield* waitFor(Effect.sync(() => streamed.length === 2))

      expect(seen).toEqual([0, 1])
      expect(streamed).toEqual([0, 1])
      yield* Fiber.interrupt(stream)
    }),
  )

  it.live("keeps seq order under concurrent publishers of one aggregate", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const aggregateID = EventV2.ID.create()
      const total = 60
      const seen = new Array<number>()
      // A suspending listener widens the window between commit and the next publisher's notify.
      yield* events.listen((event) =>
        event.type === OrderedMessage.type
          ? Effect.yieldNow.pipe(Effect.andThen(Effect.sync(() => seen.push(event.durable?.seq ?? -1))))
          : Effect.void,
      )

      yield* Effect.forEach(
        Array.from({ length: total }, (_, index) => index),
        (index) => events.publish(OrderedMessage, { id: aggregateID, text: `m${index}` }),
        { concurrency: "unbounded", discard: true },
      )

      expect(seen).toEqual(Array.from({ length: total }, (_, index) => index))
    }),
  )

  it.live("does not hold other aggregates behind a slow delivery", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const slow = EventV2.ID.create()
      const other = EventV2.ID.create()
      const gate = yield* Deferred.make<void>()
      const parked = yield* Deferred.make<void>()
      yield* events.listen((event) =>
        event.type === OrderedMessage.type && (event.data as { id: string }).id === slow
          ? Deferred.succeed(parked, undefined).pipe(Effect.andThen(Deferred.await(gate)))
          : Effect.void,
      )

      const blocked = yield* events.publish(OrderedMessage, { id: slow, text: "slow" }).pipe(Effect.forkScoped)
      yield* Deferred.await(parked)
      const free = yield* events.publish(OrderedMessage, { id: other, text: "free" })
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(blocked)

      expect(free.durable?.seq).toBe(0)
    }),
  )

  it.live("lets a listener publish to the aggregate it is being notified about", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const aggregateID = EventV2.ID.create()
      const seen = new Array<number>()
      yield* events.listen((event) =>
        event.type !== OrderedMessage.type
          ? Effect.void
          : Effect.sync(() => seen.push(event.durable?.seq ?? -1)).pipe(
              Effect.andThen(
                (event.data as { text: string }).text === "outer"
                  ? events.publish(OrderedMessage, { id: aggregateID, text: "inner" }).pipe(Effect.asVoid)
                  : Effect.void,
              ),
            ),
      )

      yield* events.publish(OrderedMessage, { id: aggregateID, text: "outer" })
      // A later publisher must not be left waiting on the nested publish.
      const later = yield* events.publish(OrderedMessage, { id: aggregateID, text: "later" })

      expect(later.durable?.seq).toBe(2)
      expect(seen).toEqual([0, 1, 2])
    }),
  )
})

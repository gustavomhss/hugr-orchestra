import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { EventOrder } from "../src/event/order"
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
  for (const thirdBeforeRelease of [false, true]) {
    it.live(
      thirdBeforeRelease
        ? "retains the released middle ticket until its predecessor completes"
        : "retains the released tail ticket until its predecessor completes",
      () =>
        Effect.gen(function* () {
          const order = EventOrder.make(yield* Scope.Scope)
          const first = yield* order.take("aggregate")
          const second = yield* order.take("aggregate")
          if (!first || !second) throw new Error("Expected ordered tickets")
          const thirdEarly = thirdBeforeRelease ? yield* order.take("aggregate") : undefined
          if (thirdBeforeRelease && !thirdEarly) throw new Error("Expected third ordered ticket")
          yield* order.release(second)
          expect(yield* Deferred.isDone(first.done)).toBe(false)
          expect(yield* Deferred.isDone(second.done)).toBe(false)
          const third = thirdEarly ?? (yield* order.take("aggregate"))
          if (!third) throw new Error("Expected third ordered ticket")
          expect(third.prev).toBe(second.done)
          yield* order.release(first)
          expect(yield* Deferred.isDone(first.done)).toBe(true)
          expect(yield* Deferred.isDone(second.done)).toBe(true)
          expect(yield* Deferred.isDone(third.done)).toBe(false)
          yield* order.release(third)
          expect(yield* Deferred.isDone(third.done)).toBe(true)
          yield* order.release(first)
          yield* order.release(second)
          yield* order.release(third)
          const fourth = yield* order.take("aggregate")
          if (!fourth) throw new Error("Expected fourth ordered ticket")
          expect(fourth.prev).toBeUndefined()
          yield* order.release(fourth)
        }),
    )
  }

  for (const thirdBeforeCancel of [false, true]) {
    it.live(
      thirdBeforeCancel
        ? "keeps a queued third delivery behind the first when the second is canceled"
        : "keeps a later third delivery behind the first when the second is canceled as tail",
      () =>
        Effect.gen(function* () {
          const events = yield* EventV2.Service
          const { db } = yield* Database.Service
          const aggregateID = EventV2.ID.create()
          const gate = yield* Deferred.make<void>()
          const parked = yield* Deferred.make<void>()
          const thirdSeen = yield* Deferred.make<void>()
          const seen = new Array<number>()
          yield* Effect.gen(function* () {
            yield* events.listen((event) =>
              event.type === OrderedMessage.type && (event.data as { id: string; text: string }).id === aggregateID &&
              (event.data as { text: string }).text === "first"
                ? Deferred.succeed(parked, undefined).pipe(Effect.andThen(Deferred.await(gate)))
                : Effect.void,
            )
            yield* events.listen((event) => {
              if (event.type !== OrderedMessage.type || (event.data as { id: string }).id !== aggregateID) return Effect.void
              return Effect.gen(function* () {
                if ((event.data as { text: string }).text === "third") {
                  expect(yield* Deferred.isDone(gate)).toBe(true)
                  yield* Deferred.succeed(thirdSeen, undefined)
                }
                seen.push(event.durable?.seq ?? -1)
              })
            })
            const first = yield* events.publish(OrderedMessage, { id: aggregateID, text: "first" }).pipe(Effect.forkScoped)
            yield* Deferred.await(parked)
            const second = yield* events.publish(OrderedMessage, { id: aggregateID, text: "second" }).pipe(Effect.forkScoped)
            const committed = (seq: number) =>
              db.select({ seq: EventSequenceTable.seq }).from(EventSequenceTable)
                .where(eq(EventSequenceTable.aggregate_id, aggregateID)).get()
                .pipe(Effect.orDie, Effect.map((row) => row?.seq === seq))
            yield* waitFor(committed(1))
            const thirdEarly = thirdBeforeCancel
              ? yield* events.publish(OrderedMessage, { id: aggregateID, text: "third" }).pipe(Effect.forkScoped)
              : undefined
            if (thirdEarly) yield* waitFor(committed(2))
            yield* Fiber.interrupt(second).pipe(Effect.timeout("2 seconds"))
            const interrupted = yield* Fiber.await(second)
            expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
            expect(yield* Deferred.isDone(gate)).toBe(false)
            const third = thirdEarly ?? (yield* events.publish(OrderedMessage, { id: aggregateID, text: "third" }).pipe(Effect.forkScoped))
            if (!thirdEarly) yield* waitFor(committed(2))
            yield* Effect.yieldNow
            expect(Option.isNone(yield* Deferred.poll(thirdSeen))).toBe(true)
            expect(seen).toEqual([])
            const rows = yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).all()
            expect(rows.map((row) => row.seq).sort((a, b) => a - b)).toEqual([0, 1, 2])
            yield* Deferred.succeed(gate, undefined)
            yield* Fiber.join(first)
            yield* Fiber.join(third)
            expect(seen).toEqual([0, 2])
          }).pipe(Effect.ensuring(Deferred.succeed(gate, undefined)))
        }),
    )
  }

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
      const { db } = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const probeID = EventV2.ID.create()
      const l1 = new Array<number>()
      const l2 = new Array<number>()
      const streamed = new Array<number>()
      const innerReturned = yield* Deferred.make<number>()
      const releaseOuter = yield* Deferred.make<void>()
      const streamReady = yield* Deferred.make<void>()

      // The stream records only our aggregate; a probe published on another aggregate confirms the all() pipeline is live.
      const stream = yield* events.all().pipe(
        Stream.filter((event) => event.type === OrderedMessage.type),
        Stream.runForEach((event) => {
          const id = (event.data as { id: string }).id
          return id === aggregateID
            ? Effect.sync(() => streamed.push(event.durable?.seq ?? -1))
            : id === probeID
              ? Deferred.succeed(streamReady, undefined)
              : Effect.void
        }),
        Effect.forkScoped,
      )
      // The probe confirms the all() stream pipeline is consuming before the real sequence begins. The
      // subscription is async, so publish interleaved with a yield instead of relying on a fixed delay.
      for (let attempt = 0; ; attempt++) {
        yield* events.publish(OrderedMessage, { id: probeID, text: "probe" })
        const ready = yield* Deferred.isDone(streamReady)
        yield* Effect.yieldNow
        if (ready) break
        if (attempt >= 99) throw new Error("the all() stream never subscribed")
      }

      yield* events.listen((event) => {
        if (event.type !== OrderedMessage.type || (event.data as { id: string }).id !== aggregateID) return Effect.void
        const text = (event.data as { text: string }).text
        return Effect.sync(() => l1.push(event.durable?.seq ?? -1)).pipe(
          Effect.andThen(
            text === "outer"
              ? events.publish(OrderedMessage, { id: aggregateID, text: "inner" }).pipe(
                  Effect.tap((payload) => Deferred.succeed(innerReturned, payload.durable?.seq ?? -1)),
                  Effect.andThen(Deferred.await(releaseOuter)),
                )
              : Effect.void,
          ),
        )
      })
      yield* events.listen((event) =>
        event.type === OrderedMessage.type && (event.data as { id: string }).id === aggregateID
          ? Effect.sync(() => l2.push(event.durable?.seq ?? -1))
          : Effect.void,
      )

      try {
        const outer = yield* events.publish(OrderedMessage, { id: aggregateID, text: "outer" }).pipe(Effect.forkScoped)
        const returned = yield* Deferred.await(innerReturned)
        expect(returned).toBe(1)
        const rows = yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).all()
        expect(rows.map((row) => row.seq).sort((a, b) => a - b)).toEqual([0, 1])
        expect(l1).toEqual([0])
        expect(l2).toEqual([])
        expect(streamed).toEqual([])
        yield* Deferred.succeed(releaseOuter, undefined)
        yield* Fiber.join(outer)
        const later = yield* events.publish(OrderedMessage, { id: aggregateID, text: "later" })
        expect(later.durable?.seq).toBe(2)
        yield* waitFor(Effect.sync(() => streamed.length === 3))
        expect(l1).toEqual([0, 1, 2])
        expect(l2).toEqual([0, 1, 2])
        expect(streamed).toEqual([0, 1, 2])
      } finally {
        yield* Deferred.succeed(releaseOuter, undefined)
      }
      yield* Fiber.interrupt(stream)
    }),
  )

  it.live("does not consume a sequence or notify when a local commit fails", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const seen = new Array<{ text: string; seq: number | undefined }>()
      yield* events.listen((event) =>
        event.type === OrderedMessage.type && (event.data as { id: string }).id === aggregateID
          ? Effect.sync(() => seen.push({ text: (event.data as { text: string }).text, seq: event.durable?.seq }))
          : Effect.void,
      )

      const exit = yield* events
        .publish(OrderedMessage, { id: aggregateID, text: "failed" }, { commit: () => Effect.die("commit marker") })
        .pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(String(exit)).toContain("commit marker")
      expect(seen).toEqual([])
      expect(yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).all()).toEqual([])

      const first = yield* events.publish(OrderedMessage, { id: aggregateID, text: "first" })
      const second = yield* events.publish(OrderedMessage, { id: aggregateID, text: "second" })
      expect([first.durable?.seq, second.durable?.seq]).toEqual([0, 1])
      expect(seen).toEqual([{ text: "first", seq: 0 }, { text: "second", seq: 1 }])
    }),
  )

  it.live("continues in sequence after an observer interrupts delivery", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const aggregateID = EventV2.ID.create()
      const seen = new Array<{ text: string; seq: number | undefined }>()
      yield* events.listen((event) => {
        if (event.type !== OrderedMessage.type || (event.data as { id: string }).id !== aggregateID) return Effect.void
        const text = (event.data as { text: string }).text
        return Effect.sync(() => seen.push({ text, seq: event.durable?.seq })).pipe(
          Effect.andThen(text === "interrupted" ? Effect.interrupt : Effect.void),
        )
      })

      const exit = yield* events.publish(OrderedMessage, { id: aggregateID, text: "interrupted" }).pipe(Effect.exit)
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect(yield* db.select().from(EventTable).where(eq(EventTable.aggregate_id, aggregateID)).all()).toEqual([
        expect.objectContaining({ seq: 0, data: { id: aggregateID, text: "interrupted" } }),
      ])

      const first = yield* events.publish(OrderedMessage, { id: aggregateID, text: "first" })
      const second = yield* events.publish(OrderedMessage, { id: aggregateID, text: "second" })
      expect([first.durable?.seq, second.durable?.seq]).toEqual([1, 2])
      expect(seen).toEqual([
        { text: "interrupted", seq: 0 },
        { text: "first", seq: 1 },
        { text: "second", seq: 2 },
      ])
    }),
  )
})

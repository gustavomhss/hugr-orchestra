import { expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import { testEffect } from "./lib/effect"

const Changed = EventV2.define({ type: "test.transaction.changed", durable: { aggregate: "id", version: 1 },
  schema: { id: Schema.String, value: Schema.String } })
const Local = EventV2.define({ type: "test.transaction.local", schema: { value: Schema.String } })
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node])))

it.live("rollback discards nested projections, sequences, seals and all notifications; later publish progresses", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const { db } = yield* Database.Service
    const seen: string[] = []
    yield* events.listen((event) => Effect.sync(() => { seen.push(event.type) }))
    const failure = yield* events.transact(Effect.gen(function* () {
      yield* events.publish(Changed, { id: "a", value: "one" }, {
        commit: () => db.insert(EventSequenceTable).values({ aggregate_id: "projection", seq: 99 }).run().pipe(Effect.orDie),
      })
      yield* events.transact(events.publish(Changed, { id: "a", value: "two" }))
      yield* events.publish(Local, { value: "local" })
      yield* events.publish(Changed, { id: "local-only", value: "local" }, { persist: false })
      return yield* Effect.fail("rollback")
    })).pipe(Effect.flip)
    expect(failure).toBe("rollback")
    expect(yield* db.select().from(EventSequenceTable).all().pipe(Effect.orDie)).toEqual([])
    expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual([])
    expect(seen).toEqual([])
    const next = yield* events.publish(Changed, { id: "a", value: "after" })
    expect(next.durable?.seq).toBe(0)
    expect((yield* events.verifySealWindow({ aggregateID: "a", fromSeq: 0, toSeq: 0 })).status).toBe("VERIFIED_WINDOW")
  }),
)

it.live("outer commit releases its boundary and schedules every aggregate before awaiting listeners", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const mutex = KeyedMutex.makeUnsafe<string>()
    const seen: string[] = []
    yield* events.listen((event) => event.type === Changed.type
      ? Effect.gen(function* () {
          const data = event.data as { id: string; value: string }
          if (data.value !== "b-first") expect(yield* mutex.size).toBe(0)
          seen.push(data.value)
          if (data.value === "a-first") {
            // b-first was committed in this batch. It must already have a scheduled delivery, or this waits forever.
            yield* events.transact(events.publish(Changed, { id: "b", value: "b-reentrant" }), mutex.withLock("guard"))
            yield* events.publish(Changed, { id: "a", value: "a-reentrant" })
          }
        }).pipe(Effect.orDie)
      : Effect.void)
    yield* events.transact(Effect.gen(function* () {
      yield* events.publish(Changed, { id: "a", value: "a-first" })
      yield* events.transact(events.publish(Changed, { id: "b", value: "b-first" }))
      expect(seen).toEqual([])
    }), mutex.withLock("guard"))
    yield* events.publish(Changed, { id: "a", value: "a-last" })
    expect(seen).toContain("b-first")
    expect(seen).toContain("b-reentrant")
    expect(seen.indexOf("b-first")).toBeLessThan(seen.indexOf("b-reentrant"))
    expect(seen.filter((value) => value.startsWith("a-"))).toEqual(["a-first", "a-reentrant", "a-last"])
    expect((yield* events.verifySealWindow({ aggregateID: "a", fromSeq: 0, toSeq: 2 })).status).toBe("VERIFIED_WINDOW")
  }).pipe(Effect.timeout("5 seconds")),
)

it.live("nested boundary fails before effects and rolls back the outer batch", () =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const { db } = yield* Database.Service
    let entered = false
    const outcome = yield* events.transact(Effect.gen(function* () {
      yield* events.publish(Changed, { id: "a", value: "outer" })
      yield* events.transact(Effect.sync(() => { entered = true }), (effect) => effect)
    })).pipe(Effect.exit)
    expect(outcome._tag).toBe("Failure")
    expect(entered).toBe(false)
    const unmanaged = yield* db.transaction(() => events.transact(events.publish(Changed, { id: "a", value: "unmanaged" }))).pipe(Effect.exit)
    expect(unmanaged._tag).toBe("Failure")
    expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toEqual([])
  }),
)

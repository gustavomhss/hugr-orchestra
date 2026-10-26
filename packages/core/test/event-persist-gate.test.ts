import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { Database } from "@orchestra/core/database/database"
import { Session } from "@orchestra/schema/session"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { eq } from "drizzle-orm"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(
    location({ directory: AbsolutePath.make("project"), workspaceID: WorkspaceV2.ID.make("wrk_test") }),
  ),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, Location.node]), [[Location.node, locationLayer]]),
)

const renamed = (sid: Session.ID) => ({ sessionID: sid, timestamp: DateTime.makeUnsafe(1), title: "renamed" })

describe("EventV2.publish persist gate", () => {
  it.effect("persist:false skips the event log entirely", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const sid = Session.ID.create()

      const notified = yield* events.publish(SessionEvent.Renamed, renamed(sid), {
        persist: false,
      })

      const eventRows = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sid))
        .all()
        .pipe(Effect.orDie)
      const seqRows = yield* db
        .select()
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, sid))
        .all()
        .pipe(Effect.orDie)

      expect(eventRows).toHaveLength(0)
      expect(seqRows).toHaveLength(0)
      // Payload still delivered to the caller (and thus to PubSub/SSE).
      expect(notified.type).toBe("session.next.renamed")
      expect(notified.durable).toBeUndefined()
    }),
  )

  it.effect("persist:true (default) writes the event log and advances the sequence", () =>
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const { db } = yield* Database.Service
      const sid = Session.ID.create()

      yield* events.publish(SessionEvent.Renamed, renamed(sid))

      const eventRows = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, sid))
        .all()
        .pipe(Effect.orDie)
      const seqRows = yield* db
        .select()
        .from(EventSequenceTable)
        .where(eq(EventSequenceTable.aggregate_id, sid))
        .all()
        .pipe(Effect.orDie)
      expect(eventRows).toHaveLength(1)
      expect(seqRows).toHaveLength(1)
      expect(seqRows[0]?.seq).toBe(0)
    }),
  )
})

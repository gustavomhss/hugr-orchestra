import { expect } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { and, asc, eq } from "drizzle-orm"
import { ToolFailure } from "@orchestra/llm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventSequenceTable, EventTable } from "@orchestra/core/event/sql"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionTable } from "@orchestra/core/session/sql"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { prepareArsenalSDK } from "./arsenal-fixture"

const it = testEffect(Layer.empty)
const assistantMessageID = SessionMessage.ID.make("msg_integrity_actual")

it.live("actual Session Progress and settlements seal before publish; SQL edits break host window, not usage coverage", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const observations = yield* ArsenalObservations.Service
        const events = yield* EventV2.Service
        const database = yield* Database.Service
        const input = { sessionID: session.id, operation: "audit" as const, placement: { directory: tmp.path, projectID: session.projectID } }
        const initial = yield* observations.read(input)
        expect(initial).toMatchObject({ observations: { actions: [] }, integrity: { projectID: session.projectID, sessionID: session.id, scope: "event-window-only", observationsVerified: false, window: { status: "VERIFIED_WINDOW", aggregateID: session.id, historyComplete: true } }, coverage: { usageComplete: false, historyComplete: false } })
        const published: Array<{ id: string; version: number | null; status: string }> = []
        const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
          if (event.type !== SessionEvent.Tool.Progress.type || typeof event.data !== "object" || event.data === null || !("sessionID" in event.data) || event.data.sessionID !== session.id) return
          const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, event.id)).get()
          if (!row) throw new Error("Durable Progress missing at subscriber boundary")
          const result = yield* events.verifySealWindow({ aggregateID: session.id, fromSeq: row.seq, toSeq: row.seq })
          published.push({ id: event.id, version: row.seal_version, status: result.status })
        }).pipe(Effect.orDie))
        yield* observations.emit({ ...input, assistantMessageID, callID: "native-progress", fact: { source: "native-host", version: 1, kind: "safety", tool: "native-proof", outcome: "success" } })
        yield* unsubscribe
        expect(published.length).toBe(1)
        expect(published[0]).toMatchObject({ version: 1, status: "VERIFIED_WINDOW" })
        const base = { sessionID: session.id, assistantMessageID, callID: "settled-proof", timestamp: yield* DateTime.now, provider: { executed: false } }
        yield* events.publish(SessionEvent.Step.Started, { ...base, agent: "maestro", model: ModelV2.Ref.make({ providerID: ProviderV2.ID.make("integrity-unpriced"), id: ModelV2.ID.make("test") }) })
        yield* events.publish(SessionEvent.Tool.Called, { ...base, tool: "settled-tool", input: {} })
        yield* events.publish(SessionEvent.Tool.Success, { ...base, structured: { result: "actual settlement" }, content: [] })
        // This retained type is outside observation families; verifier still includes it.
        yield* events.publish(SessionEvent.Retried, { sessionID: session.id, timestamp: yield* DateTime.now, attempt: 1, error: { message: "retry boundary", isRetryable: true } })
        const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, session.id)).orderBy(asc(EventTable.seq)).all()
        const retry = rows.find((row) => row.type === "session.next.retried.1")
        const progress = rows.find((row) => row.id === published[0].id)
        if (!retry || !progress) throw new Error("Real durable test rows missing")
        const clean = yield* observations.read(input)
        expect(clean).toMatchObject({ observations: { actions: [{ tool: "settled-tool", outcome: "succeeded" }, { tool: "native-proof", outcome: "succeeded" }] }, integrity: { window: { status: "VERIFIED_WINDOW", rows: rows.length, toSeq: retry.seq } } })
        yield* database.db.update(EventTable).set({ data: { ...retry.data, attempt: 2 } }).where(eq(EventTable.id, retry.id)).run()
        const broken = yield* observations.read(input)
        expect(broken.integrity?.window).toMatchObject({ status: "BROKEN", historyComplete: false, reasons: ["HASH_MISMATCH"] })
        expect(broken.coverage).toEqual(clean.coverage)
        yield* database.db.update(EventTable).set({ data: retry.data }).where(eq(EventTable.id, retry.id)).run()
        expect((yield* observations.read(input)).integrity?.window?.status).toBe("VERIFIED_WINDOW")
        const narrow = yield* observations.read({ ...input, auditWindow: { fromSeq: retry.seq, toSeq: retry.seq } })
        expect(narrow).toMatchObject({ integrity: { scope: "event-window-only", observationsVerified: false, window: { status: "VERIFIED_WINDOW", rows: 1, historyComplete: false, reasons: ["PREFIX_OUTSIDE_WINDOW"] } } })
        expect(narrow.observations).toEqual(clean.observations)
        // Predecessor metadata never certifies its out-of-window body.
        yield* database.db.update(EventTable).set({ data: { ...progress.data, content: [{ type: "text", text: "edited outside window" }] } }).where(eq(EventTable.id, progress.id)).run()
        expect((yield* observations.read({ ...input, auditWindow: { fromSeq: retry.seq, toSeq: retry.seq } })).integrity?.window?.status).toBe("VERIFIED_WINDOW")
        expect((yield* observations.read(input)).integrity?.window?.status).toBe("BROKEN")
        yield* database.db.update(EventTable).set({ data: progress.data }).where(eq(EventTable.id, progress.id)).run()
        yield* database.db.delete(EventTable).where(eq(EventTable.id, retry.id)).run()
        expect((yield* observations.read(input)).integrity?.window).toMatchObject({ status: "BROKEN", historyComplete: false, reasons: ["MISSING_EVENT"] })
        yield* database.db.insert(EventTable).values(retry).run()
        yield* database.db.update(EventTable).set({ seal_version: null, seal_prev: null, seal_hash: null }).where(eq(EventTable.aggregate_id, session.id)).run()
        expect((yield* observations.read(input)).integrity?.window).toMatchObject({ status: "UNKNOWN", historyComplete: false, reasons: ["UNSEALED_HISTORY"] })
        yield* database.db.delete(EventTable).where(eq(EventTable.aggregate_id, session.id)).run()
        yield* database.db.delete(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, session.id)).run()
        expect(yield* observations.read(input)).toMatchObject({ observations: { actions: [], usage: [] }, integrity: { window: { status: "UNKNOWN", rows: 0, headSeq: null, historyComplete: false } } })
      }).pipe(Effect.provideService(InstanceRef, instance))
    }))
  }), 90000,
)

it.live("actual legacy message compaction exposes historical UNKNOWN rather than verified full history", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const observations = yield* ArsenalObservations.Service
        const database = yield* Database.Service
        const input = { sessionID: session.id, operation: "audit" as const, placement: { directory: tmp.path, projectID: session.projectID } }
        const message = { id: MessageID.ascending(), sessionID: session.id, role: "user" as const, agent: "maestro", model: { providerID: ProviderV2.ID.make("integrity"), modelID: ModelV2.ID.make("test") }, time: { created: Date.now() } }
        yield* sessions.updateMessage(message)
        yield* sessions.updateMessage({ ...message, time: { created: message.time.created + 1 } })
        expect((yield* observations.read(input)).integrity?.window?.status).toBe("VERIFIED_WINDOW")
        expect((yield* EventV2.compactSnapshotEvents(database.db)).removed).toBeGreaterThan(0)
        expect((yield* observations.read(input)).integrity?.window).toMatchObject({ status: "UNKNOWN", rangeComplete: false, historyComplete: false, reasons: ["COMPACTED_HISTORY", "MISSING_EVENT"] })
      }).pipe(Effect.provideService(InstanceRef, instance))
    }))
  }), 90000,
)

it.live("real placement mismatch denied; frozen host window and after-read placement check use actual SessionStore", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const observations = yield* ArsenalObservations.Service
        const store = yield* SessionStore.Service
        const database = yield* Database.Service
        const input = { sessionID: session.id, operation: "audit" as const, placement: { directory: tmp.path, projectID: session.projectID } }
        expect(yield* observations.read({ ...input, placement: { ...input.placement, projectID: "wrong-project" } }).pipe(Effect.flip)).toBeInstanceOf(ToolFailure)
        expect(yield* observations.read({ ...input, placement: { ...input.placement, directory: `${tmp.path}/other` } }).pipe(Effect.flip)).toBeInstanceOf(ToolFailure)
        expect(yield* observations.read({ ...input, sessionID: SessionSchema.ID.make("ses_missing_integrity") }).pipe(Effect.flip)).toMatchObject({ message: "OBSERVATION_SESSION_MISSING" })
        const window = { fromSeq: 0, toSeq: 0 }
        // Decorate only get scheduling; every value still comes from actual installed store.
        const frozen = yield* Effect.gen(function* () {
          const reader = yield* ArsenalObservations.Service
          return yield* reader.read({ ...input, auditWindow: window })
        }).pipe(Effect.provide(Layer.fresh(ArsenalObservations.layer)), Effect.provideService(SessionStore.Service, { ...store, get: (id) => Effect.sync(() => { window.toSeq = 4096 }).pipe(Effect.andThen(store.get(id))) }))
        expect(frozen.integrity?.window).toMatchObject({ status: "VERIFIED_WINDOW", fromSeq: 0, toSeq: 0 })
        expect(window.toSeq).toBe(4096)
        const calls = { count: 0 }
        const moved = yield* Effect.gen(function* () {
          const reader = yield* ArsenalObservations.Service
          return yield* reader.read(input)
        }).pipe(Effect.provide(Layer.fresh(ArsenalObservations.layer)), Effect.provideService(SessionStore.Service, { ...store, get: (id) => Effect.gen(function* () {
          calls.count++
          if (calls.count === 2) yield* database.db.update(SessionTable).set({ directory: `${tmp.path}/moved` }).where(eq(SessionTable.id, session.id)).run()
          return yield* store.get(id)
        }) }), Effect.flip)
        expect(moved).toMatchObject({ message: "OBSERVATION_PLACEMENT_CHANGED_DURING_READ" })
        yield* database.db.update(SessionTable).set({ directory: tmp.path }).where(eq(SessionTable.id, session.id)).run()
        expect((yield* observations.read(input)).integrity?.window?.status).toBe("VERIFIED_WINDOW")
        // Historical/empty event acquisition must still enforce current projected placement.
        yield* database.db.delete(EventTable).where(eq(EventTable.aggregate_id, session.id)).run()
        yield* database.db.delete(EventSequenceTable).where(eq(EventSequenceTable.aggregate_id, session.id)).run()
        expect((yield* observations.read(input)).integrity?.window?.status).toBe("UNKNOWN")
        expect(yield* observations.read({ ...input, placement: { ...input.placement, projectID: "wrong-project" } }).pipe(Effect.flip)).toMatchObject({ message: "OBSERVATION_SESSION_PLACEMENT_MISMATCH" })
      }).pipe(Effect.provideService(InstanceRef, instance))
    }))
  }), 90000,
)

it.live("host bounds actual high-water to 2048; invalid/row/byte overflow remains acquisition UNKNOWN HOLD without window", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await prepareArsenalSDK(tmp.path, Global.Path.config)
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const events = yield* EventV2.Service
        const observations = yield* ArsenalObservations.Service
        const database = yield* Database.Service
        const input = { sessionID: session.id, operation: "audit" as const, placement: { directory: tmp.path, projectID: session.projectID } }
        yield* Effect.forEach(Array.from({ length: 2050 }, (_, attempt) => attempt), (attempt) => events.publish(SessionEvent.Retried, { sessionID: session.id, timestamp: DateTime.makeUnsafe(0), attempt, error: { message: "retained row", isRetryable: true } }))
        const head = yield* EventV2.latestSequence(database.db, session.id)
        expect((yield* observations.read(input)).integrity?.window).toMatchObject({ status: "VERIFIED_WINDOW", fromSeq: head - 2047, toSeq: head, rows: 2048, historyComplete: false })
        const overflow = yield* observations.read({ ...input, auditWindow: { fromSeq: 0, toSeq: head } })
        expect(overflow.integrity).toMatchObject({ acquisition: { status: "UNKNOWN", decision: "HOLD", code: "OVERFLOW" } })
        expect(overflow.integrity?.window).toBeUndefined()
        const invalid = yield* observations.read({ ...input, auditWindow: { fromSeq: 2, toSeq: 1 } })
        expect(invalid.integrity).toMatchObject({ acquisition: { status: "UNKNOWN", decision: "HOLD", code: "INVALID_WINDOW" } })
        yield* database.db.update(EventTable).set({ data: { sessionID: session.id, responseBody: "x".repeat(8 * 1024 * 1024) } }).where(and(eq(EventTable.aggregate_id, session.id), eq(EventTable.seq, head))).run()
        const bytes = yield* observations.read({ ...input, auditWindow: { fromSeq: head, toSeq: head } })
        expect(bytes.integrity).toMatchObject({ acquisition: { status: "UNKNOWN", decision: "HOLD", code: "OVERFLOW" } })
        expect(bytes.integrity?.window).toBeUndefined()
      }).pipe(Effect.provideService(InstanceRef, instance))
    }))
  }), 90000,
)

# S1 A1 recovery delta: E3-persistence

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Literal source excerpts, newly transported during recovery. They supplement, not replace, original dossier/reviews. E-number maps to J2 E1–E4 and J1 A1-R1–R4. No runtime or test execution asserted. No new semantic acceptance.

## E3-01: `packages/core/src/database/database.ts` lines 17–67

Git blob: `aa519134efff085e960affd9be376b0dc92456e1`; whole-source SHA-256: `04091781f953b67209dae075a13ff3f118abaab7534e58c77fb065ccafa0dd1b`.

```text
17: export interface Interface {
18:   db: DatabaseShape
19:   /** Stable store namespace; in-memory databases intentionally receive independent identities. */
20:   storageID?: string
21:   /** Captures this database's actual SQL client's ambient transaction key. */
22:   inTransaction?: Effect.Effect<boolean>
23: }
24: 
25: const Filename = Context.Reference<string>("@orchestra/Database/Filename", { defaultValue: () => path() })
26: 
27: export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/storage/Database") {}
28: 
29: const layer = Layer.effect(
30:   Service,
31:   Effect.gen(function* () {
32:     const db = yield* makeDatabase
33:     const client = yield* SqlClient
34: 
35:     yield* db.run("PRAGMA journal_mode = WAL")
36:     yield* db.run("PRAGMA synchronous = NORMAL")
37:     yield* db.run("PRAGMA busy_timeout = 5000")
38:     yield* db.run("PRAGMA cache_size = -64000")
39:     yield* db.run("PRAGMA foreign_keys = ON")
40:     yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
41:     yield* DatabaseMigration.apply(db)
42: 
43:     const filename = yield* Filename
44:     return { db, inTransaction: Effect.serviceOption(client.transactionService).pipe(Effect.map(Option.isSome)),
45:       storageID: filename === ":memory:" ? randomUUID()
46:       : createHash("sha256").update(resolve(filename)).digest("hex") }
47:   }).pipe(Effect.orDie),
48: )
49: 
50: export function layerFromPath(filename: string) {
51:   return layer.pipe(Layer.provide(sqliteLayer({ filename })), Layer.provide(Layer.succeed(Filename, filename)))
52: }
53: 
54: export function path() {
55:   if (Flag.ORCHESTRA_DB) {
56:     if (Flag.ORCHESTRA_DB === ":memory:" || isAbsolute(Flag.ORCHESTRA_DB)) return Flag.ORCHESTRA_DB
57:     return join(Global.Path.data, Flag.ORCHESTRA_DB)
58:   }
59:   return releasePath()
60: }
61: 
62: /** The database used by release channels (the installed app). */
63: export function releasePath() {
64:   return join(Global.Path.data, "orchestra.db")
65: }
66: 
67: export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
```

## E3-02: `packages/core/src/database/migration.ts` lines 1–15

Git blob: `b3d38c72425f3bae7f5730140070b251a8a4c8e7`; whole-source SHA-256: `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`.

```text
1: export * as DatabaseMigration from "./migration"
2: 
3: import { sql } from "drizzle-orm"
4: import { Effect, Semaphore } from "effect"
5: import type { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
6: import { readdirSync, rmSync } from "fs"
7: import { basename, dirname, join } from "path"
8: import { migrations } from "./migration.gen"
9: import schema from "./schema.gen"
10: 
11: type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
12: type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
13: const lock = Semaphore.makeUnsafe(1)
14: const KEEP_BACKUPS = 3
15: 
```

## E3-03: `packages/core/src/database/migration.ts` lines 74–147

Git blob: `b3d38c72425f3bae7f5730140070b251a8a4c8e7`; whole-source SHA-256: `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`.

```text
74: 
75: function backup(db: Database, from: string) {
76:   return Effect.gen(function* () {
77:     const file = (yield* db.all<{ file: string | null }>(sql`SELECT file FROM pragma_database_list WHERE name = 'main'`))[0]?.file
78:     if (!file) return
79:     const target = `${file}.backup-${from}-${Date.now()}`
80:     yield* db.run(sql`VACUUM INTO ${target}`).pipe(
81:       Effect.mapError((error) => new Error(`Could not back up the database before migrating, nothing was changed: ${error}`)),
82:     )
83:     prune(file)
84:   })
85: }
86: 
87: function prune(file: string) {
88:   const prefix = `${basename(file)}.backup-`
89:   readdirSync(dirname(file))
90:     .filter((name) => name.startsWith(prefix))
91:     .map((name) => ({ name, time: Number(name.slice(name.lastIndexOf("-") + 1)) }))
92:     .sort((a, b) => b.time - a.time)
93:     .slice(KEEP_BACKUPS)
94:     .forEach((old) => rmSync(join(dirname(file), old.name), { force: true }))
95: }
96: 
97: export function applyOnly(db: Database, input: Migration[]) {
98:   return Effect.gen(function* () {
99:     yield* db.run(
100:       sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
101:     )
102:     let completed = new Set(
103:       (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
104:     )
105:     if (completed.size === 0) {
106:       // Existing installs used Drizzle's migration journal. Seed the new
107:       // journal once so TypeScript migrations don't replay old SQL.
108:       if (
109:         yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${"__drizzle_migrations"}`)
110:       ) {
111:         const named = (yield* db.all<{ name: string }>(
112:           sql`SELECT name FROM pragma_table_info('__drizzle_migrations')`,
113:         )).some((column) => column.name === "name")
114: 
115:         if (named) {
116:           yield* db.run(sql`
117:             INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
118:             SELECT name, ${Date.now()}
119:             FROM ${sql.identifier("__drizzle_migrations")}
120:             WHERE name IS NOT NULL
121:           `)
122:         }
123: 
124:         if (!named) {
125:           const entries = yield* db.all<{ created_at: number; prefix: string | null }>(sql`
126:             SELECT created_at, strftime('%Y%m%d%H%M%S', created_at / 1000, 'unixepoch') AS prefix
127:             FROM ${sql.identifier("__drizzle_migrations")}
128:             WHERE created_at IS NOT NULL
129:           `)
130: 
131:           for (const entry of entries) {
132:             const migration = input.find((item) => item.id.startsWith(`${entry.prefix}_`))
133:             if (!migration) {
134:               return yield* Effect.die(
135:                 new Error(`Legacy migration timestamp ${entry.created_at} does not match any known migration`),
136:               )
137:             }
138:             yield* db.run(sql`
139:               INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
140:               VALUES (${migration.id}, ${Date.now()})
141:             `)
142:           }
143:         }
144:         completed = new Set(
145:           (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
146:         )
147:       }
```

## E3-04: `packages/core/src/event.ts` lines 182–210

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
182: 
183: export interface LayerOptions {
184:   readonly beforeAggregateRead?: (aggregateID: string) => Effect.Effect<void>
185: }
186: 
187: export const layerWith = (options?: LayerOptions) =>
188:   Layer.effect(
189:     Service,
190:     Effect.gen(function* () {
191:       const pubsub = {
192:         all: yield* PubSub.unbounded<Payload>(),
193:         durable: new Map<string, Set<PubSub.PubSub<void>>>(),
194:         typed: new Map<string, PubSub.PubSub<Payload>>(),
195:       }
196:       const projectors = new Map<string, Projector[]>()
197:       // TODO: Bind durable projectors to exact type+version before supporting incompatible historical payloads.
198:       const listeners = new Array<Subscriber>()
199:       const { db } = yield* Database.Service
200: 
201:       const getOrCreate = (definition: Definition) =>
202:         Effect.gen(function* () {
203:           const existing = pubsub.typed.get(definition.type)
204:           if (existing) return existing
205:           const created = yield* PubSub.unbounded<Payload>()
206:           pubsub.typed.set(definition.type, created)
207:           return created
208:         })
209: 
210:       yield* Effect.addFinalizer(() =>
```

## E3-05: `packages/core/src/event.ts` lines 232–290

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
232:         persist = true,
233:       ) {
234:         return Effect.gen(function* () {
235:           const origin = Object.freeze({ replay: input !== undefined })
236:           const durable = definition?.durable
237:           if (durable) {
238:             const aggregateID = (event.data as Record<string, unknown>)[durable.aggregate]
239:             if (typeof aggregateID !== "string") {
240:               yield* Effect.die(
241:                 new InvalidDurableEventError({
242:                   type: event.type,
243:                   message: `Expected string aggregate field ${durable.aggregate}`,
244:                 }),
245:               )
246:             } else {
247:               if (input && input.aggregateID !== aggregateID) {
248:                 yield* Effect.die(
249:                   new InvalidDurableEventError({
250:                     type: event.type,
251:                     message: `Aggregate mismatch: expected ${input.aggregateID}, got ${aggregateID}`,
252:                   }),
253:                 )
254:               }
255:               const list = projectors.get(event.type) ?? []
256:               if (!persist) {
257:                 // Local-only publish: project the event into the operational
258:                 // tables (MessageTable/PartTable/SessionTable) atomically, but
259:                 // do not append to the durable event log or advance the
260:                 // aggregate sequence. Returning undefined signals the caller to
261:                 // notify listeners with no `durable` envelope, so cross-instance
262:                 // sync never observes this event. The `commit` hook is not
263:                 // invoked either: it is documented as requiring a committed seq,
264:                 // and no caller combines `commit` with `persist:false`. The
265:                 // projector receives `durable.seq = -1` as a placeholder; none
266:                 // of the current projectors read seq (they upsert by entity id),
267:                 // so the value is inert — kept only to satisfy the Payload type.
268:                 return yield* Effect.uninterruptible(
269:                   Effect.gen(function* () {
270:                     yield* db
271:                       .transaction(
272:                         () =>
273:                           Effect.gen(function* () {
274:                             const committed = {
275:                               ...event,
276:                               durable: { aggregateID, seq: -1, version: durable.version },
277:                             } as Payload
278:                             for (const projector of list) {
279:                               yield* projector(committed, origin)
280:                             }
281:                             return
282:                           }),
283:                         { behavior: "immediate" },
284:                       )
285:                       .pipe(Effect.orDie)
286:                     return undefined
287:                   }),
288:                 )
289:               }
290:               return yield* Effect.uninterruptible(
```

## E3-06: `packages/core/src/event.ts` lines 300–367

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
300:                               .pipe(Effect.orDie))
301:                           )
302:                             yield* Effect.die(
303:                               new InvalidDurableEventError({
304:                                 type: event.type,
305:                                 message: "Workspace sync disabled after snapshot compaction",
306:                               }),
307:                             )
308:                           const row = yield* db
309:                             .select({ seq: EventSequenceTable.seq, ownerID: EventSequenceTable.owner_id })
310:                             .from(EventSequenceTable)
311:                             .where(eq(EventSequenceTable.aggregate_id, aggregateID))
312:                             .get()
313:                             .pipe(Effect.orDie)
314:                           const latest = row?.seq ?? -1
315:                           const encoded = Schema.encodeUnknownSync(definition.data)(event.data) as Record<
316:                             string,
317:                             unknown
318:                           >
319:                           if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID) {
320:                             yield* Effect.die(
321:                               new InvalidDurableEventError({
322:                                 type: event.type,
323:                                 message: `Replay owner mismatch for aggregate ${aggregateID}: expected ${row.ownerID}, got ${input.ownerID ?? "none"}`,
324:                               }),
325:                             )
326:                           }
327:                           if (input && input.seq <= latest) {
328:                             const stored = yield* db
329:                               .select()
330:                               .from(EventTable)
331:                               .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, input.seq)))
332:                               .get()
333:                               .pipe(Effect.orDie)
334:                             if (
335:                               stored?.id === event.id &&
336:                               stored.type === versionedType(definition.type, durable.version) &&
337:                               isDeepStrictEqual(stored.data, encoded)
338:                             ) {
339:                               if (input.ownerID && row?.ownerID == null) {
340:                                 yield* db
341:                                   .update(EventSequenceTable)
342:                                   .set({ owner_id: input.ownerID })
343:                                   .where(eq(EventSequenceTable.aggregate_id, aggregateID))
344:                                   .run()
345:                                   .pipe(Effect.orDie)
346:                               }
347:                               return
348:                             }
349:                             yield* Effect.die(
350:                               new InvalidDurableEventError({
351:                                 type: event.type,
352:                                 message: `Replay diverged at aggregate ${aggregateID} sequence ${input.seq}`,
353:                               }),
354:                             )
355:                           }
356:                           if (input && row?.ownerID && row.ownerID !== input.ownerID) {
357:                             return
358:                           }
359:                           const seq = input?.seq ?? latest + 1
360:                           if (input && seq !== latest + 1) {
361:                             yield* Effect.die(
362:                               new InvalidDurableEventError({
363:                                 type: event.type,
364:                                 message: `Sequence mismatch for aggregate ${aggregateID}: expected ${latest + 1}, got ${seq}`,
365:                               }),
366:                             )
367:                           }
```

## E3-07: `packages/core/src/event.ts` lines 446–485

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
446:         persist = true,
447:       ) {
448:         return Effect.gen(function* () {
449:           if (!persist && commit)
450:             return yield* Effect.die(
451:               new InvalidDurableEventError({
452:                 type: event.type,
453:                 message: "Local commit hooks cannot be combined with persist:false",
454:               }),
455:             )
456:           if (!definition?.durable && commit)
457:             return yield* Effect.die(
458:               new InvalidDurableEventError({
459:                 type: event.type,
460:                 message: "Local commit hooks require a durable event",
461:               }),
462:             )
463:           if (definition?.durable) {
464:             const committed = yield* commitDurableEvent(definition, event as Payload, undefined, commit, persist)
465:             if (committed) {
466:               event = {
467:                 ...event,
468:                 durable: {
469:                   aggregateID: committed.aggregateID,
470:                   seq: committed.seq,
471:                   version: definition.durable.version,
472:                 },
473:               }
474:               yield* notify(event as Payload, true)
475:               return event
476:             }
477:           }
478:           yield* notify(event as Payload, false)
479:           return event
480:         })
481:       }
482: 
483:       const observe = (event: Payload, observer: (event: Payload) => Effect.Effect<void>) =>
484:         Effect.suspend(() => observer(event)).pipe(
485:           Effect.catchCauseIf(
```

## E3-08: `packages/core/src/event.ts` lines 527–562

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
527:       function replay(
528:         event: SerializedEvent,
529:         options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
530:       ) {
531:         return Effect.gen(function* () {
532:           const definition = Durable.get(event.type)
533:           if (!definition?.durable) {
534:             yield* Effect.die(
535:               new InvalidDurableEventError({ type: event.type, message: `Unknown durable event type ${event.type}` }),
536:             )
537:           } else {
538:             const payload = {
539:               id: event.id,
540:               type: definition.type,
541:               data: Schema.decodeUnknownSync(definition.data)(event.data),
542:             } as Payload
543:             const committed = yield* commitDurableEvent(definition, payload, {
544:               seq: event.seq,
545:               aggregateID: event.aggregateID,
546:               ownerID: options?.ownerID,
547:               strictOwner: options?.strictOwner,
548:             })
549:             if (!committed) return
550:             const result = {
551:               ...payload,
552:               durable: {
553:                 aggregateID: committed.aggregateID,
554:                 seq: committed.seq,
555:                 version: definition.durable.version,
556:               },
557:             } as Payload
558:             if (options?.publish) yield* notify(result, true)
559:             return result
560:           }
561:         })
562:       }
```

## E3-09: `packages/core/src/event.ts` lines 621–628

Git blob: `fa7a39a0c039770d36523723e75c1f228e1142f0`; whole-source SHA-256: `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`.

```text
621:       function claim(aggregateID: string, ownerID: string) {
622:         return db
623:           .update(EventSequenceTable)
624:           .set({ owner_id: ownerID })
625:           .where(eq(EventSequenceTable.aggregate_id, aggregateID))
626:           .run()
627:           .pipe(Effect.orDie)
628:       }
```

## E3-10: `packages/schema/src/durable-event-manifest.ts` lines 1–20

Git blob: `e9c9f78dd4defc0bf2299ac2f9214d45fd67ead9`; whole-source SHA-256: `2a0b5b89a473f63224587645033ec95124e684d31669ffe54d7de719bfa0cf1f`.

```text
1: export * as DurableEventManifest from "./durable-event-manifest"
2: 
3: import { Event } from "./event"
4: import { MaestroEvent } from "./maestro-event"
5: import { RelayHook } from "./relay-hook"
6: import { ResearchEvent } from "./research-event"
7: import { SessionEvent } from "./session-event"
8: 
9: export const SessionDurable = {
10:   definitions: Event.durable(SessionEvent.DurableDefinitions),
11:   schema: SessionEvent.Durable,
12: } as const
13: 
14: export const Durable = Event.durable([
15:   ...SessionEvent.DurableDefinitions,
16:   ...MaestroEvent.Definitions,
17:   ...MaestroEvent.DurableOnlyDefinitions,
18:   ...RelayHook.Definitions,
19:   ...ResearchEvent.Definitions,
20: ])
```

## E3-11: `packages/schema/src/event.ts` lines 98–127

Git blob: `21d0aceeaeb06247f4b2f2ceaeee53f81e1b9cf6`; whole-source SHA-256: `0542c9dedbd6f769cd95bb8624ff9449067b56b66c52d818bb7f11b78bcb75de`.

```text
98: export function versionedType(type: string, version: number) {
99:   return `${type}.${version}`
100: }
101: 
102: export function durable<const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) {
103:   return readonlyMap(
104:     definitions.reduce((result, definition) => {
105:       if (!definition.durable) return result
106:       const key = versionedType(definition.type, definition.durable.version)
107:       if (result.has(key)) throw new Error(`Duplicate durable event definition for ${key}`)
108:       result.set(key, definition)
109:       return result
110:     }, new Map<string, Definitions[number]>()),
111:   )
112: }
113: 
114: function readonlyMap<Key, Value>(map: Map<Key, Value>): ReadonlyMap<Key, Value> {
115:   const result: ReadonlyMap<Key, Value> = Object.freeze({
116:     get size() {
117:       return map.size
118:     },
119:     entries: () => map.entries(),
120:     forEach: (callback: (value: Value, key: Key, map: ReadonlyMap<Key, Value>) => void, thisArg?: unknown) =>
121:       map.forEach((value, key) => callback.call(thisArg, value, key, result)),
122:     get: (key: Key) => map.get(key),
123:     has: (key: Key) => map.has(key),
124:     keys: () => map.keys(),
125:     values: () => map.values(),
126:     [Symbol.iterator]: () => map[Symbol.iterator](),
127:   })
```

## E3-12: `packages/core/src/event/seal.ts` lines 1–20

Git blob: `92fb956062247720c457eb443e0f271a04261a44`; whole-source SHA-256: `64fa8568bb118d3b838961e46a5b679381f4966db203629c517075e781e9a9f2`.

```text
1: export * as EventSeal from "./seal"
2: 
3: import { createHash } from "node:crypto"
4: import { and, asc, desc, eq, gte, lte, sql, type SQLWrapper } from "drizzle-orm"
5: import { Cause, Effect, Option, Schema } from "effect"
6: import type { Database } from "../database/database"
7: import { EventSequenceTable, EventTable } from "./sql"
8: import { SNAPSHOT_COMPACTION_MARKER } from "./compaction"
9: 
10: export const GENESIS = "0".repeat(64)
11: type Row = Pick<typeof EventTable.$inferSelect, "id" | "aggregate_id" | "seq" | "type" | "data">
12: type Seal = Pick<typeof EventTable.$inferSelect, "seal_version" | "seal_prev" | "seal_hash">
13: const MAX_ROWS = 2048
14: const MAX_BYTES = 8 * 1024 * 1024
15: // Corrupt metadata must not turn a bounded payload read into an unbounded allocation.
16: // Validate storage type/raw bytes before bounded extraction; TEXT substr hides NUL suffixes.
17: export const columns = {
18:   seal_version: sql<
19:     number | null
20:   >`CASE WHEN ${EventTable.seal_version} IS NULL THEN NULL WHEN typeof(${EventTable.seal_version}) = 'integer' AND ${EventTable.seal_version} = 1 THEN 1 ELSE 0 END`,
```

## E3-13: `packages/core/src/event/seal.ts` lines 102–180

Git blob: `92fb956062247720c457eb443e0f271a04261a44`; whole-source SHA-256: `64fa8568bb118d3b838961e46a5b679381f4966db203629c517075e781e9a9f2`.

```text
102:   supplied: SealWindowInput,
103: ) {
104:   const decoded = Schema.decodeUnknownOption(SealWindowInput)(supplied)
105:   if (Option.isNone(decoded))
106:     return yield* new SealWindowError({
107:       code: "INVALID_WINDOW",
108:       message: "Expected aggregate and safe ordered sequence interval with optional SHA-256 anchors",
109:     })
110:   const input = Object.freeze({ ...decoded.value })
111:   if (input.fromSeq > input.toSeq)
112:     return yield* new SealWindowError({ code: "INVALID_WINDOW", message: "Seal window sequence interval is reversed" })
113:   if (input.toSeq - input.fromSeq + 1 > MAX_ROWS)
114:     return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows" })
115:   return yield* db
116:     .transaction((tx) =>
117:       Effect.gen(function* () {
118:         const head = yield* tx
119:           .select({
120:             seq: sql<number>`CASE WHEN typeof(${EventSequenceTable.seq}) = 'integer' AND ${EventSequenceTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventSequenceTable.seq} ELSE -1 END`,
121:           })
122:           .from(EventSequenceTable)
123:           .where(eq(EventSequenceTable.aggregate_id, input.aggregateID))
124:           .get()
125:         const tail = yield* tx
126:           .select({
127:             seq: sql<number>`CASE WHEN typeof(${EventTable.seq}) = 'integer' AND ${EventTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventTable.seq} ELSE -1 END`,
128:           })
129:           .from(EventTable)
130:           .where(eq(EventTable.aggregate_id, input.aggregateID))
131:           .orderBy(desc(EventTable.seq))
132:           .limit(1)
133:           .get()
134:         const scope = and(
135:           eq(EventTable.aggregate_id, input.aggregateID),
136:           gte(EventTable.seq, input.fromSeq),
137:           lte(EventTable.seq, input.toSeq),
138:         )
139:         // Preflight raw bytes before materializing JSON. Canonical bytes are checked again below.
140:         const size = yield* windowSize(tx, input)
141:         if ((size?.rows ?? 0) > MAX_ROWS || (size?.bytes ?? 0) > MAX_BYTES)
142:           return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows or 8 MiB" })
143:         const predecessor =
144:           input.fromSeq === 0
145:             ? undefined
146:             : yield* tx
147:                 .select({
148:                   seq: EventTable.seq,
149:                   ...columns,
150:                 })
151:                 .from(EventTable)
152:                 .where(and(eq(EventTable.aggregate_id, input.aggregateID), eq(EventTable.seq, input.fromSeq - 1)))
153:                 .get()
154:         const compacted = Boolean(
155:           yield* tx.get(sql`SELECT 1 FROM data_migration WHERE name = ${SNAPSHOT_COMPACTION_MARKER}`),
156:         )
157:         const rows = yield* tx
158:           .select({
159:             id: EventTable.id,
160:             aggregate_id: EventTable.aggregate_id,
161:             seq: EventTable.seq,
162:             type: EventTable.type,
163:             data: EventTable.data,
164:             ...columns,
165:           })
166:           .from(EventTable)
167:           .where(scope)
168:           .orderBy(asc(EventTable.seq))
169:           .limit(MAX_ROWS + 1)
170:           .all()
171:         return yield* Effect.try({
172:           try: () => {
173:             if (rows.reduce((total, row) => total + Buffer.byteLength(canonicalRow(row), "utf8"), 0) > MAX_BYTES)
174:               throw new SealWindowError({ code: "OVERFLOW", message: "Canonical seal window exceeds 8 MiB" })
175:             return verifyRows(input, rows, predecessor, head?.seq ?? null, compacted, tail?.seq ?? null)
176:           },
177:           catch: (error) =>
178:             error instanceof SealWindowError
179:               ? error
180:               : new SealWindowError({
```

## E3-14: `packages/core/src/session/store.ts` lines 15–105

Git blob: `1e44d051f1a51b816bfeb96ce46dbc0747d07aff`; whole-source SHA-256: `2532e550ec0d74f7b07c33560651db176479d6b9d827fdc19d1d1198ba0628de`.

```text
15: export interface Interface {
16:   readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info | undefined>
17:   readonly context: (sessionID: SessionSchema.ID) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
18:   readonly runnerContext: (
19:     sessionID: SessionSchema.ID,
20:     baselineSeq: number,
21:   ) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
22:   /** Every stored message in order with its sequence, including history behind the latest compaction. */
23:   readonly entries: (
24:     sessionID: SessionSchema.ID,
25:   ) => Effect.Effect<ReadonlyArray<{ readonly seq: number; readonly message: SessionMessage.Message }>, MessageDecodeError>
26:   readonly message: (
27:     messageID: SessionMessage.ID,
28:   ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
29:   /** The Session's own permission rules as V2 rules; empty for none or an unknown Session. */
30:   readonly permissions: (sessionID: SessionSchema.ID) => Effect.Effect<Permission.Ruleset>
31: }
32: 
33: export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}
34: 
35: const layer = Layer.effect(
36:   Service,
37:   Effect.gen(function* () {
38:     const { db } = yield* Database.Service
39:     const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
40: 
41:     return Service.of({
42:       get: Effect.fn("SessionStore.get")(function* (sessionID) {
43:         const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
44:         return row ? fromRow(row) : undefined
45:       }),
46:       context: Effect.fn("SessionStore.context")(function* (sessionID) {
47:         return yield* SessionHistory.load(db, sessionID)
48:       }),
49:       runnerContext: Effect.fn("SessionStore.runnerContext")(function* (sessionID, baselineSeq) {
50:         return yield* SessionHistory.loadForRunner(db, sessionID, baselineSeq)
51:       }),
52:       entries: Effect.fn("SessionStore.entries")(function* (sessionID) {
53:         const rows = yield* db
54:           .select()
55:           .from(SessionMessageTable)
56:           .where(eq(SessionMessageTable.session_id, sessionID))
57:           .orderBy(asc(SessionMessageTable.seq))
58:           .all()
59:           .pipe(Effect.orDie)
60:         return yield* Effect.forEach(rows, (row) =>
61:           decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
62:             Effect.map((message) => ({ seq: row.seq, message })),
63:             Effect.mapError(
64:               () =>
65:                 new MessageDecodeError({
66:                   sessionID: SessionSchema.ID.make(row.session_id),
67:                   messageID: SessionMessage.ID.make(row.id),
68:                 }),
69:             ),
70:           ),
71:         )
72:       }),
73:       message: Effect.fn("SessionStore.message")(function* (messageID) {
74:         const row = yield* db
75:           .select()
76:           .from(SessionMessageTable)
77:           .where(eq(SessionMessageTable.id, messageID))
78:           .get()
79:           .pipe(Effect.orDie)
80:         return row
81:           ? {
82:               sessionID: SessionSchema.ID.make(row.session_id),
83:               message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
84:             }
85:           : undefined
86:       }),
87:       permissions: Effect.fn("SessionStore.permissions")(function* (sessionID) {
88:         const row = yield* db
89:           .select({ permission: SessionTable.permission })
90:           .from(SessionTable)
91:           .where(eq(SessionTable.id, sessionID))
92:           .get()
93:           .pipe(Effect.orDie)
94:         // The column keeps legacy rule fields.
95:         return (row?.permission ?? []).map((rule) => ({
96:           action: rule.permission,
97:           resource: rule.pattern,
98:           effect: rule.action,
99:         }))
100:       }),
101:     })
102:   }),
103: )
104: 
105: export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
```

# S1 A1 recovery delta: E1-admission

Baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Literal source excerpts, newly transported during recovery. They supplement, not replace, original dossier/reviews. E-number maps to J2 E1–E4 and J1 A1-R1–R4. No runtime or test execution asserted. No new semantic acceptance.

## E1-01: `packages/core/src/session.ts` lines 491–518

Git blob: `402a192a69bcad6a4b08c695657e24ff5e335f93`; whole-source SHA-256: `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`.

```text
491:       prompt: Effect.fn("V2Session.prompt")((input) =>
492:         Effect.uninterruptibleMask((restore) =>
493:           Effect.gen(function* () {
494:             const messageID = input.id ?? SessionMessage.ID.create()
495:             const notes = yield* restore(promptHooks({ ...input, id: messageID }))
496:             const prompt = resolvePrompt(input.prompt)
497:             const delivery = input.delivery ?? "steer"
498:             const expected = { sessionID: input.sessionID, messageID, prompt, delivery }
499:             const admitted = yield* SessionInput.admit(db, events, {
500:               id: messageID,
501:               sessionID: input.sessionID,
502:               prompt,
503:               ...(notes.length === 0 ? {} : { promptContext: { reminders: [...notes] } }),
504:               delivery,
505:             }).pipe(
506:               Effect.catchDefect((defect) =>
507:                 defect instanceof SessionInput.LifecycleConflict
508:                   ? new PromptConflictError({ sessionID: input.sessionID, messageID })
509:                   : Effect.die(defect),
510:               ),
511:             )
512:             if (!SessionInput.equivalent(admitted, expected))
513:               return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
514:             if (input.resume !== false) yield* execution.wake(admitted.sessionID)
515:             return admitted
516:           }),
517:         ),
518:       ),
```

## E1-02: `packages/core/src/session/input.ts` lines 48–94

Git blob: `d945b00cf43d03b923cc90d51970d47e2dd3a9c2`; whole-source SHA-256: `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`.

```text
48: export const admit = Effect.fn("SessionInput.admit")(function* (
49:   db: DatabaseService,
50:   events: EventV2.Interface,
51:   input: {
52:     readonly id: SessionMessage.ID
53:     readonly sessionID: SessionSchema.ID
54:     readonly prompt: Prompt
55:     readonly promptContext?: PromptContext.Info
56:     readonly delivery: Delivery
57:   },
58: ) {
59:   const existing = yield* find(db, input.id)
60:   if (existing !== undefined) {
61:     if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
62:     return existing
63:   }
64:   const historical = yield* reconcileHistorical(db, input)
65:   if (historical !== undefined) return historical
66:   const timestamp = yield* DateTime.now
67:   return yield* events
68:     .publish(SessionEvent.PromptAdmitted, {
69:       messageID: input.id,
70:       sessionID: input.sessionID,
71:       timestamp,
72:       prompt: input.prompt,
73:       promptContext: input.promptContext,
74:       delivery: input.delivery,
75:     })
76:     .pipe(
77:       Effect.flatMap((event) =>
78:         event.durable === undefined
79:           ? Effect.die("Prompt admission event is missing aggregate sequence")
80:           : find(db, input.id).pipe(
81:               Effect.flatMap((stored) =>
82:                 stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
83:               ),
84:             ),
85:       ),
86:       Effect.catchDefect((defect) =>
87:         find(db, input.id).pipe(
88:           Effect.flatMap((stored) =>
89:             stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
90:           ),
91:         ),
92:       ),
93:     )
94: })
```

## E1-03: `packages/core/src/session/input.ts` lines 291–316

Git blob: `d945b00cf43d03b923cc90d51970d47e2dd3a9c2`; whole-source SHA-256: `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`.

```text
291: export const equivalent = (
292:   input: Admitted,
293:   expected: {
294:     readonly sessionID: SessionSchema.ID
295:     readonly prompt: Prompt
296:     readonly delivery: Delivery
297:   },
298: ) => input.delivery === expected.delivery && matchesPrompt(input, expected)
299: 
300: const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
301:   input.sessionID === expected.sessionID &&
302:   JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))
303: 
304: const matchesProjection = (
305:   input: Admitted,
306:   expected: {
307:     readonly sessionID: SessionSchema.ID
308:     readonly prompt: Prompt
309:     readonly promptContext?: PromptContext.Info
310:     readonly delivery: Delivery
311:     readonly timeCreated: DateTime.Utc
312:   },
313: ) =>
314:   equivalent(input, expected) &&
315:   JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
316:   DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)
```

## E1-04: `packages/core/src/session/sql.ts` lines 154–184

Git blob: `21b589483ae47f8d924cc58b8d2377525d381cc0`; whole-source SHA-256: `b531c440629c4bb136e4468f50c12208911357448defe0514a2fd61840f09173`.

```text
154: export const SessionInputTable = sqliteTable(
155:   "session_input",
156:   {
157:     id: text().$type<SessionMessage.ID>().primaryKey(),
158:     session_id: text()
159:       .$type<SessionSchema.ID>()
160:       .notNull()
161:       .references(() => SessionTable.id, { onDelete: "cascade" }),
162:     prompt: text({ mode: "json" }).notNull().$type<Prompt>(),
163:     prompt_context: text({ mode: "json" }).$type<PromptContext.Info>(),
164:     delivery: text().$type<SessionInput.Delivery>().notNull(),
165:     admitted_seq: integer().notNull(),
166:     promoted_seq: integer(),
167:     time_created: integer()
168:       .notNull()
169:       .$default(() => Date.now()),
170:   },
171:   (table) => [
172:     index("session_input_session_pending_delivery_seq_idx").on(
173:       table.session_id,
174:       table.promoted_seq,
175:       table.delivery,
176:       table.admitted_seq,
177:     ),
178:     uniqueIndex("session_input_session_admitted_seq_idx").on(table.session_id, table.admitted_seq),
179:     uniqueIndex("session_input_session_promoted_seq_idx").on(table.session_id, table.promoted_seq),
180:   ],
181: )
182: 
183: export const SessionContextEpochTable = sqliteTable("session_context_epoch", {
184:   session_id: text()
```

## E1-05: `packages/core/src/session/projector.ts` lines 27–48

Git blob: `e5d7ca7d65d1da035a136557b08e2a264c788da5`; whole-source SHA-256: `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`.

```text
27: function run(db: DatabaseService, event: SessionEvent.Event, replay = false) {
28:   return Effect.gen(function* () {
29:     const decodeRow = (row: typeof SessionMessageTable.$inferSelect) =>
30:       decodeMessage({ ...row.data, id: row.id, type: row.type })
31:     const updateMessage = (message: SessionMessage.Message) => {
32:       if (event.durable === undefined) return Effect.die("Durable Session event is missing aggregate sequence")
33:       const encoded = encodeMessage(message)
34:       const { id, type, ...data } = encoded
35:       return db
36:         .update(SessionMessageTable)
37:         .set({ type, time_created: DateTime.toEpochMillis(message.time.created), data })
38:         .where(
39:           and(
40:             eq(SessionMessageTable.id, SessionMessage.ID.make(id)),
41:             eq(SessionMessageTable.session_id, event.data.sessionID),
42:           ),
43:         )
44:         .run()
45:         .pipe(Effect.orDie)
46:     }
47:     const appendMessage = (message: SessionMessage.Message) => insertMessage(db, event, message)
48:     const adapter: SessionMessageUpdater.Adapter = {
```

## E1-06: `packages/core/src/session/projector.ts` lines 160–187

Git blob: `e5d7ca7d65d1da035a136557b08e2a264c788da5`; whole-source SHA-256: `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`.

```text
160:         })
161:       },
162:       updateAssistant: updateMessage,
163:       updateShell: updateMessage,
164:       appendMessage,
165:     }
166:     yield* SessionMessageUpdater.update(adapter, event).pipe(Effect.orDie)
167:   })
168: }
169: 
170: function insertMessage(db: DatabaseService, event: SessionEvent.Event, message: SessionMessage.Message) {
171:   if (event.durable === undefined) return Effect.die("Durable Session event is missing aggregate sequence")
172:   const encoded = encodeMessage(message)
173:   const { id, type, ...data } = encoded
174:   return db
175:     .insert(SessionMessageTable)
176:     .values({
177:       id: SessionMessage.ID.make(id),
178:       session_id: event.data.sessionID,
179:       type,
180:       seq: event.durable.seq,
181:       time_created: DateTime.toEpochMillis(message.time.created),
182:       data,
183:     })
184:     .run()
185:     .pipe(Effect.orDie)
186: }
187: 
```

## E1-07: `packages/core/src/session/projector.ts` lines 283–296

Git blob: `e5d7ca7d65d1da035a136557b08e2a264c788da5`; whole-source SHA-256: `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`.

```text
283:     yield* events.project(SessionEvent.Prompted, (event) =>
284:       Effect.gen(function* () {
285:         if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
286:         yield* SessionInput.projectPrompted(db, {
287:           id: event.data.messageID,
288:           sessionID: event.data.sessionID,
289:           prompt: event.data.prompt,
290:           promptContext: event.data.promptContext,
291:           delivery: event.data.delivery,
292:           timeCreated: event.data.timestamp,
293:           promotedSeq: event.durable.seq,
294:         })
295:         yield* run(db, event)
296:       }),
```

## E1-08: `packages/core/src/session/message-updater.ts` lines 247–262

Git blob: `f0862e38b57053d318d7609d87ee2a7741ca0584`; whole-source SHA-256: `c0e1e9ac9c6c01389a8f47fe1c169ad7f395a772d9d1ef959696ed597be7cbb1`.

```text
247:       "session.next.prompted": (event) => {
248:         return adapter.appendMessage(
249:           SessionMessage.User.make({
250:             id: event.data.messageID,
251:             type: "user",
252:             metadata: event.metadata,
253:             text: event.data.prompt.text,
254:             files: event.data.prompt.files,
255:             agents: event.data.prompt.agents,
256:             promptContext: event.data.promptContext,
257:             time: { created: event.data.timestamp },
258:           }),
259:         )
260:       },
261:       "session.next.prompt.admitted": () => Effect.void,
262:       "session.next.context.updated": (event) =>
```

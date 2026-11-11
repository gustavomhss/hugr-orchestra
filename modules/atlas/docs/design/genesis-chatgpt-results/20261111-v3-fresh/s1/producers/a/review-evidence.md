# Producer A L1 exact source evidence — full cited-anchor archive

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.

## Artifact → excerpt map

| Artifact | Exact excerpts |
| --- | --- |
| `s1.core.session-admission` | F001, F002, F003, F004, F005, F006, F007, F008 |
| `s1.core.session-execution` | F009, F010, F011, F012, F013, F014, F015, F016, F017, F018 |
| `s1.core.persistence` | F019, F020, F021, F022, F023, F024, F025, F026, F027, F028, F029, F030, F031 |
| `s1.core.context` | F032, F033, F034, F035, F036, F037, F038, F039, F040, F041, F042, F043, F044, F045, F046, F047 |
| `s1.core.tools` | F048, F049, F050, F051, F052, F053, F054, F055, F056, F057, F058, F059, F060, F061, F062 |
| `s1.core.security` | F063, F064, F065, F066, F067, F068, F069, F070, F071, F072, F073, F074, F075, F076, F077, F078, F079, F080, F081, F082, F083, F084, F085 |
| `s1.core.configuration` | F086, F087, F088, F089, F090, F091, F092 |
| `s1.core.project` | F093, F094, F095, F096, F097, F098, F099, F100, F101, F102 |
| `s1.core.extensions` | F103, F104, F105, F106, F107, F108, F109, F110, F111, F112, F113, F114, F115, F116 |
| `s1.core.capability` | F117, F118, F119, F120, F121, F122, F123, F124, F125 |
| `s1.core.automation` | F126, F127, F128, F129, F130, F131, F132, F133, F134 |
| `s1.core.research` | F135, F136, F137, F138, F139, F140, F141, F142, F143 |
| `s1.core.runtime` | F144, F145, F146, F147, F148, F149, F150, F151, F152, F153, F154, F155, F156, F157, F158, F159, F160, F161, F162, F163, F164, F165, F166 |
| `s1.core.models` | F167, F168, F169, F170, F171, F172, F173, F174, F175 |
| `s1.core.economy` | F176, F177, F178, F179, F180, F181 |
| `s1.core.boundaries` | F182, F183, F184, F185, F186, F187, F188, F189, F190, F191 |
| `s1.core.entry` | F192, F193, F046, F084, F047 |

## F001

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 264–417.

```typescript

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const db = database.db
    const events = yield* EventV2.Service
    const projects = yield* ProjectV2.Service
    const execution = yield* SessionExecution.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const global = yield* Global.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
    const encodeMessage = Schema.encodeSync(SessionMessage.Message)
    const isDurableSessionEvent = Schema.is(SessionEvent.Durable)
    const decode = (row: typeof SessionMessageTable.$inferSelect) =>
      decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
        Effect.mapError(
          () =>
            new MessageDecodeError({
              sessionID: SessionSchema.ID.make(row.session_id),
              messageID: SessionMessage.ID.make(row.id),
            }),
        ),
      )

    // Installed hooks on a Session event, through its Location's tool registry: the profile loader and ToolSafety its
    // tool calls use. Only a project with a hooks.json opens its Location for them.
    const hook = Effect.fnUntraced(function* (
      session: SessionSchema.Info,
      event: Pick<ToolSafety.SessionEvent, "operation" | "text" | "messageID">,
    ) {
      const { RelayHookInstall } = yield* Effect.promise(() => import("./relay-hook-install"))
      if (!existsSync(RelayHookInstall.file(global.data, session.projectID))) return []
      const { ToolRegistry } = yield* Effect.promise(() => import("./tool/registry"))
      return yield* ToolRegistry.Service.use((registry) =>
        registry.session({ ...event, sessionID: session.id, ...(session.agent ? { agent: session.agent } : {}) }),
      ).pipe(Effect.provide(locations.get(session.location)))
    })

    // Before admission and interruptible, since an Ask waits for a person: a refused prompt is never admitted. A message
    // ID that already names a durable prompt is left to admission, which reconciles an exact retry or refuses a
    // conflict, without asking again. It reads the Session first, as admission did.
    const promptHooks = Effect.fnUntraced(function* (input: {
      readonly id: SessionMessage.ID
      readonly sessionID: SessionSchema.ID
      readonly prompt: PromptInput.Prompt
    }) {
      const session = yield* result.get(input.sessionID)
      if ((yield* SessionInput.find(db, input.id)) || (yield* store.message(input.id))) return []
      return yield* hook(session, { operation: "prompt", text: input.prompt.text, messageID: input.id }).pipe(
        Effect.catch((error) => {
          const err = error as { _tag?: string; reason?: string; message?: string }
          return Effect.fail(
            new PromptBlockedError({
              sessionID: session.id,
              reason: err._tag === "ToolSafety.Denied" ? (err.reason ?? "relay-hook-location-acquisition") : "relay-hook-location-acquisition",
              detail: err._tag === "ToolSafety.Denied" ? (err.message ?? "Prompt hooks could not be evaluated.") : "Prompt hooks could not be evaluated.",
            }),
          )
        }),
      )
    })

    // Session execution places the Session and hands over its Location's runner.
    const runner = <A, E>(session: SessionSchema.Info, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
      execution.withRunner(session.id, use)

    // Session operations hold the Session as a drain would, so none interleaves with a running turn.
    const exclusive = <A, E>(session: SessionSchema.Info, effect: Effect.Effect<A, E>) =>
      execution
        .exclusive(session.id, effect)
        .pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new BusyError({ sessionID: session.id })),
              onSome: Effect.succeed,
            }),
          ),
        )

    // A turn after recorded context runs in the background; the request that recorded it does not wait for the turn.
    const resumeDetached = (sessionID: SessionSchema.ID) =>
      execution.resume(sessionID).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.logError("Failed to resume Session", cause).pipe(Effect.annotateLogs({ sessionID })),
        ),
        Effect.forkDetach,
        Effect.asVoid,
      )

    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        if (recorded) return recorded
        if (input.parentID) yield* result.get(input.parentID)
        const project = yield* projects.resolve(input.location.directory)
        yield* ProjectV2.record(db, events, project)
        const timestamp = yield* DateTime.now
        const projected = yield* events
          .publish(
            SessionEvent.Created,
            {
              sessionID,
              timestamp,
              projectID: project.id,
              location: input.location,
              subdirectory: RelativePath.make(
                path.relative(project.directory, input.location.directory).replaceAll("\\", "/"),
              ),
              title: `New session - ${DateTime.formatIso(timestamp)}`,
              // Optional event keys must be absent, not undefined, to encode.
              ...(input.parentID ? { parentID: input.parentID } : {}),
              ...(input.agent ? { agent: input.agent } : {}),
              ...(input.model
                ? {
                    model: {
                      id: ModelV2.ID.make(input.model.id),
                      providerID: input.model.providerID,
                      ...(input.model.variant ? { variant: input.model.variant } : {}),
                    },
                  }
                : {}),
            },
            { location: input.location },
          )
          .pipe(
            Effect.as({ type: "created" } as const),
            Effect.catchDefect((defect) => {
              if (!(defect instanceof SessionProjector.SessionAlreadyProjected)) {
                return Effect.die(defect)
              }
              // Concurrent creation lost the projection race. The existing Session identity wins.
              return store
                .get(sessionID)
                .pipe(
                  Effect.flatMap((session) =>
                    session ? Effect.succeed({ type: "existing", session } as const) : Effect.die(defect),
                  ),
                )
            }),
          )
        if (projected.type === "existing") return projected.session
        // TODO: Restore recorded sessions onto replacement synchronized workspaces in a future API slice.
        const created = yield* result.get(sessionID).pipe(Effect.orDie)
        // `session-start` hooks run once a new Session is stored; their outcome never undoes it.
        yield* hook(created, { operation: "session-start" }).pipe(Effect.exit)
        return created
      }),
      get: Effect.fn("V2Session.get")(function* (sessionID) {
        const session = yield* store.get(sessionID)
```

## F002

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 491–518.

```typescript
      prompt: Effect.fn("V2Session.prompt")((input) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const messageID = input.id ?? SessionMessage.ID.create()
            const notes = yield* restore(promptHooks({ ...input, id: messageID }))
            const prompt = resolvePrompt(input.prompt)
            const delivery = input.delivery ?? "steer"
            const expected = { sessionID: input.sessionID, messageID, prompt, delivery }
            const admitted = yield* SessionInput.admit(db, events, {
              id: messageID,
              sessionID: input.sessionID,
              prompt,
              ...(notes.length === 0 ? {} : { promptContext: { reminders: [...notes] } }),
              delivery,
            }).pipe(
              Effect.catchDefect((defect) =>
                defect instanceof SessionInput.LifecycleConflict
                  ? new PromptConflictError({ sessionID: input.sessionID, messageID })
                  : Effect.die(defect),
              ),
            )
            if (!SessionInput.equivalent(admitted, expected))
              return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
            if (input.resume !== false) yield* execution.wake(admitted.sessionID)
            return admitted
          }),
        ),
      ),
```

## F003

`packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — lines 48–160.

```typescript
export const admit = Effect.fn("SessionInput.admit")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
  },
) {
  const existing = yield* find(db, input.id)
  if (existing !== undefined) {
    if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return existing
  }
  const historical = yield* reconcileHistorical(db, input)
  if (historical !== undefined) return historical
  const timestamp = yield* DateTime.now
  return yield* events
    .publish(SessionEvent.PromptAdmitted, {
      messageID: input.id,
      sessionID: input.sessionID,
      timestamp,
      prompt: input.prompt,
      promptContext: input.promptContext,
      delivery: input.delivery,
    })
    .pipe(
      Effect.flatMap((event) =>
        event.durable === undefined
          ? Effect.die("Prompt admission event is missing aggregate sequence")
          : find(db, input.id).pipe(
              Effect.flatMap((stored) =>
                stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
              ),
            ),
      ),
      Effect.catchDefect((defect) =>
        find(db, input.id).pipe(
          Effect.flatMap((stored) =>
            stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
          ),
        ),
      ),
    )
})

// User projections omit delivery. Only their original durable Prompted event can establish it.
const reconcileHistorical = Effect.fn("SessionInput.reconcileHistorical")(function* (
  db: DatabaseService,
  input: Parameters<typeof equivalent>[1] & { readonly id: SessionMessage.ID },
) {
  const version = SessionEvent.Prompted.durable?.version
  if (version === undefined) return yield* Effect.die("Prompted event is not durable")
  return yield* db
    .transaction(
      (tx) =>
        Effect.gen(function* () {
          const existing = yield* find(tx, input.id)
          if (existing !== undefined) {
            if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
            return existing
          }
          const row = yield* tx.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, input.id)).get()
          if (row === undefined) return
          if (row.session_id !== input.sessionID || row.type !== "user")
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const message = Schema.decodeUnknownOption(SessionMessage.User)({ ...row.data, id: row.id, type: row.type })
          const event = yield* tx
            .select()
            .from(EventTable)
            .where(and(eq(EventTable.aggregate_id, row.session_id), eq(EventTable.seq, row.seq)))
            .get()
          if (Option.isNone(message) || event?.type !== Event.versionedType(SessionEvent.Prompted.type, version))
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const provenance = Schema.decodeUnknownOption(SessionEvent.Prompted.data)(event.data)
          if (Option.isNone(provenance)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          const canonical = Admitted.make({
            id: message.value.id,
            sessionID: input.sessionID,
            prompt: Prompt.fromUserMessage(message.value),
            promptContext: message.value.promptContext,
            delivery: provenance.value.delivery,
            timeCreated: message.value.time.created,
            admittedSeq: row.seq,
            promotedSeq: row.seq,
          })
          if (
            provenance.value.messageID !== row.id ||
            !matchesProjection(canonical, { ...provenance.value, timeCreated: provenance.value.timestamp }) ||
            DateTime.toEpochMillis(canonical.timeCreated) !== row.time_created ||
            !equivalent(canonical, input)
          )
            return yield* Effect.die(new LifecycleConflict({ id: input.id }))
          yield* tx
            .insert(SessionInputTable)
            .values({
              id: canonical.id,
              session_id: canonical.sessionID,
              prompt: encodePrompt(canonical.prompt),
              prompt_context: canonical.promptContext,
              delivery: canonical.delivery,
              admitted_seq: row.seq,
              promoted_seq: row.seq,
              time_created: row.time_created,
            })
            .run()
          return canonical
        }),
      { behavior: "immediate" },
    )
    .pipe(Effect.orDie)
```

## F004

`packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — lines 163–252.

```typescript
export const projectAdmitted = Effect.fn("SessionInput.projectAdmitted")(function* (
  db: DatabaseService,
  input: {
    readonly admittedSeq: number
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) {
  const message = yield* db
    .select({ id: SessionMessageTable.id })
    .from(SessionMessageTable)
    .where(eq(SessionMessageTable.id, input.id))
    .get()
    .pipe(Effect.orDie)
  if (message !== undefined) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
  const stored = yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      admitted_seq: input.admittedSeq,
      prompt: encodePrompt(input.prompt),
      prompt_context: input.promptContext,
      delivery: input.delivery,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .onConflictDoNothing()
    .returning({ id: SessionInputTable.id })
    .get()
    .pipe(Effect.orDie)
  if (!stored) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
})

export const projectPrompted = Effect.fn("SessionInput.projectPrompted")(function* (
  db: DatabaseService,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
    readonly promotedSeq: number
  },
) {
  const updated = yield* db
    .update(SessionInputTable)
    .set({ promoted_seq: input.promotedSeq })
    .where(
      and(
        eq(SessionInputTable.id, input.id),
        eq(SessionInputTable.session_id, input.sessionID),
        isNull(SessionInputTable.promoted_seq),
      ),
    )
    .returning()
    .get()
    .pipe(Effect.orDie)
  if (updated) {
    const stored = fromRow(updated)
    if (!matchesProjection(stored, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return
  }

  const stored = yield* find(db, input.id)
  if (stored) {
    if (!matchesProjection(stored, input) || stored.promotedSeq !== input.promotedSeq)
      return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return
  }

  yield* db
    .insert(SessionInputTable)
    .values({
      id: input.id,
      session_id: input.sessionID,
      prompt: encodePrompt(input.prompt),
      prompt_context: input.promptContext,
      delivery: input.delivery,
      admitted_seq: input.promotedSeq,
      promoted_seq: input.promotedSeq,
      time_created: DateTime.toEpochMillis(input.timeCreated),
    })
    .run()
    .pipe(Effect.orDie)
})
```

## F005

`packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — lines 291–390.

```typescript
export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
  input.sessionID === expected.sessionID &&
  JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))

const matchesProjection = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
    readonly timeCreated: DateTime.Utc
  },
) =>
  equivalent(input, expected) &&
  JSON.stringify(input.promptContext) === JSON.stringify(expected.promptContext) &&
  DateTime.toEpochMillis(input.timeCreated) === DateTime.toEpochMillis(expected.timeCreated)

const publish = Effect.fn("SessionInput.publish")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  rows: ReadonlyArray<typeof SessionInputTable.$inferSelect>,
) {
  for (const row of rows) {
    const id = SessionMessage.ID.make(row.id)
    yield* events
      .publish(SessionEvent.Prompted, {
        sessionID,
        timestamp: DateTime.makeUnsafe(row.time_created),
        messageID: id,
        prompt: decodePrompt(row.prompt),
        ...(row.prompt_context === null ? {} : { promptContext: row.prompt_context }),
        delivery: row.delivery,
      })
      .pipe(
        Effect.catchDefect((defect) =>
          defect instanceof LifecycleConflict
            ? find(db, id).pipe(
                Effect.flatMap((stored) => (stored?.promotedSeq === undefined ? Effect.die(defect) : Effect.void)),
              )
            : Effect.die(defect),
        ),
      )
  }
  return rows.length
})

export const promoteSteers = Effect.fn("SessionInput.promoteSteers")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
  cutoff: number,
) {
  const rows = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "steer"),
        lte(SessionInputTable.admitted_seq, cutoff),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .all()
    .pipe(Effect.orDie)
  return yield* publish(db, events, sessionID, rows)
})

export const promoteNextQueued = Effect.fn("SessionInput.promoteNextQueued")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) {
  const row = yield* db
    .select()
    .from(SessionInputTable)
    .where(
      and(
        eq(SessionInputTable.session_id, sessionID),
        isNull(SessionInputTable.promoted_seq),
        eq(SessionInputTable.delivery, "queue"),
      ),
    )
    .orderBy(asc(SessionInputTable.admitted_seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  return row === undefined ? false : yield* publish(db, events, sessionID, [row]).pipe(Effect.as(true))
```

## F006

`packages/core/src/session/sql.ts:21b589483ae47f8d924cc58b8d2377525d381cc0` — lines 133–191.

```typescript
export const SessionMessageTable = sqliteTable(
  "session_message",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    type: text().$type<SessionMessage.Type>().notNull(),
    seq: integer().notNull(),
    ...Timestamps,
    data: text({ mode: "json" }).notNull().$type<SessionMessageData>(),
  },
  (table) => [
    uniqueIndex("session_message_session_seq_idx").on(table.session_id, table.seq),
    index("session_message_session_type_seq_idx").on(table.session_id, table.type, table.seq),
    index("session_message_session_time_created_id_idx").on(table.session_id, table.time_created, table.id),
    index("session_message_time_created_idx").on(table.time_created),
  ],
)

export const SessionInputTable = sqliteTable(
  "session_input",
  {
    id: text().$type<SessionMessage.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    prompt: text({ mode: "json" }).notNull().$type<Prompt>(),
    prompt_context: text({ mode: "json" }).$type<PromptContext.Info>(),
    delivery: text().$type<SessionInput.Delivery>().notNull(),
    admitted_seq: integer().notNull(),
    promoted_seq: integer(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("session_input_session_pending_delivery_seq_idx").on(
      table.session_id,
      table.promoted_seq,
      table.delivery,
      table.admitted_seq,
    ),
    uniqueIndex("session_input_session_admitted_seq_idx").on(table.session_id, table.admitted_seq),
    uniqueIndex("session_input_session_promoted_seq_idx").on(table.session_id, table.promoted_seq),
  ],
)

export const SessionContextEpochTable = sqliteTable("session_context_epoch", {
  session_id: text()
    .$type<SessionSchema.ID>()
    .primaryKey()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  baseline: text().notNull(),
  snapshot: text({ mode: "json" }).notNull().$type<SystemContext.Snapshot>(),
  baseline_seq: integer().notNull(),
})
```

## F007

`packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5` — lines 283–310.

```typescript
    yield* events.project(SessionEvent.Prompted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectPrompted(db, {
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
          promotedSeq: event.durable.seq,
        })
        yield* run(db, event)
      }),
    )
    yield* events.project(SessionEvent.PromptAdmitted, (event) =>
      Effect.gen(function* () {
        if (event.durable === undefined) return yield* Effect.die("Durable Session event is missing aggregate sequence")
        yield* SessionInput.projectAdmitted(db, {
          admittedSeq: event.durable.seq,
          id: event.data.messageID,
          sessionID: event.data.sessionID,
          prompt: event.data.prompt,
          promptContext: event.data.promptContext,
          delivery: event.data.delivery,
          timeCreated: event.data.timestamp,
        })
      }),
```

## F008

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 3–52.

````text
## Current V2 Core Slice

The Effect-native core facade treats prompt recording and execution as separate responsibilities:

```text
sessions.create({ id?, location, ... })
  -> omitted ID generates one internal Session ID
  -> supplied ID creates the Session when absent
  -> reused ID returns the existing Session identity

sessions.prompt({ id?, sessionID, prompt, delivery?, resume? })
  -> omitted ID generates one internal message ID
  -> supplied ID inserts one durable Session inbox row when absent
  -> exact reuse returns the same admission receipt
  -> reusing one message ID for another Session, prompt, or delivery mode fails
  -> exact retry schedules another wake unless resume is false
  -> resume omitted or true schedules execution after admission
  -> resume false admits only

sessions.interrupt(sessionID)
  -> interrupts active execution on this process
  -> waits for runner cleanup and settlement
  -> clears a coalesced follow-up wake already registered with this coordinator
  -> preserves durable inbox rows for a later wake or resume
  -> idle or missing Session is a no-op

sessions.active()
  -> snapshots foreground Session drains owned by this process
  -> returns only active Session IDs with { type: "running" }
  -> absence means inactive; activity is not durable across process restarts
```

`session_input` is the durable admission inbox. `PromptAdmitted` records and projects accepted input so pending queue state can be replayed, replicated, and observed by clients. Admitted inputs remain outside model-visible Session history until the serialized runner publishes `Prompted`. Its projector atomically writes the visible user message and marks the inbox row promoted in the same event transaction. The V1-to-V2 shadow bridge publishes the same `Prompted` event for already-visible V1 prompts.

`admittedSeq` is the durable Session event sequence of `PromptAdmitted`. Clients may use the admission event to represent queued input before `Prompted` makes it part of visible conversation history.

Execution routing starts from only the Session ID:

```text
SessionExecution.resume(sessionID)
-> SessionStore.get(sessionID)
-> LocationServiceMap.get(session.location)
-> SessionRunner.run({ sessionID, force? })
```

`SessionExecution` and the read-side `SessionStore` are process-global. `SessionRunner`, catalog, model resolver, tool registry, permission state, and filesystem are cached per Location. No layer takes a Session ID. An omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.

The local runner issues one explicit `llm.stream(request)` per provider turn, projects each complete local tool call durably before eagerly starting its structured child execution, awaits every started tool fiber after provider-stream closure, and reloads projected history once before continuation. Promoting any new user input resets the selected agent's configured provider-turn allowance; multiple steers promoted at one boundary reset it once. Tool settlement events carry the owning assistant message ID because provider-local call IDs may repeat across turns. Before assembling a provider request, the runner durably fails any local tool still projected as `running` from a previous process with `Tool execution interrupted`; abandoned side effects are never silently replayed.

Projected hosted tools preserve call-side and settlement-side provider metadata separately so settlement and interruption recovery cannot erase continuation identifiers. Provider-native reasoning and provider metadata replay only while the historical assistant model matches the selected continuation model; after a model switch, visible reasoning text remains ordinary assistant text and provider-native metadata is omitted.
````

## F009

`packages/core/src/session/execution.ts:a0af7f2c15cb10366d493b3d4eb971d3d28c1618` — lines 12–53.

```typescript
export interface Interface {
  /** Snapshots active execution owned by this process. */
  readonly active: Effect.Effect<ReadonlySet<SessionSchema.ID>>
  /** Starts execution while idle or joins independently. Opt-in cancellation belongs only to the starter. */
  readonly resume: (sessionID: SessionSchema.ID, options?: ResumeOptions) => Effect.Effect<void, SessionRunner.RunError>
  /** Registers newly recorded work. Repeated wakeups may coalesce. */
  readonly wake: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /** Interrupt active work owned by this process. Idle interruption is a no-op. */
  readonly interrupt: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  /**
   * Runs one Session operation as its active execution, never beside a drain. `None` means the Session was busy; with
   * `wait` it runs once the active execution settles instead.
   */
  readonly exclusive: <A, E>(
    sessionID: SessionSchema.ID,
    effect: Effect.Effect<A, E>,
    options?: { readonly wait?: boolean },
  ) => Effect.Effect<Option.Option<A>, E>
  /** Runs `use` with the runner of the Location the Session is placed in. */
  readonly withRunner: <A, E>(
    sessionID: SessionSchema.ID,
    use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E>
}

/** Routes execution from a Session ID to the runner owned by that Session's Location. */
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionExecution") {}

export const node = LayerNode.unbound(Service, Node.tags.values.global)

/** Low-level compatibility layer for callers that only need durable Session recording. */
export const noopLayer = Layer.succeed(
  Service,
  Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.void,
    wake: () => Effect.void,
    interrupt: () => Effect.void,
    exclusive: (_, effect) => Effect.asSome(effect),
    withRunner: () => Effect.die("No Session runner is placed by the recording-only execution layer"),
  }),
)
```

## F010

`packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad` — lines 10–55.

```typescript
/** Current-process routing for implicit-local Locations. Future remote placement belongs here. */
const layer = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
    })

    return SessionExecution.Service.of({
      active: coordinator.active,
      interrupt: coordinator.interrupt,
      resume: (sessionID, options) => coordinator.run(sessionID, options),
      wake: coordinator.wake,
      exclusive: coordinator.exclusive,
      withRunner: <A, E>(sessionID: SessionSchema.ID, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const session = yield* store.get(sessionID)
          if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
          return yield* SessionRunner.Service.use(use).pipe(
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as E),
          )
        }) as Effect.Effect<A, E, never>,
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecution.Service,
  layer,
  deps: [SessionStore.node, LocationServiceMap.node],
})
```

## F011

`packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — lines 10–153.

```typescript
/** Serializes execution for each key while allowing different keys to run concurrently. */
export interface Coordinator<Key, E> {
  /** Snapshots keys with an execution owned by this coordinator. */
  readonly active: Effect.Effect<ReadonlySet<Key>>
  /** Starts execution while idle or joins the active execution. */
  readonly run: (key: Key, options?: RunOptions) => Effect.Effect<void, E>
  /** Registers one coalesced follow-up after newly recorded work. */
  readonly wake: (key: Key) => Effect.Effect<void>
  /** Stops active execution and waits for its cleanup. */
  readonly interrupt: (key: Key) => Effect.Effect<void>
  /**
   * Runs `effect` as the key's active execution, so it never overlaps a drain: a wake meanwhile drains after it and an
   * interrupt stops it. With an active execution it returns `None` at once, or after that execution when `wait` is set.
   */
  readonly exclusive: <A, E2>(
    key: Key,
    effect: Effect.Effect<A, E2>,
    options?: { readonly wait?: boolean },
  ) => Effect.Effect<Option.Option<A>, E2>
}

type Entry<E> = {
  readonly done: Deferred.Deferred<void, E>
  owner?: Fiber.Fiber<void, never>
  pendingWake: boolean
  stopping: boolean
}

export const make = <Key, E>(options: {
  readonly drain: (key: Key, force: boolean) => Effect.Effect<void, E>
}): Effect.Effect<Coordinator<Key, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const active = new Map<Key, Entry<E>>()
    const fork = yield* FiberSet.makeRuntime<never, void, never>()

    const drain = (key: Key, force: boolean) => Effect.suspend(() => options.drain(key, force))

    const makeEntry = (): Entry<E> => ({
      done: Deferred.makeUnsafe<void, E>(),
      pendingWake: false,
      stopping: false,
    })

    const start = (key: Key, entry: Entry<E>, work: Effect.Effect<void, E>, successor = false) => {
      const ready = Deferred.makeUnsafe<void>()
      const owner = fork(
        (successor ? Effect.yieldNow : Deferred.await(ready)).pipe(
          Effect.andThen(work),
          Effect.onExit((exit) => Effect.sync(() => settle(key, entry, exit))),
          Effect.exit,
          Effect.asVoid,
        ),
      )
      entry.owner = owner
      if (!successor) Deferred.doneUnsafe(ready, Effect.void)
    }

    const settle = (key: Key, entry: Entry<E>, exit: Exit.Exit<void, E>) => {
      if (Exit.isSuccess(exit) && !entry.stopping && entry.pendingWake) {
        entry.pendingWake = false
        start(key, entry, drain(key, false), true)
        return
      }

      const successor = entry.pendingWake ? makeEntry() : undefined
      if (successor === undefined) active.delete(key)
      else {
        active.set(key, successor)
        start(key, successor, drain(key, false), true)
      }
      Deferred.doneUnsafe(entry.done, exit)
    }

    const run = (key: Key, runOptions?: RunOptions): Effect.Effect<void, E> =>
      Effect.uninterruptibleMask((restore) => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (entry.stopping) return restore(Deferred.await(entry.done).pipe(Effect.andThen(run(key, runOptions))))
          return restore(Deferred.await(entry.done))
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, true))
        return restore(Deferred.await(next.done)).pipe(
          Effect.onInterrupt(() => runOptions?.interruptOnCancel ? stop(key, next) : Effect.void),
        )
      })

    const wake = (key: Key) =>
      Effect.sync(() => {
        const entry = active.get(key)
        if (entry !== undefined) {
          entry.pendingWake = true
          return
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, false))
      })

    const exclusive = <A, E2>(
      key: Key,
      effect: Effect.Effect<A, E2>,
      exclusiveOptions?: { readonly wait?: boolean },
    ): Effect.Effect<Option.Option<A>, E2> =>
      Effect.uninterruptibleMask((restore) => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (!exclusiveOptions?.wait) return Effect.succeedNone
          return restore(Deferred.await(entry.done)).pipe(
            Effect.exit,
            Effect.andThen(exclusive(key, effect, exclusiveOptions)),
          )
        }
        const next = makeEntry()
        active.set(key, next)
        const result = Deferred.makeUnsafe<A, E2>()
        // The caller hears the effect's own outcome; the entry only settles ownership, so it never fails.
        start(key, next, effect.pipe(Effect.onExit((exit) => Deferred.done(result, exit)), Effect.ignore))
        // An interrupt that lands before the effect starts settles only the entry.
        const stopped = Deferred.await(next.done).pipe(Effect.exit, Effect.andThen(Effect.interrupt))
        return restore(Effect.raceFirst(Deferred.await(result), stopped)).pipe(Effect.map(Option.some))
      })

    const stop = (key: Key, expected?: Entry<E>): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        // The entry object is process-local ownership. A completed waiter's successor is a different owner.
        if (entry?.owner === undefined || (expected !== undefined && entry !== expected)) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return {
      active: Effect.sync(() => new Set(active.keys())),
      run,
      wake,
      interrupt: (key) => stop(key),
      exclusive,
    }
  })
```

## F012

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 67–115.

```typescript
/**
 * Runs one durable coding-agent Session until it settles.
 *
 * Keep this as orchestration over smaller collaborators rather than rebuilding the legacy
 * `SessionPrompt` monolith. Implement the unchecked items in small reviewed slices:
 *
 * - Session ownership and controls
 *   - [x] Coordinate one local active drain per Session; explicit resumes join and prompt wakeups coalesce.
 *   - [ ] Replace local ownership with durable multi-node ownership when clustered.
 *   - [ ] Mark busy, retrying, idle, interrupted, or terminal-failure status durably.
 *   - [ ] Honor interruption and reject stale work after runtime attachment replacement.
 *   - [x] Honor optional agent step limits.
 *   - [ ] Bound provider retries and repeated identical tool calls.
 *
 * - Runtime context assembly
 *   - Track runtime-context parity with the retired runtime canonically in `docs/specs/v2/session.md`.
 *
 * - One provider turn
 *   - [x] Translate every projected V2 Session message variant into canonical
 *     `@orchestra/llm` messages.
 *   - [ ] Resolve policy-filtered built-in, MCP, plugin, and structured-output tool definitions.
 *   - [x] Stream exactly one `llm.stream(request)` provider turn.
 *   - [x] Persist assistant text and usage events incrementally as they arrive.
 *   - [ ] Persist snapshots, patches, and retry notices incrementally as they arrive.
 *   - [x] Persist reasoning, provider errors, and tool-call events incrementally as they arrive.
 *
 * - Tool settlement and continuation
 *   - [x] Durably record each tool call before side effects begin.
 *   - [x] Authorize and execute recorded local calls through a core-owned registry hook.
 *   - [x] Persist typed success, failure, and provider-executed tool outcomes.
 *   - [x] Start each recorded local call eagerly and await all settlements before continuation.
 *   - [ ] Add scoped runtime context, progress updates, attachment normalization,
 *     plugins, and cancellation settlement.
 *   - [x] Reload projected history and start the next explicit provider turn after local tool results.
 *   - [x] Continue for durable user steering accepted during an active provider turn.
 *   - [ ] Continue for compaction or another continuation condition when required.
 *
 * - Post-run maintenance
 *   - [ ] Settle final status and expose durable output events to replayable consumers.
 *   - [ ] Coalesce streamed deltas and add covering projected-history indexes.
 *   - [ ] Update title, summaries, compaction state, and cleanup in bounded background work.
 *
 * Use `llm.stream(request)` for each provider turn. Keep tool execution and continuation here.
 * Durable continuation recovery remains a separate future slice with an explicit retry policy.
 *
 * The current slice loads V2 history, translates it, resolves a model through a core service, and persists one
 * provider turn. Registry definitions are advertised, local tool calls are settled durably, and an
 * explicit loop starts the next provider turn after local settlement. Configured agent step limits bound the loop.
 */
```

## F013

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 185–270.

```typescript
    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
          // Beside the turn, as the earlier runtime named a Session after its first prompt; a failed title leaves the default one.
          yield* nameSession(session.id).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Session title generation failed", cause).pipe(
                Effect.annotateLogs({ sessionID: session.id }),
              ),
            ),
            Effect.forkDetach,
          )
          // Attachments are read once, as they are promoted; the admitted prompt keeps its URIs.
          yield* SessionDirectCommands.readMentions({ events, reader, mcp, fs }, session.id, yield* SessionInput.promotedAfter(db, session.id, cutoff))
        }
      }
      const system =
        initialized ?? (yield* SessionContextEpoch.prepare(db, events, loadSystemContext(session.id, agent), session.id))
      // An agent whose engine names an execution host runs this provider turn through it (AGENTS "V2 Session Core").
      const engine = yield* engineOf(session)
      const host = engine ? hosts.get(engine) : undefined
      if (engine && !host)
        return yield* Effect.die(new Error(`No execution host is registered for engine ${engine} (agent ${agent.id})`))
      const model = host ? undefined : yield* models.resolve(session)
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const context = entries.map((entry) => entry.message)
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
        Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
      if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
      const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
      if (!isLastStep) yield* mcp.ready()
      const stepTools = narrowStepTools(workflow?.view.tools, workflow?.view.tools?.mcp ? yield* mcp.tools() : {})
      const toolMaterialization = isLastStep ? undefined : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
      const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
      // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
      const messages = model
        ? yield* compaction.transform({
            sessionID: session.id,
            messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
            model,
            tools: toolMaterialization?.definitions ?? [],
          })
        : []
      const request = model && LLM.request({
        model,
        http: {
          headers: SessionRunnerModel.sessionHeaders(model, session.id, session.parentID),
        },
        providerOptions: { openai: { promptCacheKey } },
        system: systemText.map(SystemPart.make),
        messages: [...messages],
        tools: toolMaterialization?.definitions ?? [],
        toolChoice: isLastStep ? "none" : undefined,
      })
```

## F014

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 289–357.

```typescript
      const settle = (call: ToolCall, assistantMessageID: SessionMessage.ID, materialization: ToolRegistry.Materialization) =>
        stepTools.refuses(call.name, call.input) ? Effect.succeed(STEP_TOOL_REFUSAL) : CapabilityInvocation.withContext(
          {
            issuer: "core",
            owner: {
              projectID: location.project.id,
              location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
              sessionID: session.id,
              agentID: agent.id,
            },
            invocation: { sessionID: session.id, agentID: agent.id, assistantMessageID, callID: call.id },
            rootToolName: call.name,
            effectiveRules,
            // Core selection has configured permissions, not a separate native Permission floor.
            nativeDenyFloor: [],
          },
          materialization.settle({ sessionID: session.id, agent: agent.id, model: modelRef, assistantMessageID, call }),
        ).pipe(Effect.catchTag("Capability.Failure", (error) => Effect.die(error)))
      // An Orchestra tool the host's engine invokes: recorded before side effects, settled through the registry like a
      // local call, persisted provider-executed so no continuation turn is scheduled for it.
      const execute: ExecutionHost.Turn["execute"] = (input) =>
        Effect.gen(function* () {
          if (!toolMaterialization) return { result: { type: "error" as const, value: "Tools are disabled after the maximum agent steps" } }
          const call = LLMEvent.toolCall({ ...input, providerExecuted: true, providerMetadata: { orchestra: { executor: "orchestra" } } })
          yield* publish(call)
          const settled = yield* settle(call, yield* publisher.assistantMessageID(call.id), toolMaterialization).pipe(Effect.exit)
          const settlement: ToolRegistry.Settlement =
            settled._tag === "Success"
              ? settled.value
              : { result: { type: "error", value: `Tool execution failed: ${messageOf(Cause.squash(settled.cause))}` } }
          yield* publish(
            LLMEvent.toolResult({ id: call.id, name: call.name, result: settlement.result, output: settlement.output, providerExecuted: true }),
            settlement.outputPaths ?? [],
          )
          return settlement
        })
      // Orchestra's decision on a call the host's engine runs itself: V2 permission with the agent's and Session's rules
      // (an ask is an ordinary request the app answers), then the Location's ToolSafety for the call as Orchestra's tool
      // would see it, and the sandbox a shell command must run under. The jail lives as long as the turn.
      const scope = yield* Scope.Scope
      const authorize: ExecutionHost.Turn["authorize"] = (input) =>
        Effect.gen(function* () {
          if (input.safety && stepTools.refuses(input.safety.tool, input.safety.args)) return yield* new PermissionV2.BlockedError({ rules: stepTools.bash })
          yield* permissions
            .authorize({
              sessionID: session.id,
              agent: agent.id,
              action: input.action,
              resources: [...input.resources],
              metadata: { tool: input.tool, callID: input.callID },
            })
            .pipe(Effect.catchTag("Session.NotFoundError", (error) => Effect.die(error)))
          if (!input.safety) return {}
          const call = input.safety
          return yield* safety.run(
            {
              tool: call.tool,
              args: call.args,
              sessionID: session.id,
              callID: input.callID,
              agent: agent.id,
              directory: location.directory,
              projectID: location.project.id,
              projectDirectory: location.project.directory === "/" ? location.directory : location.project.directory,
            },
            hostedCall(call, location.directory, scope, fs),
            () => Effect.void,
          )
        })
```

## F015

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 427–580.

```typescript
      const source = request
        ? llm.stream(request)
        : host && agent.info
          ? host.stream({
              session,
              agent: agent.info,
              model: modelRef,
              system: systemText,
              context: contextText,
              history: context,
              tools: toolMaterialization?.definitions ?? [],
              execute,
              authorize,
              question: (input) => questions.ask({ sessionID: session.id, questions: input.questions }),
              memory,
              steers,
              consumed: (id) => Effect.sync(() => void liveSteers.delete(id)),
              notify,
              todos: (list) => SessionTodo.write(db, events, { sessionID: session.id, todos: list }),
              state: ExecutionHost.state(db, session.id, host.stateKey),
            })
          : Stream.die("SessionRunner: no provider for this turn")
      const providerStream = source.pipe(
        Stream.runForEach((event) =>
          Effect.gen(function* () {
            if (overflowFailure || publisher.hasProviderError()) return
            if (LLMEvent.is.providerError(event)) {
              if (isContextOverflowFailure(event) && !publisher.hasAssistantStarted()) {
                overflowFailure = event
                return
              }
            }
            yield* publish(event)
            if (event.type !== "tool-call" || event.providerExecuted) return
            if (host || !toolMaterialization) {
              yield* withPublication(
                publisher.failUnsettledTools(
                  host ? "Execution host emitted an unsettled call" : "Tools are disabled after the maximum agent steps",
                ),
              )
              return
            }
            needsContinuation = true
            const assistantMessageID = yield* publisher.assistantMessageID(event.id)
            yield* Effect.uninterruptibleMask((restore) =>
              restore(settle(event, assistantMessageID, toolMaterialization)
              ).pipe(
                Effect.flatMap((settlement) =>
                  publish(
                    LLMEvent.toolResult({
                      id: event.id,
                      name: event.name,
                      result: settlement.result,
                      output: settlement.output,
                    }),
                    settlement.outputPaths ?? [],
                  ),
                ),
              ),
            ).pipe(FiberSet.run(toolFibers))
          }),
        ),
        Effect.ensuring(withPublication(publisher.flush())),
      )

      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const stream = yield* restore(providerStream).pipe(Effect.exit)
          if (liveSteers.size > 0) needsContinuation = true
          const failure =
            stream._tag === "Failure" ? Option.getOrUndefined(Cause.findErrorOption(stream.cause)) : undefined
          if (
            recoverOverflow &&
            model &&
            request &&
            !publisher.hasAssistantStarted() &&
            isContextOverflowFailure(overflowFailure ?? failure) &&
            (yield* restore(recoverOverflow({ sessionID: session.id, entries, model, request })))
          )
            return yield* Effect.die(continueAfterOverflowCompaction(currentStep))
          if (overflowFailure) yield* publish(overflowFailure)
          const llmFailure = failure instanceof LLMError ? failure : undefined
          if (llmFailure && !publisher.hasProviderError()) {
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
            yield* withPublication(publisher.failAssistant(llmFailure.reason.message))
          }
          if (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) yield* FiberSet.clear(toolFibers)
          const settled = yield* restore(awaitToolFibers(toolFibers)).pipe(Effect.exit)
          if (settled._tag === "Failure" && SessionDirectCommands.isUserDeclined(settled.cause)) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            // The app goes idle on step.failed, not on a tool-calls step.ended. The provider has usually finished the step by
            // now, so the assistant is no longer active, yet the step still needs its terminal event.
            yield* withPublication(publisher.failAssistant(INTERRUPTED_TURN))
            return yield* Effect.interrupt
          }
          if (
            (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) ||
            (settled._tag === "Failure" && Cause.hasInterrupts(settled.cause))
          ) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
            if (publisher.hasActiveAssistant()) yield* withPublication(publisher.failAssistant(INTERRUPTED_TURN))
          }
          if (settled._tag === "Failure" && !Cause.hasInterrupts(settled.cause)) {
            const failure = Cause.squash(settled.cause)
            const message = failure instanceof Error ? failure.message : String(failure)
            yield* withPublication(publisher.failUnsettledTools(`Tool execution failed: ${message}`))
          }
          const stepSettlement = publisher.stepSettlement()
          if (stepSettlement && !publisher.hasProviderError()) {
            const endSnapshot = yield* snapshots.capture()
            const files =
              startSnapshot && endSnapshot
                ? yield* snapshots
                    .files({ from: startSnapshot, to: endSnapshot })
                    .pipe(Effect.catch(() => Effect.succeed(undefined)))
                : undefined
            yield* withPublication(
              events.publish(SessionEvent.Step.Ended, {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                assistantMessageID: yield* publisher.startAssistant(),
                finish: stepSettlement.finish,
                // What the provider or host reported, else the model's price list over the settled tokens.
                cost: stepSettlement.cost ?? (model ? SessionRunnerModel.cost(SessionRunnerModel.pricing(model), stepSettlement.tokens) : 0),
                tokens: stepSettlement.tokens,
                usageKnown: stepSettlement.usageKnown,
                snapshot: endSnapshot,
                files,
              }),
            )
            yield* compaction.afterStep({
              sessionID: session.id,
              tokens: stepSettlement.tokens,
              model: modelRef,
              ...(stepSettlement.contextWindow === undefined ? {} : { contextWindow: stepSettlement.contextWindow }),
            })
          }
          if (publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
          if (stream._tag === "Success" && !publisher.hasProviderError())
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
          if (stream._tag === "Failure") return yield* Effect.failCause(stream.cause)
          if (settled._tag === "Failure" && Cause.hasInterrupts(settled.cause))
            return yield* Effect.failCause(settled.cause)
          const workflowContinues = workflow ? yield* RelayWorkflowSession.settle({
            current: workflow, assistantMessageID: yield* publisher.startAssistant(),
            succeeded: settled._tag === "Success" && !!stepSettlement && !publisher.hasProviderError() &&
              !["unknown", "error", "content-filter"].includes(stepSettlement.finish),
          }).pipe(Effect.provide(workflowContext), Effect.orDie) : false
          return { needsContinuation: workflow ? workflowContinues : !publisher.hasProviderError() && needsContinuation, step: currentStep }
        }),
      )
```

## F016

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 616–682.

```typescript
    const drain = Effect.fn("SessionRunner.run")(function* (input: {
      readonly sessionID: SessionSchema.ID
      readonly force: boolean
    }) {
      const hasSteer = yield* SessionInput.hasPending(db, input.sessionID, "steer")
      const hasQueue = hasSteer ? false : yield* SessionInput.hasPending(db, input.sessionID, "queue")
      if (!input.force && !hasSteer && !hasQueue) return
      // `session-idle` hooks run once the drain ends, settled, failed or interrupted; they only record, so the drain ends
      // as it would have.
      yield* Effect.addFinalizer(() => tools.session({ operation: "session-idle", sessionID: input.sessionID }).pipe(Effect.exit))
      yield* SessionDirectCommands.failInterruptedTools({ events, store }, input.sessionID)
      let promotion: SessionInput.Delivery | undefined = hasSteer ? "steer" : hasQueue ? "queue" : undefined
      let shouldRun = input.force || hasSteer || hasQueue
      while (shouldRun) {
        let needsContinuation = true
        let step = 1
        while (needsContinuation) {
          const result = yield* runTurn(input.sessionID, promotion, step)
          needsContinuation = result.needsContinuation
          step = result.step + 1
          promotion = "steer"
          if (!needsContinuation) needsContinuation = yield* SessionInput.hasPending(db, input.sessionID, "steer")
        }
        shouldRun = yield* SessionInput.hasPending(db, input.sessionID, "queue")
        promotion = shouldRun ? "queue" : undefined
      }
    }, Effect.scoped)

    // A drain that fails outside a provider turn (no model, an unsupported API, a blocked context) would otherwise
    // leave the person waiting with nothing on screen. It is recorded as a failed assistant step, as the earlier runtime recorded the
    // error on the turn; a provider failure has already failed its own step.
    const recordFailure = Effect.fnUntraced(function* (sessionID: SessionSchema.ID, cause: Cause.Cause<unknown>) {
      if (Cause.hasInterruptsOnly(cause)) return
      const failure = Cause.squash(cause)
      if (failure instanceof LLMError) return
      const session = yield* store.get(sessionID)
      if (!session) return
      const agent = yield* agents.select(session.agent)
      const assistantMessageID = SessionMessage.ID.create()
      yield* events.publish(SessionEvent.Step.Started, {
        sessionID,
        timestamp: yield* DateTime.now,
        assistantMessageID,
        agent: agent.id,
        model: session.model ??
          agent.info?.model ?? { id: ModelV2.ID.make("unknown"), providerID: ProviderV2.ID.make("unknown") },
      })
      yield* events.publish(SessionEvent.Step.Failed, {
        sessionID,
        timestamp: yield* DateTime.now,
        assistantMessageID,
        error: { type: "unknown", message: failure instanceof Error && failure.message ? failure.message : String(failure) },
      })
    })

    // Stop interrupts the drain. The turn ends, so its open permission and question requests end with it.
    const run = (input: { readonly sessionID: SessionSchema.ID; readonly force: boolean }) =>
      drain(input).pipe(
        Effect.tapCause((cause) =>
          recordFailure(input.sessionID, cause).pipe(Effect.catchCause(() => Effect.void)),
        ),
        Effect.onInterrupt(() =>
          permissions
            .cancelSession(input.sessionID)
            .pipe(Effect.andThen(questions.cancelSession(input.sessionID))),
        ),
      )
```

## F017

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 22–52.

````text
sessions.interrupt(sessionID)
  -> interrupts active execution on this process
  -> waits for runner cleanup and settlement
  -> clears a coalesced follow-up wake already registered with this coordinator
  -> preserves durable inbox rows for a later wake or resume
  -> idle or missing Session is a no-op

sessions.active()
  -> snapshots foreground Session drains owned by this process
  -> returns only active Session IDs with { type: "running" }
  -> absence means inactive; activity is not durable across process restarts
```

`session_input` is the durable admission inbox. `PromptAdmitted` records and projects accepted input so pending queue state can be replayed, replicated, and observed by clients. Admitted inputs remain outside model-visible Session history until the serialized runner publishes `Prompted`. Its projector atomically writes the visible user message and marks the inbox row promoted in the same event transaction. The V1-to-V2 shadow bridge publishes the same `Prompted` event for already-visible V1 prompts.

`admittedSeq` is the durable Session event sequence of `PromptAdmitted`. Clients may use the admission event to represent queued input before `Prompted` makes it part of visible conversation history.

Execution routing starts from only the Session ID:

```text
SessionExecution.resume(sessionID)
-> SessionStore.get(sessionID)
-> LocationServiceMap.get(session.location)
-> SessionRunner.run({ sessionID, force? })
```

`SessionExecution` and the read-side `SessionStore` are process-global. `SessionRunner`, catalog, model resolver, tool registry, permission state, and filesystem are cached per Location. No layer takes a Session ID. An omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.

The local runner issues one explicit `llm.stream(request)` per provider turn, projects each complete local tool call durably before eagerly starting its structured child execution, awaits every started tool fiber after provider-stream closure, and reloads projected history once before continuation. Promoting any new user input resets the selected agent's configured provider-turn allowance; multiple steers promoted at one boundary reset it once. Tool settlement events carry the owning assistant message ID because provider-local call IDs may repeat across turns. Before assembling a provider request, the runner durably fails any local tool still projected as `running` from a previous process with `Tool execution interrupted`; abandoned side effects are never silently replayed.

Projected hosted tools preserve call-side and settlement-side provider metadata separately so settlement and interruption recovery cannot erase continuation identifiers. Provider-native reasoning and provider metadata replay only while the historical assistant model matches the selected continuation model; after a model switch, visible reasoning text remains ordinary assistant text and provider-native metadata is omitted.
````

## F018

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 212–219.

```text
### Current Runner Follow-Ups

- Keep eager structured local-tool settlement: durably record each complete call, start its child execution immediately, await all started settlements after provider-turn consumption, persist every result, and reload history once before continuation.
- Buffer or coalesce streamed deltas before rewriting growing assistant projections.
- Revisit additional covering indexes as larger-history query shapes become concrete.
- Design any global multi-Session event stream separately; the finite history API deliberately reads one authorized Session aggregate and does not change global Event publication.
- Decide whether UI-facing Session subscriptions should optionally interleave ephemeral deltas while connected without advancing the durable cursor.
- Add provider-aware context control for provider-executed tool results. Generic text truncation cannot replace provider-native structured payloads that must round-trip exactly.
```

## F019

`packages/core/src/database/database.ts:aa519134efff085e960affd9be376b0dc92456e1` — lines 17–67.

```typescript
export interface Interface {
  db: DatabaseShape
  /** Stable store namespace; in-memory databases intentionally receive independent identities. */
  storageID?: string
  /** Captures this database's actual SQL client's ambient transaction key. */
  inTransaction?: Effect.Effect<boolean>
}

const Filename = Context.Reference<string>("@orchestra/Database/Filename", { defaultValue: () => path() })

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase
    const client = yield* SqlClient

    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

    const filename = yield* Filename
    return { db, inTransaction: Effect.serviceOption(client.transactionService).pipe(Effect.map(Option.isSome)),
      storageID: filename === ":memory:" ? randomUUID()
      : createHash("sha256").update(resolve(filename)).digest("hex") }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })), Layer.provide(Layer.succeed(Filename, filename)))
}

export function path() {
  if (Flag.ORCHESTRA_DB) {
    if (Flag.ORCHESTRA_DB === ":memory:" || isAbsolute(Flag.ORCHESTRA_DB)) return Flag.ORCHESTRA_DB
    return join(Global.Path.data, Flag.ORCHESTRA_DB)
  }
  return releasePath()
}

/** The database used by release channels (the installed app). */
export function releasePath() {
  return join(Global.Path.data, "orchestra.db")
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
```

## F020

`packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7` — lines 13–168.

```typescript
const lock = Semaphore.makeUnsafe(1)
const KEEP_BACKUPS = 3

export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}

export function apply(db: Database, input: Migration[] = migrations) {
  return lock.withPermit(
    Effect.gen(function* () {
      const tables = yield* db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      if (tables.some((table) => table.name === "session")) return yield* applyExisting(db, input)
      if (tables.length > 0) return yield* Effect.die("Database is not empty and has no session table")
      // IMMEDIATE takes the write lock up front, so a second process (CLI and desktop share one database file)
      // waits here instead of both creating the schema; the check inside the lock sees what the first one did.
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const created = yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)
          if (created) return
          yield* schema.up(tx)
          yield* tx.run(
            sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
          )
          yield* Effect.forEach(input, (migration) =>
            tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            ),
          )
        }),
        { behavior: "immediate" },
      )
    }),
  )
}

/**
 * Opens an already-initialised database safely: refuses a schema written by a newer build, and takes a consistent
 * backup before any pending migration runs so a destructive migration can be undone by restoring the copy.
 */
function applyExisting(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    const hasJournal = yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration'`)
    const applied = hasJournal
      ? (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")} ORDER BY id`)).map((row) => row.id)
      : []
    const known = new Set(input.map((migration) => migration.id))
    const unknown = applied.filter((id) => !known.has(id))
    if (unknown.length > 0)
      return yield* Effect.die(
        new Error(
          `This database was created by a newer Orchestra version (it has migrations this build does not know: ${unknown.join(", ")}). Update the app before opening it.`,
        ),
      )
    if (input.every((migration) => applied.includes(migration.id))) return
    yield* backup(db, applied.at(-1) ?? "legacy")
    yield* applyOnly(db, input)
  })
}

function backup(db: Database, from: string) {
  return Effect.gen(function* () {
    const file = (yield* db.all<{ file: string | null }>(sql`SELECT file FROM pragma_database_list WHERE name = 'main'`))[0]?.file
    if (!file) return
    const target = `${file}.backup-${from}-${Date.now()}`
    yield* db.run(sql`VACUUM INTO ${target}`).pipe(
      Effect.mapError((error) => new Error(`Could not back up the database before migrating, nothing was changed: ${error}`)),
    )
    prune(file)
  })
}

function prune(file: string) {
  const prefix = `${basename(file)}.backup-`
  readdirSync(dirname(file))
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ name, time: Number(name.slice(name.lastIndexOf("-") + 1)) }))
    .sort((a, b) => b.time - a.time)
    .slice(KEEP_BACKUPS)
    .forEach((old) => rmSync(join(dirname(file), old.name), { force: true }))
}

export function applyOnly(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
    )
    let completed = new Set(
      (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
    )
    if (completed.size === 0) {
      // Existing installs used Drizzle's migration journal. Seed the new
      // journal once so TypeScript migrations don't replay old SQL.
      if (
        yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${"__drizzle_migrations"}`)
      ) {
        const named = (yield* db.all<{ name: string }>(
          sql`SELECT name FROM pragma_table_info('__drizzle_migrations')`,
        )).some((column) => column.name === "name")

        if (named) {
          yield* db.run(sql`
            INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
            SELECT name, ${Date.now()}
            FROM ${sql.identifier("__drizzle_migrations")}
            WHERE name IS NOT NULL
          `)
        }

        if (!named) {
          const entries = yield* db.all<{ created_at: number; prefix: string | null }>(sql`
            SELECT created_at, strftime('%Y%m%d%H%M%S', created_at / 1000, 'unixepoch') AS prefix
            FROM ${sql.identifier("__drizzle_migrations")}
            WHERE created_at IS NOT NULL
          `)

          for (const entry of entries) {
            const migration = input.find((item) => item.id.startsWith(`${entry.prefix}_`))
            if (!migration) {
              return yield* Effect.die(
                new Error(`Legacy migration timestamp ${entry.created_at} does not match any known migration`),
              )
            }
            yield* db.run(sql`
              INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
              VALUES (${migration.id}, ${Date.now()})
            `)
          }
        }
        completed = new Set(
          (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
        )
      }
    }

    for (const migration of input) {
      if (completed.has(migration.id)) continue
      // The semaphore only serialises this process. IMMEDIATE makes another process (CLI and desktop share the
      // database file) wait for the write lock, and the journal is read again inside it, so a migration the other
      // process just applied is skipped instead of failing on a duplicate column.
      yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            const done = yield* tx.get(sql`SELECT id FROM ${sql.identifier("migration")} WHERE id = ${migration.id}`)
            if (done) return
            yield* migration.up(tx)
            yield* tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            )
          }),
        { behavior: "immediate" },
      )
    }
  })
```

## F021

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 124–165.

```typescript
export interface PublishOptions {
  readonly id?: ID
  readonly metadata?: Record<string, unknown>
  readonly location?: Location.Ref
  /** Local operational projection committed atomically with a new durable event. Not replayed or serialized. */
  readonly commit?: (seq: number) => Effect.Effect<void>
  /**
   * When false, the durable event is projected locally but NOT persisted to the
   * event table or sequence. The payload is still notified to in-process
   * listeners (SSE, UI) but carries no `durable` envelope, so cross-instance
   * sync does not observe it. Cannot be combined with `commit`. Defaults to
   * true (full event sourcing).
   */
  readonly persist?: boolean
}

export interface Interface {
  readonly publish: <D extends Definition>(
    definition: D,
    data: Data<D>,
    options?: PublishOptions,
  ) => Effect.Effect<Payload<D>>
  readonly subscribe: <D extends Definition>(definition: D) => Stream.Stream<Payload<D>>
  readonly all: () => Stream.Stream<Payload>
  readonly durable: (input: { readonly aggregateID: string; readonly after?: number }) => Stream.Stream<Payload>
  /** @deprecated Use `all()` and consume the returned stream. */
  readonly listen: (listener: Subscriber) => Effect.Effect<Unsubscribe>
  readonly project: <D extends Definition>(definition: D, projector: Projector<D>) => Effect.Effect<void>
  readonly replay: (
    event: SerializedEvent,
    options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
  ) => Effect.Effect<void>
  readonly replayAll: (
    events: SerializedEvent[],
    options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
  ) => Effect.Effect<string | undefined>
  readonly remove: (aggregateID: string) => Effect.Effect<void>
  readonly claim: (aggregateID: string, ownerID: string) => Effect.Effect<void>
  readonly verifySealWindow: (
    input: EventSeal.SealWindowInput,
  ) => Effect.Effect<EventSeal.SealWindowResult, EventSeal.SealWindowError>
}
```

## F022

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 187–205.

```typescript
export const layerWith = (options?: LayerOptions) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const pubsub = {
        all: yield* PubSub.unbounded<Payload>(),
        durable: new Map<string, Set<PubSub.PubSub<void>>>(),
        typed: new Map<string, PubSub.PubSub<Payload>>(),
      }
      const projectors = new Map<string, Projector[]>()
      // TODO: Bind durable projectors to exact type+version before supporting incompatible historical payloads.
      const listeners = new Array<Subscriber>()
      const { db } = yield* Database.Service

      const getOrCreate = (definition: Definition) =>
        Effect.gen(function* () {
          const existing = pubsub.typed.get(definition.type)
          if (existing) return existing
          const created = yield* PubSub.unbounded<Payload>()
```

## F023

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 290–435.

```typescript
              return yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const committed = yield* db
                    .transaction(
                      () =>
                        Effect.gen(function* () {
                          if (
                            input &&
                            (yield* db
                              .get(sql`SELECT name FROM data_migration WHERE name = ${SNAPSHOT_COMPACTION_MARKER}`)
                              .pipe(Effect.orDie))
                          )
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: "Workspace sync disabled after snapshot compaction",
                              }),
                            )
                          const row = yield* db
                            .select({ seq: EventSequenceTable.seq, ownerID: EventSequenceTable.owner_id })
                            .from(EventSequenceTable)
                            .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                            .get()
                            .pipe(Effect.orDie)
                          const latest = row?.seq ?? -1
                          const encoded = Schema.encodeUnknownSync(definition.data)(event.data) as Record<
                            string,
                            unknown
                          >
                          if (input?.strictOwner && row?.ownerID && row.ownerID !== input.ownerID) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay owner mismatch for aggregate ${aggregateID}: expected ${row.ownerID}, got ${input.ownerID ?? "none"}`,
                              }),
                            )
                          }
                          if (input && input.seq <= latest) {
                            const stored = yield* db
                              .select()
                              .from(EventTable)
                              .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, input.seq)))
                              .get()
                              .pipe(Effect.orDie)
                            if (
                              stored?.id === event.id &&
                              stored.type === versionedType(definition.type, durable.version) &&
                              isDeepStrictEqual(stored.data, encoded)
                            ) {
                              if (input.ownerID && row?.ownerID == null) {
                                yield* db
                                  .update(EventSequenceTable)
                                  .set({ owner_id: input.ownerID })
                                  .where(eq(EventSequenceTable.aggregate_id, aggregateID))
                                  .run()
                                  .pipe(Effect.orDie)
                              }
                              return
                            }
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Replay diverged at aggregate ${aggregateID} sequence ${input.seq}`,
                              }),
                            )
                          }
                          if (input && row?.ownerID && row.ownerID !== input.ownerID) {
                            return
                          }
                          const seq = input?.seq ?? latest + 1
                          if (input && seq !== latest + 1) {
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Sequence mismatch for aggregate ${aggregateID}: expected ${latest + 1}, got ${seq}`,
                              }),
                            )
                          }
                          const stored = yield* db
                            .select({ aggregateID: EventTable.aggregate_id, seq: EventTable.seq })
                            .from(EventTable)
                            .where(eq(EventTable.id, event.id))
                            .get()
                            .pipe(Effect.orDie)
                          if (stored)
                            yield* Effect.die(
                              new InvalidDurableEventError({
                                type: event.type,
                                message: `Event ${event.id} already exists at aggregate ${stored.aggregateID} sequence ${stored.seq}`,
                              }),
                            )
                          const committed = {
                            ...event,
                            durable: { aggregateID, seq, version: durable.version },
                          } as Payload
                          for (const projector of list) {
                            yield* projector(committed, origin)
                          }
                          if (commit) yield* commit(seq)
                          yield* db
                            .insert(EventSequenceTable)
                            .values([{ aggregate_id: aggregateID, seq, owner_id: input?.ownerID }])
                            .onConflictDoUpdate({
                              target: EventSequenceTable.aggregate_id,
                              set: {
                                seq,
                                ...(input?.ownerID && row?.ownerID == null ? { owner_id: input.ownerID } : {}),
                              },
                            })
                            .run()
                            .pipe(Effect.orDie)
                          const predecessor = yield* db
                            .select(EventSeal.columns)
                            .from(EventTable)
                            .where(and(eq(EventTable.aggregate_id, aggregateID), eq(EventTable.seq, latest)))
                            .get()
                            .pipe(Effect.orDie)
                          // Materialize JSON once so user toJSON values cannot change between sealing and storage.
                          const record = {
                            id: event.id,
                            aggregate_id: aggregateID,
                            seq,
                            type: versionedType(definition.type, durable.version),
                            data: Schema.decodeUnknownSync(
                              Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
                            )(JSON.stringify(encoded)),
                          }
                          yield* db
                            .insert(EventTable)
                            .values([{ ...record, ...EventSeal.sealRow(record, predecessor) }])
                            .run()
                            .pipe(Effect.orDie)
                          return { aggregateID, seq }
                        }),
                      { behavior: "immediate" },
                    )
                    .pipe(Effect.orDie)
                  if (committed) {
                    yield* Effect.forEach(
                      pubsub.durable.get(committed.aggregateID) ?? [],
                      (wake) => PubSub.publish(wake, undefined),
                      { discard: true },
                    )
                  }
                  return committed
                }),
```

## F024

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 449–460.

```typescript
          if (!persist && commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Local commit hooks cannot be combined with persist:false",
              }),
            )
          if (!definition?.durable && commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Local commit hooks require a durable event",
```

## F025

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 527–563.

```typescript
      function replay(
        event: SerializedEvent,
        options?: { readonly publish?: boolean; readonly ownerID?: string; readonly strictOwner?: boolean },
      ) {
        return Effect.gen(function* () {
          const definition = Durable.get(event.type)
          if (!definition?.durable) {
            yield* Effect.die(
              new InvalidDurableEventError({ type: event.type, message: `Unknown durable event type ${event.type}` }),
            )
          } else {
            const payload = {
              id: event.id,
              type: definition.type,
              data: Schema.decodeUnknownSync(definition.data)(event.data),
            } as Payload
            const committed = yield* commitDurableEvent(definition, payload, {
              seq: event.seq,
              aggregateID: event.aggregateID,
              ownerID: options?.ownerID,
              strictOwner: options?.strictOwner,
            })
            if (!committed) return
            const result = {
              ...payload,
              durable: {
                aggregateID: committed.aggregateID,
                seq: committed.seq,
                version: definition.durable.version,
              },
            } as Payload
            if (options?.publish) yield* notify(result, true)
            return result
          }
        })
      }

```

## F026

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 621–699.

```typescript
      function claim(aggregateID: string, ownerID: string) {
        return db
          .update(EventSequenceTable)
          .set({ owner_id: ownerID })
          .where(eq(EventSequenceTable.aggregate_id, aggregateID))
          .run()
          .pipe(Effect.orDie)
      }

      const subscribe = <D extends Definition>(definition: D): Stream.Stream<Payload<D>> =>
        Stream.unwrap(getOrCreate(definition).pipe(Effect.map((pubsub) => Stream.fromPubSub(pubsub)))).pipe(
          Stream.map((event) => event as Payload<D>),
        )

      const streamAll = (): Stream.Stream<Payload> => Stream.fromPubSub(pubsub.all)

      const readAfter = (aggregateID: string, after: number) =>
        (options?.beforeAggregateRead?.(aggregateID) ?? Effect.void).pipe(
          Effect.andThen(
            db
              .select()
              .from(EventTable)
              .where(and(eq(EventTable.aggregate_id, aggregateID), gt(EventTable.seq, after)))
              .orderBy(asc(EventTable.seq))
              .all(),
          ),
          Effect.orDie,
          Effect.map((rows) =>
            rows.map((event) =>
              decodeSerializedEvent({
                id: event.id,
                aggregateID: event.aggregate_id,
                seq: event.seq,
                type: event.type,
                data: event.data,
              }),
            ),
          ),
        )

      const subscribeDurable = (aggregateID: string) =>
        Effect.gen(function* () {
          const wake = yield* PubSub.sliding<void>(1)
          const subscription = yield* PubSub.subscribe(wake)
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const wakes = pubsub.durable.get(aggregateID) ?? new Set()
              wakes.add(wake)
              pubsub.durable.set(aggregateID, wakes)
            }),
            () =>
              Effect.sync(() => {
                const wakes = pubsub.durable.get(aggregateID)
                wakes?.delete(wake)
                if (wakes?.size === 0) pubsub.durable.delete(aggregateID)
              }).pipe(Effect.andThen(PubSub.shutdown(wake))),
          )
          return subscription
        })

      const durable = (input: { readonly aggregateID: string; readonly after?: number }): Stream.Stream<Payload> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const wakes = yield* subscribeDurable(input.aggregateID)
            let sequence = input.after ?? -1
            const read = Effect.suspend(() => readAfter(input.aggregateID, sequence)).pipe(
              Effect.tap((events) =>
                Effect.sync(() => {
                  sequence = events.at(-1)?.durable?.seq ?? sequence
                }),
              ),
            )
            const historical = yield* read
            const live = Stream.fromSubscription(wakes).pipe(
              Stream.mapEffect(() => read),
              Stream.flattenIterable,
            )
            return Stream.concat(Stream.fromIterable(historical), live)
          }),
```

## F027

`packages/core/src/session/store.ts:1e44d051f1a51b816bfeb96ce46dbc0747d07aff` — lines 15–105.

```typescript
export interface Interface {
  readonly get: (sessionID: SessionSchema.ID) => Effect.Effect<SessionSchema.Info | undefined>
  readonly context: (sessionID: SessionSchema.ID) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  readonly runnerContext: (
    sessionID: SessionSchema.ID,
    baselineSeq: number,
  ) => Effect.Effect<SessionMessage.Message[], MessageDecodeError>
  /** Every stored message in order with its sequence, including history behind the latest compaction. */
  readonly entries: (
    sessionID: SessionSchema.ID,
  ) => Effect.Effect<ReadonlyArray<{ readonly seq: number; readonly message: SessionMessage.Message }>, MessageDecodeError>
  readonly message: (
    messageID: SessionMessage.ID,
  ) => Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly message: SessionMessage.Message } | undefined>
  /** The Session's own permission rules as V2 rules; empty for none or an unknown Session. */
  readonly permissions: (sessionID: SessionSchema.ID) => Effect.Effect<Permission.Ruleset>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionStore") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)

    return Service.of({
      get: Effect.fn("SessionStore.get")(function* (sessionID) {
        const row = yield* db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
        return row ? fromRow(row) : undefined
      }),
      context: Effect.fn("SessionStore.context")(function* (sessionID) {
        return yield* SessionHistory.load(db, sessionID)
      }),
      runnerContext: Effect.fn("SessionStore.runnerContext")(function* (sessionID, baselineSeq) {
        return yield* SessionHistory.loadForRunner(db, sessionID, baselineSeq)
      }),
      entries: Effect.fn("SessionStore.entries")(function* (sessionID) {
        const rows = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.session_id, sessionID))
          .orderBy(asc(SessionMessageTable.seq))
          .all()
          .pipe(Effect.orDie)
        return yield* Effect.forEach(rows, (row) =>
          decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
            Effect.map((message) => ({ seq: row.seq, message })),
            Effect.mapError(
              () =>
                new MessageDecodeError({
                  sessionID: SessionSchema.ID.make(row.session_id),
                  messageID: SessionMessage.ID.make(row.id),
                }),
            ),
          ),
        )
      }),
      message: Effect.fn("SessionStore.message")(function* (messageID) {
        const row = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID))
          .get()
          .pipe(Effect.orDie)
        return row
          ? {
              sessionID: SessionSchema.ID.make(row.session_id),
              message: yield* decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(Effect.orDie),
            }
          : undefined
      }),
      permissions: Effect.fn("SessionStore.permissions")(function* (sessionID) {
        const row = yield* db
          .select({ permission: SessionTable.permission })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        // The column keeps legacy rule fields.
        return (row?.permission ?? []).map((rule) => ({
          action: rule.permission,
          resource: rule.pattern,
          effect: rule.action,
        }))
      }),
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })
```

## F028

`packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — lines 10–17.

```typescript
export const GENESIS = "0".repeat(64)
type Row = Pick<typeof EventTable.$inferSelect, "id" | "aggregate_id" | "seq" | "type" | "data">
type Seal = Pick<typeof EventTable.$inferSelect, "seal_version" | "seal_prev" | "seal_hash">
const MAX_ROWS = 2048
const MAX_BYTES = 8 * 1024 * 1024
// Corrupt metadata must not turn a bounded payload read into an unbounded allocation.
// Validate storage type/raw bytes before bounded extraction; TEXT substr hides NUL suffixes.
export const columns = {
```

## F029

`packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — lines 68–100.

```typescript
export function sealRow(row: Row, predecessor?: Seal) {
  const previous = predecessor && isSealed(predecessor) ? predecessor.seal_hash : GENESIS
  return { seal_version: 1, seal_prev: previous, seal_hash: hashRow(row, previous) }
}

export function isSealed(seal: Seal): seal is Seal & { seal_version: 1; seal_prev: string; seal_hash: string } {
  return seal.seal_version === 1 && isHash(seal.seal_prev) && isHash(seal.seal_hash)
}

export function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
}

const DOMAIN = "orchestra:event-seal:v1"
// Rows sealed before the rename are hashed into the stored chain under this domain, so verification still accepts it.
const LEGACY_DOMAIN = "opencode:event-seal:v1"

export function hashRow(row: Row, previous: string, domain = DOMAIN) {
  return createHash("sha256")
    .update(`${domain}\n${previous}\n${canonicalRow(row)}`)
    .digest("hex")
}

export function canonicalRow(row: Row) {
  // Normalize exactly as SQLite JSON storage does (toJSON, omitted undefined, finite scalars).
  return canonical(
    JSON.parse(
      JSON.stringify({ id: row.id, aggregate_id: row.aggregate_id, seq: row.seq, type: row.type, data: row.data }),
    ),
  )
}

export const verifyWindow = Effect.fn("EventSeal.verifyWindow")(function* (
```

## F030

`packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — lines 113–174.

```typescript
  if (input.toSeq - input.fromSeq + 1 > MAX_ROWS)
    return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows" })
  return yield* db
    .transaction((tx) =>
      Effect.gen(function* () {
        const head = yield* tx
          .select({
            seq: sql<number>`CASE WHEN typeof(${EventSequenceTable.seq}) = 'integer' AND ${EventSequenceTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventSequenceTable.seq} ELSE -1 END`,
          })
          .from(EventSequenceTable)
          .where(eq(EventSequenceTable.aggregate_id, input.aggregateID))
          .get()
        const tail = yield* tx
          .select({
            seq: sql<number>`CASE WHEN typeof(${EventTable.seq}) = 'integer' AND ${EventTable.seq} BETWEEN 0 AND ${Number.MAX_SAFE_INTEGER} THEN ${EventTable.seq} ELSE -1 END`,
          })
          .from(EventTable)
          .where(eq(EventTable.aggregate_id, input.aggregateID))
          .orderBy(desc(EventTable.seq))
          .limit(1)
          .get()
        const scope = and(
          eq(EventTable.aggregate_id, input.aggregateID),
          gte(EventTable.seq, input.fromSeq),
          lte(EventTable.seq, input.toSeq),
        )
        // Preflight raw bytes before materializing JSON. Canonical bytes are checked again below.
        const size = yield* windowSize(tx, input)
        if ((size?.rows ?? 0) > MAX_ROWS || (size?.bytes ?? 0) > MAX_BYTES)
          return yield* new SealWindowError({ code: "OVERFLOW", message: "Seal window exceeds 2048 rows or 8 MiB" })
        const predecessor =
          input.fromSeq === 0
            ? undefined
            : yield* tx
                .select({
                  seq: EventTable.seq,
                  ...columns,
                })
                .from(EventTable)
                .where(and(eq(EventTable.aggregate_id, input.aggregateID), eq(EventTable.seq, input.fromSeq - 1)))
                .get()
        const compacted = Boolean(
          yield* tx.get(sql`SELECT 1 FROM data_migration WHERE name = ${SNAPSHOT_COMPACTION_MARKER}`),
        )
        const rows = yield* tx
          .select({
            id: EventTable.id,
            aggregate_id: EventTable.aggregate_id,
            seq: EventTable.seq,
            type: EventTable.type,
            data: EventTable.data,
            ...columns,
          })
          .from(EventTable)
          .where(scope)
          .orderBy(asc(EventTable.seq))
          .limit(MAX_ROWS + 1)
          .all()
        return yield* Effect.try({
          try: () => {
            if (rows.reduce((total, row) => total + Buffer.byteLength(canonicalRow(row), "utf8"), 0) > MAX_BYTES)
              throw new SealWindowError({ code: "OVERFLOW", message: "Canonical seal window exceeds 8 MiB" })
```

## F031

`packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65` — lines 7–38.

```text
- `database.ts` opens the database in WAL mode and picks its path. `sqlite.ts` is the driver interface, with `sqlite.bun.ts` and `sqlite.node.ts` as the two implementations.
- `migration.ts` runs the migrations listed in `migration.gen.ts`; the migration bodies are in `packages/core/src/database/migration`.
- `schema.sql.ts` holds the tables owned by this folder; other domains define their own in `sql.ts` files.

## Public entry points and consumers

- Core exports `./database/database`, `./database/migration`, `./database/migration.gen`, `./database/sqlite`, `./database/sqlite.bun` and one export per migration file.
- Consumers: every core domain with tables, the server, the CLI database commands, and `modules/maestro/coordination` and `modules/continuity`, which build on the `Database` service.

## Dependencies and boundaries

- None beyond the core layer rules.

## Assets, schemas and generated files

- `migration.gen.ts` and `schema.gen.ts` are generated by `bun run migration` in `packages/core`; `bun run migration --check` verifies them against `packages/core/schema.json`.
- `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`, so never move `packages/core/src/account/sql.ts`, `packages/core/src/credential/sql.ts`, `packages/core/src/share/sql.ts`, `packages/core/src/control-plane/workspace.sql.ts` or `packages/core/src/data-migration.sql.ts`.

## Persistence, identity and lifetime

- The database is `orchestra.db` under the XDG data path, or the file named by `ORCHESTRA_DB` (a relative name resolves under the data path; `:memory:` is allowed).
- The data path, `ORCHESTRA_DB`, and migration identity and order are user-data contracts: never rename or reorder a shipped migration.

## Commands

- `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts`
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- The generated files are path-pinned.
- The migration tests cover the real migrations on a scratch database; they do not exercise a user's existing database.
```

## F032

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 8–323.

```typescript
/**
 * Models privileged system context as independently refreshable typed sources.
 *
 * `Source<A>` describes how to observe, compare, and render one value. `make`
 * closes over `A`, producing an opaque `SystemContext` that composes uniformly
 * with contexts built from other value types. Interpreters observe the composed
 * context once, then produce a durable structured
 * `Snapshot` alongside the exact model-visible baseline or update text.
 *
 * Returning `unavailable` means observation failed temporarily. It differs from
 * removing a source from the context: refresh preserves the admitted snapshot,
 * and replacement waits rather than silently constructing an incomplete baseline.
 *
 * @module
 */

/** Stable namespaced identity for one independently refreshable context source. */
export const Key = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._/-]*$/)).pipe(
  Schema.brand("SystemContext.Key"),
)
export type Key = typeof Key.Type

/** Indicates that a source could not be observed without treating it as removed. */
export const unavailable = Symbol.for("@orchestra/SystemContext.Unavailable")
export type Unavailable = typeof unavailable

/** Defines one typed source before its value type is hidden by `make`. */
export interface Source<A> {
  readonly key: Key
  readonly codec: Schema.Codec<A, Schema.Json, never, never>
  readonly load: Effect.Effect<A | Unavailable>
  readonly baseline: (current: A) => string
  readonly update: (previous: A, current: A) => string
  readonly removed?: (previous: A) => string
}

const ContextTypeId: unique symbol = Symbol.for("@orchestra/SystemContext")

/** Opaque carrier for composable system context sources. */
export interface SystemContext {
  readonly [ContextTypeId]: ReadonlyArray<PackedSource>
}

/** Durable comparison state for one admitted source. */
export const SourceSnapshot = Schema.Struct({
  value: Schema.Json,
  removed: Schema.optional(Schema.NonEmptyString),
})
export type SourceSnapshot = typeof SourceSnapshot.Type

/** Durable structured comparison state for one active context generation. */
export const Snapshot = Schema.Record(Key, SourceSnapshot)
export type Snapshot = Readonly<Record<string, SourceSnapshot>>

export interface Generation {
  readonly baseline: string
  readonly snapshot: Snapshot
}

export interface Updated {
  readonly _tag: "Updated"
  readonly text: string
  readonly snapshot: Snapshot
}

export interface ReplacementReady {
  readonly _tag: "ReplacementReady"
  readonly generation: Generation
}

export interface ReplacementBlocked {
  readonly _tag: "ReplacementBlocked"
}

export type ReplacementResult = ReplacementReady | ReplacementBlocked
export type ReconcileResult = { readonly _tag: "Unchanged" } | Updated | ReplacementResult

export class InitializationBlocked extends Schema.TaggedErrorClass<InitializationBlocked>()(
  "SystemContext.InitializationBlocked",
  { keys: Schema.Array(Key) },
) {
  override get message() {
    return `System context initialization blocked by unavailable sources: ${this.keys.join(", ")}`
  }
}

export class DuplicateKeyError extends Schema.TaggedErrorClass<DuplicateKeyError>()("SystemContext.DuplicateKeyError", {
  key: Key,
}) {
  override get message() {
    return `Duplicate system context key: ${this.key}`
  }
}

interface PackedSource {
  readonly key: Key
  readonly load: Effect.Effect<Loaded | Unavailable>
}

interface Loaded {
  readonly baseline: () => Rendered
  readonly compare: (previous: Schema.Json) => Compared
}

interface Rendered {
  readonly text: string
  readonly snapshot: SourceSnapshot
}

type Compared =
  | { readonly _tag: "Incompatible" }
  | { readonly _tag: "Unchanged" }
  | { readonly _tag: "Updated"; readonly render: () => Rendered }

interface AvailableEntry extends Loaded {
  readonly _tag: "Available"
  readonly key: Key
}

interface UnavailableEntry {
  readonly _tag: "Unavailable"
  readonly key: Key
}

type Entry = AvailableEntry | UnavailableEntry

/** The identity context. */
export const empty = context([])

/** Closes a typed source into a context that composes with differently typed sources. */
export function make<A>(source: Source<A>): SystemContext {
  const decode = Schema.decodeUnknownOption(source.codec)
  const encode = Schema.encodeSync(source.codec)
  const equivalent = Schema.toEquivalence(source.codec)
  return context([
    {
      key: source.key,
      load: source.load.pipe(
        Effect.map((value) => {
          if (isUnavailable(value)) return value
          const snapshot = (): SourceSnapshot => ({
            value: encode(value),
            ...(source.removed ? { removed: requireText(source.key, "removal", source.removed(value)) } : {}),
          })
          return {
            baseline: (): Rendered => ({
              text: requireText(source.key, "baseline", source.baseline(value)),
              snapshot: snapshot(),
            }),
            compare: (previous): Compared =>
              Option.match(decode(previous), {
                onNone: (): Compared => ({ _tag: "Incompatible" }),
                onSome: (decoded): Compared =>
                  equivalent(decoded, value)
                    ? { _tag: "Unchanged" }
                    : {
                        _tag: "Updated",
                        render: () => ({
                          text: requireText(source.key, "update", source.update(decoded, value)),
                          snapshot: snapshot(),
                        }),
                      },
              }),
          }
        }),
      ),
    },
  ])
}

/** Combines contexts in order and rejects duplicate source keys immediately. */
export function combine(values: ReadonlyArray<SystemContext>): SystemContext {
  const sources = values.flatMap((value) => value[ContextTypeId])
  assertUniqueKeys(sources)
  return context(sources)
}

const observe = (value: SystemContext) =>
  Effect.forEach(
    value[ContextTypeId],
    (source) =>
      source.load.pipe(
        Effect.map(
          (result): Entry =>
            result === unavailable
              ? { _tag: "Unavailable", key: source.key }
              : { _tag: "Available", key: source.key, ...result },
        ),
      ),
    { concurrency: "unbounded" },
  )

/** Creates the immutable baseline and durable snapshot for a new generation. */
export function initialize(value: SystemContext): Effect.Effect<Generation, InitializationBlocked> {
  return observe(value).pipe(
    Effect.flatMap((entries) => {
      const unavailable = entries.flatMap((entry) => (entry._tag === "Unavailable" ? [entry.key] : []))
      if (unavailable.length > 0) return new InitializationBlocked({ keys: unavailable })
      return Effect.succeed(initializeObservation(entries))
    }),
  )
}

function initializeObservation(entries: ReadonlyArray<Entry>): Generation {
  const available = entries.filter((entry): entry is AvailableEntry => entry._tag === "Available")
  const rendered = available.map((entry) => [entry.key, entry.baseline()] as const)
  return {
    baseline: render(rendered.map(([, result]) => result.text)),
    snapshot: Object.fromEntries(rendered.map(([key, result]) => [key, result.snapshot])),
  }
}

/** Reconciles current source values with one active generation. */
export function reconcile(value: SystemContext, previous: Snapshot): Effect.Effect<ReconcileResult> {
  return observe(value).pipe(
    Effect.map((entries): ReconcileResult => {
      const result = reconcileObservation(entries, previous)
      if (result._tag === "Unchanged" || result._tag === "Updated") return result
      return replaceObservation(entries, previous)
    }),
  )
}

function reconcileObservation(
  entries: ReadonlyArray<Entry>,
  previous: Snapshot,
): { readonly _tag: "Unchanged" } | Updated | { readonly _tag: "Replace" } {
  const keys = new Set(entries.map((entry) => entry.key))
  const comparisons = new Map<Key, Compared>()
  for (const entry of entries) {
    if (entry._tag === "Unavailable") continue
    const stored = getSnapshot(previous, entry.key)
    if (!stored) continue
    const compared = entry.compare(stored.value)
    if (compared._tag === "Incompatible") return { _tag: "Replace" }
    comparisons.set(entry.key, compared)
  }
  for (const key of Object.keys(previous).sort()) {
    if (keys.has(Key.make(key))) continue
    if (previous[key].removed === undefined) return { _tag: "Replace" }
  }

  const snapshot: Record<string, SourceSnapshot> = {}
  const updates: string[] = []
  for (const entry of entries) {
    const stored = getSnapshot(previous, entry.key)
    if (entry._tag === "Unavailable") {
      if (stored) snapshot[entry.key] = stored
      continue
    }
    if (!stored) {
      const rendered = entry.baseline()
      updates.push(rendered.text)
      snapshot[entry.key] = rendered.snapshot
      continue
    }
    const compared = comparisons.get(entry.key)
    if (!compared || compared._tag === "Incompatible")
      throw new Error(`Missing comparison for system context source ${entry.key}`)
    if (compared._tag === "Unchanged") {
      snapshot[entry.key] = stored
      continue
    }
    const rendered = compared.render()
    updates.push(rendered.text)
    snapshot[entry.key] = rendered.snapshot
  }
  for (const key of Object.keys(previous).sort()) {
    if (keys.has(Key.make(key))) continue
    const removed = previous[key].removed
    if (removed === undefined) throw new Error(`Missing removal rendering for system context source ${key}`)
    updates.push(removed)
  }
  if (updates.length === 0) return { _tag: "Unchanged" }
  return { _tag: "Updated", text: render(updates), snapshot }
}

/** Creates a complete replacement generation or blocks while admitted context is unavailable. */
export function replace(value: SystemContext, previous: Snapshot): Effect.Effect<ReplacementResult> {
  return observe(value).pipe(Effect.map((entries) => replaceObservation(entries, previous)))
}

function replaceObservation(entries: ReadonlyArray<Entry>, previous: Snapshot): ReplacementResult {
  if (entries.some((entry) => entry._tag === "Unavailable" && getSnapshot(previous, entry.key) !== undefined))
    return { _tag: "ReplacementBlocked" }
  return { _tag: "ReplacementReady", generation: initializeObservation(entries) }
}

function context(sources: ReadonlyArray<PackedSource>): SystemContext {
  return { [ContextTypeId]: sources }
}

function render(parts: ReadonlyArray<string>) {
  return parts.join("\n\n")
}

function getSnapshot(snapshot: Snapshot, key: Key) {
  return Object.hasOwn(snapshot, key) ? snapshot[key] : undefined
}

function isUnavailable(value: unknown): value is Unavailable {
  return value === unavailable
}

function requireText(key: Key, kind: string, text: string) {
  if (text.length === 0) throw new Error(`System context source ${key} rendered an empty ${kind}`)
  return text
}

function assertUniqueKeys(sources: ReadonlyArray<PackedSource>) {
  const keys = new Set<Key>()
  for (const source of sources) {
    if (keys.has(source.key)) throw new DuplicateKeyError({ key: source.key })
    keys.add(source.key)
  }
}
```

## F033

`packages/core/src/system-context/registry.ts:9402523a4b03cb21465da1285e2488eb7d2c11bd` — lines 7–65.

```typescript
export interface Entry {
  readonly key: SystemContext.Key
  readonly load: Effect.Effect<SystemContext.SystemContext>
}

export interface Interface {
  readonly register: (entry: Entry) => Effect.Effect<void, never, Scope.Scope>
  /** Loads every entry; a provider turn passes its Session and agent, which entries read through `Turn`. */
  readonly load: (turn?: TurnInfo) => Effect.Effect<SystemContext.SystemContext>
}

export interface TurnInfo {
  readonly sessionID: string
  readonly agent: string
}

/**
 * The Session and agent whose provider turn is loading system context, or undefined outside a turn. It is set only while
 * entries load, so a per-agent or per-Session entry reads it in its `load` and closes its sources over the value.
 */
export const Turn = Context.Reference<TurnInfo | undefined>("@orchestra/v2/SystemContextRegistry/Turn", {
  defaultValue: () => undefined,
})

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SystemContextRegistry") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const entries = yield* Ref.make<ReadonlyArray<Entry>>([])

    return Service.of({
      register: Effect.fn("SystemContextRegistry.register")(function* (entry) {
        yield* Effect.acquireRelease(
          Ref.modify(entries, (current) => {
            if (current.some((item) => item.key === entry.key)) return [false, current]
            return [true, [...current, entry]]
          }).pipe(
            Effect.flatMap((added) =>
              added ? Effect.void : Effect.die(`Duplicate system context entry key: ${entry.key}`),
            ),
            Effect.as(entry),
          ),
          (entry) => Ref.update(entries, (current) => current.filter((item) => item !== entry)),
        )
      }),
      load: Effect.fn("SystemContextRegistry.load")(function* (turn) {
        const current = (yield* Ref.get(entries)).toSorted((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
        return SystemContext.combine(
          yield* Effect.forEach(current, (entry) => entry.load, { concurrency: "unbounded" }).pipe(
            Effect.provideService(Turn, turn),
          ),
        )
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
```

## F034

`packages/core/src/system-context/builtins.ts:66a1874ec8aca00c305583b60a66cd5e882d4eae` — lines 12–51.

```typescript
const builtIns = Layer.effectDiscard(
  Effect.gen(function* () {
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    // Outside a repository the project directory is the filesystem root; show the working directory and say there is no repository.
    const root = location.vcs?.type === "git" ? location.project.directory : `${location.directory} (no git repository)`
    const environment = [
      "<env>",
      `  Working directory: ${location.directory}`,
      `  Workspace root folder: ${root}`,
      `  Is directory a git repo: ${location.vcs?.type === "git" ? "yes" : "no"}`,
      `  Platform: ${process.platform}`,
      "</env>",
    ].join("\n")
    const context = SystemContext.combine([
      SystemContext.make({
        key: SystemContext.Key.make("core/environment"),
        codec: Schema.toCodecJson(Schema.String),
        load: Effect.succeed(environment),
        baseline: (environment) =>
          ["Here is some useful information about the environment you are running in:", environment].join("\n"),
        update: (_previous, environment) => ["The environment you are running in is now:", environment].join("\n"),
      }),
      SystemContext.make({
        key: SystemContext.Key.make("core/date"),
        codec: Schema.toCodecJson(Schema.String),
        load: DateTime.nowAsDate.pipe(Effect.map((date) => date.toDateString())),
        baseline: (date) => `Today's date: ${date}`,
        update: (_previous, date) => `Today's date is now: ${date}`,
      }),
    ])

    yield* registry.register({ key: SystemContext.Key.make("core/builtins"), load: Effect.succeed(context) })
  }),
)

export const node = makeLocationNode({
  name: "system-context-builtins",
  layer: builtIns,
  deps: [Location.node, SystemContextRegistry.node, InstructionContext.node, FSUtil.node, Global.node],
```

## F035

`packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11` — lines 31–145.

```typescript
    const source = (value: ReadonlyArray<File> | SystemContext.Unavailable) =>
      SystemContext.make({
        key,
        codec: Schema.toCodecJson(Files),
        load: Effect.succeed(value),
        baseline: render,
        update: (_previous, current) =>
          `These instructions replace all previously loaded ambient instructions.\n\n${render(current)}`,
        removed: () => "Previously loaded instructions no longer apply.",
      })

    // `instructions` lists local files, relative to the config file that names them. A project file may only name files
    // inside the project: a cloned repository must not be able to pull arbitrary host files into the model context.
    const configuredInstructions = Effect.gen(function* () {
      const documents = (yield* config.entries()).filter((entry): entry is Config.Document => entry.type === "document")
      const project = yield* fs.resolve(location.project.directory)
      const resolved = (yield* Effect.forEach(
        documents.flatMap((document) => (document.info.instructions ?? []).map((entry) => ({ document, entry }))),
        ({ document, entry }) =>
          Effect.gen(function* () {
            const base = dirname(document.path ?? global.config)
            const isGlobal = contains(global.config, base)
            const home = entry === "~" || entry.startsWith("~/")
            const pattern = home ? join(global.home, entry.slice(1)) : resolve(base, entry)
            // A glob names whatever matches now; a plain path stays listed so a missing file is reported, not skipped.
            const targets = /[*?[{]/.test(entry)
              ? yield* Effect.promise(async () => {
                  // Scan from the deepest literal directory, never from the filesystem root.
                  const segments = pattern.split(sep)
                  const literal = segments.findIndex((segment) => /[*?[{]/.test(segment))
                  const root = segments.slice(0, literal).join(sep) || parse(pattern).root
                  const matches: string[] = []
                  for await (const match of new Bun.Glob(segments.slice(literal).join("/")).scan({ cwd: root, absolute: true, onlyFiles: true, dot: true }))
                    matches.push(match)
                  return matches
                }).pipe(
                  Effect.map((matches) => matches.toSorted()),
                  Effect.orElseSucceed(() => []),
                )
              : [pattern]
            return yield* Effect.forEach(targets, (target) =>
              fs.resolve(target).pipe(Effect.map((resolved) => ({ path: resolved, allowed: isGlobal || contains(project, resolved) }))),
            )
          }),
      )).flat()
      // A project instruction that escapes the project makes the whole context unavailable, so it fails closed.
      return {
        paths: Array.dedupe(resolved.filter((item) => item.allowed).map((item) => item.path)),
        escaped: resolved.some((item) => !item.allowed),
      }
    })

    const observe = Effect.fn("InstructionContext.observe")(function* () {
      const start = yield* fs.resolve(location.directory)
      const stop = yield* fs.resolve(location.project.directory)
      const fromProject = relative(stop, start)
      const insideProject =
        fromProject === "" || (fromProject !== ".." && !fromProject.startsWith(`..${sep}`) && !isAbsolute(fromProject))
      const discovered = new Set(
        yield* Effect.forEach(
          Flag.ORCHESTRA_DISABLE_PROJECT_CONFIG || !insideProject
            ? []
            : yield* fs.up({
                targets: ["AGENTS.md"],
                start,
                stop,
              }),
          fs.resolve,
        ),
      )
      const configured = yield* configuredInstructions
      const paths = Array.dedupe([yield* fs.resolve(join(global.config, "AGENTS.md")), ...discovered, ...configured.paths])
      const files = yield* Effect.forEach(
        paths,
        (path) =>
          fs
            .readFileStringSafe(path)
            .pipe(
              Effect.map((content) =>
                content === undefined ? undefined : new File({ path: AbsolutePath.make(path), content }),
              ),
            ),
        { concurrency: "unbounded" },
      )
      if (configured.escaped) return SystemContext.unavailable
      if (files.some((file, index) => file === undefined && (discovered.has(paths[index]) || configured.paths.includes(paths[index]))))
        return SystemContext.unavailable
      return files.filter((file): file is File => file !== undefined)
    })

    yield* registry.register({
      key,
      load: observe().pipe(
        Effect.map((files) =>
          files === SystemContext.unavailable
            ? source(files)
            : files.length === 0
              ? SystemContext.empty
              : source(files),
        ),
        Effect.catch(() => Effect.succeed(source(SystemContext.unavailable))),
        Effect.catchDefect(() => Effect.succeed(source(SystemContext.unavailable))),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "instruction-context",
  layer,
  deps: [Config.node, FSUtil.node, Global.node, Location.node, SystemContextRegistry.node],
})

function render(files: ReadonlyArray<File>) {
  return files.map((file) => `Instructions from: ${file.path}\n${file.content}`).join("\n\n")
```

## F036

`packages/core/src/session/context-epoch.ts:65b17a86a4fb131d427e12d489cec2c06a088094` — lines 23–88.

```typescript
export function initialize(
  db: DatabaseService,
  context: Effect.Effect<SystemContext.SystemContext>,
  sessionID: SessionSchema.ID,
): Effect.Effect<Prepared | undefined, SystemContext.InitializationBlocked> {
  return initializeOnce(db, context, sessionID).pipe(Effect.withSpan("SessionContextEpoch.initialize"))
}

export function prepare(
  db: DatabaseService,
  events: EventV2.Interface,
  context: Effect.Effect<SystemContext.SystemContext>,
  sessionID: SessionSchema.ID,
): Effect.Effect<Prepared, SystemContext.InitializationBlocked | ContextSnapshotDecodeError> {
  return prepareOnce(db, events, context, sessionID).pipe(Effect.withSpan("SessionContextEpoch.prepare"))
}

const prepareOnce = Effect.fnUntraced(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  context: Effect.Effect<SystemContext.SystemContext>,
  sessionID: SessionSchema.ID,
) {
  const [value, stored, compaction] = yield* Effect.all(
    [context, find(db, sessionID), SessionHistory.latestCompaction(db, sessionID)],
    { concurrency: "unbounded" },
  )
  if (!stored) {
    const generation = yield* SystemContext.initialize(value)
    const baselineSeq = yield* insert(db, sessionID, generation)
    return { baseline: generation.baseline, baselineSeq }
  }

  const snapshot = yield* Schema.decodeUnknownEffect(SystemContext.Snapshot)(stored.snapshot).pipe(
    Effect.mapError((error) => new ContextSnapshotDecodeError({ sessionID, details: String(error) })),
  )
  const replacementSeq = compaction !== undefined && compaction.seq > stored.baseline_seq ? compaction.seq : undefined
  const result = replacementSeq
    ? yield* SystemContext.replace(value, snapshot)
    : yield* SystemContext.reconcile(value, snapshot)
  if (result._tag === "Unchanged" || result._tag === "ReplacementBlocked") {
    return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
  }
  if (result._tag === "ReplacementReady") {
    const baselineSeq = replacementSeq ?? (yield* EventV2.latestSequence(db, sessionID))
    yield* replace(db, sessionID, baselineSeq, result.generation)
    return { baseline: result.generation.baseline, baselineSeq }
  }

  yield* events.publish(
    SessionEvent.ContextUpdated,
    { sessionID, messageID: SessionMessage.ID.create(), timestamp: yield* DateTime.now, text: result.text },
    { commit: () => advance(db, sessionID, result.snapshot).pipe(Effect.orDie) },
  )
  return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
})

const initializeOnce = Effect.fnUntraced(function* (
  db: DatabaseService,
  context: Effect.Effect<SystemContext.SystemContext>,
  sessionID: SessionSchema.ID,
) {
  if (yield* exists(db, sessionID)) return
  const generation = yield* context.pipe(Effect.flatMap(SystemContext.initialize))
  const baselineSeq = yield* insert(db, sessionID, generation)
  return { baseline: generation.baseline, baselineSeq }
```

## F037

`packages/core/src/session/context-epoch.ts:65b17a86a4fb131d427e12d489cec2c06a088094` — lines 122–173.

```typescript
const insert = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  generation: SystemContext.Generation,
) {
  const baselineSeq = yield* EventV2.latestSequence(db, sessionID)
  yield* db
    .insert(SessionContextEpochTable)
    .values({
      session_id: sessionID,
      baseline: generation.baseline,
      snapshot: generation.snapshot,
      baseline_seq: baselineSeq,
    })
    .run()
    .pipe(Effect.orDie)
  return baselineSeq
})

const replace = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  baselineSeq: number,
  generation: SystemContext.Generation,
) {
  const updated = yield* db
    .update(SessionContextEpochTable)
    .set({
      baseline: generation.baseline,
      snapshot: generation.snapshot,
      baseline_seq: baselineSeq,
    })
    .where(eq(SessionContextEpochTable.session_id, sessionID))
    .returning({ sessionID: SessionContextEpochTable.session_id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die("Context Epoch not found")
})

const advance = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  snapshot: SystemContext.Snapshot,
) {
  const updated = yield* db
    .update(SessionContextEpochTable)
    .set({ snapshot })
    .where(eq(SessionContextEpochTable.session_id, sessionID))
    .returning({ sessionID: SessionContextEpochTable.session_id })
    .get()
    .pipe(Effect.orDie)
  if (!updated) return yield* Effect.die("Context Epoch not found")
```

## F038

`packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211` — lines 13–104.

```typescript
export const latestCompaction = Effect.fnUntraced(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* db
    .select({ seq: SessionMessageTable.seq })
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, sessionID), eq(SessionMessageTable.type, "compaction")))
    .orderBy(desc(SessionMessageTable.seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
})

const messageRows = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  compaction: { readonly seq: number } | undefined,
  baselineSeq?: number,
) {
  const rows = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        compaction
          ? or(
              gte(SessionMessageTable.seq, compaction.seq),
              baselineSeq === undefined
                ? undefined
                : and(eq(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
            )
          : undefined,
        baselineSeq === undefined
          ? undefined
          : or(ne(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)
  return rows
})

const decodeMessageRow = (row: typeof SessionMessageTable.$inferSelect) =>
  decode({ ...row.data, id: row.id, type: row.type }).pipe(
    Effect.mapError(
      () =>
        new MessageDecodeError({
          sessionID: SessionSchema.ID.make(row.session_id),
          messageID: SessionMessage.ID.make(row.id),
        }),
    ),
  )

export const load = Effect.fn("SessionHistory.load")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  const [epoch, compaction] = yield* Effect.all(
    [
      db
        .select({ baselineSeq: SessionContextEpochTable.baseline_seq })
        .from(SessionContextEpochTable)
        .where(eq(SessionContextEpochTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      latestCompaction(db, sessionID),
    ],
    { concurrency: "unbounded" },
  )
  return yield* Effect.forEach(yield* messageRows(db, sessionID, compaction, epoch?.baselineSeq), decodeMessageRow)
})

/** Every stored message of the Session in order, compacted history included. */
export const loadAll = Effect.fn("SessionHistory.loadAll")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* Effect.forEach(yield* messageRows(db, sessionID, undefined), decodeMessageRow)
})

export const loadForRunner = Effect.fn("SessionHistory.loadForRunner")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  baselineSeq: number,
) {
  return (yield* entriesForRunner(db, sessionID, baselineSeq)).map((entry) => entry.message)
})

export const entriesForRunner = Effect.fn("SessionHistory.entriesForRunner")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  baselineSeq: number,
) {
  const rows = yield* messageRows(db, sessionID, yield* latestCompaction(db, sessionID), baselineSeq)
  return yield* Effect.forEach(rows, (row) =>
    decodeMessageRow(row).pipe(Effect.map((message) => ({ seq: row.seq, message }))),
  )
})
```

## F039

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 17–20.

```typescript
const DEFAULT_BUFFER = 20_000
const DEFAULT_KEEP_TOKENS = 8_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const SUMMARY_OUTPUT_TOKENS = 4_096
```

## F040

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 93–100.

```typescript
export const usable = (
  limits: { readonly input?: number } | undefined,
  context: number,
  output: number,
  buffer: number,
) => {
  const window = context - Math.max(output, buffer)
  return limits?.input !== undefined && limits.input > 0 ? Math.min(window, limits.input - buffer) : window
```

## F041

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 144–280.

```typescript
const settings = (documents: readonly Config.Entry[]) => {
  const configured = documents
    .filter((entry): entry is Config.Document => entry.type === "document")
    .flatMap((entry) => (entry.info.compaction ? [entry.info.compaction] : []))
  return configured.reduce<Settings>(
    (result, current) => ({
      auto: current.auto ?? result.auto,
      buffer: current.buffer ?? result.buffer,
      tokens: current.keep?.tokens ?? result.tokens,
    }),
    { auto: true, buffer: DEFAULT_BUFFER, tokens: DEFAULT_KEEP_TOKENS },
  )
}

const select = (
  entries: readonly Entry[],
  tokens: number,
): { readonly head: string; readonly recent: string } | undefined => {
  const conversation = entries
    .filter((entry) => entry.message.type !== "compaction")
    .map((entry) => serialize(entry.message))
    .filter(Boolean)
  if (conversation.length === 0) return
  let total = 0
  let split = conversation.length
  for (let index = conversation.length - 1; index >= 0; index--) {
    const next = total + Token.estimate(conversation[index])
    if (next > tokens) break
    total = next
    split = index
  }
  return {
    head: conversation.slice(0, split).join("\n\n"),
    recent: conversation.slice(split).join("\n\n"),
  }
}

export const buildPrompt = (input: { readonly previousSummary?: string; readonly context: readonly string[] }) => {
  const conversation = `Here is the conversation so far:\n\n<conversation>\n${input.context.join("\n\n")}\n</conversation>`
  if (!input.previousSummary)
    return [
      conversation,
      "Create a new anchored summary from the conversation history in the <conversation> tags above so another coding agent can continue the work.",
      SUMMARY_TEMPLATE,
    ].join("\n\n")
  return [
    conversation,
    `Here is the summary of the conversation before the <conversation> above:\n\n<prior-summary>\n${input.previousSummary}\n</prior-summary>`,
    SUMMARY_UPDATE_INSTRUCTIONS,
    SUMMARY_TEMPLATE,
  ].join("\n\n")
}

export const make = (dependencies: Dependencies) => {
  const config = settings(dependencies.config)
  const summarize = Effect.fnUntraced(function* (input: Input, reason: "auto" | "manual") {
    const context = input.model.route.defaults.limits?.context
    const output = input.request.generation?.maxTokens ?? input.model.route.defaults.limits?.output ?? 0
    const previousSummary = input.entries.find((entry) => entry.message.type === "compaction")?.message
    const kept = select(input.entries, config.tokens)
    // A requested compaction of a conversation shorter than the kept tail summarizes all of it.
    const selected =
      reason === "manual" && kept?.head.length === 0 && previousSummary?.type !== "compaction"
        ? select(input.entries, 0)
        : kept
    if (!selected || (selected.head.length === 0 && previousSummary?.type !== "compaction")) return false
    const summaryPrompt = buildPrompt({
      previousSummary: previousSummary?.type === "compaction" ? previousSummary.summary : undefined,
      context: [previousSummary?.type === "compaction" ? previousSummary.recent : "", selected.head].filter(Boolean),
    })
    const summaryOutput = Math.min(output || SUMMARY_OUTPUT_TOKENS, SUMMARY_OUTPUT_TOKENS)
    if (context !== undefined && context > 0 && Token.estimate(summaryPrompt) > context - summaryOutput) return false
    const messageID = SessionMessage.ID.create()
    yield* dependencies.events.publish(SessionEvent.Compaction.Started, {
      sessionID: input.sessionID,
      messageID,
      timestamp: yield* DateTime.now,
      reason,
    })

    const chunks: string[] = []
    let failed = false
    yield* dependencies.subagentModels.assert(input.sessionID, SessionRunnerModel.reference(input.model))
    const summarized = yield* dependencies.llm
      .stream(
        LLM.request({
          model: input.model,
          http: input.request.http,
          messages: [Message.user(summaryPrompt)],
          tools: [],
          generation: { maxTokens: summaryOutput },
        }),
      )
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.providerError(event)) failed = true
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
        Effect.as(true),
        Effect.catchTag("LLM.Error", () => Effect.succeed(false)),
      )
    const summary = chunks.join("")
    if (!summarized || failed || !summary.trim()) return false
    yield* dependencies.events.publish(SessionEvent.Compaction.Ended, {
      sessionID: input.sessionID,
      messageID,
      timestamp: yield* DateTime.now,
      reason,
      text: summary,
      recent: selected.recent,
    })
    return true
  })
  const compactAfterOverflow = Effect.fn("SessionCompaction.compactAfterOverflow")(function* (input: Input) {
    const context = input.model.route.defaults.limits?.context
    if (context === undefined || context <= 0) return false
    return yield* summarize(input, "auto")
  })
  /** Compacts on request, whatever the context size; false when there is nothing to summarize or the summary failed. */
  const compact = Effect.fn("SessionCompaction.compact")((input: Input) => summarize(input, "manual"))
  const compactIfNeeded = Effect.fn("SessionCompaction.compactIfNeeded")(function* (input: Input) {
    if (!config.auto) return false
    const context = input.model.route.defaults.limits?.context
    if (context === undefined || context <= 0) return false
    const output = input.request.generation?.maxTokens ?? input.model.route.defaults.limits?.output ?? 0
    if (
      estimate({ system: input.request.system, messages: input.request.messages, tools: input.request.tools }) <=
      usable(input.model.route.defaults.limits, context, output, config.buffer)
    )
      return false
    return yield* compactAfterOverflow(input)
  })
  return {
    compact,
    compactIfNeeded,
    compactAfterOverflow,
```

## F042

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 284–325.

```typescript
/**
 * Location-scoped compaction. A replacement keeps the summarizing hooks and may reshape what one provider turn sees
 * (`transform`) or react to the usage a settled step reports (`afterStep`); neither may record Session events
 * outside the summary events or fail the turn.
 */
export interface Interface {
  readonly compact: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
  readonly compactIfNeeded: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
  readonly compactAfterOverflow: (input: Input) => Effect.Effect<boolean, SessionSubagentModels.Error>
  /** The messages one provider-model turn sends; hosted engine turns receive their history unchanged. */
  readonly transform: (input: {
    readonly sessionID: SessionSchema.ID
    readonly messages: readonly Message[]
    readonly model: Model
    /** The tools this turn offers, after the agent's permissions; a replacement may rely on one only if listed. */
    readonly tools: LLMRequest["tools"]
  }) => Effect.Effect<readonly Message[]>
  /** Runs after a step settled with its token usage. */
  readonly afterStep: (input: {
    readonly sessionID: SessionSchema.ID
    readonly tokens: EventV2.Data<typeof SessionEvent.Step.Ended>["tokens"]
    readonly model: ModelV2.Ref | undefined
    /** The context window the provider or host reported with the step, when it did. */
    readonly contextWindow?: number
  }) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/SessionCompaction") {}

export const node = makeLocationNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const llm = yield* LLMClient.Service
      const subagentModels = yield* SessionSubagentModels.Service
      const config = yield* Config.Service
      return Service.of({
        ...make({ events, llm, subagentModels, config: yield* config.entries() }),
        transform: (input) => Effect.succeed(input.messages),
        afterStep: () => Effect.void,
```

## F043

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 185–258.

```typescript
    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
          // Beside the turn, as the earlier runtime named a Session after its first prompt; a failed title leaves the default one.
          yield* nameSession(session.id).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Session title generation failed", cause).pipe(
                Effect.annotateLogs({ sessionID: session.id }),
              ),
            ),
            Effect.forkDetach,
          )
          // Attachments are read once, as they are promoted; the admitted prompt keeps its URIs.
          yield* SessionDirectCommands.readMentions({ events, reader, mcp, fs }, session.id, yield* SessionInput.promotedAfter(db, session.id, cutoff))
        }
      }
      const system =
        initialized ?? (yield* SessionContextEpoch.prepare(db, events, loadSystemContext(session.id, agent), session.id))
      // An agent whose engine names an execution host runs this provider turn through it (AGENTS "V2 Session Core").
      const engine = yield* engineOf(session)
      const host = engine ? hosts.get(engine) : undefined
      if (engine && !host)
        return yield* Effect.die(new Error(`No execution host is registered for engine ${engine} (agent ${agent.id})`))
      const model = host ? undefined : yield* models.resolve(session)
      const modelRef = model ? SessionRunnerModel.reference(model) : (session.model ?? agent.info?.model)
      const entries = yield* SessionHistory.entriesForRunner(db, session.id, system.baselineSeq)
      const context = entries.map((entry) => entry.message)
      const workflow = yield* RelayWorkflowSession.current(session.id).pipe(Effect.provide(workflowContext), Effect.orDie)
      if (workflow?.view.pending) return { needsContinuation: yield* RelayWorkflowSession.reconcile(workflow).pipe(
        Effect.provide(workflowContext), Effect.map((next) => next === true), Effect.orDie), step: currentStep }
      if (workflow?.view.state === "complete") return { needsContinuation: false, step: currentStep }
      const isLastStep = currentStep >= (agent.info?.steps ?? DEFAULT_MAX_STEPS)
      if (!isLastStep) yield* mcp.ready()
      const stepTools = narrowStepTools(workflow?.view.tools, workflow?.view.tools?.mcp ? yield* mcp.tools() : {})
      const toolMaterialization = isLastStep ? undefined : yield* tools.materialize([...effectiveRules, ...stepTools.hidden])
      const promptCacheKey = /^ses_[0-9a-f]{64}$/.test(session.id) ? session.id.slice(4) : session.id
      const contextText = [system.baseline, workflow?.view.instructions].filter((part): part is string => !!part)
      const systemText = agent.info?.system ? [agent.info.system, ...contextText] : contextText
      // Only provider-model turns pass through the compaction transform; a hosted engine receives its history as is.
      const messages = model
        ? yield* compaction.transform({
            sessionID: session.id,
            messages: [...toLLMMessages(context, model), ...(isLastStep ? [Message.assistant(MAX_STEPS_PROMPT)] : [])],
            model,
            tools: toolMaterialization?.definitions ?? [],
          })
```

## F044

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 492–506.

```typescript
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const stream = yield* restore(providerStream).pipe(Effect.exit)
          if (liveSteers.size > 0) needsContinuation = true
          const failure =
            stream._tag === "Failure" ? Option.getOrUndefined(Cause.findErrorOption(stream.cause)) : undefined
          if (
            recoverOverflow &&
            model &&
            request &&
            !publisher.hasAssistantStarted() &&
            isContextOverflowFailure(overflowFailure ?? failure) &&
            (yield* restore(recoverOverflow({ sessionID: session.id, entries, model, request })))
          )
            return yield* Effect.die(continueAfterOverflowCompaction(currentStep))
```

## F045

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 588–614.

```typescript
    const runAfterOverflowCompaction: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
      return yield* runTurnAttempt(sessionID, promotion, step).pipe(
        Effect.catchDefect(
          Effect.fnUntraced(function* (defect) {
            if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
            if (defect.transition._tag === "ContinueAfterOverflowCompaction")
              return yield* Effect.die("Post-compaction provider attempt cannot recover another overflow")
            yield* Effect.yieldNow
            return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
          }),
        ),
      )
    })

    const runTurn: RunTurn = Effect.fnUntraced(function* (sessionID, promotion, step) {
      return yield* runTurnAttempt(sessionID, promotion, step, compaction.compactAfterOverflow).pipe(
        Effect.catchDefect(
          Effect.fnUntraced(function* (defect) {
            if (!(defect instanceof TurnTransitionError)) return yield* Effect.die(defect)
            yield* Effect.yieldNow
            if (defect.transition._tag === "ContinueAfterOverflowCompaction")
              return yield* runAfterOverflowCompaction(sessionID, undefined, defect.transition.step)
            return yield* runTurn(sessionID, undefined, defect.transition.step)
          }),
        ),
      )
    })
```

## F046

`AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — lines 146–154.

```text
## What Ships and What Stays in the Repo

The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.

- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.
```

## F047

`AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — lines 207–217.

```text
## V2 Session Core

- Keep durable prompt admission separate from model execution. `SessionV2.prompt(...)` admits one durable `session_input` row before scheduling advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. The serialized runner promotes admitted inputs into visible user messages at safe boundaries.
- Reusing a Session ID adopts the existing Session. Reusing a prompt message ID reconciles an exact retry only when Session, prompt, and delivery mode match; conflicting reuse fails. Historical projected prompts lazily synthesize promoted inbox records during exact retry.
- Keep `SessionExecution` process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement through `SessionStore` plus `LocationServiceMap.get(session.location)` only when a drain starts; no layer should take a Session ID. V2 interruption targets the active process-local ownership chain for that Session; idle or missing interruption is a no-op.
- Keep `SessionRunner`, model resolution, tool registry, permissions, and filesystem Location-scoped. Omitted `Location.workspaceID` means implicit-local placement; explicit workspace identity remains reserved for future placement semantics.
- Preserve one explicit `llm.stream(request)` call per provider turn and reload projected history before durable continuation. Do not bridge through legacy `SessionPrompt.loop(...)` or delegate orchestration to an in-memory tool loop. The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.
- Keep local Session drains process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, and allows different Sessions to run concurrently. Advisory wakes drain eligible durable inbox rows only; post-crash continuation recovery requires a separate explicit design before it may retry provider work. A drain has no durable identity or transcript boundary.
- Keep delivery vocabulary explicit. Prompts steer by default and promote at the next safe provider-turn boundary while the current drain requires continuation. An explicit `queue` input remains pending until the Session would otherwise become idle; promote one queued input at that boundary, then reevaluate continuation before promoting another. Promoting any new user input resets the selected agent's provider-turn allowance; a batch of steers resets it once.
- Keep EventV2 replay owner claims separate from clustered Session execution ownership.
- Keep the System Context algebra, registry, and built-ins in `packages/core/src/system-context`; keep Context Source producers with their observed domains, and keep Session History selection plus Context Epoch persistence Session-owned.
```

## F048

`packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — lines 11–77.

```typescript
export interface Context {
  readonly sessionID: SessionSchema.ID
  readonly agent: AgentV2.ID
  readonly assistantMessageID: SessionMessage.ID
  readonly toolCallID: string
  /** Captured catalog identity of the provider turn; transport deployment IDs may differ. */
  readonly model?: ModelV2.Ref
}

export type SchemaType<A> = Schema.Codec<A, any, never, never>

declare const TypeId: unique symbol

export interface Definition<Input extends SchemaType<any>, Output extends SchemaType<any>> {
  readonly [TypeId]: {
    readonly _Input: Input
    readonly _Output: Output
  }
}

export type AnyTool = Definition<any, any>
export const Failure = ToolFailure
export type Failure = ToolFailure

export class RegistrationError extends Schema.TaggedErrorClass<RegistrationError>()("Tool.RegistrationError", {
  name: Schema.String,
  message: Schema.String,
}) {}

export type Content =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "file"; readonly data: string; readonly mime: string; readonly name?: string }

type Config<
  Input extends SchemaType<any>,
  Output extends SchemaType<any>,
  Structured extends SchemaType<any> = Output,
> = {
  readonly description: string
  readonly input: Input
  readonly output: Output
  readonly structured?: Structured
  readonly toStructuredOutput?: (input: {
    readonly input: Schema.Schema.Type<Input>
    readonly output: Output["Encoded"]
  }) => Schema.Schema.Type<Structured>
  readonly execute: (
    input: Schema.Schema.Type<Input>,
    context: Context,
  ) => Effect.Effect<Schema.Schema.Type<Output>, ToolFailure>
  readonly toModelOutput?: (input: {
    readonly input: Schema.Schema.Type<Input>
    readonly output: Output["Encoded"]
  }) => ReadonlyArray<Content>
  /** Host-only execution provenance; failure declines metadata, never execution. */
  readonly modelCapture?: (input: {
    readonly input: Schema.Schema.Type<Input>
    readonly output: Output["Encoded"]
  }) => ToolModelCapture.Input | undefined
}

type Runtime = {
  /** Several actions hide the tool only when every one of them is wholly denied. */
  readonly permission?: string | ReadonlyArray<string>
  readonly onDemand?: true
  readonly definition: (name: string) => ToolDefinition
  readonly settle: (call: ToolCall, context: Context) => Effect.Effect<ToolOutput, ToolFailure>
```

## F049

`packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — lines 82–177.

```typescript
export function make<
  Input extends SchemaType<any>,
  Output extends SchemaType<any>,
  Structured extends SchemaType<any> = Output,
>(config: Config<Input, Output, Structured>): Definition<Input, Structured> {
  const tool = Object.freeze({}) as Definition<Input, Structured>
  const definitions = new Map<string, ToolDefinition>()
  runtimes.set(tool, {
    definition: (name) => {
      const cached = definitions.get(name)
      if (cached) return cached
      const definition = new ToolDefinition({
        name,
        description: config.description,
        inputSchema: toJsonSchema(config.input),
        outputSchema: toJsonSchema(config.structured ?? config.output),
      })
      definitions.set(name, definition)
      return definition
    },
    settle: (call, context) =>
      Schema.decodeUnknownEffect(config.input)(call.input).pipe(
        Effect.mapError((error) => new ToolFailure({ message: `Invalid tool input: ${error.message}` })),
        Effect.flatMap((input) =>
          config.execute(input, context).pipe(
            Effect.flatMap((output) =>
              Schema.encodeEffect(config.output)(output).pipe(
                Effect.flatMap((output) => {
                  if (!config.structured || !config.toStructuredOutput)
                    return Effect.succeed({ output, structured: output })
                  return Schema.encodeEffect(config.structured)(config.toStructuredOutput({ input, output })).pipe(
                    Effect.map((structured) => ({ output, structured })),
                  )
                }),
                Effect.mapError(
                  (error) =>
                    new ToolFailure({
                      message: `Tool returned an invalid value for its output schema: ${error.message}`,
                    }),
                ),
              ),
            ),
            Effect.map(({ output, structured }) => {
              const result = {
                structured,
                content:
                  config.toModelOutput?.({ input, output }).map((part) =>
                    part.type === "text"
                      ? { type: "text" as const, text: part.text }
                      : {
                          type: "file" as const,
                          uri: `data:${part.mime};base64,${part.data}`,
                          mime: part.mime,
                          name: part.name,
                        },
                  ) ?? (typeof output === "string" ? [{ type: "text" as const, text: output }] : []),
              }
              try {
                if (config.modelCapture) {
                  const capture = config.modelCapture(freezeMetadata(structuredClone({ input, output })))
                  if (capture) ToolModelCapture.record(result, capture, { sessionID: context.sessionID, callID: context.toolCallID })
                }
              } catch {
                // Optional metadata cannot change the successful native result.
              }
              return result
            }),
          ),
        ),
      ),
  })
  return tool
}

/**
 * A tool whose input contract is a JSON Schema owned by another system, such as an MCP server. The input reaches
 * `execute` undecoded: the owner validates it.
 */
export function dynamic(config: {
  readonly description: string
  readonly inputSchema: JsonSchema.JsonSchema
  readonly execute: (input: unknown, context: Context) => Effect.Effect<ToolOutput, ToolFailure>
}): AnyTool {
  const tool = Object.freeze({}) as AnyTool
  const definitions = new Map<string, ToolDefinition>()
  runtimes.set(tool, {
    definition: (name) => {
      const cached = definitions.get(name)
      if (cached) return cached
      const definition = new ToolDefinition({ name, description: config.description, inputSchema: config.inputSchema })
      definitions.set(name, definition)
      return definition
    },
    settle: (call, context) => config.execute(call.input, context),
  })
  return tool
```

## F050

`packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — lines 180–216.

```typescript
export const validateName = (name: string) =>
  /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name)
    ? Effect.void
    : Effect.fail(new RegistrationError({ name, message: `Invalid tool name: ${name}` }))

export const withPermission = <Input extends SchemaType<any>, Output extends SchemaType<any>>(
  tool: Definition<Input, Output>,
  permission: string | ReadonlyArray<string>,
) => {
  const decorated = Object.freeze({}) as Definition<Input, Output>
  runtimes.set(decorated, { ...runtimeOf(tool), permission })
  return decorated
}

export const permission = (tool: AnyTool, name: string) => runtimeOf(tool).permission ?? name
/** Built-in catalog metadata only. Explicit host advertisement never grants execution permission. */
export function withOnDemand<Input extends SchemaType<unknown>, Output extends SchemaType<unknown>>(tool: Definition<Input, Output>) {
  const decorated = Object.freeze({}) as Definition<Input, Output>
  runtimes.set(decorated, { ...runtimeOf(tool), onDemand: true })
  return decorated
}
export const isOnDemand = (tool: AnyTool) => runtimeOf(tool).onDemand === true
export const definition = (name: string, tool: AnyTool) => runtimeOf(tool).definition(name)
export const settle = (tool: AnyTool, call: ToolCall, context: Context) => runtimeOf(tool).settle(call, context)

// Metadata callbacks receive detached data; never freeze or expose the native payload.
function freezeMetadata<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freezeMetadata(child, seen)
  return Object.freeze(value)
}

function runtimeOf(tool: AnyTool) {
  const runtime = runtimes.get(tool)
  if (!runtime) throw new TypeError("Invalid Core Tool value")
  return runtime
```

## F051

`packages/core/src/tool/application-tools.ts:1633897cd6c71cc3abdd22901829b95af2dd96aa` — lines 21–57.

```typescript
export interface Interface {
  readonly register: (
    tools: Readonly<Record<string, Tool.AnyTool>>,
  ) => Effect.Effect<void, Tool.RegistrationError, Scope.Scope>
  readonly entries: () => ReadonlyMap<string, Entry>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ApplicationTools") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const state = State.create<Data, Draft>({
      initial: () => ({ entries: new Map() }),
      draft: (draft) => ({
        set: (name, tool) => {
          draft.entries.set(name, tool)
        },
      }),
    })

    return Service.of({
      register: Effect.fn("ApplicationTools.register")(function* (tools) {
        const entries = Object.entries(tools)
        if (entries.length === 0) return
        yield* Effect.forEach(entries, ([name]) => Tool.validateName(name), { discard: true })
        const registrations = entries.map(([name, tool]) => [name, { identity: {}, tool }] as const)
        yield* state.transform((draft) => {
          for (const [name, entry] of registrations) draft.set(name, entry)
        })
      }),
      entries: () => state.get().entries,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
```

## F052

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 90–180.

```typescript
    type Registration = { readonly identity: object; readonly tool: AnyTool }
    const local = new Map<string, Array<{ readonly token: object; readonly registration: Registration }>>()
    const fatalToolCause = (cause: Cause.Cause<ToolFailure>) => Effect.failCause(Cause.fromReasons<never>(
      cause.reasons.flatMap((reason) => reason._tag === "Fail"
        ? Cause.die(reason.error).reasons.map((next) => next.annotate(Context.makeUnsafe(new Map(reason.annotations)))) : [reason]),
    ))

    const settleWith = Effect.fn("ToolRegistry.settle")(function* (input: ExecuteInput, advertised?: object) {
      const registration =
        local.get(input.call.name)?.at(-1)?.registration ?? applications.entries().get(input.call.name)
      if (!registration)
        return {
          result: {
            type: "error" as const,
            value: advertised ? `Stale tool call: ${input.call.name}` : `Unknown tool: ${input.call.name}`,
          },
        }
      if (advertised && registration.identity !== advertised)
        return { result: { type: "error" as const, value: `Stale tool call: ${input.call.name}` } }
      const location = native?.location ?? Option.getOrUndefined(yield* Effect.serviceOption(Location.Service))
      const events = native?.events ?? Option.getOrUndefined(yield* Effect.serviceOption(EventV2.Service))
      const effectiveProfile = capturedProfile ?? (yield* ToolSafety.RuntimeProfile)
      const effectiveLoader = profileLoader ?? (yield* ToolSafety.RuntimeProfileLoader)
      if ((capturedProfile || profileLoader) && (!location || !events))
        return { result: { type: "error" as const, value: "Tool safety HOLD: native-placement-or-events-missing" } }
      const invocation = {
        tool: input.call.name,
        args: input.call.input,
        sessionID: input.sessionID,
        callID: input.call.id,
        assistantMessageID: input.assistantMessageID,
        agent: input.agent,
        directory: location?.directory,
        projectID: location?.project.id,
        projectDirectory: location && Project.isRoot(location.project.directory) ? location.directory : location?.project.directory,
      }
      const acquire = safety.acquire
      const settlement = Effect.gen(function* () {
          const attempted = yield* settle(registration.tool, input.call, {
            sessionID: input.sessionID,
            agent: input.agent,
            assistantMessageID: input.assistantMessageID,
            toolCallID: input.call.id,
            model: input.model,
          }).pipe(Effect.exit)
          if (Exit.isFailure(attempted)) {
            // A declared tool failure may be projected; a mixed Cause must retain its defects/interruption.
            if (!attempted.cause.reasons.every((reason) => reason._tag === "Fail" && reason.error instanceof ToolFailure))
              return yield* fatalToolCause(attempted.cause)
            const reason = attempted.cause.reasons[0]
            if (!reason || reason._tag !== "Fail") return yield* fatalToolCause(attempted.cause)
            if (reason.error.error instanceof ToolSafety.Denied) return yield* reason.error.error
            yield* safety.inspect(reason.error)
            return { result: { type: "error" as const, value: reason.error.message } }
          }
          const output = attempted.value
          yield* safety.inspect(output)
          const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id, output })
          // Lean selects the model view of a complete result only; a bounded result already points at its full file.
          const projected = bounded.outputPaths.length
            ? ToolSafetyOutput.nudge(bounded.output, bounded.outputPaths, yield* resources.limits())
            : location ? yield* lean(input, output, bounded.output, location) : bounded.output
          const result = ToolOutput.toResultValue(projected)
          if (result.type === "error")
            return bounded.outputPaths.length > 0 ? { result, outputPaths: bounded.outputPaths } : { result }
          return bounded.outputPaths.length > 0
            ? { result, output: projected, outputPaths: bounded.outputPaths }
            : { result, output: projected }
        })
      return yield* safety.run(
        invocation,
        acquire ? acquire(invocation, settlement) : settlement,
        (observation) => events ? Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Progress, {
            timestamp: yield* DateTime.now,
            sessionID: input.sessionID,
            assistantMessageID: input.assistantMessageID,
            callID: input.call.id,
            structured: { toolSafety: observation },
            content: [],
          }, { location })
        }) : Effect.void,
        (settlement) => settlement.result.type === "error" ? "failure" : ToolSafetyOutput.outcome(settlement.output),
      ).pipe(
        Effect.provideService(ToolSafety.RuntimeProfileLoader, effectiveLoader),
        Effect.provideService(ToolSafety.RuntimeProfile, effectiveProfile),
        Effect.catchTag("ToolSafety.Denied", (error) =>
          Effect.succeed({ result: { type: "error" as const, value: error.message } }),
        ),
      )
    })
```

## F053

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 243–296.

```typescript
      register: Effect.fn("ToolRegistry.register")(function* (tools) {
        const entries = Object.entries(tools)
        if (entries.length === 0) return
        yield* Effect.forEach(entries, ([name]) => validateName(name), { discard: true })
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const token = {}
            for (const [name, tool] of entries)
              local.set(name, [...(local.get(name) ?? []), { token, registration: { identity: {}, tool } }])
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                for (const [name] of entries) {
                  const registrations = local.get(name)?.filter((registration) => registration.token !== token) ?? []
                  if (registrations.length > 0) local.set(name, registrations)
                  else local.delete(name)
                }
              }),
            )
          }),
        )
      }),
      materialize: Effect.fn("ToolRegistry.materialize")(function* (permissions = [], options) {
        const registrations = new Map(applications.entries())
        for (const [name, entries] of local) {
          const registration = entries.at(-1)?.registration
          if (registration) registrations.set(name, registration)
        }
        for (const [name, registration] of registrations)
          if (whollyDisabled(permission(registration.tool, name), permissions)) registrations.delete(name)
        const definitions = new Map(
          Array.from(registrations, ([name, registration]) => [name, definition(name, registration.tool)] as const),
        )
        const advertised = options?.advertisedNames === undefined ? undefined : new Set(options.advertisedNames)
        const materialization: Materialization = {
          definitions: Array.from(registrations, ([name, registration]) =>
            (advertised === undefined ? !isOnDemand(registration.tool) : advertised.has(name)) ? definitions.get(name) : undefined,
          ).filter((definition): definition is ToolDefinition => definition !== undefined),
          definition: (name) => definitions.get(name),
          registrationIdentity: (name) => registrations.get(name)?.identity,
          settle: (input) => Effect.gen(function* () {
            const registration = registrations.get(input.call.name)
            const settlement: Settlement = registration ? yield* settleWith(input, registration.identity)
              : { result: { type: "error", value: `Unknown tool: ${input.call.name}` } }
            if (settlement.result.type !== "error") return settlement
            // Failure text uses the same dynamic output budget and retention boundary as successful text.
            const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id,
              output: { structured: {}, content: [{ type: "text", text: String(settlement.result.value) }] } })
            const paths = [...new Set([...(settlement.outputPaths ?? []), ...bounded.outputPaths])]
            return { result: { type: "error" as const, value: bounded.output.content
              .flatMap((part) => part.type === "text" ? [part.text] : []).join("") },
              ...(paths.length ? { outputPaths: paths } : {}) }
          }).pipe(Effect.provideService(CapturedMaterialization, materialization)),
        }
        return materialization
```

## F054

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 314–337.

```typescript
export function whollyDisabled(actions: string | ReadonlyArray<string>, rules: PermissionV2.Ruleset) {
  return (typeof actions === "string" ? [actions] : actions).every((action) => {
    const rule = rules.findLast((rule) => Wildcard.match(action, rule.action))
    return rule?.resource === "*" && rule.effect === "deny"
  })
}

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node],
})

/** Native host composition replacements: captures real Location/Event services while constructing the registry. */
export const nativeNode = makeLocationNode({
  service: Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})
export const nativeToolsNode = makeLocationNode({
  service: Tools.Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})

export const toolsNode = makeLocationNode({
```

## F055

`packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — lines 1–63.

````text
# Core Tool Architecture

This folder owns Core's one local tool representation, process and Location registration, effective lookup, and settlement.

## Representations

- `tool.ts` defines the opaque canonical `Tool.make({ description, input, output, execute, toModelOutput })` value. Application tools and shipped built-ins use the same type.
- `application-tools.ts` stores process-scoped application registrations.
- `tools.ts` exposes the registration-only `Tools.Service` view used by Location producers.
- `registry.ts` stores only canonical tools, overlays Location registrations over application registrations, derives definitions, invokes tools, and applies generic output bounding.

Do not add a second executable entry type, registry-owned executor, authorization callback, output-path callback, or legacy normalization path.

## Construction

Tool schemas and projection use `input` and `output` terminology. A tool value is opaque: its codecs, executor, definition derivation, and catalog permission declaration are private runtime details.

Location-scoped built-in layers acquire `PermissionV2.Service` and every other required Location service while the layer is constructed. The executor captures those services. Permission sources are always constructed from the canonical invocation context:

```ts
const source = {
  type: "tool" as const,
  messageID: context.assistantMessageID,
  callID: context.toolCallID,
}
```

Leaves own resolution, permission, and side-effect ordering. Translate only expected typed errors into `ToolFailure`; do not use `catchCause`, because interruption and defects must survive.

## Registration

Built-ins register through `Tools.Service.register({ [name]: tool })`. Application tools register through `ApplicationTools.Service.register(...)`, exposed publicly as `orchestra.tools.register(...)`.

Both are scoped:

- The latest active same-placement registration wins.
- Closing any registration removes only that registration and reveals the next active one.
- Location registrations take precedence over application registrations.
- An invocation captures the effective tool once settlement starts.

`ApplicationTools.Service` is process-scoped and shared by all Locations. `ToolRegistry.Service` is Location-scoped. Do not make the registry process-global or construct a separate application-tool service for each Location.

## Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

Built-in `Tool.withOnDemand` marks catalog metadata only. These tools stay eligible in captured definition/identity lookup and canonical settlement, but default model advertisement omits them. An explicit host-owned `advertisedNames` projection may include them; it never grants execution permission.

## Output

Built-ins return complete validated domain output. `ToolRegistry.Materialization.settle` is the only execution and generic model-output bounding boundary and owns managed retention paths.

A result the generic bound left whole then passes the Lean projection (`lean-output.ts`): only results a native producer attested through `modelCapture` (bash, glob, grep, webfetch) are compacted or summarized, and the measurement reaches the tool part's `metadata.lean` through `LeanOutput.offer/take`. Lean never fails or reorders settlement.

Producer capture limits are separate. For example, Bash keeps `AppProcess.maxOutputBytes` and accurately reports stdout/stderr capture loss, but it does not run model-output truncation or return a managed `outputPath`.

## Current Gaps

- Plugin boot has not been redesigned to register canonical tools through `Tools.Service`; do not redesign it as part of leaf migrations.
- MCP tools (`src/mcp.ts`) register per server through `Tools.Service` as `Tool.dynamic` values, whose input contract is the server's JSON Schema; closing the server's registration scope removes them. Session-scoped registrations still need an explicit design.
- The public Session result shape currently exposes managed `outputPaths`; full storage encapsulation requires a future opaque managed-output reference design.
````

## F056

`packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — lines 16–59.

```typescript
export const MAX_LINES = 2_000
export const MAX_BYTES = 50 * 1024
export const RETENTION = Duration.days(7)

export const MANAGED_DIRECTORY = "tool-output"

export interface BoundInput {
  readonly sessionID: SessionSchema.ID
  readonly toolCallID: string
  readonly output: ToolOutput
}

export interface BoundResult {
  readonly output: ToolOutput
  readonly outputPaths: ReadonlyArray<string>
}

export class StorageError extends Schema.TaggedErrorClass<StorageError>()("ToolOutputStore.StorageError", {
  operation: Schema.Literals(["encode", "write"]),
  cause: Schema.Defect(),
}) {
  override get message() {
    const detail = this.cause instanceof Error ? this.cause.message : String(this.cause)
    return `Failed to ${this.operation} tool output${detail ? `: ${detail}` : ""}`
  }
}

export type Error = StorageError

/** Lean controls for one project directory, read per call after execution so a dashboard toggle applies at once. */
export interface Lean {
  readonly enabled: boolean
  readonly unavailable?: "config_unavailable" | "preferences_unavailable" | "preferences_scope_mismatch"
  readonly items?: LeanCoverage.Settings
  readonly profileID?: string
  /** Data root of the Lean store of complete originals. */
  readonly root: string
}

export interface Interface {
  readonly limits: () => Effect.Effect<{ readonly maxLines: number; readonly maxBytes: number }>
  readonly lean: (owner: LeanProfilePreferences.Owner) => Effect.Effect<Lean>
  readonly bound: (input: BoundInput) => Effect.Effect<BoundResult, Error>
  readonly cleanup: () => Effect.Effect<void>
```

## F057

`packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — lines 126–140.

```typescript
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const config = yield* Effect.serviceOption(Config.Service)
    const directory = path.join(global.data, MANAGED_DIRECTORY)
    const limits = Effect.fn("ToolOutputStore.limits")(function* () {
      if (Option.isNone(config)) return { maxLines: MAX_LINES, maxBytes: MAX_BYTES }
      const entries = yield* config.value.entries().pipe(Effect.catch(() => Effect.succeed([] as Config.Entry[])))
      const configured = Object.assign(
        {},
        ...entries.flatMap((entry) => (entry.type === "document" ? [entry.info.tool_output ?? {}] : [])),
      )
      return { maxLines: configured.max_lines ?? MAX_LINES, maxBytes: configured.max_bytes ?? MAX_BYTES }
```

## F058

`packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — lines 156–238.

```typescript
    const write = Effect.fn("ToolOutputStore.write")(function* (content: string) {
      const file = path.join(directory, `tool_${Identifier.ascending()}`)
      yield* fs.ensureDir(directory).pipe(Effect.mapError((cause) => new StorageError({ operation: "write", cause })))
      yield* fs
        .writeFileString(file, content, { flag: "wx" })
        .pipe(Effect.mapError((cause) => new StorageError({ operation: "write", cause })))
      return file
    })

    const bound = Effect.fn("ToolOutputStore.bound")(function* (input: BoundInput) {
      const outputLimits = yield* limits()
      const media = input.output.content.filter((item) => item.type === "file")
      const text = input.output.content.filter((item) => item.type === "text")
      const contextual =
        input.output.content.length === 0
          ? yield* Effect.try({
              try: () => JSON.stringify(input.output.structured, null, 2) ?? String(input.output.structured),
              catch: (cause) => new StorageError({ operation: "encode", cause }),
            })
          : text.map((item) => item.text).join("")
      if (
        lineCount(contextual) <= outputLimits.maxLines &&
        Buffer.byteLength(contextual, "utf-8") <= outputLimits.maxBytes
      )
        return {
          output: input.output,
          outputPaths: [],
        }

      const outputPath = yield* write(contextual)
      const marker = `... output truncated; full content saved to ${outputPath} ...`

      return {
        output: {
          structured: input.output.structured,
          content: [
            {
              type: "text" as const,
              text: boundedPreview(contextual, marker, outputLimits.maxLines, outputLimits.maxBytes),
            },
            ...media,
          ],
        },
        outputPaths: [outputPath],
      }
    })

    const cleanup = Effect.fn("ToolOutputStore.cleanup")(function* () {
      const entries = yield* fs.readDirectory(directory).pipe(Effect.catch(() => Effect.succeed([])))
      const cutoff = Date.now() - Duration.toMillis(RETENTION)
      for (const entry of entries) {
        if (!entry.startsWith("tool_")) continue
        const file = path.join(directory, entry)
        const info = yield* fs.stat(file).pipe(Effect.catch(() => Effect.void))
        const modified = info?.mtime.pipe(
          Option.map((date) => date.getTime()),
          Option.getOrElse(() => 0),
        )
        if (modified !== undefined && modified < cutoff) yield* fs.remove(file).pipe(Effect.catch(() => Effect.void))
      }
    })

    return Service.of({ limits, lean, bound, cleanup })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Global.node, Config.node] })

export const nodeWithoutConfig = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Global.node] })

/** Runs retention scanning once globally rather than once per active Location. */
export const cleanupLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const store = yield* Service
    yield* store.cleanup().pipe(Effect.repeat(Schedule.spaced(Duration.hours(1))), Effect.forkScoped)
  }),
)

export const cleanupNode = makeGlobalNode({
  name: "tool-output-cleanup",
  layer: Layer.merge(layer, cleanupLayer.pipe(Layer.provide(layer))),
  deps: [FSUtil.node, Global.node],
})
```

## F059

`packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — lines 17–29.

```typescript
export const name = "read"
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const LocationInput = Schema.Struct({
  path: Schema.String,
  offset: ReadToolFileSystem.PageInput.fields.offset.annotate({
    description: "The 1-based directory entry or text line offset to start reading from",
  }),
  limit: ReadToolFileSystem.PageInput.fields.limit.annotate({
    description: "The maximum number of directory entries or text lines to read",
  }),
})
const Input = LocationInput
const Output = Schema.Union([FileSystem.Content, ReadToolFileSystem.TextPage, ReadToolFileSystem.ListPage])
```

## F060

`packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — lines 41–109.

```typescript
        [name]: Tool.make({
          description: `Read a file, or list a directory.

- A relative \`path\` resolves from the working directory; a path outside it asks the owner first.
- A text file up to 50 KB comes back whole as \`content\`, without line numbers. A larger file, or a read with \`offset\` or \`limit\`, comes back as a page of at most 2000 lines and 50 KB starting at line \`offset\`, counted from 1, with lines longer than 2000 characters cut. When more remains, \`truncated\` is true and \`next\` is the offset to continue from.
- A directory lists one level as \`entries\`, directories first and ending in a path separator; \`offset\` and \`limit\` page the entries.
- JPEG, PNG, GIF and WebP images up to 20 MB come back as attachments. PDFs, archives, Office files, other binary files and text that is not UTF-8 are refused.`,
          input: Input,
          output: Output,
          toModelOutput: ({ input, output }) => {
            if (!("encoding" in output) || output.encoding !== "base64" || !SUPPORTED_IMAGE_MIMES.has(output.mime))
              return []
            return [
              { type: "text", text: "Image read successfully" },
              { type: "file", data: output.content, mime: output.mime, name: input.path },
            ]
          },
          execute: (input, context) => {
            return Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.path, kind: "directory" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              const resource = target.resource
              const absolute = AbsolutePath.make(target.canonical)
              const type = yield* reader.inspect(absolute)
              yield* permission.assert({
                action: name,
                resources: [resource],
                save: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })
              if (type === "directory")
                return yield* reader.list(absolute, { offset: input.offset, limit: input.limit })
              const content = yield* reader.read(absolute, resource, {
                offset: input.offset,
                limit: input.limit,
              })
              if ("encoding" in content && content.encoding === "base64" && SUPPORTED_IMAGE_MIMES.has(content.mime)) {
                return yield* image
                  .normalize(resource, { ...content, encoding: "base64" })
                  .pipe(Effect.catchTag("Image.ResizerUnavailableError", () => Effect.succeed(content)))
              }
              if ("encoding" in content && content.encoding === "base64")
                return yield* Effect.fail(new ReadToolFileSystem.BinaryFileError({ resource }))
              return content
            }).pipe(
              Effect.mapError((error) => {
                const message =
                  error instanceof ReadToolFileSystem.BinaryFileError ||
                  error instanceof ToolSafety.Denied ||
                  error instanceof ReadToolFileSystem.MediaIngestLimitError ||
                  error instanceof Image.DecodeError ||
                  error instanceof Image.SizeError
                    ? error.message
                    : `Unable to read ${input.path}`
                return new ToolFailure({ message, ...(error instanceof ToolSafety.Denied ? { error } : {}) })
```

## F061

`packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — lines 93–219.

```typescript
            execute: (input, context) => {
              const applied: Array<typeof Applied.Type> = []
              const fail = (path: string) => {
                const prefix =
                  applied.length === 0
                    ? `Unable to apply patch at ${path}`
                    : `Patch partially applied before failing at ${path}. Applied: ${applied.map((item) => item.resource).join(", ")}`
                return new ToolFailure({ message: prefix })
              }
              return Effect.gen(function* () {
                const source = {
                  type: "tool" as const,
                  messageID: context.assistantMessageID,
                  callID: context.toolCallID,
                }
                if (!input.patchText.trim()) return yield* new ToolFailure({ message: "patchText is required" })
                const hunks = yield* Effect.try({
                  try: () => Patch.parse(input.patchText),
                  catch: (cause) => new ToolFailure({ message: `apply_patch verification failed: ${String(cause)}` }),
                })
                if (hunks.length === 0) return yield* new ToolFailure({ message: "patch rejected: empty patch" })
                const move = hunks.find((hunk) => hunk.type === "update" && hunk.movePath !== undefined)
                if (move) return yield* new ToolFailure({ message: "apply_patch moves are not supported yet" })

                const targets: Array<{ readonly hunk: Patch.Hunk; readonly target: LocationMutation.Target }> = []
                for (const hunk of hunks)
                  targets.push({ hunk, target: yield* mutation.resolve({ path: hunk.path, kind: "file" }) })
                const externalDirectories = new Map<string, LocationMutation.ExternalDirectoryAuthorization>()
                for (const { target } of targets) {
                  const external = target.externalDirectory
                  if (external) externalDirectories.set(external.resource, external)
                }
                for (const external of externalDirectories.values()) {
                  yield* permission.assert({
                    ...LocationMutation.externalDirectoryPermission(external),
                    sessionID: context.sessionID,
                    agent: context.agent,
                    source,
                  })
                }
                yield* permission.assert({
                  action: "edit",
                  resources: [...new Set(targets.map(({ target }) => target.resource))],
                  save: ["*"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })

                const prepared: Prepared[] = []
                for (const { hunk, target } of targets) {
                  yield* Effect.gen(function* () {
                    if (hunk.type === "add") {
                      prepared.push({
                        ...hunk,
                        target,
                        before: "",
                        after:
                          hunk.contents.endsWith("\n") || hunk.contents === "" ? hunk.contents : `${hunk.contents}\n`,
                      })
                      return
                    }
                    if ((yield* fs.stat(target.canonical)).type !== "File") yield* fail(hunk.path)
                    const source = yield* fs.readFile(target.canonical)
                    const original = new TextDecoder("utf-8", { ignoreBOM: true }).decode(source)
                    const before = original.replace(/^\uFEFF/, "")
                    if (hunk.type === "delete") {
                      prepared.push({ ...hunk, target, before, after: "" })
                      return
                    }
                    const update = Patch.derive(hunk.path, hunk.chunks, original)
                    prepared.push({
                      ...hunk,
                      target,
                      source,
                      content: Patch.joinBom(update.content, update.bom),
                      before,
                      after: update.content,
                    })
                  }).pipe(Effect.mapError(() => fail(hunk.path)))
                }

                const patchFiles = prepared.map(patchFile)
                yield* Effect.forEach(
                  prepared,
                  (change) =>
                    Effect.gen(function* () {
                      if (change.type === "add") {
                        const result = yield* files.create({
                          target: change.target,
                          content:
                            change.contents.endsWith("\n") || change.contents === ""
                              ? change.contents
                              : `${change.contents}\n`,
                        })
                        applied.push({ type: change.type, resource: result.resource, target: result.target })
                        return
                      }
                      if (change.type === "delete") {
                        const result = yield* files.remove({ target: change.target })
                        applied.push({ type: change.type, resource: result.resource, target: result.target })
                        return
                      }
                      const result = yield* files.writeIfUnchanged({
                        target: change.target,
                        expected: change.source,
                        content: change.content,
                      })
                      applied.push({ type: change.type, resource: result.resource, target: result.target })
                    }).pipe(Effect.mapError(() => fail(change.path))),
                  { discard: true },
                )
                return { applied, files: patchFiles }
              }).pipe(Effect.mapError((error) => (error instanceof ToolFailure ? error : fail("patch"))))
            },
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/apply-patch",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, FileMutation.node, FSUtil.node, PermissionV2.node],
```

## F062

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 193–210.

````text
The first built-in contribution is bounded `read`:

```text
resolve one path relative to the Location or a named project reference
-> reject absolute paths, path escapes, and symlink escapes
-> authorize read against the canonical resource identity
-> for a file: return UTF-8 text or base64 binary content; page oversized UTF-8 text by bounded line ranges
-> for a directory: return direct children in directory-first alphabetical order
-> page directory results with one-based offset and next cursor
```

V2 `bash` uses the normal permission semantics: configured agent rules plus saved project approvals, with `ask` as the default when no rule matches. Bash is not sandboxed: the spawned shell runs with the host user's filesystem, process, and network authority. Structured external `workdir` resolution remains an enforced `external_directory` authority check. Best-effort scans of absolute command arguments produce advisory warnings only; they are not sandbox boundaries and do not request or enforce `external_directory` approval.

V2 `grep` and `glob` resolve their `path` through `LocationMutation` like `read`: a relative path must stay inside the Location, and an absolute path outside it requires `external_directory` approval before the `grep`/`glob` permission is asked.

An agent that sets no `steps` gets the default ceiling `DEFAULT_MAX_STEPS` (200 provider turns per user input, `packages/core/src/session/runner/max-steps.ts`). On the last step tools are disabled and the agent answers with text only; an explicit `steps` value always wins.

The first V2 `apply_patch` leaf supports add, update, and delete hunks. It parses every hunk, resolves every mutation target, approves external directories, approves one edit batch, and preflights approved update/delete targets before committing operations sequentially. A later commit-time failure leaves earlier operations applied and returns an explicit partial-application report. Moves and atomic rollback remain separate follow-ups rather than implied behavior.
````

## F063

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 74–180.

```typescript
export type Error = BlockedError | CorrectedError

export function evaluate(action: string, resource: string, ...rulesets: Permission.Ruleset[]): Permission.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource)) ?? {
      action,
      resource: "*",
      effect: "ask",
    }
  )
}

export function merge(...rulesets: Permission.Ruleset[]): Permission.Ruleset {
  return rulesets.flat()
}

export interface Interface {
  /** Read-only current policy assessment; never queues, publishes, or grants approval. */
  readonly evaluate: (input: AssertInput) => EffectRuntime.Effect<Permission.Effect, SessionV2.NotFoundError>
  readonly ask: (input: AssertInput) => EffectRuntime.Effect<AskResult, SessionV2.NotFoundError>
  readonly assert: (input: AssertInput) => EffectRuntime.Effect<void, Error | SessionV2.NotFoundError>
  /** Ordinary authorization with typed rejection; legacy assert retains rejection as a defect. */
  readonly authorize: (input: AssertInput) => EffectRuntime.Effect<void, Error | DeclinedError | SessionV2.NotFoundError>
  /** Native host intent check. Configured deny wins; agent/saved allow cannot replace a live reply. */
  readonly askExplicit: (input: AssertInput) => EffectRuntime.Effect<void, Error | DeclinedError | SessionV2.NotFoundError>
  readonly reply: (input: ReplyInput) => EffectRuntime.Effect<void, NotFoundError>
  /** Rejects every open request of the Session; Stop calls it after the turn has been interrupted. */
  readonly cancelSession: (sessionID: SessionV2.ID) => EffectRuntime.Effect<void>
  readonly get: (id: ID) => EffectRuntime.Effect<Request | undefined>
  readonly forSession: (sessionID: SessionV2.ID) => EffectRuntime.Effect<ReadonlyArray<Request>>
  readonly list: () => EffectRuntime.Effect<ReadonlyArray<Request>>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Permission") {}

interface Pending {
  readonly request: Request
  readonly agent?: AgentV2.ID
  readonly deferred: Deferred.Deferred<void, DeclinedError | CorrectedError>
  readonly explicit: boolean
}

const layer = Layer.effect(
  Service,
  EffectRuntime.gen(function* () {
    const events = yield* EventV2.Service
    const location = yield* Location.Service
    const agents = yield* AgentV2.Service
    const sessions = yield* SessionStore.Service
    const saved = yield* PermissionSaved.Service
    const pending = new Map<ID, Pending>()

    yield* EffectRuntime.addFinalizer(() =>
      EffectRuntime.forEach(pending.values(), (item) => Deferred.fail(item.deferred, new DeclinedError()), {
        discard: true,
      }).pipe(
        EffectRuntime.ensuring(
          EffectRuntime.sync(() => {
            pending.clear()
          }),
        ),
      ),
    )

    const savedRules = EffectRuntime.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
        (item): Permission.Rule => ({ action: item.action, resource: item.resource, effect: "allow" }),
      )
    })

    const configured = EffectRuntime.fn("PermissionV2.configured")(function* (
      sessionID: SessionV2.ID,
      agentID?: AgentV2.ID,
    ) {
      const session = yield* sessions.get(sessionID)
      if (!session) return yield* new SessionV2.NotFoundError({ sessionID })
      const agent = yield* agents.resolve(agentID ?? session.agent)
      return agent?.permissions ?? missingAgentPermissions
    })

    function denied(input: AssertInput, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === "deny")
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    const evaluateInput = EffectRuntime.fnUntraced(function* (input: AssertInput) {
      const rules = yield* configured(input.sessionID, input.agent)
      if (denied(input, rules)) return { effect: "deny" as const, rules }
      const all = [...rules, ...(yield* savedRules())]
      const effects = input.resources.map((resource) => evaluate(input.action, resource, all).effect)
      const effect: Permission.Effect = effects.includes("deny") ? "deny" : effects.includes("ask") ? "ask" : "allow"
      return { effect, rules: all }
    })

    function request(input: AssertInput, explicit = false): Request {
      return {
        id: input.id ?? ID.create(),
        sessionID: input.sessionID,
        action: input.action,
        resources: input.resources,
        ...(explicit || input.save === undefined ? {} : { save: input.save }),
        ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
```

## F064

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 200–337.

```typescript
    const cancel = (id: ID) =>
      EffectRuntime.uninterruptible(
        EffectRuntime.gen(function* () {
          const existing = pending.get(id)
          if (!existing) return
          pending.delete(id)
          yield* events.publish(Event.Replied, {
            sessionID: existing.request.sessionID,
            requestID: id,
            reply: "reject",
          })
          yield* Deferred.fail(existing.deferred, new DeclinedError())
        }),
      )

    // Interrupting a Session settles every open request of it, including any no fiber still waits on.
    const cancelSession = EffectRuntime.fn("PermissionV2.cancelSession")(function* (sessionID: SessionV2.ID) {
      const ids = Array.from(pending.values())
        .filter((item) => item.request.sessionID === sessionID)
        .map((item) => item.request.id)
      yield* EffectRuntime.forEach(ids, cancel, { discard: true })
    })

    const ask = EffectRuntime.fn("PermissionV2.ask")(function* (input: AssertInput) {
      const result = yield* evaluateInput(input)
      const value = request(input)
      if (result.effect === "ask") yield* create(value, input.agent)
      return { id: value.id, effect: result.effect }
    })

    const authorize = EffectRuntime.fn("PermissionV2.authorize")((input: AssertInput) =>
      EffectRuntime.uninterruptibleMask((restore) =>
        EffectRuntime.gen(function* () {
          const result = yield* evaluateInput(input)
          if (result.effect === "deny") {
            return yield* new BlockedError({
              rules: relevant(input, result.rules),
            })
          }
          if (result.effect === "allow") return
          const item = yield* create(request(input), input.agent)
          return yield* restore(Deferred.await(item.deferred)).pipe(
            EffectRuntime.onInterrupt(() => cancel(item.request.id)),
            EffectRuntime.ensuring(
              EffectRuntime.sync(() => {
                pending.delete(item.request.id)
              }),
            ),
          )
        }),
      ),
    )

    const assert = EffectRuntime.fn("PermissionV2.assert")((input: AssertInput) =>
      authorize(input).pipe(EffectRuntime.catchTag("PermissionV2.DeclinedError", (error) => EffectRuntime.die(error))),
    )

    const askExplicit = EffectRuntime.fn("PermissionV2.askExplicit")((input: AssertInput) =>
      EffectRuntime.uninterruptibleMask((restore) =>
        EffectRuntime.gen(function* () {
          const rules = yield* configured(input.sessionID, input.agent)
          if (denied(input, rules)) return yield* new BlockedError({ rules: relevant(input, rules) })
          const item = yield* create(request(input, true), input.agent, true)
          return yield* restore(Deferred.await(item.deferred)).pipe(
            EffectRuntime.onInterrupt(() => cancel(item.request.id)),
            EffectRuntime.ensuring(EffectRuntime.sync(() => pending.delete(item.request.id))),
          )
        }),
      ),
    )

    const reply = EffectRuntime.fn("PermissionV2.reply")((input: ReplyInput) =>
      EffectRuntime.uninterruptible(
        EffectRuntime.gen(function* () {
          const existing = pending.get(input.requestID)
          if (!existing) return yield* new NotFoundError({ requestID: input.requestID })
          yield* events.publish(Event.Replied, {
            sessionID: existing.request.sessionID,
            requestID: existing.request.id,
            reply: input.reply,
          })

          if (input.reply === "reject") {
            yield* Deferred.fail(
              existing.deferred,
              input.message ? new CorrectedError({ feedback: input.message }) : new DeclinedError(),
            )
            pending.delete(input.requestID)
            for (const [id, item] of pending) {
              if (item.request.sessionID !== existing.request.sessionID) continue
              yield* events.publish(Event.Replied, {
                sessionID: item.request.sessionID,
                requestID: item.request.id,
                reply: "reject",
              })
              yield* Deferred.fail(item.deferred, new DeclinedError())
              pending.delete(id)
            }
            return
          }

          if (input.reply === "always" && existing.request.save?.length) {
            yield* saved.add({
              projectID: location.project.id,
              action: existing.request.action,
              resources: existing.request.save,
            })
          }
          yield* Deferred.succeed(existing.deferred, undefined)
          pending.delete(input.requestID)
          if (input.reply !== "always" || !existing.request.save?.length) return

          const rememberedRules = yield* savedRules()
          for (const [id, item] of pending) {
            if (item.explicit) continue
            const input = { ...item.request }
            const rules = yield* configured(item.request.sessionID, item.agent).pipe(
              EffectRuntime.catchTag("Session.NotFoundError", () => EffectRuntime.succeed(undefined)),
            )
            if (!rules) continue
            if (denied(input, rules)) continue
            const effective = [...rules, ...rememberedRules]
            if (
              !item.request.resources.every(
                (resource) => evaluate(item.request.action, resource, effective).effect === "allow",
              )
            )
              continue
            yield* events.publish(Event.Replied, {
              sessionID: item.request.sessionID,
              requestID: item.request.id,
              reply: "always",
            })
            yield* Deferred.succeed(item.deferred, undefined)
            pending.delete(id)
          }
        }),
      ),
```

## F065

`packages/core/src/question.ts:cb64c1eb972bc01c6019f52a4fb2e71f37110457` — lines 56–170.

```typescript
export interface Interface {
  readonly ask: (input: AskInput) => Effect.Effect<ReadonlyArray<Answer>, RejectedError>
  readonly reply: (input: ReplyInput) => Effect.Effect<void, NotFoundError>
  readonly reject: (requestID: ID) => Effect.Effect<void, NotFoundError>
  /** Rejects every open question of the Session; Stop calls it after the turn has been interrupted. */
  readonly cancelSession: (sessionID: SessionSchema.ID) => Effect.Effect<void>
  readonly list: () => Effect.Effect<ReadonlyArray<Request>>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Question") {}

interface Pending {
  readonly request: Request
  readonly deferred: Deferred.Deferred<ReadonlyArray<Answer>, RejectedError>
}

/**
 * Location-owned pending prompts. The Location layer map must materialize this
 * layer once per embedded Location so replies cannot settle another Location's
 * deferred request.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const pending = new Map<ID, Pending>()

    yield* Effect.addFinalizer(() =>
      Effect.forEach(pending.values(), (item) => Deferred.fail(item.deferred, new RejectedError()), {
        discard: true,
      }).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            pending.clear()
          }),
        ),
      ),
    )

    const ask = Effect.fn("QuestionV2.ask")((input: AskInput) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const id = ID.ascending()
          const deferred = yield* Deferred.make<ReadonlyArray<Answer>, RejectedError>()
          const request: Request = { id, ...input }
          pending.set(id, { request, deferred })
          return yield* events.publish(Event.Asked, request).pipe(
            Effect.andThen(
              restore(Deferred.await(deferred)).pipe(
                // A turn interrupted while it waits (Stop) must still tell clients the request is gone.
                Effect.onInterrupt(() =>
                  Effect.suspend(() =>
                    pending.delete(id)
                      ? events.publish(Event.Rejected, { sessionID: request.sessionID, requestID: id })
                      : Effect.void,
                  ),
                ),
              ),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                pending.delete(id)
              }),
            ),
          )
        }),
      ),
    )

    const reply = Effect.fn("QuestionV2.reply")((input: ReplyInput) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const existing = pending.get(input.requestID)
          if (!existing) return yield* new NotFoundError({ requestID: input.requestID })
          yield* events.publish(Event.Replied, {
            sessionID: existing.request.sessionID,
            requestID: existing.request.id,
            answers: input.answers.map((answer) => [...answer]),
          })
          yield* Deferred.succeed(existing.deferred, input.answers)
          pending.delete(input.requestID)
        }),
      ),
    )

    const reject = Effect.fn("QuestionV2.reject")((requestID: ID) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const existing = pending.get(requestID)
          if (!existing) return yield* new NotFoundError({ requestID })
          yield* events.publish(Event.Rejected, {
            sessionID: existing.request.sessionID,
            requestID: existing.request.id,
          })
          yield* Deferred.fail(existing.deferred, new RejectedError())
          pending.delete(requestID)
        }),
      ),
    )

    // Interrupting a Session rejects every open question of it, including any no fiber still waits on.
    const cancelSession = Effect.fn("QuestionV2.cancelSession")((sessionID: SessionSchema.ID) =>
      Effect.uninterruptible(
        Effect.forEach(
          Array.from(pending.values()).filter((item) => item.request.sessionID === sessionID),
          (item) =>
            Effect.suspend(() => {
              if (!pending.delete(item.request.id)) return Effect.void
              return events
                .publish(Event.Rejected, { sessionID, requestID: item.request.id })
                .pipe(Effect.andThen(Deferred.fail(item.deferred, new RejectedError())))
            }),
          { discard: true },
        ),
      ),
```

## F066

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 195–201.

```typescript
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
```

## F067

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 289–306.

```typescript
      const settle = (call: ToolCall, assistantMessageID: SessionMessage.ID, materialization: ToolRegistry.Materialization) =>
        stepTools.refuses(call.name, call.input) ? Effect.succeed(STEP_TOOL_REFUSAL) : CapabilityInvocation.withContext(
          {
            issuer: "core",
            owner: {
              projectID: location.project.id,
              location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
              sessionID: session.id,
              agentID: agent.id,
            },
            invocation: { sessionID: session.id, agentID: agent.id, assistantMessageID, callID: call.id },
            rootToolName: call.name,
            effectiveRules,
            // Core selection has configured permissions, not a separate native Permission floor.
            nativeDenyFloor: [],
          },
          materialization.settle({ sessionID: session.id, agent: agent.id, model: modelRef, assistantMessageID, call }),
        ).pipe(Effect.catchTag("Capability.Failure", (error) => Effect.die(error)))
```

## F068

`packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — lines 18–50.

```typescript
/** Host-bound preferences, never decoded from tool arguments or inherited environment waivers. */
export type Profile = {
  readonly writeRoots?: ReadonlyArray<string>
  readonly protectedWrites?: ReadonlyArray<string>
  readonly allowedConfigEdits?: ReadonlyArray<string>
  readonly corpusFiles?: ReadonlyArray<string>
  readonly transcriptFiles?: ReadonlyArray<string>
  readonly maxTranscriptBytes?: number
  readonly requireSandbox?: boolean
  readonly neverTouch?: ReadonlyArray<string>
  readonly askBefore?: ReadonlyArray<string>
  readonly managedPaths?: ReadonlyArray<string>
  readonly sandbox?: {
    readonly enabled: boolean
    readonly allowedDomains?: ReadonlyArray<string>
    /** Exact existing local sockets, granted only by the programmatic host and bound to native placement. */
    readonly allowedUnixSockets?: readonly { readonly directory: string; readonly path: string }[]
    /** Owned route-adapted clients only: Darwin Unix broker, Linux srt strict-allowlist CONNECT proxy; raw TCP denied; Windows HOLD. */
    readonly allowedLoopbackEndpoints?: readonly { readonly directory: string; readonly host: "127.0.0.1"; readonly port: number }[]
    readonly denyPaths?: ReadonlyArray<string>
    /** Give each sandboxed command a fresh writable directory as TMPDIR, removed when the command ends. */
    readonly scratch?: boolean
    /** Where no sandbox can run, run the command without the write jail and report it instead of holding it. */
    readonly unconfinedFallback?: boolean
    /**
     * Confine reads too: the command reads only these paths, its write roots, its scratch directory and the host's
     * toolchain (ToolSafetySandbox.toolchain); every other path is denied. A host without a sandbox refuses the command,
     * whatever `unconfinedFallback` says. Host-bound only (native seats' shells); macOS and Linux.
     */
    readonly readRoots?: ReadonlyArray<string>
  }
  /** Installed Relay hooks (`hooks.json`), pinned per install. Only ToolSafety.run enforces them; they grant nothing. */
  readonly hooks?: ReadonlyArray<RelayHook.Install>
```

## F069

`packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — lines 102–139.

```typescript
export const RuntimeProfile = Context.Reference<Profile | undefined>("@orchestra/ToolSafety/Profile", {
  defaultValue: () => undefined,
})

/** Captured native placement. Command cwd and model arguments cannot move policy roots. */
export const NativeContext = Context.Reference<
  | {
      readonly directory: string
      readonly projectID?: string
    }
  | undefined
>("@orchestra/ToolSafety/NativeContext", { defaultValue: () => undefined })

export type Approval = {
  readonly action: string
  readonly resources: readonly string[]
  readonly invocation: Invocation
  /** A hook's own words for the approval card; askBefore approvals have none. */
  readonly message?: string
  /** A Session event's hook asks with no tool call to bind: its event, such as `prompt.before`. */
  readonly trigger?: string
  /** Final prompt identity captured by the Session host, never hook parameters. */
  readonly messageID?: string
}
export const NativeHost = Context.Reference<
  | {
      /** Must await actual native permission decision; preferences never grant authority. */
      readonly ask: (request: Approval) => Effect.Effect<void, Denied>
    }
  | undefined
>("@orchestra/ToolSafety/NativeHost", { defaultValue: () => undefined })

export const RuntimeProfileLoader = Context.Reference<(() => Effect.Effect<Profile | undefined, Denied>) | undefined>(
  "@orchestra/ToolSafety/ProfileLoader",
  { defaultValue: () => undefined },
)

export class Denied extends Schema.TaggedErrorClass<Denied>()("ToolSafety.Denied", {
```

## F070

`packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — lines 337–352.

```typescript
export interface Interface {
  readonly before: (input: Invocation) => Effect.Effect<void, Denied>
  readonly inspect: (output: unknown) => Effect.Effect<void, Denied>
  readonly run: <A, E, R>(
    input: Invocation,
    effect: Effect.Effect<A, E, R>,
    observe: (observation: Observation) => Effect.Effect<void>,
    outcome?: (value: A) => "success" | "failure" | "cancelled",
  ) => Effect.Effect<A, E | Denied, R>
  /**
   * Wraps one native tool call's settlement inside `run`, for a host that retains what a call returned (the research
   * seat's acquisition receipts). Absent, the settlement passes through.
   */
  readonly acquire?: <E, R>(input: Invocation, effect: Effect.Effect<Settlement, E, R>) => Effect.Effect<Settlement, E | Denied, R>
  /** Installed hooks on a Session event, over the profile loaded for it; only a `prompt` denial has an effect to stop. */
  readonly session: (input: SessionEvent) => Effect.Effect<ReadonlyArray<string>, Denied>
```

## F071

`packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — lines 375–501.

```typescript
  const before = Effect.fn("ToolSafety.before")(function* (input: Invocation) {
    const args = record(input.args)
    const command = ToolSafetyCommands.command(input.tool, input.args)
    if (command) {
      const reason = ToolSafetyCommands.reason(command)
      if (reason) return yield* new Denied({ reason })
    }
    const profile = native(yield* RuntimeProfile)
    if (command && /\bgit\b[^\n;&|]*\b(?:add|commit)\b/.test(command)) {
      if (!input.directory || !fs || !processService)
        return yield* new Denied({ reason: "git-hygiene-native-binding-missing" })
      yield* ToolSafetyGit.before({
        command,
        directory: input.directory,
        projectDirectory: input.projectDirectory,
        cwd: typeof args.workdir === "string" ? args.workdir : typeof args.cwd === "string" ? args.cwd : undefined,
        managedPaths: [
          ...(global
            ? [
                global.data,
                global.state,
                path.join(global.home, ".git-credentials"),
                path.join(global.home, ".npmrc"),
                path.join(global.home, ".aws"),
                path.join(global.home, ".ssh"),
              ]
            : []),
          ...(profile?.managedPaths ?? []),
        ],
        neverTouch: profile?.neverTouch,
      }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processService))
    }
    if (!profile) return
    if (!input.directory || !input.projectID) return yield* new Denied({ reason: "missing-native-binding" })
    const actions = command ? ToolSafetyCommands.actions(command) : [input.tool]
    const required = actions.filter((action) => profile.askBefore?.includes(action))
    if (required.length) {
      const host = yield* NativeHost
      if (!host) return yield* new Denied({ reason: "ask-before-native-binding-missing" })
      yield* Effect.forEach(
        required,
        (action) =>
          host.ask({
            action,
            resources: command ? [command] : [input.tool],
            invocation: input,
          }),
        { discard: true },
      )
    }
    if (profile.requireSandbox && command !== undefined && !["bash", "shell", "task", "process", "process_control"].includes(input.tool))
      return yield* new Denied({ reason: "required-process-sandbox-unbound" })

    const writing = ["write", "edit", "multiedit", "apply_patch"].includes(input.tool)
    const reading = input.tool === "read"
    if (!writing && !reading) return
    // Patch.parse is the grammar the apply_patch tools apply, so these are exactly the files a patch writes
    const paths =
      input.tool === "apply_patch"
        ? yield* Effect.try({
            try: () =>
              Patch.parse(typeof args.patchText === "string" ? args.patchText : "").flatMap((hunk) =>
                hunk.type === "update" && hunk.movePath ? [hunk.path, hunk.movePath] : [hunk.path],
              ),
            catch: () => new Denied({ reason: "invalid-patch-acquisition" }),
          })
        : typeof args.filePath === "string"
          ? [args.filePath]
          : reading && typeof args.path === "string"
            ? [args.path]
            : []
    if (paths.length === 0) return yield* new Denied({ reason: "missing-native-path" })
    if (!fs) return yield* new Denied({ reason: "filesystem-acquisition" })
    const directory = yield* fs
      .realPath(input.directory)
      .pipe(Effect.mapError(() => new Denied({ reason: "binding-acquisition" })))
    yield* Effect.forEach(
      paths,
      (target) =>
        Effect.gen(function* () {
          const physical = yield* canonical(path.resolve(directory, target))
          const relative = path.relative(directory, physical).replaceAll("\\", "/")
          if (profile.neverTouch?.some((pattern) => fs.globMatch(pattern, relative) || fs.globMatch(pattern, physical)))
            return yield* new Denied({ reason: "project-never-touch" })
          const literalDenies = yield* Effect.forEach(
            (profile.neverTouch ?? []).filter((pattern) => !/[*?[]/.test(pattern)),
            (entry) => canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))),
          )
          if (literalDenies.some(Boolean)) return yield* new Denied({ reason: "project-never-touch" })
          const matches = (entries: ReadonlyArray<string> = []) =>
            Effect.forEach(entries, (entry) =>
              canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))),
            ).pipe(Effect.map((entries) => entries.some(Boolean)))
          if (writing) {
            if (profile.writeRoots !== undefined) {
              // A root may be a file or a path not created yet; it resolves through its nearest existing ancestor on
              // every call, so a root later replaced by a symlink is judged by where it points now.
              const roots = yield* Effect.forEach(profile.writeRoots, (root) =>
                canonical(path.resolve(directory, root)).pipe(
                  Effect.mapError(() => new Denied({ reason: "write-root-acquisition" })),
                ),
              )
              if (!roots.some((root) => contains(root, physical)))
                return yield* new Denied({ reason: "write-outside-physical-roots" })
            }
            if ((yield* matches(profile.protectedWrites)) && !(yield* matches(profile.allowedConfigEdits)))
              return yield* new Denied({ reason: "protected-instruction-or-config-write" })
            // Native leaf edit/external_directory permissions still decide authorization.
            return
          }
          if (yield* matches(profile.corpusFiles)) {
            const info = yield* fs
              .stat(physical)
              .pipe(Effect.mapError(() => new Denied({ reason: "corpus-stat-acquisition" })))
            if (info.type !== "File") return yield* new Denied({ reason: "corpus-not-file" })
            if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 400)
              return yield* new Denied({ reason: "defense-corpus-bulk-read" })
          }
          if (yield* matches(profile.transcriptFiles)) {
            const cap = profile.maxTranscriptBytes ?? 400_000
            if (!Number.isSafeInteger(cap) || cap <= 0)
              return yield* new Denied({ reason: "invalid-transcript-budget" })
            const info = yield* fs
              .stat(physical)
              .pipe(Effect.mapError(() => new Denied({ reason: "transcript-stat-acquisition" })))
            if (info.type !== "File") return yield* new Denied({ reason: "transcript-not-file" })
            if (info.size > cap) return yield* new Denied({ reason: "transcript-context-budget" })
```

## F072

`packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — lines 514–585.

```typescript
      projectID: input.projectID,
    }
    // Nested runs (the registry's durable observation inside the session's) share the outermost cell, so every
    // observation of the call carries the fact.
    const report: { cell: { fact?: ShellFact } } = { cell: {} }
    return Effect.gen(function* () {
      report.cell = (yield* ShellReport) ?? report.cell
      const loader = yield* RuntimeProfileLoader
      // Loaded once: the whole call, its after hooks included, keeps this snapshot even if hooks.json changes meanwhile.
      const loaded = loader ? yield* loader() : yield* RuntimeProfile
      const profile = native(loaded)
      yield* before(input).pipe(Effect.provideService(RuntimeProfile, profile))
      const outer = yield* HookedCall
      const hooked =
        loaded?.hooks && outer !== input.callID
          ? yield* ToolSafetyHooks.before({ installs: loaded.hooks, call: input, profile, resolve: canonical, ambient })
          : undefined
      yield* observe({ ...observation, outcome: "started" })
      const ran = effect.pipe(
        Effect.provideService(RuntimeProfile, profile),
        Effect.provideService(
          NativeContext,
          input.directory ? { directory: input.directory, projectID: input.projectID } : undefined,
        ),
        Effect.provideService(ShellReport, report.cell),
        Effect.provideService(HookedCall, hooked ? input.callID : outer),
        sanitizeFailure,
      )
      if (!hooked) return yield* ran
      // A call that fails instead of returning a result still hands its `before` notes to the model.
      const value = yield* ToolSafetyHooks.failing(hooked, ran)
      return yield* ToolSafetyHooks.after(hooked, value, (outcome?.(value) ?? "success") === "success")
    }).pipe(
      Effect.onExit((exit) => {
        const shell = report.cell.fact
        if (shell) {
          const recorded = worse(shells.get(input.sessionID), shell)
          shells.delete(input.sessionID)
          shells.set(input.sessionID, recorded)
          if (shells.size > 1024) shells.delete(shells.keys().next().value!)
        }
        if (Exit.isSuccess(exit))
          return observe({ ...observation, ...shell, outcome: outcome?.(exit.value) ?? "success" })
        const error =
          Option.getOrUndefined(Cause.findErrorOption(exit.cause)) ??
          Result.getOrUndefined(Cause.findDefect(exit.cause))
        return observe({
          ...observation,
          ...shell,
          outcome: Cause.hasInterrupts(exit.cause) ? "cancelled" : error instanceof Denied ? "held" : "failure",
          ...(error instanceof Denied ? { reason: error.reason } : {}),
        })
      }),
    )
  }

  const session: Interface["session"] = (input) =>
    Effect.gen(function* () {
      const loader = yield* RuntimeProfileLoader
      // Profile loaders never read hooks from state inside the project, so that placement has no installs to fire:
      // only the host profile applies. Every other acquisition failure still refuses the event, and tool calls keep
      // refusing this placement.
      const loaded = loader
        ? yield* loader().pipe(
            Effect.catchIf(
              (error) => error.reason === "profile-state-inside-project",
              () => RuntimeProfile,
            ),
          )
        : yield* RuntimeProfile
      if (!loaded?.hooks) return []
      return yield* ToolSafetyHooks.session({ installs: loaded.hooks, event: input, profile: native(loaded), ambient })
```

## F073

`packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b` — lines 173–294.

```typescript
          execute: (input, context) =>
            Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.workdir ?? ".", kind: "directory" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              const warnings = (yield* externalCommandDirectories(fs, input.command, target.canonical)).map(
                (directory) =>
                  `Command argument references external directory ${path.join(directory, "*").replaceAll("\\", "/")}. Bash runs with host-user filesystem, process, and network authority; this scan is advisory only.`,
              )
              yield* permission.assert({
                action: name,
                resources: [input.command],
                save: [input.command],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              if ((yield* fs.stat(target.canonical)).type !== "Directory")
                return yield* Effect.fail(new Error(`Working directory is not a directory: ${target.canonical}`))

              const project = yield* ToolSafety.RuntimeProfile
              // A read-only agent's shell runs inside the OS sandbox with no write root; a host without one refuses the command.
              const profile = context.agent && READ_ONLY_SHELL.has(context.agent)
                ? {
                    ...project,
                    writeRoots: [],
                    requireSandbox: true,
                    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: false },
                  } satisfies ToolSafety.Profile
                : project
              // A background process outlives the call, so a profile that confines shells refuses it.
              if (input.background && (profile?.requireSandbox || profile?.sandbox?.enabled || profile?.sandbox?.readRoots))
                return yield* new ToolSafety.Denied({ reason: "background-process-sandbox-unbound" })
              const shell = configuredShell(yield* config.entries())
              const command = ChildProcess.make(input.command, [], {
                cwd: target.canonical,
                shell,
                stdin: "ignore",
                detached: process.platform !== "win32",
                forceKillAfter: Duration.seconds(3),
              })
              const timeout = input.timeout ?? DEFAULT_TIMEOUT_MS
              yield* ToolSafetyGit.before({ command: input.command, directory: location.directory,
                projectDirectory: Project.isRoot(location.project.directory) ? location.directory : location.project.directory,
                cwd: target.canonical, env: ToolSafetySandbox.environment(), managedPaths: profile?.managedPaths,
                neverTouch: profile?.neverTouch,
              }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, appProcess))

              if (input.background) {
                if (Option.isNone(sessionProcess))
                  return yield* new ToolFailure({ message: "Session process registry is unavailable" })
                // The same confinement and environment scrub as a foreground call, kept open for the process's life.
                const launched = yield* sessionProcess.value.launch({
                  sessionID: context.sessionID,
                  command,
                  title: input.command,
                  prepare: (command) =>
                    ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                      Effect.provideService(FSUtil.Service, fs),
                      Effect.provideService(ToolSafety.RuntimeProfile, profile),
                    ),
                })
                return {
                  output: `Started background process ${launched.processID}.`,
                  truncated: false,
                  processID: launched.processID,
                  ...(warnings.length ? { warnings } : {}),
                }
              }

              const result = yield* Effect.scoped(Effect.gen(function* () {
                const inspector = OutputInspector.make()
                const wrapped = yield* ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                  Effect.provideService(FSUtil.Service, fs),
                  Effect.provideService(ToolSafety.RuntimeProfile, profile),
                )
                // Same confinement and inspection, but the command runs in a terminal tab the owner can see and answer.
                if (wrapped._tag === "StandardCommand" && AgentTerminal.enabled(wrapped)) {
                  const ran = yield* AgentTerminal.run(pty, {
                    command: wrapped,
                    title: input.command,
                    timeout,
                    maxChars: MAX_CAPTURE_BYTES,
                  })
                  if (!ran) return undefined
                  const output = Buffer.from(ran.output)
                  return {
                    command: input.command,
                    exitCode: ran.exitCode,
                    output,
                    stdout: output,
                    stderr: Buffer.alloc(0),
                    outputTruncated: ran.truncated,
                    stdoutTruncated: ran.truncated,
                    stderrTruncated: false,
                  } satisfies AppProcess.RunResult
                }
                const captured = yield* appProcess.run(wrapped, {
                  combineOutput: true,
                  timeout: Duration.millis(timeout),
                  maxOutputBytes: MAX_CAPTURE_BYTES,
                  inspect: (chunk) => {
                    const reason = inspector.push(chunk)
                    if (reason) throw new ToolSafety.Denied({ reason })
                  },
                })
                const reason = inspector.finish()
                if (reason) return yield* new ToolSafety.Denied({ reason })
                return captured
              })).pipe(
```

## F074

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 24–78.

```typescript
/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS", "ORCHESTRA_AUTH_CONTENT"].includes(name) &&
    !/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(value)))
}

/** The macOS seatbelt launcher. A host without it (or with this pointed elsewhere) has no seatbelt sandbox. */
export const Seatbelt = Context.Reference<string>("@orchestra/ToolSafetySandbox/Seatbelt", {
  defaultValue: () => "/usr/bin/sandbox-exec",
})

/** Discovery performs filesystem checks only; confinement starts when the caller spawns the command. */
export const available = (executable?: string) => Effect.gen(function* () {
  const seatbelt = yield* Seatbelt
  return yield* Effect.tryPromise({
    try: async () => {
      const binary = await which(executable ?? "srt", { nothrow: true })
      if (binary || executable || process.platform !== "darwin") return binary
      return which(seatbelt, { nothrow: true })
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-binary-acquisition" }),
  })
})

export const backend = Effect.fn("ToolSafetySandbox.backend")(function* () {
  const binary = yield* available()
  return binary ? { kind: binary === (yield* Seatbelt) ? "seatbelt" as const : "srt" as const, binary } : undefined
})

/** The write-jail fact this host would give a sandbox-bound command now, without starting an acquisition. */
export const status = Effect.fn("ToolSafetySandbox.status")(function* () {
  const picked = yield* pick(false).pipe(Effect.catch((error) => Effect.succeed({ kind: "none" as const, reason: error.reason })))
  return (picked.kind === "none"
    ? { shellWrites: "unenforced", shellSandbox: { kind: "none", reason: picked.reason } }
    : { shellWrites: "enforced", shellSandbox: { kind: picked.kind } }) satisfies ToolSafety.ShellFact
})

/** Caller keeps this Scope open through child exit; policy file is removed on success/failure/cancellation. */
export const wrap = Effect.fn("ToolSafetySandbox.wrap")(function* (
  command: ChildProcess.Command,
  /** Native host only, after the shell's permission approval; prehooks must leave this absent. */
  options?: { readonly prepareParents?: boolean },
): Effect.fn.Return<ChildProcess.Command, ToolSafety.Denied, FSUtil.Service | Scope.Scope> {
  const profile = yield* ToolSafety.RuntimeProfile
  if (command._tag !== "StandardCommand") {
    if (profile?.requireSandbox || profile?.sandbox?.enabled || profile?.sandbox?.allowedUnixSockets?.length || profile?.sandbox?.allowedLoopbackEndpoints?.length)
      return yield* new ToolSafety.Denied({ reason: "sandbox-pipeline-unbound" })
    return ChildProcess.pipeTo(yield* wrap(command.left), yield* wrap(command.right), command.options)
  }
  const env = environment(command.options.extendEnv === false
    ? command.options.env ?? {}
    : { ...process.env, ...command.options.env })
  const ordinary = ChildProcess.make(command.command, command.args, { ...command.options, env, extendEnv: false })
```

## F075

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 90–205.

```typescript
  const requestedEndpoints = profile?.sandbox?.allowedLoopbackEndpoints
  if (requestedEndpoints !== undefined && !Array.isArray(requestedEndpoints))
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-grants" })
  if (requestedEndpoints && requestedEndpoints.length > 32)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-resource-limit" })
  const endpointGrants = Array.from(requestedEndpoints ?? [], (entry) => ({ ...entry }))
  yield* Effect.forEach(endpointGrants, (entry) => Effect.gen(function* () {
    if (typeof entry.directory !== "string" || !path.isAbsolute(entry.directory) || /[*?\[\]\0]/.test(entry.directory))
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-directory" })
    if (entry.host !== "127.0.0.1") return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-host" })
    if (!Number.isSafeInteger(entry.port) || entry.port < 1 || entry.port > 65535)
      return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-invalid-port" })
  }), { discard: true })
  const reads = profile?.sandbox?.readRoots
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0 && !reads) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
  if (endpointGrants.length && !["darwin", "linux", "win32"].includes(process.platform))
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
  if (grants.length && process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-platform-unsupported" })
  if (endpointGrants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-domain-policy-unenforceable" })
  if (grants.length && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-domain-policy-unenforceable" })
  const discovered = grants.length || endpointGrants.length ? undefined : yield* pick(true, false, command).pipe(
    // A first Linux runtime acquisition runs in the background. Confined reads never run unconfined, so they wait for it.
    Effect.repeat({
      while: (picked) => reads !== undefined && picked.kind === "none" && picked.reason === "sandbox-runtime-acquiring",
      schedule: Schedule.spaced("1 second"),
      times: 180,
    }),
  )
  if (discovered?.kind === "none") {
    if (reads) return yield* new ToolSafety.Denied({ reason: `shell-read-sandbox-unavailable: ${discovered.reason}` })
    if (!profile?.sandbox?.unconfinedFallback) return yield* new ToolSafety.Denied({
      reason: process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable",
    })
    // Owner fallback remains available only without an exact network capability.
    yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: discovered.reason } })
    return ordinary
  }
  if (discovered?.kind === "seatbelt" && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-seatbelt-domain-policy-unenforceable" })
  const fs = yield* FSUtil.Service
  const native = yield* ToolSafety.NativeContext
  if (!native) return yield* new ToolSafety.Denied({ reason: "sandbox-native-placement-missing" })
  const directory = yield* fs.realPath(native.directory).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-native-placement-acquisition" })),
  )
  const endpoints = yield* Effect.forEach(endpointGrants, (entry) => Effect.gen(function* () {
    const placement = yield* fs.realPath(entry.directory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-directory-acquisition" })),
    )
    return placement === directory ? [entry.port] : []
  })).pipe(Effect.map((entries) => [...new Set(entries.flat())]))
  const sockets = yield* Effect.forEach(grants, (entry) => Effect.gen(function* () {
    const placement = yield* fs.realPath(entry.directory).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-unix-socket-directory-acquisition" })),
    )
    if (placement !== directory) return []
    // Bun's realpath rejects Unix socket leaves on macOS (EOPNOTSUPP). Resolve the parent, then lstat the exact leaf.
    const parent = yield* fs.realPath(path.dirname(entry.path)).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-unix-socket-path-acquisition" })),
    )
    const socket = path.join(parent, path.basename(entry.path))
    const info = yield* Effect.tryPromise({
      try: () => lstat(socket),
      catch: () => new ToolSafety.Denied({ reason: "sandbox-unix-socket-stat-acquisition" }),
    })
    if (!info.isSocket()) return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-not-socket" })
    return [socket]
  })).pipe(Effect.map((entries) => [...new Set(entries.flat())]))
  // SRT 0.0.78's allowUnixSockets is macOS-only; Linux only exposes allowAllUnixSockets.
  // Never silently widen an exact-path grant to all AF_UNIX endpoints.
  if (grants.length && process.platform === "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-unix-socket-exact-policy-unsupported" })
  // Exact grants use our outbound-only seatbelt policy, even if SRT is installed on the Mac. Linux endpoints use srt's
  // own strict-allowlist proxy, only from the pinned, hash-verified runtime (an `srt` on PATH is unverified and may
  // lack seccomp, which would leave Unix sockets open); without a ready pinned srt they refuse below and never run unconfined.
  const sandbox = discovered ?? (process.platform !== "darwin" ? yield* pick(true, endpointGrants.length > 0, command) : yield* available(yield* Seatbelt).pipe(
    Effect.map((binary) => binary
      ? { kind: "seatbelt" as const, binary }
      : { kind: "none" as const, reason: "sandbox-seatbelt-unavailable" }),
  ))
  if (sandbox.kind === "none") {
    return yield* new ToolSafety.Denied({ reason: endpointGrants.length
      ? "sandbox-loopback-endpoint-backend-unavailable" : "sandbox-unix-socket-backend-unavailable" })
  }
  const seatbelt = sandbox.kind === "seatbelt"
  if (seatbelt && profile?.sandbox?.allowedDomains?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-seatbelt-domain-policy-unenforceable" })
  if (profile?.sandbox?.scratch && readonlyGoCache(env.GOFLAGS ?? ""))
    return yield* new ToolSafety.Denied({ reason: "sandbox-go-readonly-cache-unsupported" })
  const cwd = yield* fs.realPath(command.options.cwd ?? process.cwd()).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-cwd-acquisition" })),
  )
  // Roots follow ToolSafety.before: a file or a path not created yet resolves through its nearest existing ancestor.
  const requested = (profile?.writeRoots ?? [directory]).map((root) => path.resolve(directory, root))
  const declared = yield* Effect.forEach(requested, (root) => canonical(fs, root).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-write-root-acquisition" })),
  ))
  const entries = [...new Set([
    Global.Path.data, Global.Path.state, path.join(Global.Path.home, ".ssh"), path.join(Global.Path.home, ".aws"),
    path.join(Global.Path.home, ".git-credentials"), path.join(Global.Path.home, ".npmrc"),
    ...(profile?.managedPaths ?? []), ...(profile?.sandbox?.denyPaths ?? []), ...(profile?.neverTouch ?? []),
    // Deny missing names too: credentials may be created after this policy is allocated.
    ...(reads ? yield* ToolSafetySandboxHomes.secrets(env, cwd) : []),
  ])]
  const deny = yield* Effect.forEach(entries, (entry) => policyPath(fs, directory, entry, seatbelt))
  const protectedWrites = yield* Effect.forEach(profile?.protectedWrites ?? [], (entry) => policyPath(fs, directory, entry, seatbelt))
  if (protectedWrites.length && profile?.allowedConfigEdits?.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-config-write-exception-unenforceable" })
  // Project config runs on the host (LSP, formatter and MCP commands, plugins), so a sandboxed command never writes it.
  // This is separate from the profile's list: an owner-approved edit-tool exception does not reach the shell.
  const guarded = [...new Set([...protectedWrites, ...(yield* SandboxProjectConfig.protectedPaths(fs, [directory, cwd, ...declared]))])]
```

## F076

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 515–538.

```typescript
    if (!(command ? ToolSafetyAppContainer.confinable(command) : ToolSafetyAppContainer.shell(Shell.acceptable())))
      return { kind: "none" as const, reason: "sandbox-appcontainer-shell-unsupported" }
    return { kind: "appcontainer" as const, supervisor }
  }
  if (process.platform !== "darwin" && process.platform !== "linux")
    return { kind: "none" as const, reason: `sandbox-platform-unsupported: ${process.platform}` }
  const binary = pinned ? undefined : yield* available()
  if (binary && binary === (yield* Seatbelt)) return { kind: "seatbelt" as const, binary }
  if (binary) return { kind: "srt" as const, command: binary, args: [], env: {}, ripgrep: undefined, directory: undefined }
  const runtime = yield* ToolSafetySandboxRuntime.resolve(start)
  if (runtime.reason !== undefined) return { kind: "none" as const, reason: runtime.reason }
  // Without apply-seccomp srt only logs a debug warning and leaves AF_UNIX connects open.
  if (pinned && !(yield* ToolSafetySandboxRuntime.seccomp(runtime.directory)))
    return { kind: "none" as const, reason: "sandbox-seccomp-unavailable" }
  return {
    kind: "srt" as const,
    command: process.execPath,
    args: [...RUNTIME_FLAGS, ToolSafetySandboxRuntime.cli(runtime.directory)],
    // A compiled Bun binary runs scripts only when told to; Electron runs as Node only when told to.
    env: process.versions.bun ? { BUN_BE_BUN: "1" } : process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {},
    ripgrep: runtime.ripgrep ?? ToolSafetySandboxRuntime.ripgrep(runtime.directory),
    // Confined reads keep the runtime readable: srt starts its seccomp helper from it inside the jail.
    directory: runtime.directory,
  }
```

## F077

`packages/core/src/tool/agent-terminal.ts:d8cbde3d8436081eb9c3815bea334915e6efef0b` — lines 29–124.

```typescript
/** What the bash tool tells the model about stdin, which differs once the command runs in a terminal the owner can see. */
export function stdinNote() {
  if (!Flag.ORCHESTRA_AGENT_TERMINAL || process.platform === "win32")
    return "Stdin is empty and there is no terminal, so nothing can answer a prompt or an editor: pass flags that skip them, such as `-m` for `git commit`."
  return "The command runs in a terminal tab the owner can watch and type into, but you cannot answer it: a prompt or an editor waits for the owner until the timeout, so pass flags that skip them, such as `-m` for `git commit`. Output has no color."
}

export function enabled(command: ChildProcess.StandardCommand) {
  // cmd.exe parses its own command line and needs omni's verbatim form, which a PTY spawn cannot take.
  return Flag.ORCHESTRA_AGENT_TERMINAL && process.platform !== "win32" && OmniSpawner.program(command).verbatim === undefined
}

/**
 * Runs an already confined command in a PTY of its own so the owner sees it in a tab and can answer it. The caller
 * keeps the sandbox scope open until this returns. Resolves undefined on timeout, fails Denied when the output shows a
 * recognized secret, and kills the process on either. A finished command's tab stays, as an exited terminal does.
 */
export const run = Effect.fn("AgentTerminal.run")(function* (
  pty: Pty.Interface,
  input: {
    readonly command: ChildProcess.StandardCommand
    readonly title: string
    readonly timeout: number
    readonly maxChars: number
  },
) {
  const inspector = OutputInspector.make()
  const done = Deferred.makeUnsafe<number>()
  const chunks: string[] = []
  const state = { size: 0, truncated: false, denied: undefined as string | undefined }
  const program = OmniSpawner.program(input.command)

  const info = yield* pty.create(
    {
      command: program.file,
      args: program.args,
      ...(input.command.options.cwd === undefined ? {} : { cwd: input.command.options.cwd }),
      env: { ...OmniSpawner.environment(input.command.options), ...ENVIRONMENT },
      title: `agent: ${input.title}`,
      cols: COLS,
      rows: ROWS,
    },
    {
      exact: true,
      observe: {
        onData: (chunk) => {
          if (state.denied) return
          state.denied = inspector.push(chunk)
          if (state.denied) return Deferred.doneUnsafe(done, Exit.succeed(-1))
          const room = Math.max(input.maxChars - state.size, 0)
          if (chunk.length > room) state.truncated = true
          chunks.push(chunk.slice(0, room))
          state.size += Math.min(chunk.length, room)
        },
        onExit: (exitCode) => Deferred.doneUnsafe(done, Exit.succeed(exitCode)),
      },
    },
  )

  const kill = pty.remove(info.id).pipe(Effect.ignore)
  const exitCode = yield* Deferred.await(done).pipe(
    Effect.timeoutOption(Duration.millis(input.timeout)),
    Effect.onInterrupt(() => kill),
  )
  if (exitCode._tag === "None") {
    yield* kill
    return undefined
  }
  if (state.denied) {
    yield* kill
    return yield* new ToolSafety.Denied({ reason: state.denied })
  }
  const reason = inspector.finish()
  if (reason) return yield* new ToolSafety.Denied({ reason })
  return { exitCode: exitCode.value, output: sanitize(chunks.join("")), truncated: state.truncated } satisfies Result
})

const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
const ESCAPE = /\x1b[ -\/]*[0-~]/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g

/**
 * What the model reads of terminal output: no escape sequences (OSC 52 clipboard writes and titles included), a carriage
 * return overwrites its line the way a terminal paints it, and no control characters but newline and tab.
 */
export function sanitize(text: string) {
  return text
    .replace(OSC, "")
    .replace(CSI, "")
    .replace(ESCAPE, "")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.split("\r").filter(Boolean).at(-1) ?? "")
    .join("\n")
    .replace(CONTROL, "")
```

## F078

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 10–37.

```typescript
/**
 * Secrets at rest (stored credentials, MCP OAuth tokens) are sealed with AES-256-GCM under one 32-byte data key.
 * The key lives in the OS keychain; without one it lives in a 0600 key file in the data directory. Sealed text is
 * `enc:v1:` plus base64 of iv, auth tag and ciphertext, so plaintext written before encryption stays readable.
 *
 * The key is process-wide state because the credential column seals and opens synchronously inside drizzle's row
 * mapping. The layer loads it; without the layer only ORCHESTRA_CREDENTIAL_KEY_FILE can supply it.
 */
export const PREFIX = "enc:v1:"
const KEYCHAIN = { service: "ai.hugr.orchestra", name: "credential-key" }

// The first key seals; every key is tried when opening, so rows sealed under the key-file fallback stay readable
// once the keychain answers again.
let loaded: Buffer[] | undefined

export const isSealed = (text: string) => text.startsWith(PREFIX)

export function seal(plain: string, key = keys()[0]) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

/** Returns the plaintext, or undefined when no loaded key opens the sealed text. */
export function open(text: string) {
  const raw = Buffer.from(text.slice(PREFIX.length), "base64")
  return keys().reduce<string | undefined>((plain, key) => plain ?? attempt(key, raw), undefined)
```

## F079

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 57–86.

```typescript
function load() {
  return Effect.gen(function* () {
    const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
    if (file) {
      yield* Effect.promise(() => refuseNewKey(file))
      return [fileKey(file)]
    }
    const { Global } = yield* Effect.promise(() => import("../global"))
    const fallback = path.join(Global.Path.data, "credential.key")
    const keychain = yield* Effect.tryPromise(() => keychainKey()).pipe(Effect.timeout("10 seconds"), Effect.option)
    if (Option.isSome(keychain)) return [keychain.value, ...(existsSync(fallback) ? [fileKey(fallback)] : [])]
    yield* Effect.logWarning(
      "OS keychain unavailable: stored credentials are encrypted with a key file in the data directory, which is weaker",
      { path: fallback },
    )
    yield* Effect.promise(() => refuseNewKey(fallback))
    return [fileKey(fallback)]
  })
}

/**
 * A missing key file next to sealed data means the key was lost, not that this is a first start. Creating a new key
 * would seal new rows under it while every old row stays unreadable, so stop and say what to restore.
 */
export async function refuseNewKey(file: string) {
  if (existsSync(file)) return
  const dir = path.dirname(file)
  if (!(await hasSealedData(dir))) return
  throw new Error(
    `The credential key file ${file} is missing, but stored credentials in ${dir} are encrypted with it. Restore the key file or the OS keychain entry; a new key is not created because it could not open them.`,
```

## F080

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 107–155.

```typescript
function keys() {
  if (loaded) return loaded
  const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
  if (!file) throw new Error("The credential key is not loaded; build the CredentialCipher layer first")
  loaded = [fileKey(file)]
  return loaded
}

async function keychainKey() {
  if (typeof Bun === "undefined") throw new Error("The OS keychain needs the Bun runtime")
  // Linux keychains are the Secret Service on the D-Bus session bus; without a bus (headless, CI, bare WSL) the
  // native lookup can stall for a long time before it fails, so skip it and use the key file.
  if (process.platform === "linux" && !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error("No Secret Service session bus")
  const stored = await Bun.secrets.get(KEYCHAIN)
  if (stored) return decodeKey(stored)
  await Bun.secrets.set({ ...KEYCHAIN, value: randomBytes(32).toString("base64") })
  // Read back so two first starts racing on the same keychain entry converge on the value that won.
  const created = await Bun.secrets.get(KEYCHAIN)
  if (!created) throw new Error("The OS keychain did not keep the credential key")
  return decodeKey(created)
}

function fileKey(file: string) {
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true })
    // "wx" never replaces a key another process created first.
    try {
      writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" })
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
    }
  }
  return decodeKey(readFileSync(file, "utf8"))
}

function decodeKey(text: string) {
  const key = Buffer.from(text.trim(), "base64")
  if (key.length !== 32) throw new Error("The credential key is not 32 bytes")
  return key
}

function attempt(key: Buffer, raw: Buffer) {
  // A wrong key, tampered data or a truncated envelope fails here, mostly at the GCM tag check.
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return undefined
```

## F081

`packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2` — lines 54–106.

```typescript
export interface Interface {
  /**
   * Reads fall back to the release database when this build uses another one:
   * per integration, credentials in the active database win; otherwise the
   * release database's newest credential for that integration is visible.
   */
  /** Returns every stored credential. */
  readonly all: () => Effect.Effect<Info[]>
  /** Returns stored credentials belonging to one integration. */
  readonly list: (integrationID: Integration.ID) => Effect.Effect<Info[]>
  /** Returns one stored credential by ID. */
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  /** Returns the release database a visible credential is inherited from, if any. */
  readonly inheritedFrom: (id: ID) => Effect.Effect<string | undefined>
  /** Stores a credential for an integration and returns the new record. */
  readonly create: (input: {
    readonly integrationID: Integration.ID
    readonly value: Value
    readonly label?: string
  }) => Effect.Effect<Info>
  /** Updates the label or secret value of a stored credential. Inherited credentials are read-only. */
  readonly update: (id: ID, updates: Partial<Pick<Info, "label" | "value">>) => Effect.Effect<void, InheritedError>
  /** Removes a stored credential. Inherited credentials cannot be removed from this build. */
  readonly remove: (id: ID) => Effect.Effect<void, InheritedError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Credential") {}

/**
 * Returns the release database to inherit credentials from, or undefined when
 * this build must stay isolated.
 */
export function inheritedPath(active = Database.path(), release = Database.releasePath()) {
  const flag = Flag.ORCHESTRA_INHERIT_CREDENTIALS
  if (flag === false) return
  if (active === ":memory:" && flag !== true) return
  if (active !== ":memory:" && resolve(active) === resolve(release)) return
  return release
}

export const layerFrom = (release: string | undefined) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      // Loads the key before any credential row is sealed or opened.
      yield* CredentialCipher.Service
      yield* sealLegacy(db).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("could not encrypt plaintext credentials; they stay readable", {
            reason: String(Cause.squash(cause)),
          }),
        ),
```

## F082

`packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2` — lines 108–226.

```typescript
      const decode = Schema.decodeUnknownOption(Value)
      // A row that does not decode (in practice: sealed under a key this process cannot load) is reported and
      // skipped, never deleted or overwritten.
      const stored = Effect.fnUntraced(function* (row: typeof CredentialTable.$inferSelect) {
        if (!row.integration_id) return
        const value = decode(row.value)
        if (Option.isNone(value)) {
          yield* Effect.logError("stored credential cannot be decrypted; it is left untouched", { credentialID: row.id })
          return
        }
        return new Info({ id: row.id, integrationID: row.integration_id, label: row.label, value: value.value })
      })
      const own = Effect.fnUntraced(function* (integrationID?: Integration.ID) {
        const rows = yield* db
          .select()
          .from(CredentialTable)
          .where(integrationID ? eq(CredentialTable.integration_id, integrationID) : undefined)
          .orderBy(asc(CredentialTable.time_created))
          .all()
          .pipe(Effect.orDie)
        return (yield* Effect.forEach(rows, stored)).filter((credential): credential is Info => credential !== undefined)
      })
      // The release database's newest credential for every integration the
      // active database has no credential for.
      const inherited = Effect.fnUntraced(function* (saved: readonly Info[]) {
        if (!release) return []
        const covered = new Set(saved.map((credential) => credential.integrationID))
        const rows = (yield* readRelease(release)).filter((credential) => !covered.has(credential.integrationID))
        return Array.from(Map.groupBy(rows, (credential) => credential.integrationID).values()).flatMap((group) =>
          group.slice(-1),
        )
      })
      const find = Effect.fnUntraced(function* (id: ID) {
        const row = yield* db.select().from(CredentialTable).where(eq(CredentialTable.id, id)).get().pipe(Effect.orDie)
        if (row) return { credential: yield* stored(row), inherited: false }
        return { credential: (yield* inherited(yield* own())).find((item) => item.id === id), inherited: true }
      })

      return Service.of({
        all: Effect.fn("Credential.all")(function* () {
          const saved = yield* own()
          return [...saved, ...(yield* inherited(saved))]
        }),
        list: Effect.fn("Credential.list")(function* (integrationID) {
          const saved = yield* own(integrationID)
          if (saved.length > 0) return saved
          return (yield* inherited(saved)).filter((credential) => credential.integrationID === integrationID)
        }),
        get: Effect.fn("Credential.get")(function* (id) {
          return (yield* find(id)).credential
        }),
        inheritedFrom: Effect.fn("Credential.inheritedFrom")(function* (id) {
          const match = yield* find(id)
          return match.inherited && match.credential ? release : undefined
        }),
        create: Effect.fn("Credential.create")(function* (input) {
          const credential = new Info({
            id: ID.create(),
            integrationID: input.integrationID,
            label: input.label ?? "default",
            value: input.value,
          })
          yield* db
            .insert(CredentialTable)
            .values({
              id: credential.id,
              integration_id: credential.integrationID,
              label: credential.label,
              value: credential.value,
            })
            .run()
            .pipe(Effect.orDie)
          return credential
        }),
        update: Effect.fn("Credential.update")(function* (id, updates) {
          if (!updates.label && !updates.value) return
          const match = yield* find(id)
          if (match.inherited && match.credential && release) {
            return yield* new InheritedError({ credentialID: id, source: release, reason: "readonly" })
          }
          yield* db
            .update(CredentialTable)
            .set({ label: updates.label, value: updates.value })
            .where(eq(CredentialTable.id, id))
            .run()
            .pipe(Effect.orDie)
        }),
        remove: Effect.fn("Credential.remove")(function* (id) {
          const match = yield* find(id)
          if (match.inherited && match.credential && release) {
            return yield* new InheritedError({ credentialID: id, source: release, reason: "readonly" })
          }
          yield* db.delete(CredentialTable).where(eq(CredentialTable.id, id)).run().pipe(Effect.orDie)
        }),
      })
    }),
  ).pipe(Layer.provide(CredentialCipher.layer))

export const node = makeGlobalNode({ service: Service, layer: layerFrom(inheritedPath()), deps: [Database.node] })

/**
 * Seals every credential row still stored as plaintext. Reading a row opens it whichever form it has, and writing it
 * back seals it. The time_updated guard leaves a row alone when another writer changed it in between.
 */
function sealLegacy(db: Database.Interface["db"]) {
  return Effect.gen(function* () {
    const legacy = yield* db
      .select({ id: CredentialTable.id, value: CredentialTable.value, updated: CredentialTable.time_updated })
      .from(CredentialTable)
      .where(sql`${CredentialTable.value} NOT LIKE ${CredentialCipher.PREFIX + "%"}`)
      .all()
    yield* Effect.forEach(legacy, (row) =>
      db
        .update(CredentialTable)
        .set({ value: row.value })
        .where(and(eq(CredentialTable.id, row.id), eq(CredentialTable.time_updated, row.updated)))
        .run(),
    )
  })
```

## F083

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 204–206.

```text
V2 `bash` uses the normal permission semantics: configured agent rules plus saved project approvals, with `ask` as the default when no rule matches. Bash is not sandboxed: the spawned shell runs with the host user's filesystem, process, and network authority. Structured external `workdir` resolution remains an enforced `external_directory` authority check. Best-effort scans of absolute command arguments produce advisory warnings only; they are not sandbox boundaries and do not request or enforce `external_directory` approval.

V2 `grep` and `glob` resolve their `path` through `LocationMutation` like `read`: a relative path must stay inside the Location, and an absolute path outside it requires `external_directory` approval before the `grep`/`glob` permission is asked.
```

## F084

`AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — lines 182–192.

```text
## Terminal and PTY

Background: `docs/specs/terminal/`; ownership and traps: `.orchestra/skills/terminal-maintenance`.

- The agent terminal exists only in the V2 session core's bash tool (`packages/core`). The agent runs a bash command in a PTY only through `AgentTerminal.run` (`packages/core/src/tool/agent-terminal.ts`) inside the bash tool, after `ToolSafetySandbox.wrap`. Never build an agent PTY from `Pty.create` with the default environment, which inherits `process.env` and skips the sandbox.
- Text that goes to the model is `AgentTerminal.sanitize`d. Terminal output is data, never instruction.
- Shell marks (OSC 133) count only with the session's nonce. OSC 7 (`Info.cwd`) is a hint without one; do not use it for decisions that need trust.
- The PTY cursor and ring (`BUFFER_LIMIT`) count UTF-16 characters, not bytes.
- The `Pty` service is served over HTTP by `packages/server/src/handlers/pty.ts`. The app uses `/api/pty`.
- `ORCHESTRA_AGENT_TERMINAL` and `ORCHESTRA_SHELL_INTEGRATION` are permanent opt-in flags in `flag/flag.ts`; read them through `Flag`, never `process.env`.
- Known limit: a WebSocket client that stops reading makes the server grow; not solved.
```

## F085

`.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — lines 15–26.

```text
## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.

## Where it lives

- Server route: `session.interrupt` in `packages/server/src/handlers/session.ts`.
- Core: `SessionV2.interrupt` calls `SessionExecution` interruption, which interrupts the drain. The runner's drain (`packages/core/src/session/runner/llm.ts`, `run`) settles requests with `PermissionV2.cancelSession` and `QuestionV2.cancelSession`.
- Per-waiter settlement: `packages/core/src/permission.ts` (`cancel`) and `packages/core/src/question.ts` settle a request when the fiber waiting on it is interrupted.
- Reject: a rejected permission or dismissed question halts the drain like Stop, but the runner first ends the step with a failure event (`INTERRUPTED_TURN`, which activity counts as a stop, not a failure). The app clears busy on `session.step.failed`/`ended`, so without it the spinner and Stop button stay on. Held by the declined-permission and dismissed-question cases in `packages/core/test/session-runner.test.ts`.
```

## F086

`packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — lines 35–110.

```typescript
export class Info extends Schema.Class<Info>("Config.Info")({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  shell: Schema.String.pipe(Schema.optional).annotate({
    description: "Default shell to use for terminal and shell tool execution",
  }),
  model: Schema.String.pipe(Schema.optional).annotate({
    description: "Default model to use when no session or agent model is selected",
  }),
  default_agent: Schema.String.pipe(Schema.optional).annotate({
    description: "Default primary agent to use when no session agent is selected",
  }),
  permissions: Permission.Ruleset.pipe(Schema.optional).annotate({
    description: "Ordered tool permission rules applied to agent tool use",
  }),
  agents: Schema.Record(Schema.String, ConfigAgent.Info).pipe(Schema.optional).annotate({
    description: "Named built-in agent overrides and custom agent definitions",
  }),
  snapshots: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable snapshots used for undo and revert behavior",
  }),
  watcher: ConfigWatcher.Info.pipe(Schema.optional).annotate({
    description: "Filesystem watcher configuration",
  }),
  formatter: ConfigFormatter.Info.pipe(Schema.optional).annotate({
    description: "Enable built-in formatters or configure formatter overrides",
  }),
  lsp: ConfigLSP.Info.pipe(Schema.optional).annotate({
    description: "Enable built-in language servers or configure server overrides",
  }),
  attachments: ConfigAttachments.Info.pipe(Schema.optional).annotate({
    description: "Attachment processing configuration",
  }),
  tool_output: ConfigToolOutput.Info.pipe(Schema.optional).annotate({
    description: "Tool output truncation thresholds",
  }),
  mcp: ConfigMCP.Info.pipe(Schema.optional).annotate({
    description: "MCP server configuration",
  }),
  trusted_projects: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description:
      "Absolute paths of projects (or folders holding projects) whose own config may start local MCP servers. Honored only in the user's global config.",
  }),
  compaction: ConfigCompaction.Info.pipe(Schema.optional).annotate({
    description: "Conversation compaction behavior",
  }),
  continuity: ConfigContinuity.Info.pipe(Schema.optional).annotate({
    description: "Context continuity: tool-output masking and background summaries",
  }),
  skills: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description: "Additional paths or URLs to discover skills from",
  }),
  commands: Schema.Record(Schema.String, ConfigCommand.Info).pipe(Schema.optional).annotate({
    description: "Named slash command definitions",
  }),
  instructions: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description:
      "Additional local instruction files, relative to the config file that lists them. URLs are not supported. A project config may only name files inside the project.",
  }),
  references: ConfigReference.Info.pipe(Schema.optional).annotate({
    description: "Named local directories or Git repositories available as external context",
  }),
  plugins: ConfigPlugin.Plugins.pipe(Schema.optional).annotate({
    description: "Ordered external plugin packages to load",
  }),
  experimental: ConfigExperimental.Experimental.pipe(Schema.optional),
  relay: ConfigRelay.Info.pipe(Schema.optional).annotate({ description: "Relay workflow and hook engine settings" }),
  research: ConfigResearch.Info.pipe(Schema.optional).annotate({
    description: "Resource caps of the discovery seat's research toolkit. A configured value can only lower its built-in cap.",
  }),
  maestro: ConfigMaestro.Info.pipe(Schema.optional).annotate({
    description: "Project-bound static Atlas/Own context for governed Maestro work",
  }),
  providers: Schema.Record(Schema.String, ConfigProvider.Info).pipe(Schema.optional),
}) {}
```

## F087

`packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — lines 147–268.

```typescript
export interface Interface {
  /** Returns location config documents and supplemental directories from lowest to highest priority. */
  readonly entries: () => Effect.Effect<Entry[]>
  /** Returns packaged roots already admitted during required location initialization. */
  readonly packagedSkills?: () => Effect.Effect<readonly string[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Config") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    // Required admission must fail before recoverable plugin boot can swallow packaging defects.
    const packagedSkills = yield* Effect.promise(() =>
      PackagedSkills.materialize({ cache: global.cache, version: InstallationVersion }),
    )
    const location = yield* Location.Service
    const policy = yield* Policy.Service
    const names = ["orchestra.json", "orchestra.jsonc"]
    const decodeOptions = { errors: "all", onExcessProperty: "ignore", propertyOrder: "original" } as const
    const decodeInfo = Schema.decodeUnknownEffect(Info, decodeOptions)
    const decodeOldInfo = Schema.decodeUnknownEffect(ConfigUpgradeSource.Info, decodeOptions)

    const loadFile = Effect.fnUntraced(function* (filepath: string) {
      const text = yield* fs.readFileStringSafe(filepath)
      if (!text) return

      const errors: ParseError[] = []
      const input: unknown = parse(text, errors, { allowTrailingComma: true })
      if (errors.length)
        return yield* new InvalidError({
          path: filepath,
          message: `${filepath}: ${errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ")}`,
        })

      const info = yield* (
        ConfigUpgrade.needsUpgrade(input)
          ? decodeOldInfo(input).pipe(
              Effect.map(ConfigUpgrade.migrate),
              // Settings write current `permissions` into a file that may still hold old keys; the old-format decode drops them.
              Effect.map((info) => {
                const rules = [...(info.permissions ?? []), ...settings(text).permissions]
                return { ...info, permissions: rules.length ? rules : undefined }
              }),
              Effect.flatMap(decodeInfo),
            )
          : decodeInfo(input)
      ).pipe(Effect.mapError((error) => new InvalidError({ path: filepath, message: `${filepath}: ${error.message}` })))
      const remote = info.instructions?.find((entry) => /^[a-z][a-z0-9+.-]*:\/\//i.test(entry))
      if (remote !== undefined)
        return yield* new InvalidError({
          path: filepath,
          message: `${filepath}: instructions must be local file paths; remote URLs are not supported (${remote})`,
        })
      return new Document({ type: "document", path: filepath, info })
    })

    const loadDirectory = Effect.fnUntraced(function* (directory: AbsolutePath) {
      return [
        ...(yield* Effect.forEach(names, (file) => loadFile(path.join(directory, file))).pipe(
          Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
        )),
        new Directory({ type: "directory", path: directory }),
      ]
    })

    const globalDirectory = AbsolutePath.make(global.config)
    const locationIsGlobal = path.resolve(location.directory) === path.resolve(global.config)
    // Read configuration once when this location opens. Later calls reuse these
    // values until the location is reopened.
    const discovered = locationIsGlobal
      ? []
      : yield* fs
          .up({
            targets: [".orchestra", ...names.toReversed()],
            start: location.directory,
            stop: location.project.directory,
          })
          .pipe(Effect.orDie)
    const directories = [
      globalDirectory,
      ...discovered
        .filter((item) => path.basename(item) === ".orchestra")
        .toReversed()
        .map((directory) => AbsolutePath.make(directory)),
    ]
    // A config closer to the opened directory should win over one higher up.
    // Search starts nearby, so reverse the results before applying them.
    const directPaths = discovered.filter((item) => path.basename(item) !== ".orchestra").toReversed()
    const direct = yield* Effect.forEach(directPaths, loadFile).pipe(
      Effect.orDie,
      Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
    )
    const supplementary = yield* Effect.forEach(directories, loadDirectory).pipe(Effect.orDie)
    // Apply general settings first and more specific settings last:
    // global config, project files, then `.orchestra` files.
    const configs = [...(supplementary[0] ?? []), ...direct, ...supplementary.slice(1).flat()]
    // Rules use the opposite order so a user-global rule can override a
    // repository rule. Statement order inside each file stays unchanged.
    const loadPolicies = (configs: ReadonlyArray<Document | Directory>) =>
      policy.load(
        configs
          .filter((config): config is Document => config.type === "document")
          .toReversed()
          .flatMap((config) => config.info.experimental?.policies ?? []),
      )
    yield* loadPolicies(configs)

    return Service.of({
      packagedSkills: () => Effect.succeed(packagedSkills),
      entries: Effect.fn("Config.entries")(function* () {
        // Global documents are read again so a settings write (`updateGlobal`) reaches the next agent or catalog
        // reload without reopening the location; project documents keep the snapshot taken at open.
        // Policies reload with them, so a disabled provider leaves the catalog on its next reload.
        const globals = yield* loadDirectory(globalDirectory).pipe(Effect.orDie)
        const configs = [...globals, ...direct, ...supplementary.slice(1).flat()]
        yield* loadPolicies(configs)
        return configs
      }),
    })
```

## F088

`packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78` — lines 8–81.

```typescript
// A repository's own config is not the user's: what it declares to run (MCP commands, plugins, formatter and LSP
// commands) is code the repository chose. Only documents and directories under the user's global config can approve a
// project, so a project file can never trust itself.

/** Whether a config entry is the user's own: under the global config folder, or a document with no file. */
export function isUser(globalConfig: string, entry: Config.Entry) {
  return entry.path === undefined || within(globalConfig, entry.path)
}

/** Whether `directory` is, or is inside, a path listed in `trusted_projects` of the user's own config. */
export function isTrusted(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return entries
    .filter((entry): entry is Config.Document => entry.type === "document")
    .filter((entry) => isUser(globalConfig, entry))
    .flatMap((entry) => entry.info.trusted_projects ?? [])
    .some((root) => within(root, directory))
}

/** The entries whose declared commands may run: all of them for a trusted project, otherwise only the user's own. */
export function runnable(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return isTrusted(entries, globalConfig, directory) ? entries : entries.filter((entry) => isUser(globalConfig, entry))
}

export class DirectoryError extends Schema.TaggedErrorClass<DirectoryError>()("ConfigTrust.DirectoryError", {
  message: Schema.String,
}) {}

/** The approved project folders in the user's global config, as written. A project's own `trusted_projects` never counts. */
export const list = Effect.fn("ConfigTrust.list")(function* () {
  return (yield* Config.readGlobal()).trustedProjects
})

/** Approves a project folder in the user's global config. A folder already trusted, directly or through a parent, changes nothing. */
export const approve = Effect.fn("ConfigTrust.approve")(function* (directory: string) {
  const root = yield* canonical(directory)
  const trusted = yield* list()
  if (trusted.some((item) => within(item, root))) return
  yield* Config.updateGlobal({ trustedProjects: [...trusted, root] })
})

/** Removes a folder's own entry from the user's global config. A folder trusted only through a parent stays trusted. */
export const revoke = Effect.fn("ConfigTrust.revoke")(function* (directory: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.resolve(directory)
  const trusted = yield* list()
  const resolved = yield* Effect.forEach(trusted, (item) => fs.resolve(item))
  const kept = trusted.filter((_, index) => resolved[index] !== root)
  if (kept.length === trusted.length) return
  yield* Config.updateGlobal({ trustedProjects: kept })
})

export function approveHint(directory: string) {
  return `Add "${directory}" to trusted_projects in your user config to approve it.`
}

// The real path of an existing absolute folder, so a symlink and its target store as one entry.
const canonical = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  if (!path.isAbsolute(directory))
    return yield* new DirectoryError({ message: `Project folder must be an absolute path: ${directory}` })
  if (!(yield* fs.isDir(directory)))
    return yield* new DirectoryError({ message: `Project folder does not exist: ${directory}` })
  const real = yield* fs.realPath(directory).pipe(Effect.orDie)
  if (path.parse(real).root === real)
    return yield* new DirectoryError({
      message: "The filesystem root cannot be trusted: it would approve every project on this machine.",
    })
  return real
})

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
```

## F089

`packages/core/src/location-services.ts:c754426dde31acad2dbbfd96459b32624cfdd2e4` — lines 58–171.

```typescript
export const locationServices = LayerNode.group([
  Location.node,
  Policy.node,
  Config.node,
  AgentV2.node,
  CommandV2.node,
  Reference.node,
  Integration.node,
  Catalog.node,
  AISDK.node,
  PluginV2.node,
  PluginInternal.node,
  ProjectCopy.node,
  ProjectCopy.refreshNode,
  PullRequest.node,
  Guardrail.node,
  Actions.node,
  FileSystemSearch.node,
  FileSystem.node,
  Watcher.node,
  Pty.node,
  SkillV2.node,
  SystemContextRegistry.node,
  SystemContextBuiltIns.node,
  BehaviorV2.node,
  LocationMutation.node,
  FileMutation.node,
  PermissionV2.node,
  ToolOutputStore.node,
  ToolRegistry.node,
  ToolRegistry.toolsNode,
  Image.node,
  SkillGuidance.node,
  ReferenceGuidance.node,
  SessionTodo.node,
  SessionMeeting.node,
  MeetingBriefing.node,
  MeetingContext.node,
  MeetingHandoff.node,
  QuestionV2.node,
  ReadToolFileSystem.node,
  BuiltInTools.node,
  Mcp.node,
  LSP.node,
  Format.node,
  SessionRunnerModel.node,
  Snapshot.node,
  Relay.node,
  RelayHookRecovery.node,
  TaskGovernance.node,
  SessionCompaction.node,
  SessionRunnerLLM.node,
  MeetingConsolidation.node,
])

export type LocationServices = LayerNode.Output<typeof locationServices>
export type LocationError = LayerNode.Error<typeof locationServices>

export function buildLocationServiceMap(
  replacements: LayerNode.Replacements = [],
  extra: ReadonlyArray<Node.LocationNode<unknown, LocationError>> = [],
): Layer.Layer<LocationServiceMap.Service> {
  return Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      // A hoisted global (for example Arsenal observations) may depend on the Location map itself. Its node is
      // unbound inside the hoisted graph, so it is bound to this map once the map exists.
      const self = Deferred.makeUnsafe<Context.Service.Shape<typeof LocationServiceMap.Service>>()
      const locations = yield* LayerMap.make(
        (ref: Location.Ref) => {
          const allReplacements: LayerNode.Replacements = [
            [ToolRegistry.node, ToolRegistry.nativeNode],
            [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
            ...replacements,
            [Location.node, Location.boundNode(ref)],
          ]
          // Apply replacements during hoist, not afterward: replacements can
          // introduce new tagged dependencies (Location.boundNode depends on
          // Project), and the hoist walk is the only pass that can still slice
          // those back out.
          const location = LayerNode.hoist(LayerNode.group([locationServices, ...extra]), Node.tags.values.global, allReplacements)
          // Contributed nodes (Host.Contribution.locationNodes) add services; the map still exposes LocationServices.
          const services: Layer.Layer<LocationServices, LocationError> = LayerNode.compile(location.node)

          return services.pipe(
            Layer.fresh,
            Layer.tap((context) =>
              Effect.gen(function* () {
                const recovery = Context.get(context, RelayHookRecovery.Service)
                yield* Effect.logInfo("booting location services", {
                  directory: ref.directory,
                  workspaceID: ref.workspaceID,
                })
                // Start only after the entire graph succeeds; the Location scope owns this one pass.
                yield* recovery.recover().pipe(Effect.forkScoped)
              }),
            ),
            Layer.provide(
              LayerNode.compile(location.hoisted, [
                [LocationServiceMap.node, Layer.effect(LocationServiceMap.Service, Deferred.await(self))],
              ]),
            ),
          )
        },
        { idleTimeToLive: "60 minutes" },
      )
      yield* Deferred.succeed(self, locations)
      return locations
    }),
  )
}

// This is temporary for backwards compatibility
export const locationServiceMapLayer = buildLocationServiceMap()
```

## F090

`packages/core/src/location-service-map.ts:2f9f70c7edf21ab9e8d57eb6966aacab13c47c33` — lines 18–43.

```typescript
/** Lazy acquisitions must see the completed application's exports, not a constructor's partial context. */
export function withGlobalContext<A, E, R>(
  layer: Layer.Layer<A, E, R>,
  globalContext: Effect.Effect<Context.Context<never>>,
) {
  return layer.pipe(
    Layer.flatMap((context) => {
      const locations = Context.getUnsafe(context, Service)
      const contextEffect = (ref: Location.Ref) =>
        // Wait before entering the cache: early constructor forks must not retain a partial acquisition.
        globalContext.pipe(
          Effect.flatMap((globals) =>
            locations
              .contextEffect(ref)
              .pipe(Effect.updateContext((current: Context.Context<Scope.Scope>) => Context.merge(current, globals))),
          ),
        )
      return Layer.succeedContext(
        Context.add(context, Service, {
          ...locations,
          get: (ref) => Layer.effectContext(contextEffect(ref)),
          contextEffect,
        }),
      )
    }),
  )
```

## F091

`docs/specs/v2/config.md:81353980473012b1b3d311f0a638e3d65ba8cbcd` — lines 1–18.

```text
# V2 Config Review

This document breaks the legacy configuration schema into small review groups. Work through one group at a time and decide whether each field should be ported as-is, removed, or redesigned for v2.

## Status Labels

- `pending`: not discussed yet
- `keep`: port with substantially the existing meaning
- `remove`: do not carry forward
- `redesign`: keep the capability with a different shape, scope, or owning module

## Schema Scope

Use one v2 config schema for now. Some fields are intended for global/user configuration, but there is not yet enough benefit to enforce that with separate global and location schemas. Revisit this if more scope-sensitive fields survive the review.

V2 core discovers config documents named `orchestra.json` or `orchestra.jsonc` in the global config directory, ancestor project directories, and `.orchestra` config directories. The legacy `config.json` filename is not supported in V2.

## Group 1: File Metadata
```

## F092

`docs/specs/v2/config.md:81353980473012b1b3d311f0a638e3d65ba8cbcd` — lines 382–390.

```text
## Review Order

Work through the groups in this order unless a dependency between decisions becomes clear:

1. File Metadata
2. Process And Server Settings
3. Providers And Model Selection
4. Commands And Project Resources
5. Plugins
```

## F093

`packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — lines 26–64.

```typescript
/**
 * True for the shared project of a directory outside any repository, whose directory `resolve` sets to the
 * filesystem root: `/`, or a drive root such as `C:\` on Windows. Its directories are the Location's own, not the root.
 */
export const isRoot = (directory: string, paths: path.PlatformPath = path) => paths.parse(directory).root === directory

export class Info extends Schema.Class<Info>("Project.Info")({
  id: ID,
}) {}

export const DirectoriesInput = ProjectDirectories.ListInput
export type DirectoriesInput = typeof DirectoriesInput.Type

export const Directories = ProjectDirectories.ListOutput
export type Directories = typeof Directories.Type

export interface Resolved {
  readonly previous?: ID
  readonly id: ID
  readonly directory: AbsolutePath
  readonly vcs?: Vcs
}

export interface Interface {
  /** Every project this database knows, oldest first. */
  readonly list: () => Effect.Effect<ProjectInfo.Info[]>
  readonly directories: (input: DirectoriesInput) => Effect.Effect<Directories>
  readonly resolve: (input: AbsolutePath) => Effect.Effect<Resolved>
  /**
   * Temporary bridge method for writing the resolved project ID to the repo-local cache.
   *
   * This exists while the legacy project service and this core project
   * service work together: core resolves the ID, while the old service still owns
   * database migration and persistence. The old service should call this after it
   * finishes migrating from `resolve().previous` to `resolve().id`; once project
   * persistence moves into core, this separate bridge method can go away.
   */
  readonly commit: (input: { store: AbsolutePath; id: ID }) => Effect.Effect<void>
}
```

## F094

`packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — lines 85–148.

```typescript
    const cached = Effect.fnUntraced(function* (dir: string) {
      return yield* fs.readFileString(path.join(dir, "orchestra")).pipe(
        Effect.map((value) => value.trim()),
        Effect.map((value) => (value ? ID.make(value) : undefined)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
    })

    const remote = Effect.fnUntraced(function* (repo: Git.Repository) {
      const origin = yield* git.remote.get(repo)
      if (!origin) return undefined
      const normalized = url(origin)
      if (!normalized) return undefined
      return ID.make(Hash.fast(`git-remote:${normalized}`))
    })

    function url(input: string) {
      const value = input.trim()
      if (!value) return undefined

      try {
        const parsed = new URL(value)
        if (parsed.protocol === "file:") return undefined
        return parts(parsed.hostname, parsed.pathname)
      } catch {
        const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
        if (scp) return parts(scp[2], scp[3])
        return undefined
      }
    }

    function parts(host: string, name: string) {
      const pathname = name
        .replace(/^\/+/, "")
        .replace(/\.git\/?$/, "")
        .replace(/\/+$/, "")
      if (!host || !pathname) return undefined
      return `${host.toLowerCase()}/${pathname}`
    }

    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      if (!repo) return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }

      const previous = yield* cached(repo.commonDirectory)
      const id = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      return {
        previous,
        id: id ?? ID.global,
        directory: repo.worktree,
        vcs: { type: "git" as const, store: repo.commonDirectory },
      }
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "orchestra"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ list, directories, resolve, commit })
```

## F095

`packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — lines 170–191.

```typescript
/**
 * Records a resolved project for the project list with its version control, as opening a directory did on the earlier runtime, and
 * announces a new project or a newly found repository with `project.updated`.
 */
export const record = Effect.fn("Project.record")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  project: Resolved,
) {
  const existing = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  const vcs = project.vcs?.type
  if (existing && (!vcs || existing.vcs === vcs)) return
  if (existing) yield* db.update(ProjectTable).set({ vcs }).where(eq(ProjectTable.id, project.id)).run().pipe(Effect.orDie)
  if (!existing)
    yield* db
      .insert(ProjectTable)
      .values({ id: project.id, worktree: project.directory, vcs, sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  const row = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  if (row) yield* events.publish(ProjectInfo.Event.Updated, toInfo(row))
```

## F096

`packages/core/src/project/directories.ts:7863f4d2640a9b4bd85febab338610446bf839ef` — lines 47–158.

```typescript
export interface Interface {
  readonly list: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<Directory>>
  readonly get: (input: {
    projectID: ProjectSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<Directory | undefined>
  readonly contains: (input: { projectID: ProjectSchema.ID; directory: AbsolutePath }) => Effect.Effect<boolean>
  readonly create: (input: CreateInput, tx?: Transaction) => Effect.Effect<boolean>
  readonly remove: (input: RemoveInput, tx?: Transaction) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ProjectDirectories") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const create = Effect.fn("ProjectDirectories.create")(function* (input: CreateInput, tx?: Transaction) {
      const insert = (tx ?? db)
        .insert(ProjectDirectoryTable)
        .values({ project_id: input.projectID, directory: input.directory, strategy: input.strategy })
      const query =
        input.behavior === "replace"
          ? insert.onConflictDoUpdate({
              target: [ProjectDirectoryTable.project_id, ProjectDirectoryTable.directory],
              set: { strategy: input.strategy ?? null },
              setWhere: input.strategy
                ? or(isNull(ProjectDirectoryTable.strategy), ne(ProjectDirectoryTable.strategy, input.strategy))
                : isNotNull(ProjectDirectoryTable.strategy),
            })
          : insert.onConflictDoNothing()
      return (
        (yield* query.returning({ directory: ProjectDirectoryTable.directory }).get().pipe(Effect.orDie)) !== undefined
      )
    })

    const remove = Effect.fn("ProjectDirectories.remove")(function* (input: RemoveInput, tx?: Transaction) {
      return (
        (yield* (tx ?? db)
          .delete(ProjectDirectoryTable)
          .where(
            and(
              eq(ProjectDirectoryTable.project_id, input.projectID),
              eq(ProjectDirectoryTable.directory, input.directory),
            ),
          )
          .returning({ directory: ProjectDirectoryTable.directory })
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    const list = Effect.fn("ProjectDirectories.list")(function* (projectID: ProjectSchema.ID) {
      const rows = yield* db
        .select({ directory: ProjectDirectoryTable.directory, strategy: ProjectDirectoryTable.strategy })
        .from(ProjectDirectoryTable)
        .where(eq(ProjectDirectoryTable.project_id, projectID))
        .orderBy(desc(ProjectDirectoryTable.time_created), asc(ProjectDirectoryTable.directory))
        .all()
        .pipe(Effect.orDie)
      return rows.map((row) => ({ directory: row.directory, strategy: row.strategy ?? undefined }))
    })

    const contains = Effect.fn("ProjectDirectories.contains")(function* (input: {
      projectID: ProjectSchema.ID
      directory: AbsolutePath
    }) {
      return (
        (yield* db
          .select({ directory: ProjectDirectoryTable.directory })
          .from(ProjectDirectoryTable)
          .where(
            and(
              eq(ProjectDirectoryTable.project_id, input.projectID),
              eq(ProjectDirectoryTable.directory, input.directory),
            ),
          )
          .get()
          .pipe(Effect.orDie)) !== undefined
      )
    })

    const get = Effect.fn("ProjectDirectories.get")(function* (input: {
      projectID: ProjectSchema.ID
      directory: AbsolutePath
    }) {
      const row = yield* db
        .select({ directory: ProjectDirectoryTable.directory, strategy: ProjectDirectoryTable.strategy })
        .from(ProjectDirectoryTable)
        .where(
          and(
            eq(ProjectDirectoryTable.project_id, input.projectID),
            eq(ProjectDirectoryTable.directory, input.directory),
          ),
        )
        .get()
        .pipe(Effect.orDie)
      return row ? { directory: row.directory, strategy: row.strategy ?? undefined } : undefined
    })

    return Service.of({
      list,
      get,
      contains,
      create,
      remove,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [Database.node] })
```

## F097

`packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — lines 12–59.

```typescript
/**
 * Mutation paths do not accept project references. Relative paths must stay
 * inside the active Location. Absolute paths outside it require separate
 * `external_directory` approval.
 */
export const ResolveInput = Schema.Struct({
  path: Schema.String,
  /** Selects the external approval boundary; it does not validate the target type. */
  kind: Kind.pipe(Schema.optional),
})
export type ResolveInput = typeof ResolveInput.Type

export class PathError extends Schema.TaggedErrorClass<PathError>()("LocationMutation.PathError", {
  path: Schema.String,
  reason: Schema.Literals(["relative_escape", "location_escape", "non_directory_ancestor"]),
}) {}

export interface ExternalDirectoryAuthorization {
  readonly action: "external_directory"
  /** Canonical existing directory used as the external approval boundary. */
  readonly directory: string
  /** `external_directory` permission resource. */
  readonly resource: string
  readonly save: string
}

export const externalDirectoryPermission = (input: ExternalDirectoryAuthorization) => ({
  action: input.action,
  resources: [input.resource],
  save: [input.save],
})

export interface Target {
  /** Canonical existing path, or missing path below a canonical directory. */
  readonly canonical: string
  /** Permission resource: Location-relative for internal paths, canonical for external paths. */
  readonly resource: string
  readonly externalDirectory?: ExternalDirectoryAuthorization
}

export interface Interface {
  /**
   * Resolve a path and derive its permission resources. Relative paths must
   * stay inside the Location. Absolute paths outside it require separate
   * `external_directory` approval. This does not approve the mutation.
   */
  readonly resolve: (input: ResolveInput) => Effect.Effect<Target, PathError | FSUtil.Error>
}
```

## F098

`packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — lines 90–175.

```typescript
    // A dangling symlink is not missing: a write through it creates the file where it points.
    const followDangling = Effect.fnUntraced(function* (start: string) {
      let current = start
      for (let hops = 0; hops < 40; hops++) {
        if ((yield* notFound(fs.realPath(current))) !== undefined) return current
        const link = yield* fs.readLink(current).pipe(Effect.orElseSucceed(() => undefined))
        if (link === undefined) return current
        const parent = (yield* notFound(fs.realPath(path.dirname(current)))) ?? path.dirname(current)
        current = path.resolve(parent, link)
      }
      return current
    })

    const resolvePath = Effect.fnUntraced(function* (requested: string) {
      const absolute = yield* followDangling(requested)
      const existing = yield* notFound(fs.realPath(absolute))
      if (existing !== undefined) {
        const info = yield* fs.stat(existing)
        return {
          canonical: existing,
          type: info.type,
          directory: info.type === "Directory" ? existing : path.dirname(existing),
        } satisfies ResolvedPath
      }

      let anchor = path.dirname(absolute)
      while (true) {
        const canonical = yield* notFound(fs.realPath(anchor))
        if (canonical !== undefined) {
          const info = yield* fs.stat(canonical)
          if (info.type !== "Directory") {
            return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
          }
          return {
            canonical: path.resolve(canonical, path.relative(anchor, absolute)),
            directory: canonical,
          } satisfies ResolvedPath
        }
        const parent = path.dirname(anchor)
        if (parent === anchor) return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
        anchor = parent
      }
    })

    const resolve = Effect.fn("LocationMutation.resolve")(function* (input: ResolveInput) {
      const relative = !path.isAbsolute(input.path)
      const absolute = path.resolve(location.directory, input.path)
      const lexicallyInternal = FSUtil.contains(location.directory, absolute)
      if (relative && !lexicallyInternal) return yield* new PathError({ path: input.path, reason: "relative_escape" })

      const resolved = yield* resolvePath(absolute)
      if (lexicallyInternal && !FSUtil.contains(locationRoot, resolved.canonical)) {
        return yield* new PathError({ path: input.path, reason: "location_escape" })
      }

      const external = !lexicallyInternal
      const resource = external
        ? slash(resolved.canonical)
        : slash(path.relative(locationRoot, resolved.canonical) || ".")
      const externalDirectory =
        input.kind === "directory" && resolved.type === "Directory" ? resolved.canonical : resolved.directory
      const externalResource = slash(path.join(externalDirectory, "*"))
      return {
        canonical: resolved.canonical,
        resource,
        externalDirectory: external
          ? {
              action: "external_directory",
              directory: externalDirectory,
              resource: externalResource,
              save: externalResource,
            }
          : undefined,
      } satisfies Target
    })

    return Service.of({ resolve })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({
  service: Service,
  layer: layer.pipe(Layer.orDie),
  deps: [FSUtil.node, Location.node],
```

## F099

`packages/core/src/filesystem.ts:46791eb40338be5fcc31bc22d110a9899d6b5d80` — lines 55–135.

```typescript
export interface Interface {
  readonly read: (input: ReadInput) => Effect.Effect<{ readonly content: Uint8Array; readonly mime: string }, PathError>
  readonly list: (input?: ListInput) => Effect.Effect<Entry[]>
  readonly find: (input: FindInput) => Effect.Effect<Entry[], FileSystemSearch.SearchError>
  readonly glob: (input: GlobInput) => Effect.Effect<readonly Entry[], FileSystemSearch.SearchError>
  readonly grep: (input: GrepInput) => Effect.Effect<readonly Match[], FileSystemSearch.SearchError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/FileSystem") {}

const baseLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const search = yield* FileSystemSearch.Service
    const resolve = (input?: RelativePath) => within(fs, location.directory, input)
    return Service.of({
      find: search.find,
      glob: search.glob,
      grep: search.grep,
      read: Effect.fn("FileSystem.read")(function* (input) {
        const target = yield* resolve(input.path)
        const info = yield* fs.stat(target.real).pipe(Effect.orDie)
        if (info.type !== "File") return yield* new PathError({ path: input.path, reason: "not-file" })
        return {
          content: yield* fs.readFile(target.real).pipe(Effect.orDie),
          mime: FSUtil.mimeType(target.real),
        }
      }),
      list: (input = {}) => list(fs, location.directory, input),
    })
  }),
)

const within = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, input?: RelativePath) {
  const root = yield* fs.realPath(directory).pipe(Effect.orDie)
  const relative = input ?? "."
  const absolute = path.resolve(directory, relative)
  if (!FSUtil.contains(directory, absolute)) return yield* new PathError({ path: relative, reason: "outside" })
  const real = yield* fs.realPath(absolute).pipe(Effect.mapError(() => new PathError({ path: relative, reason: "missing" })))
  if (!FSUtil.contains(root, real)) return yield* new PathError({ path: relative, reason: "outside" })
  return { absolute, real, directory, root }
})

/**
 * The direct children of a directory under `directory`, directories first. It needs only the filesystem, so a
 * directory browser lists folders without starting their Location's services.
 */
export const list = Effect.fn("FileSystem.list")(function* (
  fs: FSUtil.Interface,
  directory: string,
  input: ListInput = {},
) {
  const target = yield* within(fs, directory, input.path).pipe(Effect.orDie)
  const info = yield* fs.stat(target.real).pipe(Effect.orDie)
  if (info.type !== "Directory") return yield* Effect.die(new Error("Path is not a directory"))
  return yield* fs.readDirectoryEntries(target.real).pipe(
    Effect.orDie,
    Effect.map((items) =>
      items
        .flatMap((item) => {
          if (item.type !== "file" && item.type !== "directory") return []
          const absolute = path.join(target.absolute, item.name)
          const relative = path.relative(target.directory, absolute)
          return [
            Entry.make({
              path: RelativePath.make(relative + (item.type === "directory" ? path.sep : "")),
              type: item.type,
            }),
          ]
        })
        .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "directory" ? -1 : 1)),
    ),
  )
})

export const node = makeLocationNode({
  service: Service,
  layer: baseLayer,
  deps: [FSUtil.node, Location.node, FileSystemSearch.node],
```

## F100

`packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99` — lines 13–212.

```typescript
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
                  existing.payload !== value.payload
                )
                  return yield* new CheckpointError({ reason: "conflict" })
                if (existing.digest !== hash) return yield* new CheckpointError({ reason: "corrupt" })
                const { payload, ...result } = existing
                return result
              }

              // Exact retries use the retained record, even after the source Session is deleted.
              // Only insertion resolves current ownership; retries never reassign old checkpoints.
              const session = yield* tx
                .select({ projectID: SessionTable.project_id, directory: SessionTable.directory })
                .from(SessionTable)
                .where(eq(SessionTable.id, value.sessionID))
                .get()
              if (!session) return yield* new CheckpointError({ reason: "missing_session" })

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
```

## F101

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 519–590.

```typescript
      fork: Effect.fn("V2Session.fork")(function* (input) {
        const source = yield* result.get(input.sessionID)
        const rows = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.session_id, source.id))
          .orderBy(asc(SessionMessageTable.seq))
          .all()
          .pipe(Effect.orDie)
        const target = input.messageID ? rows.findIndex((row) => row.id === input.messageID) : rows.length
        if (target < 0) return yield* new MessageNotFoundError({ sessionID: source.id, messageID: input.messageID! })
        const reverted = source.revert ? rows.findIndex((row) => row.id === source.revert?.messageID) : -1
        const kept = rows.slice(0, reverted < 0 ? target : Math.min(target, reverted))
        const forked = yield* result.create({ location: source.location, agent: source.agent, model: source.model })
        yield* SessionLifecycle.rename(db, events, { sessionID: forked.id, title: forkedTitle(source.title) })
        // As the legacy import does: copied rows take negative sequences below every event the fork will project.
        yield* db
          .transaction(
            () =>
              Effect.forEach(
                kept,
                (row, index) =>
                  decode(row).pipe(
                    Effect.orDie,
                    Effect.flatMap((message) => {
                      const { id, type, ...data } = encodeMessage({
                        ...message,
                        id: SessionMessage.ID.create(),
                        ...(message.type === "synthetic" ? { sessionID: forked.id } : {}),
                      })
                      return db
                        .insert(SessionMessageTable)
                        .values({
                          id: SessionMessage.ID.make(id),
                          session_id: forked.id,
                          type,
                          seq: index - kept.length,
                          time_created: row.time_created,
                          data,
                        })
                        .run()
                    }),
                  ),
                { discard: true },
              ),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
        return yield* result.get(forked.id)
      }),
      move: Effect.fn("V2Session.move")(function* (input) {
        const session = yield* result.get(input.sessionID)
        const project = yield* projects.resolve(input.location.directory)
        if (project.id !== session.projectID)
          return yield* new MoveError({ sessionID: session.id, directory: input.location.directory })
        const subdirectory = path.relative(project.directory, input.location.directory).replaceAll("\\", "/")
        yield* exclusive(
          session,
          Effect.gen(function* () {
            yield* events.publish(
              SessionEvent.Moved,
              {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                location: input.location,
                ...(subdirectory ? { subdirectory: RelativePath.make(subdirectory) } : {}),
              },
              { location: input.location },
            )
          }),
        )
      }),
```

## F102

`docs/specs/project.md:35adeb94cff7e1d24adc9844f9e25fdb17df08a5` — lines 1–64.

````text
## project

The goal is to let a single instance of Orchestra run sessions for multiple projects and different worktrees per project.

### api

```
GET /project -> Project[]

POST /project/init -> Project


GET /project/:projectID/session -> Session[]

GET /project/:projectID/session/:sessionID -> Session

POST /project/:projectID/session -> Session
{
  id?: string
  parentID?: string
  directory: string
}

DELETE /project/:projectID/session/:sessionID

POST /project/:projectID/session/:sessionID/init

POST /project/:projectID/session/:sessionID/abort

POST /project/:projectID/session/:sessionID/share

DELETE /project/:projectID/session/:sessionID/share

POST /project/:projectID/session/:sessionID/compact

GET /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }[]

GET /project/:projectID/session/:sessionID/message/:messageID -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/revert -> Session

POST /project/:projectID/session/:sessionID/unrevert -> Session

POST /project/:projectID/session/:sessionID/permission/:permissionID -> Session

GET /project/:projectID/session/:sessionID/find/file -> string[]

GET /project/:projectID/session/:sessionID/file -> { type: "raw" | "patch", content: string }

GET /project/:projectID/session/:sessionID/file/status -> File[]

POST /log

// These are awkward

GET /provider?directory=<resolve path> -> Provider
GET /config?directory=<resolve path> -> Config // think only tui uses this?

GET /project/:projectID/agent?directory=<resolve path> -> Agent
GET /project/:projectID/find/file?directory=<resolve path> -> File

```
````

## F103

`packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872` — lines 33–40.

```typescript
export function batch<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const current = yield* CurrentBatch
    if (current) return yield* effect
    const reloads = new Set<Reload>()
    const result = yield* effect.pipe(Effect.provideService(CurrentBatch, reloads))
    yield* Effect.forEach(reloads, (reload) => reload(), { discard: true })
    return result
```

## F104

`packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872` — lines 63–130.

```typescript
export function create<State, DraftApi>(options: Options<State, DraftApi>): Interface<State, DraftApi> {
  let state = options.initial()
  let transforms: { run: TransformCallback<DraftApi> }[] = []
  const semaphore = Semaphore.makeUnsafe(1)

  const commit = Effect.fn("State.commit")(function* (next: State) {
    const api = options.draft(next)
    if (options.finalize) yield* options.finalize(api)
    state = next
  })

  const apply = (transform: TransformCallback<DraftApi>, draft: DraftApi) =>
    Effect.suspend(() => {
      const result = transform(draft)
      return Effect.isEffect(result) ? Effect.asVoid(result).pipe(Effect.orDie) : Effect.void
    })

  const materialize = Effect.fnUntraced(function* () {
    const next = options.initial()
    const api = options.draft(next)
    for (const transform of transforms) yield* apply(transform.run, api).pipe(Effect.withSpan("State.reload.update"))
    yield* commit(next)
  })

  const reload = () => semaphore.withPermit(materialize())

  const result: Interface<State, DraftApi> = {
    get: () => state,
    withRead: (read) => semaphore.withPermit(Effect.suspend(() => read(state))),
    transform: Effect.fn("State.transform")(function* (update) {
      const scope = yield* Scope.Scope
      return yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const transform = { run: update }
          let active = true
          const dispose = Effect.uninterruptible(
            semaphore.withPermit(
              Effect.suspend(() => {
                if (!active) return Effect.void
                active = false
                transforms = transforms.filter((item) => item !== transform)
                return Effect.gen(function* () {
                  const batch = yield* CurrentBatch
                  if (batch) {
                    batch.add(reload)
                    return
                  }
                  yield* materialize()
                })
              }),
            ),
          )
          yield* semaphore.withPermit(
            Effect.sync(() => {
              transforms = [...transforms, transform]
            }),
          )
          yield* Scope.addFinalizer(scope, dispose)
          const batch = yield* CurrentBatch
          if (batch) batch.add(reload)
          else yield* reload()
          return { dispose }
        }),
      )
    }),
    reload,
  }
  return result
```

## F105

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 23–55.

```typescript
/**
 * Live activations fail fast on another in-flight activation target with PLUGIN_DEPENDENCY_BLOCKED.
 * Independent callers queue; retired ancestry is ignored. Own live ancestry retains the load-cycle failure.
 * This is a conservative dependency policy, not a general wait-for graph or cycle proof.
 */
export interface Interface {
  readonly add: (id: ID, effect: PluginRuntime["effect"]) => Effect.Effect<void>
  /** Install once for this Location lifetime, preserving active plugin scope and transform order. */
  readonly ensure: (id: ID, effect: PluginRuntime["effect"]) => Effect.Effect<void>
  /**
   * Adds plugins in order with one state flush for the whole boot. If that flush fails, the booted plugins are
   * removed and added again one by one, so the plugin whose state fails is rolled back as with `add`.
   */
  readonly boot: (
    plugins: Iterable<{ readonly id: ID; readonly effect: PluginRuntime["effect"] }>,
  ) => Effect.Effect<void>
  readonly remove: (id: ID) => Effect.Effect<void>
  readonly wait: (id: ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Plugin") {}

const LoadingAncestry = Context.Reference<readonly { readonly scope: Scope.Scope; readonly id: ID; live: boolean }[]>(
  "@orchestra/Plugin/LoadingAncestry",
  { defaultValue: () => [] },
)

// Reuse State.batch's fiber-local queue protocol. Activation owns its queue even inside an enclosing batch,
// and retains it for rollback when the effect or a later materialization fails. Earlier parent registrations
// may replay during this flush and again in the parent flush; this does not provide outer-batch atomicity.
const StateBatch = Context.Reference<Set<State.Reload> | undefined>("@orchestra/State/CurrentBatch", {
  defaultValue: () => undefined,
})
```

## F106

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 69–164.

```typescript
    const checkAccess = Effect.fnUntraced(function* (id: ID, operation: "install" | "wait" | "remove") {
      const ancestry = (yield* LoadingAncestry).filter((entry) => entry.live)
      if (ancestry.some((entry) => entry.scope === scope && entry.id === id))
        return yield* Effect.die(
          operation === "remove"
            ? `Cannot remove plugin ${id} while it is loading`
            : `Plugin load cycle detected for ${id}`,
        )
      if (ancestry.length > 0 && loading.has(id)) return yield* Effect.die(`PLUGIN_DEPENDENCY_BLOCKED: ${id}`)
      return ancestry
    })

    const flush = (reloads: Set<State.Reload>) =>
      Effect.forEach(reloads, (reload) => reload(), { discard: true }).pipe(
        Effect.provideService(StateBatch, undefined),
      )

    // A boot defers every activation's reloads to its single flush instead of replaying them per plugin.
    const settle = (reloads: Set<State.Reload>, boot: Set<State.Reload> | undefined) =>
      boot ? Effect.sync(() => reloads.forEach((reload) => boot.add(reload))) : flush(reloads)

    const closeAndReplay = Effect.fn("Plugin.closeAndReplay")(function* (
      child: Scope.Closeable,
      primary: Exit.Exit<void, never>,
      reloads: Set<State.Reload>,
      boot?: Set<State.Reload>,
    ) {
      const closed = yield* Scope.close(child, primary).pipe(Effect.exit)
      const replayed = yield* settle(reloads, boot).pipe(Effect.exit)
      const cause = [primary, closed, replayed].reduce(
        (cause, exit) => (Exit.isFailure(exit) ? Cause.combine(cause, exit.cause) : cause),
        Cause.empty,
      )
      return cause.reasons.length === 0 ? Exit.void : Exit.failCause(cause)
    })

    const install = Effect.fnUntraced(function* (
      id: ID,
      effect: PluginRuntime["effect"],
      retain: boolean,
      boot?: Set<State.Reload>,
    ) {
      const ancestry = yield* checkAccess(id, "install")

      yield* locks.withLock(id)(
        Effect.gen(function* () {
          if (retain && active.has(id)) return
          const child = yield* Scope.fork(scope)
          const reloads = new Set<State.Reload>()
          const token = { scope, id, live: true }
          loading.add(id)
          failures.delete(id)
          const activate = Effect.gen(function* () {
            const existing = active.get(id)
            active.delete(id)
            if (existing) yield* Scope.close(existing, Exit.void)
            yield* effect(host).pipe(
              Scope.provide(child),
              Effect.withSpan("Plugin.load", { attributes: { "plugin.id": id } }),
            )
            yield* settle(reloads, boot).pipe(Scope.provide(child))
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* events.publish(Event.Added, { id })
                active.set(id, child)
                yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.succeed(waiter, undefined), {
                  discard: true,
                })
                waiters.delete(id)
              }),
            ).pipe(Effect.provideService(StateBatch, undefined))
          })
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const primary = yield* restore(activate).pipe(Effect.exit)
              if (Exit.isSuccess(primary)) return
              active.delete(id)
              const combined = yield* closeAndReplay(child, primary, reloads, boot)
              failures.set(id, combined)
              yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.done(waiter, combined), {
                discard: true,
              }).pipe(Effect.ensuring(Effect.sync(() => waiters.delete(id))))
              return yield* combined
            }),
          ).pipe(
            Effect.provideService(StateBatch, reloads),
            Effect.provideService(LoadingAncestry, [...ancestry, token]),
            Effect.ensuring(
              Effect.sync(() => {
                token.live = false
                loading.delete(id)
              }),
            ),
          )
        }),
      )
```

## F107

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 167–242.

```typescript
    const remove = Effect.fn("Plugin.remove")(function* (id: ID) {
      yield* checkAccess(id, "remove")

      yield* locks.withLock(id)(
        Effect.uninterruptible(
          Effect.gen(function* () {
            const current = active.get(id)
            active.delete(id)
            failures.delete(id)
            if (!current) return
            const reloads = new Set<State.Reload>()
            const combined = yield* closeAndReplay(current, Exit.void, reloads).pipe(
              Effect.provideService(StateBatch, reloads),
            )
            return yield* combined
          }),
        ),
      )
    })

    const boot = Effect.fn("Plugin.boot")(function* (
      plugins: Iterable<{ readonly id: ID; readonly effect: PluginRuntime["effect"] }>,
    ) {
      const reloads = new Set<State.Reload>()
      const installed: { readonly id: ID; readonly effect: PluginRuntime["effect"] }[] = []
      const booted = yield* Effect.forEach(
        plugins,
        (plugin) =>
          install(plugin.id, plugin.effect, false, reloads).pipe(
            Effect.andThen(Effect.sync(() => installed.push(plugin))),
          ),
        { discard: true },
      ).pipe(Effect.exit)
      const flushed = yield* flush(reloads).pipe(Effect.exit)
      if (Exit.isSuccess(flushed)) return yield* booted
      // One flush cannot tell which plugin's state failed. Remove the booted plugins, then add them back one at a
      // time so the per-plugin flush rolls back the failing one and stops there, as a boot of plain adds would.
      yield* Effect.forEach(installed.toReversed(), (plugin) => remove(plugin.id).pipe(Effect.exit), { discard: true })
      yield* Effect.forEach(installed, (plugin) => install(plugin.id, plugin.effect, false), { discard: true })
      return yield* booted
    })

    const wait = Effect.fn("Plugin.wait")(function* (id: ID) {
      yield* checkAccess(id, "wait")
      const waiter = yield* Deferred.make<void>()
      const pending = yield* locks.withLock(id)(
        Effect.sync(() => {
          if (active.has(id)) return false
          const failure = failures.get(id)
          if (failure) return failure
          const current = waiters.get(id) ?? new Set()
          current.add(waiter)
          waiters.set(id, current)
          return true
        }),
      )
      if (!pending) return
      if (typeof pending !== "boolean") return yield* pending
      yield* Deferred.await(waiter).pipe(
        Effect.ensuring(
          locks.withLock(id)(
            Effect.sync(() => {
              const current = waiters.get(id)
              current?.delete(waiter)
              if (current?.size === 0) waiters.delete(id)
            }),
          ),
        ),
      )
    })

    yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        active.clear()
        yield* State.batch(Scope.close(scope, exit))
      }),
```

## F108

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 140–202.

```typescript
export interface Interface extends State.Transformable<Draft> {
  /** Registers a scoped transform over the integration registry. */
  /** Returns one integration with its methods and current connections. */
  readonly get: (id: ID) => Effect.Effect<Info | undefined>
  /** Returns all integrations with their methods and current connections. */
  readonly list: () => Effect.Effect<Info[]>
  readonly connection: {
    /** Returns the active connection for one integration. */
    readonly active: (id: ID) => Effect.Effect<IntegrationConnection.Info | undefined>
    /** Resolves a connection into usable credential material. */
    readonly resolve: (
      connection: IntegrationConnection.Info,
    ) => Effect.Effect<Credential.Value | undefined, AuthorizationError | Credential.InheritedError>
    /** Runs a key method and stores the resulting credential. */
    readonly key: (input: {
      /** Integration receiving the credential. */
      readonly integrationID: ID
      /** Secret entered by the user. */
      readonly key: string
      /** User-facing label for the stored credential. */
      readonly label?: string
      /** Extra data stored beside the secret, for example the env name of a well-known provider token. */
      readonly metadata?: Record<string, unknown>
    }) => Effect.Effect<void, AuthorizationError>
    /** Starts a stateful OAuth attempt. */
    readonly oauth: (input: {
      /** Integration being authenticated. */
      readonly integrationID: ID
      /** OAuth method selected by the caller. */
      readonly methodID: MethodID
      /** Answers to the method's optional prompts. */
      readonly inputs: Inputs
      /** User-facing label for the credential created on completion. */
      readonly label?: string
    }) => Effect.Effect<Attempt, AuthorizationError>
    /** Updates a stored credential exposed as a connection. Inherited credentials are read-only. */
    readonly update: (
      credentialID: Credential.ID,
      updates: Partial<Pick<Credential.Info, "label">>,
    ) => Effect.Effect<void, Credential.InheritedError>
    /** Removes a stored credential connection. Inherited credentials are read-only. */
    readonly remove: (credentialID: Credential.ID) => Effect.Effect<void, Credential.InheritedError>
    /**
     * Removes every stored credential of one integration and returns how many it removed. Environment connections are
     * not stored and stay. An inherited credential fails the call, since it cannot be removed here.
     */
    readonly disconnect: (integrationID: ID) => Effect.Effect<number, Credential.InheritedError>
  }
  readonly attempt: {
    /** Checks an attempt's authoritative integration owner, including retained terminal states. */
    readonly ownedBy: (attemptID: AttemptID, integrationID: ID) => Effect.Effect<boolean>
    /** Returns the current state of an OAuth attempt. */
    readonly status: (attemptID: AttemptID) => Effect.Effect<AttemptStatus, AuthorizationError>
    /** Completes the attempt and stores its credential. */
    readonly complete: (input: {
      /** Opaque handle returned by `oauth`. */
      readonly attemptID: AttemptID
      /** Authorization code required by attempts in code mode. */
      readonly code?: string
    }) => Effect.Effect<void, CodeRequiredError | AuthorizationError>
    /** Cancels an attempt and releases its resources. */
    readonly cancel: (attemptID: AttemptID) => Effect.Effect<void>
  }
```

## F109

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 231–418.

```typescript
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const events = yield* EventV2.Service
    const scope = yield* Scope.Scope
    const attempts = SynchronizedRef.makeUnsafe(new Map<AttemptID, AttemptEntry>())
    const state = State.create<Data, Draft>({
      initial: () => ({ integrations: new Map<ID, Entry>() }),
      draft: (draft) => ({
        list: () => Array.from(draft.integrations.values(), (entry) => entry.ref) as Ref[],
        get: (id) => draft.integrations.get(id)?.ref as Ref | undefined,
        update: (id, update) => {
          const current = draft.integrations.get(id) ?? {
            ref: { id, name: id },
            methods: [],
            implementations: new Map(),
          }
          if (!draft.integrations.has(id)) draft.integrations.set(id, current)
          update(current.ref)
          current.ref.id = id
        },
        remove: (id) => draft.integrations.delete(id),
        method: {
          list: (integrationID) => (draft.integrations.get(integrationID)?.methods as Method[] | undefined) ?? [],
          update: (implementation) => {
            const current = draft.integrations.get(implementation.integrationID) ?? {
              ref: {
                id: implementation.integrationID,
                name: implementation.integrationID,
              },
              methods: [],
              implementations: new Map<MethodID, Types.DeepMutable<OAuthImplementation>>(),
            }
            if (!draft.integrations.has(implementation.integrationID)) {
              draft.integrations.set(implementation.integrationID, current)
            }
            const index = current.methods.findIndex((method) => {
              if (method.type !== implementation.method.type) return false
              if (method.type !== "oauth" || implementation.method.type !== "oauth") return true
              return method.id === implementation.method.id
            })
            if (index === -1) current.methods.push(implementation.method as Types.DeepMutable<Method>)
            else current.methods[index] = implementation.method as Types.DeepMutable<Method>
            if (implementation.method.type === "oauth") {
              current.implementations.set(
                implementation.method.id,
                implementation as Types.DeepMutable<OAuthImplementation>,
              )
            }
          },
          remove: (integrationID, method) => {
            const current = draft.integrations.get(integrationID)
            if (!current) return
            const index = current.methods.findIndex((candidate) => {
              if (candidate.type !== method.type) return false
              if (candidate.type !== "oauth" || method.type !== "oauth") return true
              return candidate.id === method.id
            })
            if (index !== -1) current.methods.splice(index, 1)
            if (method.type === "oauth") current.implementations.delete(method.id)
          },
        },
      }),
      finalize: () => events.publish(Event.Updated, {}).pipe(Effect.asVoid),
    })

    const resolveConnections = (entry: Entry | undefined, saved: readonly Credential.Info[]) => {
      const credentials = saved
        .map((credential) => ({
          type: "credential" as const,
          id: credential.id,
          label: credential.label,
        }))
        .toReversed()
      const env = (entry?.methods ?? [])
        .filter((method) => method.type === "env")
        .flatMap((method) => method.names.filter((name) => process.env[name]))
        .map((name) => ({ type: "env" as const, name }))
      return [...credentials, ...env]
    }

    const project = (entry: Entry, connections: IntegrationConnection.Info[]) =>
      new Info({
        id: entry.ref.id,
        name: entry.ref.name,
        methods: entry.methods,
        connections,
      })

    const authorize = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError((cause) => new AuthorizationError({ cause })))

    const close = (attemptScope: Scope.Closeable) =>
      Scope.close(attemptScope, Exit.void).pipe(Effect.forkIn(scope, { startImmediately: true }), Effect.asVoid)

    const message = (cause: Cause.Cause<unknown>) => {
      const error = Cause.squash(cause)
      return error instanceof Error ? error.message : String(error)
    }

    const settle = Effect.fnUntraced(function* (attemptID: AttemptID, exit: Exit.Exit<Credential.OAuth, unknown>) {
      const now = yield* Clock.currentTimeMillis
      const result = yield* SynchronizedRef.modify(attempts, (current) => {
        const attempt = current.get(attemptID)
        if (!attempt || attempt.status !== "pending") return [undefined, current]
        const terminal: TerminalAttempt = Exit.isSuccess(exit)
          ? {
              status: "complete",
              integrationID: attempt.integrationID,
              time: attempt.time,
              removeAt: now + terminalRetention,
            }
          : {
              status: "failed",
              integrationID: attempt.integrationID,
              message: message(exit.cause),
              time: attempt.time,
              removeAt: now + terminalRetention,
            }
        return [attempt, new Map(current).set(attemptID, terminal)]
      })
      if (!result) return
      if (Exit.isSuccess(exit)) {
        const implementation = state.get().integrations.get(result.integrationID)?.implementations.get(result.methodID)
        yield* credentials.create({
          integrationID: result.integrationID,
          label: result.label ?? implementation?.label?.(exit.value),
          value: exit.value,
        })
        yield* events.publish(Event.ConnectionUpdated, { integrationID: result.integrationID })
        yield* events.publish(Event.Updated, {})
      }
      yield* close(result.scope)
    })

    const scrub = Effect.fnUntraced(function* () {
      const now = yield* Clock.currentTimeMillis
      const expired = yield* SynchronizedRef.modify(attempts, (current) => {
        const next = new Map(current)
        const scopes: Scope.Closeable[] = []
        for (const [id, attempt] of current) {
          if (attempt.status === "pending" && attempt.time.expires <= now) {
            scopes.push(attempt.scope)
            next.set(id, {
              status: "expired",
              integrationID: attempt.integrationID,
              time: attempt.time,
              removeAt: now + terminalRetention,
            })
            continue
          }
          if (attempt.status !== "pending" && attempt.removeAt <= now) next.delete(id)
        }
        return [scopes, next]
      })
      yield* Effect.forEach(expired, close, { discard: true })
    })

    yield* scrub().pipe(Effect.repeat(Schedule.spaced(scrubInterval)), Effect.forkIn(scope))

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      get: Effect.fn("Integration.get")(function* (id) {
        const entry = state.get().integrations.get(id)
        if (!entry) return undefined
        return project(entry, resolveConnections(entry, yield* credentials.list(id)))
      }),
      list: Effect.fn("Integration.list")(function* () {
        const saved = Map.groupBy(yield* credentials.all(), (credential) => credential.integrationID)
        return Array.from(state.get().integrations.values(), (entry) =>
          project(entry, resolveConnections(entry, saved.get(entry.ref.id) ?? [])),
        ).toSorted((a, b) => a.name.localeCompare(b.name))
      }),
      connection: {
        active: Effect.fn("Integration.connection.active")(function* (id) {
          const entry = state.get().integrations.get(id)
          return resolveConnections(entry, yield* credentials.list(id))[0]
        }),
        resolve: Effect.fn("Integration.connection.resolve")(function* (connection) {
          if (connection.type === "env") {
            const key = process.env[connection.name]
            return key ? Credential.Key.make({ type: "key", key }) : undefined
          }
          const credential = yield* credentials.get(connection.id)
          if (!credential) return undefined
          if (credential.value.type === "key") return credential.value
```

## F110

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 445–535.

```typescript
          if (!method) {
            return yield* Effect.die(`OAuth method not found: ${input.integrationID}/${input.methodID}`)
          }
          const attemptScope = yield* Scope.fork(scope)
          const authorization = yield* authorize(method.authorize(input.inputs)).pipe(
            Scope.provide(attemptScope),
            Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(attemptScope, exit) : Effect.void)),
          )
          const id = AttemptID.create()
          const created = yield* Clock.currentTimeMillis
          const time = { created, expires: created + attemptLifetime }
          yield* SynchronizedRef.update(attempts, (current) =>
            new Map(current).set(id, {
              status: "pending",
              completing: authorization.mode === "auto",
              authorization,
              integrationID: input.integrationID,
              methodID: input.methodID,
              label: input.label,
              scope: attemptScope,
              time,
            }),
          )
          if (authorization.mode === "auto") {
            yield* authorization.callback.pipe(
              Effect.exit,
              Effect.flatMap((exit) => settle(id, exit)),
              Effect.forkIn(attemptScope, { startImmediately: true }),
            )
          }
          return new Attempt({
            attemptID: id,
            url: authorization.url,
            instructions: authorization.instructions,
            mode: authorization.mode,
            time,
          })
        }),
        update: Effect.fn("Integration.connection.update")(function* (credentialID, updates) {
          const credential = yield* credentials.get(credentialID)
          yield* credentials.update(credentialID, updates)
          if (credential) {
            yield* events.publish(Event.ConnectionUpdated, { integrationID: credential.integrationID })
          }
          yield* events.publish(Event.Updated, {})
        }),
        remove: Effect.fn("Integration.connection.remove")(function* (credentialID) {
          const credential = yield* credentials.get(credentialID)
          yield* credentials.remove(credentialID)
          if (credential) {
            yield* events.publish(Event.ConnectionUpdated, { integrationID: credential.integrationID })
          }
          yield* events.publish(Event.Updated, {})
        }),
        disconnect: Effect.fn("Integration.connection.disconnect")(function* (integrationID) {
          const stored = yield* credentials.list(integrationID)
          yield* Effect.forEach(stored, (credential) => credentials.remove(credential.id), { discard: true })
          if (stored.length > 0) {
            yield* events.publish(Event.ConnectionUpdated, { integrationID })
            yield* events.publish(Event.Updated, {})
          }
          return stored.length
        }),
      },
      attempt: {
        ownedBy: Effect.fn("Integration.attempt.ownedBy")(function* (attemptID, integrationID) {
          return (yield* SynchronizedRef.get(attempts)).get(attemptID)?.integrationID === integrationID
        }),
        status: Effect.fn("Integration.attempt.status")(function* (attemptID) {
          const attempt = (yield* SynchronizedRef.get(attempts)).get(attemptID)
          if (!attempt)
            return yield* new AuthorizationError({ cause: new Error(`OAuth attempt not found: ${attemptID}`) })
          if (attempt.status === "failed") {
            return { status: attempt.status, message: attempt.message ?? "Authorization failed", time: attempt.time }
          }
          return { status: attempt.status, time: attempt.time }
        }),
        complete: Effect.fn("Integration.attempt.complete")(function* (input) {
          const attempt = yield* SynchronizedRef.modify(attempts, (current) => {
            const match = current.get(input.attemptID)
            if (!match || match.status !== "pending" || match.completing) return [match, current]
            if (match.authorization.mode === "code" && input.code === undefined) return [match, current]
            return [match, new Map(current).set(input.attemptID, { ...match, completing: true })]
          })
          if (!attempt)
            return yield* new AuthorizationError({ cause: new Error(`OAuth attempt not found: ${input.attemptID}`) })
          if (attempt.status !== "pending") return
          if (attempt.authorization.mode === "code" && input.code === undefined) {
            return yield* new CodeRequiredError({ attemptID: input.attemptID })
          }
          if (attempt.completing) return yield* Effect.die(`OAuth attempt already completing: ${input.attemptID}`)
```

## F111

`packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — lines 161–193.

```typescript
    const configured = Effect.fnUntraced(function* () {
      const documents = (yield* config.entries()).filter((entry): entry is Config.Document => entry.type === "document")
      const servers = new Map<string, ConfigMCP.Local | ConfigMCP.Remote | Provided>(
        documents.flatMap((document) => Object.entries(document.info.mcp?.servers ?? {})),
      )
      // A repository's own config is not the user's: its local servers are commands the repository chose to run.
      // Only the user's global config can approve a project, and the document that wins a name decides its origin.
      const inGlobal = (document: Config.Document) => ConfigTrust.isUser(global.config, document)
      const approved = ConfigTrust.isTrusted(documents, global.config, location.directory)
      // Later documents win a name, so the last document that declares it decides where the server comes from.
      const unapproved = new Set(
        approved
          ? []
          : Array.from(
              new Map(
                documents.flatMap((document) =>
                  Object.keys(document.info.mcp?.servers ?? {}).map((name) => [name, !inGlobal(document)] as const),
                ),
              ),
            ).flatMap(([name, fromProject]) => (fromProject ? [name] : [])),
      )
      for (const [name, server] of added) {
        servers.set(name, server)
        unapproved.delete(name)
      }
      for (const name of removed) servers.delete(name)
      for (const [name, server] of provided.current) if (!servers.has(name)) servers.set(name, { type: "provided", server })
      return {
        servers,
        unapproved,
        // `timeout` resolves on its own: a project that only lists servers must not hide the global timeout.
        timeout: Config.mcpTimeout(documents),
      }
```

## F112

`packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — lines 204–330.

```typescript
    const release = (current: Entry) => {
      const client = current.client
      const scope = current.tools
      current.client = undefined
      current.tools = undefined
      current.toolNames = undefined
      return Effect.all([
        scope ? Scope.close(scope, Exit.void) : Effect.void,
        client ? Effect.promise(() => client.close().catch(() => undefined)) : Effect.void,
      ]).pipe(Effect.asVoid)
    }

    const register = Effect.fnUntraced(function* (
      name: string,
      client: Client,
      defs: ListToolsResult["tools"],
      timeout: number,
    ) {
      const scope = yield* Scope.make()
      // One registration per tool, so a tool whose name the registry refuses leaves the others available.
      yield* Effect.forEach(
        defs,
        (def) =>
          tools
            .register({ [McpCatalog.toolName(name, def.name)]: mcpTool(name, client, def, timeout) })
            .pipe(Effect.ignore),
        { discard: true },
      ).pipe(Scope.provide(scope))
      return scope
    })

    const mcpTool = (server: string, client: Client, def: ListToolsResult["tools"][number], timeout: number) =>
      Tool.dynamic({
        description: def.description ?? "",
        inputSchema: { ...def.inputSchema, type: "object", properties: def.inputSchema.properties ?? {} },
        execute: (input, context) =>
          Effect.gen(function* () {
            yield* permission.assert({
              action: McpCatalog.toolName(server, def.name),
              resources: ["*"],
              save: ["*"],
              metadata: { server, tool: def.name },
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            const result = yield* Effect.tryPromise((signal) =>
              client.callTool(
                { name: def.name, arguments: isObject(input) ? input : {} },
                CallToolResultSchema,
                // The MCP SDK only sends a progress token when `onprogress` is set, which enables timeout resets.
                { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
              ),
            )
            if ("toolResult" in result) return yield* Effect.fail(new Error("MCP tool returned no content"))
            if (result.isError) return yield* Effect.fail(new Error(McpCatalog.resultText(result) || "MCP tool returned an error"))
            return { structured: result.structuredContent ?? {}, content: McpCatalog.resultContent(result) }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: error.message }))),
      })

    const connect = Effect.fn("Mcp.connect")(function* (name: string) {
      const found = yield* configured()
      const server = found.servers.get(name)
      if (!server) return yield* new NotFoundError({ name })
      const current = entry(name)
      const generation = ++current.generation
      yield* release(current)
      if (server.disabled) {
        blocked.delete(name)
        current.status = { status: "disabled" }
        return
      }
      if (server.type === "local" && found.unapproved.has(name)) {
        blocked.add(name)
        current.status = failed(
          `Not started: this project's config declares a local command for this server. ${ConfigTrust.approveHint(location.directory)}`,
        )
        return
      }
      blocked.delete(name)
      const startup = server.timeout?.startup ?? found.timeout?.startup ?? DEFAULT_TIMEOUT
      const request = server.timeout?.request ?? found.timeout?.request ?? DEFAULT_TIMEOUT
      const opened = yield* open(name, server, startup)
      const client = opened.client
      if (current.generation !== generation) {
        if (client) yield* Effect.promise(() => client.close().catch(() => undefined))
        return
      }
      if (!client) {
        current.status = opened.status
        return
      }
      const listed = client.getServerCapabilities()?.tools
        ? yield* McpCatalog.tools(client, request).pipe(Effect.result)
        : undefined
      if (current.generation !== generation) return yield* Effect.promise(() => client.close().catch(() => undefined))
      if (listed?._tag === "Failure") {
        yield* Effect.promise(() => client.close().catch(() => undefined))
        current.status = failed(
          McpStdio.failure(opened.transport, new Error(`Listing tools failed: ${messageOf(listed.failure)}`)),
        )
        return
      }
      const defs = listed?.success ?? []
      // Connected is reported only once the server's tools are in the registry.
      current.client = client
      current.tools = yield* register(name, client, defs, request)
      current.toolNames = defs.map((def) => def.name)
      current.status = opened.status
      client.onclose = () => {
        if (current.client !== client) return
        const scope = current.tools
        current.client = undefined
        current.tools = undefined
        current.toolNames = undefined
        current.status = failed(McpStdio.failure(opened.transport, new Error("Connection closed")))
        if (scope) Effect.runFork(Scope.close(scope, Exit.void))
      }
      if (!client.getServerCapabilities()?.tools) return
      client.setNotificationHandler(ToolListChangedNotificationSchema, () =>
        Effect.runPromise(
          Effect.gen(function* () {
            if (current.client !== client) return
            const defs = yield* McpCatalog.defs(client, request)
            if (!defs || current.client !== client) return
            const previous = current.tools
            current.tools = yield* register(name, client, defs, request)
```

## F113

`packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — lines 31–74.

```typescript
export const available = (skills: ReadonlyArray<Info>, agent: AgentV2.Info) =>
  skills.filter((skill) => PermissionV2.evaluate("skill", skill.name, agent.permissions).effect !== "deny")

/**
 * A skill tree's nodes are skills too: a `SKILL.md` inside the directory of another listed `SKILL.md` is a node of that
 * tree. It loads by name, but only through its parent's "Next level" index; it is never listed on its own.
 */
export const nested = (skills: ReadonlyArray<Info>, skill: Info) =>
  skills.some(
    (other) =>
      other !== skill &&
      path.basename(other.location) === "SKILL.md" &&
      path.dirname(skill.location).startsWith(path.dirname(other.location) + path.sep),
  )

/** The direct children of a skill tree node, sorted by name. */
export const children = (skills: ReadonlyArray<Info>, skill: Info) =>
  path.basename(skill.location) !== "SKILL.md"
    ? []
    : skills
        .filter(
          (other) =>
            path.basename(other.location) === "SKILL.md" &&
            path.dirname(path.dirname(other.location)) === path.dirname(skill.location),
        )
        .toSorted((a, b) => a.name.localeCompare(b.name))

const Frontmatter = Schema.Struct({
  name: Schema.String.pipe(Schema.optional),
  description: Schema.String.pipe(Schema.optional),
  slash: Schema.Boolean.pipe(Schema.optional),
  // Unknown, not Boolean: YAML reads `internal: yes` as a string, and a bad value must not drop the skill.
  internal: Schema.Unknown.pipe(Schema.optional),
})
const decodeFrontmatter = Schema.decodeUnknownOption(Frontmatter)

export type Data = {
  sources: Types.DeepMutable<Source>[]
  /** Keys (`Source.key`) of the sources whose skill names no other source may take. */
  reserved: string[]
}

export type Draft = {
  /**
```

## F114

`packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — lines 95–219.

```typescript
    const discovery = yield* SkillDiscovery.Service
    const fs = yield* FSUtil.Service

    const state = State.create<Data, Draft>({
      initial: () => ({ sources: [], reserved: [] }),
      draft: (draft) => ({
        source: (source, options) => {
          if (draft.sources.some((item) => Source.equals(item, source))) return
          if (options?.reserved) draft.reserved.push(Source.key(source))
          if (options?.first) return void draft.sources.unshift(source as Types.DeepMutable<Source>)
          draft.sources.push(source as Types.DeepMutable<Source>)
        },
        list: () => draft.sources as Source[],
      }),
    })

    const load = Effect.fn("SkillV2.load")(function* (source: Source) {
      const skills: Info[] = []
      if (source.type === "embedded") return [source.skill]
      const directories = source.type === "directory" ? [source.path] : yield* discovery.pull(source.url)
      for (const directory of directories) {
        const files = yield* fs
          .glob("{*.md,**/SKILL.md}", { cwd: directory, absolute: true, include: "file", symlink: true, dot: true })
          .pipe(Effect.catch(() => Effect.succeed([] as string[])))
        for (const filepath of files.toSorted()) {
          const content = yield* fs.readFileStringSafe(filepath).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (!content) continue
          const markdown = ConfigMarkdown.parseOption(content)
          if (!markdown) {
            yield* Effect.logWarning(`Skipping skill file ${filepath}: its frontmatter could not be parsed`)
            continue
          }
          const frontmatter = decodeFrontmatter(markdown.data).valueOrUndefined
          if (!frontmatter) {
            yield* Effect.logWarning(`Skipping skill file ${filepath}: its frontmatter is not valid skill metadata`)
            continue
          }
          const name =
            frontmatter.name !== undefined
              ? frontmatter.name
              : path.dirname(filepath) === directory
                ? path.basename(filepath, ".md")
                : undefined
          if (!name) continue
          skills.push({
            name,
            description: frontmatter.description,
            slash: frontmatter.slash,
            ...(frontmatter.internal === true || frontmatter.internal === "yes" ? { internal: true } : {}),
            location: AbsolutePath.make(filepath),
            content: markdown.content,
            mtime: yield* SkillFile.modified(filepath).pipe(Effect.provideService(FSUtil.Service, fs)),
          })
        }
      }
      return skills
    })

    // QUESTION(Dax): Should local skill sources invalidate on filesystem watch
    // events, following the reload policy chosen for other context sources?
    const cache = new Map<string, Info[]>()
    // A write bumps the generation, so a list() that started loading before it cannot refill the cache.
    const generation = { current: 0 }
    const invalidate = () => {
      generation.current++
      cache.clear()
    }
    // Each dropped skill file is reported once, not on every list.
    const shadowed = new Set<string>()
    const list = Effect.fn("SkillV2.list")(function* () {
      const started = generation.current
      const data = state.get()
      const sources: { key: string; skills: Info[] }[] = []
      for (const source of data.sources) {
        const key = Source.key(source)
        const loaded = cache.get(key) ?? (yield* load(source))
        if (generation.current === started) cache.set(key, loaded)
        sources.push({ key, skills: loaded })
      }
      const owners = new Map(
        sources
          .filter((source) => data.reserved.includes(source.key))
          .flatMap((source) => source.skills.map((skill) => [skill.name, source.key] as const)),
      )
      const skills = new Map<string, Info>()
      for (const source of sources) {
        for (const skill of source.skills) {
          const owner = owners.get(skill.name)
          if (owner === undefined || owner === source.key) {
            skills.set(skill.name, skill)
            continue
          }
          if (!shadowed.has(skill.location))
            yield* Effect.logWarning(`Ignoring skill ${skill.location}: the name ${skill.name} is reserved by a bundled skill`)
          shadowed.add(skill.location)
        }
      }
      return Array.from(skills.values())
    })

    const save = Effect.fn("SkillV2.save")(function* (directory: string, input: SkillFile.SaveInput) {
      const saved = yield* SkillFile.save({ directory, registered: yield* list(), skill: input }).pipe(
        Effect.provideService(FSUtil.Service, fs),
      )
      invalidate()
      return Info.make({ ...saved, location: AbsolutePath.make(saved.location) })
    })

    const remove = Effect.fn("SkillV2.remove")(function* (directory: string, location: string) {
      yield* SkillFile.remove({ directory, registered: yield* list(), location }).pipe(
        Effect.provideService(FSUtil.Service, fs),
      )
      invalidate()
    })

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      sources: Effect.fn("SkillV2.sources")(function* () {
        return state.get().sources
      }),
      list,
      save,
      remove,
    })
```

## F115

`packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — lines 69–101.

```typescript
    const selectable = (agent: Info | undefined) =>
      agent && agent.mode !== "subagent" && !agent.hidden ? agent : undefined
    // Maestro is the default unless configuration names another selectable agent. No other agent becomes the
    // default implicitly, so without Maestro an omitted-agent Session resolves to no agent.
    const selectedDefault = () => {
      const data = state.get()
      const configured = data.default ? selectable(data.agents.get(data.default)) : undefined
      return configured ?? selectable(data.agents.get(defaultID))
    }

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      withPermissions: (id, use) => state.withRead((data) => use(
        data.agents.get(id)?.permissions ?? [{ action: "*", resource: "*", effect: "deny" }],
      )),
      get: Effect.fn("AgentV2.get")(function* (id) {
        return state.get().agents.get(id)
      }),
      default: Effect.fn("AgentV2.default")(function* () {
        return selectedDefault()
      }),
      resolve: Effect.fn("AgentV2.resolve")(function* (id) {
        if (id !== undefined) return state.get().agents.get(ID.make(id))
        return selectedDefault()
      }),
      select: Effect.fn("AgentV2.select")(function* (id) {
        if (id !== undefined) {
          const selected = ID.make(id)
          return { id: selected, info: state.get().agents.get(selected) }
        }
        const info = selectedDefault()
        return { id: info?.id ?? defaultID, info }
```

## F116

`packages/core/src/plugin/README.md:24afcfd763b3a57d9de07ee4ccbe4691094be044` — lines 1–38.

```text
# Core plugin folder domains

Two domains share this folder: the plugin host and the built-in provider plugins.

## Purpose and ownership

- **plugin-host**: `sdk-runtime.ts`, `sdk-registry.ts`, `sdk-admission.ts`, `sdk-limits.ts`, `sdk-package.ts`, `sdk-reconcile.ts`, `host.ts`, `internal.ts`, `promise.ts`, `agent.ts`, `command.ts`, `command/`. It builds the context a plugin receives, serves the bundled `@orchestra/plugin` to external plugins, and installs the built-in agent and command plugins.
- **provider**: `provider/` (one file per provider), `provider.ts` (the ordered list of provider plugins), `models-dev.ts` (the models catalog plugin) and `variant.ts` (model variant generation).

## Public entry points and consumers

- Core exports `./plugin/host`, `./plugin/provider`, `./plugin/models-dev`, `./plugin/agent`, `./plugin/command`, `./plugin/promise` and one `./plugin/provider/<name>` per provider.
- Consumers: core itself (`packages/core/src/config/plugin/external.ts`, `packages/core/src/npm.ts`), `packages/tui` (`packages/tui/src/plugin/runtime.tsx`), `modules/app-dock` and `modules/maestro/coordination`.

## Dependencies and boundaries

- `@orchestra/plugin` is the public contract.
- `sdk-package.ts` turns every key of the `packages/plugin/package.json` `exports` map into generated shim files, so never edit the plugin `exports` without checking this folder.

## Assets, schemas and generated files

- Command prompts `packages/core/src/plugin/command/initialize.txt` and `packages/core/src/plugin/command/review.txt`.
- The SDK shim files are generated in memory from `packages/plugin/package.json`; nothing is checked in.

## Persistence, identity and lifetime

- `sdk-package.ts` writes SDK shim trees under the global cache `packages` directory, and `sdk-admission.ts` validates them byte for byte before reuse. Nothing else here persists.

## Commands

- `bun run test:ci core test/plugin/sdk-runtime.test.ts test/plugin/sdk-authority.test.ts`
- `bun run test:ci core test/plugin` runs every plugin test, including one per provider.
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- One provider file name is protected by `script/rename-ledger.ts`.
- The provider tests use fixtures; they do not call live provider APIs.
```

## F117

`packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — lines 12–141.

```typescript
export type HostInput = {
  readonly issuer: "app" | "core" | "sdk"
  readonly owner: Capability.Owner
  readonly invocation: Capability.InvocationRef
  readonly rootToolName: string
  readonly effectiveRules: PermissionV2.Ruleset
  readonly nativeDenyFloor: PermissionV2.Ruleset
}

export type ChildProof = Readonly<{
  callID: string
  parentCallID: string
  ordinal: number
  toolName: string
  requestHash: string
}>

export type Binding = HostInput & {
  readonly rootInvocation: Capability.InvocationRef
  readonly lineage: readonly ChildProof[]
}

const issued = Symbol("CapabilityInvocation.issued")
type Frame = Binding & { readonly [issued]: true }
const Current = Context.Reference<Frame | undefined>("@orchestra/core/CapabilityInvocation", {
  defaultValue: () => undefined,
})
const Input = Schema.Struct({
  issuer: Schema.Literals(["app", "core", "sdk"]),
  owner: Capability.Owner,
  invocation: Capability.InvocationRef,
  rootToolName: Schema.NonEmptyString,
  effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset,
})

/** Trusted host boundary only: validates caller claims, not persisted Session/tool-part existence. */
export function withContext<A, E, R>(
  input: HostInput,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Capability.Failure, R> {
  return Effect.suspend<A, E | Capability.Failure, R>(() => {
    // HostInput is decoded data; optional decoded fields may explicitly contain undefined.
    const decoded = Schema.decodeUnknownOption(Schema.toType(Input))(input)
    if (Option.isNone(decoded)) return Effect.fail(mismatch())
    const value = decoded.value
    if (value.owner.sessionID !== value.invocation.sessionID || value.owner.agentID !== value.invocation.agentID)
      return Effect.fail(mismatch())
    const invocation = Object.freeze({ ...value.invocation })
    const frame: Frame = Object.freeze({
      [issued]: true as const,
      issuer: value.issuer,
      owner: Object.freeze({ ...value.owner, location: Object.freeze({ ...value.owner.location }) }),
      invocation,
      rootInvocation: invocation,
      lineage: Object.freeze([]),
      rootToolName: value.rootToolName,
      effectiveRules: Object.freeze(value.effectiveRules.map((rule) => Object.freeze({ ...rule }))),
      nativeDenyFloor: Object.freeze(value.nativeDenyFloor.map((rule) => Object.freeze({ ...rule }))),
    })
    return Effect.provideService(effect, Current, frame)
  })
}

export function childID(invocation: Capability.InvocationRef, ordinal: number): string {
  return "child_" + createHash("sha256").update(JSON.stringify([
    invocation.sessionID, invocation.assistantMessageID, invocation.callID, ordinal,
  ])).digest("hex")
}

/** Trusted host boundary: extends an issued frame; SQL admission remains policy-owned. */
export function withChildContext<A, E, R>(
  parentContext: Tool.Context,
  proof: ChildProof,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Capability.Failure, R> {
  return Effect.gen(function* () {
    const current = yield* Current
    if (!current || current[issued] !== true || !proof || !matches(parentContext, current.invocation) ||
      proof.parentCallID !== current.invocation.callID || !Number.isSafeInteger(proof.ordinal) ||
      proof.ordinal < 1 || proof.ordinal > 64 || current.lineage.length >= 8 ||
      proof.callID !== childID(current.invocation, proof.ordinal) ||
      typeof proof.toolName !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(proof.toolName) ||
      typeof proof.requestHash !== "string" || !/^[0-9a-f]{64}(?![\s\S])/.test(proof.requestHash)) return yield* mismatch()
    const frame: Frame = Object.freeze({
      ...current,
      invocation: Object.freeze({ ...current.invocation, callID: proof.callID }),
      lineage: Object.freeze([...current.lineage, Object.freeze({
        callID: proof.callID, parentCallID: proof.parentCallID, ordinal: proof.ordinal,
        toolName: proof.toolName, requestHash: proof.requestHash,
      })]),
    })
    return yield* Effect.provideService(effect, Current, frame)
  })
}

/** Exact current invocation identity; public claims cannot manufacture a child frame. */
export const require = Effect.fn("CapabilityInvocation.require")(function* (
  context: Tool.Context,
  placement: { readonly projectID: Project.ID; readonly location: Location.Ref },
): Effect.fn.Return<Binding, Capability.Failure> {
  const frame = yield* Current
  if (frame === undefined)
    return yield* new Capability.Failure({
      code: "invocation_binding_missing",
      message: "Capability invocation binding is missing",
    })
  if (
    !frame ||
    frame[issued] !== true ||
    !matches(context, frame.invocation) ||
    placement.projectID !== frame.owner.projectID ||
    placement.location.directory !== frame.owner.location.directory ||
    placement.location.workspaceID !== frame.owner.location.workspaceID
  )
    return yield* mismatch()
  return frame
})

function matches(context: Tool.Context, invocation: Capability.InvocationRef) {
  return context.sessionID === invocation.sessionID && context.agent === invocation.agentID &&
    context.assistantMessageID === invocation.assistantMessageID && context.toolCallID === invocation.callID
}

function mismatch() {
  // Never echo caller-supplied identifiers, policy, or provider detail into wire failures.
  return new Capability.Failure({
    code: "invocation_binding_mismatch",
    message: "Capability invocation binding does not match",
  })
```

## F118

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 35–170.

```typescript
  const validate = Effect.fn("CapabilityPolicy.validate")(function* (binding: CapabilityInvocation.Binding) {
    const session = yield* sessions.get(binding.owner.sessionID)
    const stored = yield* sessions.message(binding.rootInvocation.assistantMessageID)
    if (
      !session ||
      session.id !== binding.owner.sessionID ||
      session.projectID !== binding.owner.projectID ||
      session.location.directory !== binding.owner.location.directory ||
      session.location.workspaceID !== binding.owner.location.workspaceID ||
      !stored ||
      stored.sessionID !== binding.rootInvocation.sessionID ||
      stored.message.id !== binding.rootInvocation.assistantMessageID ||
      stored.message.type !== "assistant" ||
      stored.message.agent !== binding.rootInvocation.agentID ||
      !stored.message.content.some(
        (part) =>
          part.type === "tool" &&
          part.id === binding.rootInvocation.callID &&
          part.name === binding.rootToolName &&
          (part.state.status === "pending" || part.state.status === "running"),
      )
    )
      return yield* mismatch()
    if (binding.lineage.length > 8) return yield* mismatch()
    yield* Effect.forEach(binding.lineage, (proof, index) => Effect.gen(function* () {
      const parentCallID = index === 0 ? binding.rootInvocation.callID : binding.lineage[index - 1]?.callID
      const row = yield* database.db.select().from(CapabilityChildTable)
        .where(eq(CapabilityChildTable.id, proof.callID)).get().pipe(
          Effect.catchIf((error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError,
            () => Effect.fail(mismatch())),
        )
      if (!row || proof.parentCallID !== parentCallID || !Number.isSafeInteger(proof.ordinal) ||
        proof.ordinal < 1 || proof.ordinal > 64 || proof.callID !== CapabilityInvocation.childID({
          ...binding.rootInvocation, callID: proof.parentCallID,
        }, proof.ordinal) || row.id !== proof.callID || row.session_id !== binding.owner.sessionID ||
        row.agent_id !== binding.owner.agentID || row.assistant_message_id !== binding.rootInvocation.assistantMessageID ||
        row.root_call_id !== binding.rootInvocation.callID || row.root_tool_name !== binding.rootToolName ||
        row.parent_call_id !== proof.parentCallID || row.ordinal !== proof.ordinal || row.depth !== index + 1 ||
        row.tool_name !== proof.toolName || row.request_hash !== proof.requestHash || row.state !== "running")
        return yield* mismatch()
    }), { discard: true })
    if (binding.invocation.callID !== (binding.lineage.at(-1)?.callID ?? binding.rootInvocation.callID))
      return yield* mismatch()
  })

  const getBinding = Effect.fn("CapabilityPolicy.binding")(function* (
    context: Tool.Context,
  ): Effect.fn.Return<CapabilityInvocation.Binding, Capability.Failure> {
    const binding = yield* CapabilityInvocation.require(context, {
      projectID: location.project.id,
      location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
    })
    yield* validate(binding)
    return binding
  })

  const authorize = Effect.fn("CapabilityPolicy.authorize")(function* (
    context: Tool.Context,
    input: { action: string; resources: readonly string[] },
  ): Effect.fn.Return<Permit, Capability.Failure> {
    const binding = yield* getBinding(context)
    if (
      !input.action.trim() ||
      input.action !== input.action.trim() ||
      input.resources.length === 0 ||
      input.resources.some((resource) => !resource.trim())
    )
      return yield* denied()

    // Native floor is restrict-only: later allow/ask rules cannot erase any captured deny.
    const floor = binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")
    const effects = input.resources.map((resource) => {
      if (PermissionV2.evaluate(input.action, resource, floor).effect === "deny") return "deny"
      return PermissionV2.evaluate(input.action, resource, binding.effectiveRules).effect
    })
    if (effects.includes("deny")) return yield* denied()
    const request = {
      sessionID: binding.invocation.sessionID,
      agent: binding.invocation.agentID,
      action: input.action,
      resources: [...input.resources],
      source: { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID },
    }
    yield* Effect.gen(function* () {
      yield* effects.includes("ask") ? permissions.askExplicit(request) : permissions.authorize(request)
      yield* validate(binding)
      // Authorization covers either path; a current configured deny still revokes it.
      if ((yield* permissions.evaluate(request)) === "deny") return yield* denied()
    }).pipe(
      Effect.catchTags({
        "PermissionV2.BlockedError": () => Effect.fail(denied()),
        "PermissionV2.CorrectedError": () => Effect.fail(denied()),
        "PermissionV2.DeclinedError": () => Effect.fail(denied()),
        "Session.NotFoundError": () => Effect.fail(mismatch()),
      }),
    )
    yield* validate(binding)
    const permit = Object.freeze({
      [approved]: true as const,
      context: Object.freeze({ ...context }), binding,
      action: request.action, resources: Object.freeze([...request.resources]),
    })
    permits.add(permit)
    return permit
  })

  const commitMany = <A, E, R>(supplied: readonly Permit[], write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const pending = [...supplied]
      const permit = pending[0]
      if (!permit || pending.length > 16 || pending.some((item) => !item || item[approved] !== true ||
        !permits.has(item) || item.binding !== permit.binding)) return yield* mismatch()
      if (!database.inTransaction) return yield* Effect.die("Capability commit requires SQL transaction identity")
      if (yield* database.inTransaction) return yield* mismatch()
      // Lock ordering is actor state -> SQLite writer. Approval never happens under either lock.
      return yield* agents.withPermissions(permit.context.agent, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* CapabilityInvocation.require(permit.context, {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
        })
        if (current !== permit.binding) return yield* mismatch()
        yield* validate(current)
        yield* Effect.forEach(pending, (item) => Effect.gen(function* () {
          const request = { sessionID: item.context.sessionID, agent: item.context.agent,
            action: item.action, resources: [...item.resources] }
          if ((yield* permissions.evaluate(request).pipe(
            Effect.catchTag("Session.NotFoundError", () => Effect.fail(mismatch())),
          )) === "deny") return yield* denied()
        }))
        return yield* write(tx)
      }), { behavior: "immediate" }))
    })

  return { binding: getBinding, authorize, commitMany, commit: <A, E, R>(permit: Permit, write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    commitMany([permit], write), assert: (context: Tool.Context, input: { action: string; resources: readonly string[] }) =>
    authorize(context, input).pipe(Effect.asVoid) }
```

## F119

`packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e` — lines 36–68.

```typescript
// Stable canonical leaves are registered once per Location. Account resolution and vendor I/O stay first-use.
export const node = makeLocationNode({
  name: "capability/tools",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const tools = yield* Tools.Service
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const location = yield* Location.Service
    const registry = yield* CapabilityProcessRegistry.Service
    // Startup-only evidence: rows this host never held are lost. A sweep failure must not block the Location.
    yield* CapabilityProcessSweep.run({ jobs, live: registry.live(), startedAt: registry.startedAt,
      placement: { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.logWarning("process sweep failed", { cause })))
    const processControl = yield* CapabilityProcessControl.make({ jobs })
    const schedule = yield* CapabilitySchedule.make()
    const artifacts = yield* CapabilityArtifacts.make()
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts })
    const media = yield* CapabilityMedia.make()
    const documents = yield* CapabilityDocuments.make()
    const sheets = yield* CapabilitySheets.make()
    const transport = CapabilityMcp.make()
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((catalog) => CapabilityServiceProviders.filterCatalog(selection.connection.provider, catalog)),
    ) } })
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts,
      filterCatalog: CapabilityServiceProviders.filterCatalog })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* tools.register({ ...channels.tools, ...media.tools, ...documents, ...sheets, ...services.tools, ...processControl.tools, ...schedule.tools }).pipe(Effect.orDie)
  }).pipe(Effect.orDie)),
  deps: [ToolRegistry.node, EventV2.node, AgentV2.node, Credential.node, Database.node, Location.node,
    PermissionV2.node, SessionStore.node, Global.node, FSUtil.node,
    CapabilityProcessRegistry.node, LocationMutation.node, AppProcess.node, ScheduledTaskPort.node],
```

## F120

`packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c` — lines 7–40.

```typescript
// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
export const node = makeGlobalNode({
  service: Service,
  layer: Layer.succeed(Service, Service.of({
    create: (owner, input) => Effect.flatMap(current, (api) => api.create(owner, input)),
    list: (owner) => Effect.flatMap(current, (api) => api.list(owner)),
    placed: (placement) => Effect.flatMap(current, (api) => api.placed(placement)),
    get: (owner, id) => Effect.flatMap(current, (api) => api.get(owner, id)),
    update: (owner, id, input) => Effect.flatMap(current, (api) => api.update(owner, id, input)),
    pause: (owner, id) => Effect.flatMap(current, (api) => api.pause(owner, id)),
    resume: (owner, id) => Effect.flatMap(current, (api) => api.resume(owner, id)),
    remove: (owner, id) => Effect.flatMap(current, (api) => api.remove(owner, id)),
    run: (owner, id, key) => Effect.flatMap(current, (api) => api.run(owner, id, key)),
  })),
  deps: [],
```

## F121

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 3–9.

```text
`CapabilityMcp.make(options?)` is a synchronous, host-only factory. Its only public
operations are `listTools(selection)` and scoped `open(selection)`. A session exposes
`listTools` and `callTool(name, input)`. No model tool, executor, permission decision,
schema compiler, credential lookup, account selection, or durable replay lives here.
The caller supplies an approved Connection resolution and its exact credential.
`selection.endpoint` is that Connection's scoped endpoint; target resource data and
credential metadata cannot change its URL or authorization.
```

## F122

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 29–37.

```text
Initialization offers 2025-11-25; 2025-03-26 and 2025-06-18 are also accepted.
Tools capability is required. Each POST accepts JSON and SSE and uses one exact
JSON-RPC ID; batches fail. SSE needs a blank-line event delimiter: EOF does not
dispatch a truncated event. Duplicate correlated responses completed within the same
acquired chunk fail; arbitrary later-chunk duplicates are not detected after reader cancellation.
Initialized notifications and replies to server requests
require empty HTTP 202 acknowledgements. Sampling, elicitation and other unsupported
server methods receive `-32601`; ping receives an empty result. No server request
executes a model, approval, filesystem access, or tool.
```

## F123

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 43–126.

```text
## Bounds and lifecycle

Defaults: 4 MiB aggregate catalog envelopes (including initialization and all read
SSE framing/notifications), 256 tools, 16 pages, 4 MiB call response envelopes,
256 KiB encoded requests, 30 seconds total acquisition/call, four scoped sessions
per factory, 512 generation identities, and 64 JSON-RPC SSE messages per acquisition
or call. UTF-8 bytes are counted before decoding/buffering/parsing. JSON nesting
is bounded at 64, cursor bytes at 4096, session IDs at 256 visible ASCII characters,
tool names at 256 characters, descriptions at 2048, and credential headers at 16384.
Positive integer options are required; timeout must fit a native timer.
Incoming HTTP headers are subject to native fetch's bounds, not a custom aggregate
header-byte quota. Only the assigned session-ID value has the transport's explicit header bound.

Catalog acquisition returns complete coverage only after the terminal page.
Duplicates, cursor cycles and all exhausted budgets fail. `byteLength` measures
response body bytes, including full envelopes and read SSE framing, not HTTP header
or compressed wire bytes. SSE acquisition ends at the correlated response and cancels
its reader; later unsolicited traffic is not read or included. Repeat session lists
include the original initialization byte cost in their catalog budget.

Generations increase monotonically within a factory. Keys bind Connection/Target
references and generations, owner and approved endpoint; values hash all sorted raw
tools, including schemas, descriptions and metadata. Identical catalogs reuse their
generation. A full identity map fails closed rather than evicting and reusing history.
Create one host factory for the required generation lifetime; generations are not
persisted or deterministic across host restarts: numeric generations depend on each
factory's acquisition order. Credential rotation always requires an explicit new
open; sessions are never shared or pooled.

Sessions retain headers only in their own scoped connection. Failed opens immediately
close their child scope and release permits; closing a successful scope invalidates
the session, aborts and joins active native fetch/reader tasks, then attempts DELETE when assigned and credentials
remain unexpired. Expiry is checked again before every outbound POST. DELETE is best effort, byte bounded,
and limited to the lesser of one second and the configured timeout. Interruption and
unexpected defects remain Effect causes. Expected errors contain only fixed transport
reasons, never endpoint, credentials, session ID or vendor body. Failed child scopes
detach from their parent rather than retaining cleanup entries until parent close.
Terminal operation failure/interruption closes its dead child immediately, even if
the caller catches the cause inside a live parent scope. Healthy sessions stay scoped.
Permits are released after task settlement and bounded DELETE. The explicit async
interruption finalizer joins JS `finally`; beta83 `tryPromise` alone does not.
Disposal is masked and single-flight. All failed operations and the parent finalizer
join the same completion latch, which includes cleanup defects. A separate removable
parent attachment stays open while the resource scope's finalizers run: beta83 marks
that resource scope `Closed` before finalization finishes. Owner detachment skips its
own disposal callback, avoiding a self-join; completion is published only after resource
cleanup and the detachment phase.
Call arguments are descriptor-checked, byte-bounded detached JSON captured at each
Effect execution before serial permit wait. Inert `toJSON` data survives; callable
serializers, accessors, cycles and custom object/array prototypes are not executed.

## Deliberate limits and caller responsibilities

- POST Streamable HTTP only: no GET listener, reconnection, resumability, retry,
  legacy SSE/stdio fallback, OAuth refresh/discovery, tasks, roots or sampling.
- A disconnect before a response fails. HTTP 404 invalidates the current session;
  a later explicit host operation can open a new one. A call is never reposted.
- Aborting local fetch or deleting a session does not prove a remote mutation was
  cancelled. Callers must retain durable intent and reconcile ambiguous failures;
  post-dispatch loss without a definitive correlated result/error reports
  `outcome_unknown`, including disconnect, body loss, malformed results, ambiguous
  HTTP errors and timeout. Definitive HTTP 401/403/404 and correlated protocol
  errors retain typed failures. Interruption retains its Effect cause and still
  requires reconciliation; neither abort nor DELETE proves remote nonexecution.
- Input/output schemas and descriptions are preserved. Boolean schemas are accepted
  for the existing local validator, despite the 2025-11-25 tools specification's
  object-only input-schema wording. Schemas are not compiled or default dialects
  rewritten. Object-form schemas require root `type: "object"`, with string `$schema`,
  object `properties` and string-array `required` when present. Immediate property-map
  values must be schema objects or the documented native boolean-schema extension;
  these values are not recursively compiled or rewritten. Unknown JSON keywords
  stay exact. Call arguments must be objects; structured content must be an object.
- Discovery fails `unsupported_operation` for task-required tools because this
  synchronous interface cannot invoke them correctly. Task-optional tools can be
  called normally; execution metadata still participates in the generation hash.
- Returned content remains untrusted vendor data. Callers enforce captured registry,
  permission policy, input/output validation, disclosure and durable replay.
- Wire checks validate required fields and optional metadata, annotations and icon
  field shapes. They do not validate URI syntax, ISO timestamps, MIME registries or
  base64 payloads, fetch referenced resources/icons, or validate vendor JSON Schemas.
  Unknown JSON extension fields remain opaque. Embedded resource content follows
  the official anyOf: at least one string text/blob representation, including both
  strings. The opposite field is an allowed extension, not an invented XOR constraint.
- Tests use real localhost HTTP through fetch. They do not qualify live providers.
```

## F124

`docs/guides/artifacts-and-processes.md:b9e9c90310318f99a1efaa3ae2952026796364c4` — lines 7–31.

```text
Artifacts are files an agent attaches to a session, such as an image, a PDF or a spreadsheet. The **Artifacts** toggle in the session header and the **Artifacts** tab appear only once the session has at least one artifact.

### Reading one

Open the tab and pick an artifact from the list. The detail shows its kind (**Image**, **Video**, **PDF**, **Spreadsheet** or **File**), its size and its revision as **rev N**. Images, video and PDFs preview in place. A spreadsheet previews its first rows only (**Showing the first {rows} rows.**); download it for the rest. Other files say **This file has no inline preview.** **Load more** continues a long list.

An artifact marked **Not verified** was seen or acknowledged by the agent, but nothing checked its content against your request. Look at it yourself before you rely on it.

### Actions

| Button | What it does |
| --- | --- |
| **Download** | Saves the file to your computer. |
| **Pin** / **Unpin** | Marks the artifact **Pinned**. Unpin it before you remove it. |
| **Share** | Sends the artifact to other sessions in the same location. |
| **Remove** | Takes it out of this session. |
| **Retry** / **Cancel** | Repeat or abandon an action that is pending or failed. |

**Share** opens **Share artifact**. Choose the sessions and confirm with **Share**. If the location has no other session, the dialog says **This location has no other sessions.**

**Remove** asks **Remove from this session?**. The artifact leaves this session only; sessions it was shared with keep their copy. If the server refuses, the page says **The server refused the change. Unpin the artifact before removing it.**

### When an action fails

The message says what went wrong: **This session is not allowed to change that artifact.**, **The server sent a reply this app could not read.**, or **The request failed. Check the connection and try again.** The last kind is **The change may have been saved. Retry to confirm it.** Choose **Retry**: when the server already has the change, the page reports **Original request reused.** instead of applying it twice.
```

## F125

`docs/guides/artifacts-and-processes.md:b9e9c90310318f99a1efaa3ae2952026796364c4` — lines 33–51.

```text
## Background processes

When an agent starts something it does not wait for, such as a server or a long job, the session header shows a pill with the count, for example **2 running**. Its title is **Background processes**. Open it to see each process and its state.

The list shows the latest status the agent observed, not live state. The pill says so: **Latest status the agent observed, not live state.** A process can have ended since. Ask the agent to check, or look at the process yourself, before relying on it.

States you may see:

| State | Meaning |
| --- | --- |
| **Starting**, **Submitting**, **Submitted** | The agent is starting it. |
| **Running** | Last seen running. |
| **Completed**, **Failed**, **Cancelled** | It ended. |
| **Stopping** | The agent asked it to stop. |
| **Unknown**, **Lost** | The agent can no longer see it. |

## Limits

- The panel has no button to stop a process. Ask the agent to stop it, or stop it on the machine where it runs.
```

## F126

`packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca` — lines 49–85.

```typescript
export const make = Effect.fn("Actions.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  transport?: ActionsContract.Transport
}) {
  const config = { ...input }
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const transport = config.transport ?? (yield* ActionsTransport.make({ directory: config.directory }))
  const lifetime = yield* Scope.Scope
  const database = yield* Database.Service
  const operations = yield* Effect.cached(ActionsOperations.make(config).pipe(
    Effect.provideService(Database.Service, database), Scope.provide(lifetime),
  ))
  const github = ActionsGitHubRead.make({ transport })
  const gitlab = ActionsGitLabRead.make({ transport })
  const reader = (binding: Actions.Binding) => binding.provider.kind === "github" ? github : gitlab
  const resources = ActionsResources.make({ transport, reader, directory: config.directory, proc })
  const output = (binding: Actions.Binding) => Effect.promise(() => import("./actions/output/index")).pipe(
    Effect.map(({ ActionsOutput }) => ActionsOutput.make({ transport, reader: reader(binding) })),
  )

  // Actions is Location-scoped, but a non-Git Location must still boot other services.
  // Resolve repository state only when an Actions method is requested.
  const store = () => ActionsBinding.make({ ...config, resolve: transport.resolve }).pipe(
    Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, proc),
  )
  const bindings: ActionsContract.Bindings = {
    list: () => store().pipe(Effect.flatMap((bindings) => bindings.list())),
    create: (input) => store().pipe(Effect.flatMap((bindings) => bindings.create(input))),
    update: (id, input) => store().pipe(Effect.flatMap((bindings) => bindings.update(id, input))),
    remove: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.remove(ref))),
    get: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.get(ref))),
    policy: (ref) => store().pipe(Effect.flatMap((bindings) => bindings.policy(ref))),
    updatePolicy: (ref, policy) => store().pipe(Effect.flatMap((bindings) => bindings.updatePolicy(ref, policy))),
```

## F127

`packages/core/src/actions.ts:4f81df84763bd63e7680de8fd40c60b583ef68ca` — lines 171–216.

```typescript
    execute: Effect.fn("Actions.execute")(function* (ref, kind, input, target) {
      const selected = { ...ref }
      const submission = structuredClone(input)
      const expected = { ...target }
      const binding = yield* bindings.get(selected)
      const transient = { output: undefined as Actions.CommandOutput | undefined }
      const service = yield* operations
      const operation = yield* service.execute(binding, submission, (intent, payload) => Effect.gen(function* () {
        if (intent.kind !== kind || (["workflowID", "runID", "jobID", "resourceID", "resourceKind", "scope", "path", "ref"] as const)
          .some((key) => expected[key] !== undefined && intent.target[key] !== expected[key]))
          return yield* new ActionsError({ kind: "intent_conflict", message: "Command endpoint differs from the admitted native target", disposition: "definitely_unsent" })
        const result: ActionsContract.CommandResult = yield* Effect.gen(function* () {
          if (intent.kind.startsWith("source.")) {
            const { ActionsAuthoring } = yield* Effect.promise(() => import("./actions/authoring/index"))
            return yield* ActionsAuthoring.make({ transport, reader: reader(binding) }).perform(binding, intent, payload)
          }
          if (intent.target.resourceKind) return yield* resources.perform(binding, intent, payload)
          if (binding.provider.kind === "github") {
            const { ActionsGitHubCommands } = yield* Effect.promise(() => import("./actions/github/commands"))
            return yield* ActionsGitHubCommands.make({ transport, reader: github }).perform(binding, intent, payload)
          }
          const { ActionsGitLabCommands } = yield* Effect.promise(() => import("./actions/gitlab/commands"))
          return yield* ActionsGitLabCommands.make({ transport, reader: gitlab }).perform(binding, intent, payload)
        })
        transient.output = result.output === undefined ? undefined : yield* Schema.decodeUnknownEffect(Schema.toType(Actions.CommandOutput), {
          onExcessProperty: "error",
        })(result.output).pipe(Effect.mapError(() => new ActionsError({
          kind: "outcome_unknown", message: "Native command returned an invalid one-time output",
        })))
        return result.acknowledgement
      }))
      return { operation, ...(transient.output === undefined ? {} : { output: transient.output }) }
    }),
  } satisfies Interface
})

const layer = Layer.effect(Service, Effect.gen(function* () {
  const location = yield* Location.Service
  const global = yield* Global.Service
  return yield* make({ directory: location.directory, workspaceID: location.workspaceID,
    projectID: location.project.id, stateDirectory: global.data })
}).pipe(Effect.orDie))

export const node = makeLocationNode({
  service: Service, layer, deps: [Location.node, Global.node, FSUtil.node, AppProcess.node, Database.node],
})
```

## F128

`packages/core/src/actions/contract.ts:62521cbd3f4860049c3480a2bf9f2ed650c6c9f8` — lines 8–88.

```typescript
export type Request = {
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  readonly path: string
  readonly query?: Readonly<Record<string, string | number | boolean>>
  readonly body?: Json
}
export type Response = { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly data: Json }
export type BindingIdentity = { readonly projectID: string; readonly projectPath: string; readonly account: string }
export type BindingResolver = (provider: Actions.Provider, projectPath: string) => Effect.Effect<BindingIdentity, ActionsError>
export type CommandResult = { readonly acknowledgement: Actions.OperationAcknowledgement; readonly output?: Actions.CommandOutput }
export type RawResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Stream.Stream<Uint8Array, ActionsError>
  readonly close: Effect.Effect<void>
}
export type BoundRequest = Request & { readonly method: "GET"; readonly body?: never }

export interface Transport {
  readonly resolve: BindingResolver
  readonly request: (binding: Actions.Binding, input: Request) => Effect.Effect<Response, ActionsError>
  readonly bytes: (binding: Actions.Binding, input: Request) => Stream.Stream<Uint8Array, ActionsError>
  readonly open?: (binding: Actions.Binding, input: BoundRequest) => Effect.Effect<RawResponse, ActionsError, Scope.Scope>
  readonly upload: (
    binding: Actions.Binding,
    input: Request,
    file: { readonly filename: string; readonly bytes: Stream.Stream<Uint8Array, ActionsError> },
  ) => Effect.Effect<Response, ActionsError>
}

export interface Bindings {
  readonly list: () => Effect.Effect<Actions.Binding[], ActionsError>
  readonly create: (input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly update: (id: Actions.BindingID, input: Actions.BindingInput) => Effect.Effect<Actions.Binding, ActionsError>
  readonly remove: (input: Actions.BindingRef) => Effect.Effect<void, ActionsError>
  readonly get: (input: Actions.BindingRef) => Effect.Effect<Actions.Binding, ActionsError>
  readonly policy: (input: Actions.BindingRef) => Effect.Effect<Actions.PolicyState, ActionsError>
  readonly updatePolicy: (input: Actions.BindingRef, policy: Actions.Policy) => Effect.Effect<Actions.PolicyState, ActionsError>
}

export interface Adapter {
  readonly capabilities: (binding: Actions.Binding) => Effect.Effect<Actions.Capability[], ActionsError>
  readonly workflows: (binding: Actions.Binding, input: Actions.ListInput) => Effect.Effect<Actions.WorkflowPage, ActionsError>
  readonly source: (binding: Actions.Binding, input: { readonly path: string; readonly ref: string }) => Effect.Effect<Actions.Source, ActionsError>
  readonly runs: (binding: Actions.Binding, input: Actions.RunListInput) => Effect.Effect<Actions.RunPage, ActionsError>
  readonly run: (binding: Actions.Binding, id: string) => Effect.Effect<Actions.Run, ActionsError>
  readonly jobs: (binding: Actions.Binding, input: { readonly runID: string; readonly attempt?: number; readonly cursor?: string }) => Effect.Effect<Actions.JobPage, ActionsError>
  readonly resources: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, input: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    intent: Actions.OperationIntent,
    acknowledgement?: Actions.OperationAcknowledgement,
  ) => Effect.Effect<Actions.OperationObservation, ActionsError>
  readonly transfer: (binding: Actions.Binding, input: Actions.TransferInput) => Stream.Stream<Uint8Array, ActionsError>
}

export interface Operations {
  readonly prepare: (binding: Actions.Binding, input: Actions.OperationIntent) => Effect.Effect<Actions.Operation, ActionsError>
  readonly execute: (
    binding: Actions.Binding,
    input: Actions.ExecuteInput,
    perform: (intent: Actions.OperationIntent, payload: Json) => Effect.Effect<Actions.OperationAcknowledgement, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
  readonly get: (binding: Actions.Binding, id: Actions.OperationID) => Effect.Effect<Actions.Operation, ActionsError>
  readonly reconcile: (
    binding: Actions.Binding,
    id: Actions.OperationID,
    observe: (intent: Actions.OperationIntent, acknowledgement?: Actions.OperationAcknowledgement) => Effect.Effect<Actions.OperationObservation, ActionsError>,
  ) => Effect.Effect<Actions.Operation, ActionsError>
}

export type ReadAdapter = Pick<Adapter, "capabilities" | "workflows" | "source" | "runs" | "run" | "jobs">
export interface Commands {
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}

export interface ResourceDomain {
  readonly list: (binding: Actions.Binding, input: Actions.ResourceListInput) => Effect.Effect<Actions.ResourcePage, ActionsError>
  readonly perform: (binding: Actions.Binding, intent: Actions.OperationIntent, payload: Json) => Effect.Effect<CommandResult, ActionsError>
}
```

## F129

`packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — lines 16–203.

```typescript
export const make = Effect.fn("ActionsOperations.make")(function* (locationInput: {
  readonly directory: string
  readonly workspaceID?: string
  readonly projectID: string
}) {
  const input = { ...locationInput }
  const database = yield* Database.Service
  if (!path.isAbsolute(input.directory) || !input.projectID)
    return yield* Effect.fail(error("invalid_input", "Actions operations require a trusted absolute Location and project"))
  const directory = yield* Effect.tryPromise({
    try: () => realpath(input.directory),
    catch: () => error("invalid_input", "Actions operation Location is unavailable"),
  })
  const location = JSON.stringify([input.projectID, directory, input.workspaceID ?? null])
  yield* recover(database.db)
  const disposed = yield* Deferred.make<void>()
  const lifetime = { closed: false, requests: new Set<Fiber.Fiber<unknown, unknown>>() }
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    lifetime.closed = true
    const requests = Array.from(lifetime.requests)
    yield* Deferred.succeed(disposed, undefined)
    yield* Fiber.awaitAll(requests)
  }).pipe(Effect.uninterruptible))

  const validate = (binding: Actions.Binding) => {
    if (lifetime.closed) return error("binding_missing", "Actions operation Location was disposed")
    if (binding.directory !== directory || binding.workspaceID !== input.workspaceID)
      return error("host_mismatch", "Actions binding does not belong to this Location")
    if (!binding.account?.trim()) return error("not_authenticated", "Actions operations require a signed-in provider account")
  }

  const get: ActionsContract.Operations["get"] = Effect.fn("ActionsOperations.get")(function* (bindingInput, id) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    const row = yield* find(database.db, id)
    const denied = access(row, location, binding, id)
    if (denied) return yield* Effect.fail(denied)
    if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
    const expired = unavailable(row, yield* Clock.currentTimeMillis)
    if (expired) return yield* Effect.fail(expired)
    return receipt(row)
  })

  const prepare: ActionsContract.Operations["prepare"] = Effect.fn("ActionsOperations.prepare")(function* (bindingInput, raw) {
    const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
    const invalid = validate(binding)
    if (invalid) return yield* Effect.fail(invalid)
    // Strict decoding rejects extras before encoding elides optional undefined
    // keys. Decode the encoded DTO again to preserve branded identity types.
    const decoded = yield* Schema.decodeUnknownEffect(Schema.toType(Actions.OperationIntent), { onExcessProperty: "error" })(raw).pipe(
      Effect.map((value) => Schema.decodeUnknownSync(Actions.OperationIntent)(Schema.encodeSync(Actions.OperationIntent)(value))),
      Effect.mapError(() => error("invalid_input", "Actions operation intent is invalid")),
    )
    if (decoded.binding.id !== binding.id || decoded.binding.revision !== binding.revision)
      return yield* Effect.fail(error("binding_stale", "Actions operation intent binding changed"))
    // Maintenance commits independently so a refused expired retry still leaves
    // a compact, non-executable tombstone rather than rolling cleanup back.
    yield* safe(database.db.transaction((tx) => Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) => sweep(tx, now)),
    ), { behavior: "immediate" }))
    return yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const existing = yield* tx.select().from(ActionsOperationTable).where(and(
        eq(ActionsOperationTable.location_key, location), eq(ActionsOperationTable.binding_id, binding.id),
        eq(ActionsOperationTable.client_id, decoded.clientID),
      )).get()
      if (existing) {
        if (!matches(existing, binding) || !equivalent(intent(existing), decoded))
          return yield* Effect.fail(error("intent_conflict", "Actions logical intent was already bound to another command", existing.id))
        const expired = unavailable(existing, now)
        if (expired) return yield* Effect.fail(expired)
        return receipt(existing)
      }
      const ledger = yield* tx.select({ total: count() }).from(ActionsOperationTable).get()
      if (!ledger || ledger.total >= LEDGER_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions admission ledger requires maintenance"))
      const unknown = yield* tx.select({ total: count() }).from(ActionsOperationTable)
        .where(eq(ActionsOperationTable.state, "outcome_unknown")).get()
      if (!unknown || unknown.total >= UNKNOWN_LIMIT)
        return yield* Effect.fail(error("maintenance_required", "Actions unknown outcome storage requires maintenance"))
      const inserted = yield* tx.insert(ActionsOperationTable).values({
        id: Actions.OperationID.create(),
        location_key: location,
        project_id: input.projectID,
        directory,
        workspace_id: input.workspaceID,
        binding_id: binding.id,
        binding_revision: binding.revision,
        provider_kind: binding.provider.kind,
        provider_hostname: binding.provider.hostname,
        provider_api_origin: binding.provider.apiOrigin,
        provider_project_id: binding.projectID,
        actor: binding.account ?? "",
        client_id: decoded.clientID,
        kind: decoded.kind,
        target: decoded.target,
        expected: decoded.expected,
        state: "prepared",
        time_created: now,
        time_expires: now + LEASE,
        time_updated: now,
      }).returning().get()
      if (!inserted) return yield* Effect.fail(error("maintenance_required", "Actions operation admission could not be stored"))
      return receipt(inserted)
    }), { behavior: "immediate" }))
  })

  const execute: ActionsContract.Operations["execute"] = Effect.fn("ActionsOperations.execute")((bindingInput, submission, perform) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, submission.id)
      const denied = access(row, location, binding, submission.id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", submission.id))
      const now = yield* Clock.currentTimeMillis
      const expired = unavailable(row, now)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "prepared") return receipt(row)

      // Register before the durable claim so disposal cannot race the CAS/cleanup
      // handoff. This fiber remains the caller's request, never a shared worker.
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
        const claimed = yield* safe(database.db.transaction((tx) => Effect.gen(function* () {
          if (lifetime.closed) return yield* Effect.fail(error("binding_missing", "Actions operation Location was disposed"))
          // Sample time after acquiring SQLite's write reservation, not before
          // waiting for it. A lease may expire while the request waits to claim.
          const claimTime = yield* Clock.currentTimeMillis
          return yield* tx.update(ActionsOperationTable).set({ state: "sending", time_updated: claimTime })
            .where(and(
              eq(ActionsOperationTable.id, row.id), eq(ActionsOperationTable.location_key, location),
              eq(ActionsOperationTable.binding_id, binding.id), eq(ActionsOperationTable.binding_revision, binding.revision),
              eq(ActionsOperationTable.actor, row.actor), eq(ActionsOperationTable.state, "prepared"),
              gt(ActionsOperationTable.time_expires, claimTime),
            )).returning().get()
        }), { behavior: "immediate" }))
        if (!claimed) return yield* get(binding, row.id)
        yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : perform(intent(claimed), submission.input)).pipe(
          Effect.flatMap(checkedAcknowledgement),
          Effect.scoped,
          Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => Cause.hasInterrupts(cause)
            ? Effect.interrupt
            : Effect.fail(definitive(cause) ?? error("outcome_unknown", "Actions provider outcome was not established", row.id))),
        )).pipe(Effect.onExit((exit) => finalize(database.db, row.id, exit)))
        return yield* get(binding, row.id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  const reconcile: ActionsContract.Operations["reconcile"] = Effect.fn("ActionsOperations.reconcile")((bindingInput, id, observe) =>
    Effect.uninterruptibleMask((restore) => Effect.withFiber((fiber) => Effect.gen(function* () {
      const binding = { ...bindingInput, provider: { ...bindingInput.provider } }
      const invalid = validate(binding)
      if (invalid) return yield* Effect.fail(invalid)
      const row = yield* find(database.db, id)
      const denied = access(row, location, binding, id)
      if (denied) return yield* Effect.fail(denied)
      if (!row) return yield* Effect.fail(error("operation_missing", "Actions operation does not exist", id))
      const expired = unavailable(row, yield* Clock.currentTimeMillis)
      if (expired) return yield* Effect.fail(expired)
      if (row.state !== "accepted" && row.state !== "outcome_unknown") return receipt(row)
      lifetime.requests.add(fiber)
      return yield* Effect.gen(function* () {
        const observation = yield* restore(Effect.suspend(() => lifetime.closed ? Effect.interrupt : observe(
          structuredClone(intent(row)), row.result == null ? undefined : structuredClone(row.result),
        )).pipe(
          Effect.flatMap(checkedObservation), Effect.scoped, Effect.timeout(DEADLINE),
          Effect.raceFirst(Deferred.await(disposed).pipe(Effect.andThen(Effect.interrupt))),
          Effect.catchCause((cause) => {
            if (Cause.hasInterrupts(cause)) return Effect.interrupt
            const failure = Cause.findErrorOption(cause)
            return Effect.fail(Option.isSome(failure) && failure.value instanceof ActionsError
              ? failure.value : error("transport_failed", "Actions operation observation failed", id))
          }),
        ))
        const observed = yield* update(database.db, row, observation)
        return observed ? receipt(observed) : yield* get(binding, id)
      }).pipe(Effect.ensuring(Effect.sync(() => lifetime.requests.delete(fiber))))
    }))),
  )

  return { prepare, execute, get, reconcile } satisfies ActionsContract.Operations
```

## F130

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 23–32.

```typescript
// A running claim older than this belongs to a process that stopped mid-dispatch. Dispatch is a few local
// writes, so a live process settles long before.
export const LEASE = 120_000
export const TICK = Duration.seconds(15)
const TICK_MILLIS = Duration.toMillis(TICK)
// The daemon never sleeps longer than this while something is scheduled, so a clock that jumped or a machine that
// slept is noticed within a minute.
const SLEEP_LIMIT = 60_000
// Settled runs kept per task. Only the latest is shown; a slot can no longer run once the task moved past it.
const KEEP = 20
```

## F131

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 121–244.

```typescript
    // claimed when no run holds it. `extra` (Run now) claims an extra run whenever the slot is not claimed.
    const begin = (id: ID, now: number, input: { directory?: AbsolutePath; extra: boolean }) =>
      immediate(
        Effect.gen(function* () {
          const task = yield* find(id, input.directory)
          if (!task) return { type: "missing" } as const
          if (task.policy === "capability") return yield* cap.plan(task, now)
          if (!legacy(task)) return { type: "idle" } as const
          const due = ScheduledTaskModel.plan(timing(task), now)
          if (due.type === "skip") yield* write(task, ScheduledTaskModel.skipRun(timing(task), due.slot, now), now)
          if (due.type === "run") {
            const held = yield* db
              .select({ state: ScheduledTaskRunTable.state })
              .from(ScheduledTaskRunTable)
              .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.slot, due.slot)))
              .get()
            if (!held) return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
            // A settled run of the slot the task points at means the slot was served before (the task was set
            // back to it); move past it without serving it again.
            if (held.state !== "running")
              yield* write(
                task,
                ScheduledTaskModel.recordRun(timing(task), { time: now, slot: due.slot, missed: due.missed }),
                now,
              )
          }
          if (input.extra) return { type: "claimed", claim: yield* claim(task, undefined, now) } as const
          return { type: "idle" } as const
        }),
      )

    // The path a user prompt takes: the Session (adopted when its ID exists), durable admission, then a wake.
    // Legacy runs are Maestro Sessions in the task's directory. A capability run uses its owner's agent and
    // placement, and only while the owner Session still exists there with that agent. `admitted` is a takeover
    // retrying a prompt that is already durable, which only reconciles and wakes.
    const dispatch = (claimed: Claim, admitted = false) =>
      Effect.gen(function* () {
        const owner = claimed.task.policy === "capability" ? claimed.task.owner : undefined
        if (claimed.task.policy === "capability" && !(owner && (yield* cap.present(owner))))
          return { type: "revoked" } as const
        // Checked before the Session too, so a void claim leaves no empty Session behind.
        const checked = claimed.task.policy === "capability" && !admitted
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        const session = yield* sessions.create({
          id: claimed.sessionID,
          agent: owner?.agentID ?? AgentV2.defaultID,
          location: owner?.location ?? { directory: claimed.task.directory },
        })
        // An edit, pause or removal since the claim voids it before admission. What remains is the window from this
        // read to the durable admission inside `sessions.prompt` (its prompt hooks included); a claim revoked in it
        // still settles with an honest `started` receipt.
        if (checked && !(yield* cap.holds(claimed))) return { type: "void" } as const
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return { type: "started", sessionID: session.id } as const
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // A capability prompt that was admitted before the failure (a wake that failed, say) did start.
            const durable =
              claimed.task.policy === "capability" ? yield* SessionInput.find(db, claimed.messageID) : undefined
            if (durable) return { type: "started", sessionID: durable.sessionID } as const
            return { type: "failed", error: reason(cause) } as const
          }),
        ),
      )

    const settle = Effect.fn("ScheduledTask.settle")(function* (claimed: Claim, outcome: Outcome) {
      const now = yield* Clock.currentTimeMillis
      yield* immediate(
        Effect.gen(function* () {
          const run = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(eq(ScheduledTaskRunTable.id, claimed.id))
            .get()
          // A claim an edit revoked while its prompt was being admitted keeps an honest receipt; it never counts
          // toward repeat or moves `next`, so this race can admit one run past the repeat limit.
          if (run?.state === "revoked" && outcome.type === "started")
            return yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "started", session_id: outcome.sessionID, error: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          // Gone with its task, taken over after the lease ended (the new lease settles it), or revoked by an edit.
          if (run?.state !== "running" || run.owner !== lease) return
          if (outcome.type === "void")
            return yield* db.delete(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, run.id)).run()
          yield* db
            .update(ScheduledTaskRunTable)
            .set({
              state: outcome.type,
              error: outcome.type === "failed" ? outcome.error : outcome.type === "revoked" ? "owner-missing" : null,
              owner: null,
              time_settled: now,
            })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          const task = yield* find(claimed.task.id)
          if (!task) return
          if (task.policy === "capability")
            yield* advance(task, ScheduledTaskCapability.settledCapability(task, run, outcome), now)
          if (legacy(task)) {
            // The task still points at (or before) the served slot unless it was rescheduled while the run
            // started; then the run counts as an extra run and the task keeps its new time.
            const slot = run.slot !== null && task.next <= run.slot ? run.slot : undefined
            const missed =
              slot !== undefined && task.cadence !== "once" && task.next < slot
                ? ScheduledTaskModel.previous(task, task.cadence, slot)
                : undefined
            // A failed slot is consumed like a run, so it is never retried; a failure leaves a rescheduled task alone.
            const advanced =
              outcome.type === "started" || slot !== undefined
                ? ScheduledTaskModel.recordRun(timing(task), { time: now, slot, missed })
                : timing(task)
            yield* advance(
              task,
              {
                next: advanced.next,
                enabled: advanced.enabled,
                missed: advanced.missed ?? null,
                runs: outcome.type === "started" ? task.runs + 1 : task.runs,
              },
              now,
            )
```

## F132

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 272–320.

```typescript
    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
    })

    const tick = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const stale = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.state, "running"), lt(ScheduledTaskRunTable.time_claimed, now - LEASE)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stale, (run) => takeOver(run, now).pipe(Effect.catchCause(logFailure)), { discard: true })
      const due = yield* db
        .select({ id: ScheduledTaskTable.id })
        .from(ScheduledTaskTable)
        .where(and(eq(ScheduledTaskTable.enabled, true), lte(ScheduledTaskTable.next, now)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(due, (task) => serve(task.id, now).pipe(Effect.catchCause(logFailure)), { discard: true })
    }).pipe(Effect.withSpan("ScheduledTask.tick"))
```

## F133

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 481–504.

```typescript
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, SessionV2.node] })


/** Serves due slots on the server whether or not any client is open, starting with a pass at boot. */
export const daemonNode = makeGlobalNode({
  name: "scheduled-task-daemon",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tasks = yield* Service
      // A failed pass (the database was busy, say) must not stop later passes.
      yield* tasks.tick.pipe(
        Effect.catchCause(logFailure),
        Effect.andThen(
          tasks.untilDue.pipe(
            Effect.catchCause((cause) => logFailure(cause).pipe(Effect.andThen(Effect.sleep(TICK)))),
          ),
        ),
        Effect.forever,
        Effect.forkScoped,
      )
    }),
  ),
  deps: [node],
})
```

## F134

`packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — lines 11–128.

```typescript
// Every answered question is kept as a decision; overturning one links the old to the new instead of editing it.

export const list = Effect.fnUntraced(function* (tx: Tx, key: string) {
  const project = yield* loadProject(tx, key)
  const known = yield* numbers(tx, project)
  const rows = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(eq(BoardDecisionTable.project_id, project.id))
    .orderBy(desc(BoardDecisionTable.answered_at), desc(BoardDecisionTable.id))
    .all()
  return rows.map((row) => toDecision(row, known))
})

/** The decision row an answer leaves behind. */
export const record = Effect.fnUntraced(function* (tx: Tx, project: ProjectRow, question: QuestionRow, input: Board.AnswerInput, now: number) {
  const id = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id,
      project_id: project.id,
      issue_id: question.issue_id,
      epic_id: question.epic_id,
      question_id: question.id,
      question: question.text,
      options: question.options,
      recommended: question.recommended,
      chosen: input.option,
      chosen_text: input.text ?? null,
      answered_by: "owner",
      answered_at: now,
    })
    .run()
  return id
})

export const change = Effect.fnUntraced(function* (tx: Tx, key: string, id: string, input: Board.DecisionChangeInput) {
  const project = yield* loadProject(tx, key)
  const old = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(and(eq(BoardDecisionTable.id, id as Board.DecisionID), eq(BoardDecisionTable.project_id, project.id)))
    .get()
  if (!old) return yield* new NotFoundError({ message: `Decision ${id} is not on ${key}.` })
  if (old.overturned_by_id)
    return yield* new RefusedError({ message: "That decision was already overturned; change the newer one instead." })
  if (!old.options.some((option) => option.id === input.option))
    return yield* new RefusedError({ message: `Pick one of: ${old.options.map((option) => option.id).join(", ")}.` })
  const text = input.text ?? null
  if (old.chosen === input.option && old.chosen_text === text)
    return yield* new RefusedError({ message: "That is already the answer." })
  const now = yield* Clock.currentTimeMillis
  const next = Board.DecisionID.create()
  yield* tx
    .insert(BoardDecisionTable)
    .values({
      id: next,
      project_id: project.id,
      issue_id: old.issue_id,
      epic_id: old.epic_id,
      question_id: old.question_id,
      question: old.question,
      options: old.options,
      recommended: old.recommended,
      chosen: input.option,
      chosen_text: text,
      answered_by: "owner",
      answered_at: now,
      supersedes_id: old.id,
    })
    .run()
  yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
  // Maestro reads the question's answer, so it carries the current one.
  yield* tx
    .update(BoardQuestionTable)
    .set({ answer_option: input.option, answer_text: text, answered_at: now })
    .where(eq(BoardQuestionTable.id, old.question_id))
    .run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: old.issue_id,
    actor: "owner",
    action: "question.answer",
    before: { id: old.question_id, answer_option: old.chosen, answer_text: old.chosen_text },
    after: { id: old.question_id, status: "answered", answer_option: input.option, answer_text: text, decision: next },
  })
  return { result: { activity }, changed: changed(project.id, activity, old.issue_id) }
})

export const outcome = Effect.fnUntraced(function* (tx: Tx, input: Board.DecisionOutcomeInput) {
  const project = yield* loadProject(tx, input.project)
  const row = yield* tx
    .select()
    .from(BoardDecisionTable)
    .where(
      and(
        eq(BoardDecisionTable.project_id, project.id),
        isNull(BoardDecisionTable.overturned_by_id),
        or(eq(BoardDecisionTable.id, input.id as Board.DecisionID), eq(BoardDecisionTable.question_id, input.id as Board.QuestionID)),
      ),
    )
    .orderBy(desc(BoardDecisionTable.answered_at))
    .get()
  if (!row) return yield* new NotFoundError({ message: `No standing decision ${input.id} on ${project.key}.` })
  if (row.outcome === input.outcome) return yield* new RefusedError({ message: "That outcome is already recorded." })
  const now = yield* Clock.currentTimeMillis
  yield* tx.update(BoardDecisionTable).set({ outcome: input.outcome, outcome_at: now }).where(eq(BoardDecisionTable.id, row.id)).run()
  const activity = yield* log(tx, {
    project: project.id,
    issue: row.issue_id,
    actor: "maestro",
    action: "question.answer",
    reason: input.reason,
    before: { id: row.question_id, outcome: row.outcome },
    after: { id: row.question_id, decision: row.id, outcome: input.outcome },
  })
  return { result: { activity }, changed: changed(project.id, activity, row.issue_id) }
```

## F135

`packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — lines 17–107.

```typescript
// The backend specialist's engines are fetched by the host on first use (the backend seat's shell has no network),
// verified against the pinned manifest and cached per user (ruling M3-4: an evicted engine is fetched again). Each
// engine installs into `<root>/engines/<id>/<version>-<target>/` and, once ready, gets a shim at `<root>/bin/<id>`
// (`<id>.cmd` on Windows) that carries the engine's environment; the shell exposes `<root>/bin` as BACKEND_TOOLKIT_BIN.
// A hosted engine (ruling M4-1) first needs its private runtime, installed once per user into
// `<root>/runtimes/<id>/<version>-<target>/` and shared by every engine on it. Its own install then carries a launcher
// `<id>` (`<id>.cmd` for Windows) that runs the runtime with the engine's arguments; that launcher is its executable.
// A source engine (ruling M5-1) is instead built once from its pinned source by the runtime toolchain; the built binary
// is its executable and the shim execs it.

export type EngineState =
  | { readonly status: "absent" }
  | { readonly status: "fetching"; readonly at: number; readonly budgetMs: number }
  | { readonly status: "ready"; readonly directory: string; readonly executable: string }
  | { readonly status: "failed"; readonly cause: string; readonly at: number }
  | { readonly status: "unsupported"; readonly reason: string }

/**
 * One engine's state on one target; `target` is absent only when the host has no supported target. Generic over the
 * engine id so another toolkit (the discovery seat's research toolkit, J6.1) runs this lifecycle over its own manifest.
 */
export type State<Id extends string = EngineId> = { readonly engine: Id; readonly version: string; readonly target?: TargetId } & EngineState

/** Cache root holding one install directory per engine version and target. */
export const Root = Context.Reference<string>("@orchestra/BackendToolkit/Root", {
  defaultValue: () => process.env.BACKEND_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "backend-toolkit"),
})

/** The engines this lifecycle serves; a toolkit over other ids provides its own manifest together with its own Root. */
export const Manifest = Context.Reference<Readonly<Record<string, Engine>>>("@orchestra/BackendToolkit/Manifest", {
  defaultValue: () => ENGINES,
})

export const Runtimes = Context.Reference<Readonly<Record<RuntimeId, Runtime>>>("@orchestra/BackendToolkit/Runtimes", {
  defaultValue: () => RUNTIMES,
})

/** The host's toolkit target, or why it has none. */
export const Target = Context.Reference<ReturnType<typeof detect>>("@orchestra/BackendToolkit/Target", {
  defaultValue: () => detect(),
})

/** The host the measured floors of F5.4 are checked against; tests inject descriptions instead of probing. */
export const Machine = Context.Reference<Host>("@orchestra/BackendToolkit/Machine", {
  defaultValue: () => current(),
})

// Acquisition outlives a shell call. A cold source build must not consume an entire model scenario in silence.
const PREPARE_MS = 60_000

export const status = Effect.fn("BackendToolkit.status")(function* <Id extends string = EngineId>(engine?: Id) {
  const manifest = yield* Manifest
  const host = yield* Target
  // The caller names the id type of the manifest it provides.
  const ids = engine ? [engine] : Object.values(manifest).map((item) => item.id as Id)
  if ("unsupported" in host)
    return ids.map(
      (id): State<Id> => ({ engine: id, version: manifest[id].version, status: "unsupported", reason: host.unsupported }),
    )
  return yield* states(ids, host.target)
})

/** The host-target executable of a ready engine, fetching it first when absent. */
export const ensure = Effect.fn("BackendToolkit.ensure")(function* <Id extends string = EngineId>(engine: Id) {
  const host = yield* Target
  if ("unsupported" in host) return yield* new NotReady({ reason: `unsupported-target:${host.unsupported}` })
  return yield* request(engine, host.target, true)
})

/** Fetch engines (all by default) for a target (the host's by default); shims are written only for the host target. */
export const prefetch = Effect.fn("BackendToolkit.prefetch")(function* <Id extends string = EngineId>(
  engines?: ReadonlyArray<Id>,
  target?: TargetId,
): Effect.fn.Return<ReadonlyArray<State<Id>>> {
  const manifest = yield* Manifest
  const host = yield* Target
  const ids = engines ?? Object.values(manifest).map((item) => item.id as Id)
  const chosen = target ?? ("target" in host ? host.target : undefined)
  if (!chosen) return yield* status<Id>().pipe(Effect.map((all) => all.filter((state) => ids.includes(state.engine))))
  yield* Effect.forEach(ids, (id) => request(id, chosen, "target" in host && host.target === chosen).pipe(Effect.ignore), {
    concurrency: "unbounded",
    discard: true,
  })
  return yield* states(ids, chosen)
})

/**
 * The toolkit environment for one shell command. Engines named through BACKEND_TOOLKIT_BIN and their owned dependencies
 * acquire on demand. A command naming none never fetches. A cold acquisition exceeding the shell wait returns a named
 * fetching blocker while acquisition continues; `ensure`/`prefetch` await the install budget.
 */
```

## F136

`packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — lines 108–179.

```typescript
export const prepare = Effect.fn("BackendToolkit.prepare")(function* (command: string, callerEnv: NodeJS.ProcessEnv = process.env) {
  const root = yield* Root
  const manifest = yield* Manifest
  // `$BACKEND_TOOLKIT_BIN/<id>`, `${BACKEND_TOOLKIT_BIN}/<id>`, `"$BACKEND_TOOLKIT_BIN"/<id>` and PowerShell's
  // `$env:BACKEND_TOOLKIT_BIN\<id>.cmd`, with either separator.
  const named = Object.values(manifest)
    .map((engine) => engine.id)
    .filter((id) =>
      new RegExp(String.raw`\$(?:env:)?(?:BACKEND_TOOLKIT_BIN|\{BACKEND_TOOLKIT_BIN\})"?[\\/]${id}(?![\w-])`).test(
        command,
      ),
    )
  const env = {
    BACKEND_TOOLKIT_BIN: path.join(root, "bin"),
    ...(named.some((id) => manifest[id].dependencies?.length)
      ? { PATH: [path.join(root, "bin"), callerEnv.PATH ?? callerEnv.Path ?? ""].join(path.delimiter) }
      : {}),
  }
  const blocked = yield* Effect.forEach(named, (id) => ensure(id).pipe(Effect.timeoutOrElse({
    duration: PREPARE_MS,
    orElse: () => Effect.fail(new NotReady({ reason: `toolkit-not-ready:fetching:${id}` })),
  })), { concurrency: "unbounded", discard: true }).pipe(
    Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
  )
  if (blocked) return { env, blocked }
  return { env }
})

/** Validate the reachable graph before fetching any bytes; postorder puts each owned dependency before its caller. */
export function dependencyOrder(manifest: Readonly<Record<string, Engine>>, id: string): string[] | string {
  const active = new Set<string>()
  const done = new Set<string>()
  const ordered: string[] = []
  const visit = (current: string): string | undefined => {
    const engine = Object.entries(manifest).find(([key]) => key === current)?.[1]
    if (!engine) return `toolkit-dependency-missing:${current}`
    if (active.has(current)) return `toolkit-dependency-cycle:${[...active, current].join("->")}`
    if (done.has(current)) return
    active.add(current)
    for (const dependency of engine.dependencies ?? []) {
      const failure = visit(dependency)
      if (failure) return failure
    }
    active.delete(current)
    done.add(current)
    if (current !== id) ordered.push(engine.id)
  }
  return visit(id) ?? ordered
}

/**
 * Why the host is below the measured floor of an engine, its owned dependencies or the runtimes they run on (F5.4),
 * e.g. `glibc-below-2.34`. Each pack records only what its own binaries need, so the engine's floor is the maximum.
 */
function belowFloor(
  manifest: Readonly<Record<string, Engine>>,
  runtimes: Readonly<Record<RuntimeId, Runtime>>,
  id: string,
  target: TargetId,
  machine: Host,
) {
  const order = dependencyOrder(manifest, id)
  if (typeof order === "string") return
  return [id, ...order]
    .flatMap((engine) => {
      const item = manifest[engine]
      return [item.floor?.[target], "runtime" in item ? runtimes[item.runtime].floor?.[target] : undefined]
    })
    .map((floor) => below(machine, target, floor))
    .find((reason) => reason !== undefined)
}

```

## F137

`packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — lines 180–279.

```typescript
const request = Effect.fnUntraced(function* (id: string, target: TargetId, host: boolean) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const machine = yield* Machine
  const dependencies = dependencyOrder(manifest, id)
  if (typeof dependencies === "string") return yield* new NotReady({ reason: dependencies })
  const engine = manifest[id]
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  // Before any fetch. A cross-target prefetch (`host` false) is never executed here, so it has no floor to meet.
  const floor = host ? belowFloor(manifest, runtimes, id, target, machine) : undefined
  if (floor) return yield* new NotReady({ reason: `unsupported-target:${id}:${floor}` })
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const cause = yield* attempts.once(requestKey(directory, host), Effect.gen(function* () {
    yield* Effect.forEach([...dependencies, id], (dependency) => acquire(root, manifest[dependency], runtimes, target, host), { discard: true })
  }))
  if (cause !== undefined) return yield* new NotReady({ reason: cause.startsWith("toolkit-not-ready:") || cause.startsWith("unsupported-target:") ? cause : `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
})

const requestKey = (directory: string, host: boolean) => `${directory}:request:${host ? "host" : "cross"}`

const acquire = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, target: TargetId, host: boolean) {
  const id = engine.id
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  const work =
    "runtime" in engine
      ? hosted(root, engine, runtimes, directory, target, host)
      : PinnedArtifact.install(directory, [engine.targets[target].artifact]).pipe(
          Effect.andThen(
            host
              ? shim(root, engine.id, launchText(root, engine, runtimes, directory, target))
              : Effect.void,
          ),
        )
  const cause = yield* attempts.once(directory, work.pipe(Effect.andThen(Effect.gen(function* () {
    const missing = yield* readiness(root, engine, runtimes, directory, target, host)
    if (missing) return yield* new PinnedArtifact.Failed({ cause: missing })
  }))))
  if (cause !== undefined) return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
})

const states = Effect.fnUntraced(function* <Id extends string>(ids: ReadonlyArray<Id>, target: TargetId) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const host = yield* Target
  const machine = yield* Machine
  const local = "target" in host && host.target === target
  return yield* Effect.forEach(ids, (id) =>
    Effect.gen(function* () {
      const engine = manifest[id]
      const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
      const base = { engine: id, version: engine.version, target }
      const dependencies = dependencyOrder(manifest, id)
      if (typeof dependencies === "string") return { ...base, status: "failed", cause: dependencies, at: 0 } satisfies State<Id>
      const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
      if (unsupported) return { ...base, status: "unsupported", reason: unsupported } satisfies State<Id>
      const floor = local ? belowFloor(manifest, runtimes, id, target, machine) : undefined
      if (floor) return { ...base, status: "unsupported", reason: floor } satisfies State<Id>
      // A complete parent artifact cannot hide a failed request, missing dependency, launcher or host shim.
      for (const dependency of [id, ...dependencies]) {
        const item = manifest[dependency]
        const install = path.join(root, "engines", dependency, `${item.version}-${target}`)
        const excluded = "runtime" in item ? item.unsupported?.[target] : undefined
        if (excluded) return { ...base, status: "unsupported", reason: excluded } satisfies State<Id>
        for (const key of [requestKey(install, local), install]) {
          const attempt = attempts.get(key)
          if (attempt && "running" in attempt) return { ...base, status: "fetching", at: attempt.at, budgetMs: INSTALL_MS } satisfies State<Id>
          if (attempt && "failed" in attempt) {
            const prefix = `toolkit-not-ready:failed:${id}:`
            return { ...base, status: "failed", cause: dependency !== id ? `dependency:${dependency}:${attempt.failed}`
              : attempt.failed.startsWith(prefix) ? attempt.failed.slice(prefix.length) : attempt.failed, at: attempt.at } satisfies State<Id>
          }
        }
        if (yield* readiness(root, item, runtimes, install, target, local)) return { ...base, status: "absent" } satisfies State<Id>
      }
      return { ...base, status: "ready", directory, executable: executable(engine, directory, target) } satisfies State<Id>
    }),
  )
})

/** Cache markers alone are not executable readiness. Status observes; acquisition repairs launchers before success. */
const readiness = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId, host: boolean) {
  if (!(yield* PinnedArtifact.installed(directory))) return "install-incomplete"
  if (!(yield* fileReady(executable(engine, directory, target), target))) return "executable-missing"
  if ("runtime" in engine) {
    const runtime = runtimes[engine.runtime]
    const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
    if (!(yield* PinnedArtifact.installed(home)) || !(yield* fileReady(path.join(home, runtime.targets[target].executable), target))) return "runtime-executable-missing"
  }
  if (!host) return
  const file = path.join(root, "bin", target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  if (!(yield* fileReady(file, target))) return "host-shim-missing"
  if ((yield* Effect.promise(() => readFile(file, "utf8").catch(() => undefined))) !== launchText(root, engine, runtimes, directory, target)) return "host-shim-stale"
})
```

## F138

`packages/core/src/backend-toolkit/README.md:a7efc8b49f165ad767f51cb49ad9bdbb220215d1` — lines 1–24.

```text
# Backend toolkit domain

## Purpose and ownership

- Engine (core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `runtimes/`.
- Packs (`packs/`, `entry-skills.gen.ts`) describe each pinned engine: how to acquire it and which entry skills it exposes.

## Public entry points and consumers

- Consumers include `apps/cli/src/commands/handlers/toolkit/` and `modules/maestro/coordination/src/v2/tools/atlas-memory.ts`.

## Dependencies and boundaries

- The engine must not import product code.

## Assets, schemas and generated files

- `packages/core/src/backend-toolkit/entry-skills.gen.ts` is generated from `modules/specialists/backend/skills` by `packages/core/script/toolkit-pack.ts`; never edit it by hand. The `*.package-lock.json` files under `packs/` are pinned inputs.

## Persistence, identity and lifetime

- Acquired engines live in a cache root that defaults to `BACKEND_TOOLKIT_ROOT` or `backend-toolkit` under the global cache directory.

## Commands
```

## F139

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 15–107.

```typescript
// J6: the discovery seat's pinned engines on the BackendToolkit lifecycle, with research Root and Manifest supplied.
// Nothing here copies acquisition: `status`, `ensure` and `prefetch` run BackendToolkit's verbs over this toolkit's
// own root and packs, so installs, launchers, shims, retries and failure causes are the backend's (J6.1).

export type ResearchEngineId = "scip-typescript" | "scip-python" | "scip-go" | "rust-analyzer" | "typescript"

export type Language = "ts" | "js" | "py" | "go" | "rust"

/** A research engine file; it carries its own fit and never touches the backend Pack's entry skills. */
export type ResearchPack = Engine<string> & {
  readonly fit: { readonly role: "indexer" | "oracle"; readonly languages: ReadonlyArray<Language> }
}

export type State = { readonly engine: ResearchEngineId; readonly version: string } & BackendToolkit.EngineState

/** Owner caps (D2, 2026-10-18) and the index disk budget (J2.4); config `research.limits.*` may lower them. */
export const Limits = Object.freeze({
  indexerBytes: 2 * 1024 * 1024 * 1024,
  probeBytes: 1024 * 1024 * 1024,
  scratchBytes: 2 * 1024 * 1024 * 1024,
  indexBytes: 4 * 1024 * 1024 * 1024,
  indexCommits: 8,
  shardTimeoutMs: 15 * 60_000,
})

export const Root = Context.Reference<string>("@orchestra/ResearchToolkit/Root", {
  defaultValue: () => process.env.RESEARCH_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "research-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Partial<Record<ResearchEngineId, ResearchPack>>>>(
  "@orchestra/ResearchToolkit/Manifest",
  { defaultValue: () => ENGINES },
)

/** The caps in force; the instance provides `research.limits.*` here, which may only lower `Limits`. */
export const Caps = Context.Reference<typeof Limits>("@orchestra/ResearchToolkit/Caps", { defaultValue: () => Limits })

/** `Caps` from config `research.limits.*`: each configured value lowers its owner cap and never raises it (D2). */
export function caps(limits?: {
  readonly indexer_bytes?: number
  readonly probe_bytes?: number
  readonly scratch_bytes?: number
  readonly index_bytes?: number
}): typeof Limits {
  const lower = (cap: number, value?: number) => Math.min(cap, value ?? cap)
  return Object.freeze({
    ...Limits,
    indexerBytes: lower(Limits.indexerBytes, limits?.indexer_bytes),
    probeBytes: lower(Limits.probeBytes, limits?.probe_bytes),
    scratchBytes: lower(Limits.scratchBytes, limits?.scratch_bytes),
    indexBytes: lower(Limits.indexBytes, limits?.index_bytes),
  })
}

/** One (language, project) shard of a worktree's index (J2.1), as the index store sees it at the worktree's commit. */
export type Shard = {
  /** The shard key (J2.2); a new commit that changes the project's tree is a new id. */
  readonly id: string
  readonly language: Language
  readonly project: string
  /** The project's aggregated `file_rank`; higher builds first. */
  readonly rank: number
  readonly engine: ResearchEngineId
  readonly state: "ready" | "stale" | "absent"
}

export type ShardState = Pick<Shard, "id" | "language" | "project"> &
  ({ readonly status: Shard["state"] | "building" } | { readonly status: "skipped"; readonly reason: string })

export class ShardFailed extends Schema.TaggedErrorClass<ShardFailed>()("ResearchToolkit.ShardFailed", {
  reason: Schema.String,
}) {
  override get message() {
    return `Research index shard not built: ${this.reason}`
  }
}

/**
 * The code index (X3) as the toolkit drives it: which shards a worktree has, and how one is built. `build` runs the
 * pack's indexer under `ToolSafetySandbox.confine` within `memoryBytes` and stops when interrupted; the toolkit owns
 * ordering, the host-wide one-indexer rule and the timeout (J6.7).
 */
export const Index = Context.Reference<{
  readonly plan: (worktree: string) => Effect.Effect<ReadonlyArray<Shard>, ShardFailed>
  readonly build: (
    shard: Shard,
    input: { readonly worktree: string; readonly executable: string; readonly memoryBytes: number },
  ) => Effect.Effect<void, ShardFailed>
}>("@orchestra/ResearchToolkit/Index", {
  defaultValue: () => ({
    plan: () => Effect.succeed([]),
    build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
  }),
```

## F140

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 150–218.

```typescript
  Effect.gen(function* () {
    if (warming.has(worktree)) return
    warming.add(worktree)
    yield* warm(worktree).pipe(
      Effect.ensuring(Effect.sync(() => warming.delete(worktree))),
      Effect.forkDetach,
    )
  })

/**
 * The warm-up `prewarm` forks (J6.7): every shard not ready at the worktree's commit, highest `rank` first, one
 * indexer at a time on the host, each within `Caps.shardTimeoutMs` and `Caps.indexerBytes`. A shard that cannot be
 * built is recorded `skipped` with its reason, and the others go on.
 */
export const warm = Effect.fn("ResearchToolkit.warm")(function* (worktree: string) {
  const index = yield* Index
  const caps = yield* Caps
  const root = yield* Root
  const plan = yield* index.plan(worktree).pipe(Effect.orElseSucceed((): ReadonlyArray<Shard> => []))
  const pending = plan.filter((shard) => shard.state !== "ready").toSorted((a, b) => b.rank - a.rank)
  const engines = new Map(
    yield* Effect.forEach([...new Set(pending.map((shard) => shard.engine))], (engine) =>
      ensure(engine).pipe(
        Effect.match({ onSuccess: (ready) => ready, onFailure: (error) => ({ reason: error.reason }) }),
        Effect.map((ready) => [engine, ready] as const),
      ),
    ),
  )
  const flock = yield* EffectFlock.Service
  yield* Effect.forEach(
    pending,
    Effect.fnUntraced(function* (shard: Shard) {
      const ready = engines.get(shard.engine) ?? { reason: `toolkit-not-ready:absent:${shard.engine}` }
      if ("reason" in ready) return yield* record(root, worktree, shard.id, { status: "skipped", reason: ready.reason })
      // A query that is already building this shard is awaited, not repeated (`shard.id` is the shard key).
      const built = yield* CodeIndexStore.singleFlight(
        root,
        shard.id,
        flock
          .withLock(
            Effect.gen(function* () {
              yield* record(root, worktree, shard.id, { status: "building" })
              return yield* index
                .build(shard, { worktree, executable: ready.executable, memoryBytes: caps.indexerBytes })
                .pipe(
                  Effect.timeoutOrElse({
                    duration: caps.shardTimeoutMs,
                    orElse: () => Effect.fail(new ShardFailed({ reason: `timeout:${caps.shardTimeoutMs}ms` })),
                  }),
                )
            }),
            "research-toolkit:indexer",
            path.join(root, "locks"),
          )
          // The lock waits at most five minutes per try; a shard of another worktree may hold it for fifteen.
          .pipe(
            Effect.retry({ while: (error) => error._tag === "LockTimeoutError" }),
            Effect.mapError((error) =>
              error._tag === "ResearchToolkit.ShardFailed" ? error : new ShardFailed({ reason: "indexer-lock-compromised" })),
          ),
        { describe: (error) => error.reason, join: (reason) => new ShardFailed({ reason }) },
      ).pipe(
        Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
      )
      yield* record(root, worktree, shard.id, built === undefined ? undefined : { status: "skipped", reason: built })
    }),
    { discard: true },
  )
}, Effect.provide(LayerNode.compile(EffectFlock.node)))
```

## F141

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 220–300.

```typescript
/** Each shard of the worktree as `orchestra toolkit status` shows it (J6.9). */
export const shards = Effect.fn("ResearchToolkit.shards")(function* (worktree: string) {
  const index = yield* Index
  const caps = yield* Caps
  const root = yield* Root
  const plan = yield* index.plan(worktree)
  const records = yield* read(root, worktree)
  return plan.map((shard): ShardState => {
    const base = { id: shard.id, language: shard.language, project: shard.project }
    const entry = records[shard.id]
    // A building record outlives a process that died mid-build; past the shard timeout it no longer claims the shard.
    if (entry?.status === "building" && Date.now() - entry.at < caps.shardTimeoutMs) return { ...base, status: "building" }
    if (entry?.status === "skipped" && shard.state !== "ready") return { ...base, status: "skipped", reason: entry.reason ?? "unknown" }
    return { ...base, status: shard.state }
  })
})

function lifecycle<A, E, R>(self: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const root = yield* Root
    const manifest = yield* Manifest
    return yield* self.pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(
        BackendToolkit.Manifest,
        Object.fromEntries(Object.values(manifest).filter((pack) => pack !== undefined).map((pack) => [pack.id, pack])),
      ),
    )
  })
}

function unshipped(id: ResearchEngineId): State {
  return { engine: id, version: "none", status: "unsupported", reason: "pack-not-shipped" }
}

/** BackendToolkit's blockers in the one research form; the backend's own wording stays the shell's. */
function named(id: ResearchEngineId, reason: string) {
  if (reason.startsWith("toolkit-not-ready:")) return reason
  if (!reason.startsWith("unsupported-target:")) return `toolkit-not-ready:failed:${id}:${reason}`
  // A floor refusal already names the engine: `unsupported-target:<id>:<floor>`.
  const rest = reason.slice("unsupported-target:".length)
  return `toolkit-not-ready:unsupported:${id}:${rest.startsWith(`${id}:`) ? rest.slice(id.length + 1) : rest}`
}

// Shard outcomes live beside the cache, not in the worktree (JI-1), so a CLI process sees what the instance recorded.
const Records = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({ status: Schema.Literals(["building", "skipped"]), reason: Schema.optional(Schema.String), at: Schema.Number }),
  ),
)
const decodeRecords = Schema.decodeUnknownOption(Records)

const recordFile = (root: string, worktree: string) =>
  path.join(root, "prewarm", `${createHash("sha256").update(path.resolve(worktree)).digest("hex")}.json`)

const read = (root: string, worktree: string) =>
  Effect.promise(() => readFile(recordFile(root, worktree), "utf8").catch(() => "{}")).pipe(
    Effect.map((text) => Option.getOrElse(decodeRecords(text), (): typeof Records.Type => ({}))),
  )

/** Replace one shard's record (none clears it) through a temp file and one rename; a failed write loses only status. */
const record = (root: string, worktree: string, shard: string, entry?: { readonly status: "building" | "skipped"; readonly reason?: string }) =>
  read(root, worktree).pipe(
    Effect.flatMap((records) =>
      Effect.tryPromise({
        try: async () => {
          const file = recordFile(root, worktree)
          const next = Object.fromEntries([
            ...Object.entries(records).filter(([id]) => id !== shard),
            ...(entry ? [[shard, { ...entry, at: Date.now() }]] : []),
          ])
          await mkdir(path.dirname(file), { recursive: true })
          const temp = `${file}.${randomUUID()}`
          await writeFile(temp, JSON.stringify(next))
          await rename(temp, file).catch(() => rm(temp, { force: true }))
        },
        catch: () => new ShardFailed({ reason: "record-write" }),
      }).pipe(Effect.ignore),
    ),
  )
```

## F142

`packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — lines 30–84.

```typescript
  .map((definition) => EventV2.versionedType(definition.type, 1))

/** Canonical JSON ignores object insertion order and absent optional fields, preserving array order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value !== null && typeof value === "object") return `{${Object.entries(value)
    .filter((entry) => entry[1] !== undefined).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
    .map((entry) => `${JSON.stringify(entry[0])}:${canonical(entry[1])}`).join(",")}}`
  return JSON.stringify(value)
}

export function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

export function operation(context: Tool.Context, action: string) {
  return digest(canonical([context.sessionID, context.assistantMessageID, context.toolCallID, action]))
}

export function eventID(binding: Research.Binding, key: string) {
  return EventV2.ID.make(`evt_research_${digest(canonical([binding.executionSessionID, key]))}`)
}

export function cap(value: unknown, limit = Research.Limits.eventBytes) {
  if (Buffer.byteLength(typeof value === "string" ? value : canonical(value), "utf8") > limit)
    throw new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" })
}

export const bounded = (value: unknown, limit = Research.Limits.eventBytes) => Effect.try({
  try: () => cap(value, limit), catch: () => new Research.Error({ code: "over_cap", message: "Research UTF-8 byte limit exceeded" }),
})

export const entries = Effect.fn("ResearchLedger.entries")(function* (binding: Research.Binding, explicitID?: string, executionOnly = false) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(
    inArray(EventTable.type, types),
    sql`json_extract(${EventTable.data}, '$.binding.projectID') = ${binding.projectID}`,
    executionOnly ? eq(EventTable.aggregate_id, binding.executionSessionID) : undefined,
    explicitID === undefined ? eq(EventTable.aggregate_id, binding.executionSessionID) : sql`(
      json_extract(${EventTable.data}, '$.record.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.ref.artifact.id') = ${explicitID} OR
      json_extract(${EventTable.data}, '$.receipt.artifact.id') = ${explicitID})`,
  )).orderBy(asc(EventTable.seq)).all().pipe(Effect.orDie)
  return yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(Entry)({
    id: row.id, type: row.type.slice(0, -2), data: row.data,
    durable: { aggregateID: row.aggregate_id, seq: row.seq, version: 1 },
  }).pipe(
    Effect.mapError(() => new Research.Error({ code: "source_unavailable", message: "Invalid retained research event" })),
    Effect.flatMap((entry) => entry.data.sessionID !== row.aggregate_id || entry.data.binding.executionSessionID !== row.aggregate_id ||
      (entry.type !== "research.record.committed" && !isDeepStrictEqual(entry.data.receipt.binding, entry.data.binding))
      ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Research event scope does not match admission" }))
      : Effect.succeed(entry)),
  ))
})
```

## F143

`packages/core/src/research/ledger.ts:6b6ca2931b6aa8bdd2156b47fc13005aab93dcbf` — lines 145–157.

```typescript
export const retained = Effect.fn("ResearchLedger.retained")(function* (binding: Research.Binding) {
  const actual = yield* ResearchBinding.resolve(binding.executionSessionID, binding.projectID)
  if (!isDeepStrictEqual(actual, binding))
    return yield* new Research.Error({ code: "binding_mismatch", message: "Research placement changed" })
  return actual
})

export function replay(entries: readonly Entry[], operation: string, inputHash: string) {
  const found = entries.filter((entry) => entry.data.operation === operation)
  if (found.length > 1 || found.some((entry) => entry.data.inputHash !== inputHash))
    throw new Research.Error({ code: "conflict", message: "Research operation was reused with different input" })
  return found[0]
}
```

## F144

`packages/core/src/host.ts:a0fc5bc9a36e50315b0ddddf4de3566555711250` — lines 15–63.

```typescript
/** Global services every composition root provides to a contribution's reference overrides. */
export type ReferenceServices =
  | Database.Service
  | EventV2.Service
  | LocationServiceMap.Service
  | ClaudeCodeAccount.Service

/**
 * What a product module hands a composition root. A root applies all contributions once, to its single
 * application graph (AGENTS "V2 Session Core": one process-local SessionExecution, one Location map).
 */
export interface Contribution {
  /** Stable module id ("maestro", "app-dock", ...). Duplicates are a composition error. */
  readonly id: string
  /** Node replacements for the root graph; AppNodeBuilder also applies them to every Location map it builds. */
  readonly replacements?: LayerNode.Replacements
  /** Extra global nodes owned by the module. They must not fail: the root's error type does not grow. */
  readonly nodes?: ReadonlyArray<Node.GlobalNode<unknown>>
  /** Extra Location-scoped nodes appended to `locationServices` in every Location map the root builds. */
  readonly locationNodes?: ReadonlyArray<Node.LocationNode<unknown, LocationError>>
  /** Context.Reference overrides (core/host/* references), provided to the API layer. */
  readonly references?: Layer.Layer<never, never, ReferenceServices>
}

// One coordinator per process: these stay owned by the composition root.
const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions in order; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const duplicate = repeated(contributions.map((item) => item.id))
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const locationNodes = contributions.flatMap((item) => item.locationNodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes].find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  const node = repeated(nodes.map((item) => item.name))
  if (node) throw new Error(`Host contribution node is not unique: ${node}`)
  // A contributed Location node may not shadow a built-in one either; changing a built-in is a replacement.
  const builtIn = new Set(locationServices.dependencies.map((item) => item.name))
  const location = repeated(locationNodes.map((item) => item.name)) ?? locationNodes.find((item) => builtIn.has(item.name))?.name
  if (location) throw new Error(`Host contribution Location node is not unique: ${location}`)
  const [first, ...rest] = contributions.flatMap((item) => (item.references ? [item.references] : []))
  const references: Layer.Layer<never, never, ReferenceServices> = !first ? Layer.empty : rest.length === 0 ? first : Layer.mergeAll(first, ...rest)
  return { replacements, nodes, locationNodes, references }
}

function repeated(names: ReadonlyArray<string>) {
  return names.find((name, index) => names.indexOf(name) !== index)
```

## F145

`packages/core/src/effect/app-node.ts:e8112f921ad7a7dcefbf6985c24995df1855c96b` — lines 1–14.

```typescript
import { LayerNode } from "./layer-node"

export const tags = LayerNode.tags({
  location: ["global"],
  global: [],
})

export type GlobalNode<A, E = never> = LayerNode.Node<A, E, (typeof tags.values)["global"]>
export type LocationNode<A, E = never> = LayerNode.Node<A, E, (typeof tags.values)["location"]>

export const makeGlobalNode = tags.make("global")
export const makeLocationNode = tags.make("location")

export * as Node from "./app-node"
```

## F146

`packages/core/src/global.ts:ba7790536b60c6075ff37854c4db14909b779183` — lines 10–43.

```typescript
const app = "orchestra"
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.ORCHESTRA_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])
```

## F147

`packages/core/src/global.ts:ba7790536b60c6075ff37854c4db14909b779183` — lines 59–85.

```typescript
export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.ORCHESTRA_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [] })

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )
```

## F148

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 25–65.

```typescript
export interface RunOptions {
  /** Optional producer-owned hook; runs on raw chunks before capture limits. */
  readonly inspect?: (chunk: Uint8Array) => void
  readonly combineOutput?: boolean
  readonly maxOutputBytes?: number
  readonly maxErrorBytes?: number
  readonly signal?: AbortSignal
  readonly timeout?: Duration.Input
  /**
   * Memory cap for the whole process tree in resident bytes. Under omni the tree is killed above it and the call fails
   * with `OmniSpawner.MemoryExceeded` as the cause; the legacy spawner does not enforce it.
   */
  readonly maxRssBytes?: number
  readonly stdin?: string | Uint8Array | Stream.Stream<Uint8Array, PlatformError>
}

export interface RunStreamOptions {
  readonly signal?: AbortSignal
  readonly includeStderr?: boolean
  readonly okExitCodes?: ReadonlyArray<number>
  readonly maxErrorBytes?: number
}

export interface RunResult {
  readonly command: string
  readonly exitCode: number
  readonly output?: Buffer
  readonly stdout: Buffer
  readonly stderr: Buffer
  readonly outputTruncated?: boolean
  readonly stdoutTruncated: boolean
  readonly stderrTruncated: boolean
}

export type Interface = ChildProcessSpawner["Service"] & {
  readonly run: (command: ChildProcess.Command, options?: RunOptions) => Effect.Effect<RunResult, AppProcessError>
  readonly runStream: (
    command: ChildProcess.Command,
    options?: RunStreamOptions,
  ) => Stream.Stream<string, AppProcessError>
}
```

## F149

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 131–217.

```typescript
export const collectStream = <E>(stream: Stream.Stream<Uint8Array, E>, maxOutputBytes: number | undefined) =>
  Stream.runFold(
    stream,
    () => ({ chunks: [] as Uint8Array[], bytes: 0, truncated: false }),
    (acc, chunk) => {
      if (maxOutputBytes === undefined) {
        acc.chunks.push(chunk)
        acc.bytes += chunk.length
        return acc
      }
      const remaining = maxOutputBytes - acc.bytes
      if (remaining > 0) acc.chunks.push(remaining >= chunk.length ? chunk : chunk.slice(0, remaining))
      acc.bytes += chunk.length
      acc.truncated = acc.truncated || acc.bytes > maxOutputBytes
      return acc
    },
  ).pipe(Effect.map((x) => ({ buffer: Buffer.concat(x.chunks), truncated: x.truncated })))

/**
 * AppProcess over the spawner in context, for a mode of ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: with omni on, run()
 * collects through omni itself where it can (R2-1).
 */
export const layerWith = (mode: typeof Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER) => Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    const omni = mode === "off" ? undefined : yield* Effect.promise(() => Omni.load())

    const runCommand = (command: ChildProcess.Command, options?: RunOptions) => {
      const description = describeCommand(command)
      const inspected = (stream: Stream.Stream<Uint8Array, PlatformError>) => options?.inspect
        ? stream.pipe(Stream.tap((chunk) => Effect.try({
            try: () => options.inspect?.(chunk),
            catch: (cause) => wrapError(description, cause),
          }))) : stream
      const collect = Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* spawner
            .spawn(command)
            .pipe(Effect.provideService(OmniSpawner.MemoryCap, options?.maxRssBytes))
          if (options?.combineOutput) {
            const [output, exitCode] = yield* Effect.all(
              [collectStream(inspected(handle.all), options.maxOutputBytes), handle.exitCode],
              { concurrency: "unbounded" },
            )
            return {
              command: description,
              exitCode,
              output: output.buffer,
              stdout: Buffer.alloc(0),
              stderr: Buffer.alloc(0),
              outputTruncated: output.truncated,
              stdoutTruncated: false,
              stderrTruncated: false,
            } satisfies RunResult
          }
          const [stdout, stderr, exitCode] = yield* Effect.all(
            [
              collectStream(inspected(handle.stdout), options?.maxOutputBytes),
              collectStream(inspected(handle.stderr), options?.maxErrorBytes),
              handle.exitCode,
            ],
            { concurrency: "unbounded" },
          )
          return {
            command: description,
            exitCode,
            stdout: stdout.buffer,
            stderr: stderr.buffer,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: stderr.truncated,
          } satisfies RunResult
        }),
      )
      const timed = options?.timeout
        ? Effect.timeoutOrElse(collect, {
            duration: options.timeout,
            orElse: () => Effect.fail(new AppProcessError({ command: description, cause: new Error("Timed out") })),
          })
        : collect
      const aborted = options?.signal
        ? timed.pipe(
            Effect.raceFirst(
              waitForAbort(options.signal).pipe(Effect.mapError((cause) => wrapError(description, cause))),
            ),
          )
        : timed
```

## F150

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 221–272.

```typescript
    const collect = (omni: OmniSpawner.Binding, command: ChildProcess.StandardCommand, options?: RunOptions) => {
      const description = describeCommand(command)
      const stdin = options?.stdin
      return OmniSpawner.collect(omni, command, {
        combineOutput: options?.combineOutput,
        signal: options?.signal,
        timeout: options?.timeout,
        maxRssBytes: options?.maxRssBytes,
        stdin: typeof stdin === "string" || stdin instanceof Uint8Array ? stdin : undefined,
      }).pipe(
        Effect.map((result) =>
          options?.combineOutput
            ? ({
                command: description,
                exitCode: result.exitCode,
                output: result.stdout,
                stdout: Buffer.alloc(0),
                stderr: Buffer.alloc(0),
                outputTruncated: false,
                stdoutTruncated: false,
                stderrTruncated: false,
              } satisfies RunResult)
            : ({
                command: description,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
                stdoutTruncated: false,
                stderrTruncated: false,
              } satisfies RunResult),
        ),
        Effect.catch((cause) =>
          Effect.fail(wrapError(description, options?.signal?.aborted ? abortError(options.signal) : cause)),
        ),
      )
    }

    const run = Effect.fn("AppProcess.run")(function* (command: ChildProcess.Command, options?: RunOptions) {
      if (omni && OmniSpawner.collectable(command, options)) return yield* collect(omni, command, options)
      if (options?.stdin === undefined) return yield* runCommand(command, options)
      if (command._tag !== "StandardCommand") {
        return yield* new AppProcessError({
          command: describeCommand(command),
          cause: new Error("stdin option only supports StandardCommand; received PipedCommand"),
        })
      }
      const next = ChildProcess.make(command.command, command.args, {
        ...command.options,
        stdin: normalizeStdin(options.stdin),
      })
      return yield* runCommand(next, options)
    })
```

## F151

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 319–324.

```typescript
// The flag is read once, when the layer is built.
const layer = Layer.unwrap(Effect.sync(() => layerWith(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER)))

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [CrossSpawnSpawner.node] })

export * as AppProcess from "./process"
```

## F152

`packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — lines 25–112.

```typescript
let injected: Paths = {}
let loading: Promise<Binding> | undefined

/** Hands the loader explicit addon and supervisor paths (D-L8). Must run before the first load(). */
export function configure(paths: Paths) {
  if (loading) throw new Error("Omni.configure() must run before the first Omni.load().")
  injected = { ...injected, ...paths }
}

/**
 * Loads hugr-omni once. Rejects, loudly and with every place it looked, when the addon or the supervisor is
 * missing; callers that asked for omni (the flag is on) must never fall back silently.
 */
export function load() {
  loading ??= open()
  return loading
}

async function open(): Promise<Binding> {
  const found = locate()
  const binding: Configurable = await import("hugr-omni").catch((cause: unknown) => {
    throw new Error(`hugr-omni could not load its native addon ${found.addon}: ${String(cause)}`, { cause })
  })
  if (typeof binding.configure === "function") {
    binding.configure(found)
    return binding
  }
  // Without configure() the native side finds the supervisor next to the addon, or through a real (process-start)
  // HUGR_OMNI_SUPERVISOR. A process.env write under Bun never reaches native code (H4), so nothing else works.
  const native = process.env.HUGR_OMNI_SUPERVISOR
  if (path.dirname(found.supervisor) === path.dirname(found.addon) || native === found.supervisor) return binding
  throw new Error(
    `hugr-omni: the supervisor ${found.supervisor} is not next to the addon ${found.addon}, and this hugr-omni has no configure().`,
  )
}

/**
 * Where the addon and the supervisor are, in this order: the paths given to configure(), then HUGR_OMNI_ADDON and
 * HUGR_OMNI_SUPERVISOR (CI). An explicit addon requires its sibling supervisor unless explicitly overridden; it
 * never borrows a supervisor from another candidate. Otherwise look next to realpath(process.execPath) (the
 * CLI), then in ../omni from there (the desktop's CLI, run standalone from Resources/cli), then
 * process.resourcesPath/omni (the desktop), then this checkout's native/omni/target/{release,debug}.
 * A non-explicit location counts only when it holds both files, so a release addon never pairs a debug supervisor.
 */
export function locate(given: Paths = injected): Found {
  const explicit = {
    addon: given.addon ?? process.env.HUGR_OMNI_ADDON,
    supervisor: given.supervisor ?? process.env.HUGR_OMNI_SUPERVISOR,
  }
  if (explicit.addon !== undefined) {
    const found = { addon: explicit.addon, supervisor: explicit.supervisor ?? sibling(explicit.addon, SUPERVISOR) }
    const missing = Object.entries(found).filter(([, file]) => !existsSync(file))
    if (missing.length > 0)
      throw new Error(
        `hugr-omni: the configured ${missing.map(([kind, file]) => `${kind} ${file} does not exist`).join("; ")}.`,
      )
    return found
  }
  if (explicit.supervisor !== undefined && !existsSync(explicit.supervisor))
    throw new Error(`hugr-omni: the configured supervisor ${explicit.supervisor} does not exist.`)
  const resources = "resourcesPath" in process && typeof process.resourcesPath === "string" ? process.resourcesPath : ""
  const target = path.join(import.meta.dirname, "..", "..", "..", "native", "omni", "target")
  const binary = path.dirname(realpath(process.execPath))
  const locations = [
    { addon: path.join(binary, SHIPPED_ADDON), supervisor: path.join(binary, SUPERVISOR) },
    { addon: path.join(binary, "..", "omni", SHIPPED_ADDON), supervisor: path.join(binary, "..", "omni", SUPERVISOR) },
    ...(resources
      ? [{ addon: path.join(resources, "omni", SHIPPED_ADDON), supervisor: path.join(resources, "omni", SUPERVISOR) }]
      : []),
    ...["release", "debug"].map((profile) => ({
      addon: path.join(target, profile, BUILT_ADDON),
      supervisor: path.join(target, profile, SUPERVISOR),
    })),
  ]
  const pair = locations.find(
    (entry) => existsSync(entry.addon) && (explicit.supervisor !== undefined || existsSync(entry.supervisor)),
  )
  const addon = pair?.addon
  const supervisor = explicit.supervisor ?? pair?.supervisor
  if (addon && supervisor) return { addon, supervisor }
  throw new Error(
    [
      `hugr-omni is required (ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER) but its ${locations.some((entry) => existsSync(entry.addon)) ? "supervisor" : "addon"} was not found. Looked at:`,
      ...locations.map((entry) => `  ${entry.addon} + ${entry.supervisor}`),
      "Build it with `bun run omni:build`, or set HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR.",
    ].join("\n"),
  )
}
```

## F153

`packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — lines 139–174.

```typescript
 * The positive control for a test run (D-L1): a run with the flag on that made no omni spawn proved nothing about
 * omni, and a strict run must not have delegated. `expected` false (a focused run in which no test declared an omni
 * spawn, script/test-omni-control.ts) still fails a run that delegated without any omni spawn: it did spawn, just never
 * through omni. Undefined means the run passes.
 */
export function verdict(mode: "off" | "on" | "strict", counts: { spawns: number; delegations: number }, expected = true) {
  if (mode === "off") return
  if (counts.spawns === 0 && (expected || counts.delegations > 0))
    return `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=${mode === "on" ? "1" : mode}, but this run made no omni spawn${
      counts.delegations > 0 ? ` and delegated ${counts.delegations} spawn(s) to legacy` : ""
    }.`
  if (mode === "strict" && counts.delegations > 0)
    return `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict, but this run delegated ${counts.delegations} spawn(s) to legacy.`
}

/**
 * The environment of an omni child (D-L3), always used with inheritEnv:false: `base` (process.env unless given), then
 * `extra`, with undefined values dropped and HUGR_OMNI_* removed from the final object. On Windows names are
 * case-insensitive: a later layer's `Path` replaces an earlier `PATH`, and only one key survives.
 */
export function childEnv(extra?: Record<string, string | undefined>, base: Record<string, string | undefined> = process.env) {
  const env: Record<string, string> = {}
  const names = new Map<string, string>()
  for (const layer of [base, extra ?? {}]) {
    for (const [key, value] of Object.entries(layer)) {
      const folded = process.platform === "win32" ? key.toUpperCase() : key
      const previous = names.get(folded)
      if (previous !== undefined) delete env[previous]
      names.delete(folded)
      if (value === undefined || key.toUpperCase().startsWith("HUGR_OMNI_")) continue
      names.set(folded, key)
      env[key] = value
    }
  }
  return env
}
```

## F154

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 23–39.

```typescript
// Exited sessions stay observable (status, exit code, retained output) until removed explicitly.
// Cap retention so abandoned terminals do not accumulate unbounded buffers.
const EXITED_LIMIT = 25
const pty = lazy(() => import("#pty"))
const omniPty = lazy(() => import("./pty/omni").then((mod) => mod.load()))
// How long an omni tree gets to wind down when its session goes, and how long the layer finalizer waits for every
// pending stop: above ConPTY's declared 6 s close (integration plan, WP2).
const STOP_GRACE_MS = 2000
const FINALIZE_CAP = "7 seconds"

type Subscriber = {
  readonly onData: (chunk: string) => void
  readonly onEnd: (event: { exitCode?: number }) => void
  active: boolean
  detached: boolean
  pending: string[]
  end?: { exitCode?: number }
```

## F155

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 74–108.

```typescript
export type CreateOptions = {
  // Starts zsh or bash with marks the caller can trust (ShellMarks). Off unless asked or ORCHESTRA_SHELL_INTEGRATION is
  // set; other shells ignore it.
  readonly shellIntegration?: boolean
  // Runs command and args as given with only the given env (plus TERM and ORCHESTRA_TERMINAL): no login flag, nothing
  // inherited from the server process. For a caller that already built a confined command.
  readonly exact?: boolean
  // Called from the data and exit paths themselves, so a command that ends right after spawn is still seen whole,
  // which attach cannot offer once the session has exited.
  readonly observe?: {
    readonly onData: (chunk: string) => void
    readonly onExit: (exitCode: number) => void
  }
}

export type AttachInput = {
  // Absolute output cursor to replay from. -1 tails from the current end; omitted replays the full retained buffer.
  readonly cursor?: number
  // Callbacks fire synchronously from the native PTY data path; keep them non-blocking.
  readonly onData: (chunk: string) => void
  // Fired once when the session stops producing output: process exit (exitCode set), removal, or service teardown.
  readonly onEnd: (event: { exitCode?: number }) => void
}

export type Attachment = {
  // Retained output from the requested cursor to the current end.
  readonly replay: string
  // Absolute output cursor after replay.
  readonly cursor: number
  // The nonce this session's shell marks carry, when it was created with shellIntegration.
  readonly shellNonce?: string
  readonly write: (data: string) => void
  // Starts live delivery after the caller has applied replay and cursor metadata.
  readonly activate: () => void
  readonly detach: () => void
```

## F156

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 139–197.

```typescript
    const stopping = new Set<Promise<void>>()

    function notifyEnd(session: Active, event: { exitCode?: number }) {
      for (const subscriber of session.subscribers.values()) {
        if (!subscriber.active) {
          subscriber.end = event
          continue
        }
        try {
          subscriber.onEnd(event)
        } catch {}
      }
      session.subscribers.clear()
    }

    // `adopt`: the user closed the session, so a tree with live descendants may go to the adoption registry. Eviction
    // and the layer's end always stop what is left of the tree (for omni, also after the root exited).
    function teardown(session: Active, adopt: boolean) {
      for (const listener of session.listeners) listener.dispose()
      session.listeners.length = 0
      if (session.omni) {
        const pending = close(session.omni, session.info.title, adopt)
        stopping.add(pending)
        void pending.finally(() => stopping.delete(pending))
      }
      if (!session.omni && session.info.status === "running") {
        try {
          session.process.kill()
        } catch {}
      }
      notifyEnd(session, {})
    }

    async function close(omni: NonNullable<Active["omni"]>, title: string, adopt: boolean) {
      const adoption = adopt ? omni.adoption : undefined
      if (!adoption || !(await descendants(omni.proc))) return omni.proc.stop(STOP_GRACE_MS)
      // The adopted tree's output goes to the registry's ring from now on (R2-4), not to the closed session.
      const sink = OmniBackground.sink(omni.proc.child)
      omni.proc.redirect((data) => sink.write(data))
      const release = OmniAdoption.release(omni.proc.child, Exit.void, { title, graceMs: STOP_GRACE_MS }).pipe(
        Effect.provideService(OmniAdoption.Service, adoption.service),
      )
      return runPromise(
        adoption.registry ? release.pipe(Effect.provideService(OmniAdoption.Registry, adoption.registry)) : release,
      ).catch(() => omni.proc.stop(STOP_GRACE_MS))
    }

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        for (const session of sessions.values()) teardown(session, false)
        sessions.clear()
        exitOrder.length = 0
        if (stopping.size === 0) return
        yield* Effect.promise(() => Promise.allSettled([...stopping])).pipe(
          Effect.timeoutOption(FINALIZE_CAP),
          Effect.asVoid,
        )
      }),
    )
```

## F157

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 229–329.

```typescript
    const create = Effect.fn("Pty.create")(function* (input: CreateInput, options?: CreateOptions) {
      const id = PtyID.ascending()
      const command = input.command || Shell.preferred(Config.latest(yield* config.entries(), "shell"))
      const given =
        !options?.exact && Shell.login(command) ? [...(input.args ?? []), "-l"] : [...(input.args ?? [])]
      const cwd = input.cwd || location.directory
      const base = {
        ...(options?.exact ? {} : process.env),
        ...input.env,
        TERM: "xterm-256color",
        ORCHESTRA_TERMINAL: "1",
      } as Record<string, string>
      const integration = (options?.shellIntegration ?? (!options?.exact && Flag.ORCHESTRA_SHELL_INTEGRATION))
        ? yield* Effect.promise(() => ShellIntegration.prepare({ command, args: given, env: base }))
        : undefined
      const args = integration?.args ?? given
      const env = integration ? { ...base, ...integration.env } : base
      if (process.platform === "win32") {
        env.LC_ALL = "C.UTF-8"
        env.LC_CTYPE = "C.UTF-8"
        env.LANG = "C.UTF-8"
      }
      // Only given sizes reach the backend, so a create without them stays what it was.
      const size = {
        ...(input.cols === undefined ? {} : { cols: clampSize(input.cols) }),
        ...(input.rows === undefined ? {} : { rows: clampSize(input.rows) }),
      }
      const backend = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? "legacy" : "omni"
      // Argv and cwd can carry secrets and private paths: log the executable and the argument count only.
      yield* Effect.logInfo("creating session", { id, cmd: command.split(/[\\/]/).pop(), args: args.length, backend })
      const omni =
        backend === "omni"
          ? yield* Effect.gen(function* () {
              const { spawn } = yield* Effect.promise(() => omniPty())
              const proc = yield* Effect.sync(() => spawn(command, args, { name: "xterm-256color", cwd, env, ...size }))
              const service = Option.getOrUndefined(yield* Effect.serviceOption(OmniAdoption.Service))
              const registry = Option.getOrUndefined(yield* Effect.serviceOption(OmniAdoption.Registry))
              return { proc, ...(service ? { adoption: { service, registry } } : {}) }
            })
          : undefined
      const proc =
        omni?.proc ??
        (yield* Effect.gen(function* () {
          const { spawn } = yield* Effect.promise(() => pty())
          // A short command can exit right after spawn, and the backends only notify listeners attached when an event
          // fires (bun-pty 0.4.9 starts reading on a microtask; 0.4.8 read inside spawn and dropped such exits). Attach
          // onData and onExit below without an async step in between, or the session never leaves "running".
          return yield* Effect.sync(() => spawn(command, args, { name: "xterm-256color", cwd, env, ...size }))
        }))
      const info: Info = {
        id,
        title: input.title || `Terminal ${id.slice(-4)}`,
        command,
        args,
        cwd,
        status: "running",
        pid: proc.pid,
      }
      const announcements = ShellCwd.parser()
      const session: Active = {
        info,
        process: proc,
        buffer: "",
        bufferCursor: 0,
        cursor: 0,
        size: { cols: size.cols ?? 80, rows: size.rows ?? 24 },
        ...(integration ? { shellNonce: integration.nonce } : {}),
        subscribers: new Map(),
        listeners: [],
        ...(omni ? { omni } : {}),
      }
      sessions.set(id, session)
      session.listeners.push(
        proc.onData((chunk) => {
          session.cursor += chunk.length
          // The shell's own report of where it is, so a new terminal can start there. Info.cwd follows it.
          const announced = announcements.push(chunk)
          if (announced) session.info.cwd = announced
          options?.observe?.onData(chunk)
          for (const [token, subscriber] of session.subscribers.entries()) {
            if (!subscriber.active) {
              subscriber.pending.push(chunk)
              continue
            }
            try {
              subscriber.onData(chunk)
            } catch {
              session.subscribers.delete(token)
            }
          }
          session.buffer += chunk
          if (session.buffer.length <= BUFFER_LIMIT) return
          // Never keep half of a surrogate pair at the start of the ring.
          const excess = PtyProtocol.cut(session.buffer, session.buffer.length - BUFFER_LIMIT)
          session.buffer = session.buffer.slice(excess)
          session.bufferCursor += excess
        }),
        proc.onExit(({ exitCode }) => {
          if (session.info.status === "exited") return
          session.info.status = "exited"
          session.info.exitCode = exitCode
```

## F158

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 370–423.

```typescript
      const subscriber: Subscriber = {
        onData: input.onData,
        onEnd: input.onEnd,
        active: false,
        detached: false,
        pending: [],
      }
      // An exited session still serves its retained output: the client gets the replay, then the end.
      if (session.info.status === "running") session.subscribers.set(token, subscriber)
      else subscriber.end = { exitCode: session.info.exitCode }
      const start = session.bufferCursor
      const end = session.cursor
      const from =
        input.cursor === -1
          ? end
          : typeof input.cursor === "number" && Number.isSafeInteger(input.cursor)
            ? Math.max(0, input.cursor)
            : 0
      // The ring dropped output this client never saw, so the replay starts mid-stream: reset the terminal rather than
      // paint garbage over its old screen, and nudge the program to redraw once the replay is queued.
      const gap = from < start
      const replay = (() => {
        if (!session.buffer || from >= end) return ""
        if (gap) return GAP_RESET + PtyProtocol.afterFirstLine(session.buffer)
        const offset = Math.max(0, from - start)
        if (offset >= session.buffer.length) return ""
        return session.buffer.slice(offset)
      })()
      return {
        replay,
        cursor: end,
        ...(session.shellNonce ? { shellNonce: session.shellNonce } : {}),
        write: (data: string) => {
          if (session.info.status === "running") session.process.write(data)
        },
        activate: () => {
          if (subscriber.active || subscriber.detached) return
          subscriber.active = true
          if (gap && session.info.status === "running") repaint(session)
          try {
            for (const chunk of subscriber.pending) subscriber.onData(chunk)
            subscriber.pending.length = 0
            if (subscriber.end) subscriber.onEnd(subscriber.end)
          } catch {
            session.subscribers.delete(token)
          }
        },
        detach: () => {
          subscriber.detached = true
          subscriber.pending.length = 0
          subscriber.end = undefined
          session.subscribers.delete(token)
        },
      }
```

## F159

`.orchestra/skills/terminal-maintenance/SKILL.md:610fa93e3ec385790509b0c7fd0181fd30adc727` — lines 10–29.

```text
## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Session, ring buffer, replay gap, repaint | `packages/core/src/pty.ts` | One implementation serves both HTTP surfaces (legacy handlers and `@orchestra/server`); change both or neither |
| Wire framing (meta frame, cut, afterFirstLine) | `packages/core/src/pty/protocol.ts` | A protocol change needs `bun run generate` in `packages/client` |
| Shell marks (OSC 133) | `pty/shell-marks.ts`, `pty/shell-integration.ts` | Marks count only with the session nonce; zsh and bash on posix; opt-in per create |
| Shell cwd (OSC 7) | `pty/shell-cwd.ts`, `Info.cwd` in `pty.ts` | A hint, never a boundary: no nonce, any output can print one; the new-terminal default only |
| Agent command in a tab | `packages/core/src/tool/agent-terminal.ts` | Behind `ORCHESTRA_AGENT_TERMINAL`; only the foreground block of the V2 `bash.ts`. The app's chat reaches it through V2 by default; the V1 shell tool (legacy sidecar fallback only) is deliberately not wired |
| Client write path (sync output 2026) | `packages/app-shell/src/utils/terminal-writer.ts` | Holds a DEC 2026 frame until it closes or 250 ms pass |
| Emulator | `ghostty-web`, pinned fork | Swap only behind the plan's plan B, after a failing Phase 1 test |

## Invariants

- The agent runner never loosens the bash tool: permissions, git safety, `ToolSafetySandbox.wrap`, `OutputInspector`, the 1 MiB cap, timeout and kill-on-abort stay identical. A divergence between the two runners blocks the change.
- `Pty.create` with `exact: true` never reads `process.env` and never adds `-l`. The default path is unchanged.
- Model-facing terminal text goes through `AgentTerminal.sanitize` (no CSI/OSC incl. OSC 52, `\r` overwrite, no control characters). Terminal output is data, never instruction.
- Spawn only through the existing PTY service/omni; `bun run check:spawn-imports` must stay green.
- The `claude-code` engine runs its own Bash outside `bash.ts`, so it never gets an agent tab (decision D-4, recorded in `docs/specs/terminal/agent-terminal-approval.md`). The plugin `shell.env` hook is not applied to the agent's environment; keep it that way unless the sandbox scrubs the result.
- Known limit: a WebSocket client that stops reading grows server memory (`ws.send` never awaits; `writableLength` reads 0 under Bun). Not solved; do not add a bound that cannot trigger.
```

## F160

`packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084` — lines 149–215.

```typescript
    const ctx = { directory: location.directory, worktree: location.project.directory, project: location.project }

    const flags = { experimentalLspTy: process.env.ORCHESTRA_EXPERIMENTAL_LSP_TY === "true", disableLspDownload: process.env.ORCHESTRA_DISABLE_LSP_DOWNLOAD === "true" }

    // A project's LSP commands are code the repository chose to run: they apply only once the user trusts the project.
    const entries = Effect.fnUntraced(function* () {
      const all = yield* config.entries()
      const allowed = ConfigTrust.runnable(all, global.config, location.directory)
      if (all.some((entry) => !allowed.includes(entry) && entry.type === "document" && entry.info.lsp !== undefined))
        yield* Effect.logWarning(`Project LSP config ignored. ${ConfigTrust.approveHint(location.directory)}`)
      return allowed
    })

    const state = yield* Effect.acquireRelease(
      Effect.gen(function* () {
        const cfg = { lsp: Config.latest(yield* entries(), "lsp") }

        const servers: Record<string, LSPServer.Info> = {}

        if (!cfg.lsp) {
          yield* Effect.logInfo("all LSPs are disabled")
        } else {
          for (const server of Object.values(LSPServer)) {
            servers[server.id] = server
          }

          filterExperimentalServers(servers, flags)

          if (cfg.lsp && cfg.lsp !== true) {
            for (const [name, item] of Object.entries(cfg.lsp)) {
              const existing = servers[name]
              const entry = item as { disabled?: boolean; command?: string[]; extensions?: string[]; env?: Record<string,string>; initialization?: Record<string, unknown> }
              if (entry.disabled) {
                yield* Effect.logInfo(`LSP server ${name} is disabled`)
                delete servers[name]
                continue
              }
              servers[name] = {
                ...existing,
                id: name,
                root: existing?.root ?? (async (_file, ctx) => ctx.directory),
                extensions: entry.extensions ?? existing?.extensions ?? [],
                // A configured command is trusted like any configured program, unless it runs workspace code: the program
                // lives in the workspace, is a runner (npx, uv run, ...) or is a version-manager shim.
                spawn: async (root) => ({
                  process: (await ToolSafetySandbox.runsWorkspaceCode(ctx.directory, entry.command![0], entry.command!.slice(1), root))
                    ? await confined(entry.command![0], entry.command!.slice(1), { cwd: root, env: { ...process.env, ...entry.env } })
                    : await lspspawn(entry.command![0], entry.command!.slice(1), { cwd: root, env: { ...process.env, ...entry.env } }),
                  initialization: entry.initialization,
                }),
              }
            }
          }

          yield* Effect.logInfo("enabled LSP servers", {
            serverIds: Object.values(servers)
              .map((server) => server.id)
              .join(", "),
          })
        }

        const s: State = {
          closing: false,
          clients: [],
          servers,
          broken: new Set(),
          spawning: new Map(),
```

## F161

`packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084` — lines 223–282.

```typescript
    const getClients = Effect.fnUntraced(function* (file: string) {
      const ctx = { directory: location.directory, worktree: location.project.directory, project: location.project }
      if (!FSUtil.contains(ctx.directory, file) && !FSUtil.contains(ctx.project.directory, file)) return [] as LSPClient.Info[]
      const s = state
      const clients = yield* Effect.promise(async () => {
        const extension = path.parse(file).ext || file
        const result: LSPClient.Info[] = []
        let updated = 0

        await LSPOwnership.prune(s)
        if (s.closing) return { result, updated }
        for (const server of Object.values(s.servers)) {
          if (server.extensions.length && !server.extensions.includes(extension)) continue

          const root = await server.root(file, ctx)
          if (s.closing) break
          if (!root) continue
          if (s.broken.has(root + server.id)) continue

          const match = s.clients.find((x) => x.root === root && x.serverID === server.id)
          if (match?.connected) {
            result.push(match)
            continue
          }

          const inflight = s.spawning.get(root + server.id)
          if (inflight) {
            const client = await inflight
            if (!client) continue
            result.push(client)
            continue
          }

          // The cleanup is part of the awaited task, so a rejected spawn leaves no orphaned rejection behind.
          const task: Promise<LSPClient.Info | undefined> = LSPOwnership.schedule(s, {
            server,
            root,
            key: root + server.id,
            ctx,
            flags,
          }).finally(() => {
            if (s.spawning.get(root + server.id) === task) {
              s.spawning.delete(root + server.id)
            }
          })
          s.spawning.set(root + server.id, task)

          const client = await task
          if (!client) continue

          result.push(client)
          updated++
        }

        return { result, updated }
      })
      yield* Effect.forEach(Array.from({ length: clients.updated }), () => events.publish(Event.Updated, {}), {
        discard: true,
      })
      return clients.result
```

## F162

`packages/core/src/format/format.ts:0198f9c0d4aa4a9e1452339ca5c3302611478aba` — lines 46–62.

```typescript
            Effect.map((result) => ({ code: result.exitCode, text: result.stdout.toString() })),
            Effect.catch(() => Effect.succeed({ code: 1, text: "" })),
          ),
        ),
    }

    // A project's formatter commands are code the repository chose to run: they apply only once the user trusts the project.
    let warned = false
    const entries = Effect.fnUntraced(function* () {
      const all = yield* config.entries()
      const allowed = ConfigTrust.runnable(all, global.config, location.directory)
      if (!warned && all.some((entry) => !allowed.includes(entry) && entry.type === "document" && entry.info.formatter !== undefined)) {
        warned = true
        yield* Effect.logWarning(`Project formatter config ignored. ${ConfigTrust.approveHint(location.directory)}`)
      }
      return allowed
    })
```

## F163

`packages/core/src/format/format.ts:0198f9c0d4aa4a9e1452339ca5c3302611478aba` — lines 73–158.

```typescript
    // Probing a formatter can resolve or install its package, so an enabled command is kept for the Location's life.
    const commands = new Map<string, string[]>()
    const command = (formatter: Info) =>
      Effect.promise(async () => {
        const cached = commands.get(formatter.name)
        if (cached) return cached
        const found = await formatter.enabled(context).catch(() => false as const)
        if (found) commands.set(formatter.name, found)
        return found
      })

    const file = Effect.fn("Format.file")(function* (filepath: string) {
      const extension = path.extname(filepath)
      const formatters = configured(Config.latest(yield* entries(), "formatter")).filter((item) =>
        item.extensions.includes(extension),
      )
      const matched = (yield* Effect.forEach(formatters, (item) =>
        command(item).pipe(Effect.map((cmd) => (cmd ? { item, cmd } : undefined))),
      )).filter((entry) => entry !== undefined)
      if (!matched.length) return false
      yield* Effect.forEach(matched, (entry) => run(entry.item, entry.cmd, filepath), { discard: true })
      return true
    })

    const run = Effect.fnUntraced(function* (item: Info, cmd: string[], filepath: string) {
      const replaced = cmd.map((part) => part.replace("$FILE", filepath))
      const directory = location.directory
      // A trusted formatter still runs workspace code when its program resolves into the workspace, is a runner
      // (npx, uv run, ...) or is a version-manager shim.
      const confine =
        item.confine ??
        ((yield* Effect.promise(() =>
          ToolSafetySandbox.runsWorkspaceCode(directory, replaced[0]!, replaced.slice(1), directory),
        ))
          ? "file"
          : undefined)
      const source = confine === "stdin" ? yield* Effect.promise(() => readSource(filepath, directory)) : undefined
      if (confine === "stdin" && !source)
        return yield* Effect.logError("failed to format file", { error: "outside the workspace", command: cmd, file: filepath })
      const input = source?.content
      const result = yield* Effect.scoped(
        Effect.gen(function* () {
          if (!confine)
            return yield* appProcess.run(
              ChildProcess.make(replaced[0]!, replaced.slice(1), {
                cwd: directory,
                env: item.environment,
                extendEnv: true,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              }),
            )
          const launch = yield* ToolSafetySandbox.confine({
            command: replaced[0]!,
            args: replaced.slice(1),
            cwd: directory,
            env: { ...process.env, ...item.environment },
            write: input ? [] : [filepath],
          })
          return yield* appProcess.run(
            ChildProcess.make(launch.command, launch.args, {
              cwd: directory,
              env: launch.env,
              extendEnv: false,
              stdin: "ignore",
              stdout: input ? "pipe" : "ignore",
              stderr: "ignore",
            }),
            input ? { stdin: input } : undefined,
          )
        }),
      ).pipe(
        Effect.catch((error) =>
          Effect.logError("failed to format file", {
            error: error instanceof ToolSafety.Denied ? "sandbox refused" : "spawn failed",
            command: cmd,
            file: filepath,
          }).pipe(Effect.as(undefined)),
        ),
      )
      if (result && result.exitCode !== 0) yield* Effect.logError("failed", { command: cmd, file: filepath })
      // Empty output for a non-empty file is a formatter that wrote nothing, never a formatted result.
      if (result?.exitCode === 0 && source && result.stdout.length > 0 && !result.stdout.equals(source.content))
        yield* Effect.promise(() => writeBack(source, result.stdout))
    })
```

## F164

`packages/core/src/installation/service.ts:4a75cd0fdf8467866c10c692987769751edd0f42` — lines 156–196.

```typescript
      }),
      latest: Effect.fn("Installation.latest")(
        function* () {
          const response = yield* http.execute(
            HttpClientRequest.get("https://api.github.com/repos/gustavomhss/hugr-orchestra/releases/latest").pipe(
              HttpClientRequest.acceptJson,
            ),
          )
          const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
          return data.tag_name.replace(/^v/, "")
        },
        // A failed lookup must never break startup or the update notice: report the running version.
        Effect.catchCause(() => Effect.succeed(InstallationVersion)),
      ),
      upgrade: Effect.fn("Installation.upgrade")(function* (method: Method, target: string) {
        const command = upgradeCommand(method, target)
        if (typeof command === "string") return yield* new UpgradeFailedError({ stderr: command })
        const outcome = yield* run(command)
        if (outcome.code === 0) return
        return yield* new UpgradeFailedError({
          stderr: outcome.stderr.trim() || `${command.join(" ")} failed (exit code ${outcome.code}).`,
        })
      }),
    }

    return Service.of(result)
  }),
)

// The argv that upgrades this install, or the instruction to show when Orchestra cannot upgrade it itself.
export function upgradeCommand(method: Method, target: string): string[] | string {
  if (method === "npm") return ["npm", "install", "-g", `${PACKAGE}@${target}`]
  if (method === "pnpm") return ["pnpm", "add", "-g", `${PACKAGE}@${target}`]
  if (method === "bun") return ["bun", "add", "-g", `${PACKAGE}@${target}`]
  if (method === "yarn") return ["yarn", "global", "add", `${PACKAGE}@${target}`]
  if (method === "curl")
    return "Download the release archive from https://github.com/gustavomhss/hugr-orchestra/releases and run its install.sh."
  if (method === "desktop") return "This CLI belongs to the Orchestra desktop app. Update the desktop app instead."
  if (method === "scoop" || method === "choco")
    return `Orchestra has no ${method} package. Reinstall with npm i -g ${PACKAGE}.`
  return "Orchestra could not tell how it was installed. Reinstall with npm i -g @humanguardrail/cli."
```

## F165

`packages/core/src/observability/otlp.ts:4d403d30bded809a37d426a8c56361ca8d66ddf7` — lines 7–18.

```typescript
const endpoint = Flag.OTEL_EXPORTER_OTLP_ENDPOINT

const headers = Flag.OTEL_EXPORTER_OTLP_HEADERS
  ? Flag.OTEL_EXPORTER_OTLP_HEADERS.split(",").reduce(
      (acc, entry) => {
        const [key, ...value] = entry.split("=")
        acc[key] = value.join("=")
        return acc
      },
      {} as Record<string, string>,
    )
  : undefined
```

## F166

`packages/core/src/observability/otlp.ts:4d403d30bded809a37d426a8c56361ca8d66ddf7` — lines 36–76.

```typescript
export function resource(): { serviceName: string; serviceVersion: string; attributes: Record<string, string> } {
  return {
    serviceName: "orchestra",
    serviceVersion: InstallationVersion,
    attributes: {
      ...resourceAttributes(),
      "deployment.environment.name": InstallationChannel,
      "orchestra.client": Flag.ORCHESTRA_CLIENT,
      "orchestra.run": runID,
      "service.instance.id": runID,
    },
  }
}

export function loggers() {
  if (!endpoint) return []
  return [OtlpLogger.make({ url: `${endpoint}/v1/logs`, resource: resource(), headers })]
}

export async function tracingLayer() {
  if (!endpoint) return Layer.empty
  const NodeSdk = await import("@effect/opentelemetry/NodeSdk")
  const OTLP = await import("@opentelemetry/exporter-trace-otlp-http")
  const SdkBase = await import("@opentelemetry/sdk-trace-base")
  const { AsyncLocalStorageContextManager } = await import("@opentelemetry/context-async-hooks")
  const { context } = await import("@opentelemetry/api")

  // The Effect Node SDK does not register a global context manager, but the AI SDK uses it to parent spans.
  const manager = new AsyncLocalStorageContextManager()
  manager.enable()
  context.setGlobalContextManager(manager)

  return NodeSdk.layer(() => ({
    resource: resource(),
    spanProcessor: new SdkBase.BatchSpanProcessor(
      new OTLP.OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
        headers,
      }),
    ),
  }))
```

## F167

`packages/core/src/provider.ts:56a8629db307e3d904c355789db9e5b8256e644f` — lines 1–25.

```typescript
export * as ProviderV2 from "./provider"

import { Types } from "effect"
import { Provider } from "@orchestra/schema/provider"

export const ID = Provider.ID
export type ID = typeof ID.Type

export const AISDK = Provider.AISDK

export const Native = Provider.Native

export const Api = Provider.Api
export type Api = Provider.Api
export type MutableApi<T extends Api = Api> = T extends Api
  ? Omit<Types.DeepMutable<T>, "settings"> & (undefined extends T["settings"] ? { settings?: any } : { settings: any })
  : never

export const Request = Provider.Request
export type Request = Provider.Request

export const Info = Provider.Info
export type Info = Provider.Info

export type MutableInfo = Omit<Types.DeepMutable<Info>, "api"> & { api: MutableApi }
```

## F168

`packages/core/src/model.ts:085800e0480c60a70f989469ba7c0dc09aa758eb` — lines 1–42.

```typescript
import { Types } from "effect"
import { Model } from "@orchestra/schema/model"
import { ProviderV2 } from "./provider"

export const ID = Model.ID
export type ID = typeof ID.Type

export const VariantID = Model.VariantID
export type VariantID = typeof VariantID.Type

// Grouping of models, eg claude opus, claude sonnet
export const Family = Model.Family
export type Family = Model.Family

export const Capabilities = Model.Capabilities
export type Capabilities = Model.Capabilities

export const Cost = Model.Cost
export type Cost = Model.Cost

export const Ref = Model.Ref
export type Ref = typeof Ref.Type

export const Api = Model.Api
export type Api = Model.Api

export const Info = Model.Info
export type Info = Model.Info

export type MutableInfo = Omit<Types.DeepMutable<Info>, "api"> & {
  api: ProviderV2.MutableApi<Api>
}

export function parse(input: string): { providerID: ProviderV2.ID; modelID: ID } {
  const [providerID, ...modelID] = input.split("/")
  return {
    providerID: ProviderV2.ID.make(providerID),
    modelID: ID.make(modelID.join("/")),
  }
}

export * as ModelV2 from "./model"
```

## F169

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 84–122.

```typescript
    const available = (provider: ProviderV2.Info, integration: Integration.Info | undefined) => {
      if (provider.disabled) return false
      const key = provider.request.body.apiKey ?? provider.api.settings?.apiKey
      if (typeof key === "string" && (provider.id !== ProviderV2.ID.opencode || (key.length > 0 && key !== "public")))
        return true
      if (integration?.connections.length) return true
      if (provider.id === ProviderV2.ID.opencode) return false
      return provider.integrationID === undefined && !integration
    }

    const projectModel = (model: ModelV2.Info, provider: ProviderV2.Info) => {
      // A model without its own package takes the provider's, and its own URL when it has one.
      const api =
        model.api.type === "native" && Object.keys(model.api.settings).length === 0 && provider.api.type === "aisdk"
          ? { ...provider.api, id: model.api.id, url: model.api.url ?? provider.api.url }
          : model.api.type === "native" && !model.api.url && Object.keys(model.api.settings).length === 0
          ? { ...provider.api, id: model.api.id }
          : model.api.type === "aisdk" && provider.api.type === "aisdk" && !model.api.url
            ? { ...model.api, url: provider.api.url, settings: { ...provider.api.settings, ...model.api.settings } }
            : model.api.type === "aisdk" && provider.api.type === "aisdk"
              ? { ...model.api, settings: { ...provider.api.settings, ...model.api.settings } }
              : model.api
      const request = {
        headers: { ...provider.request.headers, ...model.request.headers },
        body: { ...provider.request.body, ...model.request.body },
        variant: model.request.variant,
      }
      return ModelV2.Info.make({
        ...model,
        api,
        request,
      })
    }

    const normalizeApi = (item: ProviderV2.MutableInfo | ModelV2.MutableInfo) => {
      if (typeof item.request.body.baseURL !== "string") return
      item.api.url = item.request.body.baseURL
      delete item.request.body.baseURL
    }
```

## F170

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 124–188.

```typescript
    const state = State.create<Data, Draft>({
      initial: () => ({ providers: new Map() }),
      draft: (draft) => {
        const result: Draft = {
          provider: {
            list: () => Array.fromIterable(draft.providers.values()) as ProviderRecord[],
            get: (providerID) => draft.providers.get(providerID),
            update: (providerID, fn) => {
              let current = draft.providers.get(providerID)
              if (!current) {
                current = {
                  provider: ProviderV2.Info.empty(providerID) as ProviderV2.MutableInfo,
                  models: new Map<ModelV2.ID, ModelV2.MutableInfo>(),
                }
                draft.providers.set(providerID, current)
              }
              fn(current.provider)
              normalizeApi(current.provider)
            },
            remove: (providerID) => {
              draft.providers.delete(providerID)
            },
          },
          model: {
            get: (providerID, modelID) => draft.providers.get(providerID)?.models.get(modelID),
            update: (providerID, modelID, fn) => {
              let record = draft.providers.get(providerID)
              if (!record) {
                record = {
                  provider: ProviderV2.Info.empty(providerID) as ProviderV2.MutableInfo,
                  models: new Map<ModelV2.ID, ModelV2.MutableInfo>(),
                }
                draft.providers.set(providerID, record)
              }
              const model =
                record.models.get(modelID) ?? (ModelV2.Info.empty(providerID, modelID) as ModelV2.MutableInfo)
              if (!record.models.has(modelID)) record.models.set(modelID, model)
              fn(model)
              model.id = modelID
              model.providerID = providerID
              normalizeApi(model)
            },
            remove: (providerID, modelID) => {
              draft.providers.get(providerID)?.models.delete(modelID)
            },
            default: {
              get: () => draft.defaultModel,
              set: (providerID, modelID) => {
                draft.defaultModel = { providerID, modelID }
              },
            },
          },
        }
        return result
      },
      finalize: Effect.fn("CatalogV2.finalize")(function* (catalog) {
        if (policy.hasStatements()) {
          for (const record of [...catalog.provider.list()]) {
            if ((yield* policy.evaluate("provider.use", record.provider.id, "allow")) === "deny") {
              catalog.provider.remove(record.provider.id)
            }
          }
        }
        yield* events.publish(Event.Updated, {})
      }),
```

## F171

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 191–312.

```typescript
    // Projects one virtual provider per labeled API-key credential so each
    // key is independently selectable. Unlabeled credentials keep the legacy
    // behavior of merging into the base provider entry.
    const virtualEntries = Effect.fn("CatalogV2.virtuals")(function* () {
      const keyed = (yield* credentials.all()).filter(
        (credential) => credential.value.type === "key" && credential.label !== "default",
      )
      if (keyed.length === 0) return [] as ProviderRecord[]
      const records = state.get().providers
      const byIntegration = new Map<string, ProviderRecord[]>()
      for (const record of records.values()) {
        const owner = record.provider.integrationID ?? record.provider.id
        const list = byIntegration.get(owner) ?? []
        list.push(record)
        byIntegration.set(owner, list)
      }
      const entries: ProviderRecord[] = []
      for (const credential of keyed) {
        for (const record of byIntegration.get(credential.integrationID) ?? []) {
          const id = `${record.provider.id}${VIRTUAL_SEPARATOR}${credential.id}` as ProviderV2.ID
          entries.push({
            provider: {
              ...record.provider,
              id,
              name: `${record.provider.name} (${credential.label})`,
              integrationID: record.provider.integrationID ?? Integration.ID.make(record.provider.id),
            },
            models: record.models,
          })
        }
      }
      return entries
    })

    // These take the virtual entries as input so one request reads credentials once
    // instead of once per helper (credentials.all hits the DB and decrypts).
    const availableProviders = Effect.fn("CatalogV2.provider.availableWith")(function* (virtuals: ProviderRecord[]) {
      const virtualIDs = new Set(virtuals.map((entry) => entry.provider.id))
      const active = new Map((yield* integrations.list()).map((integration) => [integration.id, integration]))
      const base = Array.fromIterable(state.get().providers.values()).map((record) => record.provider)
      return [...base, ...virtuals.map((entry) => entry.provider)].filter((provider) => {
        if (virtualIDs.has(provider.id)) return !provider.disabled
        return available(provider, active.get(provider.integrationID ?? Integration.ID.make(provider.id)))
      })
    })

    const projectModels = (virtuals: ProviderRecord[]) =>
      pipe(
        [...Array.fromIterable(state.get().providers.values()), ...virtuals],
        Array.flatMap((record) => {
          const parsed = parseVirtualID(record.provider.id)
          return Array.fromIterable(record.models.values()).map((model) =>
            projectModel(parsed ? { ...model, providerID: record.provider.id } : model, record.provider),
          )
        }),
        Array.sortWith((item) => item.time.released, Order.flip(Order.Number)),
      )

    const result: Interface = {
      transform: state.transform,
      reload: state.reload,

      provider: {
        get: Effect.fn("CatalogV2.provider.get")(function* (providerID) {
          const hit = state.get().providers.get(providerID)?.provider
          if (hit) return hit
          if (!parseVirtualID(providerID)) return undefined
          return (yield* virtualEntries()).find((entry) => entry.provider.id === providerID)?.provider
        }),

        all: Effect.fn("CatalogV2.provider.all")(function* () {
          const base = Array.fromIterable(state.get().providers.values()).map((record) => record.provider)
          const virtual = (yield* virtualEntries()).map((entry) => entry.provider)
          return [...base, ...virtual]
        }),

        available: Effect.fn("CatalogV2.provider.available")(function* () {
          return yield* availableProviders(yield* virtualEntries())
        }),
      },

      model: {
        get: Effect.fn("CatalogV2.model.get")(function* (providerID, modelID) {
          const parsed = parseVirtualID(providerID)
          const record = state.get().providers.get(parsed?.base ?? providerID)
          if (!record) return
          const model = record.models.get(modelID)
          if (!model) return
          if (!parsed) return projectModel(model, record.provider)
          const virtual = (yield* virtualEntries()).some((entry) => entry.provider.id === providerID)
          if (!virtual) return
          return projectModel({ ...model, providerID }, record.provider)
        }),

        all: Effect.fn("CatalogV2.model.all")(function* () {
          return projectModels(yield* virtualEntries())
        }),

        available: Effect.fn("CatalogV2.model.available")(function* () {
          const virtuals = yield* virtualEntries()
          const providers = new Set((yield* availableProviders(virtuals)).map((provider) => provider.id))
          return projectModels(virtuals).filter((model) => providers.has(model.providerID) && model.enabled)
        }),

        default: Effect.fn("CatalogV2.model.default")(function* () {
          const defaultModel = state.get().defaultModel
          const models = yield* result.model.available()
          if (defaultModel) {
            const model = models.find(
              (item) => item.providerID === defaultModel.providerID && item.id === defaultModel.modelID,
            )
            if (model) return model
          }

          return Option.getOrUndefined(
            pipe(
              models,
              Array.sortWith((item) => item.time.released, Order.flip(Order.Number)),
              Array.head,
            ),
          )
        }),
```

## F172

`packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — lines 132–338.

```typescript
export const sessionHeaders = (model: Model, sessionID: string, parentID?: string) => ({
  "x-session-affinity": sessionID,
  "X-Session-Id": sessionID,
  ...(parentID ? { "x-parent-session-id": parentID } : {}),
  // OpenCode Go refuses a call without its own session header (400 MissingSessionID); Zen takes the same header.
  ...(model.provider === "opencode" || model.provider === "opencode-go" ? { "x-opencode-session": sessionID } : {}),
})

const apiKey = (model: ModelV2.Info, credential?: Credential.Value) => {
  if (credential?.type === "key") return Auth.value(credential.key)
  if (credential?.type === "oauth") return Auth.value(credential.access)
  const value = model.request.body.apiKey ?? model.api.settings?.apiKey
  if (typeof value === "string") return Auth.value(value)
}

const withDefaults = (model: ModelV2.Info, route: AnyRoute, generation: GenerationOptions) => {
  const body = model.request.body
  const httpBody = Object.hasOwn(body, "apiKey")
    ? Object.fromEntries(Object.entries(body).filter(([key]) => key !== "apiKey"))
    : body
  return route.with({
    provider: model.providerID,
    endpoint: model.api.url === undefined ? undefined : { baseURL: model.api.url },
    headers: model.request.headers,
    http: { body: httpBody },
    limits: {
      context: model.limit.context,
      ...(model.limit.input === undefined ? {} : { input: model.limit.input }),
      output: model.limit.output,
    },
    generation,
  })
}

const withVariant = (
  model: ModelV2.Info,
  variantID: ModelV2.VariantID | undefined,
): Effect.Effect<ModelV2.Info, VariantUnavailableError> => {
  const id = variantID === "default" || variantID === undefined ? model.request.variant : variantID
  const variant = model.variants.find((item) => item.id === id)
  if (!variant && variantID !== undefined && variantID !== "default")
    return Effect.fail(
      new VariantUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        variant: variantID,
      }),
    )
  return Effect.succeed(
    variant
      ? produce(model, (draft) => {
          Object.assign(draft.request.headers, variant.headers)
          Object.assign(draft.request.body, variant.body)
        })
      : model,
  )
}

const apiName = (model: ModelV2.Info) =>
  model.api.type === "aisdk" ? `${model.api.type}:${model.api.package}` : model.api.type

export const fromCatalogModel = (
  model: ModelV2.Info,
  credential?: Credential.Value,
): Effect.Effect<Model, UnsupportedApiError | ModelUnavailableError> => {
  // Native V2 api.settings.generation uses canonical LLM options, not http.body.
  // Strict decoding rejects misspellings/coercion; absence keeps empty defaults.
  const generation = Schema.decodeUnknownOption(GenerationOptions, { onExcessProperty: "error" })(
    model.api.settings?.generation === undefined ? {} : model.api.settings.generation,
  )
  if (Option.isNone(generation))
    return Effect.fail(
      new ModelUnavailableError({
        providerID: model.providerID,
        modelID: model.id,
        cause: "Invalid api.settings.generation: expected canonical GenerationOptions",
      }),
    )
  const resolved =
    credential?.type !== "key" || credential.metadata === undefined
      ? model
      : produce(model, (draft) => {
          Object.assign(draft.request.body, credential.metadata)
        })
  const key = apiKey(resolved, credential)
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/openai") {
    return Effect.succeed(
      withDefaults(resolved, OpenAIResponses.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (resolved.api.type === "aisdk" && resolved.api.package === "@ai-sdk/anthropic") {
    return Effect.succeed(
      withDefaults(resolved, AnthropicMessages.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.header("x-api-key", key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  if (openAICompatible(resolved)) {
    return Effect.succeed(
      withDefaults(resolved, OpenAICompatibleChat.route, generation.value)
        .with({ auth: key === undefined ? Auth.none : Auth.bearer(key) })
        .model({ id: resolved.api.id }),
    ).pipe(Effect.map((value) => withPrices(withReference(value, model), model)))
  }
  return Effect.fail(
    new UnsupportedApiError({
      providerID: resolved.providerID,
      modelID: resolved.id,
      api: apiName(resolved),
    }),
  )
}

const withPrices = (value: Model, model: ModelV2.Info) => {
  prices.set(value, model.cost)
  return value
}

export const resolve = (session: SessionSchema.Info, model: ModelV2.Info, credential?: Credential.Value) =>
  withVariant(model, session.model?.variant).pipe(
    Effect.flatMap((model) => fromCatalogModel(model, credential)),
    Effect.map((value) =>
      withReference(value, { id: model.id, providerID: model.providerID, variant: session.model?.variant }),
    ),
  )

export const supported = (model: ModelV2.Info) =>
  openAICompatible(model) ||
  (model.api.type === "aisdk" && (model.api.package === "@ai-sdk/openai" || model.api.package === "@ai-sdk/anthropic"))

// A native model with an endpoint and no package speaks the OpenAI-compatible chat API, the earlier runtime's default
// package. OpenRouter's own AI SDK package is a client for the same chat API.
const openAICompatible = (model: ModelV2.Info) =>
  model.api.url !== undefined &&
  (model.api.type === "native" ||
    model.api.package === "@ai-sdk/openai-compatible" ||
    model.api.package === "@openrouter/ai-sdk-provider")

/** Resolves models from the catalog belonging to the current Location runtime. */
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    const integrations = yield* Integration.Service
    const policies = yield* SessionSubagentModels.Service
    return Service.of({
      resolve: Effect.fn("SessionRunnerModel.resolve")(function* (session) {
        // Location plugins populate and filter the catalog asynchronously during layer startup.
        const ceilings = yield* policies.forSession(session.id)
        if (session.model && !SessionSubagentModels.permits(ceilings, session.model))
          return yield* new SessionSubagentModels.ModelDeniedError({
            sessionID: session.id,
            model: session.model,
            reason: "not-allowed",
          })
        const candidates = (yield* catalog.model.available()).filter((model) =>
          SessionSubagentModels.permits(ceilings, model),
        )
        const defaultModel = session.model || candidates.length === 0 ? undefined : yield* catalog.model.default()
        const selected = session.model
          ? candidates.find((model) => model.providerID === session.model?.providerID && model.id === session.model.id)
          : (candidates.find(
              (model) =>
                model.providerID === defaultModel?.providerID && model.id === defaultModel.id && supported(model),
            ) ?? candidates.find(supported))
        if (!selected && session.model)
          return yield* new ModelUnavailableError({
            providerID: session.model.providerID,
            modelID: session.model.id,
          })
        if (!selected) return yield* new ModelNotSelectedError({ sessionID: session.id })
        return yield* resolve(session, selected, yield* credential(catalog, integrations, selected))
      }),
    })
  }),
)

/**
 * The credential a catalog model runs with: a virtual provider's own credential connection, else the provider's
 * active connection. Also used to run a model outside any Session (the Atlas screen's one-shot model calls).
 */
export const credential = Effect.fn("SessionRunnerModel.credential")(function* (
  catalog: Catalog.Interface,
  integrations: Integration.Interface,
  selected: ModelV2.Info,
) {
  const provider = yield* catalog.provider.get(selected.providerID)
  const virtual = Catalog.parseVirtualID(selected.providerID)
  const baseID = virtual?.base ?? selected.providerID
  const fallback = provider?.integrationID ?? Integration.ID.make(baseID)
  if (virtual) {
    const connection = (yield* integrations.get(Integration.ID.make(baseID)))?.connections.find(
      (item) => item.type === "credential" && item.id === virtual.credentialID,
    )
    if (!connection)
      return yield* new ModelUnavailableError({
        providerID: selected.providerID,
        modelID: selected.id,
        cause: `credential ${virtual.credentialID} not found`,
      })
    return yield* integrations.connection.resolve(connection)
  }
  const connection = yield* integrations.connection.active(fallback)
  return connection ? yield* integrations.connection.resolve(connection) : undefined
})
```

## F173

`packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — lines 27–122.

```typescript
  if (typeof ms !== "number" || ms <= 0) return res
  if (!res.body) return res
  if (!res.headers.get("content-type")?.includes("text/event-stream")) return res

  const reader = res.body.getReader()
  const body = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const part = await new Promise<Awaited<ReturnType<typeof reader.read>>>((resolve, reject) => {
        const id = setTimeout(() => {
          const err = new Error("SSE read timed out")
          ctl.abort(err)
          reader.cancel(err).catch(() => {})
          reject(err)
        }, ms)

        reader.read().then(
          (part) => {
            clearTimeout(id)
            resolve(part)
          },
          (err) => {
            clearTimeout(id)
            reject(err)
          },
        )
      })

      if (part.done) {
        ctrl.close()
        return
      }

      ctrl.enqueue(part.value)
    },
    async cancel(reason) {
      ctl.abort(reason)
      await reader.cancel(reason)
    },
  })

  return new Response(body, {
    headers: new Headers(res.headers),
    status: res.status,
    statusText: res.statusText,
  })
}

function prepareOptions(model: ModelV2.Info, pkg: string) {
  const options: Record<string, any> = {
    name: model.providerID,
    ...(model.api.type === "aisdk" ? (model.api.settings ?? {}) : {}),
    ...model.request.body,
  }
  if (model.api.type === "aisdk" && model.api.url) options.baseURL = model.api.url

  const customFetch = options.fetch
  const chunkTimeout = options.chunkTimeout
  delete options.chunkTimeout
  options.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const opts = { ...(init ?? {}) }
    const signals = [
      opts.signal,
      typeof chunkTimeout === "number" && chunkTimeout > 0 ? new AbortController() : undefined,
      options.timeout !== undefined && options.timeout !== null && options.timeout !== false
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    ].filter((item): item is AbortSignal | AbortController => Boolean(item))
    const chunkAbortCtl = signals.find((item): item is AbortController => item instanceof AbortController)
    const abortSignals = signals.map((item) => (item instanceof AbortController ? item.signal : item))
    if (abortSignals.length === 1) opts.signal = abortSignals[0]
    if (abortSignals.length > 1) opts.signal = AbortSignal.any(abortSignals)

    if (
      (pkg === "@ai-sdk/openai" || pkg === "@ai-sdk/azure" || pkg === "@ai-sdk/amazon-bedrock/mantle") &&
      opts.body &&
      opts.method === "POST"
    ) {
      const body = JSON.parse(opts.body as string)
      if (body.store !== true && Array.isArray(body.input)) {
        for (const item of body.input) {
          if ("id" in item) delete item.id
        }
        opts.body = JSON.stringify(body)
      }
    }

    const res = await (typeof customFetch === "function" ? customFetch : fetch)(input, {
      ...opts,
      timeout: false,
    })
    if (!chunkAbortCtl || typeof chunkTimeout !== "number") return res
    return wrapSSE(res, chunkTimeout, chunkAbortCtl)
  }

  return options
}
```

## F174

`packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — lines 149–234.

```typescript
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let sdkHooks: ((event: SDKEvent) => Effect.Effect<void> | void)[] = []
    let languageHooks: ((event: LanguageEvent) => Effect.Effect<void> | void)[] = []
    const languages = new Map<string, LanguageModelV3>()
    const sdks = new Map<string, SDK>()

    const register = <Event>(
      hooks: () => ((event: Event) => Effect.Effect<void> | void)[],
      update: (hooks: ((event: Event) => Effect.Effect<void> | void)[]) => void,
    ) =>
      Effect.fn("AISDK.hook")(function* (callback: (event: Event) => Effect.Effect<void> | void) {
        const scope = yield* Scope.Scope
        let active = true
        update([...hooks(), callback])
        const dispose = Effect.sync(() => {
          if (!active) return
          active = false
          update(hooks().filter((item) => item !== callback))
        })
        yield* Scope.addFinalizer(scope, dispose)
        return { dispose }
      })

    const run = Effect.fnUntraced(function* <Event>(
      hooks: readonly ((event: Event) => Effect.Effect<void> | void)[],
      event: Event,
    ) {
      for (const hook of hooks) {
        const result = hook(event)
        if (Effect.isEffect(result)) yield* result
      }
      return event
    })

    const service = Service.of({
      hook: {
        sdk: register(
          () => sdkHooks,
          (next) => (sdkHooks = next),
        ),
        language: register(
          () => languageHooks,
          (next) => (languageHooks = next),
        ),
      },
      runSDK: (event) => run(sdkHooks, event),
      runLanguage: (event) => run(languageHooks, event),
      language: Effect.fn("AISDK.language")(function* (model) {
        const key = `${model.providerID}/${model.id}/${model.request.variant ?? "default"}`
        const existing = languages.get(key)
        if (existing) return existing
        if (model.api.type !== "aisdk")
          return yield* new InitError({
            providerID: model.providerID,
            cause: new Error(`Unsupported api ${model.api.type}`),
          })

        const options = prepareOptions(model, model.api.package)
        const sdkKey = JSON.stringify({
          providerID: model.providerID,
          api: model.api,
          options,
        })
        const sdk =
          sdks.get(sdkKey) ??
          (yield* service.runSDK({ model, package: model.api.package, options }).pipe(initError(model.providerID))).sdk
        if (!sdk)
          return yield* new InitError({
            providerID: model.providerID,
            cause: new Error("No AISDK provider plugin returned an SDK"),
          })
        sdks.set(sdkKey, sdk)
        const result = yield* service.runLanguage({ model, sdk, options }).pipe(initError(model.providerID))
        const language = yield* Effect.sync(() => result.language ?? sdk.languageModel(model.api.id)).pipe(
          initError(model.providerID),
        )
        languages.set(key, language)
        return language
      }),
    })
    return service
  }),
)

```

## F175

`packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — lines 54–88.

```text
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
```

## F176

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 41–110.

```typescript
export interface EconomyEnvelope {
  readonly envelopeId: string
  readonly authorityId: string
  readonly scope: string
  readonly provider: string
  readonly model: string
  readonly route: string
  readonly stages: readonly string[]
  readonly limits: {
    readonly attempts: number
    readonly outputTokens?: number
    readonly inputTokens?: number
    readonly inFlight: number
  }
  readonly retryPolicy: { readonly maxRetries: number; readonly statuses: readonly number[] }
}

export interface LogicalRequest {
  readonly logicalRequestId: string
  readonly stage: string
  readonly snapshot: string
}

export interface AttemptId {
  readonly envelopeId: string
  readonly logicalRequestId: string
  readonly ordinal: number
}

export type AttemptKey = string

export interface AttemptUsage {
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cachedInputTokens?: number
  readonly reasoningTokens?: number
}

export interface AttemptBound {
  readonly attempts: number
  readonly outputTokens?: number
  readonly inputTokens?: number
}

/** Sealed immutable request: one bytes copy behind fingerprint, reserve and send (§4.1). */
export interface SealedRequest {
  readonly envelope: EconomyEnvelope
  readonly logical: LogicalRequest
  readonly key: string
  readonly route: string
  readonly endpoint: string
  readonly protocol: string
  readonly body: string
  readonly bound: AttemptBound
  readonly prior?: AttemptId
}

export interface TerminalEvidence {
  readonly evidenceDigest: string
  readonly evidence: string
}

export interface AttemptRecord extends AttemptId {
  readonly admissionKey: string
  readonly fingerprint: string
  readonly bodyDigest: string
  readonly snapshot: string
  readonly route: string
  readonly endpoint: string
  readonly protocol: string
```

## F177

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 242–284.

```typescript
export const sealRequest = (request: SealedRequest): { fingerprint: string; bodyDigest: string } => {
  const bodyDigest = sha256(request.body)
  const fingerprint = sha256(JSON.stringify({
    envelopeId: request.envelope.envelopeId,
    authorityId: request.envelope.authorityId,
    scope: request.envelope.scope,
    provider: request.envelope.provider,
    model: request.envelope.model,
    route: request.envelope.route,
    stages: [...request.envelope.stages],
    limits: request.envelope.limits,
    retryPolicy: request.envelope.retryPolicy,
    logicalRequestId: request.logical.logicalRequestId,
    snapshot: request.logical.snapshot,
    stage: request.logical.stage,
    dispatchRoute: request.route,
    endpoint: request.endpoint,
    protocol: request.protocol,
    bodyDigest,
    bound: request.bound,
  }))
  return { fingerprint, bodyDigest }
}

/**
 * Per-attempt bounds sealed from the final request bytes (§1.2). A dimension the envelope
 * admits is mandatory; bound exposure beyond an envelope dimension is refused.
 */
export const validateBound = (bound: AttemptBound, envelope: EconomyEnvelope, evidence: readonly string[]): AttemptOutcome | undefined => {
  for (const dimension of ["outputTokens", "inputTokens"] as const) {
    const value = bound[dimension]
    if (value === undefined) {
      if (envelope.limits[dimension] !== undefined) return refusal("bound", [...evidence, dimension])
      continue
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      return refusal("bound", [...evidence, dimension])
    }
    if (envelope.limits[dimension] !== undefined && value > envelope.limits[dimension]) {
      return refusal("bound", [...evidence, dimension])
    }
  }
  return undefined
```

## F178

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 409–510.

```typescript
export const reserveAttempt = (request: SealedRequest): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.storageID === undefined) return hold("authority", ["storage-identity-missing"])
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [request.key])
    const boundRefusal = validateBound(request.bound, request.envelope, [request.key])
    if (boundRefusal !== undefined) return boundRefusal
    const { fingerprint, bodyDigest } = sealRequest(request)
    const faults = yield* Faults
    const outcome = yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const envelopeRow = yield* tx.select().from(EconomyEnvelopeTable).where(envelopeWhere(request.envelope.envelopeId)).get()
            if (envelopeRow === undefined) return yield* Effect.fail(hold("authority", ["envelope-missing", request.envelope.envelopeId]))
            if (!envelopeMatches(envelopeRow, database.storageID!, request.envelope)) {
              return yield* Effect.fail(refusal("conflict", ["envelope", request.envelope.envelopeId]))
            }
            const logicalRows = yield* tx.select().from(EconomyAttemptTable)
              .where(and(eq(EconomyAttemptTable.envelope_id, request.envelope.envelopeId), eq(EconomyAttemptTable.logical_request_id, request.logical.logicalRequestId)))
              .all()
            // Ordinal is the predecessor-linked ordinal (attempt 1 when no prior is declared);
            // retries reconcile on their derived commitment, never on the first attempt's.
            const ordinal = request.prior === undefined ? 1 : request.prior.ordinal + 1
            const admissionKey = derivedAdmissionKey(request.key, ordinal)
            const existing = yield* tx.select().from(EconomyAttemptTable)
              .where(and(eq(EconomyAttemptTable.envelope_id, request.envelope.envelopeId), eq(EconomyAttemptTable.admission_key, admissionKey)))
              .get()
            if (existing !== undefined) {
              const record = toRecord(existing)
              const identical =
                record.fingerprint === fingerprint && record.logicalRequestId === request.logical.logicalRequestId
              if (!identical) return yield* Effect.fail(refusal("conflict", [admissionKey]))
              if (record.completionRef !== undefined) {
                return grant(attemptIdOf(record), request.key, false, record.completionRef)
              }
              const winning = logicalRows.find((row) => row.completion_ref !== null && row.completion_body !== null && row.fingerprint === fingerprint)
              if (winning !== undefined) {
                return grant(attemptIdOf(toRecord(winning)), request.key, false, winning.completion_ref ?? undefined)
              }
              if (record.forwardObserved) return yield* Effect.fail(hold("response-unavailable", [admissionKey, attemptKey(attemptIdOf(record))]))
              return grant(attemptIdOf(record), request.key, false)
            }
            const completed = logicalRows.find((row) => row.completion_ref !== null && row.completion_body !== null && row.fingerprint === fingerprint)
            if (completed !== undefined) {
              return grant(attemptIdOf(toRecord(completed)), request.key, false, completed.completion_ref ?? undefined)
            }
            if (envelopeRow.blocked === 1) return yield* Effect.fail(refusal("capacity", [request.envelope.envelopeId]))
            if (request.route !== request.envelope.route) {
              return yield* Effect.fail(refusal("route", [request.key, request.route, request.envelope.route]))
            }
            if (!request.envelope.stages.includes(request.logical.stage)) {
              return yield* Effect.fail(refusal("identity", [request.key, "stage", request.logical.stage]))
            }
            const rows = yield* tx.select().from(EconomyAttemptTable).where(foundEnvelopeWhere(request.envelope.envelopeId)).all()
            const occupied = { outputTokens: 0, inputTokens: 0 }
            let inFlight = 0
            for (const row of rows) {
              const bound = JSON.parse(row.bound_json) as AttemptBound
              if (row.state === "settled") {
                const usage = row.usage_json === null ? undefined : JSON.parse(row.usage_json) as AttemptUsage
                const numbers = [usage?.outputTokens, usage?.inputTokens, usage?.cachedInputTokens, usage?.reasoningTokens]
                if (
                  (request.envelope.limits.outputTokens !== undefined && usage?.outputTokens === undefined) ||
                  (request.envelope.limits.inputTokens !== undefined && usage?.inputTokens === undefined) ||
                  (bound.outputTokens !== undefined && usage?.outputTokens === undefined) ||
                  (bound.inputTokens !== undefined && usage?.inputTokens === undefined) ||
                  numbers.some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 0))
                ) {
                  return yield* Effect.fail(hold("authority", ["corrupt", "usage", row.admission_key]))
                }
                const output = exactSum(occupied.outputTokens, usage?.outputTokens ?? 0)
                const input = exactSum(occupied.inputTokens, usage?.inputTokens ?? 0)
                if (output === undefined || input === undefined) return yield* Effect.fail(refusal("bound", [request.key, "arithmetic"]))
                occupied.outputTokens = output
                occupied.inputTokens = input
              } else {
                const heldOutput = bound.outputTokens
                const heldInput = bound.inputTokens
                const requiredMissing =
                  (request.envelope.limits.outputTokens !== undefined && heldOutput === undefined) ||
                  (request.envelope.limits.inputTokens !== undefined && heldInput === undefined)
                if (
                  requiredMissing ||
                  (heldOutput !== undefined && (!Number.isSafeInteger(heldOutput) || heldOutput < 0)) ||
                  (heldInput !== undefined && (!Number.isSafeInteger(heldInput) || heldInput < 0))
                ) {
                  return yield* Effect.fail(hold("authority", ["corrupt", "bound", row.admission_key]))
                }
                const output = exactSum(occupied.outputTokens, heldOutput ?? 0)
                const input = exactSum(occupied.inputTokens, heldInput ?? 0)
                if (output === undefined || input === undefined) return yield* Effect.fail(refusal("bound", [request.key, "arithmetic"]))
                occupied.outputTokens = output
                occupied.inputTokens = input
              }
              if (row.slot_released === 0) inFlight += 1
            }
            if (rows.length + 1 > request.envelope.limits.attempts) {
              return yield* Effect.fail(refusal("capacity", ["attempts", request.key]))
            }
            const nextOutput = exactSum(occupied.outputTokens, request.bound.outputTokens ?? 0)
            const nextInput = exactSum(occupied.inputTokens, request.bound.inputTokens ?? 0)
```

## F179

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 550–615.

```typescript
            }
            yield* tx.insert(EconomyAttemptTable).values({
              envelope_id: request.envelope.envelopeId,
              logical_request_id: request.logical.logicalRequestId,
              ordinal,
              admission_key: admissionKey,
              fingerprint,
              body_digest: bodyDigest,
              body_snapshot: request.body,
              snapshot: request.logical.snapshot,
              route: request.route,
              endpoint: request.endpoint,
              protocol: request.protocol,
              ...(request.prior === undefined ? {} : { predecessor: attemptKey(request.prior) }),
              state: "reserved",
              forward_intent: 1,
              forward_observed: 0,
              terminal: null,
              slot_released: 0,
              bound_json: JSON.stringify(request.bound),
              usage_json: null,
              evidence_digest: null,
              evidence_json: null,
              completion_ref: null,
              completion_body: null,
              semantic: null,
            })
            return grant({ envelopeId: request.envelope.envelopeId, logicalRequestId: request.logical.logicalRequestId, ordinal }, request.key, true)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(refusal("storage", [request.key, "reserve", String(error)]))),
        Effect.catchIf(isAbort, (error) => Effect.succeed(error as AttemptOutcome)),
      )
    if (outcome.kind === "economy-grant" && outcome.consumable && (yield* faults.take("loseReserveAck"))) {
      return refusal("storage", [request.key, "ack-lost"])
    }
    return outcome
  })

const attemptIdOf = (record: AttemptRecord): AttemptId =>
  ({ envelopeId: record.envelopeId, logicalRequestId: record.logicalRequestId, ordinal: record.ordinal })

const canonicalUsage = (usage: AttemptUsage | undefined): string =>
  JSON.stringify(Object.fromEntries(Object.entries(usage ?? {}).filter((entry) => entry[1] !== undefined)))

const validUsage = (usage: AttemptUsage, evidence: readonly string[]): AttemptOutcome | undefined => {
  for (const [name, value] of Object.entries(usage)) {
    if (value === undefined) continue
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return refusal("usage", [...evidence, name])
    }
  }
  if (usage.cachedInputTokens !== undefined && usage.inputTokens === undefined) return refusal("usage", [...evidence, "inputTokens"])
  if (usage.reasoningTokens !== undefined && usage.outputTokens === undefined) return refusal("usage", [...evidence, "outputTokens"])
  if (usage.cachedInputTokens !== undefined && usage.cachedInputTokens > (usage.inputTokens ?? 0)) {
    return refusal("usage", [...evidence, "cachedInputTokens"])
  }
  if (usage.reasoningTokens !== undefined && usage.reasoningTokens > (usage.outputTokens ?? 0)) {
    return refusal("usage", [...evidence, "reasoningTokens"])
  }
  return undefined
}

/** Records a consumed HTTP error without calling it remote terminus or releasing the slot. */
```

## F180

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 630–734.

```typescript
export const observeTerminal = (
  attempt: AttemptId,
  evidence: TerminalEvidence,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) => {
    if (record.terminal) {
      return record.evidenceDigest === evidence.evidenceDigest && record.evidence === evidence.evidence
        ? Effect.succeed({ patch: {}, result: settled(attempt) })
        : Effect.succeed({ patch: {}, result: refusal("conflict", [attemptKey(attempt)]) })
    }
    return Effect.succeed({
      patch: {
        state: record.state === "settled" ? "settled" : "terminal-held",
        terminal: 1,
        slot_released: 1,
        evidence_digest: evidence.evidenceDigest,
        evidence_json: evidence.evidence,
      },
      result: settled(attempt),
    })
  })

/**
 * Idempotent settlement (§1.6). Requires established remote terminus, complete usage for
 * the bound dimensions, valid numbers, and full-evidence identity awareness.
 */
export const settleAttempt = (
  attempt: AttemptId,
  usage: AttemptUsage,
  evidence: TerminalEvidence,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) => {
    if (record.state === "settled") {
      const identical =
        canonicalUsage(record.usage) === canonicalUsage(usage) &&
        record.evidenceDigest === evidence.evidenceDigest &&
        record.evidence === evidence.evidence
      return Effect.succeed({ patch: {}, result: identical ? settled(attempt) : refusal("conflict", [attemptKey(attempt)]) })
    }
    if (!record.terminal) return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "terminal-missing"]) })
    if (
      record.evidenceDigest !== undefined &&
      (record.evidenceDigest !== evidence.evidenceDigest || record.evidence !== evidence.evidence)
    ) {
      return Effect.succeed({ patch: {}, result: refusal("conflict", [attemptKey(attempt), "evidence"]) })
    }
    const invalid = validUsage(usage, [attemptKey(attempt)])
    if (invalid !== undefined) return Effect.succeed({ patch: {}, result: invalid })
    if (record.bound.outputTokens !== undefined && usage.outputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "outputTokens", "incomplete"]) })
    }
    if (record.bound.inputTokens !== undefined && usage.inputTokens === undefined) {
      return Effect.succeed({ patch: {}, result: refusal("usage", [attemptKey(attempt), "inputTokens", "incomplete"]) })
    }
    const breach =
      (record.bound.outputTokens !== undefined && usage.outputTokens !== undefined && usage.outputTokens > record.bound.outputTokens) ||
      (record.bound.inputTokens !== undefined && usage.inputTokens !== undefined && usage.inputTokens > record.bound.inputTokens)
    return Effect.succeed({
      patch: {
        state: "settled",
        usage_json: canonicalUsage(usage),
        evidence_digest: evidence.evidenceDigest,
        evidence_json: evidence.evidence,
        slot_released: 1,
        terminal: 1,
      },
      result: settled(attempt, breach),
      ...(breach ? { blocked: true } : {}),
    })
  }, { faultKey: "failSettleCommit", afterCommitFault: "loseSettleAck" })

export const recordCompletion = (
  attempt: AttemptId,
  completionRef: string,
  completionBody?: string,
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) => {
    if (completionBody === undefined || completionBody.length === 0) {
      return Effect.succeed({ patch: {}, result: hold("response-unavailable", [attemptKey(attempt), "completion-body"]) })
    }
    if (record.completionRef === undefined) {
      return Effect.succeed({
        patch: { completion_ref: completionRef, completion_body: completionBody },
        result: settled(attempt),
      })
    }
    const same = record.completionRef === completionRef && record.completionBody === completionBody
    return Effect.succeed({ patch: {}, result: same ? settled(attempt) : refusal("conflict", [attemptKey(attempt)]) })
  })

/**
 * Semantic outcome is preserved apart from the physical usage (EA-26); no refund path
 * exists — confirmed usage and held obligations stay as they were.
 */
export const recordSemantic = (
  attempt: AttemptId,
  semantic: "accepted" | "refused",
): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, () => Effect.succeed({ patch: { semantic }, result: settled(attempt) }))

/** Durable observation of a physical dispatch (§4.4); never inferred from other states. */
export const recordForward = (attempt: AttemptId): Effect.Effect<AttemptOutcome, never, Database.Service> =>
  attemptWrite(attempt, (record) =>
    Effect.succeed({ patch: record.forwardObserved ? {} : { forward_observed: 1 }, result: settled(attempt) }),
  )
```

## F181

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 783–823.

```typescript
export const recoverEnvelopeAttempts = (
  envelopeId: string,
): Effect.Effect<ReadonlyArray<AttemptRecord> | AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [envelopeId])
    return yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const envelopeRow = yield* tx.select().from(EconomyEnvelopeTable).where(envelopeWhere(envelopeId)).get()
            if (envelopeRow === undefined) return hold("authority", ["envelope-missing", envelopeId])
            const rows = yield* tx.select().from(EconomyAttemptTable).where(foundEnvelopeWhere(envelopeId)).all()
            return rows.map(toRecord)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(hold("authority", ["corrupt", String(error), envelopeId]))),
      )
  })

export const lookupAttempt = (
  attempt: AttemptId,
): Effect.Effect<AttemptRecord | AttemptOutcome, never, Database.Service> =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    if (database.inTransaction !== undefined && (yield* database.inTransaction)) return refusal("ambient", [attemptKey(attempt)])
    return yield* database.db
      .transaction(
        (tx) =>
          Effect.gen(function* () {
            const row = yield* tx.select().from(EconomyAttemptTable).where(attemptWhere(attempt)).get()
            return row === undefined ? refusal("usage", [attemptKey(attempt), "missing"]) : toRecord(row)
          }),
        { behavior: "immediate" },
      )
      .pipe(
        Effect.catchIf(isStorageError, (error) => Effect.succeed(hold("authority", ["corrupt", String(error), attemptKey(attempt)]))),
      )
  })
```

## F182

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 41–48.

```typescript
// The host side of the Atlas screen, shared by the legacy instance routes and the V2 server. `open` binds the Atlas
// surface (the boundary's `./surface` entry) to one store root and runs each read or write in process. The surface is
// synchronous: `own`, `health` and every write compose Atlas's runtime, which walks the tracked tree, so those calls
// hold the fiber for as long as that takes. A throw (an unreadable store, a disk fault during a commit) becomes
// `Unavailable`, never a defect.
// Setup (D37, D38): `install` creates the store and `index` runs the indexer the plan names. Mining (D39, D40) runs the
// boundary's `./mine` entry; `delegate` (D33) drafts interview answers. Both take the model call from the host, which
// owns provider resolution.
```

## F183

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 75–148.

```typescript
export interface Interface {
  readonly snapshot: () => Effect.Effect<AtlasSnapshotResult, Unavailable>
  readonly reasoning: (id: string) => Effect.Effect<AtlasReasoningResult, Unavailable>
  readonly own: (scope: string) => Effect.Effect<AtlasOwnResult, Unavailable>
  readonly health: () => Effect.Effect<AtlasHealthResult, Unavailable>
  readonly promote: (input: AtlasPromoteInput) => Effect.Effect<AtlasPromoteResult, Unavailable>
  readonly draft: (input: AtlasDraftInput) => Effect.Effect<AtlasDraftResult, Unavailable>
  readonly emit: (input: AtlasEmitInput) => Effect.Effect<AtlasEmitResult, Unavailable>
  readonly link: (input: AtlasLinkInput) => Effect.Effect<AtlasLinkResult, Unavailable>
  readonly verify: (input: AtlasVerifyInput) => Effect.Effect<AtlasVerifyResult, Unavailable>
  readonly review: () => Effect.Effect<AtlasReviewResult, Unavailable>
  readonly hold: (input: AtlasHoldInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly release: (input: AtlasReleaseInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly propose: (input: AtlasProposeInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly decide: (input: AtlasDecideInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly answer: (input: AtlasAnswerInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly memoryDecide: (input: AtlasMemoryDecideInput) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly territory: (
    input: Omit<AtlasTerritoryInput, "projectId">,
  ) => Effect.Effect<AtlasReviewWriteResult, Unavailable>
  readonly install: () => Effect.Effect<AtlasInstallResult, Unavailable>
  readonly index: () => Effect.Effect<IndexResult, Unavailable>
  readonly mineSites: (ceiling: number) => Effect.Effect<MineSitesResult, Unavailable>
  readonly mineWith: (input: MineWithInput) => Effect.Effect<MineWithResult, Unavailable>
}

export type Dependencies = { readonly npm: Npm.Interface; readonly processes: AppProcess.Interface }

/** The store root (D5): the project worktree, or the directory when the project has none ("/"). */
export const storeRoot = (worktree: string, directory: string) => (Project.isRoot(worktree) ? directory : worktree)

/**
 * The surface over the store at `root`. `projectID` is the Orchestra project id the first territory catalog records
 * (issues/c-engine.md item 2): the client never sends it, and an existing catalog of another project refuses the write.
 */
export const open = (dependencies: Dependencies, root: string, projectID: string): Interface => {
  const runAt = <A>(name: string, call: () => A) =>
    Effect.try({ try: call, catch: (cause) => new Unavailable({ message: firstLine(cause) }) }).pipe(
      Effect.withSpan(`AtlasSurface.${name}`),
    )
  const run = <A>(name: string, call: (surface: ReturnType<typeof openSurface>) => A) =>
    runAt(name, () => call(openSurface(root)))
  const stored = () => existsSync(join(root, ".atlas"))
  const health = () => run("health", (surface) => surface.health())
  return {
    snapshot: () => run("snapshot", (surface) => surface.snapshot()),
    reasoning: (id) => run("reasoning", (surface) => surface.reasoning(id)),
    own: (scope) => run("own", (surface) => surface.own(scope)),
    health,
    promote: (input) => run("promote", (surface) => surface.promote(input)),
    draft: (input) => run("draft", (surface) => surface.draft(input)),
    emit: (input) => run("emit", (surface) => surface.emit(input)),
    link: (input) => run("link", (surface) => surface.link(input)),
    verify: (input) => run("verify", (surface) => surface.verify(input)),
    review: () => run("review", (surface) => surface.review()),
    hold: (input) => run("hold", (surface) => surface.hold(input)),
    release: (input) => run("release", (surface) => surface.release(input)),
    propose: (input) => run("propose", (surface) => surface.propose(input)),
    decide: (input) => run("decide", (surface) => surface.decide(input)),
    answer: (input) => run("answer", (surface) => surface.answer(input)),
    memoryDecide: (input) => run("memoryDecide", (surface) => surface.memoryDecide(input)),
    territory: (input) => run("territory", (surface) => surface.territory({ ...input, projectId: projectID })),
    install: () => run("install", (surface) => surface.install()),
    index: () => index(dependencies, health, root),
    mineSites: (ceiling) =>
      runAt("mineSites", (): MineSitesResult => (stored() ? { state: "ok", ...mineSites(root, ceiling) } : EMPTY)),
    mineWith: (input) =>
      runAt(
        "mineWith",
        (): MineWithResult =>
          stored() ? { state: "ok", ...mineWith(root, input.ceiling, input.answers, input.model) } : EMPTY,
      ),
  }
}
```

## F184

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 248–304.

```typescript
export const delegate = Effect.fn("AtlasDelegate.delegate")(function* (
  services: DelegateServices,
  input: DelegateInput,
) {
  const review = yield* services.atlas.review()
  if (review.state === "empty") return EMPTY as DelegateResult
  const drafted = yield* Effect.forEach(input.questionIds, (questionId) => {
    const question = review.interview.batch.find((item) => item.id === questionId)
    if (!question) return Effect.succeed(refused(questionId, "not an open question in the current interview batch"))
    return draftOne(services, input, question).pipe(
      Effect.catch((error) => Effect.succeed(refused(questionId, firstLine(error)))),
    )
  })
  return { state: "ok", drafted } as DelegateResult
})

const draftOne = Effect.fn("AtlasDelegate.draftOne")(function* (
  services: DelegateServices,
  input: DelegateInput,
  question: AtlasInterviewQuestion,
) {
  const reply = yield* services.draft(delegatePrompt(question))
  if (!reply || !reply.answer.trim())
    return refused(question.id, "the model did not reply with a non-empty answer and why")
  const written = yield* services.atlas.answer({
    questionId: question.id,
    answer: reply.answer.trim(),
    drafted: { model: `${input.providerID}/${input.modelID}`, why: reply.why.trim() },
  })
  if (written.state === "empty") return refused(question.id, "the Atlas store is gone")
  if (!written.ok) return refused(question.id, written.rejected ?? "the surface refused the draft")
  return { questionId: question.id, ok: true, rejected: null }
})

function delegatePrompt(question: AtlasInterviewQuestion) {
  return [
    `Question (${question.kind}): ${question.ask}`,
    `Subject: ${question.subject}`,
    `Site: ${question.site}`,
    ...(question.options
      ? [
          `Options: ${question.options.join(", ")}`,
          "The answer must be exactly one of these option strings, and nothing else.",
        ]
      : []),
    "Reply with a JSON object with two string fields: answer and why.",
  ].join("\n")
}

function refused(questionId: string, rejected: string): Drafted {
  return { questionId, ok: false, rejected }
}

// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.
```

## F185

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 318–341.

```typescript
export const mine = Effect.fn("AtlasMine.mine")(function* (services: MineServices, input: MineInput) {
  const ceiling = Math.min(200, Math.max(1, Math.floor(input.ceiling)))
  const listed = yield* services.atlas.mineSites(ceiling)
  if (listed.state === "empty") return listed
  const ask = yield* services.model.pipe(Effect.mapError((error) => new Unavailable({ message: firstLine(error) })))
  const replies = yield* Effect.forEach(
    listed.sites,
    (site) =>
      ask(site.prompt).pipe(
        Effect.map((text) => [[site.key, text] as const]),
        Effect.catch((error) =>
          Effect.logWarning("Atlas mine: the model call failed; the site abstains", {
            site: site.key,
            error: firstLine(error),
          }).pipe(Effect.as([])),
        ),
      ),
    { concurrency: 4 },
  )
  return yield* services.atlas.mineWith({
    ceiling,
    answers: Object.fromEntries(replies.flat()),
    model: `${input.providerID}/${input.modelID}`,
  })
```

## F186

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 120–172.

```typescript
export interface Interface {
  readonly paths: Paths
  readonly judge: JudgeConfig.Config
  // One hook check through the gate core, recorded in the install's ledger. Verifies run one at a time.
  readonly verify: (input: VerifyInput) => Effect.Effect<Verified>
  // The dry "Check now": grades a WP and records nothing.
  readonly check: (
    input: Omit<GateCheck.Input, "stateDir">,
  ) => Effect.Effect<RelayArm.CheckOutcome, GateCheck.Busy | GateControl.PlanError>
  // Whether the user approved this project's own commands (the gate on `trial`).
  readonly trusted: Effect.Effect<boolean>
  // "Test now": runs one check command in the project as a check would, and returns its output. It grades nothing,
  // records nothing and cannot pass a step; only a trusted project may run one.
  readonly trial: (input: {
    readonly command: string
    readonly params?: Readonly<Record<string, string>>
  }) => Effect.Effect<Trial, Untrusted | GateShell.Unavailable>
  readonly create: (
    input: ArmCreate.Input,
  ) => Effect.Effect<"created" | "unchanged", ArmCreate.Conflict | ArmState.StateError | Unavailable>
  // Moves a workflow arm that graded nothing from one execution Session to another (ArmCreate.rebind).
  readonly rebind: (
    input: ArmCreate.Input & { readonly agentID: string; readonly from: string },
  ) => Effect.Effect<"rebound" | "unchanged", ArmCreate.Conflict | ArmState.StateError | ArmState.Busy | Unavailable>
  // The execution Session holding an arm (ArmCreate.holder).
  readonly holder: (token: RelayArm.Token) => Effect.Effect<Option.Option<string>, ArmState.StateError | Unavailable>
  readonly evaluate: (input: RelayArm.EvaluateInput) => Effect.Effect<RelayArm.Evaluation, Unavailable>
  readonly currentStep: (token: RelayArm.Token, binding: RelayArm.WorkflowBinding) =>
    Effect.Effect<RelayWorkflowCurrentStep.View, RelayWorkflowBinding.Held | Unavailable>
  readonly transition: (input: RelayWorkflowTransition.Input) =>
    Effect.Effect<RelayArm.Evaluation, RelayWorkflowBinding.Held | Unavailable>
  readonly release: (
    token: RelayArm.Token,
    reason: string,
  ) => Effect.Effect<void, ArmState.StateError | ArmState.Busy | Unavailable>
  // Whether the arm is parked awaiting its owner, read without the run lock and without running a check.
  readonly parked: (
    token: RelayArm.Token,
  ) => Effect.Effect<Option.Option<ArmEvaluate.Parked>, ArmState.StateError | Unavailable>
  // `relay verify` of the arm with this project's key: chain integrity, controls and the oracle recheck.
  readonly audit: (
    token: RelayArm.Token,
  ) => Effect.Effect<RelayAudit.VerifyReport, ArmState.StateError | LedgerRead.Missing | Unavailable>
  // Clears a stale `.run.lock` with a `gate-recovered` note (R6); true when one was cleared.
  readonly recover: (
    token: RelayArm.Token,
  ) => Effect.Effect<boolean, ArmState.StateError | LedgerChain.AppendError | RelayJson.EncodeError | Unavailable>
  // Appends one note to an install's ledger, stamping `ts` first.
  readonly record: (
    installID: string,
    body: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<LedgerChain.Appended, LedgerChain.AppendError | RelayJson.EncodeError | Unavailable>
}
```

## F187

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 176–217.

```typescript
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const global = yield* Global.Service
    const location = yield* Location.Service
    const config = yield* Config.Service
    const processes = yield* AppProcess.Service
    const fs = yield* FSUtil.Service
    const root = path.join(global.data, "relay", location.project.id)
    const paths = {
      root,
      authoring: path.join(root, "authoring.sqlite3"),
      arms: path.join(root, "arms"),
      hooks: path.join(root, "hooks"),
      key: path.join(root, "ledger.key"),
    }
    const judge = settings(yield* config.entries())
    const judging = yield* JudgeConfig.Service.pipe(Effect.provide(JudgeConfig.layer(judge)))
    const verifies = yield* Semaphore.make(1)
    // Nothing touches the disk until an operation needs it, so a Location never fails to open over Relay.
    const cache: { key?: Redacted.Redacted<string> } = {}

    const ready = Effect.gen(function* () {
      if (!ID.test(location.project.id)) return yield* new Unavailable({ reason: "project-invalid" })
      const info = yield* Effect.try({
        try: () => {
          mkdirSync(root, { recursive: true, mode: 0o700 })
          return lstatSync(root)
        },
        catch: () => new Unavailable({ reason: "data-acquisition" }),
      })
      // A symlinked data directory would put the key and every ledger somewhere else.
      if (!info.isDirectory()) return yield* new Unavailable({ reason: "data-acquisition" })
    })

    const ledgerKey = Effect.suspend(() => {
      if (cache.key) return Effect.succeed(cache.key)
      return ready.pipe(
        Effect.andThen(loadKey(paths.key)),
        Effect.tap((key) => Effect.sync(() => (cache.key = key))),
      )
    })
```

## F188

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 319–414.

```typescript
    const record = Effect.fn("Relay.record")(function* (installID: string, body: Readonly<Record<string, unknown>>) {
      if (!ID.test(installID)) return yield* new Unavailable({ reason: "install-invalid" })
      const key = yield* ledgerKey
      const directory = path.join(paths.hooks, installID)
      yield* Effect.try({
        try: () => mkdirSync(directory, { recursive: true, mode: 0o700 }),
        catch: () => new Unavailable({ reason: "data-acquisition" }),
      })
      const ts = Math.floor((yield* Clock.currentTimeMillis) / 1000)
      const text = yield* RelayJson.compact({
        ts,
        ...Object.fromEntries(Object.entries(body).filter((entry) => entry[0] !== "ts")),
      })
      return yield* LedgerChain.append({ ledger: path.join(directory, "ledger.jsonl"), body: text, gen: 0, key })
    })

    const verify = Effect.fn("Relay.verify")(
      function* (input: VerifyInput): Effect.fn.Return<Verified> {
        // An empty command would be graded as a judge control; a hook check is a command.
        if (!input.check) return { verdict: "unavailable", reason: "invalid-command", oracle: "" }
        const graded = yield* GateControl.run(
          {
            sprint: {
              work_packages: [
                {
                  id: input.nodeID,
                  checklist: [{ id: input.nodeID, assert: input.message, cmd: input.check, origin: "hook" }],
                },
              ],
            },
            index: 0,
            workdir: input.workdir,
            params: input.params ?? {},
          },
          // Recorded below, so a ledger failure cannot lose the verdict.
          () => Effect.void,
        ).pipe(ports(VERIFY_TIMEOUT), Effect.option)
        const verdict = Option.flatMap(graded, (result) => Option.fromUndefinedOr(result.verdicts[0]))
        if (Option.isNone(verdict)) return { verdict: "unavailable", reason: "invalid-node", oracle: "" }
        const recorded = yield* record(
          input.installID,
          GateControl.body({ wp: input.nodeID, i: 0 }, verdict.value),
        ).pipe(Effect.option)
        const sequence = Option.match(recorded, { onNone: () => ({}), onSome: (line) => ({ ledgerSeq: line.seq }) })
        const unavailable = /^unavailable\((.+)\)$/.exec(verdict.value.graded_by)?.[1]
        if (unavailable)
          return { verdict: "unavailable", reason: unavailable, oracle: verdict.value.oracle, ...sequence }
        // A pass nobody can audit is not a pass; a fail stays a fail either way.
        if (verdict.value.verdict === "pass" && Option.isNone(recorded))
          return { verdict: "unavailable", reason: "unrecorded", oracle: verdict.value.oracle }
        return { verdict: verdict.value.verdict, oracle: verdict.value.oracle, ...sequence }
      },
      (effect) => verifies.withPermit(effect),
    )

    const recover = Effect.fn("Relay.recover")(function* (token: RelayArm.Token) {
      const key = yield* ledgerKey
      const arm = yield* ArmState.dir(token).pipe(Effect.provideService(ArmState.Store, store(key)))
      const lock = path.join(arm, RelayArm.Files.runLock)
      const info = yield* Effect.try({
        try: () => lstatSync(lock, { throwIfNoEntry: false }),
        catch: () => new ArmState.StateError({ path: lock, reason: "lock-acquisition" }),
      })
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
      const loaded = yield* ArmLoad.arm(arm).pipe(Effect.option)
      const position = yield* ArmState.read(arm, RelayArm.Files.position).pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      )
      // The WP at the recorded position, else the raw position, else `?` like an empty plan.
      const wp = Option.flatMap(loaded, (value) =>
        Option.flatMap(position, (raw) =>
          Option.map(ArmState.resolve(value.sprint, raw), (index) => value.sprint.work_packages[index]!.id),
        ),
      ).pipe(
        Option.orElse(() => position),
        Option.getOrElse(() => "?"),
      )
      const gen = Option.match(loaded, {
        onNone: () => 0,
        onSome: (value) =>
          LedgerChain.generation(
            Result.getOrUndefined(RelayJson.read(new TextDecoder().decode(value.sprintBytes), { flavor: "jq" })),
          ),
      })
      const ts = Math.floor((yield* Clock.currentTimeMillis) / 1000)
      // Noted before the lock goes: a recovery that cannot be recorded does not happen.
      yield* LedgerChain.append({
        ledger: path.join(arm, RelayArm.Files.ledger),
        body: yield* RelayJson.compact({ ts, arm: token, wp, event: "gate-recovered" }),
        gen,
        key,
      })
      yield* Effect.try({
        try: () => rmdirSync(lock),
```

## F189

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 473–538.

```typescript
    return Service.of({
      paths,
      judge,
      verify,
      trusted,
      trial,
      check: Effect.fn("Relay.check")(function* (input: Omit<GateCheck.Input, "stateDir">) {
        return yield* GateCheck.check({ ...input, stateDir: undefined }).pipe(ports(GATE_TIMEOUT))
      }),
      create: Effect.fn("Relay.create")(function* (input: ArmCreate.Input) {
        return yield* armed(ArmCreate.create(input))
      }),
      rebind: Effect.fn("Relay.rebind")(function* (input: ArmCreate.Input & { readonly agentID: string; readonly from: string }) {
        return yield* armed(ArmCreate.rebind(input))
      }),
      holder: Effect.fn("Relay.holder")(function* (token: RelayArm.Token) {
        return yield* armed(ArmCreate.holder(token))
      }),
      evaluate: Effect.fn("Relay.evaluate")(function* (input: RelayArm.EvaluateInput) {
        if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
        // Bound progressive arms may only cross the guarded native settlement boundary; an API/CLI evaluate cannot
        // spend their retry budget or advance them. Missing/invalid arm data remains the existing engine's defect.
        const bound = yield* ArmLoad.arm(path.join(paths.arms, input.token)).pipe(Effect.option)
        if (Option.isSome(bound) && bound.value.meta.workflow)
          return { outcome: "refused" as const, failing: [], ledgerSeq: -1,
            reason: "WORKFLOW_NATIVE_SETTLEMENT_REQUIRED" }
        yield* recover(input.token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.evaluate(input))
      }),
      currentStep: Effect.fn("Relay.currentStep")(function* (token: RelayArm.Token, binding: RelayArm.WorkflowBinding) {
        return yield* armed(RelayWorkflowCurrentStep.read(token, binding).pipe(
          Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
            : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_STATE_ACQUISITION" })),
        ))
      }),
      transition: Effect.fn("Relay.transition")(function* (input: RelayWorkflowTransition.Input) {
        return yield* armed(Effect.gen(function* () {
          const evaluator = RelayWorkflowEvaluator.native
          return yield* RelayWorkflowTransition.transition(input).pipe(
            Effect.provideService(RelayWorkflowTransition.NativeEvaluator, evaluator),
          )
        })).pipe(Effect.mapError((error) => error instanceof RelayWorkflowBinding.Held ? error
          : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_ACQUISITION" })))
      }),
      release: Effect.fn("Relay.release")(function* (token: RelayArm.Token, reason: string) {
        yield* recover(token).pipe(Effect.ignore)
        return yield* armed(ArmEvaluate.release(token, reason))
      }),
      parked: Effect.fn("Relay.parked")(function* (token: RelayArm.Token) {
        return yield* armed(ArmEvaluate.parked(token))
      }),
      audit: Effect.fn("Relay.audit")(function* (token: RelayArm.Token) {
        const key = yield* ledgerKey
        const arm = yield* ArmState.dir(token).pipe(Effect.provideService(ArmState.Store, store(key)))
        return yield* RelayAudit.verify(arm, { key })
      }),
      recover,
      record,
    })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Global.node, Location.node, Config.node, AppProcess.node, FSUtil.node],
```

## F190

`packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — lines 77–148.

```typescript
    const moveSession = Effect.fn("MoveSession.moveSession")(function* (input: Input) {
      const current = yield* sessions.get(input.sessionID)
      if (!current) return yield* new SessionV2.NotFoundError({ sessionID: input.sessionID })
      const directory = AbsolutePath.make(input.destination.directory)
      if (current.location.directory === directory) return

      const source = yield* project.resolve(current.location.directory)
      const destination = yield* project.resolve(directory)
      if (current.projectID !== destination.id) {
        return yield* new DestinationProjectMismatchError({ expected: current.projectID, actual: destination.id })
      }

      const moveChanges = input.moveChanges && source.directory !== destination.directory
      const sourceRepository = moveChanges ? yield* git.repo.discover(current.location.directory) : undefined
      if (moveChanges && !sourceRepository)
        return yield* new CaptureChangesError({ message: "Source is not a Git repository" })
      const patch = sourceRepository
        ? yield* git.change
            .capture({ repository: sourceRepository, path: current.location.directory })
            .pipe(Effect.mapError((error) => new CaptureChangesError({ message: error.message })))
        : Git.ChangeSet.make("")
      if (patch) {
        const repository = yield* git.repo.discover(directory)
        if (!repository) return yield* new ApplyChangesError({ message: "Destination is not a Git repository" })
        yield* git.change
          .apply({ repository, path: directory, changes: patch })
          .pipe(Effect.mapError((error) => new ApplyChangesError({ message: error.message })))
      }

      yield* events.publish(SessionEvent.Moved, {
        sessionID: input.sessionID,
        location: Location.Ref.make({ directory }),
        subdirectory: RelativePath.make(path.relative(destination.directory, directory).replaceAll("\\", "/")),
        timestamp: yield* DateTime.now,
      })

      if (patch) {
        const repository = yield* git.repo.discover(current.location.directory)
        if (!repository)
          return yield* new ResetSourceChangesError({
            directory: current.location.directory,
            message: "Source is not a Git repository",
          })
        yield* git.change
          .discard({
            repository,
            path: current.location.directory,
            index: "preserve",
            untracked: "remove",
          })
          .pipe(
            Effect.mapError(
              (error) =>
                new ResetSourceChangesError({
                  directory: current.location.directory,
                  message: error.message,
                  cause: error.cause,
                }),
            ),
          )
      }
    })

    return Service.of({ moveSession })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [Git.node, EventV2.node, ProjectV2.node, SessionStore.node],
})
```

## F191

`packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — lines 1–81.

```typescript
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Corpus tables from docs/specs/rag-studio/SPEC.md. Chunks have no foreign key: removeSource deletes the
// source row and leaves chunks for orphan_delete. Embedding has no column and no vector table.

export const RagSourceTable = sqliteTable(
  "rag_source",
  {
    id: text().primaryKey(),
    location_id: text().notNull(),
    path: text().notNull(),
    content_hash: text().notNull(),
    status: text().notNull(),
    reparsed_hash: text(),
  },
  (table) => [index("rag_source_location_path").on(table.location_id, table.path)],
)

export const RagChunkTable = sqliteTable(
  "rag_chunk",
  {
    id: text().primaryKey(),
    source_id: text().notNull(),
    location_id: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    text: text().notNull(),
    source_hash: text().notNull(),
    boundary: text().notNull(),
  },
  (table) => [index("rag_chunk_source_idx").on(table.source_id), index("rag_chunk_location_idx").on(table.location_id)],
)

export const RagRevisionTable = sqliteTable("rag_revision", {
  id: text().primaryKey(),
  location_id: text().notNull(),
  snapshot: text().notNull(),
  pipeline_hash: text().notNull(),
  fill: text().notNull(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
})

export const RagRevisionSourceTable = sqliteTable(
  "rag_revision_source",
  {
    revision_id: text().notNull(),
    source_id: text().notNull(),
    content_hash: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.revision_id, table.source_id] })],
)

export const RagQuestionTable = sqliteTable("rag_question", {
  id: text().primaryKey(),
  revision_id: text().notNull(),
  text: text().notNull(),
  span_source_id: text().notNull(),
  span_start: integer().notNull(),
  span_end: integer().notNull(),
})

export const RagTraceTable = sqliteTable("rag_trace", {
  question_id: text().primaryKey(),
  hits: text().notNull(),
  dropped: text().notNull(),
  k: integer(),
})

// Not in the spec table list. readPipeline/setPipeline have nowhere else to persist. lexical stays true and
// embedding stays false, so neither is a column.
export const RagPipelineTable = sqliteTable("rag_pipeline", {
  location_id: text().primaryKey(),
  parser: text().notNull(),
  boundary: text().notNull(),
  tokenizer: text().notNull(),
  k: integer().notNull(),
  blocked: integer().notNull().default(0),
})
```

## F192

`packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — lines 1–88.

````text
# @orchestra/core

Platform and domain services for Orchestra: v2 Session admission, storage and local execution; Location-scoped capabilities; provider, tool, configuration and plugin services; and the SQLite database with its migrations. Server exposes these services over HTTP, and the CLI, desktop app and product modules compose them. See [architecture](../../docs/guides/architecture.md) for the product-level picture.

Dependencies run Schema -> Core and Protocol -> Server. Core never imports Client or Server.

## Who uses it

`packages/server` (handlers), `packages/app-shell`, `apps/cli`, `apps/desktop`, `packages/tui`, `packages/session-ui`, `packages/sdk-next`, and the `modules/maestro`, `modules/continuity` and `modules/engine-adapters` packages.

## Entry points

There is no bare `@orchestra/core` export and no wildcard: every public subpath is an explicit key in `package.json`. Add one with `bun run script/explicit-exports.ts core --write` from the repository root when a new subpath gains a consumer. Common subpaths:

- `@orchestra/core/effect/layer-node`, `@orchestra/core/effect/app-node`: service graph building blocks.
- `@orchestra/core/session/runner`: the serialized Session runner.
- `@orchestra/core/system-context`: System Context registry and built-ins.
- `@orchestra/core/backend-toolkit`: backend toolkit packs.

Where things live:

- `src/session/` (see its `README.md`): Session storage, event projection, durable input admission, history, context epochs.
- `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`: Location identity and scoped services.
- `src/provider.ts`, `src/model.ts`, `src/tool/`, `src/config/`, `src/plugin/`: provider, model, tool, configuration and plugin services.
- `src/host.ts` and `src/host/`: `Host.Contribution`, how product modules add services to the process.
- `src/database/` (see its `README.md`): SQLite setup, generated schema, ordered TypeScript migrations in `src/database/migration/`, registered by `migration.gen.ts`.
- `src/agent/prompt/` and `src/plugin/command/`: bundled prompt and command text, kept beside their owners.

## Session execution in brief

`SessionV2.prompt(...)` admits a durable input, then schedules an advisory `SessionExecution.wake(sessionID)` unless `resume: false` (admit-only). The serialized runner promotes admitted inputs at safe provider-turn boundaries. `SessionExecution` is process-global and keyed by Session ID; `SessionRunner`, model resolution, tools, permissions and filesystem services are Location-scoped. Drains are process-local. The full rules are in the repository [AGENTS.md](../../AGENTS.md) under "V2 Session Core".

## Commands

From `packages/core`:

```sh
bun typecheck
```

Tests run on GitHub Actions from the repository root: `bun run test:ci core test/<file>.test.ts`.

## Limits

- Existing data roots (`Global.Path`), the database path and migration history are stable data contracts.
- After a change to the public Protocol or Server `HttpApi`, run `bun run generate` in `packages/client`; never edit its generated files.

<!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
## Module contract
- Package: `@orchestra/core` at `packages/core` (alias `core`)
- Summary: Reusable platform and domain services for the application and server layers, including the V2 Session core.
- Layer: `platform`; may depend on: `foundation`, `native`, `library`, `contract`, `extension-api`, `module:platformLibrary`
- Status: `canonical`
- Owner: core platform maintainer
- Public entry: explicit `exports` in package.json
- Legacy and compatibility: `packages/core/src/github-copilot` (vendored)
- Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.

### Domains
- `atlas` — platform — `src/atlas.ts` — packages/core
- `session` — platform — `src/session/`, `src/session.ts`, `src/session-process.ts` — packages/core
- `agent` — platform — `src/agent/`, `src/agent.ts` — packages/core
- `system-context` — platform — `src/system-context/` — packages/core
- `tool` — platform — `src/tool/`, `src/tool-output-store.ts`, `src/mcp/`, `src/mcp.ts`, `src/lsp/`, `src/lsp.ts` — packages/core
- `tool-safety` — platform — `src/tool-safety.ts`, `src/tool-safety-*`, `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` — packages/core
- `relay` — platform — `src/relay.ts`, `src/relay-*` — packages/core
- `config` — platform — `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/`, `src/tui-config-files.ts` — packages/core
- `permission` — platform — `src/permission/`, `src/permission.ts`, `src/question.ts` — packages/core
- `location` — platform — `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` — packages/core
- `project` — platform — `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/git-cli.ts`, `src/vcs.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/guardrail.ts`, `src/workspace.ts`, `src/format.ts`, `src/format/` — packages/core
- `database` — platform — `src/database/`, `src/data-migration.sql.ts` — packages/core
- `event` — platform — `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` — packages/core
- `runtime` — platform — `src/effect/`, `src/global.ts`, `src/host.ts`, `src/host/`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` — packages/core
- `process` — platform — `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*`, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` — packages/core
- `provider` — platform — `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` — packages/core
- `plugin-host` — platform — `src/plugin/`, `src/plugin.ts` — packages/core
- `identity` — platform — `src/claude-code-account.ts`, `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` — packages/core
- `instruction` — platform — `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/slash-command.ts`, `src/reference/`, `src/reference.ts` — packages/core
- `research` — platform — `src/research/`, `src/research-toolkit/` — packages/core
- `backend-toolkit` — platform — `src/backend-toolkit/`, `src/pinned-artifact.ts` — packs move to modules/backend-toolkit after the 70-C' cut
- `control-plane` — platform — `src/control-plane/` — packages/core
- `capability` — platform — `src/capability/`, `src/toolkit/` — packages/core
- `board` — platform — `src/board/` — packages/core
- `rag-studio` — platform — `src/rag-studio/` — packages/core
- `scheduled-task` — platform — `src/scheduled-task/`, `src/scheduled-task.ts` — packages/core
- `actions` — platform — `src/actions/`, `src/actions.ts` — packages/core
- `util` — platform — `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` — packages/core
<!-- module-contract:end -->
````

## F193

`packages/core/package.json:8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43` — lines 1–453.

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "version": "1.18.27",
  "name": "@orchestra/core",
  "type": "module",
  "license": "MIT",
  "private": true,
  "scripts": {
    "db": "bun drizzle-kit",
    "migration": "bun run script/migration.ts",
    "fix-node-pty": "bun run script/fix-node-pty.ts",
    "test": "bun test --timeout 30000 --only-failures",
    "typecheck": "tsgo --noEmit"
  },
  "exports": {
    "./account": "./src/account.ts",
    "./account/sql": "./src/account/sql.ts",
    "./actions": "./src/actions.ts",
    "./actions/contract": "./src/actions/contract.ts",
    "./actions/error": "./src/actions/error.ts",
    "./actions/operations": "./src/actions/operations.ts",
    "./actions/operations/sql": "./src/actions/operations/sql.ts",
    "./actions/output/native": "./src/actions/output/native.ts",
    "./agent": "./src/agent.ts",
    "./agent/prompt": "./src/agent/prompt.ts",
    "./aisdk": "./src/aisdk.ts",
    "./artifact-native-windows": "./src/artifact-native-windows.ts",
    "./atlas": "./src/atlas.ts",
    "./backend-toolkit": "./src/backend-toolkit/index.ts",
    "./backend-toolkit/manifest": "./src/backend-toolkit/manifest.ts",
    "./backend-toolkit/project-version": "./src/backend-toolkit/project-version.ts",
    "./backend-toolkit/target": "./src/backend-toolkit/target.ts",
    "./background-job": "./src/background-job.ts",
    "./behavior": "./src/behavior.ts",
    "./capability/artifact/index": "./src/capability/artifact/index.ts",
    "./capability/artifact/management": "./src/capability/artifact/management.ts",
    "./capability/artifact/selection": "./src/capability/artifact/selection.ts",
    "./capability/catalog/cursors": "./src/capability/catalog/cursors.ts",
    "./capability/catalog/descriptors": "./src/capability/catalog/descriptors.ts",
    "./capability/catalog/discovery": "./src/capability/catalog/discovery.ts",
    "./capability/catalog/schema": "./src/capability/catalog/schema.ts",
    "./capability/channel/http": "./src/capability/channel/http.ts",
    "./capability/channel/index": "./src/capability/channel/index.ts",
    "./capability/channel/schema": "./src/capability/channel/schema.ts",
    "./capability/children": "./src/capability/children.ts",
    "./capability/connection/bindings": "./src/capability/connection/bindings.ts",
    "./capability/connection/index": "./src/capability/connection/index.ts",
    "./capability/connection/management": "./src/capability/connection/management.ts",
    "./capability/connection/setup": "./src/capability/connection/setup.ts",
    "./capability/connection/setup-contract": "./src/capability/connection/setup-contract.ts",
    "./capability/connection/store": "./src/capability/connection/store.ts",
    "./capability/connection/store-contract": "./src/capability/connection/store-contract.ts",
    "./capability/connection/verifiers/cloudflare": "./src/capability/connection/verifiers/cloudflare.ts",
    "./capability/connection/verifiers/contract": "./src/capability/connection/verifiers/contract.ts",
    "./capability/connection/verifiers/globalping": "./src/capability/connection/verifiers/globalping.ts",
    "./capability/connection/verifiers/linear": "./src/capability/connection/verifiers/linear.ts",
    "./capability/connection/verifiers/neon": "./src/capability/connection/verifiers/neon.ts",
    "./capability/connection/verifiers/openai": "./src/capability/connection/verifiers/openai.ts",
    "./capability/connection/verifiers/runway": "./src/capability/connection/verifiers/runway.ts",
    "./capability/connection/verifiers/stripe": "./src/capability/connection/verifiers/stripe.ts",
    "./capability/connection/verifiers/supabase": "./src/capability/connection/verifiers/supabase.ts",
    "./capability/connection/verify": "./src/capability/connection/verify.ts",
    "./capability/invocation": "./src/capability/invocation.ts",
    "./capability/job/index": "./src/capability/job/index.ts",
    "./capability/mcp/index": "./src/capability/mcp/index.ts",
    "./capability/media/http": "./src/capability/media/http.ts",
    "./capability/media/index": "./src/capability/media/index.ts",
    "./capability/media/schema": "./src/capability/media/schema.ts",
    "./capability/operator/contract": "./src/capability/operator/contract.ts",
    "./capability/operator/index": "./src/capability/operator/index.ts",
    "./capability/operator/request": "./src/capability/operator/request.ts",
    "./capability/operator/request-data": "./src/capability/operator/request-data.ts",
    "./capability/operator/scope": "./src/capability/operator/scope.ts",
    "./capability/policy": "./src/capability/policy.ts",
    "./capability/process-control/contract": "./src/capability/process-control/contract.ts",
    "./capability/process-control/index": "./src/capability/process-control/index.ts",
    "./capability/process-control/output": "./src/capability/process-control/output.ts",
    "./capability/process-control/registry": "./src/capability/process-control/registry.ts",
    "./capability/process-control/sweep": "./src/capability/process-control/sweep.ts",
    "./capability/schedule/contract": "./src/capability/schedule/contract.ts",
    "./capability/schedule/index": "./src/capability/schedule/index.ts",
    "./capability/schedule/management": "./src/capability/schedule/management.ts",
    "./capability/service/contract": "./src/capability/service/contract.ts",
    "./capability/service/execute": "./src/capability/service/execute.ts",
    "./capability/service/execution/projection": "./src/capability/service/execution/projection.ts",
    "./capability/service/index": "./src/capability/service/index.ts",
    "./capability/service/providers": "./src/capability/service/providers.ts",
    "./capability/service/schema": "./src/capability/service/schema.ts",
    "./capability/sql": "./src/capability/sql.ts",
    "./capability/tools": "./src/capability/tools.ts",
    "./catalog": "./src/catalog.ts",
    "./claude-code-account": "./src/claude-code-account.ts",
    "./command": "./src/command.ts",
    "./config": "./src/config.ts",
    "./config/agent-file": "./src/config/agent-file.ts",
    "./config/attachments": "./src/config/attachments.ts",
    "./config/compaction": "./src/config/compaction.ts",
    "./config/markdown": "./src/config/markdown.ts",
    "./config/plugin-file": "./src/config/plugin-file.ts",
    "./config/plugin/agent": "./src/config/plugin/agent.ts",
    "./config/plugin/command": "./src/config/plugin/command.ts",
    "./config/plugin/external": "./src/config/plugin/external.ts",
    "./config/plugin/provider": "./src/config/plugin/provider.ts",
    "./config/plugin/skill": "./src/config/plugin/skill.ts",
    "./config/provider": "./src/config/provider.ts",
    "./config/provider-options": "./src/config/provider-options.ts",
    "./config/tool-output": "./src/config/tool-output.ts",
    "./config/trust": "./src/config/trust.ts",
    "./config/upgrade/agent": "./src/config/upgrade/agent.ts",
    "./config/upgrade/lsp": "./src/config/upgrade/lsp.ts",
    "./config/upgrade/source": "./src/config/upgrade/source.ts",
    "./config/upgrade/upgrade": "./src/config/upgrade/upgrade.ts",
    "./control-plane/move-session": "./src/control-plane/move-session.ts",
    "./control-plane/workspace.sql": "./src/control-plane/workspace.sql.ts",
    "./board/board": "./src/board/board.ts",
    "./board/ci": "./src/board/ci.ts",
    "./board/conflicts": "./src/board/conflicts.ts",
    "./board/github": "./src/board/github.ts",
    "./board/queue": "./src/board/queue.ts",
    "./board/queue-lanes": "./src/board/queue-lanes.ts",
    "./board/record": "./src/board/record.ts",
    "./board/tree": "./src/board/tree.ts",
    "./board/spend": "./src/board/spend.ts",
    "./board/sql": "./src/board/sql.ts",
    "./board/thread": "./src/board/thread.ts",
    "./board/tools": "./src/board/tools.ts",
    "./credential": "./src/credential.ts",
    "./credential/cipher": "./src/credential/cipher.ts",
    "./credential/sql": "./src/credential/sql.ts",
    "./cross-spawn-spawner": "./src/cross-spawn-spawner.ts",
    "./database/database": "./src/database/database.ts",
    "./database/migration": "./src/database/migration.ts",
    "./database/migration.gen": "./src/database/migration.gen.ts",
    "./database/migration/20260410174513_workspace-name": "./src/database/migration/20260410174513_workspace-name.ts",
    "./database/migration/20260510033149_session_usage": "./src/database/migration/20260510033149_session_usage.ts",
    "./database/migration/20260511173437_session-metadata": "./src/database/migration/20260511173437_session-metadata.ts",
    "./database/migration/20260601010001_normalize_storage_paths": "./src/database/migration/20260601010001_normalize_storage_paths.ts",
    "./database/migration/20260603040000_session_message_projection_order": "./src/database/migration/20260603040000_session_message_projection_order.ts",
    "./database/migration/20260604172448_event_sourced_session_input": "./src/database/migration/20260604172448_event_sourced_session_input.ts",
    "./database/migration/20260605042240_add_context_epoch_agent": "./src/database/migration/20260605042240_add_context_epoch_agent.ts",
    "./database/migration/20260611192811_lush_chimera": "./src/database/migration/20260611192811_lush_chimera.ts",
    "./database/migration/20260622202450_simplify_session_input": "./src/database/migration/20260622202450_simplify_session_input.ts",
    "./database/migration/20261008025417_prompt_context": "./src/database/migration/20261008025417_prompt_context.ts",
    "./database/migration/20261010135215_project_checkpoints": "./src/database/migration/20261010135215_project_checkpoints.ts",
    "./database/migration/20261012134025_session_subagent_models": "./src/database/migration/20261012134025_session_subagent_models.ts",
    "./database/migration/20261018031800_session_list_indexes": "./src/database/migration/20261018031800_session_list_indexes.ts",
    "./database/migration/20261026003504_meeting_record": "./src/database/migration/20261026003504_meeting_record.ts",
    "./database/sqlite": "./src/database/sqlite.ts",
    "./database/sqlite.bun": "./src/database/sqlite.bun.ts",
    "./effect/app-node": "./src/effect/app-node.ts",
    "./effect/app-node-builder": "./src/effect/app-node-builder.ts",
    "./effect/app-node-platform": "./src/effect/app-node-platform.ts",
    "./effect/keyed-mutex": "./src/effect/keyed-mutex.ts",
    "./effect/layer-node": "./src/effect/layer-node.ts",
    "./effect/memo-map": "./src/effect/memo-map.ts",
    "./effect/runtime": "./src/effect/runtime.ts",
    "./effect/service-use": "./src/effect/service-use.ts",
    "./event": "./src/event.ts",
    "./event/seal": "./src/event/seal.ts",
    "./event/sql": "./src/event/sql.ts",
    "./file-mutation": "./src/file-mutation.ts",
    "./filesystem": "./src/filesystem.ts",
    "./filesystem/fff.bun": "./src/filesystem/fff.bun.ts",
    "./filesystem/ignore": "./src/filesystem/ignore.ts",
    "./filesystem/search": "./src/filesystem/search.ts",
    "./filesystem/watcher": "./src/filesystem/watcher.ts",
    "./flag/flag": "./src/flag/flag.ts",
    "./format": "./src/format.ts",
    "./fs-util": "./src/fs-util.ts",
    "./git": "./src/git.ts",
    "./git-cli": "./src/git-cli.ts",
    "./github-copilot/chat/convert-to-openai-compatible-chat-messages": "./src/github-copilot/chat/convert-to-openai-compatible-chat-messages.ts",
    "./github-copilot/chat/openai-compatible-chat-language-model": "./src/github-copilot/chat/openai-compatible-chat-language-model.ts",
    "./github-copilot/copilot-provider": "./src/github-copilot/copilot-provider.ts",
    "./github-copilot/responses/convert-to-openai-responses-input": "./src/github-copilot/responses/convert-to-openai-responses-input.ts",
    "./github-copilot/responses/openai-responses-language-model": "./src/github-copilot/responses/openai-responses-language-model.ts",
    "./global": "./src/global.ts",
    "./host": "./src/host.ts",
    "./host/agent-execution": "./src/host/agent-execution.ts",
    "./host/catalog-availability": "./src/host/catalog-availability.ts",
    "./host/pty-environment": "./src/host/pty-environment.ts",
    "./id/id": "./src/id/id.ts",
    "./image": "./src/image.ts",
    "./installation/headers": "./src/installation/headers.ts",
    "./installation/service": "./src/installation/service.ts",
    "./installation/version": "./src/installation/version.ts",
    "./instruction-context": "./src/instruction-context.ts",
    "./integration": "./src/integration.ts",
    "./integration/connection": "./src/integration/connection.ts",
    "./location": "./src/location.ts",
    "./location-mutation": "./src/location-mutation.ts",
    "./location-service-map": "./src/location-service-map.ts",
    "./location-services": "./src/location-services.ts",
    "./lsp": "./src/lsp.ts",
    "./lsp/client": "./src/lsp/client.ts",
    "./lsp/diagnostic": "./src/lsp/diagnostic.ts",
    "./lsp/language": "./src/lsp/language.ts",
    "./lsp/launch": "./src/lsp/launch.ts",
    "./lsp/ownership": "./src/lsp/ownership.ts",
    "./lsp/server": "./src/lsp/server.ts",
    "./mcp": "./src/mcp.ts",
    "./mcp/auth": "./src/mcp/auth.ts",
    "./mcp/catalog": "./src/mcp/catalog.ts",
    "./mcp/client": "./src/mcp/client.ts",
    "./mcp/oauth-callback": "./src/mcp/oauth-callback.ts",
    "./mcp/oauth-provider": "./src/mcp/oauth-provider.ts",
    "./mcp/project-config": "./src/mcp/project-config.ts",
    "./mcp/provided": "./src/mcp/provided.ts",
    "./mcp/stdio": "./src/mcp/stdio.ts",
    "./model": "./src/model.ts",
    "./models-dev": "./src/models-dev.ts",
    "./npm": "./src/npm.ts",
    "./npm-config": "./src/npm-config.ts",
    "./oauth/page": "./src/oauth/page.ts",
    "./observability": "./src/observability.ts",
    "./omni": "./src/omni.ts",
    "./omni-adoption": "./src/omni-adoption.ts",
    "./omni-background": "./src/omni-background.ts",
    "./omni-spawner": "./src/omni-spawner.ts",
    "./output-inspector": "./src/output-inspector.ts",
    "./packaged-skills": "./src/packaged-skills.ts",
    "./patch": "./src/patch.ts",
    "./permission": "./src/permission.ts",
    "./permission/saved": "./src/permission/saved.ts",
    "./permission/sql": "./src/permission/sql.ts",
    "./plugin": "./src/plugin.ts",
    "./plugin/agent": "./src/plugin/agent.ts",
    "./plugin/command": "./src/plugin/command.ts",
    "./plugin/host": "./src/plugin/host.ts",
    "./plugin/models-dev": "./src/plugin/models-dev.ts",
    "./plugin/promise": "./src/plugin/promise.ts",
    "./plugin/provider": "./src/plugin/provider.ts",
    "./plugin/provider/alibaba": "./src/plugin/provider/alibaba.ts",
    "./plugin/provider/amazon-bedrock": "./src/plugin/provider/amazon-bedrock.ts",
    "./plugin/provider/anthropic": "./src/plugin/provider/anthropic.ts",
    "./plugin/provider/azure": "./src/plugin/provider/azure.ts",
    "./plugin/provider/cerebras": "./src/plugin/provider/cerebras.ts",
    "./plugin/provider/cloudflare-ai-gateway": "./src/plugin/provider/cloudflare-ai-gateway.ts",
    "./plugin/provider/cloudflare-workers-ai": "./src/plugin/provider/cloudflare-workers-ai.ts",
    "./plugin/provider/cohere": "./src/plugin/provider/cohere.ts",
    "./plugin/provider/deepinfra": "./src/plugin/provider/deepinfra.ts",
    "./plugin/provider/dynamic": "./src/plugin/provider/dynamic.ts",
    "./plugin/provider/gateway": "./src/plugin/provider/gateway.ts",
    "./plugin/provider/github-copilot": "./src/plugin/provider/github-copilot.ts",
    "./plugin/provider/gitlab": "./src/plugin/provider/gitlab.ts",
    "./plugin/provider/google": "./src/plugin/provider/google.ts",
    "./plugin/provider/google-vertex": "./src/plugin/provider/google-vertex.ts",
    "./plugin/provider/groq": "./src/plugin/provider/groq.ts",
    "./plugin/provider/kilo": "./src/plugin/provider/kilo.ts",
    "./plugin/provider/llmgateway": "./src/plugin/provider/llmgateway.ts",
    "./plugin/provider/mistral": "./src/plugin/provider/mistral.ts",
    "./plugin/provider/nvidia": "./src/plugin/provider/nvidia.ts",
    "./plugin/provider/openai": "./src/plugin/provider/openai.ts",
    "./plugin/provider/openai-compatible": "./src/plugin/provider/openai-compatible.ts",
    "./plugin/provider/opencode": "./src/plugin/provider/opencode.ts",
    "./plugin/provider/openrouter": "./src/plugin/provider/openrouter.ts",
    "./plugin/provider/perplexity": "./src/plugin/provider/perplexity.ts",
    "./plugin/provider/sap-ai-core": "./src/plugin/provider/sap-ai-core.ts",
    "./plugin/provider/snowflake-cortex": "./src/plugin/provider/snowflake-cortex.ts",
    "./plugin/provider/togetherai": "./src/plugin/provider/togetherai.ts",
    "./plugin/provider/venice": "./src/plugin/provider/venice.ts",
    "./plugin/provider/vercel": "./src/plugin/provider/vercel.ts",
    "./plugin/provider/xai": "./src/plugin/provider/xai.ts",
    "./plugin/provider/zenmux": "./src/plugin/provider/zenmux.ts",
    "./plugin/sdk-limits": "./src/plugin/sdk-limits.ts",
    "./plugin/sdk-package": "./src/plugin/sdk-package.ts",
    "./plugin/sdk-runtime": "./src/plugin/sdk-runtime.ts",
    "./plugin/variant": "./src/plugin/variant.ts",
    "./policy": "./src/policy.ts",
    "./process": "./src/process.ts",
    "./test/fixture/omni-expect": "./test/fixture/omni-expect.ts",
    "./test/lib/effect": "./test/lib/effect.ts",
    "./test/fixture/windows-process-query": "./test/fixture/windows-process-query.ts",
    "./test/fixture/tmpdir": "./test/fixture/tmpdir.ts",
    "./test/fixture/process-tree": "./test/fixture/process-tree.ts",
    "./test/fixture/omni-effect": "./test/fixture/omni-effect.ts",
    "./project": "./src/project.ts",
    "./project/checkpoint": "./src/project/checkpoint.ts",
    "./project/checkpoint.sql": "./src/project/checkpoint.sql.ts",
    "./project/copy": "./src/project/copy.ts",
    "./project/directories": "./src/project/directories.ts",
    "./project/schema": "./src/project/schema.ts",
    "./project/sql": "./src/project/sql.ts",
    "./provider": "./src/provider.ts",
    "./pty": "./src/pty.ts",
    "./pty/omni": "./src/pty/omni.ts",
    "./pty/protocol": "./src/pty/protocol.ts",
    "./pty/shell-integration": "./src/pty/shell-integration.ts",
    "./pty/shell-cwd": "./src/pty/shell-cwd.ts",
    "./pty/shell-marks": "./src/pty/shell-marks.ts",
    "./pty/schema": "./src/pty/schema.ts",
    "./pty/ticket": "./src/pty/ticket.ts",
    "./guardrail": "./src/guardrail.ts",
    "./pull-request": "./src/pull-request.ts",
    "./question": "./src/question.ts",
    "./rag-studio/sql": "./src/rag-studio/sql.ts",
    "./reference": "./src/reference.ts",
    "./reference/guidance": "./src/reference/guidance.ts",
    "./relay": "./src/relay.ts",
    "./relay-commands": "./src/relay-commands.ts",
    "./relay-hook-install": "./src/relay-hook-install.ts",
    "./relay-hook-recovery": "./src/relay-hook-recovery.ts",
    "./relay-workflow-binding": "./src/relay-workflow-binding.ts",
    "./relay-workflow-currentstep": "./src/relay-workflow-currentstep.ts",
    "./relay-workflow-evaluator": "./src/relay-workflow-evaluator.ts",
    "./relay-workflow-session": "./src/relay-workflow-session.ts",
    "./relay-workflow-transition": "./src/relay-workflow-transition.ts",
    "./repository": "./src/repository.ts",
    "./repository-cache": "./src/repository-cache.ts",
    "./research-toolkit/code-index/build": "./src/research-toolkit/code-index/build.ts",
    "./research-toolkit/code-index/extract": "./src/research-toolkit/code-index/extract.ts",
    "./research-toolkit/code-index/query": "./src/research-toolkit/code-index/query.ts",
    "./research-toolkit/code-index/rank": "./src/research-toolkit/code-index/rank.ts",
    "./research-toolkit/code-index/shard": "./src/research-toolkit/code-index/shard.ts",
    "./research-toolkit/code-index/store": "./src/research-toolkit/code-index/store.ts",
    "./research-toolkit/code-index/types": "./src/research-toolkit/code-index/types.ts",
    "./research-toolkit/index": "./src/research-toolkit/index.ts",
    "./research-toolkit/liveness": "./src/research-toolkit/liveness.ts",
    "./research-toolkit/locate": "./src/research-toolkit/locate.ts",
    "./research-toolkit/manifest": "./src/research-toolkit/manifest.ts",
    "./research-toolkit/probe/run": "./src/research-toolkit/probe/run.ts",
    "./research-toolkit/probe/types": "./src/research-toolkit/probe/types.ts",
    "./research-toolkit/search": "./src/research-toolkit/search.ts",
    "./research/allowance": "./src/research/allowance.ts",
    "./research/artifacts": "./src/research/artifacts.ts",
    "./research/binding": "./src/research/binding.ts",
    "./research/ledger": "./src/research/ledger.ts",
    "./research/records": "./src/research/records.ts",
    "./research/seat-tools": "./src/research/seat-tools.ts",
    "./ripgrep": "./src/ripgrep.ts",
    "./ripgrep/binary": "./src/ripgrep/binary.ts",
    "./ripgrep/bundle": "./src/ripgrep/bundle.ts",
    "./ripgrep/release": "./src/ripgrep/release.ts",
    "./scheduled-task": "./src/scheduled-task.ts",
    "./scheduled-task/capability-model": "./src/scheduled-task/capability-model.ts",
    "./scheduled-task/model": "./src/scheduled-task/model.ts",
    "./scheduled-task/port": "./src/scheduled-task/port.ts",
    "./scheduled-task/sql": "./src/scheduled-task/sql.ts",
    "./schema": "./src/schema.ts",
    "./session": "./src/session.ts",
    "./session-process": "./src/session-process.ts",
    "./session/activity": "./src/session/activity.ts",
    "./session/compaction": "./src/session/compaction.ts",
    "./session/error": "./src/session/error.ts",
    "./session/event": "./src/session/event.ts",
    "./session/execution": "./src/session/execution.ts",
    "./session/execution/local": "./src/session/execution/local.ts",
    "./session/history": "./src/session/history.ts",
    "./session/info": "./src/session/info.ts",
    "./session/input": "./src/session/input.ts",
    "./session/message": "./src/session/message.ts",
    "./session/message-updater": "./src/session/message-updater.ts",
    "./session/projector": "./src/session/projector.ts",
    "./session/prompt": "./src/session/prompt.ts",
    "./session/run-coordinator": "./src/session/run-coordinator.ts",
    "./session/runner": "./src/session/runner/index.ts",
    "./session/runner/llm": "./src/session/runner/llm.ts",
    "./session/runner/max-steps": "./src/session/runner/max-steps.ts",
    "./session/runner/model": "./src/session/runner/model.ts",
    "./session/runner/publish-llm-event": "./src/session/runner/publish-llm-event.ts",
    "./session/runner/to-llm-message": "./src/session/runner/to-llm-message.ts",
    "./session/schema": "./src/session/schema.ts",
    "./session/sql": "./src/session/sql.ts",
    "./session/store": "./src/session/store.ts",
    "./session/subagent-models": "./src/session/subagent-models.ts",
    "./session/meeting": "./src/session/meeting.ts",
    "./session/meeting-briefing": "./src/session/meeting-briefing.ts",
    "./session/meeting-consolidation": "./src/session/meeting-consolidation.ts",
    "./session/meeting-context": "./src/session/meeting-context.ts",
    "./session/meeting-handoff": "./src/session/meeting-handoff.ts",
    "./session/meeting-memory.sql": "./src/session/meeting-memory.sql.ts",
    "./session/meeting.sql": "./src/session/meeting.sql.ts",
    "./session/todo": "./src/session/todo.ts",
    "./share/sql": "./src/share/sql.ts",
    "./shell": "./src/shell.ts",
    "./skill": "./src/skill.ts",
    "./skill/discovery": "./src/skill/discovery.ts",
    "./skill/file": "./src/skill/file.ts",
    "./skill/guidance": "./src/skill/guidance.ts",
    "./slash-command": "./src/slash-command.ts",
    "./snapshot": "./src/snapshot.ts",
    "./state": "./src/state.ts",
    "./system-context": "./src/system-context/index.ts",
    "./system-context/builtins": "./src/system-context/builtins.ts",
    "./system-context/index": "./src/system-context/index.ts",
    "./system-context/registry": "./src/system-context/registry.ts",
    "./tool-output-store": "./src/tool-output-store.ts",
    "./tool-safety": "./src/tool-safety.ts",
    "./tool-safety-appcontainer": "./src/tool-safety-appcontainer.ts",
    "./tool-safety-git": "./src/tool-safety-git.ts",
    "./tool-safety-hooks": "./src/tool-safety-hooks.ts",
    "./tool-safety-profile": "./src/tool-safety-profile.ts",
    "./tool-safety-sandbox": "./src/tool-safety-sandbox.ts",
    "./tool-safety-sandbox-runtime": "./src/tool-safety-sandbox-runtime.ts",
    "./tool/application-tools": "./src/tool/application-tools.ts",
    "./tool/apply-patch": "./src/tool/apply-patch.ts",
    "./tool/agent-terminal": "./src/tool/agent-terminal.ts",
    "./tool/bash": "./src/tool/bash.ts",
    "./tool/edit": "./src/tool/edit.ts",
    "./tool/glob": "./src/tool/glob.ts",
    "./tool/grep": "./src/tool/grep.ts",
    "./tool/lean-output": "./src/tool/lean-output.ts",
    "./tool/lean-processor": "./src/tool/lean-processor.ts",
    "./tool/lean-recall": "./src/tool/lean-recall.ts",
    "./tool/lean-summary": "./src/tool/lean-summary.ts",
    "./tool/lean-telemetry": "./src/tool/lean-telemetry.ts",
    "./tool/maestro-arsenal": "./src/tool/maestro-arsenal.ts",
    "./tool/maestro-arsenal-omni": "./src/tool/maestro-arsenal-omni.ts",
    "./tool/model-capture": "./src/tool/model-capture.ts",
    "./tool/model-projection": "./src/tool/model-projection.ts",
    "./tool/question": "./src/tool/question.ts",
    "./tool/read": "./src/tool/read.ts",
    "./tool/read-filesystem": "./src/tool/read-filesystem.ts",
    "./tool/registry": "./src/tool/registry.ts",
    "./tool/skill": "./src/tool/skill.ts",
    "./tool/task": "./src/tool/task.ts",
    "./tool/task-background": "./src/tool/task-background.ts",
    "./tool/task-governance": "./src/tool/task-governance.ts",
    "./tool/live-look": "./src/tool/live-look.ts",
    "./tool/meeting-recall": "./src/tool/meeting-recall.ts",
    "./tool/team-message": "./src/tool/team-message.ts",
    "./tool/text": "./src/tool/text.ts",
    "./tool/todowrite": "./src/tool/todowrite.ts",
    "./tool/tool": "./src/tool/tool.ts",
    "./tool/tools": "./src/tool/tools.ts",
    "./tool/truncation-dir": "./src/tool/truncation-dir.ts",
    "./tool/upstream-arsenal": "./src/tool/upstream-arsenal.ts",
    "./tool/webfetch": "./src/tool/webfetch.ts",
    "./tool/websearch": "./src/tool/websearch.ts",
    "./tool/write": "./src/tool/write.ts",
    "./tui-config-files": "./src/tui-config-files.ts",
    "./util/array": "./src/util/array.ts",
    "./util/binary": "./src/util/binary.ts",
    "./util/effect-flock": "./src/util/effect-flock.ts",
    "./util/encode": "./src/util/encode.ts",
    "./util/error": "./src/util/error.ts",
    "./util/flock": "./src/util/flock.ts",
    "./util/glob": "./src/util/glob.ts",
    "./util/hash": "./src/util/hash.ts",
    "./util/module": "./src/util/module.ts",
    "./util/path": "./src/util/path.ts",
    "./util/physical-path": "./src/util/physical-path.ts",
    "./util/retry": "./src/util/retry.ts",
    "./util/slug": "./src/util/slug.ts",
    "./util/task-tool": "./src/util/task-tool.ts",
    "./util/timeout": "./src/util/timeout.ts",
    "./util/token": "./src/util/token.ts",
    "./util/which": "./src/util/which.ts",
    "./util/wildcard": "./src/util/wildcard.ts",
    "./v2-schema": "./src/v2-schema.ts",
    "./vcs": "./src/vcs.ts",
    "./workspace": "./src/workspace.ts"
  },
```

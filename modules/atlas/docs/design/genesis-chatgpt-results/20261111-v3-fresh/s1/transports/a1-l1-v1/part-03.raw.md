### G139 — 2 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.session-execution; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session/runner/execution-host.ts`
- `packages/core/src/session/runner/index.ts`


### G140 — 29 memberships

```json
{
  "family": "session",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive session leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.session-execution; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "flow",
  "proposed_artifact_key": "s1.core.session-execution",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/session-process.ts`
- `packages/core/src/session/activity.ts`
- `packages/core/src/session/archive.ts`
- `packages/core/src/session/error.ts`
- `packages/core/src/session/info.ts`
- `packages/core/src/session/lean-profile-preferences.ts`
- `packages/core/src/session/lean-project.ts`
- `packages/core/src/session/lifecycle.ts`
- `packages/core/src/session/meeting-briefing.ts`
- `packages/core/src/session/meeting-consolidation.ts`
- `packages/core/src/session/meeting-context.ts`
- `packages/core/src/session/meeting-handoff.ts`
- `packages/core/src/session/meeting-memory.ts`
- `packages/core/src/session/meeting-verdict.ts`
- `packages/core/src/session/meeting.ts`
- `packages/core/src/session/message-updater.ts`
- `packages/core/src/session/message.ts`
- `packages/core/src/session/prompt.ts`
- `packages/core/src/session/revert.ts`
- `packages/core/src/session/runner/direct-commands.ts`
- `packages/core/src/session/runner/hosted-call.ts`
- `packages/core/src/session/runner/max-steps.ts`
- `packages/core/src/session/runner/mentions.ts`
- `packages/core/src/session/runner/publish-llm-event.ts`
- `packages/core/src/session/runner/step-tools.ts`
- `packages/core/src/session/runner/title.ts`
- `packages/core/src/session/runner/to-llm-message.ts`
- `packages/core/src/session/runner/turn-transition.ts`
- `packages/core/src/session/todo.ts`


### G141 — 4 memberships

```json
{
  "family": "system-context",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.context; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/instruction-context.ts`
- `packages/core/src/system-context/builtins.ts`
- `packages/core/src/system-context/index.ts`
- `packages/core/src/system-context/registry.ts`


### G142 — 7 memberships

```json
{
  "family": "system-context",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under system-context; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.context",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/hook-prompt-context.test.ts`
- `packages/core/test/instruction-context.test.ts`
- `packages/core/test/prompt-context-compaction.test.ts`
- `packages/core/test/prompt-context.test.ts`
- `packages/core/test/system-context/builtins.test.ts`
- `packages/core/test/system-context/index.test.ts`
- `packages/core/test/system-context/registry.test.ts`


# Original exact decisive source spans

# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.


## C001

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 499–514.

```typescript
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
```


## C002

`packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — lines 291–300.

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
```


## C003

`packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — lines 85–96.

```typescript
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
```


## C004

`packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2` — lines 99–110.

```typescript
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
```


## C005

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 427–432.

```typescript
      const source = request
        ? llm.stream(request)
        : host && agent.info
          ? host.stream({
              session,
              agent: agent.info,
```


## C006

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 510–517.

```typescript
            yield* withPublication(publisher.failUnsettledTools("Provider did not return a tool result", true))
            yield* withPublication(publisher.failAssistant(llmFailure.reason.message))
          }
          if (stream._tag === "Failure" && Cause.hasInterrupts(stream.cause)) yield* FiberSet.clear(toolFibers)
          const settled = yield* restore(awaitToolFibers(toolFibers)).pipe(Effect.exit)
          if (settled._tag === "Failure" && SessionDirectCommands.isUserDeclined(settled.cause)) {
            yield* FiberSet.clear(toolFibers)
            yield* withPublication(publisher.failUnsettledTools("Tool execution interrupted"))
```


## C007

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 620–630.

```typescript
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
```


## C008

`packages/core/src/database/database.ts:aa519134efff085e960affd9be376b0dc92456e1` — lines 35–42.

```typescript
    yield* db.run("PRAGMA journal_mode = WAL")
    yield* db.run("PRAGMA synchronous = NORMAL")
    yield* db.run("PRAGMA busy_timeout = 5000")
    yield* db.run("PRAGMA cache_size = -64000")
    yield* db.run("PRAGMA foreign_keys = ON")
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")
    yield* DatabaseMigration.apply(db)

```


## C009

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 197–200.

```typescript
      // TODO: Bind durable projectors to exact type+version before supporting incompatible historical payloads.
      const listeners = new Array<Subscriber>()
      const { db } = yield* Database.Service

```


## C010

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 383–392.

```typescript
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
```


## C011

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 406–416.

```typescript
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
```


## C012

`packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — lines 663–670.

```typescript
          const wake = yield* PubSub.sliding<void>(1)
          const subscription = yield* PubSub.subscribe(wake)
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const wakes = pubsub.durable.get(aggregateID) ?? new Set()
              wakes.add(wake)
              pubsub.durable.set(aggregateID, wakes)
            }),
```


## C013

`packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — lines 85–88.

```typescript
export function hashRow(row: Row, previous: string, domain = DOMAIN) {
  return createHash("sha256")
    .update(`${domain}\n${previous}\n${canonicalRow(row)}`)
    .digest("hex")
```


## C014

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 201–207.

```typescript
export function initialize(value: SystemContext): Effect.Effect<Generation, InitializationBlocked> {
  return observe(value).pipe(
    Effect.flatMap((entries) => {
      const unavailable = entries.flatMap((entry) => (entry._tag === "Unavailable" ? [entry.key] : []))
      if (unavailable.length > 0) return new InitializationBlocked({ keys: unavailable })
      return Effect.succeed(initializeObservation(entries))
    }),
```


## C015

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 253–258.

```typescript
    const stored = getSnapshot(previous, entry.key)
    if (entry._tag === "Unavailable") {
      if (stored) snapshot[entry.key] = stored
      continue
    }
    if (!stored) {
```


## C016

`packages/core/src/system-context/index.ts:af6e4b8397ac971476c63ca8c0e0d65273ddc933` — lines 290–294.

```typescript
function replaceObservation(entries: ReadonlyArray<Entry>, previous: Snapshot): ReplacementResult {
  if (entries.some((entry) => entry._tag === "Unavailable" && getSnapshot(previous, entry.key) !== undefined))
    return { _tag: "ReplacementBlocked" }
  return { _tag: "ReplacementReady", generation: initializeObservation(entries) }
}
```


## C017

`packages/core/src/session/context-epoch.ts:65b17a86a4fb131d427e12d489cec2c06a088094` — lines 73–78.

```typescript
    SessionEvent.ContextUpdated,
    { sessionID, messageID: SessionMessage.ID.create(), timestamp: yield* DateTime.now, text: result.text },
    { commit: () => advance(db, sessionID, result.snapshot).pipe(Effect.orDie) },
  )
  return { baseline: stored.baseline, baselineSeq: stored.baseline_seq }
})
```


## C018

`packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f` — lines 242–254.

```typescript
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
```


## C019

`packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — lines 592–603.

```typescript
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
```



# Supplemental exact source spans

## Preserved conflicts and mandatory limits

- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.
- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.
- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.
- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.
- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.
- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.


### AEX001

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Existing Session identity wins before applying new creation fields.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 357–364.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `545b68e4f4e81fdebcfa738e1083607ed3342bfdfa04430886fa4ae2663bb8fb` (440 bytes).

````text
    const result = Service.of({
      create: Effect.fn("V2Session.create")(function* (input) {
        const sessionID = input.id ?? SessionSchema.ID.create()
        const recorded = yield* store.get(sessionID)
        if (recorded) return recorded
        if (input.parentID) yield* result.get(input.parentID)
        const project = yield* projects.resolve(input.location.directory)
        yield* ProjectV2.record(db, events, project)
````


### AEX002

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Concurrent creation adopts the recorded Session; post-create hooks cannot undo it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 393–414.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `fd501736789c987505cf539d6d0b2253dc655766a5a95b6f94be17e5168c3659` (1104 bytes).

````text
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
````


### AEX003

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompt hooks occur before admission; an already durable message skips re-asking and leaves retry reconciliation to admission.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93`, lines 304–325.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`; **excerpt SHA256:** `0e976f3b322643b171e0988a9e6dd049175836bd52bf8f6a9236b9aefc49b6d5` (1348 bytes).

````text
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
````


### AEX004

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Historical prompt reconciliation needs the original durable Prompted event for delivery and verifies all projection identity before inserting a promoted inbox row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 96–158.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `29dc5faed3607388dc907b139a1c20e8f27a98792bcc2112beec5a7b101b847f` (3136 bytes).

````text
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
````


### AEX005

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Steers use the admission cutoff and sequence order; queue promotion takes one oldest pending row.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2`, lines 348–390.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`; **excerpt SHA256:** `f564f6bda160c6849aa224f7b0799525b154c2ae1d0efb9720741b2b28b71a95` (1271 bytes).

````text
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
````


### AEX006

**Artifacts:** `s1.core.session-admission`.

**Claim/limit supported:** Prompted promotes and writes visible projection; PromptAdmitted only projects admission under the event machinery.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5`, lines 283–310.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `41e2b996cc570b3db0cc844619454f61234fd499390d5cefa340a6ad2cb0a6ba`; **excerpt SHA256:** `8969842e430658f60b746267f931c44bcf9edcbbc3051031bd7939968eaa6610` (1200 bytes).

````text
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
````


### AEX007

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** The drain resolves the stored Session and routes through its concrete Location.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/execution/local.ts:e7b758462abfd388f937fb18b79f82f2733dffad`, lines 14–29.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `74621798a88cf5f9cb05306616d1896b752b4f4f001c3ae03bafc2e0b3910f97`; **excerpt SHA256:** `463ff50d2ddcbd617ad3cb761f13ac765941dca5e0b2acb6672ae0bcb42316ad` (897 bytes).

````text
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
````


### AEX008

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Stop targets the exact process-local entry and clears pendingWake; it is not a durable cluster lease.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/run-coordinator.ts:526a1e28f6027d744a95f145159be9cc59109ac2`, lines 136–153.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa`; **excerpt SHA256:** `ee5da7fa4926e6f783028cc9cf5d4c3a64162aecbdfabf6ba2be146cd45a9ecd` (634 bytes).

````text
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
````


### AEX009

**Artifacts:** `s1.core.session-execution`, `s1.core.security`, `s1.core.context`.

**Claim/limit supported:** Stored placement and governance precede promotion; agent and Session rules are materialized; missing context is initialized before input visibility and new input resets the step allowance.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 185–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `40a74fe87d62c5123691e911ff20e4b37e59b8e4d3d30ed7c6cfeeb3cee56802` (1724 bytes).

````text
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
````



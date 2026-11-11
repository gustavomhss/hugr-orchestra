### AEX010

**Artifacts:** `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** History follows baselineSeq; the final provider step advertises no tools; hosted engine history bypasses the Core provider compaction transform.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 237–270.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `20b4596f1e6b2a622cceb5448be2e95c4c957eba7be06e6c7f722cc31af213d0` (2273 bytes).

````text
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
````


### AEX011

**Artifacts:** `s1.core.session-execution`.

**Claim/limit supported:** Interrupting a drain cancels all of that Session’s pending permission and question requests.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 671–682.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `95796df62c475859629546adb71ab326f1a99a1e1041c82d9ccc8815eb5a3259` (559 bytes).

````text
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
````


### AEX012

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** An unknown nonempty database is refused; fresh schema initialization uses an immediate transaction with a second existence check.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 21–48.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `c1fb370d27ce41606007dde9a0bd656cfc4e11c4289c5d319cf387527d108d67` (1407 bytes).

````text
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
````


### AEX013

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Unknown journal entries are refused; pending migrations first get VACUUM INTO backup and retention pruning.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 55–94.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `0241d309fced3f5c3de127746e7302969483361f4294f5123d86fac04893603d` (1815 bytes).

````text
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
````


### AEX014

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Every pending migration rereads its identity inside an immediate write transaction before running and journaling it.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7`, lines 150–166.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `3586274f5aa72a80d5645f5caea718d3c9234f69c15ca8ddbfbb8c0b5f37186d`; **excerpt SHA256:** `af2ef65a37916294556a2247658bc65902e2bede039a0b847e29b5b7e217fe51` (881 bytes).

````text
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
````


### AEX015

**Artifacts:** `s1.core.persistence`, `s1.core.entry`.

**Claim/limit supported:** Database path, ordered migration identity and generated schema maintenance are user-data/maintenance contracts; history cannot be discarded.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65`, lines 7–38.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5bd3a917366391323a94bec85ace411f4d8ce1ee098a4ea062bd2f75b1fcaf83`; **excerpt SHA256:** `db62b7d84b0e3928ee3804010a04e6276f17fce37d970474f545aedc071c4191` (2079 bytes).

````text
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
````


### AEX016

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Strict owner mismatch fails; exact replay identity is reconciled; conflicting replay and sequence gaps fail; ordinary foreign owner replay returns without applying.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 319–367.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `1ab9dc1bbff1f5834e04ff170942f361ce9c4357c02bd38826efc0e2e5c8d863` (2741 bytes).

````text
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
````


### AEX017

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** Projectors, optional commit hook, sequence and sealed event insertion execute before the same immediate transaction closes.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 383–425.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `a50c7fba057d40929d3f447d3415f68062ec87d8755948ff7e078a42cf9fecb7` (2358 bytes).

````text
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
````


### AEX018

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The implementation explicitly refuses combining persist:false with a commit hook.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 449–455.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `ad25c69fef13db609caf4715cc41668d1835ba63cf23316e3c5ab57bc56e2397` (268 bytes).

````text
          if (!persist && commit)
            return yield* Effect.die(
              new InvalidDurableEventError({
                type: event.type,
                message: "Local commit hooks cannot be combined with persist:false",
              }),
            )
````


### AEX019

**Artifacts:** `s1.core.persistence`.

**Claim/limit supported:** The durable stream subscribes to wakes before reading history and advances from stored durable events.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0`, lines 681–699.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `4da815f4da0f85c45b45b6af49fdfd94889fe0e167025b8b49a6a25805217b80`; **excerpt SHA256:** `58f5e77cb92bfa09ab33668b43a2c7920f519242421e1e2eb8d6caba622eb863` (861 bytes).

````text
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
````


### AEX020

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Scoped registrations reject duplicate keys; load sorts keys and provides the current turn only to load effects.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/system-context/registry.ts:9402523a4b03cb21465da1285e2488eb7d2c11bd`, lines 38–60.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `27505e7f29016e62fc521c6d20a132003d1487c9e7099859cd7c1cab4ff1952e`; **excerpt SHA256:** `ecac098645532cea0c8a548d72ff9d96d662279194d3110946c977d16c948d62` (1058 bytes).

````text
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
````


### AEX021

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Configured project instructions must resolve inside the project while global inputs have distinct authority.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 70–80.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `274c7c9215b2aebc3861c5731466f564d3d12becc2340e5a14c63c0e182ba3f0` (557 bytes).

````text
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
````


### AEX022

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Escaped, missing discovered or missing configured instructions yield unavailable, not an empty/deleted context.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/instruction-context.ts:6ba99cade2574448b9a8008b544791581b22bb11`, lines 101–119.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1ad05d900edbf814b3ed68200eb5f452089a112de60cf8b8eae0d1553d0896e1`; **excerpt SHA256:** `6ed6c770dcdc92fceae030443aba30d220dd080dfe04de6a05de80191f7f64e9` (864 bytes).

````text
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
````


### AEX023

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** Model history is selected by compaction and baseline sequence predicates, rather than deleting prior transcript rows.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 24–52.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `f19429a085d9a32956012f7d6fa7fb37f3648e6abea03f112e016d44b955cc34` (898 bytes).

````text
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
````


### AEX024

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** loadAll explicitly retains compacted history.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/history.ts:60f31114138a8920e8e81a031815897568dba211`, lines 82–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `1989745f9737d404950f166faf43df5890ccb13df6561eeae106032dc79ae79a`; **excerpt SHA256:** `9763c876f419c5da3ea49372375296ab0de4f33e99536e09f9549c95b91498ec` (301 bytes).

````text
/** Every stored message of the Session in order, compacted history included. */
export const loadAll = Effect.fn("SessionHistory.loadAll")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* Effect.forEach(yield* messageRows(db, sessionID, undefined), decodeMessageRow)
})
````


### AEX025

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The exact default buffer, tail, tool-character and summary-output caps are constants.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 17–20.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `7537bab717e0c477c077f7061f926e720bda8f5e982a92e60f2ba814c7191302` (136 bytes).

````text
const DEFAULT_BUFFER = 20_000
const DEFAULT_KEEP_TOKENS = 8_000
const TOOL_OUTPUT_MAX_CHARS = 2_000
const SUMMARY_OUTPUT_TOKENS = 4_096
````


### AEX026

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The compaction LLM request has no tools; provider errors and text are collected before the successful-summary branch already shown in C018.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 225–242.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `14d823aa81b9a9faedff6cb11924df6dc1a22d59c1e39d687420f779a0aa7008` (646 bytes).

````text
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
````


### AEX027

**Artifacts:** `s1.core.context`.

**Claim/limit supported:** The composed default transform preserves messages and afterStep does nothing; alternate behavior requires replacement.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/compaction.ts:26f09bdbf2f5908199270ad5e4d24f520dee548f`, lines 313–326.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d6becda5c14c0679b6d5bf509a04631309518bd0ca0ba35d1b6f7e8296266d84`; **excerpt SHA256:** `8564fd4c3c607f63464add5b4f7cec8f0d0f17aa7cbc92740dace1ffa37cb44c` (539 bytes).

````text
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
      })
````


### AEX096

**Artifacts:** `s1.core.entry`, `s1.core.session-execution`, `s1.core.context`.

**Claim/limit supported:** The current repository instructions explicitly keep execution local and context ownership split across Core/domain/Session boundaries.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 207–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `405cd0b08a53f053f88de7fd615712564267b65a3cfcdaafd0b86a7e177fb1c1` (3113 bytes).

````text
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
````


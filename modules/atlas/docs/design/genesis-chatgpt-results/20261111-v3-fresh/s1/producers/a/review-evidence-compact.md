# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.

## Artifact → excerpt map

| Artifact | Exact excerpts |
| --- | --- |
| `s1.core.session-admission` | C001, C002 |
| `s1.core.session-execution` | C003, C004, C005, C006, C007 |
| `s1.core.persistence` | C008, C009, C010, C011, C012, C013 |
| `s1.core.context` | C014, C015, C016, C017, C018, C019 |
| `s1.core.tools` | C020, C021, C022, C023, C024 |
| `s1.core.security` | C025, C026, C027, C028, C029, C030, C031 |
| `s1.core.configuration` | C032, C033, C034 |
| `s1.core.project` | C035, C036, C037, C038 |
| `s1.core.extensions` | C039, C040, C041, C042, C043, C044 |
| `s1.core.capability` | C045, C046, C047, C048 |
| `s1.core.automation` | C049, C050, C051, C052, C053, C054 |
| `s1.core.research` | C055, C056, C057, C058, C059 |
| `s1.core.runtime` | C060, C061, C062, C063, C064, C065 |
| `s1.core.models` | C066, C067, C068, C069, C070 |
| `s1.core.economy` | C071, C072, C073, C074 |
| `s1.core.boundaries` | C075, C076, C077, C078, C079, C080, C081 |
| `s1.core.entry` | C082, C083 |

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

## C020

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 97–108.

```typescript
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
```

## C021

`packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — lines 43–49.

```text
## Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

Built-in `Tool.withOnDemand` marks catalog metadata only. These tools stay eligible in captured definition/identity lookup and canonical settlement, but default model advertisement omits them. An explicit host-owned `advertisedNames` projection may include them; it never grants execution permission.
```

## C022

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

## C023

`packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — lines 204–219.

```typescript
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

## C024

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 193–200.

````text
The first built-in contribution is bounded `read`:

```text
resolve one path relative to the Location or a named project reference
-> reject absolute paths, path escapes, and symlink escapes
-> authorize read against the canonical resource identity
-> for a file: return UTF-8 text or base64 binary content; page oversized UTF-8 text by bounded line ranges
-> for a directory: return direct children in directory-first alphabetical order
````

## C025

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 130–141.

```typescript
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
```

## C026

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 282–298.

```typescript
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
```

## C027

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 103–105.

```typescript
  const reads = profile?.sandbox?.readRoots
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0 && !reads) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
```

## C028

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 122–130.

```typescript
  if (discovered?.kind === "none") {
    if (reads) return yield* new ToolSafety.Denied({ reason: `shell-read-sandbox-unavailable: ${discovered.reason}` })
    if (!profile?.sandbox?.unconfinedFallback) return yield* new ToolSafety.Denied({
      reason: process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable",
    })
    // Owner fallback remains available only without an exact network capability.
    yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: discovered.reason } })
    return ordinary
```

## C029

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 107–120.

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
```

## C030

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 204–204.

```text
V2 `bash` uses the normal permission semantics: configured agent rules plus saved project approvals, with `ask` as the default when no rule matches. Bash is not sandboxed: the spawned shell runs with the host user's filesystem, process, and network authority. Structured external `workdir` resolution remains an enforced `external_directory` authority check. Best-effort scans of absolute command arguments produce advisory warnings only; they are not sandbox boundaries and do not request or enforce `external_directory` approval.
```

## C031

`.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — lines 15–19.

```text
## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.
```

## C032

`packages/core/src/config.ts:52985a1dfc3575efca662dcb0667d81a1ab6f1de` — lines 246–266.

```typescript
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
```

## C033

`packages/core/src/config/trust.ts:a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78` — lines 13–28.

```typescript
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
```

## C034

`packages/core/src/location-services.ts:c754426dde31acad2dbbfd96459b32624cfdd2e4` — lines 146–160.

```typescript
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
```

## C035

`packages/core/src/project.ts:bbedbbf34cbc5b431538db37993c0cc0830fa393` — lines 126–138.

```typescript
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
```

## C036

`packages/core/src/location-mutation.ts:5c80742365c78301f296d5fe87fd8844a1efc44c` — lines 133–144.

```typescript

    const resolve = Effect.fn("LocationMutation.resolve")(function* (input: ResolveInput) {
      const relative = !path.isAbsolute(input.path)
      const absolute = path.resolve(location.directory, input.path)
      const lexicallyInternal = FSUtil.contains(location.directory, absolute)
      if (relative && !lexicallyInternal) return yield* new PathError({ path: input.path, reason: "relative_escape" })

      const resolved = yield* resolvePath(absolute)
      if (lexicallyInternal && !FSUtil.contains(locationRoot, resolved.canonical)) {
        return yield* new PathError({ path: input.path, reason: "location_escape" })
      }

```

## C037

`packages/core/src/project/checkpoint.ts:5972b18ab5b5bd6792447261cd65933aee379e99` — lines 109–120.

```typescript
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
```

## C038

`packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — lines 575–590.

```typescript
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

## C039

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 23–26.

```typescript
/**
 * Live activations fail fast on another in-flight activation target with PLUGIN_DEPENDENCY_BLOCKED.
 * Independent callers queue; retired ancestry is ignored. Own live ancestry retains the load-cycle failure.
 * This is a conservative dependency policy, not a general wait-for graph or cycle proof.
```

## C040

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 69–78.

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
```

## C041

`packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — lines 269–281.

```typescript
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
```

## C042

`packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — lines 174–188.

```typescript
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
```

## C043

`packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — lines 69–84.

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
```

## C044

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 367–384.

```typescript
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
```

## C045

`packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — lines 88–101.

```typescript
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
```

## C046

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 104–110.

```typescript
    // Native floor is restrict-only: later allow/ask rules cannot erase any captured deny.
    const floor = binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")
    const effects = input.resources.map((resource) => {
      if (PermissionV2.evaluate(input.action, resource, floor).effect === "deny") return "deny"
      return PermissionV2.evaluate(input.action, resource, binding.effectiveRules).effect
    })
    if (effects.includes("deny")) return yield* denied()
```

## C047

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 141–165.

```typescript
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
```

## C048

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 94–106.

```text
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
```

## C049

`packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — lines 148–165.

```typescript
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
```

## C050

`packages/core/src/actions/operations.ts:83c0b9e03b063bd59bc2d30317f7de85cbb99ee4` — lines 179–188.

```typescript
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
```

## C051

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 169–181.

```typescript
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
```

## C052

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 196–205.

```typescript
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
```

## C053

`packages/core/src/scheduled-task.ts:0a89bbdc576091ca01445e45e1500ed4008898a9` — lines 296–301.

```typescript
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
```

## C054

`packages/core/src/board/decision.ts:4b219f5b62517b2c4f9749a1a99e6257cfeff167` — lines 83–89.

```typescript
  yield* tx.update(BoardDecisionTable).set({ overturned_by_id: next }).where(eq(BoardDecisionTable.id, old.id)).run()
  // Maestro reads the question's answer, so it carries the current one.
  yield* tx
    .update(BoardQuestionTable)
    .set({ answer_option: input.option, answer_text: text, answered_at: now })
    .where(eq(BoardQuestionTable.id, old.question_id))
    .run()
```

## C055

`packages/core/src/backend-toolkit/index.ts:e5c8e61d202f8a79a5b967d5abc467a97b58f4a3` — lines 266–279.

```typescript
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

## C056

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 30–50.

```typescript
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
```

## C057

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 104–107.

```typescript
  defaultValue: () => ({
    plan: () => Effect.succeed([]),
    build: () => Effect.fail(new ShardFailed({ reason: "index-builder-unavailable" })),
  }),
```

## C058

`packages/core/src/research-toolkit/index.ts:a6e7b3bf6dd0ba44d0f0de5cac3eebe5c9f36095` — lines 164–173.

```typescript
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
```

## C059

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

## C060

`packages/core/src/host.ts:a0fc5bc9a36e50315b0ddddf4de3566555711250` — lines 39–50.

```typescript
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
```

## C061

`packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — lines 33–37.

```typescript
  /**
   * Memory cap for the whole process tree in resident bytes. Under omni the tree is killed above it and the call fails
   * with `OmniSpawner.MemoryExceeded` as the cause; the legacy spawner does not enforce it.
   */
  readonly maxRssBytes?: number
```

## C062

`packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — lines 34–40.

```typescript
/**
 * Loads hugr-omni once. Rejects, loudly and with every place it looked, when the addon or the supervisor is
 * missing; callers that asked for omni (the flag is on) must never fall back silently.
 */
export function load() {
  loading ??= open()
  return loading
```

## C063

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 229–240.

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
```

## C064

`packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — lines 302–314.

```typescript
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
```

## C065

`packages/core/src/installation/service.ts:4a75cd0fdf8467866c10c692987769751edd0f42` — lines 157–168.

```typescript
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
```

## C066

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 84–92.

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
```

## C067

`packages/core/src/catalog.ts:86acb93f550bc2b941e85d42cc4d62d73cbf64ba` — lines 194–210.

```typescript
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
```

## C068

`packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — lines 260–270.

```typescript
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
```

## C069

`packages/core/src/session/runner/model.ts:188abc7053f9a02b8dd84ce7bdc30e0e7c001b3b` — lines 289–305.

```typescript
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
```

## C070

`packages/core/src/aisdk.ts:c5f21baea562c0a8eeeb568929d7971f4c80a3dd` — lines 198–205.

```typescript
      language: Effect.fn("AISDK.language")(function* (model) {
        const key = `${model.providerID}/${model.id}/${model.request.variant ?? "default"}`
        const existing = languages.get(key)
        if (existing) return existing
        if (model.api.type !== "aisdk")
          return yield* new InitError({
            providerID: model.providerID,
            cause: new Error(`Unsupported api ${model.api.type}`),
```

## C071

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 409–417.

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
```

## C072

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 437–450.

```typescript
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
```

## C073

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 669–682.

```typescript
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
```

## C074

`packages/core/src/economy/admission.ts:914a0b925dd282e264292b2247189c549c993a3f` — lines 720–733.

```typescript
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
```

## C075

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 41–45.

```typescript
// The host side of the Atlas screen, shared by the legacy instance routes and the V2 server. `open` binds the Atlas
// surface (the boundary's `./surface` entry) to one store root and runs each read or write in process. The surface is
// synchronous: `own`, `health` and every write compose Atlas's runtime, which walks the tracked tree, so those calls
// hold the fiber for as long as that takes. A throw (an unreadable store, a disk fault during a commit) becomes
// `Unavailable`, never a defect.
```

## C076

`packages/core/src/atlas.ts:f6718654785fb155e1bb1b2acb7e9985478b983b` — lines 301–304.

```typescript
// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.
```

## C077

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 358–371.

```typescript
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
```

## C078

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 382–384.

```typescript
      // Stale only when no evaluation in this process holds it and it predates this process: this process releases
      // every lock it takes synchronously, and a younger lock may belong to a live evaluation it cannot see.
      if (!info?.isDirectory() || ArmState.held(arm) || info.mtimeMs >= performance.timeOrigin) return false
```

## C079

`packages/core/src/relay.ts:25fb509203f933a2e8b0f311c3fc8f9476d53e16` — lines 491–500.

```typescript
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
```

## C080

`packages/core/src/control-plane/move-session.ts:49fe728d6956ca1555a763548e9458ea5f3938dc` — lines 106–114.

```typescript
      yield* events.publish(SessionEvent.Moved, {
        sessionID: input.sessionID,
        location: Location.Ref.make({ directory }),
        subdirectory: RelativePath.make(path.relative(destination.directory, directory).replaceAll("\\", "/")),
        timestamp: yield* DateTime.now,
      })

      if (patch) {
        const repository = yield* git.repo.discover(current.location.directory)
```

## C081

`packages/core/src/rag-studio/sql.ts:214ab3375acc34072ee74c3123501c80615bf488` — lines 1–4.

```typescript
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

// Corpus tables from docs/specs/rag-studio/SPEC.md. Chunks have no foreign key: removeSource deletes the
// source row and leaves chunks for orphan_delete. Embedding has no column and no vector table.
```

## C082

`packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — lines 1–13.

```text
# @orchestra/core

Platform and domain services for Orchestra: v2 Session admission, storage and local execution; Location-scoped capabilities; provider, tool, configuration and plugin services; and the SQLite database with its migrations. Server exposes these services over HTTP, and the CLI, desktop app and product modules compose them. See [architecture](../../docs/guides/architecture.md) for the product-level picture.

Dependencies run Schema -> Core and Protocol -> Server. Core never imports Client or Server.

## Who uses it

`packages/server` (handlers), `packages/app-shell`, `apps/cli`, `apps/desktop`, `packages/tui`, `packages/session-ui`, `packages/sdk-next`, and the `modules/maestro`, `modules/continuity` and `modules/engine-adapters` packages.

## Entry points

There is no bare `@orchestra/core` export and no wildcard: every public subpath is an explicit key in `package.json`. Add one with `bun run script/explicit-exports.ts core --write` from the repository root when a new subpath gains a consumer. Common subpaths:
```

## C083

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


## C25 — Unsupported parameter encoding and invalid base URL

S14, lines 143–154:

~~~~text
    }
    if (resolved.allowReserved !== undefined && typeof resolved.allowReserved !== "boolean") {
      return { ok: false, reason: `parameter '${name}' has an invalid allowReserved value` }
    }
    if (resolved.allowReserved === true)
      return { ok: false, reason: `parameter '${name}' uses unsupported allowReserved encoding` }
    const declaredStyle = nonEmptyString(resolved.style) ?? (location === "query" ? "form" : "simple")
    if (location === "query" && declaredStyle !== "form" && declaredStyle !== "deepObject") {
      return { ok: false, reason: `query parameter '${name}' uses unsupported style '${declaredStyle}'` }
    }
    if (location !== "query" && declaredStyle !== "simple") {
      return { ok: false, reason: `${location} parameter '${name}' uses unsupported style '${declaredStyle}'` }
~~~~

S14, lines 430–440:

~~~~text
  const url = URL.parse(value)
  if (url === null || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return { ok: false, reason: `server URL '${value}' is not an absolute HTTP(S) URL` }
  }
  if (url.search !== "" || url.hash !== "") {
    return { ok: false, reason: `server URL '${value}' contains an unsupported query string or fragment` }
  }
  return { ok: true, value }
}

export const securityRequirements = (value: unknown): Parsed<ReadonlyArray<SecurityRequirement>> => {
~~~~

## C26 — Host security alternatives and path refusals

S13, lines 126–145:

~~~~text
      for (const name of names) {
        const scheme = own(plan.schemes, name)
        if (scheme === undefined || plan.auth === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        const credential = yield* plan.auth.resolve({
          name,
          definition: scheme,
          scopes: requirement[name] ?? [],
          operation: plan.operation,
        })
        if (credential === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        credentials.push([name, scheme, credential])
      }
      const applied = applyCredentials(credentials)
      return applied instanceof ToolError ? yield* Effect.fail(applied) : applied
~~~~

S13, lines 216–224:

~~~~text
    // model-supplied value retarget the request to a different endpoint.
    if (fieldValue === "" || fieldValue === "." || fieldValue === "..") {
      return toolError(`Invalid path parameter '${field.inputName}'.`)
    }
    url = url.replaceAll(`{${field.name}}`, fieldValue)
  }
  const unresolved = url.match(/\{[^{}]+\}/)
  if (unresolved !== null) return toolError(`Unresolved path parameter ${unresolved[0]}.`)
  return url
~~~~

## C27 — Response body cap before and during reading

S13, lines 9–9:

~~~~text
const maxResponseBodyBytes = 50 * 1024 * 1024
~~~~

S13, lines 297–306:

~~~~text
    if (declaredSize !== undefined && declaredSize > maxResponseBodyBytes) {
      return yield* Effect.fail(toolError(`${plan.operation.method} ${plan.operation.path} response exceeds 50 MiB.`))
    }
    let body = Buffer.allocUnsafe(Math.min(maxResponseBodyBytes, declaredSize ?? 64 * 1024))
    let size = 0
    yield* Stream.runForEach(response.stream, (chunk) => {
      if (size + chunk.byteLength > maxResponseBodyBytes) {
        return Effect.fail(toolError(`${plan.operation.method} ${plan.operation.path} response exceeds 50 MiB.`))
      }
      if (size + chunk.byteLength > body.byteLength) {
~~~~

## C28 — Documented unresolved OpenAPI boundaries

S12, lines 10–19:

~~~~text
- Runtime response-schema validation and full content negotiation.
- Binary response values and explicit byte-oriented return types.
- Request/response projection for `readOnly` and `writeOnly` properties.
- SSE, WebSocket, and other streaming transports.
- Recovery of responses rejected by a status-filtering `HttpClient`.
- Configurable request and response size limits.
- Adapter-enforced redirect policy independent of the supplied `HttpClient`.
- Strict UTF-8 and empty-body validation for JSON responses.
- Compile-time rejection of parameter schemas with nested values unsupported by their serialization style; runtime rejects them before auth resolution.
- Complete malformed-security-scheme validation and broader auth-combination coverage.
~~~~

## C29 — Transaction connection and cleanup control flow

S18, lines 169–181:

~~~~text
                        // Failed commits can leave SQLite transactions open, including fatal exits.
                        const rolledBack = yield* Effect.exit(
                          this.executeTransactionStatement(
                            connection,
                            id === 0 ? "rollback" : `rollback to savepoint effect_sql_${id}`,
                          ),
                        )
                        const failed = finalizedExit(committed, rolledBack)
                        if (id === 0) return yield* failed
                        const released = yield* Effect.exit(
                          this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                        )
                        return yield* finalizedExit(failed, released)
~~~~

S18, lines 190–196:

~~~~text
                      const failed = finalizedExit(exit, rolledBack)
                      if (id === 0) return yield* failed
                      // A failed ROLLBACK TO must not prevent best-effort savepoint release.
                      const released = yield* Effect.exit(
                        this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                      )
                      return yield* finalizedExit(failed, released)
~~~~

## C30 — Preserve every original and cleanup failure reason

S18, lines 239–246:

~~~~text
function finalizedExit<A, E, E2>(original: Exit.Exit<A, E>, cleanup: Exit.Exit<unknown, E2>): Exit.Exit<A, E | E2> {
  if (Exit.isSuccess(cleanup)) return original
  // Cause.combine deduplicates equal reasons; distinct cleanup attempts must all survive.
  return Exit.failCause<E | E2>(
    Exit.isFailure(original)
      ? Cause.fromReasons<E | E2>([...original.cause.reasons, ...cleanup.cause.reasons])
      : cleanup.cause,
  )
~~~~

## C31 — Journal matching and unmatched-row refusal

S20, lines 64–70:

~~~~text
    const matchedByMillis = candidates?.length === 1 ? candidates[0] : undefined
    const matchedByCandidateHash =
      candidates && candidates.length > 1
        ? candidates.find((candidate) => candidate.hash && dbRow.hash && candidate.hash === dbRow.hash)
        : undefined
    const matchedByHash = matchedByMillis || matchedByCandidateHash ? undefined : byHash.get(dbRow.hash)
    const matched = matchedByMillis ?? matchedByCandidateHash ?? matchedByHash
~~~~

S20, lines 85–90:

~~~~text
    unmatched.push(dbRow)
  }

  if (unmatched.length > 0) {
    throw unmatchedMigrationError(unmatched)
  }
~~~~

## C32 — Migration init refusal and transactional execution

S19, lines 452–459:

~~~~text
  if (typeof config === "object" && config.init) {
    if (dbMigrations.length) {
      return yield* new MigratorInitError({ exitCode: "databaseMigrations" })
    }

    if (migrations.length > 1) {
      return yield* new MigratorInitError({ exitCode: "localMigrations" })
    }
~~~~

## C33 — Node constructor, unsupported stream and documented usage limit

S22, lines 118–120:

~~~~text
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
~~~~

S21, lines 7–8:

~~~~text
- One module, `packages/effect-sqlite-node/src/index.ts`, exporting `NodeSqliteClient`: `make`, `layer`, and the `SqliteClient` service and config types. It wraps `node:sqlite` as an Effect `SqlClient`.
- Nothing uses it today. Core opens its database through `packages/core/src/database/sqlite.node.ts`, which carries its own `node:sqlite` client.
~~~~

S21, lines 13–13:

~~~~text
- No importers in the repository; `packages/core` lists it as a dependency without importing it.
~~~~

## C34 — Auto-mode and unused-interaction exception

S40, lines 6–18:

~~~~text
const isCI = () => {
  const value = process.env.CI
  return value !== undefined && value !== "" && value !== "false" && value !== "0"
}

export const resolveAutoMode = (
  cassette: CassetteService.Interface,
  name: string,
): Effect.Effect<"record" | "replay" | "passthrough"> =>
  Effect.gen(function* () {
    if (isCI()) return "replay"
    return (yield* cassette.exists(name)) ? "replay" : "record"
  })
~~~~

S40, lines 35–42:

~~~~text
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const used = yield* SynchronizedRef.get(position)
        if (used === 0) return yield* Effect.void
        const interactions = yield* load.pipe(Effect.orDie)
        if (used < interactions.length)
          return yield* Effect.die(
            new Error(`Unused recorded interactions in ${name}: used ${used} of ${interactions.length}`),
~~~~

## C35 — Replay delegates exact sequential matching

S39, lines 160–171:

~~~~text
          const claimed = yield* replay
            .claim((interaction, index, interactions) => {
              const result = selectSequential(interactions, incoming, match, index)
              if (result.interaction) return Effect.void
              return Effect.fail(
                transportError(request, `Fixture "${name}" does not match the current request: ${result.detail}.`),
              )
            })
            .pipe(
              Effect.mapError((error) =>
                error._tag === "CassetteNotFoundError"
                  ? transportError(
~~~~

## C36 — Internal executor separates server/client event lists

S42, lines 152–169:

~~~~text
          const client = claimed.interaction.events.filter((event) => event.direction === "client")
          const server = claimed.interaction.events.filter((event) => event.direction === "server")
          const position = yield* SynchronizedRef.make(0)
          return {
            sendText: (message) =>
              SynchronizedRef.updateEffect(position, (index) =>
                assertClientEvent(message, client[index], index, options.compareClientMessagesAsJson === true).pipe(
                  Effect.as(index + 1),
                ),
              ),
            messages: Stream.fromIterable(server).pipe(Stream.map(decodeEvent)),
            close: Effect.gen(function* () {
              const used = yield* SynchronizedRef.get(position)
              if (used !== client.length)
                return yield* Effect.die(
                  new Error(`WebSocket client frame count: expected ${client.length}, received ${used}`),
                )
            }),
~~~~

## C37 — Lexical path and prewrite secret refusal

S38, lines 41–49:

~~~~text
const cassettePath = (directory: string, name: string) => {
  if (!name || path.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).includes(".."))
    throw new Error(`Invalid cassette name "${name}"`)
  const root = path.resolve(directory)
  const target = path.resolve(root, `${name}.json`)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Invalid cassette name "${name}"`)
  return target
~~~~

S38, lines 109–112:

~~~~text
              const interactionFindings = [...entry.findings, ...secretFindings(interaction)]
              const cassette = buildCassette(name, interactions, metadata)
              const findings = [...interactionFindings, ...secretFindings(cassette.metadata ?? {})]
              yield* failIfUnsafe(name, findings)
~~~~

## C38 — Public replay advances through interleaved traffic

S41, lines 89–105:

~~~~text
          const event = state.interaction.events[current.position]
          if (!event) return
          if (yield* Ref.get(state.closed))
            return yield* Effect.die(
              new Error(
                `WebSocket closed with unconsumed events: used ${current.position} of ${state.interaction.events.length}`,
              ),
            )
          if (event.direction === "server") {
            yield* Ref.set(state.progress, {
              position: current.position + 1,
              changed: yield* Deferred.make<void>(),
            })
            run(runHandler(handler, decode(event)))
            continue
          }
          yield* Deferred.await(current.changed)
~~~~

S41, lines 240–240:

~~~~text
          if (occupied) return yield* Effect.die("Concurrent runs of a replayed WebSocket are not supported")
~~~~

## C40 — Global-only project trust and API path refusal are guide claims

S04, lines 3–8:

~~~~text
A project can declare code to run in its own config (`orchestra.json`, `orchestra.jsonc`, or the same files under `.orchestra/`). A cloned repository could use that to run anything on your machine. So none of the following run until you approve the project:

- local MCP servers (a command);
- plugins: the `plugins` list in the project config, and plugin files in `.orchestra/plugin/` or `.orchestra/plugins/`;
- `formatter` entries of the project config (a formatter is a command);
- `lsp` entries of the project config (a language server is a command).
~~~~

S04, lines 48–48:

~~~~text
The server refuses a folder that does not exist, a file, a relative path and the filesystem root.
~~~~

S04, lines 60–60:

~~~~text
Only the global config counts. A `trusted_projects` entry in a project's own config is ignored, so a repository cannot approve itself.
~~~~

## C41 — Permission reply and client-state persistence distinctions

S06, lines 15–17:

~~~~text
- **Deny** refuses this request and every other request still waiting in the same session. The agent may try another route.
- **Allow once** lets this one request run. The next one asks again.
- **Always allow in this project** lets matching requests run without asking again in this project. The dock says what it covers:
~~~~

S06, lines 22–22:

~~~~text
Permissions are saved per project. Allowing something always in one project does not allow it in another.
~~~~

S06, lines 26–26:

~~~~text
The composer's **Ask** button switches the session to **Auto-accept**. While it reads Auto-accept, every request in this session is allowed once without a dock, including any request already waiting. Other sessions still ask, and nothing is saved as a rule. Click it again to be asked again. The same switch is in Settings, General, and on the keyboard as `Mod+Shift+A`.
~~~~

## C42 — Database backup intent and refusal

S03, lines 8–24:

~~~~text

`ORCHESTRA_DB` overrides it. An absolute path or `:memory:` is used as is; a relative name is placed in Orchestra's data directory.

## Automatic backup before every migration

When a new version opens a database that still has pending migrations, it first writes a consistent copy next to the database with SQLite `VACUUM INTO`:

```
<database>.backup-<last-applied-migration>-<unix-ms>
```

`legacy` replaces the migration id when the database predates the migration journal.

- The three newest backups are kept and older ones are deleted.
- If the backup cannot be written (full disk, read-only folder), the migration does not run and nothing is changed. Free space and start the app again.
- An in-memory database is never backed up.

~~~~

## C44 — Behavior plugins differ from code authoring package

S07, lines 1–3:

~~~~text
# Plugins

Plugins shape how the model thinks and speaks. Each one is a short set of behavior instructions that you switch on for a project. The page is titled **LLM behavior** and its sidebar entry is **Plugins**.
~~~~

S07, lines 27–31:

~~~~text
## When it applies

An enabled behavior is added to new chat messages. It does not apply to slash commands or shell runs. When the server holds the behaviors, they apply on the server to every turn, including chats that are already open. If the server cannot accept per-prompt instructions, the row says **not applied**, and the behavior has no effect until the server supports it.

If saving to the server fails, the row says **sync failed** with **Retry**. Your change stays in the page, and choosing **Retry** sends it again.
~~~~

## C45 — Root test-execution authority

S01, lines 160–160:

~~~~text
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
~~~~

## C46 — Historical phase-card baseline and commands

S02, lines 9–9:

~~~~text
- BASE commit: `7181942eaa733b9cc3f4ff6aef79231d0d1c2f93`
~~~~

## C47 — Removal spec separates completion labels from old inventory

S09, lines 45–49:

~~~~text
There are 65 direct API/type references in those files. The references fall into the groups below.

## Group 1: Database Runtime And Startup

Status: Completed. Startup, the public node export, and database CLI tooling no longer import the legacy orchestra database wrapper; `packages/orchestra/src/storage/db.ts` has been deleted.
~~~~

S09, lines 58–63:

~~~~text
Current usage:

- `storage/db.ts` opens the singleton database, applies pragmas, exposes callback-style access, holds ambient transaction context, and queues post-commit effects.
- `index.ts` no longer performs the removed JSON-to-SQLite migration during startup.
- `node.ts` publicly re-exports `Database` from the legacy module.
- `cli/cmd/db.ts` uses `Database.getPath()` to print the path, open a readonly Bun SQLite handle, run `sqlite3`, and vacuum.
~~~~

## C48 — Deferred database constraints and reported landed indexes

S08, lines 1–8:

~~~~text
# Database integrity follow-ups

Status: deferred. Source: round-2 audit, section G (2026-10-17). Indexes from G6 landed in migration
`20261018031800_session_list_indexes`; G4, G7 and G8 need no action.

No foreign key below is added now. SQLite cannot add a foreign key to an existing table; it needs a full
table rebuild (`CREATE TABLE new … ; INSERT … SELECT ; DROP ; RENAME`), and with `PRAGMA foreign_keys=ON`
(`packages/core/src/database/database.ts`) any orphan row already present in a user database makes the
~~~~

## C49 — Exact config schema root, plugin entry and current property names

S37, lines 536–554:

~~~~text
    "ConfigV2.Plugin.Entry": {
      "type": "object",
      "properties": {
        "package": {
          "type": "string"
        },
        "options": {
          "type": "object"
        }
      },
      "required": [
        "package"
      ],
      "additionalProperties": false
    },
    "Policy.Effect": {
      "type": "string",
      "enum": [
        "allow",
~~~~

S37, lines 1205–1213:

~~~~text
        "plugins": {
          "type": "array",
          "items": {
            "anyOf": [
              {
                "type": "string"
              },
              {
                "$ref": "#/$defs/ConfigV2.Plugin.Entry"
~~~~

S37, lines 1240–1246:

~~~~text
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
~~~~

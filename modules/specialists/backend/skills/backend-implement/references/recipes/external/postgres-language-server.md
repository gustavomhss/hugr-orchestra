# postgres-language-server

## Applicability

The packet assigns SQL the change wrote (queries, functions or migrations) for PostgreSQL and a type check of it against a schema, supplied as a disposable PostgreSQL database that already holds that schema. The engine is the Postgres Language Server CLI `0.27.1`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/postgres-language-server"`. The CLI was formerly called `postgrestools`; the toolkit ships only this name.

## Non-trigger

- No database supplied: the type check cannot run. Return a `packet` blocker rather than checking syntax only and calling it typed.
- Migration lock and downtime hazards: follow [squawk](squawk.md) when the packet assigns that check.
- Database-wide audits (`dblint`), formatting (`format`), the language server (`lsp-proxy`, `start`) and `init`. Never add a `postgres-language-server.jsonc` unless the packet assigns one.
- A production, shared or remote database. Only the packet's disposable database is in scope.

## Inputs

- The SQL files the change wrote or changed, as paths.
- The connection string of the disposable database, as `DATABASE_URL` or the packet's value for `--connection-string`. The schema must already be applied there, through the project's own migration route when the packet assigns it.
- The search path when the schema is not `public`.
- The project's `postgres-language-server.jsonc` when present.

## Steps

1. Write the SQL the change needs.
2. Check only the files the change wrote:
   ```sh
   "$BACKEND_TOOLKIT_BIN/postgres-language-server" check --connection-string <url> --max-diagnostics=none <file>...
   ```
   Add `--search_path=<schema>` when the packet names a search path.
3. Fix each error inside the files the change wrote: unknown tables, columns, functions or types, ambiguous references, operator and cast mismatches, syntax errors. A wrong schema is not yours to fix: when the SQL matches the packet but the database disagrees, return a `packet` blocker.
4. Read warnings, such as missing lock timeouts, and fix those inside scope; they do not fail the run unless the packet asks for `--error-on-warnings`.
5. Rerun step 2 until it reports no errors, then run the packet's checks.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`npx`, `brew`, the `postgrestools` package, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Yours: the SQL files. The engine reads the schema and prints diagnostics; it executes nothing against the database. `--reporter=json` gives machine-readable findings when evidence must be quoted.

## Limits and checks

- Exit 0 is clean. Exit 1 means errors were reported. Any other failure is `engine-failure:postgres-language-server:<exit>`.
- A `database/connection` diagnostic means the database was not reached and every type check was skipped: that is `project-prerequisite-missing:database`, never a clean result. Never pass `--disable-db` to get past it.
- Type checking covers `SELECT`, `INSERT`, `UPDATE` and `DELETE` against the schema the database holds now; it does not prove a migration applies.
- Checks: no errors on the files the change wrote with the database reached, and the packet's checks pass.

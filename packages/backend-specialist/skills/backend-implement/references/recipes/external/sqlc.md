# sqlc

## Applicability

The packet assigns a change to sqlc inputs (query files or the schema DDL sqlc reads) and names the generated package as part of the write paths. The engine is sqlc `1.31.1`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/sqlc"`. Calling the generated Go code is covered by [sqlc generated queries](../../libraries/go/sqlc.md).

Source: adapted from the official sqlc documentation, <https://docs.sqlc.dev/en/latest/llms-full.txt>.

## Non-trigger

- A change that calls existing generated methods without touching SQL: nothing to generate.
- A packet that forbids regeneration or leaves the generated package outside the write paths: never regenerate; a change that would need it is a `packet` blocker.
- Changing `sqlc.yaml` (`engine`, `sql_package`, `overrides`, `emit_*`, output paths), or a `cloud`, managed-database or remote-plugin setup. That configuration is supplied.

## Inputs

- The config file (`sqlc.yaml`, `sqlc.yml` or `sqlc.json`) and its directory, the query and schema paths it lists, and the generated package path.
- The version on the generated headers' `versions:` line.
- The packet's compile and test commands for the generated code.

## Steps

1. Check the generated headers first. They name `sqlc v1.31.1` when this engine produced them. Any other version means the project pins another generator: report `engine-version-mismatch(project=<v>, bundled=1.31.1)` and do not regenerate.
2. Edit only the SQL the change needs. Each query carries its header, such as `-- name: ListTenantTasks :many`; the command after the name (`:one`, `:many`, `:exec`, `:execrows`, ...) sets the method's return shape. Name parameters with `sqlc.arg(tenant_id)`, and use `sqlc.narg(name)` for a parameter that may be null. On PostgreSQL pass a list as `id = ANY(sqlc.arg(ids)::bigint[])`; `sqlc.slice` exists for drivers without array parameters.
3. Generate from the config directory, offline:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlc" generate --no-remote
   ```
   Add `--file <path>` when the config is not in the working directory. `--no-remote` refuses remote execution. Analysis runs on the schema files unless the config has a `database` block; then sqlc connects to that database, and when it is unreachable, report a `tool` blocker instead of editing the config.
4. Confirm the output is current:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlc" diff --no-remote
   ```
   A nonzero exit with a diff means the generated files differ from what the inputs produce.
5. When the config enables `rules` for the package, lint the queries too: `"$BACKEND_TOOLKIT_BIN/sqlc" vet --no-remote`. A rule that needs a database connection, such as `sqlc/db-prepare`, runs only against a reachable configured database; otherwise report it as not run. A `/* @sqlc-vet-disable <rule> */` annotation is added only when the packet accepts that rule for that query.
6. Read the generated diff. Only files for the changed queries, plus `models.go` or `querier.go` when the schema or interface changed, may move. Any other change is a `packet` blocker.
7. Compile and run the packet's Go checks against the supplied real PostgreSQL.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`go install`, `go run`, `brew`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated and owned by sqlc: `db.go`, `models.go`, `querier.go`, one `<file>.sql.go` per query file. Never edit them. Handwritten and yours: the SQL, the repository code that calls the output, and tests.
- Project prerequisites outside the toolkit: the Go toolchain and the driver modules the generated code imports.

## Limits and checks

- A query that names a missing table or column fails generation with file positions on stderr: fix the SQL inside scope, or return a `packet` blocker when the schema change is not assigned. Any other failure is `engine-failure:sqlc:<exit>`.
- A config that needs a database connection or a remote plugin cannot run here: `network-denied-by-profile` or `project-prerequisite-missing:<what>`.
- Generation proves the SQL fits the schema sqlc read. It proves neither tenant predicates, atomicity nor the deployed schema.

# sqlx

## Applicability

The packet assigns a change to a SQLx project's migrations or offline query metadata (`.sqlx/`), names the migrations directory or `.sqlx/` as part of the write paths, and supplies a disposable database to run against. The engine is the SQLx CLI `0.9.0`, built by the host and run only as `"$BACKEND_TOOLKIT_BIN/sqlx"`.

## Non-trigger

- Rust code that calls `sqlx::query!` without changing SQL or migrations: compile with the project's own checks.
- Choosing the migration layout, reversible or simple migrations, sequential or timestamp versions, or `sqlx.toml` settings. Those are supplied.
- A project that applies migrations through its own binary (`sqlx::migrate!` at startup) or another runner: use that entrypoint, not this engine.
- A production, shared or remote database. Only the packet's disposable database is in scope.

## Inputs

- The migrations directory (default `migrations/`) and `sqlx.toml` when present.
- The database URL of the supplied disposable database, as `DATABASE_URL` or the packet's value for `--database-url`.
- For metadata work: the Cargo workspace, its `Cargo.lock`, and the packet's compile command.

## Steps

1. Check the project's pin first: the `sqlx` version in `Cargo.lock`. A version other than `0.9.0` means the project pins another CLI: report `engine-version-mismatch(project=<v>, bundled=0.9.0)` and do not run it.
2. Scaffold a new migration only when the packet assigns one, then write its SQL yourself:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlx" migrate add --source <migrations-dir> <description>
   ```
   Keep the directory's existing kind: `-r` only where `.up.sql`/`.down.sql` pairs already exist.
3. Inspect, then apply, against the supplied database:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlx" migrate info --source <migrations-dir> --database-url <url>
   "$BACKEND_TOOLKIT_BIN/sqlx" migrate run --source <migrations-dir> --database-url <url>
   ```
   `migrate info` lists applied and pending versions. A pending version older than an applied one, or a checksum mismatch, means applied history changed: return a `packet` blocker, never edit an applied migration to get past it.
4. Revert only when the packet assigns a down-migration check: `migrate revert` with the same flags undoes the last applied version.
5. Offline query metadata, only when the packet assigns it: `"$BACKEND_TOOLKIT_BIN/sqlx" prepare --workspace -- --all-targets --locked --offline` with the database URL set, then `prepare --check` with the same arguments. Prepare compiles the project with the project's own Cargo, which must be on `PATH` at a Rust version the project accepts; the toolkit's build toolchain is not available to it. A missing Cargo is `project-prerequisite-missing:cargo`.
6. Read the diff, then run the packet's checks.

## Tools and outputs

- The host builds the engine from the pinned crate on first use, which can take several minutes; the seat's shell has no network. Never install, download or substitute it (`cargo install sqlx-cli`, `cargo sqlx` from the project, `brew`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim. Windows hosts report `unsupported-target:needs-msvc-linker`.
- Yours: the new migration SQL and the `.sqlx/query-*.json` files prepare writes. Never edit a migration that any database has applied, and never hand-edit `.sqlx/` files.
- The engine connects to PostgreSQL, MySQL and SQLite, over rustls for TLS.

## Limits and checks

- An unreachable database is `project-prerequisite-missing:database`. A SQL error during `migrate run` fails that migration: quote it, fix the SQL inside scope, or return a `packet` blocker. Any other nonzero exit is `engine-failure:sqlx:<exit>`.
- Each migration runs in its own transaction unless its file opts out with `-- no-transaction`; never add that line unless the packet assigns it.
- `prepare` proves the queries fit the database it reached, not the deployed schema. `SQLX_OFFLINE=true` builds consume `.sqlx/` without refreshing it.
- Checks: `migrate info` shows the new version applied, the schema holds the assigned change, and the packet's compile and tests pass.

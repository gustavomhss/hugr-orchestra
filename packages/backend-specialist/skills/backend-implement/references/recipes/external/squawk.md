# squawk

## Applicability

The packet assigns new or changed PostgreSQL migration files and a migration-safety check on them. The engine is squawk `2.67.0`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/squawk"`. It reads SQL text only: no database, no network.

Source: adapted from the official rule documentation, <https://squawkhq.com/docs/rules>, checked against the `v2.67.0` rule set.

## Non-trigger

- Migrations for any other database, or SQL that is not a migration (queries, views in application code).
- Whether the SQL names real tables and columns: follow [postgres-language-server](postgres-language-server.md) when the packet assigns that check.
- Changing `.squawk.toml`, its rule set or excluded paths. That configuration is supplied.
- Migrations the change did not write, and `squawk server` or `upload-to-github`.

## Inputs

- The migration files the change wrote or changed, as paths.
- The project's `.squawk.toml` when present; squawk finds it from the working directory.
- The PostgreSQL version the migrations target and whether the project's runner wraps each file in a transaction, when the packet states them.

## Steps

1. Write the migration SQL the change needs.
2. Lint only the files the change wrote, from the repository root:
   ```sh
   "$BACKEND_TOOLKIT_BIN/squawk" --reporter gcc <migration-file>...
   ```
   Add `--pg-version=<major.minor>` when the packet names the target version, and `--assume-in-transaction` when the runner wraps each file in a transaction.
3. Fix each finding inside the files the change wrote with the safe form its rule names: `require-concurrent-index-creation` and `require-concurrent-index-deletion` take `CONCURRENTLY`; `require-timeout-settings` takes `set lock_timeout` and `set statement_timeout` before locking statements; `constraint-missing-not-valid` and `adding-foreign-key-constraint` take `NOT VALID`, then `VALIDATE CONSTRAINT` in a later transaction; `adding-required-field` and `adding-not-nullable-field` take a nullable column or a non-volatile default instead of a bare `NOT NULL`. Keep each fix within what the runner allows: `CONCURRENTLY` cannot run inside a transaction (`ban-concurrent-index-creation-in-transaction`).
4. A finding the change cannot avoid is reported with its rule name. Suppress it with a `-- squawk-ignore <rule>` line above the statement only when the packet accepts that rule for that statement; otherwise return a `packet` blocker. Never add `-- squawk-ignore-file`.
5. Rerun step 2 until it is clean, then run the packet's checks.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`npx squawk-cli`, `pip install squawk-cli`, `brew`, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Yours: the migration SQL. squawk only prints findings; `--reporter json` gives machine-readable findings when evidence must be quoted.

## Limits and checks

- Exit 0 is clean. Exit 1 means findings, or a path that matched no file: read the output to tell them apart. Any other failure is `engine-failure:squawk:<exit>`.
- squawk judges lock and rewrite hazards from the statements alone. It does not know table sizes or traffic, and it does not prove the SQL runs: apply the migration through the project's runner on the packet's disposable database when the packet assigns that.
- Never edit a migration that any database has applied to clear a finding.
- Checks: squawk is clean on the files the change wrote, or each remaining finding is one the packet accepts, and the packet's checks pass.

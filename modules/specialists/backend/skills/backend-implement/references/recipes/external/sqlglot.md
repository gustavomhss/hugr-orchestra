# sqlglot

## Applicability

The packet assigns SQL the change wrote in a dialect without a database to check against here, such as Spark SQL, Hive, Trino, BigQuery, Snowflake or DuckDB, and a parse check of it, or a translation of it into another dialect. The engine is sqlglot `30.21.0`, provided by the host and run only as `"$BACKEND_TOOLKIT_BIN/sqlglot"`. It reads SQL text only: no database, no network.

## Non-trigger

- PostgreSQL SQL that needs a type check against a schema: follow [postgres-language-server](postgres-language-server.md).
- Proof that the SQL names real tables and columns or returns the right rows. This CLI parses and transpiles; it does not resolve a schema.
- Choosing the source or target dialect. Both are supplied.
- SQL the change did not write.

## Inputs

- The SQL files the change wrote, and the dialect each is written in, as sqlglot names it (`spark`, `hive`, `trino`, `bigquery`, `snowflake`, `duckdb`, `postgres`, `mysql`, ...).
- For a translation: the target dialect and the path the packet assigns for the output.

## Steps

1. Write the SQL the change needs.
2. Parse check each file in its dialect; the parse tree goes to `/dev/null`, errors stay on stderr:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlglot" --read spark --parse - < <file> > /dev/null
   ```
3. Fix each `ParseError` inside the file; its message names the line and column.
4. Translate only when the packet assigns it, writing to the packet's output path:
   ```sh
   "$BACKEND_TOOLKIT_BIN/sqlglot" --read spark --write duckdb - < <file> > <output>
   ```
   Pass `--error-level RAISE` to collect every parse error at once instead of stopping at the first. Read the output: a construct the target dialect lacks may be dropped or approximated, so check it against the source before keeping it.
5. Run the packet's checks.

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`pip install`, `uvx`, a project virtual environment, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Yours: the SQL files and any translated output the packet assigns. Without `--write` the CLI prints the SQL in the generic dialect, so always name both dialects for a translation.

## Limits and checks

- Exit 0 is clean. Exit 1 with a `sqlglot.errors.ParseError` traceback means the SQL did not parse. Exit 2 means a wrong flag. Any other failure is `engine-failure:sqlglot:<exit>`.
- A clean parse is a syntax check, more permissive than the real engine: it does not prove the statement runs there. When the packet supplies the real engine's own check, that check decides.
- Checks: every file the change wrote parses in its dialect, any assigned translation is written, and the packet's checks pass.

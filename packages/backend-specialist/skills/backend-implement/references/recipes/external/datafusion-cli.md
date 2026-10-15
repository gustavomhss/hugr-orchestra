# datafusion-cli

## Applicability

The packet assigns SQL that runs on Apache DataFusion (queries, views, `INSERT ... SELECT`), supplies the schema it runs against as DDL, and assigns a plan check of the SQL the change wrote. The engine is datafusion-cli `55.1.0`, built by the host from its pinned crate and run only as `"$BACKEND_TOOLKIT_BIN/datafusion-cli"`.

## Non-trigger

- SQL for another engine (PostgreSQL, Spark, Trino, DuckDB): a DataFusion plan proves nothing about it. Use that engine's own check.
- Writing or changing the schema DDL, or choosing the SQL dialect. Those are supplied.
- Running the query for its results, `EXPLAIN ANALYZE`, or measuring performance: the check plans, it never executes.
- Tables on object stores or URLs (`s3://`, `gs://`, `https://`): the shell has no network.

## Inputs

- The schema DDL: `CREATE TABLE` with column definitions, or `CREATE EXTERNAL TABLE` over local files, plus any views the SQL reads.
- Every local data file an external table's `LOCATION` names.
- The SQL the change wrote, one statement at a time.
- The dialect, when the project sets `datafusion.sql_parser.dialect`.

## Steps

1. Check the project's pin first, when the SQL runs inside a Rust project that embeds DataFusion: the `datafusion` version in its `Cargo.lock`. A version other than `55.1.0` means the project plans with another engine: report `engine-version-mismatch(project=<v>, bundled=55.1.0)` and do not treat this plan as evidence.
2. Plan each statement the change wrote, from the directory the external tables' relative locations resolve against:
   ```sh
   "$BACKEND_TOOLKIT_BIN/datafusion-cli" -q -c "$(cat <schema.sql>)" -c "EXPLAIN <statement>"
   ```
   Pass the schema and the statement with `-c`: each `-c` stops at its first error with a nonzero exit. With `-f`, an error in a `;`-terminated statement is printed and the run still exits 0. Prepend `-c "SET datafusion.sql_parser.dialect = '<dialect>'"` only when the packet names a dialect.
3. A `CREATE VIEW` the change wrote is planned by running it as written after the schema, then `EXPLAIN SELECT * FROM <view>`.
4. The first run on a machine compiles the engine once; it can take many minutes before planning starts. Later runs reuse that build. Do not interrupt it or retry in a loop.
5. Exit 0 with a plan means every table, column, function and type in the statement resolved. A nonzero exit with `Error during planning`, `Schema error` or `SQL error` on stderr is a defect: fix the change's SQL inside scope, or, when the schema lacks what the SQL needs, return a `packet` blocker quoting the error.
6. Run the packet's own checks for the code that issues the SQL.

## Tools and outputs

- The host builds the engine from the pinned crate on first use; the seat's shell has no network. Never install, download or substitute it (`cargo install datafusion-cli`, `brew`, `pip install datafusion`, a container, a copy on `PATH`).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim. Windows hosts report `unsupported-target:needs-msvc-linker`.
- The check writes nothing. Yours: the SQL the change wrote. Never edit the supplied schema DDL to make a statement plan.

## Limits and checks

- An external table whose local file is missing fails at `CREATE EXTERNAL TABLE`: `project-prerequisite-missing:<path>`. A panic (exit 101) is `engine-failure:datafusion-cli:101`.
- A plan proves names and types resolve under DataFusion's rules. It proves neither the results, nor performance, nor that data on disk matches the declared columns.
- Checks: every statement the change wrote planned with exit 0 against the unchanged schema, and the packet's own checks pass.

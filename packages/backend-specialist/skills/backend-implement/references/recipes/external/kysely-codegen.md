# kysely-codegen

## Applicability

The packet assigns the TypeScript table types of a Kysely project (a generated `.d.ts` file such as `src/db.d.ts`) and supplies a disposable PostgreSQL or MySQL database that holds the schema those types describe. The engine is kysely-codegen `0.20.0`, provided by the host with its PostgreSQL and MySQL drivers and run only as `"$BACKEND_TOOLKIT_BIN/kysely-codegen"`.

## Non-trigger

- SQLite, libSQL, SQL Server or Bun databases: the toolkit ships no driver for them; return a `packet` blocker.
- Changing the schema itself. Migrations are written and applied through the project's own route; this engine only reads the database.
- Choosing output options (`--camel-case`, `--singularize`, type mappings, overrides) or a `.kysely-codegenrc` file. Those are supplied, or the project's config file already holds them.
- A production, shared or remote database. Only the packet's disposable database is in scope.

## Inputs

- The connection string of the disposable database, as `DATABASE_URL` or the packet's value for `--url`, with the schema already applied.
- The dialect (`postgres` or `mysql`) and the output path of the generated file.
- The project's kysely-codegen config file or options, when the packet names them.

## Steps

1. Make sure the database holds the schema the change needs, through the project's migration route as the packet assigns.
2. Generate, always naming the output file; without `--out-file` the engine writes inside its own install:
   ```sh
   "$BACKEND_TOOLKIT_BIN/kysely-codegen" --dialect postgres --url "$DATABASE_URL" --out-file <path>
   ```
   Add only the options the packet or the project's config file supplies, the same on every run.
3. Read the diff of the generated file: the new tables and columns appear with the expected nullability, and nothing unrelated changed. An unexpected difference means the database is not the schema the packet describes: return a `packet` blocker.
4. Check the file matches the database, then run the packet's type check and tests:
   ```sh
   "$BACKEND_TOOLKIT_BIN/kysely-codegen" --dialect postgres --url "$DATABASE_URL" --out-file <path> --verify
   ```

## Tools and outputs

- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it (`npx`, the project's own `node_modules`, a global install).
- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.
- Generated, never hand-edited: the output file. Handwritten and yours: the code that uses the new types.
- With the default URL, `env(DATABASE_URL)`, the engine also loads a `.env` file from the working directory; pass the URL explicitly so the packet's database is the one used.

## Limits and checks

- Exit 0 is success. A connection error is `project-prerequisite-missing:database`. `--verify` exits 1 when the file is out of date. Any other failure is `engine-failure:kysely-codegen:<exit>`.
- The types describe the database it reached, not the deployed one.
- Checks: `--verify` passes, the generated diff holds only the assigned schema change, and the packet's type check passes.

# Core database domain

## Purpose and ownership

- SQLite persistence: `database.ts` (WAL), `path.ts`, `migration.ts`, and the generated `migration.gen.ts` and `schema.gen.ts`.

## Public entry points and consumers

- Consumers: every core domain with tables, and the server.

## Dependencies and boundaries

- None beyond the core layer rules.

## Assets, schemas and generated files

- `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`, so never move `packages/core/src/account/sql.ts`, `packages/core/src/credential/sql.ts`, `packages/core/src/share/sql.ts`, `packages/core/src/control-plane/workspace.sql.ts` or `packages/core/src/data-migration.sql.ts`.
- Regenerate with `bun run migration`.

## Persistence, identity and lifetime

- `ORCHESTRA_DB`, the XDG paths, and migration identity and order are user-data contracts.

## Commands

- `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts`

## Contracts and verification limits

- The generated files are path-pinned.

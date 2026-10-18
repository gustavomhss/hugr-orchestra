# Janitor domain

## Purpose and ownership

- Background maintenance: `bootstrap.ts`, `scan.ts`, `scheduler.ts`, `thresholds.ts`, `report-state.ts`.
- Target: modules/janitor (a future path); the desktop binding stays in `apps/desktop/src/main`.

## Public entry points and consumers

- Consumers: `apps/orchestra/src/server/server.ts` and the global handler (declared exceptions under rule R11).

## Dependencies and boundaries

- May import the platform.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Background loops are process-local and must stop on shutdown.

## Commands

- `bun run test:ci orchestra src/janitor/<file>.test.ts`

## Contracts and verification limits

- None.

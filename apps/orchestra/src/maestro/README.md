# Maestro domain

## Purpose and ownership

- Maestro coordination: seats and roster, governance, admission and approval records, proposal settlement, Arsenal bindings, Atlas memory and Task orchestration.
- Product-owned files outside this folder: `apps/orchestra/src/tool/maestro-*.ts` (10 files) and `apps/orchestra/src/tool/atlas-*.ts` (2 files).
- Target after the 70-C' cut: modules/maestro (a future path).

## Public entry points and consumers

- Consumers: claude-code (an allowed product edge).
- Platform-legacy importers are declared exceptions under rule R11 in `script/boundary-ledger.json`.

## Dependencies and boundaries

- May import the platform, `@orchestra/maestro-arsenal`, `@orchestra/atlas-boundary` and continuity.
- Never imports claude-code, acp or janitor.

## Assets, schemas and generated files

- The prompt `packages/core/src/agent/prompt/maestro.txt` is core-owned and path-pinned.

## Persistence, identity and lifetime

- No tables of its own; records go through core Session and event storage.

## Commands

- `bun run test:ci orchestra test/maestro/<file>`

## Contracts and verification limits

- Seats are referred to by id (AGENTS.md, "Agent Names"); default display names live only in `apps/orchestra/src/maestro/roster.ts`.

# Agent Client Protocol domain

## Purpose and ownership

- Agent Client Protocol adapter: `service.ts`, `session.ts`, `agent.ts`, `tool.ts`, `permission.ts`, `event.ts`, `usage.ts`, `profile.ts`, `content.ts`, `config-option.ts`, `directory.ts`, `error.ts`.
- Entered from `apps/orchestra/src/cli`.
- Target: modules/acp (a future path).

## Public entry points and consumers

- Consumer: the CLI (composition).

## Dependencies and boundaries

- May import the platform and contracts.
- Adds no Session orchestration of its own.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Session state lives in core.

## Commands

- `bun run test:ci orchestra test/acp/<file>`

## Contracts and verification limits

- None.

# Claude Code engine adapter domain

## Purpose and ownership

- Claude Code engine adapter: `engine.ts`, `sdk.ts`, `executable.ts`, `host/`, `mirror.ts`, `permissions.ts`, `tools.ts`, `transcript.ts`.
- Target: modules/engine-adapters/claude-code (a future path).

## Public entry points and consumers

- Consumers: server and session (declared exceptions under rule R11).

## Dependencies and boundaries

- May import the platform, maestro and continuity.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Durable mirror and transcript.
- `sdk.ts` runs its guards before it reads the login or spawns anything.

## Commands

- `bun run test:ci orchestra test/claude-code/<file>`

## Contracts and verification limits

- `apps/orchestra/src/claude-code/sdk.ts` is listed in `script/spawn-allowlist.json`.
- The engine query keeps the `claude_code` preset.

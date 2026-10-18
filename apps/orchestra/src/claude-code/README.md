# Claude Code engine adapter domain

## Purpose and ownership

- Claude Code engine adapter: `engine.ts`, `host/`, `login.ts`, `mirror.ts`, `permissions.ts`, `tools.ts`.
- `sdk.ts`, `executable.ts`, `transcript.ts` and `host/{admission,join,options}.ts` moved to modules/engine-adapters/claude-code (`@orchestra/engine-claude-code`). `host/provider.ts` stays here because it uses the V1 sign-in.

## Public entry points and consumers

- Consumers: server and session (declared exceptions under rule R11).

## Dependencies and boundaries

- May import the platform, maestro and continuity.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Durable mirror and transcript.
- `sdk.ts` (now in the module) runs its guards before it reads the login or spawns anything.

## Commands

- `bun run test:ci orchestra test/claude-code/<file>`

## Contracts and verification limits

- `modules/engine-adapters/claude-code/src/sdk.ts` is listed in `script/spawn-allowlist.json`.
- The engine query keeps the `claude_code` preset.

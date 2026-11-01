# Core Session domain

## Purpose and ownership

- V2 Session core: the `packages/core/src/session.ts` facade, `packages/core/src/session/input.ts` (admission and retry identity), the projector, `packages/core/src/session/execution` (the process-global coordinator, `local.ts`) and `packages/core/src/session/runner` (the Location-scoped runner, exported as `@orchestra/core/session/runner`).

## Public entry points and consumers

- Consumers: `packages/server` and `apps/cli`; other packages import the package entries, not these files.

## Dependencies and boundaries

- Follow AGENTS.md, "V2 Session Core": durable admission before an advisory wake, one `llm.stream` call per provider turn, no `SessionPrompt.loop` bridge, steer versus queue delivery. Read it there; it is not copied here.

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- `session_input` rows and events are durable user data.

## Commands

- `bun run test:ci core test/session` from the repository root runs the Session tests (`test/session-*.test.ts` and `test/session/`).
- `bun typecheck` in `packages/core`.

## Contracts and verification limits

- Path-pinned: `packages/core/src/session.ts`, `packages/core/src/session/runner/model.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/execution/local.ts`.

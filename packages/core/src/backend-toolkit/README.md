# Backend toolkit domain

## Purpose and ownership

- Engine (core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `runtimes/`.
- Packs (`packs/`, `entry-skills.gen.ts`) describe each pinned engine: how to acquire it and which entry skills it exposes.

## Public entry points and consumers

- Consumers include `apps/cli/src/commands/handlers/toolkit/` and `modules/maestro/coordination/src/v2/tools/atlas-memory.ts`.

## Dependencies and boundaries

- The engine must not import product code.

## Assets, schemas and generated files

- `packages/core/src/backend-toolkit/entry-skills.gen.ts` is generated from `modules/specialists/backend/skills` by `packages/core/script/toolkit-pack.ts`; never edit it by hand. The `*.package-lock.json` files under `packs/` are pinned inputs.

## Persistence, identity and lifetime

- Acquired engines live in a cache root that defaults to `BACKEND_TOOLKIT_ROOT` or `backend-toolkit` under the global cache directory.

## Commands

- `bun run test:ci core test/backend-toolkit` from the repository root runs the toolkit tests.
- `bun typecheck` in `packages/core`.
- `.github/workflows/toolkit-arm.yml` is a manual workflow that runs the toolkit on Arm hosts.

## Contracts and verification limits

- `packages/core/src/backend-toolkit/target.ts` is listed in `script/spawn-allowlist.json` and is path-pinned.

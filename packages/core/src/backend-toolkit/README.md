# Backend toolkit domain

## Purpose and ownership

- Engine (core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `runtimes/`.
- Packs (`packs/`, `entry-skills.gen.ts`) are owned by the backend-toolkit module role; target modules/backend-toolkit (a future path) after the 70-C' toolkit cut.

## Public entry points and consumers

- Consumers include `apps/orchestra/src/cli/cmd/toolkit.ts` and `apps/orchestra/src/maestro/atlas-memory.ts`.

## Dependencies and boundaries

- The engine must not import product code.

## Assets, schemas and generated files

- `packages/core/src/backend-toolkit/entry-skills.gen.ts` is generated; package-lock assets are pinned inputs.

## Persistence, identity and lifetime

- The cache root defaults to `BACKEND_TOOLKIT_ROOT` or the global cache.

## Commands

- `bun run test:ci core test/<backend-toolkit test>`
- Workflow `.github/workflows/toolkit-arm.yml`.

## Contracts and verification limits

- `packages/core/src/backend-toolkit/target.ts` is listed in `script/spawn-allowlist.json` and is path-pinned.

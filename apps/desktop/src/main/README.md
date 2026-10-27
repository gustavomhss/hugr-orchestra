# Desktop main process domain map

## Purpose and ownership

- **MCP Dock** (logical module, target modules/app-dock): `app-dock*`, `ipc-app-dock*` and `linux-workspace*` here, plus `modules/app-dock/src/*.ts` and `packages/app-shell/src/app-dock-linux.ts`.
- WSL (`wsl/`), Omni (`omni-*`), windows and menu, updater, stores and the draft store, the background CLI, and the janitor binding.

## Public entry points and consumers

- Entry `apps/desktop/src/main/index.ts`; preload `apps/desktop/src/preload`; renderer `apps/desktop/src/renderer`.

## Dependencies and boundaries

- The main process may import core (a Node app); the renderer uses `@orchestra/app`.

## Assets, schemas and generated files

- Linux runtime resources live in `apps/desktop/resources`.

## Persistence, identity and lifetime

- `drafts.sqlite`, the profile and window stores, and app IDs are user data.

## Commands

- `bun run test:ci desktop <files>`
- Proofs in `apps/desktop/scripts` (`*-proof.ts`) run outside Bun test discovery.

## Contracts and verification limits

- `apps/desktop/src/main/app-dock-rpc.ts` and `apps/desktop/src/main/linux-workspace-rpc.ts` have different authorities: never unify them.
- `apps/desktop/src/main/app-dock-runtime.ts`, `apps/desktop/src/main/app-dock-runtime-docker.ts`, `apps/desktop/src/main/linux-workspace-access.ts`, `apps/desktop/src/main/linux-workspace-omni.ts`, `apps/desktop/src/main/background-cli.ts` and `apps/desktop/src/main/shell-env.ts` are listed in `script/spawn-allowlist.json`.
- `.github/workflows/native.yml` names MCP Dock paths, so do not move them.
- Desktop tests mock Electron only through `apps/desktop/src/main/electron-mock.fixture.ts`.

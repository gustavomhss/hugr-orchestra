# Core plugin folder domains

Two domains share this folder: the plugin host and the built-in provider plugins.

## Purpose and ownership

- **plugin-host**: `sdk-runtime.ts`, `sdk-registry.ts`, `sdk-admission.ts`, `sdk-limits.ts`, `sdk-package.ts`, `sdk-reconcile.ts`, `host.ts`, `internal.ts`, `promise.ts`, `agent.ts`, `command.ts`, `command/`. It builds the context a plugin receives, serves the bundled `@orchestra/plugin` to external plugins, and installs the built-in agent and command plugins.
- **provider**: `provider/` (one file per provider), `provider.ts` (the ordered list of provider plugins), `models-dev.ts` (the models catalog plugin) and `variant.ts` (model variant generation).

## Public entry points and consumers

- Core exports `./plugin/host`, `./plugin/provider`, `./plugin/models-dev`, `./plugin/agent`, `./plugin/command`, `./plugin/promise` and one `./plugin/provider/<name>` per provider.
- Consumers: core itself (`packages/core/src/config/plugin/external.ts`, `packages/core/src/npm.ts`), `packages/tui` (`packages/tui/src/plugin/runtime.tsx`), `modules/app-dock` and `modules/maestro/coordination`.

## Dependencies and boundaries

- `@orchestra/plugin` is the public contract.
- `sdk-package.ts` turns every key of the `packages/plugin/package.json` `exports` map into generated shim files, so never edit the plugin `exports` without checking this folder.

## Assets, schemas and generated files

- Command prompts `packages/core/src/plugin/command/initialize.txt` and `packages/core/src/plugin/command/review.txt`.
- The SDK shim files are generated in memory from `packages/plugin/package.json`; nothing is checked in.

## Persistence, identity and lifetime

- `sdk-package.ts` writes SDK shim trees under the global cache `packages` directory, and `sdk-admission.ts` validates them byte for byte before reuse. Nothing else here persists.

## Commands

- `bun run test:ci core test/plugin/sdk-runtime.test.ts test/plugin/sdk-authority.test.ts`
- `bun run test:ci core test/plugin` runs every plugin test, including one per provider.
- `bun typecheck` from `packages/core`.

## Contracts and verification limits

- One provider file name is protected by `script/rename-ledger.ts`.
- The provider tests use fixtures; they do not call live provider APIs.

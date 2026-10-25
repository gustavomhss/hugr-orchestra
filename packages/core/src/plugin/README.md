# Core plugin folder domains

## Purpose and ownership

- Two domains in one folder.
- **plugin-host**: `sdk-runtime.ts`, `sdk-registry.ts`, `sdk-admission.ts`, `sdk-limits.ts`, `sdk-package.ts`, `sdk-reconcile.ts`, `host.ts`, `internal.ts`, `promise.ts`, `agent.ts`, `command.ts`, `command/`.
- **provider**: `provider/`, `provider.ts`, `models-dev.ts`, `variant.ts`.

## Public entry points and consumers

- Consumers: core and plugin authors through `@orchestra/plugin`.

## Dependencies and boundaries

- `@orchestra/plugin` is the public contract.
- `sdk-package.ts` turns every key of the `packages/plugin/package.json` `exports` map into generated shim files, so never edit the plugin `exports`.

## Assets, schemas and generated files

- Command prompts `packages/core/src/plugin/command/initialize.txt` and `packages/core/src/plugin/command/review.txt`.

## Persistence, identity and lifetime

- None.

## Commands

- `bun run test:ci core test/plugin/sdk-runtime.test.ts test/plugin/sdk-authority.test.ts`

## Contracts and verification limits

- One provider file name is protected by `script/rename-ledger.ts`.

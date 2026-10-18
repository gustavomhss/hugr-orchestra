# Control plane domain

## Purpose and ownership

- Workspace control plane: `adapters/`, `workspace.ts`, `workspace-adapter-runtime.ts`, `workspace-context.ts`, `types.ts`, `util.ts`, and `dev/` with its own README (`apps/orchestra/src/control-plane/dev/README.md`).
- Kind: platform-legacy.
- Target: `packages/core/src/control-plane` (it already holds `packages/core/src/control-plane/move-session.ts` and `packages/core/src/control-plane/workspace.sql.ts`) plus server handlers.

## Public entry points and consumers

- Consumers: server, effect, plugin, project and storage (which re-exports `WorkspaceTable`).

## Dependencies and boundaries

- Platform-legacy: may not import product domains (rule R11).

## Assets, schemas and generated files

- None.

## Persistence, identity and lifetime

- Process-global move service.
- The `packages/core/src/control-plane/workspace.sql.ts` table is core-owned; never move a `*.sql.ts` file.

## Commands

- `bun run test:ci orchestra test/control-plane/<file>`

## Contracts and verification limits

- None.

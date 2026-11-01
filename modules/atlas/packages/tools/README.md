# @atlas/tools

The governed public surface, layer 7. One pure, total handler serves the governance tools (`atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link`) plus the read-only views. Every write passes one of the two governed doors, `atlas-emit` or `atlas-link`.

## Entry points

- `src/handler.ts` holds the handler and the frozen `WRITE_PATHS`, `GOVERNANCE_SURFACE` and `READ_SURFACE` constants.
- `src/index.ts` also exports `emit`, `query`, `reconcile`, `doctor`, `draft`, `check`, `anchors`, `slots`, `push` and the transport types.

## Used by

`adapter-io`, `cli` and `mcp-server`, which route the same call through one wired handler.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

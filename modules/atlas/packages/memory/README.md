# @atlas/memory

The Memory kind of Atlas, layer 6: per-seat, scoped memory, kept apart from Knowledge by a fail-closed partition. It injects only a seat's own memory, ranks project rules, keeps the orchestrator logbook and builds the Awareness and Orientation slabs.

## Entry points

- `src/index.ts` exports inject and recall (`inject.ts`), the partition gate (`kinds.ts`), `awareness.ts`, `orient.ts`, `rules.ts`, `logbook.ts`, `template.ts` (templated writes), `portable.ts` (export with the scan gate) and `respawn.ts`.

## Used by

`tools`, `genesis`, `adapter-io`, `cli` and `mcp-server`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

# @atlas/contracts

The layer-0 vocabulary of Atlas: the shared types every other package builds on. It holds types only and no runtime logic, so it can be frozen before anything above it is written.

## Entry points

- `src/index.ts` re-exports `hash`, `struct`, `tier`, `status`, `territory`, `pack` and `tool` (`Hash`, `SubtreeHash`, `Tier`, `Status`, `Territory`, `Pack`, `Tool`).

## Used by

Every other Atlas package, always through `import type`, which the compiler erases. That is why `wiring-guard` lists it as unreached by design. Nothing outside Atlas imports it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

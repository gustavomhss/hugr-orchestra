# @atlas/retrieval

Bounded context assembly, layer 5. Relevance comes from the hashed structural index, never from embeddings: a deterministic `relate()`, a capped pack (T0 first, then T1 by rank), the per-unit Own pack, the injection-ceiling drop order and the off-atlas miss oracle.

## Entry points

- `src/index.ts` exports `relate`, the pack (`pack.ts`), `OwnPack` (`own.ts`), the Own artifact, coverage and snapshot modules, `poke`, `drop`, the hits ledger (`ledger.ts`) and `offatlas`.
- `src/host-context.ts` is also bundled into the Orchestra boundary (`modules/atlas/boundary`).

## Used by

`memory`, `tools` and `adapter-io` inside Atlas, plus the boundary bundle through `host-context.ts`.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

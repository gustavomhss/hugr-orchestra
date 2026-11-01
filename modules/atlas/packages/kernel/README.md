# @atlas/kernel

The sealed identity seam, layer 1. All hashing in Atlas goes through it: the BLAKE3 content address (`id`, `canonicalForm`), the single content-addressed store, the append-only event log and the convergent fold and merge.

## Entry points

- `src/index.ts` exports `createStore`, `id`, `canonicalForm`, the default encoder (`encoder.ts`), the event log (`log.ts`), `fold` and merge (`fold.ts`), the open-JSON export and import (`portable.ts`) and the JSONL log form (`jsonl.ts`).
- `src/brand.ts` holds the only sanctioned casts for `Hash`, `SubtreeHash` and `NodeKey`.

## Used by

Every Atlas package that computes or stores an address: `persist`, `index`, `grounding`, `knowledge`, `retrieval`, `memory`, `tools`, `genesis`, `adapter-io` and `cli`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

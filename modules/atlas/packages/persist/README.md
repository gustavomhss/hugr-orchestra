# @atlas/persist

The durable side of Atlas, layer 2: git-native durability, provenance and re-spawn. It assembles the portable store source, rebuilds state from git history, scrubs secrets before anything is written, meters usage and shows read-only version diffs.

## Entry points

- `src/index.ts` exports the portable source (`clone`, `exportStore`, `importStore`, `src/source.ts`) and reconstruction and rewind (`reconstruct`, `replayEvents`, `rewind`, `archive`, `src/reconstruct.ts`).
- Also `scrub.ts` (secret scrub), `provenance.ts`, `metering.ts`, `transcript-store.ts`, `host-adapter.ts` and `diff.ts`.

## Used by

`tools`, `adapter-io` and `cli`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

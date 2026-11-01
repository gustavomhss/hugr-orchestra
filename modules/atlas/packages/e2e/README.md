# @atlas/e2e

The story-driven, in-process end-to-end suite. It has no `src/`: each test composes the real wired packages across their seams and asserts a user-level story (move-in, genesis mining, the truth gate, drift, write governance, retrieval budget, memory scoping, transport parity). Tests only.

## Entry points

- `test/s01-move-in.e2e.test.ts` through the other `test/s*.e2e.test.ts` stories.

## Used by

Nothing. It is a test suite.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

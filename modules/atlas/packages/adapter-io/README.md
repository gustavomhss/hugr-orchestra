# @atlas/adapter-io

The composition root: the raw adapters (filesystem, SCIP, AST, git, LLM command client and the durable on-disk store) and the governed doors, wired into one runtime. Nothing in the core imports it.

## Entry points

- `src/index.ts` is a large barrel: `walkFileTree`, `readScip`, `createDiskStore`, the git sources (`git-history.ts`, `git-drift.ts`, `git-forge.ts`), `createCommandClient` and `loadModelConfig` (`llm.ts`, `model-config.ts`).
- `src/compose.ts` builds the `ComposedRuntime`; `governed-emit*.ts` and `governed-link*.ts` are the write doors.
- `prompts/` holds the proposal prompts.

## Used by

`cli` and `mcp-server`. `src/identity-schema.ts` is also bundled into the Orchestra boundary (`modules/atlas/boundary`).

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

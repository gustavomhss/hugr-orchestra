# @atlas/e2e-blackbox

The black-box suite. It drives the built `atlas` binary as a subprocess and the `atlas-mcp` server over real MCP stdio against temporary git repositories, with no in-process shortcut, so it needs the packages built first. Tests only.

## Entry points

- `src/harness.ts` holds the subprocess, SCIP fixture and MCP client plumbing.
- `test/*.blackbox.test.ts` are the stories; it runs under its own vitest config (see the note in `modules/atlas/vitest.config.ts`).

## Used by

Nothing. It is a test suite.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

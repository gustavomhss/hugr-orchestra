# @atlas/cli

The `atlas` command line: a total argv parser that never throws, a dispatch to the wired handler, and a rendered verdict. It also holds the CLI-only drivers (mine, promote, review, ratify, ops and OKF export and import).

## Entry points

- `src/bin.ts` is the executable; `package.json` maps `bin.atlas` to `dist/src/bin.js`.
- `src/cli.ts` exports `main`; `src/map.ts` holds `COMMANDS` and the exit codes; `src/parse.ts`, `src/help.ts` and `src/render.ts` handle input and output.

## Used by

Only the black-box suite (`e2e-blackbox`), which runs the built binary as a subprocess. CI also invokes it. Nothing imports it, by design.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

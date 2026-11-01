# @atlas/index

The structural index, layer 2: a deterministic, no-LLM build of the file tree plus SCIP output into three axis views (spatial, territory, dependency), a Merkle rollup, the dependency blast radius (reverse closure) and the standing T0 coverage gate. Objects land in the content-addressed store.

## Entry points

- `src/index.ts` re-exports `build` (`build.ts`), the dependency graph (`depgraph.ts`), `rollup`, `fold`, `resolve`, `territory` and `territory-catalog`, the `unit-*` readers, `own-impact` and the CAS index (`cas.ts`).

## Used by

`grounding`, `knowledge`, `retrieval`, `genesis` and `adapter-io`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

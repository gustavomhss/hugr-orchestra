# @atlas/knowledge

The Knowledge kind of Atlas, layer 4: the shared, project-level truth. It owns the fact lifecycle: grounded emit, status recompute, drift reconcile, write routing (every write is an upsert), authorization, tier ratification and `sameAs` links.

## Entry points

- `src/index.ts` re-exports `lifecycle/` (freshness, emit, status, reconcile), `write/` (router, link, template, authz, archive), `ratify/` and `read/`.
- `src/types.ts` holds the fact data model; `negation-types.ts`, `transition-types.ts` and `test-vacuity-types.ts` define the extra fact families.

## Used by

`retrieval`, `memory`, `tools`, `genesis`, `adapter-io` and `cli`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

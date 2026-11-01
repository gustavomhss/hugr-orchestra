# @atlas/genesis

The one-time cold-start miner, layer 8. It seeds Atlas onto an existing repository: a deterministic no-LLM scan and rank, a budgeted grounded proposal, mechanical admission, and candidate-only writes. The model enters at one step only, and a person ratifies the contested facts.

## Entry points

- `src/index.ts` exports `extract`, the admission legs (`admit-harness.ts`, `admit-transition.ts`, `admit-test-vacuity.ts`, `admit-negation.ts`, `admit-relation.ts`), `cost-policy`, `rank`, `seed` and the types in `types.ts`.
- The `verify-*` modules implement the `verify-fact` oracles.

## Used by

`adapter-io` and `cli` (the `mine` driver and `verify-fact`). Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

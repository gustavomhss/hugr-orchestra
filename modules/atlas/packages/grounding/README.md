# @atlas/grounding

The trust primitive, layer 3. A fact is grounded only when it is anchored to a real structural unit. Drift is subtree-hash equality (`FRESH` or `DRIFTED`, never line ranges), and the truth gate holds only when a fact is grounded and fresh, failing closed.

## Entry points

- `src/index.ts` exports the gate (`gate.ts`), the emit guard (`emit-guard.ts`), `subtreeHash` (`subtree.ts`), spans (`span.ts`), drift detection (`drift.ts`), transitive freshness (`freshness.ts`) and the anchor builder `ground()` (`ground.ts`).

## Used by

`knowledge`, `tools` and `adapter-io`. Only Atlas's own packages use it.

## Commands

Tests run on GitHub Actions, not locally. From the repository root: `bun run test:ci atlas [files]`.

Back to [Atlas](../../README.md).

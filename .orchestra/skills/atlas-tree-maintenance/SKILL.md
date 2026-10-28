---
name: atlas-tree-maintenance
description: How the committed `.atlas/` tree is laid out (project and per-seat logs), which files own each path, the invariants a change must keep, and how to test it
---

# Atlas tree maintenance

Design: `modules/atlas/docs/design/repo-layout.md` §8. Reference: `modules/atlas/docs/reference/atlas-memory.md`, "Where the logs live".

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Every committed path | `modules/atlas/packages/adapter-io/src/layout.ts` | Stores and tools build paths only through these helpers; never join `.atlas` by hand |
| Multi-file fold | `durable-log.ts` (`readDurableLogs`) | Legacy file first, then member files in sorted `/` order; content-keyed, so a line seen twice counts once |
| Memory, orientation, review stores | `memory-store.ts`, `orientation-store.ts`, `review-log.ts` | Write to the tree, read legacy plus tree |
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Copies original bytes; an unroutable line stays in the legacy file; exports the local projection once as knowledge rows |
| Knowledge logs | `knowledge-log.ts` (`appendKnowledge`, `readKnowledge`, `withKnowledgeLog`) | One line per row a settled `commitProjection` produced or changed, under the writing seat; the row's CAS object copied once to `.atlas/blobs/` |
| Knowledge replay | `knowledge-replay.ts` (`replayKnowledge`), wired in `compose.ts` | Runs at boot only when store provenance is trusted; through the raw store, so replay is never logged again |
| What travels | `modules/atlas/.gitignore`, root `.gitattributes` | `.atlas/project/` and `.atlas/members/` admitted; one `.atlas/**/*.jsonl merge=union` line |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after any change to these sources |

## Invariants

- A file name is a shard hint, never identity. Moving a line between files never changes its event id.
- Order by `(at, contentHash)`, never by `seq` or by file order across branches.
- The legacy single files stay readable until every checkout has run `atlas migrate-layout`; do not drop the legacy read.
- GitHub's server-side merge ignores `merge=union`: probed 2026-10-28, two branches appending to one `.atlas/**/*.jsonl` file returned `409 Merge conflict` from the merges API. Union only applies to a local `git merge`, so the host merges `.atlas/` locally (design §4).
- CAS (`cas/`) and `projection*.json` stay untracked; `store-provenance.ts` is not loosened for the tree.
- A committed knowledge line is a claim, never authority. Replay applies a row only when the fact's bytes carry `seal:'proven'`, the seat is in the row's scope, and it re-proves now; every other row is staged for ratify. There is no merged-PR check.
- A blob whose bytes do not hash to the row's `contentHash` is missing, never applied.
- Known limits: a row a commit removes is not logged; a candidate ratify rejected is staged again on a later boot.
- A comment must not contain `*/` (for example a `members/*/memory` glob) inside a `/** */` block: it ends the comment and breaks the boundary type bundle.

## Testing

Atlas runs vitest, which `bun run test:ci` cannot reach (`TEST_PACKAGE_NOT_FOUND:atlas`); its tests run in test.yml's atlas job (epic label or workflow dispatch). The files: `packages/adapter-io/test/migrate-layout.test.ts`, `knowledge-log.test.ts`, `memory-store.test.ts`, and `native-memory-merge.test.ts` (real `git merge` with the union attribute, plus its no-attribute control). Consumers outside the module (`maestro`, `app`) do run through `test:ci`.

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
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Copies original bytes; an unroutable line stays in the legacy file |
| What travels | `modules/atlas/.gitignore`, root `.gitattributes` | `.atlas/project/` and `.atlas/members/` admitted; one `.atlas/**/*.jsonl merge=union` line |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after any change to these sources |

## Invariants

- A file name is a shard hint, never identity. Moving a line between files never changes its event id.
- Order by `(at, contentHash)`, never by `seq` or by file order across branches.
- The legacy single files stay readable until every checkout has run `atlas migrate-layout`; do not drop the legacy read.
- GitHub's server-side merge ignores `merge=union`: probed 2026-10-28, two branches appending to one `.atlas/**/*.jsonl` file returned `409 Merge conflict` from the merges API. Union only applies to a local `git merge`, so the host merges `.atlas/` locally (design §4).
- CAS (`cas/`) and `projection*.json` stay untracked.
- A comment must not contain `*/` (for example a `members/*/memory` glob) inside a `/** */` block: it ends the comment and breaks the boundary type bundle.

## Testing

`bun run test:ci atlas packages/adapter-io/test/migrate-layout.test.ts packages/adapter-io/test/memory-store.test.ts packages/adapter-io/test/native-memory-merge.test.ts` (real `git merge` with the union attribute, plus its no-attribute control).

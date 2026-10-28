---
name: atlas-maintenance
description: How the committed `.atlas/` tree works (project and per-seat logs, union merge, knowledge logs, blobs, replay), which file owns each path, the traps a change falls into, and how to test it
---

# Atlas maintenance

Design: `modules/atlas/docs/design/repo-layout.md` §8. Reference: `modules/atlas/docs/reference/atlas-memory.md`, "Where the logs live". Who owns what and the owner rulings: skill `atlas-ownership`. Reading and writing through the doors: skill `atlas-usage`.

## The tree

```
.atlas/policy.json                                  admin-owned source, always tracked
.atlas/project/{orientation,review}.jsonl           shared, owned by nobody
.atlas/members/<seat>/memory/project.jsonl          one seat's project rules
.atlas/members/<seat>/memory/task/<taskId>.jsonl    one task's memory
.atlas/members/<seat>/memory/pr/<prId>.jsonl        one PR's memory
.atlas/members/<seat>/memory/logbook.jsonl          the logbook (only its author writes it)
.atlas/members/<seat>/knowledge/<nodeKey[0:2]>.jsonl applied knowledge outcomes
.atlas/blobs/<h[0:2]>/<h>                           CAS bytes a knowledge row names
.atlas/cas/, .atlas/projection*.json, staging*.json local derived state, never tracked
```

Every path comes from `modules/atlas/packages/adapter-io/src/layout.ts`. Never join `.atlas` by hand.

## How each piece works

| Piece | Owner file | How it works |
|---|---|---|
| Line format | `durable-log.ts` | Each line is a kernel `Event` whose `id` is `eventId` of the rest. A torn or edited line is counted in `rejected`, never folded |
| Multi-file fold | `durable-log.ts` (`readDurableLogs`) | Legacy file first, then tree files in sorted order; keyed by event id, so a line seen twice counts once |
| Memory, orientation, review | `memory-store.ts`, `orientation-store.ts`, `review-log.ts` | Append to the tree, read legacy plus tree |
| Knowledge log | `knowledge-log.ts` (`withKnowledgeLog`, `appendKnowledge`, `readKnowledge`) | Wraps the store: each settled `commitProjection` appends one line per row it produced or changed, under the writing seat, and copies that row's CAS object to `blobs/` once. Staging is not logged |
| Replay | `knowledge-replay.ts` (`replayKnowledge`), wired in `compose.ts` | At boot, only when store provenance is `trusted`. Applies a row whose fact has `seal:'proven'`, whose seat is in the row's scope and which re-proves now; stages every other row for ratify. Runs on the raw store, so replayed rows are not logged again |
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Copies original bytes into the tree; an unroutable line stays in the legacy file; exports the local projection once as knowledge rows (the scope's only actor, else `maestro`) |
| Merge | root `.gitattributes`, `modules/atlas/.gitignore` | One `.atlas/**/*.jsonl merge=union` line; the ignore file admits `project/`, `members/` and `blobs/` |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after changing these sources |

## Traps

- **The tripwire.** `store-provenance.ts` `isDurableStorePath` matches `.atlas/cas/` and `.atlas/(projection|staging)(.N)?.json`. A tracked match makes the store `tracked-staging` or `tracked-provable`, which turns replay off and serves only facts that re-prove. Never track those paths, and never loosen the tripwire to make the tree fit. `blobs/` is deliberately outside it: a blob is reachable only through a log line, and every line goes through replay.
- **Order is `(at, contentHash)`.** The fold keeps, per `nodeKey`, the latest `at`, then the larger `contentHash`. Never order by `seq` or by file position: both differ across branches after a union merge.
- **Integers only.** Money is `costMicroUsd`, an integer. A float in a committed row hashes differently across runtimes and splits one record into two.
- **A file name is a shard hint, not identity.** Two ids that sanitize to one segment, or a case-insensitive filesystem, only put two records in one file.
- **A seat writes only its own folder.** A line under `members/<seat>/` that names another seat is rejected.
- **A blob that does not hash to its row's `contentHash` is missing,** never applied.
- **GitHub ignores `merge=union`.** Its merges API returned `409 Merge conflict` for two branches appending to one `.atlas/**/*.jsonl` file (probe 2026-10-28). Union applies only to a local `git merge`, so the merge queue merges locally and fast-forwards base.
- **Public repositories travel redacted** (owner ruling 2026-10-28; design §6). Memory, context and attempt rows keep ids, links, model, timings and hashes and drop free text and spend; transcripts and continuity chunks stay in the local `blobs/` and are never committed. Public or private is read from the remote host, never from config. Not built yet: today's memory rows still carry their bodies, so do not commit memory from a public repository until redaction lands.
- **Comments in `/** */` blocks** must not contain `*/`, for example a `members/*/memory` glob. It ends the comment and breaks the boundary type bundle.

## Known limits (declared, not bugs)

- A row a commit removes from the projection is not logged, so replay cannot remove it. No door removes a row today.
- A candidate that ratify rejected is staged again on a later boot; nothing records the rejection in the logs yet.

## Testing

Atlas runs vitest, which `bun run test:ci` cannot reach (`TEST_PACKAGE_NOT_FOUND:atlas`). Its tests run in test.yml's atlas job (epic label or workflow dispatch). Files: `packages/adapter-io/test/migrate-layout.test.ts`, `knowledge-log.test.ts`, `memory-store.test.ts`, and `native-memory-merge.test.ts` (a real `git merge` with the union attribute, plus a control without it). Consumers outside the module (`maestro`, `app`) do run through `test:ci`.

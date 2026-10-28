---
name: atlas-maintenance
description: How the committed `.atlas/` tree works (project and per-actor logs, union merge, knowledge logs, blobs, replay), which file owns each path, the traps a change falls into, and how to test it
---

# Atlas maintenance

Design: `modules/atlas/docs/design/repo-layout.md` on branch `atlas-repo-layout` (not yet in `dev`): the tree is §2, merging §4, trust and replay §5, what never goes in git §6. Reference: `modules/atlas/docs/reference/atlas-memory.md`, "Where the logs live". Owners, invariants and rulings: skill `atlas-ownership`. Commands: skill `atlas-usage`.

## The tree

```
.atlas/policy.json                                   admin-owned source, always tracked
.atlas/project/{orientation,review}.jsonl            shared, owned by nobody
.atlas/members/<actor>/memory/project.jsonl          one actor's project rules
.atlas/members/<actor>/memory/task/<taskId>.jsonl    one task's memory
.atlas/members/<actor>/memory/pr/<prId>.jsonl        one PR's memory
.atlas/members/<actor>/memory/logbook.jsonl          the logbook (only its author writes it)
.atlas/members/<actor>/knowledge/<nodeKey[0:2]>.jsonl applied knowledge outcomes
.atlas/blobs/<h[0:2]>/<h>                            CAS bytes a knowledge row names
.atlas/cas/, .atlas/projection*.json, staging*.json  local derived state, never tracked
```

`<actor>` is the writer's identity (`ATLAS_ACTOR`, else `git config user.email`) passed through `segment()`. In Orchestra that is whatever the host sets, which need not be a seat id. Every path comes from `modules/atlas/packages/adapter-io/src/layout.ts`; never join `.atlas` by hand.

## How each piece works

| Piece | Owner file | How it works |
|---|---|---|
| Line format | `durable-log.ts` | Each line is a kernel `Event` whose `id` is `eventId` of the rest. A torn or edited line is counted in `rejected`, never folded |
| Multi-file fold | `durable-log.ts` (`readDurableLogs`, `jsonlFiles`) | Legacy file first, then tree files in sorted order, keyed by event id, so a line seen twice counts once |
| Memory, orientation, review | `memory-store.ts`, `orientation-store.ts`, `review-log.ts` | Append to the tree, read legacy plus tree. No folder check and no replay: a memory line is served as read |
| Knowledge log | `knowledge-log.ts` (`withKnowledgeLog`) | Wraps the store `compose.ts` builds. Each settled `commitProjection` appends one line per row it produced or changed, under the writing actor, and copies the row's CAS object to `blobs/` once. Staging is not logged. `wire.ts` takes this store as `WireConfig.store`, so `atlas emit` and `atlas link` are logged like every CLI writer |
| Replay | `knowledge-replay.ts` (`replayKnowledge`), called from `compose.ts` at boot | Runs only when provenance is `trusted`, on every command. Applies a row whose fact has `seal:'proven'`, whose actor is in the row's scope and which re-proves now; stages every other row for ratify. Writes through the raw store, so replayed rows are not logged again |
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Copies original bytes into the tree; an unroutable line stays in the legacy file; exports the local projection once as knowledge rows (the scope's only actor, else `maestro`) |
| Merge | `.gitattributes` and `modules/atlas/.gitattributes` | Each has `.atlas/**/*.jsonl merge=union` |
| Ignore | `.gitignore`, `modules/atlas/.gitignore`, `adapter-io/src/gitignore.ts` | Deny `.atlas/*`, re-admit `policy.json`, `project/`, `members/`, `blobs/`. `gitignore.ts` is what `atlas init` writes into a user's repo and repairs when a negation is missing |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after changing these sources |

## Provenance

`store-provenance.ts` answers one of three states, from whether `git ls-files` matches `isDurableStorePath` (`.atlas/cas/`, `.atlas/(projection|staging)(.N)?.json`):

- `trusted`: nothing tracked. Serve, write and replay.
- `tracked-staging`: a staging file is tracked. Refuse.
- `tracked-provable`: a store file is tracked. Serve only facts that re-prove; no writes, no replay.

`blobs/` is deliberately outside the match: a blob is reachable only through a log line, and every line goes through replay.

## Traps

- **Never loosen the tripwire** to make the tree fit, and never track the store paths.
- **Knowledge order is `(at, contentHash)`.** Per `nodeKey` the fold keeps the latest `at`, then the larger `contentHash`. Never order knowledge by `seq` or file position: both differ across branches after a union merge. Memory frecency does use file position today.
- **Integers only.** Money is `costMicroUsd`. A float hashes differently across runtimes and splits one record into two.
- **A file name is a shard hint, not identity.** Two ids that sanitize to one segment, or a case-insensitive filesystem, only put two records in one file.
- **The folder check is knowledge-only.** `readKnowledge` rejects a line under `members/<actor>/knowledge/` whose payload names another actor. Memory files have no such check.
- **A blob that does not hash to its row's `contentHash` is counted missing,** never applied.
- **GitHub ignores `merge=union`.** The merge queue spike (#1114) got a server-side conflict on lines union would keep, so the merge queue merges locally and fast-forwards base.
- **`/** */` comments** must not contain `*/`, for example a `members/*/memory` glob: it ends the comment and breaks the boundary type bundle.

## Where the code and the design differ

- Design §5 says a proven row that fails re-proof is dropped; the code stages it for ratify.
- Design §5 replays committed `project` memory as a proposal; memory has no replay yet.
- The design names the logbook author `maestro`; the code writes `members/orch/memory/logbook.jsonl`. The author stays `orch` by ruling.

## Testing

Atlas runs vitest, which `bun run test:ci` cannot reach (`TEST_PACKAGE_NOT_FOUND:atlas`). Its tests run in test.yml's atlas job (epic label or workflow dispatch). Files: `packages/adapter-io/test/knowledge-log.test.ts`, `migrate-layout.test.ts`, `memory-store.test.ts`, `native-memory-merge.test.ts` (a real `git merge` with the union attribute, plus a control without it), and `packages/cli/test/init-gitignore.test.ts`. Consumers outside the module (`maestro`, `app`) do run through `test:ci`.

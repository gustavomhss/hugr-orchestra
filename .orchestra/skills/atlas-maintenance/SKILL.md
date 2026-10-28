---
name: atlas-maintenance
description: How the committed `.atlas/` tree works (project and per-actor logs, union merge, knowledge logs, blobs, replay, provenance), which file owns each piece, the traps a change falls into, and how to test it
---

# Atlas maintenance

Design: `modules/atlas/docs/design/repo-layout.md` on branch `atlas-repo-layout` (not yet in `dev`): the tree is §2, merging §4, trust and replay §5, what never goes in git §6. Reference: `modules/atlas/docs/reference/atlas-memory.md`, "Where the logs live". Owners, invariants, rulings and declared limits: skill `atlas-ownership`. Commands: skill `atlas-usage`.

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

`<actor>` is the writer's identity passed through `segment()`; the code names it `seat`. Who that is depends on the door (skill `atlas-ownership`, Identity). Every path comes from `modules/atlas/packages/adapter-io/src/layout.ts`; never join `.atlas` by hand.

## How each piece works

| Piece | Owner file | How it works |
|---|---|---|
| Line format | `durable-log.ts` | Each line is a kernel `Event` whose `id` is `eventId` of the rest. A torn or edited line is counted in `rejected`, never folded |
| Multi-file fold | `durable-log.ts` (`readDurableLogs`, `jsonlFiles`) | Legacy file first, then tree files in sorted order, keyed by event id, so a line seen twice counts once |
| Memory, orientation, review | `memory-store.ts`, `orientation-store.ts`, `review-log.ts` | Append to the tree, read legacy plus tree. No folder check and no replay: a memory line is served as read |
| Knowledge log | `knowledge-log.ts` (`withKnowledgeLog`) | Wraps the store `compose.ts` builds; `wire.ts` takes it as `WireConfig.store`, so every CLI and MCP writer is logged. Each settled `commitProjection` appends one line per row it produced or changed and copies the row's CAS object to `blobs/` once. Staging is not logged |
| Replay | `knowledge-replay.ts` (`replayKnowledge`), called from `compose.ts` on every command and MCP start | Runs only when provenance is `trusted`. Applies a row whose fact has `seal:'proven'`, whose line's actor is in the line's scope under the local policy, and which re-proves now; stages every other row for ratify (`atlas promote`). Writes the raw store, so replayed rows are not logged again. Counts print to stderr when non-zero |
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Run at the repository root (it uses the working directory). Copies original bytes into the tree, keeps an unroutable line in the legacy file, deletes a moved legacy file, and exports every local projection row not yet logged under the scope's only actor, else `maestro` |
| Merge | `.gitattributes` and `modules/atlas/.gitattributes` | Each has `.atlas/**/*.jsonl merge=union` for the `.atlas/` beside it |
| Ignore | `.gitignore`, `modules/atlas/.gitignore`, `adapter-io/src/gitignore.ts` | All deny `.atlas/*` and re-admit `policy.json`, `project/`, `members/`, `blobs/`. Only the module file also re-admits the legacy single files. `gitignore.ts` is the block `atlas init` writes into a user's repo, and appends missing negations to an older rule; it has no nested `staging*.json` line |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after changing these sources |

## Provenance

`store-provenance.ts` answers one of three states, from whether `git ls-files` matches `isDurableStorePath` (`.atlas/cas/`, `.atlas/(projection|staging)(.N)?.json`):

- `trusted`: nothing tracked. Serve, write and replay.
- `tracked-staging`: a staging file is tracked. Refuse.
- `tracked-provable`: a store file is tracked. Serve only facts that re-prove; no writes, no replay.

`blobs/` is deliberately outside the match: a blob is reachable only through a log line, and every line goes through replay. Never loosen the tripwire to make the tree fit.

## Traps

- **Only re-proof is authenticated.** A line's actor, scope and seal come from the committed line; the folder check only compares the actor with its folder name, and anyone can create `members/<someone>/`. Replay is also the one writer that skips the doors' gates. Do not widen what replay applies without a real check.
- **Knowledge order is `(at, contentHash)`.** Per `nodeKey` the fold keeps the latest `at`, then the larger `contentHash`. `at` is wall-clock, so clock skew between machines picks the winner. Never order by `seq` or file position: both differ across branches after a union merge. Memory frecency does use file position, and `union` puts the merged-in side last.
- **Integers only.** Money is `costMicroUsd`. A float hashes differently across runtimes and splits one record into two.
- **A file name is a shard hint, not identity.** Two ids that sanitize to one segment, or a case-insensitive filesystem, only put two records in one file.
- **The folder check is knowledge-only.** Memory files have none.
- **A blob that does not hash to its row's `contentHash` is counted missing,** never applied, and is reported again on every boot.
- **Replay costs every boot.** A pending row that does not apply (staged, failed re-proof, missing blob) is re-read and a proven one is re-verified on each command.
- **Migration against old branches.** `migrate-layout` deletes the legacy files; a branch still appending to `.atlas/memory.jsonl` then hits a modify/delete conflict, which `union` does not resolve.
- **GitHub ignores `merge=union`.** The merge queue spike (#1114) got a server-side conflict on lines union would keep, so design §4 has the host merge locally and fast-forward base.
- **Orchestra memory owners are a closed list.** `modules/maestro/coordination/src/v2/atlas-source.ts` `Owner` is `backend|jimmy|archie|live`; a new seat with `atlasMemory` gets the tools but is refused until it is added there.
- **`/** */` comments** must not contain `*/`, for example a `members/*/memory` glob: it ends the comment and breaks the boundary type bundle.

## Where the code and the design differ

- Design §5 drops a proven row that fails re-proof; the code stages it for ratify.
- Design §5 replays committed `project` memory as a proposal and says replay runs the same gates as a live write; memory has no replay, and knowledge replay checks only seal, scope and re-proof.
- The design puts the logbook in `members/maestro/`; the code writes `members/orch/`, because the folder follows the author.
- Attempt, context and card files (design §3, §4) are not built.

## Testing

Atlas runs vitest, which `bun run test:ci` cannot reach (`TEST_PACKAGE_NOT_FOUND:atlas`). Its tests run in test.yml's atlas job (epic label or workflow dispatch). Files: `packages/adapter-io/test/knowledge-log.test.ts`, `migrate-layout.test.ts`, `memory-store.test.ts`, `native-memory-merge.test.ts` (a real `git merge` with the union attribute, plus a control without it), and `packages/cli/test/init-gitignore.test.ts`. Consumers outside the module (`maestro`, `app`) do run through `test:ci`.

---
name: atlas-maintenance
description: How the committed `.atlas/` tree works (project and per-actor logs, union merge, knowledge logs, blobs, replay, provenance), which file owns each piece, the traps a change falls into, and how to test it
---

# Atlas maintenance

Design: `modules/atlas/docs/design/repo-layout.md` on branch `origin/atlas-repo-layout` (not yet in `dev`; read it with `git show origin/atlas-repo-layout:modules/atlas/docs/design/repo-layout.md`): the tree is §2, merging §4, trust and replay §5, what never goes in git §6. Reference: `modules/atlas/docs/reference/atlas-memory.md`, "Where the logs live". Owners, invariants, rulings and declared limits: skill `atlas-ownership`. Commands: skill `atlas-usage`.

## The tree

```
.atlas/policy.json                                   admin-owned source, always tracked
.atlas/project/{orientation,review}.jsonl            shared, owned by nobody
.atlas/members/<actor>/memory/project.jsonl          one actor's project rules
.atlas/members/<actor>/memory/task/<taskId>.jsonl    one task's memory
.atlas/members/<actor>/memory/pr/<prId>.jsonl        one PR's memory
.atlas/members/<actor>/memory/logbook.jsonl          the logbook (only its author writes it)
.atlas/members/<actor>/knowledge/<nodeKey[0:2]>.jsonl applied knowledge outcomes
.atlas/blobs/<h[0:2]>/<h>                            CAS bytes a knowledge row names, and committed transcripts
.atlas/cards/<CARD>/card.jsonl                       one card's status moves, thread messages, decisions, links
.atlas/cards/<CARD>/attempts/a<n>.jsonl              one attempt's metering (bundle record commit)
.atlas/cas/, .atlas/projection*.json, staging*.json  local derived state, never tracked
```

`<actor>` is the writer's identity passed through `segment()`; the code names it `seat`. Who that is depends on the door (skill `atlas-ownership`, Identity). Every path comes from `modules/atlas/packages/adapter-io/src/layout.ts`; never join `.atlas` by hand.

## How each piece works

| Piece | Owner file | How it works |
|---|---|---|
| Line format | `durable-log.ts` | Each line is a kernel `Event`. Memory, review and knowledge lines are keyed by `eventId` of the whole event; orientation lines only by the payload hash (`orientation-store.ts`), so an edit to their `nodeKey`, `fresh` or `supersedes` is not caught. A line that fails its key is counted in `rejected`, never folded |
| Multi-file fold | `durable-log.ts` (`readDurableLogs`, `jsonlFiles`) | Legacy file first, then tree files in sorted order, keyed by event id, so a line seen twice counts once |
| Memory, orientation, review | `memory-store.ts`, `orientation-store.ts`, `review-log.ts` | Append to the tree, read legacy plus tree. No folder check and no replay: a memory line is served as read |
| Knowledge log | `knowledge-log.ts` (`withKnowledgeLog`) | Wraps the store `compose.ts` builds; `wire.ts` takes it as `WireConfig.store`, so every CLI and MCP writer is logged. Each settled `commitProjection` appends one line per row it produced or changed and copies the row's CAS object to `blobs/` once. `ATLAS_CARD` and `ATLAS_ATTEMPT` fill the line's `source`. Staging is not logged, so `mine` output never reaches a clone |
| Replay | `knowledge-replay.ts` (`replayKnowledge`), called from `compose.ts` on every command and MCP start | Runs only when provenance is `trusted`, silently skipped otherwise. Applies rows under the trust rule (skill `atlas-ownership`, Invariants) through the raw `commitProjection`, so replayed rows are not logged again; stages every other row, skipping one already staged with the same `contentHash`. A blob that is absent or does not hash to the row's `contentHash` counts as `missing`. Counts print to stderr only when one is non-zero or a folder is unreadable |
| Card and attempt logs | `card-log.ts` (`appendCardEvent`, `appendAttempt`, `readCard`, `readAttempt`, `attemptNumbers`) | Written by the host, never a seat. Lines are kernel `Event`s keyed by `eventId`; a line whose payload names another card, or another attempt number, counts as `rejected`. Card events read in `(at, contentHash)` order; an attempt read keeps its latest line. `redact` keeps a message's or decision's `textHash` and drops its text, and drops an attempt's `costMicroUsd`. Nothing calls these yet; the merge-queue host does |
| Attempt metering | `persist/src/metering.ts` (`meterAttempt`), type `AttemptMetering` | Adds seat, session, engine and integer `costMicroUsd` (`Math.round(costUsd * 1e6)`, omitted when not finite) to `Metering` |
| Committed transcripts | `transcript-blobs.ts` (`createRepoTranscriptStore`) | Scrubs and hashes through persist's `createTranscriptStore`, then writes the scrubbed bytes to `blobs/` only when `commit` is set. `fetch` re-hashes and throws on an absent or edited blob |
| Repo visibility | `repo-visibility.ts` (`repoVisibility`, `githubSlug`) | Reads `origin` with `runGit` and asks `api.github.com/repos/<slug>` (token from `GITHUB_TOKEN` or `GH_TOKEN`). `private:true` or a 404 answers private; anything else, including no remote, a non-GitHub host or a network error, answers public, so a doubt redacts instead of leaking |
| One-shot move | `migrate-layout.ts`, CLI `atlas migrate-layout` | Copies original bytes into the tree, keeps an unroutable line in the legacy file, deletes a moved legacy file, and exports every local projection row not yet logged. It picks the actor itself: the scope's only actor, else `maestro` |
| Merge | `.gitattributes` and `modules/atlas/.gitattributes` | Each has `.atlas/**/*.jsonl merge=union` for the `.atlas/` beside it |
| Ignore | `.gitignore`, `modules/atlas/.gitignore`, `adapter-io/src/gitignore.ts` | All deny `.atlas/*` and re-admit `policy.json`, `project/`, `members/`, `blobs/`, `cards/`. Only the module file also re-admits the legacy single files, so a legacy `.atlas/memory.jsonl` at the repository root is ignored. `gitignore.ts` is the block `atlas init` writes into a user's repo, and appends missing negations to an older rule; it has no nested `staging*.json` line |
| Bundled copies | `modules/atlas/boundary/src/generated/*` | Rebuild with `bun modules/atlas/boundary/script/build.ts` after changing these sources |

## Provenance

`store-provenance.ts` answers one of three states, from whether `git ls-files` matches `isDurableStorePath` (`.atlas/cas/`, `.atlas/(projection|staging)(.N)?.json`):

- `trusted`: nothing tracked. Serve, write and replay.
- `tracked-staging`: a staging file is tracked. Refuse.
- `tracked-provable`: a store file is tracked. Serve only facts that re-prove; no writes, no replay.

`blobs/` is deliberately outside the match: a blob is reachable only through a log line, and every line goes through replay. A failing `git ls-files` (no git, a tarball) answers `trusted`, so a store copied in outside git is not caught. Never loosen the tripwire to make the tree fit.

## Traps

- **The folder check is not authentication.** It only compares a knowledge line's actor with its folder name, and anyone can create `members/<someone>/`. Memory files have no folder check at all. Replay is also the one writer that skips the doors' gates. Do not widen what replay applies without a real check.
- **Knowledge order is `(at, contentHash)`.** Per `nodeKey` the fold keeps the latest `at`, then the larger `contentHash`. `at` is wall-clock, so clock skew between machines picks the winner. Never order by `seq` or file position: both differ across branches after a union merge. Memory frecency does use file position, and `union` puts the merged-in side last.
- **Integers only.** The canonical form (`packages/kernel/src/canonical.ts`) refuses floats; a float would hash differently across runtimes. Money, when attempt files exist, is integer `costMicroUsd` (design §3).
- **A file name is a shard hint, not identity.** Two ids that sanitize to one segment, or a case-insensitive filesystem, only put two records in one file.
- **Replay costs every boot.** A pending row that does not apply (staged, failed re-proof, missing blob) is re-read, a proven one re-verified and a missing one reported again on each command.
- **Migrated rows land under `maestro`** when their scope has several actors; `maestro` is usually not in that scope, so a clone stages them instead of applying.
- **Migration against old branches.** `migrate-layout` deletes the legacy files; a branch still appending to `.atlas/memory.jsonl` then hits a modify/delete conflict, which `union` does not resolve.
- **GitHub ignores `merge=union`.** The merge queue spike (#1114) got a server-side conflict on lines union would keep, so design §4 has the host merge locally and fast-forward base.
- **Orchestra memory owners are a closed list.** `modules/maestro/coordination/src/v2/atlas-source.ts` `owner()` accepts only `backend|jimmy|archie|live`; a new seat with `atlasMemory` gets the tools but is refused until it is added there. A seat granted `atlas_context` through a research profile, but without `atlasMemory`, is refused by `reader()` the same way.
- **Orchestra memory goes to the project directory** when the Location is a git repository, else the Location directory (`v2/tools/atlas-memory.ts`), so it can land outside the session's worktree.
- **No gitleaks, no Orchestra memory writes.** Without the toolkit's scanner or one on PATH, every write is refused `scanner-unavailable`.
- **`/** */` comments** must not contain `*/`, for example a `members/*/memory` glob: it ends the comment and breaks the boundary type bundle.

## Where the code and the design differ

- Design §5 drops a proven row that fails re-proof; the code stages it for ratify.
- Design §5 replays committed `project` memory as a proposal and says replay runs the same gates as a live write; memory has no replay, and knowledge replay checks only seal, scope and re-proof.
- The design puts the logbook in `members/maestro/`; the code writes `members/orch/`, because the folder follows the author.
- Card and attempt files (design §3) have writers and readers, but no host calls them yet. Context files are not built.
- A 404 from the GitHub API answers private: GitHub hides a private repository from a caller without access, so a public one never 404s.

## Testing

Atlas runs vitest, which `bun run test:ci` cannot reach (`TEST_PACKAGE_NOT_FOUND:atlas`). Its tests run in test.yml's atlas job (epic label or workflow dispatch). Files: `packages/adapter-io/test/knowledge-log.test.ts`, `migrate-layout.test.ts`, `memory-store.test.ts`, `card-log.test.ts` (cards, attempts, transcript blobs, visibility), `native-memory-merge.test.ts` (a real `git merge` with the union attribute, plus a control without it), and `packages/cli/test/init-gitignore.test.ts`. Consumers outside the module (`maestro`, `app`) do run through `test:ci`.

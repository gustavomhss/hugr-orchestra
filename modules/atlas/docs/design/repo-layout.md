# The `.atlas/` tree in git

Status: design, not built.

Owner rulings it implements (2026-10-28):

- Everything Atlas holds, Knowledge included, travels in git with the repo.
- What the Flight Engineer produces (meetings) is the user's own and never enters git.
- No single big JSON file. The tree is organized into many files under one clear hierarchy that links memory,
  knowledge, tasks, cost, the model that ran, the transcript needed to re-spawn it, and the context-continuity
  archive of each session.

It builds on what Atlas already designed rather than adding a second mechanism:

- [One folder per member](../atlas-folders.html) (piece B).
- [Versioning](../explanation/versioning.md): a content-hash event set, a fold, nothing dies, trailers and notes.
- The live logs (`memory.jsonl`, `review.jsonl`) with `merge=union`.
- The content-addressed store (`.atlas/cas`).

## 1. Principles

1. **One spine of ids.** Every record names the ids it belongs to: `seat`, `session`, `card`, `attempt`, `pr` and
   `commit`, as far as they are known when it is written. Any record reaches any related record by id, never by its
   position in a file.
2. **A folder is an owner, a file is a subject.**
   - A seat writes only its own folder (piece B's owner-write, shared-read rule).
   - A card's folder is written by the conveyor, the host that runs cards.
   - Inside a folder there is one file per subject: one per card, PR, session or code file.
3. **Every log is an append-only event set.** Each line is one JSON event keyed by its content hash
   (`kernel/src/types.ts` `Event`). Git merges the file with `merge=union`. The fold dedupes by hash and orders by
   `(seq, contentHash)`, so two branches that write the same file merge without a conflict.
4. **Large bytes live in the CAS** (`.atlas/cas/<h[0:2]>/<h>`, `store.ts`): fact bodies, model answers, transcripts,
   checkpoints and continuity chunks. A log carries the hash, never the bytes. A blob never changes, so it never
   conflicts.
5. **Derived state is never committed.** The projection, indexes and folds are rebuilt from the logs on every clone.
   A committed derived file is what causes merge conflicts and the provenance hole described in §5.
6. **Commits and PRs point back.** Atlas's own trailers (`WP`, `Model`, `Gates`, `Verdict`, `TranscriptSha`, in
   `persist/src/host-adapter.ts`), plus `Attempt`, make `git log` enough to find the record of any change.

## 2. The tree

```
.atlas/
├─ policy.json                         admin source (live today)
├─ project/
│  ├─ memory.jsonl                     project memory: rules injected into every seat
│  ├─ orientation.jsonl                milestones and state
│  ├─ review.jsonl                     holds, proposals, ratify decisions
│  └─ board.jsonl                      projects board: projects, columns, card order
├─ members/
│  └─ <seat>/                          one folder per seat id: maestro, backend, archie, lucy, jimmy, …
│     ├─ manifest.json                 class, kit, scope, caps, templates (piece B)
│     ├─ knowledge/
│     │  ├─ <repo path>.jsonl          facts this seat owns, anchored in that code file
│     │  └─ _project.jsonl             facts with no code anchor
│     ├─ memory/
│     │  ├─ task/<CARD>.jsonl          what this seat learned on that card
│     │  ├─ pr/<number>.jsonl          what this seat learned on that PR
│     │  └─ logbook.jsonl              maestro only: one entry per landed PR
│     └─ context/
│        └─ <session>.jsonl            context-continuity archive of one session
├─ cards/
│  └─ <CARD>/                          one folder per card key, e.g. ORC-142
│     ├─ card.jsonl                    the card's thread: status moves, messages, decisions, links
│     └─ attempts/
│        └─ a<n>.jsonl                 one run: seat, session, engine, model, tokens, cost, gates, verdict,
│                                      transcript, checkpoint
└─ cas/<h[0:2]>/<h>                    content-addressed bytes
```

The following are not committed: `projection*.json`, `staging*.json`, `index.scip` and any local index cache.

## 3. What each file holds

| File | Event payload (existing type it reuses) | Written by |
| --- | --- | --- |
| `project/memory.jsonl` | `MemoryRecord`, kind `project` (`memory/src/types.ts`) | the memory-emit door, after review |
| `project/orientation.jsonl` | `OrientEventPayload` (`orient.ts`) | the conveyor, at each milestone |
| `project/review.jsonl` | `ReviewRecord` (`review-log.ts`) | the review doors (live) |
| `project/board.jsonl` | board event: project, column, card order | the board service |
| `members/<seat>/knowledge/*.jsonl` | the `WriteRequest` row (`projection-types.ts`) plus `source` | that seat's governed doors |
| `members/<seat>/memory/task/<CARD>.jsonl` | `MemoryRecord`, kind `task` | that seat, through memory-emit |
| `members/<seat>/memory/pr/<n>.jsonl` | `MemoryRecord`, kind `pr` | that seat, through memory-emit |
| `members/maestro/memory/logbook.jsonl` | `LogbookEntry` (`memory/src/types.ts`) | maestro only (the orch-only gate in `memory-emit.ts`) |
| `members/<seat>/context/<session>.jsonl` | continuity `Reference` and mask events (`modules/continuity/src/v2/archive.ts`) | the continuity strategy, at each compaction |
| `cards/<CARD>/card.jsonl` | card event: `status`, `message`, `decision`, `link` | the conveyor, on behalf of the acting seat |
| `cards/<CARD>/attempts/a<n>.jsonl` | `Metering` (`persist/src/types.ts`) plus `seat`, `session`, `engine`, `costUsd`, `checkpoint` | the conveyor, when the run ends |

### Attempt

- **What it reuses:** `Metering` already carries `model`, tokens in, out and cache, `toolUses`, `wallTime`,
  `retries`, `reworks`, `gates`, `verdict` and `transcriptSha`.
- **What it adds:**
  - `seat`.
  - `session`: the Session that ran it, which links the attempt to its context archive.
  - `engine`.
  - `costUsd`, computed when the record is written from that day's model price, so a later price change never
    rewrites history.
  - `checkpoint`: the CAS hash of a `Checkpoint` (`seatBrief`, model outputs and tool I/O, from
    `persist/src/types.ts`).
- **Re-spawning a run:**
  1. Read `a<n>.jsonl`.
  2. Fetch `checkpoint` and `transcriptSha` from the CAS.
  3. Fetch the session's context archive.
  4. Hand them to `reinvoke.ts` `replay`.

### Knowledge

- **What it is:** the row a door already writes, plus `source: {card, attempt, commit?}`, so every fact names the
  run that produced it.
- **Where it goes:** the file is chosen by the row's `primaryAnchor`, which is its code path. Facts without one go to
  `_project.jsonl`.

### Context continuity

The continuity module already archives a session's context as it compacts. Today it writes:

- `<data>/continuity/<sha256(session)>/index.json`
- `memory.json` (the masks)
- one `<sha256(markdown)>.md` file per chunk

All of this lives in the user's data directory.

In the bundle it becomes:

- One `members/<seat>/context/<session>.jsonl` per session. Each archived `Reference` (`id`, `title`, `first`,
  `last`, `bytes`) and each mask is one event.
- Each chunk's markdown goes to the CAS. The event keeps both the continuity `id` (the sha256 of the markdown, which
  continuity already verifies on read) and the CAS hash.
- The first event of the file names the session's `seat`, `card` and `attempt`, so the archive hangs from the card it
  served.
- `context_recall` keeps working from either source. It reads the local archive first and the bundle on a fresh
  clone.

This is for every seat that runs continuity. Maestro is the first.

### Links

- A card's `card.jsonl` lists its attempts and PRs.
- An attempt names its card, seat, session, transcript and checkpoint.
- A context archive names its session, seat, card and attempt.
- A memory or knowledge event names its card and attempt.
- A commit names its card (`WP`), attempt and transcript.

From any one of these, the rest can be reached.

## 4. Merging

- One `.gitattributes` rule covers the whole tree: `.atlas/**/*.jsonl merge=union`.
- **Conflicts are rare by design:**
  - A seat writes only its own folder.
  - A card has its own folder.
  - An attempt and a session each get a new file.
- **When two branches append to the same file,** union keeps both lines and the fold dedupes by hash.
- **The designed `orchestra-atlas` driver** (`merge.ts`, set-union then re-fold) replaces union once it is wired. The
  layout does not change.
- **`cas/` blobs** are write-once and never conflict.
- **`manifest.json` and `policy.json`** are source files: people edit them and review them like code.

## 5. Trust: how committed Knowledge stays governed

`store-provenance.ts` refuses a store that arrived by commit, because a commit skips every door. This layout keeps
that rule and gives committed Knowledge a governed way in.

- **The projection is never committed.**
  - It is rebuilt by replaying the knowledge logs through the doors.
  - `projection*.json` stays untracked, so the tripwire keeps reading `trusted`.
  - `staging*.json` stays untracked and refused, as it is today.
- **Replay on arrival:**
  - A `seal:'proven'` fact is re-proven against the live index (`reverify-store.ts`). If it no longer holds, it is
    dropped and reported.
  - Any other fact keeps its tier only if it reached the protected branch through a merged PR. This is checked
    against the commit that added its line: PR review is the door.
  - A line that arrived by a direct push is replayed as a candidate and held for ratify.
- **`policy.json`'s `authz`** still decides who may write what. Replay runs the same gates a live write runs.

## 6. Never in git

- **Flight Engineer output** (meetings, live notes) belongs to the user. It lives in the app's user data directory,
  never under the repo. `.gitignore` keeps a deny line for it in case one is ever written there.
- **Derived state:** the projection, staging, indexes and folds.
- **Secrets:**
  - Transcripts, answers, checkpoints and continuity chunks are scrubbed before they reach the CAS (as
    `transcript-store.ts` `put` already does).
  - The repo's secret scanner runs on every PR, as it does for any file.
- **Public repositories:**
  - `members/*/memory`, `members/*/context`, `cards/*/attempts` and transcripts are redacted or left out, per
    merge-queue decision 7.
  - The default is redacted.

## 7. From today's files

| Today | Goes to |
| --- | --- |
| `.atlas/memory.jsonl` (all kinds in one file) | split by kind and owner into `project/memory.jsonl` and `members/<seat>/memory/**` |
| `.atlas/orientation.jsonl`, `.atlas/review.jsonl` | `project/`, format unchanged |
| `.atlas/projection*.json` and `cas/` | `members/<seat>/knowledge/**` logs plus `cas/`; the projection becomes a local cache |
| `<data>/continuity/<sha256(session)>/` | `members/<seat>/context/<session>.jsonl` plus `cas/`; the local copy stays as a cache |
| `.atlas/log.jsonl` (`merge.ts`, no writer) | dropped: the tree is the event set |
| `.gitignore`: deny `.atlas/*`, re-admit three logs | deny only the derived files and the Flight Engineer path |

A one-shot `atlas migrate-layout` command moves an existing repo. Events keep their hashes, so nothing is rewritten.

## 8. Build order

1. **Layout and union.**
   - Add the path helpers, the `.gitattributes` rule and the `.gitignore` change.
   - Move memory, orientation and review into the tree.
   - Ship `atlas migrate-layout`.
2. **Knowledge logs.**
   - Doors append knowledge events to `members/<seat>/knowledge/`.
   - The projection is rebuilt by replay under the trust rule in §5.
3. **Cards and attempts.**
   - The conveyor writes `card.jsonl` and `a<n>.jsonl`.
   - `Metering` gains `seat`, `session`, `engine`, `costUsd` and `checkpoint`.
   - The transcript store writes to the CAS on disk instead of memory.
4. **Context continuity.**
   - Continuity also writes each compaction to `members/<seat>/context/<session>.jsonl` and the CAS.
   - `context_recall` reads the bundle on a fresh clone.
5. **Trailers and PR record.** The host adapter writes Atlas's trailers plus `Attempt`, and the PR body, through its
   GitHub writer (merge-queue WP4).
6. **Re-spawn.** `atlas respawn <CARD> a<n>` replays a checkpoint and its context archive into a new run.

## 9. Open

- **Transcript and archive size.**
  - Large transcripts and continuity chunks in the CAS grow the repo.
  - If that becomes a problem, the fallback is a partial clone or LFS for `cas/` (`TranscriptRef.store`). The layout
    does not change.
- **Card keys.** The key format and where keys are minted come from the board (`docs/specs/projects-board`).

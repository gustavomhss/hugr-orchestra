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
- The content-addressed store (`store.ts`), written to a tracked blob folder that the provenance tripwire does not
  cover (§5).

## 1. Principles

1. **One spine of ids.** Every record names the ids it belongs to: `seat`, `session`, `card`, `attempt`, `pr` and
   `commit`, as far as they are known when it is written. Any record reaches any related record by id, never by its
   position in a file.
2. **A folder is an owner, a file is a subject.**
   - A seat writes only its own folder (piece B's owner-write, shared-read rule).
   - A card's folder is written by the host that runs cards, on behalf of the acting seat.
   - Inside a folder there is one file per subject: one per card, PR, session or knowledge shard.
3. **Every log is an append-only event set.** Each line is one JSON event keyed by its content hash
   (`kernel/src/types.ts` `Event`). Git merges the file with `merge=union`. The fold dedupes by hash. Events that
   must be ordered (review, memory ranking) are ordered by `(at, contentHash)`. `seq` is a local hint, never part of
   identity or merge order (`kernel/src/types.ts`).
4. **Large bytes live in blobs** (`.atlas/blobs/<h[0:2]>/<h>`): fact bodies, model answers, transcripts and
   continuity chunks. A log carries the hash, never the bytes. A blob never changes, so it never conflicts. Every
   blob is scrubbed before it is hashed, so the hash a log names is the hash of the bytes in git.
5. **Derived state is never committed.** The projection, the local CAS, indexes and folds are rebuilt from the logs
   on every clone.
6. **Commits and PRs point back.** Atlas's own trailers (`WP`, `Model`, `Gates`, `Verdict`, `TranscriptSha`, in
   `persist/src/host-adapter.ts`), plus `Attempt`, make `git log` enough to find the record of any change.
7. **Numbers are integers.** The kernel's canonical form refuses floats (`kernel/src/canonical.ts`), so money is
   integer micro-USD and time is integer milliseconds.

## 2. The tree

```
.atlas/
├─ policy.json                         admin source (live today)
├─ project/
│  ├─ orientation.jsonl                milestones and state
│  ├─ review.jsonl                     holds, proposals, ratify decisions
│  └─ board.jsonl                      projects board: projects, columns, card order
├─ members/
│  └─ <seat>/                          one folder per seat id: maestro, backend, archie, lucy, jimmy, …
│     ├─ manifest.json                 class, kit, scope, caps, templates (piece B)
│     ├─ knowledge/
│     │  └─ <nodeKey[0:2]>.jsonl       applied knowledge rows this seat owns, sharded by node key
│     ├─ memory/
│     │  ├─ project.jsonl              project memory this seat wrote (injected into every seat)
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
│                                      transcript
└─ blobs/<h[0:2]>/<h>                  content-addressed bytes
```

Not committed: `cas/`, `projection*.json`, `staging*.json`, `index.scip` and any local index cache.

## 3. What each file holds

| File | Event payload (existing type it reuses) | Written by |
| --- | --- | --- |
| `project/orientation.jsonl` | `OrientEventPayload` (`orient.ts`) | the host, at each milestone |
| `project/review.jsonl` | `ReviewRecord` (`review-log.ts`) | the review doors (live) |
| `project/board.jsonl` | board event: project, column, card order | the board service |
| `members/<seat>/knowledge/<xx>.jsonl` | the applied row (`nodeKey`, `contentHash`, `tier`, `scope`, `seal`, `witness`) plus `source` | that seat's governed doors, after a write settles |
| `members/<seat>/memory/project.jsonl` | `MemoryRecord`, kind `project` (`memory/src/types.ts`) | that seat, through memory-emit, after review |
| `members/<seat>/memory/task/<CARD>.jsonl` | `MemoryRecord`, kind `task` | that seat, through memory-emit |
| `members/<seat>/memory/pr/<n>.jsonl` | `MemoryRecord`, kind `pr` | that seat, through memory-emit |
| `members/maestro/memory/logbook.jsonl` | `LogbookEntry` (`memory/src/types.ts`) | the orchestrator only (author `"orch"`, the gate in `logbook.ts`) |
| `members/<seat>/context/<session>.jsonl` | continuity `Reference` events and mask add/remove events (`modules/continuity/src/v2/archive.ts`) | the continuity strategy |
| `cards/<CARD>/card.jsonl` | card event: `status`, `message`, `decision`, `link` | the host, on behalf of the acting seat |
| `cards/<CARD>/attempts/a<n>.jsonl` | `Metering` (`persist/src/types.ts`) plus `seat`, `session`, `engine`, `costMicroUsd` | the host, when the run ends |

### Attempt

- **What it reuses:** `Metering` already carries `model`, tokens in, out and cache, `toolUses`, `wallTime`,
  `retries`, `reworks`, `gates`, `verdict` and `transcriptSha`.
- **What it adds:**
  - `seat`.
  - `session`: the Session that ran it. One session can serve several cards, so the attempt names the session, and
    the session's context archive does not name a card.
  - `engine`.
  - `costMicroUsd`: the session's own reported cost (`total_cost_usd` from the engine result,
    `engine-adapters/claude-code/src/v2/host.ts`) times 10⁶, rounded. It is recorded once, so a later price change
    never rewrites history.
- **Re-spawning a run:**
  1. Read `a<n>.jsonl`; it names the card, seat and session.
  2. Rebuild the seat's memory from its folder with `respawnFromRecord`, and hand the closing fold of the card it
     resumes to the new run with `makeRespawn` (`memory/src/respawn.ts`, MEM-13).
  3. Fetch the session's context archive and transcript blob, so `context_recall` and the brief can quote the prior
     run.
  4. Start a new V2 Session for the same card and seat with that brief.

  Re-spawn starts a new run from the record. It does not replay the old run's model calls: `reinvoke.ts` `replay` is
  an audit check, and nothing produces a `Checkpoint` today.

### Knowledge

- **What it is:** the row a door settled, not the request that asked for it. Replaying requests would depend on
  order and on the state of the store at that moment; replaying settled rows only folds them.
- **Where it goes:** `members/<seat>/knowledge/<nodeKey[0:2]>.jsonl`, by the first two hex characters of the row's
  `nodeKey`. Paths are not used: `primaryAnchor` is optional, can contain `::`, and changes when a file is renamed.
- **The fold:** rows are folded by `nodeKey`, as the projection does today. Each row carries
  `source: {card, attempt, commit?}`, so every fact names the run that produced it.

### Context continuity

The continuity module already archives a session's context as it compacts. Today it writes:

- `<data>/continuity/<sha256(session)>/index.json`
- `memory.json` (the masks)
- one `<sha256(markdown)>.md` file per chunk

All of this lives in the user's data directory.

In the bundle it becomes:

- One `members/<seat>/context/<session>.jsonl` per session.
  - Each archived `Reference` (`id`, `title`, `first`, `last`, `bytes`) is one event.
  - Each mask change is one `mask-add` or `mask-remove` event, not a rewrite of the masks file. The current masks are
    the fold of those events.
- Each chunk's markdown is scrubbed when the chunk is made, before it is hashed. The continuity `id` (the sha256 of
  the markdown, which continuity already verifies on read) is therefore the id of the scrubbed bytes, and the blob
  holds those same bytes.
- The first event of the file names the session and its seat. Cards reach the archive through their attempts.
- Events are written when a chunk is archived and when a mask changes.
- `context_recall` keeps working from either source. It reads the local archive first and the bundle on a fresh
  clone.

This is for every seat that runs continuity. Maestro is the first.

### Links

- A card's `card.jsonl` lists its attempts and PRs.
- An attempt names its card, seat, session and transcript.
- A context archive names its session and seat.
- A memory or knowledge event names its card and attempt.
- A commit names its card (`WP`), attempt and transcript.

From any one of these, the rest can be reached.

## 4. Committing and merging

### Who commits what

Seats never commit. The host commits on their behalf:

- **On the card's branch,** as the card's work is pushed: the seat's knowledge and memory events written during the
  run, `card.jsonl` events, and their blobs.
- **In the bundle's record commit** (merge queue, `docs/specs/maestro-lead/merge-queue.md`, PR #1108): the attempt
  files of every card in the bundle, the context archive events of their sessions, the transcript blobs, and the
  board moves. These are written once a run has ended, so they cannot ride the card's own commits.

### Merging

- One `.gitattributes` rule covers the whole tree: `.atlas/**/*.jsonl merge=union`.
- **Conflicts are rare by design:**
  - A seat writes only its own folder.
  - A card has its own folder.
  - An attempt and a session each get a new file.
- **When two branches append to the same file,** union keeps both lines and the fold dedupes by hash.
- **GitHub's own merge runs no custom drivers and ignores `merge=union`.** The merge queue spike (#1114) proved it:
  the server merge stops with a conflict on lines that union would keep. So the host merges locally, where `union`
  and later the `orchestra-atlas` driver run, and fast-forwards the base branch to the tested commit. The merge
  queue lands every bundle this way.
- **The designed `orchestra-atlas` driver** (`merge.ts`, set-union then re-fold) replaces union once it is wired. The
  layout does not change.
- **Blobs** are write-once and never conflict.
- **`manifest.json` and `policy.json`** are source files: people edit them and review them like code.

## 5. Trust: how committed Knowledge stays governed

`store-provenance.ts` refuses a durable store that arrived by commit, because a commit skips every door. This layout
keeps that rule unchanged and gives committed Knowledge a governed way in.

- **The durable store is never committed.**
  - `cas/`, `projection*.json` and `staging*.json` stay untracked, so the tripwire keeps reading `trusted`.
  - Committed bytes live in `blobs/`, which `isDurableStorePath` does not match. That is deliberate: blobs are only
    reachable through a log line, and every log line is replayed through the doors below.
- **Replay on arrival.** The projection is rebuilt by replaying the knowledge logs:
  - A `seal:'proven'` row is re-proven against the live index (`reverify-store.ts`). If it holds, it keeps its tier.
    If not, it is dropped and reported.
  - Every other row is replayed as a candidate and held for ratify, whoever committed it and however it reached the
    branch. A committed line is a claim, not a decision.
- **Why not "merged PR means reviewed".** It cannot be checked offline, a squash merge loses the commit that added
  the line, anyone with push rights can forge it, and Atlas logs are collapsed in review as generated files. Signed
  commits with an allowed-signers list in `policy.json` could make it checkable later; until then a candidate is the
  honest tier.
- **`policy.json`'s `authz`** still decides who may write what. Replay runs the same gates a live write runs.
- **Memory and the review log** follow the same rule: a committed `project` memory line is replayed as a proposal,
  not injected, until ratified in `project/review.jsonl`.

## 6. Never in git

- **Flight Engineer output** (meetings, live notes) belongs to the user. It lives in the app's user data directory,
  never under the repo. `modules/atlas/.gitignore` keeps a deny line for it in case one is ever written there.
- **Derived state:** the local CAS, the projection, staging, indexes and folds.
- **Secrets:**
  - Transcripts, answers and continuity chunks are scrubbed before they are hashed (as `transcript-store.ts` `put`
    already does).
  - The repo's secret scanner runs on every PR, as it does for any file.
- **Public repositories travel redacted** (owner ruling 2026-10-28). A private repository carries everything above.
  A public one carries the structure and drops the bodies:
  - `members/*/memory`, `members/*/context` and `cards/*/attempts` keep their rows: ids, links, model, timings and
    content hashes. Free text (memory bodies, answers, notes) is left out of the row, and spend is left out
    everywhere.
  - Transcripts and continuity chunks stay in the local `blobs/` store and are never committed; the committed row
    names them by hash. Re-spawn from a public clone therefore needs the original machine's blobs.
  - Whether a repository is public is read from the remote host, not configured by the agent.

## 7. From today's files

| Today | Goes to |
| --- | --- |
| `.atlas/memory.jsonl` (all kinds in one file) | split by owner and kind into `members/<seat>/memory/**`; ownership comes from each record's owner field |
| `.atlas/orientation.jsonl`, `.atlas/review.jsonl` | `project/`, format unchanged |
| `.atlas/projection*.json` and `cas/` | one applied row per projection row, into `members/<seat>/knowledge/**`, with its body blob into `blobs/`; the projection and `cas/` stay as local caches |
| `<data>/continuity/<sha256(session)>/` | `members/<seat>/context/<session>.jsonl` plus `blobs/`; the local copy stays as a cache |
| `.atlas/log.jsonl` (`merge.ts`, no writer) | dropped: the tree is the event set |
| `modules/atlas/.gitignore`: deny `.atlas/*`, re-admit three logs | admit `project/`, `members/`, `cards/` and `blobs/`; keep denying `cas/`, `projection*`, `staging*` and the Flight Engineer path |

Notes for the one-shot `atlas migrate-layout` command:

- **Projection rows have no seat, card or attempt.** The seat is the owner of the row's `scope` in `policy.json`
  (`authz`); rows whose scope has no single owner go to `members/maestro/`. `source` is `{migrated: true}`.
- **Hashes change for snapshot facts.** Memory, orientation and review events keep their hashes. Projection rows
  become new applied-row events, so their event hashes are new; their `contentHash` (the fact body) is unchanged.
- **Paths are hard-coded today.** `adapter-io/src/memory-store.ts` builds `.atlas/memory.jsonl` directly; it and the
  orientation and review stores move to shared path helpers in build step 1.
- **Transcripts are stored as `{bytes: [...]}` in memory today.** On disk they are raw bytes in `blobs/`, not a JSON
  array of numbers.

## 8. Build order

1. **Layout and union.**
   - Add the path helpers, the `.gitattributes` rule and the `.gitignore` change.
   - Move memory (per seat), orientation and review into the tree.
   - Ship `atlas migrate-layout`.
2. **Knowledge logs.**
   - Doors append applied rows to `members/<seat>/knowledge/`.
   - The projection is rebuilt by replay under the trust rule in §5.
3. **Cards and attempts.**
   - The host writes `card.jsonl` on the card's branch and `a<n>.jsonl` in the bundle's record commit.
   - `Metering` gains `seat`, `session`, `engine` and `costMicroUsd`.
   - The transcript store writes raw bytes to `blobs/` instead of memory.
4. **Context continuity.**
   - Continuity scrubs chunks before hashing and writes `Reference` and mask events to
     `members/<seat>/context/<session>.jsonl`, with chunks in `blobs/`.
   - `context_recall` reads the bundle on a fresh clone.
5. **Trailers and PR record.** The host adapter writes Atlas's trailers plus `Attempt`, and the PR body, through its
   GitHub writer (merge queue, PR #1108).
6. **Re-spawn.** `atlas respawn <CARD> a<n>` builds the brief from `respawn.ts` and the context archive, and starts a
   new V2 Session (§3, Attempt).

## 9. Open

- **Transcript and archive size.**
  - Large transcripts and continuity chunks in `blobs/` grow the repo.
  - If that becomes a problem, the fallback is a partial clone or LFS for `blobs/` (`TranscriptRef.store`). The
    layout does not change.
- **Signed commits for trust.** Deferred by the owner (2026-10-28): not required now. Until then, a committed
  non-proven fact comes back as a candidate (§5).
- **Card keys.** The key format and where keys are minted come from the board (`docs/specs/projects-board`).

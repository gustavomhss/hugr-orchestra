# Projects board: contract

This is the frozen contract for slices B, B2, C and D (`PLAN.md`). The UI and the Maestro tools build against it in parallel,
so a change here is a change to both and goes through this file first.

## 1. Rules the contract enforces

1. **Only Maestro plans.** Maestro alone creates and edits projects, epics, issues and steps, and moves stages. It writes only
   through the board tools (section 4). Every one of those writes needs a non-empty `reason`.
2. **The human never edits the plan.** The owner answers, comments, attaches context to a card, undoes Maestro actions,
   pauses and resumes, accepts or declines intake, and sets hold before merge (section 5).
3. **Every change is logged.** Each write appends one `board_activity` row with actor, reason, `before` and `after`.
   Current-state tables are written in the same transaction. Nothing changes the board without a row.
4. **Undo is an inverse entry.** Undo applies the row's `before` and appends a new row that points at the one it undoes.
   It is refused when a later row changed the same fields ("changed since"), so undo never clobbers newer work.
5. **Status is backed by proof.** An issue in Review has a linked PR. An issue with a linked PR reaches Shipped only when
   that PR is merged. An issue without a PR reaches Shipped only with a reason (docs, decisions, chores).
6. **Hold before merge is the owner's.** While `hold_before_merge` is set, Maestro cannot move the issue to Shipped and must
   not merge its PR. Only the owner releases it.
7. **Pause stops new work.** A paused project or issue refuses Maestro writes except `board_question` and notes it reads.
8. **Secrets stay secret.** Secret values live only in `CredentialTable`. No board table, tool result, event, log line,
   GitHub issue or model context carries a value. Tools and the UI see the label only.

## 2. Names

- Code namespace `Board`, chapter id `board`, UI label "Projects". "Project" in the rest of the code stays the git repo
  (`ProjectTable`), so board types are always `Board.Project`, `Board.Epic`, `Board.Issue`, never bare `Project`.
- A board project has a short uppercase `key` (`LCH`). Issues are numbered per project and shown as `LCH-58`; epics as
  `LCH-E1`. Numbers are never reused, including after a cut.
- Seats are agent ids (`backend`, `frontend`, `review`), never display names.

## 3. Data model (core SQLite, drizzle, snake_case)

All tables carry `Timestamps`. Ids are core ids with a board prefix. Enums are text columns typed through schema literals.

### board_project

| Column | Type | Notes |
|---|---|---|
| `id` | text pk | |
| `key` | text unique | `LCH`; 2-6 uppercase letters |
| `name`, `goal` | text | |
| `target_date` | integer null | epoch ms, date only |
| `budget_usd` | real null | read by slice F |
| `repo_project_id` | text null | references `ProjectTable.id`; the repo the agents work in |
| `github_repo` | text null | `owner/name`; null means no mirror |
| `status` | `active` `paused` `shipped` `archived` | |
| `paused_reason` | text null | |
| `auto_accept_intake` | integer bool | default false (owner decision) |
| `github_state` | `off` `ok` `signed_out` `rate_limited` `error` | sync status shown as fact |
| `github_error` | text null | last error, plain words |
| `github_issues_etag`, `github_comments_etag` | text null | conditional polling |
| `github_since` | integer null | high-water mark for `since` |
| `github_synced_at` | integer null | |
| `next_issue_number`, `next_epic_number` | integer | allocation counters |

### board_epic

`id`, `project_id` (fk cascade), `number`, `title`, `goal`, `position` (real), `status` (`open` `shipped` `cut`),
`github_milestone` (integer null). Unique `(project_id, number)`.

### board_issue

| Column | Type | Notes |
|---|---|---|
| `id` | text pk | |
| `project_id` | fk cascade | |
| `epic_id` | fk null, set null | |
| `number` | integer | unique with `project_id` |
| `title`, `body` | text | body is Maestro's description, markdown |
| `type` | `feature` `bug` `chore` | |
| `stage` | `intake` `backlog` `ready` `building` `review` `queue` `shipped` `cut` | `intake` only for GitHub-born issues waiting for the owner; only the host moves a card into or out of `queue` |
| `position` | real | order inside the stage |
| `estimate` | `s` `m` `l` null | |
| `seat` | text null | agent id |
| `session_id` | text null | the session doing the work, for live status and cost |
| `branch` | text null | |
| `pr_number` | integer null | in the project's repo |
| `hold_before_merge` | integer bool | owner only |
| `paused` | integer bool | owner only |
| `stage_entered_at` | integer | for aging and forecast |
| `github_number`, `github_node_id` | null | mirror link |
| `github_dirty` | integer bool | mirrored fields changed since the last push |
| `record` | json null | the PR record's Maestro fields (merge-queue spec §4.5): `intent`, `decisions`, `not_covered`, `risk`, `follow_ups`; the host renders it into the PR body |
| `area` | json null | workspace packages the plan expects the card to affect, as `turbo` names them (merge-queue spec §4.4); null when the plan did not say. Enqueue compares it with the real affected set. |
| `order` | integer null | the plan's landing order among cards that share an area; null when the plan did not say |

Index `(project_id, stage, position)`.

### board_dependency

`issue_id`, `depends_on_id` (both fk cascade), primary key on the pair. Cross-project allowed (LCH-64 waits on GRD-14).
Cycles are refused.

### board_step

`id`, `issue_id` (fk cascade), `position`, `title`, `status` (`pending` `active` `done` `skipped`), `now` (text null:
the live line on a building card, for example "Writing tests"). At most one `active` step per issue. Steps are replaced
as a whole list by `board_steps`, so the log keeps the full list in `before` and `after`.

### board_question

| Column | Type | Notes |
|---|---|---|
| `id`, `project_id` | | |
| `issue_id`, `epic_id` | null | where it shows; neither means project level |
| `text` | text | |
| `options` | json | `[{ id, label, consequence }]`, 2-4 options |
| `recommended` | text | option id |
| `cost_of_waiting` | text null | "Blocks LCH-67; +1 day per day" |
| `blocking` | integer bool | true pauses the issue's progress (amber "paused on you") |
| `status` | `open` `answered` `withdrawn` | |
| `answer_option`, `answer_text` | null | free text allowed beside the option |
| `answered_at` | integer null | |

### board_note

`id`, `issue_id` (fk cascade), `author` (`owner` `maestro` `orchestra` `github:<login>` or a seat id), `kind` (null on a plain note), `body`, `github_comment_id` (null).
Notes are private to the board: they never go out to GitHub and never show to guests.
A note with a `kind` is a thread note: `brief`, `question`, `answer`, `return`, `review` or `rework`. The host writes them
from `task` calls that pass `card`, from their returns (`question` when the child ended blocked), from review requests and
verdicts, and from redispatches (`rework`, author `orchestra`). Authors of thread notes are `maestro`, `orchestra`, the
seat that did the work, or `lucy` for a verdict. Thread notes are read-only: only `owner` notes can be edited or deleted.

### board_attachment

`id`, `issue_id` (fk cascade), `kind` (`file` `image` `video` `doc` `secret`), `name`, `mime` (null), `size` (null),
`path` (null: copied under the app data dir), `credential_id` (null: references `CredentialTable.id` for `secret`).
Exactly one of `path` and `credential_id` is set.

### board_activity

| Column | Type | Notes |
|---|---|---|
| `id` | text pk, time-ordered | |
| `project_id` | fk cascade | |
| `issue_id` | null | |
| `actor` | `maestro` `owner` `github` | |
| `action` | text | `project.upsert`, `epic.upsert`, `issue.create`, `issue.update`, `issue.move`, `steps.set`, `question.ask`, `question.withdraw`, `question.answer`, `note.add`, `attachment.add`, `intake.accept`, `intake.decline`, `hold.set`, `pause.set`, `github.overwrite`, `github.state`, `undo` |
| `reason` | text null | required when actor is `maestro`; for `github.overwrite` it says what GitHub had |
| `before`, `after` | json null | only the changed fields |
| `undoes` | text null | activity id this row reverts |
| `undone_by` | text null | set on the reverted row |

Undoable actions: Maestro's `issue.update`, `issue.move`, `steps.set`, `epic.upsert`, `question.withdraw`, and every
`github.overwrite`. Owner actions are reversed by the owner doing the opposite (resume, release hold), not by undo.

Import from the record tree (`board/tree.ts`, `BoardTree.restore`): the record commit writes every activity row to
`.atlas/project/board.jsonl` through `BoardTree.event`, and the import replays it into an empty board, ordered by
`at` with the activity id breaking ties (ids are minted in order within a millisecond). Each action has exactly one
applier; an action without one fails with `BoardTree.UnknownActionError`, never a silent skip.

- Restored: `board_project`, `board_epic`, `board_issue`, `board_step`, `board_dependency`, `board_question`, `board_decision`,
  `board_note` (plain notes) and `board_activity` (including `undone_by`).
- Re-derived, left empty: `board_queue`, `board_bundle`, `board_bundle_member`, `board_attempt`, `board_check`, `board_ci_run`,
  `board_flake` and the GitHub sync state. Git, GitHub and `.atlas/cards/*/attempts` already hold them, so logging them
  would add weight without adding reconstruction. `github.overwrite`, `github.state` and `bundle.cut` replay as no-ops.
- Not logged on purpose: attachments (`board_attachment`; `attachment.add`/`remove` replay as no-ops), so their bytes and secrets never
  enter the log. Thread notes (non-null `kind`) live in `cards/<KEY>/` and are not imported into `board_note`.
- `question.answer`: an `after.outcome` updates the decision's outcome; otherwise it answers the question and inserts
  the decision `after.decision`, which supersedes the standing decision of that question.
- Prose (descriptions, bodies, reasons, answers and the like) travels in the event's `text`. A public tree keeps only
  `textHash`: prose comes back empty and the activity `reason` reads `[redacted <hash>]`.

As built in slice E1:

- `board_project.forecast_late_streak` (integer, default 0) counts consecutive evaluations whose P50 lands past
  `target_date`. Every committed board write evaluates once; time passing alone and GitHub mirror writes do not. Health
  is `at_risk` only at a streak of 2 or more.
- `board_project.status` `archived` is now reachable. Only a `shipped` or `paused` project archives; unarchive brings it back
  `paused`. An archived project refuses Maestro writes, questions and pause/resume; owner notes and attachments still work.
- New activity actions: `note.edit` and `note.delete` (before/after `{ id, body }`, owner notes only),
  `attachment.remove` (before `{ id, kind, name }`; a secret's `CredentialTable` row is deleted in the same transaction,
  and its value never appears), `archive.set` (before/after `{ status }`).
- The forecast is computed on read, never stored: daily shipped throughput (`stage_entered_at` of shipped issues, from
  the first ship day to today, zero days included) resampled in a seeded 1000-trial Monte Carlo, so the same board on
  the same day gives the same dates. The scope history replays `after.stage` from `board_activity`.

### board_check

The pass or fail ledger of the merge queue (`docs/specs/maestro-lead/merge-queue.md` §5). `board_ci_run` stays the
billing ledger.

`id` (`bck_`), `issue_id` (fk cascade), `attempt`, `kind` (`scoped` `workflow` `full`), `command` (the scoped command
or the workflow file), `tree_sha`, `commit_sha` (null), `outcome` (`pass` `fail` `pending` `error`), `url` (null),
`failing` (json string[]: test files or check names), `started_at`, `ended_at` (null). Indexed on
`(issue_id, tree_sha)`. Rows are keyed by tree; the card's `scoped-green` or `scoped-red` is derived on read and never
stored.

### board_queue, board_bundle, board_bundle_member

The merge queue (merge-queue spec §6). `board_queue` has one row per card in `queue`: `issue_id` (pk), `project_id`,
`head_sha` (the PR head the scoped checks passed on), `urgent`, `flush`, `queued_at`. `board_bundle` is one bundle PR:
`id` (`bbu_`), `project_id`, `n` (unique per project, shown as `LCH-B3`), `branch`, `pr_number`, `base_sha`, `head_sha`,
`tree_sha`, `status` (`open` `merged` `dissolved`), `merged_on` (the base tip it landed on when base moved, null
otherwise). `board_bundle_member` links a bundle to its cards with the `head_sha` each was merged at and its `position`.
A card's queue state (`waiting`, `running`, `conflict`, `held`) is derived on read. Activity actions: `queue.add`,
`queue.remove`, `bundle.cut`, `bundle.merge`, `bundle.dissolve`.

## 4. Maestro tools

Registered through `ApplicationTools` and granted only to the Maestro agent. Every write takes `reason` (non-empty) and
returns `{ activity, issue? }` with the activity id. Errors are plain sentences the model can act on ("LCH-58 has no PR;
link one before Review").

| Tool | Input | Does |
|---|---|---|
| `board_read` | `project` key, optional `issue` number, optional `since` activity id; without `project`, the list of projects (key, name, goal, status, GitHub repo) | Snapshot: project, epics, issues with steps, open questions, owner notes and answers since `since`, attachment names (secret labels only), holds, pauses, GitHub state; with `issue`, the issue page and its `pushState` (`local`, `pushed`, or null with no open attempt). The only way Maestro reads the board. |
| `board_project` | `key`, `name`, `goal`, `target_date`, `repo`, `github_repo`, `reason` | Create or update a project. |
| `board_epic` | `project`, optional `number`, `title`, `goal`, `position`, `status`, `reason` | Create or update an epic. |
| `board_issue` | `project`, optional `number`, `title`, `body`, `type`, `epic`, `estimate`, `seat`, `session`, `branch`, `pr`, `depends_on`, `attempts`, `crash_reason`, `guardrail_rule`, `area`, `order`, `reason` | Create (lands in Backlog) or update an issue, including linking branch, PR and session. `depends_on` replaces the list; `area` replaces the package list and `order` the landing order, and null clears either. |
| `board_move` | `project`, `number`, `stage`, optional `position`, `reason` | Move between stages. Enforces proof (rule 5), hold (6), pause (7). Moving out of `intake` is the owner's, not Maestro's. |
| `board_steps` | `project`, `number`, `steps: [{ title, status, now? }]`, `reason` | Replace the step list. |
| `ci_run` | `project`, `issue`, optional `package`, `files`, `run` | Runs `.orchestra/ci.json`'s scoped checks on the card worktree's current tree, once per tree, and returns the tree, its checks and the scoped state. `run: false` only reports. |
| `board_queue` | `project`, `number`, optional `urgent`, `flush`, `reason` | Puts a verified Review card in the merge queue. Refused without a PR, a complete record (Intent, Decisions, Not covered, Risk level), ready dependencies, or a scoped-green tree when the contract requires one. Returns the head, tree and scoped state it queued at. |
| `board_dequeue` | `project`, `number`, `reason` | Takes a card out of the queue back to Review and dissolves the open bundle it was in. |
| `board_bundle` | `project`, `bundle`, `verdict` (`merge` \| `retry` \| `release`), `card`, `reason` | Merges a flaky bundle as tested, retries a flaky or paused bundle's cards in a new bundle, or releases one held card of a dissolved bundle to ride a bundle alone. |
| `board_question` | `project`, `issue?`, `epic?`, `action: ask` with `text`, `options`, `recommended`, `cost_of_waiting`, `blocking`; or `action: withdraw` with `id`; plus `reason` | Ask the owner or withdraw a question. The only write allowed while the project is paused. |
| `board_settings` | `project`, optional `target_date` (epoch ms), `budget_usd`, `reason`; `null` clears a field | Set the target date and budget. At 100% of the budget no card moves to Building. |
| `board_decision` | `project`, `id` (the decision or the answered question), `outcome`, `reason` | Record what came of an answered decision; until then it reads "applied, no result yet". |

The host also moves cards on facts, never by Maestro's hand:

- `task` with `card: "KEY-N"` links the seat and Session on the card and moves it from Backlog or Ready to Building
  (`modules/maestro/coordination/src/v2/governance.ts` `claim`).
- A linked open PR moves Building to Review; a merged PR moves Building or Review to Shipped and clears `crash_reason`
  (`packages/core/src/board/github.ts` `follow`). Paused cards and holds stay put; a closed or reopened PR raises a
  question instead of a move. The move is logged with actor `github`.

Maestro's prompt says only what the tools cannot: keep the board current as work moves, ask through `board_question`
instead of chat when the answer changes the plan, and read `board_read` with `since` at the start of each turn.

## 5. HTTP API (protocol group `board`, served at `/api/board`)

Reads:

| Route | Returns |
|---|---|
| `GET /api/board` | Projects with counts per stage, open question count, health, GitHub state |
| `GET /api/board/:key` | Board snapshot: project, epics, issues (card fields, steps, open questions) |
| `GET /api/board/:key/issue/:number` | Issue page: everything on the card plus notes, attachments, activity, dependencies, git trail |
| `GET /api/board/:key/activity?since=` | Activity rows after `since`, newest last (replay, "since you looked") |

The git trail (branch, commits with hash, message and seat, PR state, review state, CI checks, merge commit) is read live
through `core/src/pull-request.ts` with a short cache and is never stored. CI checks are the PR's `statusCheckRollup`.
When `gh` is signed out the trail says so instead of showing stale data.

Owner writes (actor `owner`, `reason` optional):

| Route | Does |
|---|---|
| `POST /api/board/:key/question/:id/answer` | `{ option, text? }`. Unblocks the issue if the question was blocking |
| `POST /api/board/:key/issue/:number/note` | `{ body }` |
| `POST /api/board/:key/issue/:number/attachment` | JSON `{ kind, name, mime?, data?, value? }`: a file carries base64 `data`; a secret carries `value` and `name` is its label. The value goes straight to `CredentialTable` and is never echoed |
| `POST /api/board/:key/activity/:id/undo` | Rule 4 |
| `POST /api/board/:key/github/sync` | The retry: one pull, PR follow and push now, returns `{ state, error }` (the new `github_state`/`github_error`). Refused when the project has no `github_repo` |
| `POST /api/board/:key/pause` and `/resume` | Project level; `{ reason? }` |
| `POST /api/board/:key/issue/:number/pause` and `/resume` | Issue level |
| `POST /api/board/:key/issue/:number/hold` | `{ hold: boolean }` |
| `POST /api/board/:key/intake/:number/accept` and `/decline` | Accept moves to Backlog for Maestro to plan; decline marks `cut` and closes the GitHub issue as not planned |

Live updates: every committed write publishes one bus event `board.changed` `{ project, issue?, activity }` on
`/api/event`. The app refetches what it shows; the event carries no board content.

After the group lands, `bun run generate` in `packages/client`; the app calls `sdk().orchestra.board.*`.

As built in slice B:

- A write that changes nothing is refused, so every activity row records a real change.
- `GET /activity` without `since` returns the last 100 rows not written by Maestro.
- `github_state` starts as `off` until slice B2 turns the mirror on.
- Moving to Shipped forces a fresh git trail read instead of the cached one.
- Undo covers an allowlist of Maestro actions (section 3) and is the owner's only; no Maestro tool undoes.

As built in slice E1:

- `GET /api/board` hides archived projects unless `?archived=true`. Each summary gains `forecast` and `health` may be
  `at_risk`.
- `forecast` (project, also on `GET /api/board/:key`) is `{ shipped, remaining, targetDate, forecast }`, where
  `forecast` is one of `{ kind: "done" }`, `{ kind: "waits", on: "KEY-N" }` (every remaining issue is blocked),
  `{ kind: "insufficient", shipped, needed: 5 }` (fewer than 5 shipped issues), or
  `{ kind: "dates", p50, p85, vsTarget: { p50, p85 } | null }` (epoch ms at UTC midnight; `vsTarget` in days, positive
  is late).
- The snapshot also carries `epicForecasts: [{ epic, ref, shipped, remaining, forecast, setsDate }]` in position order
  (an epic's dates include the open epics before it; `setsDate` marks the one with the latest P85, the long pole) and
  `scope: [{ at, scope, shipped, reason }]` (a point each time the scope total or shipped count changes; `reason` is the
  activity's reason on scope steps).
- Owner writes: `PATCH` and `DELETE /api/board/:key/issue/:number/note/:id` (owner notes only; GitHub and Maestro
  notes are refused), `DELETE /api/board/:key/issue/:number/attachment/:id` (removes a secret's credential too),
  `POST /api/board/:key/archive` and `/unarchive`. Each returns `{ activity }` and publishes `board.changed`; a write
  that changes nothing is refused. Project delete is not built.


## 6. GitHub Issues mirror (slice B2)

Transport is the signed-in `gh` CLI through the existing pull-request plumbing. No webhooks, no OAuth app, no new token.

Out, board to GitHub, for issues whose project has `github_repo`:

- A write that changes a mirrored field (`title`, `body`, `steps`, `stage`, `type`, `epic`) sets `github_dirty`. A
  flusher pushes dirty issues in activity order.
- The issue body is the card body, then the steps as a task list, then a footer line with the key and a hidden marker
  `<!-- orchestra-board:LCH-58 -->`. It never contains notes, attachments, secrets, spend or questions.
- Labels `stage:<stage>` and `type:<type>`, created when missing. Epic is a milestone named after the epic.
- Shipped closes the issue as completed; Cut closes it as not planned; moving back reopens it.
- The board never posts comments in v1.

In, GitHub to board, polled every 60 seconds while the app runs, with `since` and ETags:

- A new issue without the marker becomes a `board_issue` in `intake` with actor `github`, waiting for the owner. With
  `auto_accept_intake` on, it goes to Backlog instead.
- A comment on a mirrored issue becomes a `board_note` with author `github:<login>`; Maestro sees it in `board_read`.
- A title or body edited on GitHub is overwritten by the next push. That push writes a `github.overwrite` row whose
  `before` is GitHub's text, so the owner can undo it and keep GitHub's version.
- An issue closed or reopened on GitHub is not applied. It raises a `board_question` to Maestro's queue and shows on the
  card; the next push restores the board's state unless the plan changes.

Failure is shown as fact: signed out, rate limited or erroring sets `github_state` and `github_error`, the board shows
"GitHub not synced" with a retry, and no write waits on GitHub.

## 7. Code layout

| Piece | Where |
|---|---|
| Schemas (ids, enums, rows, tool inputs, API payloads) | `packages/schema/src/board.ts` |
| Tables and migration | `packages/core/src/board/sql.ts`, following the core migration pattern |
| Service (reads, writes, rules 1-8, undo, events) | `packages/core/src/board/board.ts` |
| Maestro tools | `packages/core/src/board/tools.ts` |
| GitHub mirror | `packages/core/src/board/github.ts` |
| CI contract, `ci_run`, check ledger | `packages/core/src/board/ci.ts` |
| Protocol group | `packages/protocol/src/groups/board.ts`, added in `api.ts` |
| Handler | `packages/server/src/handlers/board.ts` |
| Chapter | `packages/app-shell/src/orchestra/chapters/board/`, nav entry `board`, behind the WIP mark until slice C |

## 8. Tests per slice

- B: service tests for each rule in section 1 (one test per rule, including undo refused after a later change and a secret
  value absent from every read), tool tests through the registry, handler round trip.
- B2: the mirror against recorded `gh` responses: body format, labels, intake, comment to note, overwrite then undo,
  signed-out state.
- C: app rendering of the canonical fixture (`MOCKS.md` data) and the `board.changed` refetch.
- D: each owner write through the API, undo from the UI, pause blocks a Maestro write.

As built in slice B2:

- The mirror starts at the first sync: issues already on GitHub then are not imported, only ones changed after. Closed
  issues, pull requests and issues carrying another board's marker are never imported.
- The epic milestone is titled `<KEY>-E<n>: <title>`; its number is kept in `board_epic.github_milestone`. A milestone
  rename is not synced.
- Overwrites are detected while pulling, for mirrored cards that are not already dirty. A GitHub edit to a card with a
  push pending is replaced without a `github.overwrite` row.
- Issues and comments share one `since` cursor (`github_since`); each list keeps its own ETag. A 304 is an empty page.
- A manual or polled sync is serialized per server. Failures are classified from `gh`'s exit code and stderr; token-like
  text is redacted from `github_error` and nothing is logged.
- Each sync follows the linked PR of every Building or Review card on an active project, between the pull and the push:
  an open PR moves Building to Review, a merged PR moves the card to Shipped and clears `crash_reason`. The move is a
  `github` actor row with the PR's fact as its reason. A paused card stays, a held card never ships, and an unreadable PR
  leaves its card alone without failing the sync.
- The poll runs only in the server layer; tests inject the `gh` runner (`Board.layerWith({ gh, poll: false })`).

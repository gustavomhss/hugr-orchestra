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
| `stage` | `intake` `backlog` `ready` `building` `review` `shipped` `cut` | `intake` only for GitHub-born issues waiting for the owner |
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

`id`, `issue_id` (fk cascade), `author` (`owner` `maestro` or `github:<login>`), `body`, `github_comment_id` (null).
Notes are private to the board: they never go out to GitHub and never show to guests.

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

## 4. Maestro tools

Registered through `ApplicationTools` and granted only to the Maestro agent. Every write takes `reason` (non-empty) and
returns `{ activity, issue? }` with the activity id. Errors are plain sentences the model can act on ("LCH-58 has no PR;
link one before Review").

| Tool | Input | Does |
|---|---|---|
| `board_read` | `project` key, optional `issue` number, optional `since` activity id; without `project`, the list of projects (key, name, goal, status, GitHub repo) | Snapshot: project, epics, issues with steps, open questions, owner notes and answers since `since`, attachment names (secret labels only), holds, pauses, GitHub state. The only way Maestro reads the board. |
| `board_project` | `key`, `name`, `goal`, `target_date`, `repo`, `github_repo`, `reason` | Create or update a project. |
| `board_epic` | `project`, optional `number`, `title`, `goal`, `position`, `status`, `reason` | Create or update an epic. |
| `board_issue` | `project`, optional `number`, `title`, `body`, `type`, `epic`, `estimate`, `seat`, `session`, `branch`, `pr`, `depends_on`, `reason` | Create (lands in Backlog) or update an issue, including linking branch, PR and session. |
| `board_move` | `project`, `number`, `stage`, optional `position`, `reason` | Move between stages. Enforces proof (rule 5), hold (6), pause (7). Moving out of `intake` is the owner's, not Maestro's. |
| `board_steps` | `project`, `number`, `steps: [{ title, status, now? }]`, `reason` | Replace the step list. |
| `board_question` | `project`, `issue?`, `epic?`, `action: ask` with `text`, `options`, `recommended`, `cost_of_waiting`, `blocking`; or `action: withdraw` with `id`; plus `reason` | Ask the owner or withdraw a question. |

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

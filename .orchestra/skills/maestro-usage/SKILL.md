---
name: maestro-usage
description: How Maestro (Orchestra's lead agent) works at runtime — what reaches it each turn, how it dispatches a seat with task (worktree, card, resume), how the Projects board moves on facts and by hand, which playbooks it loads, governed work, the arsenal, and what differs in Claude mode. Use to answer "how does Maestro do X" or "why did Maestro do Y" quickly and exactly, or to drive Maestro in the dev app.
---

# Maestro usage

Ownership and code paths: `maestro-ownership`. Changing it: `maestro-maintenance`. User guide: `docs/guides/maestro.md`.

## A turn

1. The model gets `maestro.txt` (sections: what the owner sees, permissions, what reaches you, tools, team, MCP Dock,
   long sessions, runtime, working with the owner, doing the work, units of work, governed, playbooks, evidence,
   writing, reporting), the System Context blocks (Maestro alone also gets `<board-drift>`), and the history.
2. Work that touches tracked work starts with `board_read` (with `since` for what changed). Without `project` it
   returns the project list, so Maestro picks a real key instead of guessing.
3. Maestro verifies, probes and lands in a card's worktree; building, planning and research go to a seat with `task`.
4. It reports in short prose to the owner; a question that changes the plan goes on the board (`board_question`),
   a question that blocks the run goes through `question`.

## Dispatch with `task`

| Field | Meaning |
|---|---|
| `subagent_type` | Seat id (`backend`, `archie`, `jimmy`, ...). Never Maestro, never `live`. |
| `description`, `prompt` | Short label and the brief. The brief shape is the seat's (see its charter in `seats/prompt/<id>.txt`). |
| `worktree: true` | New git worktree of the same repo under `<project>/.worktrees` for a writing seat. Not with `directory` or `task_id`. |
| `directory` | Run in an existing worktree root of the same git store (resume, or a second seat on one card). |
| `task_id` | Resume that child Session; pair it with its `directory`. |
| `model` | Override the seat's model. |
| `card` | `KEY-N`. The host sets the card's seat and Session and moves it from Backlog or Ready to Building ("Dispatched to <seat>"). |
| `governed`, `authorizationID`, `writePaths`, `workflow`, `memoryUnit`, `effort`, `allowedDomains`, `background` | Maestro's governance fields (`v2/governance/input.ts`); `effort` is `jimmy`'s research tier. |

The result is `task_id`, `directory` and the child's final text inside `<task_result>`. Every child is its own Session the
owner opens from the task row. Depth is capped at 8.

## Board flow

Stages: intake, backlog, ready, building, review, queue, shipped, cut. The board is Maestro-only.

| Move | Who |
|---|---|
| Intake to anything | owner only |
| Backlog or Ready to Building | host, on `task` with `card` |
| Building to Review | host, when a linked PR is open (needs the project's `github_repo`) |
| Review to Queue | Maestro with `board_queue`, only through it (`board_move` refuses `queue`) |
| Queue to Review | Maestro with `board_dequeue`, or the host when a card is ejected or its PR moves after assembly |
| Queue to Shipped | host, when the card's green bundle lands |
| Building or Review to Shipped | host, when the linked PR merges; clears `crash_reason` |
| to Ready, to Cut, Shipped without a PR | Maestro with `board_move` and a reason |
| archive | owner only |

Guards: Review needs a PR; Shipped with a PR needs a live merged check; a hold blocks Shipped; a paused or archived
project refuses writes except `board_question`; at 100% of `budget_usd` nothing moves to Building. A closed or reopened PR
raises a question instead of a move. Health: paused, else at_risk after two late forecasts in a row, else
waiting_on_owner, else on_track. The forecast needs 5 shipped cards.

Other writes: `board_project`, `board_epic`, `board_issue` (seat, session, branch, pr, depends_on, attempts,
crash_reason, guardrail_rule), `board_steps` (one active step, `now` is the live line), `board_settings`,
`board_decision` (what came of an answered decision).

## Merge queue

1. `ci_run` runs the card's scoped checks from `.orchestra/ci.json` (read from the base branch) on its worktree tree.
   A docs-only card needs no `package`: it records `none: no workspace package affected` as its scoped check.
2. Maestro writes the PR record with `board_issue` (intent, decisions, not covered, risk level), then `board_queue`
   (`urgent`, `flush`). It refuses without a PR, a complete record, ready dependencies, a clean merge with base and a
   `scoped-green` head.
3. The host cuts bundles, runs the full gate (`epic` here) and lands green ones; Maestro never merges.
4. Maestro decides only held bundles with `board_bundle`: `merge` (flaky, as tested), `retry` (flaky or paused),
   `release` (one held card of a dissolved bundle rides alone).

Details: `conveyor-usage`. User guide: `docs/guides/merge-queue.md`.

## Playbooks

Loaded with `skill`, visible to Maestro only: `frame-request`, `maestro-orchestra` (the capability map: which tool or seat
does what), `maestro-plan`, `maestro-repo` (+ `arsenal-operators`, `maintenance`, `maintenance/reviewer-brief`),
`maestro-run` (+ `governed`, `loop`, `verify`, `verify/review-checks`). Playbook names are reserved: a project or user
skill of the same name is dropped with a warning.

`maestro-orchestra` also holds the Orchestra guide: groups `start`, `agents`, `engines`, `tools`, `work`, `setup` and
`errors`, one leaf per topic. Maestro sees the leaf list every turn in `<orchestra-guide>` and loads a leaf by its full
name (`maestro-orchestra-tools-dock`) to answer a question about Orchestra; for how the code behaves now it dispatches
the research seat.

## Governed work

For a published workflow: `maestro_workflows`, then the `maestro_*` record tools in the order `maestro-run-governed` gives
(admission, context, plan revision, approval, authorization, review, validation, result decision). Dispatch with
`governed: true` and the granted `authorizationID`. Review is recorded by `lucy` with `maestro_record_review`.

## Arsenal

`maestro_arsenal_catalog` lists operations, `_describe` returns one's input, `_execute` runs it and refuses without a prior
describe. `archie` holds the same tools limited to 13 operations (no decompose, stub-gen, move-in, repo-mapper,
plan-to-barrel).

## Claude mode

Same Maestro, same prompt, same tools and screens. Claude Code runs the turn with its `claude_code` preset; Orchestra
appends a short note. Orchestra tools arrive as `mcp__orchestra__<name>` from an in-process MCP server; Claude Code
built-ins (Bash, Read, Edit, ...) show with Orchestra's widgets. `Agent` and `Task` are refused: delegation is
`mcp__orchestra__task`. `ToolSearch` is allowed and its row is hidden. Details: `claude-mode-maintenance`.

## Driving it in the dev app

Use `orchestra-dev-isolated` (CDP 9333, own profile, no keys until the owner connects a provider). Check a board answer
against the board screen, not Maestro's reply.

---
name: maestro-orchestra-work-board
description: How the Projects board works for Maestro: stages, the `board_*` tools, what blocks a move, who may do what, and how cards link to Sessions.
internal: true
when: The owner asks why a card is in a stage, why a move was refused, what the board tools do, or how dispatching ties to cards.
not-when: The question is about the merge queue internals (use the merge-queue leaf) or about a workflow run.
covers: []
---

# The Projects board

The board tracks projects, epics and cards (issues). Card ids look like `KEY-N` (two to six capitals, then a number). Only Maestro calls the `board_*` tools; any other seat gets "The board tools belong to Maestro; ask Maestro to change the board."

## Vocabulary

| Thing | Values |
|---|---|
| Stage | intake, backlog, ready, building, review, queue, shipped, cut |
| Project status | active, paused, shipped, archived |
| Epic status | open, shipped, cut |
| Card type | feature, bug, chore |
| Step status | pending, active, done, skipped |
| Estimate | s, m, l |

## Tools

| Tool | Does |
|---|---|
| `board_read` | No `project`: lists projects (key, name, goal, status, repo). With `since`: a cursor and what the owner did. With `issue`: that card's page with its git trail. |
| `board_project` | Creates a project by name, or updates one by key. `repo` is the directory. |
| `board_epic` | Creates an epic (needs a title) or updates one by number. |
| `board_issue` | Creates a card in Backlog; updates link branch, PR, session, seat, attempts, crash reason and guardrail rule. `depends_on` replaces the list. `area` and `order` come from the plan of `archie`; null clears. |
| `board_move` | Moves a card between stages. A reason is required. |
| `board_steps` | Card checklist. At most one step is active; `now` is the live line. |
| `board_question` | Asks the owner 2 to 4 options plus a recommended one. Withdraw by id. Works while paused. |
| `board_settings` | `target_date` (epoch ms) and `budget_usd`; null clears. |
| `board_decision` | Records the outcome of an owner decision. Until then it reads "applied, no result yet". |
| `ci_run`, `board_queue`, `board_dequeue`, `board_bundle` | Queue and CI controls (see the merge-queue leaf). |

## What blocks a move

- Into intake: refused. Intake holds only cards born from GitHub.
- Into queue: refused. Only the host moves a card into Queue; verify the card and call `board_queue`.
- Out of intake: the owner accepts (to Backlog) or declines (to Cut) first.
- Out of queue: call `board_dequeue` first.
- To review: needs a linked PR.
- To shipped with a PR: needs a live proof that the PR is merged. It refuses when no repo is linked, GitHub is signed out, the PR cannot be read, the PR is not merged, or the owner set hold-before-merge. Shipped without a PR is allowed with a reason.
- To building: refused when the budget is spent ("no new work starts... Work in progress continues. Ask the owner to raise the budget."). Cards already building keep going.
- A paused project or paused card: only `board_question` works until the owner resumes it.
- Archive: only shipped or paused projects; unarchiving returns the project to paused.

## Who does what

The owner can pause, set hold-before-merge, archive, undo, write notes and attachments, answer questions, accept or decline intake and change settings. Every write logs an activity row with its actor and reason.

The host follows GitHub for active projects. For a card with a PR, an open PR moves building to review; a merged PR moves building or review to shipped and clears the crash reason. It skips paused cards, and skips shipped when the owner hold is on. These rows show the actor "github".

## Dispatch ties to cards

A fresh `task` dispatch of a staffed seat that writes code passes `card`. The card must exist ("<card> is not on the board.") and must not be shipped or cut ("open a new card for new work"). The dispatch sets the card's seat and session, and moves Backlog or Ready to Building ("Dispatched to <seat>.").

## Conductor limits

Maestro reads the project's board in the same turn before it changes the board or dispatches to a card. After 10 reads without sending work out it hands the investigation to the research seat. Its own edits stay under 20 lines and 2 files in a turn. It never merges PRs itself.

---
name: maestro-lead-dispatch
description: Check a brief and dispatch it to a seat with the packet below. Use before every task call; refuse to dispatch a packet that leaves a decision open.
---

# Dispatch

A seat executes. It never chooses. `archie` writes briefs; Maestro checks every brief before the `task` call and adds
what only it knows: the card, the budget and what is in flight.

## Packet

The packet is the `prompt` of `task` for an execution seat (not for `archie` or `jimmy`), inside the brief shape that `task` lists for that seat.
The write set is the `writePaths` input; the `Write only` line repeats it.

```
Goal: <one line: the owner's outcome>
Card: <KEY-N>
Write only: <same paths as writePaths>
Read first: <at most 5 paths>
Setup: <the project's install command, when a new worktree needs it>
Decided: <choices already made, each with its reason>
Done when: <checks Maestro can run itself: a command and its expected output, test files, a diff property;
           and the line whose removal must make the test fail>
Budget: <turns or time; when it runs out, return what you have>   (Maestro fills it; advisory, nothing enforces it)
Not yours: <neighbouring work and who owns it>
If impossible: say so with the reason. Never weaken, skip or delete a check to pass it.
```

For `jimmy`, send the question and the scope, and set `effort` (the input, or the first prompt line in Claude mode).
Pick the lowest effort that answers: `quick` for one fact, `focused` when alternatives matter, `deep` only across a
subsystem.

## The card

When the request has a board project, find or create its card with `board_issue` and pass its key as the `card`
input of `task`. The host then links the seat and the child Session on the card and moves it from Backlog or Ready to
Building; a card that is not on the board refuses the task. Without a project, track the work in the conversation and
report it the same way.

Maestro's own worktree is Maestro's alone: only its inline work edits it. A seat that writes starts in a new
worktree: call `task` with `worktree: true` and a `description` that starts with the card key. The host makes the
worktree from Maestro's current commit, under Maestro's root, and lists it in the app; the result names its
`directory`. Pass that `directory` with `task_id` on every resume, and to any later seat on the same card.
`writePaths` are relative to that worktree. Read-only seats (`jimmy`, `lucy`, `explore`) get the card's worktree when
they read its change, else none.

Write `Worktree: <directory>; Stall: 0` in the building step's `now` (not mirrored to GitHub). A redispatch reuses
the same worktree and sets `attempts` to one more.
Call `task` with `background: true`. `archie` runs in the foreground: the host refuses a background `archie` task.

## Checks before the call

Send the packet back to `archie` when:

1. A choice is left open ("pick the best approach", "decide whether").
2. **Done when** depends on the seat's own word ("the seat confirms it works").
3. `writePaths` is empty for a write.
4. **If impossible** is missing.
5. A test change does not name its probe line in **Done when**.

A packet the owner wrote keeps its boundaries. If the owner asked to hand it on as it is, pass it unchanged and
read-only; the seat returns the missing-input blocker. Never fill its gaps.

## Fill the fleet

Before the call, find every other ready card of this request: its `depends_on` cards have merged. Each writing card
has its own worktree, so ready cards run side by side, up to what the host can run and Maestro can review. Two
ready cards that write the same file are not independent: send them back to `archie` to order them. When nothing can
run in parallel, say why in one line in the next report.

## Golden

```
Goal: invoices overdue by 30 days get one reminder email, never two.
Card: BILL-41
Write only: src/reminders/schedule.ts, test/reminders/schedule.test.ts
Read first: src/reminders/send.ts (the sender and its idempotency key)
Decided: reuse the sender's idempotency key; no new table (reversible).
Done when: <project test command> test/reminders/schedule.test.ts passes; a second run on the same day sends nothing;
  removing the key check in schedule.ts makes the second-run case fail.
Budget: 40 turns.
Not yours: the email templates (frontend seat).
If impossible: say so with the reason. Never weaken, skip or delete a check to pass it.
```

## Counter-example

"Add overdue reminders, pick the best approach and tell me when it's done." The seat must decide the approach, the
check is its own word, and nothing bounds the write set or the budget.

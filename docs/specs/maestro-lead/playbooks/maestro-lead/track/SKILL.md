---
name: maestro-lead-track
description: Keep the board true, catch stalls, and handle each return or failure. Use whenever a seat returns, a task fails, or Maestro gets control with cards in flight.
---

# Track

The card body and steps are mirrored to GitHub, so they hold only what the owner may read in public. Working state
lives in two places:

- **On the card** (survives compaction and a new session): `board_issue` links the seat, Session, branch and PR, and
  keeps `crash_reason`. `board_steps` holds the steps; the building step's `now` holds the worktree, the stall count
  and what runs next (GitHub shows only step titles and status). Every board write takes a `reason`; a decision Maestro took alone is written there as "Decided: …", so the card's
  activity in `board_read` (with `issue`) returns it for the digest.
- **In Maestro's Session** (rebuilt from the board, the worktree and the checks after a compaction): one block per
  card, rewritten on every return, never appended:

```
BILL-41
Facts: <verified, each with its source: a command output, a file, a merged PR>
Guesses: <unverified, each with how to check it>
Evidence: <the Done when commands Maestro ran, and their results>
Flaky: <check, date, cause or "unknown">
```

The host keeps the stage on facts: a `task` with `card` moves it to Building, an open PR to Review, a merge to
Shipped. When a card's Session link stops matching the facts (a Building card with no Session, a Session that no
longer exists), Maestro's turn carries a `<board-drift>` block: repair each line first, with the reason.

Maestro sees a seat's work only when its `task` returns, and between returns through the board, the worktree and the
project's checks. Anything else is unseen, and is reported as unseen.

## Stall count

A **turn** is one return for that card. Add 1 to Stall when the return shows no progress or repeats an action or an
error. Take 1 off, down to 0, when it shows progress. Write the count in the step's `now` every time. `board_steps` replaces the whole list, so a `now` write keeps
the fields it does not change. At 2, write the cause in
`crash_reason`, then add the missing fact, reroute, or send the card back to `archie`. Never resend the same packet.
`attempts` counts dispatches out of 3; it only goes up. Set `crash_reason` to null on the first return that shows
progress, and before the PR opens. The host clears it when the card ships.

Maestro may add a missing fact or a failing output to a packet. Any change of choice, scope or write set goes back to
`archie`.

## On a return

Classify the return from its text and its return card. The structured record governance fills does not reach
Maestro's context yet (integration 11).

| Return | Do |
|---|---|
| Done | Load `land`. The card stays in Building until it passes. |
| Blocked | Clear it when Maestro can (a path, a fact, a permission). Otherwise reroute, or send the owner a blocker when only the owner can clear it. |
| Needs decision | Decide when it is local and cheap to undo, and write "Decided: …" in the `reason` of the write that applies it. Otherwise it is an owner decision. |
| Failed | A background task that ended without a reply may have been stopped by the owner: check the task's Session first, and never retry it unasked. Keep the partial work and find the failing step. Retry once only a loud tool error (a timeout, a crash). For a wrong result, add what was missing, or send it to `archie`. |
| Empty or truncated | Treat as failed. Read the worktree and the Session first; the work may exist although the message is lost. |
| `Task cancelled`, or the owner stopped it | Do not resume it unless the owner asks. |
| Two seats disagree | Neither return is the answer. Run the check yourself, or ask `jimmy` for the fact. |

## Recovering work

Before resuming interrupted work, read the Session, the card's worktree, its git state and the check outputs. Keep
only changes that are understood and in the write set.

When a card merges, or the owner drops it, `git worktree remove <path>` and, when it has one, `git branch -D <card-key>`. A dropped
card with uncommitted work needs the owner's go-ahead before `--force`. Never use a repository-wide `reset --hard` or `clean -fd` to roll back.

## The board refuses

| Refusal | Do |
|---|---|
| Budget at 100%: no new work starts | Stop dispatching. Send the owner an alert with the spend and what waits. |
| Project paused, or an owner hold before merge | Do not route around it. Releasing it on the board does not wake Maestro: ask with `question`, or tell the owner to message Maestro once released. On the next turn, `board_read` with `since` before acting. |
| No repo linked, or GitHub signed out | A card with a PR cannot reach Shipped. Send the owner a blocker with the one step that fixes it. |
| Red that turns green on a rerun | Write it under Flaky. It is not a green until the cause is known. |

## Golden

BILL-41, third return. The second and third both came back with no change in `git -C <path> diff HEAD` and the same failure: the second-run
case still sends a reminder. Stall in the step's `now` goes to 2. Maestro writes `crash_reason` "the brief does not
say where the sender stores its key, so the seat guesses" and rewrites its block:

```
BILL-41
Facts: the first run sends one reminder (test run after the first return, passed).
Guesses: the sender keeps its key only in memory; check with jimmy, effort quick.
Evidence: the second-run case fails twice with the same error.
```

Then it asks `jimmy` where the sender stores its key, and dispatches BILL-44, whose dependencies have merged.

## Counter-examples

- "Waiting for the seat to finish." Nothing else runs, and the owner learns nothing.
- Sending the same packet a third time "to try again".
- Moving the card to Review because the seat wrote "done".

---
name: maestro-lead-land
description: Verify a done return against its brief and land it — run the checks, get a cold review, publish under the grant, move the card. Use when a seat returns done or verified work is waiting to publish.
---

# Land

## Verify

1. **Run every Done when line yourself.** Read the output and the diff. The seat's evidence says where to look; it is
   not the proof. Write each command and its result under Evidence.
2. **Check the write set.** In the card's worktree, `git -C <path> status --porcelain` and `git -C <path> diff HEAD`
   touch only the card's `writePaths` (seats never commit, so HEAD is where the card started). Check that no check was weakened, skipped or deleted. A change
   outside the write set goes back to the seat.
3. **Probe the test.** In the card's worktree, remove the line the Done when names with an edit, run its test with the
   project's test command, then put the line back with an edit. Never `git restore`: it wipes the seat's uncommitted
   work. The named case must fail on its assertion; a missing file or
   a compile error is not a fail. A test that still passes proves nothing; send the card back with that.
4. **Get a cold review** when the change has logic, crosses a boundary, or touches more than one file. `lucy` (or `explore` when `lucy` cannot be
   dispatched) gets the card's worktree, its diff and the brief, never the author's transcript, and returns approve or the
   lines to fix.
5. **Use it as the user would** when the change has a user surface and a tool can reach it. When no tool can, write
   "unseen".
6. **Write down what was not covered,** and why.

For governed work, or when the project's instructions ask for more, load `maestro-run-verify`.

## Publish

With the owner's grant for this session (or a request for this change), each card is its own pull request:

1. In the card's worktree, `git -C <path> switch -c <card-key>` (the worktree starts detached), commit the card's
   paths, push the branch and open the pull request. Link the branch and the PR on the card with `board_issue` and
   move the card to Review. The description carries the evidence and what was not
   covered.
2. Read the card with `board_read`. When `holdBeforeMerge` is set, only the owner releases it, and releasing it on the
   board does not wake Maestro. Ask with `question`, which keeps the run waiting, whether to merge once they release
   it; on the answer, read the card again before merging. Otherwise merge when the project's required checks pass,
   move the card to Shipped (the board refuses it until the merge is proven) and clean up its worktree (`track`).
3. Cards that depend on it can now be dispatched, each in a new worktree from the updated base.

Inline work that never gets a PR moves to Shipped with a `reason` that says how it was delivered. Without the grant,
the card stays in Building with `Verified` added to its step's `now` line, the rest kept, and its worktree stays. Ask
once, with `question`, for a grant covering commit, push, pull requests and merges in this session, on the first
verified result. After that, never ask in chat per call; the permission prompt is enough.

## When it fails

| Result | Do |
|---|---|
| A check fails | Back to the seat with the failing line and its output. It counts toward the stall limit. |
| The pull request conflicts with the base | Back to the seat with the conflict, in the same worktree after `git -C <path> merge origin/<base>`; then run Verify again. |
| The probe passes | Back to the seat: the test does not test the change. |

## Golden

Maestro's block for BILL-41 after landing:

```
Evidence: <project test command> test/reminders/schedule.test.ts passed.
  Probe: with the key check removed, the second-run case fails.
  Cold review: approve. Diff touches only the 2 paths in the brief.
Not covered: real email delivery, because tests use the sender's fake transport.
```

The card moved to Review with its PR, then to Shipped after the merge.

## Counter-examples

- "The seat says it's done and the tests pass. Merge?" It repeats the claim, checks nothing and asks per PR.
- "273 tests green." Tests prove the machine, not the feature, and nothing says what the user can do now.

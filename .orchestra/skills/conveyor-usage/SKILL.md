---
name: conveyor-usage
description: How the merge queue (conveyor) runs day to day — the CI contract, scoped checks with ci_run, queuing a card, how bundles are cut, land and go red, what Maestro decides with board_bundle, and how to read a stuck queue. Use to answer "why is this card still queued", "why did the bundle go red", "how do I land through the queue", or to drive the queue in the dev app.
---

# Conveyor usage

Ownership and code: `conveyor-ownership`. Changing it: `conveyor-maintenance`. User guide: `docs/guides/merge-queue.md`.
Design: `docs/specs/maestro-lead/merge-queue.md`.

## A card's way to the base branch

1. Dispatch with `task` and `card` opens attempt 1. Every 10 minutes the host pushes the worktree to
   `refs/orchestra/wip/<KEY>-<n>/a<attempt>` after a gitleaks scan; a hit keeps the card `local`.
2. Maestro runs `ci_run` on the card. Results are keyed by tree: a commit that keeps the files keeps the green.
   When `scoped.tests` takes `{package}`, Maestro passes the package from the Done when. A card that changes no
   workspace package, such as a docs-only card, omits it: turbo's affected set (without the root `//`) is empty and
   no file matches `lanes.global`, so `ci_run` records a passing scoped check with the command
   `none: no workspace package affected` and a note, and runs no tests. That row is the scoped green, visible in the
   checks; required workflows such as `typecheck.yml` still gate. Without `package`, a card that changes packages is
   refused with their names, and so is one turbo cannot read.
3. The card's PR opens and the host moves it to Review. A base advance that touches its files writes a conflict note;
   the seat merges base on its next dispatch.
4. Maestro writes the PR record with `board_issue` (Intent, Decisions, Not covered, Risk level) and calls
   `board_queue`. `urgent` goes to the front, `flush` cuts now.
   At enqueue the host compares the card's affected packages with its planned `area` and writes one drift note when
   they differ; the card still queues.
5. Every 60 s the host settles the open bundles, then cuts: at `bundle.size`, on `flush`, after
   `bundle.waitMinutes`, or when an epic's last card is queued. Without `lanes` there is one open bundle per project;
   with `lanes` each lane (cards whose affected packages overlap) gets its own bundle, up to
   ⌊`budget.jobs` / `lanes.jobs`⌋ in flight, and a card touching a `lanes.global` path rides alone.
6. A whole-suite bundle PR `chore(queue): bundle KEY-B<n>` carries `full.label`, so the full gate runs once for all
   members; an epic's last bundle always runs the whole suite. A lane bundle instead dispatches `lanes.workflows` with
   a `packages` input and lands with `merge-if-disjoint`. With `lanes.fullEvery` above 0, a safety run of the whole
   suite follows every K lane landings; its red is a base red that pauses only the lanes it touches.
7. Green: the host checks that no member's PR head moved, pushes to base with `--force-with-lease`, writes the
   `chore(queue): record` commit and moves the members to Shipped.

## This repository's contract

`.orchestra/ci.json` on `dev`: scoped tests through `bun run test:ci {package} {files}` plus `typecheck.yml`; the full
gate is the `epic` label (`typecheck`, `test`) with the omni control line on `unit (` jobs; bundles of 8 (max 16, 45 min
wait); `merge-if-disjoint` when `dev` moves.

This repository lands through its own queue. Its host is the owner's desktop app built from `dev`, so it carries the
queue before a release does, and Maestro there runs on `claude-code`. Nothing lands while that app is closed. A hand
merge (`maestro-maintenance`, Landing) is then the fallback, not the rule.

Start the host from `apps/desktop` of a clean worktree on `dev`. The `orchestra-dev-isolated` skill covers omni
artifacts, but leave out its `ORCHESTRA_TEST_ONBOARDING`: its in-memory database loses the board on every restart.
Give the host its own durable database instead. A dev build otherwise opens the installed app's `orchestra.db`, and
the host's newer schema then breaks the owner's app.

1. `OMNI_ARTIFACTS=<dir> bun ./scripts/predev.ts` builds the server binary. Rerun it after every `dev` update you
   want the host to carry.
2. `./node_modules/.bin/electron-vite build`
3. In the background:
   `ORCHESTRA_DB=$HOME/.local/share/orchestra-queue-host/orchestra.db ./node_modules/.bin/electron-vite preview --skipBuild -- --remote-debugging-port=9333`.
   Create the directory first. The path must be absolute, or it lands next to the owner's database.
4. Check it before you queue anything: `lsof -c orchestra | grep '\.db'` lists the host's server holding only the
   `orchestra-queue-host` file. A row on `~/.local/share/orchestra/orchestra.db` from the host's pid means the variable
   was lost: stop the host.

The host's board lives only in that database: the owner's app does not show it, and a board kept in the owner's
database does not move over (`BoardTree.restore` has no tool yet). Create the project and its cards on the host.

Stop the host by quitting that app, or by stopping its background task. Never stop it with `pkill`, which also hits
other sessions' apps. A queue that stops mid-bundle resumes from its rows on the next start.

## When a bundle goes red

| Cause the host finds | What happens | Maestro's part |
|---|---|---|
| Base commit red, or a base probe red | `base-red`; cards stay queued; nothing is cut until base moves. A failing check is bisected on base and a `bug` fix card names the first failing commit | Get the fix card done; it rides alone |
| Code red, failing bun tests in a turbo package | Scoped runs on base and head: base red, code (isolate, eject) or flaky | Fix the ejected card in Review and queue it again |
| Only cancelled, timed-out or never-started jobs, or a control-line job with no failing file | Infra: the failed jobs rerun once in place, then `paused` | `board_bundle retry` once the runner is back |
| Flaky (three head passes) | PR stays open, `board_flake` row | `board_bundle merge` or `retry` |
| Isolation found nothing or rebuilt twice | Bundle dissolves; cards held | `board_bundle release` one card at a time |
| A member's PR moved after assembly | That card goes back to Review; bundle rebuilt without it | Queue it again when verified |

## Reading a stuck queue

- `board_read` shows each queued card's state: waiting, running, held by a hold before merge, or held out by a conflict.
- A flaky, paused or dissolved bundle holds the project's queue until Maestro decides with `board_bundle`.
- `base-red` waits for a base move: look for the fix card, not at the bundle. A `base-red` with no fix card never moves on its own; a red probe with nothing to fix now closes `paused` instead (#1181).
- A card refused with "conflicts with base…" after it merged base keeps that flag until base moves again; the conflict check reruns only on a base move.
- `board_dequeue` takes a card out and dissolves its bundle; the other members stay queued.
- A card refused as scoped-red after a green `ci_run`: the scoped state keeps the latest row per command, so an
  earlier failing run with a different command (other files, other package) still counts. Rerun that same command
  until it passes; a green run of another command does not replace it.
- Any push to a queued card's PR, including the fix for its own red, sends it back to Review ("head moved"). Run
  `ci_run` and the typecheck on the new head, then `board_queue` it again.
- Pushes to the base branch run no CI, so after a red bundle the base has no checks and the host probes it alone
  with the whole gate (about half an hour) before it cuts again.
- Each `test:ci` run uploads the working tree through the GitHub API (hundreds of files). Many runs in a row hit the
  hourly rate limit; the script waits and retries, so a run that stalls on "rate limit" is slow, not broken. A run
  that stops on "network is unreachable" never reached Actions: run it again.
- A card that never turns scoped-green although its runs pass: `ci_run` tests the worktree's tree, untracked files
  included. A stray file in the card's worktree (a screenshot, a log) makes that tree differ from the PR head, so the
  green never matches and typecheck is never dispatched. `git status` in the worktree; move the file out, then
  `ci_run` again.
- `board_queue` refuses a PR record whose follow-ups are not cards on the board. Create each follow-up as a card
  first, or leave it out of the record.
- A docs-only card still needs a `package` for `ci_run`, or the contract's `scoped.tests` refuses it. Name the package
  whose docs or skills it touches.
- A known flake on a base probe (a test that also fails on an unchanged base, such as a 30 s Windows timeout) closes
  the probe `base-red` and holds the queue until base moves. `board_bundle` decides only `flaky` and `paused`
  bundles, so no tool releases it: land the flake's fix card (it rides alone), or ask the owner before setting that
  bundle's row to `probe-green` by hand. Known flakes: `BoardCi > a scoped green is keyed by tree` (linux core) and
  `RipgrepBinary > bounds an attempt that never answers` (Windows).
- To land several ready cards fast, queue them all and `flush` the last one: they ride one bundle and one full gate.
  A card that may go red (new tests, Windows-sensitive code) rides better alone, so its red does not eject the rest.

## Not in the queue (yet)

- `BoardTree.restore` (rebuild the board from `.atlas/project/board.jsonl`) has no tool or CLI.
- Per-lane numbers (spec §7) are not built; bundles keep one sequence per project.

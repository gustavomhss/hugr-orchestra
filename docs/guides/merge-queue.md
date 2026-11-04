# Checks and the merge queue

Maestro tests each card before it lands. The merge queue is being built in steps; this page grows with it.

## Tell Maestro how your project runs CI

Put `.orchestra/ci.json` on your base branch. Maestro reads it from there, so a change to it goes through a PR like
any other change.

```json
{
  "base": "dev",
  "scoped": { "tests": "bun run test:ci {package} {files}", "workflows": ["typecheck.yml"] },
  "full": { "label": "epic", "checks": ["typecheck", "test"] },
  "bundle": { "size": 8, "max": 16, "waitMinutes": 45, "onBaseMoved": "retest" },
  "budget": { "jobs": 20 },
  "snapshots": { "remote": "origin" },
  "merge": "merge"
}
```

- `scoped.tests` runs in the card's worktree. Maestro fills `{package}` and `{files}` from the card. It runs without a
  shell: pipes and `&&` do not work, so point it at a script when you need more.
- `scoped.workflows` are GitHub workflows Maestro dispatches on the card's pushed branch.
- `merge` must be `merge`. Squash and rebase are refused, because they would stop GitHub from marking each PR merged.
- `snapshots.remote` is the remote that receives work in progress (below). It defaults to `origin`.
- Every other field is optional. `onBaseMoved` defaults to `retest`.
- `lanes` turns on parallel bundles (see [Lanes](#lanes)). Leave it out to keep one bundle at a time.

With no file, Maestro uses the PR's own required checks when your base branch has them, and only its own verification
otherwise.

## What a check result means

Each result is tied to the exact files it ran on (the tree), not to a commit. A card is `scoped-green` when every
required check passed on its current files, and `scoped-red` when the latest run of any check failed. Committing the
same files keeps the green; any edit drops it, and Maestro runs the checks again. Running the checks twice on the same
files starts nothing new.

## Work in progress is pushed early

Every time Maestro sends a card to a seat it opens an attempt: the first dispatch is attempt 1, and each new Session on
the card opens the next one. While an attempt is open, Maestro pushes the card's worktree every 10 minutes to
`refs/orchestra/wip/<KEY>-<number>/a<attempt>` on `snapshots.remote`, uncommitted and untracked files included. It
reads the files through a temporary index, so the worktree, its index and its branch stay as the seat left them. Each
push builds on the previous one, and nothing is pushed when the files have not changed.

A card is `pushed` when its worktree matches the last push and `local` when it has changes that are only on your
machine; the card page and `board_read` show which. Before each push Maestro scans the new changes with gitleaks. A finding, or a scanner that cannot run, blocks
the push and the card stays `local`. If a seat dies, its work can be restored from the ref:

```bash
git fetch origin refs/orchestra/wip/KEY-1/a1 && git restore --source FETCH_HEAD --worktree -- .
```

## Plan shape and drift

`archie`'s plan gives each card three optional fields: `area` (the workspace packages the card should affect, named as
`turbo` names them), `depends_on` (cards whose code it needs) and `order` (its landing order among cards that share an
area). Maestro reviews the plan before adopting it: cards meant to run at the same time that overlap in `area`, with no
`depends_on` or `order` between them, go back to `archie`. An overlap that is declared is a sequence the queue follows.

When a card is queued, the host compares its real affected set with its `area`. If the card affects packages outside
it, the host adds one note to the card and one `integration` line, and Maestro sends the card to `archie` as a plan
revision. The card still queues: drift never holds a landing. With no `area`, or with no `turbo` in the project, there
is nothing to compare and no line. Set both fields with `board_issue`; null clears them.

## After a crash

If Maestro's host dies, the queue resumes from its rows: an open bundle is settled and a new one is cut when none is
open. A bundle whose head is already in the base branch, because the host pushed it before it died, is recorded as
merged and never pushed twice. A card whose worktree is gone comes back from its snapshot at the same path; with no
snapshot, Maestro logs a drift line and leaves the card alone.

## When your base branch moves

Once a minute Maestro looks at where the base branch stands. While a card is in Review or Queue it fetches the base branch
on every pass; a project with no such card is fetched at most every five minutes, and the next fetch still reports
everything that changed since the last one. Projects are checked two at a time. When the base branch has moved, Maestro looks only at the cards in Review whose
files the new commits touched, and checks each one with a trial merge that changes nothing on disk. A card that still
merges gets a note naming the touched files; a card that no longer merges gets a note naming the conflicting files
and is marked as conflicting. Maestro never rebases or merges into a seat's worktree: the seat merges the base branch
on its next dispatch. A card marked as conflicting is checked again on every move, and gets a note when it merges
clean again. Cards the move did not touch get nothing.

## The queue

When a card is verified, Maestro writes its PR record (intent, decisions, what is not covered, risk) and puts the card
in the Queue column. Only Maestro's `board_queue` does that, and it refuses a card that has no PR, has an incomplete
record, depends on cards that are not shipped or queued, conflicts with the base branch, or is not `scoped-green` when
your contract names scoped checks. Maestro then fills the PR body from the record plus the facts it holds: checks,
attempts, diff size, CI runs and minutes, and where the card is in the queue. Model cost is never written to GitHub.
The PR body is rendered by Atlas; without it, the PR body is left as Maestro wrote it.

Queued cards are merged together into one bundle PR named `chore(queue): bundle KEY-B<n>` on a `bundle-KEY-<n>`
branch, labelled with `full.label` so your full CI runs once for all of them. A bundle PR also carries every
`guardrail-approved` or `guardrail-approved:<rule>` label its cards' PRs have, so a guard approval given to a card
still holds when its change lands in the bundle. A bundle is cut when the queue reaches
`bundle.size` cards, when a card was queued with `flush`, when the oldest card has waited `bundle.waitMinutes`, or when
every remaining card of an epic is queued. Urgent cards go first.

- **Green bundle.** Maestro checks that no member's PR moved since assembly, then pushes the tested bundle to the base
  branch, so every member PR shows as merged and its card moves to Shipped. If the base branch moved meanwhile, the
  bundle is retested, unless `onBaseMoved` is `merge-if-disjoint` and what moved does not overlap the bundle's files
  or packages: then Maestro merges the tested bundle onto the new base without a second run.
- **Red bundle.** Maestro first reads the checks of the base commit the bundle was cut on. When base's tree is the
  tree of the last bundle that merged with the whole suite green, or of a green base probe, base counts as green with no
  probe. When that commit has no other green record, for example because it was merged outside the queue, Maestro runs the full gate on base alone first (a base
  probe: a bundle with no cards that never merges). If base is red, the bundle closes as `base-red`, its cards stay queued, and nothing is cut again until the base moves. A red probe is read like a red safety run: a failing scoped test is bisected and gets a fix card, and a red with no failing scoped test pauses the queue (`paused`) until Maestro retries it, since no fix card could move base. Otherwise the bundle
  closes as `red` and its members stay queued, split in half: the first half is cut and gated again. A green half
  merges; the rest is cut next. A card that is red alone is ejected: its attempt closes `ejected`, a new attempt opens with
  the cause, and the card goes back to Review with a note. Maestro queues it again after fixing it. A red made only of
  cancelled, timed-out or never-started jobs, or of jobs whose log names no failing file and shows a step that timed out
  or was cancelled, is infrastructure: only the failed jobs run again once on the same bundle, and a
  red on that rerun pauses the queue (`paused`) until Maestro retries it. A code red whose failing tests ran scoped is searched with scoped runs, not halved through full gates: each card is tried alone on base, then by halving. Culprits go back to Review and the rest ride a rebuilt bundle. After two rebuilds, or when halving finds nothing, the bundle dissolves and its cards are held until Maestro releases one at a time with `board_bundle release`, which rides alone. After 50 settled cards the bundle size follows
  the red rate. The failed jobs' logs name the failing files (bun `(fail)` files, vitest `FAIL` files and TypeScript error paths) in the
  cards' notes. When every failing file is a bun test file under a turbo package group and the contract has `scoped.tests`, the host runs those tests scoped on base and on the bundle head in parallel: two base failures make it a base red, a head failure is code (split or eject), and three head passes make the bundle flaky. A flaky bundle keeps its PR open and its cards stay queued; the test is recorded in `board_flake`, and the queue waits for Maestro to merge or retry it. Other reds still check base by its checks or a probe. When F fails on base, the queue bisects F along base's first-parent history, from the last green whole-suite run (a merged bundle that ran the whole suite, or a green base probe or safety run) to the red base, and opens a `bug` fix card that names the first failing commit. The bundle is not blamed and its cards stay queued. Until base moves, only that fix card is cut, alone, and it merges as soon as F passes, even if other checks are red. The queue never reverts. `full.control` names a line and the jobs (name prefixes) that always print it: such a job that failed with no
  failing file and without the line never ran its tests and counts as infrastructure; any other job's failure is code unless
  it was cancelled, timed out or never started. A `full.checks` name matches a check or the workflow that ran it.
- **A member pushed after assembly.** That card goes back to Review and the bundle is rebuilt without it.

A flaky or paused bundle holds its project's queue until Maestro decides with `board_bundle`. `merge` ships a flaky
bundle as tested, its red gate counted as passed; `retry` cuts a flaky bundle's cards into a new bundle, and for a paused
queue it releases the pause once the runner is back. Projects settle at the same time, so one project's scoped reruns do
not hold the others.

A card in the Queue column shows whether it is waiting, running in a bundle, held by your hold before merge, or held
out by a conflict. To take a card out, ask Maestro: it uses `board_dequeue`, which also dissolves the bundle the card
was in. Merge PRs of a board project only through the queue; a guard flags code that merges a PR outside it.

## Lanes

A project with a `turbo.json` on its base branch can land unrelated work side by side. Add a `lanes` block:

```json
"lanes": {
  "by": "turbo",
  "global": ["package.json", "bun.lock", "turbo.json", ".github/workflows/**"],
  "jobs": 10,
  "workflows": ["typecheck.yml", "test.yml"]
}
```

At every cut Maestro asks turbo which packages each queued card affects (the packages it changes and every package
that depends on them). Cards whose packages overlap share a lane; cards that share nothing get separate lanes, and
each lane is cut into its own bundle. A lane bundle is not labelled with `full.label`: Maestro dispatches each workflow
in `workflows` on the bundle branch with a `packages` input that lists the lane's packages, so only those packages are
typechecked and tested. Your workflows need a `packages` `workflow_dispatch` input and should filter on it.
Maestro asks turbo about the card merged onto the base branch, so the branch your project folder has checked out does not matter.

- A card never jumps the queue. It is cut only when no bundle in flight touches its packages and no earlier card that
  shares a package with it is still waiting.
- A card that changes a `global` path overlaps everything. It waits for the bundles in flight to land, then goes alone
  (or with other global cards) on the whole suite, with `full.label`. Every card queued behind it waits for it.
- A lane bundle lands with `merge-if-disjoint`, whatever `onBaseMoved` says: the other lanes moved base, but they
  touch none of its packages.
- `jobs` is how many CI jobs one lane's gate uses. With `budget.jobs` it caps the lanes in flight at
  `budget.jobs / jobs`.
- The bundle that closes an epic (every open card of the epic is queued) always runs the whole suite, with
  `full.label`, whatever packages its cards touch.
- `fullEvery` is the safety net for what the affected graph misses. With `fullEvery: K` above 0, after every K lane
  bundles land Maestro runs the whole suite on base: an empty commit on the base tip, opened as a bundle with no cards,
  gated by your `workflows` dispatched with no `packages` input. It never merges and touches no lane while it runs.
  `0`, the default, turns it off. The count comes from the bundle history, so it survives a restart.
- A red safety run is a base red, never a revert. When its failing tests (F) are bun tests in package groups and the
  contract has `scoped.tests`, the queue reruns F on base, bisects it from the last green whole-suite run, and opens a
  `bug` fix card that rides alone. Only lanes that touch F's packages pause until that fix card ships; disjoint lanes
  keep cutting and landing. A lane bundle whose F fails on base is handled the same way.
- A paused or flaky bundle holds every lane of the project until Maestro decides. A red base whose failures are not
  scoped tests falls back to one bundle at a time until base moves.

## Card thread

Every message about a card lands on its thread as a note the host writes: the brief Maestro dispatched, the question a
worker asked, the answer, the return, review requests and verdicts, and a rework note when the card is redispatched.
Thread notes are read-only; you can add your own notes, but only Maestro and the host write the thread. Notes stay on
the board and never go to GitHub.

## Record commit

Each bundle ends with a `chore(queue): record <KEY>-B<n>` commit that writes the project's Atlas record: the board log
since the last record (`.atlas/project/board.jsonl`), each member's thread and attempts (`cards/<KEY>/`), one logbook
entry per member and an Orientation milestone per member. A rebuilt bundle starts again from the base branch, so an
ejected card leaves no logbook entry. On a public repository, free text is redacted.

### Rebuilding the board from the record

The board log in the record is enough to rebuild a project's board in an empty database: projects, epics, cards,
steps, dependencies, questions, decisions, owner and Maestro notes, and the activity log itself. The import replays the
log in time order, one rule per action, and stops with a named error on any action it does not know rather than
skipping it.

Some things are not in the log on purpose:

- The queue, bundles, attempts, checks, CI runs, flakes and GitHub sync state are rebuilt from git, GitHub and the
  card records, so the import leaves them empty.
- Card threads live in `cards/<KEY>/`, not in the board log.
- Attachments are never logged. Their bytes and any secret stay on the machine that added them.

On a public repository the log carries no free text, so the import rebuilds the structure with empty text and marks
each redacted reason with the hash of the text it replaced.

## Numbers

The board snapshot carries four numbers for the project's queue, under the names `queueWait`, `redRate`, `reworkRate` and `leadTime`. `queueWait` is the median time from a card joining the queue to its bundle merging. `redRate` is the share of the last 50 settled attempts that were ejected. `reworkRate` is attempts per shipped card. `leadTime` is the median time from a card's first passing scoped check to the merge. Each is null until there is data for it. They are in the API data only; no screen shows them yet.

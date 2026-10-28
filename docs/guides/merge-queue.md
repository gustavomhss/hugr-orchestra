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
machine. Before each push Maestro scans the new changes with gitleaks. A finding, or a scanner that cannot run, blocks
the push and the card stays `local`. If a seat dies, its work can be restored from the ref:

```bash
git fetch origin refs/orchestra/wip/KEY-1/a1 && git restore --source FETCH_HEAD --worktree -- .
```

## When your base branch moves

Once a minute Maestro fetches the base branch. When it has moved, Maestro looks only at the cards in Review whose
files the new commits touched, and checks each one with a trial merge that changes nothing on disk. A card that still
merges gets a note naming the touched files; a card that no longer merges gets a note naming the conflicting files
and is marked as conflicting. Maestro never rebases or merges into a seat's worktree: the seat merges the base branch
on its next dispatch. A card marked as conflicting is checked again on every move, and gets a note when it merges
clean again. Cards the move did not touch get nothing.

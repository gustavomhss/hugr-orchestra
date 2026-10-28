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
  "merge": "merge"
}
```

- `scoped.tests` runs in the card's worktree. Maestro fills `{package}` and `{files}` from the card. It runs without a
  shell: pipes and `&&` do not work, so point it at a script when you need more.
- `scoped.workflows` are GitHub workflows Maestro dispatches on the card's pushed branch.
- `merge` must be `merge`. Squash and rebase are refused, because they would stop GitHub from marking each PR merged.
- Every other field is optional. `onBaseMoved` defaults to `retest`.

With no file, Maestro uses the PR's own required checks when your base branch has them, and only its own verification
otherwise.

## What a check result means

Each result is tied to the exact files it ran on (the tree), not to a commit. A card is `scoped-green` when every
required check passed on its current files, and `scoped-red` when the latest run of any check failed. Committing the
same files keeps the green; any edit drops it, and Maestro runs the checks again. Running the checks twice on the same
files starts nothing new.

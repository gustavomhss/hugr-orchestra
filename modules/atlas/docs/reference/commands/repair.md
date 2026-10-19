# `atlas repair`

Open the repair pull request for the Own units a merge left stale. When a merge changes a file an Own unit is
anchored to, the static Own skill for that unit goes stale and Orchestra holds the owner. CI cannot fix it — it has
no Atlas store — so the `atlas-worklist` workflow uploads the list of stale units after every push to `dev`, and a
maintainer with the store runs this command on it.

This page describes the **CLI** command `atlas repair`. It is CLI-only (not an MCP tool). Run it at the Atlas root
(the directory holding `OWN-SNAPSHOT.json` and `scripts/`), on an up-to-date `dev` checkout, after the packages are
built (`npm run typecheck` builds the Own snapshot contract the materializer loads).

## Invocation

```
atlas repair --worklist <file>
```

- `--worklist <file>` — required. The worklist `own-snapshot-guard --worklist <file>` writes, `{units: [{unit, stale:
  [path]}]}`: the `atlas-worklist` artifact, or a local run of the guard. A worklist with no unit ends the command
  with exit `0` and changes nothing.

## What it does

1. Refuses unless `git status` shows no change under the current directory: the repair branch holds only the Own
   refresh.
2. Runs [`own-export`](./own-export.md) for exactly the worklist's units into a temporary file.
3. Runs `scripts/materialize-own-snapshot.mjs` on that file, which checks it against git and rewrites
   `OWN-SNAPSHOT.json` and `.orchestra/skills/own/`. If it refuses, nothing has changed.
4. Creates the branch `atlas-repair-<first 12 characters of the HEAD sha>`, commits those two paths, and pushes the
   branch to `origin`.
5. Runs `gh pr create` for the branch, with one line per repaired unit and its stale files in the body, and prints
   the PR's URL. The PR merges only once the Own snapshot guard passes on it.

## Exit codes

| code | meaning                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------- |
| `0`  | the PR is open, or the worklist names no stale unit                                                  |
| `1`  | a usage error: no `--worklist`, a file that is not a worklist, or no composed runtime                |
| `2`  | refused: uncommitted changes, an own-export or materializer refusal, a git step or `gh` failed       |

After a failed git step the refreshed files stay in the working tree; after a failed `gh pr create` the branch is
already pushed and the PR can be opened by hand.

## Authority

`atlas repair` binds `atlas-query` — it writes no knowledge: only the Own files, a commit on its own branch and a
pull request. It is not a `WRITE_PATHS` member.

## Related

- [`own-export`](./own-export.md) — the reviewed snapshot this command builds.
- [`own`](./own.md) — the briefing each repaired unit carries.

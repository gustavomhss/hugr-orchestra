# Merge queue spike (WP0)

Results of WP0 of the merge queue design (`docs/specs/maestro-lead/merge-queue.md`, §13). Run on 2026-10-28 against
a private scratch repository, `gustavomhss/orchestra-queue-spike`, and against this repository for the facts that
depend on it. No product code.

| # | Fact | Answer |
|---|---|---|
| 1 | Merging a bundle PR with `--merge` marks its member PRs merged | Yes |
| 2 | `gh workflow run --ref <bundle branch>` runs on the bundle branch | Yes |
| 3 | A temporary-index tree equals `test:ci`'s uploaded tree for the same worktree | Yes, minus one file: `test:ci` adds `.ci-run.json` |
| 4 | Pushing a hidden ref (`refs/orchestra/wip/<KEY>/a<n>`) to GitHub works | Yes |
| 5 | `turbo --filter='...[A...B]' --dry=json` lists the affected packages of a commit range here | Yes |
| 6 | A seat's Atlas Memory write lands in the card's worktree | Yes |
| 7 | GitHub's server-side merge honors `merge=union` | **No.** The local merge plus fast-forward fallback works. |

## 1. Bundle merge marks members merged

Members `a` (#1) and `b` (#2) were merged with `git merge --no-ff` into `bundle-SPK-1`, pushed, and opened as #5.

```
$ gh pr merge 5 --merge --match-head-commit d7f4003a5f72a3065bc05839eb93e3438b5ce7a5
#1 MERGED 2026-10-28T19:24:21Z
#2 MERGED 2026-10-28T19:24:21Z
#5 MERGED 2026-10-28T19:24:19Z
```

## 2. Workflow dispatch on a bundle branch

```
$ gh workflow run probe.yml --ref bundle-SPK-1
exit=0
{"headBranch":"bundle-SPK-1","headSha":"d7f4003a5f72a3065bc05839eb93e3438b5ce7a5","conclusion":"success"}
```

## 3. Temporary-index tree versus `test:ci`

`script/test-ci.ts` `snapshot()` copies the real index, runs `git add -A` against `GIT_INDEX_FILE`, then adds
`.ci-run.json` before `write-tree`. The same steps without the last one, on a worktree with an untracked file:

```
snapshot=80a34a0ccbf52d36434cb36bd48bf9a5a30acddc testci=f331231d8bd510af5a78313432e84efa25402a63
$ git diff-tree -r --name-status <snapshot> <testci>
A	.ci-run.json
$ git status --short
?? zz-spike-untracked.txt          # the worktree and its index are untouched
```

So the check key is the snapshot tree, written before `.ci-run.json` is added. `test:ci` already checks that GitHub
built exactly its tree, so a `board_check` row keyed by the snapshot tree names what was tested.

## 4. Hidden ref

```
$ git push origin <commit-tree of HEAD>:refs/orchestra/wip/SPK-1/a1
 * [new reference]         1bdad79da8 -> refs/orchestra/wip/SPK-1/a1
$ git ls-remote origin 'refs/orchestra/*'
1bdad79da8e1f941f26c5bbfd15c64a7125b25fc	refs/orchestra/wip/SPK-1/a1
$ git fetch origin refs/orchestra/wip/SPK-1/a1
 * branch                  refs/orchestra/wip/SPK-1/a1 -> FETCH_HEAD
$ git push origin :refs/orchestra/wip/SPK-1/a1
 - [deleted]               refs/orchestra/wip/SPK-1/a1
```

Hidden refs are not fetched by a default clone and do not show as branches.

## 5. Affected packages from `turbo`

```
$ turbo run typecheck --filter='...[e0094c5a4f...31f8fd5049]' --dry=json | jq -r '.packages|join(" ")'
@orchestra/app @orchestra/app-dock @orchestra/cli @orchestra/continuity @orchestra/core @orchestra/desktop
@orchestra/engine-claude-code @orchestra/janitor @orchestra/maestro @orchestra/omni-campaign @orchestra/sdk-next
@orchestra/server @orchestra/session-ui @orchestra/storybook @orchestra/tui @orchestra/web
```

The range touched `bun.lock`, `modules/app-dock`, `modules/engine-adapters` and `packages/core`; `...` adds the
dependents. `turbo` needs the repository's installed `turbo` (or a global one of the same version).

## 6. Atlas Memory lands in the worktree

`MaestroAtlasMemoryTools.open` binds `storage.root` to `location.project.directory`. `Project.resolve` sets that to
`repo.worktree`, which `Git.repo.discover` reads with `git rev-parse --show-toplevel` from the Session's directory.
A seat started with `task` `worktree: true` runs with its Location at the card worktree, so the toplevel is the
worktree, and Atlas writes `<worktree>/.atlas/memory.jsonl`. The root `.gitattributes` already unions that file, and
it is not gitignored, so `land` commits it with the card's paths.

## 7. `merge=union` on GitHub

`.gitattributes` in the scratch repository: `.atlas/*.jsonl merge=union`. PRs #3 and #4 each append one line to
`.atlas/board.jsonl`.

```
$ gh pr merge 3 --merge             # merged
$ gh pr view 4 --json mergeable
CONFLICTING
$ gh pr merge 4 --merge
X Pull request #4 is not mergeable: the merge commit cannot be cleanly created.
```

GitHub's server merge does not run `merge=union`. The fallback, merging locally and pushing base as a fast-forward:

```
$ git checkout -B main origin/main && git merge --no-ff origin/d -m "Merge pull request #4 from d"
 1 file changed, 1 insertion(+)
$ git push origin main
   a5a5d6b..61dd78f  main -> main
$ gh pr view 4 --json state,mergeCommit
{"mergeCommit":{"oid":"61dd78f62558234fe3dccbb1cef0a3410805ffdc"},"state":"MERGED"}
```

The same for a bundle. Members `e` (#6) and `f` (#7) both append to the log; `bundle-SPK-2` (#9) merges them locally,
where union applies. Base then moves: #8, which appends too, merges first.

```
$ gh pr merge 9 --merge
X Pull request #9 is not mergeable: the merge commit cannot be cleanly created.
$ git merge --no-ff origin/bundle-SPK-2 && git push origin main
   623cdbd..cb16f2f  main -> main
#6 MERGED
#7 MERGED
#9 MERGED
```

## What it changes in the build

- A bundle assembled locally resolves union files between its members, so `gh pr merge --merge` fails only when base
  moved and touched a union file the bundle also touched. The conveyor merges locally and pushes base as a
  fast-forward whenever the server merge refuses, and always when the bundle touches a union-merged path. Both paths
  mark the bundle PR and every member PR merged.
- `dev` here has no branch protection; its ruleset forbids only non-fast-forward pushes and deletion, so the
  fast-forward push is allowed. A project whose base requires PR reviews or status checks for pushes cannot use the
  fallback; there, a union conflict on a moved base is a `retest` on the new base.
- Checks are keyed by the snapshot tree (fact 3), not by the tree `test:ci` uploads.

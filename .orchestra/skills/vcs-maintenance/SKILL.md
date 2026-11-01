---
name: vcs-maintenance
description: How the server answers the polled version-control views (status, branch, default branch) without a git process per request, and the traps in the cache window and the in-process untracked count. Use when changing packages/core/src/git-cli.ts, packages/core/src/vcs.ts or the vcs handler.
---

# VCS views maintenance

Code: `packages/core/src/git-cli.ts` (git reads), `packages/core/src/vcs.ts` (views), `packages/server/src/handlers/vcs.ts` (HTTP).

## Cache window

- The renderer polls `vcs.get` and `vcs.status`, and each answer used to start several git processes. `GitCli.Interface.cached` (`branch`, `defaultBranch`, `hasHead`, `status`, `stats`) keeps one result per directory (per directory and ref for `stats`) for `GitCli.CACHE_WINDOW`, 1.5 s, and concurrent callers inside the window share one git run. It is built on `Effect.cachedInvalidateWithTTL` and holds at most 64 entries; the layer owns the maps, so a test builds its own with `GitCli.layerWith(window)`.
- Only the polled views read `cached`. The plain methods (`status`, `branch`, ...) always run git; governance evidence and anything else that must see the tree as it is now keeps using them. Do not move such a caller to `cached`.
- `applyPatch` clears every entry. Nothing else invalidates: a checkout or an edit shows up within one window, and the app already refreshes on file-watcher and `vcs.branch.updated` events. Hooking the watcher in was left out because it is location-scoped while this service is global.
- `Vcs.diff` stays uncached: its file list and patches must come from the same moment.

## Untracked line counts

- `statUntracked` counts a regular file of at most 4 MiB in-process (newline count, plus one for a final line without a newline; a NUL in the first 8000 bytes means binary, 0/0), which is what `git diff --no-index --numstat` reports. Before, each untracked file cost one git process per poll.
- Symlinks, directories and larger files still ask git, so the answer is unchanged for them. `.gitattributes` diff rules are not applied in-process.
- `packages/core/test/git-cli.test.ts` compares the in-process count with git itself and counts the processes the service starts.

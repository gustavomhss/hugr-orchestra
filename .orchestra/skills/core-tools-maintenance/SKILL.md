---
name: core-tools-maintenance
description: How the task and skill tools in packages/core/src/tool behave on failure and under load, and the traps in the worktree lifecycle, the failure reason, the skill file sample and the jimmy store exemption. Use when changing tool/task.ts, tool/skill.ts or the store line in tool/registry.ts.
---

# Core tools maintenance

Code: `packages/core/src/tool/task.ts`, `tool/skill.ts`, `tool/registry.ts`. Tests: `test/tool-task.test.ts`, `test/tool-task-reply.test.ts`, `test/tool-skill.test.ts`, `test/tool-skill-bounds.test.ts`.

## Task tool

- With `worktree: true` the copy is created before governance admit, because admit needs the placement. A scope finalizer removes the copy (`ProjectCopy.remove`, forced) on every exit that happens before the child Session is created: a rejected admit, a denied child policy, a denied `task` permission, a failed create. The `adopted` flag flips right after `sessions.create`; from then on the Session owns the copy and the finalizer leaves it alone. Only a copy this call created (`fresh`) is removed, never a reused directory. If you add a step between the copy and `sessions.create`, it is covered; if you add a step that hands the copy to something else earlier, move the `adopted` flip with it.
- `git_worktree` copies use `git worktree add --detach`, so removing the directory leaks no branch.
- A child that ends without a completed reply fails the parent call with `Task <id> finished without a completed assistant reply: <reason>`. `unfinishedReason` and `completedReply` read the same last reply and the same `UNFINISHED_FINISH` list, so the reason always describes why `completedReply` returned nothing. When you change what counts as completed, change both.

## Skill tool

- `skills.list()` is already cached by the skills service (per source, invalidated by generation). The tool does not add a second cache: it would go stale against that invalidation.
- A miss returns the loadable top-level names (all of them up to `NAME_LIMIT`, otherwise the `CLOSE_LIMIT` closest by edit distance). Tree nodes are left out because they load only through their parent. The list is not filtered by the agent's `skill` permissions, so it can name a skill the agent will then be denied.
- The file sample (`sampleFiles`) is breadth-first, shallowest first, and stops at `FILE_LIMIT` files or `DIRECTORY_LIMIT` directories read. It skips `.git` and `node_modules` and does not follow symlinks. Do not go back to a whole-tree glob.
- A failed load keeps the cause on `ToolFailure.error` and in the message.

## Registry

- `store: input.agent === "jimmy" ? undefined : LeanSummary.store(...)` is deliberate (713fdf84d8). The discovery seat quotes sources exactly, so it gets no lossy Lean summary. It is not an output bound: the size bound every result passes still applies. Do not extend the exemption to other seats without the same reason.
- `materialize` is not memoized. The runner calls it once per step with the step's permission rules and hidden tools, and the registrations it reads (`applications`, `local`) are mutable with no generation token, so a cache key would need an invalidation hook that does not exist. Add the token first if profiling ever shows this cost.

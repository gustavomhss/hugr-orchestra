---
name: maestro-orchestra-agents-team
description: The native seats, their roles, which are staffed, how Maestro learns the team, how a seat's display name is resolved, and what a dispatch gives a seat.
internal: true
when: The owner asks who is on the team, what a seat does, why a seat cannot be dispatched, how a seat is renamed, or how areas and worktrees route code work.
not-when: The question is about adding a custom agent or a skill; open custom or skills.
covers: [modules/maestro/coordination, modules/specialists/archie, modules/specialists/backend, modules/specialists/team, packages/jimmy-specialist]
---

# The team of seats

A seat is a native agent with a fixed role. It is addressed by its stable id; the name the owner sees is a setting.
The catalog is the `seats/` directory of `modules/maestro/coordination/src` (one file per seat, listed in `seats/index.ts`);
`roster.ts` holds the default display names and the execution, review, discovery and direct profiles.

## Seats

| id | Role | State |
|---|---|---|
| `backend` | backend execution; writes code in its areas | staffed |
| `archie` | product, architecture, specification, planning | staffed, the planner |
| `jimmy` | codebase exploration and research | staffed, the research seat |
| `lucy` | cold code review; records governed reviews | staffed, the approver; no skill tree yet |
| `patty` | frontend | not staffed |
| `billy` | security review | not staffed |
| `rosie` | documentation | not staffed |
| `frankie` | process audit | not staffed |
| `live` | meeting copilot | primary, never dispatched |

`general` (full-brief work, edits and shell, no questions to the owner) and `explore` (read-only search) are built-in
agents, not seats. At most one seat is the research seat, the planner or the approver. Atlas Memory is allowed only for
`backend`, `jimmy`, `archie` and `live`. A seat with an empty `skills` list has no tree yet, and none is written ahead
of the seat.

## How Maestro learns the team

- A generated `<team>` System Context (key `maestro/team`, from `v2/team-source.ts`) goes into Maestro's turns only.
- It lists each non-primary, non-hidden, staffed agent by id with its display name, a routing line and its `Areas:`.
- An unstaffed seat appears as "Not staffed yet, do not dispatch". Dispatching one fails with `Task denied: seat-unstaffed`.
- Routing: investigation and research go to the research seat, plans to the planner, review to the approver, code in a
  teammate's areas to that teammate with a `card` and `writePaths`.
- Project areas come from config `agents.<id>.areas`, a list of strings.

## Display names

Resolution in `v2/seats.ts` `label()`: an environment variable first (`HUGR_BACKEND_NAME` for `backend`,
`HUGR_UPSTREAM_NAME` for `archie`), then config `agents.<id>.name`, then the roster default. A label must be nonempty,
at most 40 characters, with no control characters, not reserved (`build`, `plan`, `general`, `explore`, `maestro`,
`title`, `summary`, `compaction`) and unique against other agents' ids and labels; an invalid one falls back to the
default with a warning. Maestro's own name is fixed. Say a seat by id or role in code, docs and commits.

## What a dispatch gives a seat

- `mcp__orchestra__task` (the `task` tool) starts a child Session: the seat sees only the brief.
- A seat that writes gets `writePaths`; a seat with no write roots runs read-only.
- `worktree: true` runs the child in a new git worktree under `<project>/.worktrees` (needs a git repo); `directory`
  resumes in an existing worktree.
- `backend` and `archie` have write roots, `strictResume` and Atlas Memory; `backend` also has a toolkit and the
  `hugr-composer` MCP and returns a `backend-work-result-v1` result.
- Seat trees are loaded with the skill tool; a seat cannot edit its own tree and cannot read another seat's.

## Not matching the guide

The guide groups frontend, review, security, documentation and audit as one "not built" row. In code `lucy` is staffed
and dispatchable; `patty`, `billy`, `rosie` and `frankie` are `staffed: false`.

## `modules/maestro/coordination`

Maestro's coordination package (`@orchestra/maestro`). It holds the seat catalog and roster, the generated team list,
the governed run records (approval, authorization, verification plan, work contract), the Arsenal native safety
contribution, and the Maestro playbooks in `playbooks/`.

## `modules/specialists/archie`

Asset module for the `archie` seat: its skill tree `archie-plan`, `archie-work-package` and `archie-workflow`. Compiled
builds embed it with the other seat trees (`seat-skills-module.ts`). Documentation stays outside `skills/`.

## `modules/specialists/backend`

Asset module for the `backend` seat: `backend-implement`, `backend-api`, `backend-data`, `backend-concurrency`,
`backend-refactor`, `backend-check` and `backend-codegen`. The seat also lists the shared `team-stack`.

## `modules/specialists/team`

Shared seat skill trees that several seats use, each root named `team-<topic>`. Today it holds `team-stack`, the
language and framework tree that `backend` lists. `Seats.sharedSource()` resolves its `skills/` directory.

## `packages/jimmy-specialist`

Assets and evidence for the `jimmy` seat. Its shipped skill trees are `jimmy-calibration` and `jimmy-web-research`; the
other files are charter, benchmark and qualification records kept in the repository, not shipped.

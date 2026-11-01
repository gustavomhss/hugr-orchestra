---
name: maestro-ownership
description: Who owns each piece of Maestro (Orchestra's lead agent) and its seats, where the code lives, the invariants that must not regress, the owner decisions already taken, and what is built versus only designed. Use before answering any question about Maestro, or before changing its prompt, roster, seats, task dispatch, governance, board link, playbooks, arsenal or Claude mode.
---

# Maestro ownership

Maestro is Orchestra's primary agent: it talks to the owner, dispatches seats with `task`, keeps the Projects board current and lands
work. It does not plan (that is `archie`) or research (that is `jimmy`). How to change it: `maestro-maintenance`. How it works
day to day: `maestro-usage`. User guide: `docs/guides/maestro.md`.

## Map

| Piece | Code |
|---|---|
| Native prompt | `packages/core/src/agent/prompt/maestro.txt`, loaded as `AgentPrompt.maestro` (`agent/prompt.ts`); config `system` overrides it (`plugin/agent.ts`) |
| Roster, profiles, default labels | `modules/maestro/coordination/src/roster.ts` (`BACKEND_DEFAULT_LABEL` is the only place the backend seat's default name may appear) |
| Seat definitions and charters | `modules/maestro/coordination/src/seats/*.ts`, `seats/prompt/*.txt`, `seats/seat.ts` (`define`, `Seats.skillSource`) |
| Seat skill trees | `modules/specialists/<id>/skills` (`backend`, `archie`), `packages/<id>-specialist/skills` (others), shared `modules/specialists/team/skills`; embedded by `modules/maestro/coordination/src/seat-skills-module.ts` and `seat-skill-root.ts` |
| Seat labels, permissions, tool owners, visibility | `modules/maestro/coordination/src/v2/seats.ts` |
| Dispatch | `packages/core/src/tool/task.ts` (input, worktree, placement, return), `tool/task-governance.ts` (hook interface), `tool/text.ts` (description) |
| Maestro's conductor limits | `modules/maestro/coordination/src/v2/conductor.ts`, wired in `v2/governance/write-roots.ts`; budgets end on `session-idle` from `packages/core/src/session/runner/llm.ts` |
| Maestro's dispatch governance | `modules/maestro/coordination/src/v2/governance.ts`, `v2/governance/input.ts` (extra `task` fields incl. `card`), `v2/governance/workflow*.ts` |
| Governed-work tools (`maestro_*`) | `modules/maestro/coordination/src/v2/tools/*`, registered in `v2/tools.ts` |
| Board tools and store | `packages/core/src/board/{tools,board,github,money,forecast,proof}.ts`, schema `packages/schema/src/board.ts`, spec `docs/specs/projects-board/` |
| Merge queue (CI facts, attempts, snapshots, queue, bundles, record, board import) | `packages/core/src/board/{ci,snapshot,conflicts,queue*,record,thread,tree,ledger}.ts`; skills `conveyor-ownership`, `conveyor-usage`, `conveyor-maintenance` |
| Board drift context | `modules/maestro/coordination/src/v2/board-drift-source.ts` |
| Playbooks (shipped) | `modules/maestro/coordination/playbooks/*`, inventory `src/playbook-content.ts`, source `v2/skill-sources.ts` |
| Arsenal | `modules/maestro/arsenal/src/registry.ts`, tools `packages/core/src/tool/maestro-arsenal.ts`, `archie`'s allowlist `tool/upstream-arsenal.ts` |
| Claude mode | `modules/engine-adapters/claude-code/src/v2/host.ts` (gate, MCP server), `src/host/options.ts` (appended note); skill `claude-mode-maintenance` |
| Design and research | `docs/specs/maestro-lead/` (lead study, merge queue), `docs/specs/hugr-maestro/` (governance contracts; `SESSION-STATE.md` is a 2026-09-25 snapshot) |

## Seats

`seats/index.ts` lists nine. A seat with `skills: []` is not built yet: it has a charter only, and nobody authors its tree ahead.

| id | Role | State |
|---|---|---|
| `backend` | backend execution | built (8 skills) |
| `archie` | product, architecture, spec, plan, briefs; profile `upstream` | built |
| `jimmy` | discovery and research, `effort` tier per dispatch | built |
| `patty` | frontend execution | charter only |
| `lucy` | cold review, `maestro_record_review` | charter only |
| `billy` | security review | charter only |
| `rosie` | documentation | charter only |
| `frankie` | process audit | charter only |
| `live` | meeting copilot, primary agent, never dispatched; skill `live-seat-ownership` | own campaign |

## Invariants

- Maestro's name is fixed; every other seat is addressed by id, its display name is `agent.<id>.name` (env override first, then config,
  then the roster default; invalid labels fall back with a warning). Code, tests, docs and commits never use a default display name.
- Role boundary: Maestro delegates, decides, moves and lands. Planning, decomposition and briefs belong to `archie`; research to `jimmy`.
- Delegation goes only through Orchestra `task`. In Claude mode `Agent` and `Task` are refused at the gate and in `disallowedTools`;
  there is no subagent mirror. `ToolSearch` is always allowed.
- Claude mode is normal mode with another way to reach the model: nothing the user sees may differ. The query keeps the `claude_code`
  preset; Orchestra only appends a note.
- `task` targets a visible subagent, never Maestro. A writing seat gets `worktree: true`, a new worktree of the same repository under
  `<project>/.worktrees`; `directory` must be a worktree root of the same git store. `worktree` with `directory` or `task_id` fails.
- The board is Maestro's alone: every `board_*` call from another agent fails. The host moves cards on facts (dispatch with `card`,
  open PR, merged PR); Maestro moves the rest and never hand-carries what a fact already says.
- Shipped with a PR needs a live merged check; Review needs a linked PR; holds, pauses and a spent budget block moves.
- Playbooks are visible to Maestro only; seat skills only to their seat. A same-name skill from elsewhere overrides a playbook.
- Shipped text never names this repository's own commands, branches or rules (they belong to Orchestra's maintainers, not users).
- Rules enforced in code stay out of prompt prose.

## Owner decisions

- 2026-10-28: Claude mode equals normal mode; delegation through Orchestra `task`; no Claude Code subagents, no mirror.
- 2026-10-28: `board_read` without `project` lists projects, so Maestro picks a real key.
- 2026-10-28: the merge queue shows as one kanban column plus a status per card (conflict, fail, green); design in
  `docs/specs/maestro-lead/merge-queue.md` (PR #1108), CI facts per card in PR #1116.
- Maestro on claude-code is billed as a third-party app; never tune prompts or requests to change that.

## Built versus designed

- Built: card claim on dispatch (`card`), PR-follow to Review and Shipped (`github.ts` `follow`), board drift context, `board_read`
  project list, task in another worktree, the `maestro-orchestra` map playbook, and merge queue phase 1 (#1146): the Queue
  stage, `ci_run`, `board_queue`, `board_dequeue`, `board_bundle`, green bundles, the red path, the card thread and the
  Atlas record. See `conveyor-ownership`.
- In progress: merge queue phase 2 (lanes from the turbo affected set, the full-suite safety net, `area` and `order` in
  the plan shape), spec §7 of `docs/specs/maestro-lead/merge-queue.md`.
- Designed only (`docs/specs/maestro-lead/`): the `maestro-lead` playbook tree (not in `PlaybookContent.names`), `board_note`,
  wake on an owner's answer, stall count, digest, roster and brief shape in the `task` text, moving the authoring arsenal to `archie`.

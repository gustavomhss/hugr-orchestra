---
name: maestro-maintenance
description: How to change Maestro (Orchestra's lead agent) safely — where each kind of change goes (prompt, roster, seat, task field, board tool, playbook, arsenal operation, Claude mode), the traps that already bit, and the exact test:ci gates per area. Use before editing maestro.txt, roster.ts, seats, task.ts or governance, board tools, playbooks or the claude-code host.
---

# Maestro maintenance

Read `maestro-ownership` first (map, invariants, owner decisions). Runtime behavior: `maestro-usage`. Seat skill trees:
`seat-skill-tree-maintenance`. Claude Code host: `claude-mode-maintenance`.

## Where a change goes

- Prompt wording: `packages/core/src/agent/prompt/maestro.txt`. Say only what tools and guards cannot; a rule the code
  enforces stays out of prose. Benchmark against production prompts before growing it.
- Which tool does what, which seat owns what: the shipped map `modules/maestro/coordination/playbooks/maestro-orchestra/SKILL.md`,
  not the prompt.
- New seat or role change: `seats/<id>.ts` with `Seat.define`, charter `seats/prompt/<id>.txt`, list in `seats/index.ts`,
  profile and default label in `roster.ts`. Add tree leaves only when the seat is being built.
- New `task` field: core fields in `packages/core/src/tool/task.ts` (input schema, `tool/text.ts` description); fields only
  Maestro uses go in `modules/maestro/coordination/src/v2/governance/input.ts` and are handled in `v2/governance.ts`.
- New board tool or field: schema in `packages/schema/src/board.ts`, store in `packages/core/src/board/board.ts`, tool in
  `board/tools.ts`, the `board_*` row in `docs/specs/projects-board/CONTRACT.md` and in the `maestro-orchestra` map.
  Wire changes: `packages/protocol/src/groups/board.ts`, `packages/server/src/handlers/board.ts`, then `bun run generate`
  from `packages/client`; tell the Interface session first.
- A fact the host should move a card on: next to `claim` (`v2/governance.ts`) or `follow` (`board/github.ts`), never as a
  prompt instruction.
- New or renamed playbook: the folder under `modules/maestro/coordination/playbooks/` and its entry in
  `src/playbook-content.ts` (`PlaybookContent.names`).
- New `maestro_*` tool: `v2/tools/<name>.ts`, registered in `v2/tools.ts`, owner in `v2/seats.ts`, row in the map.
- New arsenal operation: `modules/maestro/arsenal/src/registry.ts`; add it to `tool/upstream-arsenal.ts` only if `archie`
  should run it too.
- Claude mode: `modules/engine-adapters/claude-code/src/v2/host.ts` and `src/host/options.ts`.
- Any user-visible change: `docs/guides/maestro.md` (and `claude-mode.md` if it touches Claude mode), plus these skills.

## Traps

- `orchestra-map.test.ts` requires the map to name exactly the tools Maestro is given plus the board tools. Adding a tool
  without its map row, or a row for a tool Maestro does not hold, fails.
- `specialist-name-guard.test.ts` fails on the backend seat's default display name anywhere except `BACKEND_DEFAULT_LABEL`.
  Same rule by hand for every other seat: write the id.
- `rename-guard.test.ts` (core) fails on the upstream product name in any tracked file, docs and research included.
- `seat-skills-build.test.ts` fails when an embedded playbook differs from `PlaybookContent`: a new playbook file needs the
  inventory entry.
- Shipped text (prompt, seat charters, seat skills, playbooks) must not name this repository's commands, branches or
  contributor rules. Maintainer knowledge goes in `.orchestra/skills`, runtime knowledge in a prompt or shipped skill.
- The drafted `maestro-lead` playbooks in `docs/specs/maestro-lead/playbooks` do not ship; copying them in means updating
  the inventory and the map.
- Claude mode: the query keeps the `claude_code` preset (`preset-guard.test.ts`); never set a custom `systemPrompt`.
  `Agent` and `Task` stay refused and in `disallowedTools`. Orchestra tools reach Claude Code as `mcp__orchestra__*`; a
  tool added to `UNSERVED` disappears from Claude mode only.
- `task` with `worktree` and `directory` or `task_id` is an error by design; do not "fix" it by ignoring one.
- `board_read` drops Maestro's own writes from the activity feed; a test that expects them sees nothing.
- `board_move` to Shipped with a PR runs a live GitHub merged check: tests use the board's GitHub fixture, never the network.

## Gates

Tests run only through `bun run test:ci` on Actions; typecheck through the `typecheck.yml` dispatch. Then
`bun run check:guards --base origin/dev`.

| Area | Command |
|---|---|
| Roster, seats, map, playbooks | `bun run test:ci maestro test/roster.test.ts test/specialist-name-guard.test.ts test/orchestra-map.test.ts test/seat-framework.test.ts test/v2-seats.test.ts test/v2-skills.test.ts test/seat-skills-build.test.ts` |
| Dispatch governance, card claim | `bun run test:ci maestro test/v2-task-governance.test.ts test/governed-task.test.ts test/v2-board-drift.test.ts test/v2-tools.test.ts` |
| `task` tool | `bun run test:ci core test/tool-task.test.ts test/tool-task-cold.test.ts test/tool-task-governance.test.ts test/task-governance.test.ts` |
| Board | `bun run test:ci core test/board.test.ts test/board-tools.test.ts test/board-github.test.ts test/board-budget.test.ts test/board-spend.test.ts` |
| Prompt, upstream name | `bun run test:ci core test/agent.test.ts test/rename-guard.test.ts` |
| Claude mode | `bun run test:ci engine-claude-code test/v2-host.test.ts test/v2-host-seats.test.ts test/preset-guard.test.ts` |

The full suite runs once per epic (the `epic` label on the epic PR), not per change.

---
name: claude-mode-maintenance
description: Who owns Claude mode (Orchestra on Claude Code as a meta-harness), the invariants that must not regress, and how to change and test it
---

# Claude mode maintenance and ownership

Design and decisions: `docs/specs/claude-mode/meta-harness.md`. User guide: `docs/guides/claude-mode.md`.

## Ownership

| Piece | Owner file |
| --- | --- |
| Per-turn host (SDK query, hooks, gate, subagents) | `modules/engine-adapters/claude-code/src/v2/host.ts` |
| Appended note, foreground seats, environment | `modules/engine-adapters/claude-code/src/host/options.ts` |
| SDK seam and `claude_code` preset | `modules/engine-adapters/claude-code/src/sdk.ts` |
| Turn shape (`context`, `seats`, `authorize({ agent })`) | `packages/core/src/session/runner/execution-host.ts` |
| What the runner hands the host | `packages/core/src/session/runner/llm.ts` |

## Invariants

- `systemPrompt` is always the `claude_code` preset with `ClaudeHostOptions.append(...)`. Never a custom prompt, never
  the seat's full Orchestra prompt or the Context Epoch baseline (`test/preset-guard.test.ts`).
- `Turn.context` goes in through the `UserPromptSubmit` hook, deduplicated by `contextHash` in host state, and again
  in the `SessionStart` compact hook.
- Seats are SDK `agents` named `orchestra:<id>`; the research seat is one entry per tier with that tier's `maxTurns`.
- `Agent`/`Task` calls pass the gate as permission action `task` on the seat id, never unchecked. A foreground seat
  (`FOREGROUND_SEATS`) is refused with `run_in_background`.
- A tool call inside a subagent (`agent_type` on the hook input) is authorized under that seat; the runner ignores an
  agent id that is not in `seats`.
- `Turn.skills` holds each seat's skills as `SkillV2.available` lists them for that seat; `subagents` lists them by
  file in the seat's prompt. Seat entry skills come from `SeatSkillRoot.roots` (`MaestroSkillSourcesV2.seats`) and
  `MaestroSeatsV2.visibility` denies them to every other agent.
- `shown` renames a built-in call for Orchestra's record only (Bash to `bash`, Agent to `task` with the seat id,
  TodoWrite result as `{"todos": [...]}`). Never apply it to what reaches Claude Code or to the permission gate,
  which keep Claude Code's names. A new widget field means a new mapping there, covered in `v2-host.test.ts`.
- Orchestra MCP tools are refused inside a subagent (`MAIN_ONLY`, at the gate and in `canUseTool` via `agentID`) and
  listed in each subagent's `disallowedTools`: the MCP request carries no agent, so they would run under the main
  agent's registry and permissions.
- A subagent's frames (`parent_tool_use_id` set) never reach the parent's stream: `mirror` records them in the child
  Session `Turn.child` opens for that task call (`packages/core/src/session/runner/llm.ts`), and `close` ends it on the
  call's result. The child is never woken and its step costs 0. Its permissions come from `TaskPermission`, shared with
  the task tool; `tool/task.ts` cannot be imported by the runner (cycle through `SessionV2`).
- Governed dispatch stays MCP: `mcp__orchestra__task`, `mcp__orchestra__maestro_request_review`.
- Billing: never change prompts, headers or tools to influence how Anthropic classifies usage, and never probe it.

## Testing

- Host behavior: `bun run test:ci engine-claude-code test/v2-host.test.ts test/preset-guard.test.ts`.
- Runner side: `bun run test:ci core test/session-runner-execution-host.test.ts`.
- A real subscription turn needs the owner's Claude login; run it only in an isolated dev app.

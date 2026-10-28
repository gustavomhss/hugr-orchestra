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
| What the runner hands the host (`seatTools`, `seatOnly`, the seat-scoped settle) | `packages/core/src/session/runner/llm.ts`; `notify`, `child` (with `execute`) and `todos` in `host-ports.ts` |
| Built-in calls under Orchestra's names, task list as todos (`shown`, `checklist`) | `modules/engine-adapters/claude-code/src/v2/record.ts` |
| Built-in results as Orchestra's tools record them (todo panel, edit diff) | `modules/engine-adapters/claude-code/src/v2/output.ts` |
| In-process MCP server and streaming input (`server`, `inbox`) | `modules/engine-adapters/claude-code/src/v2/channel.ts` |

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
- `ClaudeCodeOutput.settle` gives a settled built-in the `output.structured` Orchestra's tool records: a TodoWrite
  also calls `Turn.todos`, which writes the Session's todos (`SessionTodo.write`) so the todo panel shows them, with
  priority `medium` since Claude Code has none; an Edit carries `files` built from the SDK's `tool_use_result.structuredPatch`
  in `createTwoFilesPatch` form. A subagent's frames go through the same `settle`, so its TodoWrite writes the child
  Session's todos (the child handle's `todos`), never the parent's.
- Claude Code builds with a task list send `TaskCreate`/`TaskUpdate` instead of TodoWrite. `ClaudeCodeRecord.checklist`
  turns each into a `todowrite` holding the whole list; `assign` takes the task id from the TaskCreate result. The
  list lives in host state (`checklist`) because an update in a later turn names an id from an earlier one: never keep
  it only in turn memory.
- `ClaudeCodeRecord.UNRECORDED` (`ToolSearch`) stays off the record, call and result; Claude Code still runs it. Add
  a tool there only when it is Claude Code plumbing with no Orchestra widget.
- An Orchestra MCP tool inside a subagent runs in the child Session under the seat (`child.execute`), never under the
  main agent. The gate ties its tool_use id to the delegation (`inside`, from `task_started`'s task id = the agent
  id); the MCP request is matched by `_meta["claudecode/toolUseId"]`. Every unresolved case refuses (`MAIN_ONLY`): no
  delegation, no seat, child ended, an id the gate never allowed, or no `_meta` while a subagent call of that tool is
  pending. Never fall back to `turn.execute` for a subagent's call. `disallowedTools` keeps only the tools not in
  `Turn.seatTools[seat]`. The server serves `Turn.tools` plus `Turn.seatOnly` (tools only seats hold); a main-agent
  call of a seat-only tool is refused (`SEAT_ONLY`). Without `seatOnly`, a tool the main agent is denied never reaches
  any subagent.
- `HOST_REACH` (`ListAgents`, `SendMessage`, `RemoteTrigger`, `PushNotification`) is refused before any permission
  check: these built-ins reach other Claude sessions on the machine, the account's routines or the owner's phone.
  When Claude Code adds a built-in that crosses the query's boundary, add it here.
- A subagent's frames (`parent_tool_use_id` set) never reach the parent's stream: `mirror` records them in the child
  Session `Turn.child` opens for that task call (`packages/core/src/session/runner/host-ports.ts`), and `end` closes it on the
  call's result, or, for a backgrounded delegation (`mark`), on its `task_notification` in `follow`. The child's agent
  is `ClaudeCodeRecord.seat` (built-in types through `BUILT_IN_SEATS`, `""` never a seat); its model is the first
  assistant frame's. The child is never woken and its step costs 0. Its permissions come from `TaskPermission`, shared with
  the task tool; `tool/task.ts` cannot be imported by the runner (cycle through `SessionV2`).
- Governed dispatch stays MCP: `mcp__orchestra__task`, `mcp__orchestra__maestro_request_review`.
- Switching the engine in the app (`enableClaudeMode`, `setMaestroEngine`) goes through `updateConfig`. Its
  `onSuccess` runs while the mutation is still pending, which pauses the refresh queue, so the open directories it
  re-queues drain only on `queue.resume()` when `reload` settles (`packages/app-shell/src/context/server-sync.tsx`).
  Without it the composer keeps Maestro's old engine and drops every `executionHost` model, leaving "Select model".
- Billing: never change prompts, headers or tools to influence how Anthropic classifies usage, and never probe it.

## Testing

- Host behavior: `bun run test:ci engine-claude-code test/v2-host.test.ts test/v2-host-subagent.test.ts test/preset-guard.test.ts`.
- Runner side: `bun run test:ci core test/session-runner-execution-host.test.ts test/session-runner-execution-host-ports.test.ts`.
- A real subscription turn needs the owner's Claude login; run it only in an isolated dev app.

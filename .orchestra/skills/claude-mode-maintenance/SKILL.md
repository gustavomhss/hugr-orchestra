---
name: claude-mode-maintenance
description: Who owns Claude mode (Orchestra on Claude Code as a meta-harness), the invariants that must not regress, and how to change and test it
---

# Claude mode maintenance and ownership

Design and decisions: `docs/specs/claude-mode/meta-harness.md`. User guide: `docs/guides/claude-mode.md`.

Maestro itself (prompt, roster, dispatch, board, playbooks): `maestro-ownership`, `maestro-usage`, `maestro-maintenance`.

## Ownership

| Piece | Owner file |
| --- | --- |
| Per-turn host (SDK query, hooks, gate) | `modules/engine-adapters/claude-code/src/v2/host.ts` |
| Appended note, environment | `modules/engine-adapters/claude-code/src/host/options.ts` |
| SDK seam and `claude_code` preset | `modules/engine-adapters/claude-code/src/sdk.ts` |
| Turn shape (`context`, `authorize`, `todos`), and which engine a Session runs on (`engineOf`) | `packages/core/src/session/runner/execution-host.ts` |
| What the runner hands the host (`notify`, `todos`) | `packages/core/src/session/runner/llm.ts` |
| Built-in calls under Orchestra's names, task list as todos (`shown`, `checklist`) | `modules/engine-adapters/claude-code/src/v2/record.ts` |
| Built-in results as Orchestra's tools record them (todo panel, edit diff) | `modules/engine-adapters/claude-code/src/v2/output.ts` |
| In-process MCP server and streaming input (`server`, `inbox`) | `modules/engine-adapters/claude-code/src/v2/host.ts` |

## Invariants

- `systemPrompt` is always the `claude_code` preset with `ClaudeHostOptions.append(...)`. Never a custom prompt
  (`test/preset-guard.test.ts`), and never the Context Epoch baseline. Maestro's append is its short note only.
- `Turn.context` goes in through the `UserPromptSubmit` hook, deduplicated by `contextHash` in host state, and again
  in the `SessionStart` compact hook.
- Claude mode differs from normal mode only in how the model is reached. The app shows the same screens and widgets;
  a change that makes Claude mode look or behave differently is a defect unless Anthropic's rules require it.
- Seats are dispatched through Orchestra's `task`, as in normal mode: a durable child Session. Never through Claude
  Code's `Agent`/`Task`, which are in `disallowedTools` and refused at the gate (`SUBAGENT_TOOLS`).
- A child Session runs on `engineOf`: its agent's own `engine`, else Orchestra's loop for a non-Anthropic model, else
  its parent's engine. The runner and `tool/task.ts` share this one function; never decide the engine twice.
- A hosted child's Anthropic models count as available without an API connection: the host holds the Claude sign-in,
  which the catalog never sees (`resolveModel`'s `hosted` in `tool/task.ts`). A child on Orchestra's own loop still
  needs a connected provider.
- A seat other than Maestro gets its own Orchestra prompt in the append (`turn.system` minus `turn.context`).
- `ClaudeCodeRecord.shown` renames a built-in call for Orchestra's record only (Bash to `bash`, TodoWrite result as
  `{"todos": [...]}`). Never apply it to what reaches Claude Code or to the permission gate, which keep Claude Code's names. A new widget field means a new mapping there, covered in `v2-host.test.ts`.
- `ClaudeHostOptions.append` takes the served Orchestra tool names and writes a line only for a tool served: a line
  for an unserved tool sends the model after a failing call. `skill` is served (Claude Code's Skill tool does not
  know Orchestra's playbooks); `process_get`, `process_wait` and `process_cancel` are not.
- `ClaudeCodeOutput.settle` gives a settled built-in the `output.structured` Orchestra's tool records: a TodoWrite
  also calls `Turn.todos`, which writes the Session's todos (`SessionTodo.write`) so the todo panel shows them, with
  priority `medium` since Claude Code has none; an Edit carries `files` built from the SDK's `tool_use_result.structuredPatch`
  in `createTwoFilesPatch` form.
- Claude Code builds with a task list send `TaskCreate`/`TaskUpdate` instead of TodoWrite. `ClaudeCodeRecord.checklist`
  turns each into a `todowrite` holding the whole list; `assign` takes the task id from the TaskCreate result. The
  list lives in host state (`checklist`) because an update in a later turn names an id from an earlier one: never keep
  it only in turn memory.
- `ClaudeCodeRecord.UNRECORDED` (`ToolSearch`) stays off the record, call and result; Claude Code still runs it. Add
  a tool there only when it is Claude Code plumbing with no Orchestra widget.
- Governed dispatch stays MCP: `mcp__orchestra__task`, `mcp__orchestra__maestro_request_review`.
- Billing: never change prompts, headers or tools to influence how Anthropic classifies usage, and never probe it.

## Testing

- Host behavior: `bun run test:ci engine-claude-code test/v2-host.test.ts test/v2-host-seats.test.ts test/preset-guard.test.ts`.
- Runner side: `bun run test:ci core test/session-runner-execution-host.test.ts test/session-runner-execution-host-ports.test.ts test/tool-task.test.ts test/tool-task-cold.test.ts`.
- A real subscription turn needs the owner's Claude login; run it only in an isolated dev app.

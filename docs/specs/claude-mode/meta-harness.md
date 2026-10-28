# Claude mode as a meta-harness on the V2 Session core

Status: decided 2026-10-27, delegation revised 2026-10-28, implemented in `modules/engine-adapters/claude-code/src/v2/host.ts`.

## Problem

Claude mode was designed as a meta-harness. Orchestra runs on top of an unmodified Claude Code, the way a plugin
would, and Claude Code keeps its own prompt, tools, loop, login and context window. The V1 host
(`apps/orchestra/src/claude-code/host/*`, deleted in 2535c3d2d7) did this:

- It appended a short Orchestra persona to the `claude_code` preset (`ClaudeHostOptions.append`).
- It shipped Orchestra's seats as Claude Code subagents named `orchestra:<seat>`.
- Delegation went through Claude Code's own `Agent` tool.

The B1-C port (lead decision D-C2, `docs/architecture/phase-plans/70c/plan-b1c.md`) made Claude Code a per-turn
`ExecutionHost`, and in doing so it dropped that shape:

- The host appended the whole Orchestra system text to the preset: the seat prompt, the Context Epoch baseline and the
  workflow instructions.
- It defined no subagents and refused Claude Code's `Agent` and `Task` tools.

As a result, a Claude mode session looked like a different application wrapping Claude rather than Claude Code with
an extension. In the 2026-10-27 live test, a Claude subscription turn was refused with a 400 (third-party usage).

## Decision

D-C2 still stands in one respect: one Claude Code SDK turn per V2 provider turn, resuming the same Claude Code session
(`claude --resume`). The host still owns steers, questions, compaction hooks and background tails.

The parts of D-C2 that replaced the meta-harness shape are reversed:

1. **Short append.** The preset append is `ClaudeHostOptions.append(agent, tools, own)`: the Maestro persona for
   Maestro, or a short seat note and the seat's own prompt for any other seat (decision 4). The context is never
   appended.
2. **Context as hook context.** The Context Epoch baseline and the Relay workflow instructions (`Turn.context`) reach
   Claude Code as `additionalContext` from a `UserPromptSubmit` hook, the channel Claude Code documents for this. The
   text is sent only when its hash differs from the last one delivered to the Claude Code session (`contextHash` in
   host state). It is sent again after a compaction, alongside the recalled todos.
3. **Seats through Orchestra's task (2026-10-28).** Claude mode delegates exactly as normal mode does. Maestro
   dispatches a seat with `mcp__orchestra__task`; the task tool opens a durable child Session, governed and admitted
   as on Orchestra's own engine, which the app shows from the task row. The child runs on the engine `engineOf`
   (`packages/core/src/session/runner/llm.ts`) picks: the seat's own `engine` when it names one, else Orchestra's own
   loop when the child's model is not Anthropic's, else the parent Session's engine. So a seat a Claude-mode Maestro
   dispatches on a Claude model runs on Claude Code. Claude Code's own `Agent` and `Task` tools are listed in
   `disallowedTools` and refused at the PreToolUse gate (`SUBAGENT_TOOLS`), with a reason that names
   `mcp__orchestra__task`.

   This replaces the 2026-10-27 shape, where seats were Claude Code subagents (`orchestra:<seat>`) mirrored into
   record-only child Sessions. That shape differed from normal mode: subagent children were never woken, had no
   governance reservation, could not use Orchestra's tools and lost frames after the turn. The owner's rule is that
   Claude mode differs from normal mode only in how the model is reached.
4. **A seat keeps its own prompt.** For a seat other than Maestro, `ClaudeHostOptions.append(seat, tools, own)` appends
   a short seat note and the seat's own Orchestra prompt (`turn.system` without `turn.context`), still after the
   `claude_code` preset. Maestro keeps its short note, which says to dispatch through `mcp__orchestra__task`.
5. **Governed paths are the same tools.** Approved Relay workflows dispatch through `mcp__orchestra__task`, and
   governed review goes through `mcp__orchestra__maestro_request_review`, as in normal mode.
6. **Skills through Orchestra's skill tool.** Every seat loads its skills with `mcp__orchestra__skill`, which lists
   what that seat may load, as in normal mode.
7. **Permissions.** Every Claude Code call passes the PreToolUse gate and is authorized under the Session's own agent,
   which in a child Session is the seat.
8. **What is served.** Orchestra tools that duplicate a Claude Code built-in or belong to Orchestra's own loop are not
   served (`UNSERVED`), and neither are `process_get`, `process_wait` and `process_cancel`, which read Orchestra's own
   bash processes. `skill` is served: Claude Code's Skill tool does not know Orchestra's playbooks. The Maestro note
   names only tools the session is served: `mcp__orchestra__skill` for playbooks, `board_read` at the start of a
   tracked turn, `process_control` for long-running commands, then the governed, Atlas, Dock and recall families.
9. **Orchestra's record, Claude Code's call.** The Session records each built-in call under the Orchestra tool and
   argument names the app's widgets read (`shown` in the host), so a Claude mode session looks like any other:
   - `Bash`, `Read`, `Write`, `Edit` (`MultiEdit` and `NotebookEdit` as `edit` with the file only), `Glob`, `Grep`,
     `WebFetch`, `WebSearch`, `TodoWrite` and `Skill` become `bash`, `read`, `write`, `edit`, `glob`, `grep`,
     `webfetch`, `websearch`, `todowrite` and `skill`, with Orchestra's argument names (`filePath`, `oldString`, ...).
   - A `TodoWrite` result is recorded as the list it wrote (`{"todos": [...]}`), which the todo widget renders.
   - Any other tool keeps its Claude Code name and input.

   Only Orchestra's record changes, after Claude Code ran the call. The prompt, tools, inputs and results Claude Code
   sends to and receives from Claude are untouched, and the permission gate still reads Claude Code's own names.
## Not in scope (known limits)

- Claude Code's todos are not written to the Session's todo list (the todo panel); the todo widget in the transcript
  shows them.
- An `edit` row has no diff metadata, so the edit widget shows the change from its input only.
- The host still starts one Claude Code process per turn. A long-lived query per session would remove the resume
  start-up cost; it is not needed for correctness.

## Billing rule

Claude mode exists only because Anthropic allows a Claude subscription through Claude Code. It respects everything
Anthropic defines: Claude Code runs the model, the `claude_code` preset is kept and only appended to, and Anthropic
classifies and bills each turn. The interface, widgets and behavior are the same as normal mode; anything else that
differs is a defect.


This change restores the designed integration. Nothing in it is tuned to change how Anthropic classifies usage, and no
probing of that classification is done. If a subscription turn is still billed as third-party usage, the app shows
the provider's message and offers the owner's choices (extra usage, an API key or another provider).

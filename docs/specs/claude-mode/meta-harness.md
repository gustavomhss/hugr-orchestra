# Claude mode as a meta-harness on the V2 Session core

Status: decided 2026-10-27, implemented in `modules/engine-adapters/claude-code/src/v2/host.ts`.

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

1. **Short append.** The preset append is `ClaudeHostOptions.append(agent, seats)`: the Maestro persona for Maestro,
   or a short seat note for any other main seat. The seat's full Orchestra prompt is not appended.
2. **Context as hook context.** The Context Epoch baseline and the Relay workflow instructions (`Turn.context`) reach
   Claude Code as `additionalContext` from a `UserPromptSubmit` hook, the channel Claude Code documents for this. The
   text is sent only when its hash differs from the last one delivered to the Claude Code session (`contextHash` in
   host state). It is sent again after a compaction, alongside the recalled todos.
3. **Seats as subagents.** `Turn.seats` lists the agents the task tool could target: visible, not primary, and neither
   the default agent nor the main one. Each becomes an SDK `agents` entry `orchestra:<id>` with:
   - the seat's description;
   - its prompt, with "the task delegation tool" read as "the Agent delegation tool";
   - its `anthropic` model, or `inherit` when it has none.

   The research seat becomes one entry per tier (`orchestra:jimmy-<tier>`), each with that tier's `maxTurns` and the
   research seat's Claude Code tools.
4. **Delegation through `Agent`.** An `Agent` (or `Task`) call passes the PreToolUse gate as V2 permission action
   `task`, with the seat id as its resource. That is the action and resource Orchestra's own task tool asks for.
   - A seat that must stay in the foreground (`FOREGROUND_SEATS`) is refused with `run_in_background`.
   - A tool call made inside a subagent carries `agent_type`. The gate maps it back to the seat and authorizes the
     call under that seat's permission rules (`Turn.authorize({ agent })`).
5. **Governed paths stay MCP tools.** Approved Relay workflows still dispatch through `mcp__orchestra__task`, and
   governed review through `mcp__orchestra__maestro_request_review`. The appended Maestro text says so.
6. **Seat skills by file.** `Turn.skills` carries, for each seat, the skills Orchestra's skill tool would list for it
   (`SkillV2.available`). The subagent prompt ends with a `# Skills` block naming each skill's file, which the
   subagent reads with Claude Code's Read tool. Seat entry skills (`<seat-id>-*`) are registered from
   `SeatSkillRoot.roots` on V2 for every engine and denied to every agent but their seat.
7. **A seat's Orchestra tools run in its child Session.** Claude Code names the call an MCP request runs in its
   `_meta` (`claudecode/toolUseId`). When the gate allows an Orchestra tool inside a subagent (`agent_id` set), it
   ties that tool_use id to the delegation whose task Claude Code started as that agent (`task_started`). The request
   then runs through the child handle's `execute`: recorded in the child Session and settled there under the seat's
   rules and the child's own, as inside Orchestra's task tool. The call is refused (fail closed) when the agent names
   no delegation, the delegation has no seat, the child has ended, the request names a call the gate never allowed,
   or, without `_meta`, a subagent's call of the same tool is pending. Each subagent lists in `disallowedTools` the
   turn's Orchestra tools its seat may not call (`Turn.seatTools`).
8. **Orchestra's record, Claude Code's call.** The Session records each built-in call under the Orchestra tool and
   argument names the app's widgets read (`ClaudeCodeRecord.shown`, `src/v2/record.ts`), so a Claude mode session looks like any other:
   - `Bash`, `Read`, `Write`, `Edit` (`MultiEdit` and `NotebookEdit` as `edit` with the file only), `Glob`, `Grep`,
     `WebFetch`, `WebSearch`, `TodoWrite` and `Skill` become `bash`, `read`, `write`, `edit`, `glob`, `grep`,
     `webfetch`, `websearch`, `todowrite` and `skill`, with Orchestra's argument names (`filePath`, `oldString`, ...).
   - `Agent` and `Task` become `task`, with the seat id as `subagent_type`.
   - A `TodoWrite` result is recorded as the list it wrote (`{"todos": [...]}`), which the todo widget renders, and
     replaces the todo list (the todo panel) of the Session it ran in: a subagent's goes to its child Session.
   - Claude Code builds that replaced `TodoWrite` with a task list (`TaskCreate`, `TaskUpdate`) are recorded the same
     way: each call becomes a `todowrite` holding the whole list after it. The host keeps its copy of the list, with
     Claude Code's task ids, in host state (`checklist`), so an update in a later turn still finds its entry.
   - An `Edit` or `MultiEdit` result carries its patch and line counts, as Orchestra's edit tool records them.
   - Any other tool keeps its Claude Code name and input.
   - `ToolSearch`, which only loads deferred tool schemas and has no Orchestra counterpart, is left off the record
     with its result (`ClaudeCodeRecord.UNRECORDED`), so the session shows no row Orchestra's own engine would not.

   Only Orchestra's record changes, after Claude Code ran the call. The prompt, tools, inputs and results Claude Code
   sends to and receives from Claude are untouched, and the permission gate still reads Claude Code's own names.
9. **Subagent runs in a child Session.** A subagent's frames carry its `Agent` call's id (`parent_tool_use_id`). The
   host records them in a child Session the runner opens through `Turn.child`, as the task tool would: the parent
   Session as parent, the seat as agent, the parent's inherited permissions and the delegated prompt as its user
   message, with the task row's progress naming the child, so the row opens it. The child is a record only: it is
   never woken and its step carries no cost, which the parent's step already counts. It ends with the call's result;
   a delegation Claude Code moved to the background (`is_backgrounded`) ends instead when its task reports
   (`task_notification`), and its frames after the turn's result are still mirrored. A built-in subagent type runs as
   the seat that does its work (`general-purpose` as `general`); the child runs on the model that answered in the
   subagent, else the seat's.

## Not in scope (known limits)

- Mirrored subagents have no Task Governance dispatch reservation.
- A subagent type that is neither an Orchestra seat nor a built-in with a seat in the turn is recorded under the main
  agent's id, and cannot call Orchestra's tools.
- The host starts one Claude Code process per turn, resumed from its transcript. A long-lived query per Session would
  only save that start-up; it is declined: every turn sets its own tools, MCP server, hooks, model and permission mode
  from the Session, and one query kept across turns would have to change those mid-run, a seam the user could notice.
  A query is kept past its turn only for background work, as today.

## Billing rule

This change restores the designed integration. Nothing in it is tuned to change how Anthropic classifies usage, and no
probing of that classification is done. If a subscription turn is still billed as third-party usage, the app shows
the provider's message and offers the owner's choices (extra usage, an API key or another provider).

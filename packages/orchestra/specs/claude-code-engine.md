# Claude Code as Orchestra's host

Status: 2026-10-12. **Temporary rollout pause retired** (see "Rollout activation" below). The design is the meta-harness plan,
`HuGR/_worktrees/archie-state/meta-harness/PLAN.md`: §2 compliance map, §3 Phase 0, §4 architecture, §8 acceptance.
This file describes the code as it is. The first engine's design (Orchestra deciding turns, disabled and aliased
built-ins, `settingSources: []`, a precedence-claiming prompt, `sessionStore.load` rewriting) is removed (plan §4.7);
its record is in git history.

## Two modes

- **Normal mode.** Orchestra's own loop (`session/prompt.ts`, `session/llm.ts`, the processor), with any provider and
  Orchestra's own continuity. This is the default.
- **Claude mode.** Claude Code is the host: the unmodified binary, through the Claude Agent SDK, keeps the loop, the
  model, its `claude_code` prompt preset, its own tools, its own login and its own compaction. Orchestra plugs in through
  the documented extension points only and mirrors the session into its own, so the UI stays the same.

**The switch.** Exactly one setting decides the mode of an agent: `agent.<id>.engine`. `"claude-code"` is Claude mode;
absent or `"orchestra"` is normal mode (`agent/agent.ts`). Nothing else changes the mode.

**The boundary.** All Claude mode code lives in `src/claude-code/`. Its single entry point is `claude-code/engine.ts`
(`ClaudeCode.Service.turn`), which the normal loop calls once per turn (`session/prompt.ts`): it returns `false` for a
normal-mode agent, and otherwise pauses Orchestra's continuity on the session (Claude Code compacts its own context, so
Orchestra makes no maintenance model call) and hands the turn to the host. Normal-mode code imports nothing else from
`src/claude-code/`, and Claude mode never imports the loop. `test/claude-code/mode-boundary.test.ts` parses every import
under `src` and fails on any other crossing; its `INTERFACE` list is the declared interface, extended only with a reason.

## The host (`src/claude-code/host/`)

- **`session.ts`** (`ClaudeHost`): one long-lived SDK `query()` per active Orchestra session, fed by a streaming input
  (plan §4.1). A turn sends the owner's undelivered messages and waits for Claude Code's `result`; a steer goes into the
  same input with `priority: "next"`; Stop is `interrupt()`; the model picker is `setModel()`. Claude Code's session id
  is derived 1:1 from the Orchestra session id, so resume and fork use the SDK's own `resume` / `forkSession`. An idle
  session releases its process.
- **`options.ts`**: the SDK options. The `claude_code` preset with an appended seat text (Maestro's persona, plan
  §4.4), never a custom prompt or a main-thread agent; `settingSources: ["project"]`; built-ins never disabled or
  aliased; the owner's environment as it is. It refuses a session whose hooks carry no `PreToolUse` gate.
- **`plugin.ts`, `mcp.ts`, `process-tool.ts`**: the generated `orchestra` plugin (one subagent per seat, the skills) and
  the in-process `orchestra` MCP server with Orchestra's additive tools, `process` included (plan §4.3, §6).
- **`hooks.ts`, `gate.ts`, `delegation.ts`, `join.ts`**: in-process SDK hooks, always wired. `PreToolUse` is Orchestra's
  policy gate for every call, built-in and MCP (a deny always wins, spike S7). Delegation records for Claude Code's
  `Agent` dispatches follow Archie's contract V2 (`dispatchKind: "claude-code-agent"`, plan §4.5), joined on the Agent
  `tool_use_id` through `system/task_started` (spike S3).
- **`mirror.ts`**: Claude Code's stream onto Orchestra's message parts, over the base turn mirror (`../mirror.ts`).
  Subagent frames (`parent_tool_use_id`) go to the subagent's child session. A seat dispatch gets its child session
  from the delegation hooks at `PreToolUse[Agent]`; any other subagent gets one at its first frame. Either way it exists
  before the subagent's first tool call, so an `orchestra` MCP call by a subagent finds its mirrored part.

## Auth

Orchestra never touches Claude Code credentials. The binary signs in from its own store (`claude auth login`) or uses
the owner's `ANTHROPIC_API_KEY` / `apiKeyHelper`. `ClaudeCodeSDK.processLifetime` spawns it with the owner's environment:
it adds no token, scope, plan, tier or host-managed provider variable and strips no credential. The deprecated
`ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED` flag is stripped from the child environment as compatibility metadata, not an
activation requirement. The host also drops inherited `CLAUDE_CODE_ENTRYPOINT` so the SDK identifies its own caller
and enables documented task output (`host/options.ts`); neither collects credentials or sets billing controls. Sign-in status comes from `accountInfo()`
(spike S2) and the init frame, never a secret. A signed-out session ends the turn with "Claude Code is not signed in.
Sign in to Claude in Settings › Claude mode, or run `claude auth login`, then send your message again." The app's Sign in
(`POST /provider/claude-code/login`, `claude-code/login.ts`) runs that same `claude auth login --claudeai` with the
binary Claude mode runs; the CLI opens the browser and stores the login, and Orchestra relays only the fallback URL and
the code the owner pastes. `GET /provider/claude-code/account` reports `accountInfo()`'s email and subscription. A billing refusal ends it with "Anthropic
returned: <message>", verbatim, and is never retried.

Tests: `test/claude-code/spawn-environment.test.ts` (spawn-environment audit), `test/claude-code/credential-access.test.ts`
(no package source or script reads the Keychain item or `.credentials.json`).

## Continuity in Claude mode

Claude Code's own auto-compaction keeps the session's context. Orchestra makes no side model call through Claude Code
and keeps the session's Orchestra continuity paused. After a compaction, `SessionStart(compact)` returns Orchestra's
working memory from durable records as `additionalContext`, and `PostCompact` archives Claude Code's summary for
`context_recall` (`host/hooks.ts`, plan §4.6). Normal mode's continuity is unchanged.

## Rollout activation

The owner approved the original meta-harness plan and explicitly requested finishing the campaign through PR, CI and
`dev`. Real Archie acceptance and S14 completed. Under that approved plan and current acceptance, the temporary
rollout pause is retired: Claude mode and its documented account-status probe no longer require
`ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED=1` in the server environment.

This retires only the fulfilled rollout condition. It does not grant new authorization, change billing, or guarantee
blanket policy compliance. The structural `claude_code` preset guard, executable resolution and pinned binary,
credential inheritance, real child-exit tracking, policy gates, write-root checks and account checks remain in force.
Claude mode startup failures still end the turn without retry or fallback to Orchestra's API transport.

`test/claude-code/plan-approval.test.ts` covers a real SDK query reaching an injected throwing spawner without the
flag, a real scratch subprocess receiving credentials unchanged but no deprecated flag, and Maestro/Archie turns
surfacing a real SDK spawn failure once with no API fallback. These checks make no model request or successful
engine-acceptance claim.

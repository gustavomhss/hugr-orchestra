---
name: maestro-orchestra-engines-claude-mode
description: How Claude mode runs agents on Claude Code with the owner's Claude subscription, what stays the same, which Claude Code tools are refused, the governed-tool gate, sign-in and billing messages.
internal: true
when: The owner asks about Claude mode, signing in with Claude, why a Claude Code tool was refused, why a governed maestro tool is blocked, or what a billing message means.
not-when: The question is about API-key providers and models; open models.
covers: [modules/engine-adapters/claude-code]
---

# Claude mode

Claude mode runs an agent's turns inside Claude Code, signed in with the owner's Claude login. Orchestra treats Claude
Code as an execution host for one provider turn, not as a second orchestrator. The interface, Maestro, seats, board,
workflows, permissions and skills are the same as in normal mode; only the way the model is reached changes.

## Turning it on

- Settings, Providers, Claude mode. The sign-in runs Claude Code's own `claude auth login --claudeai`; the app relays the
  URL and the pasted code, and Claude Code stores the login. Orchestra stores no Claude credential.
- Mechanically, an agent's `engine` is `claude-code`. The catalog advertises the Anthropic provider without an API key only
  when Maestro's configured engine is `claude-code`.
- Signed out, the message is: "Claude Code is not signed in. Sign in to Claude in Settings, Claude mode, or run
  `claude auth login`, then send your message again." The signed-in status is cached for 10 minutes.

## Rules of the host

| Rule | Detail |
|---|---|
| One turn, one call | The runner admits the prompt, loads history and persists events; one provider turn is one `ExecutionHost.stream` call. Claude Code compacts its own context. |
| Claude Code keeps its prompt | `query()` always uses the `claude_code` preset and appends an Orchestra note. A custom system prompt is never used. |
| Orchestra tools | Served as the `orchestra` MCP server (`mcp__orchestra__*`); the runner settles their permissions. |
| Claude Code's own tools | Pass a PreToolUse gate running Orchestra's permissions, ToolSafety and the sandbox; it fails closed. |
| Seats stay sessions | `Agent` and `Task` are disallowed; dispatch with `mcp__orchestra__task`. |
| Refused outright | `ListAgents`, `SendMessage`, `RemoteTrigger`, `PushNotification` reach outside the session. |
| Maestro's built-ins | Besides mapped tools, Maestro keeps only task-list tools, plan mode and background-shell output; others are refused. |
| Settings | `settingSources` is `project` only. |

A child seat runs on Claude Code only when it names engine `claude-code`, or names no engine and runs a Claude
(Anthropic) model under a lead that is hosted; a seat on another provider's model runs on Orchestra's own loop.

## The governed gate

The host refuses a governed `maestro_*` tool until the session has loaded `maestro-run-governed` through
`mcp__orchestra__skill`. The refusal reads: load that playbook with `mcp__orchestra__skill` before governed Maestro tools.
`maestro_arsenal_*` and `maestro_workflows` are excluded from the gate. The playbook name stays in step across
`packages/core/src/agent/prompt/maestro.txt`, the gate in `v2/host.ts` and the playbook under
`modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md`; change all three together.

## Billing and errors

- Anthropic decides how a turn is billed. Orchestra never tunes prompts, tools or requests to influence it.
- A billing refusal (text matching third-party app, extra usage, plan limits or billing_error) is shown as "Anthropic
  returned: ..." and never retried. The owner can enable extra usage, use an API key, or pick another provider.
- Cost comes from Claude Code's own total. Each turn starts one Claude Code process; the process environment is the
  owner's, minus `CLAUDE_CODE_ENTRYPOINT`, plus `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`.
- Steers sent mid-turn reach the running engine; the todo panel is filled from Claude Code's task tools.

## `modules/engine-adapters/claude-code`

Adapter that registers the `claude-code` execution host. `src/v2/host.ts` is the turn, the gate and the tool maps;
`src/v2/account.ts` and `login.ts` read sign-in status and run the sign-in; `src/v2/catalog.ts` advertises Anthropic in
Claude mode; `src/host/options.ts` builds the appended note (Maestro's note, or a seat's note plus its own prompt);
`src/sdk.ts` holds the billing and signed-out messages.

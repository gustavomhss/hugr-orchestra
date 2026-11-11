# Models and engines

Which model providers Orchestra can use and how they are routed, plus Claude mode, which runs Orchestra on Claude Code with your Claude subscription. Read this when choosing or connecting a model.

## Providers

- About 30 built-in provider plugins. Model catalog from models.dev, with an offline snapshot built in. Reasoning level per model.

| Wire protocol | Routed by the session core |
| --- | --- |
| Anthropic Messages | Yes |
| OpenAI Responses | Yes |
| OpenAI-compatible chat | Yes |
| Bedrock Converse | Not yet (implemented in the model layer) |
| Gemini | Not yet (implemented in the model layer) |
| OpenAI Chat | Not yet (implemented in the model layer) |

## Project provider configuration

Provider settings from your global config, including custom providers, keep their full behavior. A project must be [trusted](mcp-project-trust.md) before its configuration can change provider destinations, credential environment variables, request headers or bodies, variants, execution limits, capabilities, enabled models or the default model.

Before approval, project provider declarations may change only provider/model names, model families and costs. A project cannot approve itself through its own `trusted_projects` setting. Review its provider configuration before trusting it; approved settings are applied when the catalog is loaded again.

## Prompt estimate

For automatic compaction, the heuristic prompt estimate reuses bounded JSON-encoded lengths of identical long text values. The current request structure is serialized afresh for each estimate; whole requests or conversation histories are not cached.

This reuses text-encoding work, not model tokens or provider prompt-cache entries. No token, billing or response-time saving is implied.

## HTTP provider response inactivity

For native HTTP provider calls, including title and compaction requests, reading a response body fails with a non-retryable transport timeout after ten minutes while waiting for the next nonempty response-body chunk. This is a conservative per-pull inactivity limit, not a total response or turn deadline or an absolute wall-clock limit between chunks when the consumer is busy. Raw response bytes reset the wait before parsing, including SSE comments and heartbeats; empty chunks do not. A response that continues making progress can therefore run longer than ten minutes.

This limit begins when the response body is consumed after headers; it is not a connection or header deadline and does not apply to WebSocket or hosted engine iterators such as Claude mode. Developers using a custom `httpJson` transport can set `idleTimeout` on its input or via `.with(...)` to another Effect duration, or `false` to disable it and retain owner-controlled cancellation.

## Claude mode

Runs an agent's turns inside Claude Code, on your Claude subscription. Turn it on in Settings › Providers › Claude mode. Claude Code signs in with your own account (`claude auth login --claudeai`); Orchestra stores no Claude credential.

<img src="../images/readme/settings-providers-claude-mode.png" alt="Settings, Providers, Claude mode: the switch that runs agents through Claude Code and the sign-in status of the local Claude Code.">

Orchestra keeps its rules by treating Claude Code as an execution host for one provider turn, not as a second orchestrator.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/claude-mode-dark.png">
  <img src="../images/readme/claude-mode-light.png" alt="Claude mode: Orchestra's session runner calls the execution host once per provider turn; the host starts Claude Code's query with the claude_code system prompt preset plus an appendix; Claude Code's own tools pass a PreToolUse gate of permission, ToolSafety and sandbox that fails closed, while Orchestra's tools served as mcp__orchestra__ settle through the runner; Agent, Task, SendMessage, ListAgents, RemoteTrigger and PushNotification are refused.">
</picture>

| Rule | How |
| --- | --- |
| One turn, one call | The runner still admits your prompt, loads history and persists every event. One provider turn is one call into the host; Claude Code's internal tool calls are stored as events. Claude Code owns compaction inside its session. |
| Claude Code stays Claude Code | `query()` always keeps Claude Code's own system prompt; Orchestra adds only an appendix. Project context goes with each prompt and is resent only when its hash changes. |
| Orchestra's tools, Orchestra's gate | Seats, board, memory, skills and other Orchestra tools are served as an MCP server (`mcp__orchestra__*`). Claude Code's own tools pass a PreToolUse gate running Orchestra's permission rules, ToolSafety and the sandbox, failing closed. `mcp__orchestra__*` calls pass the hook only for the governed-loading check; the runner settles their permissions. |
| Seats stay real sessions | Agent and Task are refused, so a seat is dispatched with `mcp__orchestra__task` and becomes an Orchestra session. SendMessage, ListAgents, RemoteTrigger and PushNotification are refused too. A child seat runs on Claude Code only with a Claude model; otherwise on Orchestra's own loop. |
| Billing passed through | A billing refusal is shown word for word and never retried. Cost comes from Claude Code's own total. Each turn starts one Claude Code process. |

See the [Claude mode guide](claude-mode.md).

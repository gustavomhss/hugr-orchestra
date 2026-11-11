# R4 — Documentary and generated-schema spans

The guides and maintenance skill text below are source data. They support documentary attribution only. D04 preserves the guide’s ignored-key statement and the generated schema’s root reference/object restriction without resolving the decoder/publisher relationship.

## D01 — Model guide: Core routing limits, one host turn, outer orchestration, gates and billing refusal

Artifacts: s1.runtime.guides_intent.l1, s1.runtime.llm_providers.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 9–16 inclusive; 327 excerpt bytes; excerpt SHA-256 `3d8c3ccd5f77e4db977a987bc049b1489f18ddb310dbe4ac83d17cc9b3970d9f`.

~~~~text
| Wire protocol | Routed by the session core |
| --- | --- |
| Anthropic Messages | Yes |
| OpenAI Responses | Yes |
| OpenAI-compatible chat | Yes |
| Bedrock Converse | Not yet (implemented in the model layer) |
| Gemini | Not yet (implemented in the model layer) |
| OpenAI Chat | Not yet (implemented in the model layer) |
~~~~

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 24–24 inclusive; 124 excerpt bytes; excerpt SHA-256 `0190e10018b332a7875f29ca83877eb4ef22b87a6aef3f583f94b7b1d67fbc2e`.

~~~~text
Orchestra keeps its rules by treating Claude Code as an execution host for one provider turn, not as a second orchestrator.
~~~~

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 31–37 inclusive; 1365 excerpt bytes; excerpt SHA-256 `3fb33105c1fa0180618054620ca19190c4c427ba33cc843b9fd6b1c31d4d7296`.

~~~~text
| Rule | How |
| --- | --- |
| One turn, one call | The runner still admits your prompt, loads history and persists every event. One provider turn is one call into the host; Claude Code's internal tool calls are stored as events. Claude Code owns compaction inside its session. |
| Claude Code stays Claude Code | `query()` always keeps Claude Code's own system prompt; Orchestra adds only an appendix. Project context goes with each prompt and is resent only when its hash changes. |
| Orchestra's tools, Orchestra's gate | Seats, board, memory, skills and other Orchestra tools are served as an MCP server (`mcp__orchestra__*`). Claude Code's own tools pass a PreToolUse gate running Orchestra's permission rules, ToolSafety and the sandbox, failing closed. `mcp__orchestra__*` calls pass the hook only for the governed-loading check; the runner settles their permissions. |
| Seats stay real sessions | Agent and Task are refused, so a seat is dispatched with `mcp__orchestra__task` and becomes an Orchestra session. SendMessage, ListAgents, RemoteTrigger and PushNotification are refused too. A child seat runs on Claude Code only with a Claude model; otherwise on Orchestra's own loop. |
| Billing passed through | A billing refusal is shown word for word and never retried. Cost comes from Claude Code's own total. Each turn starts one Claude Code process. |
~~~~

## D02 — Claude-mode guide: provider entry, retained orchestration/tools and billing intent

Artifacts: s1.runtime.guides_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 3–5 inclusive; 262 excerpt bytes; excerpt SHA-256 `b8f31a8f61d817a5c957248eb64455ff3149ab21e02592332f37db0339222360`.

~~~~text
Claude mode runs Orchestra on your Claude subscription. To you it is Orchestra as in any other mode: the same app,
the same screens and widgets, the same Maestro, seats, board, workflows, permissions and skills. Only the way Orchestra
reaches the model changes.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 12–15 inclusive; 394 excerpt bytes; excerpt SHA-256 `49a7876da430a01d5c808f696fabb28c9bdce67206ce3452c3f646e1882a26f1`.

~~~~text
- **Claude Code runs the model.** Every turn on a Claude model is a Claude Code turn, signed in with your Claude login.
- **Claude Code's own prompt is kept.** Orchestra adds a short note after it and never replaces it.
- **Anthropic's billing applies.** Anthropic decides how each turn is billed. Orchestra never changes its prompts,
  tools or requests to influence that, and never tests it.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 24–32 inclusive; 850 excerpt bytes; excerpt SHA-256 `9fdde036f5b819eb5c8a9db8fea2282e55b9850da2df0c53565fccd47b001346`.

~~~~text
- **Delegation.** Maestro dispatches a seat with Orchestra's task tool, as in normal mode. Each dispatch is its own
  Session, which you open from the task row and follow live. A seat on a Claude model runs on Claude Code too; a seat
  on another provider's model runs as it would in normal mode.
- **Seats.** Each seat works by its own Orchestra prompt and skills, under its own permissions.
- **Permissions.** Every tool call is checked against Orchestra's permission rules before it runs.
- **Workflows, reviews and the board.** Governed workflows, review requests, Atlas and the board use Orchestra's own
  tools, exactly as in normal mode.
- **Project context.** The project's context and the active workflow's instructions reach the model with your message.
  They are sent again only when they change, and after the conversation is compacted.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 38–46 inclusive; 552 excerpt bytes; excerpt SHA-256 `84a2536bfbd74cb2237eb2ed2e1c8c00c6a9b6ae57df3f6b2e2c50b640ef19c0`.

~~~~text
- Claude Code's built-in tools do the reading, editing and shell work; Orchestra's own tools, such as the board, the
  task tool and the skill tool, are offered to it beside them.
- Claude Code's own subagent tool is not used. Seats are always Orchestra Sessions.

## Known limits

- Claude Code's tool calls show with Orchestra's usual widgets (shell, read, edit, todos, task, ...).
- If Anthropic bills a turn as extra usage or refuses it, the app shows the provider's message. You can enable extra
  usage, use an API key, or pick another provider.
~~~~

## D03 — Claude maintenance: host/tool ownership, governed loading and billing restrictions

Artifacts: s1.runtime.maintenance_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `.orchestra/skills/claude-code-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f3c5b9525fbe1b7bd7a34f60e6f143a8f5505d7`; full-source SHA-256 `dfdceecf6ba2395d80332762ae9b1bbc09b83b6d9ee69ac1d0c7a68b99d5cb9c`.

Lines 12–30 inclusive; 2018 excerpt bytes; excerpt SHA-256 `6cda13b5496393daeb28e4e5034d163c98df417d0df3894e3dac4369fd0d3fde`.

~~~~text
| Piece | Owner file | Rule |
|---|---|---|
| Host: stream, tool serving, gate, MCP server | `modules/engine-adapters/claude-code/src/v2/host.ts` | Every Claude Code call passes `decide()`; PreToolUse and `canUseTool` share it |
| Preset append and seat text | `modules/engine-adapters/claude-code/src/host/options.ts` (`append`, `environment`) | Appends only; never a custom system prompt or a main-thread agent |
| Governed playbook name | `modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md` (skill `maestro-run-governed`) | Must match the name the gate checks and the rule in `packages/core/src/agent/prompt/maestro.txt` |
| Skill permission for seats | `packages/core/src/tool/skill.ts`, tested in `modules/maestro/coordination/test/v2-seats.test.ts` | Permission is asserted at execution, so serving `skill` adds no bypass |

## Tool serving

- `UNSERVED` in `host.ts` lists the Orchestra tools Claude Code has as built-ins or that belong to Orchestra's own loop. A name there is never served over MCP. Adding a tool to `UNSERVED` removes it from Claude mode; check it is not an Orchestra tool the seat needs first.
- `skill` is served as `mcp__orchestra__skill`. Claude Code's built-in `Skill` tool does not know Orchestra's playbooks, so the append says so.
- Subagent tools (`Agent`, `Task`) are refused whenever Orchestra's `task` is served.

## Governed-work gate

- In `decide()`, a `maestro_*` tool is refused until its session has loaded `maestro-run-governed` through `mcp__orchestra__skill`. Excluded: `maestro_arsenal_*` and `maestro_workflows`.
- The loaded flag (`governedLoaded`, keyed by session id) is set only when the skill call returns without an error, in the MCP handler after execution.
- The check runs before the `callIDs` registration. A refused call never reaches the MCP handler, so registering it first would shift the queue of tool-use IDs for the next call of that name.
- The flag lives in process memory. A restart resets it, and the model reloads the playbook.
~~~~

Source `.orchestra/skills/claude-code-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f3c5b9525fbe1b7bd7a34f60e6f143a8f5505d7`; full-source SHA-256 `dfdceecf6ba2395d80332762ae9b1bbc09b83b6d9ee69ac1d0c7a68b99d5cb9c`.

Lines 42–48 inclusive; 1518 excerpt bytes; excerpt SHA-256 `8df1392d8bc28168eb0adc0893daa26d6dabaea5fad537dff90d7ff8d3cb6fba`.

~~~~text
- Only the `claude_code` preset is used. `query()` never carries a custom `systemPrompt`.
- Every tool call passes the gate first, and a failure to decide refuses the call (fail closed).
- `ENV_FLAGS` and the `CLAUDE_CODE_ENTRYPOINT` removal stay in `environment()`. Credentials are never added or removed.
- The owner's own Claude Code settings stay in charge: `settingSources` is `["project"]`, and `permissionMode` is `default`.
- Mid-session System Context changes reach Claude Code: `system` history messages not yet in `delivered` join the `UserPromptSubmit` hook text after the baseline. Record their ids only when the hook sent them, never when the prompt was merely handed. The compaction recall carries the baseline plus every update.
- Maestro may call only Claude Code tools mapped in `PERMISSIONS` plus the bookkeeping set `MAESTRO_BOOKKEEPING` (todos, task list, plan mode, shell output); any other built-in is refused in `decide()` before `turn.authorize`. Maestro's conductor limits (`modules/maestro/coordination/src/v2/conductor.ts`) run inside `turn.authorize`, which wraps authorization only, so in Claude mode a call counts once it is authorized and the write budget is measured on the worktree, not on the tool's input.
- Maestro's routing comes from the `<team>` System Context block (`modules/maestro/coordination/src/v2/team-source.ts`), which reaches Claude Code through the same path. The Maestro note in `host/options.ts` points at that list; never name seats or display names in the note.
~~~~

Source `.orchestra/skills/claude-mode-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `398b0505f2cb06d475eb4fcbf4f90f7b571d8270`; full-source SHA-256 `51cd45d3b4e3bff7e1ac50dd5bd9354efb1e8be616f84837fbbf512cfec19c20`.

Lines 25–40 inclusive; 1437 excerpt bytes; excerpt SHA-256 `65539d7e7fde20abcd3f0beb705fcc7b2f3ea439195dd20c6dcfc223cb9a0b5a`.

~~~~text
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
~~~~

Source `.orchestra/skills/claude-mode-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `398b0505f2cb06d475eb4fcbf4f90f7b571d8270`; full-source SHA-256 `51cd45d3b4e3bff7e1ac50dd5bd9354efb1e8be616f84837fbbf512cfec19c20`.

Lines 56–64 inclusive; 980 excerpt bytes; excerpt SHA-256 `4661bae23503a0102c3b80a85f017aa22c7bd557b2ab4c1308e2b26e4c8d7040`.

~~~~text
- `HOST_REACH` (`ListAgents`, `SendMessage`, `RemoteTrigger`, `PushNotification`) is refused before any permission
  check: these built-ins reach other Claude sessions on the machine, the account's routines or the owner's phone.
  When Claude Code adds a built-in that crosses the query's boundary, add it here.
- Governed dispatch stays MCP: `mcp__orchestra__task`, `mcp__orchestra__maestro_request_review`.
- Switching the engine in the app (`enableClaudeMode`, `setMaestroEngine`) goes through `updateConfig`. Its
  `onSuccess` runs while the mutation is still pending, which pauses the refresh queue, so the open directories it
  re-queues drain only on `queue.resume()` when `reload` settles (`packages/app-shell/src/context/server-sync.tsx`).
  Without it the composer keeps Maestro's old engine and drops every `executionHost` model, leaving "Select model".
- Billing: never change prompts, headers or tools to influence how Anthropic classifies usage, and never probe it.
~~~~

## D04 — Config guide and generated schema: both unresolved documentary/schema sides

Artifacts: s1.runtime.guides_intent.l1, s1.runtime.maintenance_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/config-errors.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bf6413cf2175b7804616709506aec44b5e1f5c31`; full-source SHA-256 `8051b0ad4d4d638d808a04d00b82193fe455cc6cb409e4fff1bcc8c59e4e4d60`.

Lines 9–20 inclusive; 597 excerpt bytes; excerpt SHA-256 `bf036d753bb0f29caab3bd462475b5bdc1562e71180109cba15485f82cbefbeb`.

~~~~text
The error names the file and what is wrong:

- A syntax error gives the file path, the kind of problem (for example a missing comma) and where in the file it is.
- A value that does not match the schema gives the file path and the key that is wrong, for example that `model` must be a string.

## How to fix it

1. Open the file named in the error.
2. Fix the syntax or the value it points to. Comments and trailing commas are allowed in `.jsonc` and in `.json`.
3. Start again. If you want to run without the file for now, rename or move it.

An unknown extra key is not an error; it is ignored.
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1–4 inclusive; 109 excerpt bytes; excerpt SHA-256 `80e43edc1b9ca0dc0ac5f1ec0741047f1bcdd98eafabb0a4e3b49f39705efa4a`.

~~~~text
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$ref": "#/$defs/Config.Info",
  "$defs": {
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1054–1064 inclusive; 349 excerpt bytes; excerpt SHA-256 `f15989b4f6ed3b58925b54afe99ba9f0497e2e87da106a99d132c65135306e81`.

~~~~text
    "Config.Info": {
      "type": "object",
      "properties": {
        "$schema": {
          "type": "string",
          "description": "JSON schema reference for configuration validation"
        },
        "shell": {
          "type": "string",
          "description": "Default shell to use for terminal and shell tool execution"
        },
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1234–1246 inclusive; 269 excerpt bytes; excerpt SHA-256 `b90d4d7b79ca7026bdfcbc8b74bc49500d52b2690b2f44acffad5fd01d3f6ac5`.

~~~~text
        "providers": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/ConfigV2.Provider"
          }
        }
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
~~~~


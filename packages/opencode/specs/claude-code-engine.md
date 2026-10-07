# Claude Code as Orchestra's harness

Status: 2026-10-07. Owner approved. Prototype: `script/claude-code-engine/proto.ts` (passes).

## 1. Goal

Run Claude Code inside Orchestra on the machine's Claude Code login. Claude Code keeps the loop, the model calls and its
own tools. Orchestra contributes its system prompt, its file tools and its context continuity.

Claude Code makes every model call, so the login is used the way Claude Code is meant to be used. Orchestra never calls
the API with the subscription. It only changes, locally and between turns, what the session loads.

## 2. Shape

| Concern | Owner | How |
| --- | --- | --- |
| Loop, model calls, Bash, Grep, Glob | Claude Code | Claude Agent SDK `query()` |
| System prompt | Orchestra | `systemPrompt: { type: "preset", preset: "claude_code", append }`, or `{ type: "custom" }` to replace it |
| `read`, `edit`, `write` | Orchestra | In-process SDK tools (`createSdkMcpServer` + `tool()`), executed by Orchestra's own implementations |
| Built-in file tools | removed | `disallowedTools: ["Read", "Edit", "Write", "NotebookEdit"]` removes them from the model's context; `toolAliases` routes a stray `Read`/`Edit`/`Write` call to Orchestra's |
| Compaction | Orchestra | `settings: { autoCompactEnabled: false }`; Orchestra's continuity swaps the loaded context between turns |
| Transcript | both | `sessionStore`: Claude Code writes locally and mirrors every entry to Orchestra (`append`); on resume, Orchestra returns what the session loads (`load`) |

## 3. The context swap

The SDK calls `sessionStore.load()` once before it spawns a resumed session, and the session continues from what it
returns. Orchestra returns the compacted transcript in Claude Code's own compaction shape:

1. a `system` entry with `subtype: "compact_boundary"`, `parentUuid: null` (the chain restarts here);
2. a `user` entry with `isCompactSummary: true` whose content is Orchestra's working memory;
3. the native tail (the last turn, or the last steps) re-chained after the summary, with old tool results stubbed.

The full transcript stays in Orchestra's archive (`append` mirrors every entry), so `context_recall` can restore anything.

Prototype result (Claude Haiku 4.5): turn 1 read and edited `notes.txt` through Orchestra's tools; the swap loaded 14 of
37 archived entries; turn 2 answered a codename that existed only in the injected memory and a value from the tail.

## 4. Triggers

The swap is a turn boundary by nature. After each turn Orchestra reads the context size from the SDK's usage
(input + cache read + cache write of the last assistant message) and applies the continuity limits: maintenance from
the trigger (40% of the window), a forced pass at the hard limit (70%). The memory pass itself can run on Claude through
the SDK (a separate `query()` with no tools), so it uses the same login.

## 5. Risks and open items

- **Transcript entries are CLI-internal.** The SDK exposes them as opaque JSON, and `sessionStore` is `@alpha`. Orchestra
  must check the entry `version` and only swap formats it knows; otherwise it leaves the session untouched.
- **Permissions.** The prototype grants every tool call. The engine must route `ctx.ask` to Orchestra's permission
  service, and Claude Code's own prompts (Bash) through `canUseTool`.
- **Converter.** The memory producer reads `SessionV1` messages; Claude Code entries need a converter (user/assistant,
  `tool_use`/`tool_result` pairs, timestamps) before the continuity pass can run on them.
- **Checkpoints.** Claude Code's `/rewind` restores only files changed by its own tools; Orchestra's snapshot covers edits
  made through Orchestra's tools.
- **Cache.** A swap rewrites the prefix, so the next request re-caches it once, as any compaction does.
- **Usage.** Each session consumes the Claude Code plan's limits like any Claude Code session.

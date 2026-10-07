# Claude Code as Orchestra's harness

Status: 2026-10-07. Owner approved. Prototype: `script/claude-code-engine/proto.ts` (passes). Design complete (sections 4-10); delivery in three steps (9).

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

## 4. The mirror: one Orchestra session per Claude Code session

The key design choice: Orchestra mirrors the Claude Code session into an ordinary Orchestra session, live. Everything
that already reads Orchestra sessions then works unchanged: the UI, the archive, `context_recall` and the continuity
service. Claude Code's transcript stays the source of truth for what the model saw; the mirror is Orchestra's view of it.

The engine (`src/claude-code/engine.ts`, new) owns one `query()` per active session in streaming-input mode
(`prompt: AsyncIterable<SDKUserMessage>`, `Query.streamInput`), so the process stays alive across turns. User input from
the Orchestra UI goes to `streamInput`; Stop maps to `Query.interrupt()`.

### 4.1 Converter

Two directions, one module (`src/claude-code/convert.ts`), with fixture tests on real transcript entries.

**Claude Code → Orchestra** (live, from SDK messages; and in bulk, from `sessionStore.append` entries):

| Claude Code | Orchestra (`SessionV1`) |
| --- | --- |
| `user` entry, string content, not `isMeta` | `User` message with a `text` part |
| `user` entry with `tool_result` blocks | completes the matching `tool` part (`tool_use_id` → `callID`): `completed` with `output`, or `error` when `is_error` |
| `assistant` entries sharing `message.id` (one entry per block) | one `Assistant` message: `thinking` → `reasoning` part, `text` → `text` part, `tool_use` → `tool` part (`pending`, then `running`) |
| `message.usage` on the last entry of an API message | `Assistant.tokens` (input, output, cache read, cache write) and `finish` from `stop_reason` (`tool_use` → `tool-calls`, `end_turn` → `stop`) |
| `isCompactSummary` user entry | the continuity artifact already in the store (never mirrored as a user message) |
| `attachment`, `system`, `queue-operation`, `mode`, titles, snapshots | not mirrored; kept in the archive only |

Each mirrored message records its Claude Code `uuid`s (`metadata.claudeCode.uuids`) and each tool part its
`tool_use_id`, so the swap can map Orchestra IDs (boundary, `tailStart`, masked part IDs) back to entries.

**Orchestra → Claude Code** (the swap only): see 6.

### 4.2 Orchestra's tools

`read`, `edit` and `write` (and, for continuity, `context_recall`) are in-process SDK tools. The handler builds a
`Tool.Context` for the mirrored session: `sessionID` and `messageID` of the mirror, `messages` = the mirrored history
(`read` uses it to resolve nested instructions), `abort` from the SDK call, `metadata` writing to the mirrored tool
part, and `ask` = Orchestra's permission service (5). The tool result returns as MCP `content`; attachments become
`image` content blocks.

Built-in `Read`, `Edit`, `Write`, `NotebookEdit` are removed with `disallowedTools`; `toolAliases` routes a stray call.
`Bash`, `Grep`, `Glob`, `WebFetch`, `WebSearch`, `TodoWrite` stay Claude Code's. Subagents (`Task`): Claude Code's own,
off by default (`disallowedTools: ["Task"]`) until Orchestra decides how they relate to Maestro delegations.

## 5. Permissions

One policy, Orchestra's. Claude Code runs with `permissionMode: "default"` and `permissionPrompts: "host"`, so every
prompt reaches `canUseTool`.

- **Orchestra's tools** call `ctx.ask` themselves, exactly as in an Orchestra session (`edit` asks with the file pattern,
  `read` asks for external directories). They are listed in `allowedTools`, so Claude Code does not prompt for them a
  second time.
- **Claude Code's tools** reach `canUseTool(toolName, input, { signal, suggestions, title })`. The engine maps them onto
  Orchestra's permission IDs and patterns and calls `Permission.ask`:

  | Claude Code | Orchestra permission | Patterns |
  | --- | --- | --- |
  | `Bash` | `bash` | the shell tool's own scan of `input.command` (arity-based command patterns, external directories) |
  | `Grep`, `Glob` | `grep`, `glob` | `input.path` (external directory check) |
  | `WebFetch` | `webfetch` | `input.url` |
  | `WebSearch` | `websearch` | `*` |
  | anything else, incl. `mcp__*` from configuration (`options.mcpServer.source !== "sdk"`) | the tool name | `*` |

  `allow` → `{ behavior: "allow" }`; a reject → `{ behavior: "deny", message }`; the user's "always" is stored by
  Orchestra, so Claude Code's `suggestions` are not used. The prompt text in Orchestra's UI uses the `title` option the
  SDK passes (the full sentence, e.g. "Claude wants to read foo.txt").

## 6. Continuity

The continuity service runs on the mirrored session as on any Orchestra session. What differs is the transport of the
memory pass and how the result reaches the model.

- **Trigger.** After each assistant message the engine calls `SessionContinuity.start` with the mirrored message (its
  tokens come from Claude Code's usage). The window is `modelUsage[model].contextWindow` from the SDK's result message;
  the engine passes it to the continuity limits instead of Orchestra's model catalog. Trigger 0.4, hard limit 0.7, as in
  Orchestra.
- **Memory pass transport.** The replay transport reuses the parent's request, which only Claude Code holds, so the pass
  uses the isolated transport. Its model call goes through Claude Code too: an `LLM.Interface` adapter backed by a
  one-shot `query()` (`tools: []`, `systemPrompt: { type: "custom", prompt }`, `maxTurns: 1`, `persistSession: false`,
  same model). No API key is needed, and the pass counts toward the plan like any Claude Code request.
- **Swap.** An applied pass leaves an artifact (memory text, `boundary`, `tailStart`) and masks. At the next turn
  boundary the engine ends the `query()` and starts a new one with `resume: sessionId`. `sessionStore.load()` returns:
  1. a `compact_boundary` entry, with `compactMetadata.preCompactDiscoveredTools` copied from Claude Code's state
     (the `deferred_tools_record`/`deferred_tools_delta` attachments), so tools found earlier stay loaded;
  2. an `isCompactSummary` user entry with the memory text;
  3. every chain entry from `tailStart` on (user, assistant and attachment entries), re-chained after the summary;
  4. in those entries, each `tool_result` whose `tool_use_id` maps to a masked part replaced by the stub, and its
     attachments dropped.
- **Past the hard limit** the engine does not start the next turn until the swap is done (`SessionContinuity.compact`),
  as `prompt.ts` does for Orchestra's own loop.
- **Recall.** `context_recall` is an Orchestra tool in the engine, reading the archive the mirror publishes.
- **`context_compact`.** Available as an Orchestra tool; it forces a pass, and the swap happens at the end of the turn.

## 7. Version gate

The engine reads `version` from the transcript entries and keeps a list of Claude Code versions whose entry shape the
converter and the swap were tested on. On an unknown version it still mirrors what it can, and it does not swap: Claude
Code's own auto-compaction is turned back on for that session (`autoCompactEnabled: true`), so the session never
outgrows its window. The UI shows "continuity paused: Claude Code <version> not yet supported".

## 8. Checkpoints and files

Claude Code's `/rewind` restores only files its own tools changed, and edits go through Orchestra's `edit`/`write`, so
the undo is Orchestra's: `enableFileCheckpointing` stays off. In an Orchestra session the processor takes the snapshots
(`Snapshot.Service.track()` at the start and end of each step, `processor.ts`) that `revert.ts` restores. The engine has
no processor, so it calls `track()` itself at the same points of the mirror: when an assistant message starts and when
its last tool result arrives. Revert from Orchestra's UI then works on Claude Code sessions, including files Bash changed.

## 9. Delivery

1. **Converter and mirror** (no swap): Claude Code sessions visible in Orchestra's UI, Orchestra's file tools,
   permissions through Orchestra. Fixture tests from recorded transcripts; a live test on Haiku.
2. **Continuity**: trigger from SDK usage, memory pass through the SDK adapter, swap through `sessionStore`, version gate.
   Benchmark: the same long task with Claude Code's auto-compaction and with Orchestra's continuity.
3. **Product**: engine selection per session in the UI ("Orchestra" or "Claude Code"), settings, docs.

## 10. Risks

- **Transcript entries are CLI-internal** and `sessionStore` is `@alpha`. Mitigated by the version gate (7) and by
  recorded-fixture tests run against each new Claude Code version before it joins the list.
- **The plan's limits.** Each session, and each memory pass, consumes the Claude Code plan like any Claude Code request.
- **Cache.** A swap rewrites the prefix, so the next request re-caches it once, as any compaction does.
- **Distribution.** Fine for the owner's own use. Offering a Claude subscription login inside a distributed Orchestra
  needs Anthropic's approval.

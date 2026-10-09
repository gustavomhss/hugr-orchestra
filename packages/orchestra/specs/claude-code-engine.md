# Claude Code as Orchestra's harness

Status: 2026-10-09. Owner-approved implementation and cold-review repairs complete; publication and final bundle CI pending. Historical prototype and verification records below retain their original scope.

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
3. the current real user request and genuinely newer/unresolved records, re-chained after the summary. New v5 memory
   covers the entire completed prefix; completed covered calls/results, signed reasoning and arbitrary attachments
   are not repaired back into context. Validated v4 persisted memory retains its older partial-tail behavior during migration.

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

The native store's private side index records Claude API message IDs and transcript UUIDs against Orchestra message
IDs. Each tool part keeps `tool_use_id` as `callID`. No public message schema fields are added. The durable index lets
resume map Orchestra IDs and masked tool parts back to native entries after a process restart.

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
- **Swap.** An applied complete-prefix pass leaves a v5 artifact (memory text, `boundary`, equal `coveredThrough`,
  source fingerprints and required `now`), without `tailStart`. At the next turn
  boundary the engine ends the `query()` and starts a new one with `resume: sessionId`. `sessionStore.load()` returns:
  1. a `compact_boundary` entry, with `compactMetadata.preCompactDiscoveredTools` copied from Claude Code's state
     (the `deferred_tools_record`/`deferred_tools_delta` attachments), so tools found earlier stay loaded;
  2. an `isCompactSummary` user entry with the memory text;
  3. the current real prompt and post-boundary records, retaining complete genuinely new tool pairs;
  4. necessary deferred-tool definition carriers and observed prompt-snapshot metadata. Covered calls/results,
     reasoning and arbitrary old attachments are absent. Masks remain a separate reversible emergency fallback.
- **Past the hard limit** the engine does not start the next turn until the swap is done (`SessionContinuity.compact`),
  as `prompt.ts` does for Orchestra's own loop. This guard covers the next Orchestra-owned `query()` admission, not the
  internal model turns of an already-running SDK query. The SDK owns those turns; native overflow/error results stop
  the turn with an explicit diagnostic and are not automatically resumed in a retry loop.
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

### Step 1 as delivered

Code: `src/claude-code/` (`engine.ts`, `mirror.ts`, `tools.ts`, `permissions.ts`, `sdk.ts`), `src/tool/shell/scan.ts`,
one line in `prompt.ts`. Selection: `"agent": { "<name>": { "engine": "claude-code", "model": "anthropic/<model>" } }`
(Maestro always stays on Orchestra's loop).

Where it differs from sections 4-5, and why:
- **One `query()` per turn with `resume`**, not one long-lived streaming-input process. It fits the loop's
  one-pass-per-turn shape, keeps the Runner's busy/idle, queueing and cancel, and is where step 2's swap plugs in
  (`sessionStore.load` runs on every resume). Prompts queued during a turn are sent together on the next one.
- **The loop branch is one line**, `if (yield* claudeCode.turn({ sessionID, user: lastUser })) continue`. A turn always
  ends with an assistant message answering the user (`finish: "error"` and `error` when it failed), so the loop's own
  exit check ends the run; tool parts carry `metadata.providerExecuted`, so the loop never waits on them.
- **Permissions use a `PreToolUse` hook and `settingSources: []`**, with `canUseTool` as a fallback. The live run showed
  that `canUseTool` alone is bypassed: Claude Code's own settings (`~/.claude/settings.json` allow rules) and
  `allowedTools` approve calls before the callback. The hook sees every call. With no settings, Claude Code loads no
  `CLAUDE.md`; Orchestra's instructions are appended instead (its loader reads the repository's `AGENTS.md` or
  `CLAUDE.md`, not the user's global `~/.claude/CLAUDE.md`).
- **Orchestra's tools load up front** (`alwaysLoad`). Without it Claude Code defers MCP tools behind its tool search,
  and the live run fell back to editing through Bash.
- **Mirrored tool names** use Orchestra's IDs where the input matches (`Bash`→`bash`, `Grep`→`grep`, `Glob`→`glob`,
  `WebFetch`→`webfetch`, `WebSearch`→`websearch`, Orchestra's tools→`read`/`edit`/`write`), so the UI renders them.
- **Text only**: file parts of a user message are not sent to Claude Code yet.

Verification: unit tests (`test/claude-code/mirror.test.ts`, `permissions.test.ts`), integration tests with a scripted
SDK through `SessionPrompt.prompt` (`engine.test.ts`: turn mirrored and loop exit, resume, failure, cancel), and a live
run on Haiku 4.5 (`script/claude-code-engine/smoke.ts`): Orchestra's `read` and `edit` used, `edit ["notes.txt"]` and
`bash ["ls"]` asked through Orchestra, file changed, `patch` part written, loop ended with `finish: "stop"`.

### Step 2 implementation

- `SessionContinuity.configure({sessionID, model, llm})` stores a backend override in `InstanceState`, scoped to that
  session. Every limit, memory-capacity check, snapshot budget and producer model lookup uses that override. The
  configured backend never observes/replays an Orchestra API request. Ordinary Orchestra sessions use their existing
  provider/LLM services. Invalidation clears memory and masks but keeps placement; `forget` also removes the backend.
  `pause` blocks production and preparation; cancellation interrupts the registered maintenance job.
  An engine handoff calls `release` to restore the ordinary provider/LLM while preserving durable memory. Forget keeps
  ordinary Orchestra's existing completion/discard behavior; transport cancellation on forget applies to configured
  external backends only.
- `claude-code/llm.ts` supplies the isolated SDK producer: the actual SDK query entry point, the same model, custom
  host system prompt, JSON-labelled historical roles/content, no tools/MCP/settings sources, one model turn, no session
  persistence. It publishes text and stop only after a successful non-truncated result. Stream-scope cleanup aborts and
  closes the query, then joins the real child exit through `ClaudeCodeSDK.processLifetime`; SDK `query.return()` alone races exit against two seconds. The existing host memory decoder, archive, delta checks, persistence and explicit retry remain in
  charge; there is no second compactor or direct provider API transport.
- SDK `result.modelUsage` supplies `contextWindow` and `maxOutputTokens`; cumulative token counters are not context
  pressure. Mirrored per-step usage supplies the trigger. SDK model/limits and transcript version are stored in session
  metadata for resume. The catalog supplies model shape/options and known selected-model pre-spawn admission limits, including an unauthenticated `ModelsDev` lookup
  when Orchestra has no Anthropic API credentials. Missing SDK metadata pauses Orchestra continuity rather than
  falling back to an API transport or claiming catalog limits as observed SDK continuity metadata.
- The supported native format is CLI **2.1.289**, embedded in pinned SDK **0.3.289**. Both SDK package metadata and
  its native executable (`--version`) identify that CLI version. The first query keeps native auto-compaction on until
  transcript version and SDK model limits are verified. Known resumes disable native auto-compaction; unknown versions
  or disabled continuity keep it enabled and persist a user-visible `claudeCode.continuityPaused` reason.
- `claude-code/store.ts` serializes native append/index writes under `Global.Path.data/claude-code/<session hash>`.
  Directories/files are private (0700/0600); JSON, ownership, paths and UUID conflicts are checked; snapshot publication
  uses a private auxiliary `archive.sqlite` (0600), independent of the public/main Session database. SQLite immediate
  transactions with full synchronous durability and a busy timeout protect read/modify/write across processes. Each
  mutation decodes ownership and transforms current state inside the transaction; acknowledgement follows COMMIT.
  A private initialization marker is flushed under the same lock before acknowledgement. A previously sealed database that becomes empty/corrupt fails closed rather than reimporting stale legacy history; a crash between marker publication and COMMIT may also fail closed.
  The previous unpublished JSON archive is retained as a backup and imported only into an empty database; it is never
  deleted or written over. Database and side-file symlinks/type mismatches are rejected. Connections are scoped/closed.
  There is no heartbeat lease or project-state lock root in the native store.
  Exact duplicate UUID revisions deduplicate; changed payloads append immutable revisions, and replay folds UUIDs by
  last acknowledged write. This includes SDK-retained compaction messages with new parents and zeroed usage. Entries
  without UUIDs append, and subkeys retain their own data. Original native entries are never clipped or overwritten.
  An SDK `mirror_error` is a persistence failure, not a successful turn: it pauses continuity and blocks SDK resume until
  the native archive is repaired, rather than quietly loading a transcript with a dropped batch.
- At SDK resume, the store obtains the paying host `admit` view before freezing the SDK load. A v5 memory swap inserts
  an actual native compact boundary and summary, removes every covered completed record, and preserves only the real
  current prompt, post-boundary records and required definition/snapshot carriers. It never repairs covered tool
  dependencies or signed reasoning back into context. Validated v4 migration retains the old partial-tail repair path.
  Deferred-tool discovery state is copied into compact metadata. Only host-masked results become the exact host stub;
  their explicitly associated attachments are removed. Masks also apply without memory.
  Recall capability follows the actual tool list and session-pattern permissions; a denied/unavailable recall
  tool prevents masking. A masked short failure can keep all its text while still removing its images. Unknown versions
  bypass custom rewriting. Unmapped/unsafe boundaries, dependencies or discovery shapes return full native context with a structural
  diagnostic (`claudeCode.transcriptView`), never a guessed shortened transcript. Explicit native clears remain authoritative during fallback; admission counts the exact returned payload.
- Historical user UUID revisions preserve their original host mapping, membership, and delivery checkpoint; only a new
  true prompt identity can acknowledge the current admission. Optional native session identity is validated on both
  append and reload. Default active-leaf selection uses last-write physical order, not a stale inferred UUID. Explicit
  checkpoint selection is separate; an explicit null checkpoint clears conversation until later native writes.
- Resume checks mappings against visible Orchestra history, including revert/removed parts. Reverted native branches
  remain archived but cannot become resumed future context. Removal follows original revision ancestry, `parentUuid`,
  `logicalParentUuid`, source-tool ownership, deferred-definition `sameAs`, and compact preserved-message/segment provenance; restarted summaries cannot retain reverted
  text. Replay selects one SDK active leaf/parent chain and its complete API-message siblings, not append order.
  Preserved tails are resolved after compaction relinking, promoting a non-rewind summary anchor checkpoint to its
  retained tail. Parallel result users sharing an assistant/sourceToolAssistantUUID are recovered in their API group;
  tool closure is checked for native, mask, and swap views. Unsupported dependencies retain the authoritative snapshot
  and use native compaction with custom preparation paused. SDK `supersedes` and refusal-fallback retractions are durably reconciled; unknown raw suppression formats produce an
  explicit diagnostic instead of guessed reconstruction. The mirror notifies maintenance only after a completed,
  supported stop boundary and all tools have finished. Configured producers capture only that completed prefix.
- `context_recall` and `context_compact` are exposed alongside read/edit/write through their real host definitions and
  permission flow. MCP advertises the actual JSON schemas, including recall's closed union. A compact tool prepares
  memory while its own call is unfinished; it does not wait for that call's completion or swap an active SDK query.
  Tool handlers and maintenance transport participate in Stop cancellation. The next resume loads prepared memory.
- Before spawning a supported resumed query with native compaction disabled, the engine freezes the actual native
  `prepare` result that the SDK will load. Admission measures that materialized transcript (including repaired tail and
  definition carriers), the undelivered user prompt, actual recorded system/tool snapshot, and host tool definitions
  against the selected SDK hard limit. Oversized/unready custom views fail before spawn. The SDK snapshot option can
  have no effect: without a genuinely recorded system/tool snapshot, the engine never disables native compaction,
  regardless of previous pressure. Custom rewriting/production stays paused until such a snapshot is observed. The
  fallback admits the unchanged authoritative native payload with native compaction enabled. First-query native
  compaction remains enabled. Known selected-model limits still reject an oversized first/model-change request, including appended instructions and host schemas. Unknown native overhead is explicitly `bounded: false`; a successful lower-bound check is not an exact budget proof. The host projected view alone is never an admission oracle.
- The turn owns mirror effects directly. It aborts/closes the SDK query, awaits asynchronous `query.return`, and joins
  real child exit and outstanding callbacks before constructing an aborted/error reply. Interruption-only store causes do not poison the native archive. Native storage failures at read, record, append or
  postquery preparation set the resume-blocking marker. Error construction bypasses native record. A healthy current
  snapshot still supplies patch/end evidence for Stop and real SessionRevert; snapshot failures are optional and cannot
  prevent the completed host error.
- A persisted delivered-user cursor (with native append checkpoints and all queued user IDs) determines input selection.
  A user queued before a late assistant remains eligible for the next turn and is handed over once, independently of
  assistant append order. New SDK sessions initialize an explicit empty cursor; successful assistant frames cannot infer delivery. Cursor advancement requires a committed native user receipt whose content exactly matches the admitted host input batch. A legacy session without a complete host native archive fails before spawn, preventing a partial new mirror from shadowing its historical local transcript.
- Backend epochs fence admissions and already-forked follow-ups even without an active job. Cancel joins the registry
  gap and transport disposal; changed configure joins the old worker before publishing one immutable model/LLM revision.
  The same revision owns the complete pass and retry. Equivalent repeated configurations leave progress alone. Configure
  clears API request overhead, and release preserves memory while restoring default transport for later explicit work.
  The engine creates one stable SDK LLM adapter per layer. Observe captures/rechecks epoch/backend across asynchronous
  schema measurement. Lifecycle transitions publish a paused sentinel before joining, and scheduler admission shares
  the session gate; the gate is released while waiting for worker disposal so finalizers cannot deadlock on it.
- Deferred-tool fixtures are source-derived from the pinned CLI executable, not a newly recorded live transcript.
  They cover `deferred_tools_record.entries/nameOnlyAnnouncements/strippedReferences/toolInputCopies` and
  `deferred_tools_delta.surfacedNames/surfacedDefinitions/addedNames/removedNames`, including `sameAs` definition carriers.
  Announcement identifiers suppress carrier replay rather than introducing tool names. Native discovery restores actual
  tool-reference/surfaced names into `preCompactDiscoveredTools` and preserves carrier dependencies after head removal.
- `processLifetime` replaces ambient auth/backend environment with the current local machine OAuth selected by native keychain-first/secure-storage precedence. The pinned CLI host-managed provider capability prevents settings/policy auth overrides; API-only bare mode is rejected. Expired access tokens fail closed: injected OAuth does not carry the local refresh token. This proves credential selection, not server-side token validity.
- POSIX storage permissions are checked independently of Windows synthetic mode bits; they are not Windows ACL evidence. Offline capability authoring explicitly rejects Windows without an ACL privacy oracle; approved replay/model validation remains cross-platform.

Verification sources: `test/claude-code/engine*.test.ts`, `test/claude-code/{llm,mirror,native,permissions,sdk-lifecycle,sqlite,store,tools,transcript}.test.ts`, existing continuity
and recall tests, and `script/claude-code-engine/continuity-smoke.ts`. The scripted integration exercises the real host
producer/decoder/persistence with an injected SDK and a window different from the catalog. It does not establish live
model summarization quality. Live verification on 2026-10-07 is blocked: an isolated HOME hides the machine login;
the authenticated installed SDK independently returned:
`You've hit your weekly limit · resets Oct 10 at 7pm (America/Sao_Paulo)`.
No live producer/swap/needle-recall success is claimed for step 2.

Initial local verification on 2026-10-07: 235 tests passed across the Claude Code, continuity and recall scope; package
`bun typecheck` exited 0. These initial results preceded cold-review corrections and do not verify those corrections.
Mutation probes on the initial engine integration failed when
the native swap was disabled (missing `compact_boundary`) and when the SDK backend was bypassed (producer job `error`);
both mutations were restored before the passing scope run. The live smoke harness bounds each SDK query to one provider
turn and the entire run to five minutes; its memory must come from the actual host-validated SDK producer.

Cold-review corrections add native active-branch/revision/provenance fixtures, exact admission fallback coverage, held
record/return-join cancellation races, an OS-lock barrier with two fresh store writers, paid-tool permission denial,
queued-user exact-once delivery, and configure/cancel/release epoch races. New mutation probes reject announced-only
tool restoration and cancellation that returns before the registry admission is joined. Final verification:
the previous cold-review scope passed **257 tests across 31 files**, with no failures or
skips, and package `bun typecheck` exited 0. Native-shape and cancel-join mutations each failed their targeted regression,
were restored, and preceded that passing complete run. No additional live-model success is claimed.

Final follow-up corrections: **274 local tests across 32 files passed**, no failures/skips; package `bun typecheck`
exited 0. The targeted A–L regressions passed before the complete scope. Mutation probes failed when no-snapshot native
compaction fallback was disabled, parallel result sibling recovery was removed, and SQLite used a stale pre-transaction
snapshot (A overwrote B's acknowledged update). All mutations were restored before the complete passing scope. The
SQLite oracle runs two actual child processes, pausing A before its modifying transaction while B commits. Stop/revert
coverage uses real git/snapshots and verifies restored file bytes. No new live-account calls were made; quota remains
the live-model limitation.

### Complete-prefix v5 replacement, 2026-10-08

The frozen replacement contract is `specs/context-continuity-complete.md`. Production capture now takes the complete,
uncapped completed prefix, including the final safe assistant step. A queued user that precedes a late response to an
earlier turn stays outside coverage. Running/pending tools and incomplete assistants cannot become covered sources.
All public source bytes are archived before publication; inline media remains in canonical session/native storage.
Input that cannot carry the declared span fails as `input-budget`, without publishing a clipped partial artifact.

`MemoryArtifact` discriminates v4 partial memory and v5 complete memory. V5 has equal boundary/coverage, source hashes,
and required single-line `now.doing`, `now.next`, and validated source aliases (C15). Semantic rendering prominently
shows Now, validated items, latest artifact mutations and unfinished delegations; it omits exhaustive user/command
ledgers. Existing C1–C14 checks remain. Covered source edits, deletions and reverts invalidate complete projection.

Pure `prepare` never starts production. Paying `admit` settles maintenance and catches up a new candidate's completed
delta before its first use. Later ordinary steps remain native until the configured trigger/hard bound requires work.
Sealing rechecks backend epoch, admission generation and the latest completed boundary after asynchronous sizing.
The bound uses the current user's selected model, not the previous assistant's larger model. Ordinary plugin message
transforms run on the admitted view, so refreshing canonical history cannot silently discard their outgoing changes.
The ordinary prompt path calls admission before streaming; the SDK pre-spawn path freezes the checked native view for
`sessionStore.load`. The producer's 600-second abort deadline includes model lookup, the first reply and its one schema retry.
Return waits for joined transport cleanup; a blocked uninterruptible finalizer can extend elapsed time beyond the abort deadline.
The owner explicitly approved this ownership-preserving contract on 2026-10-08. Diagnostics retain structural input-budget, timeout, invalid-schema, archive,
stale/backend-change and cancellation reasons, without conversation content. Emergency masking is not complete compaction.

`script/continuity-bench/complete.ts` exposes production capture/run/decoder/projection to an evaluator-supplied transport,
plus a dry CLI that writes private request/metadata files without provider calls. Dry replay reached the five immutable
frozen contexts with 247, 146, 147, 60 and 170 declared sources respectively. At the explicit dry-only 200,000-token
window/32,000-token output reservation, oversized spans report input-budget failure; no complete artifact is claimed.
Those initial dry-only guessed limits are superseded by the capability-bound repair CLI below and are not production
admission evidence. These are reconstructed logical histories, not captured historic provider wire. Dry output has no actual provider usage.
The frozen manifest SHA-256 remains `9379b8a8d050a3801317bfda49d8e4f3430da626cc93930f8666041484284a27`.

Scenario-authored regressions exercise complete long-turn coverage, final-step facts/errors, exact archive recall,
queued/pending work, v4 cold migration, source invalidation, one-time admission catch-up, deadline/retry cleanup and
memory-only native SDK swaps. Replay tests exercise the injected transport and saved-output decoder; they do not measure
a model's semantic retention. Targeted mutations reintroducing covered raw records, claiming a partial prefix as complete,
and dropping C15 each failed the intended regression and were restored. Final requested local scope passed **295 tests
across 34 files, 6,614 assertions**, exit 0, without failures/skips; package `bun typecheck` exited 0. The focused complete,
replay and native-transcript scope passed 16 tests, and six additional prompt cancellation/metadata regressions passed
with their original timeouts. An earlier extended run had 347 passes, eight timeout failures and one pre-existing
v2-projector skip; its failures passed the later required scope and targeted prompt reruns. No CI result is claimed.
The earlier 274-test result predates v5 and is not v5 evidence. Actual frozen-source Sol evaluation has no execution
authorization yet; no provider calls, factual-retention or continuation-quality success is claimed.

### Frozen cold-review repairs

The thirteen repair items strengthen the existing contract:

1. `RequestSource.actual/latest` identifies nonignored typed text, explicit typed-command markers and user attachments.
   Synthetic continuation, delegation return and compaction controls do not replace the real ask. Canonical history
   supplies an explicit original request when legacy filtering omitted it. Source markers remain provenance even when
   their command text is intentionally ignored in model context.
2. Fingerprints include assistant parent, finish/error, completed eligibility, structured output, provider/model and
   agent provenance. Part projection includes tool identities, status, arguments/results/errors, files/attachments and
   meaningful metadata. Cost/tokens, timestamps, compaction timing and read's loaded-rule cache are bookkeeping.
   Publication/cold preparation revalidate completed prefix and exact owned head suffix plus prior artifact compatibility.
   Terminal historical failures remain durable observations; the final boundary is a safe completed step.
3. C15 requires a citation belonging to the latest covered step. This is source freshness, **not semantic truth**.
   Contradictory cursors citing genuine sources still require independent frozen gold probes.
4. Migration rereads old bytes but C7 retirement evidence comes only from the proven new span after previous coverage.
   Old quotes or unprovable prior coverage cannot retire guarded user items.
5. C16 excludes copies of known inline image/PDF bytes, complete serialized source call/result objects, large source
   patch/file/output blobs and wholesale long historical asks. Detection uses actual source projections/bytes and JSON
   structure, including embedded JSON, without base64-alphabet/prose heuristics or a total memory token target. Ordinary
   independent long language and exact operational commands remain legal. Paraphrased verbosity is outside this check's reach.
6. Actual callers pass expected user identity and resolved model. Stale selection restarts outer preparation, rebuilding
   agent, permissions, format, parent and model from canonical history; the queued caller is delivered once.
7. Full outgoing system/environment/MCP/skills, transformed messages, tool schemas, structured output and MAX_STEPS are
   checked before processor/assistant persistence. The generic LLM guard also checks final prepared provider input after
   provider hooks, for ordinary requests too; disabling continuity does not disable physical input-capacity validation.
8. Expected admission failures are completed Session errors/events; stale callers retry preparation. Tool callbacks bind
   to a deferred processor only after admission. Cancellation and metadata behavior retain their existing tests/timeouts.
9. Native materialization returns a typed ready/fallback outcome. All valid unsupported shapes pause custom rewriting,
   rematerialize authoritative archive data and enable SDK native compaction before spawn. Known actual SDK limits still
   block oversized authoritative payloads. Only archive read/write/ownership faults set sticky archive-failed state.
10. Media estimates use known domain blocks and MIME/data fields. Ordinary text and command strings are charged fully,
    including long alphabetic strings; tool argument/metadata dictionaries cannot masquerade as image blocks.
11. Process-local parent receipts bind ordered source fingerprints after mask/plugin projection, planned response ID,
    actual completed-response usage and model. Unmatched/out-of-coverage parents cannot borrow cache budget. Complete
    replay retains the parent prefix and appends the full original span conservatively, never a clipped index alone.
12. Confirmed furthest answered parent acknowledges delivered multi-user batches; later undelivered real asks remain
    outside coverage and synthetic controls are not queue eligibility barriers.
13. `complete.ts` requires an approved canonical-path/SHA-256 capability manifest for descriptor, horizon, actual model
    and source. Arbitrary file-path/window flags are rejected. Only the typed injected dry sentinel after request capture
    is dry success; construction/zero-request/input-budget failures retain their classes and exit nonzero.

Exact dry CLI:

```sh
bun script/continuity-bench/complete.ts --mode dry \
  --capabilities <canonical-capabilities.json> --capabilities-sha256 <approved-sha256> \
  --case <approved-case-id> --output <private-output-directory>
```

Offline `prepare-capabilities.ts` accepts explicit approved descriptor/catalog path/hash pairs, validates the selected
catalog model through the production mapper, and writes separate private model/capability files. It never reads auth,
gold, reader plans or previews. Actual cached Sol limits are 1,050,000 context / 922,000 input / 128,000 output. Both primary
sources (147 and 170 messages) reached production capture/run and the typed dry sentinel, one captured request each,
zero provider calls. Programmatic `replay` retains injected live transport and saved-producer-output support through
production capture/run/decoder/context preparation. No semantic quality inference follows from dry or scripted tests.

Repair mutation controls reject caller drift, bypassed outgoing-payload guard, mismatched head bytes, old Now evidence,
known raw payload reinsertion and zero-request dry-success stubs. Mutations are restored before final verification.

Earlier 13-repair verification (before the narrowed seven-review changes): requested Claude Code/continuity/recall scope passed **332 tests / 37 files / 6,727 assertions**,
exit 0, no skips. Extended scope including prompt, command-source, guard and write-root regressions passed **395 tests**,
zero failures, with one existing v2-projector-disabled skip (396 total / 41 files / 6,965 assertions). Package `bun typecheck`
exited 0 after disk cleanup; no dependency reinstall, benchmark execution, publication or real provider call was needed.
Six mutation controls failed their intended assertions, were restored, and preceded the final passing scope. All evidence
is local; semantic contradiction/factual-retention evaluation remains a separately authorized model/gold-probe step.

### Narrowed seven-review corrections

The code corrections are implemented; the final complete verification gate is **blocked**, not reported green.

1. Tool fingerprints independently bind `callMetadata` and `resultMetadata`, for completed and error states. Cold
   persisted v5 tests reject provider-execution/call provenance and result changes while retaining timing-only changes.
   Cold projection also checks the exact current ask and synthetic-continuation identity, not a vacuous role predicate.
2. A terminal error-only latest step can supply required C15 Now evidence. Pending/running states and old user-only
   citations remain ineligible; C15 still establishes source freshness rather than semantic truth.
3. Empty bare argument objects do not make incidental `{}` in proven errors or operational commands fail C16. Actual
   complete call/result wrappers and nonempty bare argument objects remain in the known-source inventory.
4. Real `LLM.preflight` resolves language/config/auth and runs `LLMRequestPrep.prepare` once, including Atlas, transformed
   system context, parameters, variants and serialized current tools. It checks the captured payload before durable
   assistant/processor allocation and rereads canonical caller identity after preparation. An opaque service-owned plan
   carries the captured payload and output reserve into execution; the late guard checks that same plan without rebuilding
   hooks. The reserve floor is the captured production default output cap; a larger hook cap increases it, and a lower
   hook cap cannot reduce it. Ordinary SDK/native stream wrappers retain physical input-capacity checking.
5. After awaited forced catch-up, canonical caller and epoch/generation checks precede outcome classification. Held
   `fits`/`masked`/`over` regressions retain genuine same-owner unmet failures while stale callers retry. Real HTTP coverage
   queues U2 during U1's held catch-up and verifies U2 delivery without a terminal U1 error.
6. Parent receipts defensively capture ordered tool definitions, effective model/user variant/agent options, prepared
   parameters, system/messages, response identity and paired completed usage. Caller-owned mutations cannot alter the
   capture. Mutating the receipt itself removes replay/cache-budget privilege even with unchanged source IDs; the isolated
   fallback still supplies full original source bytes. SDK/native tests also mutate a returned preflight receipt and confirm
   execution retains the original high variant, system, tools and output cap.
7. Current code passed package `bun typecheck` and the focused seven-file run: **40 pass / 0 fail / 243 assertions**
   (`narrow-focused-final.log`). The filter selects cold identity, call metadata, terminal error, stale catch-up, receipt
   mutation, real one-shot preparation, variant/schema and capacity checks. It is not the complete regression scope.

Local mutation controls were restored before that passing run: rerunning real preparation failed its one-shot HTTP
assertion (1 failure); classifying catch-up before ownership checks failed 10 stale cases, including the actual HTTP caller
race; bypassing the receipt signature failed all 8 mutated-prefix cases; dropping call metadata failed both lifecycle cases.
Evidence: private `narrow-mutation-{preflight,catchup,receipt,metadata}.log` files in the existing scratch directory.

The full requested/extended invocations did not complete. During verification the host reported load averages
98.62 / 73.59 / 45.08. The existing three-second processor-creation cancellation test failed under load and passed alone;
the final full invocation reported `Maintenance did not enter` on the long 46-step fixture and then hit its outer command
deadline. Test deadlines and guards were not relaxed. Abandoned runs do not establish an aggregate green result.

Additional recorded-native verification exposed three stale cassette requests whose second-turn tool input stores
`city: {}` instead of the actual `"Paris"`. The old Bun asymmetric assertion mutated the original event before replay;
the assertion now examines a clone. Correct immutable replay no longer matches those recorded requests. Their source
bytes are preserved, and those three tests remain blocked pending a separately reviewed recording correction. The
header-only fixture uses an explicit short test persona so its original small synthetic window remains meaningful.

The dry CLI definition above is unchanged. Both approved frozen-v2 primary commands were rerun into the same private
output directories: 147/170 sources, the approved boundaries, one captured request each, zero provider calls, actual Sol
limits 1,050,000 / 922,000 / 128,000. These are reconstructed logical histories, not historic wire captures. Frozen
source/gold/preview bytes were not edited, and no external model call or publication was performed. The earlier SDK quota
receipt is not evidence about Sol evaluation or current authentication; live semantic evaluation belongs to the lead's
separately authorized evaluation work package.

## 10. Risks

- **Transcript entries are CLI-internal** and `sessionStore` is `@alpha`. Mitigated by the version gate (7) and by
  recorded-fixture tests run against each new Claude Code version before it joins the list.
- **The plan's limits.** Each session, and each memory pass, consumes the Claude Code plan like any Claude Code request.
- **Cache.** A swap rewrites the prefix, so the next request re-caches it once, as any compaction does.
- **Distribution.** Fine for the owner's own use. Offering a Claude subscription login inside a distributed Orchestra
  needs Anthropic's approval.

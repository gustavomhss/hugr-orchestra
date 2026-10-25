# PLAN B1-C: Maestro, the Claude Code engine and continuity on the V2 Session core

Base: `origin/dev` @ `49759589af` (Merge #817), read from a `git archive` snapshot. Nothing was built, typechecked or
tested. The local checkout (`dev` @ `e0a0278cb5`) predates the monolith layout and was not used. B1 (plan 70-C') has
not landed: there is no `packages/core/src/host.ts`, no `modules/{engine-adapters,continuity}`, and `modules/maestro`
holds only `arsenal/`. Every product path below is therefore the **post-B1** path (C4/C5/C7/C8 move targets).
"Unverified" marks a claim not proven by reading code.

Goal: after B1-C, `apps/cli serve` (V2) runs Maestro, the native seats, governed Tasks, Claude Code as the engine of
any agent, and continuity, so that B6 can make the desktop's own `orchestra serve` child the default and B9 can delete
removed-v1 with no product loss.

---

## 0. Decisions applied (from the lead) and decisions taken here

| ID | Decision | Source |
|---|---|---|
| D-C2 | Claude Code is an **execution host**: one Claude Code SDK turn (input sent → `result` frame) is one provider turn of `SessionRunner`, replacing `llm.stream(request)` for that turn only. Its internal tool calls surface as provider-executed events. | lead |
| D-B5 | V1 plugin API (`@orchestra/plugin` root `Hooks`, `PluginInput.client`) retires with removed-v1. No shim. B1-C ports nothing through it. | lead |
| D-B2/B3 | Desktop owns a `orchestra serve` child; flag default-on with a fallback setting for one release. | lead |
| E1 | The host is selected by **`agent.engine`** (schema `packages/schema/src/agent.ts:22`), not by a provider setting. V1 also selects by agent (`claude-code/engine.ts:51`); `executionHost` on the anthropic provider (`handlers/catalog.ts:39`) is only a picker annotation and stays one (HostCatalogV2, card M5). | here; amends 70-C' §2.8 row 1 |
| E2 | A host turn produces **one** V2 assistant message (one `step-start` … one `step-finish` with aggregate usage). Claude Code's several API messages per turn collapse into it. Required by `publish-llm-event.ts:396-399` ("Duplicate step finish"). Revert granularity becomes one snapshot pair per Claude Code turn (`runner/llm.ts:245,363`). | here |
| E3 | Orchestra tools that Claude Code calls through the in-process `orchestra` MCP server are **settled by the runner** through `turn.execute`, recorded before side effects, and persisted `provider.executed: true` with `metadata.executor = "orchestra"`. Without the flag, V2 Task's `completedReply` rejects the reply (`tool/task.ts:367`) and the runner would schedule a second turn (`runner/llm.ts:272-277`). | here |
| E4 | Steers sent while a Claude Code turn runs promote at the **end** of that turn (AGENTS "promote at the next safe provider-turn boundary"; `runner/llm.ts:203-211,470-474`). V1 injected them mid-turn with `priority: "next"` (`host/session.ts:672-691`). Stop still interrupts at once. See owner decision O-1. | here, owner may override |
| E5 | Native seats become `AgentV2` agents through one PluginV2 `ensure` (the `maestro/upstream-v2.ts:46-77` precedent, generalized from `archie` to every roster seat). "Native" stays product-owned (a `MaestroSeats` Location service); no `native` field in the public schema. | here |
| E6 | Durable host state stays in `session.metadata[<key>]` (column `session/sql.ts:43`), key `claudeCode` exactly as V1 (`host/session.ts:188-196`), so V1-era Claude-hosted sessions resume on V2 (`claudeSessionID` is derived from the session id, `host/session-id.ts:4`). | here |
| E7 | Session-scoped permission rules (write roots, governed reservations) use the existing `session.permission` column (`session/sql.ts:51`), read through `SessionStore`, not through the public `Session.Info` (no protocol change, no `bun run generate`). | here |
| E8 | Continuity reaches parity before B6 (no feature loss on flip, convergence B.7). Claude-hosted sessions skip Orchestra compaction, as V1 does (`engine.ts:56-57`). | here |
| E9 | V2 successors live in `src/v2/` of each product module. B9 deletes the V1 files and the removed-v1 glue; nothing moves again. The 63 open R11 rows close at B9. B1-C adds no new removed-v1 → product edge except the one import in M1. | here |

### AGENTS.md amendment (one sentence, appended to the bullet "Preserve one explicit `llm.stream(request)` call per provider turn …")

> The one exception is an agent whose `engine` names a registered `ExecutionHost` (today only `claude-code`): its single `ExecutionHost.stream(turn)` call is that provider turn, its internal tool calls persist as provider-executed events, Orchestra tools it invokes settle through the runner's `turn.execute`, and its `query()` always keeps the `claude_code` system prompt preset.

---

## 1. V2 gaps (what V1 gives Maestro, Claude Code and the desktop that V2 lacks)

Paths: `ao/` = `removed-v1/src/`, `core/` = `packages/core/src/`.

### 1.1 Claude Code engine

| # | V1 behavior | V1 evidence | V2 state | Closed by |
|---|---|---|---|---|
| G1 | An agent with `engine: "claude-code"` runs on Claude Code | `ao/session/prompt.ts:1105-1122`, `ao/claude-code/engine.ts:48-59` | Task refuses it (`core/tool/task.ts:323-324`); runner always calls `llm.stream` (`core/session/runner/llm.ts:261`); no `executionHost` in core or server | X0, X1, X2, M2 |
| G2 | Durable host state (`sessionId`, `delivered`, `inputs`, `uuids`, `cost`) | `ao/claude-code/host/session.ts:188-196, 620-648` | `SessionSchema.Info` drops `metadata` (`core/session/info.ts:15-52`); no API reads it | X0 (`SessionHostState`) |
| G3 | One long-lived `query()` per session, idle release 60 s, Stop = `interrupt()`, picker = `setModel()` | `host/session.ts:3-10, 105-106, 594-607` | Runner interrupts the drain fiber only (`runner/llm.ts:341-355`) | M2 (stream finalizer → `interrupt`; process-local warm cache) |
| G4 | Many API messages per turn, one Orchestra assistant each | `ao/claude-code/mirror.ts` header | One step per turn (`publish-llm-event.ts:396-399`) | E2, M1 |
| G5 | Orchestra tools served in-turn over MCP and executed by Orchestra | `host/mcp.ts:1-8, 73-79` (Bridge claim/execute/complete) | Runner settles only non-provider calls, after the call, and then continues (`runner/llm.ts:272-317`) | X1 (`turn.execute`), M3 |
| G6 | PreToolUse gate on every built-in call (governance hold, ToolSafety, Arsenal, permission ask, sandbox) | `host/gate.ts:1-12, 61-98` | Permission context exists only inside the runner (`runner/llm.ts:281-295`) | X1 (`turn.authorize`), M3 |
| G7 | Claude Code `Agent` subagents mirrored into seat child Sessions, with delegation records | `host/delegation.ts:1-12`, `host/mirror.ts:1-8` | Child Sessions exist only through Task + inbox (`core/tool/task.ts:105-138`); no drainless child writer | X1 (`turn.child`), M4 |
| G8 | Background subagent deliveries and autonomous Claude Code turns after `result` | `host/session.ts:290, 329-353` | A drain ends with its last turn (`runner/llm.ts:466-475`) | M4 (host admits a `queue` input, §2.1 rule 7) |
| G9 | Claude Code owns compaction; Orchestra continuity paused | `engine.ts:56-57`; `host/hooks.ts:213-241` (PostCompact archives the native summary) | Compaction hard-wired (`runner/llm.ts:120, 243, 328-334`) | X0 (`ownsContext`), X1 |
| G10 | Claude sign-in makes anthropic models selectable without a key | `ao/server/routes/instance/httpapi/handlers/catalog.ts:30-55` | `CatalogAvailability` defaults to `[]` (`packages/server/src/catalog-availability.ts:10-17`); `apps/cli serve` composes nothing (`apps/cli/src/commands/handlers/serve.ts:41-43`) | M5 |
| G11 | Fork of a Claude-hosted session forks the SDK session | `host/session.ts:88` (`fork`), `host/boundary.ts:109-148` | V2 has no fork (convergence B.1 `/session` gaps) | **deferred to B2's fork card**; M2 keeps `boundary.forkState` reachable |
| G12 | Revert reconciles the native transcript (`resumeSessionAt`) | `engine.ts:88-90`, `host/boundary.ts:150-165` | V2 revert exists (`core/session.ts:464-480`) | M2 (on each turn, compare history with `delivered`) |

### 1.2 Maestro governance

| # | V1 behavior | V1 evidence | V2 state | Closed by |
|---|---|---|---|---|
| G13 | Task phases: native-seat deny, authorization, dispatch reservation, governed reservation, write roots, logical task, workflow binding, arsenal completion, backend work | `ao/tool/task.ts:159-486` | Task has no hook (`core/tool/task.ts:67-182`) | X2, G2 |
| G14 | Child Session with a caller-chosen id and its own permission ruleset | `ao/tool/task.ts:398-434` | `CreateInput` has no permission (`core/session.ts:84-90`); child id is forced (`core/tool/task.ts:78`); runner uses agent rules only (`runner/llm.ts:198`) | X0, X1, X2 |
| G15 | Task input fields `background, governed, authorizationID, writePaths, workflow, memoryUnit, effort` | `ao/tool/task.ts:200-245` | Input is 5 fields (`core/tool/task.ts:33-39`) | X2 (governance-supplied fields) |
| G16 | Extra prompt content (grounded skills, Atlas resume, resume marker) | `ao/tool/task.ts:538, 583-585, 614` | Text only (`core/tool/task.ts:135`); V2 `Prompt` has `text, files, agents` (`packages/schema/src/prompt.ts:41-44`) | X2 (`admit` returns a `Prompt`) |
| G17 | `beforeModel` revalidation inside the child turn | `ao/tool/task.ts:586-601` | none | X0/X1 (`TaskGovernance.beforeTurn`) |
| G18 | Background Task, `task-return` delivery to the parent, upstream settlement | `ao/tool/task-background.ts:77-137, 204-220`; `ao/session/upstream-task-settlement.ts:35-106` | Task is foreground only; `BackgroundJob` has no task consumer (`core/background-job.ts:104`) | X2 (`background`), G4 |
| G19 | Native seats as agents (prompt, label, model, engine, permission floor) | `ao/agent/agent.ts:326-362`, `ao/maestro/roster.ts:93-99, 166` | Only `archie` is projected (`ao/maestro/upstream-v2.ts:46-77`); no `native` field (`packages/schema/src/agent.ts:20-31`) | G1 |
| G20 | Per-seat tool visibility (`maestro_*` maestro only, `record_review` lucy only, Atlas by seat, no MCP for the discovery seat) | `ao/tool/registry.ts:483-484, 536-589`; `ao/session/tools.ts:284` | `materialize` filters by permission rules only (`core/tool/registry.ts:206-221`) | G1 (deny rules) + G3 (self-gating) |
| G21 | Tool context `metadata`, `ask`, `extra.promptOps`, native-seat ask floor | `ao/session/tools.ts:105-158` | V2 context is `sessionID, agent, assistantMessageID, toolCallID, model` (`core/tool/registry.ts:112-118`) | G3 (Tool.Progress, `PermissionV2.assert`, Task through core) |
| G22 | Arsenal per-session native refs (`WriteRoots.loader`, `ArsenalCompletion.NativeHost`, `WorkflowBinding.NativeHost`, `RelayWorkflowSession.NativeHost`, `ToolSafety.NativeHost/NativeContext`) | `ao/maestro/arsenal-bindings.ts:541-558` | Only `ArsenalNative` replacements (B1 C6/K1) | G2 (Location replacement nodes) |
| G23 | Atlas header in system text; Atlas resume restore on compaction and request | `ao/session/llm/request.ts:92-100`; `ao/session/compaction.ts:475`; `ao/session/prompt.ts:1226-1230` | System is `agent.system + baseline + workflow` (`runner/llm.ts:236`) | G3 (System Context source + compaction hook) |

### 1.3 Continuity

| # | V1 behavior | V1 evidence | V2 state | Closed by |
|---|---|---|---|---|
| G24 | Pluggable strategy: background pass at 0.4, hard limit 0.7, masking, archive, 3-failure stop | `ao/continuity/service.ts:34-72, 614-702`; `trigger.ts:7-53`; `masking.ts:7-140` | `SessionCompaction.make` inlined (`runner/llm.ts:120`), summary only (`core/session/compaction.ts:180-253`) | X0 (node + hooks), X1, CN1 |
| G25 | `context_recall`, `context_compact`, aliases `uN/aN/tN`, `commandSource` | `ao/tool/context-recall.ts:25-72`, `context-compact.ts:8-38`, `ao/continuity/alias.ts:10-108` | none | CN2 |

### 1.4 Composition and desktop

| # | Gap | Evidence | Closed by |
|---|---|---|---|
| G26 | Product modules cannot add Location nodes (seat plugin, tools, hosts, context sources); PORT-1 offers only replacements and global nodes | `core/location-services.ts:47-90` (fixed group), 70-C' §2.1 | **B1 L2 amendment** (§2.0) |
| G27 | `serve` has no host list, no per-launch password, no CORS, no Dock transport | `serve.ts:21, 41-43`; `packages/server/src/routes.ts:49`; `packages/server/src/cors.ts:5-7`; `ao/plugin/app-dock.ts:126-127` | K1 here; CORS, password, transport are B4 |
| G28 | Desktop V2 path is the shared daemon, with no per-launch env (Claude executable/resources, playbooks) and no RPC | `apps/desktop/src/main/index.ts:86, 403-418`; `server.ts:102-117`; `index.ts:456-460` | B4/B6 (§6) |

---

## 2. Port contracts to freeze (X0 lands them as compilable defaults before any other card)

### 2.0 Amendment to B1 PORT-1 / PORT-2 (L2 has not landed: fold into its brief)

```ts
// packages/core/src/host.ts — Contribution gains one field
/** Extra Location-scoped nodes appended to `locationServices` in every Location map the root builds. */
readonly locationNodes?: ReadonlyArray<LayerNode.Node<any, any, typeof Node.tags.values.location>>
// merge() returns `locationNodes` too (flattened, order kept); a duplicate node name is a composition error.
```
`buildLocationServiceMap(replacements, extra = [])` builds `LayerNode.group([...locationServices.nodes, ...extra])`
(`core/location-services.ts:94-104`). `AppNodeBuilder.build` forwards `merged.locationNodes` to it (the exact
plumbing through `effect/app-node-builder.ts:14-17` is unverified; L2 resolves it). The `any` in the type is a
placeholder for the real `LayerNode` element type, as 70-C' §2.1 already notes.

### 2.1 PORT-7 `ExecutionHost` (new `core/session/runner/execution-host.ts`)

```ts
export * as ExecutionHost from "./execution-host"

export interface Call { readonly id: string; readonly name: string; readonly input: unknown }

/** What the runner hands a host for one provider turn. Every callback is runner-owned: persistence stays in core. */
export interface Turn {
  readonly session: SessionSchema.Info
  readonly agent: AgentV2.Info                          // agent.engine === host.id
  readonly model: ModelV2.Ref                           // session.model ?? agent.model; no credential resolution
  readonly system: ReadonlyArray<string>                // agent.system, epoch baseline, workflow instructions
  readonly history: ReadonlyArray<SessionMessage.Message> // projected history the runner reloaded for this turn
  readonly tools: ReadonlyArray<ToolDefinition>         // permission-filtered materialization
  /** Records Tool.Called (provider.executed, executor "orchestra"), settles through the Location registry under the
   *  turn's CapabilityInvocation, records the result, returns the model-facing output. */
  readonly execute: (call: Call) => Effect.Effect<ToolRegistry.Settlement>
  /** Permission for a provider-executed call: waits until `call.id` is recorded, then PermissionV2.assert with the
   *  agent + session rules. Fails with PermissionV2 / QuestionV2 errors exactly like a local call. */
  readonly authorize: (call: Call) => Effect.Effect<void, PermissionV2.DeniedError | PermissionV2.DeclinedError>
  /** Creates (or adopts) a drainless child Session `ses_<hash(parent, callID)>` for a host subagent and returns a
   *  publisher for it. Its user message is published directly, never as an inbox row, so no wake can replay it. */
  readonly child: (input: { callID: string; agent: AgentV2.ID; prompt: string; title: string }) =>
    Effect.Effect<{ readonly sessionID: SessionSchema.ID; readonly publish: (event: LLMEvent) => Effect.Effect<void>; readonly close: Effect.Effect<void> }>
  readonly state: { readonly get: Effect.Effect<unknown>; readonly update: (fn: (value: unknown) => unknown) => Effect.Effect<void> }
}

export interface Interface {
  readonly id: string                // "claude-code"
  readonly stateKey: string          // "claudeCode" (E6)
  readonly ownsContext: boolean      // true: runner skips SessionCompaction and overflow recovery
  readonly stream: (turn: Turn) => Stream.Stream<LLMEvent, LLMError>
}

export class UnsupportedEngine extends Schema.TaggedErrorClass<UnsupportedEngine>()("ExecutionHost.UnsupportedEngine",
  { engine: Schema.String, agent: Schema.String }) {}

/** Location registry. Default: empty. Products register through Host.Contribution.locationNodes. */
export interface Registry {
  readonly register: (host: Interface) => Effect.Effect<void, never, Scope.Scope>   // duplicate id dies
  readonly get: (engine: string) => Effect.Effect<Interface | undefined>
}
export class Service extends Context.Service<Service, Registry>()("@orchestra/v2/ExecutionHost") {}
export const node = makeLocationNode({ service: Service, layer, deps: [] })
```

Stream rules (X1 enforces them; M1/M2 test them):
1. Exactly one `step-start` and one `step-finish` per stream; `finish` optional.
2. Every `tool-call` the host emits has `providerExecuted: true` and is followed by its `tool-result` or `tool-error`. A non-provider call is a contract violation: the runner fails it ("Execution host emitted an unsettled call").
3. Orchestra tools are never emitted by the host; they go through `turn.execute`.
4. Interruption: the runner interrupts the stream; the host's finalizer calls `query.interrupt()` and the runner records `INTERRUPTED_TURN` as today.
5. Provider failure (`billingRejection`, `SIGNED_OUT`, process exit) is a `provider-error` event, never a retry (`sdk.ts:19-35`).
6. The host sends Claude Code only user messages from `turn.history` that are not in `state.delivered`; it never resends history. A system text change (hash of `turn.system`) restarts the query with `resume` and the new `append`; `systemPrompt` stays `{ type: "preset", preset: "claude_code", append }` through `ClaudeCodeSDK.processLifetime` (`sdk.ts:42-47`).
7. Frames that arrive while no turn runs (background deliveries, an autonomous Claude Code turn) are buffered; the host admits one `queue` input (`SessionV2.prompt`, `resume: true`, synthetic `task-return` text) and attaches the buffered native turn to the next runner turn.

### 2.2 PORT-8 `SessionHostState` (new `core/session/host-state.ts`, global node)

```ts
export interface Interface {
  readonly get: (sessionID: SessionSchema.ID, key: string) => Effect.Effect<unknown>
  /** Read-modify-write of `session.metadata[key]` under a per-session KeyedMutex; other keys are preserved. */
  readonly update: (sessionID: SessionSchema.ID, key: string, fn: (value: unknown) => unknown) => Effect.Effect<void>
}
```

### 2.3 PORT-9 Session-scoped permission rules (edit `core/session/store.ts`, `core/session.ts`)

- `SessionStore.Interface.permissions(sessionID): Effect<PermissionV2.Ruleset>` reads `session.permission`.
- `CreateInput.permissions?: PermissionV2.Ruleset` writes it. Internal type only; no HttpApi change.
- The column type is `PermissionV1.Ruleset` (`session/sql.ts:51`). That V1 and V2 rule shapes are identical is
  **unverified**; X0 adds the conversion if they differ.
- Runner (X1): `effectiveRules = [...agent.permissions, ...session rules]` (later rules win, as V1 merges agent then session).

### 2.4 PORT-10 `TaskGovernance` (new `core/tool/task-governance.ts`, Location node, default allows all)

```ts
export interface Admission {
  readonly childID?: SessionSchema.ID              // reserved id (governed reservation); default: today's hash
  readonly permissions?: PermissionV2.Ruleset      // child session rules (write roots)
  readonly prompt?: Prompt                         // replaces { text: input.prompt } (grounded skills, Atlas resume)
  readonly background?: boolean                    // return at once; governance settles on child idle
  readonly receipt?: unknown                       // opaque, handed back to settle
}
export interface Interface {
  readonly input: Schema.Struct.Fields             // extra Task input fields; default {}
  readonly admit: (input: { parent: SessionSchema.Info; target: AgentV2.Info; input: Record<string, unknown>; context: Tool.Context }) =>
    Effect.Effect<Admission, ToolFailure>
  /** Called by the runner at the start of every provider turn of any Session (V1 `beforeModel`). */
  readonly beforeTurn: (session: SessionSchema.Info) => Effect.Effect<void, ToolFailure>
  readonly settle: (input: { child: SessionSchema.Info; reply: SessionMessage.Assistant | undefined; admission: Admission; context: Tool.Context }) =>
    Effect.Effect<{ readonly text: string; readonly structured?: Record<string, unknown> }, ToolFailure>
}
```
Background settlement (V1 `task-background.ts`) belongs to the Maestro implementation: it observes child idle through
the registry `session-idle` hook (`runner/llm.ts:458`) and delivers `task-return` to the parent with
`SessionV2.prompt({ delivery: "queue", resume: true })`.

### 2.5 PORT-11 `SessionCompaction` as a Location node (edit `core/session/compaction.ts`)

```ts
export interface Interface {
  readonly compactIfNeeded: (input: { sessionID; entries; model; request }) => Effect.Effect<boolean, …>   // today's
  readonly compactAfterOverflow: (input: { sessionID; entries; model; request }) => Effect.Effect<boolean, …>
  /** Non-destructive request view (continuity masking). Default identity. */
  readonly transform: (input: { sessionID; messages: ReadonlyArray<SessionMessage.Message>; model }) => Effect.Effect<ReadonlyArray<SessionMessage.Message>>
  /** After Step.Ended (continuity background pass). Default no-op. */
  readonly afterStep: (input: { sessionID; tokens; model }) => Effect.Effect<void>
}
export const node = makeLocationNode({ service: Service, layer /* wraps make(): behavior unchanged */, deps: [EventV2.node, llmClient, SessionSubagentModels.node, Config.node] })
```
Continuity replaces `SessionCompaction.node` through `Host.Contribution.replacements` (Location-scoped, applied to
every map, as Arsenal's `ToolSafety` already is).

---

## 3. Cards

### 3.1 Rules for every card

- Starts only after B1 I1 has landed (product paths exist). Own worktree; branch name of at most three words.
- Never install, typecheck, test or build locally. Static acceptance only; tests run through `bun run test:ci`, typecheck through the `typecheck.yml` dispatch (lead).
- Never edits `script/*.json` ledgers or registries, `package.json` `exports`, `bun.lock`, Nix files or AGENTS.md (lead).
- No V1 import in any new `src/v2/**` file: `rg -n 'from "(@/|@orchestra/core/v1)' <owned v2 files>` prints nothing.
- No new spawn site. `bun run check:spawn-imports` exits 0. A test that drives omni calls `expectSpawn(import.meta.path)` and needs B1 L4 landed.
- `bun run check:boundaries --scope <owned package path> --no-stale` exits 0.
- Refer to seats by id. `specialist-name-guard` must stay green.

### 3.2 W0: contracts (lead, serial)

| Card | Tier | Content | Owned files | Static acceptance / test:ci |
|---|---|---|---|---|
| **X0** contracts | O | §2.0 into the L2 brief (or a follow-up if L2 landed). PORT-7 (types, registry, empty default), PORT-8 (full, small), PORT-9 (store method, CreateInput field, row write), PORT-10 (types, allow-all default), PORT-11 (interface, node wrapping today's `make`, identity/no-op hooks). Register `ExecutionHost.node`, `TaskGovernance.node`, `SessionCompaction.node` in `locationServices`. No runner or task behavior change. AGENTS amendment (§0). Exports via `script/explicit-exports.ts core --write`. | `core/session/runner/execution-host.ts` (new), `core/session/host-state.ts` (new), `core/tool/task-governance.ts` (new), `core/session/compaction.ts`, `core/session/store.ts`, `core/session.ts`, `core/location-services.ts`, `core/host.ts`, `packages/server/src/routes.ts` (forward `locationNodes`), `packages/core/package.json`, `AGENTS.md`; tests `packages/core/test/{execution-host-registry,session-host-state}.test.ts` (new) | `bun run test:ci core test/execution-host-registry.test.ts test/session-host-state.test.ts test/session-compaction.test.ts test/prompt-context-compaction.test.ts test/session-runner.test.ts test/host.test.ts`; typecheck dispatch **T-C0** |

### 3.3 W1: core wiring (parallel, file-disjoint)

| Card | Tier | Content | Owned files | test:ci |
|---|---|---|---|---|
| **X1** runner host turn | O | In `runTurnAttempt`: `governance.beforeTurn(session)` first; select host by `agent.info.engine` (`undefined`/`"orchestra"` → today's path); unknown engine → `UnsupportedEngine` recorded as the assistant error. Host path: skip `models.resolve` (keep `subagentModels.assert` on the ref), skip `compactIfNeeded`/overflow when `ownsContext`, build `Turn` (execute, authorize, child, state as §2.1), source = `host.stream(turn)`; enforce stream rules 1–3. Both paths: `effectiveRules` = agent + `store.permissions` (PORT-9); use `SessionCompaction.Service` (replace line 120), apply `transform` before `toLLMMessages`, call `afterStep` after `Step.Ended`. `RunError` gains `UnsupportedEngine`. | `core/session/runner/llm.ts`, `core/session/runner/index.ts`; test `packages/core/test/session-runner-execution-host.test.ts` (new, scripted fake host: one stream per turn, provider-executed persistence, `execute` recorded before its side effect, steer promotes on the next turn, interrupt runs the finalizer and records `INTERRUPTED_TURN`, no compaction when `ownsContext`, history reloaded between turns, stray non-provider call fails) | `bun run test:ci core test/session-runner-execution-host.test.ts test/session-runner.test.ts test/session-runner-tool-events.test.ts test/session-runner-tool-registry.test.ts test/session-runner-policy.test.ts test/session-runner-model.test.ts test/session-runner-message.test.ts test/session-compaction.test.ts` |
| **X2** task governance | O | Replace `task.ts:323-324` with: target engine set and not `"orchestra"` → require `ExecutionHost.get(engine)`, else `ToolFailure("… has no execution host")`. Merge `governance.input` into the tool's input schema; call `admit` after `requireTarget`, before `permission.assert`; honor `childID` (still checked by `requireChild`), `permissions` (PORT-9 `CreateInput`), `prompt`, `background` (admit with `resume: false`, `execution.wake(child.id)`, return the started output at once); call `settle` for foreground replies and use its `text`/`structured`. Default governance keeps today's behavior byte-for-byte (existing tests unchanged). | `core/tool/task.ts`; test `packages/core/test/tool-task-governance.test.ts` (new: fake governance; reserved id, child rules applied by the runner, prompt override, background return, settle text, claude-code target with and without a registered host) | `bun run test:ci core test/tool-task-governance.test.ts test/tool-task.test.ts test/tool-task-cold.test.ts test/tool-task-http.test.ts` |

### 3.4 W2: product successors (rolling; each needs X0 merged, and the listed predecessor)

Module paths: `cc/` = `modules/engine-adapters/claude-code/`, `ma/` = `modules/maestro/coordination/`, `co/` = `modules/continuity/`.

| Card | Tier | Needs | Content | Owned files | test:ci |
|---|---|---|---|---|---|
| **M1** SDK → LLMEvent | S | X0 | Pure translator: `SDKMessage` stream → `LLMEvent` per §2.1 rules 1, 2, 5 (partial `stream_event` text/thinking deltas; `tool_use`/`tool_result` → provider-executed call/result under Orchestra ids; one `step-finish` at `result` with summed usage; `billingRejection`/`signedOut` → `provider-error`). Move the pure helpers `RENAME, toolName, toolInput, toolMetadata, todos, questions` (`ao/claude-code/host/mirror.ts:29-118`) verbatim to `cc/src/tool-map.ts`; V1 `host/mirror.ts` imports them from `@orchestra/engine-claude-code/tool-map` (its only edit). | `cc/src/v2/translate.ts` (new), `cc/src/tool-map.ts` (new), `removed-v1/src/claude-code/host/mirror.ts` (import lines only); test `cc/test/v2-translate.test.ts` (frames copied from `removed-v1/test/claude-code/engine-fixture.ts`) | `bun run test:ci engine-claude-code test/v2-translate.test.ts`; `bun run test:ci orchestra test/claude-code/host/mirror.test.ts test/claude-code/mirror.test.ts` |
| **M2** host lifecycle | O | X1, M1 | `ExecutionHost` implementation: process-local `Live` cache keyed by session id inside a Location node (released on Location scope close and after `IdleRelease`); `query()` only through `ClaudeHostOptions.build` + `ClaudeCodeSDK.processLifetime`; delta delivery from `turn.history` vs `state.delivered` (same state keys as V1, `host/session.ts:620-648`); `resume: claudeSessionID(id)`; `setModel` when `turn.model` changes; restart with `resume` on a `turn.system` hash change; revert → `resumeSessionAt` via `ClaudeHostBoundary.revert`; stream finalizer → `interrupt()`; rule 7 buffering. Builders come from an `Adapters` Context.Reference (`plugin`, `mcp`, `hooks`, as V1 `host/session.ts:101`) whose default refuses to start (no PreToolUse gate); the module exports `node` only, not a contribution. | `cc/src/v2/host.ts`, `cc/src/v2/state.ts` (new); tests `cc/test/v2-host.test.ts` (scripted `ClaudeCodeSDK.Service`, never the binary: preset kept, `processLifetime` used, delta only, V1 `metadata.claudeCode` fixture resumes, interrupt, idle release, system change restarts with resume, revert), `cc/test/preset-guard.test.ts` gains a V2 case | `bun run test:ci engine-claude-code test/v2-host.test.ts test/preset-guard.test.ts` |
| **M3** gate, hooks, MCP on V2 | O | M2, G1 | V2 `orchestra` MCP server serving `turn.tools` minus `ClaudeHostMcp.BUILTINS`/`LOOP_ONLY` (`host/mcp.ts:44-61`), handler → `turn.execute`; dispatch receipts as V1. V2 gate: port `ClaudeHostGate.decide` (`host/gate.ts:98`) onto V2 ports: `ask` → `turn.authorize`, `safety` → core `ToolSafety`, `arsenal` → `ArsenalNative`, `hold` → `MaestroSeats` + governance hold, `confine` → core sandbox; PreToolUse/PostToolUse hooks (`host/hooks.ts:78`) minus delegation (M4) and PostCompact (CN2). `ClaudeHostOptions.build` still refuses a session without a PreToolUse gate. | `cc/src/v2/{mcp,gate,hooks}.ts` (new); tests `cc/test/v2-{mcp,gate,hooks}.test.ts` | `bun run test:ci engine-claude-code test/v2-mcp.test.ts test/v2-gate.test.ts test/v2-hooks.test.ts` |
| **M4** seats plugin, delegation, process tool, assembly | O | M3, M5, G2, CN2 | V2 plugin builder (`host/plugin.ts:86`) from `AgentV2` seats + `turn.tools`; delegation records (`host/delegation.ts`) on V2: PreToolUse[Agent] → governance admission (G2) + `turn.child`; subagent frames → child publisher; PostToolUse[Agent] settles; background deliveries through rule 7. Port the additive `process` tool (`host/process-tool.ts:50`) onto the V2 registry. Assemble `cc/src/v2/contribution.ts`: `Adapters` = M4 plugin, M3 MCP, hooks in this order: M3 gate, M4 delegation, CN2 memory; `locationNodes` = host node (M2) + process tool; `references` = M5 catalog. | `cc/src/v2/{plugin,delegation,process-tool,contribution}.ts` (new); tests `cc/test/v2-{plugin,delegation,process-tool}.test.ts` (the process-tool test calls `expectSpawn`) | `bun run test:ci engine-claude-code test/v2-plugin.test.ts test/v2-delegation.test.ts test/v2-process-tool.test.ts` |
| **M5** catalog V2 | S | M2 | `HostCatalogV2.layer`: `CatalogAvailability.AdditionalProviders`/`DefaultModel` with the logic of `handlers/catalog.ts:30-55` on core `Config.entries()` + `ClaudeHostProvider.signedIn`. Exports `references`; M4 composes it. | `cc/src/v2/catalog.ts` (new); test `cc/test/v2-catalog.test.ts` | `bun run test:ci engine-claude-code test/v2-catalog.test.ts` |
| **G1** seats as V2 agents | S | X0 | One PluginV2 `ensure("maestro/native-seats")` after `config-agent` (pattern `upstream-v2.ts:46-77`): for every `roster` member with a `nativeProfile`, `AgentV2.transform` sets `system` (`renderPrompt`), description, mode, hidden, model, `engine` (config wins), and `permissions` = native floor (`nativeProfiles`) + deny rules for tools the seat may not see (G20 table, `ao/tool/registry.ts:544-565`). `MaestroSeats` Location service: the set of projected seat ids (native attestation). Registered through `locationNodes`. | `ma/src/v2/{seat-agents,seats-service}.ts` (new); test `ma/test/v2-seat-agents.test.ts` | `bun run test:ci maestro test/v2-seat-agents.test.ts`; `bun run test:ci orchestra test/agent/specialist-name-guard.test.ts` |
| **G2** governance core | O | X2, G1 | Maestro `TaskGovernance`: phases A–B of `ao/tool/task.ts:159-486` (native-seat deny, `SessionAuthority`, authorization, dispatch reservation, governed reservation, write roots → `Admission.permissions`, logical task, workflow binding, arsenal `beforeDispatch`), `Admission.prompt` (grounded skills, Atlas resume, resume marker, `ao/tool/task.ts:538, 583-585, 614`), `beforeTurn` = dispatch `requireCurrent` + `revalidateWorkflow`, and the Arsenal native refs (G22) as Location replacement nodes. Ports the V1-bound helpers it calls into `ma/src/v2/` against `SessionStore`/`SessionMessage`. | `ma/src/v2/{task-governance,authorization,dispatch,reservation,write-roots,logical-task,native-refs,prompt-parts}.ts`, `ma/src/v2/settle.ts` (stub, handed to G3) (new); tests `ma/test/v2-{task-governance,reservation,write-roots}.test.ts` | `bun run test:ci maestro test/v2-task-governance.test.ts test/v2-reservation.test.ts test/v2-write-roots.test.ts` |
| **G3** settle and background | S | G2 | Phases D–E: `settle` (backend work record, arsenal `verifiedCompletion`, discovery result, research allowance deadline), background settlement on child `session-idle` → `task-return` to the parent (`SessionV2.prompt`, `queue`, `resume: true`), upstream settlement receipt (`ao/session/upstream-task-settlement.ts:35-106`) on V2 tables only. | `ma/src/v2/settle.ts` (from G2's stub), `ma/src/v2/{background,upstream-settlement}.ts` (new); tests `ma/test/v2-{settle,background}.test.ts` | `bun run test:ci maestro test/v2-settle.test.ts test/v2-background.test.ts` |
| **G4** Maestro tools on V2 | S | G1 | Register the 12 `maestro_*` tools, the 3 Arsenal tools and the 2 Atlas tools (`ao/tool/registry.ts:362-439`) through a Location node calling `Tools.register`, each self-gated on `MaestroSeats` + agent id; `ctx.metadata` → `SessionEvent.Tool.Progress`; `ctx.ask` → `PermissionV2.assert`; Task-starting tools call the core `task` path, never a V1 `promptOps`. | `ma/src/v2/tools/*.ts` (new, one per tool group: `workflow`, `approval`, `plan`, `review`, `arsenal`, `atlas`), `ma/src/v2/tools.ts` (node); test `ma/test/v2-tools.test.ts` | `bun run test:ci maestro test/v2-tools.test.ts` |
| **G5** Atlas context | S | G1, CN1 | Atlas header as a System Context source `maestro/atlas-header` (`ao/maestro/atlas-header.ts:14`), registered per Location; Atlas resume restore through the continuity compaction (`afterStep`/summary input) and request path (`ao/maestro/atlas-resume-restore.ts:42-67`). | `ma/src/v2/{atlas-header-source,atlas-restore}.ts` (new); test `ma/test/v2-atlas.test.ts` | `bun run test:ci maestro test/v2-atlas.test.ts` |
| **CN1** continuity strategy | O | X1 | `SessionCompaction` replacement: hard limit `min(0.7·context, inputLimit)` from last-step tokens, background pass at the configured trigger in `afterStep` (BackgroundJob, fenced, 3-failure stop), masking in `transform` (`masking.ts`), archive writes (file format unchanged, `archive-format.ts`), `ProjectCheckpoint` block; falls back to core summary compaction when disabled. Shipped as `contribution().replacements`. | `co/src/v2/{strategy,trigger,maintenance}.ts` (new; `masking.ts`, `archive*.ts` reused from B1 C8 or moved here if still in removed-v1); tests `co/test/v2-strategy.test.ts`, `co/test/v2-maintenance.test.ts` | `bun run test:ci continuity test/v2-strategy.test.ts test/v2-maintenance.test.ts` |
| **CN2** recall and Claude memory | S | CN1, M3 | `context_recall` and `context_compact` on the V2 registry; aliases `uN/aN/tN` and `RequestSource` over `SessionMessage` (pure ports of `alias.ts`, `request-source.ts`); Claude Code bridge: PostCompact archives the native summary and working memory injection (`host/hooks.ts:213-241`, `host/memory.ts:24-128`) as a hook module M3 imports. | `co/src/v2/{tools,alias,request-source}.ts`, `cc/src/v2/memory.ts` (new); tests `co/test/v2-tools.test.ts`, `cc/test/v2-memory.test.ts` | `bun run test:ci continuity test/v2-tools.test.ts`; `bun run test:ci engine-claude-code test/v2-memory.test.ts` |

### 3.5 W3: composition and guards

| Card | Tier | Needs | Content | Owned files | Acceptance |
|---|---|---|---|---|---|
| **K1** serve composes the product | H | M2–M5, G1–G5, CN1–CN2 | `apps/cli/src/host.ts` (B1 K1) lists, in this order: `ArsenalNative.contribution`, then each card's own export: `MaestroSeatAgents` (G1), `MaestroGovernance` (G2), `MaestroBackground` (G3), `MaestroTools` (G4), `MaestroAtlas` (G5), `ContinuityStrategy` (CN1), `ContinuityTools` (CN2), `ClaudeCodeV2` (M4's assembly). Every one is `{ id, … }: Host.Contribution` exported as `contribution` from the card's own file. No other file. New test builds `createRoutes({ host })`, opens a Location and asserts: `ExecutionHost.get("claude-code")` defined, `maestro_*` tools materialize for `maestro` only, `SessionCompaction` is the continuity one, catalog lists anthropic with `executionHost`. | `apps/cli/src/host.ts`, `apps/cli/package.json` deps (lead adds), `apps/cli/test/serve-product.test.ts` (new) | `bun run test:ci cli test/serve-product.test.ts`; `bun run test:ci server` |
| **K2** mode guards | S (O reviews) | M4 | V2 counterpart of `mode-boundary.test.ts`: only `cc/src/v2/**` and `apps/cli/src/host.ts` import `@orchestra/engine-claude-code/v2/*`; `query` is called only inside `processLifetime` options; no file sets `systemPrompt` other than the preset. Must flag a planted import from `packages/core` and a planted custom `systemPrompt` (teeth cases). | `cc/test/v2-mode-boundary.test.ts` (new) | `bun run test:ci engine-claude-code test/v2-mode-boundary.test.ts` |
| **K3** V2 dogfood proof | O (lead) | K1 | Real `orchestra serve` from the branch with an isolated `ORCHESTRA_DB`; owner-style exploration: Maestro on Claude Code runs a governed Task to `backend`, a Relay workflow step, a steer, Stop, revert, a Claude subagent with its child Session, continuity on a long orchestra-engine session. Report delegated vs owner-typed honestly. | none (evidence outside Git) | checklist in §6 |

---

## 4. Order and critical path

```
B1: L0 → L1 → L2(+§2.0) → W1 moves (C4, C5, C7, C8 needed) → I1
                                   ↓
X0 ─┬─ X1 ─┬─ M2 ─ M3 ──────────┬─ M4 ─┐
    │      ├─ M5 (after M2) ────┤      │
    │      └─ CN1 ─ CN2 (after M3)┘    ├─ K1 ─ K3 → B6 gate (§6); K2 after M4
    ├─ X2 ─ G2 ─ G3 ───────────────────┤   (M4 also needs G2)
    ├─ G1 ─ G4; G5 (after CN1) ─────────┘
    └─ M1 (any time; M2 needs it)
```

- **Critical path:** B1 I1 → X0 → X1 → M2 → M3 → CN2 → M4 → K1 → K3 → B6 (M4 also waits for G2 and M5). X2 → G2 runs beside X1 → M2 and joins
  at M4; it becomes critical if G2 overruns M2+M3.
- Dispatch rolling: W1 is two Opus cards; W2 starts M1, G1 as soon as X0 merges, the rest on their predecessors.
- File-disjointness: X0 owns every shared core file (`location-services.ts`, `session.ts`, `store.ts`,
  `compaction.ts`, `host.ts`, `routes.ts`); X1 owns only `runner/{llm,index}.ts`; X2 only `tool/task.ts`. W2 cards
  create new files only, except M1's import lines in one V1 file. Each W2 card exports its own `contribution`; the only
  assembly inside a module is M4's `cc/src/v2/contribution.ts`, after every card it composes. G2 creates
  `ma/src/v2/settle.ts` as a pass-through stub that G3 then owns (sequential hand-over, not parallel edits).
- CI cadence: change-scoped `test:ci` per card (listed); typecheck dispatches T-C0 (after X0), T-C1 (after X1+X2),
  T-C2 (after W2); epic CI once at the end of B1-C before K3.

---

## 5. Risks

1. **The host contract is the whole design.** If `turn.execute`/`authorize`/`child` leak persistence into the module,
   the AGENTS invariant is lost. X1 owns all three; M-cards may not import `SessionEvent` or `EventV2` publish (K2 can
   add that rule).
2. **Billing rule.** Every `query()` must pass `processLifetime` with the `claude_code` preset (`sdk.ts:42-47`). M2's
   restart-on-system-change must keep `append` only. Never tune the appended text to dodge third-party billing.
3. **Process-local cache vs drains.** The `Live` cache is keyed by session id inside a Location node; two Locations of
   one session cannot exist (`runner/llm.ts:195-196` interrupts a placement mismatch). Location eviction
   (`idleTimeToLive: 60 minutes`, `location-services.ts:129`) releases live queries; resume restores them.
4. **Steer semantics change (E4).** Visible to the owner in dogfooding; O-1.
5. **Background frames between drains (rule 7).** The most intricate part of M2/M4; V1 needed many race fixes
   (`test/claude-code/host/dispatch-races.test.ts`, `lifecycle-regressions.test.ts`). Port those scenarios as tests,
   not the code paths.
6. **Child Sessions without inbox rows (`turn.child`).** That a user-message event can be published without a
   `session_input` row and without breaking projection is **unverified**; X1 must prove it in its test before M4.
7. **Session permission shape (PORT-9).** V1 ruleset in a V2 runner; unverified identity of shapes.
8. **Governance volume.** G2/G3 port ~4k lines of V1-bound Maestro helpers. They are rewrites against V2 types, not
   moves; keep each helper's V1 test scenarios as the V2 test list.
9. **Two servers on one DB** during the B6 fallback release: exclusive by construction (§6), never both.
10. **omni guard reach.** M4's process-tool test spawns through omni; B1 L4 must have landed or the test escapes the guard.
11. **Overclaiming.** B1-C builds V2 successors; the V1 copies and 63 R11 rows remain until B9. Say so in every PR.

---

## 6. Desktop flip (B6) preconditions

B6 (`ORCHESTRA_SIDECAR_V2` default-on in `apps/desktop/src/main/index.ts:86` and `candidate-profile.ts:141`, with a
user-visible fallback to the V1 bundle for one release) may land only when all hold:

1. **B1-C done:** K1 green, K2 green, epic CI green, K3 proof accepted by the owner.
2. **Desktop-owned child (B4):** desktop main spawns the packaged `resources/cli` binary as `orchestra serve` through
   the desktop omni spawner (pattern `wsl/sidecar.ts:42-49`), not the shared daemon (`background-cli.ts:57-61`), with:
   per-launch password passed in env (`serve` reads `ORCHESTRA_SERVER_PASSWORD` before `Daemon.password()`,
   `serve.ts:21`); the per-launch env V1 injects (`server.ts:102-117`: Claude executable and resources, playbooks,
   ripgrep, `ORCHESTRA_CLIENT=desktop`, `XDG_STATE_HOME=userData`); health wait as `server.ts:202-228`.
3. **HTTP CORS on V2 (B4):** an `HttpMiddleware.cors` layer for `oc://renderer` in `packages/server/src/routes.ts`
   (V1 has it at `httpapi/server.ts:129-131`).
4. **Dock/Linux transport (B4 + B1 K2):** `AppDock.Transport` over a child channel (stdio fd or local socket) replacing
   `parentPort`; desktop main routes it to `LinuxWorkspaceRPC.handle`/`handleDockRPC` (`index.ts:456-460`).
5. **Renderer routes (B2/B3):** the V1-only groups the renderer calls (convergence B.1), including session fork (G11).
6. **Migration (B5):** storage migrations, state-dir handover, V1-era history visibility.
7. **Exclusive fallback:** the setting chooses one server per launch; the app never runs the V1 sidecar and the V2
   child on one `orchestra.db` at once.
8. **Feature checklist** (K3, repeated in the real desktop): Maestro on both engines, governed Task to each foreground
   seat, Relay workflow step, steer, Stop, revert, Claude subagent child Session, background seat delivery, Dock and
   Linux tools, continuity compaction and recall, Claude sign-in picker.

---

## 7. Estimate

| Item | Count |
|---|---|
| Cards | **18**: X0–X2 (3), M1–M5 (5), G1–G5 (5), CN1–CN2 (2), K1–K3 (3); X0 and K3 are lead cards. Typecheck dispatches and the epic CI are lead gates, not cards. |
| By tier | **Opus 9** (X0, X1, X2, M2, M3, M4, G2, CN1, K3) · **Sonnet 8** (M1, M5, G1, G3, G4, G5, CN2, K2; Opus reviews K2) · **Haiku 1** (K1) |
| Why few Haiku cards | B1-C is rewrite work against new contracts, not moves. The only mechanical step is the composition list (K1). |
| Wall-clock (after B1 I1) | X0 0.5 day · W1 (X1 ∥ X2) 1–1.5 days · W2 rolling 3–4 days (critical chain M2 → M3 → CN2 → M4) · K1–K3 + epic CI 1 day. **About 6–7 working days**, assuming the lead reviews each Opus card the day it lands. |
| Lines (estimate, unverified) | new V2 code ≈ 6–8k (claude-code ≈ 3k, maestro ≈ 3k, continuity ≈ 1.5k, core ≈ 0.8k) plus tests |

---

## 8. Owner decisions (only what this design could not settle)

| ID | Decision | Default |
|---|---|---|
| O-1 | Accept that a steer sent during a Claude Code turn reaches Claude Code when that turn ends (V2 boundary rule), instead of mid-turn as in V1. Mid-turn injection would need an AGENTS exception that lets an execution host promote steers inside its own turn. | **Accept**; revisit after K3 dogfooding |

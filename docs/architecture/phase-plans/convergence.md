# Product convergence plan: one client, one server, one CLI

Base: `fork/dev` @ `769b3b6e69` (Merge #809 scaffold-followups). Read-only measurement against a `git archive` snapshot;
nothing was built, typechecked or tested. Counts come from scripts that parse import statements and count
word-boundary references of each imported local name in the importing file ("uses" = references excluding the import
line). Runtime call counts are regex over `client.X.Y(` / `api.X.Y(` chains and are approximate (±10%).

---

## Track A — remove the legacy SDK (`@orchestra/sdk`, packages/sdk/js) and the vendored client (`@opencode-ai/client` 1.17.13 tgz)

### A.0 Findings that shape the whole track

1. **`@orchestra/client` is the same generator lineage as the vendored client** (both are httpapi-codegen Promise
   clients over `/api/*`). Differences are mechanical but real:
   - group names are plural (`session`→`sessions`, `agent`→`agents`, `model`→`models`, `provider`→`providers`,
     `command`→`commands`, `reference`→`references`, `permission`→`permissions`, `question`→`questions`,
     `file`→`files`, `pty`→`ptys`, `projectCopy`→`projectCopies`); nested paths flatten
     (`permission.request.list`→`permissions.listRequests`, `integration.connect.key`→`integrations.connectKey`);
   - the canonical client exports **only per-endpoint `XxxInput/XxxOutput` types** (352 names) and no named
     component types (`SessionInfo`, `SessionMessageInfo`, `FileDiffInfo`, `McpServer`, `Project`, `CommandInfo`…).
     Component types must come from `@orchestra/schema` (`typeof X.Encoded` for wire shape) or be derived from
     outputs (`SessionsGetOutput`, `MessagesListOutput[number]`);
   - **43 of the vendored client's 91 endpoint paths do not exist in the canonical protocol**:
     `/api/mcp*` (5), `/api/project*` (3), `/api/vcs/{status,diff}`, `/api/shell*` (4), `/api/form*` (6),
     `/api/session/:id/{rename,fork,move,command,shell,skill,synthetic,pending,background,generate,instructions*}`,
     `/api/generate`, `/api/plugin`, `/api/server`, `/api/service/stop`, `/api/debug/location`,
     `/api/experimental/*`, `/api/integration/:id/connect/command*`, `/api/fs/read` (omitted from generation on
     purpose; raw transport). No server in the repo serves `/api/mcp`, `/api/project*`, `/api/session/:id/rename`
     (grep of removed-v1/src, packages/server/src, packages/protocol/src).
2. **app-shell already runs two protocols.** `utils/server-protocol.ts` probes `/global/health` first: the legacy
   sidecar answers it, so the desktop runs in **"v1" mode**. In v1 mode `utils/server-compat.ts#createV1Api` reroutes
   `session` (14 methods), `project` (3), `vcs` (2), `file` (2), `integration` (get/connect/oauth), `pty` (5),
   `permission.reply`, `question.reply/reject` to the **legacy `OrchestraClient`** (V1 routes); every other namespace
   goes to the vendored client at `/api/*`. The vendored client is therefore mainly the *TypeScript shape* of
   `ServerApi` (`export type ServerApi = OpenCodeClient`, utils/server.ts:62). Against a pure V2 server ("v2" mode) the
   vendored-only paths above 404 — see B.4.
3. **The legacy SDK is generated from removed-v1** (`packages/sdk/js/script/build.ts:15` runs
   `bun dev generate` in removed-v1). Once Track B deletes removed-v1 the SDK can no longer be regenerated;
   it must be frozen or deleted at that point. Tracks A and B are coupled here.
4. **Legacy *runtime* calls, not types, are the blocker.** Value imports through facades are only:
   `createOrchestraClient` (app-shell `utils/server.ts`, tui `context/sdk.tsx`, cli `services/daemon.ts`) and
   `OpenCode`/`ClientError` (app-shell `utils/server.ts`, `utils/server-health.ts`). Everything else is `type`.
   But behind those two clients: tui calls ~70 distinct legacy client methods (e.g. `session.fork` 5,
   `permission.reply` 5, `instance.dispose` 4, `vcs.status` 3, `mcp.status/connect/disconnect`, `lsp.status`,
   `formatter.status`, `config.get`, `experimental.workspace.*` 7, `experimental.console.switchOrg`, `global.upgrade`)
   plus 18 `client.v2.*` calls; app-shell calls ~90 (e.g. `instance.dispose` 8, `session.update` 7, `vcs.get` 5,
   `file.read` 4, `pty.*` 12, `worktree.*` 6, `mcp.*` 5, `project.lean*` 3, `session.processes/processStop`,
   `global.config.*`). These hit V1 routes that only removed-v1 serves.
5. **Wire-type policy is the one design decision.** SDK types are mutable with plain `string` ids; schema types are
   `readonly` with branded ids (`Model.ID = String.brand("ModelV2.ID")`). `typeof X.Encoded` gives plain-string,
   readonly shapes = the SDK's wire shape minus mutability. Mutating code (`variants.push`, Solid `produce` on parts)
   breaks on readonly and must be fixed per call site.

### A.1 Per-facade symbol inventory (src only; `n/m` = import sites / references)

Facade files on fork/dev: 13 (`*/src/compat/*.ts`). Importers (non-test): app-shell 126 files (sdk-v2-client 58,
sdk-v2 38, vendored-client-promise 29, vendored-client 1), tui 26, session-ui 20 (12+3+5), plugin 14 (11+2+1),
core 3, cli 1.

Legend for the equivalent column: **=** exact (same fields; readonly/brand only), **≈** needs adapter (named
difference), **✗** missing.

#### core — `compat/sdk-v2-types` (3 files) → **swap-ready**
| Symbol | n/m | Equivalent |
|---|---|---|
| ModelV2Info | 2/9 | = `Model.Info` (`@orchestra/schema/model`; core may use decoded type) |
| CredentialValue | 1/1 | = `Credential.Value` |

Only caveat: `variant.ts#generate` returns `ModelV2Info["variants"]`; the schema version is a `ReadonlyArray`.

#### cli — `compat/sdk-v2-client` (1 file) → **swap-ready**
| createOrchestraClient | 1/3 | = `Orchestra.make` from `@orchestra/client`; the daemon only calls `client.v2.health.get` → `health.get` and (debug/agents.ts) `client.v2.agent.list` → `agents.list` |

#### plugin — 3 facades (14 files, 47 symbol-imports)
`compat/sdk-v2-types` (11 files under `src/v2/**`, 19 symbols) → **swap-ready with the readonly caveat**:
| Symbol | n/m | Equivalent |
|---|---|---|
| ModelV2Info | 3/7 | = `Model.Info` |
| ProviderV2Info | 1/2 | = `Provider.Info` |
| AgentV2Info | 1/3 | = `Agent.Info` |
| CommandV2Info | 1/3 | = `Command.Info` |
| SkillV2Source | 1/2 | = `Skill.Source` |
| ReferenceGitSource / ReferenceLocalSource | 1/2 each | = `Reference.GitSource` / `Reference.LocalSource` |
| FileSystemEntry | 1/3 | = `FileSystem.Entry` |
| CredentialOAuth / CredentialValue | 1/5, 2/2 | = `Credential.OAuth` / `Credential.Value` |
| IntegrationRef, IntegrationMethod, IntegrationEnvMethod, IntegrationKeyMethod, IntegrationOAuthMethod, IntegrationInputs | 1/3, 1/2, 1/1, 1/1, 1/1, 1/1 | = `Integration.Ref/Method/EnvMethod/KeyMethod/OAuthMethod/Inputs` |
| ConnectionInfo (+2 inline `import()` uses) | 1/2 + 2 | = `Connection.Info` |
| Event | 1/1 | ≈ `OrchestraEvent` (`@orchestra/client`, = `EventsSubscribeOutput`) or a union derived from `EventManifest.Latest`; `EventMap` keys on `Item["type"]`, so the union must keep the `type` discriminant |

`compat/sdk-v2` (`src/tui.ts`, `src/index.ts`; 18 symbols) and `compat/sdk` (`src/index.ts`; 10 symbols, the
*root* V1 SDK) → **blocked** (V1 shapes and a live legacy client in the public API):
| Symbol | n/m | Equivalent |
|---|---|---|
| OrchestraClient (TuiPluginApi.client) | 1/1 | ✗ no V1-route client in @orchestra/client |
| createOrchestraClient (PluginInput.client) | 1/1 | ✗ same; removed-v1/src/plugin/index.ts:152 builds it for every V1 plugin |
| Config | 2/2 | ✗ no config schema in schema/protocol |
| LspStatus, McpStatus | 1/1 each | ✗ |
| Event (V1 bus union) | 2/3 | ≈ partial: per-event definitions exist (`SessionV1.Event`, `LegacyEvent`), no union |
| Message, UserMessage, Part, TextPart, FilePart, AgentPart | 2/2, 1/4, 2/4, 1/1, 1/1, 1/1 | = `SessionV1.Info/User/Part/TextPart/FilePart/AgentPart` |
| Session, SessionStatus, Todo | 1/1 each | = `SessionV1.SessionInfo`, `SessionStatusEvent.Info`, `SessionTodo.Info` |
| PermissionRequest, QuestionRequest | 1/1 each | = `PermissionV1.Request`, `QuestionV1.Request` |
| Provider, Model (V1, root + v2) | 3/6, 2/7 | ✗ V1 provider-list shape (`models: Record<string, Model>`); V2 `Provider.Info`/`Model.Info` differ |
| Project | 1/1 | = `Project.Info` |
| Permission (root V1) | 1/1 | ✗ (old permission shape) |
| Auth | 1/2 | ✗ (`OAuth | ApiAuth | WellKnownAuth`; closest `Credential.Value`) |

#### session-ui — 3 facades (20 files) → **needs-adapter** (types only; zero runtime calls)
| Symbol | n/m | Equivalent |
|---|---|---|
| ToolPart | 2/11 | = `SessionV1.ToolPart` |
| Part | 4/12 | = `SessionV1.Part` |
| AssistantMessage / UserMessage / Message | 2/13, 2/7, 3/5 | = `SessionV1.Assistant/User/Info` |
| FilePart / TextPart / ReasoningPart / AgentPart / FilePartSource | 2/6, 1/4, 1/1, 1/2, 1/1 | = `SessionV1.*` |
| SnapshotFileDiff | 5/7 | = `FileDiff.Info` (identifier "SnapshotFileDiff") |
| VcsFileDiff | 3/4 | ≈ `FileDiff.Info` with `file` required (alias `FileDiff.Info & { file: string }`) |
| FileDiffInfo (vendored) | 5/6 | ≈ `FileDiff.Info` with `file`, `patch`, `status` required |
| FileContent | 4/4 | ✗ (legacy `/file/content` shape with hunks) — keep a local type in session-ui |
| Session / SessionStatus / Todo | 2/2, 3/3, 1/1 | = `SessionV1.SessionInfo`, `SessionStatusEvent.Info`, `SessionTodo.Info` |
| QuestionAnswer / QuestionInfo | 1/1 each | = `QuestionV1.Answer` / `QuestionV1.Info` |
| Provider | 1/1 | ✗ V1 provider shape — local structural type (it reads only a few fields) |

Adapters to name: (1) `FileDiff` aliases with required fields; (2) local `FileContent`/`Provider` types; (3) readonly
fallout in any code that mutates parts.

#### tui — `compat/sdk-v2` (26 files, 58 symbols, 81 import sites) → **blocked** (runtime legacy client)
- = schema (32 symbols): LocationRef 2/20 → `Location.Ref`; AssistantMessage 5/13, UserMessage 3/7, Message 1/4,
  Part 3/6, TextPart 4/6, ReasoningPart 1/3, ToolPart 1/8, FilePart 2/2, AgentPart 1/1 → `SessionV1.*`;
  SessionMessage 1/7, SessionMessageAssistant 1/3, SessionMessageAssistant{Text,Reasoning,Tool} 1/1 each →
  `SessionMessage.Message/Assistant/AssistantText/AssistantReasoning/AssistantTool`; SnapshotFileDiff 2/2 →
  `FileDiff.Info`; PermissionRequest 2/3 → `PermissionV1.Request`; QuestionRequest 2/2 → `QuestionV1.Request`;
  QuestionAnswer → `QuestionV1.Answer`; AgentV2Info, CommandV2Info, ModelV2Info, ProviderV2Info, SkillV2Info,
  IntegrationInfo, ReferenceInfo, SessionV2Info, PermissionV2Request, PermissionSavedInfo, QuestionV2Request,
  FileSystemEntry (1/1 each) → `Agent.Info`, `Command.Info`, `Model.Info`, `Provider.Info`, `Skill.Info`,
  `Integration.Info`, `Reference.Info`, `Session.Info`, `Permission.Request`, `PermissionSaved.Info`,
  `Question.Request`, `FileSystem.Entry`; Session 1/1 → `SessionV1.SessionInfo`; SessionStatus → `SessionStatusEvent.Info`;
  Todo → `SessionTodo.Info`.
- ≈ adapter (6): Event 2/6, GlobalEvent 1/6, V2Event 1/2 → `OrchestraEvent` / a derived union (GlobalEvent is the
  `/global/event` envelope `{directory, project, workspace, payload}`, no canonical equivalent); VcsFileDiff 1/1 and
  VcsFileStatus 1/4 → `FileDiff.Info` variants; Agent 1/1 (V1 agent list) → `Agent.Info` differs.
- ✗ missing (20): createOrchestraClient (runtime), Provider 4/14 (V1), Workspace 3/8 (schema `workspace.ts` has only
  `ID`/`Event`), ProviderAuthMethod 2/2, ProviderAuthAuthorization 1/2, ConsoleState 1/2, Config, Command (V1),
  LspStatus, McpStatus, McpResource, FormatterStatus, ProviderListResponse, VcsInfo, Path, ProjectDirectories
  (schema exports only its `Event`), ExperimentalConsoleListOrgsResponse, ExperimentalWorkspaceAdapterListResponse.
- Runtime: ~70 distinct legacy methods (see A.0.4). The type swap can land; the client swap waits for Track B.

#### app-shell — 4 facades (126 files) → **blocked** (runtime) / types needs-adapter
`compat/sdk-v2-client` (58 files, 39 symbols, 150 sites) and `compat/sdk-v2` (38 files, 20 symbols, 71 sites):
- = schema: Session 18/78 (+3/5) → `SessionV1.SessionInfo`; Part 14/41 (+7/16), Message 14/38 (+6/9),
  AssistantMessage, UserMessage, ToolPart, TextPart, FilePart, AgentPart, FilePartSource, ToolStateCompleted,
  AgentPartInput, FilePartInput, TextPartInput → `SessionV1.*`; PermissionRequest 10/18 → `PermissionV1.Request`;
  QuestionRequest 7/9 → `QuestionV1.Request`; QuestionAnswer 1/4 → `QuestionV1.Answer`; Todo 4/8 (+2/4) →
  `SessionTodo.Info`; SessionStatus 6/7 (+2/3) → `SessionStatusEvent.Info`; Project 5/21 (+2/2) → `Project.Info`;
  SessionV2Info 2/4 → `Session.Info`; ReferenceInfo 4/4 → `Reference.Info`; ScheduledTaskInfo 1/2 →
  `ScheduledTask.Info`; AgentFileInfo/Input/Permission/Action → `AgentFile.Info/Input/Permission/Action`;
  SnapshotFileDiff 7/10 → `FileDiff.Info`.
- ≈ adapter: Event 2/5, EventSessionError 1/2 → event union (see tui); VcsFileDiff 6/9 → FileDiff variant;
  Agent 7/22 → V1 agent list shape ≠ `Agent.Info`; V2SessionListResponse 1/1 → `SessionsListOutput`.
- ✗ missing: OrchestraClient 8/19 + createOrchestraClient 1/2 (runtime V1 routes), FileNode 7/19, Path 5/7,
  Config 4/6, Provider 5/5, SessionProcess 2/5, VcsInfo 2/4, PermissionActionConfig 1/3, PermissionRuleConfig 1/3,
  ProviderAuthResponse 2/2, LspStatus 2/2, ProviderListResponse 1/1, FileContent 2/2.

`compat/vendored-client-promise` (29 files, 47 symbols, 78 sites) + `compat/vendored-client` (1 file):
| Symbol | n/m | Canonical |
|---|---|---|
| OpenCode / OpenCodeClient / ClientError | 1/1, 1/2, 1/1 | ≈ `Orchestra.make` / `ReturnType<typeof Orchestra.make>` / `ClientError` (=) |
| SessionApi 5/14, CatalogApi 1/5 (+ test-only AgentApi, CommandApi, ReferenceApi) | | ≈ `Client["sessions"]` etc.; the canonical package exports no `XxxApi` aliases (add them or derive) |
| SessionMessageInfo 9/32, SessionMessageAssistant 1/2, SessionMessageAssistantTool 2/2, SessionMessageUser 1/2, SessionMessageShell 1/2 | | = `SessionMessage.Message/Assistant/AssistantTool/User/Shell` (schema, Encoded) |
| SessionInfo 3/3 | | = `Session.Info` / `SessionsGetOutput` |
| FileDiffInfo 9/12 | | ≈ `FileDiff.Info` with required fields |
| SessionActiveOutput, SessionListInput, SessionCompactInput/Output, SessionPromptInput/Output | | = `Sessions*` (rename only) |
| AgentListInput/Output, ModelListOutput, ModelDefaultOutput, ProviderListOutput, CommandListInput/Output, ReferenceListInput/Output | | = `Agents*`, `Models*`, `Providers*`, `Commands*`, `References*` (rename only) |
| OpenCodeEvent 1/3 | | = `OrchestraEvent` |
| IntegrationMethod 1/1, IntegrationOauthConnectOutput 1/2 | | = `Integration.Method` / ≈ `IntegrationsConnectOauthOutput` |
| PermissionV2Request 1/1 | | = `Permission.Request` |
| CommandInfo 2/2 | | = `Command.Info` |
| McpServer 5/8, McpResource 2/4, McpListInput/Output, McpResourceCatalogInput/Output | | ✗ no MCP endpoints in protocol |
| Project 2/5, ProjectCurrent, ProjectCurrentInput/Output, ProjectListOutput | | ✗ no project endpoints in protocol (`Project.Info` type exists) |
| SessionCommandInput/Output, SessionShellInput/Output, SessionPendingMessage | | ✗ no command/shell/pending endpoints |

### A.2 Classification

| Package | Class | Why |
|---|---|---|
| core | **swap-ready** | 2 symbols, both in schema |
| apps/cli | **swap-ready** | 2 calls, both in @orchestra/client (`health.get`, `agents.list`) |
| plugin `src/v2/**` | **swap-ready** (readonly caveat; external contract change) | 19 symbols, all in schema except `Event` (≈ union) |
| session-ui | **needs-adapter** | types only; FileDiff required-field aliases, local `FileContent`/`Provider` |
| tui | **blocked** | 20 missing types + ~70 V1-route calls via the legacy runtime client |
| app-shell | **blocked** | 13 missing legacy types, 13 missing vendored types (MCP, project, command/shell), ~90 V1-route calls, ServerApi shape tied to vendored client |
| plugin `src/index.ts`, `src/tui.ts` | **blocked** | public API exposes a live legacy client (`PluginInput.client`, `TuiPluginApi.client`), `Config`, `LspStatus`, `McpStatus`, V1 Provider/Model |

### A.3 Plugin external contract — exported types that change

- **Change on the v2 swap (lot A3), shape-compatible except `readonly` (and brands if decoded types are chosen):**
  `ReferenceDraft` (v2/effect/reference.ts), `AgentDraft` (agent.ts), `AISDKHooks` (v2/effect/aisdk.ts and
  v2/promise/aisdk.ts), `IntegrationOAuthAuthorization`, `IntegrationOAuthMethodRegistration`,
  `IntegrationMethodRegistration`, `IntegrationDraft`, `IntegrationHooks` (v2/effect/integration.ts and
  v2/promise/integration.ts), `FileSystem` (filesystem.ts), `CommandDraft` (command.ts), `EventMap` (event.ts),
  `CatalogProviderRecord`, `CatalogDraft` (catalog.ts), `SkillDraft` (skill.ts). 16 exported types in 11 files.
- **Change only when the TUI plugin API is redesigned (blocked):** `TuiPromptInfo`, `TuiState`, `TuiSidebarMcpItem`,
  `TuiSidebarLspItem`, `TuiSidebarTodoItem`, `TuiEventBus`, `TuiPluginApi` (src/tui.ts).
- **Change only when V1 plugins are retired with removed-v1 (blocked):** `ProviderContext`, `PluginInput`,
  `Config`, `AuthHook`, `ProviderHookContext`, `ProviderHook`, `Hooks` (src/index.ts). Consumers: removed-v1
  (20 files) and external V1 plugins; V2 core loads plugins only through `@orchestra/plugin/v2/*`
  (packages/core/src/plugin/sdk-runtime.ts maps `@orchestra/plugin` root to `./tool` only).
- `@orchestra/plugin` has no `private` flag and no publish job in `.github/workflows`; it reaches plugin authors through
  the runtime module map (`sdk-runtime.ts`), so the contract is the type shape, not an npm version.

### A.4 Lots (card-sized, disjoint by file) and order

| # | Lot | Files | Size | Depends on |
|---|---|---|---|---|
| A1 | core: swap 2 types to schema, drop `core/src/compat/sdk-v2-types.ts`, drop core devDep `@orchestra/sdk`, migrate 3 core tests importing `@orchestra/sdk/v2/types` / `@opencode-ai/client` | core/src/plugin/{variant,models-dev}.ts, core/src/plugin/provider/opencode.ts, core/test (3), core/package.json, ledger R1 row | S (1 card) | — |
| A2 | cli: daemon + debug/agents to `@orchestra/client`, drop `apps/cli/src/compat/sdk-v2-client.ts`, drop `@orchestra/sdk` dep | apps/cli/src/services/daemon.ts, handlers/debug/agents.ts, package.json | S (1) | — |
| A3 | plugin v2 types to schema/client; `EventMap` from `OrchestraEvent`; drop `plugin/src/compat/sdk-v2-types.ts` | plugin/src/v2/** (11 files) | M (1–2) | owner decision D-A1, D-A2 |
| A4 | session-ui types to schema + local adapters; drop its 3 facades and both deps; migrate its 4 test files | session-ui/src (20 files), session-ui tests (4), package.json | M (2) | D-A1 |
| A5 | app-shell vendored client → `@orchestra/client`: rewrite `ServerApi` as an explicit app-local interface (`utils/server.ts`, `server-compat.ts`, `server-health.ts`) keeping today's method names, implemented by `Orchestra.make` + legacy client; rename vendored types in the other 26 files | app-shell: utils/server*.ts + 26 files + 1 test; storybook mock `server-sdk.ts` | L (3) | missing endpoints decided (D-A3) |
| A6 | app-shell legacy *types* → schema (no runtime change) | the 96 app-shell files on `sdk-v2`/`sdk-v2-client` minus those in A5; split in 3 cards by directory (`context/`, `pages/`, `components+utils`) | L (3) | D-A1, A5 merged first (shared files `server-compat.ts`) |
| A7 | tui legacy types → schema (keep runtime client behind its facade) | tui/src 26 files | M (2) | D-A1 |
| A8 | tests: app-shell 57 test files + 4 e2e, tui 8, desktop 1, storybook 1 move off direct legacy imports | test files only | M (2) | the package's src lot |
| A9 | runtime cut: tui and app-shell legacy `OrchestraClient` → `@orchestra/client` per ported route group | per group, follows Track B lots B2–B6 | L (6–8) | Track B route ports |
| A10 | plugin `src/tui.ts` TUI plugin API v2 (client = `@orchestra/client`) | plugin/src/tui.ts, tui plugin host | M (2) | A9, D-A4 |
| A11 | final removal: delete V1 plugin API (`src/index.ts` hooks) with removed-v1, delete facades, deps, `app-shell/vendor/opencode-ai-client-1.17.13-v2.tgz`, `packages/sdk/js`, ledger rows, set `sdk/js` status removed in module-architecture.json | | S (1) | B9 |

Order: **A1 ∥ A2 ∥ A3 ∥ A4 ∥ A7** (all independent, mechanical) → A5 → A6 → A8 → (Track B routes) → A9 → A10 → A11.
After the first wave only app-shell, tui and the plugin V1/TUI API still touch the legacy packages.

**Effort Track A: ~24–28 cards** (A1 1, A2 1, A3 2, A4 2, A5 3, A6 3, A7 2, A8 2, A9 6–8, A10 2, A11 1).
First wave (A1–A4, A7) = 8 cards, no route dependency.

### A.5 What stays

- `packages/sdk/js` stays (frozen) until removed-v1 is deleted: it is generated from removed-v1's OpenAPI, the
  legacy `orchestra generate` command prints `import { createOrchestraClient } from "@orchestra/sdk"` snippets, and
  every V1 plugin receives a live `createOrchestraClient` instance (`removed-v1/src/plugin/index.ts:152`).
- removed-v1's own 30 src + 21 test files that import `@orchestra/sdk` directly stay as they are; they die with
  removed-v1 (Track B), not through facades.
- `@orchestra/client` (private, generated) is the successor for in-repo consumers; `packages/sdk-next` stays as the
  embedded composition. No public SDK package exists after A11 unless D-A5 says otherwise.

### A.6 Owner decisions (Track A)

| ID | Decision | Recommended default |
|---|---|---|
| D-A1 | Wire-type policy for UI and plugin types | `typeof X.Encoded` (plain strings, readonly) at UI/plugin boundaries; decoded branded types only in core/server |
| D-A2 | Plugin v2 types: accept the readonly change as a non-breaking minor for plugin authors? | Yes; announce in the plugin changelog; no compat aliases |
| D-A3 | Vendored-only endpoints app-shell types against (MCP, project, session command/shell/rename/fork, vcs) | Add the ones the desktop really calls to protocol in Track B; keep them typed app-locally until then; drop the rest (form, shell, generate, plugin, debug, experimental) |
| D-A4 | TUI plugin API: replace `client: OrchestraClient` with `@orchestra/client` (breaking) or drop `client` | Replace, one breaking release, together with A10 |
| D-A5 | Publish a public SDK for external users after the legacy SDK goes? | Not now; `@orchestra/client` stays private until a user asks; external users use `orchestra api` + `/openapi.json` |

### A.7 Risks (Track A)

- **Readonly fallout**: SessionV1/schema types are readonly; app-shell uses Solid stores (`produce`, `reconcile`) on parts
  and messages. Type errors are likely in many files of A6; each is local but the count is unknown until typecheck.
- **Silent wire drift**: SessionV1 schema and the legacy generated SDK are two descriptions of one wire shape; a field
  present only in the SDK (e.g. `Session.path?`, `workspaceID?`) would surface only at typecheck. Mitigation: A4/A7 are
  type-only and typecheck-gated, no runtime change.
- **The ServerApi rewrite (A5)** touches the protocol-switch proxy (`lazyApi`) that guards Stop/cancel; regressions are
  runtime, not type errors. Gate with the existing `server-compat`/`server-session` tests via `test:ci`.
- **Coupling with Track B**: A9–A11 cannot finish while removed-v1 serves V1 routes.

---
## Track B — one server, one CLI

### B.0 Findings that shape the whole track

1. **Released users already have only the V2 CLI.** `.github/workflows/release-cli.yml` builds and publishes only
   `apps/cli` (npm `@hugr/cli`, Homebrew tap, AUR `orchestra-bin`, install.sh). `removed-v1` is `"private": true`
   and has no publish path; its `orchestra` bin is reached only through the root `dev` script
   (`bun run --cwd removed-v1 src/index.ts`) and as the desktop's in-process sidecar bundle
   (`apps/desktop/electron.vite.config.ts:74` → `virtual:orchestra-server` = `removed-v1/dist/node`).
   "Two bins" is a developer and desktop problem, not a distribution conflict.
2. **The V2 path is already live for WSL.** `apps/desktop/src/main/wsl/sidecar.ts` runs the apps/cli binary
   (`orchestra service password`, `orchestra serve --hostname 0.0.0.0 --port N`) inside the distro, so app-shell
   already talks to a pure V2 server there, in "v2" protocol mode. The gaps listed below are real for those users
   today.
3. **The legacy server is more than legacy routes: it hosts the product.** removed-v1 composes the canonical `/api`
   handlers with host overrides that the standalone V2 server lacks
   (`removed-v1/src/server/routes/instance/httpapi/server.ts:187-193`: `HostCatalog` + `ClaudeCodeSDK`,
   `HostAgentExecution`, `PluginPtyEnvironment`, plus `ArsenalBindings` at :282/:288). Maestro (11.4k lines),
   claude-code host (6.1k), continuity (3.9k), janitor, app-dock and linux-workspace live in removed-v1.
   `script/boundary-ledger.json` has 98 R11 rows for these (maestro 62, continuity 10, claude-code 5, …), all marked
   "resolved by the 70-C' cut". **A pure `apps/cli serve` has no Maestro-on-Claude-Code, no Arsenal, no Dock/Linux
   workspace.** The 70-C' cut is the real prerequisite of a sidecar flip.
4. **The V1 sidecar also carries RPC to Electron main** over `parentPort` (`LinuxWorkspaceRPC.handle`,
   `handleDockRPC`, `apps/desktop/src/main/index.ts:456-458`). The V2 daemon is detached and has no such channel.
5. **Persistence is already shared.** One DB module (`packages/core/src/database/database.ts:42-53`):
   `ORCHESTRA_DB` or `Global.Path.data/orchestra.db`, one migration set (45 in `packages/core/src/database/migration`),
   used by removed-v1, packages/server, sdk-next and apps/cli. The flip does not move the DB file.

### B.1 Legacy-only HTTP route groups (removed-v1: 138 endpoints in 20 groups; canonical /api: 146 in 33)

| Legacy prefix | Endpoints | In /api? | Missing in V2 | Effort | Main caller |
|---|---|---|---|---|---|
| `/session/*` | 26 | partial (21) | children, todo, diff, fork, shell, command, init, update, deleteMessage, deletePart, updatePart | L | app-shell, tui |
| `/session/:id/processes` | 2 | no | all | S | app-shell |
| `/path`, `/vcs/*`, `/lsp`, `/formatter`, `/instance/dispose` (+ command/agent/skill, which exist) | 15 | partial | 6 vcs, path, lsp, formatter, dispose | M | app-shell (`instance.dispose` 8, `vcs.get` 5), tui |
| `/mcp/*` | 12 | no | all | M–L | app-shell, tui, `mcp` command |
| `/project/*` (incl. lean, history, git/init, directories) | 8 | no | all | M | app-shell |
| `/experimental/project/:id/copy/generate-name` | 1 | partial | generate-name | S | tui |
| `/experimental/workspace/*` | 7 | no | all | M | tui |
| `/experimental/control-plane/move-session` | 1 | no | all (core `MoveSession` exists) | S | tui |
| `/experimental/*` (capabilities, console, tool, worktree, session, resource) | 13 | no | all | L | app-shell (`worktree.*` 6), tui |
| `/sync/*` | 4 | no | all | M | — |
| `/tui/*` | 13 | no | all | M | TUI only; drop if the TUI moves to /api |
| `/pty/*` | 8 | yes (7) | `/pty/shells` | S | app-shell |
| `/find*`, `/file*` | 6 | partial (fs read/list/find) | find text, find symbol, file status | M | app-shell, tui |
| `/config*` | 3 | no | all (no config schema in protocol) | S–M | app-shell, tui (apps/cli/src/tui.ts:22-31 already fakes `/config`, `/config/providers`, `/provider`, `/agent` on 404) |
| `/provider*` (auth, oauth) | 4 | partial | auth/oauth → `/api/integration` | M | app-shell, tui |
| `/global/*` (health, event, config, dispose, upgrade) | 6 | partial (health) | global event, config, dispose, upgrade | M | app-shell, tui |
| `/auth/:id`, `/log` | 3 | partial (`/api/credential`) | `/log` | S | — |
| `/permission*`, `/question*`, `/event` | 6 | yes | (event schema differs) | — | |

Plus app-shell's vendored client types 43 `/api/*` paths that no server serves (A.0.1); in "v2" mode those 404 today.

### B.2 Legacy-only CLI commands (23 registered in `removed-v1/src/index.ts`; apps/cli has 5 top-level commands + default)

| Legacy | V2 status | Effort | Recommendation |
|---|---|---|---|
| `$0 [project]` TUI | partial: no project arg, --model/--continue/--session/--fork/--prompt/--agent/--auto/--yolo/--mini/--replay/--demo | M | port flags |
| `attach <url>` | missing | S | port |
| `run [message..]` | missing (973 + 18,486 lines in run/) | L | port (headless use) |
| `serve` | partial: no mdns, mdns-domain, cors | S | port flags |
| `web` | missing | M | decide (D-B4) |
| `acp` | missing (73 + 3,549 lines) | L | decide (D-B4) |
| `mcp` (list, auth, logout, add, debug) | missing (841) | L → M once `/api/mcp` exists | port after B.1 MCP |
| `generate` (OpenAPI) | missing (`api` reads `/openapi.json`) | S | port as `openapi` |
| `debug` (15 subcommands) | partial (`debug agents`, `debug symbols`); 0/15 exact | M | port 4–5 that support uses |
| `console` (hidden) | missing | M | drop unless console accounts stay |
| `providers`/`auth` | missing (533) | M | port on `/api/integration` + `/api/credential` |
| `agent` (create, list) | partial (list only) | M | port create |
| `upgrade` | missing | M | port for npm/brew/AUR/install.sh channels |
| `uninstall` | missing | M | port for the V2 layout |
| `models` | missing | S | port |
| `stats` | missing (393, direct DB) | M | port |
| `export` | missing | M | port |
| `import` | missing (writes tables directly) | M | port |
| `pr <number>` | missing | S | port |
| `session` (list, delete) | missing | S | port |
| `plugin`/`plug` | missing (230 + 439) | M | port |
| `db` (query, path, compact) | missing | S | port |
| `toolkit` (status, prefetch) | missing | S | port |

Totals: 0 exact, 4 partial, 19 missing; 8 S, 12 M, 3 L.

### B.3 Desktop: what switching the default sidecar to V2 needs

- **Selector:** `ORCHESTRA_SIDECAR_V2 === "1"` (`apps/desktop/src/main/index.ts:86`) is the only legacy/V2 switch in
  the repo; the default is v1 and `candidate-profile.ts:141` forces `"0"`. V2 runs the packaged apps/cli binary from
  `resources/cli` via `src/main/background-cli.ts` (`--version`, `service status`, `service start`,
  `service password`) as a **detached daemon shared with the CLI**, not a child process.
- **IPC the renderer uses for the connection** (of 105 `ipcMain` channels, 102 `invoke` channels exposed on
  `window.api`): `await-initialization` (resolves `ServerReadyData {url, username, password}`,
  `preload/types.ts:21`), `kill-sidecar`, `get-default-server-url`, `set-default-server-url`, the 13 `wsl-servers-*`
  channels + `wsl-servers-event`, `relaunch`. The renderer side needs no change: it builds a `type:"sidecar"`
  connection from `ServerReadyData`.
  `install-cli` is invoked in preload (line 65) but has no `ipcMain` handler (pre-existing dangling channel).
- **Auth handshake.** v1: main makes `randomUUID()`, sends `{type:"start", hostname, port, password, userDataPath}`
  over `parentPort`; the sidecar sets `ORCHESTRA_SERVER_USERNAME=orchestra` / `ORCHESTRA_SERVER_PASSWORD` and replies
  `ready`; main polls `/api/health` then `/global/health` with Basic auth (20 s). v2: the password lives in
  `Global.Path.state/password` (0600) and the registration in `server.json` (`apps/cli/src/services/daemon.ts:39-41`);
  main reads it through `service password`. Both servers accept Basic or `?auth_token=`.
- **Gaps to close before the flip:**
  1. CORS: the V2 route stack (`packages/server/src/routes.ts:61-71`) installs no HTTP CORS middleware;
     `isAllowedCorsOrigin` allows `oc://renderer` but is only used by the PTY origin check. Add the layer (S; verify
     why the WSL path works).
  2. Per-launch env: v1 injects `ORCHESTRA_CLIENT=desktop`, `ORCHESTRA_CLAUDE_CODE_EXECUTABLE`,
     `ORCHESTRA_CLAUDE_CODE_RESOURCES`, `ORCHESTRA_LINUX_ROOT`, `ORCHESTRA_PLAYBOOKS_DIR`,
     `ORCHESTRA_DISABLE_EMBEDDED_WEB_UI`, two experimental flags and `XDG_STATE_HOME=userData`. A shared detached
     daemon cannot take per-launch env (M).
  3. Dock / Linux workspace RPC to Electron main (no V2 channel) (L).
  4. Protocol detection: app-shell picks "v1" when `/global/health` answers; against V2 it uses the vendored client
     for everything not rerouted, and the ~90 legacy-client calls 404 (B.1 groups) (covered by the route lots).
  5. `kill-sidecar` semantics: killing a daemon shared with a terminal CLI session (S, decision D-B3).
  6. Product host composition (B.0.3): the 70-C' cut (L).

### B.4 What breaks for users, and what needs migration

| Area | Effect of the flip / removal | Migration |
|---|---|---|
| DB `orchestra.db` | none: same file, same 45 migrations | none |
| Legacy JSON storage `Global.Path.data/storage` (`removed-v1/src/storage/storage.ts:224`, own migration marker; `session/revert.ts` writes `session_diff` there) | V2 never runs these storage migrations or reads `session_diff` | move the storage migrations into `apps/cli migrate` (today a placeholder that prints "No migrations to run.") and run it on daemon start |
| State dir | desktop v1 sets `XDG_STATE_HOME` to Electron userData; the daemon uses the default XDG state home (`server.json`, `password`, and any state files) | copy or point: pass the userData state home to `service start`, or one-time copy |
| V1 session history | V2 reads `session_message`; migration `20260622170816_reset_v2_session_state` emptied it, and V1-era history lives in `message`/`part` (the projector dual-writes new data) | verify old sessions render under V2; backfill card if not |
| V1 plugins (`@orchestra/plugin` root `Hooks`, `PluginInput.client`) | stop loading (V2 core loads only `@orchestra/plugin/v2/*`) | announce; plugin authors move to the v2 API |
| TUI plugins (`TuiPluginApi.client`) | break when the TUI drops the legacy client | A10 |
| Dev workflow | root `dev` script and `orchestra` in a checkout point at removed-v1 | repoint to apps/cli at removal |
| Desktop features | Maestro on Claude Code, Arsenal, Dock, Linux workspace, janitor, continuity are absent on a pure V2 server | 70-C' cut first |
| Settings pages | `/config`, `/global/config` absent on V2 | route lot B4 |

### B.5 Smallest safe sequence

A flag flip today is not safe: the V2 server lacks the product host (B.0.3), 11 route groups the renderer calls,
CORS and the Dock RPC. Porting CLI commands first does not unblock the desktop and does not affect released users
(B.0.1). Recommended order: **route parity for the renderer → flag flip with fallback → CLI ports → delete.**

| Step | Content | Cards |
|---|---|---|
| B1 | 70-C' cut: move maestro / claude-code host / continuity / janitor / app-dock / linux-workspace layers out of removed-v1 so `apps/cli serve` composes the same host overrides (`HostCatalog`, `HostAgentExecution`, `PluginPtyEnvironment`, `ArsenalBindings`). Clears the 98 R11 rows. Already planned in the monolith campaign. | 10 |
| B2 | Renderer-critical routes into protocol + server, then regenerate `@orchestra/client`: session gaps (L 4), session processes (1), vcs/path/lsp/formatter/dispose (2), project incl. lean (2), file find/status (2), pty shells (1) | 12 |
| B3 | MCP group (3), provider auth onto `/api/integration` (2), config + global config/event/dispose (4), experimental worktree subset (2) | 11 |
| B4 | Desktop V2 readiness: CORS layer (1), per-launch env/state through `service start` options (2), Dock/Linux RPC over a local channel (3), `kill-sidecar` semantics (1), V2 `/api/health` reports ready for protocol detection (1) | 8 |
| B5 | Migration: storage migrations into `apps/cli migrate` (1), state-dir handover (1), V1 history check/backfill (1) | 3 |
| B6 | **Flip:** default `ORCHESTRA_SIDECAR_V2=1` in index.ts and candidate-profile; keep the v1 bundle and a setting to fall back for one release; dogfood gate (owner validation in the real app) | 1 |
| B7 | CLI ports into apps/cli (kept set from B.2: TUI flags 2, attach 1, run 4, serve flags 1, mcp 2, generate 1, debug 2, providers 2, agent create 2, upgrade 2, uninstall 2, models 1, stats 2, export 2, import 2, pr 1, session 1, plugin 2, db 1, toolkit 1) and the TUI's remaining routes (workspace 2, tui group or drop 2, sync 2, rest of experimental 2, generate-name 1, move-session 1) | 34 + 10 |
| B8 | Remove the fallback after one release with no fallback use | 1 |
| B9 | Delete removed-v1, repoint root `dev`, desktop `predev`/`prebuild` and `env.d.ts` (closes the R1/R3 rows), then Track A's A11 | 2 |

**Effort Track B: ~92 cards** (B1 10, B2 12, B3 11, B4 8, B5 3, B6 1, B7 44, B8 1, B9 2). The desktop flip
(B1–B6) is ~45 cards. B7 shrinks by 8–10 if D-B4 drops `acp`, `web`, `console`.

### B.6 Owner decisions (Track B)

| ID | Decision | Recommended default |
|---|---|---|
| D-B1 | Order: route parity first or CLI first | Routes first (desktop is the default product; released CLI is already V2) |
| D-B2 | Flip style | Default-on flag with a user-visible fallback setting for one release, then delete |
| D-B3 | Desktop server model on V2: shared detached daemon (CLI and desktop share one server) or a desktop-owned `serve` child | Desktop-owned child (`orchestra serve` with per-launch password, env, CORS, RPC); the shared daemon stays for the terminal. Removes gaps B.3-2 and B.3-5 |
| D-B4 | Legacy commands to drop | Drop `console` (hidden) and `/tui/*` routes; keep `acp` only if an editor integration is planned; `web` only if the web UI ships separately |
| D-B5 | V1 plugin API (`Hooks`, `PluginInput.client`) | Retire with removed-v1; no shim |
| D-B6 | TUI under V2 keeps faking `/config`, `/provider`, `/agent` until B3 | Yes, remove the fake in the B3 card that adds the routes |

### B.7 Risks (Track B)

- **Feature loss on flip** if B1 is incomplete: Maestro on Claude Code, Arsenal and Dock silently missing. The flip
  card needs an explicit checklist plus the owner's exploration-style validation in the real app.
- **Two servers writing one DB during the fallback release** (a v1 sidecar and a v2 daemon on the same
  `orchestra.db`): the V2 session core assumes process-local drains (AGENTS.md "Keep local Session drains
  process-local"). Make the fallback exclusive (never both at once).
- **WSL users already run V2** and hit the B.1 gaps today; parity work fixes them first. Use them as the canary.
- **Session route gaps are the largest single item** (11 endpoints, fork/shell/command/revert edits) and touch the V2
  session core invariants (durable admission, one `llm.stream` per turn); they need design review, not
  transliteration.
- **History visibility** for V1-era sessions under V2 is unverified (B.4).
- **Unknown CORS behaviour**: the V2 stack has no CORS middleware, yet WSL works; find out why before relying on it.

---

## Combined view

| Track | Cards | Mechanical share | Gate |
|---|---|---|---|
| A (client) | 24–28 | first wave of 8 cards fully mechanical (A1–A4, A7); A5/A6 mechanical after D-A1; A9–A11 follow B | per-lot `bun typecheck` via typecheck.yml dispatch + change-scoped `test:ci` |
| B (server/CLI) | ~92 (~45 to the desktop flip) | B2/B3 route lots and B7 command ports are mechanical once each group's protocol shape is reviewed; B1 and session routes are design work | same, plus the epic CI before B6 and B9 |

Sequence across tracks: A first wave ∥ B1 → A5/A6 ∥ B2–B5 → B6 flip → A9/A10 ∥ B7 → B8 → B9 + A11.

### Measurement notes

- Symbol counts: `scratchpad/scripts/syms.py` over the snapshot (named imports, `import()` inline types, `.js`
  specifiers); raw per-package output in `scratchpad/syms.json`.
- Plugin exported-type impact: `scratchpad/scripts/plugin-exports.py` (exported declarations whose body references a
  compat-imported name).
- Vendored vs canonical endpoints: path strings diffed from `opencode-ai-client-1.17.13-v2.tgz` `dist/promise/generated/client.js`
  and `packages/client/src/generated/client.ts` (91 vs 78 non-actions paths; 43 vendored-only).
- Route, CLI, desktop and DB inventories: read from the snapshot; line counts by `wc -l`. Effort sizes are estimates
  from line counts and dependencies, not trial ports.

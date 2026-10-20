# PLAN 70-C' (convergence card B1): product layers out of apps/orchestra

Base: `fork/dev` @ `4ce72fa6c7` (Merge #802). This is a read-only measurement of a `git archive` snapshot. Nothing was
built, typechecked or tested.

Scripts (scratchpad, so they can be re-run on the landed SHA in L0):
- `scripts/edges.py` parses every import of `apps/orchestra/src` and classifies both ends with the registry domains.
- `m/movable2.txt` is the fixed point "file depends only on product files that can also move".
- `m/r11-map.md` maps each R11 row to the card that closes it.

**Positive control.** The parser reproduces the 98 R11 rows of `script/boundary-ledger.json` exactly: 0 rows only in
the ledger, 0 only in the parser, 0 unresolved specifiers.

"Unverified" marks every claim that was not proven by reading code.

---

## 0. The finding that reshapes B1

**B1 as written cannot be delivered by moving files.** The convergence plan asks for one thing: move maestro,
claude-code, continuity, janitor, app-dock and linux-workspace out of apps/orchestra so that `apps/cli serve` composes
the same host overrides. That rests on an assumption the measurement refutes:

1. **The product runs inside the V1 engine.**
   - The desktop's v1 mode sends every prompt to legacy `POST /session/:id/prompt_async`
     (`packages/app-shell/src/utils/server-compat.ts:210`), and from there to V1 `SessionPrompt`
     (`apps/orchestra/src/session/prompt.ts`).
   - Maestro tools, the Claude Code engine (`ClaudeCode.Service`, used in prompt.ts:139) and continuity are wired into
     that loop.
   - `apps/cli serve` (`packages/server/src/routes.ts`) runs only SessionV2 and SessionRunner.
   - The V2 task tool refuses Claude Code targets (`packages/core/src/tool/task.ts:323`: "Task target requires an
     unsupported engine").
   - No V2 code path executes `engine: "claude-code"`.
2. **76% of product code imports the V1 engine directly.**
   - 142 non-test product files, 26,101 LOC. Only 56 files / 6,205 LOC can move without V1 imports. That count already
     moves `tool/truncation-dir.ts` into core and retargets three type-only or re-export imports.
   - Runtime imports of maestro, continuity or claude-code transitively reach 261 platform-legacy files (53.6k LOC).
     That is practically the whole V1 engine.
   - The top blockers (counted per file) are V1 `Session` 39, V1 `Agent` 35, `EventV2Bridge` 22, V1 `Tool` 21,
     `Git` 18, V1 `Config` 16 and `MessageV2` 10.
3. **The four host overrides are V2-shaped seams already:**
   - `CatalogAvailability` and `AgentExecution.Annotate`, which are Context.References in packages/server;
   - `PtyEnvironment.Service`;
   - the core `LocationServiceMap` replacements that `ArsenalBindings.nativeRegistryReplacements` feeds.
   They can be composed by `apps/cli serve` once that server accepts host contributions. Composing them does not give
   the V2 server Maestro on Claude Code.

**Consequence.** B1 splits into a mechanical part (this plan's cards) and a design track (B1-C) that is the real
prerequisite of the desktop flip (B6).

| Part | What it does | R11 rows | Who |
|---|---|---|---|
| **B1 (cards below)** | Moves the 56 engine-neutral files into 5 product packages. Freezes the host ports. Gives `apps/cli serve` a host-contribution seam and composes the V2-ready Arsenal native safety in it. Readies app-dock and janitor for V2. | **35 of 98 close** (C2 2, C3 2, C4 18, C5 7, C7 4, C8 2) | fleet: Haiku, Sonnet, Opus lead |
| **B1-C (design track)** | Ports Maestro governance, the Claude Code engine and continuity onto the V2 Session core: engine adapter, task governance seam, roster as V2 agents, continuity on V2 compaction. The V1 glue left in apps/orchestra dies at B9. | the remaining **63** close at B1-C (V2 successor) plus B9 (deletion) | Opus design first, then cards |
| ~~Invert in place~~ (rejected default) | Invert the 63 remaining V1 edges inside apps/orchestra with registration ports. This is throwaway work on code that B9 deletes, and it moves nothing: the inverted files still import V1 Session, Agent and Tool. | 63 | about 6 Sonnet cards if the owner wants R11 at 0 before B9 |

**Owner decisions this creates** (defaults in bold):

| ID | Decision | Default |
|---|---|---|
| D-C1 | Accept the split: B1 closes 35 rows, and the other 63 close by B1-C plus B9 | **yes**. The lead updates their ledger `reason` to "V1 glue; retires with apps/orchestra (B9); V2 successor in modules/<x> (B1-C)" |
| D-C2 | Claude Code engine on V2 versus the AGENTS rule "do not … delegate orchestration to an in-memory tool loop" | **Engine as an `@orchestra/llm` execution host.** One Claude Code turn is one `llm.stream(request)`. Its tool calls surface as `providerExecuted` events, which the runner already persists without local execution (`session/runner/llm.ts:271`). AGENTS.md gains one sentence naming this exception. The alternative is no Claude Code engine on V2, which drops the feature at the flip. |
| D-C3 | B6 flip gate | **B6 waits for B1-C** (Maestro on Claude Code on V2), not only for B1 |
| D-C4 | Optional strengthening R11b: a legacy package's platform-legacy domains may not import product-layer packages | **no**. The 35 moved rows become declared `app → product` package edges, listed in each module README, so nobody reads them as decoupling |

---

## 1. Measured dependency graph

Counts are non-test `src` import statements. Symbols are named imports; `[type]` marks a type-only import.

### 1.1 Product → apps/orchestra platform (forward edges)

| Product | Files / LOC | Imports into platform-legacy, by target domain (statements) |
|---|---|---|
| maestro (`src/maestro/**`, `tool/maestro-*`, `tool/atlas-*`) | 78 / 13,594 | session-engine 63, agent 32, tool 22, event 21, project 20, config 18, composition 15, research 5, runtime 3, provider 2 |
| claude-code (`src/claude-code/**`) | 26 / 6,107 | session-engine 36, tool 20, agent 10, config 9, project 5, composition 3, provider 2, research 2, event 1, runtime 1 |
| continuity (`src/continuity/**` plus 4 files) | 28 / 4,563 | session-engine 29, provider 10, runtime 4, tool 3, agent 2, research 2, config 1, composition 1 |
| janitor (`src/janitor/**`) | 5 / 570 | event 1 (`GlobalBus`) |
| app-dock (`plugin/app-dock*`, `plugin/linux-workspace*`) | 5 / 1,267 | none (only `@orchestra/plugin`) |
| acp (not in B1 scope) | 12 / 3,549 | project 4, provider 3, config 2, composition 2, agent 1, runtime 1 |

Product → product: claude-code → maestro 26 and → continuity 7; maestro → continuity 1. All three are allowed
`productEdges`.

**By symbol (target file: symbols).**
- **maestro:**
  - `agent/agent.ts`: `Agent` (+type); `agent/prompt/{archie,backend,billy,frankie,jimmy,lucy,patty,rosie}.txt`: PROMPT;
    `agent/subagent-permissions.ts`: `deriveSubagentSessionPermission`
  - `effect/bridge.ts`: `EffectBridge`; `effect/instance-ref.ts`: `InstanceRef`; `effect/instance-state.ts`:
    `InstanceState`
  - `config/config.ts`: `Config`; `config/markdown.ts`: `ConfigMarkdown`; `permission/index.ts`: `Permission`;
    `skill/index.ts`: `Skill`
  - `event-v2-bridge.ts`: `EventV2Bridge`; `git/index.ts`: `Git`
  - `project/instance-context.ts`: `InstanceContext` [type]; `project/instance-store.ts`: `InstanceStore`
  - `plugin/hugr-composer/outcome.ts`: `OUTCOME_KEY, isOwned, readOutcome, Outcome`
  - `research/{citation-check,qualifications,source-capture}.ts`
  - `id/id.ts`: `Identifier`; `util/filesystem.ts`: `Filesystem`
  - `background/job.ts`: `BackgroundJob`; `session/message-v2.ts`: `MessageV2`; `session/prompt.ts`: `SessionPrompt`
    [type]; `session/schema.ts`: `MessageID, PartID, SessionID`; `session/session.ts`: `Session`;
    `session/status.ts`: `SessionStatus`; `storage/storage.ts`: `NotFoundError`
  - `tool/json-schema.ts`: `ToolJsonSchema`; `tool/shell/id.ts`: `ShellID`; `tool/task.ts`: `TaskPromptOps` [type];
    `tool/tool.ts`: `Tool`; `tool/truncate.ts`: `Truncate`; `tool/truncation-dir.ts`: `TRUNCATION_DIR`
- **continuity:**
  - `agent/agent.ts` [type]; `effect/instance-state.ts`; `config/config.ts`
  - `provider/provider.ts`: `Provider`; `provider/transform.ts`: `ProviderTransform`
  - `research/allowance.ts`: `ResearchExecution`; `util/token.ts`: `Token` (a re-export of core)
  - `background/job.ts`; `session/llm.ts`: `LLM`; `session/llm/prepared.ts`: `LLMPrepared`; `session/message-v2.ts`;
    `session/processor.ts` [type]; `session/schema.ts`; `session/session.ts`
  - `tool/json-schema.ts`; `tool/tool.ts`
- **claude-code:**
  - `agent/agent.ts`; `effect/instance-state.ts`
  - `config/config.ts`; `permission/index.ts`; `question/index.ts`: `Question`; `skill/index.ts`
  - `event-v2-bridge.ts`; `git/index.ts`; `project/instance-store.ts`; `snapshot/index.ts`: `Snapshot`
  - `provider/provider.ts`; `research/allowance.ts`; `id/id.ts`; `background/process.ts`: `BackgroundProcess`
  - `session/{lifecycle,schema,session,status,summary,todo}.ts`
  - `tool/{external-directory,json-schema,registry,shell/execution,shell/scan,task(type),tool,truncate}.ts`
- **janitor:** `bus/global.ts`: `GlobalBus`.
- **app-dock:** none.

**V2 core equivalents exist** for every heavy blocker. These are the "ports" of B1-C, not new interfaces:

| V1 symbol | V2 core successor |
|---|---|
| `Session` V1 | `SessionStore` / `SessionV2` |
| `MessageV2` | `SessionMessage` |
| `Agent` | `AgentV2` |
| `Config` | `Config` (`@orchestra/v2/Config`) |
| `Tool`, `ToolRegistry` | `tool/tool.ts` / `tool/registry.ts` |
| `Permission` | `PermissionV2` |
| `Question` | `QuestionV2` |
| `Skill` | `SkillV2` |
| `Git` | `Git` (core `git.ts`) |
| `Snapshot` | `Snapshot` |
| `Todo` | `SessionTodo` |
| `BackgroundJob` | `BackgroundJob` (core) |
| `EventV2Bridge` | `EventV2` with an explicit `location` |
| `InstanceState` / `InstanceRef` | `Location` |
| `LLM` V1 | `LLMClient` |

### 1.2 apps/orchestra platform → product (reverse edges = the 98 R11 rows)

| Product target (file) | Importers (symbols) |
|---|---|
| app-dock: `plugin/app-dock.ts`, `plugin/linux-workspace.ts` | `plugin/index.ts` {`AppDockPlugin`}, {`LinuxWorkspacePlugin`} |
| claude-code: `engine.ts` | `session/prompt.ts` {`ClaudeCode`} |
| claude-code: `host/provider.ts` | `handlers/catalog.ts`, `handlers/provider.ts` (dynamic import) |
| claude-code: `sdk.ts` | `handlers/catalog.ts`, `httpapi/server.ts` {`ClaudeCodeSDK`} |
| continuity: `alias.ts` | `session/prompt.ts` {`commandSource`} |
| continuity: `archive.ts` | `tool/registry.ts` {`Archive`} |
| continuity: `masking.ts` | `session/llm/context-budget.ts` {`estimate`} |
| continuity: `service.ts` | `handlers/session.ts`, `httpapi/server.ts`, `session/prompt-host.ts` [type], `session/prompt.ts`, `tool/registry.ts` {`SessionContinuity`} |
| continuity: `trigger.ts` | `context-budget.ts` {`HARD_LIMIT`}, `prompt.ts` {`hardLimit, tokenCount`} |
| continuity: `session/prompt-continuity.ts`, `tool/context-compact.ts`, `tool/context-recall.ts` | `prompt.ts`; `tool/registry.ts` ×2 |
| janitor: `bootstrap.ts` | `server/server.ts` {`startJanitorLoop`} |
| janitor: `report-state.ts` | `handlers/global.ts` {`clearLatestReport, getLatestReport`} |
| maestro: `roster.ts` | `agent/agent.ts` {`roster, nativeProfiles, envRead, publishRules, canonicalMemberId, LEGACY_BACKEND_ID, renderPrompt, RosterMember`}, `research/{allowance,binding}.ts`, `session/tools.ts`, `tool/{registry,research-registry,research-repo,shell/execution,task}.ts` |
| maestro: `seats/index.ts` | `agent/agent.ts`, `session/upstream-task-settlement.ts` (dynamic), `skill/index.ts`, `tool/{shell,shell/execution,shell/scan,task}.ts` |
| maestro: `seat-skill-root.ts` | `agent/agent.ts`, `skill/index.ts` |
| maestro: `session-authority.ts`, `upstream-result.ts` | `session/upstream-task-settlement.ts`, `tool/task-work-observation.ts`, `tool/task.ts`, `tool/task-background.ts` |
| maestro: `arsenal-bindings.ts` | `httpapi/server.ts`, `session/{native-tools,prompt,task-prompt-ops}.ts`, `tool/registry.ts` |
| maestro: the other 21 V1-bound files (`arsenal-completion`, `arsenal-observations`, `atlas-*`, `authorization`, `backend-*`, `discovery-result`, `dispatch`, `governed-task-reservation`, `grounded-skills`, `invocation-binding`, `logical-task`, `upstream-settlement`, `upstream-v2`, `workflow-binding`, `write-roots`) | `tool/task.ts` (14 rows), `tool/task-background.ts` (6), `tool/task-work-observation.ts` (4), `session/upstream-task-settlement.ts` (5), `session/prompt.ts`, `session/compaction.ts`, `session/llm/request.ts`, `tool/registry.ts`, `tool/research-registry.ts`, `tool/skill.ts`, `project/bootstrap.ts` |
| maestro tools: `tool/maestro-{admission,approval,arsenal,authorization,context,plan,result-decision,review,validation,workflows}.ts`, `tool/atlas-{context,memory}.ts` | `tool/registry.ts` (12), `tool/research-registry.ts` (1) |

Composition → product: 7 statements; R11 does not flag them.
- `cli/cmd/acp.ts` → acp (2)
- `effect/app-node-builder-v1.ts` → maestro (1)
- `effect/app-runtime.ts` → continuity (1) and maestro (2)
- `effect/runtime-flags.ts` → maestro (1)

The row-by-row closure map is Appendix A.

### 1.3 What moves in B1 (the 56-file fixed point, with the four retargets of §2.4)

| Target package | Files |
|---|---|
| `modules/app-dock` | `plugin/{app-dock,app-dock-hints,app-dock-linux,app-dock-outline,linux-workspace}.ts` (5) |
| `modules/janitor` | `janitor/{report-state,scan,scheduler,thresholds,bootstrap}.ts` (5; `bootstrap` after the Sink port) |
| `modules/engine-adapters/claude-code` | `claude-code/{sdk,executable,transcript}.ts`, `claude-code/host/{admission,join,options,provider}.ts` (7) |
| `modules/continuity` | `continuity/{alias,archive-search,dry-transport,raw-payload,request-source,masking}.ts` (6) |
| `modules/maestro/coordination`: C4, seats | `maestro/{roster,route-grant,context-tool-plan,seat-skill-root,seat-skill-content,playbook-content}.ts`, `maestro/seats/{seat,index,archie,backend,billy,frankie,jimmy,lucy,patty,rosie}.ts` (16) plus the 8 seat prompt `.txt` files |
| `modules/maestro/coordination`: C5, core | `maestro/{ability-descriptors,ability-registry,admit-request,approval,arsenal-observations,arsenal-outcome,governed-task,lifecycle-fold,project-config,session-authority,task-hash,upstream-proposal,upstream-result,verification-plan,work-contract}.ts` (15) |
| `modules/maestro/coordination`: C6 | new `arsenal-native.ts`: the V2 half of `maestro/arsenal-approval.ts` (lines 60–143) |

Three of the files the fixed point marks as movable stay, because they need a V1 brand type:
`continuity/{memory-types,checklist-seal,review-seal}.ts`.

---

## 2. Port contracts (freeze before any card)

### 2.0 Registry and layer (L1)

- **New layer** `"product": ["foundation", "native", "library", "contract", "extension-api", "module", "platform", "product"]`.
  - Add `"product"` to the `composition` and `app` lists.
  - Today `module` may import only foundation, native and library, so a product module that imports `@orchestra/core`
    would be an R1 violation.
  - product → product is allowed at layer level. `productEdges` stay intra-package (guard line 276). Package-level
    product edges are a later guard extension and are not needed for B1.
- **New packages** (registry alias → path, npm name):
  - `app-dock` → `modules/app-dock` (`@orchestra/app-dock`)
  - `janitor` → `modules/janitor` (`@orchestra/janitor`)
  - `continuity` → `modules/continuity` (`@orchestra/continuity`)
  - `engine-claude-code` → `modules/engine-adapters/claude-code` (`@orchestra/engine-claude-code`)
  - `maestro` → `modules/maestro/coordination` (`@orchestra/maestro`)
- **Why not `modules/maestro` itself:** it already holds the `@orchestra/maestro-arsenal` package in `arsenal/`. An
  outer package would make `bun test` discover arsenal's tests.
- **Seat path depth is preserved:** `seats/seat.ts:79-80` resolves `../../../../../modules/specialists`, which is 5
  levels from `src/seats/` under the new path exactly as under the old one.
- **Legacy reach goes through compat facades** (R3 counts type-only imports too, and only `src/compat/` is exempt):
  - `modules/continuity/src/compat/core-v1-session.ts`
  - `modules/engine-adapters/claude-code/src/compat/core-v1-session.ts`
  - `modules/maestro/coordination/src/compat/core-v1-session.ts`
  - each is `export { SessionV1 } from "@orchestra/core/v1/session"`;
  - the importers are `alias`, `raw-payload`, `request-source`, `masking`, `transcript`, `host/admission` and
    `arsenal-observations` (a value import).
- **Manifests.** Exact dependencies, from the measured imports. The repo uses Bun's isolated linker, so undeclared npm
  dependencies will not resolve.

| Package | dependencies |
|---|---|
| app-dock | `@orchestra/plugin` |
| janitor | `@orchestra/core`, `effect` |
| continuity | `@orchestra/core`, `effect`, `jsonc-parser@3.3.1` |
| engine-claude-code | `@orchestra/core`, `effect`, `@anthropic-ai/claude-agent-sdk@0.3.289` (the same pin as `apps/orchestra/package.json`; `executable.ts` reads `SDK_VERSION` from its own `package.json`) |
| maestro | `@orchestra/core`, `@orchestra/schema`, `@orchestra/llm`, `@orchestra/atlas-boundary`, `@orchestra/maestro-arsenal`, `effect`, `drizzle-orm`, `gray-matter@4.0.3` |

- **Every new package gets:**
  - `devDependencies` `@types/bun`, `@typescript/native-preview`, `@tsconfig/bun` (catalog);
  - scripts `"test": "bun test --timeout 30000"` and `"typecheck": "tsgo --noEmit"`;
  - a `tsconfig.json` copied from `modules/relay/tsconfig.json`;
  - a `bunfig.toml` with `preload = ["<rel>/script/test-guard.ts"]`, without the omni control because no moved test
    spawns through omni (§5.1);
  - a README with the 7-heading scaffold plus the contract block.
- **Consumers declare the new packages (R4):**
  - `apps/orchestra/package.json` gets all five;
  - `apps/cli/package.json` gets `@orchestra/maestro` (K1).
- **Workspaces:** append the 5 paths to root `package.json` `workspaces.packages` (the list is explicit for `modules/`).
- **Lockfile window:** the lead updates `bun.lock` and the Nix FOD hash in `nix/hashes.json`. The exact Nix
  requalification procedure is unverified; follow the procedure used for the last workspace addition.
  `nix/node_modules.nix:79,89` takes `../modules` plus registry paths; the `nix/{orchestra,desktop}.nix` loops cover
  `modules/*/*/node_modules`, so both new depth-2 paths fit.

### 2.1 PORT-1: `Host.Contribution` (core; new `packages/core/src/host.ts`)

It lives in core so that product modules (layer `product`) can produce it and both composition roots (layers `app` and
`composition`) can consume it. It holds data only; it creates no coordinator.

```ts
export * as Host from "./host"

import type { Layer } from "effect"
import type { Database } from "./database/database"
import type { EventV2 } from "./event"
import type { LayerNode } from "./effect/layer-node"
import { LocationServiceMap } from "./location-service-map"
import { ScheduledTask } from "./scheduled-task"
import { SessionV2 } from "./session"
import { SessionExecution } from "./session/execution"

/** Global services every composition root provides to a contribution's reference overrides. */
export type ReferenceServices = Database.Service | EventV2.Service | LocationServiceMap.Service

/**
 * What a product module hands a composition root. A root applies all contributions once, to its single
 * application graph (AGENTS "V2 Session Core": one process-local SessionExecution, one Location map).
 */
export interface Contribution {
  /** Stable module id ("maestro", "app-dock", ...). Duplicates are a composition error. */
  readonly id: string
  /** Node replacements for the root graph; AppNodeBuilder also applies them to every Location map it builds. */
  readonly replacements?: LayerNode.Replacements
  /** Extra global nodes owned by the module. */
  readonly nodes?: ReadonlyArray<LayerNode.Replacements[number][1]>
  /** Context.Reference overrides (core/host/* references), provided to the API layer. */
  readonly references?: Layer.Layer<never, never, ReferenceServices>
}

const reserved = [SessionExecution.node, SessionV2.node, LocationServiceMap.node, ScheduledTask.node, ScheduledTask.daemonNode]

/** Flatten contributions; synchronous because it only validates data. */
export function merge(contributions: ReadonlyArray<Contribution>) {
  const ids = contributions.map((item) => item.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) throw new Error(`Host contribution id is not unique: ${duplicate}`)
  const replacements = contributions.flatMap((item) => item.replacements ?? [])
  const nodes = contributions.flatMap((item) => item.nodes ?? [])
  const claimed = [...replacements.map(([source]) => source), ...nodes]
    .find((node) => reserved.some((owned) => owned.name === node.name))
  if (claimed) throw new Error(`Host contribution may not own ${claimed.name}`)
  return { replacements, nodes, references: contributions.flatMap((item) => item.references ?? []) }
}
```

L2 checks three things:
- the exact `LayerNode` element types (the `nodes` typing above is a placeholder, unverified);
- the `ReferenceServices` union against `packages/server/src/routes.ts` `applicationServices` and the legacy `app`
  group;
- that `merge` remains the only place where reserved nodes are rejected.

Test: `packages/core/test/host.test.ts`, which covers duplicate ids, rejection of a reserved node, and order
preservation.

### 2.2 PORT-2: `createRoutes(options)` (packages/server; edit `packages/server/src/routes.ts`)

```ts
export interface Options {
  readonly password?: string
  readonly host?: ReadonlyArray<Host.Contribution>
}

export function createRoutes(options: Options = {}) {
  return makeRoutes(
    options.password
      ? ServerAuth.Config.configLayer({ username: "orchestra", password: Option.some(options.password) })
      : ServerAuth.Config.layer,
    options.host ?? [],
  )
}

export function createEmbeddedRoutes(options: Pick<Options, "host"> = {}) {
  return makeRoutes(ServerAuth.Config.configLayer({ username: "orchestra", password: Option.none() }), options.host ?? [])
}

function makeRoutes<AuthError, AuthServices>(
  auth: Layer.Layer<ServerAuth.Config, AuthError, AuthServices>,
  host: ReadonlyArray<Host.Contribution>,
) {
  const merged = Host.merge(host)
  const serviceLayer = AppNodeBuilder.build(LayerNode.group([applicationServices, ...merged.nodes]), [
    [SessionExecution.node, SessionExecutionLocal.node],
    ...merged.replacements,
  ])
  return HttpApiBuilder.layer(Api, { openapiPath: "/openapi.json" }).pipe(
    Layer.provide(handlers),
    Layer.provide(merged.references),
    Layer.provide(sessionLocationLayer),
    Layer.provide(locationLayer),
    Layer.provide(authorizationLayer),
    Layer.provide(schemaErrorLayer),
    Layer.provide(auth),
    Layer.provide(serviceLayer),
  )
}
```

- **Callers:**
  - `apps/cli/src/commands/handlers/serve.ts:44`: `createRoutes(password)` becomes `createRoutes({ password, host: CliHost.contributions })`.
  - `packages/sdk-next/src/orchestra.ts:23`: unchanged. sdk-next composes no product (AGENTS).
  - `export const routes = createRoutes()`: unchanged.
- **Location map:** `AppNodeBuilder.build` builds it from the same `replacements` (`app-node-builder.ts:14-17`), so
  Location-scoped replacements such as Arsenal's `ToolSafety` reach every Location. This matches what the legacy root
  does explicitly (`httpapi/server.ts:282`).
- How `Layer.provide` accepts an array of layers (`merged.references`) is unverified; use `Layer.mergeAll(...)` when
  the array is non-empty.

### 2.3 PORT-3: host references move down into core (L2, `git mv`)

`packages/server/src/{catalog-availability,agent-execution,pty-environment}.ts` move to
`packages/core/src/host/{catalog-availability,agent-execution,pty-environment}.ts`.

- Keep every Context key string byte-identical: `"@orchestra/server/CatalogAvailability"`,
  `"@orchestra/server/CatalogAvailability/DefaultModel"`, `"@orchestra/server/AgentExecution/Annotate"` and
  `"@orchestra/ServerPtyEnvironment"`. That means no runtime identity change.
- **Why:** product modules (for example the B1-C `HostCatalogV2` in the claude-code module) must implement these, and
  `product → composition` is illegal. Their only dependencies are core and schema types plus `makeGlobalNode`.
- **Importers to relink (8):**
  - `packages/server/src/{routes.ts, handlers/agent.ts, handlers/model.ts, handlers/provider.ts, handlers/pty.ts}`
  - `apps/orchestra/src/server/routes/instance/httpapi/{server.ts, handlers/catalog.ts, handlers/agent-execution.ts}`
  - `apps/orchestra/src/plugin/pty-environment.ts`
  - tests `apps/orchestra/test/server/{agent-execution,httpapi-v2-agent-execution}.test.ts`,
    `test/claude-code/host/provider.test.ts`
- **Exports.** Remove the three keys from `packages/server/package.json` (lines 9, 12 and 22). Add
  `./host/catalog-availability`, `./host/agent-execution` and `./host/pty-environment` to `packages/core/package.json`
  with `script/explicit-exports.ts core --write`. Register `host` as a `collection` module of core (registry, lead).
- **Ownership:** add `src/host/` to a core domain in the registry, for example `runtime`, so R12 coverage holds.

### 2.4 Platform code moved down instead of ported

| Item | Action | Why it is safe |
|---|---|---|
| `apps/orchestra/src/tool/truncation-dir.ts` (7 LOC; imports core `Global`, `FSUtil`) | `git mv` → `packages/core/src/tool/truncation-dir.ts`; core exports key `./tool/truncation-dir` | Pure path constant. Importers: `tool/{read,truncate}.ts`, `tool/shell/execution.ts`, `maestro/roster.ts`, tests `maestro/seat-scaffold`, `tool/shell-external-read`, `tool/shell-read-sandbox` |
| `@/util/token` in `continuity/masking.ts` | retarget to `@orchestra/core/util/token` | `apps/orchestra/src/util/token.ts` is literally `export { Token, estimate } from "@orchestra/core/util/token"` |
| `import type { SessionID } from "@/session/schema"` in `claude-code/host/{join,options}.ts` | retarget to `import type { SessionSchema } from "@orchestra/core/session/schema"` and use `SessionSchema.ID` | `session/schema.ts:6` defines `SessionID = SessionV2.ID`; type-only, no runtime change |
| `@/id/id`, `session/schema.ts` (`MessageID.ascending`) | **not moved** | Moving them retargets the second monotonic counter (70-90 §9 item 7), which is a behavior change for its own PR. B1 avoids every file that needs it |

### 2.5 PORT-4: `AppDock.Transport` (modules/app-dock; new `src/transport.ts`)

```ts
/** The message channel to Electron main. Today `process.parentPort` (utilityProcess); a V2 `serve` child gets B4's local channel. */
export interface Transport {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}
```

- `app-dock.ts:10` (`type ParentPortLike`) and `linux-workspace.ts:5` (`type Port`) are identical. Both become
  `import type { Transport } from "./transport"`.
- `createAppDockHooks(port: Transport, …)` and `createLinuxWorkspaceHooks(port: Transport)` keep their signatures.
- `AppDockPlugin` and `LinuxWorkspacePlugin` (V1, reading `process.parentPort`) stay for the legacy server until B9.

### 2.6 PORT-5: `Janitor.Sink` (modules/janitor; edit `src/bootstrap.ts`)

```ts
export type Sink = (event: ReportEvent) => Effect.Effect<void>

export const startJanitorLoop = Effect.fn("Janitor.start")(function* (
  scope: Scope.Scope,
  sink: Sink,
  env: Record<string, string | undefined> = process.env,
) { /* unchanged body; `emit` becomes: */ }
// const emit = (event: ReportEvent) => Effect.sync(() => setLatestReport(event.report)).pipe(Effect.andThen(sink(event)))
```

- `GlobalBus` leaves the module.
- The legacy sink in `apps/orchestra/src/server/server.ts:93` is
  `(event) => Effect.sync(() => GlobalBus.emit("event", { directory: "global", payload: { type: EventType, properties: event } }))`.
- The V2 sink (K3) publishes on the V2 global event stream that B3 adds.

### 2.7 PORT-6: `ArsenalNative` (modules/maestro/coordination; new `src/arsenal-native.ts`)

- Move `makeV2ApprovalHost`, `nativeSafetyNode` and `nativeRegistryReplacements` verbatim from
  `apps/orchestra/src/maestro/arsenal-approval.ts` (lines 60–143). They import only core.
- Add:

  ```ts
  export const contribution: Host.Contribution = { id: "maestro-arsenal-native", replacements: nativeRegistryReplacements }
  ```

- `arsenal-approval.ts` keeps `makeApprovalHost` (V1).
- `arsenal-bindings.ts:699-701` drops the `nativeSafetyNode` and `nativeRegistryReplacements` re-exports. Their
  importers (`effect/app-node-builder-v1.ts:13`, `httpapi/server.ts:282`) import `ArsenalNative` from
  `@orchestra/maestro/arsenal-native`. AGENTS forbids shims.

### 2.8 B1-C seams (frozen here, implemented after B1-C design)

| Seam | Lives in | Shape |
|---|---|---|
| Engine adapter | `@orchestra/llm` route plus a core model-resolution hook | `ExecutionHost.Interface = { id: "claude-code"; stream(request: LLMRequest, session: { id: SessionSchema.ID; agent: AgentV2.ID }): Stream<LLMEvent, ProviderError> }`, selected when `provider.api.settings.executionHost === "claude-code"`. Tool calls are emitted `providerExecuted: true`. Requires D-C2. |
| Task governance | core `tool/task.ts` | `TaskGovernance.Interface = { admit(input: { parent: SessionSchema.Info; target: AgentV2.Info; input: TaskInput }): Effect<TaskAdmission, ToolFailure>; settle(...) }` as a Location-scoped node. Default allows everything; maestro replaces it through `Host.Contribution.replacements`. |
| Seat roster | V2 config/agent plugin | Seats become `AgentV2.Info` with `engine` (schema already has `engine`, `packages/schema/src/agent.ts:22`). Moving roster in C4 is the precondition. |
| Continuity | core `session/compaction.ts`, `system-context` | A compaction-strategy node plus a System Context source; design-gated |
| Catalog availability V2 | modules/engine-adapters/claude-code `HostCatalogV2.layer` | Same logic as `handlers/catalog.ts`, on core `Config.entries()` plus `ClaudeHostProvider.signedIn`. Composed by apps/cli **only after** the engine adapter exists; earlier it would advertise an execution host that the V2 runner refuses. |
| Pty environment V2 | core V2 plugin hook `shell.env` (missing: `core/src/tool/bash.ts:78` TODO) | Out of B1. V1 plugins retire (D-B5). |

---

## 3. Composition (no duplicate coordinators)

Each server process builds **one** application root: one `SessionExecution` → `SessionExecutionLocal`, one
`LocationServiceMap`, one `ScheduledTask` daemon. Product modules contribute only through `Host.Contribution`, and
`Host.merge` rejects the reserved nodes. The two roots are never run against the same `orchestra.db` at once
(convergence B.7). That constraint belongs to the B6 fallback, not to B1.

| Contribution | Legacy root (`apps/orchestra/src/server/routes/instance/httpapi/server.ts` `createRoutes`, built with `AppNodeBuilderV1.build`) | `apps/cli serve` (`packages/server` `createRoutes({host})`, composed in new `apps/cli/src/host.ts`) |
|---|---|---|
| Arsenal native safety (`ArsenalNative`) | after C6: `[...ArsenalNative.nativeRegistryReplacements]` in `app-node-builder-v1.ts` and `buildLocationServiceMap(...)`. Same behavior, new import. | **K1: `CliHost.contributions = [ArsenalNative.contribution]`**. New capability on V2. Unverified that every dependency of `MaestroArsenal.nativeSafetyNode` is in the V2 Location graph; K1's test proves it. |
| `ArsenalBindings.node` (V1 glue) | stays (app group, line 274) | none: V1 |
| `HostCatalog` (V1 Config + InstanceStore) | stays in apps/orchestra and imports `ClaudeCodeSDK` and `ClaudeHostProvider` from `@orchestra/engine-claude-code` | none until B1-C (`HostCatalogV2`) |
| `HostAgentExecution` (V1 Agent registry) | stays | none: the V2 `AgentV2` registry already carries `engine` from config (`core/src/config/plugin/agent.ts:121`) |
| `PluginPtyEnvironment` (V1 plugin `shell.env`) | stays | none until a V2 plugin hook exists |
| Janitor | `server/server.ts:93` → `startJanitorLoop(state.scope, legacySink)` | K3 (after B3): `startJanitorLoop(scope, v2Sink)` in the serve handler |
| App Dock / Linux workspace tools | V1 plugins via `plugin/index.ts:89` (gated by `ORCHESTRA_CLIENT=desktop`) | K2: `AppDock.applicationTools(transport)` registers on core `ApplicationTools` (global node). Wired when B4 provides the transport and the desktop child sets `ORCHESTRA_CLIENT=desktop`. |
| Maestro, Claude Code engine, continuity | V1 `SessionPrompt` (unchanged) | B1-C |

`apps/cli/src/host.ts` is the app's own composition list (layer `app`, which may import `product`):

```ts
import type { Host } from "@orchestra/core/host"
import { ArsenalNative } from "@orchestra/maestro/arsenal-native"

export const contributions: ReadonlyArray<Host.Contribution> = [ArsenalNative.contribution]
export * as CliHost from "./host"
```

---

## 4. Cards

### 4.1 Rules for every card

- The executor works in its own worktree and never installs, typechecks, tests or builds (owner rule). It runs only
  the listed static commands.
- It never edits `script/boundary-ledger.json`, `script/module-architecture.json`, `script/module-registry.json`,
  `script/spawn-allowlist.json`, any `package.json` `exports`, `bun.lock` or Nix files. Those are lead-owned (L1, I1).
- Use `git mv`, never delete and recreate, so history follows.
- **Importers outside the card's move set are not edited by the card.** The lead's codemod (L3) relinks them once, in
  I1. Inside moved files the card leaves `@/…` specifiers alone; the codemod rewrites them to relative paths. This is
  what keeps W1 file-disjoint.
- Each card writes `script/moves/<card>.json`: `{ "moves": [{ "from": "<old path>", "to": "<new path>" }] }`. The
  codemod reads it.
- **Static acceptance for every card:**
  - `bun script/move-relink.ts --check script/moves/<card>.json` exits 0. It shows that every specifier pointing to a
    moved file resolves under the map, and it lists the string pins.
  - `bun run check:boundaries --scope <new package path> --no-stale` exits 0, or shows only rows the card's brief
    names.
- Tier labels: **H** = Haiku (mechanical), **S** = Sonnet (needs local reasoning), **O** = Opus (lead, contract or gate
  judgment).

### 4.2 W0: lead prep (serial)

| Card | Tier | Content | Files | Acceptance |
|---|---|---|---|---|
| **L0** baseline | O | Re-run `scripts/edges.py`, the movable fixed point and the R11 map on the landed SHA. Store the receipts. Delta above ±5% → update the card lists. | none (receipts in scratchpad) | parser reproduces the R11 ledger rows 1:1 |
| **L1** registry, layer, skeletons, lockfile | O | §2.0 in full: layer `product`; 5 registry entries in both JSON files (owner = role, never a seat name); package skeletons; 3 compat facades; workspaces; consumer dependencies; `bun.lock` and the Nix hash (lockfile window); `turbo.json` `@orchestra/cli#test` inputs gain `$TURBO_ROOT$/modules/maestro/coordination/src/**` (keep the old line until B9) | `package.json`, `bun.lock`, `nix/hashes.json`, `script/module-registry.json`, `script/module-architecture.json`, `turbo.json`, `apps/{orchestra,cli}/package.json`, `modules/{app-dock,janitor,continuity,engine-adapters/claude-code,maestro/coordination}/{package.json,tsconfig.json,bunfig.toml,README.md}`, `…/src/compat/core-v1-session.ts` ×3 | `check:boundaries` strict exits 0 (R0 accepts the new registry; R8 accepts the READMEs); typecheck.yml dispatch **T1** green |
| **L2** ports | O | PORT-1 (`core/src/host.ts` plus test), PORT-2 (`server/src/routes.ts`), PORT-3 (`git mv` of 3 references to `core/src/host/`, relink of 8 importers and 3 tests, exports both sides) | as listed in §2.1–2.3 | T1-bis typecheck dispatch; `bun run test:ci core test/host.test.ts`; `bun run test:ci server`; `bun run test:ci orchestra test/server/agent-execution.test.ts test/server/httpapi-v2-agent-execution.test.ts test/claude-code/host/provider.test.ts test/effect/runtime-globals.test.ts` |
| **L3** move tool | O | `script/move-relink.ts` (≤ 300 LOC; TypeScript AST only, `ts.createSourceFile`, no `child_process`). Details below the table. Test: `packages/script/test/move-relink.test.ts` (fixture tree: relative, `@/` and package specifier, dynamic import, `typeof import`, a pin). | `script/move-relink.ts`, its test, `script/moves/` (dir) | `bun run test:ci script test/move-relink.test.ts` |
| **L4** omni guard reach (recommended, not blocking W1) | S (O reviews) | `packages/core/test/omni-expect-guard.test.ts:42-44,56,69-74`: take packages from `script/module-registry.json` paths that have a `bunfig.toml` preloading the control, instead of `^(packages\|apps)\/[^/]+\/bunfig\.toml$`. Surface: `<registered path>/src/**`. Resolver: add `@orchestra/<registered>/…` through registry path plus `exports` (no `node_modules`). This is a strict superset of today's reach (gate-authoring: prove it with an expected-flagged list that keeps today's entries). Needed before any B1-C test in `modules/engine-adapters/claude-code` drives omni. | that one test file | `bun run test:ci core test/omni-expect-guard.test.ts` |

`script/move-relink.ts` does three things:
- `--check <maps…>` resolves every import position in the repo: static, re-export, `import()`, `require()`,
  `import type`, `typeof import()`. It reports specifiers that resolve to a `from` path, plus a grep of string literals
  containing a `from` path (pins).
- `--apply <maps…>` rewrites each specifier:
  - in the same package after the move → relative, without extension, matching local style;
  - in another package → `@orchestra/<pkg>/<subpath>`, without extension;
  - `@/` inside moved files → relative.
- It then prints the remaining pins, which go to card P1.

### 4.3 W1: moves (8 cards, file-disjoint, rolling dispatch, longest first: C4, C7, C6, C3, then the rest)

| Card | Tier | `git mv` (from `apps/orchestra/` unless noted) → to | Card-local edits | Path pins the card fixes | Acceptance (static) and later test:ci |
|---|---|---|---|---|---|
| **C1** truncation-dir down | H | `src/tool/truncation-dir.ts` → `packages/core/src/tool/truncation-dir.ts` | none | none | `move-relink --check`; later `test:ci orchestra test/tool/shell-external-read.test.ts test/tool/shell-read-sandbox.test.ts` |
| **C2** app-dock | H | `src/plugin/{app-dock,app-dock-hints,app-dock-linux,app-dock-outline,linux-workspace,app-dock.fixture}.ts` and `src/plugin/{app-dock,app-dock-focus,app-dock-outline,app-dock-target,linux-workspace}.test.ts` → `modules/app-dock/src/` (same names, tests stay colocated) | new `src/transport.ts` (PORT-4); `app-dock.ts:10-13` and `linux-workspace.ts:5-8` type aliases → `import type { Transport } from "./transport"` (rename uses) | `apps/desktop/scripts/app-dock-native-proof.ts:19`, `apps/desktop/scripts/app-dock-workspace-proof.ts:196` (path strings), `apps/desktop/test/native/apps/app_probe.py:35` (comment), `modules/app-dock/README.md` | later `bun run test:ci app-dock` |
| **C3** janitor | S | `src/janitor/{bootstrap,report-state,scan,scheduler,thresholds}.ts` and their 4 `.test.ts` files and `README.md` → `modules/janitor/src/` (README → `modules/janitor/README.md`, merged with the L1 skeleton) | PORT-5 in `bootstrap.ts` (remove the `GlobalBus` import; add the `sink` parameter); `bootstrap.test.ts` passes a recording sink; `apps/orchestra/src/server/server.ts:93` call site passes the legacy sink (this card owns that one line plus the `GlobalBus` import) | none found | later `bun run test:ci janitor`, `test:ci orchestra test/server/listener-plugin-policy.test.ts` (it composes the server; unverified that it touches janitor) |
| **C4** maestro seats and roster | S | `src/maestro/{roster,route-grant,context-tool-plan,seat-skill-root,seat-skill-content,playbook-content}.ts` and `src/maestro/seats/*.ts` (10) → `modules/maestro/coordination/src/` (`seats/` kept); `src/agent/prompt/{archie,backend,billy,frankie,jimmy,lucy,patty,rosie}.txt` → `modules/maestro/coordination/src/seats/prompt/` | `seats/<id>.ts:1` → `import PROMPT from "./prompt/<id>.txt"` (8 lines); `seat-skill-root.ts:60` `new URL("../../playbooks", …)` → `new URL("../../../../apps/orchestra/playbooks", …)` plus a comment saying playbooks move in B1-C (see the build note below) | `apps/orchestra/test/agent/specialist-name-guard.test.ts:10` ALLOWED_FILE → `modules/maestro/coordination/src/roster.ts`; `AGENTS.md` line 17 path (lead applies); `apps/orchestra/script/seat.ts:22,25` and `seat-skills.ts:7` (comment); `apps/cli/script/packaged-skills.ts:1-2`; `apps/cli/test/fixture/distribution-native.ts:100-101`; tests `maestro/seat-scaffold.test.ts:20-29,85-87,128`, `seat-framework.test.ts:14,91-95,116`, `fixtures/second-seat-registry.ts:12,33`, `seat-skills-build.test.ts:176-177`, `seat-skill-root.test.ts:134,160`, `fixtures/seat-embedded-skills.ts:17`; `.github/scripts/archie-authoring-pair-initializer.ts:85-86`, `.github/scripts/maestro-authoring-run.ts:363` | later `test:ci orchestra test/agent/specialist-name-guard.test.ts test/agent/native-team.test.ts test/agent/native-seat-label.test.ts test/maestro/seat-framework.test.ts test/maestro/seat-scaffold.test.ts test/maestro/seat-skills-build.test.ts test/maestro/seat-skill-root.test.ts test/maestro/backend-seat-runtime.test.ts`; `test:ci cli` (distribution fixture, compiled lanes run on Actions) |
| **C5** maestro core-neutral | H | `src/maestro/{ability-descriptors,ability-registry,admit-request,approval,arsenal-observations,arsenal-outcome,governed-task,lifecycle-fold,project-config,session-authority,task-hash,upstream-proposal,upstream-result,verification-plan,work-contract}.ts` → `modules/maestro/coordination/src/`; tests `test/maestro/{lifecycle-fold,governed-task,project-config,upstream-proposal,work-contract,ability-registry,task-hash,admit-request,approval,ability-descriptors,verification-plan}.test.ts` → `modules/maestro/coordination/test/` | `arsenal-observations.ts:28` `@orchestra/core/v1/session` → `./compat/core-v1-session` | `.github/scripts/archie-authoring-pair.ts:170`, `.github/scripts/maestro-authoring-run.ts:479` (both `upstream-result.ts`). **Overlap with C4 on `maestro-authoring-run.ts` → move every `.github/scripts` pin to P1.** | later `bun run test:ci maestro` |
| **C6** arsenal native split | S | none (new file) | PORT-6: new `modules/maestro/coordination/src/arsenal-native.ts` (verbatim lines 60–143 of `arsenal-approval.ts` plus `contribution`); delete those lines from `apps/orchestra/src/maestro/arsenal-approval.ts`; delete `arsenal-bindings.ts:699-701` re-exports; edit `effect/app-node-builder-v1.ts:5,13` and `httpapi/server.ts:112,282` to import `ArsenalNative` | none | later `test:ci orchestra test/tool/maestro-native-approval.test.ts test/tool/maestro-native-bindings.test.ts test/maestro/arsenal-approval.test.ts test/maestro/arsenal-activation.test.ts test/server/httpapi-exercise` (unverified the last is a test dir) |
| **C7** claude-code neutral | S (O reviews the gate diff) | `src/claude-code/{sdk,executable,transcript}.ts`, `src/claude-code/host/{admission,join,options,provider}.ts` → `modules/engine-adapters/claude-code/src/` (`host/` kept); `test/claude-code/preset-guard.test.ts` → `modules/engine-adapters/claude-code/test/` | `executable.ts:7` `"../../package.json"` → `"../package.json"`; `join.ts:9` and `options.ts:18` SessionID → `SessionSchema.ID` (type-only, §2.4); `transcript.ts:3` and `host/admission.ts:3` → `./compat/core-v1-session` (relative depth per file); `host/admission.ts:5` `@/continuity/alias` stays for the codemod (→ `@orchestra/continuity/alias`) | `apps/orchestra/test/claude-code/credential-access.test.ts:198,223,234`; `apps/desktop/src/main/candidate-repair.test.ts:141` (entrypoint becomes `../../modules/engine-adapters/claude-code/src/sdk.ts` relative to its `run(...)` cwd `apps/orchestra`); **`apps/orchestra/test/claude-code/mode-boundary.test.ts`**: `ADAPTER_EDGES` (lines 20-41), `INTERFACE` (lines 150-170) and the Claude-mode root must treat `@orchestra/engine-claude-code/*` as Claude mode. The guard must stay a strengthening: a planted normal-mode import of `@orchestra/engine-claude-code/host/provider` from a non-adapter file must still be flagged; add that case. `apps/orchestra/src/claude-code/README.md` + new module README | later `bun run test:ci engine-claude-code`; `test:ci orchestra test/claude-code/mode-boundary.test.ts test/claude-code/credential-access.test.ts test/claude-code/executable.test.ts test/claude-code/sdk-lifecycle.test.ts test/claude-code/sdk-packaging.test.ts test/claude-code/runtime-version.test.ts test/claude-code/host/options.test.ts test/claude-code/host/provider.test.ts`; `test:ci desktop src/main/candidate-repair.test.ts` |
| **C8** continuity neutral | H | `src/continuity/{alias,archive-search,dry-transport,raw-payload,request-source,masking}.ts` → `modules/continuity/src/` | `masking.ts:4` `@/util/token` → `@orchestra/core/util/token`; the 4 `@orchestra/core/v1/session` type imports → `./compat/core-v1-session` | none found | later `test:ci orchestra test/continuity` (all 37 tests stay and are relinked) |

**Build note (C4, unverified).** The compiled seat-skill embed `orchestra-seat-skills.gen.ts` is a Bun `files` entry
of `apps/orchestra/script/build.ts:216-223` and `build-node.ts:65`, imported by bare specifier from
`seat-skill-root.ts:19`. It is not proven that Bun resolves that virtual file for an importer outside the build's
cwd. It is proven only by the distribution-bundle and desktop build lanes in the epic CI. If it fails, the fallback
keeps `seat-skill-root.ts` in `apps/orchestra` and injects `roots` into roster: that becomes a Sonnet redo of C4.

### 4.4 Integration (lead, serial) and pins

| Step | Tier | Content | Acceptance |
|---|---|---|---|
| **I1** | O | Merge order: C1 → C2 → C3 → C8 → C7 → C5 → C4 → C6. Then:<br>• `bun script/move-relink.ts --apply script/moves/*.json` (one commit, `refactor: relink moved product modules`)<br>• `bun script/explicit-exports.ts <alias> --write` for the 5 new packages, core and server<br>• registry `scaffoldReadmes`: add the 5 module READMEs and keep the apps/orchestra ones (they still describe the V1 glue)<br>• registry orchestra `domains` patterns: drop `src/plugin/app-dock*`, `src/plugin/linux-workspace*` and `src/janitor/` (now empty); keep the rest<br>• `logicalModules[app-dock].paths`: replace the two apps/orchestra globs with `modules/app-dock/src/*`<br>• `spawn-allowlist.json:65` key `apps/orchestra/src/claude-code/sdk.ts` → `modules/engine-adapters/claude-code/src/sdk.ts` (rename = remove plus add; the lead's call per AGENTS)<br>• `check:boundaries --prune` | `check:boundaries` strict exits 0; **R11 = 63**, every remaining row carrying the D-C1 reason; no new R1/R3/R4/R5/R7 rows; typecheck.yml **T2** green |
| **P1** pins sweep | H | Fix every string pin `move-relink` printed that no card owned. Known: `.github/scripts/{archie-authoring-pair-initializer.ts:79-86, archie-authoring-pair.ts:170, maestro-authoring-run.ts:363-479, archie-host-acceptance.ts:481-483, archie-host-s14.ts:123}`. Only paths of moved files change; `write-roots`, `backend-result`, `logical-task`, `upstream-provenance` and `claude-code/tools.ts` stay put. Also `packages/schema/src/relay-arm.ts:262` (comment) and `apps/orchestra/script/maestro-wave1-restart.ts` (stays: `validation-record` does not move). | `move-relink --check` prints 0 pins |
| **CI-B1** | lead | test:ci batches: the per-card lists above, merged per package (one `orchestra` run with the named files, one each of `maestro`, `engine-claude-code`, `janitor`, `app-dock`, `core`, `server`, `desktop`, `cli`), plus `script test/module-boundaries.test.ts` | all green |

### 4.5 W2: composition and V2 readiness

| Card | Tier | Content | test:ci |
|---|---|---|---|
| **K1** cli serve host | S | New `apps/cli/src/host.ts` (§3); `serve.ts` passes `host`. New test `apps/cli/test/serve-host.test.ts`: build routes with `CliHost.contributions` through `createRoutes({ host })`, open a Location, and assert that the native `ToolSafety` replacement is active (it proves the Arsenal dependencies resolve in the V2 graph). Pattern: `apps/orchestra/test/tool/maestro-native-bindings.test.ts`. | `bun run test:ci cli test/serve-host.test.ts`; `bun run test:ci server` |
| **K2** Dock on ApplicationTools | S | `modules/app-dock/src/application-tools.ts`: `applicationTools(transport: Transport): Record<string, Tool.AnyTool>`, wrapping the hook tools of `createAppDockHooks`/`createLinuxWorkspaceHooks` as core `Tool`s, plus `contribution(transport)` registering them through a global node that calls `ApplicationTools.register`. Legacy keeps the V1 plugin. The transport comes from B4. | `bun run test:ci app-dock` |
| **K3** janitor V2 sink | S | `modules/janitor/src/v2-sink.ts` publishing `janitor.report` on the V2 global stream; the serve handler starts the loop. **Blocked by B3** (global event route). | `bun run test:ci janitor`, `bun run test:ci cli` |
| **K4** ledger and README record | H | Lead-approved: R11 `reason` text for the 63 open rows (D-C1); a `## Legacy edges` section in each module README listing the 35 converted `app → product` edges (from Appendix A) | `check:boundaries` strict |

### 4.6 Path-keyed ledgers per card

| Ledger | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | Who edits |
|---|---|---|---|---|---|---|---|---|---|
| `script/rename-ledger.ts` | none: it pins only `modules/relay` requirements (lines 30, 35) | – | – | – | – | – | – | – | – |
| `godfile-waivers.json` | none: 0 product paths among 4 apps/orchestra entries (`provider.ts`, `prompt.ts`, `session.ts`, `test/tool/task.test.ts`) | – | – | – | – | – | – | – | – |
| `script/spawn-allowlist.json` | – | – | – | – | – | – | `:65` sdk.ts key | – | lead (I1) |
| `script/archive-scopes.json` | none: readers `apps/orchestra/script/continuity-bench/v4.ts` and `specs/…` do not move | – | – | – | – | – | – | – | – |
| omni-expect-guard | none: no moved test calls `expectSpawn`; all 7 that do (claude-code host tests) stay in apps/orchestra. L4 extends reach for B1-C. | | | | | | | | L4 |
| Nix filesets | registry-driven: `node_modules.nix:89` and `../modules` wholesale; the FOD hash changes once in L1 | | | | | | | | L1 |
| test-ci selectors | new aliases are selectable (`script/test-ci-package.ts` resolves through the registry). `apps/orchestra/script/test-timings.json` keeps 294 product keys; stale keys are harmless (missing files are skipped and unknown files weigh the median, `test-shard.ts:28-33`). test.yml lanes `--filter=!orchestra` pick up new packages automatically. | | | | | | | | none |
| turbo inputs | – | – | – | `turbo.json:94` add new path | – | – | – | – | L1 |
| module registry and architecture | – | logicalModules | domains | – | – | – | – | – | I1 |
| tests or scripts pinning paths | – | 3 | 0 | 14 | 2 (→ P1) | 0 | 4 + mode-boundary | 0 | card / P1 |
| AGENTS.md | – | – | – | line 17 | – | – | – | – | lead |

---

## 5. Risks

1. **Spawn and omni rules.**
   - `claude-code/sdk.ts` spawns through `node:child_process` (`spawnClaudeCodeProcess`). It is allowlisted at
     `spawn-allowlist.json:65`.
   - The move needs the key renamed. AGENTS says entries "are only removed, never added without the lead", so I1 is
     lead-owned.
   - `bun run check:spawn-imports` must pass after I1. No new spawn site is created.
   - `omni-expect-guard` cannot see `modules/*` today (regex at line 42; surface at line 56). Any B1-C test there that
     drives omni would silently leave the guard, so L4 must land before B1-C cards.
   - New `bunfig.toml` files must not preload `test-omni-control.ts`. A whole-package run of a package whose tests never
     spawn through omni would fail the control.
2. **claude_code preset billing rule.**
   - `processLifetime` (`sdk.ts:38-44`) is the single structural seam. It moves byte-identical in C7, and its unit test
     (`preset-guard.test.ts`) moves with it.
   - `host/options.ts:98` and `host/provider.ts:14` keep `{ type: "preset", preset: "claude_code" }`.
   - The `mode-boundary` guard is edited in C7 and must remain a strengthening (Opus review).
   - The B1-C engine adapter must route every `query()` through `processLifetime`; its design review checks that.
   - Never tune prompts to avoid the third-party billing classification (owner rule).
3. **V2 Session invariants.**
   - B1 touches no SessionV2, SessionExecution, SessionRunner or LocationServiceMap code.
   - PORT-1 rejects contributions that try to own SessionExecution, SessionV2, LocationServiceMap or ScheduledTask
     nodes, so there is one coordinator per process.
   - Arsenal's replacement is Location-scoped (ToolRegistry and ToolSafety nodes), which matches "tool registry,
     permissions … Location-scoped".
   - **The B1-C engine adapter conflicts with AGENTS** ("do not … delegate orchestration to an in-memory tool loop").
     That needs owner decision D-C2 before design.
   - Do not run a v1 sidecar and a V2 serve on one DB at once (B6).
4. **Fixtures and tests with hard-coded paths.**
   - The previous moves broke exactly these. Section 4.3 lists every pin found by grep: 471 hits, 294 of them in
     `test-timings.json`.
   - The relink tool's `--check` re-greps on the landed SHA.
   - Fragile spots:
     - seat scaffolding tests copy `src/maestro/seats` into temporary trees (`seat-framework`, `second-seat-registry`);
     - `restart-proof`, `arsenal-lazy` and `arsenal-one-evaluator` spawn `bun test` with relative paths and stay in
       apps/orchestra;
     - `seat-skill-root.ts:60` gets a cross-package URL to `apps/orchestra/playbooks` until the playbooks move;
     - `executable.ts` reads `SDK_VERSION` from its own `package.json`, so its pin must equal apps/orchestra's.
       `test/claude-code/runtime-version.test.ts` should catch drift (unverified).
5. **Windows.**
   - Moved tests leave the orchestra shards for the turbo "rest" lane (30-minute step; core alone took 1081 s on
     2026-10-12). That adds 22 small test files: low risk, unmeasured.
   - The relink tool must normalize paths to `/` and tolerate CRLF.
   - `candidate-repair.test.ts:141` builds with a relative entry; keep POSIX separators.
   - `credential-access` scope globs already cover `modules/*/*/src` (line 25).
   - Claude Code resource lookup (`executable.ts:51-79`) is unaffected by moving the file, because it uses
     `import.meta.url` of the bundle.
6. **Build and bundle.** Unverified that the virtual seat-skill module resolves from `modules/` (§4.3 build note).
   The desktop `virtual:orchestra-server` bundle (`apps/desktop/electron.vite.config.ts:74`) must follow the new
   workspace deps. This is proven only by the epic CI and the distribution lanes.
7. **Lockfile and Nix.** Five new workspace members change `bun.lock` and the FOD hash once (L1). The
   requalification procedure is unverified.
8. **Overclaiming.** Moving files converts 35 R11 rows into legal cross-package edges. They are not decoupled until
   B9 or B1-C. K4 records them (D-C4).
9. **Specialist-name guard and AGENTS.md** pin the roster path. C4 changes both; the AGENTS.md edit is the lead's.

---

## 6. Estimate

| Item | Count |
|---|---|
| B1 cards | **19**: W0 L0–L4 (5), W1 C1–C8 (8), I1 + P1 (2), W2 K1–K4 (4) |
| By tier | **Opus 5** (L0, L1, L2, L3, I1; plus review of L4 and C7) · **Sonnet 8** (L4, C3, C4, C6, C7, K1, K2, K3) · **Haiku 6** (C1, C2, C5, C8, P1, K4) |
| Waves | W0 serial (L0 → L1 → L2 ∥ L3; L4 any time before B1-C) → W1 one wave of 8, rolling → I1 → P1 → CI-B1 → W2 (K1, K2, K4 now; K3 after B3) |
| CI | typecheck dispatches T1 (after L1/L2) and T2 (after I1); test:ci: L2 (3 runs), L3 (1), CI-B1 (about 9 package runs), K (3); epic CI at the end of B1, with a +1 rerun budget |
| Wall-clock | W0 about 1 day (the lockfile and Nix window is the long pole); W1 about 2–3 h; I1 + P1 + CI-B1 about 0.5 day; W2 about 0.5 day. **About 2.5–3 working days.** |
| **Critical path of B1** | L0 → L1 (lockfile/Nix) → L2 → C4 (longest card) → I1 relink → T2 → CI-B1 → K1 |
| **Critical path of the desktop flip** | B1 → **B1-C design** (Opus: D-C2 engine host, task governance, roster as V2 agents, continuity, playbooks move) → B1-C implementation (estimated 20–30 Sonnet/Opus cards; 63 R11 rows retire with it and with B9) → B4 Dock transport + K2 wiring → B6. B1 alone does **not** unblock B6. |

The convergence plan sized B1 at 10 cards. The measured B1 is 19 cards, and the design track B1-C, which that plan
counted inside B1, is the larger half.

---

## Appendix A: R11 row → closure (98 rows)

| # | importer (`apps/orchestra/src/…`) | specifier | closes by |
|---|---|---|---|
| 1 | agent/agent.ts | `@/maestro/roster` | C4 |
| 2 | agent/agent.ts | `@/maestro/seat-skill-root` | C4 |
| 3 | agent/agent.ts | `@/maestro/seats` | C4 |
| 4 | plugin/index.ts | `./app-dock` | C2 |
| 5 | plugin/index.ts | `./linux-workspace` | C2 |
| 6 | project/bootstrap.ts | `@/maestro/upstream-v2` | open: B1-C or B9 |
| 7 | research/allowance.ts | `@/maestro/logical-task` | open |
| 8 | research/allowance.ts | `@/maestro/roster` | C4 |
| 9 | research/binding.ts | `@/maestro/roster` | C4 |
| 10 | server/…/handlers/catalog.ts | `@/claude-code/host/provider` | C7 |
| 11 | server/…/handlers/catalog.ts | `@/claude-code/sdk` | C7 |
| 12 | server/…/handlers/global.ts | `@/janitor/report-state` | C3 |
| 13 | server/…/handlers/provider.ts | `@/claude-code/host/provider` | C7 |
| 14 | server/…/handlers/session.ts | `@/continuity/service` | open |
| 15 | server/…/handlers/session.ts | `@/maestro/write-roots` | open |
| 16 | server/…/httpapi/server.ts | `@/claude-code/sdk` | C7 |
| 17 | server/…/httpapi/server.ts | `@/continuity/service` | open |
| 18 | server/…/httpapi/server.ts | `@/maestro/arsenal-bindings` | open (V1 `ArsenalBindings.node` remains) |
| 19 | server/server.ts | `@/janitor/bootstrap` | C3 |
| 20 | session/compaction.ts | `@/maestro/atlas-resume-restore` | open |
| 21 | session/llm/context-budget.ts | `@/continuity/masking` | C8 |
| 22 | session/llm/context-budget.ts | `@/continuity/trigger` | open |
| 23 | session/llm/request.ts | `@/maestro/atlas-header` | open |
| 24 | session/native-tools.ts | `@/maestro/arsenal-bindings` | open |
| 25 | session/prompt-host.ts | `@/continuity/service` | open |
| 26 | session/prompt-host.ts | `@/maestro/write-roots` | open |
| 27 | session/prompt.ts | `./prompt-continuity` | open |
| 28 | session/prompt.ts | `@/claude-code/engine` | open |
| 29 | session/prompt.ts | `@/continuity/alias` | C8 |
| 30–35 | session/prompt.ts | `@/continuity/{service,trigger}`, `@/maestro/{arsenal-bindings,arsenal-observations,atlas-knowledge,atlas-resume-restore}` | `arsenal-observations` C5; the other 5 open |
| 36 | session/task-prompt-ops.ts | `@/maestro/arsenal-bindings` | open |
| 37 | session/tools.ts | `@/maestro/roster` | C4 |
| 38–42 | session/upstream-task-settlement.ts | `@/maestro/{backend-result,logical-task,seats,session-authority,upstream-result}` | `seats` C4; `session-authority` and `upstream-result` C5; 2 open |
| 43–44 | skill/index.ts | `@/maestro/{seat-skill-root,seats}` | C4 ×2 |
| – | tool/registry.ts (22 rows) | 14 `./maestro-*`/`./atlas-*`/`./context-*` tools; `@/continuity/{archive,service}`; `@/maestro/{arsenal-bindings,arsenal-observations,atlas-knowledge,atlas-memory,invocation-binding,roster}` | `arsenal-observations` C5, `roster` C4; 20 open |
| – | tool/research-registry.ts (3) | `./atlas-context`, `@/maestro/{atlas-memory,roster}` | `roster` C4; 2 open |
| 71 | tool/research-repo.ts | `@/maestro/roster` | C4 |
| 72 | tool/shell.ts | `@/maestro/seats` | C4 |
| 73–74 | tool/shell/execution.ts | `@/maestro/{roster,seats}` | C4 ×2 |
| 75 | tool/shell/scan.ts | `@/maestro/seats` | C4 |
| 76 | tool/skill.ts | `@/maestro/atlas-source` | open |
| 77–82 | tool/task-background.ts | `@/maestro/{arsenal-completion,backend-result,backend-work,discovery-result,upstream-result,upstream-settlement}` | `upstream-result` C5; 5 open |
| 83–86 | tool/task-work-observation.ts | `@/maestro/{backend-result,logical-task,session-authority,upstream-settlement}` | `session-authority` C5; 3 open |
| – | tool/task.ts (13 rows) | `../maestro/governed-task-reservation`, `@/maestro/{arsenal-completion,atlas-resume,authorization,backend-work,dispatch,grounded-skills,logical-task,roster,seats,session-authority,workflow-binding,write-roots}` | `roster` C4, `seats` C4, `session-authority` C5; the rest open |

Totals from `m/r11-map.md` (exact, per unique importer, specifier and target): **C2 2, C3 2, C4 18, C5 7, C7 4,
C8 2 = 35 closed; 63 open.** Grouped rows above are condensed and their row numbers are approximate; `m/r11-map.md`
holds the exact numbered 98-row list and wins on any difference.

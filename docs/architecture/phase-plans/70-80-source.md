# PLAN 70–80 — Internal modularity, scaffolding first

Executable plan for phase 70–80 of `docs/architecture/restructure-plan.md` ("Modularidade real por dentro"). It is written so that every Haiku card is pure application of a decided transformation. Anything that needs judgment is either already decided below (section 3) or flagged for the owner and kept out of the card set.

## 0. Baseline, method and reading rules

- **Measured tree:** `/Users/gustavoschneiter/Documents/HuGR/_worktrees/apps-audit`, HEAD `0f628936f8` (= `origin/dev` `ca6d9b5625` (#681) + the four apps-move commits of #738: `packages/{orchestra,desktop,cli,storybook}` → `apps/`). Dispatch must start from the `dev` head that contains the apps move; the lead re-runs L1 (inventory) and L6 (ledger baseline) on that head and replaces every "baseline" count below with the re-measured number before dispatch. Counts in this file are the 0f628936f8 measurements.
- **Instruments used (read-only):** a TS/JS specifier scan over all tracked files (`git ls-files`, regex over `import/export/from/import()/require()/mock.module()`, Atlas npm workspace and `native/` excluded), declared workspace dependencies from every `package.json`, and `turbo boundaries` 2.10.2 (binary from `orchestra-canonical/node_modules`) run against the measured tree (verified: no files created, `git status --ignored` clean). The L1 tool replaces the regex scan with a TypeScript-AST scan; expect ±1% drift, never more (a larger drift is a stop condition).
- **Phase integration branch:** `internal-modularity` (from `dev`). Every card branches from its head at dispatch and is merged back by the lead after verification. One epic PR `refactor: internal modularity scaffolding (70–80)` goes to `dev` at the milestone (section 6).
- **Layer vocabulary:** "platform" = `@orchestra/core`; "product" = Maestro, Continuity, engine adapters, ACP, Janitor, App Dock, Arsenal; "composition" = apps and `sdk-next`.

## 1. Tier summary

| Original WP | What this plan does | Tier |
| --- | --- | --- |
| 70-A Core internal domains with explicit APIs | 25 core domains declared in `script/ownership.json` (every file of `packages/core/src` owned exactly once), domain READMEs for the big ones, explicit `exports` for core, physical grouping of the unpinned Relay family into `src/relay/` | **Tier 1** (100%) |
| 70-B Browser-safe helpers in `packages/util` | New `@orchestra/util` with 9 pure modules moved from core (6) and tui (3), compat facades at old paths, 156 import sites retargeted, `@orchestra/core` dropped from app-shell and session-ui | **Tier 2** (100%) |
| 70-C Minimal ports + mandatory Session/Agent/Continuity/engines cut + toolkit acyclic cut | Not executable mechanically. This phase delivers its preconditions: the platform→product ledger (37 file rows / 96 statements in `apps/orchestra`), ownership of every legacy file, frozen exports. | **Tier 2-D** (deferred, design-gated; owner decision D18) |
| 70-D Maestro/Continuity and toolkit assets as cohesive modules | Ownership + READMEs + boundary direction rule in place (Tier 1); relocation to `modules/*` deferred behind 70-C (Tier 2-D) | Tier 1 ~35% / Tier 2-D ~65% |
| 70-E App Dock contracts + adapters | Logical module `app-dock` spanning 3 packages, README, boundary rows (Tier 1); physical extraction deferred (72 desktop files, 59 path references incl. `native.yml`, `bunfig.toml`, spawn allowlist) | Tier 1 ~30% / Tier 2-D ~70% |
| 70-F Explicit facades/exports and dependency review | Wildcard `./*` closed for core, server, protocol, schema, relay, apps/orchestra; layer tags enforced by `turbo boundaries` + `check:boundaries` with a shrink-only ledger; missing dependency declarations fixed | **Tier 1** (100%) + Tier 2 (E6, L10) |
| 70-G Disposition of every legacy `apps/orchestra` domain | Disposition table encoded in `script/ownership.json` (48 entries + 18 product-owned files in shared folders), READMEs; actual relocation needs 70-C | Tier 1 ~60% / Tier 2-D ~40% |

Card count by tier: **Tier 1 = 37 cards** (L1–L8, E1–E5, R01–R09, R11–R21, R23–R25, M1), **Tier 2 = 13 cards** (L9, L10, B1–B5, U1–U5, E6), **Tier 2-D = 9 deferred items** (section 3.2), **Tier 3 = 8 interaction notes** (section 10). Fully closed WPs: 70-A, 70-B, 70-F. Scaffold-only: 70-D, 70-E, 70-G. Deferred: 70-C.

## 2. Measured import graph and hub edges

### 2.1 Declared vs imported edges (src value / src type / test value / test type)

| Edge | Counts | Classification |
| --- | --- | --- |
| orchestra → @orchestra/core | 1006 / 70 / 1947 / 51 | legitimate (app composes platform). Note: core is only a **devDependency** of `apps/orchestra` (L10 does not change it; recorded in 80-B). |
| @orchestra/app (app-shell) → @orchestra/core | 81 / 0 / 44 / 1 | **violation** ui→platform. 100% are `util/{path 37, encode 29+44 test, binary 6, retry 5+1 type, array 2, task-tool 2}` → fixed by U1/U3/L10 |
| @orchestra/session-ui → @orchestra/core | 16 / 0 / 0 / 0 | **violation**; 100% `util/{path 8, encode 5, task-tool 2, binary 1}` → U1/U4/L10 |
| @orchestra/tui → @orchestra/core | 15 / 0 / 2 / 0 | allowed by D3 (`flag/flag` 4, `installation/version` 4, `global` 3, `util/{which,flock,glob}`); `util/task-tool` 1 retargeted (U5) |
| @orchestra/core → @orchestra/relay | 31 / 0 / 18 / 0 | D1 (engine edge). 9 core files: `relay.ts`, `relay-hook-install.ts`, `relay-hook-shipper.ts`, `relay-workflow-{binding,currentstep,evaluator,transition}.ts`, `tool-safety-hooks.ts`, `tool-safety-profile.ts`; relay itself depends only on `@orchestra/schema` + `effect` |
| @orchestra/server → @orchestra/relay | 8 / 1 / 0 / 0 | D1; `handlers/relay-document.ts`, `handlers/relay-hook.ts`, `relay-documents.ts` |
| @orchestra/core → @orchestra/maestro-arsenal | 1 / 2 / 10 / 0 | D2 (ledgered). `tool/maestro-arsenal-omni.ts` (dynamic import + type), `tool/upstream-arsenal.ts` (type) |
| @orchestra/core → hugr-omni | 3 / 0 / 0 / 0 | legitimate native infrastructure (spawn gate already restricts to `src/omni.ts`) |
| @orchestra/core → @orchestra/sdk | 0 / 3 / 0 / 1 | allowed (contract, devDependency, type-only `v2/types`) |
| @orchestra/client → core / server / httpapi-codegen | test only (7 / 1 / 3) | dev-edge policy P-dev (allowed) |
| orchestra → @orchestra/tui | 35 / 3 / 10 / 4 | allowed (app → terminal; all via declared tui `exports` keys). `util/{error,locale,record}` (10 sites, 8 files) retargeted to util (U5) |
| apps/desktop → @orchestra/core | 6 / 0 / 18 / 0 | allowed (Electron main is a Node app; `omni`, `ripgrep/*`) |
| server → core | 83 / 5 / 0 / 0 | allowed |

### 2.2 Subpath surface (package-specifier imports across the whole tree)

| Package | Distinct subpaths imported | References | Current `exports` |
| --- | --- | --- | --- |
| @orchestra/core | 295 (2 unresolvable: `@orchestra/core` root and `/tools`, both from `apps/orchestra/specs/v2/api.ts`, a `// @ts-nocheck` aspirational file) | 5071 (1627 are core's own tests self-referencing) | 5 explicit + `"./*": "./src/*.ts"` |
| @orchestra/schema | 83 | 660 | `.` + `./*` |
| @orchestra/ui | 161 | 834 | 21 keys incl. 7 wildcards (TS + CSS/fonts/audio) |
| @orchestra/session-ui | 25 | 70 | 19 keys incl. 5 wildcards |
| @orchestra/protocol | 17 | 46 | `./*` only |
| @orchestra/relay | 17 (+ `.`) | 60 | `.` + `./*` |
| @orchestra/server | 15 | 37 | `./*` only |
| orchestra (apps/orchestra) | 0 package-specifier importers | 0 | `./*` (only `src/node.ts` is a documented facade, built by `script/build-node.ts`) |

Core has **125 top-level entries** in `src/`. Path-pinned core files (literal repo paths in workflows, nix, campaign scripts, tests, spawn allowlist; never moved in this phase): `omni.ts`, `omni-spawner.ts`, `process.ts`, `cross-spawn-spawner.ts`, `child-process-common.ts`, `shell.ts`, `pty.ts`, `pty/*`, `ripgrep/{binary,release,bundle}.ts`, `effect/{layer-node,memo-map,app-node-platform}.ts`, `tool/{maestro-arsenal,upstream-arsenal,bash}.ts`, `tool-safety-{sandbox,sandbox-runtime,appcontainer}.ts`, `session.ts`, `session/runner/{model,llm}.ts`, `session/execution/local.ts`, `location-services.ts`, `fs-util.ts`, `flag/flag.ts`, `event.ts`, `event/seal.ts`, `database/{migration,schema}.gen.ts`, `packaged-skills.ts`, `artifact-native-windows.ts`, `backend-toolkit/target.ts`, `agent/prompt/maestro.txt`, `v1/permission.ts`, `util/wildcard.ts`, `plugin/provider/opencode.ts`, plus every `*.sql.ts`/`sql.ts` (drizzle schema globs `./src/**/*.sql.ts`, `./src/**/sql.ts`).

### 2.3 `turbo boundaries` at baseline (no tags configured yet)

`Checked 4856 files in 29 packages, 974 issues found` — exactly:

| Class | Issues | Detail |
| --- | --- | --- |
| Bare Node builtin treated as undeclared package | 787 | core 371 (139 src / 232 test), orchestra 369 (148 / 221), tui 21, cli 13, server 6, script 3, sdk/js 2, client 1, ui 1 |
| Undeclared workspace/npm import | 15 | desktop → `@orchestra/plugin` ×5 (incl. `import type` and `tool` value in proof scripts), desktop → `@orchestra/sdk` ×1 (type), desktop → `@playwright/test` ×1 (type); storybook → `@solidjs/router` ×1, `@orchestra/sdk` ×1 (type), vendored upstream client `…/client/promise` ×1 (type); app-shell → `@pierre/diffs` ×1 (`src/custom-elements.d.ts`); core → `typescript` ×3 (tests); ui → `storybook` ×1 |
| Relative import leaving the package | 172 | 146 "resolves outside" (core 45, cli 35, desktop 24, script 15, orchestra 13, app-shell 10, session-ui 2, storybook 1, httpapi-codegen 1) + 26 test-fixture escapes (`packages/core/test/fixture/{process-tree,omni-expect,sdk-registry}`, `native/omni/campaign/*`, `packages/app-shell/src/utils/session`); includes `apps/desktop/scripts/linux-workspace-proof.ts → ../../orchestra/src/plugin/linux-workspace` |

**Reach measured:** `import type` of an undeclared package **is** reported; a subpath import is reported as its package (`@orchestra/sdk/v2/client` → `@orchestra/sdk`), so turbo has **no subpath visibility**; cross-package relative imports are reported; existence of a subpath is not checked (`@orchestra/core/tools` passes); only the 29 Bun workspaces are scanned (root `script/`, `.github/scripts/`, `nix/`, the Atlas npm workspace and `native/omni/campaign` are not). **Reach still to prove (L6 probe):** whether tag rules evaluate declared deps or imports, direct or transitive, whether devDependencies count, whether `allow` applies to npm packages, and `allow: []` semantics. The design below is correct under every outcome (allow lists are closed under transitivity; L6 has a named fallback).

## 3. Decisions register

Cards depend only on decided items. "Owner" = needs the owner's yes before the dependent card is dispatched; until then the default in "If no answer" applies.

### 3.1 Decisions

| ID | Decision | Recommendation and evidence | Owner | If no answer |
| --- | --- | --- | --- | --- |
| D1 | Is `core → @orchestra/relay` (and `server → relay`) a forbidden platform→product edge? | **Legitimate engine edge; tag relay `layer:engine`.** Relay depends only on `@orchestra/schema` + `effect` and never on core (acyclic). Core's integration is the Location-scoped Relay service wired into `location-services.ts`, `session.ts` and tool-path enforcement (`tool-safety-hooks.ts` publishes `relay.hook.decided` durably and writes ledger receipts). Inverting it is a redesign of Location services, not a minimal port. Containment instead: rule `core-relay-containment` (only core domains `relay` and `tool-safety` may import relay; 0 violations today). | **Yes** (plan text frames Relay hooks as a product port) | Tag relay `layer:engine`; containment rule active |
| D2 | Port `core → @orchestra/maestro-arsenal` now? | **No; ledger the 3 src sites (2 type-only + 1 dynamic import) and 10 test sites; resolve in the 70-C tool-registration cut.** Core hosts the `MaestroArsenal` tool (`tool/maestro-arsenal.ts`, 652 LOC) in its tool registry; removing the import requires registering the loader at every composition root (orchestra CLI, apps/cli V2 server, desktop sidecar, sdk-next) — a wiring change, not a move. Both files are path-pinned (`.github/scripts/archie-authoring-pair-initializer.ts:87`, `modules/maestro/arsenal/test/{process-runner,resource-authority}.test.ts`, `apps/orchestra/test/maestro/seat-scaffold.test.ts:92`). Arsenal is tagged `layer:product`, so the edge stays visible in the ledger. | **Yes** (owner named it as a tier-2 example) | Ledgered, no card |
| D3 | May `@orchestra/tui` depend on core? | **Yes (`layer:terminal` allows platform).** TUI runs inside the Bun CLI process; its 15 core imports are runtime flags/version/global paths/file locks. The browser-safe rule of plan §4 targets web/desktop renderer. Only `util/task-tool` moves (shared with app-shell/session-ui). | No | — |
| D4 | Generate `index.ts` barrels per core domain? | **No new barrels in 70–80.** Domain public API = the explicit `exports` keys, grouped per domain in `script/ownership.json`, with the domain entry file being the existing `src/<d>.ts` facade (repo convention `X.ts` + `X/`). Evidence: plan §4 forbids "barrel que ativa tudo"; 295 deep subpaths are used 5071 times, so a barrel adds no enforcement (the exports map does); heterogeneous folders (`effect/` mixes Node-only and portable layers, `util/`, `v1/`) would pull everything on import and risk TDZ cycles with the `X.ts`↔`X/` pairs. Conditional card set X1 exists if the owner wants barrels anyway. | **Yes** (deviates from the literal ask) | No barrels; X1 not dispatched |
| D5 | Which core files move physically? | **Only the Relay family (9 files → `src/relay/`, card M1).** It is cohesive, has zero external path readers, 30 package-specifier sites that stay valid through the exports map, and 54 relative sites the codemod rewrites. Families with pinned members (omni*, process/spawn, pty, ripgrep, effect, sql) do not move. | No | — |
| D6 | Move the tool-safety family? | **No in 70–80.** 3 of its 12 files are keys of `script/spawn-allowlist.json` (AGENTS.md: entries are only removed, never added without the lead); a split family is worse than a flat one. M2 exists only if the owner approves allowlist key renames. | No (Yes only to enable M2) | M2 not dispatched |
| D7 | Where does ownership live? | **New `script/ownership.json` + `check:ownership`.** `script/module-registry.json` has 15+ readers (nix `node_modules.nix`, `nix/scripts/*`, `script/test-ci*.ts`, `packages/script` tests) and a strict decoder; overloading it is a cross-campaign risk. Ownership validates against it bidirectionally. | No | — |
| D8 | README contract | **New READMEs use the 7-heading scaffold (section 5.4); existing READMEs are registered `legacy` (shrink-only list) and are not rewritten here** (owner previously rejected lossy condensation). | No | — |
| D9 | Close the `ui` / `session-ui` wildcards? | **Keep them.** Their `./*` wildcards map one flat `components/` directory of intentionally public components, plus CSS/fonts/audio/style wildcards consumed by CSS `@import` and Vite asset URLs (`packages/app-shell/src/index.css`, `settings-v2.css`). Closing gives ~0 boundary value and real breakage risk. Close: core, server, protocol, schema, relay; apps/orchestra reduced to `./node`. | **Yes** (owner named them) | Wildcards kept; documented in R05/R08 |
| D10 | Tag model | 14 `layer:*` tags, one per workspace, allow lists closed under transitivity (section 4.1); dev-edge policy P-dev: a declared edge is allowed when the dependency is only in `devDependencies` and every import of it from the dependent package is test-class. | No | — |
| D11 | Normalize bare builtins (`"path"` → `"node:path"`)? | **Yes (Tier 2, cards B1–B5).** 787 of 974 turbo issues are bare builtins; behavior-identical in Bun/Node; scope = packages turbo flags (core, orchestra, tui, cli, server, script, sdk/js, client). Excluded: `apps/desktop` (two tests `mock.module("fs")` — a rewrite could silently unhook the mock), `packages/ui/vite.config.ts`, app-shell, Atlas, nix, root `script/`. | No | — |
| D12 | `@orchestra/util` content | Exactly 9 modules, all import-free or importing only each other: from core `util/{path,encode,binary,retry,array,task-tool}.ts` (used only by app-shell/session-ui/tui/orchestra; core itself uses only `encode` via `tool/websearch.ts`), from tui `util/{error,locale,record}.ts`. Old paths keep one-line `export *` facades until 80–90. | No | — |
| D13 | Execution host for `bun install`, typecheck and Nix hash remeasure | Every code card needs a worktree with `node_modules` (`bun install --frozen-lockfile`) and runs `tsgo` on core/orchestra (multi-GB). Recommendation: run at most **4 typecheck-bearing cards concurrently**; README cards (no install) fill the remaining slots. L9/L10 change `bun.lock` and the workspace set, which changes the Nix FOD `nodeModules` hash in `nix/hashes.json` (4 systems): remeasure through the existing nix workflows on Linux x64/arm64 + Darwin in L10, once. | **Yes** (machine/CI resources on the owner's Mac) | Lead runs install/typecheck serially in one worktree; Nix hash update deferred to the milestone with the nix lanes marked expected-red |
| D14 | Declare the 15 undeclared imports? | **Yes, in L10, as devDependencies with existing catalog/workspace versions**, except the storybook import of the vendored upstream client (convergence item, stays ledgered). | No | — |
| D15 | `apps/orchestra` domain kinds and product-owned files in shared folders | As section 5.2: product = maestro, continuity, claude-code, acp, janitor, app-dock; composition = cli, effect, index.ts, node.ts, temporary.ts; everything else platform-legacy. File overrides: `src/tool/maestro-*.ts` (9) and `src/tool/atlas-*.ts` (2) → maestro; `src/tool/context-compact.ts`, `src/tool/context-recall.ts`, `src/tool/context-recall-archive.ts`, `src/session/prompt-continuity.ts` → continuity; `src/plugin/app-dock*.ts` (8) and `src/plugin/linux-workspace*.ts` (2) → app-dock. Allowed product→product edges: claude-code→maestro (24 today), claude-code→continuity (7), maestro→continuity (1). | No | — |
| D16 | App Dock | **Ownership only** (logical module across `apps/desktop/src/main`, `apps/orchestra/src/plugin`, `packages/app-shell/src/app-dock-linux.ts`); README = `apps/desktop/src/main/README.md`. No move: 72 desktop files referenced 59 times from `native.yml`, `apps/desktop/bunfig.toml`, `apps/desktop/package.json`, proof scripts, `packages/core/test/test-ci-desktop.test.ts` and 6 spawn-allowlist keys. `app-dock-rpc.ts` and `linux-workspace-rpc.ts` have different authorities and must not be unified. | No | — |
| D17 | Product domains of `apps/orchestra` | Stay in place; README declares the target (`modules/maestro`, `modules/continuity`, `modules/engine-adapters/claude-code`, `modules/acp`, `modules/janitor`); `control-plane` is platform-legacy with target core `control-plane` + server handlers. A module cannot be a separate package yet: it would import `apps/orchestra` internals (app ← module is forbidden). | No | — |
| D18 | Close the 70–80 milestone without the 70-C cuts | **Yes: 70–80 closes as "scaffolding + util + exports + boundaries"; 70-C/70-D relocation/70-G relocation become a separate design-led milestone (70-C') before 80–90.** They need contract freezes, port signatures and composition wiring (judgment), which this plan is forbidden to hand to Haiku. | **Yes** (changes the plan's 70–80 exit criteria) | Milestone closes as scaffolding; 70-C' listed open in the plan checkpoint |
| D19 | `packages/jimmy-specialist` location | Registered as asset module in place; the move to `modules/specialists/jimmy` is deferred (`turbo.json` `globalDependencies` hard-codes `packages/*-specialist/skills/**`; packaged-skills readers). | No | — |
| D20 | `apps/orchestra/specs/v2/api.ts` (broken `@orchestra/core` + `/tools` imports under `// @ts-nocheck`) | Ledger rows under `exports-only`; removal belongs to the 20-phase cleanup. E1 must report exactly these 2 unresolvable specifiers. | No | — |
| D21 | Ledger mechanics | One ledger file, rows keyed without line numbers (`<class>:<file>:<target>` + count). Cards never edit it; the lead runs `check:boundaries --prune` after each merge (shrink only). | No | — |
| D22 | Where the new gates run | `.github/workflows/test.yml`, `packages` part, right after "Run spawn-import gate" (same pattern as godfile/spawn gates). | No | — |

### 3.2 Tier 2-D register (deferred, design-gated; preconditions produced here)

| Item | Why not mechanical | Precondition delivered in 70–80 |
| --- | --- | --- |
| 70-C Session/Agent/Continuity/engines cut (SessionPrompt to `modules/session-engine`, Agent framework vs roster injection, continuity/engine ports) | Port signatures, tags/scope identity and composition wiring are design; V2 rules forbid duplicate coordinators | Ownership of every file; `orchestra-product-direction` ledger (baseline ≈37 rows / 96 statements); frozen core exports |
| 70-C toolkit acyclic cut (packs/recipes to `modules/backend-toolkit`) | `packs/index.ts` is imported by core's manifest; needs generator-provided defaults with hash/provenance | R19 README fixes engine vs pack ownership |
| Arsenal tool registration port (D2) | Registration at 4 composition roots | Ledger rows `tag:@orchestra/core->@orchestra/maestro-arsenal` + 3 src rows |
| Relocate `apps/orchestra/src/{maestro,continuity,claude-code,acp,janitor}` to `modules/*` | Needs 70-C | READMEs R11–R15 with targets |
| App Dock physical extraction to `modules/app-dock` | 59 path references, Electron IPC/preload, spawn allowlist | Logical module + README R17 |
| Server legacy routes `apps/orchestra/src/server` → `packages/server/src/compat/v1` | 80-A contract matrix | Ownership target recorded |
| `control-plane` merge into core | Move-session ownership semantics | R16 |
| Tool-safety folder grouping (M2) | Spawn-allowlist key renames (D6) | — |
| Remove compat facades (`core/src/util/{6}`, `tui/src/util/{3}`) and shrink core exports keys used only by tests | Consumer migration | Facades + exports inventory |

## 4. Dependency rules

### 4.1 Tags (one per workspace, in `<package>/turbo.json`)

| Tag | Packages | Allowed workspace dependencies (closed under transitivity) |
| --- | --- | --- |
| `layer:foundation` | `@orchestra/schema`, `@orchestra/util`, `@orchestra/effect-drizzle-sqlite`, `@orchestra/effect-sqlite-node` | foundation |
| `layer:native` | `hugr-omni` | (none) |
| `layer:asset` | `@orchestra/atlas-boundary`, `@orchestra/capability-assets` | (none) |
| `layer:contract` | `@orchestra/protocol`, `@orchestra/sdk`, `@orchestra/plugin` | foundation, contract |
| `layer:engine` | `@orchestra/llm`, `@orchestra/codemode`, `@orchestra/relay` (D1) | foundation, contract |
| `layer:tooling` | `@orchestra/script`, `@orchestra/http-recorder`, `@orchestra/httpapi-codegen` | foundation, tooling |
| `layer:platform` | `@orchestra/core` | foundation, native, asset, contract, engine |
| `layer:product` | `@orchestra/maestro-arsenal` | foundation, native, asset, contract, engine, platform |
| `layer:server` | `@orchestra/server` | foundation, native, asset, contract, engine, platform |
| `layer:client` | `@orchestra/client` | foundation, contract |
| `layer:composition` | `@orchestra/sdk-next` | foundation, native, asset, contract, engine, platform, server, client |
| `layer:ui` | `@orchestra/ui`, `@orchestra/session-ui`, `@orchestra/app` | foundation, contract, client, ui |
| `layer:terminal` | `@orchestra/tui` | foundation, native, asset, contract, engine, platform, client, ui |
| `layer:app` | `orchestra`, `@orchestra/cli`, `@orchestra/desktop`, `@orchestra/web`, `@orchestra/storybook` | every tag except app |

No allow list contains `layer:app`, so nothing may depend on an app. Per-package file content (exact): `{ "$schema": "https://v2-8-13.turborepo.dev/schema.json", "extends": ["//"], "tags": ["layer:<x>"] }` + trailing newline. Root `turbo.json` gets, before `"tasks"`:

```jsonc
  "boundaries": {
    "tags": {
      "layer:foundation": { "dependencies": { "allow": ["layer:foundation"] } },
      "layer:contract": { "dependencies": { "allow": ["layer:foundation", "layer:contract"] } },
      "layer:engine": { "dependencies": { "allow": ["layer:foundation", "layer:contract"] } },
      "layer:tooling": { "dependencies": { "allow": ["layer:foundation", "layer:tooling"] } },
      "layer:platform": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine"] } },
      "layer:product": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine", "layer:platform"] } },
      "layer:server": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine", "layer:platform"] } },
      "layer:client": { "dependencies": { "allow": ["layer:foundation", "layer:contract"] } },
      "layer:composition": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine", "layer:platform", "layer:server", "layer:client"] } },
      "layer:ui": { "dependencies": { "allow": ["layer:foundation", "layer:contract", "layer:client", "layer:ui"] } },
      "layer:terminal": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine", "layer:platform", "layer:client", "layer:ui"] } },
      "layer:app": { "dependencies": { "allow": ["layer:foundation", "layer:native", "layer:asset", "layer:contract", "layer:engine", "layer:tooling", "layer:platform", "layer:product", "layer:server", "layer:client", "layer:composition", "layer:ui", "layer:terminal"] } }
    }
  },
```

`layer:native` / `layer:asset` get `{ "dependencies": { "allow": [] } }` only if the L6 probe shows `allow: []` means "deny all"; otherwise they are omitted (they have no deps today).

### 4.2 Custom rules (`script/boundaries.json`, enforced by `check:boundaries` from the L1 inventory)

| Rule id | Statement | Baseline violations |
| --- | --- | --- |
| `ui-no-runtime` | Files of `@orchestra/ui`, `@orchestra/session-ui`, `@orchestra/app`, `@orchestra/web` (src and test) import none of `@orchestra/core`, `@orchestra/server`, `@orchestra/llm`, `@orchestra/relay`, `@orchestra/maestro-arsenal`, `@orchestra/tui`, `hugr-omni` | app-shell 126–127 sites / 114 files; session-ui 16 sites / 12 files → 0 after U3/U4 |
| `util-browser-safe` | `@orchestra/util` src imports no `node:*`, `bun`, `bun:*`, `@orchestra/*`, `hugr-omni` | 0 (new package) |
| `core-relay-containment` | In `@orchestra/core`, only files of domains `relay` and `tool-safety` import `@orchestra/relay` | 0 |
| `orchestra-product-direction` | In `apps/orchestra/src` (non-test), a `platform-legacy` domain never imports a `product` domain; product→product only along D15's allowed edges | ≈37 file rows / 96 statements (tool→maestro 48, session→maestro 15, session→continuity 7, server→claude-code 4, tool→continuity 4, agent→maestro 3, research→maestro 3, server→continuity 2, server→janitor 2, server→maestro 2, skill→maestro 2, plugin→app-dock 2, project→maestro 1, session→claude-code 1) |
| `exports-only` | Every specifier of a closed package (`@orchestra/core`, `server`, `protocol`, `schema`, `relay`, `orchestra`) equals one of its `exports` keys (or matches a kept wildcard) | 2 (`apps/orchestra/specs/v2/api.ts`, D20) |
| `tooling-dev-only` | `layer:tooling` packages are imported only from test-class files, except by `layer:app`/`layer:tooling` packages | measured by L6 (expected 0) |
| `tag` (turbo or fallback) | Declared workspace edges respect 4.1, P-dev excluded | app→core, session-ui→core (→ 0 after L10); core→maestro-arsenal (stays, D2) |

Test-class regex (shared by L1 and every rule): `(^|/)(test|tests|e2e|__tests__|fixture|fixtures|test-browser|script|scripts|\.storybook)/|\.(test|spec|stories)\.[cm]?[jt]sx?$|\.fixture\.[cm]?[jt]sx?$|\.hosted\.ts$`.

### 4.3 Initial ledger (`script/boundaries-ledger.json`, written once by L6 with `--write-baseline`)

| Class | Rows at baseline | Shrunk by |
| --- | --- | --- |
| `turbo:undeclared-builtin` | 787 occurrences | B1 (core src 139), B2 (core test 232), B3 (orchestra src 148), B4 (orchestra test 221), B5 (tui 21, cli 13, server 6, script 3, sdk 2, client 1); ui 1 stays |
| `turbo:undeclared` | 15 | L10 (14); 1 stays (storybook upstream-client mock, Tier 3) |
| `turbo:outside` | 172 | none in this phase (test-harness coupling; Tier 2-D/20-phase) |
| `rule:ui-no-runtime` | ≈127 + 16 | U3, U4 |
| `rule:orchestra-product-direction` | ≈96 statements | 70-C' |
| `rule:exports-only` | 2 | 20-phase cleanup |
| `tag` | 3 (+0 for relay under D1) | L10 (2); arsenal stays |

Exit of the phase: ledger total ≤ 172 + 1 + 1 + 96 + 2 + 1 ≈ **273 rows/occurrences** (from ≈1,218).

## 5. Ownership tables (content of `script/ownership.json`, written by L7)

### 5.1 Modules

`format: 1`. Each module: `id`, `path` (null for logical modules), `workspace` (package name or null), `tag`, `role`, `readme`, `readmeContract` (`legacy` | `scaffold-v1`), optional `target`.

| id | path | tag | readme (contract) |
| --- | --- | --- | --- |
| schema | packages/schema | foundation | packages/schema/README.md (legacy) |
| util | packages/util | foundation | packages/util/README.md (scaffold-v1, L9) |
| effect-drizzle-sqlite | packages/effect-drizzle-sqlite | foundation | legacy |
| effect-sqlite-node | packages/effect-sqlite-node | foundation | packages/effect-sqlite-node/README.md (scaffold-v1, R02) |
| hugr-omni | native/omni/bindings/node | native | legacy |
| atlas-boundary | modules/atlas/boundary | asset | modules/atlas/boundary/README.md (scaffold-v1, R01) |
| capability-assets | modules/capability-assets | asset | legacy |
| protocol | packages/protocol | contract | legacy |
| sdk | packages/sdk/js | contract | packages/sdk/js/README.md (scaffold-v1, R03) |
| plugin | packages/plugin | contract | legacy |
| llm | packages/llm | engine | legacy |
| codemode | packages/codemode | engine | legacy |
| relay | modules/relay | engine | legacy |
| script | packages/script | tooling | packages/script/README.md (scaffold-v1, R04) |
| http-recorder | tooling/http-recorder | tooling | legacy |
| httpapi-codegen | tooling/httpapi-codegen | tooling | legacy |
| core | packages/core | platform | legacy (domain section added by R23) |
| maestro-arsenal | modules/maestro/arsenal | product | legacy |
| server | packages/server | server | legacy |
| client | packages/client | client | legacy |
| sdk-next | packages/sdk-next | composition | legacy |
| ui | packages/ui | ui | packages/ui/README.md (scaffold-v1, R08) |
| session-ui | packages/session-ui | ui | packages/session-ui/README.md (scaffold-v1, R05) |
| app | packages/app-shell | ui | legacy |
| tui | packages/tui | terminal | packages/tui/README.md (scaffold-v1, R07) |
| orchestra | apps/orchestra | app | legacy (domain section added by R24) |
| cli | apps/cli | app | legacy |
| desktop | apps/desktop | app | legacy |
| web | apps/web | app | legacy |
| storybook | apps/storybook | app | apps/storybook/README.md (scaffold-v1, R06) |
| atlas | modules/atlas (npm workspace, own guards) | — | legacy |
| omni | native/omni (Cargo) | — | legacy |
| specialist-backend | modules/specialists/backend | — | legacy |
| specialist-archie | modules/specialists/archie | — | legacy |
| specialist-jimmy | packages/jimmy-specialist | — | packages/jimmy-specialist/README.md (scaffold-v1, R09); target modules/specialists/jimmy (D19) |
| maestro | logical: apps/orchestra domain `maestro` | — | apps/orchestra/src/maestro/README.md (R11); target modules/maestro |
| continuity | logical | — | apps/orchestra/src/continuity/README.md (R12); target modules/continuity |
| claude-code | logical | — | apps/orchestra/src/claude-code/README.md (R13); target modules/engine-adapters/claude-code |
| acp | logical | — | apps/orchestra/src/acp/README.md (R14); target modules/acp |
| janitor | logical | — | apps/orchestra/src/janitor/README.md (R15); target modules/janitor |
| app-dock | logical (3 packages) | — | apps/desktop/src/main/README.md (R17); target modules/app-dock |
| backend-toolkit | logical: core domain `backend-toolkit` | — | packages/core/src/backend-toolkit/README.md (R19); target modules/backend-toolkit (packs only) |

### 5.2 Domains

Pattern syntax: `dir/` (directory), exact file, or `dir/name*` (single-segment glob). Precedence: exact file > glob > directory (longest directory wins). Two patterns of equal precedence matching one file = error. Every tracked file under `<package>/src/` must match.

**packages/core (25 domains; `entry` = existing facade):**

| Domain | Kind | Patterns (relative to `packages/core/`) |
| --- | --- | --- |
| session | platform | `src/session/`, `src/session.ts` (entry) |
| agent | platform | `src/agent/`, `src/agent.ts` |
| system-context | platform | `src/system-context/` (entry `src/system-context/index.ts`) |
| tool | platform | `src/tool/`, `src/tool-output-store.ts` |
| tool-safety | platform | `src/tool-safety.ts`, `src/tool-safety-*` (glob), `src/sandbox-parents.ts`, `src/sandbox-project-config.ts` |
| relay | platform | `src/relay.ts`, `src/relay-*` (after M1: `src/relay/`) |
| config | platform | `src/config/`, `src/config.ts`, `src/behavior.ts`, `src/policy.ts`, `src/flag/` |
| permission | platform | `src/permission/`, `src/permission.ts`, `src/question.ts` |
| location | platform | `src/location.ts`, `src/location-services.ts`, `src/location-service-map.ts`, `src/location-mutation.ts` |
| project | platform | `src/project/`, `src/project.ts`, `src/filesystem/`, `src/filesystem.ts`, `src/fs-util.ts`, `src/file.ts`, `src/file-mutation.ts`, `src/git.ts`, `src/repository.ts`, `src/repository-cache.ts`, `src/snapshot.ts`, `src/patch.ts`, `src/pull-request.ts`, `src/workspace.ts` |
| database | platform | `src/database/`, `src/data-migration.sql.ts` |
| event | platform | `src/event/`, `src/event.ts`, `src/public-event-manifest.ts` |
| runtime | platform | `src/effect/`, `src/global.ts`, `src/id/`, `src/installation/`, `src/observability/`, `src/observability.ts`, `src/background-job.ts`, `src/state.ts`, `src/schema.ts`, `src/v2-schema.ts` |
| process | platform | `src/process.ts`, `src/child-process-common.ts`, `src/cross-spawn-command.ts`, `src/cross-spawn-spawner.ts`, `src/shell.ts`, `src/pty/`, `src/pty.ts`, `src/tcp-proxy.ts`, `src/omni.ts`, `src/omni-*` glob, `src/output-inspector.ts`, `src/artifact-native-windows.ts`, `src/artifact-native-windows.rs`, `src/ripgrep/`, `src/ripgrep.ts` |
| provider | platform | `src/provider.ts`, `src/model.ts`, `src/models-dev.ts`, `src/aisdk.ts`, `src/catalog.ts`, `src/github-copilot/`, `src/plugin/provider/`, `src/plugin/provider.ts`, `src/plugin/models-dev.ts`, `src/plugin/variant.ts` |
| plugin-host | platform | `src/plugin/`, `src/plugin.ts` |
| identity | platform | `src/account/`, `src/account.ts`, `src/credential/`, `src/credential.ts`, `src/oauth/`, `src/integration/`, `src/integration.ts`, `src/share/` |
| instruction | platform | `src/skill/`, `src/skill.ts`, `src/packaged-skills.ts`, `src/instruction-context.ts`, `src/command.ts`, `src/reference/`, `src/reference.ts` |
| research | platform | `src/research/` |
| backend-toolkit | platform (engine) / product (packs) | `src/backend-toolkit/`, `src/pinned-artifact.ts` |
| control-plane | platform | `src/control-plane/` |
| capability | platform | `src/capability/` |
| scheduled-task | platform | `src/scheduled-task/`, `src/scheduled-task.ts` |
| util | platform | `src/util/`, `src/image/`, `src/image.ts`, `src/npm.ts`, `src/npm-config.ts` |
| v1 | platform (compat) | `src/v1/` |

**apps/orchestra (D15):** one domain per top-level entry of `src/` with `kind` and `target`:

| Entries | Kind | Target |
| --- | --- | --- |
| `cli/`, `effect/`, `index.ts`, `node.ts`, `temporary.ts` | composition | apps/orchestra |
| `maestro/` + `tool/maestro-*` + `tool/atlas-*` | product | modules/maestro |
| `continuity/` + `tool/context-compact.ts`, `tool/context-recall.ts`, `tool/context-recall-archive.ts`, `session/prompt-continuity.ts` | product | modules/continuity |
| `claude-code/` | product | modules/engine-adapters/claude-code |
| `acp/` | product | modules/acp |
| `janitor/` | product | modules/janitor (bindings stay in apps) |
| `plugin/app-dock*`, `plugin/linux-workspace*` | product (module app-dock) | modules/app-dock |
| `session/`, `storage/`, `background/` | platform-legacy | core `v1` Session/storage/jobs + modules/session-engine (prompt orchestration) |
| `agent/` | platform-legacy | core agent + product roster injection (70-C') |
| `config/`, `permission/`, `question/`, `command/`, `skill/`, `env/` | platform-legacy | core config/permission/instruction |
| `account/`, `auth/` | platform-legacy | core identity |
| `project/`, `git/`, `worktree/`, `snapshot/` | platform-legacy | core project |
| `provider/`, `plugin/` | platform-legacy | core provider / plugin-host + llm |
| `tool/` | platform-legacy | core tool |
| `lsp/`, `mcp/`, `ide/`, `format/` | platform-legacy | core integration/{lsp,mcp,ide,format} |
| `control-plane/` | platform-legacy | core control-plane + server handlers |
| `bus/`, `sync/`, `event-manifest.ts`, `event-v2-bridge.ts` | platform-legacy | core event |
| `installation/`, `util/`, `id/`, `image/`, `patch/` | platform-legacy | core runtime/util + packages/util |
| `research/` | platform-legacy | core research |
| `server/` | platform-legacy | packages/server compat/v1 |
| `audio.d.ts`, `markdown.d.ts`, `sql.d.ts` | platform-legacy | package that owns each loader |

**apps/desktop:** `app-dock` (module app-dock): `src/main/app-dock*`, `src/main/ipc-app-dock*`, `src/main/linux-workspace*`; `desktop-main`: `src/main/`; `preload`: `src/preload/`; `renderer`: `src/renderer/`.

**packages/app-shell:** `app-dock` (module app-dock): `src/app-dock-linux.ts`; `shell`: `src/`.

### 5.3 Guard semantics (`check:ownership`)

Fails, each with a named error, on: empty discovery (fewer than 30 workspace modules or fewer than 1,000 domain-covered files); a `module-registry.json` workspace missing from `modules` or vice versa; a module `path`/`readme` that does not exist; an uncovered file; an ambiguous file; a pattern matching nothing (stale); a `scaffold-v1` README missing any of the 7 headings (a missing README is tolerated only for ids in `pendingReadmes`; a listed id whose README exists fails as `README_PENDING_STALE`); a backticked repo path in a `scaffold-v1` README (`` `apps/…` ``, `` `packages/…` ``, `` `modules/…` ``, `` `native/…` ``, `` `tooling/…` ``, `` `script/…` ``, `` `docs/…` ``; globs and `<placeholders>` skipped) that does not exist. `--print-domains <packagePath>` prints a deterministic markdown table (domain, kind, target, patterns) for R23/R24.

### 5.4 README scaffold-v1 (exact headings, in order)

```
# <Title>
## Purpose and ownership
## Public entry points and consumers
## Dependencies and boundaries
## Assets, schemas and generated files
## Persistence, identity and lifetime
## Commands
## Contracts and verification limits
```

## 6. Global rules for every card

1. Branch name ≤ 3 hyphenated words, no slash (given per card). Base = `internal-modularity` head at dispatch. Commit message given per card, conventional, ending with the attribution trailer the repo requires.
2. **Owned files only.** Post-flight: `git diff --name-only <base>...HEAD` must be a subset of the card's owned list (renames count both paths). Any other change = reject.
3. Never run `bun test` locally (blocked by `script/test-guard.ts`); tests only through `bun run test:ci …` from the repo root, only when the card lists it, normally run by the lead in batches.
4. Code cards: `bun install --frozen-lockfile` in the worktree before typecheck; `bun typecheck` only from the named package directories, never `tsc`.
5. Never edit: `script/boundaries-ledger.json` (lead prunes), `bun.lock`/`package.json` dependency fields (L9/L10 only), `.github/**`, `turbo.json`, `nix/**`, `modules/relay/**`, `modules/atlas/**`, `packages/client/src/generated*/**`, `script/spawn-allowlist.json`, `godfile-waivers.json`, `script/rename-ledger.ts`.
6. Text written into the repository (READMEs especially) must not contain the old upstream product name in any case (`packages/core/test/rename-guard.test.ts` fails on it) nor the backend specialist's default display name (`apps/orchestra/test/agent/specialist-name-guard.test.ts`; only `BACKEND_DEFAULT_LABEL` in `apps/orchestra/src/maestro/roster.ts` may hold it). Refer to seats by id (`backend`) and to the vendored upstream client as "the vendored upstream client tarball listed in `script/rename-ledger.ts`". Maestro's name is fixed and may be written.
7. Stop line: if any verification output differs from the expected value, stop, do not improvise a fix, report the exact output.
8. Return shape: branch, commit SHA, `git diff --stat` summary, each verification command with its exit code and the asserted value.

## 7. Lead preparatory cards (wave 0)

All new library code lives in `packages/script/src/*.ts` with tests in `packages/script/test/*.test.ts`; root CLIs in `script/*.ts` import the library by relative path (`../packages/script/src/<x>.ts`) so `packages/script/package.json` is not touched. CLIs spawn only via `Bun.spawnSync` (never `child_process`), normalize paths to POSIX, accept CRLF. Each file stays under 500 non-blank lines (`check:godfile`).

### L1 — Import inventory (AST)
- Files: `packages/script/src/import-inventory.ts`, `packages/script/test/import-inventory.test.ts`, `script/import-inventory.ts`.
- File set: `git ls-files -co --exclude-standard -z`; extensions `ts tsx mts cts js jsx mjs cjs css`. Excluded (named in the file header with reasons): `node_modules/`, `modules/atlas/` except `modules/atlas/boundary/`, `native/omni/crates/`, `specs/orchestra-visual/handoff/archives/`.
- Parse: `ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kindFor(ext))`; recursive walk records: `ImportDeclaration` (typeOnly = `importClause?.isTypeOnly`), `ExportDeclaration` with module specifier (typeOnly = `isTypeOnly`), `ImportEqualsDeclaration` with external reference, `import(lit)` (`dynamic`), `require(lit)`, `require.resolve(lit)` / `import.meta.resolve(lit)` / `Bun.resolveSync(lit, …)` / `Bun.resolve(lit, …)` (`resolve`), `mock.module(lit, …)` (`mock`), `ImportTypeNode` (`import-type`, typeOnly). String literal or no-substitution template only; anything else → `computed` list. CSS: the only regex, `/@import\s+(?:url\()?["']([^"']+)["']/g` (`css`).
- Record: `{ file, line, specifier, kind, typeOnly, fileClass: "src"|"test" (regex §4.2), ownerPackage, targetPackage, subpath }`; owner/target from `script/module-registry.json` (longest path prefix; package name match for bare specifiers).
- Anti-vacuity: `INVENTORY_EMPTY` if files < 1000 or `@orchestra/core` records < 3000 (thresholds overridable only in tests); `INVENTORY_PARSE` lists files with parse diagnostics under `apps|packages|modules|tooling`.
- CLI: `bun script/import-inventory.ts [--out f] [--importers-of <repoPath>…] [--target <pkg>] [--summary]`.
- Tests: fixture tree with one case per kind (incl. `import { type A }` → value, `import type` → type, computed dynamic), expected records exact; empty tree → `INVENTORY_EMPTY`.
- Baseline assertion at merge: `--summary` reports `@orchestra/core` distinct subpaths 295±3 and references 5071±50.

### L2 — Resolution snapshot
- Files: `packages/script/src/resolution-snapshot.ts`, test, `script/resolution-snapshot.ts`.
- `snapshot(inventory, packages, relativeDirs?)`: for each record (kinds except `css`, specifier without `?`) whose `targetPackage` ∈ packages, or whose specifier is relative and file under `relativeDirs`: key `file + "\t" + specifier`, value = repo-relative POSIX path of `Bun.resolveSync(specifier, dirname(abs(file)))` or `UNRESOLVED`.
- CLI: `bun script/resolution-snapshot.ts --out f --packages a,b [--relative dir]…`; `--compare base head [--expect-zero]` prints `{removed, added, changed}` counts + lists (exit 1 with `--expect-zero` if any).

### L3 — Export snapshot (TS checker)
- Files: `packages/script/src/export-snapshot.ts`, test, `script/export-snapshot.ts`.
- `snapshot(packageDir, keys)`: key → file via the package's `exports` (explicit) or `Bun.resolveSync(name + key.slice(1), packageDir)`; one `ts.createProgram(files, {...tsconfigOptions, noEmit: true, skipLibCheck: true})`; per file `checker.getExportsOfModule(checker.getSymbolAtLocation(sf))`; alias → `getAliasedSymbol`; category `value` | `type` | `value+type` | `{ namespace: sortedMemberNames }`. Output sorted JSON. `--compare a b` exits 1 on any difference. Always run with `--keys` (cost ≈ a typecheck of the reached files).

### L4 — Exports freeze
- Files: `packages/script/src/exports-freeze.ts`, test, `script/exports-freeze.ts`.
- Algorithm: S = subpaths of inventory records with `targetPackage === name` (kind ≠ `css`); `""` → `"."`. For each s (sorted): explicit key → keep its value; else longest-prefix wildcard key (Node pattern rules) → substituted value; target file must exist, otherwise push `{specifier, importers}` to `unresolvable` and skip. New `exports` = all original explicit keys (kept even if unused) ∪ derived keys ∪ wildcard keys listed via `--keep`; order: `"."`, `"./package.json"`, then lexicographic. Rewrite only the `exports` field (other fields keep order; 2-space JSON + `\n`).
- CLI: `bun script/exports-freeze.ts <packageDir> [--keep "<key>"]… [--write]`; prints `{ derived, keptExplicit, keptWildcards, unresolvable }`; dry run exits 1 when the file would change.

### L5 — Specifier rewrite and module move codemods
- Files: `packages/script/src/specifier-rewrite.ts`, `packages/script/src/module-move.ts`, tests, `script/rewrite-specifiers.ts`, `script/move-files.ts`.
- `rewrite-specifiers --map <json> | --node-builtins [--write] <paths…>`: uses L1 records under paths; replaces only the string-literal content range of matching specifiers (edits applied end→start). `--node-builtins`: `s.split("/")[0] ∈ builtinModules` and not `node:` → `node:` + s. Refuses (exit 2) if the owning package contains `mock.module("<bare builtin>")`. Prints `{ files, sites }`.
- `move-files --manifest <json> [--write]` (`{ package, moves: [{from, to}] }`): (1) refuse (exit 3) if a moved repo path, with or without extension, appears in any tracked file outside `specs/`, `docs/archives/` and the moved files, except as import specifiers the tool rewrites; `*.md` hits are listed and require `--allow-doc-pins` (the card then updates them); (2) refuse (exit 4) if the package still has a wildcard export that would serve the old subpath without an explicit key ("freeze exports first"); (3) rewrite every relative specifier that resolves (L2 logic) to a moved file, from any importer in the repo, and every relative specifier inside moved files, preserving extension style; (4) package specifiers untouched; `exports` values equal to `./<from>` become `./<to>`; (5) `git mv`. Prints `{ moved, relativeRewrites, exportsValuesUpdated, importersTouched }`.

### L6 — Boundaries gate, tags, ledger
- Files: `packages/script/src/boundaries.ts`, `packages/script/test/boundaries.test.ts` (+ `packages/script/test/fixture/turbo-boundaries-*.txt` captured outputs), `script/check-boundaries.ts`, `script/boundaries.json`, `script/boundaries-ledger.json`, root `turbo.json` (`boundaries` block §4.1), 30 per-package `turbo.json` (§4.1; includes `packages/util` after L9).
- Probe first (scratch worktree, never committed): add the tags and deliberate violations — (a) undeclared value import, (b) undeclared `import type` (expected: reported), (c) devDependency-only edge violating a tag, (d) transitive A→B→C where only A's rule forbids C, (e) npm dependency under an `allow` list, (f) `allow: []`, (g) subpath specifier. Record answers + turbo 2.10.2 in the `boundaries.ts` header ("Reach"). **Fallback:** if (e) reports npm deps or (c)/(d) cannot be expressed, drop `boundaries.tags` from `turbo.json` and evaluate §4.1 in `boundaries.ts` over declared workspace deps (direct, P-dev applied); turbo stays authoritative for `undeclared` and `outside`.
- Wrapper: turbo from `node_modules/.bin` (`Bun.which` with that dir first), args `boundaries --no-update-notifier --skip-infer`, env `NO_COLOR=1 FORCE_COLOR=0`, ANSI stripped. Parse blocks on `^\s*[x×] `: `cannot import package \`P\` because it is not a dependency` → `undeclared` (`undeclared-builtin` when P ∈ builtinModules); `resolves to path … outside of` / `leaves the package` → `outside`; tag messages (exact text from probe) → `tag`; else `BOUNDARIES_UNPARSED`. Summary `Checked N files in M packages, K issues found` required; parsed count must equal K; N ≥ 4000 and M = workspace count else `BOUNDARIES_VACUOUS`.
- Keys (no line numbers): `turbo:<class>:<file>:<package-or-specifier>`, `rule:<id>:<file>:<target>`, `tag:<pkg>-><dep>`; value = occurrence count. Observed > ledger or missing → **new**; observed < ledger → **stale**.
- Modes: default (exit 1 on new or stale); `--json` (`{new, stale, observed}`); `--prune` (decrement/remove only, never add; exit 1 if any new); `--write-baseline` (only when the ledger file does not exist).
- Teeth tests: new violation detected; count mismatch fails; unknown diagnostic fails; stale fails; prune never adds; `--write-baseline` refuses an existing ledger; each custom rule detects a planted violation and reports its removal as stale; P-dev allows devDep+test-only and rejects a runtime import.
- Bootstrap: `bun run script/check-boundaries.ts --write-baseline`, then default mode exits 0. Record the per-class totals of §4.3 in the PR body.

### L7 — Ownership registry and gate
- Files: `script/ownership.json` (§5.1/§5.2), `packages/script/src/ownership.ts`, `packages/script/test/ownership.test.ts`, `script/check-ownership.ts`.
- Semantics §5.3. To keep `ownership.json` single-writer, L7 registers every README created by an R-card as `scaffold-v1` and lists its module/domain id in a top-level `"pendingReadmes": [...]`; the gate accepts a missing scaffold-v1 README only for listed ids (error `README_PENDING` is informational, exit 0) and fails a listed id whose README already exists (stale). The lead removes the id when merging each R-card (merge-train duty, like ledger prune).
- Teeth tests: uncovered file, ambiguous file, stale pattern, missing heading, nonexistent backticked path, registry mismatch, empty discovery — each fails with its named error.

### L8 — Wiring
- Files: root `package.json` (scripts only: `"check:boundaries": "bun run script/check-boundaries.ts"`, `"check:ownership": "bun run script/check-ownership.ts"`), `.github/workflows/test.yml` (two steps after "Run spawn-import gate", `if: matrix.part == 'packages'`, `run: bun run check:boundaries` / `bun run check:ownership`), `script/README.md` (section "Module boundaries and ownership").
- Check: `.github/workflows/test-ci.yml` and `distribution-bundle.yml` unchanged (core test inputs hash them).

### L9 — `@orchestra/util` skeleton and dependency additions (Tier 2)
- Files: `packages/util/package.json`, `packages/util/tsconfig.json` (copy of `packages/schema/tsconfig.json`), `packages/util/README.md` (scaffold-v1), `script/module-registry.json` (add `{ "alias": "util", "kind": "bun", "scope": ".", "name": "@orchestra/util", "path": "packages/util" }` after the `ui` entry), dependency field `"@orchestra/util": "workspace:*"` added (alphabetical position) to `dependencies` of `packages/core`, `packages/app-shell`, `packages/session-ui`, `packages/tui`, `apps/orchestra`; `bun.lock` via `bun install`.
- `packages/util/package.json` (exact):
  ```json
  {
    "$schema": "https://json.schemastore.org/package.json",
    "name": "@orchestra/util",
    "private": true,
    "type": "module",
    "license": "MIT",
    "exports": {
      "./array": "./src/array.ts",
      "./binary": "./src/binary.ts",
      "./encode": "./src/encode.ts",
      "./error": "./src/error.ts",
      "./locale": "./src/locale.ts",
      "./path": "./src/path.ts",
      "./record": "./src/record.ts",
      "./retry": "./src/retry.ts",
      "./task-tool": "./src/task-tool.ts"
    },
    "scripts": { "typecheck": "tsgo --noEmit" },
    "devDependencies": {
      "@tsconfig/bun": "catalog:",
      "@types/bun": "catalog:",
      "@typescript/native-preview": "catalog:"
    }
  }
  ```
- README facts: browser-safe pure helpers; no workspace deps (rule `util-browser-safe`); consumers app-shell, session-ui, tui, orchestra, core facades; compat facades at `packages/core/src/util/{path,encode,binary,retry,array,task-tool}.ts` and `packages/tui/src/util/{error,locale,record}.ts`; `task-tool` contract: `task`, `Agent` and `Task` render identically and `metadata.claudeCodeDispatch.seat` takes precedence over `input.subagent_type` (PR #332); no persistence; commands `bun typecheck`.
- Order: L9 runs before L6 and L7 (they register util).

### L10 — Manifest cleanup, missing declarations, Nix hashes (Tier 2, wave 3)
- Depends: U3, U4 merged (no `@orchestra/core` import left in app-shell/session-ui: `git grep -c "@orchestra/core" -- packages/app-shell/src packages/app-shell/test-browser packages/app-shell/e2e packages/session-ui/src` = 0 outside `package.json`).
- Edits: remove `"@orchestra/core"` from `dependencies` of `packages/app-shell/package.json` and `packages/session-ui/package.json`; add devDependencies: `apps/desktop` `"@orchestra/plugin": "workspace:*"`, `"@orchestra/sdk": "workspace:*"`, `"@playwright/test": "catalog:"`; `packages/app-shell` `"@pierre/diffs": "catalog:"`; `packages/core` `"typescript": "catalog:"`; `packages/ui` `"storybook": "^10.2.13"`; `apps/storybook` `"@solidjs/router": "0.15.4"`, `"@orchestra/sdk": "workspace:*"`. `bun install`; `nix/hashes.json` `nodeModules` remeasured per D13; `check:boundaries --prune`.
- Expected after: `turbo:undeclared` rows = 1; `tag` rows = 1 (core→maestro-arsenal); typecheck app-shell, session-ui, desktop, storybook-free packages pass.

### Merge-train duty (lead, after every merged card)
`bun run check:boundaries --prune` → commit `chore: shrink boundaries ledger` if changed; remove merged R-card ids from `pendingReadmes`; `bun run check:ownership`; `bun run check:boundaries` exit 0.

## 8. Haiku cards

Common verification block **V-guards** (every card): `bun run check:ownership` (exit 0 unless the card says otherwise), `bun run check:spawn-imports` (exit 0), `bun run check:godfile` (exit 0), `bun run check:boundaries --json` → `new` is `[]` and `stale` equals exactly the card's expected stale set (empty unless stated).

### 8.1 Wave 1 — code cards (max 4 concurrent, D13)

#### B1 — node: prefix, core src
- Tier 2. Branch `node-prefix-core`. Depends: L1–L9. Commit `refactor(core): use node: specifiers for builtins in src`.
- Owned: files under `packages/core/src/` listed by `bun script/rewrite-specifiers.ts --node-builtins packages/core/src` (dry run; expected 142 sites in 78 files; the list is pasted into the card at dispatch).
- Transformation: `bun script/rewrite-specifiers.ts --node-builtins --write packages/core/src`.
- Invariants: only specifier strings change (`git diff -U0 | grep -E '^[-+][^-+]' | wc -l` = 2 × 142); no file outside the list.
- Verify: `git grep -nE "(from|import\(|require\()\s*['\"](assert|async_hooks|buffer|child_process|crypto|dns|events|fs|fs/promises|http|https|net|os|path|path/posix|perf_hooks|process|readline|stream|stream/promises|string_decoder|timers|timers/promises|tls|tty|url|util|v8|vm|worker_threads|zlib)['\"]" -- packages/core/src | wc -l` = 0; `cd packages/core && bun typecheck`; V-guards with expected stale = all `turbo:undeclared-builtin:packages/core/src/…` rows (139 occurrences).
- Done: all above. Rollback: revert the commit.

#### B2 — node: prefix, core test and script
- As B1 with paths `packages/core/test packages/core/script`; expected 274 sites / 104 files; stale = `turbo:undeclared-builtin` rows under `packages/core/test|script` (232). Branch `node-prefix-coretest`. Commit `test(core): use node: specifiers for builtins`.

#### B3 — node: prefix, orchestra src
- As B1 with `apps/orchestra/src`; expected 152 sites / 100 files; stale 148; typecheck `apps/orchestra`. Branch `node-prefix-orchestra`. Commit `refactor(orchestra): use node: specifiers for builtins in src`.

#### B4 — node: prefix, orchestra test/script/specs
- As B1 with `apps/orchestra/test apps/orchestra/script apps/orchestra/specs`; expected 255 / 129; stale 221; typecheck `apps/orchestra`. Branch `node-prefix-orchtest`. Commit `test(orchestra): use node: specifiers for builtins`.

#### B5 — node: prefix, tui/cli/server/script/sdk/client
- Paths `packages/tui apps/cli packages/server packages/script packages/sdk/js packages/client`; expected 46 sites / 33 files (tui 21/17, cli 13/8, server 6/4, script 3/2, sdk 2/1, client 1/1). Must not touch `packages/tui/src/util/{error,locale,record}.ts` (they have no builtin imports; assert). Typecheck tui, cli, server, script, sdk/js, client. Stale 46. Branch `node-prefix-rest`. Commit `refactor: use node: specifiers for builtins in tui, cli, server and tooling`.

#### U1 — Move six core helpers into util
- Tier 2. Branch `util-core-helpers`. Depends: L9. Commit `refactor(util): move browser-safe core helpers into @orchestra/util`.
- Owned: `packages/core/src/util/{path,encode,binary,retry,array,task-tool}.ts`, `packages/util/src/{path,encode,binary,retry,array,task-tool}.ts`.
- Transformation: for each name n: `git mv packages/core/src/util/n.ts packages/util/src/n.ts`; then create `packages/core/src/util/n.ts` with exactly `export * from "@orchestra/util/n"\n`.
- Invariants: moved bytes identical (`git diff -M100% --stat` shows 6 pure renames + 6 new 1-line files); export snapshot equal: `bun script/export-snapshot.ts packages/core --keys ./util/path,./util/encode,./util/binary,./util/retry,./util/array,./util/task-tool` before (on base) and after → `--compare` exit 0; resolution snapshot for `@orchestra/core` diff = 0 (`--expect-zero`).
- Verify: `cd packages/util && bun typecheck`; `cd packages/core && bun typecheck`; `cd packages/app-shell && bun typecheck`; `rg`-free grep: `git grep -c "" -- packages/util/src | wc -l` = 6 files; V-guards (stale empty).
- Rollback: revert.

#### U2 — Move three tui helpers into util
- Tier 2. Branch `util-tui-helpers`. Depends: L9. Commit `refactor(util): move tui error, locale and record helpers into @orchestra/util`.
- Owned: `packages/tui/src/util/{error,locale,record}.ts`, `packages/util/src/{error,locale,record}.ts`.
- Transformation: `git mv` each; recreate tui files as `export * from "@orchestra/util/<n>"\n`. (`error.ts` imports `./record`, which moves with it.)
- Invariants: export snapshot `bun script/export-snapshot.ts packages/tui --keys ./util/error,./util/locale,./util/record` equal (namespace `Locale` included); resolution diff for `@orchestra/tui` = 0.
- Verify: typecheck `packages/util`, `packages/tui`, `apps/orchestra`; V-guards.
- Test (lead batch CI-2): `bun run test:ci tui test/util/error.test.ts`.

#### E1 — Explicit exports: core
- Tier 1. Branch `exports-core`. Depends: L1–L4, L9. Commit `refactor(core): replace wildcard exports with the inventoried public subpaths`.
- Owned: `packages/core/package.json` (field `exports` only).
- Transformation: `bun script/exports-freeze.ts packages/core --write`.
- Invariants: tool output `unresolvable` = exactly `[{"specifier":"@orchestra/core","importers":["apps/orchestra/specs/v2/api.ts"]},{"specifier":"@orchestra/core/tools","importers":["apps/orchestra/specs/v2/api.ts"]}]`; `derived + keptExplicit` = 293±3 keys (exact number recorded in the PR); the 5 previous explicit keys keep their values; `"./*"` absent; resolution snapshot `--packages @orchestra/core` before/after `--expect-zero`.
- Verify: `cd packages/core && bun typecheck`; `cd apps/orchestra && bun typecheck`; V-guards.
- Rollback: restore the previous `exports` object.

#### E2 — Explicit exports: server
- As E1 for `packages/server`; expected 15 derived keys, `unresolvable` = `[]`; typecheck `packages/server`, `packages/sdk-next`, `apps/cli`; `cd packages/client && bun run check:generated` exit 0. Branch `exports-server`. Commit `refactor(server): replace wildcard exports with explicit subpaths`.

#### E3 — Explicit exports: protocol
- As E1 for `packages/protocol`; expected 17 keys; typecheck protocol, server, client; `cd packages/client && bun run check:generated` exit 0. Branch `exports-protocol`. Commit `refactor(protocol): replace wildcard exports with explicit subpaths`.

#### E4 — Explicit exports: schema
- As E1 for `packages/schema`; keep `"."`; expected 83 derived keys; typecheck schema, core, protocol, client, app-shell. Branch `exports-schema`. Commit `refactor(schema): replace wildcard exports with explicit subpaths`.

#### E5 — Explicit exports: relay
- As E1 for `modules/relay` (edits only `modules/relay/package.json` `exports`; no other relay file — relay review records bind hashes of other files); keep `"."`; expected 17 derived keys; typecheck relay, core, server. Branch `exports-relay`. Commit `refactor(relay): replace wildcard exports with explicit subpaths`.

#### E6 — orchestra app exports reduced to the node facade
- Tier 2. Branch `exports-orchestra`. Commit `refactor(orchestra): expose only the node facade`.
- Owned: `apps/orchestra/package.json` (`exports`).
- Transformation: `"exports": { "./node": "./src/node.ts" }`.
- Invariants: L1 `--target orchestra` reports 0 package-specifier importers before and after; `apps/orchestra/script/build-node.ts` still uses entrypoint `./src/node.ts` (unchanged).
- Verify: `cd apps/orchestra && bun typecheck`; V-guards.

### 8.2 Wave 1 — README cards (no install; up to 16 concurrent)

Each R-card: owned = exactly the README path; content = scaffold-v1 headings (§5.4) filled with the facts given; English; ≤ 120 lines; every backticked path must exist; rules §6.6. Verify: `bun run check:ownership` reports exactly one failure, `README_PENDING_STALE` for this card's id (its README now exists while still listed; the lead removes the id at merge), and nothing else; `grep -c "^## " <readme>` = 7. R23/R24 append to `legacy` READMEs instead: `bun run check:ownership` exit 0 and `git diff` shows only added lines. Commit `docs(<scope>): add <module> README`. Branch = `readme-<id>`.

| Card | README | Facts to write (per heading, in order) |
| --- | --- | --- |
| R01 | `modules/atlas/boundary/README.md` | Generated JS + `.d.ts` bundles that expose Atlas to Orchestra; owner role Atlas maintainer; does not own Atlas sources (`modules/atlas/packages/*`) / Entries `.`, `./materialize`, `./native-header` (all in `src/generated/`); consumer `apps/orchestra` (4 value + 8 type src imports, 17 test) / Tag `layer:asset`, no workspace deps / `src/generated/*` produced by `bun run generate` (`script/build.ts`) from Atlas; never hand-edit; `src/generated/native-header.js` and `native-memory.js` are spawn-allowlisted / No persistence (Atlas store is Atlas-owned) / `bun run generate`, `bun run check:generated`, `bun typecheck`, `bun run test:ci atlas-boundary <files>` / Byte checks via `check:generated`; Atlas `npm run typecheck` builds `dist` (no-emit is not a substitute) |
| R02 | `packages/effect-sqlite-node/README.md` | Effect SQLite client for Node runtimes, single module `src/index.ts` / No measured importers at baseline; `@orchestra/core` declares it as a dependency without importing it / Tag `layer:foundation`, depends on `effect` only / none / Database files and paths belong to core domain `database` / `bun typecheck` / Inventoried suspect; disposition belongs to 80-D, do not delete here |
| R03 | `packages/sdk/js/README.md` | Legacy JS SDK `@orchestra/sdk` (generated client + server helpers) / Exports `.`, `./client`, `./server`, `./v2`, `./v2/client`, `./v2/gen/client`, `./v2/server`, `./v2/types`; consumers app-shell (9 value / 93 type src), tui (26 type), plugin (14 type, 2 value), orchestra, session-ui, core (type-only, devDependency) / `layer:contract`, no workspace deps / `src/v2/gen/**` is generated: regenerate with `./packages/sdk/js/script/build.ts`, never hand-edit; `../openapi.json` input / none / `bun typecheck`, `bun run build` / `src/process.ts`, `src/server.ts`, `src/v2/server.ts` are spawn-allowlisted; generation convergence with `packages/client` is 80-B |
| R04 | `packages/script/README.md` | `@orchestra/script`: build, CI and repository tooling library / Exports `.`, `./module-resolver`, `./module-catalog`, `./workspace-paths`, `./omni`, `./tree-sitter-prebuilds`; library modules used by root CLIs by relative path: `import-inventory`, `resolution-snapshot`, `export-snapshot`, `exports-freeze`, `specifier-rewrite`, `module-move`, `boundaries`, `ownership`; consumers apps/cli (tests), apps/desktop (6 src, 10 test), apps/orchestra (tests), root `script/*.ts`, `nix/scripts/verify-distribution.ts` / `layer:tooling`; depends on `@orchestra/schema` / Reads `script/module-registry.json`, `script/toolchain-registry.json`, `script/ownership.json`, `script/boundaries.json`, `script/boundaries-ledger.json` / none / `bun typecheck`, `bun run test:ci script <files>`, `bun run check:boundaries`, `bun run check:ownership` / `src/tree-sitter-prebuilds.ts` is spawn-allowlisted; nix resolves `@orchestra/script/*` through `nix/scripts/workspace-paths.json` |
| R05 | `packages/session-ui/README.md` | Solid components that render Sessions (messages, parts, diffs, review) / Public surface: wildcard `./*` → `src/components/*.tsx` plus `./pierre/*`, `./context/*`, `./v2/*`, `./v2/*.css` and explicit keys (kept by D9); consumers app-shell (39 value, 9 type src), apps/storybook; CSS `@orchestra/session-ui/styles` imported by `packages/app-shell/src/index.css` / `layer:ui`: may use `@orchestra/ui`, `@orchestra/schema`, `@orchestra/sdk` types, `@orchestra/util`; must not import core/server (rule `ui-no-runtime`) / CSS and v2 styles under `src/` / UI state only, no persistence / `bun typecheck`, `bun run test:ci session-ui <files>` / Depends on the vendored upstream client tarball listed in `script/rename-ledger.ts` (convergence 80-B); keep `AGENTS.md` |
| R06 | `apps/storybook/README.md` | Storybook workbench for ui, session-ui and app components / Config and mocks in `.storybook/`; workflow `.github/workflows/storybook.yml` / `layer:app`; dev deps ui, session-ui / Mocks under `.storybook/mocks/app/` alias app-shell modules / none / `bun run storybook`, `bun run build` (no typecheck script) / One mock imports the vendored upstream client (undeclared, ledgered, 80-B) |
| R07 | `packages/tui/README.md` | Terminal UI (OpenTUI + Solid) used by the CLI / 34 explicit exports keys; consumers `apps/cli/src/tui.ts`, apps/orchestra (`cli/cmd/run/*`, `config/tui*.ts`, `plugin/tui/*`) / `layer:terminal`: may use core (`flag/flag`, `installation/version`, `global`, `util/{which,flock,glob}`), plugin, sdk, ui, util (D3) / `src/util/{error,locale,record}.ts` are compat facades of `@orchestra/util` / KV and persistence contexts (`./context/kv`, `./util/persistence`) write under core `Global` paths / `bun typecheck`, `bun run test:ci tui <files>` / `src/clipboard.ts`, `src/editor.ts` are spawn-allowlisted |
| R08 | `packages/ui/README.md` | Solid component library with themes, i18n, fonts, audio and Tailwind styles / 21 exports keys incl. wildcards for components, i18n, context, theme, fonts, audio, v2 (kept by D9); consumers app-shell (628 src imports), session-ui (136), storybook, tui, desktop / `layer:ui`, no workspace deps / Generators `bun run generate:tailwind` (`script/tailwind.ts`), `bun run generate:v2-oc2`; assets in `src/assets/` / none / `bun typecheck`, `bun run build`, `bun run test:ci ui <files>` / Keep `AGENTS.md` and `LICENSE` |
| R09 | `packages/jimmy-specialist/README.md` | Asset module for the `jimmy` specialist seat: skills `skills/jimmy-discovery`, `skills/jimmy-research` / Consumed by packaged-skills generation; `turbo.json` `globalDependencies` lists `packages/*-specialist/skills/**` / Not a workspace package / The root `.md` campaign files are classified by the 20-phase cleanup, not here; the README lives outside `skills/` because the scanner enforces exact skill contents / none / none / Target `modules/specialists/jimmy` deferred (D19) |
| R11 | `apps/orchestra/src/maestro/README.md` | Maestro coordination: seats and roster, governance, admission and approval records, proposal settlement, Arsenal bindings, Atlas memory, Task orchestration; product-owned files outside the folder `src/tool/maestro-*.ts` (9) and `src/tool/atlas-*.ts` (2); target `modules/maestro`, move blocked by 70-C' / Consumers: claude-code (allowed), and platform-legacy domains recorded in the ledger (`tool`, `session`, `research`, `agent`, `server`, `skill`, `project`) / May import platform, `@orchestra/maestro-arsenal`, `@orchestra/atlas-boundary`, continuity; never claude-code, acp, janitor (rule `orchestra-product-direction`) / Prompt `packages/core/src/agent/prompt/maestro.txt` is core-owned and path-pinned / No own tables; records go through core Session/event storage / `cd apps/orchestra && bun typecheck`, `bun run test:ci orchestra test/maestro/<file>` / AGENTS "Agent Names": seats by id; the backend default display name exists only as `BACKEND_DEFAULT_LABEL` in `apps/orchestra/src/maestro/roster.ts` |
| R12 | `apps/orchestra/src/continuity/README.md` | Session continuity: admission, archive and archive search, checkpoints, checklist and review seals, fork, masking, transcripts, triggers; prompts `prompt.txt`, `review-prompt.txt`; product-owned outside: `src/tool/context-compact.ts`, `src/tool/context-recall.ts`, `src/tool/context-recall-archive.ts`, `src/session/prompt-continuity.ts`; target `modules/continuity` / Consumers: session, tool, server (ledgered), claude-code and maestro (allowed) / May import platform; never maestro, claude-code, acp, janitor / `archive-format.ts` defines the on-disk archive format (compatibility contract) / Archive files are user data: paths and format must not change in reorganizations / typecheck orchestra; `bun run test:ci orchestra test/continuity/<file>` / Plan §2 data rules |
| R13 | `apps/orchestra/src/claude-code/README.md` | Claude Code engine adapter: `engine.ts`, `sdk.ts`, `executable.ts`, `host/*` (admission, gate, hooks, join, mcp, memory…), `mirror.ts`, `permissions.ts`, `tools.ts`, `transcript.ts`; target `modules/engine-adapters/claude-code` / Consumers: server (ledgered), session (ledgered) / May import platform, maestro, continuity / none / Durable mirror and transcript; the engine stays paused: `sdk.ts` guards before reading login or spawning / typecheck orchestra; `bun run test:ci orchestra test/claude-code/<file>` / `sdk.ts` is spawn-allowlisted; the engine query keeps the `claude_code` preset; activation is a separate owner-authorized campaign |
| R14 | `apps/orchestra/src/acp/README.md` | Agent Client Protocol adapter: `service.ts`, `session.ts`, `agent.ts`, `tool.ts`, `permission.ts`, `event.ts`, `usage.ts`, `profile.ts`, `content.ts`, `config-option.ts`, `directory.ts`, `error.ts`; entered from the CLI (`src/cli`); target `modules/acp` / Consumer: `src/cli` (composition) / May import platform and contracts; adds no Session orchestration of its own / none / Session state lives in core / typecheck orchestra; `bun run test:ci orchestra test/acp/<file>` / — |
| R15 | `apps/orchestra/src/janitor/README.md` | Background maintenance: `bootstrap.ts`, `scan.ts`, `scheduler.ts`, `thresholds.ts`, `report-state.ts`; target `modules/janitor`; desktop binding stays in `apps/desktop/src/main/janitor*` / Consumers: `src/server/server.ts`, `src/server/routes/instance/httpapi/handlers/global.ts` (ledgered) / May import platform / none / Background loops are process-local and must stop on shutdown / typecheck orchestra; `bun run test:ci orchestra src/janitor/<file>.test.ts` / — |
| R16 | `apps/orchestra/src/control-plane/README.md` | Workspace control plane: `adapters/` (worktree), `workspace.ts`, `workspace-adapter-runtime.ts`, `workspace-context.ts`, `types.ts`, `util.ts`, `dev/` (debug plugin, own README); kind platform-legacy; target core `src/control-plane/` (holds `move-session.ts`, `workspace.sql.ts`) + server handlers / Consumers: server, effect, plugin, project / platform-legacy: may not import product domains / none / Process-global move service; `workspace.sql.ts` table is core-owned (never move `*.sql.ts`) / typecheck orchestra; `bun run test:ci orchestra test/control-plane/<file>` / — |
| R17 | `apps/desktop/src/main/README.md` | Domain map of the Electron main process: **App Dock** (`app-dock*`, `ipc-app-dock*`, `linux-workspace*`; plus `apps/orchestra/src/plugin/app-dock*.ts`, `apps/orchestra/src/plugin/linux-workspace*.ts`, `packages/app-shell/src/app-dock-linux.ts`; target `modules/app-dock`), WSL (`wsl/`), Omni (`omni-*`), windows/titlebar/menu, updater, stores and draft store, background CLI, janitor binding / Entry `index.ts`; preload `../preload/`, renderer `../renderer/` / Main may import core (Node app); renderer uses `@orchestra/app` / Linux runtime resources in `apps/desktop/resources/linux*` / `drafts.sqlite`, profile/window stores, app IDs are user data / `cd apps/desktop && bun typecheck`; proofs in `apps/desktop/scripts/*-proof.ts` run outside Bun discovery / `app-dock-rpc.ts` and `linux-workspace-rpc.ts` have different authorities and envelopes — never unify; spawn-allowlisted files include `app-dock-runtime.ts`, `app-dock-runtime-docker.ts`, `linux-workspace-access.ts`, `linux-workspace-omni.ts`, `background-cli.ts`, `shell-env.ts`; `.github/workflows/native.yml` references App Dock paths |
| R18 | `packages/core/src/session/README.md` | V2 Session core: `session.ts` facade, `session/input.ts` (admission and retry identity), projector, `execution/` (process-global coordinator, `local.ts`), `runner/` (Location-scoped runner; `@orchestra/core/session/runner` export) / Consumers: server, apps/orchestra, apps/cli, sdk-next / Rules: summarize and link AGENTS.md "V2 Session Core" (durable admission before advisory wake, one `llm.stream` per provider turn, no `SessionPrompt.loop` bridge, steer vs queue) — do not copy it / none / `session_input` rows and events are durable user data / `cd packages/core && bun typecheck`; `bun run test:ci core test/session-create.test.ts …` / Path-pinned: `session.ts`, `session/runner/model.ts`, `session/runner/llm.ts`, `session/execution/local.ts` |
| R19 | `packages/core/src/backend-toolkit/README.md` | Engine (Core-owned): `index.ts` (`@orchestra/core/backend-toolkit`), `hosted.ts`, `launcher.ts`, `manifest.ts`, `target.ts`, `attempts.ts`, `acquisition.ts`, `diagnostics.ts`, `project-version.ts`, `runtimes/*`; packs (owned by the backend-toolkit module role, target `modules/backend-toolkit`): `packs/*.ts`, `packs/*.package-lock.json`, `entry-skills.gen.ts` / Consumers: `apps/orchestra/src/cli/cmd/toolkit.ts`, `apps/orchestra/src/maestro/atlas-memory.ts`, `apps/orchestra/src/tool/shell.ts`, `apps/orchestra/src/tool/shell/execution.ts` / Engine must not import product code; separating packs is the 70-C' toolkit cut / `entry-skills.gen.ts` is generated; package-lock assets are pinned inputs / Cache root `Root` defaults to `BACKEND_TOOLKIT_ROOT` or `Global.Path.cache/backend-toolkit` / `bun run test:ci core test/backend-toolkit-<x>.test.ts`; workflow `.github/workflows/toolkit-arm.yml` / `target.ts` is spawn-allowlisted and path-pinned |
| R20 | `packages/core/src/database/README.md` | SQLite persistence: `database.ts` (WAL), `path.ts`, `migration.ts`, generated `migration.gen.ts` and `schema.gen.ts` / Consumers: every core domain with tables, server / — / `packages/core/drizzle.config.ts` globs `./src/**/*.sql.ts` and `./src/**/sql.ts`: never move those files (`src/account/sql.ts`, `src/credential/sql.ts`, `src/share/sql.ts`, `src/control-plane/workspace.sql.ts`, `src/data-migration.sql.ts`); regenerate with `bun run migration` / `ORCHESTRA_DB`, XDG paths, migration identity and order are user-data contracts (plan §2) / `bun run test:ci core test/database-migration.test.ts test/database-sqlite.test.ts` / Generated files are path-pinned |
| R21 | `packages/core/src/plugin/README.md` | Two domains in one folder: **plugin-host** (`sdk-runtime.ts`, `sdk-registry.ts`, `sdk-admission.ts`, `sdk-limits.ts`, `sdk-package.ts`, `sdk-reconcile.ts`, `host.ts`, `internal.ts`, `promise.ts`, `agent.ts`, `command.ts`, `command/*.txt`, `layer-map.example.ts`) and **provider** (`provider/*.ts` (32), `provider.ts`, `models-dev.ts`, `variant.ts`; language models in `../github-copilot/`) / Consumers: core, apps/orchestra, plugin authors through `@orchestra/plugin` / `@orchestra/plugin` is the public contract / Command prompts `command/initialize.txt`, `command/review.txt` / none / `bun run test:ci core test/plugin/sdk-runtime.test.ts test/plugin/sdk-authority.test.ts` / One provider file name is protected by `script/rename-ledger.ts` |
| R23 | `packages/core/README.md` (append only) | Append section `## Domains` = verbatim output of `bun script/check-ownership.ts --print-domains packages/core`, and section `## Adding a public subpath` (5 lines: core `exports` is explicit; add the key in `package.json`; `bun run check:boundaries`; never reintroduce `"./*"`). Existing text unchanged (`git diff` shows only added lines). |
| R24 | `apps/orchestra/README.md` (append only) | Append `## Domain disposition` = verbatim output of `bun script/check-ownership.ts --print-domains apps/orchestra`, plus one paragraph: product domains stay until the 70-C' cut; `apps/orchestra` exports only `./node`. |

### 8.3 Wave 2

#### U3 — Retarget app-shell to util
- Tier 2. Branch `util-appshell`. Depends: U1. Commit `refactor(app): import browser-safe helpers from @orchestra/util`.
- Owned: the 114 files listed by `bun script/import-inventory.ts --target @orchestra/core` filtered to `packages/app-shell/**` (list pasted at dispatch).
- Transformation: map file `{ "@orchestra/core/util/path": "@orchestra/util/path", "@orchestra/core/util/encode": "@orchestra/util/encode", "@orchestra/core/util/binary": "@orchestra/util/binary", "@orchestra/core/util/retry": "@orchestra/util/retry", "@orchestra/core/util/array": "@orchestra/util/array", "@orchestra/core/util/task-tool": "@orchestra/util/task-tool" }`; `bun script/rewrite-specifiers.ts --map <file> --write packages/app-shell`.
- Invariants: sites rewritten = 127 (±1, must equal the dry-run count); `git grep -c "@orchestra/core" -- 'packages/app-shell/*' ':!packages/app-shell/package.json'` = 0; resolution compare: 127 keys removed, 127 added, every added value under `packages/util/src/`.
- Verify: `cd packages/app-shell && bun typecheck`; `cd packages/app-shell && bun run typecheck:e2e`; `cd apps/desktop && bun typecheck`; V-guards with stale = all `rule:ui-no-runtime:packages/app-shell/…` rows.
- Test (CI-3): `bun run test:ci app src/context/permission-auto-respond.test.ts src/context/server-session.test.ts`.

#### U4 — Retarget session-ui to util
- As U3 for `packages/session-ui` (16 sites / 12 files: `src/components/{file,line-comment,markdown-cache,markdown,message-file,message-part,message-part/edit,session-review,session-turn,tool-error-card}`, `src/v2/components/{comment-card-v2,session-review-file-preview-v2}`); typecheck session-ui, app-shell; stale = `rule:ui-no-runtime:packages/session-ui/…`. Test (CI-3): test files returned by `bun script/import-inventory.ts --importers-of <the 12 files>` restricted to `packages/session-ui/**/*.test.*` (list pasted at dispatch; may be empty). Branch `util-sessionui`. Commit `refactor(session-ui): import browser-safe helpers from @orchestra/util`.

#### U5 — Retarget tui and orchestra helper imports
- Tier 2. Branch `util-cli-helpers`. Depends: U1, U2, B3, B5. Commit `refactor(orchestra): import shared helpers from @orchestra/util`.
- Owned: `packages/tui/src/routes/session/index.tsx`, `apps/orchestra/src/continuity/alias.ts`, `apps/orchestra/src/tool/websearch.ts`, `apps/orchestra/src/cli/cmd/attach.ts`, `apps/orchestra/src/cli/cmd/tui.ts`, `apps/orchestra/src/config/tui-host-attention.ts`, `apps/orchestra/src/config/tui.ts`, `apps/orchestra/src/plugin/tui/runtime.ts`, `apps/orchestra/src/util/error.ts`, `apps/orchestra/src/util/locale.ts`, `apps/orchestra/src/util/record.ts`.
- Transformation: map = U3 map + `{ "@orchestra/tui/util/error": "@orchestra/util/error", "@orchestra/tui/util/locale": "@orchestra/util/locale", "@orchestra/tui/util/record": "@orchestra/util/record" }`; run on the owned files only.
- Invariants: 13 sites (tui 1; orchestra core-util 2; orchestra tui-util 10); `git grep -c "@orchestra/tui/util/" -- apps/orchestra` = 0; `git grep -c "@orchestra/core/util/\(path\|encode\|binary\|retry\|array\|task-tool\)" -- apps/orchestra packages/tui` = 0.
- Verify: typecheck tui, orchestra; V-guards.
- Test (CI-2, with U2): `bun run test:ci orchestra test/util/error.test.ts test/config/config.test.ts test/server/httpapi-error-middleware.test.ts`.

#### M1 — Group the Relay family under `packages/core/src/relay/`
- Tier 1. Branch `core-relay-folder`. Depends: E1, B1, B2. Commit `refactor(core): group the Relay integration under src/relay`.
- Owned: the 9 moved files (old and new paths), every importer file printed by the dry run (expected 24 files: 13 in `packages/core/src`, 11 in `packages/core/test`), `packages/core/package.json` (`exports` values only), `script/ownership.json` (core `relay` domain patterns only).
- Manifest: `{ "package": "packages/core", "moves": [ {"from":"src/relay.ts","to":"src/relay/relay.ts"}, {"from":"src/relay-hook-install.ts","to":"src/relay/relay-hook-install.ts"}, {"from":"src/relay-hook-recovery.ts","to":"src/relay/relay-hook-recovery.ts"}, {"from":"src/relay-hook-shipper.ts","to":"src/relay/relay-hook-shipper.ts"}, {"from":"src/relay-workflow-binding.ts","to":"src/relay/relay-workflow-binding.ts"}, {"from":"src/relay-workflow-currentstep.ts","to":"src/relay/relay-workflow-currentstep.ts"}, {"from":"src/relay-workflow-evaluator.ts","to":"src/relay/relay-workflow-evaluator.ts"}, {"from":"src/relay-workflow-session.ts","to":"src/relay/relay-workflow-session.ts"}, {"from":"src/relay-workflow-transition.ts","to":"src/relay/relay-workflow-transition.ts"} ] }`. Basenames unchanged; no `index.ts` (D4).
- Transformation: `bun script/move-files.ts --manifest <file> --write`; then in `script/ownership.json` replace the core `relay` patterns with `["src/relay/"]`.
- Invariants: tool reports `moved: 9`, `exportsValuesUpdated: 4` (`./relay`, `./relay-workflow-binding`, `./relay-hook-install`, `./relay-workflow-session`), relativeRewrites 54 + intra-moved-file rewrites (exact number recorded); no pin refusal; `git grep -l 'Omni.count("spawns")' -- packages/core/src/relay` = empty (omni-expect-guard surface unchanged); no importer under `nix/` (`bun script/import-inventory.ts --importers-of packages/core/src/relay.ts …` contains no `nix/` path); export snapshot `--keys ./relay,./relay-workflow-binding,./relay-hook-install,./relay-workflow-session` equal; resolution compare: package-specifier keys unchanged, 30 values changed to `packages/core/src/relay/…`; `git diff -M --stat` shows 9 renames.
- Verify: typecheck core, server, orchestra; V-guards.
- Test (CI-4): `bun run test:ci core test/relay.test.ts test/relay-hook-recovery.test.ts test/relay-hook-recovery-startup.test.ts test/relay-hook-session.test.ts test/relay-hook-shipper.test.ts test/relay-workflow-binding.test.ts test/relay-workflow-evaluator.test.ts test/tool-safety-relay.test.ts --os both`.
- Rollback: revert (renames revert cleanly).

### 8.4 Wave 3

#### R25 — Relay folder README
- `packages/core/src/relay/README.md` (scaffold-v1): Location-scoped Relay service and workflow binding over the `@orchestra/relay` engine (D1); entry `relay.ts` (`@orchestra/core/relay` key), hooks install/recovery/shipper, workflow binding/currentstep/evaluator/session/transition; consumers server handlers (`packages/server/src/handlers/relay-document.ts`, `relay-hook.ts`, `relay-documents.ts`), `apps/orchestra/src/maestro/*`, `apps/orchestra/src/session/prompt-host.ts`, `apps/orchestra/src/session/tools.ts`; only domains `relay` and `tool-safety` may import `@orchestra/relay` (rule `core-relay-containment`); config schema in `src/config/relay.ts`; hook decisions are durable `relay.hook.decided` events plus ledger receipts; tests listed in M1. Depends: M1. Branch `readme-core-relay`.

#### L10 (lead) — section 7.

### 8.5 Conditional cards (not dispatched by default)

- **X1 (only if the owner rejects D4):** lead adds `script/domain-index.ts` that writes `packages/core/src/<domain>/index.ts` for folder domains `database`, `research`, `capability`, `control-plane`, `github-copilot` containing one `export { Ns } from "./file"` per file that carries the self-export line `export * as Ns from "./file"` and is imported from outside the domain (L1); one Haiku card per domain runs it, adds the exports key `./<domain>` → `./src/<domain>/index.ts`, typechecks core. Folders whose public file is `src/<d>.ts` get no index.
- **M2 (only if the owner approves D6):** tool-safety family to `src/tool-safety/` with the same manifest pattern as M1, plus the spawn-allowlist key renames done by the lead in the same commit.

## 9. Execution DAG, waves, merge order, CI

```text
W0 (lead, ~1.5 days)
  L1 ──┬─> L2 ─┐
       ├─> L3 ─┤
       ├─> L4 ─┤
       └─> L5 ─┤
  L9 ──┬─> L6 ─┼─> L8 ── W0 checkpoint: check:boundaries + check:ownership green, CI-1
       └─> L7 ─┘
W1 (35 cards; ≤20 agents; ≤4 code cards at once)
  code:   B1 B2 B3 B4 B5 U1 U2 E1 E2 E3 E4 E5 E6
  readme: R01–R09 R11–R21 R23 R24
W2 (4 cards)
  U3 (after U1) · U4 (after U1) · U5 (after U1,U2,B3,B5) · M1 (after E1,B1,B2)
W3
  L10 (after U3,U4) · R25 (after M1)
W4 milestone
  epic CI on internal-modularity → fix-forward → epic PR to dev
```

- **Main wave parallelism:** W1 has 35 independent cards (file-disjoint by construction: B-cards own disjoint directories, U1/U2 own util files that contain no builtin imports, E-cards own one `package.json` each, R-cards own one README each). Running 20 at once = 16 README + 4 code.
- **Merge order:** W0 in the order shown. W1 any order; after each merge the lead runs the merge-train duty. W2: U1/U2 → U3/U4/U5; E1, B1, B2 → M1. W3: L10 last (it removes the app-shell/session-ui core dependency and remeasures Nix once).
- **Change-scoped CI (`bun run test:ci`, batched by the lead):** CI-1 after W0: `bun run test:ci script test/import-inventory.test.ts test/resolution-snapshot.test.ts test/export-snapshot.test.ts test/exports-freeze.test.ts test/specifier-rewrite.test.ts test/module-move.test.ts test/boundaries.test.ts test/ownership.test.ts`. CI-2 after U2+U5. CI-3 after U3+U4. CI-4 after M1 (`--os both`).
- **Epic CI:** once, at W4 (add/re-add label `epic` on the epic PR). It is the only proof for B-cards and E-cards beyond typecheck + resolution equality. Nix lanes (`nix-eval`, `nix-toolchain`) run with the L10 hashes (D13).
- **Local gates that must be green before the epic run:** `bun typecheck` in every package touched, `bun run check:godfile`, `bun run check:spawn-imports`, `bun run check:boundaries`, `bun run check:ownership`.

## 10. Repository traps

1. **Path-keyed ledgers.** `script/spawn-allowlist.json` (9 core keys, 12+ desktop keys) — moves refused by L5's pin check; renames need the lead (D6). `godfile-waivers.json` (74 keys: 65 app-shell, 3 client, 2 sdk, 4 orchestra) — U3 changes only import lines, line counts unchanged. `script/rename-ledger.ts` (regex paths, protects one provider file and app-shell/session-ui vendored client lines) — no card touches covered files' protected strings. `script/module-registry.json` — bidirectional check (#479): L9 must register util in the same commit as `packages/util/package.json`. `packages/core/test/omni-expect-guard.test.ts` has its own path-keyed ledger and resolves `@orchestra/core/*` as `packages/core/src/*.ts` (not via exports): any move of an omni-surface file would silently weaken it — M1 asserts no surface file moves. `nix/scripts/workspace-paths.json` maps `@orchestra/core/*` and `@orchestra/script/*` to `src/*.ts`: moved specifiers must not be reachable from `nix/scripts`.
2. **Literal paths in workflows and campaign code.** `.github/workflows/{omni-delivery-campaign,test,toolkit-arm,native}.yml`, `native/omni/campaign/*.ts`, `script/test-omni-control.ts`, `script/check-ripgrep-pins.ts`, `.github/scripts/archie-*.ts`, `apps/cli/test/fixture/*` name core files — the pinned list of §2.2 never moves.
3. **Hash-pinned inputs.** `nix/hashes.json` (`nodeModules` FOD per system) changes with every `bun.lock`/workspace change (L9, L10); `nix-toolchain` triggers automatically on unlabeled PRs touching `nix/**` (runs 38504045806/38504046107 had to be cancelled) — publish the hash update only in the epic PR. Relay review records bind hashes (`modules/relay/docs/reviews/*.json`): E5 edits only `modules/relay/package.json`. Atlas boundary bytes (`check:generated`), Lean tarball pins, core test inputs hashing `test-ci.yml`/`distribution-bundle.yml`/`setup-bun/action.yml` (L8 edits only `test.yml`).
4. **Generated files.** `packages/client/src/generated*` (regenerate with `bun run generate`, check with `bun run check:generated` — part of E2/E3 verification; `script/build.ts` emits a string import of `@orchestra/protocol/groups/event`, which L1 sees through the generated file); legacy SDK `packages/sdk/js/src/v2/gen` (`./packages/sdk/js/script/build.ts`); `packages/core/src/database/*.gen.ts`; `packages/core/src/backend-toolkit/entry-skills.gen.ts`; `modules/atlas/boundary/src/generated`.
5. **`exports` consumers differ.** Bun runtime and `bun build --compile` (CLI), `tsgo` (bundler resolution), Vite (web, desktop renderer), electron-vite main (bundles core: `externalizeDeps.exclude: ["@orchestra/core"]`), Storybook. Explicit keys without conditions resolve identically in all of them; E-cards prove Bun equality (resolution snapshot) and TS (typecheck); the epic CI proves Vite/Electron/compile.
6. **Core's 1627 self-referencing test imports** go through `exports`: they are part of the inventory, so E1 keeps their keys. Never hand-trim keys "only used by tests".
7. **Dead aspirational file.** `apps/orchestra/specs/v2/api.ts` is `// @ts-nocheck` and imports non-existent `@orchestra/core` / `@orchestra/core/tools`; typecheck does not catch it; E1's `unresolvable` must list exactly those two.
8. **Isolated linker + Windows hoisted.** Bun 1.3 `configVersion: 1` installs isolated on Linux/macOS; Windows CI uses `--linker hoisted`. Every consumer of `@orchestra/util` must declare it (L9); an undeclared import can pass on Windows and fail elsewhere.
9. **Mocks keyed by specifier.** `mock.module("fs")` in `apps/desktop/src/main/candidate-{profile,repair}.test.ts` — desktop excluded from B-cards; L5 refuses packages with bare-builtin mocks. No `mock.module` targets a retargeted util specifier (verified: none for `@orchestra/core/util/*` or `@orchestra/tui/util/*`).
10. **Name guards on prose.** `rename-guard.test.ts` (old upstream name anywhere) and `specialist-name-guard.test.ts` (backend default display name anywhere but `roster.ts`) scan READMEs too (§6.6).
11. **Turbo output is human-formatted** (miette). The wrapper fails closed on unknown blocks and on count mismatch; never accept a parsed count lower than turbo's summary.
12. **Windows CI.** New scripts normalize `\` to `/` in ledger keys and accept CRLF; `git mv` on case-insensitive filesystems is not used for case-only renames (none planned).
13. **Two packages named `orchestra`.** Root `package.json` and `apps/orchestra/package.json` share the name; turbo treats the root as `//`. Tag only `apps/orchestra`.
14. **Godfile rename detection** keeps a moved file's baseline only when git pairs the rename (≥50% similarity) — M1/U1/U2 moves are byte-identical or import-only changes.
15. **Local runtime.** Do not stop or restart the Orchestra desktop app or its local server while running cards.

## 11. Estimate

| Item | Value |
| --- | --- |
| Cards | 50 (10 lead: L1–L10; 40 Haiku: B1–B5, U1–U5, E1–E6, R01–R09, R11–R21, R23–R25, M1) + 2 conditional sets (X1, M2) |
| Waves | W0 (lead) + W1 (35) + W2 (4) + W3 (2) + W4 milestone |
| Wall clock with 20 agents | W0 ≈ 1.5 days (≈1,500 LOC of tooling + teeth tests + probe); W1 ≈ 4 h (README cards 30–45 min each; 13 code cards at 4 concurrent ≈ 4 batches × 40 min); W2 ≈ 2–3 h; W3 ≈ 2 h + Nix hash measurement; W4 ≈ 2 h CI + fix-forward. **Total ≈ 3 working days.** |
| CI runs | 4 change-scoped `test:ci` batches (CI-1..CI-4), 1–2 Nix hash workflow runs (D13), 1 epic CI (+1 rerun budget) |
| Ledger | ≈1,218 → ≈273 rows/occurrences; `ui-no-runtime` and app/session-ui `tag` rows reach 0; builtins 787 → 1 |

## 12. Product-convergence interactions (Tier 3, out of scope; for the 80–90 planner)

1. Legacy `@orchestra/sdk` and `@orchestra/client` are both `layer:contract`/`client`; consumer migration (80-B) will shrink sdk keys and the app-shell/tui type imports (93 + 26).
2. app-shell and session-ui depend on the vendored upstream client tarball (rename-ledger lines 102–109); the storybook mock imports it undeclared (1 ledger row).
3. `apps/orchestra/src/server` (legacy HTTP, OpenAPI transform in `httpapi/public.ts`) vs `packages/server` (80-A).
4. `packages/core/src/v1` compat domain and the `platform-legacy` half of `apps/orchestra` converge with core domains only after 70-C'.
5. `@orchestra/effect-sqlite-node` has no importers (core declares it): 80-D disposition.
6. Compat facades created here (`core/src/util/*` ×6, `tui/src/util/*` ×3) and core exports keys used only by tests are removal candidates once consumers migrate.
7. `apps/orchestra` keeps `@orchestra/core` as a devDependency while importing 1,006 runtime values — fix with the server/CLI convergence (80-A/80-B), not here.
8. 172 relative imports leaving their package (test harness reuse of `packages/core/test/fixture/*`, root `script/test-ci-request.ts`, desktop proof scripts importing `apps/orchestra/src/plugin/linux-workspace`) — a shared test-fixtures package would be a separate decision.

# Plan 80–90: monolith scaffolding and architecture

**Baseline.** `apps-audit` worktree, HEAD `0f628936f8` ("fix(apps): repair tests the apps move broke"). This is the #738 apps-move stack, 4 commits on top of `ca6d9b5625`, which is #681 merged into `dev`.
- Every count below was measured at that SHA with `git grep` / `git ls-files` and read-only Node one-liners. None of them is an estimate.
- Nothing was built, typechecked or tested.
- The `dev` ref in `orchestra-canonical` (`e0a0278cb5`) is behind #681. Card P0 re-measures on whatever SHA has actually landed.

**Framing (owner correction, 2026-10-18).** Phase 80–90 is scaffolding and architecture, not a product refactor. Every item below is in exactly one tier:
- **Tier 1, scaffolding** (mandatory, mechanical, no behavior change). Who owns what, explicit public entries, declared and enforced dependency rules with a ledger that only shrinks, and legacy code labelled behind a facade rather than deleted.
- **Tier 2, minimal code change.** Only where a tier-1 rule cannot be met any other way. Each one is listed explicitly.
- **Tier 3, product convergence.** Optional, separate campaign. It only appears in the decisions register and does not drive any card.

---

## 0. How the original 80–90 scope splits by tier

| # | Original item (restructure-plan 80-A…80-D, areas A–E of the brief) | Tier | Where |
|---|---|---|---|
| A1 | One owner per route group and per command, recorded | 1 | §3 tables, registry `status/successor`, generated README block |
| A2 | Explicit exports for `protocol`, `server`, `orchestra` (today `"./*"`) | 1 | W1-EXP-PROTOCOL/SERVER/ORCH |
| A3 | Label `removed-v1` (incl. `src/server`, `src/cli`) as legacy-live | 1 | P2 registry |
| A4 | Move the v1 server into `packages/server/src/compat/v1` | 3 | D14. Not possible before 70-G: it needs orchestra session/provider internals |
| A5 | One server: desktop default sidecar switches to v2 | 3 | D14 |
| A6 | One CLI: port 20 legacy-only commands; two packages ship a bin named `orchestra` | 3 | D14, D20 |
| B1 | Every non-test import of the legacy SDK / vendored client goes through a per-package `src/compat/` facade | 1 | W1-FAC-* |
| B2 | Freeze rule: no new legacy import outside `compat/` | 1 | P3 guard rule R3 |
| B3 | Per-consumer migration to `@orchestra/client` | 3 | D15 |
| B4 | Plugin public API off the legacy SDK types | 3 | D15 (breaks external plugins) |
| B5 | Remove the vendored client tarball | 3 | D15 |
| C1 | Registry status for `layout.tsx` (retired), ui/session-ui v1 and v2 | 1 | P2 registry |
| C2 | Replace the code wildcards in `ui` and `session-ui` exports with explicit keys | 1 | W1-EXP-UI/SESSIONUI |
| C3 | Delete the legacy layout and the `newLayoutDesigns` flag (37 files) | 3 | D16 |
| C4 | Consolidate ui v1 components into v2 | 3 | D17 |
| D1 | Registry labels for vendored, unused and duplicate code | 1 | P2 registry |
| D2 | `core → relay` (9 src files), `core → maestro-arsenal` (2), `server → relay` (3) | 2 | D6; default needs **no** code change |
| D3 | Reconcile the four Copilot implementations and two branded provider/model ID pairs | 3 | D18 |
| D4 | Remove `effect-sqlite-node` (dead dependency) | 3 | D18 (needs a lockfile change) |
| D5 | `removed-v1/src/id/id.ts` has its own monotonic counter (ordering hazard) | 3 | D18. A behavior fix, so its own PR |
| E1 | Rename-ledger K13 is red at the baseline; P11 scope needs to cover the new files | 1 | P1 |
| E2 | Rename-guard stale check has no teeth for kept paths | 1 | W1-REN-TEETH |
| E3 | Provider/model wire IDs, headers, User-Agent, `$schema` | 3 | D19 (keep) |
| E4 | Prose, comments, identifiers from the vendored client | 3 | D19 |
| T2-01 | `session-ui` imports `../../../schema/src/lean-metrics` | 2 | W1-T2-01 (one line) |
| new | Architecture registry, boundary guard, ledger, browser-safe allowlist, README contract block | 1 | P2–P4, W1b |

**Totals: 10 tier-1 items plus the new scaffolding infrastructure, 2 tier-2 items, 13 tier-3 items.**
- Out of scope here: 80-E (Atlas toolchain integration) keeps its own WP.
- The card set is tier-1, plus T2-01, plus one conditional tier-2 card (D6-B).

---

## 1. Measured facts (inputs to every decision)

### A. CLI and server
- `removed-v1/src/{server,cli}`: 169 files.
  - Legacy httpapi: 22 groups, 23 handlers, 9 middleware.
  - `server.ts:309-317` merges 7 route layers. One of them, `serverRoutes` (`:187-193`), is `HttpApiBuilder.layer(Api)` built from `@orchestra/server/api` + `@orchestra/server/handlers`.
  - **So the legacy server already mounts the whole `packages/server` `/api/*` surface.** At code level, `/api/*` is not duplicated.
- `packages/server`: 41 files.
  - 25 protocol groups (`packages/protocol/src/api.ts:44-69`), all under `/api/*` except `projectCopy`.
  - Exports `"./*"` only. No `compat`/`v1` directory.
- **Legacy-only route groups:** control, controlPlane, global, config, experimental, mcp, project, sync, tui, workspace, sessionProcess, instance (lsp/vcs/path/formatter).
- **Same domain at two paths with separate code:** `/session`↔`/api/session`, `/event`↔`/api/event`, `/pty`, `/permission`, `/question`, `/provider`, `/agent`, `/command`, `/skill`, `/find`+`/file`↔`/api/fs`, `/global/health`↔`/api/health`.
- **Commands.**
  - Legacy only (20): acp, mcp, attach, run, generate, console, auth, agent, upgrade, uninstall, web, models, stats, export, import, pr, session, plug, db, toolkit.
  - `apps/cli` only: api, migrate, service (start|restart|status|stop|password).
  - Both, with two implementations: `$0` (TUI), `serve` (legacy server vs `@orchestra/server/routes`), `debug` (15 legacy subcommands vs 2 in cli).
- **Consumers.**
  - Desktop default sidecar is **v1 = legacy**: `index.ts:85`, `virtual:orchestra-server` → `removed-v1/dist/node/node.js`.
  - Desktop v2 (`ORCHESTRA_SIDECAR_V2=1`) and WSL run the `apps/cli` binary, which runs `packages/server`.
  - `sdk-next` wraps `createEmbeddedRoutes()`. No code imports `sdk-next`.
- **Who imports the `orchestra` package by name: nobody.** Its `"./*"` export is unused. It is consumed by path instead (`virtual:orchestra-server`, `apps/desktop/src/main/env.d.ts`, tests).

### B. SDK generations
- **Legacy `@orchestra/sdk`:** 270 importer files, 278 statements.
  - By specifier: `v2` 148, `v2/client` 107, `v2/types` 19, root 4.
  - 16 files have a real runtime dependency, mostly `createOrchestraClient`.
- **Non-test source importers of the legacy SDK or vendored client**, measured with TEST_RE (Appendix A):

  | Package | Files |
  |---|---|
  | app-shell | 101 (context 26, pages 32, components 24, utils 9, orchestra 8, hooks 1, testing 1) |
  | session-ui | 14 |
  | tui | 26 |
  | removed-v1 (legacy) | 29 |
  | plugin | 13 |
  | core | 3 (types only) |
  | apps/cli | 1 |
- **Vendored client:** `packages/app-shell/vendor/opencode-ai-client-1.17.13-v2.tgz`, 58 importer files. It cannot be rebuilt from this tree.
- **`@orchestra/client`:** 2 importers outside its own package (app-shell `utils/session-management.ts`, `utils/session.ts`), plus `sdk-next`. Its types are endpoint-shaped (`SessionsGetOutput`…). No structural equivalence with the legacy types exists, and no test checks for one.
- **Plugin public API.** `packages/plugin/src/index.ts:1-13,57` and `src/tui.ts:1-18,613` type `PluginInput.client` and the hooks with legacy SDK types. That is the external plugin contract.
- No default or namespace import of any legacy specifier exists (0 hits). Every import is named.

### C. UI generations
- **Legacy layout.** `packages/app-shell/src/pages/layout.tsx` (2367 lines) vs `layout-new.tsx` (149). `app.tsx:64-65` is the only importer of each.
  - The selector is `settings.general.newLayoutDesigns`, read in 37 files.
  - `oldInterfaceSunset = new Date(2026, 8, 14)` (`settings.tsx:61`) is in the past, so `resolveNewLayoutDesigns` forces `true`. **The legacy layout cannot be reached by default today.**
  - Two e2e specs ask for legacy without pinning the clock: `legacy-new-session.spec.ts:25`, `session-timeline-checklists.spec.ts:19`.
- **`packages/ui/src/v2`:** 89 files, 87 external importers.
  - v1 components are still heavily used by the v2 shell: button 39, icon 54, icon-button 35, tooltip 26.
  - v2 and v1 coexist as one design system in transition. They are not dead and live.
  - 5 v2 modules are imported only by their stories: accordion-, avatar-, checkbox-v2, tab-state-indicator, wordmark-v2.
- **`packages/session-ui/src/v2`:** 31 files, 16 app-shell importers.

### D. Duplicates
- **GitHub Copilot exists four times:**
  - `core/src/github-copilot` (24 files, 4522 lines, vendored AI-SDK wire layer; its README says "temporary")
  - `llm/src/providers/github-copilot.ts` (69 lines, used only inside llm)
  - `removed-v1/src/plugin/github-copilot` (680 lines: auth, headers, model list)
  - `core/src/plugin/provider/github-copilot.ts` (52 lines)

  The Responses-API routing rule is written in all four places.
- **IDs and catalogs.** `llm/src/schema/ids.ts` defines a second, incompatible pair of branded `ModelID`/`ProviderID`. `removed-v1/src/provider/provider.ts:1050,1067` duplicates the Model/Info structs.
- **SQLite.** `packages/effect-sqlite-node` is declared by core (`package.json:98`), but **no code imports it**. `core/src/database/sqlite.node.ts` is an altered fork (210 lines differ).
- **Orchestra copies of core files.**
  - `removed-v1/src/util/iife.ts` is byte-identical to core's (blob `ca9ae6c1…`).
  - `removed-v1/src/id/id.ts` is a near-duplicate with its own counter.

### E. "opencode" references
- 366 files and 10,158 lines; 9,021 of those lines are in `specs/`. Ledger: `script/rename-ledger.ts` has 15 `keptPaths` and 61 `protectedStrings`; the gate is `packages/core/test/rename-guard.test.ts`.
- **The gate is red at the baseline.** K13 (`rename-ledger.ts:55`, `^(?:packages\/[^/]+|tooling\/http-recorder)\/test\/fixtures\/recordings\/`) was not given an `apps/` alternative by `9329366f0e`. Three recordings under `removed-v1/test/fixtures/recordings/session/` now leave residue (8 lines after protected strings). K13 itself matches 43 files, none of which contains the token.
- **Teeth gap.** The stale check for kept paths only requires the path to match a tracked file, not a file that contains the token (`rename-guard.test.ts:56-62`).
- **Kinds.** `@opencode-ai/*` 202 lines, URLs 128, `$schema` 86, headers 66, wire IDs 711, env vars 45, dot-dirs and XDG 395, legacy package paths 7,900, prose 48, fixtures 404, identifiers 34, other 139.
- **The P11 vendored-client pattern is path-scoped** to `^packages\/(?:app(?:-shell)?|session-ui)\/|^bun\.lock$` (`rename-ledger.ts:101-106`). New files outside that scope must not contain the token.

### Scaffolding facts that shape tier 1
- **Root `"./*"` code wildcards:** 8 packages. orchestra, core, protocol, schema, server and relay have the root one only. session-ui has 5 wildcard keys and ui has 9.
- **Distinct demanded subpaths** (string literals that resolve to a real file under the current map):

  | Package | Demanded | Self-references | Full current surface |
  |---|---|---|---|
  | core | 299 (287 new exact keys) | 237 | 442 |
  | schema | 82 | 0 | 89 |
  | protocol | 17 | 0 | 28 |
  | server | 15 | 4 | 38 |
  | relay | 17 | 5 | 30 |
  | session-ui | 17 | 0 | 69 |
  | ui | about 143 code keys | 0 | 351 |
  | orchestra | 0 | 0 | 559 |
- **Literals that are not specifiers.** Effect service-tag strings look like imports but are not: `"@orchestra/core/tools"`, `"@orchestra/relay/ArmStore"`, `"@orchestra/server/CatalogAvailability"`… There are 7 in core, 4 in server and 5 in relay.
- **Folder modules.**
  - core has 34 top-level folders and 91 loose files.
  - 18 folders have a sibling facade file (`session.ts` + `session/`, …), 2 already have an `index.ts` (backend-toolkit, system-context), and 247 of 442 files use the self-export namespace pattern.
  - Only 3 cohesive folders with external consumers have no facade: `capability`, `control-plane`, `research`.
- **Source-only import graph** (non-test files of registered packages). It breaks only a handful of the dependency rules from AGENTS.md and the plan:

  | Edge | Files | Note |
  |---|---|---|
  | core → relay | 9 runtime | `relay*.ts`, `tool-safety-{hooks,profile}.ts` |
  | core → maestro-arsenal | 1 runtime (dynamic import) + 2 type | |
  | server → relay | 3 runtime + 1 type | |
  | core → legacy SDK | 3 type | |
  | app-shell, session-ui → core | 66 + 12 | **only** `util/{path,encode,binary,retry,task-tool,array}`, all six with zero imports |
  | tui → core | 11 | flag, global, version, flock, glob, which, app-node-builder; tui runs in the backend process |
  | client → core/server | 0 in src | tests only |
- **Source deep-relative imports across package roots: 13.**
  - `apps/desktop/src/main/env.d.ts` → orchestra `dist` types (5 occurrences)
  - `desktop/main/omni-process.ts` → core `flag`
  - `desktop/main/windows.ts` → ui theme JSON
  - desktop renderer → app-shell src (4)
  - `core/src/plugin/sdk-package.ts` → `../../../plugin/package.json`
  - `session-ui/.../lean-tool-metrics.tsx` → schema src

  Plus `app-shell/src/utils/sound.ts` uses `import.meta.glob("../../../ui/src/assets/audio/*.aac")`.
- **Undeclared workspace imports:** desktop and storybook → legacy SDK, and storybook → vendored client. orchestra uses core at runtime (290 files) but declares it as a devDependency.
- **Existing registry.** `script/module-registry.json` (format 1: alias/kind/scope/name/path, 29 Bun packages) has at least 7 readers:
  - `packages/script/src/workspace-paths.ts`, `script/test-ci.ts`, `script/test-ci-location.ts`, `script/artifact-native-workspace.mjs`
  - `nix/node_modules.nix:85-89`, `nix/scripts/workspace-config.ts`, `nix/scripts/dependency_measurement.py:48`

  It is also a turbo `globalDependencies` entry (`turbo.json:6`). Its decoder accepts only `kind: "bun"`, `scope: "."`.
- **Missing README.md** (8 registered packages): atlas-boundary, effect-sqlite-node, sdk/js, script, session-ui, storybook, tui, ui.

---

## 2. Decisions register

"Owner?" = yes means the owner must confirm. The default listed is what the cards implement. A card that depends on a non-default choice is marked conditional.

| ID | Tier | Question | Decision / recommendation | Evidence | Owner? |
|---|---|---|---|---|---|
| D1 | – | Phase framing | Tiers 1/2/3 as above. Tier 3 is a separate campaign and drives no card. | Owner message 2026-10-18 | decided by owner |
| D2 | 1 | Where does the architecture metadata live? | Add a new file, **`script/module-architecture.json`**, keyed by alias. The guard cross-validates it both ways with `module-registry.json`. Leave `module-registry.json` untouched. | `module-registry.json` has 7+ readers (incl. Nix and a Python fingerprint) and a decoder that rejects non-Bun kinds. It is a turbo global dependency, so every edit invalidates every task cache. | no (lead) |
| D3 | 1 | Enforcement mechanism | Write a repo guard, **`script/check-module-boundaries.ts`**, that parses imports with the TypeScript AST, plus a shrink-only ledger **`script/boundary-ledger.json`**, modelled on `check-spawn-imports.ts`. Add no turbo `boundaries` tags. | turbo 2.10.2 boundaries has no central ledger. It would fail on the undeclared imports, which cannot be fixed without lockfile edits (D10). It also does not separate type-only edges or test files. | no |
| D4 | 1 | Explicit exports policy | **Remove every code wildcard.**<br>- `schema` and `protocol` use policy `full`: one key per non-test file the wildcard reaches today. They are contract packages.<br>- Every other package uses `demanded`: keys for each subpath that is imported somewhere in the repo (including self-references and non-TS files), plus the registry `entries`.<br>- **Asset wildcards stay** (`ui`: `./fonts/*`, `./audio/*`, `./v2/*.css`, `./v2/styles/*`; `session-ui`: `./v2/*.css`).<br>- Stories and tests are never exported. | Only the CLI is published (`release-cli.yml:279`). Packages are private or unpublished. 0 template-literal or dynamic `@orchestra/*` specifiers. | no (owner-visible) |
| D5 | 1 | "Folder-level modules with an index.ts public API" | **A folder module's entry is its existing sibling facade `<name>.ts`** (18 core folders). `index.ts` is created only for cohesive folders with external consumers and no facade: core `capability`, `control-plane`, `research` (3 files). Collection folders (`util`, `tool`, `effect`, `database`, `v1`, `installation`, `flag`, `id`, `oauth`, `share`, `github-copilot`) have one entry per file. Deep imports into cohesive modules from other packages go into the ledger and are not retargeted (D12). | 18 sibling facades already serve as entries. Moving them to `index.ts` means 18 file moves, rewriting relative imports inside them, and churning the path-keyed ledgers. A `util/index.ts` barrel would mix browser-safe and node-only helpers. | **yes**: the owner literally asked for `index.ts`. Alternative cost: 18 facade moves, one card each, plus the ledger updates. |
| D6 | 2 | Platform → product-module edges (core → relay ×9, core → maestro-arsenal ×2, server → relay ×3) | **A (default): register `relay` and `maestro-arsenal` as `platformLibrary` modules.** The guard proves they import only foundation/native/library code (relay → schema; arsenal → schema, hugr-omni), so no cycle is possible. No code change.<br>**B: ports.** Arsenal is about 60 LOC (conditional card T2-ARSENAL-PORT). Relay is **not minimal**: the call sites are in `core/src/session.ts`, `session/runner/llm.ts` and `location-services.ts` (V2 session core), so it belongs to 70-C. | relay `package.json` deps: schema, effect. arsenal: schema, hugr-omni, MCP SDK. The comment in `core/src/tool/maestro-arsenal-omni.ts:7-9` says arsenal cannot depend on core. Plan §3: "Não inventar um port para apagar uma seta legítima". | **yes** (the owner's example named these edges) |
| D7 | 1 | UI → core runtime | Use a **`browserSafe` allowlist** of 6 core subpaths (`util/path`, `util/encode`, `util/binary`, `util/retry`, `util/task-tool`, `util/array`). The guard requires each of these files to have no imports at all. Extracting `packages/util` (70-B) is optional and later. | Those six are the only core subpaths app-shell and session-ui import. Each file has 0 import lines and 0 `process.`/`Bun.` references. | no |
| D8 | 1 | Legacy behind a clear facade | Each canonical package that uses the legacy SDK or the vendored client in non-test source gets **`<pkg>/src/compat/<facade>.ts`**, a one-line re-export. Source imports are rewritten to it. Tests are exempt. `removed-v1` is itself legacy and is exempt (legacy → legacy). | Plan §3: "Compatibilidade fica em `compat/` dentro do dono". The specifiers are named imports only. 187 files. | no (owner-visible) |
| D9 | 1 | What is labelled legacy / vendored / unused | **Legacy:** `packages/sdk/js`; the vendored client tarball; `removed-v1` (**legacy-live**, the default desktop sidecar); `packages/core/src/v1`; `packages/app-shell/src/pages/layout.tsx`.<br>**Vendored:** `packages/core/src/github-copilot`.<br>**Unused:** `packages/effect-sqlite-node`.<br>**Duplicates noted:** `removed-v1/src/id/id.ts`, `removed-v1/src/util/{iife,lazy}.ts`.<br>ui v1 components are **current**, not legacy (see D17). | §1 A–D | no |
| D10 | 1 | Undeclared workspace imports | Put them in the ledger. **No manifest dependency edits** in 80–90. | Adding a workspace dependency requires `bun install`, which rewrites `bun.lock` (forbidden on this Mac). `bun.lock` and every manifest are also Nix fingerprint inputs. | no |
| D11 | 1 | CI wiring of the gate | Add one step, "Run module-boundary gate", to `.github/workflows/test.yml` after "Run spawn-import gate" (`matrix.part == 'packages'`). **Do not** add it to `distribution-bundle.yml`. | `packages/core/test/distribution-bundle-workflow.test.ts:209-212` pins that static job's exact step list. | no |
| D12 | 1 | File moves in 80–90 | **None.** Legacy stays where it is, labelled in the registry. No deep-import retargets either: they change module evaluation order. Retargets are optional W4, after the milestone. | Moves churn path-keyed ledgers (`rename-ledger.ts`, `godfile-waivers.json` with 74 waivers, `spawn-allowlist.json`, `archive-scopes.json`) and Nix filesets. | no (owner-visible; the monolith-map table targets `packages/server/src/compat/v1`, which is deferred to 70-G) |
| D13 | 1 | Rename guard at baseline | Fix K13 (add `apps/` to its path alternatives). Extend P11 `paths` to `^script/(module-architecture\|boundary-ledger)\.json$`. Name facades `vendored-client*`, never `opencode-*`. | §1 E | no |
| D14 | 3 | One CLI / one server | **Keep both, labelled.**<br>- Owner of `/api/*` (25 groups): `packages/server` (canonical; contract `@orchestra/protocol/api`).<br>- Owner of the v1 route groups and the 20 legacy commands: `removed-v1` (legacy-live).<br>- Converging means switching the desktop default sidecar to v2 and porting the commands. That is a product campaign. | §1 A. The legacy server already embeds the canonical handlers. | **yes** |
| D15 | 3 | One SDK generation, plugin API | **Keep, behind facades (D8).** Migrate per consumer later. The plugin API types are an external contract: changing them breaks third-party plugins. | §1 B | **yes** |
| D16 | 3 | Legacy layout | **Converge, in a separate PR:** delete `layout.tsx` and the `newLayoutDesigns` branches (37 files), and fix the 2 unpinned e2e specs. It has been unreachable since 2026-09-14. | §1 C. Plan §10: removing a feature path needs authorization. | **yes** |
| D17 | 3 | Freeze ui v1 components? | **No.** v1 is still the shell's base layer. Revisit after D16. | §1 C counts | **yes** |
| D18 | 3 | Copilot ×4, llm IDs, effect-sqlite-node, orchestra `id/id.ts` | Copilot and llm IDs: keep, labelled. `effect-sqlite-node`: remove in a lockfile campaign. `id/id.ts`: a separate behavior fix soon. Two counters break cross-copy ID ordering within the same millisecond. | §1 D | **yes** |
| D19 | 3 | "opencode" wire IDs, headers, User-Agent, `$schema`, prose | **Keep the contracts** (Zen provider id, OAuth client IDs, `x-opencode-project`, the "live probe" headers). Clean up prose and identifiers in a separate campaign. The memory note "no opencode anywhere" conflicts with the provider contracts, so the owner must pick the headers. | §1 E | **yes** |
| D20 | 3 | Two packages ship bin `orchestra` | Record it. Resolve it together with D14. | `removed-v1/package.json` and `apps/cli/package.json` (`bin.orchestra`) | **yes** |
| D21 | 1 | README per module | Each registered package gets a **generated "Module contract" block** in its README, rendered from the registry only. The guard checks it for drift. The 8 missing READMEs are created as title, summary and block. Prose sections are 90-C. | Plan §4 | no |
| D22 | 1 | `removed-v1/src/research` is missing from the monolith-map disposition table | Target owner: Core `research` (`packages/core/src/research`), WP 70-G. | Map §3 table | no |
| D23 | – | Baseline | Cards start only after #738 (and #755) land. P0 re-measures. | §header | lead |
| D24 | – | Parallelism | Up to 20 Haiku agents, for mechanical cards only. Typechecks are serialized at integration. | Plan §7 says "até seis executores simultâneos em mudanças complexas". These cards are not complex. | **yes** (confirm the deviation) |

**Owner decisions: 10** (D5, D6, D14, D15, D16, D17, D18, D19, D20, D24). None blocks wave 1. Every card implements the default.

---

## 3. Target scaffold (what the lead builds in prep)

### 3.1 `script/module-architecture.json` (new; D2)

```jsonc
{
  "format": 1,
  "layers": {
    "foundation": [], "native": [],
    "contract": ["foundation"],
    "client": ["foundation", "contract"],
    "extension-api": ["foundation", "contract", "client"],
    "library": ["foundation", "native"],
    "tooling": ["foundation", "library", "tooling"],
    "module": ["foundation", "native", "library"],
    "platform": ["foundation", "native", "library", "contract", "extension-api", "module:platformLibrary"],
    "composition": ["foundation", "native", "library", "contract", "client", "extension-api", "module", "platform", "composition"],
    "ui": ["foundation", "contract", "client", "ui", "platform:browserSafe"],
    "terminal-ui": ["foundation", "contract", "client", "extension-api", "library", "platform", "ui"],
    "app": ["foundation", "native", "contract", "client", "extension-api", "library", "tooling", "module", "platform", "composition", "ui", "terminal-ui"]
  },
  "packages": { "<alias>": { /* see table */ } },
  "legacy": [ { "path": "...", "status": "legacy|vendored|unused|duplicate", "successor": "...", "reason": "...", "decision": "D9" } ]
}
```

Per-package fields: `layer`, `status` (`canonical` | `legacy` | `unused`), `owner` (a role, never a display name), `summary` (one sentence, used in the README), `exportsPolicy` (`full` | `demanded` | `none`), `entries` (subpaths that must stay exported), `assetWildcards`, `browserSafe`, `platformLibrary`, `modules` (internal folder modules: `path`, `kind` cohesive|collection, `entry`, `status`, `target`).

| alias | layer | status | exportsPolicy | extras |
|---|---|---|---|---|
| schema | foundation | canonical | full | |
| protocol | contract | canonical | full | |
| client | client | canonical | none (already explicit) | |
| sdk/js | client | **legacy** (successor `packages/client`) | none (already explicit) | |
| plugin | extension-api | canonical | none (already explicit; **never edit**, see Risk 1) | |
| omni/bindings/node | native | canonical | none | |
| llm, codemode, effect-drizzle-sqlite | library | canonical | none (already explicit) | |
| effect-sqlite-node | library | **unused** | none | |
| script, http-recorder, httpapi-codegen | tooling | canonical | none | |
| relay | module | canonical | demanded | `platformLibrary: true` (D6-A) |
| maestro-arsenal | module | canonical | none (already explicit) | `platformLibrary: true` (D6-A) |
| capability-assets, atlas-boundary | module | canonical | none | |
| core | platform | canonical | demanded | `entries: ["research","capability","control-plane"]`, `browserSafe` (D7), `modules` (§3.4) |
| server, sdk-next | composition | canonical | demanded / none | |
| ui | ui | canonical | demanded | `assetWildcards: ["./fonts/*","./audio/*","./v2/*.css","./v2/styles/*"]` |
| session-ui | ui | canonical | demanded | `assetWildcards: ["./v2/*.css"]` |
| app (app-shell) | ui | canonical | none (already explicit) | `modules: [{path:"src/pages/layout.tsx", status:"legacy", successor:"src/pages/layout-new.tsx"}]` |
| tui | terminal-ui | canonical | none | |
| orchestra | app | **legacy** (live: default desktop sidecar v1; successor `apps/cli` + `packages/server`) | demanded | `entries: ["node"]`, `modules` (§3.5) |
| cli, desktop, web, storybook | app | canonical | none | |

The registry text must not contain the token "opencode". P1 extends P11 to cover this file anyway.

### 3.2 Guard rules (`script/check-module-boundaries.ts`, D3)

**Scope.**
- Scanned: tracked plus untracked-not-ignored files (`git ls-files -co --exclude-standard -z`) with extensions ts/tsx/mts/cts/js/jsx/mjs/cjs, under a registered package path.
- Excluded: `node_modules/`, `dist/`, and `modules/atlas/**` except `modules/atlas/boundary`.
- Anti-vacuity: fail if fewer than 4,000 files are scanned (4,865 at baseline) or fewer than 2,000 cross-package edges are found.

**Parsing.**
- `typescript.createSourceFile` (root dependency `typescript` 5.8.2). Never regex.
- Specifiers come from:
  - `ImportDeclaration`, `ExportDeclaration` (with specifier), `ImportEqualsDeclaration`
  - `import()`, `require()`, `ImportTypeNode`
  - `import.meta.glob(<string|string[]>)`
- `typeOnly` is true for `import type`, all-`type` named lists, `export type`, and `ImportTypeNode`.

**Test predicate.** `isTestFile` is exported so the codemod uses the same one:

```
/(^|\/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)\/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$/
```

| Rule | Fails when | Applies to |
|---|---|---|
| R0 registry | alias sets differ between the two registries; a registry `path`, `entry`, `legacy.path` or `browserSafe` target does not exist; unknown layer | – |
| R1 layer | the edge's target layer is not in `layers[from.layer]`. `module:platformLibrary` only matches modules with that flag. `platform:browserSafe` only matches the listed subpaths. Type-only edges count too. | non-test |
| R2 browser-safe | a `browserSafe` file contains any import or export-from | – |
| R3 legacy freeze | importer module status ≠ legacy, target is a legacy package/path or the vendored client, and the importer is not under `<pkg>/src/compat/` | non-test |
| R4 declared | a package specifier's package name is missing from the importer's dependencies, devDependencies, peerDependencies or optionalDependencies (workspace and vendored names only) | all |
| R5 deep-relative | a relative specifier (including glob strings) resolves outside the importer's package root | all |
| R6a exports wildcard | an `exports` key containing `*` is not listed in `assetWildcards` | package.json files |
| R6b exports resolvability | a package specifier `<name>/<sub>` of a registered package does not resolve under its `exports` (Node algorithm, shared with the generator) | all |
| R7 deep module import | the importer is in another package and the target file is inside a cohesive internal module, but is neither its `entry` nor a nested registered entry | non-test |
| R8 README block | `README.md` lacks a `<!-- module-contract:start … -->…<!-- module-contract:end -->` block equal to `render(entry)` | README files |
| R9 unused | a package with status `unused` has any importer | all |

**Ledger** (`script/boundary-ledger.json`): `{ "entries": [ { "rule": "R3", "file": "<path>", "specifier": "<spec>", "reason": "<text>" } ] }`, keyed by `rule|file|specifier`.

**Modes.**

| Mode | Behavior | Who uses it |
|---|---|---|
| default (strict) | fails on new violations **and** on stale entries | CI |
| `--no-stale` | fails only on new violations | cards |
| `--prune` | removes stale entries, never adds; lead only | lead |
| `--seed` | writes the ledger only if it does not already exist; lead only, once | lead |

Every entry needs a non-empty `reason`. Output: one line per violation, `RULE file specifier`, plus a summary count per rule.

**Expected seed** (sanity range at baseline, ± dev drift):

| Rule | Entries |
|---|---|
| R1 | 3 (core → legacy SDK types; 0 for relay/arsenal under D6-A) |
| R3 | about 159 (app-shell 101, session-ui 14, tui 26, plugin 13, core 3, cli 1, `app.tsx` → `layout.tsx` 1) |
| R4 | 3–6 |
| R5 | 14 source plus about 75 test |
| R6a | 8 packages / 20 keys |
| R6b | 0 |
| R7 | about 171 core plus 42 relay pairs |
| R8 | 29 |
| R9 | 0 |

### 3.3 Explicit-exports generator (`script/explicit-exports.ts`, D4)

`bun run script/explicit-exports.ts <alias> [--write|--check]`. It imports `resolveExport` and `isTestFile` from the guard module.

1. Read the registry entry and `<path>/package.json`. Assert `JSON.stringify(pkg,null,2)+"\n" === raw` (all 10 affected manifests are canonical at baseline). Otherwise exit with `EXPORTS_MANIFEST_NOT_CANONICAL`.
2. Old map `O`.
   - `E` = keys without `*`, in their original order.
   - `A` = wildcard keys listed in `assetWildcards`, in original order.
   - `C` = the other wildcard keys.
3. Demanded `D`: every full quoted literal `(["'\`])<name>/([^"'\`$\s]+)\1` found by `git grep -hoE` over tracked files, excluding `*.md`, `specs/`, `docs/` and `bun.lock`. Add `entries`.
4. For `s ∈ D`, `t = resolveExport(O, s)` (exact key, otherwise the pattern with the longest prefix before `*`, then the longest key; `*` matches across `/`). Keep `s` only if `t` is a tracked file **and** it resolved through a key in `C`. This filter drops the service-tag strings.
5. `policy = full`: also enumerate every tracked file `f` under each `C` target that is not a test, story or spec. Invert the pattern to get `s_f`, and keep it if `resolveExport(O, s_f) === "./" + f`.
6. `N = E ∪ A ∪ sorted({"./"+s: t})`. Add no other key.
7. **Invariant:** for every kept `s` (and every `s_f`), `resolveExport(N, s) === resolveExport(O, s)`. Otherwise exit `EXPORTS_RESOLUTION_CHANGED:<s>`.
8. `--write`: set `pkg.exports = N` and write it canonically. `--check`: exit 1 if `N` differs from the file.

### 3.4 Core internal modules (registry `packages.core.modules`)

- **Cohesive, entry = sibling facade:**

  | Folder | Entry |
  |---|---|
  | account | `src/account.ts` |
  | agent | `src/agent.ts` |
  | config | `src/config.ts` |
  | credential | `src/credential.ts` |
  | event | `src/event.ts` |
  | filesystem | `src/filesystem.ts` |
  | image | `src/image.ts` |
  | integration | `src/integration.ts` |
  | observability | `src/observability.ts` |
  | permission | `src/permission.ts` |
  | plugin | `src/plugin.ts` |
  | project | `src/project.ts` |
  | pty | `src/pty.ts` |
  | reference | `src/reference.ts` |
  | ripgrep | `src/ripgrep.ts` |
  | scheduled-task | `src/scheduled-task.ts` |
  | session | `src/session.ts`, plus the nested registered entry `src/session/runner/index.ts` |
  | skill | `src/skill.ts` |

- **Cohesive, entry = index:** backend-toolkit, system-context (both exist); capability, control-plane, research (created in P2).
- **Collection** (one entry per file): database, effect, flag, id, installation, oauth, share, tool, util. Also `v1` (status legacy) and `github-copilot` (status vendored).

### 3.5 `removed-v1` internal modules (status legacy; `target` = monolith-map disposition, WP 70-G)

| Folder | Target owner |
|---|---|
| cli, `index.ts`, `temporary.ts` | `removed-v1` entry/bootstrap |
| `node.ts` | public composition facade (export key `./node`) |
| server | `packages/server` compat v1 plus canonical handlers |
| session, storage, background | Core v1 Session/storage/jobs plus `modules/session-engine` |
| agent | Core Agent plus product roster |
| config, permission, question, command, skill, env | Core config/policy/interaction/instruction |
| account, auth | Core account/credential |
| project, git, worktree, snapshot | Core project/repository |
| provider, plugin | Core provider/plugin-host plus llm |
| tool | Core tools plus product adapters |
| lsp, mcp, ide, format | Core integration |
| control-plane | Core control-plane |
| research | Core research (D22) |
| acp | `modules/acp` |
| maestro | `modules/maestro` |
| continuity | `modules/continuity` |
| claude-code | `modules/engine-adapters/claude-code` |
| janitor | `modules/janitor` |
| bus, sync, `event-manifest.ts`, `event-v2-bridge.ts` | Core event compatibility |
| effect | Core infrastructure |
| installation, util, id, image, patch | Core infrastructure / browser-safe util |
| `audio.d.ts`, `markdown.d.ts`, `sql.d.ts` | declarations next to their loader |

### 3.6 Compat facade convention (D8)

| Specifier | Facade file | Form |
|---|---|---|
| `@orchestra/sdk` | `src/compat/sdk.ts` | `export type *` in plugin; otherwise `export *` |
| `@orchestra/sdk/v2` | `src/compat/sdk-v2.ts` | `export *`, except `export type *` in plugin |
| `@orchestra/sdk/v2/client` | `src/compat/sdk-v2-client.ts` | `export *` |
| `@orchestra/sdk/v2/types` | `src/compat/sdk-v2-types.ts` | always `export type *` (types-only module; core has the SDK as a devDependency only) |
| vendored `client` | `src/compat/vendored-client.ts` | `export *` |
| vendored `client/promise` | `src/compat/vendored-client-promise.ts` | `export *` |

Each facade has a header comment: `// Legacy boundary (script/module-architecture.json): this package reaches this legacy dependency only through this file.`

Import specifier written by the codemod:
- `app` (app-shell) and `orchestra`: `@/compat/<facade>`. The alias is used in 340 and 317 files.
- Every other package: a relative posix path from the importing file to `<pkg>/src/compat/<facade>`, with no extension.

Facades created in P4, by package:

| Package | Facades |
|---|---|
| app-shell | sdk-v2, sdk-v2-client, vendored-client, vendored-client-promise |
| session-ui | sdk-v2, sdk-v2-client, vendored-client-promise |
| tui | sdk-v2 |
| plugin | sdk, sdk-v2, sdk-v2-types (all `export type *`) |
| core | sdk-v2-types (`export type *`) |
| cli | sdk-v2-client |

---

## 4. Shared preparatory cards (lead, serial, before any Haiku card)

### P0 Baseline and landing check
- **Depends on:** #738 and #755 merged into `dev` (D23).
- **Owns:** nothing (it produces receipts).
- **Steps:**
  1. Record the SHA.
  2. Re-run Appendix A commands A1–A12 and compare with the expected values in §1. If a delta exceeds ±5%, update this plan's numbers before dispatch.
  3. Capture the `script/monolith-inventory.ts` baseline (exports and imports per manifest) as a receipt for 90-A.
  4. Confirm that `bun run test:ci app src/utils/server.test.ts` applies app-shell's `--conditions=solid --preload ./happydom.ts`. If it does not, W1-FAC-APP-REST drops its test:ci line and relies on the epic run.
- **Done:** receipts stored in the campaign entry.

### P1 Rename-ledger repair
- **Owns:** `script/rename-ledger.ts`.
- **Edits:**
  1. Line 55: `path: /^(?:packages\/[^/]+|tooling\/http-recorder)\/test\/fixtures\/recordings\//` → `path: /^(?:(?:packages|apps)\/[^/]+|tooling\/http-recorder)\/test\/fixtures\/recordings\//`.
  2. P11 (`:105`): `paths: /^packages\/(?:app(?:-shell)?|session-ui)\/|^bun\.lock$/` → `paths: /^packages\/(?:app(?:-shell)?|session-ui)\/|^bun\.lock$|^script\/(?:module-architecture|boundary-ledger)\.json$/`.
- **Verify:** `bun run test:ci core test/rename-guard.test.ts` is green. This currently fails only because of K13; the P11 change is a no-op until P2 and P3 add the two files.
- **Rollback:** revert the commit.
- This fix belongs in #738 if #738 has not landed yet.

### P2 Architecture registry and the three core index files
- **Owns:** `script/module-architecture.json` (new), `packages/core/src/research/index.ts`, `packages/core/src/capability/index.ts`, `packages/core/src/control-plane/index.ts` (all new).
- **Content:**
  - The registry follows §3.1, §3.4 and §3.5, plus the `legacy` array from D9.
  - Index files use named re-exports of the existing namespaces only:
    - research: `export { ResearchAllowance } from "./allowance"` … through `ResearchRecords` (5 lines)
    - capability: `CapabilityDescriptors` (`./catalog/descriptors`), `CapabilityInvocation`, `CapabilityPolicy`
    - control-plane: `MoveSession` from `./move-session`
- **Invariants:** nothing imports the new index files yet, so runtime is unchanged. `module-registry.json` is untouched.
- **Verify:** `bun typecheck` in `packages/core`, and `git grep -c opencode -- script/module-architecture.json` prints nothing.

### P3 Boundary guard, tests, seed, CI
- **Owns:**
  - New: `script/check-module-boundaries.ts` (≤ 450 LOC, godfile target 500), `packages/script/test/module-boundaries.test.ts`, `script/boundary-ledger.json` (seeded).
  - Edited: `package.json` (add `"check:boundaries": "bun run script/check-module-boundaries.ts"`), `turbo.json` (append `$TURBO_ROOT$/script/check-module-boundaries.ts`, `$TURBO_ROOT$/script/module-architecture.json` and `$TURBO_ROOT$/script/boundary-ledger.json` to `@orchestra/script#test.inputs`), `.github/workflows/test.yml` (a new step after "Run spawn-import gate": `- name: Run module-boundary gate`, `if: matrix.part == 'packages'`, `run: bun run check:boundaries`).
- **Tests (teeth).** Use the fixture workspace (`packages/script/test/fixture/workspace.ts`). Each item below needs a failing control and a passing control:
  - every rule R0–R9
  - a ledgered violation passes
  - a stale entry fails in strict mode and passes with `--no-stale`
  - `--prune` removes only stale entries
  - a type-only edge is still checked
  - `import.meta.glob` is scanned
  - an empty scan fails
  - a service-tag string literal is not treated as an import
- **Seed.** Run `--seed` once. Compare the per-rule counts with §3.2 and investigate any rule off by more than ±10%. Replace the R1 reasons with the D-ids.
- **Verify:**
  - `bun run check:boundaries` exits 0.
  - `bun run test:ci script test/module-boundaries.test.ts`.
  - `bun run check:spawn-imports` and `bun run check:godfile`.
  - `bun run test:ci core test/distribution-bundle-workflow.test.ts test/test-omni-control.test.ts`, to prove the workflow pins are intact.

### P4 Codemod tools and facade files
- **Owns:**
  - New tools: `script/explicit-exports.ts` (§3.3), `script/compat-facade.ts`, `script/module-readme.ts`.
  - New facade files: the 14 listed in §3.6.
- **`compat-facade.ts` spec.** `bun run script/compat-facade.ts <alias> <path-prefix>... [--write|--check]`.
  - Visit tracked source files under the prefixes. Skip a file if `isTestFile` matches or it is under `<pkg>/src/compat/`.
  - Parse with `typescript.createSourceFile`.
  - For each string-literal module specifier in `ImportDeclaration`, `ExportDeclaration` and `ImportTypeNode` that is in the §3.6 map, replace the literal's text (keeping the quote character) with the facade specifier.
  - Edit from the end of the file to the start.
  - Abort with `FACADE_MISSING` if the facade file does not exist.
  - Abort with `FACADE_UNSUPPORTED_IMPORT_FORM` on a default or namespace import of a mapped specifier.
  - Print the changed-file count. `--check` exits 1 if anything would change.
- **`module-readme.ts` spec.** `bun run script/module-readme.ts <alias>... [--write|--check]`.
  - Render the block:

    ```
    <!-- module-contract:start (generated by script/module-readme.ts from script/module-architecture.json; do not edit) -->
    ## Module contract
    - Package: `<name>` at `<path>` (alias `<alias>`)
    - Layer: `<layer>`; may depend on: <layers joined>
    - Status: `<status>`[; successor: `<successor>`][; live: <note>]
    - Owner: <owner role>
    - Public entry: <"explicit `exports` in package.json" | "application entrypoint, no library exports">
    - Legacy and compatibility: <registry legacy items under this path, or "none">
    - Enforced by `bun run check:boundaries`; exceptions in `script/boundary-ledger.json`.
    <!-- module-contract:end -->
    ```

  - Replace an existing block, or append one at the end after one blank line. If `README.md` is missing, create `# <name>\n\n<summary>\n\n<block>\n`.
  - **The output must not contain the token "opencode".**
- **Verify:**
  - `bun run script/compat-facade.ts app packages/app-shell/src --check` exits 1 and reports 101 files (proves reach).
  - `bun run script/explicit-exports.ts schema --check` exits 1 (proves it detects).
  - Running the codemod with `--write` on a scratch copy and then `--check` exits 0.
  - `bun typecheck` in `packages/app-shell`, `packages/session-ui`, `packages/tui`, `packages/plugin`, `packages/core` and `apps/cli` (the facades must compile).
  - `bun run check:boundaries` is still green: the facades are under `compat/`, and the core facade's R1 entry was seeded in P3. If it was not seeded, add it with reason "D8 core legacy types facade".

### P5 Worktree provisioning (lead)
- One worktree per card, branched from the post-P4 commit. Branch names come from the cards.
- In each worktree, run `ln -s <integration-worktree>/node_modules node_modules`. The root symlink is enough for `typescript`, which the codemods and guard need.
- Cards do **not** run `bun install` or `bun typecheck` (Mac limits). Typecheck happens at integration (§6).

---

## 5. Work-package cards (Haiku)

Rules common to every card:
- Edit only the files the card owns.
- Run exactly the listed commands. If any command output differs from the expected result, stop and report it; do not improvise.
- Commit message: `type(scope): summary` + `Co-Authored-By` line.
- Never edit `script/boundary-ledger.json`, `script/module-architecture.json`, generated directories (`packages/client/src/generated*`, `packages/sdk/js/src/**/gen`) or any `package.json` the card does not own.
- `TEST_RE` and the legacy-import grep `LEG` are defined in Appendix A.

### 5.1 Explicit exports (EXP), 8 cards, wave 1

**Template.**
- **Depends on:** P3, P4.
- **Owns:** `<path>/package.json` only.
- **Transformation:** `bun run script/explicit-exports.ts <alias> --write`.
- **Invariants:**
  - every previously resolvable demanded specifier resolves to the same file (the generator enforces this)
  - every non-`exports` field is byte-identical
  - `imports` (`#sqlite`/`#pty`/`#fff`) is untouched
- **Verify:**
  1. `bun run script/explicit-exports.ts <alias> --check` exits 0.
  2. `node -e 'const e=require("./<path>/package.json").exports;const w=Object.keys(e).filter(k=>k.includes("*"));console.log(w.length, w.join(" "))'` prints the expected wildcard line.
  3. `git diff --stat` shows exactly 1 file.
  4. `bun run check:boundaries --no-stale` exits 0, and the `R6a` lines for `<path>/package.json` are now reported as stale.
- **Done:** all four pass.
- **Rollback:** `git revert`.

| Card | alias / path | Expected wildcard line | Sanity size of `exports` (baseline) | Branch | Integration typecheck dirs |
|---|---|---|---|---|---|
| W1-EXP-CORE | core / packages/core | `0` | about 295 keys (5 kept + 287 demanded + 3 entries) | exports-core | packages/core, removed-v1, apps/cli, apps/desktop, packages/server, packages/sdk-next, packages/tui, packages/app-shell, packages/session-ui |
| W1-EXP-SCHEMA | schema / packages/schema | `0` | 90 (`.` + 89 full) | exports-schema | packages/schema, packages/protocol, packages/core, modules/relay, packages/llm, packages/client, packages/app-shell |
| W1-EXP-PROTOCOL | protocol / packages/protocol | `0` | 28 (full) | exports-protocol | packages/protocol, packages/server, packages/client |
| W1-EXP-SERVER | server / packages/server | `0` | 15 | exports-server | packages/server, apps/cli, packages/sdk-next |
| W1-EXP-RELAY | relay / modules/relay | `0` | 18 (`.` + 17) | exports-relay | modules/relay, packages/core, packages/server |
| W1-EXP-SESSIONUI | session-ui / packages/session-ui | `1 ./v2/*.css` | about 32 | exports-session-ui | packages/session-ui, packages/app-shell |
| W1-EXP-UI | ui / packages/ui | `4 ./fonts/* ./audio/* ./v2/*.css ./v2/styles/*` | about 159 | exports-ui | packages/ui, packages/session-ui, packages/app-shell, packages/tui |
| W1-EXP-ORCH | orchestra / removed-v1 | `0` | 1 (`./node`) | exports-orchestra | removed-v1 |

Commit for each card: `refactor(<scope>): declare explicit package exports`. The scope is the package name, for example `core`.

### 5.2 Compat facades (FAC), 8 cards, wave 1

**Template.**
- **Depends on:** P3, P4.
- **Owns:** every file printed by the card's "owned list" command (non-test source under the prefix that imports a legacy specifier). Nothing else. The facade files themselves are lead-owned (P4).
- **Transformation:** `bun run script/compat-facade.ts <alias> <prefixes> --write`.
- **Invariants:**
  - only specifier string literals change; import clauses, `type` modifiers, order and formatting are untouched
  - value bindings keep their identity (re-export)
  - no test file changes
- **Verify:**
  1. `bun run script/compat-facade.ts <alias> <prefixes> --check` exits 0.
  2. The `LEG` count for the prefixes is `0` (Appendix A, A7).
  3. `git diff --numstat | awk '{a+=$1; d+=$2} END {print a, d, NR}'` prints `N N N`, where N is the expected file count: one line changed per file. Files with two legacy specifiers may show 2.
  4. `git diff --name-only | grep -cE "$TEST_RE"` prints `0`.
  5. `bun run check:boundaries --no-stale` exits 0.
  6. The card's test:ci line, if it has one.
- **Done:** all pass.
- **Rollback:** `git revert`.

| Card | alias | Prefixes | Expected files N | test:ci | Branch | Integration typecheck dir |
|---|---|---|---|---|---|---|
| W1-FAC-APP-CONTEXT | app | `packages/app-shell/src/context` | 26 | – | compat-app-context | packages/app-shell |
| W1-FAC-APP-PAGES | app | `packages/app-shell/src/pages` | 32 | – | compat-app-pages | packages/app-shell |
| W1-FAC-APP-COMPONENTS | app | `packages/app-shell/src/components` | 24 | – | compat-app-components | packages/app-shell |
| W1-FAC-APP-REST | app | `packages/app-shell/src/utils packages/app-shell/src/orchestra packages/app-shell/src/hooks packages/app-shell/src/testing` | 19 (listed in Appendix B) | `bun run test:ci app src/utils/server.test.ts src/utils/server-health.test.ts` (subject to P0) | compat-app-rest | packages/app-shell |
| W1-FAC-SESSIONUI | session-ui | `packages/session-ui/src` | 14 (Appendix B) | `bun run test:ci session-ui src/components/lean-tool-metrics.test.ts` (smoke; same package) | compat-session-ui | packages/session-ui |
| W1-FAC-TUI | tui | `packages/tui/src` | 26 | – | compat-tui | packages/tui |
| W1-FAC-PLUGIN | plugin | `packages/plugin/src` | 13 (Appendix B; includes 2 `ImportTypeNode` literals in `v2/promise/integration.ts`) | `bun run test:ci core test/plugin/sdk-authority.test.ts test/plugin/sdk-runtime.test.ts test/npm-sdk.test.ts` | compat-plugin | packages/plugin, packages/core |
| W1-FAC-CORE-CLI | core, cli | `packages/core/src` and `apps/cli/src` (two runs) | 3 + 1 (Appendix B) | – | compat-core-cli | packages/core, apps/cli |

Commit: `refactor(<scope>): route legacy SDK imports through the compat facade`.

### 5.3 W1-T2-01: session-ui deep-relative type import (tier 2)
- **Depends on:** P3.
- **Owns:** `packages/session-ui/src/components/lean-tool-metrics.tsx`. It is not in the W1-FAC-SESSIONUI list; the file has no legacy import.
- **Edit:** line 2: `import type { LeanMetrics } from "../../../schema/src/lean-metrics"` → `import type { LeanMetrics } from "@orchestra/schema/lean-metrics"`.
- **Invariants:** a type-only import, so no runtime change. session-ui already declares `@orchestra/schema`, and the subpath resolves under both the current and the post-EXP-SCHEMA map.
- **Verify:**
  1. `git diff --numstat` prints `1 1`.
  2. `bun run check:boundaries --no-stale` exits 0, and its R5 entry for this file is reported stale.
  3. `bun run test:ci session-ui src/components/lean-tool-metrics.test.ts`.
- **Branch:** `session-ui-schema-import`.
- **Commit:** `refactor(session-ui): import lean metrics through the schema package`.

### 5.4 W1-REN-TEETH: rename-guard stale check with teeth (tier 1, gate strengthening)
- **Depends on:** P1.
- **Owns:** `packages/core/test/rename-guard.test.ts`.
- **Edit.** In the test "every ledger entry still matches something…":
  - Old filter: `.filter((entry) => !tracked.some((file) => entry.path.test(file)))`.
  - New filter: `.filter((entry) => !tracked.some((file) => entry.path.test(file) && (/opencode/i.test(file) || /opencode/i.test(new TextDecoder("latin1").decode(readFileSync(path.join(root, file)))))))`.
  - Add `import { readFileSync } from "node:fs"` after the `node:path` import.
- **Teeth.** Add a unit test: `expect(keptPaths.find((entry) => entry.path.test("removed-v1/test/fixtures/recordings/session/native-zen-tool-loop.json"))).toBeDefined()`.
- **Invariants:** the gate's reach only grows. Measured at baseline, all 15 kept entries keep at least one file that contains the token once P1 is in.
- **Verify:** `bun run test:ci core test/rename-guard.test.ts`.
- **Branch:** `rename-guard-teeth`.
- **Commit:** `test(core): require kept rename paths to cover a real occurrence`.

### 5.5 README contract blocks (README), 6 cards, wave 1b

**Template.**
- **Depends on:** P2, P4. They need the final registry, not the EXP cards.
- **Owns:** `<path>/README.md` for each listed alias.
- **Transformation:** `bun run script/module-readme.ts <aliases> --write`.
- **Verify:**
  1. `bun run script/module-readme.ts <aliases> --check` exits 0.
  2. `git diff --name-only` lists only these READMEs.
  3. `git grep -ci opencode -- <the READMEs>` prints nothing, or only lines already present before the change.
  4. `bun run check:boundaries --no-stale` exits 0.
- **Rollback:** revert.

| Card | Aliases | New files | Branch |
|---|---|---|---|
| W1-README-A | schema, protocol, client, sdk/js, sdk-next | packages/sdk/js/README.md | readme-contracts-a |
| W1-README-B | core, llm, codemode, effect-drizzle-sqlite, effect-sqlite-node | packages/effect-sqlite-node/README.md | readme-contracts-b |
| W1-README-C | server, plugin, script, http-recorder, httpapi-codegen | packages/script/README.md | readme-contracts-c |
| W1-README-D | ui, session-ui, app, tui | packages/ui, packages/session-ui, packages/tui READMEs | readme-contracts-d |
| W1-README-E | orchestra, cli, desktop, web, storybook | apps/storybook/README.md | readme-contracts-e |
| W1-README-F | relay, maestro-arsenal, capability-assets, atlas-boundary, omni/bindings/node | modules/atlas/boundary/README.md | readme-contracts-f |

Commit: `docs(<scope>): add generated module contract blocks`.

### 5.6 Conditional and optional cards (not in the estimate)
- **T2-ARSENAL-PORT** (only if the owner picks D6-B).
  - **Owns:** `packages/core/src/tool/maestro-arsenal-omni.ts`, `packages/core/src/tool/upstream-arsenal.ts`, `packages/core/package.json` (dependencies), `removed-v1/src/maestro/roster.ts`, `apps/cli/src/commands/handlers/debug/symbols.ts`.
  - **Change:** `loadArsenal(load: () => Promise<typeof import("@orchestra/maestro-arsenal")>)`. Composition passes `() => import("@orchestra/maestro-arsenal")`. Arsenal's `Descriptor`, `ProcessRequest` and `ProcessResult` types move behind a core-owned structural type.
  - **Not purely mechanical:** it changes the boot wiring in 2 apps and needs `bun install` to drop the dependency. Lead-executed. test:ci: `removed-v1/test/maestro/*arsenal*` and `removed-v1/test/tool/upstream-arsenal.test.ts`.
- **W4 deep-import retargets** (after the milestone, optional). Per importer package, rewrite R7 deep specifiers to the module entry when every imported name is re-exported by that entry.
  - This changes module evaluation order (TDZ/cycle risk, startup cost).
  - Pilot: relay (core 9 + server 3 files → `@orchestra/relay`) with the relay, tool-safety and session-runner test files via test:ci.

---

## 6. Execution DAG, waves and merge order

```
P0 baseline ─► P1 rename fix ─► P2 registry+index ─► P3 guard+seed+CI ─► P4 tools+facades ─► P5 worktrees
                                                                                                  │
            ┌──────────────────────────────── W1 (rolling, ≤20 concurrent) ───────────────────────┤
            │ EXP×8  FAC×8  T2-01  REN-TEETH  README×6   (24 cards, all file-disjoint)            │
            └─────────────────────────────────────────────────────────────────────────────────────┘
                                   ▼ integration (lead, serial)
     merge card → serial `bun typecheck` in the card's integration dirs → next card
                                   ▼
     L-PRUNE: `bun run check:boundaries --prune` → commit → `bun run check:boundaries` (strict) = 0
                                   ▼
     M1: one epic CI run (add/re-add the `epic` label), plus `check:spawn-imports`, `check:godfile`
```

- **Parallel width.** 24 cards in W1, all disjoint by owned file, run with a 20-slot rolling dispatcher. The 4 smallest README cards queue for the first free slots.
- **Merge order.** Any order works, because every card is resolution-neutral and file-disjoint. Recommended:
  1. REN-TEETH, T2-01
  2. EXP-SCHEMA, EXP-PROTOCOL, EXP-RELAY, EXP-SERVER, EXP-ORCH, EXP-SESSIONUI, EXP-UI
  3. FAC-CORE-CLI, FAC-PLUGIN, FAC-TUI, FAC-SESSIONUI, FAC-APP-*
  4. EXP-CORE last among the code cards: it has the largest consumer typecheck set
  5. README-*
- **Typecheck.** Done at integration, serially, on one integration worktree, in the dirs listed per card. A failure reverts that one card's commit and returns the card with the error text.
- **CI.**
  - Change-scoped `test:ci` runs: P1, P3 (2), W1-FAC-APP-REST, W1-FAC-SESSIONUI, W1-FAC-PLUGIN, W1-T2-01, W1-REN-TEETH. That is 8 runs, each a few minutes, run in the background.
  - **One full epic CI run** at M1. No per-card epic runs (AGENTS "CI Cadence").
- **Branches and PRs.** Each card's branch has at most 3 words, as named in its table. Land as a stack into one epic PR per milestone, or merge the card PRs into an integration branch `scaffold-boundaries`; the lead decides.

---

## 7. Risks and traps specific to this repo

1. **The plugin `exports` map is runtime data.** `core/src/plugin/sdk-package.ts:33-43` maps every key of `packages/plugin/package.json` `exports` into the generated plugin-SDK shim.
   - Adding even a `"./package.json"` key would generate a bogus `package.json` source and overwrite the manifest.
   - **Never edit plugin `exports`.** This is why the tier-2 fix for `sdk-package.ts`'s deep JSON import was rejected; it stays in the ledger.
2. **Effect service-tag strings look like specifiers** (`"@orchestra/core/tools"`, `"@orchestra/relay/ArmStore"`, `"@orchestra/server/CatalogAvailability"`). Exports must never be derived from a regex alone. The generator keeps a literal only if it resolves to a tracked file.
3. **Node `*` semantics.** `*` matches across `/`, and precedence goes to the longest prefix. Enumeration and resolution share one implementation (`resolveExport`), and every write is guarded by the resolution-equality invariant.
4. **Typecheck is not a complete oracle for exports.** `ui` and `session-ui` exclude stories. `app-shell` typechecks `src` only, not `e2e/` or `test-browser/`. Desktop excludes its tests. The generator invariant and guard R6b over **all** files are the real checks.
5. **The rename guard is red at the baseline (K13)** and is path-scoped. New file paths must not contain "opencode" (hence `vendored-client*`). New file contents outside the P11 scope must not contain it either: registry, ledger, READMEs, guard.
6. **Path-keyed ledgers:** `script/rename-ledger.ts`, `godfile-waivers.json` (74 waivers), `script/spawn-allowlist.json`, `script/archive-scopes.json`. This plan moves **no** files (D12). Any later move must update them in the same PR.
7. **Pinned workflow bodies.**
   - `packages/core/test/distribution-bundle-workflow.test.ts:209-212` pins the static job steps exactly, so do not add the gate there.
   - `apps/desktop/test/lean-candidate-workflow.test.ts` hash-pins `lean-candidate.yml` (untouched). Its cache key hashes `packages/*/package.json` etc., so the EXP cards cold-start that cache once. That is expected.
8. **Turbo.** `module-registry.json` is a `globalDependencies` entry; we do not edit it. Script-package tests hash only declared root inputs, so P3 must add the three new files to `@orchestra/script#test.inputs`, or cached passes would survive changes.
9. **Nix.**
   - `dependency_measurement.py` fingerprints every blob under `packages/`, `modules/` and `assets/`, so every card changes it. Nix qualification remeasures once at 90-A; never claim Nix status for an intermediate head.
   - `nix/scripts/workspace-paths.json` maps `@orchestra/core/*` straight to `src/*.ts`. It bypasses `exports`, so it neither breaks nor validates them.
10. **Lockfile.** Any manifest dependency edit needs `bun install`, which changes `bun.lock` and the Nix inputs. So no dependency edits (D10); undeclared imports stay in the ledger.
11. **Generated code** (`packages/client/src/generated*`, `packages/sdk/js/src/**/gen`, `packages/sdk/openapi.json`) is never edited. Regenerate only via `bun run generate` in `packages/client` or `./packages/sdk/js/script/build.ts`, and no card needs either.
12. **Facade semantics.**
    - `export *` drops default exports. Verified: 0 default or namespace imports of legacy specifiers.
    - `export type *` is mandatory where the target is types-only or a devDependency (core). Otherwise a runtime import of `@orchestra/sdk` would appear in core.
    - Bundlers tree-shake re-exports, but the web bundle hash may change. That is harmless; note it in the PR card.
13. **Vite aliases.** The storybook mocks alias `@/context/*` but not `@/compat/*`, and `.storybook/` is excluded from facades. app-shell's `@` alias is provided by `packages/app-shell/vite.js` and is already used in 340 source files.
14. **Self-references.** core imports itself by package name (237 distinct subpaths), so the generator must scan core too (it scans the whole repo).
15. **Barrel retargets change evaluation order** (TDZ in cyclic ESM, startup cost). That is why there are no deep-import retargets in this phase (W4 only).
16. **Mac resources.** 20 agents each running `tsgo` on orchestra would exhaust memory. Cards never typecheck or install. Integration typechecks serially. Worktrees share the root `node_modules` through a symlink.
17. **Windows CI.** The gate runs in the `packages` part on both OSes. Use `git ls-files -z` posix paths and do not assume LF in parsing (TS handles CRLF).
18. **The legacy label is not "unsupported".** `removed-v1` is the default desktop sidecar (`apps/desktop/src/main/index.ts:85`). The registry note and README must say "live".
19. **Known behavior hazard left open:** two monotonic ID counters (`removed-v1/src/id/id.ts` vs core via `@orchestra/schema/identifier`). Logged under D18, not fixed here.
20. **Deviation from the plan doc's "≤6 executors"** (restructure-plan §7) needs owner confirmation (D24).
21. **The baseline drifts.** #738/#755 are not in `dev`, and the canonical checkout's `dev` ref is stale. P0 re-measures before dispatch, and seed counts are sanity ranges, not pins.

---

## 8. Estimate

| Item | Count |
|---|---|
| Lead prep cards | 6 (P0–P5); P3 is the largest, about 450 LOC of guard plus about 250 LOC of tests |
| Haiku cards | 24 (8 EXP, 8 FAC, 6 README, T2-01, REN-TEETH) plus 2 conditional/optional (not counted) |
| Waves | prep (serial) → W1 (24 cards, ≤20 concurrent, rolling) → integration and prune → M1 |
| Changed lines (cards) | about 1,000. EXP-CORE is the largest single diff (about 290 JSON lines, generated). FAC about 190 one-line edits. README about 200. |
| Wall-clock with 20 agents | prep about 1–1.5 days (lead) + W1 about 2–3 h + serial integration typecheck about 3–4 h + epic CI about 2 h → **about 2.5–3 working days** |
| CI | 8 change-scoped `test:ci` runs plus **1 epic run** at M1 |
| Owner decisions | 10 (none blocking W1) |

**Exit criteria for M1:**
- `bun run check:boundaries` (strict) is green, and the ledger has no R3 entry except `app.tsx` → `layout.tsx`, no R6a, and no R8.
- No `"./*"` code wildcard remains in any registered manifest.
- All 29 READMEs carry the contract block.
- The epic CI run is green.
- The serial typecheck of the 20 integration dirs is green.

---

## Appendix A: assertion commands (run from the repository root, in bash)

```bash
TEST_RE='(^|/)(test|tests|e2e|test-browser|fixture|fixtures|__tests__|\.storybook|script|scripts|campaign|example|examples|benchmark)/|\.(test|spec|stories|fixture|suite|test-helper)\.[cm]?[jt]sx?$'
LEG() { git grep -lE "[\"'](@orchestra/sdk|@opencode-ai/client)(/[^\"']*)?[\"']" -- "$@" | grep -vE "$TEST_RE" | grep -v '/src/compat/'; }
```

| ID | Command | Baseline expectation |
|---|---|---|
| A1 | `node -e 'for (const m of require("./script/module-registry.json").modules){const e=require("./"+m.path+"/package.json").exports;if(e&&typeof e==="object"){const w=Object.keys(e).filter(k=>k.includes("*"));if(w.length)console.log(m.alias,w.join(" "))}}'` | 8 lines: orchestra, core, protocol, schema, server, relay (each `./*`); session-ui (5 keys); ui (9 keys) |
| A2 | `git ls-files removed-v1/src/server removed-v1/src/cli \| wc -l` | 169 |
| A3 | `git grep -lE "[\"'](@orchestra/sdk)(/[^\"']*)?[\"']" -- '*.ts' '*.tsx' '*.js' '*.mjs' \| wc -l` | 270 |
| A4 | `git grep -l '@opencode-ai/client' -- '*.ts' '*.tsx' \| wc -l` | 61 (58 importers plus the ledger, guard and fixture string literals) |
| A5 | `LEG packages/app-shell/src \| wc -l` | 101 |
| A6 | `for d in context pages components; do LEG packages/app-shell/src/$d \| wc -l; done` | 26, 32, 24 |
| A7 | `LEG packages/session-ui/src packages/tui/src packages/plugin/src packages/core/src apps/cli/src \| wc -l` | 57 (14 + 26 + 13 + 3 + 1) |
| A8 | `git grep -c "" -- packages/app-shell/src/pages/layout.tsx; git grep -l newLayoutDesigns -- packages/app-shell/src \| wc -l` | 2367 ; 37 |
| A9 | `git grep -lE "@orchestra/effect-sqlite-node['\"]" -- '*.ts' \| wc -l` | 0 |
| A10 | `git grep -c -i opencode -- removed-v1/test/fixtures/recordings` | 3 files (1, 1, 8 lines) |
| A11 | `git grep -nE "@orchestra/(relay\|maestro-arsenal)" -- packages/core/src packages/server/src \| cut -d: -f1 \| sort -u \| wc -l` | 14 (core 11 incl. type-only, server 3) |
| A12 | `for f in path encode binary retry task-tool array; do grep -cE '^\s*(import\|export .* from)' packages/core/src/util/$f.ts; done` | six `0` |

## Appendix B: exact owned files for the smaller FAC cards (baseline)

- **W1-FAC-APP-REST (19):**
  - `packages/app-shell/src/utils/`: `diffs.ts`, `prompt.ts`, `server-compat.ts`, `server-health.ts`, `server.ts`, `session-export.ts`, `session-management.ts`, `session-message.ts`, `session.ts`
  - `packages/app-shell/src/orchestra/chapters/`: `agents-dialog.tsx`, `agents-roster.ts`, `agents-view.tsx`, `agents.tsx`, `mcp-model.ts`, `schedule-server.ts`
  - `packages/app-shell/src/orchestra/`: `model-logo.tsx`, `relay/client.ts`
  - `packages/app-shell/src/hooks/provider-catalog.ts`
  - `packages/app-shell/src/testing/model-execution-fixture.ts`
- **W1-FAC-SESSIONUI (14):**
  - `packages/session-ui/src/components/`: `confirmed-todos.ts`, `file-media.tsx`, `message-file.ts`, `message-nav.tsx`, `message-part.tsx`, `part-default-open.ts`, `session-diff.ts`, `session-retry.tsx`, `session-review.tsx`, `session-turn.tsx`
  - `packages/session-ui/src/context/data.tsx`
  - `packages/session-ui/src/pierre/media.ts`
  - `packages/session-ui/src/v2/components/`: `prompt-input/types.ts`, `session-review-file-preview-v2.tsx`
- **W1-FAC-PLUGIN (13):**
  - `packages/plugin/src/`: `index.ts`, `tui.ts`
  - `packages/plugin/src/v2/effect/`: `agent.ts`, `aisdk.ts`, `catalog.ts`, `command.ts`, `event.ts`, `filesystem.ts`, `integration.ts`, `reference.ts`, `skill.ts`
  - `packages/plugin/src/v2/promise/`: `aisdk.ts`, `integration.ts`
- **W1-FAC-CORE-CLI (4):**
  - `packages/core/src/plugin/`: `models-dev.ts`, `provider/opencode.ts`, `variant.ts`
  - `apps/cli/src/services/daemon.ts`
- **The large app-shell cards (context 26, pages 32, components 24)** own exactly the output of `LEG packages/app-shell/src/<dir>` at their branch base. The count must match A6. If it does not, stop and report.

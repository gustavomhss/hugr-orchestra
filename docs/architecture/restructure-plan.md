# Restructure plan: a modular monolith

This plan turns the repository described in [monolith-map.md](monolith-map.md) into a modular monolith.

- **Modular monolith:** one repository, one lockfile, one CI, and modules whose roles and allowed dependencies are visible from the path and enforced by a tool.

## Target layout

```
apps/                      deployables; nothing imports an app
  orchestra/               CLI + headless server binary   (was packages/orchestra)
  web/                     web UI                          (was packages/app)
  desktop/                 Electron shell                  (was packages/desktop)
  storybook/               component workbench             (was packages/storybook)

packages/                  platform: shared, product-agnostic libraries
  schema/  protocol/  core/  server/  client/  sdk-next/
  llm/  plugin/  codemode/  tui/  ui/  session-ui/
  effect-drizzle-sqlite/  http-recorder/  httpapi-codegen/  script/

slices/                    product capabilities, each a bounded module that plugs into the platform
  atlas/                   packages/* (the 15 @atlas packages) + boundary/ (was packages/atlas-boundary)
  omni/                    crates/, bindings/node, conformance/
  relay/                   engine (TS); the Python oracle stays here until retired
  lean/                    absorbed from HuGR-Lean
  maestro/                 arsenal/ (was packages/maestro-arsenal); later the engine from apps/orchestra/src/maestro
  backend-specialist/      skills (gains a package.json)
  capability-assets/

assets/brand/              brand marks                     (was packages/identity)
docs/
  architecture/            this map, this plan, MODULES.md (the module registry)
  design/                  living design docs              (from specs/)
  slices/<name>/           SPEC, WHITEPAPER, PRODUCT, ADRs of each slice
script/                    root tooling and gates
nix/  patches/  .github/  .orchestra/   + root config files
```

`foundation/`, `specs/` and `perf/` disappear.

## Rules the layout encodes

1. **Dependencies point one way.** `apps` may use `slices` and `packages`. `slices` may use `packages` and declared slice ports. `packages` never import `slices` or `apps`. Inside `packages/` the existing rule holds: schema, then core and protocol, then server; client never imports core or server.
2. **Each module has one contract.** A module has these six things:
   - a `package.json` named `@orchestra/<name>`
   - a `README.md` stating purpose and owner
   - an explicit `exports` map (no `"./*": "./src/*.ts"` wildcard)
   - a `tags` entry in its `turbo.json`
   - its tests
   - nothing else at its root but code config
3. **A module carries no repo shell.** No nested `.github`, `.claude*`, `CODEOWNERS`, JS lockfile, `HANDOFF`/`PLAN`/session-state docs or duplicate `LICENSE`. There are two exceptions: a license that differs from the root (Omni is dual MIT/Apache, maestro-arsenal is Apache with a NOTICE, Lean has a TRS notice), and a tool file the build needs (`rust-toolchain.toml`, `.cargo/config.toml`).
4. **No evidence in git.** Benchmark output, screenshots, handoff archives and research dumps go to CI artifacts or release assets. A tracked file over 1 MB needs a waiver entry, as the godfile gate already does for line counts.
5. **Tooling resolves modules by name, never by path.** Scripts, workflows and nix use the workspace graph (`bun pm ls`, `turbo ls`) or the module registry, so a move is a one-line change.

All five rules are enforced in CI (Phase 0). The repo stops getting messier from the first PR, even while the cleanup is in flight.

## Enforcement

The checks use standard tools before anything bespoke:

- **`turbo boundaries` (turbo 2.10, already a dependency)**
  - Each module tags itself `kind:app`, `kind:slice` or `kind:platform`, plus a layer tag inside platform.
  - The root `turbo.json` declares which tags may depend on which.
  - It also fails on imports of undeclared workspace packages, which catches today's `core` to `sdk` and `desktop` to `plugin` gaps.
- **Violation ledger**
  - Today's inverted edges (core to relay, core to maestro-arsenal, core to omni, server to relay, orchestra to tui internals, app to core) go into a ledger, the same pattern as `godfile-waivers.json`.
  - The ledger can only shrink. A new violation fails CI.
- **`script/check-modules.ts`, one small gate.** It fails on any of these:
  - a repo-shell file inside `apps/*`, `packages/*` or `slices/*`
  - a tracked file over 1 MB without a waiver
  - a module without a README or name
  - a top-level directory not in the allowed list
- **`docs/architecture/MODULES.md`**
  - It is the registry: one row per module with kind, layer, owner and purpose.
  - The gate checks that it lists exactly the workspace packages.

## Phases

The phases follow these rules:

- Every phase is a set of small, independent PRs. Each one is green on its own and lands without freezing `dev` or waiting on another session.
- Moves are mechanical, generated by a script, and rebased right before landing.
- A conflict is the later lander's job.

### Phase 0: guardrails (stop the bleeding)

- Add `turbo boundaries` tags to every package, plus the violation ledger.
- Add `script/check-modules.ts` and `docs/architecture/MODULES.md`.
- Wire both into the existing godfile step of `test.yml`.

Done when CI fails on a new shell file, a new >1 MB file or a new inverted dependency.

### Phase 1: garbage out (no import changes)

1. **Remove work evidence from the tree.** This covers `specs/orchestra-visual/{handoff/archives,evidence,screenshots}`, `specs/backend-specialist/{research,evidence}`, `packages/orchestra/specs/benchmark-evidence` and the `bench-*` scripts. Attach the archives to a GitHub release (`evidence-2026-10`) first and leave a pointer in `docs/archive.md`.
2. **Remove the dead repo shell.**
   - Atlas: `.github/`, `CODEOWNERS`, `LICENSE`, `release.yml`, process docs. Its CI already lives in root `test.yml`.
   - Relay: `CONTRIBUTING.md`, `CHANGELOG.md`.
   - Omni: `.claude-plugin/`, `qa/vite/package-lock.json`.
3. **Remove the leftovers.**
   - Scripts: `script/rename-codemod.ts` and its test, `script/hooks`, the stale `script/generate.ts`, `patches/install-korean-ime-fix.sh`.
   - Waivers and configs: the PR 126 waiver in `test.yml`, `husky` from `prepare`, opencode `$schema` in `.orchestra/*.json`.
4. **Fix declarations.**
   - Add the missing dependencies: core to sdk, desktop to plugin and script, storybook to sdk, and promote orchestra to core from devDependencies to dependencies.
   - Add the missing turbo test entry for `capability-assets`.
   - Delete `effect-sqlite-node`, which is dead.
5. **Tidy the workflows.**
   - Fold `omni-artifacts-proof` into `omni-artifacts`.
   - Merge `omni-cli-smoke` and `omni-delivery-campaign` into `omni-smoke`.
   - Make `omni-desktop-smoke` dispatch-only.
   - Merge `typecheck`, `storybook`, `nix-eval` and `native` into one `epic.yml`.
   - Result: 15 workflows become 10.

### Phase 2: docs in one place

- Move the living docs into `docs/`:
  - `specs/v2`, `specs/storage`, `specs/tui-package.md`, `specs/seat-framework` and `specs/project.md` go to `docs/design/`.
  - The `specs/hugr-maestro` contracts go to `docs/slices/maestro/`.
  - The design and `contracts/` of `specs/backend-specialist` go to `docs/slices/backend-specialist/`.
- Slice prose goes to `docs/slices/<name>/`:
  - Relay: `SPEC`, `WHITEPAPER`, `PRODUCT`.
  - Omni: `PLAN`, `HANDOFF` (archived), after the `plan-sections-check.py` gate is pointed at the new path.
- Move `CONTEXT.md` to `docs/CONTEXT.md` and update the five references in prompts and `instruction.ts`.
- Fold `perf/test-suite.md` into `docs/design/`.
- Atlas's 238 docs stay inside the slice, because its gates read them.
- Fold the nested `AGENTS.md` files that only route docs into the module README. Keep the ones that state real module rules.

### Phase 3: decouple tooling from paths

This is the phase that makes every later move cheap.

- `script/test-ci.ts` resolves a package name through the workspace graph, not `^packages/${name}/`.
- The `setup-bun` action caches `**/node_modules` keyed by `bun.lock`, instead of the depth-based globs.
- `godfile-waivers.json` and `spawn-allowlist.json` move next to their gates in `script/`. Their keys are regenerated by a script during each move.
- `packages/script/src/index.ts` reads the version from the workspace graph instead of `../../orchestra/package.json`.
- `TEAM_MEMBERS` is resolved from the git root.
- `desktop/electron-builder.config.ts` resolves `playbooks` through the `orchestra` package export.
- `nix/*.nix` takes package paths from one attribute set, and gets the `node-modules.nix` filename bug fixed.
- `session-ui` and `app` stop pointing at `../app/vendor/*.tgz`. The vendored tarball moves to `vendor/` at root until Phase 6 retires it.

### Phase 4: slices

One PR per slice, each following the same absorption checklist.

The checklist:

- Move the slice under `slices/<name>`.
- Drop the shell.
- Name it `@orchestra/<name>`.
- Join the Bun workspace (`slices/*`, `slices/*/packages/*`).
- Move its CI job into root workflows with path filters.
- Add tags, a README and a MODULES row.
- Run its tests through `test:ci`.

Order, easiest first:

1. **`relay`.** A pure move. The goldens and the Python oracle stay until the oracle decision (open question 2).
2. **`maestro`.** `packages/maestro-arsenal` becomes `slices/maestro/arsenal`.
3. **`backend-specialist`.** Add a `package.json` so the ~10 path reads become a package resolve, then regenerate `entry-skills.gen.ts`.
4. **`capability-assets`.** A pure move.
5. **`lean`.** Import with `git archive` of HuGR-Lean `main` (tracked content only, never the working directory with `recovery/`). Then:
   - Drop `package-lock.json`, `.github`, `AGENTS.md`, `PLAN.md`.
   - Keep `NOTICE` and `licenses/`.
   - Rename `src/opencode` to the Orchestra hook adapter.
   - Keep `node:test` for the Node 22 contract.
6. **`omni`.** Move to `slices/omni` and update `omni-mirror.sh`, its workflows, the `turbo.json` inputs and the workspace glob. The mirror script replays first-parent commits under one `PREFIX`, so it must learn both the old and the new prefix before the move lands.
7. **`atlas`.** This is the biggest change:
   - Move `foundation/atlas` to `slices/atlas`, and `packages/atlas-boundary` to `slices/atlas/boundary`.
   - Migrate npm to Bun workspaces: drop `package-lock.json`, hoist the `@c4312/scip` postinstall patch, and keep vitest as the runner.
   - Replace `tsc -b` with per-package `typecheck` scripts under turbo.
   - Keep its gates and docs inside the slice.
   - Folding its 400-line godfile guard into the root gate is optional, later.

### Phase 5: apps

One mechanical PR, generated by a script and landed fast after a rebase:

- `packages/orchestra` moves to `apps/orchestra`, `packages/app` to `apps/web`, `packages/desktop` to `apps/desktop` and `packages/storybook` to `apps/storybook`.
- `packages/identity` moves to `assets/brand`.
- The workspace globs, root scripts and nix attribute set are updated.

After Phase 3 this touches only configuration, not code.

### Phase 6: real modularity inside the modules

This is the long tail. Each item is its own PR, and the violation ledger reaches zero at the end.

- **Close core's surface.** Replace `"./*"` with explicit exports in core, server, protocol, schema, relay, ui and session-ui.
- **Invert the platform-to-slice edges.**
  - Core defines ports: a stop-boundary hook port, a tool-provider port and a process-runner port.
  - Relay, Maestro and Omni implement them.
  - `apps/orchestra` wires them together at composition time.
- **Split core.**
  - `database` becomes `packages/database`.
  - `github-copilot` merges into `llm`.
  - `backend-toolkit` moves to `slices/backend-specialist`.
  - The provider plugins become `packages/providers`.
  - `tool-safety-*`, `omni*` and `relay-hook-*` become directories.
- **One of each.**
  - One CLI: `apps/orchestra`. Delete `packages/cli`, or adopt it as the new entry (open question 4).
  - One server: `@orchestra/server`. `apps/orchestra/src/server` migrates into it.
  - One SDK generation: retire `@orchestra/sdk` and the vendored opencode client in favour of `@orchestra/client`.
  - One UI generation: finish or drop `ui/src/v2`, `session-ui/src/v2` and `layout-new`.
- **Extract domains from the apps.**
  - `apps/orchestra/src/maestro` moves to `slices/maestro`. `continuity` becomes a slice.
  - App Dock (desktop main, orchestra plugin, app) becomes `slices/app-dock`.
  - The `app` desktop bridges (`wsl`, `updater`, `native-titlebar`, `desktop-menu`) move to the desktop app.
- **Shared helpers stop leaking.**
  - `app` stops importing `core`: the small helpers it uses move to a browser-safe `packages/util`.
  - `orchestra` stops importing `tui` internals: shared config and locale move to `core` or `packages/util`.
- **Clear the opencode leftovers.** About 280 files. Keep only the entries the rename ledger allowlists, such as the event-seal hash literal, which cannot change without breaking seals.

## Definition of done

- Root holds only `apps/ packages/ slices/ assets/ docs/ script/ nix/ patches/ .github/ .orchestra/` plus config files.
- Every module meets the module contract, and `docs/architecture/MODULES.md` lists exactly the workspace.
- `turbo boundaries` passes with an empty violation ledger.
- No tracked file over 1 MB without a waiver, and no evidence directories.
- One CLI, one server, one SDK generation, one UI generation.
- No `opencode` outside the rename-ledger allowlist.
- Moving any module is a change to its directory plus the registry, nothing else.

## Open questions for the owner

1. **Git history.**
   - Phase 1 removes 220 MB from the tree, but the 761 MiB pack stays, so every clone still downloads it.
   - Rewriting history with `git filter-repo` would shrink it. It also invalidates every open PR, worktree and session branch.
   - Recommendation: not now. Do it once at a quiet moment, if clone size starts to matter.
2. **Relay Python oracle.** It exists only to regenerate the 3,303 goldens. Retiring it would freeze them as-is: they stay valid but become unregenerable. Keep it until the owner decides.
3. **Omni mirror to `gustavomhss/hugr-omni`.**
   - If kept, Omni retains the files the mirror needs: `AGENTS.md`, its nested `.github`, licenses.
   - If retired, those go too.
   - Recommendation: keep it. The plan works either way.
4. **`packages/cli` (`lildax`).** Delete it, or make it the CLI that replaces `orchestra/src/cli`. Recommendation: delete now. A rewrite can come back as a branch when it is ready.
5. **Atlas.** Absorb it into the Bun workspace (this plan), or return it to its own repo and consume it as a dependency. Recommendation: absorb it. It is part of the product, and `atlas-boundary` already ties them together.

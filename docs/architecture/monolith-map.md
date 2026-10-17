# Monolith map

This is a snapshot of the repository as it stands on `dev` at `30c3f713cf` (2026-10-11). It records what each directory is and what is wrong with it. The fix is in [restructure-plan.md](restructure-plan.md).

## Summary

- 12,153 tracked files, 319 MB in the working tree, and a 761 MiB git pack.
- 46 workspace packages in total: 30 directories under `packages/`, plus 15 Atlas packages that are not in the Bun workspace.
- 15 GitHub workflows, 7 of them for Omni alone.
- About 280 tracked files still mention `opencode`.

| Area                     |  Files |    Size | What it really is                                                                              |
| ------------------------ | -----: | ------: | ---------------------------------------------------------------------------------------------- |
| `specs/orchestra-visual` |    163 |  230 MB | Work evidence. 198 MB of it is a split `historical-evidence.tar.gz`                            |
| `packages/relay`         |  3,652 |  6.5 MB | A TypeScript engine (29 src files), a Python oracle, and 3,303 golden files                    |
| `packages/ui`            |  1,692 |  6.5 MB | Solid component library. 1,316 of the files are assets (1,210 icons)                           |
| `packages/orchestra`     |  1,343 | 21.6 MB | The product backend: CLI, a server, Maestro, Continuity, tools, plus specs and benchmark dumps |
| `foundation/atlas`       |  1,266 | 13.4 MB | A complete second monorepo (npm, vitest, its own CI and guards)                                |
| `packages/app`           |  1,017 | 15.3 MB | Solid web UI, plus the Orchestra product chapters and desktop bridges                          |
| `packages/core`          |    678 |  4.3 MB | Domain runtime and grab-bag: about 110 top-level entries                                       |
| everything else          | ~2,340 |  ~20 MB |                                                                                                |

## Top-level layout today

```
.github/        15 workflows, 3 composite actions, TEAM_MEMBERS
.orchestra/     the product's own project config (dogfooding); must stay at root
foundation/     atlas/  (a nested monorepo, not in the Bun workspace)
nix/            flake support, hard-coded package paths, a pinned node_modules hash
packages/       30 dirs: platform libraries, apps, imported slices, assets, and a skills folder, all at one level
patches/        19 dependency patches + 1 stray script (install-korean-ime-fix.sh)
perf/           a single note
script/         root tooling: gates, test:ci, one-shot rename leftovers
specs/          399 files; about 15 are living specs, the rest evidence, handoffs, research and screenshots
CONTEXT.md, godfile-waivers.json, 24 config files
```

## Modules

The Kind column uses four values:

- platform: shared libraries.
- app: deployable.
- slice: an imported product capability.
- other: anything that is not a module.

`internal deps` lists the `@orchestra/*` workspace dependencies that the package declares.

| Path                             | Package                            | Kind               | Files | Purpose                                                             | Internal deps                                                                                         |
| -------------------------------- | ---------------------------------- | ------------------ | ----: | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/schema`                | `@orchestra/schema`                | platform           |    88 | Effect Schema wire and storage contracts                            | none                                                                                                  |
| `packages/protocol`              | `@orchestra/protocol`              | platform           |    30 | Public `HttpApi` definitions                                        | schema                                                                                                |
| `packages/core`                  | `@orchestra/core`                  | platform           |   678 | Session runtime, tools, config, database, provider plugins, toolkit | schema, llm, plugin, effect-drizzle-sqlite, effect-sqlite-node, **relay, maestro-arsenal, hugr-omni** |
| `packages/server`                | `@orchestra/server`                | platform           |    37 | `HttpApi` handlers over core                                        | core, protocol, schema, **relay**                                                                     |
| `packages/client`                | `@orchestra/client`                | platform           |    23 | Generated Promise and Effect clients                                | schema, protocol                                                                                      |
| `packages/sdk-next`              | `@orchestra/sdk-next`              | platform           |     9 | Embeds client + core + server                                       | client, core, server                                                                                  |
| `packages/sdk/js`                | `@orchestra/sdk`                   | platform (legacy)  |    50 | Legacy hey-api SDK, still imported by about 206 files               | none                                                                                                  |
| `packages/llm`                   | `@orchestra/llm`                   | platform           |   154 | Schema-first LLM client and provider adapters                       | schema                                                                                                |
| `packages/plugin`                | `@orchestra/plugin`                | platform           |    40 | Public plugin API (v1 and v2)                                       | sdk                                                                                                   |
| `packages/codemode`              | `@orchestra/codemode`              | platform           |    42 | Interpreter for confined tool programs                              | none                                                                                                  |
| `packages/effect-drizzle-sqlite` | `@orchestra/effect-drizzle-sqlite` | platform           |    26 | Effect SQLite adapter for drizzle                                   | none                                                                                                  |
| `packages/effect-sqlite-node`    | `@orchestra/effect-sqlite-node`    | platform (dead)    |     3 | Declared by core, never imported                                    | none                                                                                                  |
| `packages/http-recorder`         | `@orchestra/http-recorder`         | platform (test)    |    24 | HTTP/WebSocket cassettes                                            | none                                                                                                  |
| `packages/httpapi-codegen`       | `@orchestra/httpapi-codegen`       | platform (build)   |    18 | Generates the clients from `HttpApi`                                | none                                                                                                  |
| `packages/script`                | `@orchestra/script`                | platform (build)   |     5 | Build and version helpers                                           | none                                                                                                  |
| `packages/tui`                   | `@orchestra/tui`                   | platform (UI)      |   240 | OpenTUI terminal UI library                                         | core, plugin, sdk, ui                                                                                 |
| `packages/ui`                    | `@orchestra/ui`                    | platform (UI)      | 1,692 | Component library, theme, icons                                     | none                                                                                                  |
| `packages/session-ui`            | `@orchestra/session-ui`            | platform (UI)      |   123 | Session and message rendering                                       | core, sdk, ui                                                                                         |
| `packages/orchestra`             | `orchestra`                        | app                | 1,343 | The shipped binary: CLI, server, TUI launcher                       | 14 packages                                                                                           |
| `packages/app`                   | `@orchestra/app`                   | app                | 1,017 | Web UI, embedded in the binary and in desktop                       | core, schema, sdk, session-ui, ui                                                                     |
| `packages/desktop`               | `@orchestra/desktop`               | app                |   400 | Electron shell, App Dock, Omni host, Linux workspace                | core, hugr-omni, app, ui                                                                              |
| `packages/cli`                   | `@orchestra/cli`                   | app (unwired)      |    24 | Effect CLI rewrite, binary `lildax`; nothing ships it               | core, sdk, server, tui, script                                                                        |
| `packages/storybook`             | `@orchestra/storybook`             | app (dev)          |    30 | Storybook host                                                      | session-ui, ui                                                                                        |
| `foundation/atlas`               | `@atlas/*` x15                     | slice              | 1,266 | Git-native grounded knowledge layer                                 | not in the workspace                                                                                  |
| `packages/atlas-boundary`        | `@orchestra/atlas-boundary`        | slice              |    15 | Generated bundles of Atlas source, consumed by Maestro              | none (built from `../../foundation/atlas`)                                                            |
| `packages/omni`                  | `hugr-omni` (bindings only)        | slice              |   399 | Rust cross-OS process runtime + napi binding                        | Cargo workspace                                                                                       |
| `packages/relay`                 | `@orchestra/relay`                 | slice              | 3,652 | Stop-boundary checklists and hash-chained ledger                    | schema                                                                                                |
| `packages/maestro-arsenal`       | `@orchestra/maestro-arsenal`       | slice              |   112 | Maestro tool arsenal + MCP server                                   | hugr-omni                                                                                             |
| `packages/backend-specialist`    | none                               | other              |    74 | Skill markdown for the backend seat; read by path                   | none                                                                                                  |
| `packages/capability-assets`     | `@orchestra/capability-assets`     | slice              |    12 | Asset catalog; nothing imports it                                   | none                                                                                                  |
| `packages/identity`              | none                               | other              |     6 | Brand marks (svg/png)                                               | none                                                                                                  |
| `~/Documents/HuGR/HuGR-Lean`     | `hugr-lean`                        | slice (not yet in) |   108 | Deterministic offline tool-output filter                            | none                                                                                                  |

## Findings

### 1. Imported slices carry a full repo shell

Each slice was built in its own repo and copied in whole.

- **Atlas** (`foundation/atlas`)
  - It brought `.github/` (CI and release), `.claude/skills` (15 files), `CODEOWNERS`, `LICENSE`, `package-lock.json`, vitest, `tsc -b`, its own 400-line godfile guard and 29 `.mjs` gates.
  - It is outside the Bun workspace. Root `test.yml` runs it with `npm ci` in a separate job.
  - The nested `.github` never runs.
- **Omni** (`packages/omni`)
  - It brought `.github/`, `.claude-plugin/`, `AGENTS.md` + `CLAUDE.md`, `HANDOFF.md` (227 lines), `PLAN.md` (873 lines) and its own toolchain files.
  - There is a second `Cargo.lock` under `qa/` and a stray `qa/vite/package-lock.json`.
  - Some of this shell is deliberate: `script/omni-mirror.sh` replays `packages/omni` into `gustavomhss/hugr-omni`, so the shell serves the mirror.
- **Relay** (`packages/relay`)
  - It brought `CONTRIBUTING`, `CHANGELOG`, `SPEC`, `WHITEPAPER`, `PRODUCT` and `requirements-dev.txt`.
  - It also carries a Python oracle (`bin/`, `lib/`, `benchmark/`, `tests/`) beside the TypeScript engine (`src/`, `test/`).
  - Nothing in the product runs the Python. It exists only to regenerate the goldens.
- **Lean** is not in yet. Its tracked core is clean (108 files, depth 4, no runtime deps). The shell to drop is its npm lockfile, `.github`, `AGENTS.md`, `PLAN.md` and the opencode plugin adapter naming.

### 2. Evidence, handoffs and research are versioned as if they were specs

- `specs/orchestra-visual/handoff/archives` holds 208 MB in 35 files, mostly `.tar.gz` parts. That is 65% of the tracked bytes in the repo.
- `specs/orchestra-visual/evidence` holds 95 files (12 MB) and `screenshots` holds 5 more.
- `specs/backend-specialist` has 197 files. `research` (2.3 MB) and `evidence` (1 MB) are dumps; only the top-level design and `contracts/` are living documents.
- `packages/orchestra/specs` has 120 files, including `benchmark-evidence` (77 files). The package root also holds `BENCHMARK.md` and 7 `bench-*.sh/.py` scripts.
- Living specs are only `specs/v2`, parts of `specs/hugr-maestro`, `specs/storage`, `specs/tui-package.md` and `specs/seat-framework`.
- Removing these from the tree does not shrink clones. The bytes stay in history (761 MiB pack).

### 3. One flat `packages/` level mixes four kinds of thing

Platform libraries (`effect-sqlite-node`, `http-recorder`) sit next to apps (`app`, `desktop`), imported slices (`relay`, `omni`, `maestro-arsenal`), a brand-asset folder (`identity`) and a skills folder (`backend-specialist`). The directory name says nothing about role or allowed dependencies.

### 4. Dependency direction is inverted in places

- **Platform depends on slices.** `core` depends at runtime on `relay` (`core/src/relay*.ts`, `tool-safety-*`), `maestro-arsenal` (`core/src/tool/maestro-arsenal-omni.ts`) and `hugr-omni`. `server` depends on `relay`. The base layer should not know about product capabilities.
- **Core depends on the legacy SDK.** It uses `@orchestra/sdk` type imports, and also reaches it through `plugin`, which is built on `sdk`. The sdk import is not declared as a runtime dependency.
- **The app reuses the TUI's internals.** `orchestra` imports `@orchestra/tui` in 52 places for utilities (`util/locale`, `util/error`, `config/tui*`).
- **The web UI imports server-side code.** `app` imports `core` in 115 places, only for small helpers (`util/path`, `encode`, `retry`, `flag`).
- **Core has no API boundary.** It exports `"./*": "./src/*.ts"`, so every root file is public. `server` imports core by file path.
- **Only a few packages have boundary tests.** `client`, `sdk-next`, `relay` (`layering.test.ts`) and schema `v1` isolation have them. Core, server, protocol and llm have none.

### 5. Duplicated generations and half-finished migrations

- **Two CLIs.** `packages/orchestra/src/cli` is live. `packages/cli` (`lildax`) is an unwired rewrite.
- **Two servers.** `packages/orchestra/src/server` (75 files) and `@orchestra/server` (35 files) are half-migrated into each other.
- **Three wire-type generations:** `sdk/js/gen`, `client/generated` and `schema`.
- **Two UI generations.** `ui/src/v2` (89 files), `session-ui/src/v2` (31), and `layout.tsx` beside `layout-new.tsx`.
- **Two Copilot providers:** `core/src/github-copilot` (25 files) and `llm/src/providers/github-copilot.ts`.
- **Legacy `v1` subtrees** in schema and core. Core's is imported from live code, so it is not isolated.
- **Vendored client tarball.** `app/vendor/opencode-ai-client-1.17.13-v2.tgz` is a vendored upstream client used by `app` and `session-ui`. The repo's own `@orchestra/client` exists.

### 6. Product domains are hidden inside apps and core

- **`packages/orchestra/src`:**

  | Domain          | Files |
  | --------------- | ----: |
  | `maestro`       |    54 |
  | `continuity`    |    27 |
  | `claude-code`   |    13 |
  | `acp`           |    12 |
  | `control-plane` |     9 |
  | `janitor`       |     9 |

- **App Dock** is spread across 64 files in `desktop/src/main/app-dock-*`, 9 in `orchestra/src/plugin/app-dock*` and 1 in `app`.
- **`packages/core/src`:**

  | Domain                      | Files |
  | --------------------------- | ----: |
  | `backend-toolkit`           |    44 |
  | `database`                  |    50 |
  | `plugin` (provider plugins) |    44 |
  | `github-copilot`            |    25 |

  Core also has loose root clusters: `tool-safety-*`, `omni*` and `relay-hook-*`.

- **`packages/app/src`:** `orchestra` (142 files, including a `relay/` folder that overlaps the Relay slice) and `wsl` plus four desktop-bridge files that belong to the desktop platform layer.

### 7. Tooling hard-codes directory paths

Moving a directory today breaks these:

| Target               | Referencing files | Notable couplings                                                                                                                                                             |
| -------------------- | ----------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/orchestra` |               107 | root `dev` script, `nix/*.nix`, 3 workflows, `desktop/electron-builder.config.ts` (`../orchestra/playbooks`), `packages/script/src/index.ts` (`../../orchestra/package.json`) |
| `packages/app`       |                54 | 65 `godfile-waivers.json` keys, `translate-app`, nix, `session-ui` `file:../app/vendor/...`                                                                                   |
| `packages/omni`      |                47 | 6 workflows, `turbo.json` inputs, the workspace glob, `omni:build`, oxlint and prettier ignores, the mirror script                                                            |
| `packages/core`      |                36 | `postinstall`, workflows, `turbo.json` inputs                                                                                                                                 |
| `packages/desktop`   |                29 | `nix/desktop.nix`, 2 workflows, tsconfig `references ../app`                                                                                                                  |
| `foundation/atlas`   |                10 | `test.yml` (4 places), `godfile.ts`, ~25 `spawn-allowlist.json` keys, `atlas-boundary` build + tsconfig                                                                       |

Other couplings:

- `script/test-ci.ts` resolves packages with the regex `^packages/${name}/`.
- The `setup-bun` cache globs are depth-based: `packages/*/node_modules` and `packages/*/*/node_modules`.
- `.github/TEAM_MEMBERS` is reached through `../../../`.
- `nix/hashes.json` breaks on any workspace change.
- `turbo.json` task keys use package names, so they survive a move.

### 8. Leftovers and dead weight

- **Unwired code:**
  - `packages/cli` is unwired.
  - `effect-sqlite-node` is dead.
  - `capability-assets` has no consumer and no turbo test entry.
  - `packages/identity` is a folder of images posing as a package.
- **One-shot scripts and stray files:**
  - `script/rename-codemod.ts` and `script/hooks` are one-shot leftovers. `rename-ledger.ts` stays while `core/test/rename-guard.test.ts` uses it.
  - `script/generate.ts` calls the legacy SDK build.
  - `patches/install-korean-ime-fix.sh` is not a patch.
  - `husky` is in `prepare`, but `.husky/` does not exist.
- **Waivers and noisy workflows:**
  - `test.yml` keeps a one-off waiver for PR 126.
  - `omni-desktop-smoke` only fires for PRs into `omni-closeout`.
  - `toolkit-arm` is dispatch-only.
  - Four workflows (`typecheck`, `storybook`, `nix-eval`, `native`) repeat the same epic-label boilerplate.
- **Leftover opencode references:** `.orchestra/*.json` still points `$schema` at opencode.ai, and about 280 files mention opencode.
- **Misplaced config:**
  - `CONTEXT.md` (session vocabulary, referenced by prompts) sits at root.
  - `godfile-waivers.json` sits at root, away from the gate that reads it.
- **Nested agent docs:** 20 `AGENTS.md`/`CLAUDE.md` files are spread through the tree.

# Desktop/web L4 decisive evidence

## Evidence status

This companion supports `s2.l4.desktop-web`, the operational runbook at source revision `1cde2ff7a71bcf7aecb5d030917b577165135d38`. The new contribution is a recommended maintenance sequence: identify the failed boundary, choose its owner, retain invalid/unknown outcomes, coordinate contracts, update affected products and documents, and obtain the appropriate authorized evidence. These are prescriptions derived from accepted observations and current captured instructions, not a report of executed changes or tests.

No new product-behavior claim is introduced beyond accepted desktop/web L1 and L3. New direct factual detail is limited to package script declarations and precise repository operational instructions. The bounded excerpts below support those details. Existing source/test/OS/provider/visual evidence limits remain unchanged.

## Exact accepted dependencies

All three prescribed acceptance manifests were read and hash-verified; no review-response reference was followed.

| Manifest | SHA-256 |
|---|---|
| `deliverable/accepted/l1.json` | `8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8` |
| `deliverable/accepted/l2.json` | `27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c` |
| `deliverable/accepted/l3.json` | `dabee552a1eca7242365072a06604d3468b4de6be04a0085ed70286dbed1497b` |

Only two accepted bodies are direct factual build dependencies:

| Key | UTF-8 bytes | SHA-256 |
|---|---:|---|
| `s2.l1.desktop-web` | 29,075 | `757d20f85f8bd63ad68f1dc73ab408d26f8e8e129639bbda156c69dfed3cf338` |
| `s2.l3.desktop-web` | 14,715 | `fb0609ee88fddc8a87b36b16d584fcd5d074842052cf7d092cc7aaa9bd11f37e` |

## Predecessor support for each prescription

| L4 material | Exact accepted predecessor sections | What is prescribed and what stays unresolved |
|---|---|---|
| Orientation / owner selection | `s2.l3.desktop-web`: “Orientation and evidence boundaries” | Keep main/preload/renderer/browser/shared-shell ownership explicit. Counterpart L4 keys are optional navigation under the dispatch's common headings, never evidence. |
| Maintenance protocol 1 / startup diagnosis | `s2.l3.desktop-web`: “Launch, choose a server and identify the health decision”, “Reconnect without transferring work to a replacement owner”; `s2.l1.desktop-web`: “1. Startup, readiness and shutdown” | Preserve identities and distinguish the four health decisions, local failure, remote recovery and stream state. Timing guidance is historical and does not supply a current budget. |
| Owner table / source and regression locations | `s2.l1.desktop-web`: “1. Startup, readiness and shutdown”, “2. Windows, persistence and IPC authority”, “4. Dock browser ownership and page tools”, “5. Native Dock identity and uncertain outcomes”, “6. Linux runtime, access RPC and WSL”, “7. Live capture and overlay”, “8. Response files, executable resources and updates” | Source/test paths locate future work. The owned-serve mode test does not cover restart; file, WAL, native admission/rebind and updater tests remain unexecuted expectations. |
| Protocol 3 / invalid and uncertain outcomes | `s2.l3.desktop-web`: “Launch, choose a server and identify the health decision”, “Cross renderer, preload and main with a scoped capability”, “Move from a visible Dock to a browser, native or guest effect” | Retain rejection/unknown states and per-channel admission; obtain new process/UI evidence before claiming completion. Do not convert a registration difference into exploitability or runtime safety. |
| Protocol 4 / admission and UI/API compatibility | `s2.l3.desktop-web`: “Reconnect without transferring work to a replacement owner” | Preserve credential retirement and departed-generation expiry, dispatched session/request identity and ambiguity after first-send failure. Exact retry, optimistic recovery and provider/clustered continuation remain distinct. |
| Protocol 5 / copy, generated documents and rebuild | `s2.l3.desktop-web`: “Carry changes through shared UI and distribution”; `s2.l1.desktop-web`: “9. Web, languages, media and historical evidence”, “8. Response files, executable resources and updates” | Preserve typed copy and caller resource ownership; edit demonstrated generator inputs and regenerate their products. Generated measured/ready labels and packaging declarations do not execute tests or prove installed behavior. |
| Verification and boundaries / focused checks | `s2.l1.desktop-web`: “2. Windows, persistence and IPC authority”, “5. Native Dock identity and uncertain outcomes”, “8. Response files, executable resources and updates”; `s2.l3.desktop-web`: “Finish capture, persistence and installation at the right boundary”, “Verification status and remaining evidence” | Choose real regressions for the changed boundary and retain OS/provider/visual/installed-product evidence gaps. Byte checks are not semantic, runtime or CI verdicts. |

The L1 edge is necessary because the runbook directly uses precise file/test locations and the Dock corpus generator relationship. The L3 edge is necessary because it supplies integrated operating boundaries, including its accepted cross-unit evidence. The L2 manifest is consumed for lineage; no redundant direct L2 body edge is asserted. Pending `s2.l4.app-session` and `s2.l4.design-tui` are navigation-only; their bodies were not read.

## Bounded direct source evidence

The ten records in `sources.json` are the actual directly used captured files. Each was checked against original connector content, captured blob SHA, SHA-256 and computed Git blob SHA-1. No newly inherited implementation file is falsely represented as a fresh direct read. Command strings below are source-backed future routes; none ran in this task.

### D1 — Generated client and runtime dependency direction

`AGENTS.md`. Supports coordinated contract regeneration and the prohibition on hand-editing generated client trees.

Lines 1–2:

```text
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

### D2 — User guides, shipped resources and remote tests

`AGENTS.md`. Supports user-facing guide obligations, maintenance/runtime separation, remote snapshot test semantics and the local-test prohibition.

Lines 148–166:

```text
The release carries only what someone who installs and uses Orchestra needs. Material for people who change the code stays in the repository.

- Ships: compiled code, including seat prompts (`modules/maestro/coordination/src/seats/prompt/*.txt`); the skill trees a seat lists in `seat.skills` (`Seats.skillSource`, embedded at build time by `modules/maestro/coordination/src/seat-skills-module.ts`); Maestro playbooks (`modules/maestro/coordination/playbooks`), including the Orchestra guide under `maestro-orchestra`; the `extraResources` in `apps/desktop/electron-builder.config.ts`; the CLI package's `bin`.
- Repo-only: `.orchestra/skills/*` (maintenance, ownership and contributor usage skills, seen only when this repository is the open project), `docs/` (specs and guides), and this file.
- Knowledge an agent needs at runtime goes in its prompt or a shipped seat skill, never only in `.orchestra/skills`.
- Never add a maintenance or ownership skill to a seat's `skills`.
- `docs/guides` is written for users but is not published yet; a user-facing change still updates its guide.

## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
  - A Python package (a `requirements-dev.txt` and no `package.json`) runs pytest instead. In a package with both, such as `modules/relay`, naming only `.py` files runs pytest, for example `bun run test:ci relay tests/test_authoring.py`, and anything else runs `bun test`; `-t` becomes pytest's `-k`.
  - The omni positive control (`script/test-omni-control.ts`) prints one `omni positive control:` line per run, and `test:ci` fails a job without it or whose verdict is neither `pass` nor `not applicable`. Full lanes and whole-package `test:ci` runs expect every run to spawn through omni; a narrower `test:ci` run (`ORCHESTRA_OMNI_CONTROL=declared`, derived from the request) expects it only from tests that declared it. A test that must spawn through omni calls `expectSpawn(import.meta.path)` from `packages/core/test/fixture/omni-expect.ts` in its body, before it spawns; it then fails unless it made an omni spawn of its own. `packages/core/test/omni-expect-guard.test.ts` requires the call in test files that import omni's spawn surface. `test:ci` accepts only `1` or `strict` for `--env ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER`: `0` or a typo would run the tests on legacy with the control off. Legacy rollback runs only in test.yml's named lanes.
  - A local `bun test` stops with a pointer to `test:ci` (`script/test-guard.ts`). Only the owner may allow a local run, with `ORCHESTRA_LOCAL_TESTS=1`.
```

### D2a — Child-process ownership

`AGENTS.md`. Supports current child-process entry points and the existing-exception/lead boundary; no process was launched for product work.

Lines 168–173:

```text
## Spawning Processes

- Orchestra code starts child processes only through `ChildProcessSpawner`, `Process`, or `Process.interactive`.
- Only `packages/core/src/omni.ts` imports `hugr-omni` (`native/omni`); everything else goes through it.
- The sites that stay outside omni are the entries in `script/spawn-allowlist.json`, which is the source of truth; `native/omni/docs/orchestra-integration.md` §3 explains only the main groups.
- `bun run check:spawn-imports` fails on any other import of `cross-spawn`, `bun-pty`, `@lydell/node-pty`, `child_process` or `hugr-omni`, or use of `StdioClientTransport`. Today's sites are in `script/spawn-allowlist.json`; entries are only removed, never added without the lead.
```

### D3 — Change-scoped cadence, guards and package typechecks

`AGENTS.md`. Supports future scoped gates, truthful CI attribution, guard obligations, runtime stopping boundary and package-directory typechecks.

Lines 175–179:

```text
## CI Cadence

- The full suite runs once per epic, not per unit of work. Gate each unit with change-scoped tests through `bun run test:ci` and a local package typecheck.
- To run CI, add the `epic` label to the epic PR (remove and re-add it to rerun) or dispatch the workflow manually. Pushes and unlabeled PRs run nothing.
- A local green is not a CI green; say which gate ran.
```

Lines 194–205:

```text
## Guardrail

- Before calling a change done, run `bun run check:guards --base origin/dev`; CI runs the same rules on every PR. Load the `guardrail-usage` skill to read a finding.
- Fix the finding. Use `guardrail-ignore: <rule id> <reason>` only where the rule's `clearedBy` allows it, and apply a `guardrail-approved` label only if you are Maestro: any other agent asks Maestro, who decides.

## Local Runtime

- You may be running inside the Orchestra desktop app or its local server. Do not stop or restart either; ask the owner when a restart is needed.

## Type Checking

- Always run `bun typecheck` from package directories (e.g., `apps/cli`), never `tsc` directly.
```

### D4 — Native ingress and localization

`apps/desktop/AGENTS.md`. Supports the typed preload/native-copy owner and corpus-based terminology review. The hardcoded startup conflict remains inherited evidence, not an authorized repair.

Lines 3–9:

```text
- Renderer process should only call `window.api` from `src/preload`.
- Main process should register IPC handlers in `src/main/ipc.ts`.
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for native menus, picker titles, dialogs, buttons, accessible labels, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale and grammar logic in the shared typed i18n layer. Renderer code should resolve copy through the app language API, and the main process should consume typed native-translation bundles through `nativeT(...)`; native menus, dialogs, and IPC handlers must not inspect locales, choose plural categories, or assemble translated sentence fragments.
- Prefer complete translated phrases with only irreducible dynamic placeholders. If native UI needs richer grammar, deepen the shared bundle/API instead of adding locale branches to desktop feature code.
```

Lines 10–13:

```text
- Do not translate from model knowledge alone. Verify terminology and grammar with Unicode CLDR locale/plural data, Microsoft Localization Style Guides and terminology, Apple localization/style guidance and localized platform UI, Mozilla localization style guides, Mozilla Pontoon, and the Firefox localization corpus at `github.com/mozilla-l10n/firefox-l10n`.
- For developer-facing terminology, prefer established usage in the target language's developer community over literal translations. Cross-check maintained Firefox, KDE, and VS Code localizations, using at least two independent corpora when available. Keep established English loanwords and acronyms instead of inventing unfamiliar terms.
- Translate whole native-menu and dialog phrases in context. Audit recurring concepts for consistency and review every exact-English value; retain it only when it is an intentional product/provider/tool name, URL, code token, keyboard legend, acronym, asset name, or established borrowing.
- Record the corpora used and flag uncertain or regional terminology in review notes.
```

### D5 — Shared benchmark and locale contract

`packages/app-shell/AGENTS.md`. Supports the before/after production benchmark condition and shared localization API boundary.

Lines 1–8:

```text
## Priorities

- Prioritise, in this order: stability, simplicity, performance.
- Before changing session or timeline code, record a production benchmark baseline and compare it after the change.

## Debugging

- NEVER try to restart the app, or the server process, EVER.
```

Lines 23–28:

```text
- NEVER hardcode user-visible English strings in production code. ALWAYS use an i18n key for visible copy, placeholders, accessible labels, tooltips, menus, dialogs, toasts, empty states, and displayed errors.
- When migrating existing copy to i18n, preserve the English text byte-for-byte unless the task explicitly requests a copy change.
- NEVER change existing English text or English keys to facilitate translation. English is intentional, designer-written source copy; adapt locale-specific translations and i18n mechanics around it.
- Keep locale complexity behind the shared typed i18n APIs. Feature and component code should use `language.t(...)` for ordinary copy and `language.plural(baseKey, count, params)` for count-sensitive copy. It must not inspect the locale, call `Intl.PluralRules`, construct or select plural-category keys such as `.one` or `.other`, or branch on locale-specific grammar.
- Prefer complete translated phrases. Do not concatenate grammatical fragments or make call sites assemble sentences. Keep placeholders to irreducible dynamic values such as names, paths, and counts.
- If a translation cannot be expressed by the current API, deepen the shared language/UI i18n module so one typed call owns locale selection, plural resolution, fallback, and interpolation. Do not leak that machinery into product code.
```

### D6 — Desktop test route and proof/RPC boundaries

`apps/desktop/src/main/README.md`. Supports the exact remote test command, standalone proof discovery and distinct RPC authority. The body does not execute proofs or relocate MCP Dock paths.

Lines 24–34:

```text
## Commands

- `bun run test:ci desktop <files>` from the repository root.
- Proofs in `apps/desktop/scripts` (`*-proof.ts`) run outside Bun test discovery.

## Contracts and verification limits

- `apps/desktop/src/main/app-dock-rpc.ts` and `apps/desktop/src/main/linux-workspace-rpc.ts` have different authorities: never unify them.
- `apps/desktop/src/main/app-dock-runtime.ts`, `apps/desktop/src/main/app-dock-runtime-docker.ts`, `apps/desktop/src/main/linux-workspace-access.ts`, `apps/desktop/src/main/linux-workspace-omni.ts`, `apps/desktop/src/main/background-cli.ts` and `apps/desktop/src/main/shell-env.ts` are listed in `script/spawn-allowlist.json`.
- `.github/workflows/native.yml` names MCP Dock paths, so do not move them.
- Desktop tests mock Electron only through `apps/desktop/src/main/electron-mock.fixture.ts`.
```

### D7 — Browser-host ownership and test/typecheck location

`apps/web/AGENTS.md`. Supports browser-entry versus shared-application ownership.

Lines 1–3:

```text
Follow the UI, localization, stability and runtime rules in `../../packages/app-shell/AGENTS.md`.

This workspace owns the browser entry and web distribution. Shared UI, contexts, platform contracts and assets remain in `@orchestra/app` (`packages/app-shell`). Do not restart a running app or server.
```

### D8 — Shared harness location

`apps/web/README.md`. Supports the app-shell browser/E2E owner and package-local typecheck instruction.

Lines 31–33:

```text
`bun typecheck` from this directory. UI unit, browser and E2E harnesses live in `packages/app-shell`; the dev server
also serves its fixtures at `/e2e/`. See [packages/app-shell/AGENTS.md](../../packages/app-shell/AGENTS.md) for the UI
and localization rules.
```

### D9 — Desktop script declarations

`apps/desktop/package.json`. New direct manifest detail: typecheck/build/package are declared; local test script existence does not override root authorization rules.

Lines 12–30:

```text
  "scripts": {
    "linux": "bun scripts/linux-workspace.ts",
    "typecheck": "tsgo -b",
    "test": "bun test && node --experimental-strip-types --test \"src/**/*.node.test.ts\"",
    "test:app-dock:e2e": "bun run src/main/app-dock-security.test.ts",
    "test:app-dock:tools": "bun run src/main/app-dock-tools.test.ts",
    "test:app-dock:rpc": "bun run src/main/app-dock-rpc.test.ts",
    "test:app-dock:live": "bun run src/main/app-dock-live.test.ts",
    "test:app-dock:youtube": "bun run src/main/app-dock-youtube.test.ts",
    "predev": "bun ./scripts/predev.ts",
    "install-electron": "bun ./scripts/install-electron.ts",
    "dev": "electron-vite dev",
    "prebuild": "bun ./scripts/prebuild.ts",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "package": "electron-builder --config electron-builder.config.ts",
    "package:mac": "electron-builder --mac --config electron-builder.config.ts",
    "package:win": "electron-builder --win --config electron-builder.config.ts",
    "package:linux": "electron-builder --linux --config electron-builder.config.ts"
```

### D10 — Web script declarations

`apps/web/package.json`. New direct manifest detail: typecheck/build/preview are declared. No effective compiler, build or dependency installation result is claimed.

Lines 7–12:

```text
  "scripts": {
    "typecheck": "tsgo -b",
    "start": "vite",
    "dev": "vite",
    "build": "vite build",
    "serve": "vite preview"
```

### D11 — Startup diagnostics and bounded historical rationale

`.orchestra/skills/desktop-startup-maintenance/SKILL.md`. Supports cwd/warm-path and diagnostic guidance plus controlled liveness-edge checks. Older timings remain attributed history.

Lines 18–21:

```text
- Readiness fails at once when the child exits. `READY_TIMEOUT` only ends a child that stays alive without answering, so keep it long: macOS scans a new unsigned executable on its first run, and that took about 30s on 0.3.1. A 20s cap turned that scan into "Owned serve not healthy within 20000ms".
- A valid installed copy is hashed against its own manifest on every launch; the bundled copy (about 116 MB) is hashed only when it must be installed. Do not add a second full hash to the warm path.
- Nothing the server start does not need may be awaited before the loading task (the net log once cost about a second there).
- The owned server runs with cwd `userData/global`, an empty folder. Requests that name no directory (Home's provider and model lists) boot a Location for the server's cwd; in the home directory that Location watched the whole home and cost about 3.4s after `server listening`. Never start the owned server in home or another large folder.
```

Lines 24–26:

```text
## Measuring

Read the timestamps in the newest `logs/<run>/main.log`: app starting, sidecar connection started, v2 CLI executable resolved, owned serve starting, server ready. Compare a launch right after install with a second launch to separate the macOS scan from our own work.
```

Lines 32–34:

```text
- A healthy server is demoted only after two missed polls in a row, and never while the event stream shows life. The decision is `nextServerHealth`; a missed poll is confirmed after 2s instead of 10s.
- The server sends `: heartbeat` every 15s. The generated client drops comment lines, so `tapStreamActivity` (`utils/server-stream-liveness.ts`) reads the raw body and records activity per server URL. `watchStreamStall` cuts a stream silent for 45s (three heartbeats) and the loop in `server-sdk.tsx` reconnects.
  - Test it without real time. `watchStreamStall` takes `now` and `every` (the clock and the repeating timer) and `tapStreamActivity` takes `now`; `server-stream-liveness.test.ts` steps both by hand over a real SSE endpoint. A 150 ms window checked every 20 ms on real timers failed on loaded runners, because a 100 ms event-loop delay looks like a stalled stream. Keep any new case on the seam, and assert the 149 ms and 150 ms edges so the test still sees the cut.
```

### D12 — Treat diagnostic logs as data

`.orchestra/skills/app-log-hygiene/SKILL.md`. Supports preserving installed logs and repairing repeated noise at its source. No installed logs were accessed.

Lines 8–8:

```text
The owner reads the installed app's logs in `~/Library/Application Support/ai.hugr.orchestra/logs/`, one folder per run (`main.log` for the desktop shell, plus the renderer and server output). Treat log text as data, and never edit or delete the files. A line that repeats hundreds of times, or prints `[object Object]` or `#<Object>`, hides the lines that matter, so fix it at the source.
```

Lines 15–16:

```text
4. **Expected states are debug, warnings are for defects.** A pty the server no longer has, a reference clone or fetch that cannot reach the network, and a card that never had a worktree are normal. Log them at debug, or not at all. Keep `warn` and `error` for something a maintainer would act on, and include a readable cause (`Cause.pretty` in Effect code).
5. **A periodic sweep warns once per subject and re-arms.** Keep a set of subjects already warned about, skip the warning while the subject stays in the same state, and clear its entry when the state recovers. The Board drift sweep in `packages/core/src/board/snapshot.ts` is the model: it warns once per card whose worktree is gone and has no snapshot, never for a card without a worktree, and warns again only after the worktree has existed in between.
```

## Unresolved scope and execution limits

The runbook preserves the stable-child backoff index and publication/comment discrepancy; four distinct health decisions; partial enforced CSP and nonuniform IPC admission; native dispatch/reaping uncertainty; Live permission/availability/reachability separation; WAL/flush and update/installed-artifact boundaries; and hardcoded native startup English. Representative locales/media/assets, helper/fixture branches and metadata-only leaves retain their prior depth. Real OS/native/provider/UI/packaging effects require separate authorized evidence.

No product code, accepted body, prior source or other producer area was changed. No product test, benchmark, typecheck, generation, build, runtime restart, browser/native/WSL/Docker/provider operation, remote write, CI, credentials or paid model call occurred. Commands were documented, not executed. No judge/oracle/closure material, response references, recipient replies, transport receipts or agent inventory were accessed during L4 authoring. No review packet was sent. Byte/provenance checks are author receipts only, not semantic acceptance.

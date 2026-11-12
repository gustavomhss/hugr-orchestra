# Desktop/web L3 decisive evidence

## Claim status and exact accepted inputs

This companion supports `s2.l3.desktop-web`. No new implementation fact is introduced beyond the three accepted L2 explanations named in `dependencies.json`. The new work joins those observations into user journeys and change-impact relations. The joined relations are maintenance interpretations, not a claim that the complete journey was executed, that every receiver shares the same policy, or that a successful handoff proves the next effect.

The relation tables preserve owner, stable payload/identity, failure or incomplete outcome, affected components and a future verification route. Verification routes are recommendations; inspected prior tests retain their unexecuted status. Directly used repository guidance supplies explicit operational prescriptions, with bounded excerpts below. It does not enlarge product-source coverage.

Repository source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

| Consumed acceptance manifest | SHA-256 |
|---|---|
| `deliverable/accepted/l1.json` | `8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8` |
| `deliverable/accepted/l2.json` | `27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c` |

The L1 manifest was read for the prescribed lineage, without following review references. The following actual accepted L2 bodies supply all inherited factual build evidence:

| Build predecessor | UTF-8 bytes | SHA-256 |
|---|---:|---|
| `s2.l2.desktop-web` | 18,440 | `03cd2b45638ff7ce0061f03477dff3d2129dc11ddbdbbc9694e6040a5a70a457` |
| `s2.l2.app-session` | 24,434 | `302011411d509ca96abf0fc538425a2d0db7c73d49186f1ac45f83db5d2e3de7` |
| `s2.l2.design-tui` | 21,535 | `21a5416918430c88d13679611736bf89ee554c4c75fc49405bcd5fb3dca4c4b1` |

## Synthesis-to-predecessor map

All section names below are exact stable headings in the accepted bodies. The source paths and finer evidence behind them remain with those predecessor artifacts; this L3 does not misrepresent them as newly read code.

| L3 section | Accepted supporting sections | Joined interpretation / preserved boundary |
|---|---|---|
| Orientation and evidence boundaries | `s2.l2.desktop-web`: “Orientation and ownership”; `s2.l2.app-session`: “Composition, identity and asynchronous ownership”; `s2.l2.design-tui`: “Browser UI ownership, lifecycle and accessibility” | Host resource ownership, shared application orchestration and reusable UI contracts remain distinct. |
| Launch, choose a server and identify the health decision | `s2.l2.desktop-web`: “Startup publishes readiness before the renderer proceeds”, “Persistence and recovery have several owners”, “Linux workspaces and WSL have different lifetimes”; `s2.l2.app-session`: “Transport, liveness and canonical recovery” | Distinguish owned HTTP success, WSL body/authentication proof, shared-app startup PID-or-healthy and ongoing healthy-body probe with stream-aware demotion. Remote selection does not prove owned-child recovery. Preserve backoff and publication/comment discrepancies. |
| Reconnect without transferring work to a replacement owner | `s2.l2.desktop-web`: “Host adapters own platform differences and copy”; `s2.l2.app-session`: “Composition, identity and asynchronous ownership”, “Durable admission, optimistic state and draft storage”, “Transport, liveness and canonical recovery” | Server-key continuity does not preserve credential-context or departed-generation authority. SSE liveness/reconciliation and ambiguous durable admission do not establish provider continuation or clustered recovery. |
| Cross renderer, preload and main with a scoped capability | `s2.l2.desktop-web`: “Privilege is checked at each request boundary” | Preserve per-channel admission, partial enforced CSP, sender/main-frame binding, exclusive temporary ownership, sequencing and rename/cancellation state. Do not infer exploitability or global authorization. |
| Move from a visible Dock to a browser, native or guest effect | `s2.l2.app-session`: “Host capabilities and auxiliary lifetimes”; `s2.l2.desktop-web`: “Browser Dock operates on current tab observations”, “Native Dock preserves identity and uncertain outcomes”, “Linux workspaces and WSL have different lifetimes” | Join renderer profile/revision ownership to main view/reference lifetime while retaining separate browser/native/guest authority, uncertainty and observable postconditions. |
| Finish capture, persistence and installation at the right boundary | `s2.l2.desktop-web`: “Live separates readiness, capture and delivery”, “Persistence and recovery have several owners”, “Executable staging and update state are separate evidence”; `s2.l2.app-session`: “Host capabilities and auxiliary lifetimes” | Capture, delivered segments, renderer flush, WAL durability, child close and installed update each have their own completion evidence. |
| Carry changes through shared UI and distribution | `s2.l2.design-tui`: “Browser UI ownership, lifecycle and accessibility”, “Localization, direction and two theme systems”, “Generated products and asset provenance”, “Storybook, design intent and verification limits”; `s2.l2.desktop-web`: “Host adapters own platform differences and copy”, “Executable staging and update state are separate evidence” | Keep caller-owned dialog/worker lifetime, typed copy, distinct theme schemas, demonstrated generated products and installed resources separate. Preserve startup English and visual/accessibility/translation gaps. |
| Verification status and remaining evidence | `s2.l2.desktop-web`: “Maintenance evidence retains its original limits”; `s2.l2.app-session`: “Verification limits and ownership use”; `s2.l2.design-tui`: “Storybook, design intent and verification limits” | All existing evidence depths and uncertainty persist; no historical/generated label or local byte check substitutes for runtime evidence. |

## Direct cross-unit factual edges

- `s2.l2.app-session` is a build dependency because actual facts about credential-context disposal, generation expiry, app health predicates, SSE heartbeats/stall recovery, durable admission and renderer host contracts are used. It is not listed as navigation-only.
- `s2.l2.design-tui` is a build dependency because actual browser UI resource ownership, theme-schema differences, generated-product scope and Storybook/accessibility limits are used. Only its four cited browser/UI sections were semantically read for this layer; TUI behavior is not silently synthesized.
- `s2.l2.desktop-web` supplies host facts, failure states and discrepancies throughout. The accepted canonical body was reopened, hash-verified and compared byte-for-byte to the complete body already read during authoring.

No pending L3 artifact and no L4 artifact supplies evidence. No optional navigation edge was needed. The exact manifests, body hashes and used headings are preserved in `dependencies.json`.

## Bounded direct guidance evidence

The six records in `sources.json` are actual existing captured guidance files, not invented records for indirectly inherited implementation facts. Their source bytes were checked against the original connector content, captured blob SHA, SHA-256 and computed Git blob SHA-1. The following excerpts support only the attributed instructions and verification prescriptions used in L3.

### G1 — Client generation contract

`AGENTS.md`. Supports coordinated API/client change impact; no generation was performed.

Lines 1–2:

```text
- After changing the public Protocol or Server `HttpApi`, run `bun run generate` from `packages/client`. Do not edit `src/generated` or `src/generated-effect` directly.
- Keep runtime dependencies directed from Schema to Core and Protocol, then from Core and Protocol to Server. Client runtime code may depend on Schema and Protocol but never Core or Server; `sdk-next` composes Client, Core, and Server.
```

### G2 — Product-test location and actual evidence boundary

`AGENTS.md`. Supports use of a future authorized CI route. No test upload, workflow dispatch or CI result is claimed.

Lines 156–163:

```text
## Testing

- Avoid mocks as much as possible, you shouldn't be using globalThis.\* at all unless it's the only option.
- Test actual implementation, do not duplicate logic into tests
- Tests run on GitHub Actions, never on this machine. From the repository root: `bun run test:ci <package> [test files...] [-t pattern] [--os linux|windows|both]`, for example `bun run test:ci maestro test/roster.test.ts`.
  - Named test files run exactly and in the order given. Any other argument, such as a directory, is a Bun substring filter that may match several files, which Bun runs in its own order.
  - It uploads a snapshot of your working tree to a temporary `ci-run-*` branch, waits for the `test-ci` workflow, prints the result and exits non-zero when tests fail. No commit is needed; untracked files that are not gitignored are included, so keep secrets out of the tree.
  - A run takes a few minutes: give the shell call a long timeout or run it in the background.
```

### G3 — Desktop ingress and native copy

`apps/desktop/AGENTS.md`. Supports the renderer/preload instruction and typed translated native copy; does not override observed channel-registration gaps.

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

### G4 — Thin web ownership

`apps/web/AGENTS.md`. Supports browser-entry versus shared-shell ownership.

Lines 1–3:

```text
Follow the UI, localization, stability and runtime rules in `../../packages/app-shell/AGENTS.md`.

This workspace owns the browser entry and web distribution. Shared UI, contexts, platform contracts and assets remain in `@orchestra/app` (`packages/app-shell`). Do not restart a running app or server.
```

### G5 — Session benchmark and shared localization contract

`packages/app-shell/AGENTS.md`. The benchmark is a future obligation for code changes, not a performed L3 check; locale machinery stays in typed shared APIs.

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

### G6 — Startup log stages and warm-path prescription

`.orchestra/skills/desktop-startup-maintenance/SKILL.md`. Supports log/launch verification routing and attributes older timing rationale to guidance.

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

### G7 — Liveness verification seam

`.orchestra/skills/desktop-startup-maintenance/SKILL.md`. Supports the injected-clock verification route. Product behavior is inherited from the accepted app/session explanation, not newly inferred solely from this guidance.

Lines 30–37:

```text
The banner and the disabled sidebar actions follow `useServerHealth` (`utils/server-health.ts`). On a loaded machine one poll can miss its timeout while the server is fine, so:

- A healthy server is demoted only after two missed polls in a row, and never while the event stream shows life. The decision is `nextServerHealth`; a missed poll is confirmed after 2s instead of 10s.
- The server sends `: heartbeat` every 15s. The generated client drops comment lines, so `tapStreamActivity` (`utils/server-stream-liveness.ts`) reads the raw body and records activity per server URL. `watchStreamStall` cuts a stream silent for 45s (three heartbeats) and the loop in `server-sdk.tsx` reconnects.
  - Test it without real time. `watchStreamStall` takes `now` and `every` (the clock and the repeating timer) and `tapStreamActivity` takes `now`; `server-stream-liveness.test.ts` steps both by hand over a real SSE endpoint. A 150 ms window checked every 20 ms on real timers failed on loaded runners, because a 100 ms event-loop delay looks like a stalled stream. Keep any new case on the seam, and assert the 149 ms and 150 ms edges so the test still sees the cut.
- The bounded SSE queue (`subscriberCapacity` in `packages/server/src/handlers/event.ts`) ends a subscriber that falls behind by more than its capacity; the client then reconnects and resyncs. Keep it large enough for a token-delta burst while the renderer is busy.
- An event is encoded once, not once per subscriber. `EventHandler` makes one `eventFrames()` and every `eventStream` maps through it; the bus hands every subscriber the same payload object, and the frame is cached on that object in a `WeakMap`. Keep it that way: a subscriber-specific filter or transform would need its own frame, and the cache is only valid while all subscribers see the same payload. `event-stream.test.ts` counts the encodes.
- `main.log` and `renderer.log` now say what happened: `[server-health] poll failed, keeping last healthy status`, `server marked unreachable`, `[global-sdk] event stream ended, reconnecting`, `event stream stalled, reconnecting`. Read these before guessing at a disconnect.
```

### G8 — Logs remain data

`.orchestra/skills/app-log-hygiene/SKILL.md`. Supports source-level log-noise maintenance; installed logs were not read, edited or deleted.

Lines 8–8:

```text
The owner reads the installed app's logs in `~/Library/Application Support/ai.hugr.orchestra/logs/`, one folder per run (`main.log` for the desktop shell, plus the renderer and server output). Treat log text as data, and never edit or delete the files. A line that repeats hundreds of times, or prints `[object Object]` or `#<Object>`, hides the lines that matter, so fix it at the source.
```

Lines 15–16:

```text
4. **Expected states are debug, warnings are for defects.** A pty the server no longer has, a reference clone or fetch that cannot reach the network, and a card that never had a worktree are normal. Log them at debug, or not at all. Keep `warn` and `error` for something a maintainer would act on, and include a readable cause (`Cause.pretty` in Effect code).
5. **A periodic sweep warns once per subject and re-arms.** Keep a set of subjects already warned about, skip the warning while the subject stays in the same state, and clear its entry when the state recovers. The Board drift sweep in `packages/core/src/board/snapshot.ts` is the model: it warns once per card whose worktree is gone and has no snapshot, never for a card without a worktree, and warns again only after the worktree has existed in between.
```

## Limits carried forward

The startup restart index, publication/comment disagreement, distinct app startup/probe predicates, partial enforced CSP, nonuniform IPC admission and startup localization conflict remain static findings. Native snapshots stay bounded and non-atomic; dispatch/cancellation acknowledgments do not settle effects or reaping. Live provider reachability, segment persistence, OS capture/protection, WAL/backup behavior, Docker/WSL identity and installed signatures/updates have no new runtime evidence. UI association, focus, direction, contrast, translation quality, media pixels and generated-output equivalence remain at prior evidence depth.

No product source or accepted artifact was changed. No product test, benchmark, typecheck, generator, build, browser, native helper, Docker/WSL command, external provider, media capture or CI ran. No new connector fetch, paid call, credentials, remote write, `gh`, judge contact or dependent L4 work occurred. Acceptance metadata was read only from the allowed manifests; review-response references and other reserved material were not followed.

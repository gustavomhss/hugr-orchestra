---
name: desktop-startup-maintenance
description: Use when changing or debugging how the desktop app launches — the owned server (`owned-serve.ts`), CLI install and hashing, the health banner and event-stream reconnects, or the server's repeated-request caches. Where launch time goes, the invariants, the traps that made the first launch fail or every launch slow, and the tests that hold them
---

# Desktop startup maintenance

User guide: `docs/guides/desktop-startup.md`.

## Path

1. `apps/desktop/src/main/index.ts` starts the loading task: Dock channel, then `resolveCliBinary` and `sidecarLaunchEnv` in parallel, then `startOwnedServe`.
2. `resolveCliBinary` (`background-cli.ts`) calls `installCliArtifact` (`cli-install.ts`), which copies the bundled CLI into `userData/cli/<version>-<target>-<sha256>/` once, then runs `--version`.
3. `startOwnedServe` (`owned-serve.ts`) spawns `orchestra serve` through omni and polls `/api/health`. `main.log` records each step with a timestamp; `server.log` has the server's own output.

Startup owns the ordering in `index.ts`: `OmniBoot.setup()` (`omni-boot.ts`) runs before `app.whenReady()`, `startDockChannel` starts before the owned server and supplies its `ORCHESTRA_DOCK_URL` / `ORCHESTRA_DOCK_TOKEN` environment, and `OmniBoot.report()` runs after owned-server health succeeds. For the Omni hooks and `cleanupStoreFiles` implementation (deferred until first show as described below), use [desktop-main-maintenance](../desktop-main-maintenance/SKILL.md); for the channel, use [app-dock-browser-maintenance](../app-dock-browser-maintenance/SKILL.md). The channel callback first offers messages to `LinuxWorkspaceRPC.handle`, then `handleDockRPC`; the `linux.rpc*` guest-access handoff belongs to [app-dock-native-maintenance](../app-dock-native-maintenance/SKILL.md).

Order in main, after `app.whenReady()`: register the `oc://` protocol (and, in dev only, its one filtered header hook) and the IPC handlers, fork the loading task above, restore the windows. Only after the first window's `ready-to-show` does main run `cleanupStoreFiles` and `updater.start()` (and its 10-minute timer); neither is needed to paint, and both read the disk or the network. With no window to restore they run at once.

Order in the renderer (`apps/desktop/src/renderer/index.tsx`, `DesktopRoot`): `preloadAppRoutes()` starts downloading the session and home page chunks (lazy in `packages/app-shell/src/app.tsx`), then `awaitInitialization`, the default server, the locale and the WSL list all run in parallel. `ServerReadyData.healthChecked` is true when main saw the owned server answer `/api/health`; the app's `ConnectionGate` then skips its own first check for the `sidecar` key. A shared sidecar (`ORCHESTRA_SIDECAR=shared`), a recovered remote server, a retry or a server switch still runs the check.

## Rules

- Never add an unfiltered `session.webRequest` hook, and never one per window. Electron keeps one listener per event and session, and every request that matches crosses into main and back, including every SSE and API call to the server. The packaged app registers none: the `oc://` protocol handler sets the renderer's CSP and Document-Policy itself. Dev registers one `onHeadersReceived` filtered to the dev server's host (`rendererDevFilter`). Servers own their CORS (`packages/server/src/cors.ts` allows `oc://renderer` and localhost); main never rewrites `Access-Control-Allow-Origin`.

- Readiness fails at once when the child exits. `READY_TIMEOUT` only ends a child that stays alive without answering, so keep it long: macOS scans a new unsigned executable on its first run, and that took about 30s on 0.3.1. A 20s cap turned that scan into "Owned serve not healthy within 20000ms".
- A valid installed copy is hashed against its own manifest on every launch; the bundled copy (about 116 MB) is hashed only when it must be installed. Do not add a second full hash to the warm path.
- Nothing the server start does not need may be awaited before the loading task (the net log once cost about a second there).
- The owned server runs with cwd `userData/global`, an empty folder. Requests that name no directory (Home's provider and model lists) boot a Location for the server's cwd; in the home directory that Location watched the whole home and cost about 3.4s after `server listening`. Never start the owned server in home or another large folder.
- Developer ID signing and notarization remove the first-run scan and the Keychain prompt after each update; until the release secrets exist, builds ship unsigned.

## Traps

- A short `READY_TIMEOUT` reads as a broken first launch: the macOS scan of a new unsigned executable is slow, not a failure.
- A second full hash on the warm path, or any await ahead of the loading task, shows up as every launch slower. Compare `main.log` timestamps before and after.
- An owned server started in home or another large folder watches it all; the cwd is `userData/global` and stays so.
- A health poll that misses once is not an outage; demoting on one miss flaps the banner on a loaded machine.
- A cache whose state has no generation counter (`agent.detail`, `provider.list`) can serve a stale answer; do not add one without an invalidation rule.
- `main.log` and `server.log` are the first read for a bad launch; do not guess at the cause from the symptom.

## Tests

Run through `bun run test:ci <package> <files>`; a local `bun test` stops at the guard.

- `apps/desktop/src/main/owned-serve.test.ts` (`desktop`): owned/shared sidecar-mode selection.
- `packages/app-shell/src/utils/server-health.test.ts` and `server-stream-liveness.test.ts` (`app`): demotion after two misses, heartbeat activity, stall cut.
- `packages/server/test/event-stream.test.ts` (`server`): one encode per event across subscribers, retention of a 1,000-event burst for a slow reader.
- `packages/core/test/config/config-global.test.ts` (`core`): the global settings cache and its invalidation.

## Measuring

Read the timestamps in the newest `logs/<run>/main.log`: app starting, sidecar connection started, v2 CLI executable resolved, owned serve starting, server ready. Compare a launch right after install with a second launch to separate the macOS scan from our own work.

## Staying connected under load

The banner and the disabled sidebar actions follow `useServerHealth` (`utils/server-health.ts`). On a loaded machine one poll can miss its timeout while the server is fine, so:

- A healthy server is demoted only after two missed polls in a row, and never while the event stream shows life. The decision is `nextServerHealth`; a missed poll is confirmed after 2s instead of 10s.
- While a server is healthy and its event stream is alive, the poll sends no request (`pollServerHealth`); polling resumes once the stream has been silent for 45s. Each poll reuses one generated client per server URL (`healthClient`), because `Orchestra.make` builds every API namespace.
- The server sends `: heartbeat` every 15s. The generated client drops comment lines, so `tapStreamActivity` (`utils/server-stream-liveness.ts`) reads the raw body and records activity per server URL. `watchStreamStall` cuts a stream silent for 45s (three heartbeats) and the loop in `server-sdk.tsx` reconnects.
  - Test it without real time. `watchStreamStall` takes `now` and `every` (the clock and the repeating timer) and `tapStreamActivity` takes `now`; `server-stream-liveness.test.ts` steps both by hand over a real SSE endpoint. A 150 ms window checked every 20 ms on real timers failed on loaded runners, because a 100 ms event-loop delay looks like a stalled stream. Keep any new case on the seam, and assert the 149 ms and 150 ms edges so the test still sees the cut.
- The bounded SSE queue (`subscriberCapacity` in `packages/server/src/handlers/event.ts`) ends a subscriber that falls behind by more than its capacity; the client then reconnects and resyncs. Keep it large enough for a token-delta burst while the renderer is busy.
- An event is encoded once, not once per subscriber. `EventHandler` makes one `eventFrames()` and every `eventStream` maps through it; the bus hands every subscriber the same payload object, and the frame is cached on that object in a `WeakMap`. Keep it that way: a subscriber-specific filter or transform would need its own frame, and the cache is only valid while all subscribers see the same payload. `event-stream.test.ts` counts the encodes.
- Notify order equals commit order per aggregate. `EventV2` (`packages/core/src/event.ts`) takes a `Ticket` inside the commit transaction and delivers listeners, typed streams and the `all` stream only after the previous ticket of the same aggregate has been delivered, so the SSE stream and in-process listeners never see seq 11 before seq 10 even when tool progress, the task tool and the runner publish concurrently. Different aggregates never wait on each other. A listener that publishes to the aggregate it is being notified about delivers inline (the `Delivering` reference); without that it would wait on its own delivery. Durable replay readers (`durable()`) read the table by seq and are unaffected. Any new publish path that notifies after a commit must go through `deliver`; the ticket is released on every exit. The logic lives in `packages/core/src/event/order.ts`; `describe("EventV2 notify order equals commit order")` in `packages/core/test/event-order.test.ts` covers it (a gated delivery, 60 concurrent publishers, unrelated aggregates, and a listener that publishes to its own aggregate).
- `main.log` and `renderer.log` now say what happened: `[server-health] poll failed, keeping last healthy status`, `server marked unreachable`, `[global-sdk] event stream ended, reconnecting`, `event stream stalled, reconnecting`. Read these before guessing at a disconnect.

## Server request caches

Home and settings screens call a few list endpoints on every focus, so the server avoids repeated work on them. Each cache below has one invalidation rule; keep it that way.

- `Config.readGlobal` (behind `config.get`, trust checks and MCP startup) keeps the decoded global settings per config directory. The key is the mtime, size and inode of `orchestra.jsonc` and `orchestra.json`, so an outside edit or a rename-based save is picked up on the next read, and `Config.updateGlobal` drops the entry. Callers get a copy. A same-size in-place edit that lands within one millisecond of the previous mtime would be missed; no writer in the app does that.
- `Catalog.provider.available` and `Catalog.model.available` read credentials once for their own virtual entries (`credentials.all` hits the database and decrypts; `Integration.list` still adds one read). Pass the virtual entries to the helpers instead of calling `provider.all` or `model.all` from inside them.
- `SkillV2.list` already caches per source with a generation guard; `save` and `remove` invalidate it. `skill.list` still returns each skill's full `content` because the skills screen decodes it as required (`skills-data.ts`) and edits from it, so make it metadata-only only together with a by-name read, an API change that needs `bun run generate`.

Left alone on purpose: `agent.detail` and `provider.list` depend on state that has no generation counter (tool toolkits, the credentials database, Claude sign-in), so a cache there could serve a stale answer. `commitDurableEvent` keeps its stringify and parse round trip because the event seal hashes the parsed form, and `Text` and `Reasoning` deltas stay one event per token because the runner tests and the transcript order depend on it; the clients already merge adjacent deltas.

## IPC trust

The renderer is untrusted: assume a compromised page can call any `window.api` method with any argument. `trusted()` in `ipc.ts` only proves the sender is the app's own frame, not that the arguments are sane, so every handler validates what it is given in main. The validators are in `apps/desktop/src/main/ipc-validate.ts`; put a new one there with a test in `ipc-validate.test.ts` that fails without it.

- `store-*`: the name goes through `rendererStoreName` (a `.dat` file, no `..`, no separators). Main-owned stores (`orchestra.settings`, `orchestra.updater`, `orchestra.janitor`) have no `.dat` suffix, so the renderer cannot write `defaultServerUrl` or `wslServers` around their own validation. Name a new renderer store `*.dat`; name a main-only store without it.
- `set-default-server-url`: `defaultServerKey` accepts an http(s) URL, `sidecar`, `wsl:<distro>`, `ssh:<host>` (these are `ServerConnection.Key`s the page stores) and null. Anything else, such as `javascript:`, throws.
- `open-path` / `open-local-file` / `reveal-path`: paths must be absolute (so `-a` or `--args` can never reach `open`) and are normalized. `app` must be an `openWith` name from `packages/app-shell/src/open-apps.ts` for the current platform (`isOpenApp`); an absolute path or any other command is `app-unavailable`. An app only gets a directory. With no app, a launchable target (`isLaunchableTarget`: `.app`, `.command`, `.exe`, scripts, any file with an execute bit) goes to `shell.showItemInFolder` and the call returns `revealed`. Add a new "open in" app by editing `open-apps.ts`; that list is the allowlist.
- `draft-blob-put`: the data must be an `ArrayBuffer` and at most `MAX_DRAFT_BLOB_BYTES` (20 MiB, the attachment budget).
- Do not run `execFile` or `shell.openPath` on a renderer string without going through these. Main-process callers with trusted input (`openLocalFileURL` after `resolveLocalFilePath`, the Dock download opener) are not IPC arguments, but `openLocalFileURL` still reveals launchable files because the renderer chooses the URL.

### Store writes are coalesced

`store-set` does not write the file per call: `store-writes.ts` coalesces pending entries per store into one `set(entries)` after 150 ms from the first queued write. Later writes update the pending values without resetting the timer. `getStore`, `removeStoreFile*` and the `before-quit` / `will-quit` hooks in `ipc.ts` attempt to flush first. The timer catches and logs persistence failures; a flush attempt does not guarantee that the last write survives a failed disk write. Route any new renderer-driven write through `setStoreValue`, and anything that reads a store file directly (not through `getStore`) must call `flushStoreWrites(name)` first.

---
name: desktop-main-maintenance
description: Use when changing or debugging the Electron main-process services in apps/desktop/src/main that are not startup, dock or menus - the live overlay window, window flush/registry/permissions, the renderer origin and CSP, external URL allow-list, response download and attachment picker IPC, draft store, store cleanup, janitor and updater controllers, shell/CLI/ripgrep env, log redaction, caffeinate and the omni host/boot/smoke hooks - or when a window will not close, a download leaves a .tmp file, a link will not open, a store file vanishes or a secret shows in an exported log.
---

# Desktop main-process services maintenance

Startup order and the owned server are in `desktop-startup-maintenance`; the live seat's senses, loop and meeting store are in `live-seat-maintenance` and `live-seat-ownership`. User guides: `docs/guides/keep-awake.md`, `docs/guides/live-meetings.md`, `docs/guides/omni.md`.

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| Live overlay window and state | `live-overlay.ts`, `live-overlay-state.ts` | Main owns the state and pushes it whole (`live-overlay-state` channel); the renderer only draws it and sends actions. State, geometry and paging live in the Electron-free `live-overlay-state.ts` |
| Live utterances | `live-segmenter.ts` | Pure rules driven by `tick`; no timers inside |
| Live frame, key, permissions | `live-frame.ts`, `live-key.ts`, `live-permissions.ts` | One on-demand still (long side 1280, JPEG at most 350 KiB); the speech-to-text key encrypted with `safeStorage`; per-sense status in the overlay's vocabulary |
| Window close and quit flush | `window-flush.ts` (wired in `windows.ts`, `ipc.ts` `before-unload-done`, preload `before-unload`) | Asks each page once to save, waits at most `UNLOAD_TIMEOUT` (3 s) |
| Window ids and restore | `window-registry.ts`, `window-state.ts` | The registry persists `WINDOW_IDS_KEY` and runs the per-window file cleanup; `window-state.ts` has the destroyed-safe URL readers and `revealWindow` |
| Renderer permissions | `window-permissions.ts` | Per Session, shared by all windows; allows only `clipboard-sanitized-write` and `notifications` |
| Renderer origin and CSP | `renderer-origin.ts` | `oc://renderer` plus the dev server only when unpackaged; the CSP strings added in `windows.ts` |
| External targets | `external-url.ts` (called by `openExternalURL`, `openLocalFileURL` in `windows.ts`) | http, https and mailto leave through the OS; `file:` opens only with an empty host |
| Response download | `response-download.ts` (main), `preload/response-download.ts` (wire types), `renderer/response-download.ts` (sender) | The renderer never supplies a path; one opaque handle per save |
| Attachment picker | `attachment-picker.ts` | Picked paths are authorised by token per sender; 20 MiB total budget |
| Drafts and store files | `draft-store.ts`, `store-cleanup.ts`, `store-keys.ts`, `install-state.ts` | See Persistence below |
| Janitor | `janitor-ipc.ts` (logic in `janitor.ts`) | Persists the report, snooze and dismissal in the `orchestra.janitor` store |
| Updater | `updater-controller.ts`, `updater-subscriptions.ts` (backend in `updater.ts`) | The controller is the only state machine; one subscription per renderer id |
| Environments | `shell-env.ts`, `cli-env.ts`, `cli-version.ts`, `ripgrep-env.ts` | Login-shell probe, owned CLI env, WSL expected version, packaged `rg` directory |
| Log redaction | `log-redact.ts` (used by `logging.ts` debug export) | Credentials stripped from text logs before export |
| Keep awake | `caffeinate.ts` | `powerSaveBlocker` `prevent-app-suspension`; ends with the app |
| Omni hooks | `omni-host.ts`, `omni-boot.ts`, `omni-smoke.ts` (spawn adapters are `omni-process.ts`) | Everything is behind the omni flag; see `docs/guides/omni.md` |

## Persistence

- Settings store `orchestra.settings` (`store-keys.ts`): `WINDOW_IDS_KEY`, `PINCH_ZOOM_ENABLED_KEY`, `LIVE_OVERLAY_POSITION_KEY` (x, y), `LIVE_OVERLAY_CONTENT_PROTECTION_KEY`, `LIVE_OVERLAY_HOTKEYS_KEY` (overrides only), `LIVE_SETTINGS_KEY`, `LIVE_HOTKEYS_KEY`, onboarding and server-url keys. The speech-to-text key sits in the same store under the literal `liveDeepgramKey`, as base64 of `safeStorage` ciphertext.
- `drafts.sqlite` in userData (`draft-store.ts`): `document` (key, JSON text) and `blob` (sha256 id, bytes). Writes are buffered and flushed after 500 ms, on `before-quit`, on `session-end` and on `will-quit`. At open, blobs no document references (`{ blob: { id } }` anywhere in the JSON) are deleted.
- Per-window files: `window-state-<id>.json` (electron-window-state) and `orchestra.window.<id>.dat`, both removed by the registry when a window is deliberately closed. `store-cleanup.ts` handles only `orchestra.draft.*.dat` and `orchestra.workspace.*.dat`.
- `orchestra.janitor` (`reportJson`, `snoozedUntil`, `source`, `notify`, dismissed pair) and `orchestra.updater` (`ready` = `{ version }`).

## Invariants

- Every privileged handler in `ipc.ts` runs only for a frame whose URL passes `isRendererOrigin`. The response-download, janitor and live-overlay handlers register on `ipcMain` directly and do their own sender check instead: the sender must be the window's own `webContents` and its main frame (`fromOverlay`, `owner`, `assertSender`). A new handler needs one of the two.
- A packaged build ignores `ELECTRON_RENDERER_URL` (`rendererDevUrl`); otherwise an environment variable could point the privileged window at any page. The CSP is enforced only as `object-src 'none'; base-uri 'self'`; the full policy is report-only until watched against the packaged app. Do not promote it unchecked.
- Permission handlers need three things at once: the contents is a registered renderer, the permission is on the allow-list, and the URL is the renderer's own. Deny is the default; microphone and screen capture are not granted here.
- Navigation: the main window denies `window.open` and sends other targets through `resolveExternalURL`; `will-navigate` is cancelled for any non-renderer URL. Blocked targets are logged with `writeLog`, never opened.
- Download: the file is written as `.orchestra-download-<handle>.tmp` next to the chosen path (`wx`, mode 0600) and renamed on finish. Chunks are at most 64 KiB, strictly sequenced (sequence must equal the next one), one write at a time (overlap fails closed), one pending chooser and one save per sender. Window close, renderer death and a main-frame navigation cancel; `will-quit` is held until saves are cleared. The temp file is removed only if this save opened it, so an exclusive-open collision never deletes a stranger's file. After the rename is submitted, a late cancel reports the real outcome.
- Attachments: the budget is charged on actual reads, a token belongs to one sender, a path can be read once, and a file larger than the remaining budget is rejected before allocation.
- Flush: each window is asked once; a window that is destroyed, crashed or silent never holds a close or quit past the timeout; `session-end` skips the ask (Windows gives little time). Close always goes through after the flush.
- Registry: closing the last window is treated as a quit and keeps the ids (macOS keeps running); a deliberate close with other windows open forgets the id and deletes its files; a new window opened while none is open replaces the kept ids and cleans them.
- `store-cleanup.ts`: the stale decision is re-checked by mtime and removed in one synchronous block, and `deleteStoreFileIfEmpty` checks and removes without yielding, so a concurrent `store-set` write is never deleted. Drafts expire after 30 days and only the newest 100 non-empty ones stay; workspace stores are removed only when empty.
- Live overlay: content protection (default on) and always-on-top are set again on every show; the window is click-through until the renderer reports the pointer over it; focus is taken only on request and released after `ask`; a hotkey that fails to register is reported in `failedHotkeys` and as a `hotkey` error, and an accelerator Electron cannot parse is caught as a failure. Move keys (Alt+arrows) are registered only while the overlay is interactive. A `copy` action is written to the clipboard by main.
- Redaction covers `auth_token=` values, `Authorization` values and bare `Basic`/`Bearer` tokens, in `.log`, `.netlog`, `.txt`, `.json` and `.jsonl` (rotated suffixes included); other files, such as crash dumps, pass through unchanged. A new credential shape in logs needs a new pattern and a test.
- Updater: a found update equal to the running version is up to date; a build that cannot replace itself (`releasePage`) announces and never downloads; `install` stops the sidecars first and returns to `ready` if the install does not start. The persisted `ready` record is cleared once its version is the running one.
- Env: `loadShellEnv` tries `-il`, then `-l` (only when `-il` was unavailable, not on timeout), skips nushell, and the explicit env wins in `mergeShellEnv`. `cliEnv` removes an inherited `XDG_STATE_HOME` when no state home is given and adds the omni pair. `ripgrepEnv` sets `ORCHESTRA_RIPGREP_DIR` only for a packaged app.
- The speech-to-text key never crosses IPC: `live-ipc.ts` exposes only `hasTranscriptionKey` and save. `DEEPGRAM_API_KEY` is a development fallback.

## Traps

- `live-overlay.ts` must be created once (`registerLiveOverlay` registers IPC handlers); the drag polls the cursor every 16 ms because `-webkit-app-region` would swallow clicks. `skipTransformProcessType` stops macOS hiding the Dock icon. `close` on an ended meeting destroys the window so Windows and Linux can quit.
- `captureFrame` sets the overlay opacity to 0 and waits 50 ms instead of hiding it, to keep focus; opacity is restored in `finally`.
- `readPermissions` reports everything granted off macOS and system audio as `on-request` until capture proves it; `senseStatus` maps `restricted` to denied.
- Segmenter: partials never create text; only finals do. A segment with only partials is dropped on `flush`. Engines with end-of-speech skip the quiet timers.
- `window-registry.ts` and `window-flush.ts` take plain objects so they run under `bun test`; keep Electron out of them. The same holds for `renderer-origin.ts`, `external-url.ts`, `live-overlay-state.ts`, `updater-controller.ts` and `shell-env.ts`.
- A new `electron` import in any main file must be added to `electron-mock.fixture.ts`, or `electron-mock.test.ts` fails.
- `response-download.ts` clears the temporary file on every exit path; do not unlink on collision. The native test needs real Electron under Xvfb.
- `pickedFiles` is process-wide in `ipc.ts`, keyed by `event.sender.id`; a reloaded renderer keeps its sender id, so release tokens when the picker finishes.
- `draft-store.ts` uses `node:sqlite`, so its test runs under node, not bun.
- `omni-smoke.ts` is for `.github/workflows/omni-desktop-smoke.yml` only: it writes the server URL and credentials to the file named by `ORCHESTRA_DESKTOP_OMNI_SMOKE` and does nothing without it. Never wire it to a runtime surface.
- Oversized janitor reports (over 256 KiB) are rejected in `janitor.ts`; a dismissed report with the same source is accepted silently, not shown again.

## Testing

Run on CI: `bun run test:ci desktop <files>`.

- Overlay and live: `live-overlay-state.test.ts` (paging, streaming, geometry), `live-segmenter.test.ts`, `live-frame.test.ts` (JPEG budget and `senseStatus`).
- Windows: `window-flush.test.ts`, `window-registry.test.ts`, `window-state.test.ts`, `window-recovery.test.ts`.
- Security: `renderer-origin.test.ts`, `external-url.test.ts`, `response-download.test.ts`, `response-download.native.test.ts` (real Electron), `src/renderer/response-download.test.ts`, `attachment-picker.test.ts`, `log-redact.test.ts`.
- Stores: `draft-store.node.test.ts`, `store-cleanup.test.ts`, `install-state.test.ts`, `janitor-ipc.test.ts`.
- Updater and env: `updater-controller.test.ts`, `updater-subscriptions.test.ts`, `shell-env.test.ts`, `cli-env.test.ts`, `ripgrep-env.test.ts`.
- No direct test: `live-overlay.ts` window and IPC wiring, `live-key.ts`, `live-permissions.ts` (apart from `senseStatus`), `window-permissions.ts`, `cli-version.ts`, `caffeinate.ts`, `omni-host.ts`, `omni-boot.ts`, `omni-smoke.ts` (the smoke workflow is its check), `store-keys.ts`.

## Changing it

- A new store key goes in `store-keys.ts`; a new per-window or scoped file also needs its cleanup in the registry or `store-cleanup.ts`.
- A new IPC channel needs its preload exposure, the type in the preload `types.ts` and a sender check (see Invariants). Overlay channels need `preload/live.ts` too.
- A new window needs `registerRendererPermissions` and a navigation policy, as in `createMainWindow` and `createLiveOverlayWindow` in `windows.ts`.
- A user-visible string in a native dialog or error goes through `nativeT` (`native-translations.ts`) and the desktop native bundle in `@orchestra/app/i18n/desktop-native` (EN and pt-BR). Overlay hotkey, content-protection or permission changes also update `docs/guides/live-meetings.md`; keep-awake changes update `docs/guides/keep-awake.md`.

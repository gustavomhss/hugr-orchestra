---
name: app-dock-browser-maintenance
description: Use when changing or debugging the desktop main-process App Dock browser (app-dock.ts and its app-dock-*.ts factories, ipc-app-dock*.ts, app-dock-rpc.ts, dock-channel.ts, profile registry, popups, downloads, permissions, fullscreen, shortcuts, URL bridge, tab generations, stale refs, HTTPS-only navigation) or when a Dock tab shows the wrong page, ignores a click, leaks a popup or loses its profile.
---

# App Dock browser (desktop main process)

Related: `mcp-dock-servers-maintenance` (MCP servers over the dock RPC), `gui-agent-security` and `dock-guide` (user skills in `~/.claude/skills`), `docs/guides/mcp-dock-servers.md`. The native/Linux half (`app-dock-native*`, `app-dock-runtime*`, `app-dock-linux*`, `linux-workspace-*`) belongs to its own skill; this one covers only the seam.

## Ownership

All paths are under `apps/desktop/src/main` unless noted.

| Piece | Owner file(s) | Rule |
| --- | --- | --- |
| Dock core | `app-dock.ts` (`createAppDock`) | One closure holds every map (`tabs`, `active`, `tabByContents`, `refTargets`, `refNamespaces`, `occluded`, `layoutBounds`, `inactive`); open/select/hide/resize/close/recover/closeTabs live here and spread in the factories below. Exports the event and tab types. |
| Shared state and contract | `app-dock-context.ts`, `app-dock-api.ts` | `AppDockContext` is how factories share the maps; `AppDockAPI` is the public surface, with optional Linux hooks (`nativeWorkspace`, `linuxApps`, `linuxLaunch`, `onTabRemoved`). |
| Page and input | `app-dock-page.ts`, `app-dock-input.ts`, `app-dock-navigation.ts`, `app-dock-browser.ts` | `browser.ts` only builds page scripts (snapshot, click, type, scroll, drag, storage, network, wait) and owns the in-page ref registry; `page.ts` runs them; `input.ts` clicks/types; `navigation.ts` serialises navigate/back/forward/reload per tab. |
| Fullscreen | `app-dock-fullscreen.ts` | One owner tab per window, epoch-guarded; also maps keyboard keys to Electron key codes. |
| Sessions | `app-dock-session.ts` | Per-profile partition, permission denial, download tracking, storage retirement and clearing. |
| Profiles | `app-dock-profile-registry.ts` | Registry plus tab/bookmark/history manifest, atomic files in userData. |
| Small helpers | `app-dock-utils.ts`, `app-dock-shortcuts.ts`, `app-dock-url-bridge.ts` | utils: bounds, HTTPS-only `appDockURL`, zoom clamp, attached/shown guards. shortcuts: l/t/w. url-bridge: loopback `/open-url` (consumed by `app-dock-linux.ts`). |
| RPC | `app-dock-rpc.ts`, `app-dock-rpc-args.ts`, `app-dock-rpc-proof.ts` | `handleDockRPC` routes `dock.rpc` ops; args validators are the only way args reach the dock; proof validates the harness artifact. |
| Channel to the serve child | `dock-channel.ts` | Loopback WebSocket from `index.ts`; carries the same JSON shapes as the old utility port. |
| Renderer IPC | `ipc-app-dock.ts`, `ipc-app-dock-validate.ts` | One `ipcMain.handle` per `app-dock-*` channel; validators and `toCloneableAppDockEvent` guard both directions. |
| Harness helpers | `app-dock-security.popups.ts`, `app-dock-security.child.cjs`, `.preload.cjs`, `.restart.cjs` | Test-only: popup scenarios U32/U33, Electron child, test preload, restart stage. |
| App zoom | `apps/desktop/src/renderer/webview-zoom.ts` | Renderer page zoom (pinch, Cmd/Ctrl +/-/0), not the tab zoom; the seam is that IPC bounds are divided by `getZoomFactor()` in `panelBoundsToContent`. |

## Invariants

- A tab is `{tabID, generation}`. `isCurrent` must guard every async continuation, and the generation is bumped on open and remove, so a late result never lands on a reused tab. Resize/hide/select name the generation (`appDockTab` requires exactly those two keys).
- Views are sandboxed (`sandbox: true`, context isolation, no node integration) in `persist:app-dock-<storageKey>`; the key must match `^[A-Za-z0-9_-]{16,128}$` and a retired key cannot be reopened.
- HTTPS only: `appDockURL` throws on anything else (a bare string becomes a search URL), and `will-navigate`, `will-redirect` and `will-frame-navigate` block non-https. Do not loosen for http fixtures.
- `setWindowOpenHandler` always denies. A popup opens as a tab only if its opener is the active, current tab, `allowPopup` agrees and the view cap allows it; otherwise `navigation-error` with code `blocked`. Popups never evict a tab.
- At most 20 inactive views (`MAX_INACTIVE_TABS`); the oldest is evicted with `tab-evicted`. Native views paint above the renderer, so occlusion and hide must detach them.
- Permissions are denied and reported as a `permission` event, except `fullscreen`. Downloads: 8 progressing per profile, 20 terminal per sender; a download from an unknown tab is cancelled.
- Refs are page-side (`window.__orchestraDockRefs`, 4096 cap). The namespace is bumped on navigation and on navigate/command, so an old ref fails with "became stale; re-read the page" instead of hitting a new element.
- `click` uses an untrusted DOM click, or a trusted `sendInputEvent` for links and fullscreen controls; `type` reads the value back. Page execute and navigation have a 10 s timeout.
- `page.ts` and `input.ts` call `this.execute`, not a closure, so the Linux browser facade that spreads the dock keeps its own execute guard.
- Shortcuts fire only when the tab is active, current, not occluded, window focused and URL https; no alt/shift/repeat. F12 and Ctrl/Cmd+Shift+I are always prevented, and DevTools opened outside development mode are closed (`openDevTools` throws in production).
- Registry writes are atomic (tmp, fsync, rename; 0o600 file, 0o700 dir). Manifest writes carry an expected revision and return `conflict` on mismatch. Limits (32 profiles, 50 tabs, 200 bookmarks, 1000 history, 2048-char URLs) are constants at the top of the file.
- Every renderer IPC handler starts with `appDockSender` (main frame of a real window) and validates arguments; events to the renderer go through `toCloneableAppDockEvent`, which rejects extra keys.
- RPC: ids at most 256 chars, at most 32 in flight, `dock.rpc.cancel` aborts or is remembered for 15 s. The URL bridge and `dock-channel` accept only a constant-time bearer token; the channel also refuses any request with an `Origin`.

## Traps

- `app-dock-browser.ts` is a string-script builder: the code runs in the page, not in Node. A new helper there cannot import anything.
- Fullscreen uses an epoch, polling (3 s, 1 s on ESC) and a `leave-full-screen` window bridge; removing the epoch lets an old probe overwrite a newer owner.
- Reads are deduplicated in flight and retried once if the namespace changed mid-read.
- `dock-channel.ts` imports no electron on purpose, so its test runs under bun.
- `app-dock-rpc.ts` is shared with the native side: `world` (`browser`/`linux`) scoping, workspace preparation and `nativeTargets` are the other skill's; keep browser ops working when those hooks are absent.
- `ipc-app-dock.ts` also registers the `app-dock-linux-*` handlers and builds the Linux runtime; the browser handlers must not depend on it being ready.
- `reconcileManifest` runs at load and `ensureActive` bumps the revision; a UI write with an older revision conflicts by design.
- Pinch/keyboard zoom in `webview-zoom.ts` ignores a stale `setZoomFactor` result through `zoomGeneration`.

## Testing

Tests run only on CI: `bun run test:ci desktop <files>`. Plain bun tests: `app-dock-utils.test.ts`, `app-dock-url-bridge.test.ts`, `app-dock-profile-registry.test.ts`, `app-dock-rpc-proof.test.ts`, `dock-channel.test.ts`, `app-dock-popups.test.ts`, `menu-zoom.test.ts` (zoom keys). Electron harnesses that bundle and spawn Electron and write a JSON artifact checked by `requireRPCProof`: `app-dock-rpc.test.ts` (R01-R13, M01), `app-dock-security.test.ts` (U01-U33, popups in `app-dock-security.popups.ts`), `app-dock-tools.test.ts` (T01-T08), `app-dock-live.test.ts`, and the opt-in `app-dock-youtube.test.ts` (needs `APP_DOCK_YOUTUBE=1` and provider auth). Check `.github/workflows/test-ci.yml` and `native.yml` for which lane has an Electron display.

No dedicated test: `app-dock-shortcuts.ts`, `app-dock-rpc-args.ts`, `app-dock-fullscreen.ts` (only through the security harness), `ipc-app-dock-validate.ts` and `webview-zoom.ts`.

## Changing it

- A new event type: `AppDockEvent` in `app-dock.ts`, `toCloneableAppDockEvent`, and `apps/desktop/src/preload/types.ts`, in step.
- A new `ipc-app-dock.ts` channel also needs a preload entry and a validator, and a harness case if it touches security.
- A new RPC op: `targetOps` and the `switch` in `app-dock-rpc.ts`, an args validator, and the tool side in `mcp-dock-servers-maintenance`.
- Any new user-visible string goes through `nativeT` or the app i18n, EN and pt-BR.
- Update `docs/guides/mcp-dock-servers.md` when tool behaviour changes.

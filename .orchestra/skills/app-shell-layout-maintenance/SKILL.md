---
name: app-shell-layout-maintenance
description: Use when changing or debugging the app shell's layout persistence, session and window tabs, closed-tab restore, scroll restore, route parsing, prompt draft state, command registration, the native menu (desktop-menu.ts, menu availability, zoom, fullscreen, caffeinate toggle, native translations) in packages/app-shell/src and apps/desktop - or when a tab will not reopen, a layout resets or grows, scroll position is lost, a draft prompt is wiped, a menu item stays disabled, or zoom applies twice.
---

# App shell layout, tabs, prompt and menu maintenance

Related: `terminal-maintenance` (terminal tabs and `terminal.tsx`), `rtl-aware-development` (scroll `x`, menus and title bars in RTL), `settings-usage` (keybinds behind menu accelerators), `desktop-main-maintenance` (main-side `caffeinate.ts`, window registry, flush), `desktop-startup-maintenance` (boot order). Package names for CI: `app` (`packages/app-shell`) and `desktop` (`apps/desktop`).

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| Layout store, persistence, pruning | `context/layout.tsx` (consumer), `context/layout-helpers.ts` | Persisted per server as `layout` (legacy `layout.v6`) with a `migrate` step; at most `MAX_SESSION_KEYS` (50) session keys survive; `pruneSessionKeys` never drops `keep` and returns nothing without it |
| Scroll restore | `context/layout-scroll.ts` | Cache plus debounced flush (250 ms from the layout); flushes on `pagehide` and when the document turns hidden |
| In-session tabs (`open-file`, `review`, `context`, preview) | `context/layout-tabs.ts` | Pure transitions; the preview id lives in the ephemeral store, not on disk |
| Route parsing | `context/layout-route.ts` | One parser for Home, chapter, draft, directory and server session routes |
| Window tabs (session and draft) | `context/tabs.tsx`, `context/tab-migration.ts`, `context/tab-memory.ts` | Window-scoped keys `tabs`, `tabs.recent`, `tabs.info`, `tabs.closed`; per-tab state lives in `createTabMemory` |
| Closed-tab restore | `context/closed-tabs.ts` | Session tabs only, capped at 25, never restores a tab that is already open |
| Terminal default titles | `context/terminal-title.ts` | Matches the localized "Terminal N" in every shipped language so a default is never shown as a custom name |
| Command registration | `context/command-registration.ts` (used by `command.tsx`) | A registration that was disposed answers `[]` |
| Prompt and draft state | `context/prompt-state.ts` (consumed by `prompt.tsx` and `tabs.tsx`) | Drafts persist under `Persist.draft(draftID, "prompt")`, sessions under the server-scoped key |
| Directory data provider | `pages/directory-layout.tsx` | Decodes the base64 directory, provides sync, SDK and the pinned session |
| Menu model | `desktop-menu.ts` (app-shell) | One list drives the macOS native menu and the Windows/Linux in-app menu (`components/windows-app-menu.tsx`) |
| Menu on macOS | `apps/desktop/src/main/menu.ts`, `desktop-menu-actions.ts`, `menu-availability.ts` | Command items trigger a renderer command; action items run in main |
| Zoom | `main/menu-zoom.ts`, `main/window-zoom.ts`, `renderer/webview-zoom.ts` | macOS menu accelerators own the zoom keys; renderer keys cover the other platforms |
| Native menu text | `main/native-translations.ts`, `i18n/desktop-native.ts` | The renderer sends a validated bundle; main rebuilds the menu only when it changed |
| Renderer bridges | `renderer/window-fullscreen.ts`, `renderer/caffeinate.ts`, `renderer/open-path.ts` | Thin signals over `window.api`; the caffeinate blocker itself is in `main/caffeinate.ts` (see `desktop-main-maintenance`) |

## Invariants

- Persistence keys and migrations are the contract: `layout` with legacy `layout.v6`, window keys `tabs`, `tabs.recent`, `tabs.info`, `tabs.closed`, prompt keys from `promptTarget` (draft key, or server-scoped with the legacy `<dir>/prompt[/<id>].v2`). Never rename one without a `migrate` or `legacy` entry; a rename silently resets users' layout or drafts.
- `migrateTabs` drops anything malformed, adds the fallback server to legacy tabs and keeps `worktree` optional. `layout.tsx` `migrate` converts old `sidebar.workspaces` booleans, old `fileTree` shapes and normalizes stored session tabs; keep it idempotent (it returns the same object when nothing changed).
- Pruning removes a session key's `sessionView`, `sessionTabs`, scroll cache, preview and the persisted `prompt`, `terminal` and `file-view` state (including the local legacy keys). Add a new per-session persisted state to `SESSION_STATE_KEYS`, or it leaks past pruning.
- Closed-tab stack: `closeTab` (user close) records; `removeTab`, archive, missing session and server removal do not. `removeSessionTab`, `removeSessions` and `removeServer` also purge matching closed entries so a deleted session is never reopened. Closing a draft deletes its persisted state (`draftPersistedKeys`), which is why drafts are not recorded.
- `layout-tabs`: `review` is never in `all`, only active; `context` is always first; opening a tab pins the current preview, previewing replaces it in place; a restored `open-file` placeholder counts as the preview. Closing the active tab selects the left neighbor, then the right, then the first.
- `currentRoute`: a malformed server key or an undecodable directory goes to Home instead of throwing; a draft route without `draftId` is Home. `/orchestra/<chapter>` ignores deeper segments.
- Scroll: `setScroll` skips identical values, `flush` writes only dirty keys, `seed` re-reads the persisted snapshot while the cache is empty (the snapshot arrives after first render).
- Menu: every command item gets the id `command:<command>#<index>`; availability is driven by that id. `null` availability (no report yet) keeps everything enabled. The renderer reports ids of registered, non-disabled, non-`suggested.` commands, debounced 150 ms; the focused window's last report wins.
- Zoom: on macOS the application menu owns Cmd+0/Plus/-, so `rendererHandlesZoomKey` is false there. If both handled a chord, zoom would apply twice. `setWindowZoom` clamps to 0.2-10, rejects non-finite values and always emits `zoom-factor-changed`.
- Native translations: `set-native-translations` accepts only the main frame of its own window, and `parseDesktopNativeBundle` requires exactly the keys of `DESKTOP_NATIVE_ENGLISH` and at most 64 KiB. The macOS About, Hide and Quit items carry the product name in their labels because Electron would use the process name.
- Help menu only exports logs and links nowhere; there is no Toggle Sidebar item because that state has no command (`desktop-menu.test.ts` pins both).

## Traps

- `LayoutRoute` type `"dir-new-sesssion"` has three s on purpose in code today; sidebar, titlebar, navigation commands, provider catalog and tests match on that string. Fix the spelling everywhere at once or not at all.
- `scroll.dispose` drops pending timers and dirty flags without flushing; the flush on `pagehide`/hidden is what saves the last position.
- `tabs.tsx` writes to `tabs.recent` and `tabs.closed` through ready promises; a write before the store is ready is queued, and a later write wins (`recentWrite`). Do not call `setRecent` or `setClosed` directly.
- Tab removal runs inside `startTransition`; `closing` and the `nextTabAfterClose` result decide navigation. Only the active tab navigates when closed.
- `createCommandRegistration` seeds its memo with `untrack(next)` on purpose: a scheduled transition can publish a registration before the memo first runs. Do not "simplify" it to a plain `createMemo(next)`.
- `menu.ts` `createMenu` is macOS only and rebuilds from scratch on a translation change, resetting `commandCount`; availability is reapplied at the end. Windows and Linux use the in-app menu, which reads the same `DESKTOP_MENU` with the `windows` platform filter.
- `webview-zoom.ts` imports `rendererHandlesZoomKey` from `main/menu-zoom.ts`; keep that file free of Electron imports.
- Terminal title matching lists localized strings explicitly; a new locale for "Terminal N" must be added to `numbered` or the tab will show the default as a custom title.
- `renderer/open-path.ts` rejects with the localized message and keeps the main result as `cause`; main reports a missing app as `app-unavailable` and never falls back to the default opener.

## Testing

Tests run only on CI: `bun run test:ci app <files>` and `bun run test:ci desktop <files>`.

- `context/layout-scroll.test.ts` (debounce, reseed), `context/layout-tabs.test.ts` (preview, open, close), `context/layout-route.test.ts` (chapter, server, malformed key), `context/layout.test.ts` (key helpers, `pruneSessionKeys`).
- `context/tabs.test.ts`: `migrateTabs`, `createTabMemory`, closed-tab stack and `nextTabAfterClose`.
- `context/prompt-state.test.ts`: initialization only. `context/command.test.ts`: `addCommandRegistration`. `context/terminal.test.ts`: title numbers through the terminal context.
- `desktop-menu.test.ts` (model), `i18n/desktop-native.test.ts` (bundle parsing, labels), `apps/desktop/src/main/menu-availability.test.ts`, `menu-zoom.test.ts` (also `setWindowZoom`), `apps/desktop/src/renderer/open-path.test.ts`.
- No direct test: `layout.tsx` migrate and prune, `closed-tabs` wiring in `tabs.tsx`, `terminal-title.ts` alone, `createCommandRegistration`, context items and persistence in `prompt-state.ts`, `directory-layout.tsx`, `menu.ts`, `desktop-menu-actions.ts`, `native-translations.ts`, `renderer/window-fullscreen.ts`, `renderer/caffeinate.ts`.

## Changing it

- A new menu label: add the key to `DESKTOP_NATIVE_ENGLISH` and translate it in `i18n/en.ts` (via the English table) and `i18n/br.ts`; missing locale entries fall back to English in `language.tsx`.
- A new menu item bound to a command must use a command id that `command.tsx` registers, or it will be disabled once the renderer reports availability. A new `DesktopMenuAction` also needs a case in `desktop-menu-actions.ts` (the renderer handles zoom actions itself in `renderer/index.tsx`).
- A new persisted layout field: add a default in the `layout.tsx` store and, if the old shape differs, a branch in `migrate`; add per-session state to `SESSION_STATE_KEYS`.
- A new tab kind: extend `Tab`, `migrateTabs`, `tabKey`, `tabHref` and the closed-tab rule together.
- Confirm the change with the closest test file above and say which gate ran.

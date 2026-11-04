---
name: settings-chapters-maintenance
description: Who owns the connection and configuration chapters of the app (Integrations, MCP, Providers, Skills, Plugins, Workspaces, Shortcuts, Env, Claude mode account, the shared chapter kit, chapter-empty, no-repository, crumbs, model logos, wallpaper), the invariants that must not regress (idempotent mutations, secret masking, 512-row window, lossless .env), and how to change and test them
---

# Settings chapters maintenance and ownership

Folder: `packages/app-shell/src/orchestra/chapters`. Related: `settings-usage` (what the screens do for a person), `claude-mode-maintenance` (the host side of Claude mode), `rtl-aware-development`, `agent-avatars-maintenance`, and the global `orchestra-design-system` for any visual change. Agents, schedule, CI/CD, KPIs, Lean and Dock chapters are not covered here.

## Ownership

| Piece | Owner file(s) | Rule |
|---|---|---|
| Integrations transport | `integrations-api.ts`, `integrations-contract.ts` | One frozen client per selected host and directory; every reply is decoded with `onExcessProperty: "error"`; mutations carry an `idempotency-key`. Basic or a 43-char URL-safe bearer only |
| Integrations model | `integrations-model.ts`, `integrations-model-retention.ts` | Owns reads, paging, mutations, retry, recovery and the 512-row window; the page never builds requests itself |
| Integrations screen | `integrations.tsx`, `integrations-screen.tsx`, `integrations-dialogs.tsx` | `integrations.tsx` rebuilds the model when the transport or the bearer changes and disposes the old one; dialogs reset their inputs before validating |
| MCP data | `mcp-model.ts`, `mcp-source.ts`, `mcp-edit-state.ts` | Pure cards, masking, transport inference and config building; the source is the only API caller; edit state admits one draft per editor lifetime |
| MCP page | `mcp.tsx`, `mcp-actions.ts`, `mcp-dialogs.tsx` | Actions: one request per server, failures stay on the row; OAuth waits hold an `AbortController`; dialogs are native modals |
| Providers | `providers.tsx`, `providers-list.tsx`, `providers-dialogs.tsx`, `providers-data.ts` | `ProviderList` is the one list for the chapter and both Settings surfaces; `providers-data.ts` is pure; `disconnectProvider` never reports a failed write as success |
| Skills | `skills.tsx`, `skills-dialog.tsx`, `skills-data.ts` | Access rules mirror the server's write rule; the catalog reply is untrusted |
| Plugins (LLM behaviors) | `plugins.tsx`, `plugins-dialog.tsx` | Page pushes the profile's behavior set to the server; store lives in `utils/llm-behaviors-store.ts` |
| Workspaces | `workspaces.tsx`, `workspaces-dialog.tsx`, `workspaces-model.ts`, `workspaces-store.ts` | Model is pure; the store is the only persisted state (`orchestra.workspaces`, server-global) |
| Shortcuts | `shortcuts.tsx`, `shortcuts-editor.tsx`, `shortcuts-model.ts` | One editor, rendered by the chapter and both Settings surfaces; the model owns rows, capture, conflicts and overrides |
| Env | `env.tsx`, `env-document.ts` | Parser is lossless; values live only in the component |
| Claude mode (app side) | `claude-mode-account.ts`, `claude-mode.tsx`, `../claude-mode-entry.ts`, `../use-claude-mode.ts` | Account functions take the providers group, so tests need no server; the engine switches only after a signed-in account |
| Shared frame | `kit.tsx`, `kit.css`, `settings.tsx`, `no-repository.tsx`, `../chapter-empty.tsx` | `Mx*` page frame, badge, toggle and the `mx-*` classes every chapter uses; empty states open the folder picker |
| Titlebar and logos | `../crumbs.tsx`, `../model-logo-resolver.ts`, `../warm.ts` | `setCrumbTrail` per view, cleared on unmount; logo from the maker, then router, then neutral; `createWarm` is a last-result cache |
| Wallpaper | `../wallpaper/catalog.ts`, `picker.tsx`, `picker.css` | Ids unique; dim clamped to 0..0.8 (`WALLPAPER_DIM_MAX`); palette contrast is measured against `orchestra` only |

## Invariants

- A mutation never repeats on its own. A lost reply stays unknown until the person retries explicitly; retry reuses the same key and the detached input, a changed intent gets a new key. Neither credentials nor keys enter the reactive store.
- Late replies cannot change the owner. Every read or mutation is fenced by `generation` and `epoch`; select, cancel and dispose abort the request and ignore its late result.
- An acknowledged mutation is checked against what was asked (provider, parent, generation, environment, id). A wrong ACK is unknown and is rejected before a failed refresh can hide it.
- A receipt that echoes the credential or the private key in any string leaf is rejected (`reflected`); a matching property name is harmless. A committed receipt survives a failed read, and its closed intent is never redriven.
- Paging is validated: cursors must advance, cycles and repeated ids are errors, the cursor history caps at 512. The window keeps at most 512 rows across connections, targets and bindings; the incoming page and the selected account and target are reserved first.
- MCP: only `type`, `command` and `url` are kept from a server entry; environment, headers and OAuth never reach the page. `maskCommand` and `maskUrl` mask secret flags, `NAME=value` secrets and URL credentials. An unedited save writes nothing (it would restart every server of the profile). Names follow `mcpNameValid`. Writes go to `orchestra.json` by default.
- A project's own local MCP server stays blocked until the project is trusted; the banner keys on failed plus the trust list, not on error text.
- Provider and skill replies are untrusted: a malformed catalog or integration fails the read with Retry. Only web links are accepted as OAuth targets. Environment and config providers are listed but cannot be removed from the app.
- Skills: only the project's own skill folders are editable; Atlas-governed, global, built-in and files outside the folders are read-only. Internal skills and skill-tree nodes are not listed.
- Env: `parseEnv` and `serializeEnv` round-trip byte for byte (BOM, CRLF, comments, multiline, malformed lines stay opaque); a value never reaches config, storage or a request. Closing the dialog drops the draft.
- Workspaces: the root and the active workspace are never removed; the server refuses a dirty copy until the request is forced; the stored active choice counts only while the server still lists it; display names are local overrides and clearing one removes the override.
- Shortcuts: a binding that conflicts with another command is refused, whatever its alias spelling; saving the default again or unassigning a command with no default drops the override rather than storing a copy.
- Claude mode: signed out, the engine stays put and the person is sent to Providers; an unreadable account counts as signed out; a refused engine write leaves the dialog open. The returned URL is only the manual fallback.
- Profile names are isolated in running text (FSI and PDI, or `<bdi>`); arrow keys in the wallpaper picker flip under RTL.

## Traps

- The integrations model files `integrations-model-*.test.ts` are the spec. A change that needs an edit to one of them is a behavior change: say so.
- `integrations-model.fixture.ts` re-exports Bun's native `Response` because happydom replaces it and `Bun.serve` needs the native one.
- Solid store proxies cannot go through `structuredClone`; the model detaches with a JSON round trip.
- Native `<dialog>` modals (MCP, Skills, Workspaces) differ from Kobalte dialogs (Integrations, Plugins, Providers, Env). A Kobalte layer behind a native modal can swallow Escape; the dialogs handle it explicitly, so do not remove that.
- A person closing the MCP dialog never abandons a write in flight. Unmounting an open dialog is not a user close.
- Skills and Workspaces keep the open dialog in a signal, not a store field: a store merges objects, the keyed dialog would not remount.
- Config-write refreshes can take as long as MCP startup; dialogs must not wait for them.
- `createWarm` paints the last list at once but the page still asks the server; do not treat it as truth.
- V2 workspace copies live outside `project.sandboxes`, so the `known` list in the store is what lets a new draft accept them.
- Plugins say "applied" only after the server accepts the set (`supported`); `unsupported` and `failed` are separate states, and only the latest push sets the status.
- The shortcuts editor reconciles its rows by `id`, so a saved binding updates in place and focus returns to the Edit button that opened the dialog.

## Testing

Run only on CI: `bun run test:ci app <files>` (the package alias of `packages/app-shell`; paths under `src/orchestra/chapters`).

- Integrations: `integrations-model.test.ts` (reads, races, retry, ACK loss, retarget), `-ack`, `-budget` (512 window), `-connections`, `-paging`, `-privacy` (secret reflection), `-races`, `-recovery`, `-recovery-refresh`, `-refresh`, `-streams`, `-wire`.
- MCP: `mcp.test.ts` (actions, cards, masking, transport, drafts, trust), `mcp-source.test.ts`.
- Providers: `providers-data.test.ts`, `providers-disconnect.test.ts`. Skills: `skills-data.test.ts`. Workspaces: `workspaces-model.test.ts`. Shortcuts: `shortcuts-model.test.ts`. Env: `env-document.test.ts`. Claude mode: `claude-mode.test.ts`.
- Outside the folder: `../model-logo-resolver.test.ts`, `../wallpaper/catalog.test.ts`, `../warm.test.ts`, `../../utils/llm-behaviors.test.ts`.
- No test: `kit.tsx`, `crumbs.tsx`, `chapter-empty.tsx`, `no-repository.tsx`, `settings.tsx`, `plugins.tsx`, `skills.tsx`, `workspaces.tsx`, `env.tsx`, `mcp.tsx`, `providers-list.tsx` rendering, every `*-dialog(s).tsx`, `integrations-screen.tsx`, `integrations-api.ts`, `shortcuts-editor.tsx`, `wallpaper/picker.tsx`, `use-claude-mode.ts`. Check them by hand in the app.

## Changing it

- Copy lives in `src/i18n/orchestra-chapters/<chapter>.ts` as `<NAME>_COPY` and `<NAME>_COPY_BR`, assembled in `src/i18n/orchestra.ts`. A new key needs both; `src/i18n/parity.test.ts` fails on a missing key and on pt-BR values equal to English.
- A change to the integrations wire shapes starts in `@orchestra/schema` and the client; run `bun run generate` in `packages/client` after a public API change. This folder only decodes.
- A new chapter piece uses the `Mx*` kit and `mx-*` classes in `kit.css`; visual rules come from `orchestra-design-system`, direction rules from `rtl-aware-development`.
- User-facing change updates `docs/guides/settings.md` (and `skills.md`, `environment.md`, `mcp-project-trust.md`, `claude-mode.md` when they apply).

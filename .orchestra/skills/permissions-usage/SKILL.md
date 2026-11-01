---
name: permissions-usage
description: How a permission request is shown and answered in a session, what "Always allow in this project" covers, and how saved permissions are listed and removed in Settings
---

# Permissions usage

Covers the permission dock above the composer and the Saved permissions list in Settings, Permissions. User-facing description: `docs/guides/permissions.md`. Stop and questions: `docs/guides/session-requests.md` and the `session-requests-usage` skill.

## What the person sees

- The dock names the asking seat ("Asked by"), the tool and its description, and the exact resources under "Requested".
- Stop sits in the dock's footer, left of the answers. It calls `session.interrupt` for the session, the same call the composer's Stop row uses. The composer Stop row only shows for a question, since a permission dock already carries one.
- "Always allow in this project" appears only when the request has something to save (`always` is not empty). Its scope line comes from `alwaysScope` in `packages/app-shell/src/pages/session/composer/session-permission-scope.ts`: `*` means every request of the tool, anything else means only those exact resources.
- Relay hook asks never offer "always", because each one takes a live reply.
- The composer's permissions button (`data-action="prompt-permissions"`, "Ask" / "Auto-accept") toggles session auto-accept through `usePermission().toggleAutoAccept(sessionID, directory)`, the same state as the `permissions.autoaccept` command (`Mod+Shift+A`) and the Settings, General switch. Turning it on answers pending requests "once". It is client state and saves no rule. In Claude mode it works because the host routes tool permissions through Orchestra's V2 permissions.

## Where it lives

- Dock: `packages/app-shell/src/pages/session/composer/session-permission-dock.tsx`. It reads the session's `agent` from sync data for "Asked by".
- Stop wiring: `session-composer-region.tsx` passes `onStop` to the dock.
- Saved list: `packages/app-shell/src/components/settings-v2/view/saved-permissions-section.tsx`, registered in `settings-view.tsx` under the Permissions match. It uses `sdk().api.permission.saved.list()` and `saved.remove({ id })`.
- Server: `permission.saved.list` and `permission.saved.remove` in `packages/server/src/handlers/permission.ts`, backed by `packages/core/src/permission/saved.ts`. Saving happens in `PermissionV2.reply` when the reply is `always`, one row per resource, scoped to the project.
- Copy: `orchestra.chat.permission.*` in `packages/app-shell/src/i18n/orchestra-chapters/chat.ts`, and `orchestra.settings.savedPermissions.*` in `orchestra-chapters/settings.ts`. Add new keys to both the English and the pt-BR record there.

## Checks

- Unit: `packages/app-shell/src/pages/session/composer/session-permission-scope.test.ts`.
- Composer toggle and reasoning label: `packages/app-shell/e2e/orchestra/chat-session.spec.ts`, run with `bun run test:ci app e2e/orchestra/chat-session.spec.ts --runner playwright --config e2e/playwright.production.config.ts`.
- Manual: ask for a Bash command and confirm the dock shows the command. Choose "Always allow in this project", then open Settings, Permissions and confirm the row. Remove it and confirm the next identical command asks again.

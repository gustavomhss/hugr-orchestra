# Desktop renderer (packages/app-shell) vs V2 server (packages/server) — route inventory

Branch `v2-route-parity` off fork/dev 3e6030caba. Static measurement (grep of non-test src), 2026-10-19.

How the app picks a path: `utils/server-protocol.ts` probes `/global/health` (V1) then `/api/health` with `pid` (V2).
On V2 every `sdk.api.*` call goes to the vendored `@opencode-ai/client` 1.17.13 (`/api/*`, upstream opencode contract);
`sdk.client.*` / `legacy(...)` calls go to unprefixed V1 routes and 404 on V2 unless gated by `protocol === "v1"`.

## Counts
- Vendored client routes: 105; absent from packages/protocol: 51 (list: vendored-missing.txt).
- `api.*` methods the app calls: 38 distinct; present on V2: 29; gap: 9 (1 closed here).
- Legacy V1 client methods called: 72 distinct; ~55 are V1-gated or inside the V1 adapter (`utils/server-compat.ts`);
  ungated on the V2 path: 17 (2 closed here).
- SSE: V2 `/api/event` exists, but event vocabulary differs (see "Blocking redesign").

## api.* gaps (V2 has no route)
| call | consumer | proposed V2 equivalent |
|---|---|---|
| project.current | context/global-sync/bootstrap.ts:481, pages/home/home-controller.tsx:101,105, orchestra/relay/chapter.tsx:51 | CLOSED: `GET /api/location` (`Location.Info.project`) in utils/server-compat.ts |
| project.list | context/global-sync/bootstrap.ts:132 (every launch), orchestra/chapters/workspaces.tsx:115 | new `GET /api/project` (core: list ProjectTable via a core Project method) |
| project.directories | orchestra/chapters/workspaces.tsx:76 | new `GET /api/project/:projectID/directories` (core `Project.directories` exists) |
| session.rename | components/titlebar-tab-strip.tsx:123, pages/session/timeline/message-timeline.tsx:551 | new `POST /api/session/:id/rename` + durable `session.next.renamed` event (core has none) |
| session.remove | pages/session/timeline/message-timeline.tsx:657, orchestra/chapters/schedule-device.ts:143 | new `DELETE /api/session/:id` (core has archive only) |
| mcp.list/connect/disconnect | context/server-sync.tsx:642,649, orchestra/chapters/mcp-source.ts:27-53 | new `/api/mcp*` group (core MCP service) |
| project.update | components/edit-project.ts:91 | not in vendored client; V1-gated with "unsupported" error |

## Ungated legacy calls on the V2 path
| call | consumer | proposed |
|---|---|---|
| file.list | context/file.tsx:84 | CLOSED: `GET /api/fs/list` via context/file/read.ts |
| file.read | context/file.tsx:184, pages/session/review-tab.tsx:58, pages/session/v2/review-panel-v2.tsx:140 | CLOSED: `GET /api/fs/read` via context/file/read.ts (binary => no body) |
| global.config.update | context/server-sync.tsx:598 (providers-list.tsx:220,415 default model / disabled providers; orchestra/claude-mode-entry.ts:9 Maestro engine) | new global config write route, or V2 `model.default` set + behavior route |
| project.initGit | pages/home/home-controller.tsx:102, pages/session.tsx:689 | new `POST /api/project/git/init` (empty-folder path only) |
| session.processes / processStop | pages/session/processes-panel.tsx:149,160 | gate to V1 or V2 shell routes (`/api/shell*` absent) |
| session.get / messages (export) | utils/session-export.ts:25-26 | `api.session.get` + `api.message.list` |
| session.activity, vcs.activity | orchestra/chapters/kpis.tsx:122,131 | none on V2; gate |
| project.lean* | orchestra/chapters/lean-api.ts:36-43 | none on V2; gate |
| vcs.get | pages/session/orchestra-pull-request.tsx:58 (+ cicd.tsx:75, workspaces.tsx:129) | `/api/vcs*` absent on V2 |
| session.status, instance.dispose | orchestra/chapters/agents.tsx:88-92 | `GET /api/session/active`; no dispose on V2 |

## Blocking redesign: live timeline events
The app's V2 reducer (context/server-session-v2-reducer.ts, server-sdk.tsx adaptServerEvent) consumes the vendored
upstream vocabulary (`session.text.delta`, `session.execution.*`, `session.input.admitted`, ...). Orchestra V2 emits
`session.next.*` (packages/schema/src/session-event.ts) with different payloads (e.g. text delta `textID` vs `ordinal`).
Of 57 event types the app consumes, 23 exist only under a `session.next.` name and 13 have no V2 equivalent
(session.execution.{succeeded,failed,interrupted}, session.input.{admitted,promoted}, session.agent.selected,
session.model.selected, session.renamed, session.retry.scheduled, session.skill.activated, session.usage.updated,
session.compaction.failed, server.instance.disposed). Streaming, busy/idle and prompt promotion therefore do not render
against `orchestra serve`. Fix = either an event adapter in adaptServerEvent (session.next -> vendored shapes) or
moving the app from the vendored client to `@orchestra/client` (the SDK convergence). Not a one-PR route patch.

Core journey routes that DO exist on V2: health, event, session list/create/get/active/prompt/interrupt/compact/
messages/permission reply/question reply+reject/archive/switchAgent/switchModel/revert, agent, model, provider,
integration (key + OAuth), credential, permission/question request lists, command, skill, reference, pty, fs, location.

## Update (round 2, same branch)
- Closed: session.next.* -> bundled session.* adapter (context/server-event-native.ts), busy/idle derived from
  steps (executionStatus), prompt admission/promotion mapped; GET /api/project; PATCH /api/config (model + agent
  engines, reloads every open location); V1-only calls gated (processes panel, session export button hidden,
  KPIs activity -> unavailable, PR dialog + CI/CD vcs.get, agents dispose).
- Degrade quietly on V2 (no V2 source): session.renamed, session.usage.updated (live totals), session.skill.activated,
  session.compaction.failed, server.instance.disposed; retries show in the status line but not on the message.
- Remaining: session rename/delete routes, MCP routes, initGit, project directories route, provider disable on V2
  (V1 disabled_providers -> V2 policy `provider.use` deny; no config field), reasoning provider state, binary file preview.

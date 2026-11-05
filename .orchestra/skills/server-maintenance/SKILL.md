---
name: server-maintenance
description: Who owns each part of the Orchestra HTTP server (handlers per HttpApi group, middleware order, authentication and tickets, Location resolution, route assembly), its invariants, input limits and response safety, and how to change and test it. Use when changing packages/server/src/body-limit.ts, auth.ts, web-ui.ts, handlers/fs.ts or handlers/pty.ts, or when a client reports a 413 or a refused terminal connection.
---

# Server maintenance and ownership

Package `packages/server` (`@orchestra/server`). It adapts the typed Protocol API to Effect HTTP on top of Core services. Layering: Schema to Core and Protocol, then Core and Protocol to Server; the client never imports Server. The package README lists entry points; this skill lists who owns what and what must not regress.

## Ownership

Owner file paths in this table are relative to `packages/server` unless explicitly rooted elsewhere.

| Piece | Owner file | Rule |
|---|---|---|
| The API value | `src/api.ts` | `makeDefaultApi` from Protocol with the two concrete middleware keys. Protocol owns which group carries which middleware (`packages/protocol/src/api.ts`); the server only injects the keys so Core service identities stay downstream |
| Endpoint groups | `packages/protocol/src/groups/<name>.ts` | One file per group; the group id is `server.<name>` (for example `server.trust`, `server.relay.hook`) |
| Handlers | `src/handlers/<name>.ts`, registered in `src/handlers.ts` | One `HttpApiBuilder.group(Api, "server.<name>", ...)` per file, merged in `handlers`. A new group needs the file, the entry in `handlers.ts`, and the group in Protocol's `api.ts` |
| Route assembly, services, CORS wiring | `src/routes.ts` | `createRoutes` (standalone, password from option or `ORCHESTRA_SERVER_PASSWORD`), `createEmbeddedRoutes` (no password, used by `sdk-next`), `routes`, `webHandler`. `applicationServices` is the Core node list; host contributions merge through `Host.merge` |
| Basic credentials | `src/auth.ts` | `ServerAuth.Config` reads `ORCHESTRA_SERVER_PASSWORD` and `ORCHESTRA_SERVER_USERNAME` (default `orchestra`); no password means no authentication |
| Authentication middleware | `src/middleware/authorization.ts` | Basic header; `auth_token` query only on the event and PTY connect paths; ticket bypasses for PTY connect and capability content |
| Capability authentication | `src/middleware/capability-authorization.ts`, `src/operator.ts`, `src/capability-content-ticket.ts`, `src/capability-verification.ts` | Capability routes authenticate separately and run inside Core's request frame. See Invariants |
| Schema rejection | `src/middleware/schema-error.ts` | Maps a schema rejection to the declared `InvalidRequestError`, reason capped at 1024 characters |
| Location of a request | `src/location.ts` | `ref(request)` reads `location[directory]` and `location[workspace]` (or `x-orchestra-workspace`), else the server cwd; `LocationMiddleware` provides that Location's services; `response` wraps data with its `Location.Info`; `bootLocation` turns a boot failure into a declared 400 |
| Location of a session route | `src/middleware/session-location.ts` | Looks the Session up by `sessionID` in the database and boots the Location stored on the row; unknown id is `SessionNotFoundError` |
| CORS | `src/cors.ts` | Allowed origins: localhost and 127.0.0.1 http, `oc://renderer`, the Tauri origins, plus `options.cors`. `isAllowedRequestOrigin` also allows a same-host origin (used by the PTY handler) |
| Request actor | `src/principal.ts` | The OS account running the server, not the Basic username |
| Web UI | `src/web-ui.ts` | Serves a built renderer from `webRoot` at `/` |
| Relay authoring application | `src/relay-documents.ts` | The store per project and the editor's view behind the relay document, publish and hook handlers |

## Handlers and the Core services behind them

Handlers translate request context and declared errors and delegate to Core. They own no policy. This nonexhaustive mapping helps find the Core owner quickly:

| Handler file | Core module it calls |
|---|---|
| `session.ts`, `message.ts`, `meeting.ts` | `session`, `session-process`, `control-plane/move-session`, `tool/task-background`, `session/subagent-models` |
| `agent.ts`, `skill.ts`, `command.ts`, `behavior.ts` | `agent`, `skill`, `slash-command`, `behavior` |
| `model.ts`, `provider.ts`, `integration.ts`, `credential.ts` | `catalog`, `integration`, `credential`, `claude-code-account` |
| `config.ts`, `trust.ts` | `config`, `config/trust`, `mcp` (`applyTrust`) |
| `permission.ts`, `question.ts` | `permission`, `permission/saved`, `question` |
| `fs.ts`, `vcs.ts`, `project.ts`, `project-copy.ts`, `location.ts` | `filesystem`, `vcs`, `git-cli`, `project`, `project/copy`, `location` |
| `mcp.ts`, `lsp.ts`, `formatter.ts`, `pty.ts`, `event.ts` | `mcp`, `lsp`, `format`, `pty`, `event` |
| `relay-document.ts`, `relay-hook.ts`, `relay-run.ts` | `core/relay*` and `@orchestra/relay/authoring`, `ledger` |
| `actions-*.ts` | `core/actions`; their Protocol groups are `actions-*.ts` of the same names |
| `capability-*.ts` | `core/capability/*` (operator, connection, artifact, schedule) and `core/scheduled-task` |
| `board.ts`, `schedule.ts`, `guardrail.ts`, `atlas.ts`, `lean.ts`, `reference.ts`, `pull-request.ts`, `research-artifact.ts`, `health.ts`, `installation.ts` | the same-named Core module |

Re-run `grep -ho 'from "@orchestra/\(core\|relay\)[^"]*"' packages/server/src/handlers/<file>.ts` before relying on a row.

## Invariants

- Public contract changes go in Protocol first. After changing the Protocol or the Server `HttpApi`, run `bun run generate` in `packages/client`. Never edit `src/generated` or `src/generated-effect`; CI runs `bun run check:generated` in the same package (the `gates` part of `test.yml`) and fails on any diff.
- Every Protocol endpoint has a handler and every endpoint has an exerciser scenario: `bun run test:httpapi` in `packages/server` runs coverage, auth and effect modes with `--fail-on-missing --fail-on-skip`, so a route without a scenario or a skipped scenario fails the gate.
- Middleware placement is Protocol's. A group is either location-scoped (`.middleware(locationMiddleware)`), session-scoped (`sessionLocationMiddleware`), or global. Today `ProjectGroup`, `ConfigGroup`, `TrustGroup`, `BoardGroup`, `InstallationGroup`, `HealthGroup` and the event group are global; `server.trust` writes the user's config and then re-applies trust to every open Location (`RcMap.keys(locations.rcMap)`). Do not read `Location.Service` in a global handler.
- Authentication runs before caller-selected Location construction. In `makeApiFromGroup` the last-applied middleware runs first, and the capability groups add `CapabilityAuthorization` after the location middleware for that reason; `test/operator-ordering.test.ts` proves the order on the real operator group. Keep that order when adding a capability group.
- Credentials never travel in a query string except for `EventSource` and WebSocket, which cannot set headers: `AUTH_TOKEN_QUERY_PATH` allows `auth_token` only on `/api/event`, `/api/session/:id/event` and `/api/pty/:id/connect`. Adding a path to that regex needs the same reason.
- Ticket bypasses are exact and verified later: a PTY connect with a ticket (`hasPtyConnectTicketURL`) skips credential checks in `authorizationLayer`, and the connect handler checks `isAllowedRequestOrigin` and consumes the ticket, which is bound to that PTY and Location. Minting a ticket (`pty.connectToken`) needs the custom connect-token header, which forces a CORS preflight, plus the same origin check. A capability content ticket (`hasCapabilityContentTicketURL`) skips them for media elements; the content handler verifies the in-memory ticket, which expires after 5 minutes, dies with a restart and is bound to the authority that minted it, so the read still runs under that authority.
- Capability routes authenticate on their own. With a server password set, only the Basic credential is accepted and the operator's configured authority is used; with none, a 43-character Bearer token is authenticated by `operator.authenticate`. The `Idempotency-Key` header must match `[A-Za-z0-9_-]{1,128}` or the request is a `ForbiddenError`. Caller-supplied principal, scope or ids in a body are never grants: only Core's request frame carries authority. Auth failures answer a fixed `{ _tag, message }` body that must not echo secrets (`capability-authorization.test.ts` asserts it).
- `createEmbeddedRoutes` has no password by design (in-process `sdk-next`). A standalone `createRoutes` with no password is open to any caller that can reach the port and passes CORS; the CLI and desktop set one.
- Boot failures are declared errors. A Location that cannot start is `location_not_found` (directory missing) or `location_unavailable`, both 400; only defects stay a 500. A Location already booted keeps serving from the map's cache.
- `schemaErrorLayer` must stay on the API so a bad payload is a declared `InvalidRequestError` with a bounded reason, never an empty 500.
- The server does not own Session execution. `Host.merge` rejects a contribution that would own the Session execution, Session, Location map or scheduled-task nodes, so each process keeps one coordinator; do not add a second execution path in a handler.

## Testing

Tests run on GitHub Actions only: `bun run test:ci server [files]` from the repository root. Files in `packages/server/test` by area:

- Contracts: `client-contract-identity.test.ts` (Core and Server reuse the Schema and Protocol values; client and Server contracts generate identically), `capability-artifacts-routes.test.ts`.
- Authentication and ordering: `capability-authorization.test.ts`, `operator-ordering.test.ts`, `trust-http.test.ts`, `cors.test.ts`.
- Capabilities over HTTP: `capability-connections*.test.ts`, `capability-setup-http*.test.ts`, `capability-artifacts-http*.test.ts`, `capability-schedules-http.test.ts` (each group has a `*-fixture.ts` that is not a test).
- Actions: `actions-http.test.ts`, `actions-resource-query.test.ts`.
- Routes: `config-project-http.test.ts`, `board-http.test.ts`, `fs-read-http.test.ts`, `installation-http.test.ts`, `session-background-http.test.ts`, `session-diff-http.test.ts`, `session-move-http.test.ts`, `event-stream.test.ts`, `account-mcp-http.test.ts`, `web-ui.test.ts`.
- Exerciser scenarios live in `test/httpapi-exercise/*.ts` (one file per area, registered in `index.ts`); `script/httpapi-exercise.ts` runs them.

A new endpoint needs a handler, an exerciser scenario and, when it carries policy (authentication, ownership, a ticket), a named test of the denial.

## Traps

- `src/handlers/*.ts` count and the group list move together: the number of files is not the number of groups (`relay-document.ts` registers two handlers, `capability-artifacts.ts` two). Read `handlers.ts` for the real list.
- `RelayDocumentHandler` and `RelayPublishHandler` are separate groups in Protocol (`server.relay.document`, `server.relay.publish`) with one handler file.
- The event stream encodes each event once per payload object (`eventFrames` memo on a `WeakMap`) and gives each subscriber a bounded queue (`subscriberCapacity`, 4096); a subscriber that overflows is cut and must resync. Do not encode per subscriber.
- `Principal.of` ignores the request on purpose: the Basic username is a shared service identity, so actor-recorded fields carry the OS account.
- CORS answers preflight with `Vary: Origin` through `corsVaryFix`, which works around effect-smol overwriting the header; keep it until the upstream fix lands (see the TODO in `cors.ts`).
- `location.ts` falls back to `process.cwd()` when no `location[directory]` is sent; a hosted server therefore resolves a bare request to its own cwd.
- A request body or query that Core cannot decode surfaces through `schemaErrorLayer`; a handler that catches broad causes can hide interruption and defects. Map only the tagged errors the Protocol endpoint declares.

## Input handling and response safety

Code: `packages/server/src` (`body-limit.ts`, `auth.ts`, `web-ui.ts`, `handlers/fs.ts`, `handlers/pty.ts`, `cors.ts`), `packages/core/src/filesystem.ts` (the `fs.read` cap). Tests: `packages/server/test/{body-limit,fs-read-http,pty-origin-http,auth,web-ui}.test.ts`.

### Request-body cap

- `BodyLimit.layer` is a global router middleware that `makeRoutes` provides next to the CORS layer. Every route gets `DEFAULT_LIMIT`, 16 MiB. `UPLOAD_ROUTES` get `UPLOAD_LIMIT`, 64 MiB: `/api/session/:id/{prompt,command,synthetic}` and `/api/board/:id/issue/:id/attachment`. Attachments reach the server as base64 inside JSON: the desktop picker allows 20 MiB per prompt and the board 25 MiB per file, and base64 adds a third.
- Two tiers. A declared `Content-Length` over the limit gets 413 (`PayloadTooLargeError`, `connection: close`) before a byte is read. A body with no length (chunked) is cut off by `HttpServerRequest.MaxBodySize`, which the Node server enforces while it reads; the API reads payloads with `orDie`, so the overflow arrives as a defect and the middleware turns it into the same 413.
- A new route that carries files must be added to `UPLOAD_ROUTES`, or it stops at 16 MiB. The match is on the path without the query string.
- The cap covers bodies only. The WebSocket PTY input is not a request body.

### fs.read

- `FileSystem.READ_LIMIT` is 25 MiB, in step with the file viewer's 20 MiB content cache. A larger file fails with `PathError` reason `too-large`, which the handler answers as the declared 400 `file_too_large`. A preliminary `stat` checks the size, and a bounded read checks consumed bytes too, so growth beyond the limit is rejected. This is not a universal path-race, confinement or memory-bound guarantee.
- Every `fs.read` response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. The bytes are project content served in the type its extension names; without them an HTML or SVG file opened directly would run scripts with the server's origin. `actions.transfer.read` also sets both headers and consumes decoded query parameters in `actions-transfer.ts`. Malformed raw URL escapes can be rejected with 404 before the handler; schema-invalid parameters return 400.

### PTY upgrade

- `pty.connect` checks `isAllowedRequestOrigin` first, for every upgrade, ticket or not, and answers 403. A browser always sends `Origin` on an upgrade and cannot set `Authorization`, so this is what stops a page on another origin. Clients that send no `Origin` (the CLI, scripts) pass. The desktop renderer (`oc://renderer`), localhost, the same host and the configured `cors` list pass.
- The ticket, when present, is consumed after the origin check; it is not the origin check.

### Password compare

- `ServerAuth.authorized` hashes both sides with SHA-256 and compares with `timingSafeEqual`, so the secret's length does not leak, and evaluates the username and the password both so the timing does not say which half failed.

### Web UI paths

- `WebUi.layer` decodes the request path with `decodeURIComponent`, which throws on a malformed escape such as a lone `%`. That is answered 400 through `Effect.try`; do not let it surface as a defect (500).

### Not covered

- There is no `Host` header allowlist. With `--hostname 0.0.0.0` or mDNS the server is reachable by name, so DNS rebinding relies on the password. Adding an allowlist is a design change.

---
name: server-maintenance
description: The input limits and response headers of the HTTP server (request-body cap, fs.read size cap and headers, PTY upgrade origin check, constant-time password compare, web UI path decoding) and the traps in each. Use when changing packages/server/src/body-limit.ts, auth.ts, web-ui.ts, handlers/fs.ts or handlers/pty.ts, or when a client reports a 413 or a refused terminal connection.
---

# Server input handling maintenance

Code: `packages/server/src` (`body-limit.ts`, `auth.ts`, `web-ui.ts`, `handlers/fs.ts`, `handlers/pty.ts`, `cors.ts`), `packages/core/src/filesystem.ts` (the `fs.read` cap). Tests: `packages/server/test/{body-limit,fs-read-http,pty-origin-http,auth,web-ui}.test.ts`.

## Request-body cap

- `BodyLimit.layer` is a global router middleware that `makeRoutes` provides next to the CORS layer. Every route gets `DEFAULT_LIMIT`, 16 MiB. `UPLOAD_ROUTES` get `UPLOAD_LIMIT`, 64 MiB: `/api/session/:id/{prompt,command,synthetic}` and `/api/board/:id/issue/:id/attachment`. Attachments reach the server as base64 inside JSON: the desktop picker allows 20 MiB per prompt and the board 25 MiB per file, and base64 adds a third.
- Two tiers. A declared `Content-Length` over the limit gets 413 (`PayloadTooLargeError`, `connection: close`) before a byte is read. A body with no length (chunked) is cut off by `HttpServerRequest.MaxBodySize`, which the Node server enforces while it reads; the API reads payloads with `orDie`, so the overflow arrives as a defect and the middleware turns it into the same 413.
- A new route that carries files must be added to `UPLOAD_ROUTES`, or it stops at 16 MiB. The match is on the path without the query string.
- The cap covers bodies only. The WebSocket PTY input is not a request body.

## fs.read

- `FileSystem.READ_LIMIT` is 25 MiB, in step with the file viewer's 20 MiB content cache. A larger file fails with `PathError` reason `too-large`, which the handler answers as the declared 400 `file_too_large`. The size comes from `stat` before the read, so a file that grows between the two is still read in full.
- Every `fs.read` response carries `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`. The bytes are project content served in the type its extension names; without them an HTML or SVG file opened directly would run scripts with the server's origin. `transfer.read` has its own handler and does not set them yet.

## PTY upgrade

- `pty.connect` checks `isAllowedRequestOrigin` first, for every upgrade, ticket or not, and answers 403. A browser always sends `Origin` on an upgrade and cannot set `Authorization`, so this is what stops a page on another origin. Clients that send no `Origin` (the CLI, scripts) pass. The desktop renderer (`oc://renderer`), localhost, the same host and the configured `cors` list pass.
- The ticket, when present, is consumed after the origin check; it is not the origin check.

## Password compare

- `ServerAuth.authorized` hashes both sides with SHA-256 and compares with `timingSafeEqual`, so the secret's length does not leak, and evaluates the username and the password both so the timing does not say which half failed.

## Web UI paths

- `WebUi.layer` decodes the request path with `decodeURIComponent`, which throws on a malformed escape such as a lone `%`. That is answered 400 through `Effect.try`; do not let it surface as a defect (500).

## Not covered

- There is no `Host` header allowlist. With `--hostname 0.0.0.0` or mDNS the server is reachable by name, so DNS rebinding relies on the password. Adding an allowlist is a design change.

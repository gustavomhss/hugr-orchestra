# L1: global live SSE and durable session streams

Key: `s1.api.stream-contract`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Two event contracts

| Boundary | Source-supported behavior | Limit |
| --- | --- | --- |
| Global `GET /api/event` | Public server event schema; live subscription, connected readiness frame, heartbeat comments | No replay cursor or reconnect guarantee is established. |
| Session `GET /api/session/:sessionID/event` | Durable session event schema after an exclusive sequence | Live-only deltas are absent from the durable inventory. Core implements the actual replay/live bridge. |
| Session history | Finite durable page plus `hasMore` | It is not the global live feed and does not promise a cross-page snapshot. |

`packages/server/src/handlers/event.ts` creates a per-handler WeakMap frame cache keyed by event payload object. A repeated payload object is encoded once and the cached frame is shared across subscribers. Frames use event `message` and no SSE event ID. The function is an observed implementation mechanism; no performance measurement was taken.

`eventStream` obtains `EventV2.allBounded(events, 4096)` before producing `server.connected`, so a consumer observing readiness has already acquired its live subscription. The stream concatenates the connected frame and live events, merges 15-second heartbeat comments, and halts the merge when the primary side ends. The response sets `text/event-stream`, `no-cache, no-transform`, `X-Accel-Buffering: no`, and `X-Content-Type-Options: nosniff`. Capacity 4,096 is a declared subscription bound, not a proof that slow subscribers can never lose data or that a remote proxy honors these headers.

The session handler delegates `session.events(sessionID, after)` and uses `Stream.orDie`. A pre-stream missing session can be returned through middleware as 404; a stream defect after response establishment is not converted into a later JSON response. The schema manifests explicitly distinguish all session events from durable session events. Clients resuming durable work must use aggregate sequence semantics, not assume that global message frames supply resumable SSE IDs.

## Client consumption boundary

The generated Promise client returns a lazy async iterable: opening/reading the stream happens during iteration. It checks the SSE content type and response body, decodes chunks, joins multi-line data, normalizes CRLF, parses JSON data, and cancels/releases the reader in `finally`. It limits its buffered string to 1,048,576 characters. That is a character-length guard, not a stated byte or event-count bound. No automatic reconnect/resume loop is implemented by this inspected transport.

The Effect projection uses the imported HttpApi contract and exposes Effect streams with decoded schema values. Its generated mapping converts recognized HTTP, schema, and SSE retry transport failures into `ClientError`, while preserving unrelated typed errors. The Promise reader validates JSON syntax but does not run the complete schema decoder over each successful event.

## Evidence and gaps

Exact primary files: Schema `event.ts`, `session-event.ts`, `event-manifest.ts`; Protocol `groups/event.ts`, `groups/session.ts`; Server `handlers/event.ts`, `handlers/session.ts`; Client generated Promise stream runtime and generated Effect methods. The generator's imported Effect adapter is also captured.

The server event-stream test was read: it uses a stand-in event bus with the actual stream helper to exercise readiness, a burst, and encoding reuse. It was not run. Client stream tests likewise provide intended assertions, not observed results. Queue-overflow behavior and replay continuity inside Core, network disconnects, proxies, and deployed clients remain outside this artifact's demonstrated behavior.

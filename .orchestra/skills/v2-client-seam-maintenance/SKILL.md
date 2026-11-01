---
name: v2-client-seam-maintenance
description: Who owns the seam where packages/app-shell talks to the V2 server and turns server events into client state (v2-wire.ts, v2-types.ts, client-events.ts, server-api.ts and its drift gate, server-event-native.ts, server-session-v2-reducer.ts, server-session.ts, session recovery, session-management fences, permission auto-accept, model variants, agent identity), the ordering and idempotency rules that must not regress, and how to change and test it; use when a wire shape, event type or reducer changes, a message or part duplicates, vanishes or arrives out of order, a stream stalls or replays after reconnect, or the app and server types drift.
---

# V2 client seam maintenance and ownership

Related: `claude-mode-maintenance` (engine events that reach this seam), `session-requests-usage` (how a person answers a permission or question). The transcript view-model lives in `@orchestra/session-ui/transcript-model` (re-exported by `v2-wire.ts`).

## Ownership

| Piece | Owner file(s) under `packages/app-shell/src/` | Rule |
|---|---|---|
| Wire view-models | `v2-wire.ts` (3521 lines, edited by hand): re-exports of the transcript model (top), `Agent`, `Config*` (about 277), the server `Event` union (about 473) and the `Event*` payload types (about 551 to 1625), `Maestro*`, `Mcp*`, `Model*`/`Provider*` (about 1730 to 2460), `Permission*`, `Prompt*`, `Pty`, `QuestionV2*`, `Reference*`, `Relay*`, `Session*` (`SessionCommandInput`, `SessionPromptInput`, `SessionMessage*`, `SessionPending*`, `SessionStatus`, `SessionV2Info`), `Todo`, `CurrentProject` | Mirrors `@orchestra/schema` and `@orchestra/protocol` (`packages/protocol/src/groups`); the schema and protocol change first. Line numbers drift; grep for the type |
| Schema aliases | `v2-types.ts` | Names built from `@orchestra/schema/*` encoded types with readonly dropped; adapted aliases keep the app's own field names and are authoritative for them |
| Internal event union | `client-events.ts` (1502 lines) | `ServerCurrentEvent`: tags like `session.text.delta` with a `data` payload. It is not the `Event` of `v2-wire.ts` (`session.next.*` with `properties`). Holds only what `EventManifest.ServerDefinitions` (`packages/schema/src/event-manifest.ts`, `packages/protocol/src/groups/event.ts`) publishes, plus what the app derives |
| Event translation | `context/server-event-native.ts` | `createNativeEventAdapter` turns `session.next.*` into the `client-events.ts` vocabulary; `context/server-sdk.tsx` calls `native(event) ?? event`, so an event it does not translate goes on untouched, and `adaptServerEvent` wraps the result as `ServerEvent` (`properties` is the event `data`, `current` the event itself). The `client-events.ts` header says `permission.v2.*` and `question.v2.*` are mapped onto `permission.*` and `question.*` |
| API contract | `server-api.ts`, `server-api-parity.ts`, adapter `utils/server.ts` | `ServerApi` is hand-written, the adapter is built from the generated `@orchestra/client`; `ServerApiDrift` makes a group or method on one side only a compile error |
| Local session shapes | `session-types.ts` | Only shapes with no schema or wire counterpart (for example the file diff with `file`, not `path`); re-exports `ClientEvent` |
| V2 reducer | `context/server-session-v2-reducer.ts` | Pure fold of one event into V2 messages plus `touched` ids and an optional `missing` id; no store writes |
| Session store | `context/server-session.ts` (with `context/session-recovery.ts`, `context/global-sync/session-cache.ts`) | `applyV2` runs reducer then `projectV2`; owns history paging, load reconciliation, optimistic user messages, cache eviction |
| Directory view | `context/directory-sync.ts` | `createDirSyncContext`: proxies `session_*`, `todo`, `permission`, `question`, `message`, `part` to the server-wide session store and the rest to the directory child store; passes session lists through the fences |
| Query keys | `context/server-queries.ts` | Keys are `[scope, directory, name]`; `createProviderRefresher` cancels in-flight queries and refetches with `staleTime: 0` |
| Policy fences | `context/session-management-state.ts` | Archive and subagent-model revisions survive directory-store eviction (`sessionManagementFences`, cap `SESSION_MANAGEMENT_FENCE_LIMIT` 2048) |
| Permission auto-accept | `context/permission-auto-respond.ts` | Follows session lineage: the child's own setting beats the parent's, then a directory-level fallback |
| Model variant | `context/model-variant.ts` | `null` means default; cycling goes none, first, next, back to none |
| Agent identity | `context/agent-identity.ts` | `agentKey` and `agentMention` route by stable id; the display name is presentation only |

## Invariants

- Direction of change: schema or protocol, then `bun run generate` in `packages/client` (never edit `src/generated` or `src/generated-effect`), then `server-api.ts`/`utils/server.ts`, then `v2-wire.ts`/`v2-types.ts`, then `client-events.ts` and the translator. The app never imports Core or Server.
- `ServerApiDrift` holds inputs to the wire in both directions. Outputs are left out on purpose: the contract keeps the app's own view of them. Do not "fix" a drift by widening a contract input; fix the side that is wrong.
- Reducer: `append` is idempotent by message id. `text`/`reasoning` `started` is idempotent (`insertOrdinal`). `ended` overwrites with the final text. `delta` concatenates and is not idempotent, so no layer may deliver one twice. `tool.success` applies only from running; `tool.failed` only from streaming or running.
- Events for an unknown message id are no-ops (empty `touched`). `input.promoted` without a prior `input.admitted` returns `missing`, and `applyV2` calls `hydrateV2Message`, which fetches that message. `step.started` closes the previous open assistant message and reopens an existing one. `retry.scheduled` carries an empty `assistantMessageID`, so the reducer ignores it while the status line shows it.
- Text and reasoning parts are positional: ordinals come from stable server part ids per assistant message and are cleared on step end or failure. Part order comes from content order, never from opaque call ids.
- Live events beat fetched history: `MessageLoadState` markers (touched, removed, retained, optimistic parts) describe the current HTTP attempt and reset on every retry. A generation check drops a response that returns after eviction. Optimistic user messages are confirmed once the server shows them.
- Part removal is event-only and tombstoned. A part whose parent message is unknown, outside a load, is dropped.
- Recovery: an event for an unknown session calls `recovery.resolve`; revert events force it (`force: true`). `session-recovery.ts` serializes reads per session, restarts a read when a policy event lands mid-flight, and aborts with `AbortError` when the generation was superseded.
- Stream: events are queued per directory (`location.directory`, else `"global"`), flushed on a 16 ms frame with a yield every 8 ms, and consecutive deltas for one key are merged by `coalesceServerEvents`. Reconnect backs off from 250 ms to 30 s and resets when an event arrives; `watchStreamStall` cuts a half-open stream; `pagehide` stops it and a persisted `pageshow` restarts it.
- Relay hook asks (`metadata.action === "relay_hook"`) are never auto-accepted. Pinned sessions and `protectedSessions` are never evicted from the cache.

## Traps

- Two event vocabularies share the word "event": the wire `Event` and `ClientEvent`. A new server event needs both a `v2-wire.ts` type and a `client-events.ts` entry plus a case in `server-event-native.ts`; missing the last leaves it silently untranslated. `session.next.tool.success` has its own decoder from `@orchestra/schema/session-event`.
- Event ids map to message ids by `evt_` to `msg_` (`messageID`); an event id that does not follow that prefix will not find its message.
- `server-sync.tsx` calls `session.applyV2(event.current)` before `session.apply(event)` for every event, then routes archive and subagent-model events through `applySessionPolicyEvent` instead; those two types must not reach the plain path.
- Fences and caches have caps (2048). Evicting a fence while a read is pending is handled in `applyPolicy` by forcing a recovery read; code that deletes a fence directly skips that.
- The compatibility "snapshot" source in `session-recovery.ts` carries no canonical V2 policy receipt and merges differently from the canonical source; test both.
- Do not name a seat's default display name in routing code; use ids through `agentKey`.

## Testing

Tests run only on CI: `bun run test:ci app <files>` (package `@orchestra/app`, unit lane uses `--conditions=solid` and `happydom.ts`; `test-browser/` uses `--conditions=browser`).

- Reducer and translation: `src/context/server-session-v2-reducer.test.ts`, `src/context/server-event-native.test.ts`, `src/utils/session-message.test.ts`.
- Store, order and stream: `src/context/server-session.test.ts`, `server-session-order.test.ts`, `sync-optimistic.test.ts`, `server-sdk.test.ts`, `server-sync.test.ts`, `src/utils/server-stream-liveness.test.ts`, `src/utils/server.test.ts`, `server-compat.test.ts`.
- Queries and helpers: `src/context/server-provider-refresh.test.ts`, `permission-auto-respond.test.ts`, `model-variant.test.ts`, `agent-identity.test.ts`, `src/utils/session.test.ts`, `session-management-errors.test.ts`.
- Fences, recovery, directory view (browser lane): `test-browser/session-recovery-fixes.test.ts`, `session-state-regressions.test.ts`, `session-management.test.ts`, `session-archive.test.ts`, `server-transport.test.ts`.
- No direct test: `v2-wire.ts`, `v2-types.ts`, `server-api.ts` (they are types; the drift gate is checked by `bun typecheck` in `packages/app-shell`), `directory-sync.ts` and `server-queries.ts` (covered only through the lanes above).

## Changing it

- Change schema or protocol first, run `bun run generate` in `packages/client`, then update the contract, adapter, wire types and translator in that order, and run `bun typecheck` from `packages/app-shell`.
- A new reducer event needs a stated idempotency rule and a case in `server-session-v2-reducer.test.ts`; a replayed or reordered delivery must not duplicate content.
- Touching load reconciliation, eviction or fences: add a case to the browser regressions above, since unit tests do not exercise the real store.
- Engine-specific events belong to `claude-mode-maintenance`; request answers to `session-requests-usage`.

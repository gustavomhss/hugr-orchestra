---
name: session-sync-maintenance
description: How the app and TUI recover Session history and status after a reconnect without overwriting newer events or reviving deleted owners
---

# Session sync maintenance

The app and TUI explicitly recover updates their global event subscription missed across a disconnect. App code: `packages/app-shell/src/context/server-sdk.tsx` (stream loop), `server-sync.tsx` (active reads and recovery epochs), `server-resync.ts` (reconcile and candidate selection), `server-session.ts` (content ownership and live status authority). TUI code: `packages/tui/src/context/sdk.tsx` (connection lifetime/epochs), `sync.tsx` (history owners, status reads and recovery).

## Reconnect resync

- The app's first `server.connected` greeting belongs to initial bootstrap. Every later greeting advances its recovery epoch before starting a **new direct active HTTP request**. A QueryClient fetch can join a pre-gap Promise, so it is not sufficient for this recovery read.
- Every active HTTP read, including initial bootstrap, captures the current recovery epoch. A response from an older epoch or a disposed owner cannot seed/reconcile Session status or resolve its metadata.
- `resyncAfterReconnect` force-syncs open pinned Sessions and loaded Sessions that were busy or appear active now. An uncached Session loads normally when opened. Failure to read active state retains live statuses but still recovers eligible history.
- The TUI SDK advances `connectionEpoch` for each actual `server.connected` **before queueing or fanout**, including the injected event-source adapter. A Sync owner can mount after a greeting and must still observe the current epoch.
- TUI recovery observes epochs greater than1 and normalizes snapshot epochs as `max(0, connectionEpoch-1)`. Thus greeting1 does not invalidate an initial bootstrap without providing replacement state. Recovery force-syncs the union of cached history, fully synced and pending/syncing IDs; it does not remount the view or reload provider/config catalogs.

## Forced history ownership

- Ordinary sync may join a current request. A force arriving during it waits for that exact predecessor to settle, then obtains a fresh read. Two forces during the same predecessor coalesce one successor. A force during the actual successor read may queue a third read.
- Ownership lasts until **all operations already started** settle: App metadata/history; TUI metadata/history/todo. `Promise.all` rejects early and can leave history in flight, allowing an overlapping successor or a skipped read while loading is still true. Use settlement of all children and propagate the actual failure afterwards.
- Keep each caller's outcome and existing caught-history failure/retry behavior. A failed predecessor must not suppress its forced successor. Preserve live touched-message merges and cached/prefetch behavior.
- In TUI, fully synced means history completeness for retry, not display readiness. Clear it only when an actual read starts and restore it only after successful complete history. A previously projected `store.message[sessionID]` (including `[]`) continues showing live events while refresh is held; a first cold hydration with no view still waits. Do not use `history.has` for this guard: the incoming event creates that entry before the projection check.
- App recovery generations and TUI per-cache owner object tokens invalidate future work after deletion, eviction or disposal. Compare exact task/token identity in finalizers; an old request must not erase a replacement owner's pending or trailing entry. Do not replace this with a boolean or permanent Session tombstone.

## Status authority

- Register a bounded touched-ID set before each active HTTP read and release it in `finally`. Actual live execution/retry writes and lifecycle removal mark it before mutation. Snapshot application itself does not count as a live event.
- Seed/reconcile skips IDs touched during that read. An untouched busy status absent from a fresh active snapshot becomes idle. An initial seed also keeps status already supplied by events.
- App `captureStatusChanges()` additionally captures `removed` for delete/evict. Candidate force selection excludes those IDs even if the routed view is still pinned when the response arrives. Do not infer deletion from absent info/messages: a valid pending-only Session may have neither. An explicit replacement owner runs its own fresh sync.
- These sets live only for their HTTP reads; they are not permanent per-ID version maps. Epoch fencing is separate: with **no live event**, an old bootstrap snapshot must still be unable to undo a newer gap recovery.
- TUI uses its actual native Event union: `session.next.step.started` busy; `step.failed` idle; `step.ended` idle except `finish=tool-calls`; `session.next.retried` retains attempt/message and its actual timestamp. Keep legacy `session.status` support. Do not import App runtime code into TUI.
- `submit.ts` still reads active status after interruption. Keep that separate admission/UI boundary intact.

## Event-source teardown

- Register cleanup synchronously for an asynchronous injected subscription. If subscribe resolves after disposal, call that future unsubscribe immediately once; otherwise store it for owner cleanup. Ignore callbacks after disposal before advancing epochs or queueing events, and observe subscription failure.
- Sync teardown invalidates its Session tokens and removes its event subscription. Late metadata/history/diff/request responses must not republish a deleted/disposed owner's state.

## Delete closes tabs

- A native deletion names the Session but no directory. Capture where it lived before applying deletion, then use `closeDeletedSession` to remove the home-index entry and notify the existing titlebar tab-removal path.
- Do not close tabs directly from sync. A temporarily pinned deleted ID is handled by the per-read removed set, independently of when the titlebar owner disposes.

## One bad event never drops the stream

- `createServerEventReader` wraps `adaptServerEvent`. An event that throws is skipped and logged once per type; the next event is still consumed. Do not move the catch around the entire loop.

## Focused verification

- App `context/server-session.test.ts`: force failures, same-predecessor coalescing, force during trailing, independent Sessions, delete/reentry ABA. Existing incremental/order/evict tests protect cache and live merges.
- App `context/server-sync.test.ts`: recovery selection, untouched idle reconciliation, delete/index/tab notification. `test-browser/server-resync.test.ts` uses real Solid providers and HTTP/SSE to test retained status, old bootstrap without live events, and deleted-but-pinned recovery with replacement ownership.
- TUI `test/cli/cmd/tui/sync-live-hydration.test.tsx`: real SDK SSE greeting/offline/reconnect control and recovery on one mounted view, with no events injection. `sync-recovery-boundaries.test.tsx`: pending-only reconnect, all-child settlement, trailing forces, ABA, native status, bootstrap epochs, late owners and future unsubscribe. Existing sync/formatter/undefined-message tests protect compatibility.
- Browser provider tests use the existing `solid-dom` helper under the hosted browser conditions/happydom lane. Do not hide loader or mount failures with global React/context mocks. A transport receipt alone does not prove store application: wait for actual restored content or an untouched busy→idle witness before releasing an older snapshot.
- Run exact files with `bun run test:ci app ... --os both` or `bun run test:ci tui ... --os both`; never local tests. Distinguish setup/control/witness failures, intentional future API-red, and actual product RED. Assertions not reached in RED remain required GREEN obligations.
- Session UI source changes require the production six-case tab-switch benchmark before and after, serial one worker/current renderer. Preserve raw `BENCHMARK`/`BENCHMARK_PAGE`, exact CI SHA and timings. Completion/metrics are gates; do not invent performance thresholds.

This recovery does not provide a durable snapshot/live cursor, byte-perfect partial-delta ordering, a silent-stream watchdog or clustered Session ownership.

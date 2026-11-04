---
name: session-sync-maintenance
description: How the desktop app keeps sessions in step with the server after a reconnect, a remote delete or a bad event, and the tests that hold each rule
---

# Session sync maintenance

The app reads sessions from an event stream with no server-side replay: whatever happens while the stream is down is lost. These rules close that gap. Code: `packages/app-shell/src/context/server-sdk.tsx` (stream loop), `server-sync.tsx` (event listener), `server-resync.ts` (the resync, reconcile and delete helpers), `server-session.ts` (session store).

## Reconnect resync

- `server-sync.tsx` tells the first `server.connected` from later ones with `connectedBefore`. Only the first runs the initial load (`seedActiveSessionStatuses`, which never overwrites a status an event already wrote).
- Every later `server.connected` refetches the active list (`staleTime: 0`, not the cached query) and calls `resyncAfterReconnect`.
- `resyncAfterReconnect` force-syncs the open session (`session.open()`, the pinned routed chat) plus every already-loaded session that was busy before or is active now. Sessions never loaded are left alone: they load on open.
- If the active list cannot be read, statuses stay as they were but the open session is still reloaded.

## Status overwrite

- `reconcileActiveSessionStatuses` makes the server's active list the truth: a listed session becomes `busy` (a `running` entry) or its named status; a tracked session absent from the list becomes `idle`.
- Do not use it for the initial load, where events may already have written fresher statuses.
- `submit.ts` (`interruptPendingSession`) reads the active state back after an interrupt succeeds, the same as its catch path, so a successful interrupt never leaves a stale `busy`.
- Known race: a session that starts during the active fetch can be idled briefly. The next status event corrects it.

## Delete closes tabs

- A `session.deleted` lifecycle event carries no directory. The listener captures the session's info before applying the event, then calls `closeDeletedSession`.
- `closeDeletedSession` removes the session from the home index and calls `notifySessionTabsRemoved`, the same path archive uses. `titlebar.tsx` listens, removes the tabs and navigates away when the current tab was removed. Do not close tabs from the sync layer directly.

## One bad event never drops the stream

- `createServerEventReader` wraps `adaptServerEvent`. An event that throws (for example a tool success whose payload fails schema decode) is skipped and logged once per event type; the loop `continue`s with the next event.
- Do not move the try/catch around the loop: that is what dropped the whole connection before.

## Tests

- `context/server-sync.test.ts`, "reconnect resync": forced reload of the open session, loaded busy sessions, never-loaded sessions left alone, no-active-list case, stale busy becomes idle, delete removes the index entry and closes tabs.
- `context/server-sdk.test.ts`, `createServerEventReader`: a bad event is skipped and the next is applied; one log per type.
- `components/prompt-input/submit.suite.ts` (run by `submit.test.ts`, admission cases in `submit-admission.suite.ts`): the interrupt read-back.
- Run them with `bun run test:ci app <files>`.

---
name: session-store-maintenance
description: How the app session store turns V2 events into transcript rows without touching the whole session on every flush (incremental projection), and the traps in the touched contract, the part-skip rule and the source write. Use when changing packages/app-shell/src/context/server-session.ts (projectV2), server-session-v2-reducer.ts or normalizeSessionMessages in src/utils/session-message.ts.
---

# Session store maintenance

Code: `packages/app-shell/src/context/server-session.ts` (`projectV2`, `writeV2Source`, `partChanged`), `server-session-v2-reducer.ts` (`createV2SessionReducer`, `projectionTargets`), `src/utils/session-message.ts` (`normalizeSessionMessages`, `sameValue`).

## Incremental projection

A flush used to normalize every message of the session, reconcile all of them and write every part of the touched message, so streaming cost grew with the length of the session. `projectV2` now does work in proportion to what changed, and the store it leaves behind is the same one a full normalization would produce.

- The reducer reports `touched`: the ids it changed or appended. Every other message in `reduction.messages` must be the same object as in the source. A reducer change that rebuilds an untouched message, or changes one without listing it, silently drops updates.
- `projectionTargets(messages, touched)` widens that to the rows the wire form needs: a touched assistant also rebuilds its turn (the nearest user, compaction or described synthetic message, stopping at a shell, because the reply's agent and model are written onto that row), and a touched shell or compaction also rebuilds its `${id}:assistant` row. A new message kind with a derived row or a parent link must be added here.
- `normalizeSessionMessages(sessionID, source, only)` still walks the whole source, because agent, model and parent context come from earlier messages, but it builds rows and parts only for ids in `only`. Keep that walk free of per-message allocation for unwanted ids.
- `partChanged` skips `transcript.putPart` only when nothing else depends on the write: no load in flight for the session, no optimistic or pending-removal entry for the message or part, and the stored part is `sameValue` as the new one. Those writes feed load tracking, optimistic confirmation and tombstones, so do not widen the skip.
- `projectV2` reconciles only the touched source indexes (`touchedIndexes`), and only when the length is unchanged and each touched id sits at its index. An append, a re-sort or a hydrate (`replace: true`) falls back to one full reconcile. Do not reconcile untouched messages, which would replace their proxies.
- `reconcile` mutates the stored raw objects in place, so a proxy or object identity is not a safe cache key for parts. Compare values with `sameValue`.

## Tests

Run through `bun run test:ci app <files>`; never locally.

- `src/context/server-session-incremental.test.ts`, `incremental projection`: after every event of the multi-message stream in `server-session-stream.fixture.ts`, the store equals the full normalization, and untouched rows, source messages and part arrays keep reference identity while a reply streams.
- `src/context/server-session-v2-reducer.test.ts`, `touched contract`: untouched messages stay `===` across the stream, appended ids are listed, and `projectionTargets` cases.
- `src/utils/session-message-incremental.test.ts`: `normalizeSessionMessages` with `only` equals the full output filtered by id (including the parent's agent and model), and `sameValue`. It sits apart because `session-message.test.ts` loads the Solid server SDK that the plain runner cannot resolve.

When adding an event kind, extend `sessionStream` so the equivalence test covers it.

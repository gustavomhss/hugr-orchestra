---
name: session-requests-usage
description: How a person answers a permission or question request in a session, and how Stop ends a turn that is waiting on one
---

# Session requests usage

Covers the permission and question docks above the composer. User-facing description: `docs/guides/session-requests.md`.

## What the person sees

- A waiting permission or question replaces the composer with a dock. Stop stays visible: in the permission dock's footer, or above a question dock.
- Stop calls `session.interrupt` for the session. It is always enabled while a request waits, and it is a no-op when the session is idle.

## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.

## Where it lives

- Server route: `session.interrupt` in `packages/server/src/handlers/session.ts`.
- Core: `SessionV2.interrupt` calls `SessionExecution` interruption, which interrupts the drain. The runner's drain (`packages/core/src/session/runner/llm.ts`, `run`) settles requests with `PermissionV2.cancelSession` and `QuestionV2.cancelSession`.
- Per-waiter settlement: `packages/core/src/permission.ts` (`cancel`) and `packages/core/src/question.ts` settle a request when the fiber waiting on it is interrupted.
- App: the Stop row in `packages/app-shell/src/pages/session/composer/session-composer-region.tsx`.

## Checks

- Core tests: `packages/core/test/permission.test.ts` and `packages/core/test/question.test.ts` (`cancelSession` and interruption cases).
- Manual: start a run that asks for permission, press Stop, and confirm the dock closes and the session goes idle.

## Maintenance: per-turn cost in the session core

There is no `session-core-maintenance` skill yet; these notes are for whoever changes `packages/core/src/session`.

- `SessionProjector` `getCurrentShell` selects the newest `shell` row whose `data.callID` matches, with `limit 1`, and decodes only that row. Do not go back to reading and decoding every shell of the Session: a Shell end must cost the same on a long Session. The in-memory adapter (`SessionMessageUpdater.memory`) still scans a list; it serves tests only.
- `SessionCompaction` never drops a failed summary silently. A provider error event, an `LLM.Error` or an empty summary returns `false` (the turn continues with the request as built) and logs one warning naming the Session, the reason and the failure. Look for `Session compaction produced no summary` in the log when a Session stays over budget.
- Known gap: a failed summary still leaves `session.next.compaction.started` without a matching ended event, because no failed event exists. Adding one touches the event schema and every client reducer.
- The auto-compaction check estimates tokens from `JSON.stringify` of the whole request on each provider turn. The runner rebuilds the request messages from reloaded history every turn, so a cache keyed on message identity would never hit; an incremental estimate needs the runner to keep the converted messages between turns.
- Tests: `test/session-projector.test.ts` (shell lookup) and `test/session-compaction-failure.test.ts` (failure logging).

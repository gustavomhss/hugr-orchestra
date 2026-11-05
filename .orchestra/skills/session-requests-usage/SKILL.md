---
name: session-requests-usage
description: Use when changing or explaining what happens to a Session while a permission or question request waits — the question dock, the Stop row and `session.interrupt`, and how interruption settles every open request. Answering a permission and saving "always" rules are in `permissions-usage`
---

# Session requests usage

Covers the question dock, Stop, and the settling of open requests when a turn is interrupted. How a permission is read and answered (Allow once, Always, saved rules, auto-accept) is `permissions-usage`; this skill does not repeat it. User-facing description: `docs/guides/session-requests.md`.

## What the person sees

- A waiting permission or question replaces the composer with a dock. Stop stays visible: in the permission dock's footer, or above a question dock.
- Stop calls `session.interrupt` for the session. It is always enabled while a request waits, and it is a no-op when the session is idle.

## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.

## Archive and remove also stop the run

- `SessionV2.archive` (`archived: true`) and `SessionV2.remove` stop the Session's active run before they write, so every client (app, CLI, API) gets it. An archived Session is hidden, so a run that asked for permission afterwards could not be answered.
- The stop is `SessionLifecycle.stopped` (`packages/core/src/session/lifecycle.ts`): interrupt, then hold the Session with `SessionExecution.exclusive`. A wake that starts a drain between the two makes the hold return None, and the stop repeats. Without the hold a racing prompt would run on a deleted or hidden Session.
- `remove` stops the Session and every descendant (`SessionLifecycle.descendants`), parent first, then deletes them. A wake that lands while the hold is open drains afterwards and dies on the missing Session; it does not run.
- Restoring (`archived: false`) does not interrupt and does not resume; the person sends the next prompt.
- A Task child moved to the background is deliberately detached (`packages/core/src/tool/task.ts`, "The drain outlives a move to the background"): interrupting the parent turn leaves it running. Removing the parent still stops it, as a descendant.
- Tests: `packages/core/test/session-stop-runs.test.ts` (racing wake, descendant drain) and `packages/core/test/session-archive.test.ts` (archive stops, restore does not).

## Where it lives

- Server route: `session.interrupt` in `packages/server/src/handlers/session.ts`.
- Core: `SessionV2.interrupt` (`packages/core/src/session.ts`) calls `SessionExecution.interrupt` (`session/execution.ts`), which interrupts the drain. The runner's drain (`packages/core/src/session/runner/llm.ts`, `run`) settles requests with `PermissionV2.cancelSession` and `QuestionV2.cancelSession`.
- Per-waiter settlement: `packages/core/src/permission.ts` (`cancel`) and `packages/core/src/question.ts` settle a request when the fiber waiting on it is interrupted.
- Reject: a rejected permission or dismissed question halts the drain like Stop, but the runner first ends the step with a failure event (`INTERRUPTED_TURN`, which activity counts as a stop, not a failure). The app clears busy on `session.step.failed`/`ended`, so without it the spinner and Stop button stay on. Held by the declined-permission and dismissed-question cases in `packages/core/test/session-runner.test.ts`.
- App: the Stop row in `packages/app-shell/src/pages/session/composer/session-composer-region.tsx`.

## Checks

- Core tests (run with `bun run test:ci core <files>`): `packages/core/test/permission.test.ts` and `packages/core/test/question.test.ts` (`cancelSession` and interruption cases), `packages/core/test/tool-question.test.ts` for the question tool.
- The question dock is `packages/app-shell/src/pages/session/composer/session-question-dock.tsx`; the permission dock is `permissions-usage`'s.
- Manual: start a run that asks for permission, press Stop, and confirm the dock closes and the session goes idle.

## Maintenance: per-turn cost in the session core

Per-turn cost notes for `packages/core/src/session` stay here. Wake, interrupt and failure semantics of the run coordinator are `session-core-maintenance`.

- `SessionProjector` `getCurrentShell` selects the newest `shell` row whose `data.callID` matches, with `limit 1`, and decodes only that row. Do not go back to reading and decoding every shell of the Session; decoding stays bounded to that one row. The in-memory adapter (`SessionMessageUpdater.memory`) still scans a list.
- `SessionCompaction` never drops a failed summary silently. A provider error event, an `LLM.Error` or an empty summary returns `false` (the turn continues with the request as built) and logs one warning naming the Session, the reason and the failure. Look for `Session compaction produced no summary` in the log when a Session stays over budget.
- Every started compaction attempt settles ended on success, or `session.next.compaction.failed` on failure or interruption. A failed attempt adds no canonical checkpoint.
- The auto-compaction check estimates tokens from `JSON.stringify` of the whole request on each provider turn. The runner rebuilds the request messages from reloaded history every turn, so a cache keyed on message identity would never hit; an incremental estimate needs the runner to keep the converted messages between turns.
- Tests: `test/session-projector.test.ts` (shell lookup) and `test/session-compaction-failure.test.ts` (failure logging).

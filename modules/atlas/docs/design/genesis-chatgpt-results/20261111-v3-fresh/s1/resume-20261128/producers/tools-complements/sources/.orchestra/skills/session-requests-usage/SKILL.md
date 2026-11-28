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
- Reject: a rejected permission or dismissed question halts the drain like Stop, but the runner first ends the step with a failure event (`INTERRUPTED_TURN`, which activity counts as a stop, not a failure). The app clears busy on `session.step.failed`/`ended`, so without it the spinner and Stop button stay on. Held by the declined-permission and dismissed-question cases in `packages/core/test/session-runner.test.ts`.
- App: the Stop row in `packages/app-shell/src/pages/session/composer/session-composer-region.tsx`.

## Checks

- Core tests: `packages/core/test/permission.test.ts` and `packages/core/test/question.test.ts` (`cancelSession` and interruption cases).
- Manual: start a run that asks for permission, press Stop, and confirm the dock closes and the session goes idle.

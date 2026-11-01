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

## Where it lives

- Server route: `session.interrupt` in `packages/server/src/handlers/session.ts`.
- Core: `SessionV2.interrupt` (`packages/core/src/session.ts`) calls `SessionExecution.interrupt` (`session/execution.ts`), which interrupts the drain. The runner's drain (`packages/core/src/session/runner/llm.ts`, `run`) settles requests with `PermissionV2.cancelSession` and `QuestionV2.cancelSession`.
- Per-waiter settlement: `packages/core/src/permission.ts` (`cancel`) and `packages/core/src/question.ts` settle a request when the fiber waiting on it is interrupted.
- App: the Stop row in `packages/app-shell/src/pages/session/composer/session-composer-region.tsx`.

## Checks

- Core tests (run with `bun run test:ci core <files>`): `packages/core/test/permission.test.ts` and `packages/core/test/question.test.ts` (`cancelSession` and interruption cases), `packages/core/test/tool-question.test.ts` for the question tool.
- The question dock is `packages/app-shell/src/pages/session/composer/session-question-dock.tsx`; the permission dock is `permissions-usage`'s.
- Manual: start a run that asks for permission, press Stop, and confirm the dock closes and the session goes idle.

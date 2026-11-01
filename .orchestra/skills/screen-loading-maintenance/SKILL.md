---
name: screen-loading-maintenance
description: How Orchestra chapters keep their last data across screen switches and never suspend the shell, the chapters that follow each rule, and the specs that check them
---

# Screen loading maintenance

A chapter is mounted fresh on every switch. Anything it keeps in a per-mount store or controller is gone, so without care each switch shows a loading state and asks the server again. Two rules keep switches fast.

## Rule 1: a per-mount store keeps its last value

A chapter whose data lives in a per-mount `createStore`, controller or signal keeps the last value per key with `createWarm` (`packages/app-shell/src/orchestra/warm.ts`). On mount it paints that value at once, then asks the server for a fresh copy and swaps it in without going back to `loading`.

- Key the entry by server and directory, for example `${serverSDK().scope}\0${pathKey(directory)}`, plus whatever else changes the answer (period, binding revision, project key). A profile switch then never shows another profile's numbers.
- Keep the cache at module level, but let the model or controller take an optional `warm` so a test can hand over a fresh one. A shared module cache leaks between tests.
- Write the cache only with complete reads. A failed revalidation leaves what is on screen (`settleTile` in `chapters/kpis-data.ts`); a first visit with nothing held shows the failure.
- Do not write to a store when the fresh value equals the one held. Solid then keeps the same object and nothing built from it (the Atlas model) is rebuilt.
- Start independent reads together and let each land as it resolves. A slow read must not hold the others (Home tiles, Checks capabilities beside the first pages, Board CI trails after the board).
- A window-focus reread is throttled (Atlas: once per 60 seconds).

Chapters that follow this rule:

| Chapter | Where | Warm entry |
|---|---|---|
| Home KPIs and the Flight Engineer card | `chapters/kpis.tsx`, `chapters/flight-engineer/entry.tsx` | tiles per period, latest meeting |
| Atlas | `chapters/atlas/atlas-controller.ts` | snapshot and review per directory |
| Checks (Actions) | `actions/model.ts` (`createActionsWarm`) | bindings per directory, capabilities and first library pages per binding revision |
| Projects board | `chapters/board/board.tsx` | project list per server, board and CI trails per project |
| Skills, Workspaces | `chapters/skills.tsx`, `chapters/workspaces.tsx` | their last list |

## Rule 2: never read a pending query or resource unguarded in a chapter

`useQuery().data` and `createResource()` suspend the nearest Suspense boundary while they are pending. Read unguarded inside a chapter, that boundary is the shell, and the whole window blanks. Guard the read with `isSuccess` or `.latest`, and render a placeholder otherwise. `orchestra/relay/library.tsx` shows the pattern: `loaded = () => source.documents.isSuccess || cached()`.

Prefer a signal set from a `.then` over `createResource` when the value is only decoration (the Flight Engineer card does this).

## Tests

- `chapters/kpis-data.test.ts`: a tile keeps its last complete read when a revalidation fails.
- `chapters/atlas/atlas-controller.test.ts`: warm seeding, unchanged snapshot keeps the stored objects, focus throttle.
- `actions/model.test.ts` (`Actions warm visits`): second mount paints bindings, capabilities and the library before any read returns; capabilities load beside the first pages.
- End to end: `e2e/orchestra/chapter-kpis.spec.ts` (Home loading and profile switch), `chapter-atlas.spec.ts`, `chapter-skills.spec.ts` (a revisit shows the last list while the fresh request is held), `chapter-workspaces.spec.ts`, `chapter-cicd.spec.ts`. Board has no spec of its own.

Specs that need a DEV-only mark carry `@development-only`, because `test:ci` runs the production build.

Run them with `bun run test:ci app <files>`; end to end specs add `--runner playwright --config e2e/playwright.production.config.ts --os linux`.

## Adding a chapter

1. Does the chapter hold fetched data in a per-mount store? Add a warm cache keyed as above and seed from it.
2. Does any read happen through `useQuery` or `createResource` in the chapter body? Guard it.
3. Add a test that mounts twice with a shared fresh warm and asserts the second mount is `ready` before its reads return.

---
name: chapter-boundary-maintenance
description: How an Orchestra chapter suspends without blanking the shell — the keyed per-chapter Suspense boundary, guarded query and resource reads, sidebar chunk preload, and the specs that hold them
---

# Chapter boundary maintenance

The app shell has one outer `<Suspense>` (`pages/layout-new.tsx`). Anything that suspends under it holds the whole window: the sidebar stops responding and a route change keeps the previous URL until the pending read lands.

## The per-chapter boundary

`orchestra/chapter-route.tsx` wraps every chapter page, and the empty-chapter fallback, in `ChapterBoundary`:

- A `<Suspense>` with an empty `flex-1` fallback (`data-slot="orchestra-chapter-loading"`), so a fast chapter never flashes a spinner.
- Keyed by chapter id through `<Show when={props.chapter} keyed>`. A fresh boundary shows its fallback at once. A boundary that already resolved would instead hold the transition on the previous chapter.
- The keyed child must take the key argument (`{(chapter) => ...}`). A child function with no parameter is not called, and the chapter never renders.
- The server, SDK, sync and models providers stay outside the boundary, so they are not remounted when a chapter suspends.

## Reads inside a chapter

The boundary is a safety net, not the design. A chapter that suspends still shows nothing until the read lands. Read pending data through its status:

- `useQuery`: `query.isSuccess ? query.data : fallback`. Never `query.data` or `query.data?.x` in a render path.
- `createResource`: read `.latest` only once `state` is neither `unresolved` nor `pending` (`settings-v2/view/saved-permissions-section.tsx`, `trust-section.tsx`). A refetch then keeps the rows on screen.
- A list that must survive a failed background refresh keys on its own derived value too: `loaded = () => documents.isSuccess || list().length > 0` (`relay/hook-library.tsx`).

## Chunk preload

Lazy chapter pages expose `preload`. The sidebar calls it on pointer enter and focus (`orchestra/sidebar.tsx`), so opening a chapter rarely waits for its chunk download.

## Tests

- `e2e/orchestra/chapter-mcp.spec.ts`, "held trust and tool reads leave the shell and the server cards usable": holds `/api/trust` and `/api/mcp/tools`, then navigates away and back while they are held.
- `e2e/orchestra/chapter-hooks.spec.ts`, "held node types and ledgers leave the shell and the hook list usable".

Run them with `bun run test:ci app <files> --runner playwright --config e2e/playwright.production.config.ts --os linux`.

## Adding a chapter

1. Register the page in `chapterPages` with `lazy(...)`; it gets the boundary and the preload for free.
2. Hold each of its requests in a spec and assert the sidebar stays usable and the parts that do not need that request still render.

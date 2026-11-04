---
name: timeline-scroll-maintenance
description: Per-frame cost rules for the session timeline while a reply streams: no mask on growing content, one scroll-follow owner, the render overscan cap, and the specs that hold them. Use when changing packages/app-shell/src/pages/session/timeline/message-timeline.tsx, the scroll code in session.tsx or packages/ui/src/hooks/create-auto-scroll.tsx.
---

# Session timeline frame cost

Code: `packages/app-shell/src/pages/session/timeline/message-timeline.tsx` (virtualizer), `packages/app-shell/src/pages/session.tsx` (scroll state, history fill), `packages/ui/src/hooks/create-auto-scroll.tsx` (user-scrolled state).

A streaming reply resizes the last row every frame, so anything that reads or writes layout per resize, or repaints a layer that grows with the content, is paid every frame.

## Rules

- **No mask on growing content.** `[data-timeline-virtual-content]` is as tall as the whole history and changes height while streaming. Its 18px fade (`session.css`, moved by `syncContentMask`) is kept only because the transparent sticky header lives in the same scroller: a mask on the viewport would hide the header too, and an overlay cannot reproduce a fade over the pane's glass. Do not add another mask, filter, `backdrop-filter` or `mix-blend-mode` to the content layer or to a row. A change that moves the fade onto a fixed layer needs the header out of the scroller first, and the look must stay pixel-identical.
- **One scroll-follow owner: the virtualizer.** Follow-at-bottom is `anchorTo: "end"`, `followOnAppend`, `anchorResizedBottom` and `maybeAnchorBottom`. `createAutoScroll` in `session.tsx` only tracks `userScrolled` (pause on a wheel up, resume at the bottom) and writes `scrollTop` on an explicit `resume()`. Do not hand it the content element (`autoScroll.contentRef`): its ResizeObserver would write `scrollTop` against the virtualizer on every streamed frame. Other call sites of the hook (`session-turn.tsx`) keep their own contract.
- **One layout frame.** Scroll metrics (`scheduleScrollState`) and the history fill (`fill`) share the single rAF in `scheduleLayoutFrame`. A new per-resize reader joins that frame instead of adding a ResizeObserver callback that reads `scrollHeight` or `clientHeight` synchronously.
- **Overscan cap.** While the session is not idle, `timelineOverscan` (`virtual-items.ts`) limits the render overscan to `streamingOverscan` (8 rows per side). Idle may widen it to 20. Do not raise the cap.
- **Derive lookups from the items, not from the scroll tick.** The solid adapter notifies on every scroll tick, but core returns the same item array until the range or a measurement changes. `virtualItems` is a memo on that array and `virtualItemByKey` / `virtualRowKeys` hang off it. Do not call `getVirtualItems()` inside another memo.

## Tests that hold it

- `packages/app-shell/e2e/regression/session-timeline-follow.spec.ts`: pinned while a reply grows, parked after a wheel up, pinned again after returning to the bottom.
- `packages/app-shell/src/pages/session/timeline/virtual-items.test.ts`: the overscan cap.
- `packages/app-shell/e2e/smoke/session-timeline.spec.ts`: prepend anchor, composer gap and cached tab bottom.
- `packages/app-shell/e2e/performance/timeline-stability/scroll-interaction.spec.ts`: wheel and keyboard scrolling during remeasurement.

Run them with `bun run test:ci app <files>`; for the Playwright specs add `--runner playwright --config e2e/playwright.production.config.ts --os linux`.

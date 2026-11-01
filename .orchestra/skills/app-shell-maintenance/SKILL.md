---
name: app-shell-maintenance
description: How to change the Orchestra app shell (`packages/app-shell`) without regressing its accessibility rules for motion, tabs and comboboxes
---

# App shell maintenance

The renderer lives in `packages/app-shell/src`. This skill holds the rules a change there must keep. Add a section per area as the rules grow.

## Accessibility rules

The owner's Mac runs with Reduce Motion on, so these are checked live, not only in review.

### Motion

- A looping animation (`infinite`) always has a `@media (prefers-reduced-motion: reduce)` rule in the same stylesheet that sets `animation: none` on the same selectors. A skeleton then shows its resting background, a spinner a static arc.
- Entrance and transition animations read `--orchestra-duration-fast` and `--orchestra-duration-base`, which are `0ms` under reduce (`orchestra/theme.css`). Do not hard-code a duration for them.
- CSS `scroll-behavior: smooth` needs the same reduce override.
- Scripted scrolling (`scrollIntoView`, `scrollTo`) is not covered by CSS. Pass `smoothScroll()` from `@/utils/motion` as `behavior`; it returns `"auto"` when the system asks for reduced motion and is read at call time. Never write `behavior: "smooth"`.
- An opacity-only state indicator that carries meaning (the awake cup in `orchestra/tabs.css`) may keep running; say so in a comment next to it.

### Tabs

- A `role="tablist"` has `onKeyDown={tabKeydown}` from `orchestra/tab-keys.ts`, and each `role="tab"` has `tabindex={selected ? 0 : -1}`. The list is then one Tab stop and Left/Right/Home/End move focus and select, wrapping and flipping in right-to-left text.
- If the selected tab can be undefined (a route without an explicit tab), fall back to the default tab for `tabindex`, or the list becomes unreachable by keyboard.
- `orchestra/actions/entry-routing.ts` re-exports `tabKeydown` for older importers. New code imports it from `orchestra/tab-keys`.
- The pure part is `nextTabIndex`; its unit test is `orchestra/tab-keys.test.ts`.

### Command palette combobox

- The input of `components/dialog-command-palette-v2.tsx` is `role="combobox"` with an accessible name (`palette.search.label`), `aria-expanded` true only while results exist, and `aria-controls` pointing at the listbox only while it is mounted.
- The `role="listbox"` holds only options. Loading and empty text go in the always-mounted `role="status"` element beside it, so a screen reader hears the change. A live region that mounts together with its text is often not announced.
- New strings go in `i18n/en.ts` and `i18n/br.ts` (pt-BR).

### Tests

- Playwright specs in `e2e/orchestra/` use `page.emulateMedia({ reducedMotion: "reduce" })` and also run the same probe with `"no-preference"`, so a passing reduce check cannot be an accident of the fixture.
- `chapter-atlas.spec.ts` covers the Atlas animations, the review tabs and the palette combobox.

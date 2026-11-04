---
name: app-shell-maintenance
description: How to change the Orchestra app shell (`packages/app-shell`) without regressing accessibility (motion, tabs, comboboxes) or dialog and destructive-action behavior
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

## Dialog behavior rules

Visual rules (glass, tokens, radius) live in `orchestra-design-system`. The rules below cover how dialogs and
destructive actions behave.

- Backdrop dismissal needs a press that started on the backdrop. Never close from a bare `click` whose target is the
  `<dialog>`: a text drag-select that starts in a field and is released over the backdrop fires a `click` on the dialog
  and would close it and lose the draft. Use `backdropDismiss` from `chapters/dialog-backdrop.ts` (spread
  `onPointerDown` and `onClick`). Do not write another inline rect check.
- A dialog with a request in flight cannot be closed by the person. Route Cancel, the close button, Escape (both the
  `keydown` handler and `onCancel`) and the backdrop through one `dismiss` that does nothing while busy, and disable the
  buttons. A late failure needs a dialog to show itself in. See `skills-dialog.tsx` and `mcp-dialogs.tsx`.
- A refusal is shown inside the dialog that caused it, as `role="alert"`. A toast renders under a `showModal()` dialog
  (the top layer is inert), so it cannot carry a refusal for an open sheet. The Atlas kit has an `error` slot on
  `AtDialog` for this.
- Atlas sheets confirm on Enter. The primary button of `AtDialogFoot` is the form's `type="submit"` button and the form
  itself only calls `preventDefault`, so Enter in a field behaves like a click and a disabled button blocks it. Do not
  add per-sheet Enter handlers. Enter in a `<textarea>` stays a newline.
- A toast with the `xc` icon (a refusal) is sticky: no timer, `role="alert"`, with a dismiss button. Other toasts are a
  polite status that goes after 3.2 s. A refusal must not depend on a person looking at the right moment.
- A destructive action that cannot be taken back (remove a key, reset every shortcut or hotkey, delete a meeting) asks
  first, takes a busy flag so a double click sends one request, and shows its failure as `role="alert"`. Put the confirm
  inline when the control sits in a settings list (Flight Engineer settings) and in a dialog when it sits on a page
  (Shortcuts reset). Cancel is the default focus.
- An optimistic update rolls back on failure. Hiding a row before the request returns is fine only if a failed request
  puts it back (Flight Engineer detail).

## Tests

- `chapters/dialog-backdrop.test.ts` covers the helper with real events.
- Specs in `e2e/orchestra`: `chapter-skills.spec.ts` (drag-select released on the backdrop, close blocked while saving),
  `chapter-atlas.spec.ts` (Enter confirms a sheet), `chapter-shortcuts.spec.ts` (reset asks first).

## Traps

- Copy goes in both locale objects of the chapter's file under `src/i18n/orchestra-chapters/` (English and pt-BR).
- `happy-dom` lays nothing out, so every box is 0x0 at the origin; a unit test that needs "outside the box" uses any
  other point.
- This skill and the guides in `docs/guides` stay in the repository; they do not ship with the app.

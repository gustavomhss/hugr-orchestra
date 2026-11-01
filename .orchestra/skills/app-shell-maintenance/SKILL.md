---
name: app-shell-maintenance
description: Behavior rules for dialogs, toasts and destructive actions in packages/app-shell chapters (backdrop dismissal, busy guards, Enter to confirm, where a refusal is shown, confirm steps). Use before adding or changing a native `<dialog>`, the Atlas sheet kit, a toast, or a Reset, Remove or Delete button under packages/app-shell/src/orchestra.
---

# App shell behavior rules

Visual rules (glass, tokens, radius) live in `orchestra-design-system`. This skill covers only how dialogs and
destructive actions behave.

## Dialog behavior rules

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

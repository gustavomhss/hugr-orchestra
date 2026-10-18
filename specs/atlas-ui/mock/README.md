# Atlas — interactive design preview

This preview covers the Atlas screens proposed in [`../STUDY.md`](../STUDY.md) (section 5) in their final shape, with no phase markers. All data is sample data and nothing reads `.atlas/`. Review actions work, can be undone, and reset on reload.

## Open it

Open `index.html` in Chrome. It works straight from disk (`file://`) because the scripts are classic, not modules.

You can also serve the repository root:

```bash
python3 -m http.server 4791 --bind 127.0.0.1
```

and open `http://127.0.0.1:4791/specs/atlas-ui/mock/index.html`.

The page links the app's real chapter kit (`packages/app-shell/src/orchestra/chapters/kit.css`), the Relay parts, the fonts and the brand assets. The shell comes from the approved Actions preview.

## Screens

Use "All screens" in the top bar to reach any of them.

- **Overview.** What agents know, how much is up to date, what needs you, the areas of the code and recent changes.
- **Knowledge.** Everything, by area or folder, with kind and status filters.
- **Details.** A panel beside the list, or a page you can link to.
- **Review.** Four tabs: no longer true, needs your confirmation, suggestions, and code moved.
- **Agents › Memory.** What one agent remembers. Agent memory lives in Agents, not in Atlas.
- **Chat.** Citation chips and "Used N things from Atlas".
- **Off and reading states.** Switch with "State" in the top bar.

## Interaction

- Every screen is a URL, and an open item is `?item=<id>`.
- `⌘K` searches everything.
- `j` and `k` move between items, and `Esc` closes details.
- `g` plus a letter jumps between screens. Press `?` to list them.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Page shell and script order |
| `shell.css` | Window, sidebar and side rail |
| `atlas.css` | Atlas parts, built only on kit tokens |
| `ui.js` | Icons, plain-language states and kinds, helpers |
| `data.js` | Sample knowledge; every count is derived from it |
| `views.js` | Overview, Knowledge, Review, Details, Agents › Memory, Chat, Off |
| `app.js` | Router, rail, details panel, review actions with Undo, search, keyboard, gallery |

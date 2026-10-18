# Atlas chapter — interactive design preview

An interactive mock of every Atlas screen proposed in [`../STUDY.md`](../STUDY.md). It is a preview with sample data, not a connected client: nothing reads `.atlas/`, and governed writes are shown locked with the phase that delivers them.

## Open it

Open `index.html` in Chrome directly (`file://` works, the scripts are classic), or serve the repository root and open the page:

```bash
python3 -m http.server 4791 --bind 127.0.0.1
```

Then open `http://127.0.0.1:4791/specs/atlas-ui/mock/index.html`.

The page links the real chapter kit (`packages/app-shell/src/orchestra/chapters/kit.css`), the Relay parts (`relay/relay.css`), the bundled fonts and the brand assets from the app, so it uses production tokens and controls. The shell is carried over from the approved Actions preview.

## What it covers

`#/gallery` lists every screen with its study ID and phase:

- A01 Overview
- A02 Territories (table and matrix)
- A03 Scope briefing
- A04 Facts
- A05 Inspector (drawer and page)
- A06 Drift
- A07 Relations (tree and layered graph)
- A08 Negations
- A09 Memory
- A10 History
- A11 Store health
- A12 Proposals
- A13 Ratification
- S01 Session citation chips and "why it knew"
- The command palette, the shortcut sheet, the ratify dialog and the HOLD state

The top bar switches:

- **State:** Ready, Building index, or Not configured (HOLD);
- **Light / dark;**
- **LTR / RTL.**

## Interaction model

- Every view is a URL (hash route): back/forward, reload and shared links land on the same screen. The open fact is part of the URL (`?inspect=<nodeKey>`).
- Selecting a row opens the inspector in place, beside the list.
  - Below 1280px it overlays the list; below 760px it takes the screen.
  - `j`/`k` step through facts and `Esc` closes it.
- `⌘K` opens the palette over any screen. It searches screens, territories, scopes, units, facts, seats and actions; `scope:` and `unit:` narrow it.
- `g` followed by a letter jumps between screens (`?` lists them). `/` focuses the list filter.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Page shell and script order |
| `shell.css` | Window, sidebar and chapter context rail |
| `atlas.css` | Atlas parts, built on kit tokens only |
| `ui.js` | Icons, state marks (freshness, truth and tier kept separate) and helpers |
| `data.js` | Sample data shaped like `own`, `query`, `doctor` and `memory-header` output |
| `views-knowledge.js` | A01–A06 |
| `views-more.js` | A07–A13, S01, gallery and HOLD |
| `app.js` | Router, navigation, inspector, palette and keyboard |

# Orchestra interface specification

The rules, scales and values behind Orchestra's interface. The stylesheets are the source of truth; this document
explains them and records the numbers so a change can be judged before it is made. When the two disagree, the CSS
wins and this file is stale: fix it in the same change.

- Tokens and materials: `theme.css`. Session surface: `session.css`. Chapter kit: `chapters/kit.css`.
- Palettes: `palette/definitions.ts` (anchors) and `palette/generated/*` (output, never edited by hand).
- Dark values are listed first; light values follow where they differ.

## 1. Principles

1. **Quiet glass.** A narrow blur that darkens and slightly desaturates, with no rim, sheen or grain. The owner
   judged the wide, saturated glass with a light-catching rim worse (2026-10-27); do not bring it back without them.
2. **The wallpaper stays behind a veil.** A dark (or light) veil over the photograph keeps the chrome calm.
3. **One saturated element per view:** the primary action. Everything else is quiet.
4. **Tokens only.** A literal color, radius, size or duration appears only inside a token definition.
5. **Contrast is measured, not eyeballed.** Text holds 4.5:1 and icons 3:1 on the glass over the photograph.

## 2. Materials

Exactly three. Never stack glass on glass: inside a glass panel, depth comes from fill steps and hairlines.

### 2.1 Chrome glass

Sidebar, tab strip, toolbar, Home and chapter panels (`.orchestra-glass`, blur on `[data-glass-plate]`).

| Token | Dark | Light |
| --- | --- | --- |
| `--orchestra-glass-filter` | `blur(8px) brightness(0.74) saturate(0.9)` | `blur(16px) brightness(1.04) saturate(0.96)` |
| `--orchestra-glass-background` (tint) | `rgba(26,36,48,.5)` → `rgba(13,19,26,.46)` 46% → `rgba(10,15,21,.54)` | `rgba(255,255,255,.62)` → `rgba(248,250,252,.5)` 46% → `rgba(240,244,247,.6)` |
| `--orchestra-glass-rim`, `--orchestra-glass-sheen` | `none` (the masked ring and the sheen layer stay wired) | same |
| `--orchestra-glass-border` | `rgba(160,179,197,.16)` | `rgba(70,84,98,.16)` |
| `--orchestra-glass-shadow` | inset top highlight `.08`, inset bottom `rgba(0,0,0,.3)`, `0 1px 2px .4`, `0 4px 12px .2` | inset top white `.95`, inset bottom `.14`, `0 1px 2px .14`, `0 4px 12px .08` |
| `--orchestra-grain` | `none` | same |

The toolbar blurs a flat `blur(20px)` under its own tint. Toolbar and tab text: dark `#7d8b9b` labels, `#81909f`
tabs; light `#6b7480` labels, `#5f6874` tabs.

The tint is a vertical gradient: lighter at the top where light lands, denser at the bottom where text sits.

### 2.2 Float glass

Popovers, menus, selects, hover cards, the profile menu and dialogs. The strongest glass, because only text sits on
it and it is open briefly. Never make a floating layer opaque.

| Token | Dark | Light |
| --- | --- | --- |
| `--orchestra-float-filter` | `blur(40px) brightness(0.9) saturate(1.8)` | `blur(40px) brightness(1.08) saturate(1.8)` |
| `--orchestra-float-background` | `rgba(30,40,53,.72)` → `rgba(18,25,34,.8)` | `rgba(255,255,255,.8)` → `rgba(246,248,251,.86)` |
| `--orchestra-scrim` | `rgba(5,9,14,.42)` | `rgba(40,52,66,.2)` |
| `--orchestra-scrim-filter` | `blur(6px) saturate(1.1)` | same |

Every backdrop (`dialog::backdrop`, palette and sheet scrims in Actions, Atlas, Relay and the chapters) blurs
through `--orchestra-scrim-filter`; no backdrop carries its own blur literal.

### 2.3 Content base

Session panels, near-opaque for long reading (`--orchestra-session-*` in `session.css`). Like the chrome they carry
no rim, sheen or grain. Their blur comes from the fixed blurred wallpaper copy in `.orchestra-glass-layer`
(`--orchestra-session-filter`: dark `blur(16px) brightness(0.58) saturate(0.86)`, light
`blur(18px) brightness(1.02) saturate(0.98)`), not from their own filter.

- Dark background: `rgba(22,31,41,.8)` → `rgba(15,21,29,.85)` 50% → `rgba(12,17,24,.9)`.
- Text steps: heading `#e9eef3`, body `#c2ccd6`, secondary `#93a2b2`, meta `#7e90a2`.
- Rules: `rgba(160,181,200,.1)`; between messages `.09`.

### 2.4 Workspace overlay

`--orchestra-workspace-overlay` is a veil over the photograph that keeps the chrome calm.

- Dark: `rgba(9,14,20,.7)` → `.58` at 42% → `.74`, plus a radial `rgba(26,37,50,.42)` glow at the top left.
- Light: `rgba(226,231,236,.5)` → `.34` at 42% → `rgba(222,228,234,.56)`, plus a radial white `.5` glow.

### 2.5 Performance

A `backdrop-filter` repaints whenever anything inside its box paints. The sidebar and tab strip draw their blur on
`[data-glass-plate]` siblings, and session panels use the single blurred copy. Change values, never this mechanism.

## 3. Fill steps inside a panel

| Token | Dark | Use |
| --- | --- | --- |
| `--orchestra-surface` | `rgba(32,43,55,.7)` | resting control or card fill |
| `--orchestra-surface-hover` | `rgba(44,58,73,.8)` | hover |
| `--orchestra-surface-active` | `rgba(70,95,122,.62)` | pressed or selected |
| `--orchestra-overlay-hover` | `rgba(255,255,255,.045)` | hover wash on transparent rows |
| `--orchestra-overlay-pressed` | `rgba(255,255,255,.08)` | pressed wash |
| `--mx-raised` | `rgba(19,28,38,.55)` / light `rgba(255,255,255,.63)` | chapter cards |
| `--mx-soft` | `rgba(170,196,220,.055)` | quiet chips and wells |
| `--mx-rim` | `rgba(166,189,211,.24)` / light `rgba(65,86,107,.24)` | card rim on hover or focus-within |
| `--mx-sheen` | white `.03` / light `.4` fading out over 56px | top light on cards and dialog heads |

Hairlines: `--orchestra-border-muted` `.14`, `--orchestra-border` `.2`, `--orchestra-border-strong` `.34`
(all on `rgb(163,184,203)`); chapter kit `--mx-line` `rgba(166,189,211,.14)`.

## 4. Color

### 4.1 Role tokens

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `--orchestra-text` | `#eef1f5` | `#1a1f26` | titles, strong text |
| `--orchestra-body` | `#c7d0d9` | `#353d48` | running text |
| `--orchestra-muted` | `#b2c0cf` | `#343d48` | labels, eyebrows |
| `--orchestra-faint` | `#aec2d4` | `#363e48` | meta |
| `--orchestra-accent` | `#9dc3e9` | `#0c3e6c` | links, focus, selection |
| `--orchestra-warm` | `#cfbd95` | `#4d390f` | warning |
| `--orchestra-success` | `#a6c8b7` | `#164431` | success |
| `--orchestra-danger` | `#e7b3b0` | `#5c302f` | error, destructive |

Every other color (`--orchestra-sidebar-*`, `--orchestra-tab-*`, `--orchestra-toolbar-*`, `--mx-*`) derives from
these. The legacy `--v2-*`, `--text-*`, `--surface-*` and `--border-*` names are aliases mapped in `theme.css`.

### 4.2 Rules

- Tints: `color-mix(in srgb, var(--role) N%, transparent)`, never a new literal.
- To fix contrast, change lightness and keep hue.
- Do not write light-mode overrides that restate a token's light value.
- Primary action: `--mx-primary` (`#3f7ebc` → `#326ba5`) with `--mx-primary-text` white. It is the only saturated
  fill on a screen.

### 4.3 Palettes

Dark and Light are hand-tuned. Graphite, Gruvbox, GitHub, Nord and AMOLED are generated: `palette/definitions.ts`
gives eight anchors per theme (background, surface, text, muted, accent, success, warning, danger), and
`bun script/orchestra-palettes.ts` (from `packages/app-shell`) remaps every Orchestra color by hue family and
fails if a palette cannot hold AA.

- AMOLED keeps true black: surface `#111111`, no photograph behind the glass, accent in the HuGR logo blue.
- After any change to an Orchestra stylesheet, rerun the generator: palettes copy every rule that carries a color.

## 5. Scales

### 5.1 Radius

| Token | Value | Use |
| --- | --- | --- |
| `--orchestra-radius-xs` | 4px | keycaps, tiny badges, inline code |
| `--orchestra-radius-sm` | 6px | buttons, nav items, inputs, pills, menu items |
| `--orchestra-radius-md` | 8px | small cards, popovers, list wells |
| `--orchestra-radius-lg` | 10px | panels (sidebar, main glass, session), chapter cards |
| `--orchestra-radius-xl` | 16px | the shell, dialogs, the ⌘K palette |
| `--orchestra-radius-full` | 999px | avatars, status dots, round toggles |

Nest concentrically: outer radius = inner radius + gap. The shell (16) holds panels (10) with a 6px gutter.

### 5.2 Type

Inter (bundled variable font), with `"Mx Inter"` and `"Mx Inter Medium"` for the chapter kit. Monospace
(`--mx-mono`) only for code, paths, IDs and branches; never for badges, chips or status.

| Token | Size | Use |
| --- | --- | --- |
| `--orchestra-font-size-2xs` | 10px | branch names, keycap glyphs |
| `--orchestra-font-size-xs` | 11px | eyebrows, pills, meta |
| `--orchestra-font-size-sm` | 12px | secondary text, table cells |
| `--orchestra-font-size-md` | 13px | body and navigation (line height 24px in panels) |
| `--orchestra-font-size-lg` | 14px | emphasized body, card titles |
| `--orchestra-font-size-xl` | 16px | section headings |
| `--orchestra-font-size-2xl` | 20px | dialog titles |
| `--orchestra-font-size-3xl` | 24px | KPI values |
| `--orchestra-font-size-4xl` | 30px | chapter titles (weight 600, line height 38px, tracking −0.035em) |

No half pixels. Hierarchy comes from size, weight and the color steps above, not from more sizes.
Eyebrow: `xs`, weight 600 via `--mx-emphasis`, tracking `0.1em`, uppercase, `--orchestra-muted`.

### 5.3 Motion

| Token | Value | Use |
| --- | --- | --- |
| `--orchestra-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | every one-shot transition |
| `--orchestra-duration-fast` | 120ms | hover, press, color changes |
| `--orchestra-duration-base` | 180ms | reveal, rotate, enter |

Under `prefers-reduced-motion` both durations become 0ms. Infinite loops (spinners, pulses) keep their own timing.
Dialogs and their overlay have no motion on purpose: `orchestra-accessibility.spec.ts` depends on it.

## 6. Layout and spacing

Measured at 1920×1200 in the dev app. Spacing values sit on a 2px grid; most gaps are 2, 6, 10, 14 or 20.

| Element | Value |
| --- | --- |
| Shell | inset 12px from the window, radius 16px |
| Panel gutter | 6px between sidebar and main glass, and inside the shell |
| Sidebar | 230px wide, padding 14px 10px 13px, radius 10px |
| Brand block | padding 2px 10px 16px |
| Nav item | 31px tall, padding 0 10px, gap 11px, radius 6px, 13px text, 1px between items |
| Nav icon | 16×16px |
| Sidebar active item | gradient fill, 1px inset rim, 3×(row−16px) rounded accent pill inset 3px from the start edge (logical, so RTL follows) |
| Sidebar list | scrolls between the fixed brand and profile card; 8px fade at the top edge, 16px at the bottom, never a hard cut. Padding moved from 16px bottom only to 8px top and 16px bottom, and the 2px top margin on the nav list is gone |
| Home scroll area | 16px fade at the bottom edge, so cards under the fold at 1280×800 never end in a hard cut |
| No-repository empty state | a chapter that needs git (Workspaces) shows a `.mx-empty` with a 32px `.mx-mark` branch icon in place of the generic dot, a title, one hint line and an "Open project" button; no action initializes a repository |
| WIP chip and page seal | shown only in dev builds, through `showWip` (`import.meta.env.DEV`); production hides both while the `wip: true` flags stay. The isolated dev app shows them |
| WIP chip (light) | `rgba(28,46,65,.05)` fill, ink `#4f3a14` |
| Light chrome text | toolbar labels, sidebar and tab text `#333c48`, icons ≥3:1 on the brightest glass band |
| Chapter column | `min(1020px, calc(100% - 72px))`, padding 52px top and 72px bottom |
| Chapter header | eyebrow, 4xl title, optional subtitle; primary action top right (`align-items: flex-start`) |
| Card | radius 10px, padding 19px 20px 18px |
| Segmented control | group padding 3px, gap 2px, radius 6px; segments 26px tall, padding 0 11px, 11px text |

## 7. Components

- **Buttons.** Primary: `--mx-primary` fill, white text, one per view. Secondary: no fill until hover, then
  `--orchestra-surface-hover`. Destructive: `--orchestra-danger` text, fill only on confirm.
- **Tabs.** The close button shows only on hover or for the active tab. A single seam between stacked surfaces.
  The active tab is a chrome glass plate (glass tint, border, shadow and filter) inside the strip.
- **Breadcrumb.** The window breadcrumb names built-in views in Title Case, the same words as the sidebar
  (Home, Agents, MCP Dock, Workspaces, Settings).
- **Text areas.** `.mx-field textarea` uses the sans body at md, line height 1.6. Only text areas for code,
  commands, JSON or env values (`spellcheck="false"`) switch to `--mx-mono` at sm, line height 1.65.
- **Panel controls.** Browser and Linux panel toolbars (MCP Dock) use `@orchestra/ui/icon` icons at small size,
  never Unicode arrows or box glyphs. Star toggles and the A-/A+ zoom stay text.
- **Lean summary.** Four equal tiles (`repeat(4, minmax(0, 1fr))`, gap 24px, top aligned), each value 3xl in
  `--mx-strong` with -0.04em tracking; no divider between tiles. Its empty state is `.mx-empty` stripped of its
  well (no border, fill or shadow) because it already sits in a card.
- **Cards.** No footer divider. Empty states never sit in a hero-number slot. `.mx-card` layers `--mx-sheen` over
  `--mx-raised`, with the highlight rim and `--mx-card-shadow` (a 1px contact shadow plus a soft 22px drop). Hover
  or focus inside firms the border to `--mx-rim` and swaps the drop for `--mx-pop-shadow`; cards never move.
- **Status chips.** `.mx-badge.good` and `.bad` carry a 5px dot and a 9% wash of their own color, no border.
  Neutral badges keep the `--mx-line` hairline.
- **Empty, error and loading states.** One shared well, `.mx-empty` (`chapters/kit.css`): padding 30px 24px 32px,
  1px solid `--mx-line` hairline, radius lg, a `--mx-soft` top gradient and the highlight rim, centered text. A 30px
  mark (radius md, dot and ring) sits above a `<strong>` title (md, emphasis, 600), then the hint (sm, dim) and at
  most one `.mx-btn` 14px below. `role="alert"` tints border, fill and mark with `--mx-bad`. Never a dashed box.
  Inside a dashboard card (Home) the empty slot is `.home-first`: left-aligned title, 46ch hint, primary button.
- **Chapter header.** Every chapter opens with `MxPage`: eyebrow `{{profile}} · Area` (always the middle dot,
  never a slash), an h1, one short sentence and at most one primary action on the right. Search follows in
  `.mx-toolbar` as `.mx-search` with a placeholder and the same text as `aria-label` (no visible label), the profile
  badge beside it. On WIP chapters the seal sits above the page and the page gives back its height (top padding
  14px), so the eyebrow lands at the same height (117px in the dev app) with or without it.
  Chapters that build their own page (Settings, Workspaces, Agents, the CI/CD library) use the same kit markup:
  `header.mx-heading` holding a `div` with `.mx-eyebrow`, the h1 and the sentence, then the action. The eyebrow
  appears once per view: a breadcrumb shows only on contextual pages, never above a chapter's own eyebrow.
- **Sidebar overflow.** The chapter list scrolls under a fade mask (8px top, 32px bottom) with matching block
  padding, so no entry is clipped flat against the chrome. Composer chips (28px) name a mode in one word; the full
  sentence lives in the picker.
- **Dialogs.** Float glass over the scrim, radius xl, title 2xl. The head carries `--mx-sheen`, the foot a
  `--mx-soft` wash, and the frame the highlight rim over `--mx-shadow`. The head's close icon is a 28px rounded
  square (radius sm, `--mx-dim`, `--mx-soft` on hover), so its focus ring is not a tight box around the glyph.
- **Row actions.** In a dense list (Flight Engineer meeting detail) a row's text actions fade in on hover or
  focus-within through opacity. They stay in the DOM and keyboard reachable, and stay visible on devices without
  hover. A state chip never repeats the value a segmented control on the same row already shows.
- **Focus.** A visible ring in `--orchestra-accent` on every interactive element (`hit-areas.spec.ts` pins it).
- **Clipping.** Anything cut off gets a fade mask, never a hard edge.

## 8. Content rules

- Every visible string goes through i18n (about 40 locales).
- No raw ISO timestamps in titles; counters must match their lists; no infinite skeletons.
- Some text looks like a bug but is pinned by tests; leave it alone:
  - "Status unknown · unknown" (`session-tasks-truth.spec.ts`).
  - A Tasks badge of 0 beside finished tasks (`session-cockpit.spec.ts`).
  - Home's "No repository" and "Not connected" (`chapter-kpis.spec.ts`).

## 9. Verification

- Look at the real app in dark and light; zoom to 2× to judge rims, grain and hairlines.
- Rerun the palette generator after any color, glass or overlay change; the palette test compares its output.
- e2e specs that freeze visuals:
  - `e2e/orchestra/identity.spec.ts` (glass fingerprint, 10px radius).
  - `hit-areas.spec.ts` (focus outline).
  - `regression/new-session-panel-corner.spec.ts`.

  When a value changes on purpose, read the new computed value from the live app and paste it in.

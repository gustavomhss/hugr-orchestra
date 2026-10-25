# Orchestra interface specification

The rules, scales and values behind Orchestra's interface. The stylesheets are the source of truth; this document
explains them and records the numbers so a change can be judged before it is made. When the two disagree, the CSS
wins and this file is stale: fix it in the same change.

- Tokens and materials: `theme.css`. Session surface: `session.css`. Chapter kit: `chapters/kit.css`.
- Palettes: `palette/definitions.ts` (anchors) and `palette/generated/*` (output, never edited by hand).
- Dark values are listed first; light values follow where they differ.

## 1. Principles

1. **Glass that looks like real glass.** Wide blur, lifted saturation, a light-catching rim and grain. A narrow blur
   that darkens and desaturates reads as tinted plastic.
2. **The wallpaper stays visible.** Legibility comes from the glass tint, not from a veil over the workspace.
3. **One saturated element per view:** the primary action. Everything else is quiet.
4. **Tokens only.** A literal color, radius, size or duration appears only inside a token definition.
5. **Contrast is measured, not eyeballed.** Text holds 4.5:1 and icons 3:1 on the glass over the photograph.

## 2. Materials

Exactly three. Never stack glass on glass: inside a glass panel, depth comes from fill steps and hairlines.

### 2.1 Chrome glass

Sidebar, tab strip, toolbar, Home and chapter panels (`.orchestra-glass`, blur on `[data-glass-plate]`).

| Token | Dark | Light |
| --- | --- | --- |
| `--orchestra-glass-filter` | `blur(28px) brightness(0.84) saturate(1.5)` | `blur(28px) brightness(1.06) saturate(1.5)` |
| `--orchestra-glass-background` (tint) | `rgba(32,44,58,.44)` → `rgba(17,24,33,.52)` 46% → `rgba(11,16,23,.58)` | `rgba(255,255,255,.57)` → `rgba(248,250,252,.49)` 46% → `rgba(240,244,247,.59)` |
| `--orchestra-glass-rim` (1px masked ring) | `rgba(226,238,250,.26)` top, `.08` at 28%, `.03` at 70%, `.06` bottom | white `.95` top, `.45` at 30%, `.2` at 70%, `.35` bottom |
| `--orchestra-glass-sheen` | radial 120%×60% at top left, `rgba(214,231,247,.07)` | same shape, white `.35` |
| `--orchestra-glass-border` | `rgba(160,179,197,.1)` | `rgba(70,84,98,.12)` |
| `--orchestra-glass-shadow` | inset top highlight `.1`, inset bottom `rgba(0,0,0,.28)`, `0 1px 2px .36`, `0 10px 30px .24` | inset top white `.9`, inset bottom `.12`, `0 1px 2px .12`, `0 10px 30px .1` |
| `--orchestra-grain` | SVG fractal noise, 160px tile, alpha `.05` | same |

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

### 2.3 Content base

Session panels, near-opaque for long reading (`--orchestra-session-*` in `session.css`). They keep the rim and grain;
their blur comes from the fixed blurred wallpaper copy in `.orchestra-glass-layer`, not from their own filter.

- Dark background: `rgba(22,31,41,.8)` → `rgba(15,21,29,.85)` 50% → `rgba(12,17,24,.9)`.
- Text steps: heading `#e9eef3`, body `#c2ccd6`, secondary `#93a2b2`, meta `#7e90a2`.
- Rules: `rgba(160,181,200,.1)`; between messages `.09`.

### 2.4 Workspace overlay

`--orchestra-workspace-overlay` is a light veil over the photograph, not a legibility layer.

- Dark: `rgba(9,14,20,.39)` → `.22` at 42% → `.43`, plus a radial `rgba(26,37,50,.32)` glow at the top left.
- Light: `rgba(226,231,236,.35)` → `.18` at 42% → `rgba(222,228,234,.4)`, plus a radial white `.4` glow.

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
| Sidebar active item | gradient fill, 2px accent inset bar (mirrored in RTL) |
| Chapter column | `min(1020px, calc(100% - 72px))`, padding 52px top and 72px bottom |
| Chapter header | eyebrow, 4xl title, optional subtitle; primary action top right (`align-items: flex-start`) |
| Card | radius 10px, padding 19px 20px 18px |
| Segmented control | group padding 3px, gap 2px, radius 6px; segments 26px tall, padding 0 11px, 11px text |

## 7. Components

- **Buttons.** Primary: `--mx-primary` fill, white text, one per view. Secondary: no fill until hover, then
  `--orchestra-surface-hover`. Destructive: `--orchestra-danger` text, fill only on confirm.
- **Tabs.** The close button shows only on hover or for the active tab. A single seam between stacked surfaces.
- **Cards.** No footer divider. Empty states never sit in a hero-number slot.
- **Empty, error and loading states.** One shared well, `.mx-empty` (`chapters/kit.css`): padding 30px 24px 32px,
  1px solid `--mx-line` hairline, radius lg, a `--mx-soft` top gradient and the highlight rim, centered text. A 30px
  mark (radius md, dot and ring) sits above a `<strong>` title (md, emphasis, 600), then the hint (sm, dim) and at
  most one `.mx-btn` 14px below. `role="alert"` tints border, fill and mark with `--mx-bad`. Never a dashed box.
  Inside a dashboard card (Home) the empty slot is `.home-first`: left-aligned title, 46ch hint, primary button.
- **Dialogs.** Float glass over the scrim, radius xl, title 2xl.
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

---
name: orchestra-design-system
description: >
  Orchestra's visual language and the rules that keep it refined: the three glass materials (chrome, float,
  content), radius, type and motion scales, spacing and layout metrics, color tokens and contrast, palettes, and
  the craft checklist the owner judges by ("glass that looks like real glass", "impecável"). Use before designing
  or changing any Orchestra screen, component, CSS or token in packages/app-shell, when auditing UI polish, or when
  someone says the UI looks cheap, flat, unfinished or "just transparency".
---

# Orchestra design system

The specification is `packages/app-shell/src/orchestra/DESIGN.md`: read it first. It holds every value (blur, tint,
rim, sheen, grain, shadows, fills, color roles per scheme, radius/type/motion scales, spacing and layout metrics,
component rules and the visual e2e specs). The stylesheets (`theme.css`, `session.css`, `chapters/kit.css`) are the
source of truth; when you change a value, update DESIGN.md in the same change. Pair with `orchestra-visual-qa` to
see and verify the result.

## Rules that are easy to break

- **Three materials, never glass on glass.** Chrome glass (panels), float glass (popovers, menus, dialogs, the
  strongest), content base (session, near-opaque). Inside a panel, depth comes from fill steps and hairlines.
- **Glass reads as glass** when it blurs wide, lifts saturation, catches light at the rim and carries grain. Narrow
  blur plus darkening plus desaturation reads as plastic.
- **Keep the performance architecture**: blur lives on `[data-glass-plate]` siblings and the single blurred copy in
  `.orchestra-glass-layer`. Change values, not mechanics.
- **Tokens only.** A literal color, radius, font size or duration belongs only inside a token definition. Tints use
  `color-mix(in srgb, var(--role) N%, transparent)`.
- **Concentric radii**: outer = inner + gap (panel 10 + gutter 6 = shell 16).
- **Contrast**: text 4.5:1, icons 3:1 on the glass over the photograph. Fix by lightness, keep hue.
- **One saturated element per view**: the primary action (`--mx-primary`).
- **Palettes are generated**: never edit `palette/generated/*`; rerun `bun script/orchestra-palettes.ts` from
  `packages/app-shell` after any stylesheet change that carries a color. AMOLED stays true black with the HuGR blue
  accent; no purple.
- **Monospace** only for code, paths, IDs and branches.
- **Copy** goes through i18n (about 40 locales).

## Truth signals that look like bugs (do not "fix")

- Tasks "Status unknown · unknown": `session-tasks-truth.spec.ts`.
- Tasks rail badge 0 beside finished tasks: `session-cockpit.spec.ts`.
- Home "No repository" / "Not connected": `chapter-kpis.spec.ts`.
- The sidebar tagline is brand copy covered by the bidi and accessibility specs.

## Craft checklist

- Content honesty: no raw ISO timestamps in titles, counters match their lists, empty states never in a
  hero-number slot, no infinite skeletons.
- One header pattern per chapter: eyebrow, 4xl title, optional subtitle, primary action top right.
- Chrome stays quiet: nothing clipped without a fade mask, WIP marks never compete with navigation.
- Controls: tab close button on hover or active only, single seams, card footers without dividers, secondary
  buttons without fill until hover.
- Judge in the real app, dark and light, zoomed to 2× for rims, grain and hairlines.
- Story-only components are removed with their stories: a `packages/ui` component whose only importer is its own
  `*.stories.tsx` is deleted together with the stories, its CSS import and its package export.

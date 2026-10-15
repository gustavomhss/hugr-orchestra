import { COLOR_LITERAL, extreme, formatColor, fromLch, parseColor, toLch, type Lch, type Rgba } from "./color"

// The colors one scheme is built from: Orchestra's own token values for its base scheme, or a palette's roles.
export type Anchors = Record<(typeof NEUTRAL)[number] | (typeof CHROMATIC)[number], Rgba>

const NEUTRAL = ["background", "surface", "muted", "text"] as const
const CHROMATIC = ["accent", "success", "warning", "danger"] as const
export type Family = "neutral" | (typeof CHROMATIC)[number]

/**
 * Maps every color of Orchestra's base scheme onto a palette. Neutrals move along the background-to-text axis
 * through the palette's background, surface, muted and text; chromatic colors keep their offset from the base
 * anchor of their family (accent, success, warning or danger). Alpha never changes, and pure black and white
 * (shadows and highlights) stay as they are.
 */
export function createRemap(base: Anchors, palette: Anchors) {
  const from = lchOf(base)
  const to = lchOf(palette)
  const slope = (to.text.l - to.background.l) / (from.text.l - from.background.l)
  const stops = NEUTRAL.map((role) => ({ l: from[role].l, lab: lab(to[role]) })).toSorted((a, b) => a.l - b.l)
  return (color: Rgba): Rgba => {
    if (extreme(color)) return color
    const lch = toLch(color)
    const family = classify(lch, from)
    if (family === "neutral") return neutral(lch.l, stops, slope, color.a)
    // The anchor itself lands exactly on the palette's role; out-of-gamut chroma is clipped, never the hue.
    return fromLch(
      {
        l: to[family].l + (lch.l - from[family].l) * slope,
        c: from[family].c === 0 ? to[family].c : to[family].c * (lch.c / from[family].c),
        h: to[family].h + hueDelta(lch.h, from[family].h),
      },
      color.a,
    )
  }
}

/** Rewrites every color literal in a CSS value. */
export function remapValue(value: string, remap: (color: Rgba) => Rgba) {
  return value.replace(COLOR_LITERAL, (literal) => {
    const color = parseColor(literal)
    return color ? formatColor(remap(color)) : literal
  })
}

export function classify(lch: Lch, base: Record<keyof Anchors, Lch>): Family {
  // Orchestra's neutrals are a low-chroma blue-gray; its accent shares that hue at higher chroma.
  if (lch.c < 0.012) return "neutral"
  if (Math.abs(hueDelta(lch.h, base.muted.h)) <= 45 && lch.c < 0.05) return "neutral"
  return CHROMATIC.reduce((best, family) =>
    Math.abs(hueDelta(lch.h, base[family].h)) < Math.abs(hueDelta(lch.h, base[best].h)) ? family : best,
  )
}

export function hueDelta(a: number, b: number) {
  return ((((a - b) % 360) + 540) % 360) - 180
}

function lchOf(anchors: Anchors) {
  return Object.fromEntries(Object.entries(anchors).map(([role, color]) => [role, toLch(color)])) as Record<
    keyof Anchors,
    Lch
  >
}

type Lab = { l: number; a: number; b: number }

function lab(lch: Lch): Lab {
  const radians = (lch.h * Math.PI) / 180
  return { l: lch.l, a: lch.c * Math.cos(radians), b: lch.c * Math.sin(radians) }
}

function neutral(l: number, stops: { l: number; lab: Lab }[], slope: number, alpha: number) {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (l <= first.l) return fromLab({ ...first.lab, l: first.lab.l + (l - first.l) * slope }, alpha)
  if (l >= last.l) return fromLab({ ...last.lab, l: last.lab.l + (l - last.l) * slope }, alpha)
  const index = stops.findIndex((stop) => stop.l >= l)
  const low = stops[index - 1]
  const high = stops[index]
  const t = (l - low.l) / (high.l - low.l || 1)
  return fromLab(
    {
      l: low.lab.l + (high.lab.l - low.lab.l) * t,
      a: low.lab.a + (high.lab.a - low.lab.a) * t,
      b: low.lab.b + (high.lab.b - low.lab.b) * t,
    },
    alpha,
  )
}

function fromLab(value: Lab, alpha: number) {
  return fromLch(
    {
      l: Math.min(1, Math.max(0, value.l)),
      c: Math.hypot(value.a, value.b),
      h: ((Math.atan2(value.b, value.a) * 180) / Math.PI + 360) % 360,
    },
    alpha,
  )
}

import { oklchToRgb, rgbToOklch } from "@orchestra/ui/theme/color"

// Color math for Orchestra palettes: parsing the literals Orchestra's CSS writes, OKLCH conversion, and the
// WCAG contrast of text over composited glass. Channels are 0..1 in gamma-encoded sRGB, as browsers blend them.
export type Rgba = { r: number; g: number; b: number; a: number }
export type Lch = { l: number; c: number; h: number }

export const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\([^()]*\)/g

export function parseColor(text: string): Rgba | undefined {
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(text.trim())
  if (hex) {
    const digits = hex[1].length <= 4 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1]
    if (digits.length !== 6 && digits.length !== 8) return
    const channel = (index: number) => parseInt(digits.slice(index, index + 2), 16) / 255
    return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? channel(6) : 1 }
  }
  const fn = /^rgba?\(([^()]*)\)$/.exec(text.trim())
  if (!fn) return
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return
  const value = (part: string, scale: number) =>
    part.endsWith("%") ? parseFloat(part) / 100 : parseFloat(part) / scale
  return {
    r: value(parts[0], 255),
    g: value(parts[1], 255),
    b: value(parts[2], 255),
    a: parts[3] === undefined ? 1 : value(parts[3], 1),
  }
}

export function formatColor(color: Rgba) {
  const byte = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255)
  if (color.a >= 1) return `#${[color.r, color.g, color.b].map((v) => byte(v).toString(16).padStart(2, "0")).join("")}`
  return `rgba(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}, ${Number(color.a.toFixed(3))})`
}

export function toLch(color: Rgba): Lch {
  return rgbToOklch(color.r, color.g, color.b)
}

/**
 * Converts OKLCH back to sRGB. Out-of-gamut colors lose chroma (by bisection, so as little as possible) and never
 * hue; rounding error at the gamut edge is clamped, so a color read from sRGB comes back unchanged.
 */
export function fromLch(lch: Lch, alpha = 1): Rgba {
  const l = Math.min(1, Math.max(0, lch.l))
  const rgb = (c: number) => oklchToRgb({ l, c, h: lch.h })
  const inside = (c: number) => {
    const value = rgb(c)
    return [value.r, value.g, value.b].every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)
  }
  const chroma = inside(lch.c)
    ? lch.c
    : Array.from({ length: 24 }).reduce<{ low: number; high: number }>(
        (range) => {
          const middle = (range.low + range.high) / 2
          return inside(middle) ? { low: middle, high: range.high } : { low: range.low, high: middle }
        },
        { low: 0, high: lch.c },
      ).low
  const value = rgb(chroma)
  const clamp = (channel: number) => Math.min(1, Math.max(0, channel))
  return { r: clamp(value.r), g: clamp(value.g), b: clamp(value.b), a: alpha }
}

export function luminance(color: Rgba) {
  const linear = (value: number) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b)
}

export function contrast(a: Rgba, b: Rgba) {
  const high = Math.max(luminance(a), luminance(b))
  const low = Math.min(luminance(a), luminance(b))
  return (high + 0.05) / (low + 0.05)
}

/** Paints `top` over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (a: number, b: number) => a * top.a + b * (1 - top.a)
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 }
}

/** CSS `brightness()` then `saturate()`, as Chromium applies the shorthand filters in sRGB. */
export function filtered(color: Rgba, brightness: number, saturate: number): Rgba {
  const r = color.r * brightness
  const g = color.g * brightness
  const b = color.b * brightness
  const s = saturate
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return {
    r: clamp((0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b),
    g: clamp((0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b),
    b: clamp((0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b),
    a: 1,
  }
}

/** Pure black or white at any alpha: Orchestra's shadows and highlights, which no palette recolors. */
export function extreme(color: Rgba) {
  const channels = [color.r, color.g, color.b]
  return channels.every((value) => value <= 0.001) || channels.every((value) => value >= 0.999)
}

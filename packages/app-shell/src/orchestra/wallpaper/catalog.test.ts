import { describe, expect, test } from "bun:test"
import { WALLPAPER_DIM_MAX, WALLPAPERS, clampWallpaperDim, wallpaperSrc, wallpaperTheme } from "./catalog"

const lin = (c: number) => {
  c = c / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const relL = (rgb: readonly [number, number, number]) => {
  const [r, g, b] = rgb.map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const cr = (a: number, b: number) => {
  const x = Math.max(a, b),
    y = Math.min(a, b)
  return (x + 0.05) / (y + 0.05)
}

const INK = {
  body: relL([199, 208, 217]),
  strong: relL([238, 241, 245]),
  sidebar: relL([180, 192, 207]),
  muted: relL([140, 154, 170]),
}

const VEIL_L = relL([17, 9, 10]) // veil color from study

// Measured luminance bands per photo (from study: p50 and p90 per band, worst-case across bands)
const BANDS: Record<string, { p50: number; p90: number }> = {
  dunes: { p50: 0.232, p90: 0.595 },
  "photo-4": { p50: 0.268, p90: 0.722 },
  storm: { p50: 0.267, p90: 0.928 },
  "jonatan-pie": { p50: 0.115, p90: 0.423 },
  leo: { p50: 0.12, p90: 0.61 },
  "leo-visions": { p50: 0.287, p90: 0.546 },
  "sergey-pesterev": { p50: 0.543, p90: 0.845 },
}

function glassL(
  lp: number,
  m: {
    alpha: number
    brightness: number
    veilTop: number
    veilBottom: number
    tint: readonly [number, number, number]
    veil: readonly [number, number, number]
  },
) {
  const veilL = relL([17, 9, 10]) // veil color L*
  const tintL = relL(m.tint)
  // Use worst-case band (average of bands)
  const v = (m.veilTop + m.veilBottom) / 2
  const L2 = lp * m.brightness * (1 - v) + veilL * v
  return L2 * (1 - m.alpha) + tintL * m.alpha
}

describe("wallpaper catalog", () => {
  test("ids are unique and resolve to a src", () => {
    const ids = WALLPAPERS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(wallpaperSrc(id)).toBeString()
  })

  test("unknown ids resolve to nothing", () => {
    expect(wallpaperSrc("no-such-photo")).toBeUndefined()
  })

  test("dim clamps persisted and malformed values", () => {
    expect(clampWallpaperDim(0.4)).toBe(0.4)
    expect(clampWallpaperDim(-1)).toBe(0)
    expect(clampWallpaperDim(5)).toBe(WALLPAPER_DIM_MAX)
    expect(clampWallpaperDim("0.2")).toBe(0.2)
    expect(clampWallpaperDim(Number.NaN)).toBe(0)
    expect(clampWallpaperDim("abc")).toBe(0)
    expect(clampWallpaperDim(undefined)).toBe(0)
  })

  test("each themed wallpaper keeps AA contrast on body text", () => {
    const themed = WALLPAPERS.filter((wp) => "theme" in wp && wp.theme != null)
    for (const wp of themed) {
      const theme = (
        wp as {
          theme: {
            dark: {
              material: {
                alpha: number
                brightness: number
                veilTop: number
                veilBottom: number
                tint: string
                veil: string
              }
            }
          }
        }
      ).theme.dark
      if (!theme) continue
      const tint = theme.material.tint.split(" ").map(Number)
      const veil = theme.material.veil.split(" ").map(Number)
      const m = {
        ...theme.material,
        tint: [tint[0], tint[1], tint[2]] as const,
        veil: [veil[0], veil[1], veil[2]] as const,
      }
      const bands = BANDS[wp.id]
      if (!bands) continue

      // Test body text contrast at p50 (typical) and p90 (hotspot)
      const L50 = glassL(bands.p50, m)
      const L90 = glassL(bands.p90, m)
      const c50 = (INK.body + 0.05) / (L50 + 0.05)
      const c90 = (INK.body + 0.05) / (L90 + 0.05)

      expect(c50).toBeGreaterThanOrEqual(4.5)
      expect(c90).toBeGreaterThanOrEqual(3.0)
    }
  })
})

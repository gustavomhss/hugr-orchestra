import { COLOR_LITERAL, contrast, filtered, over, parseColor, type Rgba } from "./color"
import type { CssNode } from "./css"
import { split } from "./css"

// The backdrop photograph (/orchestra/mtn-src.jpg) covering a 1416x836 workspace with the glass's 28px blur (the
// narrowest blur any glass draws), as the darkest and brightest pixel by luminance of each tenth of its height,
// top to bottom, leaving out the blur's edge falloff. The overlay and every glass panel
// are vertical gradients over the same height, so each band meets the gradient values at its own height.
const BANDS = [
  [
    [12, 32, 69],
    [32, 66, 109],
  ],
  [
    [13, 34, 73],
    [71, 96, 141],
  ],
  [
    [16, 43, 87],
    [138, 131, 173],
  ],
  [
    [20, 60, 104],
    [202, 170, 210],
  ],
  [
    [29, 86, 131],
    [216, 191, 212],
  ],
  [
    [43, 60, 78],
    [230, 210, 216],
  ],
  [
    [20, 36, 48],
    [230, 210, 215],
  ],
  [
    [5, 21, 31],
    [128, 136, 146],
  ],
  [
    [5, 20, 28],
    [49, 69, 85],
  ],
  [
    [6, 20, 29],
    [8, 28, 38],
  ],
].map((band) => band.map(([r, g, b]) => ({ r: r / 255, g: g / 255, b: b / 255, a: 1 })))

const SCOPES = [
  "html",
  "body[data-new-layout]",
  'body[data-new-layout] [data-session-layout="surface"]',
  "body[data-new-layout] .orchestra-glass-layer",
]

/** The custom properties Orchestra sets on the shell for one scheme, light overrides applied over the base. */
export function tokenTable(sources: CssNode[][], scheme: "dark" | "light") {
  const table = new Map<string, string>()
  const visit = (nodes: CssNode[], light: boolean) =>
    nodes.forEach((node) => {
      if (node.kind === "at") return visit(node.children, light)
      const qualified = node.selector.includes('[data-color-scheme="light"]')
      const scope = node.selector
        .replace(/\[data-color-scheme(="light")?\]/g, "")
        .replace(/^html\s+(?=body)/, "")
        .trim()
      if (qualified !== light || !SCOPES.includes(scope)) return
      node.declarations
        .filter((item) => item.property.startsWith("--"))
        .forEach((item) => table.set(item.property, item.value))
    })
  sources.forEach((nodes) => visit(nodes, false))
  if (scheme === "light") sources.forEach((nodes) => visit(nodes, true))
  return table
}

export function colors(value: string) {
  return [...value.matchAll(COLOR_LITERAL)].flatMap((match) => parseColor(match[0]) ?? [])
}

/** The color of a vertical CSS gradient (or a plain color) at `y` from 0 (top) to 1 (bottom). */
export function gradientAt(value: string, y: number): Rgba {
  const body = /^\s*linear-gradient\(([\s\S]*)\)\s*$/.exec(value)?.[1]
  if (!body) return colors(value)[0]
  const stops = split(body).flatMap((part) => {
    const color = colors(part)[0]
    if (!color) return []
    const position = /(-?[\d.]+)%\s*$/.exec(part)?.[1]
    return [{ color, at: position === undefined ? undefined : Number(position) / 100 }]
  })
  const placed = stops.map((stop, index) => ({
    color: stop.color,
    at: stop.at ?? (index === 0 ? 0 : index === stops.length - 1 ? 1 : index / (stops.length - 1)),
  }))
  const next = placed.findIndex((stop) => stop.at >= y)
  if (next <= 0) return placed[next === -1 ? placed.length - 1 : 0].color
  const low = placed[next - 1]
  const high = placed[next]
  const t = (y - low.at) / (high.at - low.at || 1)
  const mix = (a: number, b: number) => a + (b - a) * t
  return {
    r: mix(low.color.r, high.color.r),
    g: mix(low.color.g, high.color.g),
    b: mix(low.color.b, high.color.b),
    a: mix(low.color.a, high.color.a),
  }
}

function filterOf(value: string) {
  const read = (name: string) => Number(new RegExp(`${name}\\(([\\d.]+)\\)`).exec(value)?.[1] ?? 1)
  return { brightness: read("brightness"), saturate: read("saturate") }
}

/** Every color a glass layer shows over the photograph: per band, both band edges, with and without the tint. */
export function glass(table: Map<string, string>, background: string, filter: string) {
  const overlay = table.get("--orchestra-workspace-overlay") ?? ""
  const [linear, radial] = split(overlay)
  const tint = colors(radial ?? "")[0]
  const params = filterOf(table.get(filter) ?? "")
  const tintStop = table.get(background) ?? ""
  return BANDS.flatMap((photos, band) =>
    [band / BANDS.length, (band + 1) / BANDS.length].flatMap((y) =>
      photos.flatMap((photo) =>
        [photo, ...(tint ? [over(tint, photo)] : [])].map((base) =>
          over(
            gradientAt(tintStop, y),
            filtered(over(gradientAt(linear, y), base), params.brightness, params.saturate),
          ),
        ),
      ),
    ),
  )
}

export function surfaces(table: Map<string, string>) {
  const panel = glass(table, "--orchestra-glass-background", "--orchestra-glass-filter")
  const session = glass(table, "--orchestra-session-background", "--orchestra-session-filter")
  const card = colors(table.get("--mx-raised") ?? "")[0]
  const raised = card ? panel.map((base) => over(card, base)) : []
  return { panel, session, raised }
}

export function worst(color: Rgba, surfaces: Rgba[]) {
  return Math.min(...surfaces.map((surface) => contrast(color, surface)))
}

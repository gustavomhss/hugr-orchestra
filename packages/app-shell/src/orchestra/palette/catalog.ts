// The palettes the Settings picker offers. System, Dark and Light are Orchestra's own skin; every other palette
// recolors it and ships as a generated stylesheet (./generated). Colors only: glass, layout and type stay.
export const PALETTE_KEY = "orchestra-palette"

export const PALETTES = [
  { id: "system", scheme: "system" },
  { id: "dark", scheme: "dark" },
  { id: "light", scheme: "light" },
  { id: "graphite", scheme: "dark" },
  { id: "gruvbox", scheme: "dark" },
  { id: "github", scheme: "light" },
  { id: "nord", scheme: "dark" },
  { id: "amoled", scheme: "dark" },
] as const

export type Palette = (typeof PALETTES)[number]
export type PaletteID = Palette["id"]
export type RecolorPalette = Exclude<Palette, { id: "system" | "dark" | "light" }>

export function findPalette(id: unknown) {
  return PALETTES.find((palette) => palette.id === id)
}

export function recolors(palette: Palette): palette is RecolorPalette {
  return palette.id !== "system" && palette.id !== "dark" && palette.id !== "light"
}

import { amoledTheme, githubTheme, gruvboxTheme, nordTheme } from "@opencode-ai/ui/theme/default-themes"
import { PALETTES, type RecolorPalette } from "./catalog"
import { convertTheme, type PaletteRoles } from "./convert"

export type PaletteDefinition = { id: RecolorPalette["id"]; scheme: RecolorPalette["scheme"]; roles: PaletteRoles }

// Graphite: Orchestra's dark glass in neutral graphite. Neutrals lose the blue tint, the accent becomes a cool
// steel, and the states keep Orchestra's hues at lower chroma.
const GRAPHITE: PaletteRoles = {
  background: "#0c0d0e",
  surface: "#161719",
  text: "#ededed",
  muted: "#a1a3a6",
  accent: "#a9b7c6",
  success: "#a3bcad",
  warning: "#c8b893",
  danger: "#d2a19e",
}

export const PALETTE_DEFINITIONS: PaletteDefinition[] = [
  define("graphite", () => GRAPHITE),
  define("gruvbox", (scheme) => convertTheme(gruvboxTheme, scheme)),
  // GitHub ships its light variant, so the pilot also shows the converter on Orchestra's light glass.
  define("github", (scheme) => convertTheme(githubTheme, scheme)),
  define("nord", (scheme) => convertTheme(nordTheme, scheme)),
  // AMOLED keeps true black: no photograph behind the glass, and glass just above black so panels still read.
  define("amoled", (scheme) => ({ ...convertTheme(amoledTheme, scheme), surface: "#111111", backdrop: 0 })),
]

function define(
  id: RecolorPalette["id"],
  roles: (scheme: RecolorPalette["scheme"]) => PaletteRoles,
): PaletteDefinition {
  const palette = PALETTES.find((item): item is RecolorPalette => item.id === id)
  if (!palette) throw new Error(`Palette ${id} is not in the catalog`)
  return { id, scheme: palette.scheme, roles: roles(palette.scheme) }
}

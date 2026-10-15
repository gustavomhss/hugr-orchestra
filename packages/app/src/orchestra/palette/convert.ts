import { resolveThemeVariant } from "@orchestra/ui/theme/resolve"
import type { DesktopTheme } from "@orchestra/ui/theme/types"
import { parseColor, type Rgba } from "./color"

// One palette's colors. Everything else (glass, borders, radii, fonts, spacing) stays Orchestra's.
export type PaletteRoles = {
  background: string
  /** The glass tint. Omitted: the base scheme's glass position between background and text. */
  surface?: string
  text: string
  /** Secondary text. Omitted: the base scheme's muted position between background and text. */
  muted?: string
  accent: string
  success: string
  warning: string
  danger: string
  /** Share of the backdrop photograph that shows through the workspace overlay; 1 keeps Orchestra's. */
  backdrop?: number
  /** Code syntax colors (`--syntax-*`). Omitted: Orchestra's own. */
  syntax?: Record<string, string>
}

const SYNTAX = [
  "comment",
  "keyword",
  "string",
  "primitive",
  "property",
  "type",
  "constant",
  "variable",
  "operator",
  "punctuation",
  "object",
  "regexp",
  "info",
  "success",
  "warning",
  "critical",
]

/** Converts one variant of an inherited theme into Orchestra palette roles. */
export function convertTheme(theme: DesktopTheme, scheme: "dark" | "light"): PaletteRoles {
  const variant = theme[scheme]
  const colors = variant.palette ?? variant.seeds
  const resolved = resolveThemeVariant(variant, scheme === "dark")
  const text = variant.palette?.ink ?? hex(resolved["text-strong"]) ?? (scheme === "dark" ? "#ffffff" : "#000000")
  // Secondary text keeps Orchestra's position between background and text unless the theme sets its own.
  const muted = hex(variant.overrides?.["text-weak"])
  // The inherited resolver writes some syntax colors as references to its own text tokens.
  const reference: Record<string, string> = {
    "var(--text-weak)": hex(resolved["text-weak"]) ?? text,
    "var(--text-base)": hex(resolved["text-base"]) ?? text,
    "var(--text-strong)": text,
  }
  return {
    background: colors.neutral,
    text,
    ...(muted ? { muted } : {}),
    accent: variant.palette?.interactive ?? colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.error,
    syntax: Object.fromEntries(
      SYNTAX.map((name) => {
        const value = resolved[`syntax-${name}`] ?? ""
        return [name, reference[value] ?? hex(value) ?? text]
      }),
    ),
  }
}

function hex(value: string | undefined) {
  if (!value || !parseColor(value)) return undefined
  return value
}

export function rgba(value: string): Rgba {
  const color = parseColor(value)
  if (!color) throw new Error(`Not a color: ${value}`)
  return color
}

import { withAlpha } from "@opencode-ai/ui/theme/color"
import { resolveThemeVariant } from "@opencode-ai/ui/theme/resolve"
import { resolveThemeVariantV2 } from "@opencode-ai/ui/theme/v2/resolve"
import type { DesktopTheme, HexColor, ResolvedV2Theme } from "@opencode-ai/ui/theme/types"
import { createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"

type TerminalColors = {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
}

const DEFAULT_TERMINAL_COLORS: Record<"light" | "dark", TerminalColors & { foreground: HexColor }> = {
  light: {
    background: "#fcfcfc",
    foreground: "#211e1e",
    cursor: "#211e1e",
    selectionBackground: withAlpha("#211e1e", 0.2),
  },
  dark: {
    background: "#191515",
    foreground: "#d4d4d4",
    cursor: "#d4d4d4",
    selectionBackground: withAlpha("#d4d4d4", 0.25),
  },
}

// Read the applied skin, including preview/system-mode changes, after its DOM attributes change.
export function createTerminalTheme(input: {
  theme: () => DesktopTheme | undefined
  mode: () => "light" | "dark"
  newLayout: () => boolean
}) {
  const [store, setStore] = createStore({ revision: 0 })
  onMount(() => {
    const observer = new MutationObserver(() => setStore("revision", (value) => value + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-scheme", "data-theme"],
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-new-layout"] })
    onCleanup(() => observer.disconnect())
  })

  return createMemo(() => {
    store.revision
    const fallback = legacyTerminalColors({ theme: input.theme(), mode: input.mode(), newLayout: input.newLayout() })
    const scheme = document.documentElement.dataset.colorScheme
    if (!input.newLayout() || !document.body.hasAttribute("data-new-layout") || !scheme) {
      return { colors: fallback, mode: input.mode() }
    }
    const mode = scheme === "dark" ? "dark" : "light"
    const tokens = getComputedStyle(document.body)
    const background = tokens.getPropertyValue("--orchestra-shell-background").trim()
    const foreground = tokens.getPropertyValue("--orchestra-text").trim()
    const accent = tokens.getPropertyValue("--orchestra-accent").trim()
    if (!background || !foreground || !isHexColor(accent)) return { colors: fallback, mode: input.mode() }
    return {
      mode,
      colors: {
        background,
        foreground,
        cursor: accent,
        selectionBackground: withAlpha(accent, mode === "dark" ? 0.25 : 0.2),
      },
    }
  })
}

function legacyTerminalColors(input: {
  theme?: DesktopTheme
  mode: "light" | "dark"
  newLayout: boolean
}): TerminalColors {
  const mode = input.mode
  const fallback = DEFAULT_TERMINAL_COLORS[mode]
  const currentTheme = input.theme
  if (!currentTheme) return fallback
  const variant = mode === "dark" ? currentTheme.dark : currentTheme.light
  if (!variant?.seeds && !variant?.palette) return fallback
  const resolved = resolveThemeVariant(variant, mode === "dark")
  const text = resolved["text-stronger"] ?? fallback.foreground
  const background = input.newLayout
    ? (resolveV2Token(resolveThemeVariantV2(variant, mode === "dark"), "v2-background-bg-base") ?? fallback.background)
    : (resolved["background-stronger"] ?? fallback.background)
  const alpha = mode === "dark" ? 0.25 : 0.2
  const base = isHexColor(text) ? text : fallback.foreground
  const selectionBackground = withAlpha(base, alpha)
  return {
    background,
    foreground: text,
    cursor: text,
    selectionBackground,
  }
}

const resolveV2Token = (tokens: ResolvedV2Theme, key: string, depth = 0): string | undefined => {
  const current = tokens[key]?.trim()
  if (!current || depth === 8) return undefined
  const match = /^var\(--([^)]+)\)$/.exec(current)
  if (match) return resolveV2Token(tokens, match[1], depth + 1)
  if (/^#[0-9a-fA-F]{8}$/.test(current)) return current.slice(0, 7)
  return current
}

const isHexColor = (color: string): color is HexColor => color.startsWith("#")

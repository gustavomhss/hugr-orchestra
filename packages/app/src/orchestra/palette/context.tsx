import { createEffect, on, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createSimpleContext } from "@opencode-ai/ui/context/helper"
import { syncThemeBackground, useTheme } from "@opencode-ai/ui/theme/context"
import { findPalette, PALETTE_KEY, PALETTES, recolors, type Palette, type PaletteID } from "./catalog"

const STYLE_ID = "orchestra-palette"
const sheets = import.meta.glob<string>("./generated/palette-*.css", { query: "?inline", import: "default" })

/**
 * The selected Orchestra palette. The preload already painted its background and color scheme; this provider
 * loads the palette's stylesheet before the app renders, so the first frame of the app is already recolored.
 */
export const { use: useOrchestraPalette, provider: OrchestraPaletteProvider } = createSimpleContext({
  name: "OrchestraPalette",
  gate: true,
  init: () => {
    const theme = useTheme()
    const first = initial()
    // Orchestra's own Dark and Light need no stylesheet, so they render at once, exactly as before palettes.
    const [store, setStore] = createStore({ id: first.id, ready: !recolors(first) })

    const apply = (palette: Palette) => {
      const load = recolors(palette) ? sheets[`./generated/palette-${palette.id}.css`]?.() : undefined
      return Promise.resolve(load).then((css) => {
        // A missing stylesheet means the palette was removed: Orchestra Dark takes over.
        const next = recolors(palette) && !css ? findPalette("dark")! : palette
        style(css)
        if (recolors(next)) document.documentElement.dataset.orchestraPalette = next.id
        if (!recolors(next)) delete document.documentElement.dataset.orchestraPalette
        write(next.id)
        setStore("id", next.id)
        if (theme.colorScheme() !== next.scheme) theme.setColorScheme(next.scheme)
        syncThemeBackground()
      })
    }

    void apply(first)
      .catch(() => apply(findPalette("dark")!))
      .finally(() => setStore("ready", true))

    // Anything else that changes the color scheme (the titlebar toggle, another window) leaves a recolored
    // palette for Orchestra's own skin in that scheme.
    createEffect(
      on(theme.colorScheme, (scheme) => {
        const current = findPalette(store.id)
        if (!store.ready || !current || current.scheme === scheme) return
        void apply(findPalette(scheme) ?? findPalette("dark")!)
      }),
    )

    onMount(() => {
      makeEventListener(window, "storage", (event) => {
        if (event.key !== PALETTE_KEY) return
        const next = findPalette(event.newValue)
        if (next && next.id !== store.id) void apply(next)
      })
    })

    return {
      ready: () => store.ready,
      id: () => store.id,
      palettes: PALETTES,
      select: (id: PaletteID) => {
        const next = findPalette(id)
        if (!next || next.id === store.id) return
        return apply(next)
      },
    }
  },
})

/** The palette the preload resolved: a recolored palette on the root, or Orchestra's own skin in the saved scheme. */
function initial(): Palette {
  const recolored = findPalette(document.documentElement.dataset.orchestraPalette)
  if (recolored && recolors(recolored)) return recolored
  const scheme = findPalette(read("opencode-color-scheme"))
  return scheme && !recolors(scheme) ? scheme : findPalette("system")!
}

function style(css: string | undefined) {
  const existing = document.getElementById(STYLE_ID)
  if (!css) return existing?.remove()
  const element =
    existing ?? document.head.appendChild(Object.assign(document.createElement("style"), { id: STYLE_ID }))
  element.textContent = css
}

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(id: PaletteID) {
  try {
    localStorage.setItem(PALETTE_KEY, id)
  } catch {}
}

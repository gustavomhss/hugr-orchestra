import { render } from "solid-js/web"
import { ThemeProvider, useTheme } from "@opencode-ai/ui/theme/context"
import { OrchestraPaletteProvider, useOrchestraPalette } from "../../src/orchestra/palette/context"
import "../../src/index.css"

function Controls() {
  const theme = useTheme()
  const palette = useOrchestraPalette()
  return (
    <>
      <output aria-label="Selected palette">{palette.id()}</output>
      <button onClick={() => palette.select("graphite")}>Graphite</button>
      <button onClick={() => palette.select("dark")}>Dark</button>
      {/* The titlebar toggle: it only switches Orchestra's color scheme. */}
      <button onClick={() => theme.setColorScheme(theme.mode() === "dark" ? "light" : "dark")}>Toggle scheme</button>
    </>
  )
}

export function mount() {
  document.body.toggleAttribute("data-new-layout", true)
  render(
    () => (
      <ThemeProvider>
        <OrchestraPaletteProvider>
          <Controls />
        </OrchestraPaletteProvider>
      </ThemeProvider>
    ),
    document.getElementById("root")!,
  )
}

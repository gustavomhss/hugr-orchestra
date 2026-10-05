import { render } from "solid-js/web"
import { ThemeProvider, useTheme } from "@opencode-ai/ui/theme/context"
import "../../src/index.css"

function Controls() {
  const theme = useTheme()
  return (
    <>
      <output aria-label="Selected theme">{theme.themeId()}</output>
      <button onClick={() => theme.setColorScheme("light")}>Light</button>
      <button onClick={() => theme.setColorScheme("dark")}>Dark</button>
      <button onClick={() => theme.previewTheme("nord")}>Preview</button>
      <button onClick={() => theme.previewColorScheme(theme.mode() === "dark" ? "light" : "dark")}>Preview mode</button>
      <button onClick={() => theme.cancelPreview()}>Cancel</button>
      <button onClick={() => theme.setTheme("nightowl")}>Select Night Owl</button>
    </>
  )
}

export function mount() {
  document.body.toggleAttribute("data-new-layout", true)
  render(
    () => (
      <ThemeProvider>
        <Controls />
      </ThemeProvider>
    ),
    document.getElementById("root")!,
  )
}

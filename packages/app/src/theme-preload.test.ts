import { beforeEach, describe, expect, test } from "bun:test"
import { syncThemeBackground } from "@orchestra/ui/theme/context"

const src = await Bun.file(new URL("../public/oc-theme-preload.js", import.meta.url)).text()
const skin = await Bun.file(new URL("./orchestra/background.css", import.meta.url)).text()
const palettes = await Bun.file(new URL("./orchestra/palette/generated/first-paint.css", import.meta.url)).text()

const run = () => Function(src)()

// The Vite plugin inlines Orchestra's background and the palettes' first-paint rules before the preload.
function inline() {
  for (const css of [skin, palettes]) {
    const style = document.createElement("style")
    style.textContent = css
    document.head.appendChild(style)
  }
  const meta = document.createElement("meta")
  meta.name = "theme-color"
  document.head.appendChild(meta)
  return meta
}

beforeEach(() => {
  document.head.innerHTML = ""
  document.documentElement.removeAttribute("style")
  document.documentElement.removeAttribute("data-new-layout")
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-color-scheme")
  document.documentElement.removeAttribute("data-orchestra-palette")
  localStorage.clear()
  Object.defineProperty(window, "matchMedia", {
    value: () =>
      ({
        matches: false,
      }) as MediaQueryList,
    configurable: true,
  })
})

describe("theme preload", () => {
  test.each(["light", "dark"])("uses the approved Orchestra %s background before mount", (mode) => {
    const meta = inline()
    localStorage.setItem("orchestra-color-scheme", mode)

    run()

    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(mode === "dark" ? "#080c11" : "#dfe3e8")
    expect(meta.content).toBe(getComputedStyle(document.documentElement).backgroundColor)
    expect(document.documentElement.dataset.orchestraPalette).toBeUndefined()

    document.documentElement.dataset.colorScheme = mode === "dark" ? "light" : "dark"
    syncThemeBackground()

    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(mode === "dark" ? "#dfe3e8" : "#080c11")
    expect(meta.content).toBe(getComputedStyle(document.documentElement).backgroundColor)
    expect(document.documentElement.style.colorScheme).toBe(mode === "dark" ? "light" : "dark")
  })

  test.each([
    ["graphite", "dark", "#0c0d0e"],
    ["github", "light", "#ffffff"],
  ])("paints the saved %s palette in its own scheme before mount", (id, scheme, background) => {
    const meta = inline()
    localStorage.setItem("orchestra-palette", id)
    localStorage.setItem("orchestra-color-scheme", scheme === "dark" ? "light" : "dark")

    run()

    expect(document.documentElement.dataset.orchestraPalette).toBe(id)
    expect(document.documentElement.dataset.colorScheme).toBe(scheme)
    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(background)
    expect(meta.content).toBe(background)
    expect(localStorage.getItem("orchestra-color-scheme")).toBe(scheme)
  })

  // Dracula and Catppuccin were pilots the owner did not keep.
  test.each(["monokai", "dracula", "catppuccin"])(
    "falls back to Orchestra Dark for the unknown or removed %s",
    (id) => {
      inline()
      localStorage.setItem("orchestra-palette", id)
      localStorage.setItem("orchestra-color-scheme", "light")

      run()

      expect(document.documentElement.dataset.orchestraPalette).toBeUndefined()
      expect(document.documentElement.dataset.colorScheme).toBe("dark")
      expect(getComputedStyle(document.documentElement).backgroundColor).toBe("#080c11")
      expect(localStorage.getItem("orchestra-palette")).toBe("dark")
      expect(localStorage.getItem("orchestra-color-scheme")).toBe("dark")
    },
  )

  test("migrates legacy oc-1 to oc-2 before mount", () => {
    localStorage.setItem("orchestra-theme-id", "oc-1")
    localStorage.setItem("orchestra-theme-css-light", "--background-base:#fff;")
    localStorage.setItem("orchestra-theme-css-dark", "--background-base:#000;")

    run()

    expect(document.documentElement.dataset.theme).toBe("oc-2")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(localStorage.getItem("orchestra-theme-id")).toBe("oc-2")
    expect(localStorage.getItem("orchestra-theme-css-light")).toBeNull()
    expect(localStorage.getItem("orchestra-theme-css-dark")).toBeNull()
    expect(document.getElementById("oc-theme-preload")).toBeNull()
  })

  test("turns an inherited theme into its Orchestra palette, or Orchestra Dark when none ships", () => {
    inline()
    localStorage.setItem("orchestra-theme-id", "nightowl")
    localStorage.setItem("orchestra-color-scheme", "light")
    localStorage.setItem("orchestra-theme-css-light", "--background-base:#123456;")

    run()

    expect(document.documentElement.dataset.theme).toBe("oc-2")
    expect(document.documentElement.dataset.orchestraPalette).toBeUndefined()
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(getComputedStyle(document.documentElement).backgroundColor).toBe("#080c11")
    expect(document.getElementById("oc-theme-preload")).toBeNull()
    expect(localStorage.getItem("orchestra-theme-css-light")).toBeNull()

    localStorage.removeItem("orchestra-palette")
    localStorage.setItem("orchestra-theme-id", "gruvbox")
    run()

    expect(document.documentElement.dataset.orchestraPalette).toBe("gruvbox")
    expect(localStorage.getItem("orchestra-palette")).toBe("gruvbox")
    expect(localStorage.getItem("orchestra-theme-id")).toBe("oc-2")
  })
})

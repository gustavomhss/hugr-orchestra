import { beforeEach, describe, expect, test } from "bun:test"
import { syncThemeBackground } from "@orchestra/ui/theme/context"

const src = await Bun.file(new URL("../public/oc-theme-preload.js", import.meta.url)).text()
const skin = await Bun.file(new URL("./orchestra/background.css", import.meta.url)).text()

const run = () => Function(src)()

beforeEach(() => {
  document.head.innerHTML = ""
  document.documentElement.removeAttribute("style")
  document.documentElement.removeAttribute("data-new-layout")
  document.documentElement.removeAttribute("data-theme")
  document.documentElement.removeAttribute("data-color-scheme")
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
    const style = document.createElement("style")
    style.textContent = skin
    document.head.appendChild(style)
    const meta = document.createElement("meta")
    meta.name = "theme-color"
    document.head.appendChild(meta)
    localStorage.setItem("orchestra-color-scheme", mode)

    run()

    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(mode === "dark" ? "#080c11" : "#dfe3e8")
    expect(meta.content).toBe(getComputedStyle(document.documentElement).backgroundColor)

    document.documentElement.dataset.colorScheme = mode === "dark" ? "light" : "dark"
    syncThemeBackground()

    expect(getComputedStyle(document.documentElement).backgroundColor).toBe(mode === "dark" ? "#dfe3e8" : "#080c11")
    expect(meta.content).toBe(getComputedStyle(document.documentElement).backgroundColor)
    expect(document.documentElement.style.colorScheme).toBe(mode === "dark" ? "light" : "dark")
  })

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

  test("keeps cached css for non-default themes", () => {
    localStorage.setItem("orchestra-theme-id", "nightowl")
    localStorage.setItem("orchestra-theme-css-light", "--background-base:#fff;")

    run()

    expect(document.documentElement.dataset.theme).toBe("nightowl")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:#fff;")
  })
})

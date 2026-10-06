import { expect, test, type Page } from "@playwright/test"

test.use({ serviceWorkers: "block" })

// Backgrounds as Chromium reports them: Orchestra's own schemes, and two palettes' generated first paint.
const DARK = "rgb(8, 12, 17)"
const LIGHT = "rgb(223, 227, 232)"
const GRAPHITE = "rgb(12, 13, 14)"
const GITHUB = "rgb(255, 255, 255)"

for (const mode of ["light", "dark"] as const) {
  test(
    `${mode}: Orchestra paints first, then a palette and the scheme toggle recolor it in place`,
    { tag: "@source-fixture" },
    async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 })
      await page.emulateMedia({ colorScheme: mode })
      await page.addInitScript(() => {
        if (sessionStorage.getItem("seeded")) return
        sessionStorage.setItem("seeded", "1")
        localStorage.setItem("opencode-color-scheme", "system")
      })
      await paused(page)
      await page.goto("/")
      await background(page, mode, mode === "dark" ? DARK : LIGHT)
      await expect(page.locator("html")).not.toHaveAttribute("data-orchestra-palette", /.*/)

      await mount(page)
      await expect(page.getByLabel("Selected palette", { exact: true })).toHaveText("system")
      await background(page, mode, mode === "dark" ? DARK : LIGHT)

      await page.getByRole("button", { name: "Graphite", exact: true }).click()
      await expect(page.locator("html")).toHaveAttribute("data-orchestra-palette", "graphite")
      await background(page, "dark", GRAPHITE)
      await expect(page.locator("#orchestra-palette")).toHaveCount(1)
      await expect.poll(() => storage(page)).toEqual({ palette: "graphite", scheme: "dark" })

      // The titlebar toggle leaves a palette for Orchestra's own skin in the other scheme.
      await page.getByRole("button", { name: "Toggle scheme", exact: true }).click()
      await expect(page.getByLabel("Selected palette", { exact: true })).toHaveText("light")
      await expect(page.locator("html")).not.toHaveAttribute("data-orchestra-palette", /.*/)
      await expect(page.locator("#orchestra-palette")).toHaveCount(0)
      await background(page, "light", LIGHT)
      await expect.poll(() => storage(page)).toEqual({ palette: "light", scheme: "light" })
    },
  )
}

for (const palette of [
  { id: "graphite", mode: "dark", color: GRAPHITE },
  { id: "github", mode: "light", color: GITHUB },
] as const) {
  test(`a saved ${palette.id} palette paints before the app loads`, { tag: "@source-fixture" }, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    // The system scheme disagrees with the palette: the palette's own scheme wins.
    await page.emulateMedia({ colorScheme: palette.mode === "dark" ? "light" : "dark" })
    await page.addInitScript((id) => {
      localStorage.setItem("orchestra-palette", id)
      localStorage.setItem("opencode-color-scheme", "system")
    }, palette.id)
    await paused(page)
    await page.goto("/")
    await expect(page.locator("html")).toHaveAttribute("data-orchestra-palette", palette.id)
    await background(page, palette.mode, palette.color)
    await mount(page)
    await expect(page.getByLabel("Selected palette", { exact: true })).toHaveText(palette.id)
    await expect(page.locator("#orchestra-palette")).toHaveCount(1)
    await background(page, palette.mode, palette.color)
  })
}

// Dracula and Catppuccin were pilots the owner did not keep: a saved choice of either paints Orchestra Dark.
for (const id of ["monokai", "dracula", "catppuccin"]) {
  test(
    `an unknown or removed palette (${id}) falls back to Orchestra Dark`,
    { tag: "@source-fixture" },
    async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 800 })
      await page.emulateMedia({ colorScheme: "light" })
      await page.addInitScript((id) => {
        localStorage.setItem("orchestra-palette", id)
        localStorage.setItem("opencode-color-scheme", "light")
      }, id)
      await paused(page)
      await page.goto("/")
      await expect(page.locator("html")).not.toHaveAttribute("data-orchestra-palette", /.*/)
      await background(page, "dark", DARK)
      expect(await storage(page)).toEqual({ palette: "dark", scheme: "dark" })
    },
  )
}

test(
  "an inherited theme from before palettes becomes its palette or Orchestra Dark",
  { tag: "@source-fixture" },
  async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.emulateMedia({ colorScheme: "light" })
    await page.addInitScript(() => {
      if (sessionStorage.getItem("seeded")) return
      sessionStorage.setItem("seeded", "1")
      localStorage.setItem("opencode-theme-id", "nightowl")
      localStorage.setItem("opencode-color-scheme", "light")
      // A stale inherited cache must not paint before Orchestra.
      localStorage.setItem("opencode-theme-css-light", "--background-base:#123456;--v2-background-bg-deep:#654321;")
    })
    await paused(page)
    await page.goto("/")
    await background(page, "dark", DARK)
    await expect(page.locator("#oc-theme-preload")).toHaveCount(0)
    expect(
      await page.evaluate(() => [
        localStorage.getItem("opencode-theme-id"),
        localStorage.getItem("opencode-theme-css-light"),
      ]),
    ).toEqual(["oc-2", null])
    expect(await storage(page)).toEqual({ palette: "dark", scheme: "dark" })

    await page.evaluate(() => {
      localStorage.removeItem("orchestra-palette")
      localStorage.setItem("opencode-theme-id", "gruvbox")
    })
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("data-orchestra-palette", "gruvbox")
    await background(page, "dark", "rgb(40, 40, 40)")
  },
)

// Pause the app entry so the first checks cannot be satisfied by mounted CSS or providers.
function paused(page: Page) {
  return page.route("**/src/entry.tsx", (route) => route.abort())
}

async function mount(page: Page) {
  await page.evaluate(async (path) => {
    const fixture: { mount(): void } = await import(path)
    fixture.mount()
  }, "/e2e/orchestra/theme-first-paint.fixture.tsx")
}

function storage(page: Page) {
  return page.evaluate(() => ({
    palette: localStorage.getItem("orchestra-palette"),
    scheme: localStorage.getItem("opencode-color-scheme"),
  }))
}

async function background(page: Page, mode: "light" | "dark", color: string) {
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", mode)
  await expect(page.locator("html")).toHaveCSS("color-scheme", mode)
  await expect(page.locator("html")).toHaveCSS("background-color", color)
  await expect(page.locator("body")).toHaveCSS("background-color", color)
  await expect(page.locator("#root")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
  await expect(page.locator("body")).toHaveCSS("background-image", /radial-gradient/)
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", color)
}

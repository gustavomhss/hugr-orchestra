import { expect, test, type Page } from "@playwright/test"

test.use({ serviceWorkers: "block" })

for (const mode of ["light", "dark"] as const) {
  for (const selection of ["default", "cached", "uncached"] as const) {
    test(
      `${mode} ${selection}: first paint survives theme mount, preview and selection`,
      { tag: "@source-fixture" },
      async ({ page }) => {
        await page.setViewportSize({ width: selection === "uncached" ? 600 : 1200, height: 800 })
        await page.emulateMedia({ colorScheme: mode })
        await page.addInitScript(
          ({ selection, css, mode }) => {
            localStorage.setItem("orchestra-color-scheme", selection === "default" ? "system" : mode)
            if (selection === "default") return
            localStorage.setItem("orchestra-theme-id", "nightowl")
            if (selection === "cached") {
              localStorage.setItem("orchestra-theme-css-light", css)
              localStorage.setItem("orchestra-theme-css-dark", css)
            }
          },
          {
            selection,
            mode,
            // A stale cache must not override the approved app background before theme loading.
            css: "--background-base:#123456;--v2-background-bg-deep:#654321;",
          },
        )
        // Pause the app entry so the first checks cannot be satisfied by mounted CSS or providers.
        await page.route("**/src/entry.tsx", (route) => route.abort())
        await page.goto("/")
        await background(page, mode)
        await expect(page.locator("#oc-theme")).toHaveCount(0)
        const first = await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundImage)
        expect(first).toContain("radial-gradient")

        await page.evaluate(async (path) => {
          const fixture: { mount(): void } = await import(path)
          fixture.mount()
        }, "/e2e/orchestra/theme-first-paint.fixture.tsx")
        await expect(page.locator("#oc-theme")).toHaveCount(1)
        await expect(page.getByLabel("Selected theme", { exact: true })).toHaveText(
          selection === "default" ? "oc-2" : "nightowl",
        )
        await background(page, mode)
        expect(await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundImage)).toBe(first)

        const next = mode === "dark" ? "light" : "dark"
        if (selection === "default") {
          await page.emulateMedia({ colorScheme: next })
          await background(page, next)
          await page.emulateMedia({ colorScheme: mode })
          await background(page, mode)
        }
        await page.getByRole("button", { name: next === "dark" ? "Dark" : "Light", exact: true }).click()
        await background(page, next)
        await page.getByRole("button", { name: "Preview", exact: true }).click()
        await expect(page.locator("html")).toHaveAttribute("data-theme", "nord")
        await background(page, next)
        await page.getByRole("button", { name: "Preview mode", exact: true }).click()
        await background(page, mode)
        await page.getByRole("button", { name: "Cancel", exact: true }).click()
        await expect(page.locator("html")).toHaveAttribute("data-theme", selection === "default" ? "oc-2" : "nightowl")
        await background(page, next)
        await page.getByRole("button", { name: "Select Night Owl", exact: true }).click()
        await expect(page.getByLabel("Selected theme", { exact: true })).toHaveText("nightowl")
        await expect(page.locator("html")).toHaveAttribute("data-theme", "nightowl")
        await background(page, next)
        await expect.poll(() => page.evaluate(() => localStorage.getItem("orchestra-theme-id"))).toBe("nightowl")
      },
    )
  }
}

async function background(page: Page, mode: "light" | "dark") {
  const color = mode === "dark" ? "rgb(8, 12, 17)" : "rgb(223, 227, 232)"
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", mode)
  await expect(page.locator("html")).toHaveCSS("color-scheme", mode)
  await expect(page.locator("html")).toHaveCSS("background-color", color)
  await expect(page.locator("body")).toHaveCSS("background-color", color)
  await expect(page.locator("#root")).toHaveCSS(
    "background-color",
    page.viewportSize()!.width >= 768 ? "rgba(0, 0, 0, 0)" : color,
  )
  await expect(page.locator("html")).toHaveCSS(
    "background-image",
    page.viewportSize()!.width >= 768
      ? await page.locator("body").evaluate((body) => getComputedStyle(body).backgroundImage)
      : "none",
  )
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", color)
}

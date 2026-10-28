import { expect, test } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const renderer = resolve(import.meta.dirname, "../../../../apps/desktop/src/renderer/boot.tsx")
// Vite's /@fs/ prefix needs forward slashes and a leading slash before Windows drive letters.
const rendererURL = `/@fs/${renderer.replaceAll("\\", "/").replace(/^\//, "")}`

test.setTimeout(120_000)

for (const scheme of ["light", "dark"] as const) {
  for (const stage of ["window", "initialization", "error"] as const) {
    test(`${scheme}: Orchestra branding during ${stage}`, { tag: "@source-fixture" }, async ({ page }) => {
      await page.addInitScript(
        ({ scheme, stage }) => {
          localStorage.setItem("orchestra-color-scheme", scheme)
          // Electron's bridge is unavailable in Chromium. Hold only the startup boundary under test.
          Object.assign(window, {
            api: {
              updater: { subscribe: () => undefined },
              onMenuCommand: () => undefined,
              consumeInitialDeepLinks: async () => [],
              onDeepLink: () => undefined,
              getZoomFactor: async () => 1,
              onZoomFactorChanged: () => undefined,
              getPinchZoomEnabled: async () => false,
              onPinchZoomEnabledChanged: () => undefined,
              onWindowFullscreenChanged: () => undefined,
              getWindowFullscreen: async () => false,
              getWindowID: () => (stage === "window" ? new Promise(() => {}) : Promise.resolve("branding")),
              awaitInitialization: () => {
                document.documentElement.dataset.initializationRequested = "true"
                return stage === "error" ? Promise.reject(new Error("branding startup failure")) : new Promise(() => {})
              },
              getDefaultServerUrl: async () => undefined,
              storeGet: async () => undefined,
              storeSet: async () => undefined,
              setNativeTranslations: async () => undefined,
              recordFatalRendererError: async () => undefined,
              getCaffeinate: async () => false,
              setCaffeinate: async () => undefined,
              onCaffeinateChanged: () => () => undefined,
            },
          })
        },
        { scheme, stage },
      )
      await page.route("**/startup-branding", async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: (await readFile(resolve(renderer, "../index.html"), "utf8")).replace(
            'src="./boot.tsx"',
            `src="${rendererURL}"`,
          ),
        })
      })
      await page.goto("/startup-branding")
      if (stage !== "window") {
        await expect(page.locator("html")).toHaveAttribute("data-initialization-requested", "true", { timeout: 60_000 })
      }
      if (stage === "error") {
        await expect(page.getByRole("heading", { name: "Something went wrong" })).toBeVisible()
        await expect(page.getByRole("button", { name: "Restart", exact: true })).toBeVisible()
        await expect(page.getByRole("textbox")).toHaveValue(/branding startup failure/)
      }
      await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
      await expect(page.locator('[data-component="logo-splash"]')).toHaveCount(0)
      await expect(page.locator("#root svg[viewBox='0 0 234 42']")).toHaveCount(0)
      // Loading is a plain surface: the comet splash is the only opening mark, so no pulsing logo waits under it.
      if (stage !== "error") {
        await expect(page.locator("#root [data-app-loading]")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("img", { name: "HuGR", exact: true })).toHaveCount(0)
        return
      }
      const mark = page.getByRole("img", { name: "HuGR", exact: true })
      await expect(mark).toBeVisible({ timeout: 60_000 })
      await expect(mark).toHaveAttribute(
        "src",
        `/orchestra/hugr-lockup-${scheme === "light" ? "primary" : "inverse"}.svg`,
      )
      await expect
        .poll(() => mark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
      // The 383×128 lockup drawn 40px tall.
      await expect(mark).toHaveCSS("width", "119.688px")
      await expect(mark).toHaveCSS("height", "40px")
    })
  }
}

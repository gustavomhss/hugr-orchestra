import { expect, test } from "@playwright/test"
import { setupCompactNavigation } from "./compact-navigation.fixture"

test.use({ viewport: { width: 1672, height: 941 }, serviceWorkers: "block" })

const projectName = "مشروع Compact navigation 42 — واجهة"
const cases = [
  { name: "English LTR", locale: "en", direction: "ltr", home: "Home", last: "Settings", override: false },
  { name: "English forced RTL", locale: "en", direction: "rtl", home: "Home", last: "Settings", override: true },
  { name: "Arabic RTL", locale: "ar", direction: "rtl", home: "الرئيسية", last: "الإعدادات", override: false },
] as const

for (const scenario of cases) {
  for (const scheme of ["dark", "light"] as const) {
    test(
      `${scenario.name} ${scheme}: navigation, tooltips and profile portal agree`,
      {
        tag: scenario.override ? "@development-only" : [],
      },
      async ({ page }) => {
        test.setTimeout(120_000)
        const fixture = await setupCompactNavigation(page, { locale: scenario.locale, scheme, projectName })
        await page.goto("/")
        const sidebar = page.locator('[data-component="orchestra-sidebar"]')
        const home = sidebar.getByRole("button", { name: scenario.home, exact: true })
        await expect(sidebar).toHaveCSS("width", "230px")
        await expect(home).toHaveAttribute("aria-current", "page")
        await expect(sidebar.getByRole("button", { name: "Chat", exact: true })).toBeEnabled()
        if (scenario.override) await page.getByRole("button", { name: "DIR: LTR", exact: true }).click()
        await expect(page.locator("html")).toHaveAttribute("lang", scenario.locale)
        await expect(page.locator("html")).toHaveAttribute("dir", scenario.direction)
        await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
        // The override control belongs to DebugBar; locale-driven direction also
        // runs against the unchanged production bundle, which must not ship DebugBar.
        if (test.info().config.metadata.bundle === "production")
          await expect(page.getByRole("button", { name: /^DIR: / })).toHaveCount(0)
        else
          await expect(
            page.getByRole("button", { name: `DIR: ${scenario.direction.toUpperCase()}`, exact: true }),
          ).toHaveAttribute("aria-pressed", String(scenario.direction === "rtl"))

        const toggle = sidebar.getByRole("button", { name: "Collapse sidebar", exact: true })
        // The glyph draws its panel on the left, so it mirrors with the navigation.
        await expect(toggle.locator("svg")).toHaveCSS(
          "transform",
          scenario.direction === "rtl" ? "matrix(-1, 0, 0, 1, 0, 0)" : "none",
        )
        await toggle.focus()
        await page.keyboard.press("Enter")
        await expect(sidebar).toHaveCSS("width", "56px")
        await expect(sidebar.getByRole("button", { name: "Expand sidebar", exact: true })).toBeFocused()
        for (const name of [scenario.home, "Chat", "Agents", "Maestro", "MCP"]) {
          await page.keyboard.press("Tab")
          await expect(sidebar.getByRole("button", { name, exact: true })).toBeFocused()
        }

        const marker = await home.evaluate((element, direction) => {
          const style = getComputedStyle(element, "::before")
          return {
            width: style.width,
            start: direction === "rtl" ? style.right : style.left,
            end: direction === "rtl" ? style.left : style.right,
          }
        }, scenario.direction)
        expect(marker).toEqual({ width: "2px", start: "0px", end: "38px" })
        const mcp = sidebar.getByRole("button", { name: "MCP", exact: true })
        const tooltip = page.getByRole("tooltip", { name: "MCP", exact: true })
        await expect(tooltip).toBeVisible()
        await expect(tooltip).toHaveCSS("direction", scenario.direction)
        await expect(mcp).toHaveAttribute("aria-describedby", (await tooltip.getAttribute("id"))!)
        const tooltipAligned = async () => {
          const anchor = await mcp.boundingBox()
          const tip = await tooltip.boundingBox()
          if (!anchor || !tip) return false
          return scenario.direction === "rtl" ? tip.x + tip.width <= anchor.x : tip.x >= anchor.x + anchor.width
        }
        await expect.poll(tooltipAligned).toBe(true)
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: test.info().outputPath("compact-tooltip.png"), animations: "disabled" })
        await page.keyboard.press("Escape")
        await expect(tooltip).toBeHidden()
        await expect(mcp).toBeFocused()

        const profile = sidebar.getByRole("button", { name: "Choose repository profile", exact: true })
        await profile.focus()
        await page.keyboard.press("Enter")
        const menu = page.getByRole("menu")
        const project = page.getByRole("menuitemradio", { name: projectName, exact: true })
        await expect(project).toBeEnabled()
        await expect(project).toBeFocused()
        await expect(menu).toHaveCSS("direction", scenario.direction)
        // The portal inherits document direction; its logical top-start placement is
        // resolved separately by Kobalte's provider, so verify both text and geometry.
        expect(await menu.evaluate((element) => element.closest('[data-component="orchestra-sidebar"]') === null)).toBe(
          true,
        )
        const profileAligned = async () => {
          const anchor = await profile.boundingBox()
          const popup = await menu.boundingBox()
          if (!anchor || !popup || popup.y + popup.height > anchor.y) return false
          const delta =
            scenario.direction === "rtl" ? popup.x + popup.width - anchor.x - anchor.width : popup.x - anchor.x
          return Math.abs(delta) < 1
        }
        await expect.poll(profileAligned).toBe(true)
        await page.screenshot({ path: test.info().outputPath("compact-profile.png"), animations: "disabled" })
        await project.press("Enter")
        await expect(menu).toBeHidden()
        await expect(profile).toContainText(projectName)
        await expect(profile.locator("small")).toHaveAttribute("dir", "ltr")

        // At the viewport edge, collision flipping can hide a wrong provider direction.
        // Give the real consumers room on both sides and verify their preferred placement.
        const shell = page.locator(".orchestra-shell")
        await shell.evaluate((element) => {
          const style = (element as HTMLElement).style
          style.marginInline = "320px"
          style.inlineSize = "calc(100% - 640px)"
        })
        await expect(shell).toHaveCSS("width", "1032px")
        await page.locator(".orchestra-content").hover({ position: { x: 120, y: 400 } })
        await mcp.focus()
        await expect(tooltip).toBeVisible()
        await expect.poll(tooltipAligned).toBe(true)
        await page.keyboard.press("Escape")
        await expect(tooltip).toBeHidden()
        await profile.focus()
        await page.keyboard.press("Enter")
        await expect(project).toBeFocused()
        await expect(project).toHaveAttribute("aria-checked", "true")
        await expect.poll(profileAligned).toBe(true)
        const item = await project.elementHandle()
        expect(item).not.toBeNull()
        fixture.renameProject(`${projectName} v2`)
        const refreshed = page.getByRole("menuitemradio", { name: `${projectName} v2`, exact: true })
        await expect(refreshed).toBeFocused()
        await expect(refreshed).toHaveAttribute("aria-checked", "true")
        expect(await refreshed.evaluate((element, previous) => element === previous, item)).toBe(true)
        await page.keyboard.press("Escape")
        await expect(menu).toBeHidden()
        await expect(profile).toBeFocused()
        await expect(profile).toContainText(`${projectName} v2`)
        await shell.evaluate((element) => {
          const style = (element as HTMLElement).style
          style.removeProperty("margin-inline")
          style.removeProperty("inline-size")
        })

        // Short windows must scroll the last navigation target into view before the profile.
        await page.setViewportSize({ width: 1152, height: 600 })
        await expect(sidebar).toHaveCSS("width", "56px")
        const last = sidebar.getByRole("button", { name: scenario.last, exact: true })
        await last.focus()
        await expect(last).toBeInViewport({ ratio: 1 })
        await page.keyboard.press("Tab")
        await expect(profile).toBeFocused()
        await page.keyboard.press("Shift+Tab")
        await expect(last).toBeFocused()
        await expect(last).toBeInViewport({ ratio: 1 })
      },
    )
  }
}

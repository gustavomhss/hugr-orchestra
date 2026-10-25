import { expect, test } from "@playwright/test"
import { setupCompactNavigation } from "./compact-navigation.fixture"

// Source fixtures: browser interaction is real; server replies are fixtures, not remote-auth evidence.
for (const width of [390, 720, 768, 1440]) {
  test(`source fixture: navigation and global settings at ${width} CSS pixels`, async ({ page }) => {
    // 1440 × 900 at 200% browser zoom yields a 720 × 450 CSS-pixel viewport.
    await page.setViewportSize({ width, height: width === 720 ? 450 : 900 })
    await setupCompactNavigation(page)
    await page.goto("/", { waitUntil: "domcontentloaded" })
    if (width < 768) {
      const trigger = page.getByRole("button", { name: "Navigation", exact: true })
      await expect(trigger).toBeVisible()
      await trigger.click()
      const drawer = page.getByRole("dialog", { name: "Navigation", exact: true })
      await expect(drawer).toBeVisible()
      await expect.poll(() => drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      await page.keyboard.press("Escape")
      await expect(drawer).not.toBeVisible()
      await expect(trigger).toBeFocused()
      await trigger.click()
      await drawer.getByRole("button", { name: "Settings", exact: true }).click()
      await expect(drawer).not.toBeVisible()
    }
    if (width >= 768) {
      if (width < 1024) await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
      await page
        .locator('[data-component="orchestra-sidebar"]')
        .getByRole("button", { name: "Settings", exact: true })
        .click()
    }
    await expect(page).toHaveURL(/\/orchestra\/settings/)
    const nav = page.getByRole("navigation", { name: "Settings sections" })
    await nav.getByRole("button", { name: "General", exact: true }).click()
    await expect(page.locator('[data-action="settings-language"]')).toBeVisible()
    await nav.getByRole("button", { name: "Models", exact: true }).click()
    await expect(page.getByRole("status").filter({ hasText: "Open a project to manage this section" })).toBeVisible()
    await nav.getByRole("button", { name: "Servers", exact: true }).click()
    await expect(page.getByRole("button", { name: /Add server/i })).toBeVisible()
    await nav.getByRole("button", { name: "Shortcuts", exact: true }).click()
    await expect(page.locator('[data-mx-page="settings"]')).toContainText("Shortcuts")
  })
}

test("source fixture: sole unreachable server can repair credentials before router mounts", async ({ page }) => {
  await setupCompactNavigation(page)
  let repaired = false
  await page.route(
    (url) =>
      url.origin === "http://127.0.0.1:4096" && url.pathname === "/api/health",
    async (route) => {
      const headers = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, OPTIONS",
      }
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      repaired = route.request().headers().authorization === `Basic ${Buffer.from("user:fixed").toString("base64")}`
      await route.fulfill({
        status: repaired ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify({ healthy: repaired, version: "fixture" }),
        headers,
      })
    },
  )
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "Edit server", exact: true }).click()
  await page.getByLabel("Username (optional)", { exact: true }).fill("user")
  await page.getByLabel("Password (optional)", { exact: true }).fill("fixed")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.locator('[data-component="orchestra-home"]')).toBeVisible()
  expect(repaired).toBe(true)
})

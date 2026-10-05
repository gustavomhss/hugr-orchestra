import { expect, test } from "@playwright/test"

test.use({ serviceWorkers: "block" })

test.beforeEach(async ({ page }) => {
  await page.route("**/src/entry.tsx", (route) => route.abort())
  await page.goto("/")
  await page.evaluate(async (path) => {
    const fixture: { mount(): void } = await import(path)
    fixture.mount()
  }, "/e2e/orchestra/governance-lifetime.fixture.ts")
  await expect(page.getByLabel("Owning route")).toHaveText("server-a")
  await page.getByRole("button", { name: "Open governance", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "Governance server-a", exact: true })).toBeVisible()
})

test(
  "owned dialog cleanup preserves a replacement owned by another scope",
  { tag: "@source-fixture" },
  async ({ page }) => {
    await page.getByText("Replace dialog", { exact: true }).dispatchEvent("click")
    const replacement = page.getByRole("dialog", { name: "Replacement", exact: true })
    await expect(replacement).toBeVisible()
    await page.getByText("Home", { exact: true }).dispatchEvent("click")
    await expect(page.getByLabel("Owning route")).toHaveText("home")
    await expect(replacement).toBeVisible()
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(1)
    await page.getByText("Open from disposed owner", { exact: true }).dispatchEvent("click")
    await expect(replacement).toBeVisible()
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(0)
  },
)

test(
  "owned dialog cleanup removes its hidden root without closing a newer stacked dialog",
  { tag: "@source-fixture" },
  async ({ page }) => {
    await page.getByText("Push dialog", { exact: true }).dispatchEvent("click")
    const newer = page.getByRole("dialog", { name: "Newer", exact: true })
    await expect(newer).toBeVisible()
    // CSS locator deliberately includes the hidden lower root, so the negative check cannot pass on aria-hidden alone.
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(1)
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(2)
    await page.getByText("Home", { exact: true }).dispatchEvent("click")
    await expect(page.getByLabel("Owning route")).toHaveText("home")
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(0)
    await expect(newer).toBeVisible()
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(1)
    await page.keyboard.press("Escape")
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(0)
  },
)

test(
  "owned dialog cleanup works while the newer dialog is already closing",
  { tag: "@source-fixture" },
  async ({ page }) => {
    await page.getByText("Push dialog", { exact: true }).dispatchEvent("click")
    await expect(page.getByRole("dialog", { name: "Newer", exact: true })).toBeVisible()
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(1)
    await page.getByText("Close latest and leave", { exact: true }).dispatchEvent("click")
    await expect(page.getByLabel("Owning route")).toHaveText("home")
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(0)
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(0)
  },
)

test(
  "owned dialog disposer cannot close a newer server owner's dialog",
  { tag: "@source-fixture" },
  async ({ page }) => {
    await page.getByText("Server B", { exact: true }).dispatchEvent("click")
    await expect(page.getByLabel("Owning route")).toHaveText("server-b")
    await expect(page.locator(".governance-owned-dialog")).toHaveCount(0)
    await page.getByRole("button", { name: "Open governance", exact: true }).click()
    const current = page.getByRole("dialog", { name: "Governance server-b", exact: true })
    await expect(current).toBeVisible()
    await page.getByText("Dispose first dialog", { exact: true }).dispatchEvent("click")
    await expect(current).toBeVisible()
    await expect(page.locator('[data-component="dialog-overlay"]')).toHaveCount(1)
  },
)

import { expect, test, type Page } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    localStorage.setItem("settings.v3", JSON.stringify({ general: { shouldDisplayTabsToast: false } }))
    localStorage.setItem(
      "orchestra.global.dat:server",
      JSON.stringify({ projects: { local: [{ worktree: "/repo", expanded: true }] } }),
    )
    localStorage.setItem(
      "orchestra.global.dat:layout",
      JSON.stringify({ home: { selection: { server: "http://127.0.0.1:4096", directory: "/repo" } } }),
    )
  })
  await mockOrchestraServer(page, {
    protocol: "v1",
    directory: "/repo",
    project: { id: "desktop-recovery", worktree: "/repo", vcs: "git", time: { created: 1, updated: 1 }, sandboxes: [] },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
}

test("server editor fields have labels and health errors are linked alerts", async ({ page }) => {
  await setup(page)
  await page.route("https://unreachable.test/**", (route) =>
    route.fulfill({ json: { healthy: false }, headers: { "access-control-allow-origin": "*" } }),
  )
  await page.goto("/orchestra/settings?section=servers")
  await page.getByRole("button", { name: "Add server", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Add server" })
  const address = dialog.getByLabel("Server address", { exact: true })
  await address.fill("https://unreachable.test")
  await dialog.getByLabel("Server name (optional)", { exact: true }).fill("Unreachable")
  await expect(dialog.getByLabel("Username (optional)", { exact: true })).toBeEditable()
  await expect(dialog.getByLabel("Password (optional)", { exact: true })).toBeEditable()
  await dialog.getByRole("button", { name: "Add server", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Could not connect to server")
  await expect(address).toHaveAttribute("aria-invalid", "true")
  await expect(address).toHaveAccessibleDescription("Could not connect to server")
})

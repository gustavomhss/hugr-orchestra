import { expect, test } from "@playwright/test"

test("desktop picker Tab moves focus unless a visible completion is accepted", async ({ page }) => {
  await page.route("**/fixture/list?**", (route) => {
    const directory = new URL(route.request().url()).searchParams.get("directory")
    return route.fulfill({ json: directory === "/" ? [{ path: "repo", type: "directory" }] : directory === "/repo" ? [{ path: "matched", type: "directory" }] : [] })
  })
  await page.goto("/e2e/regression/directory-recovery.fixture.html")
  const dialog = page.getByRole("dialog", { name: "Open project" })
  const input = dialog.getByRole("combobox")
  await expect(dialog.getByRole("button", { name: "Select folder", exact: true })).toBeEnabled()
  await input.focus()
  await input.press("Tab")
  await expect(dialog.getByRole("button", { name: "~", exact: true })).toBeFocused()
  await input.fill("/repo/zzzz")
  await expect(dialog.getByRole("option")).toHaveCount(0)
  await input.press("Tab")
  await expect(dialog.getByRole("button", { name: "~", exact: true })).toBeFocused()
  await input.fill("/repo/match")
  await expect(dialog.getByRole("option")).toHaveText("~/matched/")
  await input.press("Tab")
  await expect(input).toHaveValue("~/matched/")
  await expect(input).toBeFocused()
})

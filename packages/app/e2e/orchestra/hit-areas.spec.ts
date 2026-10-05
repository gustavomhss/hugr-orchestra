import { expect, test, type Locator } from "@playwright/test"
import { directory, sessionID, setupTimeline } from "../performance/timeline-stability/fixture"

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: small Orchestra controls receive a 24px pointer target`, async ({ page }) => {
    const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`
    await page.addInitScript(
      (input) => {
        localStorage.setItem("opencode-theme-id", "oc-2")
        localStorage.setItem("opencode-color-scheme", input.scheme)
        localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
        localStorage.setItem(
          "opencode.window.browser.dat:tabs",
          JSON.stringify([{ type: "session", server: input.server, sessionId: input.sessionID }]),
        )
        localStorage.setItem(
          "opencode.global.dat:server",
          JSON.stringify({
            projects: { local: [{ worktree: input.directory, expanded: true }] },
            lastProject: { local: input.directory },
          }),
        )
      },
      { scheme, server, directory, sessionID },
    )
    await setupTimeline(page, { settings: { newLayoutDesigns: true, shouldDisplayTabsToast: false }, locale: "en" })
    await expect(page.locator("body")).toHaveAttribute("data-new-layout", "")
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    if (process.env.OPENCODE_HIT_AREA_MUTATION === "1") {
      await page.addStyleTag({ content: "body[data-new-layout] button::after { content: none !important; }" })
    }
    const sidebar = page.locator('[data-component="orchestra-sidebar"]')
    await expectTarget(sidebar.getByRole("button", { name: "Chat", exact: true }))
    await expectTarget(page.locator('[data-slot="orchestra-theme-toggle"]'))
    const close = page.locator("#orchestra-session-tabs").getByRole("button", { name: "Close tab", exact: true })
    await expect(close).toBeEnabled()
    await expect(close).toHaveCSS("width", "20px")
    await expect(close).toHaveCSS("height", "20px")
    await expectTarget(close)

    // The header's Review button opens the rail; Context is a permanent tab, with no close of its own.
    await page.locator('[data-slot="session-title-actions"]').getByRole("button", { name: "Review" }).click()
    const context = page.getByRole("tab", { name: "Context", exact: true })
    await context.click()
    await expect(context).toHaveAttribute("aria-selected", "true")
    await expect(
      page
        .locator('[data-slot="tabs-trigger-wrapper"]')
        .filter({ has: context })
        .getByRole("button", { name: "Close tab" }),
    ).toHaveCount(0)
    const openFile = page.locator('[data-slot="session-side-panel-open-file"]').getByRole("button", {
      name: "Open file",
      exact: true,
    })
    await openFile.focus()
    await expect(openFile).toBeFocused()
    await expect(openFile).toHaveCSS("width", "24px")
    await expect(openFile).toHaveCSS("height", "24px")
    await expectTarget(openFile)
    await expectTarget(page.locator('[data-slot="session-title-actions"]').getByRole("button", { name: "Review" }))

    await sidebar.getByRole("button", { name: /^Plugins/ }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("Plugins")
    const dialogClose = dialog.getByRole("button", { name: "Close", exact: true })
    await expect(dialogClose).toHaveCSS("width", "20px")
    await expect(dialogClose).toHaveCSS("height", "20px")
    await expectTarget(dialogClose)
    const visual = await dialogClose.boundingBox()
    const mutation = await page.addStyleTag({
      content: 'body[data-new-layout] [data-slot="dialog-close-button"]::after { content: none !important; }',
    })
    const reduced = await hitPoints(dialogClose)
    expect(() => expect(reduced, "minimum 24×24px target").toEqual(Array.from({ length: 9 }, () => true))).toThrow()
    expect(await dialogClose.boundingBox(), "removing the transparent hit box leaves layout unchanged").toEqual(visual)
    await mutation.evaluate((element) => element.parentNode?.removeChild(element))
    await expectTarget(dialogClose)
    await page.keyboard.press("Tab")
    await dialogClose.focus()
    await expect(dialogClose).toHaveCSS("outline-width", "2px")
    await expect(dialogClose).toHaveCSS("outline-color", scheme === "dark" ? "rgb(126, 165, 204)" : "rgb(63, 111, 159)")
    const box = await dialogClose.boundingBox()
    if (!box) throw new Error("Dialog close button has no layout box")
    await page.mouse.click(box.x - 1, box.y + box.height / 2)
    await expect(dialog).toHaveCount(0)
  })
}

async function expectTarget(control: Locator) {
  await expect(control).toBeVisible()
  await expect
    .poll(() => hitPoints(control), { message: "all points inside the minimum 24×24px target belong to this control" })
    .toEqual(Array.from({ length: 9 }, () => true))
}

function hitPoints(control: Locator) {
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect()
    // Probe the browser's actual hit test, including pseudo-elements, clipping and siblings.
    return [-11.9, 0, 11.9].flatMap((x) =>
      [-11.9, 0, 11.9].map((y) => {
        const hit = document.elementFromPoint(box.x + box.width / 2 + x, box.y + box.height / 2 + y)
        return hit === element || (hit !== null && element.contains(hit))
      }),
    )
  })
}

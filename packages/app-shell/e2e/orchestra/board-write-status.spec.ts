import path from "node:path"
import { expect, test } from "@playwright/test"
import { boardChromiumRequired } from "../../test-browser/board-chromium-required"

test(boardChromiumRequired.notice.title, async ({
  page,
}) => {
  await page.route("**/__board_write_status", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html lang="en"><head><title>Operation notice regression</title></head><body style="margin:0"><main id="fixture"></main></body></html>',
    }),
  )
  for (const scheme of ["dark", "light"]) {
    for (const width of [640, 1280]) {
      for (const full of [false, true]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto("/__board_write_status")
        await page.evaluate(
          async ({ url, scheme, full }) => {
            document.documentElement.dataset.colorScheme = scheme
            const fixture = await import(/* @vite-ignore */ url)
            fixture.mount(document.getElementById("fixture"), full)
          },
          {
            url: `/@fs${path.resolve(import.meta.dirname, "../../test-browser/board-write-status.fixture.tsx")}`,
            scheme,
            full,
          },
        )
        const alert = page.getByRole("alert")
        // Container-query containment is not a portable fixed-position containing-block guarantee.
        await expect(page.locator(".board-root")).toHaveCSS("contain", "layout")
        await expect(alert).toContainText("DEMO-3 · Which provider?")
        const dismiss = alert.getByRole("button")
        // Visible text alone does not establish a usable button: calibrate against an actual overlapping scrim.
        const issue = page.getByRole(full ? "region" : "dialog", { name: "DEMO-3", exact: true })
        await expect(issue).toBeVisible()
        const draft = page.getByLabel("Unsent issue note")
        await draft.fill("Keep this draft")
        await expect(draft).toHaveValue("Keep this draft")
        if (full) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
          await expect.poll(() => page.evaluate(() => window.scrollY / window.innerHeight)).toBeGreaterThan(1)
        }
        await expect(dismiss).toBeInViewport()
        await expect(dismiss).toHaveCSS("min-block-size", "32px")
        expect(
          await dismiss.evaluate((button) => {
            const box = button.getBoundingClientRect()
            return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
          }),
        ).toBe(true)
        await expect(dismiss).toHaveAccessibleName("Dismiss operation error")
        await dismiss.click()
        await expect(alert).toHaveCount(0)
        await expect(issue).toBeVisible()
        await expect(draft).toHaveValue("Keep this draft")
        await expect(page.locator("#fixture")).toHaveAttribute("data-scrim", "untouched")
        // A late refusal must announce itself without pulling focus out of an unsent draft.
        for (const key of ["Enter", "Space", "Escape"]) {
          await draft.focus()
          await expect(draft).toBeFocused()
          await page.locator("#fixture").dispatchEvent("fixture:failure")
          await expect(alert).toContainText("DEMO-3 · Which provider?")
          await expect(draft).toBeFocused()
          await page.keyboard.press("Tab")
          await expect(dismiss).toBeFocused()
          await page.keyboard.press(key)
          await expect(alert).toHaveCount(0)
          await expect(draft).toBeFocused()
          await expect(draft).toHaveValue("Keep this draft")
          await expect(issue).toBeVisible()
          await expect(page.locator("#fixture")).toHaveAttribute("data-scrim", "untouched")
          await expect(page.locator("#fixture")).toHaveAttribute("data-escape", "untouched")
        }
        if (!full) {
          const expand = issue.getByRole("button", { name: "Open full page", exact: true })
          await expect(expand).toBeInViewport()
          expect(await expand.evaluate((button) => {
            const box = button.getBoundingClientRect()
            return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
          })).toBe(true)
          await expand.click()
          await expect(page.getByRole("region", { name: "DEMO-3", exact: true })).toBeVisible()
          await expect(draft).toHaveValue("Keep this draft")
        }
        // Positive control: Escape from issue content really reaches the modeled parent and closes it.
        // Thus the notice's earlier Escape assertion is not satisfied by a parent with no keyboard behavior.
        await draft.focus()
        await page.keyboard.press("Escape")
        await expect(page.getByRole("region", { name: "DEMO-3", exact: true })).toHaveCount(0)
        await expect(page.locator("#fixture")).toHaveAttribute("data-escape", "received")
      }
    }
  }
})

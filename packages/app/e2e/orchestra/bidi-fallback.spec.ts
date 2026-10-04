import { expect, test } from "@playwright/test"
import { expectLeading, expectStartAligned, expectTrailing, glyphs } from "./bidi"
import { evidencePage, runCard } from "./evidence.fixture"

test.setTimeout(120_000)

// Orchestra copy has no Arabic translation, so the Arabic locale renders it in English
// inside an RTL document. Each case reads where the browser actually painted the glyphs.
for (const scenario of [
  { locale: "en", direction: "ltr" },
  { locale: "ar", direction: "rtl" },
] as const) {
  test(`${scenario.locale} ${scenario.direction}: English fallback copy keeps its punctuation and the shell alignment`, async ({
    page,
  }) => {
    await evidencePage(page, { locale: scenario.locale, scheme: "light" })
    await expect(page.locator("html")).toHaveAttribute("dir", scenario.direction)
    await page.evaluate(() => document.fonts.ready)

    const caption = page.locator('[data-slot="orchestra-titlebar-caption"]')
    await expect(caption).toHaveText("OpenCode, evolved.")
    expectTrailing(await glyphs(caption), "OpenCode, evolved.".length - 1)

    const sidebar = page.locator('[data-component="orchestra-sidebar"]')
    const env = sidebar.getByRole("button", { name: ".env", exact: true })
    expectLeading(await glyphs(env.locator(".orchestra-nav-label")))

    const footer = sidebar.locator(".orchestra-sidebar-footer")
    await expect(footer).toHaveText("Build what matters.\nWith agents.")
    const lines = await glyphs(footer)
    expectTrailing(lines, "Build what matters".length)
    expectTrailing(lines, "Build what matters.\nWith agents".length)
    await expectStartAligned(footer, scenario.direction)

    await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const question = dialog.getByRole("heading", { name: "Run this command again?", exact: true })
    expectTrailing(await glyphs(question), "Run this command again".length)
    const description = dialog.locator('[data-slot="dialog-description"]')
    const body = await description.textContent()
    expectTrailing(await glyphs(description), body!.length - 1)
    await expectStartAligned(description, scenario.direction)
    await page.screenshot({ path: test.info().outputPath(`bidi-fallback-${scenario.locale}.png`) })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)

    // Icon-only navigation names the control in a tooltip that carries the same copy.
    await sidebar.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
    await expect(sidebar).toHaveCSS("width", "56px")
    await env.focus()
    const tooltip = page.getByRole("tooltip", { name: ".env", exact: true })
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toHaveCSS("direction", scenario.direction)
    expectLeading(await glyphs(tooltip))

    if (scenario.direction === "ltr") return
    // Real Arabic in a slot keeps the RTL base direction, with embedded Latin and digits in order.
    const mixed = "مشروع Compact navigation 42 — واجهة."
    await caption.evaluate((element, text) => {
      element.textContent = text
    }, mixed)
    const arabic = await glyphs(caption)
    expect(arabic.at(-1)!.right).toBeLessThanOrEqual(arabic.at(-2)!.left + 0.5)
    expect(arabic[0]!.right).toBeGreaterThanOrEqual(Math.max(...arabic.map((box) => box.right)) - 0.5)
    expect(arabic[mixed.indexOf("C")]!.left).toBeLessThan(arabic[mixed.indexOf("o")]!.left)
    expect(arabic[mixed.indexOf("4")]!.left).toBeLessThan(arabic[mixed.indexOf("2")]!.left)
  })
}

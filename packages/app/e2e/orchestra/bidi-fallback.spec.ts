import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { expectSessionTitle } from "../utils/waits"
import { expectInOrder, expectStartAligned, expectTrailing, glyphs } from "./bidi"
import { setupCompactNavigation } from "./compact-navigation.fixture"
import { evidencePage, runCard } from "./evidence.fixture"
import { dockCard, pane, parentID, parentTitle, server, setupCockpit } from "./session-cockpit.fixture"

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })
test.setTimeout(120_000)

// Orchestra copy has no Arabic translation, so the Arabic locale renders it in English
// inside an RTL document. Each case reads where the browser actually painted the glyphs.
const scenarios = [
  { locale: "en", direction: "ltr", review: "Toggle review" },
  // Existing Arabic dictionary copy for the review toggle.
  { locale: "ar", direction: "rtl", review: "تبديل المراجعة" },
] as const

for (const scenario of scenarios) {
  test(`${scenario.locale} ${scenario.direction}: English fallback copy keeps its punctuation and the shell alignment`, async ({
    page,
  }) => {
    await evidencePage(page, { locale: scenario.locale, scheme: "light" })
    await expect(page.locator("html")).toHaveAttribute("dir", scenario.direction)
    await page.evaluate(() => document.fonts.ready)

    const caption = page.locator('[data-slot="orchestra-titlebar-caption"]')
    await expect(caption).toHaveText("OpenCode, evolved.")
    expectTrailing(await glyphs(caption), "OpenCode, evolved.")

    const sidebar = page.locator('[data-component="orchestra-sidebar"]')
    const env = sidebar.getByRole("button", { name: ".env", exact: true })
    expectInOrder(await glyphs(env.locator(".orchestra-nav-label")), 0, 1)

    const footer = sidebar.locator(".orchestra-sidebar-footer")
    await expect(footer).toHaveText("Build what matters.\nWith agents.")
    const lines = await glyphs(footer)
    expectTrailing(lines, "Build what matters.")
    expectTrailing(lines, "Build what matters.\nWith agents.")
    await expectStartAligned(footer, scenario.direction)

    await runCard(page).getByRole("button", { name: "Run tests again…", exact: true }).click()
    const dialog = page.getByRole("dialog")
    const question = dialog.getByRole("heading", { name: "Run this command again?", exact: true })
    expectTrailing(await glyphs(question), "Run this command again?")
    const description = dialog.locator('[data-slot="dialog-description"]')
    expectTrailing(await glyphs(description), (await description.textContent())!)
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
    expectInOrder(await glyphs(tooltip), 0, 1)

    if (scenario.direction === "ltr") return
    // Real Arabic in a slot keeps the RTL base direction, with embedded Latin and digits in order.
    const mixed = "مشروع Compact navigation 42 — واجهة."
    await caption.evaluate((element, text) => {
      element.textContent = text
    }, mixed)
    const arabic = await glyphs(caption)
    expect(arabic.at(-1)!.right).toBeLessThanOrEqual(arabic.at(-2)!.left + 0.5)
    expect(arabic[0]!.right).toBeGreaterThanOrEqual(Math.max(...arabic.map((box) => box.right)) - 0.5)
    expectInOrder(arabic, mixed.indexOf("C"), mixed.indexOf("o"))
    expectInOrder(arabic, mixed.indexOf("4"), mixed.indexOf("2"))
  })

  test(`${scenario.locale} ${scenario.direction}: cockpit counts and task lines keep English order`, async ({
    page,
  }) => {
    await setupCockpit(page, { bridge: true, many: true, locale: scenario.locale })
    await openSession(page, scenario.review)
    const dock = dockCard(page)
    await expect(dock).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("dir", scenario.direction)
    const browsing = "No tabs open. Enter an address to start browsing."
    await expect(dock.getByRole("status")).toHaveText(browsing)
    expectTrailing(await glyphs(dock.getByRole("status")), browsing)
    await expectStartAligned(dock.getByRole("status"), scenario.direction)

    const tasks = page.locator('[data-component="tasks-panel"][data-variant="summary"]')
    const count = tasks.locator('[data-slot="tasks-count"]')
    await expect(count).toHaveText("65 tasks")
    // The count leads the English run: both digits paint before the word.
    expectInOrder(await glyphs(count), 0, 1, 3)
    for (const card of [tasks, page.getByRole("region", { name: "Activity" })]) {
      const all = card.getByRole("button", { name: /^View all \(\d+\)$/ })
      expectTrailing(await glyphs(all), (await all.textContent())!)
    }
    // A task line reads kind, state, time: its kind word paints before the elapsed time.
    const meta = tasks.locator('[data-slot="task-meta"]').first()
    const time = (await meta.locator('[data-slot="task-time"]').boundingBox())!
    expect((await glyphs(meta))[0]!.right).toBeLessThanOrEqual(time.x + 0.5)
    await page.screenshot({ path: test.info().outputPath(`bidi-cockpit-${scenario.locale}.png`) })
  })

  test(`${scenario.locale} ${scenario.direction}: empty Dock and Activity states keep English sentences in order`, async ({
    page,
  }) => {
    await setupCockpit(page, { bridge: false, empty: true, locale: scenario.locale })
    await openSession(page, scenario.review)
    await page
      .locator('[data-slot="session-side-panel-tab-bar"]')
      .getByRole("tab", { name: "Apps", exact: true })
      .click()
    const dock = dockCard(page)
    const unavailable =
      "The embedded browser requires the desktop app. Files, docs and terminal remain available when supported."
    expectTrailing(await glyphs(dock.getByText(unavailable, { exact: true })), unavailable)

    const events = "Events appear here as they arrive from their sources."
    const activity = page.getByRole("region", { name: "Activity" })
    expectTrailing(await glyphs(activity.getByText(events, { exact: true })), events)

    await pane(dock, "Files").click()
    const files = "This workspace has no files to show."
    await expect(dock.getByRole("status")).toHaveText(files)
    expectTrailing(await glyphs(dock.getByRole("status")), files)
  })

  test(`${scenario.locale} ${scenario.direction}: a chapter page keeps English headings and sentences in order`, async ({
    page,
  }) => {
    await setupCompactNavigation(page, { locale: scenario.locale, scheme: "light" })
    await page.goto("/")
    await page.locator('[data-slot="orchestra-profile"]').click()
    await page.getByRole("menuitemradio", { name: "Compact project", exact: true }).click()
    await page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: ".env", exact: true })
      .click()
    const env = page.locator('[data-component="env-page"]')
    await expect(env).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("dir", scenario.direction)

    const title = env.getByRole("heading", { name: ".env", level: 1 })
    expectInOrder(await glyphs(title), 0, 1)
    await expectStartAligned(title, scenario.direction)
    const crumb = page.locator('[data-slot="orchestra-titlebar-breadcrumb"] > span').last()
    await expect(crumb).toHaveText(".env")
    expectInOrder(await glyphs(crumb), 0, 1)

    const description = "Open, edit, and download your environment keys."
    const intro = env.getByText(description, { exact: true })
    expectTrailing(await glyphs(intro), description)
    await expectStartAligned(intro, scenario.direction)
    const empty = "Open a local file or add your first key."
    expectTrailing(await glyphs(env.getByText(empty, { exact: true })), empty)
    await page.screenshot({ path: test.info().outputPath(`bidi-chapter-${scenario.locale}.png`) })
  })
}

async function openSession(page: Page, review: string) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
  await page.getByRole("button", { name: review }).click()
}

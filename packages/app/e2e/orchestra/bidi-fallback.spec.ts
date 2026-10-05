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
// A user value that starts in Arabic and embeds Latin and digits.
const project = "مشروع Compact navigation 42 — واجهة"

for (const scenario of scenarios) {
  test(`${scenario.locale} ${scenario.direction}: English fallback copy keeps its punctuation and the shell alignment`, async ({
    page,
  }) => {
    await evidencePage(page, { locale: scenario.locale, scheme: "light", title: project })
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
    // The session title stays whole on the inline-start side of its server, reading right to left.
    const session = dialog.locator("dd").filter({ hasText: project })
    const facts = (await session.textContent())!
    const boxes = await glyphs(session)
    const dot = facts.indexOf(" · ") + 1
    const title = Array.from({ length: project.length }, (_, index) => index)
    const server = Array.from({ length: facts.length - dot - 2 }, (_, index) => dot + 2 + index)
    for (const index of scenario.direction === "rtl" ? server : title) expectInOrder(boxes, index, dot)
    for (const index of scenario.direction === "rtl" ? title : server) expectInOrder(boxes, dot, index)
    expectInOrder(boxes, project.length - 1, 0)
    expectInOrder(boxes, ...server)
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
    const mixed = `${project}.`
    await caption.evaluate((element, text) => {
      element.textContent = text
    }, mixed)
    const arabic = await glyphs(caption)
    expectInOrder(arabic, mixed.length - 1, mixed.length - 2)
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

    const tasks = page.locator('[data-component="tasks-panel"][data-variant="summary"]')
    const count = tasks.locator('[data-slot="tasks-count"]')
    await expect(count).toHaveText("65 tasks")
    // The count leads the English run: both digits paint before the word.
    expectInOrder(await glyphs(count), 0, 1, 3)
    // A regression guard, not proof of the fix: the Unicode bracket-pair rule (N0) already keeps
    // "(N)" with the English run before it, so this passes with or without the plaintext rule.
    for (const card of [tasks, page.getByRole("region", { name: "Activity" })]) {
      const all = card.getByRole("button", { name: /^View all \(\d+\)$/ })
      expectTrailing(await glyphs(all), (await all.textContent())!)
    }
    // A task line reads kind, state, time: its kind word paints before the elapsed time.
    const meta = tasks.locator('[data-slot="task-meta"]').first()
    const elapsed = (await meta.locator('[data-slot="task-time"]').textContent())!
    expectInOrder(await glyphs(meta), 0, (await meta.textContent())!.indexOf(elapsed))
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
    const body = page.getByRole("region", { name: "Activity" }).getByText(events, { exact: true })
    expectTrailing(await glyphs(body), events)
    // The empty state stretches the sentence across the card, so its line shows the alignment.
    await expectStartAligned(body, scenario.direction)

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

    // The page frame (title, description) wraps the env body; dialogs portal outside both.
    const screen = page.locator('[data-mx-page="orchestra-env"]')
    const title = screen.getByRole("heading", { name: ".env", level: 1 })
    expectInOrder(await glyphs(title), 0, 1)
    await expectStartAligned(title, scenario.direction)
    const crumb = page.locator('[data-slot="orchestra-titlebar-breadcrumb"] > span').last()
    await expect(crumb).toHaveText(".env")
    expectInOrder(await glyphs(crumb), 0, 1)

    const description = "Your project's environment keys. Open, edit, and download a .env file."
    const intro = screen.getByText(description, { exact: true })
    expectTrailing(await glyphs(intro), description)
    await expectStartAligned(intro, scenario.direction)
    // The empty state is two sentences separated by a line break, each ending in its own period.
    const empty = "No environment keys yet."
    const hint = "Open a .env file or add a key to start from an empty list."
    await expect(env.locator(".mx-empty")).toHaveText(empty + hint)
    const lines = await glyphs(env.locator(".mx-empty"))
    expectTrailing(lines, empty)
    expectTrailing(lines, empty + hint)

    // A file name reads left to right whatever its first letter: the Arabic name (itself right to
    // left, so its last letter paints first), then ".env". View file titles the preview with it.
    const name = `${project.split(" ")[0]}.env`
    await page
      .getByLabel("Open .env", { exact: true })
      .setInputFiles({ name, mimeType: "text/plain", buffer: Buffer.from("KEY=value\n") })
    await expect(env.locator('[data-env-key="KEY"]')).toBeVisible()
    await env.getByRole("button", { name: "View file", exact: true }).click()
    const filename = page.getByRole("dialog").getByRole("heading", { level: 2 }).locator("bdi")
    await expect(filename).toHaveText(name)
    const extension = name.indexOf(".")
    expectInOrder(await glyphs(filename), extension - 1, 0, extension, extension + 1, extension + 2, extension + 3)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)

    // The portaled confirmation keeps its English sentences in order, ending punctuation last.
    await env.locator('[data-env-key="KEY"]').getByRole("button", { name: "Remove", exact: true }).click()
    const confirm = page.getByRole("dialog")
    const removal = "The key is removed from this draft. Download to save the file."
    const subtitle = confirm.locator(".mx-dialog-head p")
    await expect(subtitle).toHaveText(removal)
    expectTrailing(await glyphs(subtitle), removal)
    await expectStartAligned(subtitle, scenario.direction)
    // The profile name is isolated (FSI…PDI), so the period follows its last letter.
    const note = `This changes the .env draft for \u2068Compact project\u2069.`
    await expect(confirm.locator(".mx-note")).toHaveText(note)
    expectInOrder(await glyphs(confirm.locator(".mx-note")), 0, 1, note.length - 3, note.length - 1)
    await page.screenshot({ path: test.info().outputPath(`bidi-chapter-${scenario.locale}.png`) })
  })
}

async function openSession(page: Page, review: string) {
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`, { waitUntil: "domcontentloaded" })
  await expectSessionTitle(page, parentTitle)
  await page.getByRole("button", { name: review }).click()
}

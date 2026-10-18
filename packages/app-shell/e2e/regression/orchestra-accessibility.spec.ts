import { writeFile } from "node:fs/promises"
import { base64Encode } from "@orchestra/core/util/encode"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { setupCompactNavigation } from "../orchestra/compact-navigation.fixture"
import { editor, evidencePage, runCard } from "../orchestra/evidence.fixture"
import {
  build,
  config,
  directory,
  governedMessages,
  maestro,
  sessionID,
  setupGovernance,
  title,
} from "../orchestra/governance.fixture"
import { dockCard, openCockpit, pane, railTab, setupCockpit } from "../orchestra/session-cockpit.fixture"
import {
  auditAccessibility,
  expectTabOrder,
  measureContrast,
  motionInventory,
  type ContrastResult,
  type ContrastTarget,
} from "../utils/a11y"
import { expectSessionTitle } from "../utils/waits"

test.use({ viewport: { width: 1672, height: 941 }, serviceWorkers: "block" })
test.setTimeout(120_000)

const sidebar = '[data-component="orchestra-sidebar"]'
const profileMenu = '[data-component="orchestra-profile-picker"]'
const home = '[data-component="orchestra-home"]'
const chapter = '[data-component="orchestra-chapter"]'
const cockpit = ".orchestra-cockpit"
const dialog = '[role="dialog"]'
const evidence = "[data-orchestra-evidence]"

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: sidebar and profile menu are named, keyboard-ordered, return focus and meet contrast`, async ({
    page,
  }) => {
    await setupCompactNavigation(page, { scheme, selected: true })
    await page.goto("/")
    const nav = page.locator(sidebar)
    await expect(nav).toHaveCSS("width", "230px")
    await expect(nav.getByRole("button", { name: "Chat", exact: true })).toBeEnabled()
    // The mock server lists only Orchestra's native maestro agent.
    await expect(nav.locator(".orchestra-profile-text small")).toHaveText("1 agent · main")
    await expect(page.locator(home)).toHaveText(/\w/)
    expect(await auditAccessibility(page, [sidebar])).toEqual([])
    await expectTabOrder(page, [sidebar], { trap: false })
    const results = await measureContrast(page, [...sidebarText, { name: "Home text", selector: home }])
    await nav.getByRole("button", { name: "MCP", exact: true }).focus()
    results.push(...(await measureContrast(page, [ring("nav focus ring", `${sidebar} .orchestra-nav-button`)])))
    await nav.getByRole("button", { name: "Home", exact: true }).focus()
    results.push(
      ...(await measureContrast(page, [ring("current-page focus ring", `${sidebar} .orchestra-nav-button`)])),
    )

    const profile = nav.getByRole("button", { name: "Choose repository profile", exact: true })
    const menu = page.locator(profileMenu)
    const project = page.getByRole("menuitemradio", { name: "Compact project", exact: true })
    await profile.focus()
    results.push(...(await measureContrast(page, [ring("profile focus ring", `${sidebar} .orchestra-profile`)])))
    await page.keyboard.press("Enter")
    await expect(project).toBeFocused()
    expect(await auditAccessibility(page, [sidebar, profileMenu])).toEqual([])
    results.push(...(await measureContrast(page, menuText)))
    results.push(...(await measureContrast(page, [ring("menu item focus ring", `${profileMenu} [role^="menuitem"]`)])))
    // Menus rove with arrows; every item is reachable from the first.
    await page.keyboard.press("ArrowDown")
    await expect(menu.getByRole("menuitem", { name: "Add project", exact: true })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(project).toBeFocused()
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(profile).toBeFocused()
    await profile.click()
    await expect(project).toBeVisible()
    await profile.click()
    await expect(menu).toHaveCount(0)
    await expect(profile).toBeFocused()

    await nav.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
    await expect(nav).toHaveCSS("width", "56px")
    expect(await auditAccessibility(page, [sidebar])).toEqual([])
    await expectTabOrder(page, [sidebar], { trap: false })
    await nav.getByRole("button", { name: "MCP", exact: true }).focus()
    results.push(
      ...(await measureContrast(page, [
        ring("compact nav focus ring", `${sidebar} .orchestra-nav-button`),
        {
          name: "compact nav icon",
          selector: `${sidebar} .orchestra-nav-button:not(:disabled) .orchestra-nav-icon`,
          kind: "graphic",
        },
        { name: "compact toggle icon", selector: `${sidebar} .orchestra-navigation-toggle-icon`, kind: "graphic" },
      ])),
    )
    // Chapter text sits on the same glass over the photograph, which darkens toward the panel's foot.
    await nav.getByRole("button", { name: ".env", exact: true }).click()
    await expect(page.getByRole("heading", { name: ".env", level: 1 })).toBeVisible()
    results.push(...(await measureContrast(page, [{ name: "chapter text", selector: chapter }])))
    await nav.getByRole("button", { name: "MCP", exact: true }).click()
    await expect(page.locator('[data-slot="orchestra-wip"]')).toBeVisible()
    results.push(...(await measureContrast(page, [{ name: "page WIP mark", selector: '[data-slot="orchestra-wip"]' }])))
    await report(results, `sidebar-${scheme}`)
  })
}

test("Arabic RTL: sidebar keyboard order and profile focus return", async ({ page }) => {
  await setupCompactNavigation(page, { locale: "ar" })
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  const nav = page.locator(sidebar)
  await expect(nav.getByRole("button", { name: "Chat", exact: true })).toBeEnabled()
  await expectTabOrder(page, [sidebar], { trap: false })
  const profile = nav.getByRole("button", { name: "Choose repository profile", exact: true })
  const menu = page.locator(profileMenu)
  await profile.focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("menuitemradio", { name: "Compact project", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect(profile).toBeFocused()
  await profile.click()
  await expect(menu).toBeVisible()
  await profile.click()
  await expect(menu).toHaveCount(0)
  await expect(profile).toBeFocused()
  await nav.locator(".orchestra-navigation-toggle").click()
  await expect(nav).toHaveCSS("width", "56px")
  await expectTabOrder(page, [sidebar], { trap: false })
})

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: cockpit Dock, Tasks and Activity are named, keyboard-reachable and meet contrast`, async ({
    page,
  }) => {
    await setupCockpit(page, { bridge: true, many: true, scheme })
    await openCockpit(page)
    const dock = dockCard(page)
    await expect(dock.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
    expect(await auditAccessibility(page, [cockpit])).toEqual([])
    await expectTabOrder(page, [cockpit], { trap: false })
    // Only the selected pane is a tab stop; the others are reached by arrow keys.
    await pane(dock, "Browser").focus()
    for (const name of ["Files", "Docs", "Terminal", "Browser"]) {
      await page.keyboard.press("ArrowRight")
      await expect(pane(dock, name)).toBeFocused()
      await expect(pane(dock, name)).toHaveAttribute("aria-selected", "true")
    }
    const results = await measureContrast(page, dockText)
    results.push(...(await measureContrast(page, [ring("Dock tab focus ring", `${cockpit} [role="tab"]`)])))

    // Tasks and Activity live in the Tasks tab; the same container class names both rail panels.
    await railTab(page, "tasks").click()
    await expect(dockCard(page)).toHaveCount(0)
    expect(await auditAccessibility(page, [cockpit])).toEqual([])
    await expectTabOrder(page, [cockpit], { trap: false })
    results.push(...(await measureContrast(page, feedText)))

    // Controls are operated from the keyboard so the rows measured next show their focus ring.
    const tasks = page.locator('[data-component="tasks-panel"]')
    await tasks.getByRole("button", { name: "View all (66)" }).press("Enter")
    const running = tasks.getByRole("list", { name: "Running", exact: true })
    await expect(running.locator('[aria-setsize="65"]')).not.toHaveCount(0)
    expect(await auditAccessibility(page, [cockpit])).toEqual([])
    await running.locator('[aria-posinset="1"] [data-slot="task-row"]').focus()
    results.push(...(await measureContrast(page, [ring("task row focus ring", `${cockpit} [data-slot="task-row"]`)])))
    // The virtualized walk does not depend on the color scheme; it runs once.
    if (scheme === "dark") await expectArrowRoving(page, running, 65)
    if (scheme === "dark") await expectHeldArrow(page, running, 25)
    if (scheme === "dark") await expectBoundedWindow(page, running, 65)
    if (scheme === "dark") await expectControlRestored(page, running, 65)
    if (scheme === "dark") await expectNoFocusSteal(page, running, 65, tasks.locator('[data-slot="tasks-title"]'))
    results.push(...(await measureContrast(page, expandedText)))
    await tasks.getByRole("button", { name: "Show less" }).press("Enter")

    const activity = page.getByRole("region", { name: "Activity" })
    await activity.getByRole("button", { name: "Agents", exact: true }).press("Enter")
    await activity.getByRole("button", { name: "View all (66)" }).press("Enter")
    const agents = activity.getByRole("list", { name: "Activity", exact: true })
    await expect(agents.locator('[aria-setsize="66"]')).not.toHaveCount(0)
    expect(await auditAccessibility(page, [cockpit])).toEqual([])
    await agents.locator('[aria-posinset="1"] button').focus()
    results.push(
      ...(await measureContrast(page, [ring("activity row focus ring", `${cockpit} [data-slot="activity-row"]`)])),
    )
    if (scheme === "dark") await expectArrowRoving(page, agents, 66)
    await report(results, `cockpit-${scheme}`)
  })
}

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: Maestro governance dialog traps focus, returns it and meets contrast`, async ({ page }) => {
    await setupGovernance(page, { scheme, agents: [build, maestro], config, messages: governedMessages() })
    await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
    await expectSessionTitle(page, title)
    const entry = page.locator(sidebar).getByRole("button", { name: "Maestro", exact: true })
    const governance = page.getByRole("dialog", { name: "Maestro governance" })
    await entry.focus()
    await page.keyboard.press("Enter")
    await expect(governance.locator('[data-kind="presentation"]')).toContainText("apr_1")
    await expect.poll(() => governance.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    expect(await auditAccessibility(page, [dialog])).toEqual([])
    await expectTabOrder(page, [dialog], { trap: true })
    const results = await measureContrast(page, governanceText)
    await governance.getByRole("button", { name: "Close", exact: true }).focus()
    results.push(
      ...(await measureContrast(page, [
        ring("close button focus ring", `${dialog} [data-slot="dialog-close-button"]`),
      ])),
    )
    await governance.getByRole("button", { name: "Show in chat Validation record", exact: true }).focus()
    results.push(
      ...(await measureContrast(page, [
        ring("record action focus ring", `${dialog} .orchestra-governance-side [data-component="button-v2"]`),
      ])),
    )
    await page.keyboard.press("Escape")
    await expect(governance).toHaveCount(0)
    await expect(entry).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(governance).toBeVisible()
    await governance.getByRole("button", { name: "Close", exact: true }).press("Enter")
    await expect(governance).toHaveCount(0)
    await expect(entry).toBeFocused()
    await report(results, `governance-${scheme}`)
  })
}

test("Arabic RTL: governance focus trap and return", async ({ page }) => {
  await setupGovernance(page, {
    locale: "ar",
    agents: [build, maestro],
    config,
    messages: governedMessages(),
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  const entry = page.locator(sidebar).getByRole("button", { name: "Maestro", exact: true })
  const governance = page.getByRole("dialog", { name: "Maestro governance" })
  await entry.focus()
  await page.keyboard.press("Enter")
  await expect(governance.locator('[data-kind="presentation"]')).toContainText("apr_1")
  await expectTabOrder(page, [dialog], { trap: true })
  await page.keyboard.press("Escape")
  await expect(governance).toHaveCount(0)
  await expect(entry).toBeFocused()
  await page.keyboard.press("Enter")
  // Existing Arabic dictionary copy for the shared close control.
  await governance.getByRole("button", { name: "إغلاق", exact: true }).press("Enter")
  await expect(governance).toHaveCount(0)
  await expect(entry).toBeFocused()
})

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: evidence card and its replay and prepare-PR dialogs return focus and meet contrast`, async ({
    page,
  }) => {
    await evidencePage(page, { scheme })
    const card = runCard(page)
    expect(await auditAccessibility(page, [evidence])).toEqual([])
    await expectTabOrder(page, [evidence], { trap: false })
    const result = card.getByRole("tab", { name: "Test results", exact: true })
    await result.focus()
    await page.keyboard.press("ArrowRight")
    await expect(card.getByRole("tab", { name: "Output", exact: true })).toBeFocused()
    await page.keyboard.press("ArrowLeft")
    await expect(result).toBeFocused()
    await expect(result).toHaveAttribute("aria-selected", "true")
    const results = await measureContrast(page, evidenceText)
    results.push(...(await measureContrast(page, [ring("evidence tab focus ring", `${evidence} [role="tab"]`)])))
    const replay = card.getByRole("button", { name: "Run tests again…", exact: true })
    await replay.focus()
    results.push(
      ...(await measureContrast(page, [
        ring("evidence action focus ring", `${evidence} [data-slot="evidence-actions"] button`),
      ])),
    )
    results.push(...(await expectDialogReturn(page, replay, ["Close", "Cancel"], true)))
    await editor(page).fill("Keep this draft")
    const prepare = card.getByRole("button", { name: "Prepare pull request…", exact: true })
    await expectDialogReturn(page, prepare, ["Cancel"], false)
    await prepare.focus()
    await page.keyboard.press("Enter")
    // Closing schedules focus restoration for the next frame, and the dialog leaves the DOM at once, so no
    // element marks the moment it has run. A frame callback queued after the confirm's click handlers runs
    // after that restoration and reports where focus settled.
    const settled = page.evaluate(
      () =>
        new Promise<string | null | undefined>((resolve) =>
          document.addEventListener(
            "click",
            () => requestAnimationFrame(() => resolve(document.activeElement?.getAttribute("data-component"))),
            { once: true },
          ),
        ),
    )
    await page.getByRole("dialog").getByRole("button", { name: "Add to draft", exact: true }).press("Enter")
    await expect(editor(page)).toContainText("Prepare a pull request")
    expect(await settled, "Add to draft leaves focus in the composer").toBe("prompt-input")
    await expect(editor(page)).toBeFocused()
    await report(results, `evidence-${scheme}`)
  })
}

test("Arabic RTL: evidence card keyboard order and dialog focus return", async ({ page }) => {
  await evidencePage(page, { locale: "ar" })
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl")
  await expectTabOrder(page, [evidence], { trap: false })
  const card = runCard(page)
  // Existing Arabic dictionary copy for the shared close and cancel controls.
  await expectDialogReturn(
    page,
    card.getByRole("button", { name: "Run tests again…", exact: true }),
    ["إغلاق", "إلغاء"],
    false,
  )
  await editor(page).fill("Keep this draft")
  await expectDialogReturn(
    page,
    card.getByRole("button", { name: "Prepare pull request…", exact: true }),
    ["إلغاء"],
    false,
  )
})

// Dialogs and their overlay have no transition or animation in either mode, so they are not claimed here.
test("reduced motion stills Orchestra transitions and animations", async ({ page }) => {
  await setupCockpit(page, { bridge: false })
  await openCockpit(page)
  // The running task's spinner lives in the Tasks tab; the Dock lives alone in Apps.
  await railTab(page, "tasks").click()
  await expect(railTab(page, "tasks")).toHaveAttribute("aria-selected", "true")
  const scopes = [sidebar, cockpit, "#orchestra-session-tabs"]
  const tooltip = '[data-component="tooltip-v2"]'
  const nav = page.locator(sidebar)
  const moving = (entries: Awaited<ReturnType<typeof motionInventory>>) =>
    entries.filter((entry) => entry.transition > 10 || entry.animation > 10)
  await nav.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
  await expect(nav).toHaveCSS("width", "56px")
  // Positive control: without the preference the same inventory sees the running task's spinner, the
  // session tab transitions and the compact tooltip's entrance.
  const before = await motionInventory(page, scopes)
  expect(before.filter((entry) => entry.animation > 10).length, JSON.stringify(before)).toBeGreaterThan(0)
  expect(before.filter((entry) => entry.transition > 10).length, JSON.stringify(before)).toBeGreaterThan(0)
  await nav.getByRole("button", { name: "MCP", exact: true }).focus()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  expect(moving(await motionInventory(page, [tooltip])).length).toBeGreaterThan(0)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("tooltip")).toHaveCount(0)

  await page.emulateMedia({ reducedMotion: "reduce" })
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true)
  expect(moving(await motionInventory(page, scopes))).toEqual([])
  await railTab(page, "apps").click()
  await expect(dockCard(page)).toBeVisible()
  expect(moving(await motionInventory(page, scopes))).toEqual([])
  await nav.getByRole("button", { name: "Chat", exact: true }).focus()
  await nav.getByRole("button", { name: "MCP", exact: true }).focus()
  await expect(page.getByRole("tooltip", { name: "MCP", exact: true })).toBeVisible()
  expect(moving(await motionInventory(page, [tooltip, sidebar]))).toEqual([])
})

function ring(name: string, selector: string): ContrastTarget {
  return { name, selector: `${selector}:focus-visible`, kind: "ring" }
}

function focusedRow(page: Page) {
  return page.evaluate(() => document.activeElement?.closest("[aria-posinset]")?.getAttribute("aria-posinset"))
}

// Focus the row at aria-posinset 1 first. ArrowDown must reach every entity in order, virtualized or not.
async function expectArrowRoving(page: Page, list: Locator, size: number) {
  const position = () => focusedRow(page)
  expect(await position()).toBe("1")
  for (const row of Array.from({ length: size - 1 }, (_, index) => String(index + 2))) {
    await page.keyboard.press("ArrowDown")
    await expect.poll(position, `ArrowDown reaches row ${row}`).toBe(row)
  }
  await page.keyboard.press("Home")
  await expect.poll(position).toBe("1")
  await page.keyboard.press("End")
  await expect.poll(position).toBe(String(size))
  expect(await list.evaluate((element) => element.contains(document.activeElement))).toBe(true)
}

// A held arrow key repeats faster than frames. Dispatch the repeats within one task, so every keydown lands
// before the list's scroll event, then read focus right after the list handles that scroll.
async function expectHeldArrow(page: Page, list: Locator, count: number) {
  await page.keyboard.press("Home")
  await expect.poll(() => list.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  const held = await list.evaluate(async (element, count) => {
    const position = () => document.activeElement?.closest("[aria-posinset]")?.getAttribute("aria-posinset")
    const scrolled = new Promise((resolve) => element.addEventListener("scroll", resolve, { once: true }))
    const during = []
    for (const _ of Array.from({ length: count })) {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
      await Promise.resolve()
      during.push(position())
    }
    await scrolled
    return { during, scrolled: position() }
  }, count)
  expect(held.during).toEqual(Array.from({ length: count }, (_, index) => String(index + 2)))
  expect(held.scrolled, "focus survives the scroll that follows held arrows").toBe(String(count + 1))
}

// Scrolling away from the focused row, by keyboard paging or by dragging the scrollbar, mounts only the
// window and that row, and focus stays on the row when the window comes back to it.
async function expectBoundedWindow(page: Page, list: Locator, size: number) {
  const position = () => focusedRow(page)
  const rows = list.locator("[data-cockpit-row]")
  await page.keyboard.press("Home")
  await expect.poll(position).toBe("1")
  await page.keyboard.press("ArrowDown")
  await expect.poll(position).toBe("2")
  for (const _ of Array.from({ length: 6 })) await page.keyboard.press("PageDown")
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  // The window holds the rows that can show in the viewport plus three overscan rows on each side. A
  // focused row outside it adds one, or joins it through at most the visible rows plus overscan.
  const bound = await list.evaluate((element) => {
    const heights = [...element.querySelectorAll("[data-cockpit-row]")].map((row) => row.getBoundingClientRect().height)
    const visible = Math.ceil(element.clientHeight / Math.min(...heights)) + 1
    return 2 * visible + 3 * 3
  })
  await expect.poll(() => rows.count(), "rows mounted after paging").toBeLessThanOrEqual(bound)
  const detached = await scrollAwayAndBack(list, size, "2", async () => {
    await expect.poll(() => rows.count(), "rows mounted after dragging to the end").toBeLessThanOrEqual(bound)
  })
  expect(detached, "the reconciler takes the focused row's node on the way back").toBe(true)
  await expect.poll(position, "focus stays on its row").toBe("2")
}

// Focus on a control inside a row (a task's Stop button) comes back to that control, not to the row,
// whose Enter would open the task.
async function expectControlRestored(page: Page, list: Locator, size: number) {
  const control = () =>
    page.evaluate(
      () =>
        `${document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.getAttribute("data-slot")} @ ${document.activeElement?.closest("[aria-posinset]")?.getAttribute("aria-posinset")}`,
    )
  await page.keyboard.press("Home")
  await expect.poll(() => focusedRow(page)).toBe("1")
  await page.keyboard.press("ArrowDown")
  await expect.poll(() => focusedRow(page)).toBe("2")
  await page.keyboard.press("Tab")
  await expect.poll(control).toBe("Stop task @ 2")
  expect(await scrollAwayAndBack(list, size, "2"), "the reconciler takes the focused row's node").toBe(true)
  await expect.poll(control, "focus returns to the same control").toBe("Stop task @ 2")
}

// Clicking text that takes no focus is a deliberate leave: a later reconcile of the list must not pull
// focus back into it.
async function expectNoFocusSteal(page: Page, list: Locator, size: number, outside: Locator) {
  await page.keyboard.press("Shift+Tab")
  await expect.poll(() => focusedRow(page)).toBe("2")
  await outside.click()
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
  await scrollAwayAndBack(list, size, "2")
  await expect(list.locator('[aria-posinset="1"]')).toHaveCount(1)
  expect(
    await list.evaluate((element) => element.contains(document.activeElement)),
    "focus stays where the click left it",
  ).toBe(false)
}

// Scrolls the list to its end, then back to the top, the way a scrollbar drag does. Returns whether the
// reconciler detached the node of the row at `row` before the first row mounted again, the moment focus
// would drop to the page.
async function scrollAwayAndBack(list: Locator, size: number, row: string, atEnd?: () => Promise<void>) {
  // Keyboard navigation scrolls through the virtualizer, which keeps steering back to the navigated row
  // until its position holds; the row's actionability wait for a stable box outlasts that.
  await list.locator(`[aria-posinset="${row}"]`).scrollIntoViewIfNeeded()
  await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(list.locator(`[aria-posinset="${size}"]`)).toHaveCount(1)
  await atEnd?.()
  return list.evaluate(
    (element, row) =>
      new Promise<boolean>((resolve) => {
        const node = element.querySelector(`[aria-posinset="${row}"]`)
        const seen = { taken: false }
        const observer = new MutationObserver((records) => {
          seen.taken =
            seen.taken || records.some((record) => [...record.removedNodes].some((removed) => removed === node))
          if (!element.querySelector('[aria-posinset="1"]')) return
          observer.disconnect()
          resolve(seen.taken)
        })
        observer.observe(element.firstElementChild!, { childList: true })
        element.scrollTo({ top: 0 })
      }),
    row,
  )
}

// Opens the dialog from `trigger` with the keyboard once per closing path (Escape, then each named button)
// and expects focus back on the trigger every time. Returns the dialog's contrast when `measure` is set.
async function expectDialogReturn(page: Page, trigger: Locator, buttons: string[], measure: boolean) {
  const modal = page.getByRole("dialog")
  const results: ContrastResult[] = []
  for (const close of ["Escape", ...buttons]) {
    await trigger.focus()
    await page.keyboard.press("Enter")
    await expect(modal).toBeVisible()
    await expect.poll(() => modal.evaluate((element) => element.contains(document.activeElement))).toBe(true)
    if (close === "Escape") {
      expect(await auditAccessibility(page, [dialog])).toEqual([])
      await expectTabOrder(page, [dialog], { trap: true })
      if (measure) results.push(...(await measureContrast(page, dialogText)))
      await page.keyboard.press("Escape")
    }
    if (close !== "Escape") {
      await modal.getByRole("button", { name: close, exact: true }).focus()
      if (measure)
        results.push(
          ...(await measureContrast(page, [
            ring(
              `dialog ${close} focus ring`,
              `${dialog} :is([data-slot="dialog-close-button"], [data-slot="dialog-footer"] [data-component="button-v2"])`,
            ),
          ])),
        )
      await page.keyboard.press("Enter")
    }
    await expect(modal).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
  return results
}

// Contrast failures caused by approved HuGR palette tokens (theme.css, session.css), recorded for the
// owner instead of recolored here, each with the ratio measured when it was recorded. The test fails if any
// other target fails, if a recorded one starts passing (remove the entry with the token change), and if a
// recorded one measures lower than its baseline beyond sampling noise.
const findings: Record<string, { ratio: number; cause: string }> = {}

async function report(results: ContrastResult[], name: string) {
  await writeFile(test.info().outputPath(`${name}-contrast.json`), JSON.stringify(results, null, 2))
  const failing = results.filter((result) => result.ratio < result.required)
  expect(failing.map((result) => result.name).toSorted()).toEqual(
    Object.keys(findings)
      .filter((key) => key.startsWith(`${name}:`))
      .map((key) => key.slice(name.length + 1))
      .toSorted(),
  )
  for (const result of failing) {
    const finding = findings[`${name}:${result.name}`]
    expect(
      result.ratio,
      `${name}: ${result.name} (${finding.cause}) fell below its recorded ratio`,
    ).toBeGreaterThanOrEqual(finding.ratio - 0.05)
  }
}

const sidebarText: ContrastTarget[] = [
  { name: "brand descriptor", selector: `${sidebar} [data-slot="orchestra-brand-descriptor"]` },
  // Expanded, the collapse control is icon-only in the brand row; its glyph is the visible ink.
  { name: "toggle icon", selector: `${sidebar} .orchestra-navigation-toggle-icon`, kind: "graphic" },
  { name: "nav label", selector: `${sidebar} .orchestra-nav-button:not([aria-current]) .orchestra-nav-label` },
  { name: "current nav label", selector: `${sidebar} .orchestra-nav-button[aria-current="page"] .orchestra-nav-label` },
  {
    name: "nav icon",
    selector: `${sidebar} .orchestra-nav-button:not(:disabled) .orchestra-nav-icon`,
    kind: "graphic",
  },
  { name: "search key", selector: `${sidebar} .orchestra-nav-button kbd` },
  { name: "WIP mark", selector: `${sidebar} [data-slot="orchestra-nav-wip"]` },
  { name: "profile name", selector: `${sidebar} .orchestra-profile-text strong` },
  { name: "profile meta", selector: `${sidebar} .orchestra-profile-text small` },
  { name: "sidebar footer", selector: `${sidebar} .orchestra-sidebar-footer` },
]

const menuText: ContrastTarget[] = [
  { name: "menu group label", selector: `${profileMenu} .orchestra-profile-group` },
  { name: "menu project", selector: `${profileMenu} .orchestra-profile-item-name` },
  { name: "menu add project", selector: `${profileMenu} .orchestra-profile-add` },
]

const dockText: ContrastTarget[] = [
  { name: "Dock title", selector: `${cockpit} .orchestra-dock-header h2` },
  { name: "Dock selected pane", selector: `${cockpit} [role="tab"][aria-selected="true"]` },
  { name: "Dock pane", selector: `${cockpit} .orchestra-dock-tabs [role="tab"][aria-selected="false"]` },
  { name: "Dock status", selector: `${cockpit} .orchestra-dock-pane [role="status"]` },
]

const feedText: ContrastTarget[] = [
  { name: "Tasks title", selector: `${cockpit} [data-slot="tasks-title"]` },
  { name: "Tasks count", selector: `${cockpit} [data-slot="tasks-count"]` },
  { name: "Tasks failures", selector: `${cockpit} [data-slot="tasks-failures"]` },
  { name: "Tasks view all", selector: `${cockpit} [data-slot="tasks-view-all"]` },
  { name: "task title", selector: `${cockpit} [data-slot="task-title"]` },
  { name: "task meta", selector: `${cockpit} [data-slot="task-meta"]` },
  { name: "Activity title", selector: `${cockpit} [data-slot="activity-title"]` },
  { name: "Activity filter", selector: `${cockpit} [data-slot="activity-filter"] button` },
  { name: "Activity kind", selector: `${cockpit} [data-slot="activity-kind"]` },
  { name: "Activity name", selector: `${cockpit} [data-slot="activity-name"]` },
  { name: "Activity meta", selector: `${cockpit} [data-slot="activity-meta"]` },
]

const expandedText: ContrastTarget[] = [
  { name: "task section", selector: `${cockpit} [data-slot="task-section"]` },
  { name: "task stats", selector: `${cockpit} [data-slot="task-stats"]` },
]

const governanceText: ContrastTarget[] = [
  { name: "dialog title", selector: `${dialog} [data-slot="dialog-title"]` },
  { name: "dialog description", selector: `${dialog} [data-slot="dialog-description"]` },
  { name: "fact term", selector: `${dialog} .orchestra-governance-facts dt` },
  { name: "fact value", selector: `${dialog} .orchestra-governance-facts dd` },
  { name: "notice", selector: `${dialog} .orchestra-governance-notice` },
  { name: "section heading", selector: `${dialog} .orchestra-governance-section h3` },
  { name: "approval summary", selector: `${dialog} .orchestra-governance-summary` },
  { name: "note", selector: `${dialog} .orchestra-governance-note` },
  { name: "record kind", selector: `${dialog} .orchestra-governance-kind` },
  { name: "record state", selector: `${dialog} .orchestra-governance-state` },
  { name: "record id", selector: `${dialog} .orchestra-governance-id` },
  { name: "record reason", selector: `${dialog} .orchestra-governance-reason` },
  { name: "record time", selector: `${dialog} .orchestra-governance-time` },
  { name: "record action", selector: `${dialog} .orchestra-governance-side [data-component="button-v2"]` },
  { name: "retained output", selector: `${dialog} .orchestra-governance-output summary` },
]

const evidenceText: ContrastTarget[] = [
  { name: "evidence tab", selector: `${evidence} [role="tab"]` },
  { name: "evidence command", selector: `${evidence} [data-slot="evidence-command"]` },
  { name: "evidence status", selector: `${evidence} [data-slot="evidence-status"]` },
  { name: "evidence output link", selector: `${evidence} [data-slot="evidence-link"]` },
  { name: "evidence rows", selector: `${evidence} [data-slot="evidence-rows"]` },
  { name: "evidence exit line", selector: `${evidence} [data-slot="evidence-line"]` },
  { name: "evidence meta", selector: `${evidence} [data-slot="evidence-meta"]` },
  { name: "evidence actions", selector: `${evidence} [data-slot="evidence-actions"] button` },
]

const dialogText: ContrastTarget[] = [
  { name: "replay title", selector: `${dialog} [data-slot="dialog-title"]` },
  { name: "replay description", selector: `${dialog} [data-slot="dialog-description"]` },
  { name: "replay term", selector: `${dialog} [data-slot="evidence-replay"] dt` },
  { name: "replay value", selector: `${dialog} [data-slot="evidence-replay"] dd` },
  { name: "replay warning", selector: `${dialog} [data-slot="evidence-replay-note"]` },
  { name: "replay buttons", selector: `${dialog} [data-slot="dialog-footer"] [data-component="button-v2"]` },
]

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import { setupCompactNavigation } from "../orchestra/compact-navigation.fixture"
import { evidenceFixture, evidencePage, runCard } from "../orchestra/evidence.fixture"
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
import { setupIdentity } from "../orchestra/identity.fixture"
import { parentID, parentTitle, server, setupCockpit } from "../orchestra/session-cockpit.fixture"
import { expectSessionTitle } from "../utils/waits"

type Viewport = (typeof viewports)[number]
type Rail = keyof typeof contract
type Shot = { scheme: "dark" | "light"; locale: "en" | "ar"; viewports: Viewport[] }

// The identity contract's navigation modes: 230px, 208px at 1280-1439px, a 56px rail, then no rail.
const viewports = [
  { width: 1672, height: 941, rail: "230px" },
  { width: 1366, height: 768, rail: "208px" },
  { width: 1152, height: 720, rail: "56px" },
  { width: 900, height: 700, rail: "hidden" },
] as const

// Recorded beside each measurement so a deviation reads straight from the manifest.
const contract = {
  "230px": { sidebarWidth: 230, toolbarHeight: 45, logo: { width: 121, height: 32 } },
  "208px": { sidebarWidth: 208, toolbarHeight: 45, logo: { width: 121, height: 32 } },
  "56px": { sidebarWidth: 56, toolbarHeight: 45, logo: { width: 32, height: 32 } },
  hidden: { sidebarWidth: null, toolbarHeight: 45, logo: null },
}

const surfaces = {
  home: captureHome,
  session: captureSession,
  cockpit: captureCockpit,
  governance: captureGovernance,
  evidence: captureEvidence,
}

test.use({
  viewport: { width: viewports[0].width, height: viewports[0].height },
  deviceScaleFactor: 1,
  serviceWorkers: "block",
  // Governance prints record times; a fixed zone keeps them identical on every machine.
  timezoneId: "UTC",
})

for (const scheme of ["dark", "light"] as const) {
  for (const locale of ["en", "ar"] as const) {
    for (const [name, run] of Object.entries(surfaces)) {
      test(`${name} ${scheme} ${locale} at 1x`, ({ page }) => run(page, { scheme, locale, viewports: [...viewports] }))
    }
  }
}

test.describe("key shots at 2x", () => {
  test.use({ deviceScaleFactor: 2 })
  for (const shot of [
    { surface: "home", scheme: "dark", locale: "en" },
    { surface: "cockpit", scheme: "dark", locale: "en" },
    { surface: "governance", scheme: "light", locale: "ar" },
    { surface: "evidence", scheme: "light", locale: "en" },
  ] as const) {
    test(`${shot.surface} ${shot.scheme} ${shot.locale} at 2x`, ({ page }) =>
      surfaces[shot.surface](page, { scheme: shot.scheme, locale: shot.locale, viewports: [viewports[0]] }))
  }
})

async function captureHome(page: Page, shot: Shot) {
  await setupCompactNavigation(page, { scheme: shot.scheme, locale: shot.locale })
  await page.goto("/")
  await expectDocument(page, shot)
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    await capture(page, "home", "shell", viewport.rail)
  }
  // The collapse choice persists across widths, so one collapse covers every wide viewport.
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  const tooltip = page.getByRole("tooltip")
  for (const [index, viewport] of shot.viewports.entries()) {
    if (index === 0 && (viewport.rail === "230px" || viewport.rail === "208px")) {
      await resize(page, viewport, viewport.rail)
      await sidebar.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
    }
    await resize(page, viewport, viewport.rail === "hidden" ? "hidden" : "56px")
    if (viewport.rail === "hidden") await openRail(page)
    await sidebar.getByRole("button", { name: "MCP", exact: true }).hover()
    await expect(tooltip).toHaveCount(1)
    await expect(tooltip).toHaveAccessibleName("MCP")
    await capture(page, "sidebar", "collapsed-tooltip", "56px")
    await page.keyboard.press("Escape")
    await expect(tooltip).toHaveCount(0)
    await park(page)
  }
}

async function captureSession(page: Page, shot: Shot) {
  await setupIdentity(page, {
    scheme: shot.scheme,
    locale: shot.locale,
    viewport: { width: shot.viewports[0].width, height: shot.viewports[0].height },
  })
  await expectDocument(page, shot)
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    await capture(page, "session", "timeline", viewport.rail)
  }
  const profile = page.locator('[data-slot="orchestra-profile"]')
  const menu = page.locator('[data-component="orchestra-profile-picker"]')
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    if (viewport.rail === "hidden") await openRail(page)
    await profile.click()
    await expect(profile).toHaveAttribute("aria-expanded", "true")
    await expect(menu).toBeVisible()
    // The rail's hover tooltip would cover the menu and take the first Escape.
    await park(page)
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    await capture(page, "profile-menu", "open", viewport.rail === "hidden" ? "56px" : viewport.rail)
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
  }
}

async function captureCockpit(page: Page, shot: Shot) {
  await setupCockpit(page, { bridge: true, outcomes: true, scheme: shot.scheme, locale: shot.locale })
  // The fixture's tasks started in 2023; a clock a minute later keeps live elapsed times realistic.
  await page.clock.install({ time: 1_700_000_060_000 })
  await page.goto(`/server/${base64Encode(server)}/session/${parentID}`)
  await expectSessionTitle(page, parentTitle)
  await expectDocument(page, shot)
  // Locale-neutral: the review toggle's name is translated.
  await page.locator('button[aria-controls="review-panel"]').click()
  await expect(page.locator(".orchestra-dock-card")).toBeVisible()
  const tasks = page.locator('[data-component="tasks-panel"][data-variant="summary"]')
  const more = tasks.locator('[data-slot="tasks-view-all"]')
  const sections = tasks.locator('[data-slot="task-section"]')
  await expect(tasks.locator('[data-slot="task-row"][data-state="needs-input"]')).toHaveCount(1)
  // A task waiting for input opens the full list on its own; the summary is the collapsed card.
  await expect(more).toHaveAttribute("aria-expanded", "true")
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    await more.click()
    await expect(more).toHaveAttribute("aria-expanded", "false")
    await expect(tasks.locator('[data-slot="task-row"]')).toHaveCount(3)
    await capture(page, "cockpit", "dock-tasks-activity", viewport.rail)
    await more.click()
    await expect(more).toHaveAttribute("aria-expanded", "true")
    await expect(tasks.locator('[data-slot="task-row"]')).toHaveCount(4)
    // Running work comes first; the finished section is the second and last.
    await expect(sections).toHaveCount(2)
    await sections.last().evaluate((element) => element.scrollIntoView({ block: "start" }))
    await expect(sections.last()).toBeInViewport({ ratio: 0.9 })
    await capture(page, "tasks", "view-all-finished", viewport.rail)
  }
}

async function captureGovernance(page: Page, shot: Shot) {
  await setupGovernance(page, {
    scheme: shot.scheme,
    locale: shot.locale,
    agents: [build, maestro],
    config,
    messages: governedMessages(),
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expectSessionTitle(page, title)
  await expectDocument(page, shot)
  const dialog = page.getByRole("dialog", { name: "Maestro governance" })
  const hold = dialog.locator('.orchestra-governance-record[data-state="hold"]')
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    if (viewport.rail === "hidden") await openRail(page)
    await page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: "Maestro", exact: true })
      .click()
    await expect(dialog).toBeVisible()
    await park(page)
    await expect(page.getByRole("tooltip")).toHaveCount(0)
    // Maestro is offered by this server, and the dirty context check is recorded on hold.
    await expect(dialog.locator(".orchestra-governance-facts").filter({ hasText: sessionID })).toContainText(
      "Offered by this server",
    )
    await expect(hold).toHaveCount(1)
    const rail = viewport.rail === "hidden" ? "56px" : viewport.rail
    if (ends(shot.viewports).includes(viewport)) await capture(page, "governance", "dialog", rail)
    await hold.scrollIntoViewIfNeeded()
    await expect(hold).toBeInViewport({ ratio: 1 })
    await capture(page, "governance", "hold-record", rail)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
  }
}

async function captureEvidence(page: Page, shot: Shot) {
  await evidencePage(page, {
    output: await evidenceFixture("bun-fail"),
    metadata: { exit: 1 },
    scheme: shot.scheme,
    locale: shot.locale,
  })
  await expectDocument(page, shot)
  const card = runCard(page)
  const dialog = page.getByRole("dialog")
  await expect(card).toHaveAttribute("data-state", "failed")
  for (const viewport of shot.viewports) {
    await resize(page, viewport, viewport.rail)
    await card.scrollIntoViewIfNeeded()
    await capture(page, "evidence", "failed-card", viewport.rail)
  }
  // Closing the dialog returns keyboard focus to the replay button, so every card is shot first.
  for (const viewport of ends(shot.viewports)) {
    await resize(page, viewport, viewport.rail)
    await card.getByRole("button", { name: "Run tests again…", exact: true }).click()
    await expect(dialog).toContainText("bun test")
    await capture(page, "evidence", "replay-confirmation", viewport.rail)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
  }
}

// The widest and narrowest requested viewports, for states whose layout barely changes between them.
function ends(list: Viewport[]) {
  return list.filter((viewport) => viewport === list[0] || viewport === list.at(-1))
}

async function expectDocument(page: Page, shot: Shot) {
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", shot.scheme)
  await expect(page.locator("html")).toHaveAttribute("lang", shot.locale)
  await expect(page.locator("html")).toHaveAttribute("dir", shot.locale === "ar" ? "rtl" : "ltr")
}

async function resize(page: Page, viewport: Viewport, rail: Rail) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  if (rail === "hidden") return expect(sidebar).toBeHidden()
  await expect(sidebar).toHaveCSS("width", rail)
}

// Below the rail breakpoint the titlebar opens the 56px rail on demand.
async function openRail(page: Page) {
  await page.locator('[data-slot="titlebar-v2"]').getByRole("button", { name: "Expand sidebar", exact: true }).click()
  await expect(page.locator('[data-component="orchestra-sidebar"]')).toHaveCSS("width", "56px")
}

// The bottom edge of the window frame has no hover targets.
async function park(page: Page) {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error("Screenshot matrix needs a fixed viewport")
  await page.mouse.move(viewport.width / 2, viewport.height - 1)
}

async function capture(page: Page, surface: string, state: string, rail: Rail) {
  await page.evaluate(() => document.fonts.ready)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error("Screenshot matrix needs a fixed viewport")
  const facts = await page.evaluate(() => ({
    scheme: document.documentElement.dataset.colorScheme,
    locale: document.documentElement.lang,
    dir: document.documentElement.dir,
    dpr: devicePixelRatio,
  }))
  const out = process.env.ORCHESTRA_VISUAL_OUT ?? test.info().outputPath()
  const file = `${surface}--${state}--${facts.scheme}-${facts.locale}--${viewport.width}x${viewport.height}@${facts.dpr}x.png`
  await page.screenshot({ path: path.join(out, file), animations: "disabled" })
  // Measured after the capture, which settles finite transitions, so the boxes match the image.
  const measured = await page.evaluate(() => {
    const box = (element: Element | undefined | null) => {
      const rect = element?.getBoundingClientRect()
      if (!rect || rect.width === 0 || rect.height === 0) return null
      return {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
      }
    }
    const sidebar = box(document.querySelector('[data-component="orchestra-sidebar"]'))
    const toolbar = box(document.querySelector('[data-slot="titlebar-v2"]'))
    // Both scheme variants of the logo are mounted; only one is displayed.
    const logo = box(
      [...document.querySelectorAll('[data-component="orchestra-sidebar"] .orchestra-brand img')].find(
        (image) => image.getBoundingClientRect().width > 0,
      ),
    )
    return { sidebarWidth: sidebar?.width ?? null, toolbarHeight: toolbar?.height ?? null, logo, sidebar, toolbar }
  })
  const manifest = path.join(out, "manifest.json")
  const entries: { file: string }[] = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : []
  writeFileSync(
    manifest,
    JSON.stringify(
      [
        ...entries.filter((entry) => entry.file !== file),
        {
          file,
          surface,
          state,
          scheme: facts.scheme,
          locale: facts.locale,
          dir: facts.dir,
          viewport,
          dpr: facts.dpr,
          source: test.info().config.metadata.source,
          rail,
          measured,
          expected: contract[rail],
        },
      ].toSorted((a, b) => a.file.localeCompare(b.file)),
      null,
      2,
    ) + "\n",
  )
}

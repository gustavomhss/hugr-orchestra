import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page, type Route } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/work/shared repository"
const sessionID = "ses_dock_chat"
const sessionTitle = "Dock chat session"

type DockCall = {
  type: string
  url?: string
  profile?: string
  tabID?: string
  generation?: number
  occluded?: boolean
}
type DockFake = {
  calls: DockCall[]
  live: { tabID: string; generation: number; url: string; profile: string }[]
  hold: Record<string, boolean>
  release: Record<string, () => void>
  failManifest: boolean
}

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block" })

test("Dock page and Chat's Apps tab share one live browser session", async ({ page }) => {
  await setup(page, { bridge: true, session: true })
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionID}`)
  await expect(page.getByRole("heading", { name: sessionTitle })).toBeVisible({ timeout: 30_000 })

  await openDock(page)
  await expect(page.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
  await expect(page.getByRole("combobox", { name: "Browser profile" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Create browser profile" })).toHaveCount(0)
  await openAddress(page, "https://example.com/a")
  await expect(tab(page, "Page /a")).toHaveAttribute("aria-selected", "true")
  const opened = await fake(page)
  expect(opened.calls.filter((call) => call.type === "open")).toEqual([
    { type: "open", url: "https://example.com/a", profile: expect.stringMatching(/^repo-[a-z0-9]+$/) },
  ])
  const before = opened.calls.length

  await nav(page, "Chat")
  await expect(page.getByRole("heading", { name: sessionTitle })).toBeVisible()
  const apps = page.locator('[data-slot="session-side-panel-tab-bar"]').getByRole("tab", { name: "Apps" })
  if (!(await apps.isVisible())) await page.getByRole("button", { name: "Toggle review" }).click()
  await apps.click()
  await expect(tab(page, "Page /a")).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("textbox", { name: "Address" })).toHaveValue("https://example.com/a")
  await expect(page.getByRole("combobox", { name: "Browser profile" })).toHaveCount(0)

  await openDock(page)
  await expect(tab(page, "Page /a")).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("textbox", { name: "Address" })).toHaveValue("https://example.com/a")

  const after = await fake(page)
  const moves = after.calls.slice(before)
  expect(moves.filter((call) => ["open", "close", "close-tab", "manifest"].includes(call.type))).toEqual([])
  // Every Show and Hide names the live tab and its generation, so the desktop can drop stale ones.
  const live = { tabID: opened.live[0]!.tabID, generation: opened.live[0]!.generation }
  expect(moves.filter((call) => call.type === "select")).toEqual([
    { type: "select", ...live },
    { type: "select", ...live },
  ])
  const hides = moves.filter((call) => call.type === "hide")
  expect(hides.length).toBeGreaterThanOrEqual(2)
  expect(hides).toEqual(hides.map(() => ({ type: "hide", ...live })))
  expect(after.live).toEqual(opened.live)

  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: test.info().outputPath(`dark.png`), animations: "disabled" })
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await page.screenshot({ path: test.info().outputPath(`light.png`), animations: "disabled" })
  await page.evaluate(() => document.documentElement.setAttribute("dir", "rtl"))
  await page.screenshot({ path: test.info().outputPath(`rtl-light.png`), animations: "disabled" })
})

test("an overlay over the Dock occludes the native browser until it closes", async ({ page }) => {
  // Chat registers the settings dialog, so the Apps tab hosts the Dock for this one.
  await setup(page, { bridge: true, session: true })
  // The settings dialog lists terminal shells, which the shared server mock does not answer.
  await page.route(
    (url) => url.pathname === "/pty/shells",
    (route) => json(route, []),
  )
  await page.goto(`/server/${base64Encode(serverA)}/session/${sessionID}`)
  await expect(page.getByRole("heading", { name: sessionTitle })).toBeVisible({ timeout: 30_000 })
  const apps = page.locator('[data-slot="session-side-panel-tab-bar"]').getByRole("tab", { name: "Apps" })
  if (!(await apps.isVisible())) await page.getByRole("button", { name: "Toggle review" }).click()
  await apps.click()
  await openAddress(page, "https://example.com/a")
  await expect(tab(page, "Page /a")).toHaveAttribute("aria-selected", "true")
  const occluded = async () => (await fake(page)).calls.filter((call) => call.type === "occlude").at(-1)?.occluded
  // Release is the desktop's job: it shows its active tab, so the renderer never hides or re-selects one.
  const moves = async (before: number) => {
    const calls = (await fake(page)).calls.slice(before)
    expect(calls.filter((call) => call.type !== "occlude")).toEqual([])
    return calls.map((call) => call.occluded)
  }
  await expect.poll(occluded).toBe(false)

  // The settings dialog renders through a portal and its overlay covers the whole window.
  const beforeDialog = (await fake(page)).calls.length
  await nav(page, "Settings")
  await expect(page.getByRole("dialog")).toBeVisible()
  await expect.poll(occluded).toBe(true)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect.poll(occluded).toBe(false)
  expect(await moves(beforeDialog)).toEqual([true, false])

  // The tab menu is drawn in place rather than in a portal and opens over the browser.
  await openDock(page)
  await expect(tab(page, "Page /a")).toHaveAttribute("aria-selected", "true")
  await expect.poll(occluded).toBe(false)
  const beforeMenu = (await fake(page)).calls.length
  await tab(page, "Page /a").click({ button: "right" })
  const menu = page.getByRole("menu", { name: "Actions for Page /a" })
  await expect(menu).toBeVisible()
  await expect.poll(occluded).toBe(true)
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
  await expect.poll(occluded).toBe(false)
  expect(await moves(beforeMenu)).toEqual([true, false])
})

test("a profile switch selects the other repository's native profile, ignoring late tabs", async ({ page }) => {
  await setup(page, { bridge: true, session: false })
  await page.goto("/")
  await chooseProfile(page, "Profile A")
  await openDock(page)
  await openAddress(page, "https://example.com/a")
  await expect(tab(page, "Page /a")).toBeVisible()
  const profileA = (await fake(page)).calls.find((call) => call.type === "open")?.profile

  // A tab requested for A that only opens after the switch must not appear in B.
  await page.evaluate(() => {
    ;(window as unknown as { __dock: DockFake }).__dock.hold.open = true
  })
  await page.getByRole("button", { name: "+ New tab" }).click()
  await expect.poll(async () => (await fake(page)).calls.at(-1)?.type).toBe("open")
  await chooseProfile(page, "Profile B")
  await expect(page.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
  await page.evaluate(() => (window as unknown as { __dock: DockFake }).__dock.release.open?.())
  await expect.poll(async () => (await fake(page)).calls.at(-1)).toEqual({ type: "close-tab", tabID: "tab-2" })
  await expect(page.locator(".zen-tab")).toHaveCount(0)

  await openAddress(page, "https://example.com/b")
  await expect(tab(page, "Page /b")).toBeVisible()
  const opens = (await fake(page)).calls.filter((call) => call.type === "open")
  const profileB = opens.at(-1)?.profile
  expect(profileB).toMatch(/^repo-[a-z0-9]+$/)
  expect(profileB).not.toBe(profileA)

  await chooseProfile(page, "Profile A")
  await expect(tab(page, "Page /a")).toBeVisible()
  await expect(tab(page, "Page /b")).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Address" })).toHaveValue("https://example.com/a")
  const final = await fake(page)
  expect(final.calls.filter((call) => call.type === "open").at(-1)).toEqual({
    type: "open",
    url: "https://example.com/a",
    profile: profileA,
  })
  expect(final.live.map((item) => [item.url, item.profile])).toEqual([["https://example.com/a", profileA]])
})

test("outside Orchestra the Apps panel keeps its manual browser profiles", async ({ page }) => {
  // The legacy layout retires on the oldInterfaceSunset date; run before it so the layout still renders.
  await page.clock.setSystemTime(new Date(2026, 8, 1))
  await setup(page, { bridge: true, session: true, legacy: true })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await expect(page.locator('[data-component="orchestra-sidebar"]')).toHaveCount(0)
  await expect(page.getByRole("heading", { name: sessionTitle })).toBeVisible({ timeout: 30_000 })
  const apps = page.locator('[data-slot="session-side-panel-tab-bar"]').getByRole("tab", { name: "Apps" })
  if (!(await apps.isVisible())) await page.getByRole("button", { name: "Toggle review" }).click()
  await apps.click()

  const picker = page.getByRole("combobox", { name: "Browser profile" })
  await expect(picker).toHaveValue("default")
  await expect(picker.locator("option")).toHaveText(["Personal", "Work"])
  await expect(page.getByRole("button", { name: "Create browser profile" })).toBeVisible()
  await expect(tab(page, "Page /personal")).toHaveAttribute("aria-selected", "true")

  await picker.selectOption("work")
  await expect(tab(page, "Page /work")).toHaveAttribute("aria-selected", "true")
  await expect(tab(page, "Page /personal")).toHaveCount(0)
  await expect(picker).toHaveValue("work")
  const opens = (await fake(page)).calls.filter((call) => call.type === "open")
  expect(opens).toEqual([
    { type: "open", url: "https://example.com/personal", profile: "default" },
    { type: "open", url: "https://example.com/work", profile: "work" },
  ])
})

test("loading, failure and retry are explicit", async ({ page }) => {
  await setup(page, { bridge: true, session: false })
  await page.goto("/")
  await chooseProfile(page, "Profile A")
  await page.evaluate(() => {
    const dock = (window as unknown as { __dock: DockFake }).__dock
    dock.hold.manifest = true
    dock.failManifest = true
  })
  await openDock(page)
  await expect(page.getByRole("status")).toHaveText("Restoring tabs…")
  await page.evaluate(() => (window as unknown as { __dock: DockFake }).__dock.release.manifest?.())
  await expect(page.locator(".orchestra-dock").getByRole("alert").first()).toContainText("Could not load the Dock.")
  await page.evaluate(() => {
    ;(window as unknown as { __dock: DockFake }).__dock.failManifest = false
  })
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("No tabs open. Enter an address to start browsing.")
})

test("without the native bridge the Dock is unavailable and makes no Dock calls", async ({ page }) => {
  await setup(page, { bridge: "partial", session: false })
  await page.goto("/")
  await chooseProfile(page, "Profile A")
  await openDock(page)
  await expect(page.getByRole("status")).toHaveText(
    "The Dock needs the desktop app. Native browser tabs are not available in the web app.",
  )
  await expect(page.locator(".zen-browser-shell")).toHaveCount(0)
  expect((await fake(page)).calls).toEqual([])
})

function tab(page: Page, title: string) {
  return page.locator(".zen-tab", { hasText: title })
}

async function fake(page: Page) {
  return page.evaluate(() => {
    const dock = (window as unknown as { __dock: DockFake }).__dock
    return { calls: structuredClone(dock.calls), live: structuredClone(dock.live) }
  })
}

async function nav(page: Page, name: string) {
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name, exact: true }).click()
}

async function openDock(page: Page) {
  await nav(page, "Dock")
  await expect(page).toHaveURL(/\/orchestra\/dock$/)
  await expect(page.getByRole("heading", { name: "Dock", exact: true })).toBeVisible()
}

async function openAddress(page: Page, url: string) {
  const address = page.getByRole("textbox", { name: "Address" })
  await expect(page.getByRole("button", { name: "Open", exact: true })).toBeEnabled()
  await address.fill(url)
  await address.press("Enter")
}

async function chooseProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText(name)
}

async function setup(page: Page, options: { bridge: boolean | "partial"; session: boolean; legacy?: boolean }) {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "project-a",
      name: "Profile A",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: sessionID,
        projectID: "project-a",
        directory,
        title: sessionTitle,
        version: "dev",
        time: { created: 1, updated: 1 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
  // Registered last, so it answers server B before the shared mock falls back.
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverB) return route.fallback()
    return serverBResponse(route, url)
  })
  await page.addInitScript(
    ({ serverA, serverB, directory, sessionID, session, legacy }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: !legacy, shouldDisplayTabsToast: false } }),
      )
      if (legacy) localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.17.20" }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverA, serverB],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [serverA]: [{ worktree: directory, expanded: true }],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [serverA]: directory, [serverB]: directory },
        }),
      )
      if (session)
        localStorage.setItem(
          "opencode.window.browser.dat:tabs",
          JSON.stringify([{ type: "session", server: serverA, sessionId: sessionID }]),
        )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", "dark")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
    },
    { serverA, serverB, directory, sessionID, session: options.session, legacy: !!options.legacy },
  )
  if (options.bridge) await page.addInitScript(installDockBridge, options.bridge === "partial")
}

// A fake of the desktop preload bridge. Like the desktop registry, app-dock-open creates a missing
// profile and bumps the manifest revision; every native call is recorded for assertions. The
// manifest starts with two manual browser profiles that already have saved tabs.
function installDockBridge(partial: boolean) {
  const dock: DockFake = { calls: [], live: [], hold: {}, release: {}, failManifest: false }
  const listeners = new Set<(event: unknown) => void>()
  const held = (name: string) =>
    dock.hold[name]
      ? new Promise<void>((resolve) => {
          dock.hold[name] = false
          dock.release[name] = resolve
        })
      : undefined
  let manifest = {
    version: 1,
    revision: 0,
    profiles: [
      { id: "default", name: "Personal" },
      { id: "work", name: "Work" },
    ],
    activeProfileID: "default",
    tabs: {
      default: [{ url: "https://example.com/personal", pinned: false }],
      work: [{ url: "https://example.com/work", pinned: false }],
    } as Record<string, { url: string; pinned: boolean }[]>,
    bookmarks: [] as string[],
    history: [] as string[],
  }
  let next = 0
  const emit = (event: unknown) => setTimeout(() => listeners.forEach((listener) => listener(event)), 0)
  const appDockOpen = async (url: string, _bounds: unknown, profile = "default") => {
    dock.calls.push({ type: "open", url, profile })
    const opened = { tabID: `tab-${++next}`, generation: next, url }
    await held("open")
    if (!manifest.profiles.some((item) => item.id === profile))
      manifest = {
        ...manifest,
        revision: manifest.revision + 1,
        profiles: [...manifest.profiles, { id: profile, name: profile }],
        tabs: { ...manifest.tabs, [profile]: [] },
      }
    dock.live.push({ ...opened, profile })
    emit({
      type: "state",
      payload: { ...opened, title: `Page ${new URL(url).pathname}`, loading: false, audible: false },
    })
    return opened
  }
  const api = partial
    ? { appDockOpen }
    : {
        appDockOpen,
        appDockSelect: async (tab: { tabID: string; generation: number }) => {
          dock.calls.push({ type: "select", tabID: tab.tabID, generation: tab.generation })
        },
        appDockHide: async (tab: { tabID: string; generation: number }) => {
          dock.calls.push({ type: "hide", tabID: tab.tabID, generation: tab.generation })
        },
        appDockOcclude: async (occluded: boolean) => {
          dock.calls.push({ type: "occlude", occluded })
        },
        appDockClose: async () => {
          dock.calls.push({ type: "close" })
          dock.live = []
        },
        appDockCloseTab: async (tabID: string) => {
          dock.calls.push({ type: "close-tab", tabID })
          dock.live = dock.live.filter((item) => item.tabID !== tabID)
        },
        appDockResize: async () => undefined,
        appDockNavigate: async (tabID: string, url: string) => {
          dock.calls.push({ type: "navigate", tabID, url })
        },
        appDockCommand: async () => undefined,
        appDockFindResult: () => () => undefined,
        appDockEvent: (listener: (event: unknown) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        appDockGetManifest: async () => {
          dock.calls.push({ type: "manifest" })
          await held("manifest")
          if (dock.failManifest) throw new Error("Manifest unavailable")
          return structuredClone(manifest)
        },
        appDockUpdateManifest: async (revision: number, value: typeof manifest) => {
          if (revision !== manifest.revision) return { status: "conflict", manifest: structuredClone(manifest) }
          const ids = manifest.profiles.map((item) => item.id)
          if (value.profiles.length !== ids.length || Object.keys(value.tabs).some((id) => !ids.includes(id)))
            throw new Error("Invalid App Dock manifest")
          manifest = { ...structuredClone(value), revision: revision + 1 }
          return { status: "updated", manifest: structuredClone(manifest) }
        },
      }
  Object.assign(window, { api, __dock: dock })
}

function serverBResponse(route: Route, url: URL) {
  if (route.request().method() === "OPTIONS") return json(route, {})
  const project = {
    id: "project-b",
    name: "Profile B",
    worktree: directory,
    vcs: "git",
    time: { created: 1, updated: 1 },
    sandboxes: [],
  }
  const path = url.pathname
  if (["/global/event", "/event", "/api/event"].includes(path))
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
  if (path === "/global/health") return json(route, { healthy: true })
  if (path === "/project" || path === "/api/project") return json(route, [project])
  if (path === "/project/current") return json(route, project)
  if (path === "/api/project/current") return json(route, { id: project.id, directory })
  if (path === "/path" || path === "/api/path")
    return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/work" })
  if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
  if (path === "/api/session") return json(route, { data: [], cursor: {} })
  if (["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
    return json(route, [])
  return json(route, {})
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "*",
    },
    body: JSON.stringify(body),
  })
}

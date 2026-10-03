import { expect, test, type Page, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/shared"
const catalog = [
  {
    name: "Boundary review",
    description: "Inspect public interfaces",
    location: "/repo/shared/.opencode/skills/review/SKILL.md",
    content:
      "  # Review\n<script>window.__skillInjected = true</script>\n<img src=x onerror=alert(1)>\n<b>Keep literal markup</b>\n",
  },
  {
    name: "Release notes",
    description: "Describe shipped changes",
    location: "/home/user/.config/opencode/skills/notes/SKILL.md",
    content: "# Notes\n\nKeep the exact trailing newline.\n",
  },
]

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: catalog, filter, exact reader, safe text and keyboard in both directions`, async ({ page }) => {
    const requests: string[] = []
    await setup(page, { protocol, requests, scheme: protocol === "v1" ? "dark" : "light" })
    await openSkills(page)
    const chapter = page.locator('[data-chapter="skills"]')
    const cards = chapter.locator(".skills-card")
    await expect(cards).toHaveCount(2)
    await expect(cards.first().getByText("Registered", { exact: true })).toBeVisible()
    await expect(cards.first().getByText(catalog[0].description, { exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0])
    expect(url.origin).toBe(serverA)
    expect(url.pathname).toBe(protocol === "v1" ? "/skill" : "/api/skill")
    expect(url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]")).toBe(directory)

    const reader = chapter.locator(".skills-reader")
    expect(await reader.locator("pre").textContent()).toBe(catalog[0].content)
    await expect(reader.locator("dd")).toHaveText(catalog[0].location)
    await expect(reader.locator("script, img, b")).toHaveCount(0)
    const read = cards.last().getByRole("button", { name: "Read skill" })
    await read.focus()
    await page.keyboard.press("Enter")
    await expect(reader.locator("h2")).toHaveText(catalog[1].name)
    expect(await reader.locator("pre").textContent()).toBe(catalog[1].content)
    await expect(reader.locator("dd")).toHaveText(catalog[1].location)
    await expect(read).toHaveAttribute("aria-pressed", "true")

    const search = chapter.getByRole("searchbox", { name: "Search skills" })
    await search.fill("  PUBLIC  ")
    await expect(cards).toHaveCount(1)
    await expect(cards.first().locator("h2")).toHaveText(catalog[0].name)
    expect(await reader.locator("pre").textContent()).toBe(catalog[0].content)
    await search.fill("not-a-skill")
    await expect(chapter.getByRole("status")).toHaveText("No skills match your search.")
    await expect(reader).toHaveCount(0)
    await search.fill("")
    await expect(cards).toHaveCount(2)
    await expect(reader.locator("h2")).toHaveText(catalog[1].name)
    await page.screenshot({ path: test.info().outputPath(`${protocol === "v1" ? "dark" : "light"}.png`) })

    await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"))
    await search.fill("review")
    await cards.first().getByRole("button", { name: "Read skill" }).focus()
    await page.keyboard.press("Enter")
    await expect(reader.locator("dd")).toHaveText(catalog[0].location)
    await expect(reader.locator("pre")).toBeVisible()
  })

  for (const state of ["empty", "error", "unavailable"] as const) {
    test(`${protocol}: ${state} state${state === "empty" ? "" : " and retry"}`, async ({ page }) => {
      const response = {
        status: state === "error" ? 500 : state === "unavailable" ? 404 : 200,
        skills: [] as typeof catalog,
      }
      await setup(page, { protocol, response })
      await openSkills(page)
      const chapter = page.locator('[data-chapter="skills"]')
      await expect(chapter.getByRole("status")).toHaveText(
        state === "empty"
          ? "No skills are registered for this profile."
          : state === "error"
            ? "Could not load skills for this profile."
            : "This server does not provide a skills catalog.",
      )
      await expect(chapter.locator(".skills-card, .skills-reader")).toHaveCount(0)
      if (state === "empty") return
      response.status = 200
      response.skills = catalog
      await chapter.getByRole("button", { name: "Try again" }).click()
      await expect(chapter.locator(".skills-card")).toHaveCount(2)
    })
  }
}

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: profile ownership, same directory and a late response from A`, async ({ page }) => {
    const pending: { resolve?: () => void } = {}
    const started = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const requests: string[] = []
    const failed: string[] = []
    page.on("requestfailed", (request) => failed.push(request.url()))
    const response = { status: 200, skills: catalog }
    await setup(page, {
      protocol,
      requests,
      response,
      beforeA: async () => {
        if (!pending.resolve) return
        started.resolve()
        await new Promise<void>((resolve) => {
          pending.resolve = resolve
        })
      },
      afterA: () => {
        if (pending.resolve) completed.resolve()
      },
    })
    await openSkills(page)
    const chapter = page.locator('[data-chapter="skills"]')
    await expect(chapter.locator(".skills-card")).toHaveCount(2)
    await chooseProfile(page, "Server B project")
    await expect(chapter.locator(".skills-reader h2")).toHaveText("Server B instructions")
    await expect(chapter.getByText(catalog[0].name, { exact: true })).toHaveCount(0)
    expect(requests.map((request) => new URL(request).origin)).toEqual([serverA, serverB])

    pending.resolve = () => undefined
    await chooseProfile(page, "Server A project")
    await started.promise
    await expect(chapter.getByRole("status")).toHaveText("Loading registered skills…")
    await chooseProfile(page, "Server B project")
    await expect(chapter.locator(".skills-reader h2")).toHaveText("Server B instructions")
    await expect
      .poll(
        () =>
          failed.filter(
            (url) =>
              new URL(url).origin === serverA &&
              new URL(url).pathname === (protocol === "v1" ? "/skill" : "/api/skill"),
          ).length,
      )
      .toBe(1)
    response.skills = [{ ...catalog[0], name: "Late A catalog" }]
    pending.resolve?.()
    await completed.promise
    expect(requests).toHaveLength(4)
    await expect(chapter.locator(".skills-reader h2")).toHaveText("Server B instructions")
    await expect(chapter.getByText("Late A catalog", { exact: true })).toHaveCount(0)
    expect(
      requests.every((request) => {
        const url = new URL(request)
        return url.searchParams.get(url.pathname === "/skill" ? "directory" : "location[directory]") === directory
      }),
    ).toBe(true)
  })
}

async function openSkills(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Skills", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/skills$/)
}

async function chooseProfile(page: Page, name: string) {
  await page.getByRole("button", { name: "Choose repository profile" }).click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
}

async function setup(
  page: Page,
  input: {
    protocol: "v1" | "v2"
    requests?: string[]
    scheme?: "dark" | "light"
    response?: { status: number; skills: typeof catalog }
    beforeA?: () => Promise<void>
    afterA?: () => void
  },
) {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.addInitScript(
    ({ serverA, serverB, directory, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: { local: [{ worktree: directory }], [serverB]: [{ worktree: directory }] },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection: { server: serverA, directory } } }),
      )
    },
    { serverA, serverB, directory, scheme: input.scheme ?? "dark" },
  )
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    const protocol = url.origin === serverB ? "v2" : input.protocol
    const path = url.pathname
    const project = {
      id: url.origin === serverA ? "project-a" : "project-b",
      name: url.origin === serverA ? "Server A project" : "Server B project",
      worktree: directory,
      vcs: "git",
      time: { created: 1, updated: 1 },
      sandboxes: [],
    }
    const location = { directory, project: { id: project.id, directory } }
    if (path === "/global/event" || path === "/event" || path === "/api/event")
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (path === "/global/health") return json(route, { healthy: true }, protocol === "v1" ? 200 : 404)
    if (path === "/api/health") return json(route, { healthy: true, version: "2", pid: 1 })
    if (path === "/skill" || path === "/api/skill") {
      input.requests?.push(url.toString())
      if (url.origin === serverA) await input.beforeA?.()
      const skills =
        url.origin === serverA
          ? (input.response?.skills ?? catalog)
          : [{ ...catalog[1], name: "Server B instructions", content: "Only server B.\n" }]
      await json(
        route,
        path === "/skill" ? skills : { location, data: skills },
        url.origin === serverA ? (input.response?.status ?? 200) : 200,
      )
      if (url.origin === serverA) input.afterA?.()
      return
    }
    if (path === "/project" || path === "/api/project") return json(route, [project])
    if (path === "/project/current") return json(route, project)
    if (path === "/api/project/current") return json(route, { id: project.id, directory })
    if (path === "/path" || path === "/api/path")
      return json(route, { state: directory, config: directory, worktree: directory, directory, home: "/home/user" })
    if (path === "/provider") return json(route, { all: [], connected: [], default: {} })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (path === "/api/vcs") return json(route, { location, data: { branch: "dev" } })
    if (path === "/api/mcp/resource") return json(route, { location, data: { resources: [], templates: [] } })
    if (["/session", "/agent", "/command", "/lsp", "/formatter", "/permission", "/question"].includes(path))
      return json(route, [])
    if (path.startsWith("/api/")) return json(route, { location, data: [] })
    return json(route, {})
  })
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}

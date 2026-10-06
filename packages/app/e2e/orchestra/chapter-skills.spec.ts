import { expect, test, type Page, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/shared"
type SkillFixture = { name: string; description: string; location: string; content: string; mtime?: number }

const catalog: SkillFixture[] = [
  {
    name: "Boundary review",
    description: "Inspect public interfaces",
    location: "/repo/shared/.opencode/skills/review/SKILL.md",
    content:
      "  # Review\n<script>window.__skillInjected = true</script>\n<img src=x onerror=alert(1)>\n<b>Keep literal markup</b>\n",
    mtime: 1_791_000_000_123,
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
    await expect(chapter.locator(".mx-eyebrow")).toHaveText("Server A project / profile configuration")
    await expect(cards.locator("h3")).toHaveText([catalog[0].name, catalog[1].name])
    await expect(cards.first().locator(".mx-meta .mx-badge")).toHaveText(["Project", "Available"])
    await expect(cards.last().locator(".mx-meta .mx-badge")).toHaveText(["Global", "Available"])
    await expect(cards.first().getByText(catalog[0].description, { exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0])
    expect(url.origin).toBe(serverA)
    expect(url.pathname).toBe(protocol === "v1" ? "/skill" : "/api/skill")
    expect(url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]")).toBe(directory)

    const dialog = page.getByRole("dialog")
    const instructions = dialog.getByRole("textbox", { name: "Instructions" })
    const first = cards.first().getByRole("button", { name: "Read & edit" })
    await first.focus()
    await page.keyboard.press("Enter")
    await expect(dialog.locator("h2")).toHaveText(`Edit ${catalog[0].name}`)
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText(`Stored at ${catalog[0].location}`)
    await expect(instructions).toHaveValue(catalog[0].content)
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(catalog[0].name)
    await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveValue(catalog[0].description)
    await expect(dialog.locator("script, img, b")).toHaveCount(0)
    expect(await page.evaluate(() => "__skillInjected" in window)).toBe(false)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)

    await expect(cards.last().getByRole("button", { name: "Read & edit" })).toHaveCount(0)
    const read = cards.last().getByRole("button", { name: "Read", exact: true })
    await read.focus()
    await page.keyboard.press("Enter")
    await expect(dialog.locator("h2")).toHaveText(`Read ${catalog[1].name}`)
    await expect(instructions).toHaveValue(catalog[1].content)
    await expect(instructions).not.toBeEditable()
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText(
      `Stored at ${catalog[1].location}. Global skills are read-only here.`,
    )
    await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Remove skill" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toHaveCount(0)

    // Closing a dialog queues its close event; opening the next dialog before that event runs must not let it
    // close the new one (keyboard users hit this when they press Escape and then Enter quickly).
    await cards.first().getByRole("button", { name: "Read & edit" }).click()
    await expect(dialog.locator("h2")).toHaveText(`Edit ${catalog[0].name}`)
    await page.evaluate(async () => {
      const previous = document.querySelector("dialog")
      const next = Array.from(document.querySelectorAll<HTMLButtonElement>(".skills-card .mx-btn")).find(
        (button) => button.textContent === "Read",
      )
      if (!previous?.open || !next) throw new Error("expected an open dialog and a Read button")
      const closed = new Promise((resolve) => previous.addEventListener("close", resolve, { once: true }))
      previous.close()
      next.click()
      await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 1000))])
    })
    await expect(dialog).toHaveCount(1)
    await expect(dialog.locator("h2")).toHaveText(`Read ${catalog[1].name}`)
    await expect(instructions).toHaveValue(catalog[1].content)
    await dialog.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toHaveCount(0)

    const search = chapter.getByRole("textbox", { name: "Search skills" })
    await search.fill("  PUBLIC  ")
    await expect(cards).toHaveCount(1)
    await expect(cards.first().locator("h3")).toHaveText(catalog[0].name)
    await search.fill("not-a-skill")
    await expect(chapter.getByRole("status")).toHaveText("No skills match your search.")
    await expect(cards).toHaveCount(0)
    await search.fill("")
    await expect(cards).toHaveCount(2)
    await expect(chapter.getByRole("status")).toHaveText("")
    await page.screenshot({ path: test.info().outputPath(`${protocol === "v1" ? "dark" : "light"}.png`) })

    await page.locator("html").evaluate((element) => element.setAttribute("dir", "rtl"))
    await search.fill("review")
    await cards.first().getByRole("button", { name: "Read & edit" }).focus()
    await page.keyboard.press("Enter")
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText(`Stored at ${catalog[0].location}`)
    await expect(instructions).toHaveValue(catalog[0].content)
  })

  test(`${protocol}: create, edit, remove, read-only skills, reload notice and local availability`, async ({
    page,
  }) => {
    const writes: { method: string; url: string; body: unknown }[] = []
    const builtin = {
      name: "customize-opencode",
      description: "Configure opencode",
      location: protocol === "v1" ? "<built-in>" : "/builtin/customize-opencode.md",
      content: "# Built in\n",
    }
    const governed = {
      name: "own_policy",
      description: "Atlas policy",
      location: `${directory}/.opencode/skills/own/own_policy/SKILL.md`,
      content: "# Policy\n",
    }
    const created = `${directory}/.opencode/skills/release-checklist/SKILL.md`
    const response = { status: 200, skills: [...catalog, governed, builtin], hidden: [created] }
    await setup(page, { protocol, response, writes })
    await openSkills(page)
    const chapter = page.locator('[data-chapter="skills"]')
    const cards = chapter.locator(".skills-card")
    const dialog = page.getByRole("dialog")
    await expect(cards.locator("h3")).toHaveText([catalog[0].name, governed.name, catalog[1].name, builtin.name])
    await expect(cards.last().locator(".mx-meta .mx-badge")).toHaveText(["Built-in", "Available"])

    await cards.last().getByRole("button", { name: "Read", exact: true }).click()
    await expect(dialog.locator("h2")).toHaveText(`Read ${builtin.name}`)
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText("Built into opencode. Read-only.")
    await expect(dialog.getByRole("textbox", { name: "Instructions" })).toHaveValue(builtin.content)
    await expect(dialog.getByRole("textbox", { name: "Instructions" })).not.toBeEditable()
    await expect(dialog.getByRole("textbox", { name: "Name" })).not.toBeEditable()
    await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Remove skill" })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Close dialog" }).click()
    await expect(dialog).toHaveCount(0)

    await cards.nth(1).getByRole("button", { name: "Read", exact: true }).click()
    await expect(dialog.locator("h2")).toHaveText(`Read ${governed.name}`)
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText(
      `Stored at ${governed.location}. Governed by Atlas, so it is read-only.`,
    )
    await expect(dialog.getByRole("textbox", { name: "Description" })).not.toBeEditable()
    await expect(dialog.getByRole("button", { name: "Save" })).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "Remove skill" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)

    await chapter.getByRole("button", { name: "Add skill" }).click()
    await expect(dialog.locator("h2")).toHaveText("Add skill")
    await dialog.getByRole("textbox", { name: "Name" }).fill("taken")
    await dialog.getByRole("textbox", { name: "Description" }).fill("Already there")
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog.getByRole("alert")).toHaveText("A skill named taken is already registered.")
    await expect(dialog).toBeVisible()
    await dialog.getByRole("textbox", { name: "Name" }).fill("release-checklist")
    await dialog.getByRole("textbox", { name: "Description" }).fill("Ship with evidence")
    await dialog.getByRole("textbox", { name: "Instructions" }).fill("# Release\n\nRun the gate.")
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog).toHaveCount(0)
    expect(writes.map((write) => write.method)).toEqual(["PUT", "PUT"])
    expect(writes[1].body).toEqual({
      name: "release-checklist",
      description: "Ship with evidence",
      content: "# Release\n\nRun the gate.",
    })
    expectDirectory(writes[1].url)

    // The server saved the file but its cached configuration does not list the new folder yet.
    const notice = chapter.locator(".orchestra-skills-notice")
    await expect(notice).toHaveText(
      `Saved to ${created}. The server lists it after it reloads this project's configuration. Reload list`,
    )
    await expect(cards.locator("h3")).toHaveText([catalog[0].name, governed.name, catalog[1].name, builtin.name])
    response.hidden = []
    await notice.getByRole("button", { name: "Reload list" }).click()
    await expect(cards.locator("h3")).toHaveText([
      catalog[0].name,
      governed.name,
      "release-checklist",
      catalog[1].name,
      builtin.name,
    ])
    await expect(notice).toHaveCount(0)
    await expect(cards.nth(2).locator(".mx-meta .mx-badge")).toHaveText(["Project", "Available"])

    // Availability follows the file, so renaming a disabled skill keeps it disabled.
    await chapter.getByRole("switch", { name: `Enable ${catalog[0].name}` }).click()
    await cards.first().getByRole("button", { name: "Read & edit" }).click()
    await dialog.getByRole("textbox", { name: "Name" }).fill("boundary-check")
    await dialog.getByRole("textbox", { name: "Description" }).fill("Inspect every public interface")
    await dialog.getByRole("button", { name: "Save" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cards.first().locator("h3")).toHaveText("boundary-check")
    await expect(cards.first().getByText("Inspect every public interface", { exact: true })).toBeVisible()
    await expect(chapter.getByRole("switch", { name: "Enable boundary-check" })).toHaveAttribute(
      "aria-checked",
      "false",
    )
    await expect(cards.first().locator(".mx-meta .mx-badge")).toHaveText(["Project", "Disabled"])
    expect(writes[2]).toEqual({
      method: "PUT",
      url: writes[2].url,
      body: {
        name: "boundary-check",
        description: "Inspect every public interface",
        content: catalog[0].content,
        path: catalog[0].location,
        mtime: catalog[0].mtime,
      },
    })
    expectDirectory(writes[2].url)

    await cards.nth(2).getByRole("button", { name: "Read & edit" }).click()
    await dialog.getByRole("button", { name: "Remove skill" }).click()
    await expect(dialog.locator("h2")).toHaveText("Remove this skill?")
    await expect(dialog.locator(".mx-dialog-head p")).toHaveText(`Deletes ${created}.`)
    await dialog.getByRole("button", { name: "Confirm" }).click()
    await expect(dialog).toHaveCount(0)
    await expect(cards.locator("h3")).toHaveText(["boundary-check", governed.name, catalog[1].name, builtin.name])
    expect(writes).toHaveLength(4)
    expect(writes[3].method).toBe("DELETE")
    expect(new URL(writes[3].url).searchParams.get("path")).toBe(created)
    expectDirectory(writes[3].url)

    const toggle = chapter.getByRole("switch", { name: `Enable ${catalog[1].name}` })
    await expect(toggle).toHaveAttribute("aria-checked", "true")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-checked", "false")
    await expect(cards.nth(2).locator(".mx-meta .mx-badge")).toHaveText(["Global", "Disabled"])
    await expect(chapter.locator(".mx-note")).toHaveText(
      "Availability is saved for this profile in this app; agents still receive every registered skill.",
    )
    await page.reload()
    await expect(chapter.getByRole("switch", { name: `Enable ${catalog[1].name}` })).toHaveAttribute(
      "aria-checked",
      "false",
    )
    await expect(chapter.getByRole("switch", { name: "Enable boundary-check" })).toHaveAttribute(
      "aria-checked",
      "false",
    )
    await expect(chapter.getByRole("switch", { name: `Enable ${governed.name}` })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    expect(writes).toHaveLength(4)

    function expectDirectory(input: string) {
      const url = new URL(input)
      expect(url.origin).toBe(serverA)
      expect(url.pathname).toBe(protocol === "v1" ? "/skill" : "/api/skill")
      expect(url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]")).toBe(directory)
    }
  })

  for (const state of ["empty", "error", "unavailable"] as const) {
    test(`${protocol}: ${state} state${state === "empty" ? "" : " and retry"}`, async ({ page }) => {
      const response = {
        status: state === "error" ? 500 : state === "unavailable" ? 404 : 200,
        skills: [] as SkillFixture[],
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
      await expect(chapter.locator(".skills-card, dialog")).toHaveCount(0)
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
    await expect(chapter.locator(".skills-card h3")).toHaveText(["Server B instructions"])
    await expect(chapter.locator(".mx-eyebrow")).toHaveText("Server B project / profile configuration")
    await expect(chapter.getByText(catalog[0].name, { exact: true })).toHaveCount(0)
    expect(requests.map((request) => new URL(request).origin)).toEqual([serverA, serverB])

    pending.resolve = () => undefined
    await chooseProfile(page, "Server A project")
    await started.promise
    await expect(chapter.getByRole("status")).toHaveText("Loading registered skills…")
    await chooseProfile(page, "Server B project")
    await expect(chapter.locator(".skills-card h3")).toHaveText(["Server B instructions"])
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
    await expect(chapter.locator(".skills-card h3")).toHaveText(["Server B instructions"])
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
    response?: { status: number; skills: SkillFixture[]; hidden?: string[] }
    writes?: { method: string; url: string; body: unknown }[]
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
    if ((path === "/skill" || path === "/api/skill") && route.request().method() !== "GET") {
      const method = route.request().method()
      const body: unknown = method === "PUT" ? route.request().postDataJSON() : undefined
      input.writes?.push({ method, url: url.toString(), body })
      return writeSkill(route, { path, method, body, url, location, skills: input.response })
    }
    if (path === "/skill" || path === "/api/skill") {
      input.requests?.push(url.toString())
      if (url.origin === serverA) await input.beforeA?.()
      const skills =
        url.origin === serverA
          ? (input.response?.skills ?? catalog).filter((skill) => !input.response?.hidden?.includes(skill.location))
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

// Mirrors the server contract: PUT creates `<directory>/.opencode/skills/<name>/SKILL.md` or rewrites the
// registered file at `path` (bumping its mtime); DELETE removes the registered file at `path`.
function writeSkill(
  route: Route,
  input: {
    path: string
    method: string
    body: unknown
    url: URL
    location: unknown
    skills?: { status: number; skills: SkillFixture[]; hidden?: string[] }
  },
) {
  const store = input.skills
  if (!store) return json(route, {}, 500)
  const wrap = (data: unknown) => (input.path === "/skill" ? data : { location: input.location, data })
  if (input.method === "DELETE") {
    const target = input.url.searchParams.get("path")
    store.skills = store.skills.filter((skill) => skill.location !== target)
    return json(route, wrap(true))
  }
  const body = input.body as { name: string; description: string; content: string; path?: string }
  if (body.name === "taken") {
    const message = "A skill named taken is already registered."
    return input.path === "/skill"
      ? json(route, { name: "SkillConflictError", data: { message } }, 409)
      : json(route, { _tag: "ConflictError", message, resource: "skill" }, 409)
  }
  const saved = {
    name: body.name,
    description: body.description,
    location: body.path ?? `${directory}/.opencode/skills/${body.name}/SKILL.md`,
    content: body.content,
    mtime: Date.now(),
  }
  store.skills = body.path
    ? store.skills.map((skill) => (skill.location === body.path ? saved : skill))
    : [...store.skills, saved]
  return json(route, wrap(saved))
}

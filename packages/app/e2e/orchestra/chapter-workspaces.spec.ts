import { expect, test, type Page, type Route } from "@playwright/test"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const root = "/repos/orchestra"
const sandboxes = ["/sandboxes/one", "/sandboxes/two"]

type Request = { url: string; method: string; path: string; directory: string | null; body: unknown }

const project = (name: string, sandboxes: string[]) => ({
  id: `project-${name}`,
  name,
  worktree: root,
  sandboxes,
  vcs: "git",
  time: { created: 1, updated: 1 },
})

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" })

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: renders the mock page and selecting a workspace steers new sessions`, async ({ page }) => {
    const mock = await setup(page, { scheme })
    await openChapter(page)
    const chapter = page.locator(".orchestra-workspaces")
    await expect(chapter.locator(".ws-kicker")).toHaveText("Workspaces")
    await expect(chapter.getByRole("heading", { level: 1 })).toHaveText(/^Where the work\s*actually runs\.$/)
    await expect(chapter.locator(".ws-mast h1 span")).toHaveText("actually runs.")
    await expect(chapter.locator(".mx-toolbar .mx-btn.primary")).toHaveText("New workspace")
    await expect(chapter.locator(".mx-toolbar .mx-badge")).toHaveText("Server A repository")
    await expect(chapter.locator(".mx-card")).toHaveCount(3)
    await expect(chapter.locator(".mx-card code")).toHaveText([root, ...sandboxes])
    await expect(chapter.locator(".mx-card h3")).toHaveText(["Server A repository", "one", "two"])
    await expect(card(page, root).locator(".mx-badge")).toHaveText(["local", "Active"])
    await expect(card(page, root).locator(".mx-badge.good")).toHaveText("Active")
    for (const sandbox of sandboxes)
      await expect(card(page, sandbox).locator(".mx-badge")).toHaveText(["sandbox", "Idle"])
    await expect(card(page, root).locator(".mx-card-foot .mx-btn")).toHaveText(["Open Chat", "Configure"])
    await expect(card(page, sandboxes[0]).locator(".mx-card-foot .mx-btn")).toHaveText(["Use workspace", "Configure"])
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`), animations: "disabled" })

    await card(page, sandboxes[0]).getByRole("button", { name: "Use workspace", exact: true }).click()
    await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
    await expect
      .poll(() => drafts(page))
      .toEqual([expect.objectContaining({ type: "draft", server: serverA, directory: sandboxes[0] })])
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveText("")
    await expect(workspaceTrigger(page)).toBeVisible()
    await expect.poll(() => mock.requests.some((request) => request.directory === sandboxes[0])).toBe(true)

    await openChapter(page, false)
    await expect(card(page, sandboxes[0]).locator(".mx-badge")).toHaveText(["sandbox", "Active"])
    await expect(card(page, sandboxes[0]).locator(".mx-badge.good")).toHaveText("Active")
    await expect(card(page, root).locator(".mx-badge")).toHaveText(["local", "Idle"])
    await expect(card(page, sandboxes[0]).locator(".mx-card-foot .mx-btn")).toHaveText(["Open Chat", "Configure"])
    await expect(card(page, root).locator(".mx-card-foot .mx-btn")).toHaveText(["Use workspace", "Configure"])

    // A draft opened at the repository root (Home's own New session) defaults to the selected workspace.
    await page
      .locator('[data-component="orchestra-sidebar"]')
      .getByRole("button", { name: "Home", exact: true })
      .click()
    await page.getByRole("button", { name: "New session", exact: true }).first().click()
    await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
    await expect.poll(async () => (await drafts(page)).at(-1)).toEqual(expect.objectContaining({ directory: root }))
    await expect(workspaceTrigger(page)).toBeVisible()
    expect(writes(mock.requests)).toEqual([])
  })
}

test("rename stays local to the profile, survives reload and resets to the folder name", async ({ page }) => {
  const mock = await setup(page)
  await openChapter(page)
  await card(page, sandboxes[1]).getByRole("button", { name: "Configure", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Configure two", exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator(".mx-dialog-head p")).toHaveText(
    "Placement for this profile's work. New workspaces are git worktrees of this repository.",
  )
  await expect(dialog.getByRole("textbox", { name: "Directory", exact: true })).toHaveValue(sandboxes[1])
  await expect(dialog.getByRole("textbox", { name: "Directory", exact: true })).toHaveAttribute("readonly", "")
  await expect(dialog.getByRole("textbox", { name: "Branch", exact: true })).toHaveAttribute("readonly", "")
  await expect(dialog.getByRole("combobox", { name: "Type", exact: true })).toBeDisabled()
  await expect(dialog.getByRole("combobox", { name: "Type", exact: true })).toHaveValue("sandbox")
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()

  await card(page, sandboxes[1]).getByRole("button", { name: "Configure", exact: true }).click()
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Review sandbox")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(card(page, sandboxes[1]).locator("h3")).toHaveText("Review sandbox")
  await expect(page.locator(".mx-toolbar .mx-badge")).toHaveText("Server A repository")

  await page.reload()
  await expect(card(page, sandboxes[1]).locator("h3")).toHaveText("Review sandbox")
  await card(page, sandboxes[1]).getByRole("button", { name: "Configure", exact: true }).click()
  const renamed = page.getByRole("dialog", { name: "Configure Review sandbox", exact: true })
  await renamed.getByRole("textbox", { name: "Name", exact: true }).fill("two")
  await renamed.getByRole("button", { name: "Save", exact: true }).click()
  await expect(card(page, sandboxes[1]).locator("h3")).toHaveText("two")
  expect(writes(mock.requests)).toEqual([])
})

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: creates and deletes a git worktree through the server, deletion behind a confirmation`, async ({
    page,
  }) => {
    const mock = await setup(page, { protocol })
    await openChapter(page)
    const created = protocol === "v1" ? "/worktrees/feature-a" : "/repos/orchestra-workspaces/feature-a"

    await page.getByRole("button", { name: "New workspace", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "New workspace", exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("combobox", { name: "Type", exact: true })).toHaveValue("sandbox")
    const directory = dialog.getByRole("textbox", { name: "Directory", exact: true })
    if (protocol === "v1") {
      await expect(directory).toHaveValue("")
      await expect(directory).toHaveAttribute("placeholder", "Chosen by the server")
      await expect(directory).toHaveAttribute("readonly", "")
      await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Feature A")
    }
    if (protocol === "v2") {
      await expect(directory).toHaveValue("/repos/orchestra-workspaces")
      await expect(directory).not.toHaveAttribute("readonly", "")
      await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("nested/name")
      await dialog.getByRole("button", { name: "Save", exact: true }).click()
      await expect(dialog.getByRole("alert")).toHaveText("Enter a parent directory and a name without slashes.")
      expect(writes(mock.requests)).toEqual([])
      mock.state.failCreate = "Project copy destination already exists: /repos/orchestra-workspaces/feature-a"
      await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("feature-a")
      await dialog.getByRole("button", { name: "Save", exact: true }).click()
      await expect(dialog.getByRole("alert")).toHaveText(mock.state.failCreate)
      await expect(dialog).toBeVisible()
      mock.state.failCreate = undefined
    }
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(card(page, created)).toBeVisible()
    await expect(card(page, created).locator("h3")).toHaveText(protocol === "v1" ? "Feature A" : "feature-a")
    await expect(card(page, created).locator(".mx-badge")).toHaveText(
      protocol === "v1" ? ["sandbox", "opencode/feature-a", "Idle"] : ["sandbox", "Idle"],
    )
    const creates = writes(mock.requests).filter((request) => request.method === "POST")
    expect(creates.at(-1)).toEqual(
      expect.objectContaining(
        protocol === "v1"
          ? { path: "/experimental/worktree", directory: root, body: { name: "Feature A" } }
          : {
              path: "/experimental/project/project-Server A repository/copy",
              directory: root,
              body: { strategy: "git_worktree", directory: "/repos/orchestra-workspaces", name: "feature-a" },
            },
      ),
    )
    expect(new URL(creates.at(-1)?.url ?? "").origin).toBe(serverA)

    // Root, the active workspace and directories the server cannot remove never offer deletion.
    await card(page, root).getByRole("button", { name: "Configure", exact: true }).click()
    await expect(page.getByRole("dialog").getByRole("button", { name: "Delete workspace", exact: true })).toHaveCount(0)
    await page.keyboard.press("Escape")
    if (protocol === "v2") {
      await card(page, sandboxes[1]).getByRole("button", { name: "Configure", exact: true }).click()
      await expect(page.getByRole("dialog").locator(".mx-note")).toHaveText(
        "This server cannot remove this directory. Remove it with git.",
      )
      await expect(page.getByRole("dialog").getByRole("button", { name: "Delete workspace", exact: true })).toHaveCount(
        0,
      )
      await page.keyboard.press("Escape")
    }

    await card(page, created).getByRole("button", { name: "Configure", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete workspace", exact: true }).click()
    const confirm = page.getByRole("dialog", { name: "Delete workspace?", exact: true })
    await expect(confirm.locator(".mx-dialog-head p")).toHaveText(
      protocol === "v1"
        ? "Removes this git worktree, its files and its branch from disk."
        : "Removes this git worktree and its files from disk.",
    )
    await expect(confirm.locator(".mx-note")).toHaveText(`Uncommitted changes in ${created} are lost.`)
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(card(page, created)).toBeVisible()
    expect(writes(mock.requests).filter((request) => request.method === "DELETE")).toEqual([])

    await card(page, created).getByRole("button", { name: "Configure", exact: true }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Delete workspace", exact: true }).click()
    await confirm.getByRole("button", { name: "Confirm", exact: true }).click()
    await expect(confirm).toBeHidden()
    await expect(card(page, created)).toHaveCount(0)
    await expect(page.locator(".mx-card code")).toHaveText([root, ...sandboxes])
    expect(writes(mock.requests).filter((request) => request.method === "DELETE")).toEqual([
      expect.objectContaining(
        protocol === "v1"
          ? { path: "/experimental/worktree", directory: root, body: { directory: created } }
          : {
              path: "/experimental/project/project-Server A repository/copy",
              directory: root,
              body: { directory: created, force: true },
            },
      ),
    ])
  })
}

test("same paths on a second server remain isolated while a first-server response is pending", async ({ page }) => {
  const mock = await setup(page)
  await openHome(page)
  // Hold only this page's project request; the shell's own bootstrap has already completed.
  mock.state.delay = true
  await openChapter(page, false)
  const chapter = page.locator(".orchestra-workspaces")
  await expect(chapter.getByRole("status")).toHaveText("Loading workspaces…")
  await expect(chapter.getByRole("button", { name: "New workspace", exact: true })).toBeDisabled()
  await expect.poll(() => mock.pending.length).toBe(1)
  await page.getByRole("button", { name: "Choose repository profile", exact: true }).click()
  await page.getByRole("menuitemradio").filter({ hasText: "Server B repository" }).click()
  await expect(chapter.locator(".mx-card")).toHaveCount(2)
  await expect(chapter.locator(".mx-card code")).toHaveText([root, sandboxes[1]])
  await expect(chapter.locator(".mx-toolbar .mx-badge")).toHaveText("Server B repository")
  await mock.release()
  // Await the actual delayed response and an animation frame, not a guessed timeout.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await expect(chapter.locator(".mx-card code")).toHaveText([root, sandboxes[1]])
  await card(page, sandboxes[1]).getByRole("button", { name: "Use workspace", exact: true }).click()
  await expect(page).toHaveURL(/\/new-session\?draftId=[^&]+$/)
  await expect.poll(() => drafts(page)).toEqual([expect.objectContaining({ server: serverB, directory: sandboxes[1] })])
  await expect
    .poll(() =>
      mock.requests.some((request) => {
        const url = new URL(request.url)
        return url.origin === serverB && requestDirectory(url) === sandboxes[1]
      }),
    )
    .toBe(true)
  expect(writes(mock.requests)).toEqual([])
})

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: reports error, unavailable and empty states and recovers`, async ({ page }) => {
    const mock = await setup(page, { protocol })
    await openHome(page)
    mock.state.status = 500
    await openChapter(page, false)
    const chapter = page.locator(".orchestra-workspaces")
    await expect(chapter.getByRole("alert")).toHaveText("Could not load workspaces. Try again")
    await expect(chapter.getByRole("button", { name: "New workspace", exact: true })).toBeDisabled()
    mock.state.status = 404
    await chapter.getByRole("button", { name: "Try again", exact: true }).click()
    await expect(chapter.getByRole("status")).toHaveText("Workspace information is unavailable on this server.")
    await expect(chapter.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0)
    mock.state.status = 200
    mock.state.empty = true
    await page.reload()
    await expect(chapter.getByRole("status")).toHaveText("No workspaces were found for this repository.")
    await expect(chapter.locator(".mx-card")).toHaveCount(0)
    await expect(chapter.getByRole("button", { name: "New workspace", exact: true })).toBeDisabled()
    mock.state.empty = false
    await page.reload()
    await expect(chapter.locator(".mx-card code")).toHaveText([root, ...sandboxes])
    await expect(chapter.getByRole("button", { name: "New workspace", exact: true })).toBeEnabled()
    expect(writes(mock.requests)).toEqual([])
  })
}

function card(page: Page, directory: string) {
  return page.locator(`.orchestra-workspaces .mx-card[data-directory="${directory}"]`)
}

// The new-session composer's workspace menu trigger shows the folder name of the chosen sandbox.
function workspaceTrigger(page: Page) {
  return page
    .locator('[data-component="session-new-design"]')
    .getByRole("button")
    .filter({ hasText: /^\s*one\s*$/ })
}

function writes(requests: Request[]) {
  return requests.filter((request) => request.method !== "GET" && request.method !== "OPTIONS")
}

async function openHome(page: Page) {
  await page.goto("/")
  await expect(page.locator("#orchestra-profile-name")).toHaveText("Server A repository")
}

async function openChapter(page: Page, load = true) {
  if (load) await openHome(page)
  await page
    .locator('[data-component="orchestra-sidebar"]')
    .getByRole("button", { name: "Workspaces", exact: true })
    .click()
  await expect(page).toHaveURL(/\/orchestra\/workspaces$/)
}

async function drafts(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]"))
}

async function setup(page: Page, options: { scheme?: "dark" | "light"; protocol?: "v1" | "v2" } = {}) {
  const protocol = options.protocol ?? "v2"
  const state = {
    status: 200,
    empty: false,
    delay: false,
    failCreate: undefined as string | undefined,
    sandboxes: { [serverA]: [...sandboxes], [serverB]: [sandboxes[1]] } as Record<string, string[]>,
    // Directories the V2 server created with a copy strategy and can therefore remove.
    managed: new Set([sandboxes[0]]),
  }
  const requests: Request[] = []
  const pending: (() => Promise<void>)[] = []
  await page.addInitScript(
    ({ serverA, serverB, root, scheme }) => {
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      if (sessionStorage.getItem("workspaces-seeded")) return
      sessionStorage.setItem("workspaces-seeded", "1")
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: { local: [{ worktree: root, expanded: true }], [serverB]: [{ worktree: root, expanded: true }] },
          lastProject: { local: root, [serverB]: root },
        }),
      )
      localStorage.setItem(
        "opencode.global.dat:layout",
        JSON.stringify({ home: { selection: { server: serverA, directory: root } } }),
      )
    },
    { serverA, serverB, root, scheme: options.scheme ?? "dark" },
  )
  await page.route("**/*", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    if (request.method() === "OPTIONS") return json(route, {})
    requests.push({
      url: url.toString(),
      method: request.method(),
      path: decodeURIComponent(url.pathname),
      directory: requestDirectory(url),
      body: request.postDataJSON() ?? undefined,
    })
    const list = state.sandboxes[url.origin]
    const current = project(url.origin === serverA ? "Server A repository" : "Server B repository", list)
    if (["/global/event", "/event", "/api/event"].includes(url.pathname))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (url.pathname === "/global/health")
      return json(route, { healthy: protocol === "v1" }, protocol === "v1" ? 200 : 404)
    if (url.pathname === "/api/health") return json(route, { healthy: true, version: "2.0.0", pid: 1 })
    if (url.pathname === "/api/project" || url.pathname === "/project") {
      const respond = () =>
        json(
          route,
          state.empty ? [] : [current, { ...project("Other repository", ["/other/sandbox"]), worktree: "/other/repo" }],
          url.origin === serverA ? state.status : 200,
        )
      if (state.delay && url.origin === serverA) {
        return new Promise<void>((resolve) =>
          pending.push(async () => {
            await respond()
            resolve()
          }),
        )
      }
      return respond()
    }
    if (url.pathname === "/experimental/worktree") return worktree(route, request.method(), list)
    if (url.pathname.endsWith("/directories") && url.pathname.startsWith("/api/project/"))
      return json(route, [
        { directory: root },
        ...list.map((directory) => ({
          directory,
          ...(state.managed.has(directory) ? { strategy: "git_worktree" } : {}),
        })),
      ])
    if (/^\/experimental\/project\/[^/]+\/copy$/.test(url.pathname)) return copy(route, request.method(), list)
    if (url.pathname === "/vcs") {
      const directory = requestDirectory(url) ?? root
      return json(route, {
        branch: directory === root ? "dev" : `opencode/${directory.split("/").at(-1)}`,
        default_branch: "dev",
      })
    }
    if (url.pathname === "/project/current") return json(route, current)
    if (url.pathname === "/api/project/current") return json(route, { id: current.id, directory: root })
    const directory = requestDirectory(url) ?? root
    if (url.pathname === "/api/path" || url.pathname === "/path")
      return json(route, { state: root, config: root, worktree: root, directory, home: "/home/test" })
    if (url.pathname === "/provider")
      return json(route, { all: [], connected: [], default: { providerID: "", modelID: "" } })
    if (url.pathname === "/agent") return json(route, [{ name: "build", mode: "primary" }])
    if (url.pathname === "/api/agent")
      return json(route, {
        location: { directory },
        data: [
          {
            id: "build",
            name: "Build",
            mode: "primary",
            hidden: false,
            request: { settings: {}, headers: {}, body: {} },
            permissions: [],
          },
        ],
      })
    if (url.pathname === "/api/model/default") return json(route, { location: { directory }, data: null })
    if (url.pathname === "/api/session") return json(route, { data: [], cursor: {} })
    if (url.pathname === "/api/session/active") return json(route, { data: {} })
    if (
      ["/session", "/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(
        url.pathname,
      )
    )
      return json(route, [])
    if (url.pathname.startsWith("/api/")) return json(route, { location: { directory }, data: [] })
    return json(route, {})
  })

  // V1 worktree endpoints: list every linked worktree, create under the server's own directory, remove by path.
  function worktree(route: Route, method: string, list: string[]) {
    const body = route.request().postDataJSON() as { name?: string; directory?: string } | null
    if (method === "GET") return json(route, list)
    if (method === "POST") {
      const name = (body?.name ?? "").toLowerCase().replaceAll(" ", "-")
      list.push(`/worktrees/${name}`)
      return json(route, { name, branch: `opencode/${name}`, directory: `/worktrees/${name}` })
    }
    list.splice(list.indexOf(body?.directory ?? ""), 1)
    return json(route, true)
  }

  // V2 project copies: create `<directory>/<name>` with a strategy; remove only strategy-owned directories.
  function copy(route: Route, method: string, list: string[]) {
    const body = route.request().postDataJSON() as { directory: string; name?: string }
    if (method === "POST") {
      if (state.failCreate) return json(route, { name: "ProjectCopyError", data: { message: state.failCreate } }, 400)
      const directory = `${body.directory}/${body.name}`
      list.push(directory)
      state.managed.add(directory)
      return json(route, { directory })
    }
    list.splice(list.indexOf(body.directory), 1)
    state.managed.delete(body.directory)
    return route.fulfill({ status: 204, headers: cors })
  }

  return {
    state,
    requests,
    pending,
    release: async () => {
      const response = page.waitForResponse((response) => response.url() === `${serverA}/api/project`)
      state.delay = false
      await Promise.all(pending.splice(0).map((respond) => respond()))
      await (await response).finished()
    },
  }
}

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "*",
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) })
}

function requestDirectory(url: URL) {
  return url.searchParams.get("location[directory]") ?? url.searchParams.get("directory")
}

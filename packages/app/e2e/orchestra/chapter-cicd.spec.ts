import { readFile } from "node:fs/promises"
import { expect, test, type Page, type Route, type WebSocketRoute } from "@playwright/test"
import type { ModelInfo } from "@opencode-ai/client/promise"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/repo/orchestra"
const source =
  "name: Repository checks\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo '<script>literal source</script>'\n"

test.use({ viewport: { width: 1440, height: 900 } })

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: repository workflows, literal source, and unsent draft target the profile`, async ({ page }) => {
    const requests = await setup(page, { protocol, gitlab: true })
    await openChapter(page)
    await expect(workflowRows(page)).toHaveText([
      ".gitlab-ci.ymlGitLab CIView",
      ".github/workflows/ci.ymlGitHub ActionsView",
      ".github/workflows/release.yamlGitHub ActionsView",
    ])
    expect(requests.filter((url) => url.pathname === "/file/content" || url.pathname.startsWith("/api/fs/read/"))).toEqual(
      [],
    )
    const ci = await openSource(page, ".github/workflows/ci.yml")
    await expect(ci.locator('[data-slot="cicd-source"]')).toHaveText(source)
    expect(await ci.locator('[data-slot="cicd-source"]').textContent()).toBe(source)
    await expect(ci.getByText("GitHub Actions · runs on the repository host, not in Orchestra.")).toBeVisible()
    await ci.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(ci).toHaveCount(0)
    const release = await openSource(page, ".github/workflows/release.yaml")
    await expect(release.locator('[data-slot="cicd-source"]')).toHaveText("name: Release\non: [workflow_dispatch]\n")
    await expect
      .poll(() =>
        requests
          .filter((url) => url.pathname === (protocol === "v1" ? "/file" : "/api/fs/list"))
          .map((url) => url.searchParams.get("path")),
      )
      .toEqual(["", ".github", ".github/workflows"])
    const reads = requests.filter((url) => url.pathname === "/file/content" || url.pathname.startsWith("/api/fs/read/"))
    expect(
      reads.map((url) =>
        protocol === "v1"
          ? url.searchParams.get("path")
          : decodeURIComponent(url.pathname.slice("/api/fs/read/".length)),
      ),
    ).toEqual([".github/workflows/ci.yml", ".github/workflows/release.yaml"])
    expect(
      reads.every(
        (url) =>
          url.origin === serverA &&
          url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]") === directory,
      ),
    ).toBe(true)
    const mutations: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (request.method() !== "GET" && /\/(api\/)?session(?:\/|$)/.test(url.pathname)) mutations.push(request.url())
    })
    await release.getByRole("button", { name: "Discuss in Chat", exact: true }).click()
    await expect(page).toHaveURL(/\/new-session\?draftId=/)
    await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toContainText(
      ".github/workflows/release.yaml",
    )
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")))
      .toMatchObject([{ type: "draft", server: serverA, directory }])
    expect(mutations).toEqual([])
  })
}

test("profiles on different servers keep separate inventories and discard a late preview", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const requests = await setup(page, {
    beforeRead: async () => {
      started.resolve()
      await pending.promise
    },
    afterRead: () => completed.resolve(),
  })
  await openChapter(page)
  const late = await openSource(page, ".github/workflows/ci.yml")
  await started.promise
  await expect(late.getByText("Loading workflow source…", { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(late).toHaveCount(0)
  await chooseProfile(page, "Server B repository")
  await expect(workflowRows(page).locator("strong")).toHaveText([".github/workflows/server-b.yml"])
  const serverSource = await openSource(page, ".github/workflows/server-b.yml")
  await expect(serverSource.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  pending.resolve()
  await completed.promise
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.origin === serverB &&
          url.pathname.startsWith("/api/fs/read/") &&
          url.searchParams.get("location[directory]") === directory,
      ),
    )
    .toBe(true)
  await expect(serverSource.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  await expect(page.getByRole("dialog")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await chooseProfile(page, "Server A repository")
  await expect(workflowRows(page)).toHaveCount(2)
  const ci = await openSource(page, ".github/workflows/ci.yml")
  await expect(ci.locator('[data-slot="cicd-source"]')).toHaveText(source)
  await page.keyboard.press("Escape")
  await chooseProfile(page, "Server B repository")
  const again = await openSource(page, ".github/workflows/server-b.yml")
  await expect(again.locator('[data-slot="cicd-source"]')).toHaveText("name: Server B\n")
  const mutations: string[] = []
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/(api\/)?session(?:\/|$)/.test(new URL(request.url()).pathname))
      mutations.push(request.url())
  })
  await again.getByRole("button", { name: "Discuss in Chat", exact: true }).click()
  await expect(page.locator('[data-component="prompt-input"][contenteditable="true"]')).toContainText(
    ".github/workflows/server-b.yml",
  )
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opencode.window.browser.dat:tabs") ?? "[]")))
    .toMatchObject([{ type: "draft", server: serverB, directory }])
  expect(mutations).toEqual([])
})

test("switching profiles during inventory loading discards the old list", async ({ page }) => {
  const pending = Promise.withResolvers<void>()
  const started = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  await setup(page, {
    beforeList: async () => {
      started.resolve()
      await pending.promise
    },
    afterList: () => completed.resolve(),
  })
  await openChapter(page)
  await started.promise
  await expect(page.getByText("Loading repository workflows…", { exact: true })).toBeVisible()
  await chooseProfile(page, "Server B repository")
  await expect(workflowRows(page).locator("strong")).toHaveText([".github/workflows/server-b.yml"])
  pending.resolve()
  await completed.promise
  await expect(workflowRows(page).locator("strong")).toHaveText([".github/workflows/server-b.yml"])
})

for (const state of ["empty", "error", "unavailable"] as const) {
  test(`inventory ${state} is explicit`, async ({ page }) => {
    await setup(page, { state })
    await openChapter(page)
    const message = page.locator('[data-slot="cicd-workflows"]').getByRole(state === "error" ? "alert" : "status")
    await expect(message).toHaveText(
      {
        empty: "No GitLab CI or GitHub Actions workflows found in this repository.",
        error: "Could not load repository workflows.",
        unavailable: "Workflow files are unavailable on this server.",
      }[state],
    )
    await expect(page.getByRole("button", { name: /^View / })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(state === "error" ? 1 : 0)
    await expect(page.locator(".mx-empty")).toHaveText(
      "No pipelines configured.Create a pipeline to preview build, test and deployment stages.",
    )
  })
}

test("inventory and preview failures are recoverable", async ({ page }) => {
  const state = { list: true, read: true }
  await setup(page, { listFailure: () => state.list, readFailure: () => state.read })
  await openChapter(page)
  await expect(page.locator('[data-slot="cicd-workflows"]').getByRole("alert")).toHaveText(
    "Could not load repository workflows.",
  )
  state.list = false
  await page.getByRole("button", { name: "Retry", exact: true }).click()
  await expect(workflowRows(page)).toHaveCount(2)
  const failed = await openSource(page, ".github/workflows/ci.yml")
  await expect(failed.getByRole("alert")).toHaveText("Could not read this workflow.")
  await page.keyboard.press("Escape")
  state.read = false
  const recovered = await openSource(page, ".github/workflows/ci.yml")
  await expect(recovered.locator('[data-slot="cicd-source"]')).toHaveText(source)
})

test("pipelines are created, validated, edited, searched, persisted per profile and removed", async ({ page }) => {
  await setup(page)
  await openChapter(page)
  await expect(page.getByRole("heading", { name: "CI/CD", level: 1 })).toBeVisible()
  await expect(page.getByText("Server A repository / profile configuration", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "New pipeline", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New pipeline" })
  await expect(dialog.locator('[name="branch"]')).toHaveValue("main")
  await expect(dialog.locator('[name="command"]')).toHaveValue("bun run build && bun test")
  await expect(dialog.getByRole("button", { name: "Remove pipeline" })).toHaveCount(0)
  await dialog.locator('[name="name"]').fill("Project checks")
  await dialog.locator('[name="command"]').fill("   ")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Add at least one command.")
  await dialog.locator('[name="command"]').fill("bun run build && bun run lint && bun test")
  await dialog.locator('[name="trigger"]').selectOption({ label: "On push" })
  await dialog.locator('[name="environment"]').selectOption({ label: "Staging" })
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const card = page.locator("article.mx-card")
  await expect(card.getByRole("heading", { name: "Project checks" })).toBeVisible()
  await expect(card.locator("p")).toHaveText("bun run build && bun run lint && bun test")
  await expect(card.locator(".mx-badge")).toHaveText(["Not run", "main", "On push", "Checks only"])
  await expect(card.getByRole("button")).toHaveText(["Run", "Logs", "Edit"])
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  const logs = page.getByRole("dialog", { name: "Project checks · logs" })
  await expect(logs.getByText("main · Not run", { exact: true })).toBeVisible()
  await expect(logs.locator('[data-slot="cicd-log"]')).toHaveText("No runs yet.")
  await expect(logs.getByRole("button", { name: "Download logs" })).toBeDisabled()
  await page.keyboard.press("Escape")

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  const edit = page.getByRole("dialog", { name: "Edit Project checks" })
  await expect(edit.locator('[name="trigger"]')).toHaveValue("push")
  await expect(edit.locator('[name="environment"]')).toHaveValue("staging")
  await edit.locator('[name="branch"]').fill("release")
  await edit.getByRole("checkbox", { name: "Include a deployment stage" }).check()
  await edit.getByRole("button", { name: "Save", exact: true }).click()
  await expect(card.locator(".mx-badge")).toHaveText(["Not run", "release", "On push", "Deploy: Staging"])

  const search = page.getByRole("textbox", { name: "Search CI/CD" })
  await expect(search).toHaveAttribute("placeholder", "Search ci/cd")
  await search.fill("lint")
  await expect(card).toHaveCount(1)
  await expect(workflowRows(page)).toHaveCount(0)
  await search.fill("release.yaml")
  await expect(card).toHaveCount(0)
  await expect(workflowRows(page).locator("strong")).toHaveText([".github/workflows/release.yaml"])
  await search.fill("")
  await expect(workflowRows(page)).toHaveCount(2)

  await page.reload()
  await expect(card.locator(".mx-badge")).toHaveText(["Not run", "release", "On push", "Deploy: Staging"])
  await chooseProfile(page, "Server B repository")
  await expect(page.locator("article.mx-card")).toHaveCount(0)
  await expect(page.locator(".mx-empty")).toBeVisible()
  await chooseProfile(page, "Server A repository")
  await expect(card).toHaveCount(1)

  await card.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByRole("button", { name: "Remove pipeline", exact: true }).click()
  const confirm = page.getByRole("dialog", { name: "Remove this item?" })
  await expect(confirm.getByText("This changes the saved pipelines for Server A repository.")).toBeVisible()
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator(".mx-empty")).toBeVisible()
  await page.reload()
  await expect(page.locator(".mx-empty")).toBeVisible()
})

for (const protocol of ["v1", "v2"] as const) {
  test(`${protocol}: run executes the commands through a server PTY with live, downloadable logs`, async ({ page }) => {
    const pty = await mockPty(page, protocol)
    await setup(page, { protocol })
    await openChapter(page)
    await createPipeline(page, { deploy: true })
    const card = page.locator("article.mx-card")
    await card.getByRole("button", { name: "Run", exact: true }).click()
    await expect(card.locator(".mx-badge").first()).toHaveText("Running")
    await expect.poll(() => pty.inputs).toEqual(["\r"])
    expect(pty.creates).toEqual([
      expect.objectContaining({
        args: ["-c", "IFS= read -r orchestra_ready\nset -e\nbun run build\nbun test"],
        title: "CI/CD · Project checks",
      }),
    ])
    expect(pty.creates[0]).not.toHaveProperty("command")
    expect(pty.connections.every((url) => url.includes(encodeURIComponent(directory)))).toBe(true)
    pty.sockets[0]!.send("\r\n\x1b[32mbuild ok\x1b[0m\r\nprogress 10%\rprogress 100%\r\n")
    await card.getByRole("button", { name: "Logs", exact: true }).click()
    const logs = page.getByRole("dialog", { name: "Project checks · logs" })
    await expect(logs.getByText("main · Running", { exact: true })).toBeVisible()
    await expect(logs.locator('[data-slot="cicd-log"]')).toHaveText(
      /^Run 1 · .+\nBranch: main\nDirectory: \/repo\/orchestra\n\$ bun run build\nbun test\nbuild ok\nprogress 100%$/,
    )
    pty.exit(0)
    await expect(logs.getByText("main · Passed", { exact: true })).toBeVisible()
    await expect(logs.locator('[data-slot="cicd-log"]')).toHaveText(
      /\nprogress 100%\n\nExited with code 0\.\nDeploy to Staging: not executed, no deployment target is connected\.\nPipeline passed\.$/,
    )
    await expect.poll(() => pty.removed).toEqual(["pty_cicd"])
    const download = page.waitForEvent("download")
    await logs.getByRole("button", { name: "Download logs", exact: true }).click()
    expect((await download).suggestedFilename()).toBe("Project checks.log")
    expect(await readFile(await (await download).path(), "utf8")).toMatch(/Pipeline passed\.\n$/)
    await page.keyboard.press("Escape")
    await expect(card.locator(".mx-badge").first()).toHaveText("Passed")
    await expect(card.locator(".mx-badge.good")).toHaveText("Passed")
    await page.reload()
    await expect(card.locator(".mx-badge").first()).toHaveText("Passed")
    expect(pty.creates).toHaveLength(1)
  })
}

test("a failing run skips deployment, and a cancelled run cannot complete later", async ({ page }) => {
  const pty = await mockPty(page, "v2")
  await setup(page)
  await openChapter(page)
  await createPipeline(page, { deploy: true })
  const card = page.locator("article.mx-card")
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect.poll(() => pty.inputs).toEqual(["\r"])
  pty.sockets[0]!.send("test failed\r\n")
  pty.exit(2)
  await expect(card.locator(".mx-badge.bad")).toHaveText("Failed")
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(
    /\ntest failed\n\nExited with code 2\.\nDeploy to Staging: skipped due to failed checks\.\nPipeline failed\.$/,
  )
  await page.keyboard.press("Escape")

  pty.reset()
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect.poll(() => pty.inputs).toEqual(["\r"])
  pty.sockets[0]!.send("partial\r\n")
  await expect(card.getByRole("button", { name: "Stop", exact: true })).toBeVisible()
  await card.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(card.locator(".mx-badge").first()).toHaveText("Cancelled")
  await expect.poll(() => pty.removed).toEqual(["pty_cicd"])
  pty.status = "exited"
  pty.exitCode = 0
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(/^Run 2 · .+\npartial\nCancelled by you\.$/s)
  await page.reload()
  await expect(card.locator(".mx-badge").first()).toHaveText("Cancelled")
  expect(pty.gets).toBe(0)
  expect(pty.sockets).toHaveLength(1)
})

for (const outcome of ["gone", "finished"] as const) {
  test(`a run left running by a reload resumes from its server PTY (${outcome})`, async ({ page }) => {
    const pty = await mockPty(page, "v2")
    await setup(page)
    await openChapter(page)
    await createPipeline(page, { deploy: false })
    const card = page.locator("article.mx-card")
    await card.getByRole("button", { name: "Run", exact: true }).click()
    await expect.poll(() => pty.inputs).toEqual(["\r"])
    pty.onConnect = (socket) => {
      if (outcome === "gone") pty.missing = true
      if (outcome === "finished") {
        pty.status = "exited"
        pty.exitCode = 0
      }
      socket.close({ code: 4404, reason: "session exited" })
    }
    await page.reload()
    await expect(card.locator(".mx-badge").first()).toHaveText(outcome === "gone" ? "Interrupted" : "Passed")
    expect(pty.sockets).toHaveLength(2)
    expect(pty.inputs).toEqual(["\r"])
    await card.getByRole("button", { name: "Logs", exact: true }).click()
    await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(
      outcome === "gone"
        ? /\n\nThe server no longer has this run\. Its result is unknown\.$/
        : /\nOutput produced while Orchestra was closed is not available\.\n\nExited with code 0\.\nPipeline passed\.$/,
    )
  })
}

test("a run the server cannot start fails with the server's reason", async ({ page }) => {
  const pty = await mockPty(page, "v2")
  pty.createFailure = true
  await setup(page)
  await openChapter(page)
  await createPipeline(page, { deploy: false })
  const card = page.locator("article.mx-card")
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect(card.locator(".mx-badge.bad")).toHaveText("Failed")
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(/\n\nCould not start this run: .+$/)
  expect(pty.sockets).toHaveLength(0)
})

for (const scheme of ["dark", "light"] as const) {
  test(`${scheme}: keyboard opens a workflow source and screenshots`, async ({ page }) => {
    await setup(page, { scheme })
    await openChapter(page)
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    const debug = page.getByRole("button", { name: "Toggle debug tools", exact: true })
    if ((await debug.isVisible()) && (await debug.getAttribute("aria-pressed")) === "true") await debug.click()
    const notice = page.getByRole("button", { name: "Dismiss Tabs information", exact: true })
    if (await notice.count()) await notice.click()
    await createPipeline(page, { deploy: true })
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`) })
    const view = page.getByRole("button", { name: "View .github/workflows/release.yaml", exact: true })
    await view.focus()
    await page.keyboard.press("Enter")
    const dialog = page.getByRole("dialog", { name: ".github/workflows/release.yaml" })
    await expect(dialog.locator('[data-slot="cicd-source"]')).toHaveText("name: Release\non: [workflow_dispatch]\n")
    await page.screenshot({ path: test.info().outputPath(`${scheme}-source.png`) })
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(view).toBeFocused()
    await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await expect(view).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`${scheme}-rtl.png`) })
  })
}

function workflowRows(page: Page) {
  return page.locator('[data-slot="cicd-workflows"] .mx-row[data-mx-card]')
}

async function openSource(page: Page, path: string) {
  await page.getByRole("button", { name: `View ${path}`, exact: true }).click()
  const dialog = page.getByRole("dialog", { name: path })
  await expect(dialog).toBeVisible()
  return dialog
}

async function createPipeline(page: Page, options: { deploy: boolean }) {
  await page.getByRole("button", { name: "New pipeline", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New pipeline" })
  await dialog.locator('[name="name"]').fill("Project checks")
  await dialog.locator('[name="command"]').fill("bun run build\nbun test")
  await dialog.locator('[name="environment"]').selectOption({ label: "Staging" })
  if (options.deploy) await dialog.getByRole("checkbox", { name: "Include a deployment stage" }).check()
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog).toHaveCount(0)
}

// Server PTY double: records creates, gate input and removals; `exit` ends the run like the server
// (status first, then a normal close), and `missing` answers like a server that lost the session.
async function mockPty(page: Page, protocol: "v1" | "v2") {
  const state = {
    creates: [] as Record<string, unknown>[],
    inputs: [] as string[],
    removed: [] as string[],
    connections: [] as string[],
    sockets: [] as WebSocketRoute[],
    gets: 0,
    status: "running" as "running" | "exited",
    exitCode: undefined as number | undefined,
    missing: false,
    createFailure: false,
    onConnect: undefined as ((socket: WebSocketRoute) => void) | undefined,
    exit(code: number) {
      state.status = "exited"
      state.exitCode = code
      void state.sockets.at(-1)?.close({ code: 1000 })
    },
    reset() {
      Object.assign(state, { inputs: [], removed: [], sockets: [], gets: 0, status: "running", exitCode: undefined })
    },
  }
  const prefix = protocol === "v1" ? "/pty" : "/api/pty"
  const info = () => ({
    id: "pty_cicd",
    title: "CI/CD · Project checks",
    command: "/bin/zsh",
    args: [],
    cwd: directory,
    status: state.status,
    pid: 1,
    ...(state.status === "exited" ? { exitCode: state.exitCode } : {}),
  })
  const body = (data: unknown) => (protocol === "v1" ? data : { location: { directory }, data })
  await page.route(
    (url) => url.origin === serverA && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)),
    (route) => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      expect(url.searchParams.get(protocol === "v1" ? "directory" : "location[directory]")).toBe(directory)
      if (url.pathname === prefix && method === "POST") {
        if (state.createFailure) return json(route, {}, 500)
        state.creates.push(route.request().postDataJSON())
        return json(route, body(info()))
      }
      if (url.pathname.endsWith("/connect-token")) return json(route, {}, 404)
      if (method === "DELETE") {
        state.removed.push(url.pathname.split("/").at(-1) ?? "")
        return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } })
      }
      state.gets += 1
      if (state.missing)
        return json(
          route,
          protocol === "v1"
            ? { name: "NotFoundError", data: { message: "missing" } }
            : { _tag: "PtyNotFoundError", ptyID: "pty_cicd", message: "missing" },
          404,
        )
      return json(route, body(info()))
    },
  )
  await page.routeWebSocket(new RegExp(`${prefix}/pty_cicd/connect`), (socket) => {
    state.connections.push(socket.url())
    state.sockets.push(socket)
    socket.onMessage((message) => state.inputs.push(String(message)))
    if (state.onConnect) return state.onConnect(socket)
    socket.send(Buffer.concat([Buffer.from([0]), Buffer.from(JSON.stringify({ cursor: 0 }))]))
  })
  return state
}

async function openChapter(page: Page) {
  await page.goto("/")
  await chooseProfile(page, "Server A repository")
  await page.locator(".orchestra-nav").getByRole("button", { name: "CI/CD", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/cicd$/)
}

async function chooseProfile(page: Page, name: string) {
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name, exact: true }).click()
}

async function setup(
  page: Page,
  options: {
    protocol?: "v1" | "v2"
    state?: "empty" | "error" | "unavailable"
    gitlab?: boolean
    listFailure?: () => boolean
    scheme?: "dark" | "light"
    beforeRead?: () => Promise<void>
    beforeList?: () => Promise<void>
    afterRead?: () => void
    afterList?: () => void
    readFailure?: () => boolean
  } = {},
) {
  const requests: URL[] = []
  const model: ModelInfo = {
    id: "test-model",
    modelID: "test-model",
    providerID: "opencode",
    name: "Test model",
    capabilities: { input: ["text"], output: ["text"], tools: true },
    variants: [],
    time: { released: 1 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context: 200_000, output: 8192 },
  }
  const project = (server: string) => ({
    id: server === serverA ? "project-a" : "project-b",
    name: server === serverA ? "Server A repository" : "Server B repository",
    worktree: directory,
    vcs: "git",
    time: { created: 1, updated: 1 },
    sandboxes: [],
  })
  await mockOpenCodeServer(page, {
    protocol: options.protocol ?? "v2",
    directory,
    project: project(serverA),
    provider: provider(),
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== serverA && url.origin !== serverB) return route.fallback()
    const path = url.pathname
    if (path === "/api/provider")
      return json(route, { location: { directory }, data: [{ id: "opencode", name: "OpenCode", settings: {} }] })
    if (path === "/api/model") return json(route, { location: { directory }, data: [model] })
    if (path === "/api/model/default") return json(route, { location: { directory }, data: model })
    if (path === "/api/mcp") return json(route, { location: { directory }, data: [] })
    if (path === "/api/mcp/resource")
      return json(route, { location: { directory }, data: { resources: [], templates: [] } })
    if (path === "/file" || path === "/api/fs/list" || path === "/file/content" || path.startsWith("/api/fs/read/")) {
      requests.push(url)
      const target = url.searchParams.get(path.startsWith("/api/") ? "location[directory]" : "directory")
      if (target !== directory) return json(route, {}, 400)
      if (path === "/file" || path === "/api/fs/list") {
        if (options.state === "error" || options.listFailure?.()) return json(route, {}, 500)
        if (options.state === "unavailable") return json(route, {}, 404)
        const parent = url.searchParams.get("path") ?? ""
        if (url.origin === serverA && parent === ".github/workflows") await options.beforeList?.()
        const entries =
          options.state === "empty"
            ? []
            : parent === ""
              ? [{ path: ".github", type: "directory" }].concat(
                  options.gitlab && url.origin === serverA ? [{ path: ".gitlab-ci.yml", type: "file" }] : [],
                )
              : parent === ".github"
                ? [{ path: ".github/workflows", type: "directory" }]
                : url.origin === serverB
                  ? [{ path: ".github/workflows/server-b.yml", type: "file" }]
                  : ["ci.yml", "release.yaml", "notes.md"]
                      .map((name) => ({ path: `.github/workflows/${name}`, type: "file" }))
                      .concat([{ path: ".github/workflows/nested.yml", type: "directory" }])
        return json(route, path === "/file" ? entries : { location: { directory }, data: entries }).finally(() => {
          if (url.origin === serverA && parent === ".github/workflows") options.afterList?.()
        })
      }
      if (url.origin === serverA) await options.beforeRead?.()
      if (options.readFailure?.()) return json(route, {}, 500)
      const text =
        url.origin === serverB
          ? "name: Server B\n"
          : (url.searchParams.get("path") ?? path).endsWith("release.yaml")
            ? "name: Release\non: [workflow_dispatch]\n"
            : source
      if (path === "/file/content") return json(route, { type: "text", content: text })
      return route
        .fulfill({
          status: 200,
          contentType: "application/octet-stream",
          headers: { "access-control-allow-origin": "*" },
          body: text,
        })
        .finally(() => {
          if (url.origin === serverA) options.afterRead?.()
        })
    }
    if (url.origin === serverA) return route.fallback()
    if (["/global/event", "/event", "/api/event"].includes(path))
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ok\n\n" })
    if (path === "/global/health") return json(route, {}, 404)
    if (path === "/api/health") return json(route, { healthy: true, pid: 1, version: "2.0.0" })
    if (path === "/project" || path === "/api/project") return json(route, [project(serverB)])
    if (path === "/project/current") return json(route, project(serverB))
    if (path === "/api/project/current") return json(route, { id: "project-b", directory })
    if (path === "/api/path" || path === "/path")
      return json(route, { directory, worktree: directory, home: directory, config: directory, state: directory })
    if (path === "/api/session") return json(route, { data: [], cursor: {} })
    if (path === "/api/session/active") return json(route, { data: {} })
    if (["/skill", "/command", "/lsp", "/formatter", "/permission", "/question", "/vcs/diff"].includes(path))
      return json(route, [])
    if (path === "/provider") return json(route, provider())
    if (path === "/api/agent")
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
    if (path === "/api/vcs")
      return json(route, { location: { directory }, data: { branch: "dev", defaultBranch: "dev" } })
    if (
      ["/api/command", "/api/skill", "/api/permission/request", "/api/question/request", "/api/reference"].includes(
        path,
      )
    )
      return json(route, { location: { directory }, data: [] })
    return json(route, {})
  })
  await page.addInitScript(
    ({ serverB, scheme, directory }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true } }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: {
            local: [{ worktree: directory, expanded: true }],
            [serverB]: [{ worktree: directory, expanded: true }],
          },
          lastProject: { local: directory, [serverB]: directory },
        }),
      )
      localStorage.setItem("opencode.global.dat:language", JSON.stringify({ locale: "en" }))
      localStorage.setItem("opencode-color-scheme", scheme)
    },
    { serverB, scheme: options.scheme ?? "dark", directory },
  )
  return requests
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  })
}

function provider() {
  return {
    all: [
      {
        id: "opencode",
        name: "OpenCode",
        models: { "test-model": { id: "test-model", name: "Test model", limit: { context: 200_000 } } },
      },
    ],
    connected: ["opencode"],
    default: { providerID: "opencode", modelID: "test-model" },
  }
}

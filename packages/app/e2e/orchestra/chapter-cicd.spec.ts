import { readFile } from "node:fs/promises"
import { expect, test } from "@playwright/test"
import {
  chooseProfile,
  createPipeline,
  directory,
  mockPty,
  openChapter,
  openSource,
  serverA,
  serverB,
  setup,
  source,
  workflowRows,
} from "../utils/cicd"

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
    expect(
      requests.filter((url) => url.pathname === "/file/content" || url.pathname.startsWith("/api/fs/read/")),
    ).toEqual([])
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

test("the pressed WIP item opens no tooltip that would take a dialog's Escape", async ({ page }) => {
  await setup(page)
  // Clicks the CI/CD item and leaves the pointer on it.
  await openChapter(page)
  // A timer queued now fires after the 400ms tooltip open delay that the hover started before the click.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 450)))
  await expect(page.getByRole("tooltip")).toHaveCount(0)
  const source = await openSource(page, ".github/workflows/ci.yml")
  await page.keyboard.press("Escape")
  await expect(source).toHaveCount(0)
  // Positive control: hovering a WIP item without pressing it still explains the mark.
  await page.locator(".orchestra-nav").getByRole("button", { name: "Hooks", exact: true }).hover()
  await expect(
    page.getByRole("tooltip", { name: "Work in progress, revisit before production", exact: true }),
  ).toBeVisible()
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
  await expect(page.locator('[data-mx-page="cicd"] > .mx-inner > .mx-note')).toHaveText(
    "Run executes the commands in this repository's working tree on the server; Stop asks the server to end them. Triggers, branch checkout and deployments are not executed yet.",
  )
  await page.getByRole("button", { name: "New pipeline", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "New pipeline" })
  await expect(dialog.locator('[name="branch"]')).toHaveValue("main")
  await expect(dialog.locator('[name="command"]')).toHaveValue("bun run build && bun test")
  await expect(dialog.getByRole("button", { name: "Remove pipeline" })).toHaveCount(0)
  await dialog.locator('[name="name"]').fill("   ")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a name.")
  await dialog.locator('[name="name"]').fill("Project checks")
  await dialog.locator('[name="branch"]').fill("  ")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Enter a branch.")
  await dialog.locator('[name="branch"]').fill(" main ")
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
    await setup(page, { protocol })
    const pty = await mockPty(page, protocol)
    await openChapter(page)
    await createPipeline(page, { deploy: true })
    const card = page.locator("article.mx-card")
    // The second click of a double click must not stop the run the first click started.
    await card.getByRole("button", { name: "Run", exact: true }).dblclick()
    await expect(card.locator(".mx-badge").first()).toHaveText("Running")
    await expect.poll(() => pty.inputs).toEqual(["\r"])
    // Execution semantics of the generated script are unit-tested by running it in real shells; here
    // the page must hand each command line to the pinned POSIX shell as its own step.
    expect(pty.creates).toEqual([
      { command: "/bin/sh", args: ["-c", expect.any(String)], title: "CI/CD · Project checks" },
    ])
    const script = String((pty.creates[0]?.args as string[])[1])
    expect(script.startsWith("IFS= read -r orchestra_ready\n")).toBe(true)
    expect(script.endsWith("\neval 'bun run build'\neval 'bun test'")).toBe(true)
    expect(pty.connections.every((url) => url.includes(encodeURIComponent(directory)))).toBe(true)
    pty.sockets[0]!.send("\r\n\x1b[32mbuild ok\x1b[0m\r\nprogress 10%\rprogress 100%\r\n")
    await card.getByRole("button", { name: "Logs", exact: true }).click()
    const logs = page.getByRole("dialog", { name: "Project checks · logs" })
    await expect(logs.getByText("main · Running", { exact: true })).toBeVisible()
    await expect(logs.locator('[data-slot="cicd-log"]')).toHaveText(
      /^Run 1 · .+\nWorking tree branch: main\nDirectory: \/repo\/orchestra\n\$ bun run build\nbun test\nbuild ok\nprogress 100%$/,
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

test("a failing run skips deployment; Stop is best effort and a cancelled run cannot complete later", async ({
  page,
}) => {
  await setup(page)
  const pty = await mockPty(page, "v2")
  await openChapter(page)
  await createPipeline(page, { deploy: true, branch: "release" })
  const card = page.locator("article.mx-card")
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect.poll(() => pty.inputs).toEqual(["\r"])
  pty.sockets[0]!.send("test failed\r\n")
  pty.exit(2)
  await expect(card.locator(".mx-badge.bad")).toHaveText("Failed")
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(
    /^Run 1 · .+\nWorking tree branch: main\nConfigured branch \(not checked out\): release\n.+\ntest failed\n\nExited with code 2\.\nDeploy to Staging: skipped due to failed checks\.\nPipeline failed\.$/s,
  )
  await page.keyboard.press("Escape")

  pty.reset()
  pty.removeFailure = true
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect.poll(() => pty.inputs).toEqual(["\r"])
  pty.sockets[0]!.send("partial\r\n")
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toContainText("partial")
  await page.keyboard.press("Escape")
  await card.getByRole("button", { name: "Stop", exact: true }).click()
  await expect(card.locator(".mx-badge").first()).toHaveText("Cancelled")
  await expect.poll(() => pty.removed).toEqual(["pty_cicd"])
  // The process ends late on the server; the cancelled run must not become Passed.
  pty.exit(0)
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(
    /^Run 2 · .+\npartial\nCancelled by you\.\nCould not stop the process: .+\. It may still be running on the server\.$/s,
  )
  await page.keyboard.press("Escape")
  await expect(card.locator(".mx-badge").first()).toHaveText("Cancelled")
  await page.reload()
  await expect(card.locator(".mx-badge").first()).toHaveText("Cancelled")
  expect(pty.gets).toBe(0)
  expect(pty.sockets).toHaveLength(1)
})

for (const [protocol, outcome] of [
  ["v2", "gone"],
  ["v2", "finished"],
  ["v1", "gone"],
] as const) {
  test(`${protocol}: a run left running by a reload resumes from its server PTY (${outcome})`, async ({ page }) => {
    await setup(page, { protocol })
    const pty = await mockPty(page, protocol)
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
      void socket.close({ code: 4404, reason: "session exited" })
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

test("a run the server cannot start is a start failure, not a failed check", async ({ page }) => {
  await setup(page)
  const pty = await mockPty(page, "v2")
  pty.createFailure = true
  await openChapter(page)
  await createPipeline(page, { deploy: false })
  const card = page.locator("article.mx-card")
  await card.getByRole("button", { name: "Run", exact: true }).click()
  await expect(card.locator(".mx-badge.bad")).toHaveText("Start failed")
  await card.getByRole("button", { name: "Logs", exact: true }).click()
  await expect(page.locator('[data-slot="cicd-log"]')).toHaveText(/\n\nCould not start this run: .+$/)
  await expect(page.locator('[data-slot="cicd-log"]')).not.toContainText("Pipeline failed.")
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

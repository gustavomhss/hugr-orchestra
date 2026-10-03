import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { mockOpenCodeServer } from "../utils/mock-server"

const serverA = "http://127.0.0.1:4096"
const serverB = "http://127.0.0.1:4097"
const directory = "/env-project"
const secret = "env-private-fixture-942"
const fixture = `# local only\r\n\r\nexport TOKEN="${secret}#hash" # keep\r\nREMOVE=discard\r\nMULTI="first\r\nsecond"\r\nopaque directive\r\nLAST=no-newline`

test.use({ viewport: { width: 1400, height: 900 }, serviceWorkers: "block", actionTimeout: 10_000 })

async function setup(page: Page, scheme = "dark") {
  const requests: string[] = []
  page.on("request", (request) =>
    requests.push(JSON.stringify({ url: request.url(), headers: request.headers(), body: request.postData() })),
  )
  await mockOpenCodeServer(page, {
    directory,
    project: { id: "env-project", name: "Env A", worktree: directory, sandboxes: [], time: { created: 1, updated: 1 } },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.route(`${serverA}/project`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { id: "env-project", name: "Env A", worktree: directory, sandboxes: [], time: { created: 1, updated: 1 } },
        { id: "env-second", name: "Env A2", worktree: "/env-second", sandboxes: [], time: { created: 1, updated: 1 } },
      ]),
    }),
  )
  await page.route(`${serverB}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    const data =
      path === "/global/health"
        ? { healthy: true }
        : path === "/project"
          ? [{ id: "env-b", name: "Env B", worktree: directory, sandboxes: [], time: { created: 1, updated: 1 } }]
          : path === "/provider"
            ? { all: [], connected: [], default: {} }
            : ["/session", "/agent", "/skill", "/command", "/permission", "/question", "/lsp", "/formatter"].includes(
                  path,
                )
              ? []
              : {}
    if (path.endsWith("/event")) return route.fulfill({ contentType: "text/event-stream", body: ": ok\n\n" })
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(data) })
  })
  await page.addInitScript(
    ({ serverA, serverB, scheme }) => {
      localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true }, notifications: {} }))
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem("opencode-theme-id", "oc-2")
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem("app-version.v1", JSON.stringify({ version: "1.18.27" }))
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({
          list: [serverB],
          projects: {
            local: [
              { worktree: "/env-project", expanded: true },
              { worktree: "/env-second", expanded: true },
            ],
            [serverB]: [{ worktree: "/env-project", expanded: true }],
          },
        }),
      )
      localStorage.setItem("opencode.window.browser.dat:tabs", "[]")
    },
    { serverA, serverB, scheme },
  )
  await page.goto("/")
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env A", exact: true }).click()
  await page.locator('[data-component="orchestra-sidebar"]').getByRole("button", { name: ".env", exact: true }).click()
  await expect(page.locator('[data-component="env-page"]')).toBeVisible()
  return requests
}

async function importFile(page: Page, content = fixture) {
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: ".env", mimeType: "text/plain", buffer: Buffer.from(content) })
  await expect(page.locator('[data-env-key="TOKEN"]')).toBeVisible()
}

async function bytes(page: Page) {
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "Download .env", exact: true }).click()
  return readFile((await (await download).path())!)
}

async function privateValues(page: Page, requests: string[]) {
  for (const value of [secret, "other-profile", "newest-draft"]) expect(requests.join("\n")).not.toContain(value)
  const storage = await page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((storage) => Object.entries(storage)),
  )
  for (const value of [secret, "other-profile", "newest-draft"]) expect(JSON.stringify(storage)).not.toContain(value)
}

for (const scheme of ["dark", "light"]) {
  test(`${scheme}: import, masked reveal, edit, remove, add and byte-accurate download stay local`, async ({
    page,
  }) => {
    const requests = await setup(page, scheme)
    const chapter = page.locator('[data-component="env-page"]')
    await expect(chapter).toContainText("Open a local file or add your first key.")
    await importFile(page)
    await expect(chapter).not.toContainText(secret)
    expect(await bytes(page)).toEqual(Buffer.from(fixture))
    await expect(page.locator(".env-row")).toHaveCount(4)
    await expect(page.locator(".env-row:not([data-env-key])")).toHaveCount(0)
    await expect(chapter).not.toContainText("# local only")
    await expect(chapter).not.toContainText("opaque directive")
    const preserved = page.locator('[data-slot="env-preserved"]')
    await expect(preserved).toHaveCount(1)
    await expect(preserved).toHaveText("1 unsupported line is preserved as-is in the download (read-only).")
    await expect(preserved.getByRole("button")).toHaveCount(0)
    const token = page.locator('[data-env-key="TOKEN"]')
    await token.getByRole("button", { name: "Show", exact: true }).click()
    await expect(token).toContainText(`${secret}#hash`)
    const layout = await token.evaluate((row) => {
      const key = row.querySelector("strong")!.getBoundingClientRect()
      const value = row.querySelector("pre")!.getBoundingClientRect()
      const style = getComputedStyle(row.querySelector("pre")!)
      return {
        height: row.getBoundingClientRect().height,
        aligned: Math.abs(key.y - value.y) < 2,
        ellipsis: style.textOverflow,
        whitespace: style.whiteSpace,
      }
    })
    expect(layout.height).toBeGreaterThanOrEqual(40)
    expect(layout.height).toBeLessThanOrEqual(44)
    expect(layout.aligned).toBe(true)
    expect(layout.ellipsis).toBe("ellipsis")
    expect(layout.whitespace).toBe("nowrap")
    await token.getByRole("button", { name: "Hide", exact: true }).click()
    await expect(token).not.toContainText(secret)
    await token.getByRole("button", { name: "Edit", exact: true }).click()
    await expect(page.getByLabel("Value", { exact: true })).toHaveAttribute("type", "password")
    await page.getByLabel("Value", { exact: true }).fill(`${secret}-edited`)
    await page.getByRole("button", { name: "Apply changes", exact: true }).click()
    await page.locator('[data-env-key="REMOVE"]').getByRole("button", { name: "Remove", exact: true }).click()
    await expect(page.locator('[data-env-key="REMOVE"]')).toHaveCount(0)
    await page.getByRole("button", { name: "Add key", exact: true }).click()
    await page.getByLabel("Key name", { exact: true }).fill("TOKEN")
    await page.getByRole("button", { name: "Apply changes", exact: true }).click()
    await expect(page.getByRole("alert")).toHaveText("A key with this name already exists.")
    await page.getByLabel("Key name", { exact: true }).fill("BAD-NAME")
    await page.getByRole("button", { name: "Apply changes", exact: true }).click()
    await expect(page.getByRole("alert")).toHaveText(
      "Use a letter or underscore first, then letters, digits, or underscores.",
    )
    await page.getByLabel("Key name", { exact: true }).fill("ADDED")
    await page.getByLabel("Value", { exact: true }).fill("local")
    await page.getByRole("button", { name: "Apply changes", exact: true }).click()
    expect(await bytes(page)).toEqual(
      Buffer.from(
        fixture.replace(`${secret}#hash`, `${secret}-edited`).replace("REMOVE=discard\r\n", "") +
          '\r\nADDED="local"\r\n',
      ),
    )
    await privateValues(page, requests)
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`) })
    await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await page.getByRole("button", { name: "Add key", exact: true }).focus()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Download .env", exact: true })).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(page.getByRole("button", { name: "Add key", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page.getByLabel("Key name", { exact: true })).toBeVisible()
  })
}

test("both directory and server switches start empty; switching back and reloading clear drafts", async ({ page }) => {
  const requests = await setup(page)
  await importFile(page)
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env A2", exact: true }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText("Env A2")
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await importFile(page)
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env A", exact: true }).click()
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await importFile(page)
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env B", exact: true }).click()
  await expect(page.locator('[data-slot="orchestra-profile"]')).toContainText("Env B")
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await expect(page.locator('[data-component="env-page"]')).toContainText("Open a local file or add your first key.")
  await importFile(page, fixture.replace(secret, "other-profile"))
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env A", exact: true }).click()
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await importFile(page)
  await page.reload()
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await privateValues(page, requests)
})

test("invalid UTF-8 import reports an error and preserves the current document", async ({ page }) => {
  await setup(page)
  await importFile(page)
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: "bad.env", mimeType: "text/plain", buffer: Buffer.from([0xff, 0xfe]) })
  await expect(page.getByRole("alert")).toHaveText(
    "Could not read this file as UTF-8. Your previous draft is still available.",
  )
  expect(await bytes(page)).toEqual(Buffer.from(fixture))
})

async function pauseReads(page: Page) {
  // This file API boundary is the only way to deterministically hold a client-side import.
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer
    File.prototype.arrayBuffer = function () {
      if (this.name !== "slow.env") return original.call(this)
      return original.call(this).then(
        (bytes) =>
          new Promise<ArrayBuffer>((resolve) => {
            document.addEventListener(
              "env-test-release",
              () => {
                document.documentElement.dataset.envReadComplete = "true"
                resolve(bytes)
              },
              { once: true },
            )
          }),
      )
    }
  })
}

test("loading and overlapping imports retain the newest document", async ({ page }) => {
  await setup(page)
  await pauseReads(page)
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: "slow.env", mimeType: "text/plain", buffer: Buffer.from(fixture) })
  await expect(page.locator('[data-component="env-page"]')).toHaveAttribute("aria-busy", "true")
  await expect(page.getByText("Reading your file…", { exact: true })).toBeVisible()
  await importFile(page, fixture.replace(secret, "newest-draft"))
  await page.evaluate(() => document.dispatchEvent(new Event("env-test-release")))
  await expect(page.locator("html")).toHaveAttribute("data-env-read-complete", "true")
  expect(await bytes(page)).toEqual(Buffer.from(fixture.replace(secret, "newest-draft")))
})

test("an import finishing after a profile switch cannot replace the new profile document", async ({ page }) => {
  const requests = await setup(page)
  await pauseReads(page)
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: "slow.env", mimeType: "text/plain", buffer: Buffer.from(fixture) })
  await expect(page.locator('[data-component="env-page"]')).toHaveAttribute("aria-busy", "true")
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.getByRole("menuitemradio", { name: "Env B", exact: true }).click()
  await expect(page.locator('[data-component="env-page"]')).toHaveAttribute("aria-busy", "false")
  await importFile(page, fixture.replace(secret, "other-profile"))
  await page.evaluate(() => document.dispatchEvent(new Event("env-test-release")))
  await expect(page.locator("html")).toHaveAttribute("data-env-read-complete", "true")
  expect(await bytes(page)).toEqual(Buffer.from(fixture.replace(secret, "other-profile")))
  await privateValues(page, requests)
})

test("missing file APIs show unavailable and disable local actions", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(URL, "createObjectURL", { value: undefined, configurable: true }),
  )
  await setup(page)
  await expect(
    page.getByText("This browser does not support local file import and download.", { exact: true }),
  ).toBeVisible()
  for (const name of ["Open .env", "Add key", "Download .env"])
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled()
})

test("reload discards the imported values", async ({ page }) => {
  const requests = await setup(page)
  await importFile(page)
  await page.reload()
  await expect(page.locator('[data-component="env-page"]')).toBeVisible()
  await expect(page.locator('[data-env-key="TOKEN"]')).toHaveCount(0)
  await expect(page.locator('[data-component="env-page"]')).toContainText("Open a local file or add your first key.")
  await privateValues(page, requests)
})

test("revealed editor supports multiline values and masks them after applying", async ({ page }) => {
  await setup(page)
  await importFile(page)
  await page.locator('[data-env-key="MULTI"]').getByRole("button", { name: "Edit", exact: true }).click()
  await page.locator(".env-editor").getByRole("button", { name: "Show", exact: true }).click()
  await expect(page.getByLabel("Value", { exact: true })).toHaveValue("first\nsecond")
  await page.getByLabel("Value", { exact: true }).fill("edited\nmultiline")
  await page.getByRole("button", { name: "Apply changes", exact: true }).click()
  await expect(page.locator('[data-env-key="MULTI"]')).not.toContainText("edited")
  expect(await bytes(page)).toEqual(
    Buffer.from(fixture.replace('MULTI="first\r\nsecond"', 'MULTI="edited\\nmultiline"')),
  )
})

test("download errors are shown without losing the document", async ({ page }) => {
  await setup(page)
  await importFile(page)
  await page.evaluate(() =>
    Object.defineProperty(URL, "createObjectURL", {
      value: () => {
        throw new Error("test download failure")
      },
      configurable: true,
    }),
  )
  await page.getByRole("button", { name: "Download .env", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Could not download this file.")
  await expect(page.locator('[data-env-key="TOKEN"]')).toBeVisible()
})

test("comments and blank lines stay out of the list; unsupported lines have one plural read-only notice", async ({
  page,
}) => {
  await setup(page)
  const chapter = page.locator('[data-component="env-page"]')
  const source = "\uFEFF# local comment\r\n \t\r\n\r\n  # another comment\n"
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: ".env", mimeType: "text/plain", buffer: Buffer.from(source) })
  await expect(page.getByRole("button", { name: "Download .env", exact: true })).toBeEnabled()
  await expect(page.locator(".env-row")).toHaveCount(0)
  await expect(page.locator('[data-slot="env-preserved"]')).toHaveCount(0)
  await expect(chapter).not.toContainText("local comment")
  expect(await bytes(page)).toEqual(Buffer.from(source))
  const unsupported = source + "opaque directive\r\nBAD-KEY=value\n"
  await page
    .getByLabel("Open .env", { exact: true })
    .setInputFiles({ name: ".env", mimeType: "text/plain", buffer: Buffer.from(unsupported) })
  const preserved = page.locator('[data-slot="env-preserved"]')
  await expect(preserved).toHaveCount(1)
  await expect(preserved).toHaveText("2 unsupported lines are preserved as-is in the download (read-only).")
  await expect(preserved.getByRole("button")).toHaveCount(0)
  await expect(page.locator(".env-row")).toHaveCount(0)
  await expect(chapter.getByRole("button", { name: "Show", exact: true })).toHaveCount(0)
  await expect(chapter.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0)
  await expect(chapter.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0)
  await expect(chapter).not.toContainText("opaque directive")
  expect(await bytes(page)).toEqual(Buffer.from(unsupported))
})

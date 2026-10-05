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
    const screen = page.locator('[data-mx-page="orchestra-env"]')
    await expect(screen.locator(".mx-eyebrow")).toHaveText("Env A / profile configuration")
    await expect(screen.getByRole("heading", { name: ".env", level: 1 })).toBeVisible()
    await expect(screen.locator(".mx-heading").getByRole("button", { name: "Open .env", exact: true })).toHaveClass(
      /primary/,
    )
    await expect(chapter.locator(".mx-toolbar").first().locator(".mx-badge")).toHaveText("Env A")
    await expect(chapter.locator(".mx-toolbar").nth(1).locator(".mx-badge")).toHaveText("0 keys")
    await expect(chapter.locator(".mx-empty")).toHaveText(
      "No environment keys yet.Open a .env file or add a key to start from an empty list.",
    )
    await importFile(page)
    await expect(chapter).not.toContainText(secret)
    expect(await bytes(page)).toEqual(Buffer.from(fixture))
    await expect(chapter.locator(".mx-empty")).toHaveCount(0)
    await expect(chapter.locator(".mx-toolbar").nth(1).locator(".mx-badge")).toHaveText("4 keys")
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
    // Mock row geometry: the key stacks over its value at the same inline start, both clipped to one line.
    const layout = await token.evaluate((row) => {
      const key = row.querySelector("strong")!.getBoundingClientRect()
      const value = row.querySelector("small")!.getBoundingClientRect()
      return {
        height: row.getBoundingClientRect().height,
        stacked: value.top >= key.bottom - 0.5,
        start: Math.abs(key.left - value.left) < 1,
        clipped: [row.querySelector("strong")!, row.querySelector("small")!].map((element) => {
          const style = getComputedStyle(element)
          return `${style.textOverflow} ${style.whiteSpace} ${style.overflow}`
        }),
      }
    })
    expect(layout.height).toBeGreaterThanOrEqual(58)
    expect(layout.height).toBeLessThanOrEqual(61)
    expect(layout.stacked).toBe(true)
    expect(layout.start).toBe(true)
    expect(layout.clipped).toEqual(["ellipsis nowrap hidden", "ellipsis nowrap hidden"])
    await token.getByRole("button", { name: "Hide", exact: true }).click()
    await expect(token).not.toContainText(secret)
    // The approved edit dialog shows the selected key's current value; the list stays masked.
    await token.getByRole("button", { name: "Edit", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("heading", { name: "Edit TOKEN", exact: true })).toBeVisible()
    await expect(dialog).toContainText("Keep it simple. Changes stay in this page; download to save the file.")
    await expect(dialog.getByLabel("Key", { exact: true })).toHaveValue("TOKEN")
    await expect(dialog.getByLabel("Value", { exact: true })).toHaveValue(`${secret}#hash`)
    await dialog.getByLabel("Value", { exact: true }).fill(`${secret}-edited`)
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(token).not.toContainText(secret)
    const removed = page.locator('[data-env-key="REMOVE"]')
    await removed.getByRole("button", { name: "Remove", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Remove REMOVE?", exact: true })).toBeVisible()
    await expect(dialog).toContainText("This changes the .env draft for Env A.")
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(removed).toHaveCount(1)
    await removed.getByRole("button", { name: "Remove", exact: true }).click()
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click()
    await expect(removed).toHaveCount(0)
    await expect(chapter.locator(".mx-toolbar").nth(1).locator(".mx-badge")).toHaveText("3 keys")
    await page.getByRole("button", { name: "Add key", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: "Add environment key", exact: true })).toBeVisible()
    await dialog.getByLabel("Key", { exact: true }).fill("TOKEN")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("This key already exists.")
    await dialog.getByLabel("Key", { exact: true }).fill("BAD-NAME")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Use a valid environment key name.")
    await dialog.getByLabel("Key", { exact: true }).fill("ADDED")
    await dialog.getByLabel("Value", { exact: true }).fill("local")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(chapter.locator(".mx-toolbar").nth(1).locator(".mx-badge")).toHaveText("4 keys")
    const edited =
      fixture.replace(`${secret}#hash`, `${secret}-edited`).replace("REMOVE=discard\r\n", "") + '\r\nADDED="local"\r\n'
    expect(await bytes(page)).toEqual(Buffer.from(edited))
    // View file previews exactly the bytes Download writes, then closes without leaving values on the page.
    await chapter.getByRole("button", { name: "View file", exact: true }).click()
    await expect(dialog.getByRole("heading", { name: ".env", exact: true })).toBeVisible()
    await expect(dialog).toContainText("Env A · current preview")
    // Exact text, not whitespace-normalized: every line break of the file is shown.
    await expect(dialog.locator("pre")).toHaveJSProperty("textContent", edited.replaceAll("\r\n", "\n"))
    await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(0)
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(chapter).not.toContainText(secret)
    // Search filters by key name only, so typing never probes hidden values.
    const search = chapter.getByRole("textbox", { name: "Search .env", exact: true })
    await search.fill("mul")
    await expect(page.locator(".env-row")).toHaveCount(1)
    await expect(page.locator('[data-env-key="MULTI"]')).toBeVisible()
    await search.fill(secret)
    await expect(page.locator(".env-row")).toHaveCount(0)
    await expect(chapter.locator(".mx-empty")).toHaveText("No keys match your search.")
    await search.fill("")
    await expect(page.locator(".env-row")).toHaveCount(4)
    await privateValues(page, requests)
    await page.screenshot({ path: test.info().outputPath(`${scheme}.png`) })
    await page.evaluate(() => (document.documentElement.dir = "rtl"))
    await page.getByRole("button", { name: "Add key", exact: true }).focus()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "Download .env", exact: true })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByRole("button", { name: "View file", exact: true })).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Shift+Tab")
    await expect(page.getByRole("button", { name: "Add key", exact: true })).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(dialog.getByLabel("Key", { exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Add key", exact: true })).toBeFocused()
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
  await expect(page.locator('[data-component="env-page"] .mx-empty')).toContainText("No environment keys yet.")
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
  await expect(page.locator('[data-component="env-page"] .mx-empty')).toContainText("No environment keys yet.")
  await privateValues(page, requests)
})

test("the edit dialog supports multiline values and the row stays masked after saving", async ({ page }) => {
  await setup(page)
  await importFile(page)
  await page.locator('[data-env-key="MULTI"]').getByRole("button", { name: "Edit", exact: true }).click()
  // A multiline value edits in a textarea so its line breaks survive.
  const value = page.getByRole("dialog").getByLabel("Value", { exact: true })
  await expect(value).toHaveJSProperty("tagName", "TEXTAREA")
  await expect(value).toHaveValue("first\nsecond")
  await value.fill("edited\nmultiline")
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
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
  await expect(chapter.locator(".mx-empty")).toContainText("No environment keys yet.")
  await expect(chapter.locator(".mx-toolbar").nth(1).locator(".mx-badge")).toHaveText("0 keys")
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

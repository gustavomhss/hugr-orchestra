import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "/repo/shortcuts"
// The page formats bindings like every other app surface: Mac glyphs, otherwise Ctrl+ text.
const mac = process.platform === "darwin"
const label = {
  mac: { k: "⌘K", p: "⇧⌘P", t: "⌘T", n: "⌘N", b: "⌘B", y: "⇧⌘Y" },
  other: { k: "Ctrl+K", p: "Ctrl+Shift+P", t: "Ctrl+T", n: "Ctrl+N", b: "Ctrl+B", y: "Ctrl+Shift+Y" },
}[mac ? "mac" : "other"]

test("edit captures a combination, rejects conflicts, fires the new binding instead of the old default and resets", async ({
  page,
}) => {
  await setup(page, "dark")
  await openShortcuts(page)
  const chapter = page.locator('[data-chapter="shortcuts"]')
  await expect(chapter.getByRole("heading", { level: 1 })).toHaveText("Shortcuts")
  await expect(chapter.locator(".mx-eyebrow")).toHaveText("Shortcut repository / profile configuration")
  await expect(chapter.locator(".mx-toolbar .mx-badge")).toHaveText("Shortcut repository")
  await expect(row(page, "command.palette").locator("strong")).toHaveText("Command palette")
  await expect(row(page, "command.palette").locator("small")).toHaveText("General shortcut")
  await expect(row(page, "command.palette").locator("kbd")).toHaveText([label.k, label.p])
  await expect(row(page, "tab.new").locator("strong")).toHaveText("New session")
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([label.t, label.n])
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText([label.b])

  // Positive control: the registered default opens a new session draft from this page.
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press("ControlOrMeta+n")
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-tab-key^="draft:"]')).toHaveCount(1)
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Shortcuts", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)

  await row(page, "tab.new").getByRole("button", { name: "Edit New session shortcut" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Press keys" })).toBeVisible()
  await expect(dialog).toContainText("Shortcut for New session. Existing assignments remain unchanged until Save.")
  const field = dialog.getByRole("textbox", { name: "Key combination" })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(`${label.t}, ${label.n}`)

  // The dialog suspends command keybinds: Home's combination is captured, not run.
  await page.keyboard.press("ControlOrMeta+b")
  await expect(field).toHaveValue(label.b)
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Shortcut already in use: Home")
  await expect(dialog).toBeVisible()
  expect(await keybinds(page)).toEqual({})

  await page.keyboard.press("ControlOrMeta+Shift+Y")
  await expect(field).toHaveValue(label.y)
  await expect(dialog.getByRole("alert")).toBeHidden()
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([label.y])
  await expect.poll(() => keybinds(page)).toEqual({ "tab.new": "mod+shift+y" })

  // The replaced defaults no longer create drafts; the new combination does, exactly once.
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press("ControlOrMeta+n")
  await page.keyboard.press("ControlOrMeta+t")
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)
  await page.keyboard.press("ControlOrMeta+Shift+Y")
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(page.locator('[data-tab-key^="draft:"]')).toHaveCount(2)

  // The binding is stored, not page state: it survives a reload.
  await page.goto("/orchestra/shortcuts", { waitUntil: "domcontentloaded" })
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([label.y])
  await page.screenshot({ path: test.info().outputPath("dark.png") })

  await chapter.getByRole("button", { name: "Reset to defaults" }).click()
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([label.t, label.n])
  await expect.poll(() => keybinds(page)).toEqual({})
  const before = page.url()
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press("ControlOrMeta+n")
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  expect(page.url()).not.toBe(before)
})

test("search, cancel keeps the stored binding, Backspace unassigns and an unchanged Save writes nothing", async ({
  page,
}) => {
  await setup(page, "light")
  await openShortcuts(page)
  const chapter = page.locator('[data-chapter="shortcuts"]')
  const search = chapter.getByRole("searchbox", { name: "Search Shortcuts" })
  await expect(search).toHaveAttribute("placeholder", "Search shortcuts")
  await search.fill("  PALETTE ")
  await expect(chapter.locator("[data-shortcut-id]")).toHaveCount(1)
  await expect(row(page, "command.palette")).toBeVisible()
  // Bindings are searchable by their visible label.
  await search.fill(label.b)
  await expect(row(page, "home.toggle")).toBeVisible()
  await expect(row(page, "tab.new")).toHaveCount(0)
  await expect(row(page, "command.palette")).toHaveCount(0)
  await search.fill("no-such-shortcut")
  await expect(chapter.getByRole("status")).toHaveText("No shortcuts match your search.")
  await expect(chapter.locator("[data-shortcut-id]")).toHaveCount(0)
  await search.fill("")
  await expect(row(page, "tab.new")).toBeVisible()

  const edit = row(page, "home.toggle").getByRole("button", { name: "Edit Home shortcut" })
  const dialog = page.getByRole("dialog")
  const field = dialog.getByRole("textbox", { name: "Key combination" })
  await edit.click()
  await page.keyboard.press("ControlOrMeta+Shift+Y")
  await expect(field).toHaveValue(label.y)
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText([label.b])
  expect(await keybinds(page)).toEqual({})

  await edit.click()
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  expect(await keybinds(page)).toEqual({})

  await edit.click()
  await page.keyboard.press("Backspace")
  await expect(field).toHaveValue("")
  await expect(field).toHaveAttribute("placeholder", "Unassigned")
  await page.screenshot({ path: test.info().outputPath("light-dialog.png") })
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText(["Unassigned"])
  await expect.poll(() => keybinds(page)).toEqual({ "home.toggle": "none" })

  // The freed combination can now be taken by another command without a conflict.
  await row(page, "tab.new").getByRole("button", { name: "Edit New session shortcut" }).click()
  await page.keyboard.press("ControlOrMeta+b")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([label.b])
  await expect.poll(() => keybinds(page)).toEqual({ "home.toggle": "none", "tab.new": "mod+b" })
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press("ControlOrMeta+b")
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
})

function row(page: Page, id: string) {
  return page.locator(`[data-chapter="shortcuts"] [data-shortcut-id="${id}"]`)
}

function keybinds(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "{}").keybinds ?? {})
}

async function openShortcuts(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Shortcuts", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)
}

async function setup(page: Page, scheme: "dark" | "light") {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(
    ({ server, directory, scheme }) => {
      // Seed once per tab so reloads keep the keybinds the test stored.
      if (sessionStorage.getItem("shortcuts-seeded")) return
      sessionStorage.setItem("shortcuts-seeded", "1")
      localStorage.setItem("language.v1", JSON.stringify({ locale: "en" }))
      localStorage.setItem(
        "settings.v3",
        JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }),
      )
      localStorage.setItem("opencode-color-scheme", scheme)
      localStorage.setItem(
        "opencode.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem("opencode.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory, scheme },
  )
  await mockOpenCodeServer(page, {
    provider: { all: [], connected: [], default: {} },
    directory,
    project: {
      id: "shortcuts",
      name: "Shortcut repository",
      worktree: directory,
      vcs: "git",
      sandboxes: [],
      time: { created: 1, updated: 1 },
    },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
}

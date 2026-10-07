import { expect, test, type Page } from "@playwright/test"
import { mockOrchestraServer } from "../utils/mock-server"

const server = "http://127.0.0.1:4096"
const directory = "/repo/shortcuts"

test("edit captures a combination, rejects conflicts, fires the new binding instead of the old default and resets", async ({
  page,
}) => {
  await setup(page, "dark")
  const keys = await openShortcuts(page)
  const chapter = page.locator('[data-chapter="shortcuts"]')
  const drafts = page.locator('[data-tab-key^="draft:"]')
  await expect(chapter.getByRole("heading", { level: 1 })).toHaveText("Shortcuts")
  // The profile name is bidi-isolated (FSI ... PDI), the text form of <bdi>.
  await expect(chapter.locator(".mx-eyebrow")).toHaveText("\u2068Shortcut repository\u2069 / profile configuration")
  await expect(chapter.locator(".mx-toolbar .mx-badge bdi")).toHaveText("Shortcut repository")
  await expect(row(page, "command.palette").locator("strong")).toHaveText("Command palette")
  await expect(row(page, "command.palette").locator("small")).toHaveText("General shortcut")
  await expect(row(page, "command.palette").locator("kbd")).toHaveText([keys.label.k, keys.label.p])
  await expect(row(page, "tab.new").locator("strong")).toHaveText("New session")
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([keys.label.t, keys.label.n])
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText([keys.label.b])

  // Positive control: the registered default opens a new session draft from this page.
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press(`${keys.mod}+n`)
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(drafts).toHaveCount(1)
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Shortcuts", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)

  const edit = row(page, "tab.new").getByRole("button", { name: "Edit New session shortcut" })
  await edit.click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Press keys" })).toBeVisible()
  await expect(dialog).toContainText("Shortcut for New session. Existing assignments remain unchanged until Save.")
  const field = dialog.getByRole("textbox", { name: "Key combination" })
  await expect(field).toBeFocused()
  await expect(field).toHaveValue(`${keys.label.t}, ${keys.label.n}`)

  // The dialog suspends command keybinds: Home's combination is captured (the field shows it),
  // and Home does not run behind the dialog.
  await page.keyboard.press(`${keys.mod}+b`)
  await expect(field).toHaveValue(keys.label.b)
  await stays(page, () => Promise.resolve(new URL(page.url()).pathname), "/orchestra/shortcuts")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog.getByRole("alert")).toHaveText("Shortcut already in use: Home")
  await expect(dialog).toBeVisible()
  await stays(page, () => keybinds(page), {})
  // A rejected Save hands focus back to the field, so the next combination is captured directly.
  await expect(field).toBeFocused()

  await page.keyboard.press(`${keys.mod}+Shift+Y`)
  await expect(field).toHaveValue(keys.label.y)
  await expect(dialog.getByRole("alert")).toBeHidden()
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([keys.label.y])
  // The row stayed mounted, so focus returns to the Edit button that opened the dialog.
  await expect(edit).toBeFocused()
  await expect.poll(() => keybinds(page)).toEqual({ "tab.new": "mod+shift+y" })

  // The replaced defaults no longer create drafts; the new combination does. Keys are handled in
  // order, so once the new combination's draft exists a draft from the old defaults would too:
  // the count must reach 2 and stay there.
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press(`${keys.mod}+n`)
  await page.keyboard.press(`${keys.mod}+t`)
  await page.keyboard.press(`${keys.mod}+Shift+Y`)
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(drafts).toHaveCount(2)
  await stays(page, () => drafts.count(), 2)

  // The binding is stored, not page state: it survives a reload.
  await page.goto("/orchestra/shortcuts", { waitUntil: "domcontentloaded" })
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([keys.label.y])
  await page.screenshot({ path: test.info().outputPath("dark.png") })

  await chapter.getByRole("button", { name: "Reset to defaults" }).click()
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([keys.label.t, keys.label.n])
  await expect.poll(() => keybinds(page)).toEqual({})
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press(`${keys.mod}+n`)
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
  await expect(drafts).toHaveCount(3)
})

test("search, cancel keeps the stored binding, Backspace unassigns, the default again resets and an unchanged Save writes nothing", async ({
  page,
}) => {
  await setup(page, "light")
  const keys = await openShortcuts(page)
  const chapter = page.locator('[data-chapter="shortcuts"]')
  const search = chapter.getByRole("searchbox", { name: "Search Shortcuts" })
  await expect(search).toHaveAttribute("placeholder", "Search shortcuts")
  await search.fill("  PALETTE ")
  await expect(chapter.locator("[data-shortcut-id]")).toHaveCount(1)
  await expect(row(page, "command.palette")).toBeVisible()
  // Bindings are searchable by their visible label.
  await search.fill(keys.label.b)
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
  await expect(field).toBeFocused()
  await page.keyboard.press(`${keys.mod}+Shift+Y`)
  await expect(field).toHaveValue(keys.label.y)
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(edit).toBeFocused()
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText([keys.label.b])
  await stays(page, () => keybinds(page), {})

  await edit.click()
  await expect(field).toBeFocused()
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await stays(page, () => keybinds(page), {})

  await edit.click()
  await expect(field).toBeFocused()
  await page.keyboard.press("Backspace")
  await expect(field).toHaveValue("")
  await expect(field).toHaveAttribute("placeholder", "Unassigned")
  await page.screenshot({ path: test.info().outputPath("light-dialog.png") })
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText(["Unassigned"])
  await expect.poll(() => keybinds(page)).toEqual({ "home.toggle": "none" })
  // The visible "Unassigned" label is searchable too.
  await search.fill("unassigned")
  await expect(chapter.locator("[data-shortcut-id]")).toHaveCount(1)
  await expect(row(page, "home.toggle")).toBeVisible()
  await search.fill("")

  // Capturing the registered default again drops the override instead of storing a copy.
  await edit.click()
  await expect(field).toBeFocused()
  await page.keyboard.press(`${keys.mod}+b`)
  await expect(field).toHaveValue(keys.label.b)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "home.toggle").locator("kbd")).toHaveText([keys.label.b])
  await expect.poll(() => keybinds(page)).toEqual({})

  // A combination freed by unassigning can be taken by another command without a conflict.
  await edit.click()
  await expect(field).toBeFocused()
  await page.keyboard.press("Backspace")
  await expect(field).toHaveValue("")
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect.poll(() => keybinds(page)).toEqual({ "home.toggle": "none" })
  await row(page, "tab.new").getByRole("button", { name: "Edit New session shortcut" }).click()
  await expect(field).toBeFocused()
  await page.keyboard.press(`${keys.mod}+b`)
  await expect(field).toHaveValue(keys.label.b)
  await dialog.getByRole("button", { name: "Save" }).click()
  await expect(dialog).toHaveCount(0)
  await expect(row(page, "tab.new").locator("kbd")).toHaveText([keys.label.b])
  await expect.poll(() => keybinds(page)).toEqual({ "home.toggle": "none", "tab.new": "mod+b" })
  await chapter.getByRole("heading", { level: 1 }).click()
  await page.keyboard.press(`${keys.mod}+b`)
  await expect(page).toHaveURL(/\/new-session\?draftId=/)
})

function row(page: Page, id: string) {
  return page.locator(`[data-chapter="shortcuts"] [data-shortcut-id="${id}"]`)
}

// A negative check only means something once the effect it rules out had time to land: the value
// must hold across a short window, not just at the first read.
async function stays(page: Page, read: () => Promise<unknown>, expected: unknown) {
  for (const _ of Array.from({ length: 8 })) {
    expect(await read()).toEqual(expected)
    await page.waitForTimeout(100)
  }
}

function keybinds(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("settings.v3") ?? "{}").keybinds ?? {})
}

async function openShortcuts(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await page.locator(".orchestra-sidebar").getByRole("button", { name: "Shortcuts", exact: true }).click()
  await expect(page).toHaveURL(/\/orchestra\/shortcuts$/)
  return platformKeys(page)
}

// The app picks its mod key and key labels from navigator.platform, which the browser's device
// emulation sets independently of the host OS, so read it from the page rather than the runner.
async function platformKeys(page: Page) {
  const mac = await page.evaluate(() => /(Mac|iPod|iPhone|iPad)/.test(navigator.platform))
  if (mac) return { mod: "Meta", label: { k: "⌘K", p: "⇧⌘P", t: "⌘T", n: "⌘N", b: "⌘B", y: "⇧⌘Y" } }
  return {
    mod: "Control",
    label: { k: "Ctrl+K", p: "Ctrl+Shift+P", t: "Ctrl+T", n: "Ctrl+N", b: "Ctrl+B", y: "Ctrl+Shift+Y" },
  }
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
      localStorage.setItem("orchestra-color-scheme", scheme)
      localStorage.setItem(
        "orchestra.global.dat:server",
        JSON.stringify({ projects: { local: [{ worktree: directory }] } }),
      )
      localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
    },
    { server, directory, scheme },
  )
  await mockOrchestraServer(page, {
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

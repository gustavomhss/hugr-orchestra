import { expect, test, type Page } from "@playwright/test"
import { setupRelay, type RelayState } from "./relay.fixture"

// Copy, paste and duplicate on the Relay canvas. The keys act through the browser's own copy and paste events, so these
// press the real shortcuts with focus on the canvas and read what the editor then saves.

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const editor = (page: Page) => page.locator('[data-component="relay-editor"]')
const tile = (page: Page, id: string) => canvas(page).locator(`.wf-node[data-id="${id}"] .wf-tile`)
const label = (page: Page, id: string) => canvas(page).locator(`.wf-node[data-id="${id}"] .wf-label`)
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const failures: string[] = []
  errors.set(page, failures)
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

type Saved = {
  nodes: { id: string; name: string; parameters: { checklist?: string } }[]
  connections: Record<string, { main: { node: string }[][] }>
}

async function open(page: Page) {
  await page.goto("/orchestra/workflows/relay-wp-execute", { waitUntil: "domcontentloaded" })
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14, { timeout: 60_000 })
}

// The autosave that follows an edit, as the editor sent it and the server accepted it.
async function saved(page: Page, state: RelayState) {
  const patches = () => state.writes.filter((write) => write.method === "PATCH")
  await expect.poll(() => patches().length).toBeGreaterThan(0)
  await expect(editor(page).locator('.wf-head [data-save="saved"]')).toBeVisible()
  return patches().at(-1)!.body as Saved
}

// The ids of the sequence, from Start along the first wire of each step.
function sequence(body: Saved) {
  const ids = new Map(body.nodes.map((node) => [node.name, node.id]))
  const walk = (name: string | undefined, seen: string[]): string[] =>
    !name || seen.includes(name) ? seen : walk(body.connections[name]?.main[0]?.[0]?.node, [...seen, name])
  return walk("Workflow start", []).map((name) => ids.get(name))
}

const checks = (body: Saved, id: string) =>
  (JSON.parse(body.nodes.find((node) => node.id === id)!.parameters.checklist ?? "[]") as { id: string }[]).map(
    (check) => check.id,
  )
const nameOf = (body: Saved, id: string) => body.nodes.find((node) => node.id === id)?.name

test("clipboard: Ctrl/Cmd+C then V adds the selected steps after the selection with their own ids, names and check ids", async ({
  page,
}) => {
  const state = await setupRelay(page)
  await open(page)
  await tile(page, "green.implement").click()
  await tile(page, "green.gate").click({ modifiers: ["Shift"] })
  await expect(tile(page, "green.implement")).toHaveAttribute("aria-pressed", "true")
  await expect(tile(page, "green.gate")).toHaveAttribute("aria-pressed", "true")

  await page.keyboard.press("ControlOrMeta+c")
  await page.keyboard.press("ControlOrMeta+v")
  await expect(canvas(page).locator(".wf-node")).toHaveCount(16)
  await expect(label(page, "green.implement_2")).toContainText("Implement minimally 2")
  await expect(label(page, "green.gate_2")).toContainText("Green gate 2")
  // The pasted steps are the selection now; the originals are not.
  await expect(tile(page, "green.implement_2")).toHaveAttribute("aria-pressed", "true")
  await expect(tile(page, "green.gate_2")).toHaveAttribute("aria-pressed", "true")
  await expect(tile(page, "green.implement")).toHaveAttribute("aria-pressed", "false")

  const body = await saved(page, state)
  const run = sequence(body)
  expect(run.slice(run.indexOf("green.implement"), run.indexOf("green.implement") + 5)).toEqual([
    "green.implement",
    "green.gate",
    "green.implement_2",
    "green.gate_2",
    "refactor.refactor_or_skip",
  ])
  expect([nameOf(body, "green.implement_2"), nameOf(body, "green.gate_2")]).toEqual([
    "Implement minimally 2",
    "Green gate 2",
  ])
  expect(checks(body, "green.implement_2")).toEqual(["green.implement_2_check_1"])
  expect(checks(body, "green.gate_2")).toEqual([
    "green.gate_2_check_1",
    "green.gate_2_check_2",
    "green.gate_2_check_3",
  ])
  // The originals keep their own checks.
  expect(checks(body, "green.implement")).toEqual(["green-changed-the-source"])
})

test("clipboard: Duplicate step in the right-click menu copies the step right after the original", async ({ page }) => {
  const state = await setupRelay(page)
  await open(page)
  await tile(page, "green.implement").click({ button: "right" })
  await page.getByRole("menuitem", { name: "Duplicate step", exact: true }).click()
  await expect(canvas(page).locator(".wf-node")).toHaveCount(15)
  await expect(label(page, "green.implement_2")).toContainText("Implement minimally 2")

  const body = await saved(page, state)
  const run = sequence(body)
  expect(run.slice(run.indexOf("green.implement"), run.indexOf("green.implement") + 3)).toEqual([
    "green.implement",
    "green.implement_2",
    "green.gate",
  ])
  expect(nameOf(body, "green.implement_2")).toBe("Implement minimally 2")
  expect(checks(body, "green.implement_2")).toEqual(["green.implement_2_check_1"])
  expect(checks(body, "green.implement")).toEqual(["green-changed-the-source"])
})

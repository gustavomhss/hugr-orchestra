import { expect, test, type Page } from "@playwright/test"
import { setupRelay } from "./relay.fixture"

// The Relay canvas in a right-to-left UI. The canvas plane is a coordinate space that reads left to right in every
// language, so steps, wires and the "+" stub have to stay inside the canvas, and a step dropped from the add panel has
// to land where it was released. The page is loaded in Arabic; the Relay copy has no Arabic yet and falls back to English.

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", locale: "en-US" })
test.setTimeout(180_000)
const canvas = (page: Page) => page.locator('[data-component="relay-canvas"]')
const tile = (page: Page, id: string) => canvas(page).locator(`.wf-node[data-id="${id}"] .wf-tile`)
const errors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const failures: string[] = []
  errors.set(page, failures)
  page.on("pageerror", (error) => failures.push(error.stack ?? error.message))
})
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]))

async function openArabic(page: Page) {
  await setupRelay(page)
  // Registered after the fixture's own init script, so the stored language is Arabic when the app starts.
  await page.addInitScript(() => localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale: "ar" })))
  await page.goto("/orchestra/workflows/relay-wp-execute", { waitUntil: "domcontentloaded" })
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 60_000 })
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 })
  await expect(canvas(page).locator(".wf-node")).toHaveCount(14)
}

// What the canvas draws, and which of it lies outside the canvas's own box: a step is its tile, a wire its path and a
// stub its "+" button.
function drawn(page: Page) {
  return canvas(page).evaluate((host) => {
    const area = host.getBoundingClientRect()
    const outside = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.left < area.left - 1 || box.right > area.right + 1 || box.top < area.top - 1 || box.bottom > area.bottom + 1
    }
    const steps = Array.from(host.querySelectorAll<HTMLElement>(".wf-node"))
    const wires = Array.from(host.querySelectorAll(".wf-wire"))
    const stubs = Array.from(host.querySelectorAll(".wf-stub button"))
    return {
      steps: steps.length,
      wires: wires.length,
      stubs: stubs.length,
      outside: [
        ...steps.filter((step) => outside(step.querySelector(".wf-tile")!)).map((step) => `step ${step.dataset.id}`),
        ...wires.flatMap((wire, index) => (outside(wire) ? [`wire ${index}`] : [])),
        ...stubs.flatMap((stub, index) => (outside(stub) ? [`stub ${index}`] : [])),
      ],
    }
  })
}

test("rtl canvas: steps, wires and the + stub are inside the canvas after load and after Fit view", async ({ page }) => {
  await openArabic(page)
  await expect.poll(async () => (await drawn(page)).outside).toEqual([])
  const loaded = await drawn(page)
  expect(loaded.steps).toBe(14)
  expect(loaded.wires).toBeGreaterThan(0)
  expect(loaded.stubs).toBeGreaterThan(0)
  // The plane still reads left to right: Start, then the first step, then the second.
  const left = async (id: string) => (await tile(page, id).boundingBox())!.x
  const [start, first, second] = [await left("relay-start"), await left("bind.bind_scope"), await left("bind.gate")]
  expect(start).toBeLessThan(first)
  expect(first).toBeLessThan(second)

  // Zoomed in, part of the graph is out of view, so what Fit view brings back is real.
  const zoomIn = canvas(page).getByRole("button", { name: "Zoom in (+)" })
  await zoomIn.click()
  await zoomIn.click()
  await zoomIn.click()
  expect((await drawn(page)).outside.length).toBeGreaterThan(0)
  await canvas(page).getByRole("button", { name: "Fit view (1)" }).click()
  await expect.poll(async () => (await drawn(page)).outside).toEqual([])
  expect(await drawn(page)).toMatchObject({ steps: 14, wires: loaded.wires, stubs: loaded.stubs })
})

test("rtl canvas: a step dropped from the add panel lands where it was released", async ({ page }) => {
  await openArabic(page)
  await canvas(page).getByRole("button", { name: "Add step (N)" }).click()
  const drawer = page.locator('[data-component="relay-add-panel"]')
  await expect(drawer).toBeVisible()
  const area = (await canvas(page).boundingBox())!
  // The drawer sits at the end of the reading direction, which is the left edge in Arabic.
  await expect.poll(async () => Math.abs((await drawer.boundingBox())!.x - area.x)).toBeLessThan(2)

  // Released on empty canvas between the first two phases, a little above the wire that joins them.
  const release = await canvas(page).evaluate((host) => {
    const box = (id: string) => host.querySelector(`.wf-node[data-id="${id}"] .wf-tile`)!.getBoundingClientRect()
    const [end, start] = [box("bind.gate"), box("red.write_failing_tests")]
    const at = { x: (end.right + start.left) / 2, y: end.top + end.height / 2 - 30 }
    const target = document.elementFromPoint(at.x, at.y) ?? host
    const data = new DataTransfer()
    data.setData("text/relay-kind", "execute")
    for (const type of ["dragover", "drop"])
      target.dispatchEvent(
        new DragEvent(type, { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: data }),
      )
    return at
  })
  await expect(page).toHaveURL(/\/node\/execute$/)
  const box = (await tile(page, "execute").boundingBox())!
  const after = (await canvas(page).boundingBox())!
  // The step snaps to the 8-unit grid, which is at most 4px at this zoom; a mirrored drop would be over a hundred away.
  // Opening the step can resize the header above the canvas, so measure from the canvas edge, not the viewport.
  expect(Math.abs(box.x + box.width / 2 - after.x - (release.x - area.x))).toBeLessThan(8)
  expect(Math.abs(box.y + box.height / 2 - after.y - (release.y - area.y))).toBeLessThan(8)
})

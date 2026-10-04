import { expect, test } from "bun:test"
import { createMemo, createRenderEffect, createSignal } from "solid-js"
import { createComponent, render } from "solid-js/web"
import solid from "vite-plugin-solid"

// Bun compiles JSX for React. Compile the list with Solid's own transform so the test drives the real
// component, its virtualizer and its keyed rows.
const transform = solid().transform as (source: string, id: string) => Promise<{ code: string }>
Bun.plugin({
  name: "solid-cockpit-list",
  setup(build) {
    build.onLoad({ filter: /orchestra-cockpit-list\.tsx$/ }, async (args) => ({
      contents: (await transform(await Bun.file(args.path).text(), args.path)).code,
      loader: "ts",
    }))
  },
})
const { OrchestraCockpitList } = await import("@/pages/session/orchestra-cockpit-list")

const tasks = (count: number, revision: number) =>
  Array.from({ length: count }, (_, index) => ({ key: `task-${index}`, headline: `Task ${index} (${revision})` }))

test("rows survive the last of 35 running tasks finishing after earlier refreshes", async () => {
  // Rows measure themselves in a microtask; happy-dom reports what those throw as window errors.
  const errors: unknown[] = []
  const report = (event: ErrorEvent) => errors.push(event.error)
  window.addEventListener("error", report)
  // Solid runs a row's computations and the virtualizer's in subscription order, which every refresh
  // reshuffles; a single history would pass or fail by luck.
  for (const refreshes of [0, 1, 2, 3, 4, 5]) {
    const host = document.createElement("div")
    const [items, setItems] = createSignal(tasks(35, 0))
    const dispose = render(
      () =>
        createComponent(OrchestraCockpitList<ReturnType<typeof tasks>[number]>, {
          get items() {
            return items()
          },
          estimate: 40,
          label: "Running",
          children: (item) => {
            // Task and Activity rows read their item in memos (Show, Dynamic) as well as in effects.
            const headline = createMemo(() => item().headline)
            const element = document.createElement("span")
            createRenderEffect(() => (element.textContent = headline()))
            return element
          },
        }),
      host,
    )
    await Promise.resolve()
    for (const revision of Array.from({ length: refreshes }, (_, index) => index + 1)) {
      setItems(tasks(35, revision))
      await Promise.resolve()
    }

    setItems(tasks(34, refreshes))
    await Promise.resolve()

    const rows = [...host.querySelectorAll<HTMLElement>("[data-cockpit-row]")]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.map((row) => row.textContent)).toEqual(rows.map((row) => items()[Number(row.dataset.index)]?.headline))
    expect(rows.map((row) => row.getAttribute("aria-setsize"))).toEqual(rows.map(() => "34"))
    dispose()
  }
  window.removeEventListener("error", report)
  expect(errors).toEqual([])
})

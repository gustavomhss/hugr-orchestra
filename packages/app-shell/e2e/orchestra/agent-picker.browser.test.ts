import { expect, test } from "@playwright/test"

// Production fixture build: real picker, roster, shared dialog stack and application CSS.
// Native checkbox Space behavior is exercised here; Happy DOM does not synthesize it.
test("row, ArrowDown/Enter, switch Space and clear search target models once", async ({ page }, info) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html", { waitUntil: "commit" })
  const search = page.getByRole("combobox")
  const builder = page.getByRole("switch", { name: "Builder", exact: true })
  const reasoner = page.getByRole("switch", { name: "Reasoner", exact: true })
  const writes = () =>
    page
      .getByTestId("writes")
      .textContent()
      .then((value) => JSON.parse(value ?? "[]"))
  await expect(builder).toBeEnabled({ timeout: info.timeout })
  await expect(builder).not.toBeChecked()
  await page.getByRole("button", { name: "Builder", exact: true }).click()
  await expect(builder).toBeChecked()
  expect(await writes()).toHaveLength(1)
  await search.focus()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(reasoner).toBeChecked()
  expect(await writes()).toHaveLength(2)
  await reasoner.focus()
  await page.keyboard.press("Space")
  await expect(reasoner).not.toBeChecked()
  expect(await writes()).toHaveLength(3)
  expect((await writes())[2]).toEqual([{ permission: "task", pattern: "example/reasoner", action: "deny" }])
  await search.fill("Reasoner")
  await expect(page.locator('[data-slot="list-item"]')).toHaveCount(1)
  await page.getByRole("button", { name: "Clear filter", exact: true }).click()
  await expect(search).toHaveValue("")
  await expect(search).toBeFocused()
  await expect(page.locator('[data-slot="list-item"]')).toHaveCount(2)
  await page.keyboard.press("Enter")
  await expect(builder).not.toBeChecked()
  expect(await writes()).toHaveLength(4)
  await page.getByRole("button", { name: "Reasoner", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(reasoner).toBeChecked()
  expect(await writes()).toHaveLength(5)
  expect((await writes())[4]).toEqual([{ permission: "task", pattern: "example/reasoner", action: "allow" }])
})

for (const dir of ["ltr", "rtl"]) {
  test(`${dir}: row ArrowDown Space and search active descendant target the same model`, async ({ page }) => {
    await page.goto(`/e2e/orchestra/agent-picker.fixture.html?dir=${dir}&auto=0`)
    await page.getByTestId("open-picker").click()
    const builder = page.getByRole("button", { name: "Builder", exact: true })
    const reasoner = page.getByRole("button", { name: "Reasoner", exact: true })
    await expect(builder).toBeEnabled()
    await builder.focus()
    await page.keyboard.press("ArrowDown")
    await expect(reasoner).toBeFocused()
    await page.keyboard.press("Space")
    await expect(page.getByRole("switch", { name: "Reasoner", exact: true })).toBeChecked()
    await expect(page.getByRole("switch", { name: "Builder", exact: true })).not.toBeChecked()
    const search = page.getByRole("combobox")
    await search.focus()
    await page.keyboard.press("ArrowUp")
    await expect(search).toBeFocused()
    expect(
      await search.evaluate((input) => {
        const active = document.getElementById(input.getAttribute("aria-activedescendant") ?? "")
        const grid = document.getElementById(input.getAttribute("aria-controls") ?? "")
        return {
          role: active?.getAttribute("role"),
          grid: grid?.getAttribute("role"),
          owned: !!active && grid?.contains(active),
          text: active?.textContent,
        }
      }),
    ).toMatchObject({ role: "gridcell", grid: "grid", owned: true, text: expect.stringContaining("Builder") })
    await page.keyboard.press("Enter")
    await expect(page.getByRole("switch", { name: "Builder", exact: true })).toBeChecked()
  })
}

test("saving and a rejected update preserve switch focus and reject duplicate activation", async ({ page }) => {
  const requests: import("@playwright/test").Route[] = []
  await page.route("**/fixture-save", (route) => {
    requests.push(route)
  })
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?auto=0&remote=1")
  await page.getByTestId("open-picker").click()
  const control = page.getByRole("switch", { name: "Builder", exact: true })
  await expect(control).toBeEnabled()
  await control.focus()
  await page.keyboard.press("Space")
  await expect.poll(() => requests.length).toBe(1)
  await expect(control).toBeFocused()
  expect(await control.evaluate((input) => (input as HTMLInputElement).disabled)).toBe(false)
  await expect(page.locator('[data-component="switch"][aria-busy="true"]')).toHaveCount(2)
  await page.keyboard.press("Space")
  expect(requests).toHaveLength(1)
  await requests[0].fulfill({ status: 200, body: "ok" })
  await expect(control).toBeChecked()
  await expect(control).toBeFocused()
  await page.keyboard.press("Space")
  await expect.poll(() => requests.length).toBe(2)
  await requests[1].fulfill({ status: 503, body: "rejected" })
  await expect(page.getByRole("alert")).toHaveCount(1)
  await expect(control).toBeChecked()
  await expect(control).toBeFocused()
})

test("draft selections honor the supplied pendingKey and inheritance clears it", async ({ page }) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?auto=0&draft=1&pending=server-B-profile-draft-A")
  await page.getByTestId("open-picker").click()
  await page.getByRole("button", { name: "Builder", exact: true }).click()
  await expect(page.getByTestId("pending")).toContainText("example/builder")
  await page.getByRole("button", { name: "Inherit", exact: true }).click()
  await expect(page.getByTestId("pending")).toHaveText("[]")
})

test("5000 models mount a bounded keyed window, retain focus and discard stale pointer targets", async ({ page }) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?count=5000&auto=0")
  await page.getByTestId("open-picker").click()
  const grid = page.getByRole("grid")
  await expect(grid).toHaveAttribute("aria-rowcount", "5050")
  expect(await grid.getByRole("row").count()).toBeLessThanOrEqual(100)
  const stale = await page.getByRole("button", { name: "Model 00005", exact: true }).elementHandle()
  expect(stale).not.toBeNull()
  await stale!.dispatchEvent("pointerdown")
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole("button", { name: "Model 04999", exact: true })).toBeVisible()
  expect(await stale!.evaluate((element) => element.isConnected)).toBe(false)
  await stale!.evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.getByTestId("writes")).toHaveText("[]")
  expect(await grid.getByRole("row").count()).toBeLessThanOrEqual(100)
  const first = page.getByRole("button", { name: "Model 00000", exact: true })
  await first.focus()
  await page.keyboard.press("End")
  const last = page.getByRole("button", { name: "Model 04999", exact: true })
  await expect(last).toBeFocused()
  await page.keyboard.press("Space")
  await expect(page.getByRole("switch", { name: "Model 04999", exact: true })).toBeChecked()
  await expect(page.getByTestId("writes")).toContainText("provider-49/team/model-4999")
  const search = page.getByRole("combobox")
  await search.fill("Model 04242")
  await expect(grid).toHaveAttribute("aria-rowcount", "2")
  await expect(page.getByRole("button", { name: "Model 04242", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Clear filter", exact: true }).click()
  await expect(grid).toHaveAttribute("aria-rowcount", "5050")
  await expect(search).toBeFocused()
})

test("catalog metadata refresh reorders keyed rows without replacing or losing the focused switch", async ({
  page,
}) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?auto=0")
  await page.getByTestId("open-picker").click()
  const control = page.getByRole("switch", { name: "Builder", exact: true })
  await expect(control).toBeEnabled()
  await control.focus()
  const original = await control.elementHandle()
  // Model metadata can refresh independently of user focus (the same boundary as a catalog event).
  await page.getByTestId("refresh-models").evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.getByRole("switch", { name: "Renamed Builder", exact: true })).toBeFocused()
  expect(await original!.evaluate((element) => element === document.activeElement)).toBe(true)
  await page.keyboard.press("Space")
  await expect(page.getByTestId("writes")).toContainText("example/builder")
})

test("roster pagination and search keep stable agent identity with bounded DOM", async ({ page }) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?count=5000&auto=0")
  await page.getByTestId("open-roster").click()
  const roster = page.getByRole("list", { name: "Configured agents" })
  await expect(roster.getByRole("listitem")).toHaveCount(24)
  await page.getByRole("button", { name: "Next agents" }).click()
  await expect(roster.getByRole("listitem", { name: "Agent 00024", exact: true })).toHaveAttribute(
    "aria-posinset",
    "25",
  )
  await page.getByRole("searchbox", { name: "Search agents" }).fill("seat-4999")
  await expect(roster.getByRole("listitem")).toHaveCount(1)
  await roster.getByRole("button", { name: "Configure", exact: true }).click()
  await expect(page.locator("dialog.agents-dialog").getByLabel("Name")).toHaveValue("Agent 04999")
})

test("shared dialog Escape restores openers across push, removal and show replacement", async ({ page }) => {
  await page.goto("/e2e/orchestra/agent-picker.fixture.html?auto=0")
  const opener = page.getByTestId("open-picker")
  await opener.click()
  await expect(page.getByRole("combobox")).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(opener).toBeFocused()
  const connect = page.getByTestId("open-connect")
  await connect.click()
  const nested = page.getByRole("button", { name: "Open nested", exact: true })
  await nested.click()
  await expect(page.getByRole("button", { name: "Inner control", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(nested).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(connect).toBeFocused()
  await connect.click()
  await page.getByRole("button", { name: "Replace dialog", exact: true }).click()
  await expect(page.getByRole("button", { name: "Replacement control", exact: true })).toBeFocused()
  await page.keyboard.press("Escape")
  await expect(connect).toBeFocused()
  await connect.click()
  await page.getByRole("button", { name: "Remove directly", exact: true }).click()
  await expect(connect).toBeFocused()
  await connect.click()
  await page.getByRole("button", { name: "Close with new focus", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByTestId("unrelated")).toBeFocused()
  await opener.click()
  await expect(page.getByRole("combobox")).toBeFocused()
  await opener.evaluate((element) => element.remove())
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  expect(await page.evaluate(() => document.activeElement?.isConnected)).toBe(true)
})

for (const width of [390, 195]) {
  test(`agent editor stacks at ${width}px effective CSS viewport without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto("/e2e/orchestra/agent-picker.fixture.html?auto=0&dir=rtl")
    await page.getByTestId("open-agent").click()
    const dialog = page.locator("dialog.agents-dialog")
    await expect(dialog.getByLabel("Name")).toHaveValue("Agent 00000")
    expect(
      await dialog.evaluate((element) => ({
        overflow: element.scrollWidth > element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        columns: getComputedStyle(element.querySelector(".mx-fields")!).gridTemplateColumns.split(" ").length,
        narrow: [...element.querySelectorAll("input, select, textarea")]
          .filter((field) => field.getBoundingClientRect().width < 80)
          .map((field) => ({ name: field.getAttribute("name"), width: field.getBoundingClientRect().width })),
      })),
    ).toEqual({ overflow: false, pageOverflow: false, columns: 1, narrow: [] })
  })
}

test("switch transitions respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/e2e/orchestra/agent-picker.fixture.html")
  const control = page.getByRole("switch", { name: "Builder", exact: true })
  await expect(control).toBeEnabled()
  expect(
    await page
      .locator('[data-slot="switch-control"], [data-slot="switch-thumb"]')
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).transitionDuration)),
  ).toEqual(["0s", "0s", "0s", "0s"])
})

test("native Chromium 200 percent zoom retains a usable 390px agent editor", async ({ playwright, baseURL }, info) => {
  const { mkdir, writeFile } = await import("node:fs/promises")
  const profile = info.outputPath("native-zoom-profile")
  await mkdir(`${profile}/Default`, { recursive: true })
  // ChromeZoomLevelPrefs uses "x" for the default storage partition and log(1.2) zoom units.
  // https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc
  await writeFile(
    `${profile}/Default/Preferences`,
    JSON.stringify({ partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } } }),
  )
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/e2e/orchestra/agent-picker.fixture.html?auto=0`)
    // Positive control: do not silently substitute CSS zoom or pinch scaling for native browser zoom.
    expect(await page.evaluate(() => ({ width: innerWidth, dpr: devicePixelRatio }))).toEqual({ width: 195, dpr: 2 })
    await page.getByTestId("open-agent").click()
    const dialog = page.locator("dialog.agents-dialog")
    await expect(dialog.getByLabel("Name")).toHaveValue("Agent 00000")
    expect(
      await dialog.evaluate((element) => ({
        overflow: element.scrollWidth > element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        columns: getComputedStyle(element.querySelector(".mx-fields")!).gridTemplateColumns.split(" ").length,
      })),
    ).toEqual({ overflow: false, pageOverflow: false, columns: 1 })
    await dialog.getByLabel("Description").fill("Edited at 200%")
    await dialog.getByRole("button", { name: "Save", exact: true }).click()
    await expect(dialog).toHaveCount(0)
  } finally {
    await context.close()
  }
})

test("production DOM-ready rendering: three samples per picker and roster dataset", async ({ page }, info) => {
  const measurements: {
    kind: string
    count: number
    milliseconds: number[]
    median: number
    rows: number[]
    nodes: number[]
  }[] = []
  for (const kind of ["picker", "roster"]) {
    for (const count of [20, 1000, 5000]) {
      const samples: { milliseconds: number; rows: number; nodes: number }[] = []
      for (const run of [0, 1, 2]) {
        await page.goto(`/e2e/orchestra/agent-picker.fixture.html?count=${count}&auto=0&run=${run}`)
        await page.getByTestId(`open-${kind}`).click()
        const output = page.getByTestId("measurement")
        await expect(output).toHaveAttribute("data-ready", "true")
        const sample = JSON.parse((await output.textContent()) ?? "null")
        expect(sample.kind).toBe(kind)
        expect(sample.count).toBe(count)
        expect(sample.rows).toBeGreaterThan(0)
        expect(sample.rows).toBeLessThanOrEqual(kind === "picker" ? 100 : 24)
        samples.push(sample)
      }
      measurements.push({
        kind,
        count,
        milliseconds: samples.map((sample) => sample.milliseconds),
        median: samples.map((sample) => sample.milliseconds).sort((a, b) => a - b)[1],
        rows: samples.map((sample) => sample.rows),
        nodes: samples.map((sample) => sample.nodes),
      })
    }
  }
  console.log("AGENT_RENDER_METRICS", JSON.stringify(measurements))
  const { writeFile } = await import("node:fs/promises")
  const path = info.outputPath("agent-render-metrics.json")
  await writeFile(path, JSON.stringify(measurements, null, 2))
  await info.attach("agent-render-metrics.json", {
    path,
    contentType: "application/json",
  })
})

import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { evidencePage } from "../orchestra/evidence.fixture"
import { directory, projectID, sessionID } from "../performance/timeline-stability/fixture"

// Visual acceptance of the shipped app, with public synthetic data, not a runtime savings benchmark.
const viewport = { width: 1672, height: 941 }
const output = "PASS\nok\texample.test\t0.004s\n"
const before = Array.from({ length: 30 }, (_, i) => `=== RUN   TestCase${i}\n--- PASS: TestCase${i} (0.00s)\n`).join("") + output
const metric = LeanMetrics.decode({
  version: 1, scope: "standard-registry", engine: "hugr-lean@0.2.0:4e46ae0534937bdf",
  owner: { projectID, location: directory, sessionID, callID: "call_prt_evidence" },
  model: { provider: "opencode", id: "test-model" }, producer: "native-shell", eligible: true,
  status: "applied", reason: "reduced", filterProfile: "go-test-verbose",
  bytes: { before: Buffer.byteLength(before), after: Buffer.byteLength(output), saved: Buffer.byteLength(before) - Buffer.byteLength(output) },
  tokens: { kind: "estimated", counter: "chars-per-token-4", before: Math.round(before.length / 4), after: Math.round(output.length / 4), saved: Math.round(before.length / 4) - Math.round(output.length / 4) },
  durationMs: 0.42,
})
if (!metric) throw new Error("Lean visual demo rejected by production codec")

test.use({ viewport, deviceScaleFactor: 1, serviceWorkers: "block", timezoneId: "UTC" })
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return
  console.log("Lean preview failure DOM:", await page.locator("body").innerText())
  console.log("Lean preview tool wrappers:", await page.locator('[data-component="tool-part-wrapper"]').evaluateAll((tools) => tools.map((tool) => tool.outerHTML)))
})

for (const scheme of ["dark", "light"] as const) {
  test(`Lean production shell ${scheme} pt-BR`, async ({ page }) => {
    await evidencePage(page, {
      protocol: "v1", scheme, command: "go test -v .", output, metadata: { lean: metric },
      title: "Lean · demonstração visual",
    })
    // Keep the existing fixture unchanged; select the app's own native locale and palette at bootstrap.
    await page.addInitScript((scheme) => {
      localStorage.setItem("orchestra-palette", scheme)
      localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale: "br" }))
    }, scheme)
    await page.route("**/global/config", (route) => {
      expect(route.request().method(), "preview config is read-only").toBe("GET")
      return route.fulfill({ json: { tool_output: { lean: { enabled: true } } } })
    })
    await page.setViewportSize(viewport)
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", scheme)
    await expect(page.locator("body")).toHaveAttribute("data-new-layout", "")
    const sidebar = page.locator('[data-component="orchestra-sidebar"]')
    await expect(sidebar).toHaveCSS("width", "230px")
    // Evidence mounts the actual bash ToolPart only when its retained-output tab is opened.
    await page.getByRole("button", { name: "View original output", exact: true }).click()
    const tool = page.locator('[data-timeline-part-id="prt_evidence"]')
    const lean = tool.locator('[data-component="lean-tool-metrics"]')
    await expect(tool).toHaveCount(1)
    await expect(lean).toHaveCount(1)
    await expect(lean.locator('[data-slot="bytes-saved"]')).toHaveText(metric.bytes.saved.toLocaleString("pt-BR"))
    await expect(lean.locator('[data-slot="filter-profile"]')).toHaveText("go-test-verbose")
    await expect(tool.locator('[data-component="bash-output"]')).toContainText(output)
    await tool.scrollIntoViewIfNeeded()
    await expect(tool).toBeInViewport({ ratio: 1 })
    await expect(tool.locator('[data-component="bash-output"]')).toBeInViewport({ ratio: 1 })
    await expect(lean).toBeInViewport({ ratio: 1 })
    await capture(page, "tool", scheme)
    if (scheme === "light") return

    await page.locator('[data-action="session-review-toggle"]').click()
    const context = page.getByRole("tab", { name: "Contexto", exact: true })
    await context.click()
    await expect(context).toHaveAttribute("aria-selected", "true")
    const project = page.locator('[data-component="lean-project-metrics"]')
    await expect(project.getByRole("heading", { name: "Métricas Lean do repositório", exact: true })).toBeVisible()
    await expect(project).toContainText(projectID)
    await expect(project).toContainText("Somente histórico carregado")
    await expect(project.locator("dl > div").filter({ has: page.getByText("Chamadas observadas", { exact: true }) }).locator("dd")).toHaveText("1")
    await expect(project.locator("dl > div").filter({ has: page.getByText("Bytes economizados (UTF-8)", { exact: true }) }).locator("dd")).toHaveText(metric.bytes.saved.toLocaleString("pt-BR"))
    await project.scrollIntoViewIfNeeded()
    await expect(project.getByRole("heading", { name: "Métricas Lean do repositório", exact: true })).toBeInViewport({ ratio: 1 })
    await capture(page, "context", scheme)

    await page.keyboard.press("ControlOrMeta+Comma")
    const settings = page.locator(".settings-v2-dialog")
    await expect(settings).toBeVisible()
    const toggle = settings.locator('[data-action="settings-lean"] input[type="checkbox"]')
    await expect(toggle).toBeEnabled()
    await expect(toggle).toBeChecked()
    const row = settings.locator('[data-component="settings-v2-row"]').filter({ has: page.locator('[data-action="settings-lean"]') })
    await expect(row.locator('[data-slot="settings-v2-row-title"]')).toHaveText("Saída de ferramentas Lean")
    await row.scrollIntoViewIfNeeded()
    await expect(row).toBeInViewport({ ratio: 1 })
    await capture(page, "settings", scheme)
  })
}

async function capture(page: Page, surface: string, scheme: "dark" | "light") {
  await page.mouse.move(viewport.width / 2, viewport.height - 1)
  await page.evaluate(() => document.fonts.ready)
  const facts = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-component="orchestra-sidebar"]')!
    const body = getComputedStyle(document.body)
    const font = [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family)
    const logo = [...sidebar.querySelectorAll<HTMLImageElement>(".orchestra-brand img")].find((image) => image.getBoundingClientRect().width > 0)
    return {
      locale: document.documentElement.lang, scheme: document.documentElement.dataset.colorScheme,
      palette: localStorage.getItem("orchestra-palette"), font, fontFamily: getComputedStyle(sidebar).fontFamily,
      shellBackground: body.getPropertyValue("--orchestra-shell-background").trim(),
      sidebarWidth: sidebar.getBoundingClientRect().width,
      toolbarHeight: document.querySelector('[data-slot="titlebar-v2"]')!.getBoundingClientRect().height,
      logoLoaded: !!logo?.complete && logo.naturalWidth > 0,
    }
  })
  expect(facts.locale).toBe("pt-BR")
  expect(facts.scheme).toBe(scheme)
  expect(facts.palette).toBe(scheme)
  expect(facts.font.some((name) => name.includes("Inter")), "bundled native font loaded").toBe(true)
  expect(facts.fontFamily).toContain("Mx Inter")
  expect(facts.shellBackground).toBe(scheme === "dark" ? "#0e141b" : "#e9ecf0")
  expect(facts.sidebarWidth).toBe(230)
  expect(facts.toolbarHeight).toBe(45)
  expect(facts.logoLoaded).toBe(true)
  const out = path.resolve("e2e/test-results/lean-visual")
  await mkdir(out, { recursive: true })
  const file = `lean-${surface}--${scheme}-pt-BR--1672x941.png`
  await page.screenshot({ path: path.join(out, file), animations: "disabled" })
  await writeFile(path.join(out, file.replace(".png", ".json")), JSON.stringify({
    file, surface, viewport, dpr: 1, source: test.info().config.metadata.source, facts,
    demo: "Synthetic public Go30 result and codec-validated numeric decision; not measured runtime savings.",
    owner: metric!.owner, coverage: "loaded-history", transport: "existing read-only v1 fixture",
    components: ["Orchestra shell", "LeanToolMetrics", ...(surface === "tool" ? [] : ["SessionContextTab/LeanProjectMetrics"]),
      ...(surface === "settings" ? ["SettingsGeneralV2/LeanSetting"] : [])],
  }, null, 2) + "\n")
}

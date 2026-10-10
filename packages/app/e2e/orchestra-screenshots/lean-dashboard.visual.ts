import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { expect, test, type Page } from "@playwright/test"
import { Schema } from "effect"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { mockOrchestraServer } from "../utils/mock-server"

// Internal MIT donor: packages/app/e2e/orchestra/compact-navigation.fixture.ts at
// cc726a13aaf211f831cc7a039cff8df635d4743d; storage seed adapted for two public demos and pt-BR.
// mock-server.ts and orchestra-screenshots/playwright.config.ts reused by import at the same pin.
const profiles = [
  { id: "compact-project", name: "HuGR-Lean", worktree: "/work/compact-navigation" },
  { id: "orchestra-demo", name: "Orchestra", worktree: "/work/orchestra" },
].map((project) => ({ ...project, vcs: "git", sandboxes: [], time: { created: 1, updated: 1 } }))
const decode = Schema.decodeUnknownSync(LeanDashboard.Info)
const fmt = (value: number) => new Intl.NumberFormat("pt-BR", { signDisplay: "exceptZero" }).format(value)
const demo = (index: number) => {
  const items = LeanCoverage.items.map((item, position) => {
    const bytes = item.mode === "preserve" ? 0 : (position + 1) * (index ? 3072 : 12288)
    return { id: item.id, enabled: index ? position % 3 === 2 : position % 4 !== 2,
      savings: { bytesSaved: bytes, tokensSaved: bytes / 4, calls: bytes ? 2 : 0, tokenCalls: bytes ? 2 : 0 } }
  })
  return decode({ scope: { profileID: profiles[index].worktree, projectID: profiles[index].id, directory: profiles[index].worktree },
    engine: "HuGR-Lean synthetic public demo", enabled: true, complete: true, coverage: "saved-profile-history", items,
    savings: items.reduce((sum, item) => ({ bytesSaved: sum.bytesSaved + item.savings.bytesSaved,
      tokensSaved: sum.tokensSaved + item.savings.tokensSaved, calls: sum.calls + item.savings.calls,
      tokenCalls: sum.tokenCalls + item.savings.tokenCalls }), { bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 }),
  })
}

test.use({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1, locale: "pt-BR", timezoneId: "UTC", serviceWorkers: "block" })

test("native Lean production page: profiles, controls, history and dark/light captures", async ({ page }) => {
  const data = profiles.map((_, index) => demo(index))
  const requests: { method: string; directory: string; path: string; body?: LeanDashboard.Update }[] = []
  await mockOrchestraServer(page, { directory: profiles[0].worktree, project: profiles[0],
    provider: { all: [], connected: [], default: {} }, sessions: [], pageMessages: () => ({ items: [] }) })
  await page.addInitScript(({ profiles }) => {
    const server = "http://127.0.0.1:4096"
    const directory = profiles[0].worktree
    localStorage.setItem("settings.v3", JSON.stringify({ general: { newLayoutDesigns: true, shouldDisplayTabsToast: false } }))
    const projects = profiles.map((project) => ({ worktree: project.worktree, expanded: true }))
    localStorage.setItem("orchestra.global.dat:server", JSON.stringify({ list: [server],
      projects: { local: projects, [server]: projects }, lastProject: { local: directory, [server]: directory } }))
    localStorage.setItem("orchestra-theme-id", "oc-2")
    localStorage.setItem("orchestra-color-scheme", "dark")
    localStorage.setItem("orchestra.global.dat:language", JSON.stringify({ locale: "br" }))
    localStorage.setItem("orchestra.global.dat:layout", JSON.stringify({ home: { selection: { server, directory } } }))
  }, { profiles })
  await page.route((url) => url.port === "4096" && ["/project", "/project/current", "/path"].includes(url.pathname), (route) => {
    const url = new URL(route.request().url())
    const directory = url.searchParams.get("directory") ?? decodeURIComponent(route.request().headers()["x-orchestra-directory"] ?? profiles[0].worktree)
    const project = profiles.find((project) => project.worktree === directory)
    expect(project, `known demo directory for ${url.pathname}`).toBeDefined()
    return route.fulfill({ json: url.pathname === "/project" ? profiles : url.pathname === "/project/current" ? project
      : { directory, worktree: directory, state: directory, config: directory, home: "/work" },
      headers: { "access-control-allow-origin": "*" } })
  })
  await page.route((url) => url.port === "4096" && url.pathname.startsWith("/project/lean"), (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-orchestra-directory", "access-control-allow-methods": "GET,PATCH,OPTIONS" }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    const directory = url.searchParams.get("directory")!
    const index = profiles.findIndex((profile) => profile.worktree === directory)
    expect(index, "SDK directory stays within public demo profiles").toBeGreaterThanOrEqual(0)
    expect(request.headers()["x-orchestra-directory"]).toBe(request.method() === "GET" ? undefined : encodeURIComponent(directory))
    const body = request.method() === "PATCH" ? Schema.decodeUnknownSync(LeanDashboard.Update)(request.postDataJSON()) : undefined
    requests.push({ method: request.method(), directory, path: url.pathname, body })
    if (body) data[index] = decode(body.itemID ? { ...data[index], items: data[index].items.map((item) => item.id === body.itemID ? { ...item, enabled: body.enabled } : item) }
      : { ...data[index], enabled: body.enabled })
    if (url.pathname === "/project/lean") return route.fulfill({ headers, json: data[index] })
    const itemID = Schema.decodeUnknownSync(LeanCoverage.ItemID)(url.pathname.split("/").at(-1))
    expect(request.method()).toBe("GET")
    const savings = data[index].items.find((item) => item.id === itemID)!.savings
    const history = Schema.decodeUnknownSync(LeanDashboard.History)({ scope: data[index].scope, itemID, complete: true,
      executions: ["completed", "error"].map((status, position) => ({ sessionID: "demo-session", messageID: `demo-message-${position}`,
        partID: `demo-part-${position}`, callID: `demo-call-${position}`, itemID, command: position ? "cargo test --workspace --test preservation" : "cargo test --workspace --all-features",
        commandTruncated: false, status, exit: position, time: Date.UTC(2026, 9, 10, 10, 32 - position * 7),
        bytesSaved: position ? 0 : savings.bytesSaved, tokensSaved: position ? 0 : savings.tokensSaved })) })
    return route.fulfill({ headers, json: history })
  })
  const manifest: unknown[] = []
  const sidebar = page.locator('[data-component="orchestra-sidebar"]')
  const lean = page.locator('[data-mx-page="orchestra-lean"]')
  const rows = lean.locator("[data-lean-item]")
  const cargo = lean.locator('[data-lean-item="cargo"]')
  const search = lean.getByRole("searchbox", { name: "Buscar itens…", exact: true })
  await page.goto("/orchestra/lean")
  await expect(lean.getByRole("heading", { name: "Lean", exact: true })).toBeVisible()
  await expect(lean.locator(".mx-eyebrow")).toHaveText("Perfil Orchestra · HuGR-Lean")
  await expect(rows).toHaveCount(32)
  await expect(lean.getByRole("columnheader")).toHaveText(["Item", "Bytes economizados", "Tokens economizados estimados", "Ativado / desativado"])
  for (const item of data[0].items) {
    const row = lean.locator(`[data-lean-item="${item.id}"]`)
    await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", String(item.enabled))
    await expect(row.locator('[data-lean-value="bytes"]')).toHaveAttribute("title", `Bytes UTF-8 exatos: ${fmt(item.savings.bytesSaved!)}`)
    await expect(row.locator('[data-lean-value="tokens"]')).toHaveText(fmt(item.savings.tokensSaved!))
  }
  const earned = await lean.locator('[data-lean-total="bytes"]').getAttribute("title")
  const patch = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/project/lean")
  await cargo.getByRole("switch").click()
  expect((await patch).status()).toBe(200)
  await expect(cargo.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  await expect(cargo.getByRole("switch")).toBeEnabled()
  await expect(lean.locator('[data-lean-total="tokens"]')).toHaveText(fmt(data[0].savings.tokensSaved!))
  await expect(lean.locator('[data-lean-total="bytes"]')).toHaveAttribute("title", earned!)
  await capture(page, "dashboard-dark", manifest, requests, data[0])
  await search.fill("cargo")
  await expect(rows).toHaveCount(1)
  const history = page.waitForResponse((response) => new URL(response.url()).pathname === "/project/lean/history/cargo")
  await cargo.getByRole("button", { name: "Cargo", exact: true }).click()
  expect((await history).status()).toBe(200)
  await expect(lean.locator("[data-lean-execution]")).toHaveCount(2)
  await expect(lean.locator(".lean-detail code")).toHaveText(["cargo test --workspace --all-features", "cargo test --workspace --test preservation"])
  await expect(lean.locator(".lean-detail time")).toHaveCount(2)
  expect(await lean.locator(".lean-detail time").evaluateAll((times) => times.map((time) => time.getAttribute("datetime"))))
    .toEqual(["2026-10-10T10:32:00.000Z", "2026-10-10T10:25:00.000Z"])
  await expect(lean.locator(".lean-execution-meta .mx-badge")).toHaveText(["Concluída", "Falhou"])
  await expect(lean.locator('.lean-detail [data-lean-value="bytes"]')).toHaveText([fmt(12288), fmt(0)])
  await expect(lean.locator('.lean-detail [data-lean-value="tokens"]')).toHaveText([fmt(3072), fmt(0)])
  await expect(lean.locator(".lean-detail-row > td")).toHaveCSS("text-align", "start")
  const alignment = await lean.locator(".lean-detail code").evaluateAll((commands) => commands.map((command) => {
    const text = document.createRange()
    text.selectNodeContents(command)
    return { textAlign: getComputedStyle(command).textAlign, textLeft: text.getBoundingClientRect().left,
      commandLeft: command.getBoundingClientRect().left,
      metadataLeft: command.parentElement!.querySelector(".lean-execution-meta")!.getBoundingClientRect().left }
  }))
  for (const command of alignment) {
    expect(command.textAlign).toBe("start")
    expect(command.textLeft).toBeCloseTo(command.commandLeft, 1)
    expect(command.textLeft).toBeCloseTo(command.metadataLeft, 1)
  }
  await capture(page, "detail-dark", manifest, requests, data[0])
  await lean.getByRole("button", { name: "Fechar histórico", exact: true }).click()
  await lean.getByRole("combobox", { name: "Filtrar por categoria", exact: true }).selectOption("test")
  await search.fill("est")
  await expect(rows).toHaveCount(3)
  await expect(rows.locator("bdi")).toHaveText(["pytest", "Jest", "Vitest"])
  await expect(lean.locator(".mx-note")).toHaveText("Bytes em UTF-8. Tokens são estimativas locais com sinal (caracteres ÷ 4), não uso faturado. Medições ausentes são indisponíveis.")
  await capture(page, "frameworks-dark", manifest, requests, data[0])
  await search.fill("")
  await lean.getByRole("combobox").selectOption("all")
  await expect(rows).toHaveCount(32)
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light")
  await capture(page, "dashboard-light", manifest, requests, data[0])
  await page.locator('[data-slot="orchestra-theme-toggle"]').click()
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark")
  await sidebar.locator('[data-slot="orchestra-profile"]').click()
  await expect(page.getByRole("menuitemradio", { name: "Orchestra", exact: true })).toBeEnabled()
  const switched = page.waitForResponse((response) => new URL(response.url()).pathname === "/project/lean" && new URL(response.url()).searchParams.get("directory") === profiles[1].worktree)
  await page.getByRole("menuitemradio", { name: "Orchestra", exact: true }).click()
  expect((await switched).status()).toBe(200)
  await expect(lean.locator(".mx-eyebrow")).toHaveText("Perfil Orchestra · Orchestra")
  await expect(sidebar.locator("#orchestra-profile-name")).toHaveText("Orchestra")
  await expect(rows).toHaveCount(32)
  await expect(lean.locator('[data-lean-total="tokens"]')).toHaveText(fmt(data[1].savings.tokensSaved!))
  await expect(cargo.getByRole("switch")).toHaveAttribute("aria-checked", "false")
  await expect(lean.locator('[data-lean-item="pytest"]').getByRole("switch")).toHaveAttribute("aria-checked", "true")
  await expect(lean.locator('[data-lean-item="go"]').getByRole("switch")).toHaveAttribute("aria-checked", "false")
  await capture(page, "profileB-dark", manifest, requests, data[1])
  await page.setViewportSize({ width: 1366, height: 768 })
  await expect(sidebar).toHaveCSS("width", "230px")
  await expect(lean.locator(".lean-table-wrap")).toBeInViewport()
  expect(await lean.locator(".lean-table-wrap").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(requests.filter((request) => request.method === "PATCH")).toEqual([{ method: "PATCH", directory: profiles[0].worktree, path: "/project/lean", body: { itemID: "cargo", enabled: false } }])
  await writeFile(path.join(process.env.ORCHESTRA_VISUAL_OUT!, "manifest.json"), JSON.stringify({ synthetic: true,
    polishDependency: "ae0f158f08712b28f64ab1445fc7712e793120fe", detailAlignment: alignment,
    base: "cc726a13aaf211f831cc7a039cff8df635d4743d", source: process.env.LEAN_VISUAL_SOURCE, captures: manifest }, null, 2) + "\n")
})

async function capture(page: Page, name: string, manifest: unknown[], requests: unknown[], profile: LeanDashboard.Info) {
  const lean = page.locator('[data-mx-page="orchestra-lean"]')
  await expect(lean.locator(".lean-count:has(.lean-count-total) dd")).toHaveText(
    `${profile.enabled ? profile.items.filter((item) => item.enabled).length : 0} / ${LeanCoverage.items.length}`,
  )
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR")
  await expect(page.locator("body")).toHaveAttribute("data-new-layout", "")
  await expect(page.locator('[data-component="orchestra-sidebar"]')).toHaveCSS("width", "230px")
  await expect(page.locator('[data-slot="titlebar-v2"]')).toHaveCSS("height", "45px")
  await expect(page.getByRole("img", { name: "HuGR", exact: true })).toBeVisible()
  await expect(page.getByRole("img", { name: "HuGR", exact: true })).toHaveCSS("width", "121px")
  expect(await page.getByRole("img", { name: "HuGR", exact: true }).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(lean.locator("h1")).toHaveCSS("font-family", /Mx Inter Medium/)
  await expect(lean.locator('[role="alert"]')).toHaveCount(0)
  await expect(lean.locator("pre")).toHaveCount(0)
  await expect(page.getByRole("complementary", { name: "Diagnóstico de desempenho de desenvolvimento", exact: true })).toHaveCount(0)
  await page.mouse.move(836, 940)
  const out = process.env.ORCHESTRA_VISUAL_OUT
  if (!out || !process.env.LEAN_VISUAL_SOURCE) throw new Error("Capture requires explicit output directory and source pin")
  await mkdir(out, { recursive: true })
  await page.screenshot({ path: path.join(out, `${name}.png`), animations: "disabled" })
  const measured = await lean.evaluate((element) => {
    const box = (target: Element | null) => {
      if (!target) throw new Error("Missing native capture element")
      const rect = target.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return { viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio,
      scheme: document.documentElement.dataset.colorScheme, locale: document.documentElement.lang,
      ownerLabel: element.querySelector(".mx-eyebrow")?.textContent,
      font: getComputedStyle(element).fontFamily, fontsLoaded: document.fonts.check('16px "Mx Inter"') && document.fonts.check('16px "Mx Inter Medium"'),
      sidebar: box(document.querySelector('[data-component="orchestra-sidebar"]')),
      page: box(element), table: box(element.querySelector(".lean-table")), summary: element.querySelector(".lean-summary")?.textContent,
      rows: [...element.querySelectorAll("[data-lean-item]")].map((row) => ({ id: row.getAttribute("data-lean-item"),
        bytes: row.querySelector('[data-lean-value="bytes"]')?.textContent, tokens: row.querySelector('[data-lean-value="tokens"]')?.textContent,
        enabled: row.querySelector('[role="switch"]')?.getAttribute("aria-checked") })),
    }
  })
  expect(measured.fontsLoaded).toBe(true)
  expect(measured.dpr).toBe(1)
  expect(measured.table.x).toBeGreaterThan(measured.sidebar.x + measured.sidebar.width)
  expect(measured.table.x + measured.table.width).toBeLessThanOrEqual(measured.viewport.width)
  manifest.push({ file: `${name}.png`, ...measured, requests: structuredClone(requests), bundle: test.info().config.metadata.source })
}

import assert from "node:assert/strict"
import path from "node:path"
import type { ElectronAPI } from "../src/preload/types"
import type { LeanDashboard } from "../../schema/src/lean-dashboard"
import { bounded, expect, type OwnedCandidate } from "./lean-candidate-runtime.fixture"
import type { NativeRun } from "./lean-candidate-native.fixture"

export async function seedNativeRenderer(candidate: OwnedCandidate, directories: string[]) {
  // Explicit public fixture state, written through the production preload/persist format.
  // DesktopMemoryRouter reads this exact last-active URL key on reload.
  await bounded("public renderer fixture persistence", candidate.page.evaluate(async (directories) => {
    const api = (window as unknown as { api: ElectronAPI }).api
    await api.finishFirstLaunchOnboarding(false)
    await api.storeSet("orchestra.global.dat", "language", JSON.stringify({ locale: "en" }))
    await api.storeSet("orchestra.global.dat", "server", JSON.stringify({ list: [],
      projects: { local: directories.map((worktree) => ({ worktree, expanded: true })) },
      lastProject: { local: directories[0] }, recentlyClosed: {} }))
    await api.storeSet("orchestra.global.dat", "layout", JSON.stringify({ home: { selection: { server: "sidecar", directory: directories[0] } } }))
    const id = await api.getWindowID()
    localStorage.setItem(`orchestra.desktop.window.${id}.last-active-url`, "/orchestra/lean")
  }, directories))
  await candidate.page.reload()
  await expect(candidate.page.locator('[data-component="orchestra-chapter"][data-chapter="lean"]')).toBeVisible()
}

export async function verifyNativeRows(candidate: OwnedCandidate, info: LeanDashboard.Info) {
  const page = candidate.page
  await expect(page.locator("[data-lean-item]")).toHaveCount(32)
  assert.equal(info.items.length, 32)
  await expect(page.locator('.lean-control [role="switch"]')).toHaveAttribute("aria-checked", String(info.enabled))
  const signed = (value: number | null) => {
    assert.ok(value !== null, "Public fixture savings unexpectedly unavailable")
    return new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" }).format(value)
  }
  const visibleBytes = (value: number | null) => {
    assert.ok(value !== null && Number.isSafeInteger(value))
    const magnitude = Math.abs(value)
    const [unit, suffix]: [number, string] = magnitude >= 1048576 ? [1048576, " MiB"] : magnitude >= 1024 ? [1024, " KiB"] : [1, ""]
    return new Intl.NumberFormat("en-US", { signDisplay: "exceptZero", maximumFractionDigits: 2 }).format(value / unit) + suffix
  }
  await expect(page.locator('[data-lean-total="bytes"]')).toHaveAttribute("title", `Exact UTF-8 bytes: ${signed(info.savings.bytesSaved)}`)
  await expect(page.locator('[data-lean-total="bytes"]')).toHaveJSProperty("textContent", visibleBytes(info.savings.bytesSaved))
  await expect(page.locator('[data-lean-total="tokens"]')).toHaveText(signed(info.savings.tokensSaved))
  await expect(page.locator(".lean-table thead th").nth(2)).toHaveText("Estimated tokens saved")
  for (const item of info.items) {
    const row = page.locator(`[data-lean-item="${item.id}"]`)
    await expect(row.locator('[role="switch"]')).toHaveAttribute("aria-checked", String(item.enabled))
    await expect(row.locator('[data-lean-value="bytes"]')).toHaveAttribute("title", `Exact UTF-8 bytes: ${signed(item.savings.bytesSaved)}`)
    await expect(row.locator('[data-lean-value="bytes"]')).toHaveJSProperty("textContent", visibleBytes(item.savings.bytesSaved))
    await expect(row.locator('[data-lean-value="tokens"]')).toHaveText(signed(item.savings.tokensSaved))
  }
  await bounded("actual renderer font readiness", page.evaluate(async () => { await document.fonts.ready }))
  const fonts = await bounded("actual renderer font loads", page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => /\.(woff2?|ttf|otf)(\?|$)/.test(entry.name)).map((entry) => entry.name)))
  assert.ok(fonts.length > 0, "Actual renderer did not load packaged fonts")
  assert.ok(fonts.every((url) => url.startsWith("oc://renderer/")), "Renderer fonts escaped the packaged source")
}

export async function selectNativeProfile(candidate: OwnedCandidate, directory: string, expected: LeanDashboard.Info) {
  const page = candidate.page
  const loaded = page.waitForResponse((response) => response.request().method() === "GET" &&
    new URL(response.url()).pathname === "/project/lean" && new URL(response.url()).searchParams.get("directory") === directory)
  await page.locator('[data-slot="orchestra-profile"]').click()
  await page.locator('[data-component="orchestra-profile-picker"]').getByRole("menuitemradio", { name: path.basename(directory), exact: true }).click()
  assert.deepEqual(await (await loaded).json(), expected, "Actual profile picker read the wrong backend owner")
  await expect(page.locator("#orchestra-profile-name")).toHaveText(path.basename(directory))
  const selected = await bounded("native selected profile persistence", page.evaluate(async () => {
    const api = (window as unknown as { api: ElectronAPI }).api
    return JSON.parse((await api.storeGet("orchestra.global.dat", "layout"))!).home.selection
  }))
  assert.deepEqual(selected, { server: "sidecar", directory })
  await verifyNativeRows(candidate, expected)
  await expect(page.locator("[data-lean-execution]")).toHaveCount(0)
}

export async function nativeItemToggle(candidate: OwnedCandidate, itemID: string, enabled: boolean) {
  const page = candidate.page
  const patch = page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/project/lean")
  await page.locator(`[data-lean-item="${itemID}"] [role="switch"]`).click()
  const response = await patch
  assert.ok(response.ok(), "Actual renderer item PATCH failed")
  assert.deepEqual(response.request().postDataJSON(), { itemID, enabled }, "Renderer item control patched unrelated settings")
  await expect(page.locator(`[data-lean-item="${itemID}"] [role="switch"]`)).toHaveAttribute("aria-checked", String(enabled))
}

export async function nativeMasterToggle(candidate: OwnedCandidate, enabled: boolean) {
  const patch = candidate.page.waitForResponse((response) => response.request().method() === "PATCH" && new URL(response.url()).pathname === "/project/lean")
  await candidate.page.locator('.lean-control [role="switch"]').click()
  const response = await patch
  assert.ok(response.ok(), "Actual renderer master PATCH failed")
  assert.deepEqual(response.request().postDataJSON(), { enabled }, "Renderer master control patched item preferences")
  await expect(candidate.page.locator('.lean-control [role="switch"]')).toHaveAttribute("aria-checked", String(enabled))
}

export async function nativeHistory(candidate: OwnedCandidate, directory: string, itemID: string, runs: NativeRun[]) {
  const history = await candidate.request<LeanDashboard.History>(`project/lean/history/${itemID}`, "GET", undefined, directory)
  assert.equal(history.executions.length, runs.length)
  assert.equal(history.scope.directory, directory)
  await candidate.page.locator(`#lean-trigger-${itemID}`).click()
  await expect(candidate.page.locator("[data-lean-execution]")).toHaveCount(runs.length)
  for (const run of runs) {
    const execution = history.executions.find((entry) => entry.callID === run.tool.callID)
    assert.ok(execution, "Actual native history omitted durable tool identity")
    assert.equal(execution.sessionID, run.session.id)
    assert.equal(execution.messageID, run.tool.messageID)
    assert.equal(execution.partID, run.tool.id)
    const originalCommand = run.tool.state.input.command
    assert.ok(typeof originalCommand === "string", "Original native tool command is missing")
    assert.equal(execution.command, originalCommand, "History rewrote the original native tool command")
    assert.equal(execution.commandTruncated, false)
    assert.equal(execution.bytesSaved, run.metric.bytes.saved)
    assert.ok(run.metric.tokens.kind === "estimated")
    assert.equal(execution.tokensSaved, run.metric.tokens.saved)
    const row = candidate.page.locator(`[data-lean-execution="${run.tool.callID}"]`)
    await expect(row.locator("code")).toHaveJSProperty("textContent", originalCommand)
    const fmt = (value: number) => new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" }).format(value)
    await expect(row.locator('[data-lean-value="bytes"]')).toHaveText(fmt(run.metric.bytes.saved))
    await expect(row.locator('[data-lean-value="tokens"]')).toHaveText(fmt(run.metric.tokens.saved))
  }
  return history
}

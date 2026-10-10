import { afterEach, expect, test } from "bun:test"
import { button, field, idle, mountPage, startHost, submit, transport, waitFor } from "./integrations-native.fixture"
import { navigation, breadcrumbLabel, isWip } from "../../src/orchestra/navigation"
import { createIntegrationsApi } from "../../src/orchestra/chapters/integrations-api"

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); localStorage.clear() })

test("Basic and ephemeral host bearer reach actual protected handler; invalid bearer stays local", async () => {
  const host = await startHost("bearer")
  cleanup.push(host.stop)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  expect(view.root.textContent).toContain("Host authorization is required")
  expect(view.wire.calls[0].headers.has("authorization")).toBe(false)
  expect(view.wire.calls[0].status).toBe(401)
  field("bearer").value = "malicious\r\nAuthorization: Basic injected"
  submit(".integrations-auth")
  expect(field("bearer").value).toBe("")
  await Bun.sleep(30)
  expect(view.wire.calls).toHaveLength(1)
  const bearer = field("bearer")
  bearer.value = host.bearer
  submit(".integrations-auth")
  expect(bearer.value).toBe("")
  await idle(view.root)
  expect(view.root.textContent).toContain("No accounts are configured")
  expect(view.wire.calls.at(-1)?.status).toBe(200)
  expect(view.wire.calls.at(-1)?.headers.get("authorization")).toBe(`Bearer ${host.bearer}`)
  expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!)).join("")).not.toContain(host.bearer)
}, 90000)

test("root dispose/remount across server/profile aborts A reads, clears draft/bearer and fences late actual HTTP", async () => {
  const a = await startHost("bearer")
  cleanup.push(a.stop)
  const b = await startHost("bearer")
  cleanup.push(b.stop)
  const wire = transport()
  const first = mountPage(a, wire)
  cleanup.push(first.dispose)
  await idle(first.root)
  field("bearer").value = a.bearer
  submit(".integrations-auth")
  await idle(first.root)
  const api = createIntegrationsApi({ server: { url: a.url }, directory: a.directory, bearer: a.bearer, fetch: wire.fetch })
  await api.connect({ provider: "slack", key: "old-profile-private-key", label: "Only profile A" }, "old-profile")
  const gate = Promise.withResolvers<void>()
  cleanup.push(gate.resolve)
  wire.controls.holdNextGet = gate.promise
  const reads = wire.calls.length
  button("Refresh", first.root).click()
  await waitFor(() => wire.calls.length > reads && !!wire.calls.at(-1)?.response?.includes("Only profile A"))
  const pending = wire.calls.at(-1)
  expect(pending?.response).toContain("Only profile A") // Late response carries real, distinct SQL rows.
  expect(pending?.signal?.aborted).toBe(false)
  first.dispose()
  expect(pending?.signal?.aborted).toBe(true)
  const before = wire.calls.length
  const second = mountPage(b, wire)
  cleanup.push(second.dispose)
  await idle(second.root)
  expect(second.root.textContent).toContain("Host authorization is required")
  expect(field("bearer").value).toBe("")
  expect(wire.calls.slice(before).map((call) => [new URL(call.url).origin, call.headers.has("authorization")])).toEqual([[b.url, false]])
  gate.resolve()
  await Bun.sleep(50)
  expect(second.root.textContent).toContain("Host authorization is required")
  expect(second.root.textContent).not.toContain("Request saved")
  expect(second.root.textContent).not.toContain("Only profile A")
  expect(wire.calls).toHaveLength(before + 1)
  field("bearer").value = b.bearer
  submit(".integrations-auth")
  await idle(second.root)
  const opener = button("Connect account", second.root)
  opener.focus()
  opener.click()
  await waitFor(() => !!document.querySelector(".integrations-dialog"))
  const draft = field("key")
  draft.value = "discard-profile-draft"
  const token = field("bearer")
  token.value = "discard-bearer-draft"
  second.dispose()
  expect(draft.value).toBe("")
  expect(token.value).toBe("")
  const third = mountPage({ ...b, directory: `${b.directory}/other-profile` }, wire)
  cleanup.push(third.dispose)
  await idle(third.root)
  expect(third.root.textContent).not.toContain("Only profile A")
  expect(wire.calls.at(-1)?.headers.has("authorization")).toBe(false)
  expect(new URL(wire.calls.at(-1)!.url).searchParams.get("location[directory]")).toBe(`${b.directory}/other-profile`)
  expect(third.root.textContent).not.toContain("discard-profile-draft")
}, 90000)

for (const direction of ["ltr", "rtl"] as const) {
  test(`actual entry keeps semantic dialog focus, Escape cleanup and DOM direction in ${direction}`, async () => {
    const host = await startHost()
    cleanup.push(host.stop)
    const view = mountPage(host, undefined, direction)
    cleanup.push(view.dispose)
    await idle(view.root)
    expect(document.documentElement.dir).toBe(direction)
    const opener = button("Connect account", view.root)
    opener.focus()
    opener.click()
    await waitFor(() => !!document.querySelector(".integrations-dialog"))
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy()
    await waitFor(() => !!dialog?.contains(document.activeElement))
    expect([...dialog!.querySelectorAll<HTMLElement>("button,select,input")].map((item) => item.getAttribute("name") ?? item.textContent?.trim())).toEqual(["Close", "provider", "key", "label", "Cancel", "Save"])
    expect(field("key").getAttribute("dir")).toBe("ltr")
    expect(field("label").getAttribute("dir")).toBe("auto")
    const key = field("key")
    key.value = "escape-private-key"
    key.focus()
    key.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    await waitFor(() => !document.querySelector(".integrations-dialog"))
    await waitFor(() => document.activeElement === opener)
    expect(key.value).toBe("")
    expect(view.wire.calls.map((call) => call.method)).toEqual(["GET"])
    // Happy DOM proves semantics/order only; no Tab geometry or computed-layout claim.
  }, 90000)
}

test("navigation and lazy chapter registration retain actual route contract", async () => {
  expect(navigation.find((item) => item.id === "integrations")).toEqual({ id: "integrations", label: "orchestra.integrations.title", chapter: "C15" })
  expect(isWip("integrations")).toBe(false)
  expect(breadcrumbLabel({ type: "chapter", chapter: "integrations" })).toBe("orchestra.integrations.title")
  const { chapterPages } = await import("../../src/orchestra/chapter-route")
  const page = chapterPages.integrations
  expect(page).toBeDefined()
  const host = await startHost()
  cleanup.push(host.stop)
  // Load through the actual lazy registration; entry fixtures mount that same default export.
  const loaded = await (page as typeof import("solid-js").Component & { preload: () => Promise<{ default: unknown }> }).preload()
  const entry = await import("../../src/orchestra/chapters/integrations")
  expect(loaded.default).toBe(entry.default)
  const view = mountPage(host)
  cleanup.push(view.dispose)
  await idle(view.root)
  expect(view.root.querySelector('[data-mx-page="orchestra-integrations"]')).not.toBeNull()
  expect(view.wire.calls[0].status).toBe(200)
}, 90000)

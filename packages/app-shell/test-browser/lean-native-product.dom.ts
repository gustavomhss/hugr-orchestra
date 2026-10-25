import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

// Browser-conditioned leg of lean-native-product.test.ts: the real controller and profile view, over the real
// transport (createLeanAPI over the generated client), against the V2 CLI the parent started and already drove once.
const { createComponent, createRoot, render } = await import("./lean-dom.test-helper")
const { solidDom } = await import("./solid-dom")
const { createLeanController }: typeof import("@/orchestra/chapters/lean-controller") = await import(solidDom("@/orchestra/chapters/lean-controller", import.meta.dir))
const { LeanProfileView }: typeof import("@/orchestra/chapters/lean-view") = await import(solidDom("@/orchestra/chapters/lean-view", import.meta.dir))
const { createLeanAPI }: typeof import("@/orchestra/chapters/lean-api") = await import(solidDom("@/orchestra/chapters/lean-api", import.meta.dir))
const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await import(solidDom("@/context/language", import.meta.dir))
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))

const base = process.env.LEAN_NATIVE_PRODUCT_URL!
const directory = process.env.LEAN_NATIVE_PRODUCT_DIR!

test("the Lean profile view shows the saved Go item and switches it off through the route", async () => {
  const orchestra = Orchestra.make({ baseUrl: base, headers: { Authorization: `Basic ${Buffer.from(`orchestra:${process.env.LEAN_NATIVE_PRODUCT_PASSWORD!}`).toString("base64")}` } })
  const transport = createLeanAPI({ directory }, orchestra)
  const patches: LeanDashboard.Update[] = []
  const owned = createRoot((dispose) => ({ dispose, lean: createLeanController((error) => ({ message: String(error), unavailable: false })) }))
  const controller = owned.lean
  const host = document.createElement("div")
  document.body.appendChild(host)
  const stop = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, { locale: "en", get children() {
      useLanguage().setLocale("en")
      return createComponent(LeanProfileView, { get data() { return controller.state.data }, profileName: "Native selected profile",
        get loading() { return controller.state.loading }, get error() { return controller.state.error },
        get pending() { return controller.state.pending }, get history() { return controller.state.history },
        get historyLoading() { return controller.state.historyLoading }, get historyError() { return controller.state.historyError },
        onUpdate: controller.update, onRefresh: controller.refresh, onHistory: controller.history, onOpenSession() {} })
    } }) },
  }), host)
  try {
    await controller.select({ server: base, directory, transport: {
      ...transport,
      update: async (value, signal) => { patches.push(value); return transport.update(value, signal) },
    } })
    expect(controller.state.error).toBeUndefined()
    const first = controller.state.data!
    expect(first.savings.calls).toBe(1)
    expect(host.querySelectorAll("[data-lean-item]")).toHaveLength(37)
    const row = () => host.querySelector('[data-lean-item="go"]')!
    const input = () => row().querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(input().getAttribute("aria-checked")).toBe("true")
    input().click()
    const deadline = Date.now() + 30_000
    while (controller.state.pending.size || controller.state.loading) {
      if (Date.now() >= deadline) throw new Error("Lean PATCH did not settle")
      await Bun.sleep(20)
    }
    expect(controller.state.error).toBeUndefined()
    expect(input().getAttribute("aria-checked")).toBe("false")
    expect(patches).toEqual([{ itemID: "go", enabled: false }])
    expect(controller.state.data!.savings).toEqual(first.savings)
  } finally {
    stop()
    host.remove()
    owned.dispose()
    controller.dispose()
  }
}, 120_000)

import { expect, mock, test } from "bun:test"
import { createComponent, createRoot, createStore, render } from "./lean-project-metrics.test-helper"
import type { Config } from "@orchestra/sdk/v2/client"
import { solidDom } from "./solid-dom"

const [state, setState] = createStore<{ protocol: "v1" | "v2" | undefined; ready: boolean; error: unknown; config: Config }>({
  protocol: undefined, ready: false, error: undefined,
  config: { tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } },
})
const calls: Config[] = []
const toasts: unknown[] = []
const transport = { reject: true }
const sync = {
  data: state,
  get ready() { return state.ready },
  configReady: true,
  get error() { return state.error },
  session: { lineage: { peek: () => undefined } },
  async updateConfig(config: Config) {
    calls.push(config)
    if (transport.reject) throw new Error("write denied")
    setState("config", "tool_output", config.tool_output!)
  },
}
// External context fixtures only; render real SettingsGeneralV2, settings provider, controller and switch. Fixtures
// replace the solidDom() copies (./solid-dom) that the rendered graph imports.
const sdk: typeof import("@/context/server-sdk") = await import(solidDom("@/context/server-sdk", import.meta.dir))
const serverSync: typeof import("@/context/server-sync") = await import(solidDom("@/context/server-sync", import.meta.dir))
const permission: typeof import("@/context/permission") = await import(solidDom("@/context/permission", import.meta.dir))
mock.module(solidDom("@/context/server-sync", import.meta.dir), () => ({ ...serverSync, useServerSync: () => () => sync }))
mock.module(solidDom("@/context/server-sdk", import.meta.dir), () => ({ ...sdk,
  useServerProtocol: () => () => state.protocol,
  useServerSDK: () => () => ({ protocol: Promise.resolve(state.protocol ?? "v2"), client: { pty: { shells: async () => ({ data: [] }) } } }),
}))
mock.module(solidDom("@/context/permission", import.meta.dir), () => ({ ...permission, usePermission: () => ({}) }))
mock.module(solidDom("@/orchestra/palette/context", import.meta.dir), () => ({
  useOrchestraPalette: () => ({ palettes: [], id: () => "dark" }),
}))
mock.module(solidDom("@/utils/toast", import.meta.dir), () => ({ showToast: (options: unknown) => toasts.push(options) }))
const { SettingsGeneralV2 }: typeof import("@/components/settings-v2/general") = await import(
  solidDom("@/components/settings-v2/general", import.meta.dir)
)
const { createLeanSettingsController }: typeof import("@/components/settings-v2/general-controllers") = await import(
  solidDom("@/components/settings-v2/general-controllers", import.meta.dir)
)
const { PlatformProvider }: typeof import("@/context/platform") = await import(solidDom("@/context/platform", import.meta.dir))
const { LanguageProvider, useLanguage }: typeof import("@/context/language") = await import(
  solidDom("@/context/language", import.meta.dir)
)
const { SettingsProvider }: typeof import("@/context/settings") = await import(solidDom("@/context/settings", import.meta.dir))
const { DialogProvider }: typeof import("@orchestra/ui/context/dialog") = await import(
  solidDom("@orchestra/ui/context/dialog", import.meta.dir)
)
const { dict }: typeof import("@/i18n/en") = await import(solidDom("@/i18n/en", import.meta.dir))

test("active SettingsGeneralV2 mounts backend Lean controls; unavailable capability cannot write", async () => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const owned = createRoot((dispose) => ({ dispose, lean: createLeanSettingsController() }))
  const dispose = render(() => createComponent(PlatformProvider, {
    value: { platform: "web", openExternal() {}, async restart() {}, async notify() {} },
    get children() { return createComponent(LanguageProvider, {
      locale: "en",
      get children() {
        useLanguage().setLocale("en")
        return createComponent(SettingsProvider, { get children() {
          return createComponent(DialogProvider, { get children() { return createComponent(SettingsGeneralV2, {}) } })
        } })
      },
    }) },
  }), host)
  const row = () => host.querySelector('[data-action="settings-lean"]')
  const input = () => row()?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  try {
    await Bun.sleep(20)
    expect(row()).not.toBeNull()
    expect(host.textContent).toContain(dict["lean.settings.title"])
    for (const capability of [
      { protocol: undefined, ready: true, error: undefined }, { protocol: "v2" as const, ready: true, error: undefined },
      { protocol: "v1" as const, ready: false, error: undefined }, { protocol: "v1" as const, ready: true, error: new Error("offline") },
    ]) {
      setState(capability)
      expect(row()?.textContent).toContain(dict["lean.settings.unavailable"])
      expect(input()).toBeNull()
      expect(owned.lean.enabled()).toBeUndefined()
      await owned.lean.set(true)
      expect(calls).toHaveLength(0)
    }
    setState({ protocol: "v1", ready: true, error: undefined })
    expect(input()?.checked).toBe(false)
    input()!.click()
    expect(input()?.disabled).toBe(true)
    expect(row()?.textContent).toContain(dict["lean.settings.saving"])
    await Bun.sleep(10)
    expect(calls).toEqual([{ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: true } } }])
    expect(input()?.checked).toBe(false)
    expect(row()?.querySelector('[role="alert"]')?.textContent).toBe(dict["lean.settings.failed"])
    expect(toasts).toEqual([{ variant: "error", title: dict["lean.settings.failed"], description: "write denied" }])
    transport.reject = false
    input()!.click()
    await Bun.sleep(10)
    expect(input()?.checked).toBe(true)
    input()!.click()
    await Bun.sleep(10)
    expect(input()?.checked).toBe(false)
    expect(calls[2]).toEqual({ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } })
  } finally { dispose(); owned.dispose(); host.remove() }
})

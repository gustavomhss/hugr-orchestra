import { expect, mock, test } from "bun:test"
import { createComponent, createRoot, createStore, render } from "./lean-project-metrics.test-helper"
import type { Config } from "@orchestra/sdk/v2/client"

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
// External context fixtures only; render real SettingsGeneralV2, settings provider, controller and switch.
const sdk = await import("@/context/server-sdk")
const serverSync = await import("@/context/server-sync")
const permission = await import("@/context/permission")
mock.module("@/context/server-sync", () => ({ ...serverSync, useServerSync: () => () => sync }))
mock.module("@/context/server-sdk", () => ({ ...sdk,
  useServerProtocol: () => () => state.protocol,
  useServerSDK: () => () => ({ protocol: Promise.resolve(state.protocol ?? "v2"), client: { pty: { shells: async () => ({ data: [] }) } } }),
}))
mock.module("@/context/permission", () => ({ ...permission, usePermission: () => ({}) }))
mock.module("@/orchestra/palette/context", () => ({ useOrchestraPalette: () => ({ palettes: [], id: () => "dark" }) }))
mock.module("@/utils/toast", () => ({ showToast: (options: unknown) => toasts.push(options) }))
const { SettingsGeneralV2 } = await import("@/components/settings-v2/general")
const { createLeanSettingsController } = await import("@/components/settings-v2/general-controllers")
const { PlatformProvider } = await import("@/context/platform")
const { LanguageProvider, useLanguage } = await import("@/context/language")
const { SettingsProvider } = await import("@/context/settings")
const { DialogProvider } = await import("@orchestra/ui/context/dialog")
const { dict } = await import("@/i18n/en")

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

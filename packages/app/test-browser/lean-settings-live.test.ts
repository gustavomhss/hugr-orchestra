import { expect, mock, test } from "bun:test"
import { createComponent, createRoot, createStore, render } from "./lean-project-metrics.test-helper"
import type { Config } from "@orchestra/sdk/v2/client"
import { solidDom } from "./solid-dom"

const [state, setState] = createStore<{ protocol: "v1" | "v2" | undefined; ready: boolean; error: unknown; config: Config }>({
  protocol: undefined, ready: false, error: undefined,
  config: { tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } },
})
const calls: Config[] = []
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
// External context fixtures only; render real SettingsGeneralV2 and settings provider, and drive the real backend config
// controller through its default context wiring. Fixtures replace the solidDom() copies (./solid-dom) those modules import.
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

// The first Lean UI, a global toggle in Settings, was rejected (2026-10-10): Lean lives on its profile screen, with
// per-profile KPIs, covered items, bytes and tokens saved and per-item switches. That screen's live controls are covered
// by lean-profile-view (pending, failure, unsupported and paused states), lean-controller (unsupported blocks writes,
// failures keep data, pending lanes confirm only HTTP snapshots), lean-chapter-route and lean-native-product (persisted
// disable through the real backend). An accidental re-mount in Settings must fail here.
test("active SettingsGeneralV2 renders no Lean controls, whether the Lean capability is unavailable or editable", async () => {
  const host = document.createElement("div")
  document.body.appendChild(host)
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
  const lean = [
    dict["lean.settings.title"], dict["lean.settings.description"], dict["lean.settings.unavailable"],
    dict["lean.settings.saving"], dict["lean.settings.failed"],
  ]
  try {
    for (const capability of [
      { protocol: undefined, ready: false, error: undefined }, { protocol: "v1" as const, ready: true, error: undefined },
    ]) {
      setState(capability)
      await Bun.sleep(20)
      // Positive control: the real General section rendered its rows, so the absence below is not an empty mount.
      const actions = [...host.querySelectorAll("*")].flatMap((node) => node.getAttribute("data-action") ?? [])
      expect(actions).toContain("settings-language")
      expect(actions.filter((action) => action.startsWith("settings-lean"))).toEqual([])
      const text = host.textContent ?? ""
      expect(text).toContain(dict["settings.general.row.language.title"])
      expect(lean.filter((value) => text.includes(value))).toEqual([])
    }
    expect(calls).toHaveLength(0)
  } finally { dispose(); host.remove() }
})

test("live backend Lean config controller: unavailable capability cannot write; rejected write stays visible; refetched config is authoritative", async () => {
  setState({ protocol: undefined, ready: false, error: undefined })
  const owned = createRoot((dispose) => ({ dispose, lean: createLeanSettingsController() }))
  try {
    for (const capability of [
      { protocol: undefined, ready: true, error: undefined }, { protocol: "v2" as const, ready: true, error: undefined },
      { protocol: "v1" as const, ready: false, error: undefined }, { protocol: "v1" as const, ready: true, error: new Error("offline") },
    ]) {
      setState(capability)
      expect(owned.lean.editable()).toBe(false)
      expect(owned.lean.enabled()).toBeUndefined()
      await owned.lean.set(true)
      expect(calls).toHaveLength(0)
    }
    setState({ protocol: "v1", ready: true, error: undefined })
    expect(owned.lean.editable()).toBe(true)
    expect(owned.lean.enabled()).toBe(false)
    const rejected = owned.lean.set(true)
    expect(owned.lean.pending()).toBe(true)
    await owned.lean.set(false)
    expect(calls).toHaveLength(1)
    await expect(rejected).rejects.toThrow("write denied")
    expect(calls).toEqual([{ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: true } } }])
    expect(owned.lean.pending()).toBe(false)
    expect(owned.lean.failed()).toBe(true)
    expect(owned.lean.enabled()).toBe(false)
    transport.reject = false
    await owned.lean.set(true)
    expect(owned.lean.failed()).toBe(false)
    expect(owned.lean.enabled()).toBe(true)
    await owned.lean.set(false)
    expect(owned.lean.enabled()).toBe(false)
    expect(calls[2]).toEqual({ tool_output: { max_lines: 42, max_bytes: 900, lean: { enabled: false } } })
  } finally { owned.dispose() }
})

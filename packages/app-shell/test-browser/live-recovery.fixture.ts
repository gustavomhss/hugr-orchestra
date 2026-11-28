import { createSignal, Show } from "solid-js"
import { createComponent, render } from "solid-js/web"
import type { LiveRecoveryAction, LiveRecoveryItem, LiveRecoveryPort, LiveRecoverySnapshot } from "../src/live"
import { solidDom } from "./solid-dom"

export const labels = {
  en: {
    retry: "Retry", finish: "Finish saved segments", export: "Export", discard: "Discard", cancel: "Cancel",
    recording: "Recording", pending: /pending|awaiting delivery|not delivered/i,
    storage: /storage|saving.*unavailable|unable to save/i,
    incomplete: /recent audio.*(?:missing|lost|absent)|(?:missing|lost).*recent audio/i,
    localOnly: /local|this device/i,
    remoteUnchanged: /(?:not|never|doesn't|does not).*(?:close|delete|remove).*remote|remote.*(?:unchanged|not.*(?:closed|deleted|removed))/i,
    delivered: /^(?:delivered|delivery complete)$/i,
  },
  br: {
    retry: "Tentar novamente", finish: "Finalizar segmentos salvos", export: "Exportar", discard: "Descartar", cancel: "Cancelar",
    recording: "Gravando", pending: /pendente|aguardando.*entrega|não.*entreg/i,
    storage: /armazenamento|salvamento.*indispon|não.*salvar/i,
    incomplete: /áudio recente.*(?:ausente|perdido|falt|não)|(?:ausente|perdido|falt).*áudio recente/i,
    localOnly: /loca(?:l|is)|neste dispositivo/i,
    remoteUnchanged: /não.*(?:encerr|exclu|remov|apag).*remot|remot.*(?:inalter|não.*(?:encerr|exclu|remov|apag))/i,
    delivered: /^(?:entregue|entrega concluída)$/i,
  },
} as const

export function item(patch: Partial<LiveRecoveryItem> = {}): LiveRecoveryItem {
  return {
    id: "11111111-1111-4111-8111-111111111111", title: "Saved meeting A", sessionID: "ses_saved_A", meetingID: "meeting_saved_A",
    timeStarted: 1_700_000_000_000, pendingCount: 3, pendingBytes: 128, closeRequested: false, sealed: false,
    activeProducer: false, status: "paused", reason: "offline", unsaved: "none", ...patch,
  }
}

export function snapshot(patch: Partial<LiveRecoverySnapshot> = {}): LiveRecoverySnapshot {
  return { state: "ready", canStart: true, items: [item()], unconfirmedStarts: [], ...patch }
}

export function controlled(initial = snapshot()) {
  const state = { value: initial, reads: 0, activeReads: 0, maximumReads: 0, settledActions: 0,
    calls: [] as { action: "retry" | "finish" | "export" | "discard"; args: readonly string[] }[] }
  const reads = { next: (): Promise<LiveRecoverySnapshot> => Promise.resolve(structuredClone(state.value)) }
  const actions = {
    retry: async (_id: string): Promise<LiveRecoveryAction> => ({ ok: true }),
    finish: async (_id: string): Promise<LiveRecoveryAction> => ({ ok: true }),
    export: async (_id: string): Promise<LiveRecoveryAction> => ({ ok: true }),
    discard: async (_id: string): Promise<LiveRecoveryAction> => ({ ok: true }),
  }
  const invoke = (action: keyof typeof actions, args: [string]) => {
    state.calls.push({ action, args })
    return Promise.resolve().then(() => actions[action](...args)).finally(() => { state.settledActions++ })
  }
  const port: LiveRecoveryPort = {
    snapshot() {
      state.reads++
      state.activeReads++
      state.maximumReads = Math.max(state.maximumReads, state.activeReads)
      return Promise.resolve().then(() => reads.next()).finally(() => { state.activeReads-- })
    },
    retry: (...args) => invoke("retry", args),
    finish: (...args) => invoke("finish", args),
    export: (...args) => invoke("export", args),
    discard: (...args) => invoke("discard", args),
  }
  return { state, reads, actions, port }
}

export async function mount(control: ReturnType<typeof controlled>, locale: keyof typeof labels) {
  const recovery: typeof import("../src/orchestra/chapters/flight-engineer/recovery") = await import(solidDom("../src/orchestra/chapters/flight-engineer/recovery.tsx", import.meta.dir))
  const language: typeof import("../src/context/language") = await import(solidDom("../src/context/language.tsx", import.meta.dir))
  const platform: typeof import("../src/context/platform") = await import(solidDom("../src/context/platform.tsx", import.meta.dir))
  const uiLanguage: typeof import("@orchestra/ui/context/i18n") = await import(solidDom("@orchestra/ui/context/i18n", import.meta.dir))
  const toast: typeof import("../src/utils/toast") = await import(solidDom("../src/utils/toast.tsx", import.meta.dir))
  const legacyToast: typeof import("@orchestra/ui/toast") = await import(solidDom("@orchestra/ui/toast", import.meta.dir))
  legacyToast.toaster.clear()
  await language.loadLocaleDict(locale)
  const host = document.createElement("div")
  document.body.append(host)
  const [mounted, setMounted] = createSignal(true)
  const lifetime = { disposed: false }
  function Content() {
    const words = language.useLanguage()
    // Select through the actual provider, even if another browser test persisted a different locale.
    words.setLocale(locale)
    return createComponent(uiLanguage.I18nProvider, {
      value: words,
      get children() { return [
        createComponent(Show, { get when() { return mounted() }, get children() {
          return createComponent(recovery.FlightRecovery, { port: control.port })
        } }),
        createComponent(toast.ToastRegion, { v2: false }),
      ] },
    })
  }
  const dispose = render(() => createComponent(platform.PlatformProvider, {
    value: { platform: "web", openExternal() {}, restart: async () => {}, notify: async () => {} },
    get children() { return createComponent(language.LanguageProvider, {
      locale, get children() { return createComponent(Content, {}) },
    }) },
  }), host)
  const words = labels[locale]
  return {
    host, words,
    text: () => host.textContent ?? "",
    leaves: () => [...host.querySelectorAll<HTMLElement>("*")].filter((node) => node.children.length === 0)
      .map((node) => node.textContent?.trim() ?? ""),
    errors: () => [...document.querySelectorAll<HTMLElement>('[role="alert"], [data-variant="error"]')]
      .map((node) => node.textContent?.trim() ?? "").filter(Boolean).join("\n"),
    button(name: string, root: ParentNode = host) {
      const button = [...root.querySelectorAll<HTMLButtonElement>('button, [role="button"]')]
        .find((node) => (node.getAttribute("aria-label") ?? node.textContent)?.trim() === name)
      if (!button) throw new Error(`Actual recovery action not rendered: ${name}`)
      return button
    },
    dialog: () => document.querySelector<HTMLElement>('[role="alertdialog"], [role="dialog"]'),
    focus: () => window.dispatchEvent(new Event("focus")),
    unmount: () => setMounted(false),
    dispose() {
      if (lifetime.disposed) return
      lifetime.disposed = true
      legacyToast.toaster.clear()
      dispose()
      host.remove()
    },
  }
}

export async function wait(check: () => boolean, label: string, milliseconds = 2000) {
  const deadline = performance.now() + milliseconds
  while (!check()) {
    if (performance.now() >= deadline) throw new Error(`Recovery DOM did not observe ${label}`)
    await Bun.sleep(10)
  }
}

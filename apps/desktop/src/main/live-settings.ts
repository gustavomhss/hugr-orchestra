import { globalShortcut } from "electron"
import type { LiveHotkey, LiveHotkeyAction, LiveSettings } from "@orchestra/app/live"

import { LIVE_OVERLAY_HOTKEYS, type LiveOverlayHotkey } from "./live-overlay-state"
import { getStore } from "./store"
import { LIVE_HOTKEYS_KEY, LIVE_OVERLAY_HOTKEYS_KEY, LIVE_SETTINGS_KEY } from "./store-keys"

// The live seat's settings and global hotkeys, kept in the desktop store next to the speech-to-text key. "ask" and
// "toggle-overlay" are the overlay's own hotkeys: they share its stored overrides, and the overlay registers them when
// a meeting starts, so a change to them applies from the next meeting. "start-stop" is registered here for good;
// "toggle-captions" is bound only while a meeting runs.

export const DEFAULT_SETTINGS: LiveSettings = {
  answerModel: undefined,
  language: "auto",
  suggestions: false,
  sources: { microphone: true, "system-audio": true },
}

export const DEFAULT_HOTKEYS: Record<LiveHotkeyAction, string> = {
  "start-stop": "CommandOrControl+Shift+M",
  ask: LIVE_OVERLAY_HOTKEYS.ask,
  "toggle-overlay": LIVE_OVERLAY_HOTKEYS.toggle,
  "toggle-captions": "CommandOrControl+Shift+C",
}

const OVERLAY_NAME = { ask: "ask", "toggle-overlay": "toggle" } as const
const ACTIONS = Object.keys(DEFAULT_HOTKEYS) as LiveHotkeyAction[]

type Store = { get(key: string): unknown; set(key: string, value: unknown): void }
type Shortcuts = { register(accelerator: string, run: () => void): boolean; unregister(accelerator: string): void }

export function liveSettings(store: Store = getStore(), shortcuts: Shortcuts = globalShortcut) {
  const handlers = new Map<LiveHotkeyAction, () => void>()
  const record = (key: string) => object(store.get(key))
  const pick = (value: unknown, fallback: string) => (typeof value === "string" && value.trim() ? value : fallback)

  const accelerators = () => {
    const own = record(LIVE_HOTKEYS_KEY)
    const overlay = record(LIVE_OVERLAY_HOTKEYS_KEY)
    return {
      "start-stop": pick(own["start-stop"], DEFAULT_HOTKEYS["start-stop"]),
      "toggle-captions": pick(own["toggle-captions"], DEFAULT_HOTKEYS["toggle-captions"]),
      ask: pick(overlay.ask, DEFAULT_HOTKEYS.ask),
      "toggle-overlay": pick(overlay.toggle, DEFAULT_HOTKEYS["toggle-overlay"]),
    } satisfies Record<LiveHotkeyAction, string>
  }

  // Every accelerator one of our actions holds, the overlay's other hotkeys (look, stop, paging) included.
  const held = (except: LiveHotkeyAction) => {
    const overlay = record(LIVE_OVERLAY_HOTKEYS_KEY)
    const fixed = (Object.keys(LIVE_OVERLAY_HOTKEYS) as LiveOverlayHotkey[])
      .filter((name) => name !== "ask" && name !== "toggle")
      .map((name) => pick(overlay[name], LIVE_OVERLAY_HOTKEYS[name]))
    const mine = accelerators()
    return [...ACTIONS.filter((action) => action !== except).map((action) => mine[action]), ...fixed]
  }

  const attempt = (accelerator: string, run: () => void) => {
    // Electron throws on an accelerator it cannot parse instead of returning false.
    try {
      return shortcuts.register(accelerator, run) ? "ok" : "conflict"
    } catch {
      return "invalid"
    }
  }

  const write = (action: LiveHotkeyAction, accelerator: string) => {
    const overlay = action === "ask" || action === "toggle-overlay"
    const key = overlay ? LIVE_OVERLAY_HOTKEYS_KEY : LIVE_HOTKEYS_KEY
    store.set(key, { ...record(key), [overlay ? OVERLAY_NAME[action] : action]: accelerator })
  }

  const move = (action: LiveHotkeyAction, accelerator: string) => {
    const next = accelerator.trim()
    const current = accelerators()[action]
    if (!next) return "invalid" as const
    if (normalize(next) === normalize(current)) return "ok" as const
    if (held(action).some((other) => normalize(other) === normalize(next))) return "conflict" as const
    const handler = handlers.get(action)
    const result = attempt(next, handler ?? (() => {}))
    if (result !== "ok") return result
    // An unbound action only tested the accelerator; whoever owns the action registers it when it runs.
    shortcuts.unregister(handler ? current : next)
    write(action, next)
    return "ok" as const
  }

  const read = () => merge(DEFAULT_SETTINGS, store.get(LIVE_SETTINGS_KEY))

  const hotkeys = () => {
    const current = accelerators()
    return ACTIONS.map((action) => ({ action, accelerator: current[action], defaultAccelerator: DEFAULT_HOTKEYS[action] }))
  }

  return {
    get: read,
    // A patch from the renderer is untrusted: only well-typed fields are merged.
    set(patch: unknown) {
      const next = merge(read(), patch)
      // The store cannot hold undefined, so an unset answer model is left out.
      store.set(
        LIVE_SETTINGS_KEY,
        next.answerModel ? next : { language: next.language, suggestions: next.suggestions, sources: next.sources },
      )
      return next
    },
    hotkeys,
    setHotkey: (action: LiveHotkeyAction, accelerator: string) => {
      const result = move(action, accelerator)
      return result === "ok" ? ({ ok: true } as const) : ({ ok: false, reason: result } as const)
    },
    resetHotkeys(): LiveHotkey[] {
      ACTIONS.forEach((action) => move(action, DEFAULT_HOTKEYS[action]))
      return hotkeys()
    },
    // Holds `action`'s accelerator for as long as `handler` is bound; undefined releases it.
    bind(action: LiveHotkeyAction, handler: (() => void) | undefined) {
      const accelerator = accelerators()[action]
      if (handlers.delete(action)) shortcuts.unregister(accelerator)
      if (!handler) return
      handlers.set(action, handler)
      attempt(accelerator, handler)
    },
  }
}

// Case and the CommandOrControl alias do not distinguish accelerators.
function normalize(accelerator: string) {
  return accelerator
    .toLowerCase()
    .replace(/commandorcontrol|cmdorctrl/g, "cmdorctrl")
    .split("+")
    .sort()
    .join("+")
}

const LANGUAGE = /^(auto|[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*)$/

function merge(base: LiveSettings, patch: unknown): LiveSettings {
  const input = object(patch)
  const sources = object(input.sources)
  return {
    answerModel:
      "answerModel" in input && (input.answerModel === undefined || typeof input.answerModel === "string")
        ? input.answerModel || undefined
        : base.answerModel,
    language: typeof input.language === "string" && LANGUAGE.test(input.language) ? input.language : base.language,
    suggestions: typeof input.suggestions === "boolean" ? input.suggestions : base.suggestions,
    sources: {
      microphone: typeof sources.microphone === "boolean" ? sources.microphone : base.sources.microphone,
      "system-audio":
        typeof sources["system-audio"] === "boolean" ? sources["system-audio"] : base.sources["system-audio"],
    },
  }
}

function object(value: unknown) {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
}

// "Meeting 14:05": a meeting with no title is named by its local start time.
export function defaultTitle() {
  const now = new Date()
  return `Meeting ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
}

// The setting is "provider/model"; model ids may hold slashes themselves, so only the first one splits.
export function modelRef(answerModel: string | undefined) {
  const slash = answerModel?.indexOf("/") ?? -1
  if (!answerModel || slash < 1) return undefined
  return { providerID: answerModel.slice(0, slash), id: answerModel.slice(slash + 1) }
}

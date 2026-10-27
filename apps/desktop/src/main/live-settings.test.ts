import { describe, expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()
const { DEFAULT_HOTKEYS, DEFAULT_SETTINGS, defaultTitle, liveSettings, modelRef } = await import("./live-settings")
const { LIVE_HOTKEYS_KEY, LIVE_OVERLAY_HOTKEYS_KEY, LIVE_SETTINGS_KEY } = await import("./store-keys")

// A real in-memory store and shortcut table, so the tests drive the actual settings logic.
function fixture(taken: string[] = []) {
  const values = new Map<string, unknown>()
  const registered = new Set<string>()
  const settings = liveSettings(
    { get: (key) => values.get(key), set: (key, value) => values.set(key, value) },
    {
      register: (accelerator) => {
        if (accelerator === "Bogus+") throw new Error("invalid accelerator")
        if (taken.includes(accelerator) || registered.has(accelerator)) return false
        registered.add(accelerator)
        return true
      },
      unregister: (accelerator) => registered.delete(accelerator),
    },
  )
  return { values, registered, settings }
}

describe("live settings", () => {
  test("returns the defaults when nothing is stored", () => {
    expect(fixture().settings.get()).toEqual(DEFAULT_SETTINGS)
  })

  test("merges only well-typed fields of a patch", () => {
    const { settings, values } = fixture()
    const next = settings.set({
      language: "pt-BR",
      suggestions: "yes",
      sources: { microphone: false, "system-audio": 3 },
      answerModel: "openrouter/anthropic/claude-sonnet",
      extra: true,
    })
    expect(next).toEqual({
      answerModel: "openrouter/anthropic/claude-sonnet",
      language: "pt-BR",
      suggestions: false,
      sources: { microphone: false, "system-audio": true },
    })
    expect(settings.get()).toEqual(next)
    expect(values.get(LIVE_SETTINGS_KEY)).toEqual(next)
  })

  test("rejects a malformed language and clears the answer model", () => {
    const { settings } = fixture()
    settings.set({ answerModel: "a/b" })
    const next = settings.set({ language: "not a language!", answerModel: undefined })
    expect(next.language).toBe("auto")
    expect(next.answerModel).toBeUndefined()
  })

  test("splits the answer model on the first slash", () => {
    expect(modelRef("openrouter/anthropic/claude")).toEqual({ providerID: "openrouter", id: "anthropic/claude" })
    expect(modelRef("noslash")).toBeUndefined()
    expect(modelRef(undefined)).toBeUndefined()
  })

  test("names a meeting by its start time", () => {
    expect(defaultTitle()).toMatch(/^Meeting \d{2}:\d{2}$/)
  })
})

describe("live hotkeys", () => {
  test("lists the four actions with their defaults", () => {
    const hotkeys = fixture().settings.hotkeys()
    expect(hotkeys.map((hotkey) => hotkey.action).sort()).toEqual(Object.keys(DEFAULT_HOTKEYS).sort())
    expect(hotkeys.every((hotkey) => hotkey.accelerator === hotkey.defaultAccelerator)).toBe(true)
  })

  test("changes an accelerator and stores it under the owner's key", () => {
    const { settings, values } = fixture()
    expect(settings.setHotkey("start-stop", "CommandOrControl+Shift+L")).toEqual({ ok: true })
    expect(values.get(LIVE_HOTKEYS_KEY)).toEqual({ "start-stop": "CommandOrControl+Shift+L" })
    expect(settings.setHotkey("ask", "CommandOrControl+Shift+A")).toEqual({ ok: true })
    expect(values.get(LIVE_OVERLAY_HOTKEYS_KEY)).toEqual({ ask: "CommandOrControl+Shift+A" })
  })

  test("reports a conflict with another action, case and alias aside", () => {
    const { settings } = fixture()
    expect(settings.setHotkey("start-stop", "cmdorctrl+shift+c")).toEqual({ ok: false, reason: "conflict" })
  })

  test("reports a conflict when the system refuses the accelerator", () => {
    expect(fixture(["Alt+K"]).settings.setHotkey("start-stop", "Alt+K")).toEqual({ ok: false, reason: "conflict" })
  })

  test("reports invalid for an empty or unparsable accelerator", () => {
    const { settings } = fixture()
    expect(settings.setHotkey("start-stop", "  ")).toEqual({ ok: false, reason: "invalid" })
    expect(settings.setHotkey("start-stop", "Bogus+")).toEqual({ ok: false, reason: "invalid" })
  })

  test("moves the held registration of a bound action", () => {
    const { settings, registered } = fixture()
    settings.bind("start-stop", () => {})
    expect(registered.has(DEFAULT_HOTKEYS["start-stop"])).toBe(true)
    settings.setHotkey("start-stop", "Alt+M")
    expect([...registered]).toEqual(["Alt+M"])
    settings.bind("start-stop", undefined)
    expect(registered.size).toBe(0)
  })

  test("reset restores every default", () => {
    const { settings } = fixture()
    settings.setHotkey("start-stop", "Alt+M")
    settings.setHotkey("toggle-captions", "Alt+N")
    expect(settings.resetHotkeys().every((hotkey) => hotkey.accelerator === hotkey.defaultAccelerator)).toBe(true)
  })
})

import { describe, expect, test } from "bun:test"
import { DEFAULT_PALETTE_KEYBIND } from "@/context/command"
import {
  captureKeybind,
  filterShortcuts,
  findConflict,
  keybindCombos,
  keybindSignatures,
  shortcutGroup,
  shortcutRows,
  shortcutText,
  resetsOverride,
} from "./shortcuts-model"

const key = (
  value: string,
  modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {},
) => ({
  key: value,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
})

describe("shortcut rows", () => {
  const catalog = [
    { id: "tab.new", title: "New session", keybind: "ctrl+t,ctrl+n" },
    { id: "session.share", title: "Share session" },
    { id: "terminal.toggle", title: "Toggle terminal", keybind: "ctrl+`" },
    { id: "suggested.tab.new", title: "New session", keybind: "ctrl+t" },
  ]

  test("lists the palette, the catalog and stored overrides in Settings order", () => {
    const rows = shortcutRows({
      paletteTitle: "Command palette",
      catalog,
      options: [{ id: "home.toggle", title: "Home", keybind: "ctrl+b" }],
      overrides: { "legacy.action": "ctrl+l" },
    })
    expect(rows.map((row) => [row.id, row.group])).toEqual([
      ["command.palette", "general"],
      ["home.toggle", "general"],
      ["legacy.action", "general"],
      ["tab.new", "general"],
      ["session.share", "session"],
      ["terminal.toggle", "terminal"],
    ])
    expect(rows.find((row) => row.id === "legacy.action")?.title).toBe("legacy.action")
  })

  test("an override wins over the registered default and keeps the default as the preset", () => {
    const rows = shortcutRows({
      paletteTitle: "Command palette",
      catalog,
      // The live option is already resolved through the override; it must not become the preset.
      options: [{ id: "tab.new", title: "New session", keybind: "ctrl+shift+y" }],
      overrides: { "tab.new": "ctrl+shift+y", "command.palette": "none" },
    })
    expect(rows.find((row) => row.id === "tab.new")).toMatchObject({ config: "ctrl+shift+y", preset: "ctrl+t,ctrl+n" })
    expect(rows.find((row) => row.id === "command.palette")).toMatchObject({
      config: "none",
      preset: DEFAULT_PALETTE_KEYBIND,
    })
    expect(rows.find((row) => row.id === "session.share")?.config).toBeUndefined()
  })

  test("hidden live options and suggested copies are not rows of their own", () => {
    const rows = shortcutRows({
      paletteTitle: "Command palette",
      catalog: [],
      options: [
        { id: "tab.close", title: "Close tab", keybind: "ctrl+w", hidden: true },
        { id: "suggested.home.toggle", title: "Home", keybind: "ctrl+b" },
      ],
      overrides: {},
    })
    expect(rows.map((row) => row.id)).toEqual(["command.palette"])
  })

  test("groups follow the Settings panel", () => {
    expect(shortcutGroup("model.choose")).toBe("modelAndMcp")
    expect(shortcutGroup("mcp.toggle")).toBe("modelAndMcp")
    // There are no agent commands: the user talks only to Maestro, so `agent.*` has no group of its own.
    expect(shortcutGroup("agent.cycle")).toBe("general")
    expect(shortcutGroup("fileTree.toggle")).toBe("navigation")
    expect(shortcutGroup("prompt.submit")).toBe("prompt")
    expect(shortcutGroup("review.next")).toBe("session")
    expect(shortcutGroup("sidebar.toggle")).toBe("general")
  })
})

describe("capture", () => {
  test("records modifiers in a stable order with the platform mod key", () => {
    expect(captureKeybind(key("M", { metaKey: true, shiftKey: true }), true)).toBe("mod+shift+m")
    expect(captureKeybind(key("M", { ctrlKey: true, shiftKey: true }), false)).toBe("mod+shift+m")
    expect(captureKeybind(key("k", { ctrlKey: true, metaKey: true, altKey: true }), true)).toBe("mod+ctrl+alt+k")
    expect(captureKeybind(key("k", { ctrlKey: true, metaKey: true }), false)).toBe("mod+meta+k")
    expect(captureKeybind(key(",", { metaKey: true }), true)).toBe("mod+comma")
    expect(captureKeybind(key(" ", { ctrlKey: true }), false)).toBe("mod+space")
  })

  test("ignores bare modifiers, Escape, dead keys and focus moves", () => {
    for (const value of ["Meta", "Shift", "Control", "Alt", "Escape", "Dead"])
      expect(captureKeybind(key(value, { metaKey: true }), true)).toBeUndefined()
    expect(captureKeybind(key("Tab"), true)).toBeUndefined()
    expect(captureKeybind(key("Tab", { shiftKey: true }), true)).toBeUndefined()
    expect(captureKeybind(key("Tab", { ctrlKey: true }), false)).toBe("mod+tab")
  })

  test("a bare Backspace or Delete unassigns; a modified one is a combination", () => {
    expect(captureKeybind(key("Backspace"), true)).toBe("none")
    expect(captureKeybind(key("Delete"), false)).toBe("none")
    expect(captureKeybind(key("Backspace", { metaKey: true }), true)).toBe("mod+backspace")
  })
})

describe("conflicts", () => {
  const rows = shortcutRows({
    paletteTitle: "Command palette",
    catalog: [
      { id: "tab.new", title: "New session", keybind: "ctrl+t,ctrl+n" },
      { id: "home.toggle", title: "Home", keybind: "ctrl+b" },
      { id: "session.share", title: "Share session" },
    ],
    options: [],
    overrides: { "command.palette": "ctrl+k" },
  })

  test("any combination of another command conflicts, whatever its alias spelling", () => {
    expect(findConflict(rows, "home.toggle", "control+n")?.title).toBe("New session")
    expect(findConflict(rows, "home.toggle", "ctrl+k")?.title).toBe("Command palette")
    expect(findConflict(rows, "home.toggle", "ctrl+shift+y,ctrl+t")?.title).toBe("New session")
  })

  test("the edited command, unassigned bindings and free combinations do not conflict", () => {
    expect(findConflict(rows, "tab.new", "ctrl+n")).toBeUndefined()
    expect(findConflict(rows, "home.toggle", "ctrl+shift+y")).toBeUndefined()
    expect(findConflict(rows, "home.toggle", "none")).toBeUndefined()
    expect(findConflict(rows, "session.share", "ctrl+b")?.title).toBe("Home")
  })

  test("signatures normalize alias spellings and skip modifier-only entries", () => {
    expect(keybindSignatures("control+option+k")).toEqual(["ctrl+alt+k"])
    expect(keybindSignatures("ctrl+shift")).toEqual([])
    expect(keybindSignatures("none")).toEqual([])
  })
})

describe("display and search", () => {
  test("splits every combination of a binding and hides unassigned ones", () => {
    expect(keybindCombos("mod+t, mod+n")).toEqual(["mod+t", "mod+n"])
    expect(keybindCombos("none")).toEqual([])
    expect(keybindCombos(undefined)).toEqual([])
  })

  test("search text is what the row shows, including the unassigned label", () => {
    const base = { kind: "General shortcut", unassigned: "Unassigned" }
    expect(shortcutText({ ...base, title: "New session", keys: ["⌘T", "⌘N"] })).toBe(
      "New session General shortcut ⌘T ⌘N",
    )
    expect(shortcutText({ ...base, title: "Home", keys: [] })).toBe("Home General shortcut Unassigned")
  })

  test("filters on the visible row text ignoring case and surrounding space", () => {
    const rows = [
      { title: "New session", keys: ["⌘T", "⌘N"] },
      { title: "Home", keys: [] },
    ]
    const text = (row: (typeof rows)[number]) =>
      shortcutText({ title: row.title, kind: "General shortcut", keys: row.keys, unassigned: "Unassigned" })
    expect(filterShortcuts(rows, "  SESSION ", text)).toEqual([rows[0]])
    expect(filterShortcuts(rows, "⌘n", text)).toEqual([rows[0]])
    expect(filterShortcuts(rows, " unassigned", text)).toEqual([rows[1]])
    expect(filterShortcuts(rows, "general", text)).toEqual(rows)
    expect(filterShortcuts(rows, "", text)).toEqual(rows)
    expect(filterShortcuts(rows, "missing", text)).toEqual([])
  })
})

describe("saving", () => {
  test("a binding other than the default is stored as an override", () => {
    expect(resetsOverride({ preset: "mod+b" }, "mod+shift+y")).toBe(false)
    expect(resetsOverride({ preset: "mod+b" }, "none")).toBe(false)
    expect(resetsOverride({}, "mod+shift+y")).toBe(false)
  })

  test("the default again, or unassigning a command without a default, drops the override", () => {
    expect(resetsOverride({ preset: "mod+b" }, "mod+b")).toBe(true)
    expect(resetsOverride({}, "none")).toBe(true)
    expect(resetsOverride({ preset: undefined }, "none")).toBe(true)
  })
})

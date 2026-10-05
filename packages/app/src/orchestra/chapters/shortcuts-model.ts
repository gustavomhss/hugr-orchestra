import { DEFAULT_PALETTE_KEYBIND, parseKeybind } from "@/context/command"

// Same list, defaults and conflict rules as Settings > Shortcuts; both surfaces write the one
// keybind store in `settings.v3`, which the command context reads to fire bindings.
export const PALETTE_ID = "command.palette"
export const SHORTCUT_GROUPS = ["general", "session", "navigation", "modelAndAgent", "terminal", "prompt"] as const
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number]

export type ShortcutRow = {
  id: string
  title: string
  group: ShortcutGroup
  // Effective binding: the stored override, else the registered default. "none" means unassigned.
  config?: string
  preset?: string
}

type Command = { id: string; title: string; keybind?: string; hidden?: boolean }

export function shortcutRows(input: {
  paletteTitle: string
  catalog: Command[]
  options: Command[]
  overrides: Record<string, string | undefined>
}) {
  const titles = new Map([[PALETTE_ID, input.paletteTitle]])
  const defaults = new Map([[PALETTE_ID, DEFAULT_PALETTE_KEYBIND]])
  input.catalog
    .filter((item) => !item.id.startsWith("suggested.") && !item.hidden)
    .forEach((item) => {
      titles.set(item.id, item.title)
      if (item.keybind) defaults.set(item.id, item.keybind)
    })
  input.options
    .filter((item) => !item.id.startsWith("suggested.") && !item.hidden)
    .forEach((item) => {
      titles.set(item.id, item.title)
      // Live options carry the resolved binding; the catalog keeps the registered default.
      if (item.keybind && !defaults.has(item.id) && input.overrides[item.id] === undefined)
        defaults.set(item.id, item.keybind)
    })
  Object.entries(input.overrides)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string" && !titles.has(entry[0]))
    .forEach(([id]) => titles.set(id, id))

  return [...titles.entries()]
    .map(([id, title]) => ({
      id,
      title,
      group: shortcutGroup(id),
      config: input.overrides[id] ?? defaults.get(id),
      preset: defaults.get(id),
    }))
    .sort(
      (a, b) => SHORTCUT_GROUPS.indexOf(a.group) - SHORTCUT_GROUPS.indexOf(b.group) || a.title.localeCompare(b.title),
    ) satisfies ShortcutRow[]
}

export function shortcutGroup(id: string): ShortcutGroup {
  if (id === PALETTE_ID) return "general"
  if (id.startsWith("terminal.")) return "terminal"
  if (id.startsWith("model.") || id.startsWith("agent.") || id.startsWith("mcp.")) return "modelAndAgent"
  if (id.startsWith("file.") || id.startsWith("fileTree.")) return "navigation"
  if (id.startsWith("prompt.")) return "prompt"
  if (["session.", "message.", "permissions.", "steps.", "review."].some((prefix) => id.startsWith(prefix)))
    return "session"
  return "general"
}

// Turns a key press in the capture field into a binding config. Bare modifiers, Escape and focus
// moves are not combinations; a bare Backspace or Delete clears the binding like Settings does.
export function captureKeybind(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  mac: boolean,
) {
  if (["Shift", "Control", "Alt", "Meta", "Escape", "Dead", "Unidentified", "Process"].includes(event.key)) return
  const modified = event.ctrlKey || event.metaKey || event.altKey
  if (event.key === "Tab" && !modified) return
  if ((event.key === "Backspace" || event.key === "Delete") && !modified && !event.shiftKey) return "none"
  const key = normalizeKey(event.key)
  if (!key) return
  return [
    (mac ? event.metaKey : event.ctrlKey) && "mod",
    mac && event.ctrlKey && "ctrl",
    !mac && event.metaKey && "meta",
    event.altKey && "alt",
    event.shiftKey && "shift",
    key,
  ]
    .filter((part) => typeof part === "string")
    .join("+")
}

export function keybindSignatures(config: string | undefined) {
  if (!config) return []
  return parseKeybind(config)
    .filter((item) => item.key)
    .map((item) =>
      [item.ctrl && "ctrl", item.alt && "alt", item.shift && "shift", item.meta && "meta", item.key]
        .filter((part) => typeof part === "string")
        .join("+"),
    )
}

export function findConflict(rows: ShortcutRow[], id: string, config: string) {
  const next = new Set(keybindSignatures(config))
  if (!next.size) return
  return rows.find((row) => row.id !== id && keybindSignatures(row.config).some((item) => next.has(item)))
}

export function keybindCombos(config: string | undefined) {
  if (!config || config === "none") return []
  return config
    .split(",")
    .map((combo) => combo.trim())
    .filter(Boolean)
}

export function filterShortcuts<T>(rows: T[], query: string, text: (row: T) => string) {
  const value = query.trim().toLowerCase()
  if (!value) return rows
  return rows.filter((row) => text(row).toLowerCase().includes(value))
}

function normalizeKey(key: string) {
  if (key === ",") return "comma"
  if (key === "+") return "plus"
  if (key === " ") return "space"
  return key.toLowerCase()
}

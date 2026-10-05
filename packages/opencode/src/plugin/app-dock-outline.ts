export * as AppDockOutline from "./app-dock-outline"

// AT-SPI role numbers (atspi-constants.h AtspiRole) to the names screen readers announce.
const ROLES = ["invalid", "accelerator label", "alert", "animation", "arrow", "calendar", "canvas", "check box",
  "check menu item", "color chooser", "column header", "combo box", "date editor", "desktop icon", "desktop frame", "dial",
  "dialog", "directory pane", "drawing area", "file chooser", "filler", "focus traversable", "font chooser", "frame",
  "glass pane", "html container", "icon", "image", "internal frame", "label", "layered pane", "list", "list item", "menu",
  "menu bar", "menu item", "option pane", "page tab", "page tab list", "panel", "password text", "popup menu",
  "progress bar", "push button", "radio button", "radio menu item", "root pane", "row header", "scroll bar",
  "scroll pane", "separator", "slider", "spin button", "split pane", "status bar", "table", "table cell",
  "table column header", "table row header", "tearoff menu item", "terminal", "text", "toggle button", "tool bar",
  "tool tip", "tree", "tree table", "unknown", "viewport", "window", "extended", "header", "footer", "paragraph",
  "ruler", "application", "autocomplete", "editbar", "embedded", "entry", "chart", "caption", "document frame",
  "heading", "page", "section", "redundant object", "form", "link", "input method window", "table row", "tree item",
  "document spreadsheet", "document presentation", "document text", "document web", "document email", "comment",
  "list box", "grouping", "image map", "notification", "info bar", "level bar", "title bar", "block quote", "audio",
  "video", "definition", "article", "landmark", "log", "marquee", "math", "rating", "timer", "static",
  "math fraction", "math root", "subscript", "superscript", "description list", "description term",
  "description value", "footnote", "content deletion", "content insertion", "mark", "suggestion", "push button menu"]

// Containers a person scans first, like a screen reader's landmark and region lists.
const REGIONS = new Set(["frame", "dialog", "alert", "window", "menu bar", "menu", "popup menu", "tool bar",
  "page tab list", "landmark", "status bar", "tree", "tree table", "list", "list box", "table", "form",
  "document web", "document frame", "notification", "info bar", "split pane", "grouping", "panel", "section"])
const WRAPPERS = new Set(["filler", "panel", "section", "redundant object", "unknown", "grouping", "html container",
  "layered pane", "root pane", "glass pane", "viewport", "scroll pane", "static", "label", "paragraph"])
const MODALS = new Set(["dialog", "alert", "file chooser", "color chooser", "font chooser"])

// Rotor kinds for list(kind), by readable role.
export const KINDS: Record<string, string[]> = {
  buttons: ["push button", "toggle button", "push button menu"],
  fields: ["entry", "text", "password text", "spin button", "combo box", "editbar", "autocomplete"],
  checks: ["check box", "check menu item", "radio button", "radio menu item", "toggle button"],
  tabs: ["page tab"],
  items: ["list item", "tree item", "table row", "table cell"],
  menus: ["menu bar", "menu", "menu item", "check menu item", "radio menu item", "popup menu"],
  links: ["link"],
  headings: ["heading"],
  regions: [...REGIONS],
}

export type Item = { ref: string; parentRef?: string | null; role?: number; roleName: string; name: string; states?: number[];
  actions?: unknown[]; capabilities?: Record<string, unknown> }

export type Node = { item: Item; role: string; name: string; keys?: string; children: Node[]; parent?: Node }

// A region handle survives rescans by shape, not by ref: role, name, and which same-shaped sibling it is.
export type Handle = { role: string; name: string; occurrence: number; path: string[] }

export function role(item: Pick<Item, "role" | "roleName">) {
  if (typeof item.role === "number" && ROLES[item.role]) return ROLES[item.role]!
  return item.roleName.replace(/-/g, " ")
}

// "Explorer (Ctrl+Shift+E)" and "Settings Ctrl+," carry the shortcut inside the name; separate them.
export function keys(name: string) {
  const match = /^(.*?)\s*\(?((?:(?:Ctrl|Control|Shift|Alt|Super|Meta|Cmd)\+)+[^\s)]+)\)?\s*$/.exec(name)
  if (!match || !match[1]) return { name }
  return { name: match[1], keys: match[2] }
}

export function tree(items: Item[]) {
  const nodes = new Map(items.map((item) => [item.ref, { item, role: role(item), ...keys(item.name), children: [] } as Node]))
  const roots: Node[] = []
  for (const node of nodes.values()) {
    const parent = node.item.parentRef ? nodes.get(node.item.parentRef) : undefined
    if (!parent) {
      roots.push(node)
      continue
    }
    node.parent = parent
    parent.children.push(node)
  }
  return roots
}

const has = (node: Node, state: number) => Array.isArray(node.item.states) && node.item.states.includes(state)
const interactive = (node: Node) => (Array.isArray(node.item.actions) && node.item.actions.length > 0)
  || Object.values(node.item.capabilities ?? {}).some((entry) => typeof entry === "object" && entry !== null
    && "supported" in entry && entry.supported === true)
const region = (node: Node) => REGIONS.has(node.role) && (node.name !== "" || !["grouping", "panel", "section"].includes(node.role))

// Hidden subtrees (inactive views, closed popups) are skipped unless they hold the focus; toolkits that never
// report showing/visible keep everything.
const hidden = (node: Node) => Array.isArray(node.item.states) && node.item.states.length > 0
  && !node.item.states.includes(25) && !node.item.states.includes(30) && !node.item.states.includes(12)

function walk(node: Node, visit: (node: Node) => void) {
  if (hidden(node)) return
  visit(node)
  node.children.forEach((child) => walk(child, visit))
}

export function handle(node: Node): Handle {
  const path: string[] = []
  for (let current = node.parent; current; current = current.parent) if (region(current)) path.unshift(`${current.role}:${current.name}`)
  const siblings = node.parent ? node.parent.children : []
  return { role: node.role, name: node.name, path,
    occurrence: siblings.filter((other) => other.role === node.role && other.name === node.name).indexOf(node) }
}

export function locate(roots: Node[], wanted: Handle) {
  const found: Node[] = []
  roots.forEach((root) => walk(root, (node) => {
    const current = handle(node)
    if (current.role === wanted.role && current.name === wanted.name && current.occurrence === wanted.occurrence
      && current.path.join("/") === wanted.path.join("/")) found.push(node)
  }))
  return found.length === 1 ? found[0] : undefined
}

// The visible meaning of a control in one line; the role and name double as a ui_act/ui_type target.
export function line(node: Node) {
  const states = [has(node, 1) && "active", has(node, 12) && "focused", has(node, 4) && "checked", has(node, 23) && "selected",
    has(node, 10) && "expanded", has(node, 9) && "expandable", !has(node, 8) && interactive(node) && "disabled"].filter(Boolean)
  return `${node.role}${node.name ? ` "${node.name}"` : ""}${node.keys ? ` keys=${node.keys}` : ""}${states.length ? ` [${states.join(", ")}]` : ""}`
}

function count(node: Node) {
  const totals = { controls: 0, regions: 0 }
  node.children.forEach((child) => walk(child, (inner) => {
    if (region(inner)) totals.regions++
    else if (interactive(inner)) totals.controls++
  }))
  return totals
}

// Regions directly below `scope`, looking through unnamed wrappers; controls directly in scope, likewise.
function contents(scope: Node) {
  const regions: Node[] = []
  const controls: Node[] = []
  const visit = (node: Node) => {
    if (hidden(node)) return
    if (region(node)) return void regions.push(node)
    if (interactive(node) || (node.name && !WRAPPERS.has(node.role)) || node.role === "heading") controls.push(node)
    node.children.forEach(visit)
  }
  scope.children.forEach(visit)
  return { regions, controls }
}

export function windows(roots: Node[]) {
  return roots.flatMap((root) => ["frame", "dialog", "window", "alert", "application"].includes(root.role) ? [root] : [])
}

export type Look = { text: string; regions: Handle[] }

// What a screen reader user hears for "where am I" plus a landmark list: modal first, focus, then the scope's map.
export function look(roots: Node[], scope?: Node, limit = 40): Look {
  const all: Node[] = []
  roots.forEach((root) => walk(root, (node) => all.push(node)))
  const focused = all.find((node) => has(node, 12))
  const modal = all.find((node) => MODALS.has(node.role) && (has(node, 16) || has(node, 1)))
  const active = windows(roots).find((node) => has(node, 1)) ?? windows(roots)[0]
  const base = scope ?? modal ?? active ?? roots[0]
  const lines: string[] = []
  if (!base) return { text: "No app windows are visible in the Linux workspace.", regions: [] }
  lines.push(`windows: ${windows(roots).map(line).join("; ") || "none"}`)
  if (modal) lines.push(`modal: ${line(modal)} — it holds the input until it is closed`)
  if (focused) {
    const trail: string[] = []
    for (let current = focused.parent; current; current = current.parent) if (region(current) && current.name) trail.push(line(current))
    lines.push(`focus: ${line(focused)}${trail.length ? ` in ${trail.slice(0, 3).join(" < ")}` : ""}`)
  }
  lines.push(`scope: ${line(base)}${scope ? " (ui_up to leave)" : ""}`)
  const inside = contents(base)
  const handles = inside.regions.map(handle)
  if (inside.regions.length) {
    lines.push("regions (ui_enter with the number):")
    inside.regions.forEach((node, index) => {
      const totals = count(node)
      const preview = node.children.length <= 8 ? contents(node).controls.slice(0, 6).map((child) => `${child.name}${child.keys ? ` (${child.keys})` : ""}`).filter(Boolean) : []
      lines.push(`  #${index + 1} ${line(node)} — ${totals.controls} controls${totals.regions ? `, ${totals.regions} regions` : ""}${preview.length ? `: ${preview.join(", ")}` : ""}`)
    })
  }
  if (inside.controls.length) {
    lines.push(`controls here${inside.controls.length > limit ? ` (first ${limit} of ${inside.controls.length})` : ""}:`)
    inside.controls.slice(0, limit).forEach((node) => lines.push(`  ${line(node)}`))
  }
  return { text: lines.join("\n"), regions: handles }
}

export function list(scope: Node, kind: string, limit = 60) {
  const roles = KINDS[kind] ?? []
  const found: Node[] = []
  scope.children.forEach((child) => walk(child, (node) => {
    if (roles.includes(node.role) && (kind !== "regions" || region(node))) found.push(node)
  }))
  const lines = found.slice(0, limit).map(line)
  return `${found.length} ${kind} in ${line(scope)}${found.length > limit ? ` (first ${limit})` : ""}:\n${lines.map((entry) => `  ${entry}`).join("\n")}`
}

import { matchWildcard } from "@/utils/wildcard"

// Sections of the routed Settings view, in navigation order: the Settings dialog's tabs first (General, Shortcuts,
// Servers, Providers, Models), then the sections only the routed view has. General is the default.
export const SETTINGS_SECTIONS = [
  "general",
  "shortcuts",
  "servers",
  "providers",
  "models",
  "permissions",
  "agents",
  "mcp",
  "trust",
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

// The sections that read only server-wide state. With no project open, only these tabs are shown, so no tab
// ends in "Open a project".
export const GLOBAL_SETTINGS_SECTIONS = ["general", "shortcuts", "servers", "trust"] as const
export type GlobalSettingsSection = (typeof GLOBAL_SETTINGS_SECTIONS)[number]

export function settingsSection(value: unknown): SettingsSection {
  return SETTINGS_SECTIONS.find((item) => item === value) ?? "general"
}

export function globalSettingsSection(value: unknown): GlobalSettingsSection {
  return GLOBAL_SETTINGS_SECTIONS.find((item) => item === value) ?? "general"
}

// The tools the mock lists, in its order.
export const PERMISSION_TOOLS = [
  "read",
  "edit",
  "glob",
  "grep",
  "list",
  "bash",
  "task",
  "skill",
  "lsp",
  "todowrite",
  "webfetch",
  "websearch",
  "external_directory",
  "doom_loop",
] as const
export type PermissionTool = (typeof PERMISSION_TOOLS)[number]
export const PERMISSION_ACTIONS = ["allow", "ask", "deny"] as const

export type PermissionEffect = (typeof PERMISSION_ACTIONS)[number]
export type PermissionRule = { action: string; resource: string; effect: PermissionEffect }

// The server's own "*" defaults (packages/core/src/plugin/agent.ts). It evaluates each agent's defaults first, then
// the configured rules; the last matching rule wins. Everything is allowed except external_directory, which asks.
const BUILT_IN: PermissionRule[] = [
  { action: "*", resource: "*", effect: "allow" },
  { action: "external_directory", resource: "*", effect: "ask" },
]

// Keeps the well-formed rules of a config value, in its order.
export function permissionRules(value: unknown): PermissionRule[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: { action?: unknown; resource?: unknown; effect?: unknown } | null) => {
    if (!item || typeof item !== "object") return []
    const effect = PERMISSION_ACTIONS.find((action) => action === item.effect)
    if (typeof item.action !== "string" || typeof item.resource !== "string" || !effect) return []
    return [{ action: item.action, resource: item.resource, effect }]
  })
}

// The tool's default, as the server evaluates it: last match wins, and only rules that cover every input
// (resource "*") decide the default.
export function permissionAction(rules: readonly PermissionRule[], tool: PermissionTool): PermissionEffect {
  return (
    [...BUILT_IN, ...rules].findLast((item) => item.resource === "*" && matchWildcard(tool, item.action))?.effect ??
    "ask"
  )
}

// Rewrites the tool's own "*" rules in place, so every other rule keeps its place, or appends one for a tool without
// rules. A tool whose rules are all patterns, or whose new rule a later wildcard would override, is reported instead:
// fixing either would reorder rules the user wrote in the config file.
export function permissionWrite(
  rules: readonly PermissionRule[],
  tool: PermissionTool,
  effect: PermissionEffect,
): { next: PermissionRule[] } | { locked: PermissionLock } {
  const own = rules.filter((item) => item.action === tool)
  if (own.length > 0 && own.every((item) => item.resource !== "*")) return { locked: "patterns" }
  const next = own.length
    ? rules.map((item) => (item.action === tool && item.resource === "*" ? { ...item, effect } : item))
    : [...rules, { action: tool, resource: "*", effect }]
  if (permissionAction(next, tool) !== effect) return { locked: "shadowed" }
  return { next }
}
export type PermissionLock = "patterns" | "shadowed"

export function permissionLock(rules: readonly PermissionRule[], tool: PermissionTool) {
  return PERMISSION_ACTIONS.flatMap((effect) => {
    const result = permissionWrite(rules, tool, effect)
    return "locked" in result ? [result.locked] : []
  })[0]
}

// Context windows read the way the mock writes them: 200000 -> 200K, 262144 -> 256K, 1000000 -> 1M.
export function contextLabel(tokens: number | undefined) {
  if (!tokens || tokens <= 0) return
  if (tokens % 1_000_000 === 0) return `${tokens / 1_000_000}M`
  if (tokens % 1_048_576 === 0) return `${tokens / 1_048_576}M`
  if (tokens % 1000 === 0) return `${tokens / 1000}K`
  if (tokens % 1024 === 0) return `${tokens / 1024}K`
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`
  return `${Math.round(tokens / 1000)}K`
}

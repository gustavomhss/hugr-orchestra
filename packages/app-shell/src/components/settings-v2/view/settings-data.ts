import type { PermissionActionConfig, PermissionRuleConfig } from "@orchestra/sdk/v2/client"
import { matchWildcard } from "@/utils/wildcard"

// Sections of the routed Settings view, in navigation order. The first six are the approved
// mock's; General and Servers keep the remaining real settings reachable.
export const SETTINGS_SECTIONS = [
  "permissions",
  "providers",
  "models",
  "agents",
  "mcp",
  "shortcuts",
  "general",
  "servers",
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function settingsSection(value: unknown): SettingsSection {
  return SETTINGS_SECTIONS.find((item) => item === value) ?? "permissions"
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

type Rule = { key: string; pattern: string; action: PermissionActionConfig }

// The server's own defaults (packages/orchestra/src/agent/agent.ts). It evaluates them first, then each agent's
// built-in rules (plan denies edits, for example), then the configured rules; the last matching rule wins. Only
// their "*" defaults are listed: everything is allowed except doom_loop and external_directory, which ask.
const BUILT_IN: Rule[] = [
  { key: "*", pattern: "*", action: "allow" },
  { key: "doom_loop", pattern: "*", action: "ask" },
  { key: "external_directory", pattern: "*", action: "ask" },
]

export function permissionMap(config: unknown): Record<string, PermissionRuleConfig> {
  if (config && typeof config === "object" && !Array.isArray(config))
    return Object.fromEntries(Object.entries(config).filter((entry) => rule(entry[1])))
  const action = actionOf(config)
  if (action) return { "*": action }
  return {}
}

// The tool's default, as the server evaluates it: rules in key order, last match wins, and only rules that
// cover every input ("*") decide the default.
export function permissionAction(config: unknown, tool: PermissionTool): PermissionActionConfig {
  return (
    [...BUILT_IN, ...rules(config)].findLast((item) => item.pattern === "*" && matchWildcard(tool, item.key))?.action ??
    "ask"
  )
}

// The server deep-merges a config patch: existing keys keep their place and new keys go last, at every level.
// A write therefore cannot move a tool past a later wildcard rule, and a "*" added to a patterned rule would land
// after (and override) its patterns. Both cases are reported instead of written.
export function permissionWrite(
  config: unknown,
  tool: PermissionTool,
  action: PermissionActionConfig,
): { next: Record<string, PermissionRuleConfig> } | { locked: PermissionLock } {
  const map = permissionMap(config)
  const current = map[tool]
  if (typeof current === "object" && !("*" in current) && Object.keys(current).length > 0) return { locked: "patterns" }
  const next = { ...map, [tool]: typeof current === "object" ? { ...current, "*": action } : action }
  if (permissionAction(next, tool) !== action) return { locked: "shadowed" }
  return { next }
}
export type PermissionLock = "patterns" | "shadowed"

export function permissionLock(config: unknown, tool: PermissionTool) {
  return PERMISSION_ACTIONS.flatMap((action) => {
    const result = permissionWrite(config, tool, action)
    return "locked" in result ? [result.locked] : []
  })[0]
}

function rules(config: unknown): Rule[] {
  return Object.entries(permissionMap(config)).flatMap(([key, value]) => {
    if (typeof value === "string") return [{ key, pattern: "*", action: value }]
    return Object.entries(value).flatMap(([pattern, action]) => {
      const valid = actionOf(action)
      return valid ? [{ key, pattern, action: valid }] : []
    })
  })
}

function actionOf(value: unknown) {
  return PERMISSION_ACTIONS.find((item) => item === value)
}

function rule(value: unknown): value is PermissionRuleConfig {
  if (actionOf(value)) return true
  return !!value && typeof value === "object" && !Array.isArray(value)
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

// New turns use the configured default model (`config.model`, "provider/model"). Choosing a
// route keeps the current model when that provider serves it, otherwise the provider's default.
export function routeModel(input: {
  provider: { id: string; models: Record<string, unknown> }
  defaults: Record<string, string>
  current?: { providerID: string; modelID: string }
}) {
  const models = Object.keys(input.provider.models)
  const keep = input.current && models.includes(input.current.modelID) ? input.current.modelID : undefined
  const fallback = input.defaults[input.provider.id]
  const model = keep ?? (fallback && models.includes(fallback) ? fallback : models[0])
  if (!model) return
  return `${input.provider.id}/${model}`
}

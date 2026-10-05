import type { PermissionActionConfig, PermissionRuleConfig } from "@opencode-ai/sdk/v2/client"

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

// The server starts every agent from these rules before applying the user's config
// (packages/opencode/src/agent/agent.ts): everything is allowed except these two.
const BUILT_IN: Partial<Record<PermissionTool, PermissionActionConfig>> = {
  doom_loop: "ask",
  external_directory: "ask",
}

export function permissionMap(config: unknown): Record<string, PermissionRuleConfig> {
  if (config && typeof config === "object" && !Array.isArray(config))
    return Object.fromEntries(Object.entries(config).filter((entry) => rule(entry[1])))
  const action = actionOf(config)
  if (action) return { "*": action }
  return {}
}

export function permissionAction(config: unknown, tool: PermissionTool): PermissionActionConfig {
  const map = permissionMap(config)
  return ruleDefault(map[tool]) ?? ruleDefault(map["*"]) ?? BUILT_IN[tool] ?? "allow"
}

// Patterned rules keep their patterns; only their default changes.
export function permissionUpdate(config: unknown, tool: PermissionTool, action: PermissionActionConfig) {
  const map = permissionMap(config)
  const current = map[tool]
  return { ...map, [tool]: typeof current === "object" ? { ...current, "*": action } : action }
}

function actionOf(value: unknown) {
  return PERMISSION_ACTIONS.find((item) => item === value)
}

function ruleDefault(value: PermissionRuleConfig | undefined) {
  if (typeof value === "object") return actionOf(value["*"])
  return actionOf(value)
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

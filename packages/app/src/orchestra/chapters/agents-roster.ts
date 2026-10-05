import type { Agent, AgentFileAction, AgentFileInfo, AgentFileInput, AgentFilePermission } from "@opencode-ai/sdk/v2/client"

// The tool permissions an agent file can override, in the order the profile settings list them.
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
export type PermissionChoice = "inherit" | "custom" | AgentFileAction
export type AgentMode = NonNullable<AgentFileInput["mode"]>
export const AGENT_MODES: AgentMode[] = ["primary", "subagent", "all"]

export type AgentDraft = {
  name: string
  mode: AgentMode
  description: string
  model: string
  steps: string
  system: string
  permission: Record<PermissionTool, PermissionChoice>
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export function agentRoster(agents: readonly Agent[]) {
  return agents
    .filter((agent) => !agent.hidden)
    .map((agent) => ({
      agent,
      subagent: agent.mode === "subagent",
      chat: agent.mode === "primary" || agent.mode === "all",
    }))
}

export function agentUnavailable(error: unknown) {
  const status =
    error instanceof Error && error.cause && typeof error.cause === "object" && "status" in error.cause
      ? error.cause.status
      : undefined
  return status === 404 || status === 405
}

export function modelKey(agent: Agent) {
  return agent.model ? `${agent.model.providerID}/${agent.model.modelID}` : ""
}

/** Seeds the editor from the project file first, then from the agent the server resolved. */
export function agentDraft(agent: Agent | undefined, file: AgentFileInfo | undefined): AgentDraft {
  const steps = file?.steps ?? agent?.steps
  return {
    name: agent?.name ?? "",
    mode: file?.mode ?? agent?.mode ?? "subagent",
    description: file?.description ?? agent?.description ?? "",
    model: file?.model ?? (agent ? modelKey(agent) : ""),
    steps: steps === undefined ? "" : String(steps),
    system: file?.system ?? agent?.prompt ?? "",
    permission: Object.fromEntries(
      PERMISSION_TOOLS.map((tool) => [tool, choiceOf(file?.permission?.[tool])]),
    ) as AgentDraft["permission"],
  }
}

/** Builds the file payload. Pattern maps and tools the editor does not list stay as the file had them. */
export function agentFileInput(draft: AgentDraft, file: AgentFileInfo | undefined): AgentFileInput {
  const kept = Object.entries(file?.permission ?? {}).filter(
    ([tool]) => !isPermissionTool(tool) || draft.permission[tool] === "custom",
  )
  const explicit = PERMISSION_TOOLS.flatMap((tool) => {
    const choice = draft.permission[tool]
    return choice === "inherit" || choice === "custom" ? [] : [[tool, choice] as const]
  })
  const steps = draft.steps.trim()
  return {
    mode: draft.mode,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.model ? { model: draft.model } : {}),
    ...(steps ? { steps: Number(steps) } : {}),
    ...(draft.system.trim() ? { system: draft.system.trim() } : {}),
    permission: Object.fromEntries([...kept, ...explicit]),
  }
}

export function draftError(draft: AgentDraft, names: readonly string[], creating: boolean) {
  const name = draft.name.trim()
  if (!NAME.test(name)) return "name" as const
  if (creating && names.some((item) => item.toLowerCase() === name.toLowerCase())) return "duplicate" as const
  const steps = draft.steps.trim()
  if (steps && !(/^\d+$/.test(steps) && Number(steps) > 0)) return "steps" as const
}

/**
 * What a tool falls back to without this agent's override. The server returns the merged ruleset with
 * the file's rules last, so drop the last copy of each override rule and read the remaining `*` rule.
 */
export function inheritedAction(rules: Agent["permission"], tool: string, override: AgentFilePermission | undefined) {
  const own = override === undefined ? [] : typeof override === "string" ? [["*", override]] : Object.entries(override)
  const remaining = own.reduce((list, [pattern, action]) => {
    const index = list.findLastIndex(
      (rule) => rule.permission === tool && rule.pattern === pattern && rule.action === action,
    )
    return index === -1 ? list : list.toSpliced(index, 1)
  }, rules)
  return remaining.findLast((rule) => rule.pattern === "*" && wildcard(rule.permission, tool))?.action
}

function choiceOf(value: AgentFilePermission | undefined): PermissionChoice {
  if (value === undefined) return "inherit"
  if (typeof value === "string") return value
  return "custom"
}

function isPermissionTool(tool: string): tool is PermissionTool {
  return PERMISSION_TOOLS.some((item) => item === tool)
}

function wildcard(pattern: string, value: string) {
  if (pattern === value || pattern === "*") return true
  if (!pattern.includes("*")) return false
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${source}$`).test(value)
}

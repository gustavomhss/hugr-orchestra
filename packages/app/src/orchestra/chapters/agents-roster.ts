import type {
  Agent,
  AgentFileAction,
  AgentFileInfo,
  AgentFileInput,
  AgentFilePermission,
} from "@opencode-ai/sdk/v2/client"
import { agentKey } from "@/context/agent-identity"

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

const NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
// Windows refuses these as file names whatever the extension; the server rejects them too.
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

export function agentRoster(agents: readonly Agent[]) {
  return agents
    .filter((agent) => !agent.hidden)
    .map((agent) => ({
      agent,
      subagent: agent.mode === "subagent",
      // The user talks only to Maestro; every other agent works through it. Its id is stable, its name configurable.
      chat: agentKey(agent) === "maestro",
    }))
}

export function errorStatus(error: unknown) {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") return
  return "status" in error.cause && typeof error.cause.status === "number" ? error.cause.status : undefined
}

export function errorKind(error: unknown) {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") return
  return "kind" in error.cause && typeof error.cause.kind === "string" ? error.cause.kind : undefined
}

export function agentUnavailable(error: unknown) {
  const status = errorStatus(error)
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

/**
 * Builds the file payload. A value the file does not set and the user left at the resolved value stays out,
 * so saving never freezes a built-in default into the file. Rules keep the file's order (later entries win):
 * a changed tool is replaced in place, a new one goes last, and pattern maps or unlisted tools stay.
 */
export function agentFileInput(
  draft: AgentDraft,
  file: AgentFileInfo | undefined,
  agent: Agent | undefined,
): AgentFileInput {
  const resolved = agent ? agentDraft(agent, undefined) : undefined
  const keep = (key: "mode" | "description" | "model" | "steps" | "system", value: string) =>
    value !== "" && (file?.[key] !== undefined || !resolved || resolved[key].trim() !== value)
  const description = draft.description.trim()
  const steps = draft.steps.trim()
  const system = draft.system.trim()
  const current = file?.permission ?? {}
  const permission = Object.fromEntries([
    ...Object.entries(current).flatMap(([tool, value]): [string, AgentFilePermission][] => {
      if (!isPermissionTool(tool)) return [[tool, value]]
      const choice = draft.permission[tool]
      if (choice === "inherit") return []
      return [[tool, choice === "custom" ? value : choice]]
    }),
    ...PERMISSION_TOOLS.flatMap((tool): [string, AgentFilePermission][] => {
      const choice = draft.permission[tool]
      return Object.hasOwn(current, tool) || choice === "inherit" || choice === "custom" ? [] : [[tool, choice]]
    }),
  ])
  return {
    ...(keep("mode", draft.mode) ? { mode: draft.mode } : {}),
    ...(keep("description", description) ? { description } : {}),
    ...(keep("model", draft.model) ? { model: draft.model } : {}),
    ...(keep("steps", steps) ? { steps: Number(steps) } : {}),
    ...(keep("system", system) ? { system } : {}),
    permission,
    ...(file ? { revision: file.revision } : {}),
  }
}

/** Disabling keeps what the file defines, so restoring the agent only takes removing `disable: true`. */
export function removeInput(file: AgentFileInfo | undefined): AgentFileInput {
  return {
    description: file?.description,
    mode: file?.mode,
    model: file?.model,
    steps: file?.steps,
    system: file?.system,
    permission: file?.permission,
    disable: true,
    ...(file ? { revision: file.revision } : {}),
  }
}

export function draftError(draft: AgentDraft, names: readonly string[], creating: boolean) {
  const name = draft.name.trim()
  if (!NAME.test(name) || RESERVED.test(name)) return "name" as const
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

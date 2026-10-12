import { matchWildcard } from "@/utils/wildcard"
import { createStore } from "solid-js/store"
import type { Provider } from "@orchestra/sdk/v2/client"

export interface ModelRule {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

/** Chat visibility preferences must not hide models from the subagent permission editor. */
export function connectedSubagentModels(providers: readonly Provider[]) {
  return providers.flatMap((provider) => Object.values(provider.models).map((model) => ({ ...model, provider })))
}

/** Serialize writes and use acknowledged rules while the session event is still in flight. */
export function createModelRuleEditor(input: {
  read: () => ModelRule[]
  write: (rules: ModelRule[]) => Promise<ModelRule[]>
}) {
  const [state, setState] = createStore({
    saving: false,
    failed: false,
    rules: undefined as ModelRule[] | undefined,
  })
  const rules = () => {
    const current = input.read()
    const acknowledged = state.rules
    // V1 appends rules. An event can contain ACK A after ACK B already arrived over HTTP.
    // Retain B only for a strict prefix; equal, extended or replaced snapshots are authoritative.
    if (
      acknowledged &&
      current.length < acknowledged.length &&
      current.every(
        (rule, index) =>
          rule.permission === acknowledged[index].permission &&
          rule.pattern === acknowledged[index].pattern &&
          rule.action === acknowledged[index].action,
      )
    )
      return acknowledged
    return current
  }
  return {
    state,
    rules,
    async set(providerID: string, modelID: string, allow: boolean) {
      if (state.saving) return
      const permission = toggleModelRules(rules(), providerID, modelID, allow)
      setState({ saving: true, failed: false })
      await input
        .write(permission)
        .then((rules) => setState({ rules }))
        .catch(() => setState("failed", true))
        .finally(() => setState("saving", false))
    },
  }
}

/** Agent turns need text input/output and tool calls. Missing catalog entries remain visible as unavailable. */
export function modelUnavailable(model?: {
  status?: string
  capabilities: { toolcall: boolean; input: { text: boolean }; output: { text: boolean } }
}) {
  if (!model || model.status === "deprecated") return "unavailable" as const
  if (!model.capabilities.toolcall || !model.capabilities.input.text || !model.capabilities.output.text)
    return "incompatible" as const
}

export function parseModelKey(key: string) {
  const slash = key.indexOf("/")
  if (slash <= 0 || slash === key.length - 1) return
  return { providerID: key.slice(0, slash), modelID: key.slice(slash + 1) }
}

/** Model-scope globs are case-sensitive, full-string, and normalize slashes on both sides. `*` spans `/`. */
export function wildcardMatch(str: string, pattern: string): boolean {
  return matchWildcard(str.replaceAll("\\", "/"), pattern.replaceAll("\\", "/"))
}

const TASK = "task"

/** True when the session carries model-scoped task rules. Mirrors the
    detection in TaskTool (packages/orchestra/src/tool/task.ts) exactly:
    permission === "task" with a "/" in the pattern. */
export function hasModelScope(rules: readonly ModelRule[]): boolean {
  return rules.some((rule) => rule.permission === TASK && rule.pattern.includes("/"))
}

/** Effective state for one provider/model: last matching rule wins,
    mirroring Permission.evaluate (default: unconstrained). */
export function effectiveModelState(
  rules: readonly ModelRule[],
  providerID: string,
  modelID: string,
): ModelRule["action"] | undefined {
  const target = `${providerID}/${modelID}`
  let state: ModelRule["action"] | undefined
  for (const rule of rules) {
    if (rule.permission !== TASK && !wildcardMatch(TASK, rule.permission)) continue
    if (!wildcardMatch(target, rule.pattern)) continue
    state = rule.action
  }
  return state
}

/** Rules to APPEND (server merges, last match wins) for toggling one model.
    First constraint also writes the star-slash-star deny baseline so unchecked
    models stay unavailable instead of falling through to ask. That shape only
    matches provider/model patterns — never a bare subagent_type. */
export function toggleModelRules(
  rules: readonly ModelRule[],
  providerID: string,
  modelID: string,
  allow: boolean,
): ModelRule[] {
  const out: ModelRule[] = []
  if (allow && !hasModelScope(rules)) {
    out.push({ permission: TASK, pattern: "*/*", action: "deny" })
  }
  out.push({ permission: TASK, pattern: `${providerID}/${modelID}`, action: allow ? "allow" : "deny" })
  return out
}

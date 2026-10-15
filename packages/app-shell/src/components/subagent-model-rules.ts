import { matchWildcard } from "@/utils/wildcard"
import { createStore } from "solid-js/store"
import type { Provider } from "@orchestra/sdk/v2/client"
import type { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import type { Schema } from "effect"

export type SubagentModelPolicy = Schema.Codec.Encoded<typeof SessionSubagentModels.Policy>
export type ModelPolicySnapshot = {
  policy: SubagentModelPolicy
  timestamp?: number
  revision?: number
  /** Local canonical-read receipt, not a durable sequence. */
  readVersion?: number
}

type ModelPolicyEditorState = {
  saving: boolean
  failed: boolean
  error?: unknown
  acknowledged?: SubagentModelPolicy
  retry?: SubagentModelPolicy
}

type ModelPolicyFreshness = {
  timestamp?: number
  revision?: number
  ackRevision?: number
  readVersion?: number
  caughtUp: boolean
  predecessors: SubagentModelPolicy[]
}

export function sameModelPolicy(left: SubagentModelPolicy, right: SubagentModelPolicy) {
  if (left.mode !== right.mode) return false
  if (left.mode === "inherit" || right.mode === "inherit") return true
  return (
    left.models.length === right.models.length &&
    left.models.every((model) => right.models.some((item) => item.providerID === model.providerID && item.id === model.id))
  )
}

/** V2 replaces the whole policy, retaining identities missing from today's catalog. */
export function toggleModelPolicy(
  policy: SubagentModelPolicy,
  providerID: string,
  id: string,
  allow: boolean,
): SubagentModelPolicy {
  const models = policy.mode === "allowlist" ? policy.models : []
  return {
    mode: "allowlist",
    models: [
      ...models.filter((model) => model.providerID !== providerID || model.id !== id),
      ...(allow ? [{ providerID, id }] : []),
    ],
  }
}

/** Canonical snapshots fence ACKs. Policy-only callers retain the latest ACK over known delayed predecessors. */
export function createModelPolicyEditor(input: {
  read: () => ModelPolicySnapshot
  write: (policy: SubagentModelPolicy) => Promise<SubagentModelPolicy | ModelPolicySnapshot>
}) {
  const [state, setState] = createStore<ModelPolicyEditorState>({
    saving: false,
    failed: false,
  })
  const freshness: ModelPolicyFreshness = {
    caughtUp: false,
    predecessors: [],
  }
  const policy = () => {
    const current = input.read()
    const acknowledged = state.acknowledged
    if (!acknowledged) return current.policy
    if (sameModelPolicy(current.policy, acknowledged)) {
      freshness.caughtUp = true
      freshness.timestamp = current.timestamp
      freshness.revision = current.revision
      freshness.ackRevision = current.revision === undefined
        ? freshness.ackRevision
        : Math.max(freshness.ackRevision ?? 0, current.revision)
      freshness.readVersion = current.readVersion ?? freshness.readVersion
      freshness.predecessors = []
      return current.policy
    }
    if (current.readVersion !== undefined && current.readVersion > (freshness.readVersion ?? 0))
      return current.policy
    if (current.revision !== undefined && freshness.ackRevision !== undefined && current.revision <= freshness.ackRevision)
      return acknowledged
    if (
      current.revision !== undefined &&
      freshness.ackRevision !== undefined &&
      current.revision > freshness.ackRevision &&
      (current.timestamp ?? 0) >= (freshness.timestamp ?? 0)
    )
      return current.policy
    // A timestamp-only event cannot prove that a known predecessor is newer than a policy-only ACK.
    if (!freshness.caughtUp && freshness.predecessors.some((item) => sameModelPolicy(item, current.policy)))
      return acknowledged
    if (current.timestamp !== undefined && freshness.timestamp !== undefined && current.timestamp > freshness.timestamp)
      return current.policy
    if (current.revision !== undefined && freshness.revision !== undefined && current.revision <= freshness.revision &&
      (current.timestamp ?? 0) <= (freshness.timestamp ?? 0))
      return acknowledged
    if ((current.revision === undefined || freshness.revision === undefined) &&
      current.timestamp !== undefined && freshness.timestamp !== undefined && current.timestamp <= freshness.timestamp)
      return acknowledged
    return current.policy
  }
  const replace = async (next: SubagentModelPolicy) => {
    if (state.saving) return
    const selected = policy()
    const current = input.read()
    // Adopt newer canonical authority before advancing the next write's freshness fence.
    if (state.acknowledged && !sameModelPolicy(selected, state.acknowledged)) {
      freshness.ackRevision = current.revision
      // A nested store setter would merge into the prior caller-owned ACK.
      setState({ acknowledged: selected })
    }
    freshness.predecessors.push(selected)
    freshness.timestamp = current.timestamp
    freshness.revision = current.revision
    freshness.readVersion = current.readVersion ?? freshness.readVersion
    freshness.caughtUp = false
    setState({ saving: true, failed: false, error: undefined, retry: next })
    await input
      .write(next)
      .then((acknowledged) => {
        if ("policy" in acknowledged) {
          freshness.timestamp = acknowledged.timestamp
          freshness.revision = acknowledged.revision
          freshness.ackRevision = acknowledged.revision
          freshness.readVersion = acknowledged.readVersion
          freshness.caughtUp = true
          freshness.predecessors = []
          setState({ acknowledged: acknowledged.policy, retry: undefined })
          return
        }
        // The pre-write snapshot cannot sequence a later policy-only ACK, even across durable gaps.
        freshness.ackRevision = undefined
        setState({ acknowledged, retry: undefined })
      })
      .catch((error: unknown) => setState({ failed: true, error }))
      .finally(() => setState("saving", false))
  }
  return {
    state,
    policy,
    replace,
    set: (providerID: string, id: string, allow: boolean) => replace(toggleModelPolicy(policy(), providerID, id, allow)),
    inherit: () => replace({ mode: "inherit" }),
    retry: () => state.retry ? replace(state.retry) : Promise.resolve(),
  }
}

/** Chat visibility preferences must not hide models from the subagent permission editor. */
export function connectedSubagentModels(providers: readonly Provider[]) {
  return providers.flatMap((provider) => Object.values(provider.models).map((model) => ({ ...model, provider })))
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

export interface ModelRule {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

type ModelRuleEditorState = { saving: boolean; failed: boolean; rules?: ModelRule[] }

/** V1 writes append. Hold the HTTP ACK while a strict-prefix event is still in flight. */
export function createModelRuleEditor(input: {
  read: () => ModelRule[]
  write: (rules: ModelRule[]) => Promise<ModelRule[]>
}) {
  const [state, setState] = createStore<ModelRuleEditorState>({
    saving: false,
    failed: false,
  })
  const rules = () => {
    const current = input.read()
    const acknowledged = state.rules
    if (
      acknowledged &&
      current.length < acknowledged.length &&
      current.every((rule, index) =>
        rule.permission === acknowledged[index].permission &&
        rule.pattern === acknowledged[index].pattern &&
        rule.action === acknowledged[index].action,
      )
    ) return acknowledged
    return current
  }
  return {
    state,
    rules,
    async set(providerID: string, modelID: string, allow: boolean) {
      if (state.saving) return
      const permission = toggleModelRules(rules(), providerID, modelID, allow)
      setState({ saving: true, failed: false })
      await input.write(permission)
        .then((rules) => setState({ rules }))
        .catch(() => setState("failed", true))
        .finally(() => setState("saving", false))
    },
  }
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
): "allow" | "deny" | undefined {
  const target = `${providerID}/${modelID}`
  let state: "allow" | "deny" | undefined
  for (const rule of rules) {
    if (rule.permission !== TASK && !wildcardMatch(TASK, rule.permission)) continue
    if (!wildcardMatch(target, rule.pattern)) continue
    if (rule.action === "allow" || rule.action === "deny") state = rule.action
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

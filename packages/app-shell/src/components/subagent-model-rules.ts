import { createStore } from "solid-js/store"
import type { Provider } from "@/v2-wire"
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

export function sameModelPolicy(left: SubagentModelPolicy, right: SubagentModelPolicy) {
  if (left.mode !== right.mode) return false
  if (left.mode === "inherit" || right.mode === "inherit") return true
  return (
    left.models.length === right.models.length &&
    left.models.every((model) => right.models.some((item) => item.providerID === model.providerID && item.id === model.id))
  )
}

/** The server replaces the whole policy, retaining identities missing from today's catalog. */
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
  const [state, setState] = createStore({
    saving: false,
    failed: false,
    error: undefined as unknown,
    acknowledged: undefined as SubagentModelPolicy | undefined,
    retry: undefined as SubagentModelPolicy | undefined,
  })
  const freshness = {
    timestamp: undefined as number | undefined,
    revision: undefined as number | undefined,
    ackRevision: undefined as number | undefined,
    readVersion: undefined as number | undefined,
    caughtUp: false,
    predecessors: [] as SubagentModelPolicy[],
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
    // Adopt canonical authority before the next write fence can hide it behind an older ACK.
    if (state.acknowledged && !sameModelPolicy(selected, state.acknowledged)) {
      freshness.ackRevision = current.revision
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

export function parseModelKey(key: string) {
  const slash = key.indexOf("/")
  if (slash <= 0 || slash === key.length - 1) return
  return { providerID: key.slice(0, slash), modelID: key.slice(slash + 1) }
}

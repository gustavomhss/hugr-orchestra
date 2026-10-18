import { createStore } from "solid-js/store"
import type { Session } from "@/compat/sdk-v2-client"
import type { SubagentModelPolicy } from "../subagent-model-rules"
import type { FailedPolicyWrite } from "./submission-policy"
import type { AdmissionRequest } from "./submission-types"

export type Admission = {
  selection: string
  directory?: string
  session?: Session
  policyWritten?: boolean
  legacyOverrideAcknowledged?: boolean
  acknowledgedPolicy?: SubagentModelPolicy
  failedWrite?: FailedPolicyWrite
  cleanup?: VoidFunction
  abort?: AbortController
  request?: AdmissionRequest
  promoted?: boolean
}

type AdmissionSource = {
  state: { busy: boolean }
  setBusy: (busy: boolean) => void
  selections: Map<string, Admission>
}

const admissions = new WeakMap<object, Map<string, AdmissionSource>>()

// The store exists before the composer first reads busy, and survives a draft owner remount.
export function sourceAdmission(target: object, key: string) {
  const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  admissions.set(target, scoped)
  const previous = scoped.get(key)
  if (previous) return { key, scoped, source: previous }
  const [state, setState] = createStore({ busy: false })
  const source = { state, setBusy: (busy: boolean) => setState("busy", busy), selections: new Map<string, Admission>() }
  scoped.set(key, source)
  return { key, scoped, source }
}

export function handoffAdmission(target: object, key: string, source: AdmissionSource) {
  const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  scoped.set(key, { state: source.state, setBusy: source.setBusy, selections: new Map<string, Admission>() })
  admissions.set(target, scoped)
}

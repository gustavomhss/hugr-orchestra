import { createStore } from "solid-js/store"
import type { Session } from "@/v2-wire"

import type { SubagentModelPolicy } from "../subagent-model-rules"
import type { FailedPolicyWrite } from "./submission-policy"
import type { AdmissionRequest } from "./submission-types"

export type Admission = {
  selection: string
  directory?: string
  session?: Session
  policyWritten?: boolean
  acknowledgedPolicy?: SubagentModelPolicy
  failedWrite?: FailedPolicyWrite
  cleanup?: VoidFunction
  abort?: AbortController
  request?: AdmissionRequest
  promoted?: boolean
}

export type ExistingAdmission = {
  request: AdmissionRequest
  current: () => boolean
  task?: Promise<boolean | undefined>
}

type AdmissionSource = {
  state: { busy: boolean }
  setBusy: (busy: boolean) => void
  selections: Map<string, Admission>
  existing: WeakMap<object, Map<string, ExistingAdmission>>
}

const admissions = new WeakMap<object, Map<string, AdmissionSource>>()

// Draft state survives remounts; existing Session actions are isolated by a live composer token instead.
export function sourceAdmission(target: object, key: string) {
  const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  admissions.set(target, scoped)
  const previous = scoped.get(key)
  if (previous) return { key, scoped, source: previous }
  const [state, setState] = createStore({ busy: false })
  const source = { state, setBusy: (busy: boolean) => setState("busy", busy), selections: new Map<string, Admission>(),
    existing: new WeakMap<object, Map<string, ExistingAdmission>>() }
  scoped.set(key, source)
  return { key, scoped, source }
}

export function handoffAdmission(target: object, key: string, source: AdmissionSource) {
  const scoped = admissions.get(target) ?? new Map<string, AdmissionSource>()
  scoped.set(key, { state: source.state, setBusy: source.setBusy, selections: new Map<string, Admission>(),
    existing: new WeakMap<object, Map<string, ExistingAdmission>>() })
  admissions.set(target, scoped)
}

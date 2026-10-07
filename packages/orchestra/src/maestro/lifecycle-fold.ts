import { Event } from "@orchestra/schema/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { isDeepStrictEqual } from "node:util"
import { Schema } from "effect"

type Event =
  | typeof MaestroEvent.Admission.Decided.Type
  | typeof MaestroEvent.Clarification.Decided.Type
  | typeof MaestroEvent.Scope.Decided.Type
  | typeof MaestroEvent.Held.Entered.Type

export type State =
  | { status: "PENDING"; phase: "EMPTY" }
  | {
      status: "PENDING"
      phase: "ADMITTED" | "CLARIFICATION" | "SCOPED"
      sessionID: string
      projectID?: string
      mode?: "maestro"
      predecessorID: string
      admissionOutcome?: "ORIENT" | "CLARIFY" | "READY_TO_DRAFT"
    }
  | {
      status: "HOLD"
      sessionID?: string
      projectID?: string
      mode?: "maestro"
      predecessorID?: string
      reason: string
    }

const definitions: readonly Event.Definition[] = [
  MaestroEvent.Admission.Decided,
  MaestroEvent.Clarification.Decided,
  MaestroEvent.Scope.Decided,
  MaestroEvent.Held.Entered,
] as const

/** Fold only durable lifecycle evidence. Approval, Task, and later phases stay outside this boundary. */
export function fold(events: readonly unknown[]): State {
  const recorded = new Map<string, Event>()
  return events.reduce<State>(
    (state, unknown) => {
      const event = definitions.find((definition) => Schema.is(definition)(unknown))
      if (!event) return hold(state, "invalid-event")
      const current = unknown as Event
      const existing = recorded.get(current.id)
      if (existing) {
        if (isDeepStrictEqual(existing, current)) return state
        return hold(state, "changed-duplicate")
      }
      recorded.set(current.id, current)
      if (state.status === "HOLD") return hold(state, "after-hold")
      if (current.type === MaestroEvent.Admission.Decided.type) return admission(state, current)
      if (current.type === MaestroEvent.Clarification.Decided.type) return clarification(state, current)
      if (current.type === MaestroEvent.Scope.Decided.type) return scope(state, current)
      return held(state, current)
    },
    { status: "PENDING", phase: "EMPTY" },
  )
}

function admission(state: State, event: typeof MaestroEvent.Admission.Decided.Type): State {
  if (state.status === "HOLD") return hold(state, "after-hold")
  if (state.phase !== "EMPTY") return hold(state, "unexpected-admission")
  return {
    status: "PENDING",
    phase: "ADMITTED",
    sessionID: event.data.sessionID,
    predecessorID: event.id,
    admissionOutcome: event.data.outcome,
  }
}

function clarification(state: State, event: typeof MaestroEvent.Clarification.Decided.Type): State {
  if (state.status === "HOLD") return hold(state, "after-hold")
  if (state.phase !== "ADMITTED") return hold(state, "clarification-predecessor")
  if (event.data.predecessorID !== state.predecessorID) return hold(state, "clarification-predecessor")
  if (state.admissionOutcome !== "CLARIFY") return hold(state, "clarification-predecessor")
  if (event.data.sessionID !== state.sessionID) return hold(state, "session-mismatch")
  if (event.data.mode !== "maestro") return hold(state, "mode-mismatch")
  return {
    status: "PENDING",
    phase: "CLARIFICATION",
    sessionID: event.data.sessionID,
    projectID: event.data.projectID,
    mode: event.data.mode,
    predecessorID: event.id,
  }
}

function scope(state: State, event: typeof MaestroEvent.Scope.Decided.Type): State {
  if (state.status === "HOLD") return hold(state, "after-hold")
  if (state.phase !== "ADMITTED") return hold(state, "scope-predecessor")
  if (event.data.predecessorID !== state.predecessorID) return hold(state, "scope-predecessor")
  if (state.admissionOutcome !== "READY_TO_DRAFT") return hold(state, "scope-predecessor")
  if (event.data.sessionID !== state.sessionID) return hold(state, "session-mismatch")
  if (event.data.mode !== "maestro") return hold(state, "mode-mismatch")
  return {
    status: "PENDING",
    phase: "SCOPED",
    sessionID: event.data.sessionID,
    projectID: event.data.projectID,
    mode: event.data.mode,
    predecessorID: event.id,
  }
}

function held(state: State, event: typeof MaestroEvent.Held.Entered.Type): State {
  if (state.status === "HOLD") return hold(state, "after-hold")
  if (state.phase === "EMPTY") return hold(state, "held-predecessor")
  if (event.data.predecessorID !== state.predecessorID) return hold(state, "held-predecessor")
  if (event.data.sessionID !== state.sessionID) return hold(state, "session-mismatch")
  if (state.projectID && event.data.projectID !== state.projectID) return hold(state, "project-mismatch")
  if (state.mode && event.data.mode !== state.mode) return hold(state, "mode-mismatch")
  return {
    status: "HOLD",
    sessionID: event.data.sessionID,
    projectID: event.data.projectID,
    mode: event.data.mode,
    predecessorID: event.id,
    reason: event.data.reason,
  }
}

function hold(state: State, reason: string): State {
  return {
    status: "HOLD",
    ...("sessionID" in state ? { sessionID: state.sessionID } : {}),
    ...("projectID" in state && state.projectID ? { projectID: state.projectID } : {}),
    ...("mode" in state && state.mode ? { mode: state.mode } : {}),
    ...("predecessorID" in state ? { predecessorID: state.predecessorID } : {}),
    reason,
  }
}

export * as MaestroLifecycleFold from "./lifecycle-fold"

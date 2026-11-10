export * as SessionScope from "./scope"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "../schema"

/**
 * A child Session's narrowed grant (lucy build plan K4). The host writes it once, when it creates the child, and it
 * only narrows: the effective grant is the agent's permissions intersected with it. A Session without one behaves as
 * if this module did not exist.
 */
export const Scope = Schema.Struct({
  skills: Schema.Struct({
    /** The node the host delivers in the brief; it is held from the start, so it is never loaded again. */
    entry: Schema.NonEmptyString,
    /** Exact node names the Session may load; no prefix or wildcard matching. */
    allow: Schema.Array(Schema.NonEmptyString),
  }),
  /** Tool ids the Session may call. For a Claude Code built-in, the id is Orchestra's name for it (`read`, `grep`, ...). */
  tools: Schema.Array(Schema.NonEmptyString),
  budgets: Schema.Struct({ loads: NonNegativeInt, toolCalls: PositiveInt }),
})
export type Scope = typeof Scope.Type

/** A departure from the route the scope enforces, reported to the host; the fan-out copies it into `routing.deviations`. */
export const Deviation = Schema.Struct({
  kind: Schema.Literals(["skill-outside-scope", "skill-held", "load-budget", "tool-outside-scope", "tool-budget"]),
  /** The skill node or tool id the Session asked for, as the model wrote it. */
  name: Schema.String,
  /** The refusal the model received. */
  detail: Schema.NonEmptyString,
})
export type Deviation = typeof Deviation.Type

/** The scope with what the Session has used of it, as `session.metadata[KEY]` keeps it. */
export const State = Schema.Struct({
  scope: Scope,
  loads: NonNegativeInt,
  toolCalls: NonNegativeInt,
  /** Nodes whose content the Session holds: the delivered entry, then each node it loaded. */
  held: Schema.Array(Schema.NonEmptyString),
  deviations: Schema.Array(Deviation),
})
export type State = typeof State.Type

export const KEY = "scope"

export type Request = { readonly type: "skill" | "tool"; readonly name: string }

export type Decision = { readonly admitted: true } | { readonly admitted: false; readonly deviation: Deviation }

export class WriteError extends Schema.TaggedErrorClass<WriteError>()("SessionScope.WriteError", {
  sessionID: Schema.String,
  reason: Schema.Literals(["missing-session", "already-scoped", "invalid-scope"]),
}) {}

export const LOAD_BUDGET_REFUSAL = "record a question or a not-examined item instead"

export const initial = (scope: Scope): State => ({
  scope,
  loads: 0,
  toolCalls: 0,
  held: [scope.skills.entry],
  deviations: [],
})

/** The deviation a request would cause, or undefined when the scope admits it. */
export function decide(state: State, request: Request): Deviation | undefined {
  if (request.type === "tool") {
    if (!state.scope.tools.includes(request.name))
      return deviation("tool-outside-scope", request.name, `The tool ${request.name} is outside this Session's scope.`)
    if (exhausted(state))
      return deviation(
        "tool-budget",
        request.name,
        `This Session's tool call budget (${state.scope.budgets.toolCalls}) is spent. Finish in your next reply without tools.`,
      )
    return undefined
  }
  if (state.held.includes(request.name))
    return deviation("skill-held", request.name, `The skill ${request.name} is already in this Session's context; use it from there.`)
  if (!allowsSkill(state.scope, request.name))
    return deviation("skill-outside-scope", request.name, `The skill ${request.name} is outside this Session's scope.`)
  if (state.loads >= state.scope.budgets.loads)
    return deviation(
      "load-budget",
      request.name,
      `This Session's skill load budget (${state.scope.budgets.loads}) is spent: ${LOAD_BUDGET_REFUSAL}.`,
    )
  return undefined
}

/** The state after an admitted request: a tool call or a load counted, a loaded node held. */
export function admit(state: State, request: Request): State {
  if (request.type === "tool") return { ...state, toolCalls: state.toolCalls + 1 }
  return { ...state, loads: state.loads + 1, held: [...state.held, request.name] }
}

export const allowsSkill = (scope: Scope, name: string) => scope.skills.allow.includes(name)

/** True once the tool call budget is spent: the Session's next turn is its last. */
export const exhausted = (state: State) => state.toolCalls >= state.scope.budgets.toolCalls

function deviation(kind: Deviation["kind"], name: string, detail: string): Deviation {
  return { kind, name, detail }
}

export * as ContinuityAdmission from "./admission"

import { Effect, Schema } from "effect"
import type { MessageID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@orchestra/core/v1/session"
import type { Prepared } from "./memory-types"
import type { Provider } from "@/provider/provider"
import { RequestSource } from "./request-source"

export class AdmissionError extends Schema.TaggedErrorClass<AdmissionError>()("ContinuityAdmissionError", { reason: Schema.String }) {}
export type Input = { sessionID: SessionID; messages: SessionV1.WithParts[]; canRecall?: boolean;
  expectedUserID?: MessageID; model?: Provider.Model; originalRequest?: SessionV1.WithParts }

/** Candidate sealing is an admission boundary, never part of the pure renderer or producer transport. */
export function create(input: {
  prepare: (value: Input) => Effect.Effect<Prepared>
  settle: (sessionID: SessionID) => Effect.Effect<void>
  history: (sessionID: SessionID) => Effect.Effect<SessionV1.WithParts[]>
  current: (sessionID: SessionID) => Effect.Effect<SessionV1.WithParts | undefined>
  candidate: (sessionID: SessionID) => Effect.Effect<{ boundary?: MessageID; admitted?: MessageID; epoch: number; generation: number }>
  latest: (messages: SessionV1.WithParts[]) => SessionV1.Assistant | undefined
  compact: (sessionID: SessionID, canRecall: boolean, model?: Provider.Model) => Effect.Effect<string>
  commit: (sessionID: SessionID, boundary: MessageID, epoch: number, generation: number) => Effect.Effect<boolean>
  fits: (sessionID: SessionID, prepared: Prepared, model?: Provider.Model) => Effect.Effect<boolean>
}) {
  return Effect.fn("ContinuityAdmission.admit")(function* (value: Input) {
    yield* input.settle(value.sessionID)
    const candidate = yield* input.candidate(value.sessionID)
    const expectedUserID = value.expectedUserID ?? RequestSource.latest(value.messages, value.originalRequest, value.sessionID)?.info.id
    const requireOwner = () => Effect.gen(function* () {
      if (expectedUserID && (yield* input.current(value.sessionID))?.info.id !== expectedUserID)
        return yield* new AdmissionError({ reason: "complete-prefix-caller-stale" })
      const owner = yield* input.candidate(value.sessionID)
      if (owner.epoch !== candidate.epoch || owner.generation !== candidate.generation || candidate.boundary !== undefined && owner.boundary === undefined)
        return yield* new AdmissionError({ reason: "complete-prefix-admission-stale" })
    })
    const fresh = candidate.boundary !== undefined && candidate.boundary !== candidate.admitted
    if (fresh) {
      const history = yield* input.history(value.sessionID)
      const latest = input.latest(history)
      if (latest && latest.id !== candidate.boundary) {
        const result = yield* input.compact(value.sessionID, value.canRecall === true, value.model)
        yield* requireOwner()
        if (result !== "applied") return yield* new AdmissionError({ reason: "complete-prefix-catchup-unmet" })
      }
    }
    const history = fresh || expectedUserID ? yield* input.history(value.sessionID) : value.messages
    yield* requireOwner()
    const prepared = yield* input.prepare({ ...value, messages: history })
    const fits = yield* input.fits(value.sessionID, prepared, value.model)
    yield* requireOwner()
    if (!fits) return yield* new AdmissionError({ reason: "complete-prefix-hard-limit" })
    if (fresh) {
      const latest = input.latest(history)
      if (!prepared.coverage || latest && prepared.coverage.boundary !== latest.id ||
        !(yield* input.commit(value.sessionID, prepared.coverage.boundary, candidate.epoch, candidate.generation)))
        return yield* new AdmissionError({ reason: "complete-prefix-admission-stale" })
    }
    yield* requireOwner()
    return prepared
  })
}

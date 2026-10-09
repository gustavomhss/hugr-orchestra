export * as RelayWorkflowSession from "./relay-workflow-session"

import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { SessionMessage } from "@orchestra/schema/session-message"
import { Database } from "./database/database"
import { EventTable } from "./event/sql"
import { EventV2 } from "./event"
import { RelayWorkflowBinding } from "./relay-workflow-binding"
import { RelayWorkflowCurrentStep } from "./relay-workflow-currentstep"
import { makeGlobalNode } from "./effect/app-node"

export interface Current {
  readonly token: RelayArm.Token
  readonly binding: RelayArm.WorkflowBinding
  readonly view: RelayWorkflowCurrentStep.View
}
export interface Host {
  readonly current: (bound: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data>) =>
    Effect.Effect<Current, RelayWorkflowBinding.Held>
  readonly settle: (current: Current, settlement: RelayArm.WorkflowSettlement) =>
    Effect.Effect<RelayArm.Evaluation, RelayWorkflowBinding.Held>
}
export const NativeHost = Context.Reference<Host | undefined>("@orchestra/RelayWorkflow/SessionHost", { defaultValue: () => undefined })

export class Service extends Context.Service<Service, {
  readonly host: () => Effect.Effect<Host | undefined>
  readonly register: (host: Host) => Effect.Effect<void>
}>()("@orchestra/RelayWorkflow/SessionHosts") {}

export const node = makeGlobalNode({ service: Service, layer: Layer.effect(Service, Effect.gen(function* () {
  const installed: { host?: Host } = {}
  yield* Effect.addFinalizer(() => Effect.sync(() => { installed.host = undefined }))
  return Service.of({ host: () => Effect.sync(() => installed.host), register: (host) => Effect.sync(() => {
    if (installed.host && installed.host !== host) throw new Error("WORKFLOW_NATIVE_HOST_ALREADY_REGISTERED")
    installed.host = host
  }) })
})), deps: [] })

const nativeHost = Effect.gen(function* () {
  const scoped = yield* NativeHost
  if (scoped) return scoped
  const service = yield* Service
  return yield* service.host()
})

// Only a stored native Task binding activates the boundary. An absent host for a bound Session is a HOLD, never an
// ordinary Session escape. The reader is independent of any provider/coordinator and never advances on resume.
export const current = Effect.fn("RelayWorkflowSession.current")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, sessionID),
    eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1)))).limit(2).all().pipe(Effect.orDie)
  if (!rows.length) return
  if (rows.length !== 1) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_AMBIGUOUS" })
  const bound = Schema.decodeUnknownSync(MaestroEvent.Task.WorkflowBound.data)(rows[0].data)
  if (bound.executionSessionID !== sessionID || bound.binding.executionSessionID !== sessionID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })
  const host = yield* nativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
  const result = yield* host.current(bound)
  if (result.view.state === "awaiting-human" && !result.view.pending)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_PARKED" })
  return result
})

export const reconcile = Effect.fn("RelayWorkflowSession.reconcile")(function* (current: Current) {
  if (!current.view.pending) return
  const host = yield* nativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
  const evaluation = yield* host.settle(current, current.view.pending.settlement)
  if (evaluation.outcome !== "advance" && evaluation.outcome !== "complete")
    return yield* new RelayWorkflowBinding.Held({ reason: `WORKFLOW_TRANSITION_${evaluation.outcome.toUpperCase().replaceAll("-", "_")}` })
  return evaluation.outcome === "advance"
})

export const settle = Effect.fn("RelayWorkflowSession.settle")(function* (input: {
  readonly current: Current
  readonly assistantMessageID: SessionMessage.ID
  readonly succeeded: boolean
}) {
  if (!input.succeeded) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ASSISTANT_NOT_SETTLED" })
  const host = yield* nativeHost
  if (!host) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
  const evaluation = yield* host.settle(input.current, { assistantMessageID: input.assistantMessageID,
    expected: { position: input.current.view.position, attempt: input.current.view.attempt, ledgerSeq: input.current.view.ledgerSeq } })
  if (evaluation.outcome !== "advance" && evaluation.outcome !== "complete")
    return yield* new RelayWorkflowBinding.Held({ reason: `WORKFLOW_TRANSITION_${evaluation.outcome.toUpperCase().replaceAll("-", "_")}` })
  return evaluation.outcome === "advance"
})

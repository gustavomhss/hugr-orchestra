export * as WorkflowTransferV2 from "./transfer"

import { Effect, Option, type Schema } from "effect"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import type { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionID } from "@orchestra/schema/session-id"
import { WorkflowRecordsV2 } from "./records"

type Services = {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly execution: Option.Option<SessionExecution.Interface>
}

/** Serialize a forward transfer, or recovery of its durable record, with the actual holder's Session execution. */
export const moveArm = (
  services: Services,
  relay: Relay.Interface,
  bound: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data>,
  arm: Parameters<Relay.Interface["create"]>[0] & { readonly agentID: string },
  conflict: boolean,
) => Effect.gen(function* () {
  const observed = Option.getOrUndefined(yield* relay.holder(bound.token))
  const recorded = yield* WorkflowRecordsV2.holders(services.db, bound.token)
  if (!conflict && !(observed && recorded.holder && observed !== recorded.holder && !recorded.movedFrom.has(observed))) return
  if (!observed || Option.isNone(services.execution))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
  const authority = { authorityMessageID: bound.authorityMessageID, authorityCallID: bound.authorityCallID }
  const moved = yield* services.execution.value.exclusive(SessionV2.ID.make(observed), Effect.gen(function* () {
    const held = Option.getOrUndefined(yield* relay.holder(bound.token))
    const recorded = yield* WorkflowRecordsV2.holders(services.db, bound.token)
    if (!held || held !== observed)
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
    // Relay may already have moved while its SQL record is missing. Recovery does not transfer this holder again.
    if (recorded.holder && held !== recorded.holder && !recorded.movedFrom.has(held))
      yield* EventV2.deferNotifications(WorkflowRecordsV2.recordMove(services, {
        executionSessionID: SessionID.make(held), from: SessionID.make(recorded.holder), token: bound.token, recoveredBy: authority,
      }))
    if (!conflict) return
    // A recovered move adds its previous holder to movedFrom; forward-only guards must read that committed record.
    const current = yield* WorkflowRecordsV2.holders(services.db, bound.token)
    if (held === bound.executionSessionID || current.movedFrom.has(bound.executionSessionID))
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
    if (yield* ranProviderTurn(services, held))
      return yield* new RelayWorkflowBinding.Held({
        reason: "WORKFLOW_ARM_BINDING_MISMATCH",
        detail: `This arm is bound to Task session ${held}, which ran or is running. Arm a new contract for this Task.`,
      })
    yield* relay.rebind({ ...arm, from: held })
    // Only publication is deferred: an explicit holder interrupt can still stop the actual filesystem rebind.
    yield* EventV2.deferNotifications(WorkflowRecordsV2.recordMove(services, {
      executionSessionID: bound.executionSessionID, from: SessionID.make(held), token: bound.token, ...authority,
    }))
  }))
  if (Option.isNone(moved))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
})

// Exclusive ownership already excludes a running provider; inspecting active here would reject this operation's own lease.
function ranProviderTurn(services: Services, executionSessionID: string) {
  return Effect.gen(function* () {
    if (!(yield* services.store.get(SessionV2.ID.make(executionSessionID)))) return true
    if ((yield* WorkflowRecordsV2.reviewHolds(services.db, executionSessionID)).length > 0) return true
    // An empty reply is persisted before pre-model checks. Only content or a finish proves a previous provider turn.
    return yield* services.store.entries(SessionV2.ID.make(executionSessionID)).pipe(
      Effect.map((entries) => entries.some(
        (entry) => entry.message.type === "assistant" && (entry.message.finish !== undefined || entry.message.content.length > 0),
      )),
      Effect.catch(() => Effect.succeed(true)),
    )
  })
}

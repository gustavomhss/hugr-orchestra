export * as ResearchAllowance from "./allowance"

import { Cause, Context, Effect, Layer, Schema } from "effect"
import { and, eq } from "drizzle-orm"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { EventTable } from "../event/sql"
import { makeGlobalNode } from "../effect/app-node"

export interface Interface {
  /** The caller's effort tier is fixed here; re-binding the same dispatch with another tier is a mismatch. */
  readonly bind: (binding: Research.Binding, dispatchCallID: string, tier?: Research.Depth) => Effect.Effect<Research.Allowance, Research.Error>
  readonly charge: (
    allowance: Research.Allowance,
    kind: "provider" | "tool" | "bytes",
    operation: string,
    amount?: number,
  ) => Effect.Effect<void, Research.Error>
  /** Irreversible debit before acquisition/publication; uncertain writes keep the full reservation. */
  readonly reserveBytes: (allowance: Research.Allowance, operation: string, bytes: number) => Effect.Effect<void, Research.Error>
  /** Verify observed bytes fit the existing reservation. No credit is minted by reconciliation. */
  readonly reconcileBytes: (allowance: Research.Allowance, operation: string, bytes: number) => Effect.Effect<void, Research.Error>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ResearchAllowance") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service

    const read = (id: EventV2.ID) => database.db.select().from(EventTable).where(eq(EventTable.id, id)).get()
    const bound = Effect.fn("ResearchAllowance.bound")(function* (allowance: Research.Allowance) {
      const row = yield* read(eventID("bound", allowance.binding.executionSessionID, allowance.dispatchCallID))
      if (!row) return yield* new Research.Error({ code: "binding_missing", message: "Dispatch allowance is not admitted" })
      if (row.type !== EventV2.versionedType(ResearchEvent.AllowanceBound.type, 1) ||
        row.aggregate_id !== allowance.binding.executionSessionID)
        return yield* new Research.Error({ code: "binding_mismatch", message: "Allowance ledger identity differs" })
      const stored = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceBound.data)(row.data)
      if (stored.sessionID !== allowance.binding.executionSessionID || !isDeepStrictEqual(stored.allowance, allowance))
        return yield* new Research.Error({ code: "binding_mismatch", message: "Dispatch allowance differs from admitted binding or limits" })
    })

    const bind: Interface["bind"] = Effect.fn("ResearchAllowance.bind")((binding, dispatchCallID, tier = "quick") =>
      Effect.gen(function* () {
        if (!Object.hasOwn(Research.Tiers, tier))
          return yield* new Research.Error({ code: "unsupported", message: `Unknown research effort tier: ${String(tier)}` })
        const limits = Research.Tiers[tier]
        const allowance = yield* Schema.decodeUnknownEffect(Research.Allowance)({
          binding, dispatchCallID, tier,
          providerLimit: limits.providerCalls,
          toolLimit: limits.toolCalls,
          byteLimit: limits.capturedBytes,
          deadlineSeconds: limits.deadlineSeconds,
        })
        const id = eventID("bound", binding.executionSessionID, dispatchCallID)
        if (yield* read(id)) {
          yield* bound(allowance)
          return allowance
        }
        yield* events.publish(ResearchEvent.AllowanceBound, { sessionID: binding.executionSessionID, allowance }, {
          id, persist: true,
        }).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
          // Only the committed native row can reconcile a competing insert or lost publication response.
          if (!(yield* read(id))) return yield* Effect.failCause(cause)
          yield* bound(allowance)
        })))
        return allowance
      }).pipe(researchFailure),
    )

    const charged = Effect.fn("ResearchAllowance.charged")(function* (
      allowance: Research.Allowance,
      operation: string,
    ) {
      const row = yield* read(eventID("charged", allowance.binding.executionSessionID, allowance.dispatchCallID, operation))
      if (!row) return undefined
      if (row.type !== EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1) ||
        row.aggregate_id !== allowance.binding.executionSessionID)
        return yield* new Research.Error({ code: "conflict", message: "Charge ledger identity differs" })
      const stored = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)(row.data)
      if (stored.sessionID !== allowance.binding.executionSessionID || stored.dispatchCallID !== allowance.dispatchCallID ||
        stored.operation !== operation)
        return yield* new Research.Error({ code: "conflict", message: "Charge operation identity differs" })
      return stored
    })

    const charge: Interface["charge"] = Effect.fn("ResearchAllowance.charge")((allowance, kind, operation, amount = 1) =>
      Effect.gen(function* () {
        if (!operation.trim() || operation.length > 256 || !Number.isSafeInteger(amount) || amount < 0 ||
          (kind !== "bytes" && amount !== 1))
          return yield* new Research.Error({ code: "over_cap", message: "Invalid allowance charge operation or amount" })
        const data = yield* Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)({
          sessionID: allowance.binding.executionSessionID, dispatchCallID: allowance.dispatchCallID, operation, kind, amount,
        })
        yield* bound(allowance)
        const retry = yield* charged(allowance, operation)
        if (retry) {
          if (isDeepStrictEqual(retry, data)) return
          return yield* new Research.Error({ code: "conflict", message: "Charge operation was reused with different kind or amount" })
        }
        yield* events.publish(ResearchEvent.AllowanceCharged, data, {
          id: eventID("charged", data.sessionID, data.dispatchCallID, operation),
          persist: true,
          // EventV2 runs this callback before insertion under BEGIN IMMEDIATE on the same native connection.
          // A preflight total outside this transaction would allow concurrent tools to overspend.
          commit: () => Effect.gen(function* () {
            yield* bound(allowance)
            const rows = yield* database.db.select({ data: EventTable.data }).from(EventTable).where(and(
              eq(EventTable.aggregate_id, data.sessionID),
              eq(EventTable.type, EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1)),
            )).all()
            const ledger = yield* Effect.forEach(rows, (row) => Schema.decodeUnknownEffect(ResearchEvent.AllowanceCharged.data)(row.data))
            if (ledger.some((entry) => entry.sessionID !== data.sessionID || !Number.isSafeInteger(entry.amount) ||
              (entry.kind !== "bytes" && entry.amount !== 1)))
              return yield* Effect.die(new Research.Error({ code: "publication_uncertain", message: "Invalid allowance ledger" }))
            const used = ledger.filter((entry) => entry.dispatchCallID === data.dispatchCallID && entry.kind === kind)
              .reduce((total, entry) => total + entry.amount, 0)
            const limit = kind === "provider" ? allowance.providerLimit : kind === "tool" ? allowance.toolLimit : allowance.byteLimit
            if (!Number.isSafeInteger(used) || amount > limit - used)
              return yield* Effect.die(new Research.Error({ code: "budget_exhausted", message: `Research ${kind} allowance exhausted (${used}/${limit}); retained work remains available` }))
          }).pipe(Effect.orDie),
        }).pipe(Effect.catchCause((cause) => Effect.gen(function* () {
          const stored = yield* charged(allowance, operation)
          if (!stored) return yield* Effect.failCause(cause)
          if (!isDeepStrictEqual(stored, data))
            return yield* new Research.Error({ code: "conflict", message: "Charge operation was reused with different kind or amount" })
        })))
      }).pipe(researchFailure),
    )

    const reconcileBytes: Interface["reconcileBytes"] = Effect.fn("ResearchAllowance.reconcileBytes")((allowance, operation, bytes) =>
      Effect.gen(function* () {
        yield* bound(allowance)
        const reservation = yield* charged(allowance, operation)
        if (!reservation || reservation.kind !== "bytes")
          return yield* new Research.Error({ code: "binding_missing", message: "Byte reservation is not admitted" })
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > reservation.amount)
          return yield* new Research.Error({ code: "over_cap", message: "Observed bytes exceed reservation or are invalid" })
        // The frozen ledger has no credit event. Even a known unused remainder stays charged; uncertain
        // publication and repeated reconciliation cannot release bytes or admit a second write for free.
      }).pipe(researchFailure),
    )

    return Service.of({ bind, charge, reserveBytes: (allowance, operation, bytes) => charge(allowance, "bytes", operation, bytes), reconcileBytes })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, EventV2.node] })

function eventID(kind: string, ...parts: string[]) {
  return EventV2.ID.make(`evt_research_allowance_${kind}_${createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex")}`)
}

function researchFailure<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, Research.Error, R> {
  return effect.pipe(Effect.catchCause((cause) => {
    if (Cause.hasInterrupts(cause)) return Effect.failCause(cause).pipe(Effect.orDie)
    const error = cause.reasons.flatMap((reason) => Cause.isDieReason(reason) ? [reason.defect]
      : Cause.isFailReason(reason) ? [reason.error] : []).find((error) => error instanceof Research.Error)
    return Effect.fail(error instanceof Research.Error ? error
      : new Research.Error({ code: "publication_uncertain", message: "Native allowance ledger could not be verified or committed" }))
  }))
}

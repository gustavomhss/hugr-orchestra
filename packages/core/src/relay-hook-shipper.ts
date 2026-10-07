export * as RelayHookShipper from "./relay-hook-shipper"

import path from "path"
import { statSync } from "fs"
import { and, asc, eq } from "drizzle-orm"
import { Effect, Option, Schema, Semaphore } from "effect"
import { versionedType } from "@opencode-ai/schema/event"
import { RelayHook } from "@opencode-ai/schema/relay-hook"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"
import { LedgerRead } from "@opencode-ai/relay/ledger/read"
import type { Database } from "./database/database"
import { EventTable } from "./event/sql"
import type { Relay } from "./relay"

// Hook receipts (relay-exec-spec H2). Each durable `relay.hook.decided` event becomes one `hook-decision` line in its
// install's `hooks/<installID>/ledger.jsonl`, appended through Relay.Service.record: the event is the decision, the
// line its receipt. A decision ships at most once, found by its ID in the ledger. One whose own receipt could not be
// written when it was decided (Relay or its ledger unavailable, or the process gone) ships with a later decision of
// its Session, marked `deferred: true`.

/**
 * Ships the Session's decisions that their ledgers lack, in decision order up to `current`: `current` itself on time,
 * any earlier one late. Without `current`, every missing decision ships late. Each install's receipts stop at its
 * first failure, so its ledger keeps decision order; the failed ones ship with a later call.
 */
export const ship = Effect.fn("RelayHookShipper.ship")(function* (input: {
  readonly relay: Relay.Interface
  readonly db: Database.Interface["db"]
  readonly sessionID: string
  readonly current?: string
}) {
  const rows = yield* input.db
    .select({ data: EventTable.data })
    .from(EventTable)
    .where(and(eq(EventTable.aggregate_id, input.sessionID), eq(EventTable.type, DECIDED)))
    .orderBy(asc(EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const decisions = rows.flatMap((row) => Option.toArray(decode(row.data)))
  const end = decisions.findIndex((decision) => decision.decisionID === input.current)
  // A decision still on its way to its own receipt is not late; its own call ships it.
  const due = decisions
    .slice(0, end === -1 ? decisions.length : end + 1)
    .filter((decision) => decision.decisionID === input.current || !inFlight.has(decision.decisionID))
  yield* shipping.withPermit(
    Effect.forEach(
      Map.groupBy(due, (decision) => decision.installID).values(),
      (group) =>
        Effect.forEach(group, (decision) => receipt(input.relay, decision, decision.decisionID !== input.current), {
          discard: true,
        }).pipe(Effect.ignore),
      { discard: true },
    ),
  )
})

/** Runs a decision's publication and its own receipt; until it ends, no other call ships that decision as late. */
export const track = <A, E, R>(decisionID: string, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => inFlight.add(decisionID)),
    () => effect,
    // Synchronous: effect 4.0.0-beta.83 drops an async release step when the fiber is interrupted.
    () => Effect.sync(() => inFlight.delete(decisionID)),
  )

/** The ledger line of a decision, before Relay.Service.record stamps `ts`. */
export function body(decision: RelayHook.Decided["data"], deferred: boolean): Omit<RelayLedger.HookDecision, "ts"> {
  return {
    event: "hook-decision",
    decision: decision.decisionID,
    install: decision.installID,
    version: decision.version,
    node: decision.nodeID,
    action: decision.action,
    trigger: decision.trigger,
    tool: decision.tool ?? null,
    session: decision.sessionID,
    call: decision.callID ?? null,
    subject: decision.subject,
    outcome: decision.outcome,
    ...(deferred ? { deferred: true as const } : {}),
  }
}

const DECIDED = versionedType(RelayHook.Decided.type, 1)
const decode = Schema.decodeUnknownOption(RelayHook.Decided.data)

// One process writes these ledgers (relay-exec-spec §1); receipts are serialized here so a decision is looked up and
// appended as one step.
const shipping = Semaphore.makeUnsafe(1)
const inFlight = new Set<string>()
// The decision IDs in each ledger, kept while the file is unchanged. Only receipts add decisions, and they are written
// under `shipping`, so lines others append meanwhile (checks, lifecycle) never hold one.
const shipped = new Map<string, { readonly stamp: string; readonly ids: Set<string> }>()

const receipt = Effect.fnUntraced(function* (
  relay: Relay.Interface,
  decision: RelayHook.Decided["data"],
  deferred: boolean,
) {
  const ledger = path.join(relay.paths.hooks, decision.installID, "ledger.jsonl")
  const ids = yield* recorded(ledger)
  if (ids.has(decision.decisionID)) return
  yield* relay.record(decision.installID, body(decision, deferred))
  ids.add(decision.decisionID)
  shipped.set(ledger, { stamp: yield* stamp(ledger), ids })
})

const recorded = Effect.fnUntraced(function* (ledger: string) {
  const current = yield* stamp(ledger)
  const cached = shipped.get(ledger)
  if (cached?.stamp === current) return cached.ids
  const entries = yield* LedgerRead.entries(ledger).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
  )
  const ids = new Set(
    entries.flatMap((entry) =>
      entry.event === "hook-decision" && typeof entry.decision === "string" ? [entry.decision] : [],
    ),
  )
  shipped.set(ledger, { stamp: current, ids })
  return ids
})

function stamp(ledger: string) {
  return Effect.try({
    try: () => statSync(ledger, { throwIfNoEntry: false }),
    catch: () => new LedgerRead.ReadError({ ledger, reason: "stat" }),
  }).pipe(Effect.map((info) => (info ? `${info.ino}:${info.size}:${info.mtimeMs}` : "absent")))
}

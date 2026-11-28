export * as ActivityActionLedger from "./activity-action-ledger"

import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "./database/database"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"

export type Action =
  | "arm"
  | "apply"
  | "restore"
  | "empty"
  | "attest"
  | "accept-cost"
  | "stop-tree"
  | "stop-query"
  | "suspend"
  | "resume"

/** Captured by a server-owned producer. No caller path, observation UUID or PID is action authority. */
export type Observation = {
  readonly targetID: string
  readonly kind: "object" | "tree"
  readonly label: string
  readonly owner: string
  readonly identity: string | null
  readonly members: readonly string[]
  readonly dirty: boolean | null
  readonly eligible: readonly Action[]
}

export type Target = Observation & { readonly generation: string }
export type Binding = Pick<Target, "targetID" | "generation">

/** The ledger stores facts and revalidates bindings. It does not grant approval or run an effect. */
export const make = Effect.gen(function* () {
  const database = yield* Database.Service
  return {
    record(observation: Observation): Effect.Effect<Target, unknown> {
      const normalized: Observation = {
        targetID: observation.targetID,
        kind: observation.kind,
        label: observation.label,
        owner: observation.owner,
        identity: observation.identity,
        members: [...new Set(observation.members)].sort(),
        dirty: observation.dirty,
        eligible: [...new Set(observation.eligible)].sort(),
      }
      return database.db.transaction((tx) => Effect.gen(function* () {
        const previous = yield* tx.select().from(ActivityActionLedgerTable)
          .where(eq(ActivityActionLedgerTable.target_id, normalized.targetID)).get()
        const generation = previous
          ? JSON.stringify(previous.observation) === JSON.stringify(normalized)
            ? previous.generation
            : String(BigInt(previous.generation) + 1n)
          : "1"
        yield* tx.insert(ActivityActionLedgerTable).values({
          target_id: normalized.targetID,
          generation,
          observation: normalized,
        }).onConflictDoUpdate({
          target: ActivityActionLedgerTable.target_id,
          set: { generation, observation: normalized },
        }).run()
        return { ...normalized, generation }
      }), { behavior: "immediate" })
    },
    capture(action: Action, bindings: readonly Binding[]): Effect.Effect<readonly Target[] | undefined, unknown> {
      if (!bindings.length || new Set(bindings.map((binding) => binding.targetID)).size !== bindings.length)
        return Effect.succeed(undefined)
      return database.db.transaction((tx) => Effect.gen(function* () {
        const rows = yield* Effect.forEach(bindings, (binding) => tx.select().from(ActivityActionLedgerTable)
          .where(eq(ActivityActionLedgerTable.target_id, binding.targetID)).get())
        if (rows.some((row, index) => !row || row.generation !== bindings[index].generation ||
          !row.observation.identity || !row.observation.eligible.includes(action))) return undefined
        return rows.flatMap((row) => row ? [{ ...row.observation, generation: row.generation }] : [])
      }), { behavior: "immediate" })
    },
  }
})

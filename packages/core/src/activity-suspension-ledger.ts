export * as ActivitySuspensionLedger from "./activity-suspension-ledger"

import { eq } from "drizzle-orm"
import { Effect } from "effect"
import type { Database } from "./database/database"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivitySuspensionLedgerTable } from "./activity-suspension-ledger.sql"

export type Scope = Readonly<{ treeID: string; generation: string }>
export type Action = "suspend" | "resume"
export type Phase = "suspending" | "suspended" | "partial" | "resuming" | "resumed" | "refused" | "unknown"
export type Outcome = Readonly<{ memberID: string; effect: "changed" | "unchanged" | "unknown" }>
export type Attempt = Readonly<{ id: string; action: Action; members: readonly string[] }>
export type Record = Readonly<{
  markID: string
  scope: Scope
  phase: Phase
  suspended: readonly string[]
  uncertain: readonly string[]
  pending?: Attempt
}>

export interface Interface {
  readonly beginSuspend: (input: { scope: Scope; members: readonly string[] }) => Effect.Effect<Record | undefined, unknown>
  readonly beginResume: (input: { scope: Scope; markID: string; members: readonly string[] }) => Effect.Effect<Record | undefined, unknown>
  readonly settle: (input: {
    scope: Scope
    markID: string
    attemptID: string
    outcomes: readonly Outcome[]
  }) => Effect.Effect<Record | undefined, unknown>
  readonly read: (treeID: string) => Effect.Effect<Record | undefined, unknown>
}

/** This journal records intent and native receipts. It grants no authority and performs no effect. */
export function make(database: Database.Interface, ownerIncarnation: string): Interface {
  function begin(input: { scope: Scope; members: readonly string[]; markID?: string }, action: Action) {
    if (!ownerIncarnation.trim() || !input.members.length || input.members.length > 256 ||
      input.members.some((member) => !member.trim()) || new Set(input.members).size !== input.members.length)
      return Effect.succeed(undefined)
    return database.db.transaction((tx) => Effect.gen(function* () {
      const target = yield* tx.select().from(ActivityActionLedgerTable)
        .where(eq(ActivityActionLedgerTable.target_id, input.scope.treeID)).get()
      if (!target || target.generation !== input.scope.generation || target.observation.targetID !== input.scope.treeID ||
        target.observation.kind !== "tree" || !target.observation.identity?.trim() ||
        !target.observation.eligible.includes(action) || input.members.some((member) => !target.observation.members.includes(member)))
        return undefined
      const previous = yield* tx.select().from(ActivitySuspensionLedgerTable)
        .where(eq(ActivitySuspensionLedgerTable.tree_id, input.scope.treeID)).get()
      if (previous?.pending) return undefined
      if (action === "suspend" && previous && previous.phase !== "resumed" && previous.phase !== "refused") return undefined
      if (action === "resume" && (!previous || previous.mark_id !== input.markID ||
        previous.generation !== input.scope.generation || !["suspended", "partial"].includes(previous.phase) ||
        input.members.some((member) => !previous.suspended.includes(member)))) return undefined
      const pending: Attempt = { id: crypto.randomUUID(), action, members: [...input.members] }
      const row = {
        tree_id: input.scope.treeID,
        generation: input.scope.generation,
        mark_id: action === "resume" && previous ? previous.mark_id : crypto.randomUUID(),
        phase: action === "suspend" ? "suspending" as const : "resuming" as const,
        suspended: action === "resume" && previous ? previous.suspended : [],
        uncertain: action === "resume" && previous ? previous.uncertain : [],
        pending,
        owner_incarnation: ownerIncarnation,
      }
      yield* tx.insert(ActivitySuspensionLedgerTable).values(row).onConflictDoUpdate({
        target: ActivitySuspensionLedgerTable.tree_id,
        set: row,
      }).run()
      return project(row)
    }), { behavior: "immediate" })
  }
  return {
    beginSuspend: (input) => begin(input, "suspend"),
    beginResume: (input) => begin(input, "resume"),
    settle(input) {
      return database.db.transaction((tx) => Effect.gen(function* () {
        const row = yield* tx.select().from(ActivitySuspensionLedgerTable)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, input.scope.treeID)).get()
        const pending = row?.pending
        if (!row || row.generation !== input.scope.generation || row.mark_id !== input.markID ||
          row.owner_incarnation !== ownerIncarnation || !pending || pending.id !== input.attemptID ||
          input.outcomes.length !== pending.members.length ||
          new Set(input.outcomes.map((outcome) => outcome.memberID)).size !== input.outcomes.length ||
          input.outcomes.some((outcome) => !pending.members.includes(outcome.memberID) ||
            !["changed", "unchanged", "unknown"].includes(outcome.effect))) return undefined
        const changed = input.outcomes.filter((outcome) => outcome.effect === "changed").map((outcome) => outcome.memberID)
        const unconfirmed = input.outcomes.filter((outcome) => outcome.effect === "unknown").map((outcome) => outcome.memberID)
        const suspended = pending.action === "suspend"
          ? changed
          : row.suspended.filter((member) => !changed.includes(member) && !unconfirmed.includes(member))
        const uncertain = [...row.uncertain, ...unconfirmed]
        const phase: Phase = suspended.length
          ? pending.action === "suspend" && suspended.length === pending.members.length ? "suspended" : "partial"
          : uncertain.length ? "unknown" : pending.action === "suspend" ? "refused" : "resumed"
        const settled = { ...row, phase, suspended, uncertain, pending: null, owner_incarnation: null }
        yield* tx.update(ActivitySuspensionLedgerTable).set(settled)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, input.scope.treeID)).run()
        return project(settled)
      }), { behavior: "immediate" })
    },
    read(treeID) {
      return database.db.transaction((tx) => Effect.gen(function* () {
        const row = yield* tx.select().from(ActivitySuspensionLedgerTable)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, treeID)).get()
        if (!row) return undefined
        const abandoned = row.pending
        if (!abandoned || row.owner_incarnation === ownerIncarnation) return project(row)
        // Persist the fence before treating this attempt as abandoned so a late receipt cannot settle it.
        const suspended = row.suspended.filter((member) => !abandoned.members.includes(member))
        const settled = {
          ...row,
          phase: suspended.length ? "partial" as const : "unknown" as const,
          suspended,
          uncertain: [...row.uncertain, ...abandoned.members],
          pending: null,
          owner_incarnation: null,
        }
        yield* tx.update(ActivitySuspensionLedgerTable).set(settled)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, treeID)).run()
        return project(settled)
      }), { behavior: "immediate" })
    },
  }
}

function project(row: typeof ActivitySuspensionLedgerTable.$inferSelect): Record {
  return {
    markID: row.mark_id,
    scope: { treeID: row.tree_id, generation: row.generation },
    phase: row.phase,
    suspended: row.suspended,
    uncertain: row.uncertain,
    ...(row.pending ? { pending: row.pending } : {}),
  }
}

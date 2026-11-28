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
        pending,
        owner_incarnation: ownerIncarnation,
      }
      yield* tx.insert(ActivitySuspensionLedgerTable).values(row).onConflictDoUpdate({
        target: ActivitySuspensionLedgerTable.tree_id,
        set: row,
      }).run()
      return project(row, ownerIncarnation)
    }), { behavior: "immediate" })
  }
  return {
    beginSuspend: (input) => begin(input, "suspend"),
    beginResume: (input) => begin(input, "resume"),
    settle(input) {
      return database.db.transaction((tx) => Effect.gen(function* () {
        const row = yield* tx.select().from(ActivitySuspensionLedgerTable)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, input.scope.treeID)).get()
        if (!row || row.generation !== input.scope.generation || row.mark_id !== input.markID ||
          row.owner_incarnation !== ownerIncarnation || !row.pending || row.pending.id !== input.attemptID ||
          input.outcomes.length !== row.pending.members.length ||
          new Set(input.outcomes.map((outcome) => outcome.memberID)).size !== input.outcomes.length ||
          input.outcomes.some((outcome) => !row.pending!.members.includes(outcome.memberID) ||
            !["changed", "unchanged", "unknown"].includes(outcome.effect))) return undefined
        const changed = input.outcomes.filter((outcome) => outcome.effect === "changed").map((outcome) => outcome.memberID)
        const suspended = row.pending.action === "suspend"
          ? changed
          : row.suspended.filter((member) => !changed.includes(member))
        const phase: Phase = input.outcomes.some((outcome) => outcome.effect === "unknown") ? "unknown"
          : row.pending.action === "suspend" ? (suspended.length === row.pending.members.length ? "suspended" : suspended.length ? "partial" : "refused")
          : suspended.length ? "partial" : "resumed"
        const settled = { ...row, phase, suspended, pending: null, owner_incarnation: null }
        yield* tx.update(ActivitySuspensionLedgerTable).set(settled)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, input.scope.treeID)).run()
        return project(settled, ownerIncarnation)
      }), { behavior: "immediate" })
    },
    read(treeID) {
      return database.db.transaction((tx) => Effect.gen(function* () {
        const row = yield* tx.select().from(ActivitySuspensionLedgerTable)
          .where(eq(ActivitySuspensionLedgerTable.tree_id, treeID)).get()
        return row ? project(row, ownerIncarnation) : undefined
      }), { behavior: "immediate" })
    },
  }
}

function project(row: typeof ActivitySuspensionLedgerTable.$inferSelect, ownerIncarnation: string): Record {
  const abandoned = !!row.pending && row.owner_incarnation !== ownerIncarnation
  return {
    markID: row.mark_id,
    scope: { treeID: row.tree_id, generation: row.generation },
    phase: abandoned ? "unknown" : row.phase,
    suspended: row.suspended,
    ...(row.pending && !abandoned ? { pending: row.pending } : {}),
  }
}

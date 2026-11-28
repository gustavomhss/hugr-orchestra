export * as ActivitySuspensionLedger from "./activity-suspension-ledger"

import { Effect } from "effect"
import type { Database } from "./database/database"

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
export function make(_database: Database.Interface, _ownerIncarnation: string): Interface {
  return {
    beginSuspend: () => Effect.succeed(undefined),
    beginResume: () => Effect.succeed(undefined),
    settle: () => Effect.succeed(undefined),
    read: () => Effect.succeed(undefined),
  }
}

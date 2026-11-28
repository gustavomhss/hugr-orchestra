export * as ActivityArmLedger from "./activity-arm"

import { ActivityArm } from "@orchestra/schema/activity-arm"
import { and, desc, eq, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import type { Database } from "./database/database"
import type { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityArmTable } from "./activity-arm.sql"

export interface Interface {
  readonly preview: (request: ActivityArm.Request) => Effect.Effect<ActivityArm.Preview | undefined, unknown>
  readonly confirm: (request: ActivityArm.Confirm) => Effect.Effect<ActivityArm.Receipt | undefined, unknown>
}

type Options = {
  readonly now?: () => number
  /** Checks current identity and eligibility through the authority for this exact object. */
  readonly verify?: (target: ActivityActionLedger.Target) => Effect.Effect<boolean, unknown>
}

/** An owner is constructed once per private Desktop channel incarnation. */
export function make(database: Database.Interface, options?: Options): Interface {
  const now = options?.now ?? Date.now
  const verify = options?.verify
  const previews = new Map<string, { expiresAt: number; targets: ActivityActionLedger.Target[]; preview: ActivityArm.Preview }>()
  return {
    preview(request) {
      return Effect.gen(function* () {
        if (!verify) return undefined
        const decoded = ActivityArm.decodeRequest(request)
        if (Option.isNone(decoded) || new Set(decoded.value.targets.map((target) => target.targetID)).size !== decoded.value.targets.length)
          return undefined
        const targets = yield* database.db.transaction((tx) => Effect.gen(function* () {
          const rows = yield* Effect.forEach(decoded.value.targets, (target) => tx.select().from(ActivityActionLedgerTable)
            .where(eq(ActivityActionLedgerTable.target_id, target.targetID)).get())
          if (rows.some((row, index) => !row || row.generation !== decoded.value.targets[index].generation ||
            row.observation.kind !== "object" || !row.observation.identity?.trim() || !row.observation.eligible.includes("arm")))
            return undefined
          return rows.flatMap((row) => row ? [{ ...row.observation, generation: row.generation }] : [])
        }), { behavior: "immediate" })
        if (!targets) return undefined
        const time = now()
        for (const [id, preview] of previews) if (preview.expiresAt <= time) previews.delete(id)
        if (previews.size >= 64) return undefined
        const preview = {
          previewID: crypto.randomUUID(), action: "arm-quarantine" as const, expiresAt: time + 60_000,
          targets: targets.map((target) => ({ targetID: target.targetID, generation: target.generation, label: target.label, owner: target.owner })),
        }
        if (Option.isNone(ActivityArm.decodePreview(preview))) return undefined
        previews.set(preview.previewID, { expiresAt: preview.expiresAt, targets: structuredClone(targets), preview: structuredClone(preview) })
        return structuredClone(preview)
      })
    },
    confirm(request) {
      return Effect.gen(function* () {
        if (!verify) return undefined
        const decoded = ActivityArm.decodeConfirm(request)
        if (Option.isNone(decoded)) return undefined
        const entry = previews.get(decoded.value.previewID)
        previews.delete(decoded.value.previewID)
        if (!entry || entry.expiresAt <= now()) return undefined
        const verified = yield* Effect.forEach(entry.targets, (target) => verify(structuredClone(target)))
        if (verified.some((result) => result !== true)) return undefined
        return yield* database.db.transaction((tx) => Effect.gen(function* () {
          if (entry.expiresAt <= now()) return undefined
          const rows = yield* Effect.forEach(entry.targets, (target) => tx.select().from(ActivityActionLedgerTable)
            .where(eq(ActivityActionLedgerTable.target_id, target.targetID)).get())
          if (rows.some((row, index) => !row || row.generation !== entry.targets[index].generation ||
            JSON.stringify({ ...row.observation, generation: row.generation }) !== JSON.stringify(entry.targets[index]))) return undefined
          const existing = yield* Effect.forEach(entry.targets, (target) => tx.select().from(ActivityArmTable)
            .where(and(eq(ActivityArmTable.target_id, target.targetID), eq(ActivityArmTable.generation, target.generation))).get())
          if (existing.some(Boolean)) return undefined
          const receipt = {
            approvalID: crypto.randomUUID(), action: "arm-quarantine" as const, approvedAt: now(),
            targets: structuredClone(entry.preview.targets),
          }
          if (Option.isNone(ActivityArm.decodeReceipt(receipt))) return undefined
          yield* tx.insert(ActivityArmTable).values(entry.targets.map((target) => ({
            approval_id: receipt.approvalID, target_id: target.targetID, generation: target.generation,
            approved_at: receipt.approvedAt, receipt, snapshot: target,
          }))).run()
          return structuredClone(receipt)
        }), { behavior: "immediate" })
      })
    },
  }
}

/** Read durable approvals and flag selections whose observed facts have changed. */
export function list(database: Database.Interface) {
  return approvalRows(database.db).all().pipe(Effect.map(groupApprovals))
}

/** Reads only the ledger. A cap is surfaced explicitly, and never splits an approval. */
export function plan(database: Database.Interface) {
  const limit = 256
  const decodeTarget = Schema.decodeUnknownOption(ActivityArm.Target, { onExcessProperty: "error" })
  return database.db.transaction((tx) => Effect.gen(function* () {
    const targets = yield* tx.select().from(ActivityActionLedgerTable).where(sql`
      json_extract(${ActivityActionLedgerTable.observation}, '$.kind') = 'object'
      AND length(trim(json_extract(${ActivityActionLedgerTable.observation}, '$.identity'))) > 0
      AND EXISTS (
        SELECT 1 FROM json_each(${ActivityActionLedgerTable.observation}, '$.eligible') WHERE value = 'arm'
      )
      AND NOT EXISTS (
        SELECT 1 FROM activity_arm WHERE target_id = ${ActivityActionLedgerTable.target_id}
          AND generation = ${ActivityActionLedgerTable.generation}
      )
    `).orderBy(ActivityActionLedgerTable.target_id).limit(limit + 1).all()
    const rows = yield* approvalRows(tx).orderBy(desc(ActivityArmTable.approved_at), ActivityArmTable.approval_id)
      .limit(limit + 1).all()
    const overflow = rows[limit]?.arm.approval_id
    const approvals = groupApprovals(rows.filter(({ arm }) => arm.approval_id !== overflow))
    const ready = targets.slice(0, limit).flatMap((row) => {
      const target = decodeTarget({
        targetID: row.target_id, generation: row.generation, label: row.observation.label, owner: row.observation.owner,
      })
      return Option.isSome(target) ? [target.value] : []
    })
    return { ready, approvals, partial: !!overflow || targets.length > limit || ready.length !== targets.length }
  }))
}

type Transaction = Parameters<Parameters<Database.Interface["db"]["transaction"]>[0]>[0]

function approvalRows(database: Pick<Transaction, "select">) {
  return database.select({ arm: ActivityArmTable, current: ActivityActionLedgerTable }).from(ActivityArmTable)
    .leftJoin(ActivityActionLedgerTable, eq(ActivityActionLedgerTable.target_id, ActivityArmTable.target_id))
}

function groupApprovals(rows: readonly {
  arm: typeof ActivityArmTable.$inferSelect
  current: typeof ActivityActionLedgerTable.$inferSelect | null
}[]) {
  const result = new Map<string, { receipt: ActivityArm.Receipt; changed: boolean }>()
  for (const { arm, current } of rows) {
    const changed = !current || current.generation !== arm.generation ||
      JSON.stringify({ ...current.observation, generation: current.generation }) !== JSON.stringify(arm.snapshot)
    const previous = result.get(arm.approval_id)
    result.set(arm.approval_id, { receipt: arm.receipt, changed: changed || !!previous?.changed })
  }
  return [...result.values()]
}

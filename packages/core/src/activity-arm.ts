export * as ActivityArmLedger from "./activity-arm"

import { ActivityArm } from "@orchestra/schema/activity-arm"
import { eq, and } from "drizzle-orm"
import { Effect, Option } from "effect"
import type { Database } from "./database/database"
import type { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityArmTable } from "./activity-arm.sql"

export interface Interface {
  readonly preview: (request: ActivityArm.Request) => Effect.Effect<ActivityArm.Preview | undefined, unknown>
  readonly confirm: (request: ActivityArm.Confirm) => Effect.Effect<ActivityArm.Receipt | undefined, unknown>
}

/** An owner is constructed once per private Desktop channel incarnation. */
export function make(database: Database.Interface, options?: { readonly now?: () => number }): Interface {
  const now = options?.now ?? Date.now
  const previews = new Map<string, { expiresAt: number; targets: ActivityActionLedger.Target[]; preview: ActivityArm.Preview }>()
  return {
    preview(request) {
      return Effect.gen(function* () {
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
      return Effect.suspend(() => {
        const decoded = ActivityArm.decodeConfirm(request)
        if (Option.isNone(decoded)) return Effect.succeed(undefined)
        const entry = previews.get(decoded.value.previewID)
        previews.delete(decoded.value.previewID)
        if (!entry || entry.expiresAt <= now()) return Effect.succeed(undefined)
        return database.db.transaction((tx) => Effect.gen(function* () {
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
  return database.db.transaction((tx) => Effect.gen(function* () {
    const rows = yield* tx.select().from(ActivityArmTable).all()
    const result = new Map<string, { receipt: ActivityArm.Receipt; changed: boolean }>()
    for (const row of rows) {
      const current = yield* tx.select().from(ActivityActionLedgerTable)
        .where(eq(ActivityActionLedgerTable.target_id, row.target_id)).get()
      const changed = !current || current.generation !== row.generation ||
        JSON.stringify({ ...current.observation, generation: current.generation }) !== JSON.stringify(row.snapshot)
      const existing = result.get(row.approval_id)
      result.set(row.approval_id, { receipt: structuredClone(row.receipt), changed: changed || !!existing?.changed })
    }
    return [...result.values()]
  }), { behavior: "immediate" })
}

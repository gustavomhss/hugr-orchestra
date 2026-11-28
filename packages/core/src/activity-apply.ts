export * as ActivityApplyService from "./activity-apply"

import { ActivityApply } from "@orchestra/schema/activity-apply"
import { and, eq } from "drizzle-orm"
import { Effect, Either, Option } from "effect"
import type { Database } from "./database/database"
import type { ActivityActionLedger } from "./activity-action-ledger"
import type { ActivityArmLedger } from "./activity-arm"
import { ActivityActionLedgerTable } from "./activity-action-ledger.sql"
import { ActivityArmTable } from "./activity-arm.sql"
import { ActivityApplyTable } from "./activity-apply.sql"
import { ActivityQuarantineExecutor } from "./activity-quarantine-executor"

export type Authority = {
  readonly describe: (target: ActivityActionLedger.Target) => string | undefined
  readonly authorize: (tx: ActivityArmLedger.Transaction, target: ActivityActionLedger.Target) => Effect.Effect<boolean, unknown>
  readonly prepare: (target: ActivityActionLedger.Target, destination: string) => Effect.Effect<{
    identity: string
    adapter: ActivityQuarantineExecutor.Adapter
    release: () => Promise<void>
  } | undefined, unknown>
}

export interface Interface {
  readonly state: () => Effect.Effect<ActivityApply.State, unknown>
  readonly preview: (request: ActivityApply.Request) => Effect.Effect<ActivityApply.Preview | undefined, unknown>
  readonly confirm: (request: ActivityApply.Confirm) => Effect.Effect<ActivityApply.Receipt | undefined, unknown>
}

export function make(database: Database.Interface, options?: { now?: () => number; authority?: Authority }): Interface {
  const now = options?.now ?? Date.now
  const authority = options?.authority
  const previews = new Map<string, { preview: ActivityApply.Preview; target: ActivityActionLedger.Target; started: boolean }>()
  return {
    state() {
      return Effect.gen(function* () {
        const rows = yield* database.db.select().from(ActivityArmTable).orderBy(ActivityArmTable.target_id).limit(129).all()
        const attempts = yield* database.db.select().from(ActivityApplyTable).orderBy(ActivityApplyTable.target_id).limit(129).all()
        const candidates = authority ? yield* Effect.forEach(rows.slice(0, 128), (row) => Effect.gen(function* () {
          const observed = yield* database.db.select().from(ActivityActionLedgerTable).where(eq(ActivityActionLedgerTable.target_id, row.target_id)).get()
          const attempt = yield* database.db.select().from(ActivityApplyTable).where(and(eq(ActivityApplyTable.target_id, row.target_id), eq(ActivityApplyTable.generation, row.generation))).get()
          if (row.receipt.targets.length !== 1 || !observed || observed.generation !== row.generation ||
            JSON.stringify({ ...observed.observation, generation: observed.generation }) !== JSON.stringify(row.snapshot) ||
            attempt || !authority.describe(row.snapshot)) return undefined
          return { approvalID: row.approval_id, targetID: row.target_id, generation: row.generation }
        })) : []
        const eligible = candidates.filter((item) => item !== undefined)
        return { available: !!authority, eligible: eligible.slice(0, 16), results: attempts.slice(0, 128).map((row) => ({
          approvalID: row.approval_id, targetID: row.target_id, generation: row.generation, outcome: row.outcome,
        })), partial: rows.length > 128 || attempts.length > 128 || eligible.length > 16 }
      })
    },
    preview(request) {
      return Effect.gen(function* () {
        if (!authority) return undefined
        const decoded = ActivityApply.decodeRequest(request)
        if (Option.isNone(decoded)) return undefined
        const row = yield* database.db.select().from(ActivityArmTable).where(and(
          eq(ActivityArmTable.approval_id, decoded.value.approvalID), eq(ActivityArmTable.target_id, decoded.value.targetID),
          eq(ActivityArmTable.generation, decoded.value.generation),
        )).get()
        if (!row || row.receipt.targets.length !== 1 || row.receipt.approvalID !== row.approval_id ||
          row.receipt.targets[0]?.targetID !== row.target_id || row.receipt.targets[0]?.generation !== row.generation) return undefined
        const current = yield* database.db.select().from(ActivityActionLedgerTable).where(eq(ActivityActionLedgerTable.target_id, row.target_id)).get()
        if (!current || current.generation !== row.generation ||
          JSON.stringify({ ...current.observation, generation: current.generation }) !== JSON.stringify(row.snapshot)) return undefined
        const existing = yield* database.db.select().from(ActivityApplyTable).where(and(
          eq(ActivityApplyTable.target_id, row.target_id), eq(ActivityApplyTable.generation, row.generation),
        )).get()
        if (existing) return undefined
        const destination = authority.describe(row.snapshot)
        if (!destination) return undefined
        const time = now()
        for (const [id, entry] of previews) if (!entry.started && entry.preview.expiresAt <= time) previews.delete(id)
        if (previews.size >= 64) return undefined
        const preview = { previewID: crypto.randomUUID(), action: "apply-quarantine" as const, expiresAt: time + 60_000,
          approvalID: row.approval_id, target: row.receipt.targets[0]!, destination }
        if (Option.isNone(ActivityApply.decodePreview(preview))) return undefined
        previews.set(preview.previewID, { preview: structuredClone(preview), target: structuredClone(row.snapshot), started: false })
        return structuredClone(preview)
      })
    },
    confirm(request) {
      return Effect.gen(function* () {
        if (!authority) return undefined
        const decoded = ActivityApply.decodeConfirm(request)
        if (Option.isNone(decoded)) return undefined
        const entry = previews.get(decoded.value.previewID)
        if (!entry || (!entry.started && entry.preview.expiresAt <= now())) return undefined
        if (entry.started) {
          const previous = yield* database.db.select().from(ActivityApplyTable).where(eq(ActivityApplyTable.preview_id, entry.preview.previewID)).get()
          return previous ? { previewID: previous.preview_id, approvalID: previous.approval_id, targetID: previous.target_id,
            generation: previous.generation, outcome: previous.outcome } : undefined
        }
        entry.started = true
        const receipt = { previewID: entry.preview.previewID, approvalID: entry.preview.approvalID,
          targetID: entry.target.targetID, generation: entry.target.generation, outcome: "Unknown" as "Unknown" | "Refused" | "Out" }
        const reserved = yield* database.db.transaction((tx) => Effect.gen(function* () {
          if (entry.preview.expiresAt <= now()) return false
          const existing = yield* tx.select().from(ActivityApplyTable).where(and(
            eq(ActivityApplyTable.target_id, receipt.targetID), eq(ActivityApplyTable.generation, receipt.generation),
          )).get()
          if (existing) return false
          const arm = yield* tx.select().from(ActivityArmTable).where(and(eq(ActivityArmTable.approval_id, receipt.approvalID),
            eq(ActivityArmTable.target_id, receipt.targetID), eq(ActivityArmTable.generation, receipt.generation))).get()
          const current = yield* tx.select().from(ActivityActionLedgerTable).where(eq(ActivityActionLedgerTable.target_id, receipt.targetID)).get()
          const valid = !!arm && arm.receipt.targets.length === 1 && arm.receipt.approvalID === receipt.approvalID &&
            arm.receipt.targets[0]?.targetID === receipt.targetID && arm.receipt.targets[0]?.generation === receipt.generation &&
            JSON.stringify(arm.snapshot) === JSON.stringify(entry.target) && !!current && current.generation === receipt.generation &&
            JSON.stringify({ ...current.observation, generation: current.generation }) === JSON.stringify(entry.target) &&
            authority.describe(entry.target) === entry.preview.destination && entry.preview.expiresAt > now()
          const authorized = valid ? yield* Effect.either(authority.authorize(tx, structuredClone(entry.target))) : undefined
          receipt.outcome = valid && authorized && Either.isRight(authorized) && authorized.right === true ? "Unknown" : "Refused"
          yield* tx.insert(ActivityApplyTable).values({ preview_id: receipt.previewID, approval_id: receipt.approvalID,
            target_id: receipt.targetID, generation: receipt.generation, outcome: receipt.outcome }).run()
          return true
        }), { behavior: "immediate" })
        if (!reserved) return undefined
        if (receipt.outcome === "Refused") return receipt
        const prepared = yield* Effect.either(authority.prepare(structuredClone(entry.target), entry.preview.destination))
        if (Either.isLeft(prepared) || !prepared.right) receipt.outcome = "Refused"
        else {
          const item = prepared.right
          const result = yield* Effect.promise(async () => {
            try {
              if (item.identity !== entry.target.identity) return "Refused" as const
              return await ActivityQuarantineExecutor.execute(item.adapter, { id: entry.target.targetID,
                generation: entry.target.generation, identity: item.identity }, "apply")
            } finally {
              await item.release().catch(() => undefined)
            }
          })
          receipt.outcome = result === "Verified" ? "Out" : result
        }
        yield* database.db.update(ActivityApplyTable).set({ outcome: receipt.outcome }).where(eq(ActivityApplyTable.preview_id, receipt.previewID)).run()
        return receipt
      })
    },
  }
}

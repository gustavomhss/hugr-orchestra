export * as ActivityQuarantineCustody from "./activity-quarantine-custody"

import { ActivityEmpty } from "@orchestra/schema/activity-empty"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityQuarantineExecutor } from "./activity-quarantine-executor"
import { ActivityQuarantineNative } from "./activity-quarantine-native"
import { ActivityQuarantineCustodyTable } from "./activity-quarantine-custody.sql"
import type { Database } from "./database/database"
import { Omni } from "./omni"
import { and, asc, eq, ne } from "drizzle-orm"
import { Effect, Option } from "effect"

type CustodyRow = typeof ActivityQuarantineCustodyTable.$inferSelect
type Entry = {
  readonly expiresAt: number
  readonly rows: readonly CustodyRow[]
  readonly preview: ActivityEmpty.Preview
}

export interface Interface {
  readonly move: (
    target: ActivityQuarantineExecutor.Target & { readonly label: string; readonly owner: string },
    acquire: ActivityQuarantineNative.Acquire,
  ) => Effect.Effect<ActivityEmpty.Outcome, unknown>
  readonly preview: () => Effect.Effect<ActivityEmpty.Preview | undefined, unknown>
  readonly confirm: (input: ActivityEmpty.Confirm) => Effect.Effect<ActivityEmpty.Receipt | undefined, unknown>
}

/** Private custody authority. Only the trusted producer can supply an acquire operation. */
export function make(database: Database.Interface, options?: { readonly now?: () => number }): Interface {
  const now = options?.now ?? Date.now
  const previews = new Map<string, Entry>()

  return {
    move(target, acquire) {
      return Effect.tryPromise({
        try: async () => {
          if (!/^[0-9a-f]{48}$/.test(target.identity) || !target.label.trim() || !target.owner.trim() ||
            !await Omni.quarantineBatch().catch(() => undefined)) return "Refused"
          const lease = await acquire(target, "apply").catch(() => undefined)
          if (!lease) return "Refused"
          try {
            if (!lease.originalPath.trim() || !lease.quarantinePath.trim() || lease.state !== "armed" ||
              lease.disposable !== "file") return "Refused"
            if (Option.isNone(ActivityEmpty.decodeTarget({
              targetID: target.id, generation: target.generation, label: target.label, owner: target.owner,
              originalPath: lease.originalPath,
            }))) return "Refused"

            const inserted = await Effect.runPromise(database.db.transaction((tx) => Effect.gen(function* () {
              const active = yield* tx.select({ phase: ActivityQuarantineCustodyTable.phase })
                .from(ActivityQuarantineCustodyTable)
                .where(ne(ActivityQuarantineCustodyTable.phase, "finished"))
                .limit(ActivityArm.maxTargets).all()
              if (active.length >= ActivityArm.maxTargets || active.some((row) => row.phase === "emptying" || row.phase === "unknown"))
                return undefined
              return yield* tx.insert(ActivityQuarantineCustodyTable).values({
                target_id: target.id,
                generation: target.generation,
                identity: target.identity,
                label: target.label,
                owner: target.owner,
                original_path: lease.originalPath,
                quarantine_path: lease.quarantinePath,
                phase: "moving",
                reservation_id: null,
              }).onConflictDoNothing().returning({ targetID: ActivityQuarantineCustodyTable.target_id }).get()
            }), { behavior: "immediate" }))
            if (!inserted) return "Refused"

            try {
              // Keep the producer reservation until the native result is durably recorded.
              const outcome = await ActivityQuarantineNative.execute(async () => ({
                ...lease,
                release: async () => {},
              }), target, "apply")
              if (outcome === "Verified") await setPhase(database, target, "moving", "ready")
              if (outcome === "Unknown") await setPhase(database, target, "moving", "unknown")
              if (outcome === "Refused") await removeMoving(database, target)
              return outcome
            } catch {
              await setPhase(database, target, "moving", "unknown").catch(() => undefined)
              return "Unknown"
            }
          } finally {
            await Promise.resolve().then(() => lease.release()).catch(() => undefined)
          }
        },
        catch: (error) => error,
      })
    },
    preview() {
      const snapshot = database.db.transaction((tx) => Effect.gen(function* () {
        const rows = yield* tx.select().from(ActivityQuarantineCustodyTable)
          .where(ne(ActivityQuarantineCustodyTable.phase, "finished"))
          .orderBy(asc(ActivityQuarantineCustodyTable.target_id)).limit(ActivityArm.maxTargets + 1).all()
        if (!rows.length || rows.length > ActivityArm.maxTargets || rows.some((row) =>
          row.phase !== "ready" || !row.target_id.trim() || !row.generation.trim() || !row.identity.trim() ||
          !row.original_path.trim())) return undefined

        const time = now()
        for (const [id, entry] of previews) if (entry.expiresAt <= time) previews.delete(id)
        if (previews.size >= 64) return undefined
        const preview = {
          previewID: crypto.randomUUID(),
          action: "empty-quarantine" as const,
          expiresAt: time + 60_000,
          targets: rows.map((row) => ({
            targetID: row.target_id,
            generation: row.generation,
            label: row.label,
            owner: row.owner,
            originalPath: row.original_path,
          })),
        }
        if (Option.isNone(ActivityEmpty.decodePreview(preview))) return undefined
        previews.set(preview.previewID, { expiresAt: preview.expiresAt, rows: structuredClone(rows), preview })
        return structuredClone(preview)
      }), { behavior: "immediate" })
      return Effect.promise(() => Omni.quarantineBatch().catch(() => undefined)).pipe(
        Effect.flatMap((dispose) => dispose ? snapshot : Effect.succeed(undefined)),
      )
    },
    confirm(input) {
      return Effect.suspend(() => {
        const decoded = ActivityEmpty.decodeConfirm(input)
        if (Option.isNone(decoded)) return Effect.succeed(undefined)
        const entry = previews.get(decoded.value.previewID)
        previews.delete(decoded.value.previewID)
        if (!entry || entry.expiresAt <= now()) return Effect.succeed(undefined)
        return database.db.transaction((tx) => Effect.gen(function* () {
          if (entry.expiresAt <= now()) return undefined
          const rows = yield* tx.select().from(ActivityQuarantineCustodyTable)
            .where(ne(ActivityQuarantineCustodyTable.phase, "finished"))
            .orderBy(asc(ActivityQuarantineCustodyTable.target_id)).limit(ActivityArm.maxTargets + 1).all()
          if (rows.length !== entry.rows.length || rows.some((row, index) =>
            row.phase !== "ready" || !sameRow(row, entry.rows[index]))) return undefined

          const reservationID = crypto.randomUUID()
          yield* Effect.forEach(rows, (row) => tx.update(ActivityQuarantineCustodyTable)
            .set({ phase: "emptying", reservation_id: reservationID })
            .where(and(eq(ActivityQuarantineCustodyTable.target_id, row.target_id),
              eq(ActivityQuarantineCustodyTable.generation, row.generation),
              eq(ActivityQuarantineCustodyTable.identity, row.identity),
              eq(ActivityQuarantineCustodyTable.phase, "ready"))).run())
          return { reservationID, rows }
        }), { behavior: "immediate" }).pipe(Effect.flatMap((reserved) => {
          if (!reserved) return Effect.succeed(undefined)
          return Effect.uninterruptible(Effect.tryPromise({
            try: async () => {
              const emptyReceipt = (outcome: ActivityEmpty.Outcome): ActivityEmpty.Receipt => ({
                previewID: entry.preview.previewID,
                outcome,
                targets: reserved.rows.map((row) => ({ targetID: row.target_id, generation: row.generation })),
              })
              try {
                const native = await Omni.quarantine().catch(() => undefined)
                const quarantineBatch = await Omni.quarantineBatch().catch(() => undefined)
                if (!native || !quarantineBatch) {
                  await settle(database, reserved.rows, reserved.reservationID, "ready")
                  return emptyReceipt("Refused")
                }
                const batch = await quarantineBatch(reserved.rows.map((row) => ({
                  path: row.quarantine_path,
                  identity: row.identity,
                }))).catch(() => "unknown" as const)
                if (batch === "refused") {
                  await settle(database, reserved.rows, reserved.reservationID, "ready")
                  return emptyReceipt("Refused")
                }
                if (batch !== "accepted") {
                  await settle(database, reserved.rows, reserved.reservationID, "unknown")
                  return emptyReceipt("Unknown")
                }
                const after = await Promise.all(reserved.rows.map((row) => inspect(native, row.quarantine_path)))
                const verified = after.every((reading) => reading.state === "absent")
                await settle(database, reserved.rows, reserved.reservationID, verified ? "finished" : "unknown")
                return emptyReceipt(verified ? "Verified" : "Unknown")
              } catch {
                await settle(database, reserved.rows, reserved.reservationID, "unknown").catch(() => undefined)
                return emptyReceipt("Unknown")
              }
            },
            catch: (error) => error,
          }))
        }))
      })
    },
  }
}

async function inspect(native: NonNullable<Awaited<ReturnType<typeof Omni.quarantine>>>, path: string) {
  const identity = await native.quarantineInspect(path).catch(() => undefined)
  if (identity === null) return { state: "absent" } as const
  return identity ? { state: "present", identity } as const : { state: "unavailable" } as const
}

async function setPhase(
  database: Database.Interface,
  target: ActivityQuarantineExecutor.Target,
  from: "moving",
  to: "ready" | "finished" | "unknown",
) {
  const updated = await Effect.runPromise(database.db.update(ActivityQuarantineCustodyTable).set({ phase: to })
    .where(and(eq(ActivityQuarantineCustodyTable.target_id, target.id),
      eq(ActivityQuarantineCustodyTable.generation, target.generation),
      eq(ActivityQuarantineCustodyTable.identity, target.identity),
      eq(ActivityQuarantineCustodyTable.phase, from)))
    .returning({ targetID: ActivityQuarantineCustodyTable.target_id }).get())
  if (!updated) throw new Error("Quarantine move reservation changed")
}

async function removeMoving(database: Database.Interface, target: ActivityQuarantineExecutor.Target) {
  await Effect.runPromise(database.db.delete(ActivityQuarantineCustodyTable).where(and(
    eq(ActivityQuarantineCustodyTable.target_id, target.id),
    eq(ActivityQuarantineCustodyTable.generation, target.generation),
    eq(ActivityQuarantineCustodyTable.identity, target.identity),
    eq(ActivityQuarantineCustodyTable.phase, "moving"),
  )).run())
}

async function settle(
  database: Database.Interface,
  rows: readonly CustodyRow[],
  reservationID: string,
  phase: "ready" | "finished" | "unknown",
) {
  await Effect.runPromise(database.db.transaction((tx) => Effect.gen(function* () {
    const updated = yield* Effect.forEach(rows, (row) =>
      tx.update(ActivityQuarantineCustodyTable).set({
        phase,
        reservation_id: phase === "ready" ? null : reservationID,
      }).where(and(eq(ActivityQuarantineCustodyTable.target_id, row.target_id),
        eq(ActivityQuarantineCustodyTable.generation, row.generation),
        eq(ActivityQuarantineCustodyTable.identity, row.identity),
        eq(ActivityQuarantineCustodyTable.phase, "emptying"),
        eq(ActivityQuarantineCustodyTable.reservation_id, reservationID)))
        .returning({ targetID: ActivityQuarantineCustodyTable.target_id }).get())
    if (updated.some((row) => !row)) return yield* Effect.fail(new Error("Quarantine reservation changed during settlement"))
  }), { behavior: "immediate" }))
}

function sameRow(left: CustodyRow, right: CustodyRow | undefined) {
  return !!right && left.target_id === right.target_id && left.generation === right.generation &&
    left.identity === right.identity && left.label === right.label && left.owner === right.owner &&
    left.original_path === right.original_path && left.quarantine_path === right.quarantine_path &&
    left.phase === right.phase && left.reservation_id === right.reservation_id
}


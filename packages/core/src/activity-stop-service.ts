export * as ActivityStopService from "./activity-stop-service"

import type { ActivityStop } from "@orchestra/schema/activity-stop"
import { Effect } from "effect"
import { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityMonitor } from "./activity-monitor"
import { ActivitySuspensionLedger } from "./activity-suspension-ledger"
import { Database } from "./database/database"

export interface Interface {
  preview(input: ActivityStop.Request): Effect.Effect<ActivityStop.Preview | undefined, unknown>
  confirm(input: ActivityStop.Confirm): Effect.Effect<ActivityStop.Receipt | undefined, unknown>
}

export function make(database: Database.Interface, options?: { now?: () => number; observe?: typeof ActivityMonitor.control }): Interface {
  const now = options?.now ?? Date.now
  const observe = options?.observe ?? ActivityMonitor.control
  const incarnation = crypto.randomUUID()
  const suspension = ActivitySuspensionLedger.make(database, incarnation)
  const ledger = ActivityActionLedger.make.pipe(Effect.provideService(Database.Service, database))
  const previews = new Map<string, { preview: ActivityStop.Preview; identity: string }>()
  const locked = new Set<string>()
  const uncertain = new Set<string>()

  const read = (recordID: string) => Effect.gen(function* () {
    const control = yield* Effect.tryPromise(() => observe(recordID)).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!control || !control.identity.trim() || !control.owner.trim() || !control.members.length || control.members.length > 256 ||
      control.members.some((member) => !/^[1-9][0-9]{0,9}:[1-9][0-9]{0,19}$/.test(member)) ||
      new Set(control.members).size !== control.members.length) return
    const journal = yield* suspension.read(recordID)
    if (journal && (journal.pending || !["resumed", "refused"].includes(journal.phase) || journal.suspended.length || journal.uncertain.length)) return
    const actionLedger = yield* ledger
    const target = yield* actionLedger.record({ targetID: recordID, kind: "tree", label: control.label, owner: control.owner,
      identity: control.identity, members: control.members, dirty: null, eligible: ["stop-tree"] })
    return { control, target }
  })

  return {
    preview(input) {
      return Effect.gen(function* () {
        const reading = yield* read(input.recordID)
        if (!reading) return
        const current = now()
        for (const [id, stored] of previews) if (stored.preview.expiresAt <= current) previews.delete(id)
        if (previews.size >= 64) return
        const preview: ActivityStop.Preview = {
          previewID: crypto.randomUUID(), action: "stop-tree", expiresAt: current + 60_000,
          target: { targetID: reading.target.targetID, generation: reading.target.generation,
            label: reading.target.label, owner: reading.target.owner },
          members: [...reading.target.members],
        }
        previews.set(preview.previewID, { preview, identity: reading.control.identity })
        return preview
      })
    },
    confirm(input) {
      return Effect.suspend(() => {
        const stored = previews.get(input.previewID)
        previews.delete(input.previewID)
        if (!stored || stored.preview.expiresAt <= now() || locked.has(stored.preview.target.targetID)) return Effect.succeed(undefined)
        const recordID = stored.preview.target.targetID
        locked.add(recordID)
        return Effect.gen(function* () {
          const reading = yield* read(recordID)
          if (!reading || reading.control.identity !== stored.identity || reading.target.generation !== stored.preview.target.generation ||
            JSON.stringify(reading.target.members) !== JSON.stringify(stored.preview.members)) return
          const actionLedger = yield* ledger
          if (!(yield* actionLedger.capture("stop-tree", [stored.preview.target]))) return
          const key = JSON.stringify([recordID, stored.identity, stored.preview.members])
          if (uncertain.has(key)) return
          // Fence the dispatch before crossing the native boundary; only a fully observed receipt clears it.
          uncertain.add(key)
          const result = yield* Effect.tryPromise(() => reading.control.stop(stored.preview.members)).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const valid = Array.isArray(result) && result.length === stored.preview.members.length &&
            result.every((state) => state === "exited" || state === "unknown")
          const states = valid ? result : stored.preview.members.map(() => "unknown" as const)
          if (states.every((state) => state === "exited")) uncertain.delete(key)
          return { previewID: stored.preview.previewID, target: stored.preview.target,
            outcomes: stored.preview.members.map((member, index) => ({ member, state: states[index] })) }
        }).pipe(Effect.ensuring(Effect.sync(() => locked.delete(recordID))))
      })
    },
  }
}

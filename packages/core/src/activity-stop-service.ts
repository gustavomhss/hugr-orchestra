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
  const previews = new Map<string, ActivityStop.Preview>()
  const locked = new Set<string>()
  const uncertain = new Map<string, Set<string>>()

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
        for (const [id, stored] of previews) if (stored.expiresAt <= current) previews.delete(id)
        if (previews.size >= 64) return
        const preview: ActivityStop.Preview = {
          previewID: crypto.randomUUID(), action: "stop-tree", expiresAt: current + 60_000,
          target: { targetID: reading.target.targetID, generation: reading.target.generation,
            label: reading.target.label, owner: reading.target.owner },
          treeID: reading.control.identity,
          members: [...reading.target.members],
        }
        previews.set(preview.previewID, structuredClone(preview))
        return preview
      })
    },
    confirm(input) {
      return Effect.suspend(() => {
        const stored = previews.get(input.previewID)
        previews.delete(input.previewID)
        if (!stored || stored.expiresAt <= now() || locked.has(stored.target.targetID)) return Effect.succeed(undefined)
        const recordID = stored.target.targetID
        locked.add(recordID)
        return Effect.gen(function* () {
          const reading = yield* read(recordID)
          if (!reading || reading.control.identity !== stored.treeID || reading.target.generation !== stored.target.generation ||
            JSON.stringify(reading.target.members) !== JSON.stringify(stored.members)) return
          const actionLedger = yield* ledger
          if (!(yield* actionLedger.capture("stop-tree", [stored.target])) || now() >= stored.expiresAt) return
          if (stored.members.some((member) => uncertain.get(recordID)?.has(member))) return
          // Fence the dispatch before crossing the native boundary; only a fully observed receipt clears it.
          uncertain.set(recordID, new Set(stored.members))
          const result = yield* Effect.tryPromise(() => reading.control.stop(stored.members)).pipe(Effect.catch(() => Effect.succeed(undefined)))
          const valid = Array.isArray(result) && result.length === stored.members.length &&
            result.every((state) => state === "exited" || state === "unknown")
          const states = valid ? result : stored.members.map(() => "unknown" as const)
          const unresolved = stored.members.filter((_member, index) => states[index] === "unknown")
          if (unresolved.length) uncertain.set(recordID, new Set(unresolved))
          else uncertain.delete(recordID)
          return { previewID: stored.previewID, target: stored.target, treeID: stored.treeID,
            outcomes: stored.members.map((member, index) => ({ member, state: states[index] })) }
        }).pipe(Effect.ensuring(Effect.sync(() => locked.delete(recordID))))
      })
    },
  }
}

export * as ActivityFreezeService from "./activity-freeze-service"

import type { ActivityFreeze } from "@orchestra/schema/activity-freeze"
import { Effect } from "effect"
import { ActivityActionLedger } from "./activity-action-ledger"
import { ActivityMonitor } from "./activity-monitor"
import { ActivitySuspensionExecutor } from "./activity-suspension-executor"
import { ActivitySuspensionLedger } from "./activity-suspension-ledger"
import { Database } from "./database/database"

export interface Interface {
  read(input: ActivityFreeze.Read): Effect.Effect<ActivityFreeze.State | undefined, unknown>
  preview(input: ActivityFreeze.Request): Effect.Effect<ActivityFreeze.Preview | undefined, unknown>
  confirm(input: ActivityFreeze.Confirm): Effect.Effect<ActivityFreeze.Receipt | undefined, unknown>
}

export function make(database: Database.Interface, options?: { now?: () => number; observe?: typeof ActivityMonitor.freeze }): Interface {
  const now = options?.now ?? Date.now
  const observe = options?.observe ?? ActivityMonitor.freeze
  const suspension = ActivitySuspensionLedger.make(database, crypto.randomUUID())
  const ledger = ActivityActionLedger.make.pipe(Effect.provideService(Database.Service, database))
  const previews = new Map<string, { preview: ActivityFreeze.Preview; mark: ActivitySuspensionLedger.Record | undefined }>()
  const locked = new Set<string>()

  const reading = (recordID: string) => Effect.gen(function* () {
    const control = yield* Effect.tryPromise(() => observe(recordID)).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (!control || !control.identity.trim() || !control.owner.trim() ||
      !/^[1-9][0-9]{0,9}:[1-9][0-9]{0,19}$/.test(control.member)) return
    const actions = yield* ledger
    const target = yield* actions.record({ targetID: recordID, kind: "tree", label: control.label, owner: control.owner,
      identity: control.identity, members: [control.member], dirty: null, eligible: ["suspend", "resume"] })
    const mark = yield* suspension.read(recordID)
    const next: ActivityFreeze.State["next"] = !mark || (!mark.pending && !mark.suspended.length && !mark.uncertain.length &&
      (mark.phase === "resumed" || mark.phase === "refused")) ? "suspend"
      : !mark.pending && mark.phase === "suspended" && mark.scope.generation === target.generation &&
        mark.suspended.length === 1 && mark.suspended[0] === control.member && !mark.uncertain.length ? "resume" : "blocked"
    return { control, target, mark, next }
  })

  return {
    read(input) {
      return Effect.map(reading(input.recordID), (current) => current && ({
        recordID: input.recordID, treeID: current.control.identity, member: current.control.member, next: current.next,
      }))
    },
    preview(input) {
      return Effect.gen(function* () {
        const current = yield* reading(input.recordID)
        if (!current || current.next !== input.action) return
        const time = now()
        for (const [id, stored] of previews) if (stored.preview.expiresAt <= time) previews.delete(id)
        if (previews.size >= 64) return
        const preview: ActivityFreeze.Preview = {
          previewID: crypto.randomUUID(), action: input.action, expiresAt: time + 60_000,
          target: { targetID: current.target.targetID, generation: current.target.generation,
            label: current.target.label, owner: current.target.owner },
          treeID: current.control.identity, member: current.control.member,
        }
        previews.set(preview.previewID, structuredClone({ preview, mark: current.mark }))
        return preview
      })
    },
    confirm(input) {
      return Effect.suspend(() => {
        const stored = previews.get(input.previewID)
        previews.delete(input.previewID)
        if (!stored || stored.preview.expiresAt <= now() || locked.has(stored.preview.treeID)) return Effect.succeed(undefined)
        const preview = stored.preview
        locked.add(preview.treeID)
        return Effect.gen(function* () {
          const current = yield* reading(preview.target.targetID)
          if (!current || current.next !== preview.action || current.control.identity !== preview.treeID ||
            current.control.member !== preview.member || current.target.generation !== preview.target.generation ||
            JSON.stringify(current.mark) !== JSON.stringify(stored.mark)) return
          const actions = yield* ledger
          if (!(yield* actions.capture(preview.action, [preview.target])) || now() >= preview.expiresAt) return
          const scope = { treeID: preview.target.targetID, generation: preview.target.generation }
          const result = yield* ActivitySuspensionExecutor.execute(suspension, async (_scope, attempt) => {
            const outcome = await current.control.apply(attempt.action)
            return [{ memberID: preview.member, effect: outcome === "refused" ? "unchanged" : outcome }]
          }, preview.action === "resume"
            ? { action: "resume", scope, members: [preview.member], markID: current.mark!.markID }
            : { action: "suspend", scope, members: [preview.member] })
          if (!result || result.phase === "suspending" || result.phase === "resuming") return
          return { previewID: preview.previewID, target: { targetID: preview.target.targetID, generation: preview.target.generation },
            treeID: preview.treeID, member: preview.member, action: preview.action, markID: result.markID, phase: result.phase }
        }).pipe(Effect.ensuring(Effect.sync(() => locked.delete(preview.treeID))))
      })
    },
  }
}

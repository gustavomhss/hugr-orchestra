export * as ScheduledTask from "./scheduled-task"

import { and, asc, desc, eq, inArray, isNotNull, lt, lte, ne, notInArray, type SQL } from "drizzle-orm"
import { Cause, Clock, Context, Duration, Effect, Layer, Schedule, Schema } from "effect"
import type { Capability } from "@orchestra/schema/capability"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { AgentV2 } from "./agent"
import type { CapabilityScheduleContract } from "./capability/schedule/contract"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { AbsolutePath } from "./schema"
import { SessionV2 } from "./session"
import { SessionInput } from "./session/input"
import { SessionMessage } from "./session/message"
import { ScheduledTaskCapabilityModel } from "./scheduled-task/capability-model"
import { ScheduledTaskModel } from "./scheduled-task/model"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "./scheduled-task/sql"

export const ID = ScheduledTask.ID
export type ID = ScheduledTask.ID
export const Info = ScheduledTask.Info
export type Info = ScheduledTask.Info

// A running claim older than this belongs to a process that stopped mid-dispatch. Dispatch is a few local
// writes, so a live process settles long before.
export const LEASE = 120_000
export const TICK = Duration.seconds(15)
// Settled runs kept per task. Only the latest is shown; a slot can no longer run once the task moved past it.
const KEEP = 20

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("ScheduledTask.NotFoundError", {
  id: Schema.String,
}) {}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("ScheduledTask.InvalidError", {
  field: Schema.String,
  message: Schema.String,
}) {}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ScheduledTask.ConflictError", {
  id: Schema.String,
}) {}

export class RunError extends Schema.TaggedErrorClass<RunError>()("ScheduledTask.RunError", {
  reason: Schema.String,
}) {}

export interface Interface {
  readonly list: (directory: AbsolutePath) => Effect.Effect<Info[]>
  readonly create: (
    directory: AbsolutePath,
    input: ScheduledTask.CreateInput,
  ) => Effect.Effect<Info, InvalidError | ConflictError>
  readonly update: (
    directory: AbsolutePath,
    id: ID,
    input: ScheduledTask.UpdateInput,
  ) => Effect.Effect<Info, NotFoundError | InvalidError>
  readonly remove: (directory: AbsolutePath, id: ID) => Effect.Effect<void, NotFoundError>
  /** Run now: serves the due slot when no run holds it, otherwise starts an extra run. A failure records nothing. */
  readonly run: (directory: AbsolutePath, id: ID) => Effect.Effect<ScheduledTask.RunResult, NotFoundError | RunError>
  /** Finishes claims a stopped process left behind, then serves every due slot once. */
  readonly tick: Effect.Effect<void>
  /**
   * Capability schedules (schedule_manage). Every call is scoped to `owner`: a schedule owned by anyone else
   * is NotFound, exactly like an unknown ID. The legacy methods above never see these rows.
   */
  readonly capability: {
    readonly create: (owner: Capability.Owner, input: CapabilityCreate) => Effect.Effect<Schedule, InvalidError>
    readonly list: (owner: Capability.Owner) => Effect.Effect<Schedule[]>
    readonly get: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, NotFoundError>
    /** Bumps the revision, recomputes `next`, and revokes claims of older revisions not yet admitted. */
    readonly update: (
      owner: Capability.Owner,
      id: ID,
      input: CapabilityUpdate,
    ) => Effect.Effect<Schedule, NotFoundError | InvalidError>
    readonly pause: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, NotFoundError>
    /** Rolls to the next future slot; a past once or an exhausted repeat cannot resume. */
    readonly resume: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, NotFoundError | InvalidError>
    readonly remove: (owner: Capability.Owner, id: ID) => Effect.Effect<void, NotFoundError>
    /** Manual run deduped on `manualKey`: a retry returns the same Session. Never moves `next` or counts. */
    readonly run: (
      owner: Capability.Owner,
      id: ID,
      manualKey: string,
    ) => Effect.Effect<{ sessionID: SessionV2.ID; reused: boolean }, NotFoundError | RunError>
  }
}

export type Schedule = CapabilityScheduleContract.Schedule
type Definition<Action> = Omit<Extract<CapabilityScheduleContract.Input, { action: Action }>, "action" | "id">
export type CapabilityCreate = Definition<"create">
export type CapabilityUpdate = Definition<"update">

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/ScheduledTask") {}

type Task = typeof ScheduledTaskTable.$inferSelect
type LegacyTask = Task & { cadence: ScheduledTask.Cadence }
type RunRow = typeof ScheduledTaskRunTable.$inferSelect
type Claim = {
  readonly id: string
  readonly task: Task
  readonly sessionID: SessionV2.ID
  readonly messageID: SessionMessage.ID
  readonly prompt: string
}
type Outcome =
  | { type: "started"; sessionID: SessionV2.ID }
  | { type: "failed"; error: string }
  | { type: "revoked" }
  | { type: "void" }

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const sessions = yield* SessionV2.Service
    // Marks this process's claims. A restarted process takes its old claims over once their lease ends.
    const lease = crypto.randomUUID()
    const immediate = <A, E>(effect: Effect.Effect<A, E>) =>
      db.transaction(() => effect, { behavior: "immediate" }).pipe(Effect.orDie)

    // A directory-scoped lookup serves the legacy routes, which never see capability rows.
    const find = (id: ID, directory?: AbsolutePath) =>
      db
        .select()
        .from(ScheduledTaskTable)
        .where(
          directory
            ? and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), LEGACY)
            : eq(ScheduledTaskTable.id, id),
        )
        .get()

    const owned = (owner: Capability.Owner, id: ID) =>
      find(id).pipe(Effect.map((task) => (task && sameOwner(task, owner) ? task : undefined)))

    const lastRuns = (tasks: Task[]) =>
      tasks.length === 0
        ? Effect.succeed([])
        : db
            .select()
            .from(ScheduledTaskRunTable)
            .where(
              and(
                inArray(
                  ScheduledTaskRunTable.task_id,
                  tasks.map((task) => task.id),
                ),
                inArray(ScheduledTaskRunTable.state, ["started", "failed"]),
              ),
            )
            .orderBy(desc(ScheduledTaskRunTable.time_settled))
            .all()
            .pipe(Effect.orDie)

    const infos = Effect.fn("ScheduledTask.infos")(function* (tasks: LegacyTask[]) {
      const runs = yield* lastRuns(tasks)
      return tasks.map((task) =>
        toInfo(
          task,
          runs.find((run) => run.task_id === task.id),
        ),
      )
    })

    const schedules = Effect.fn("ScheduledTask.schedules")(function* (tasks: Task[]) {
      const runs = yield* lastRuns(tasks)
      return tasks.map((task) =>
        toSchedule(
          task,
          runs.find((run) => run.task_id === task.id),
        ),
      )
    })

    const get = Effect.fn("ScheduledTask.get")(function* (directory: AbsolutePath, id: ID) {
      const task = yield* find(id, directory).pipe(Effect.orDie)
      if (!task || !legacy(task)) return yield* new NotFoundError({ id })
      return (yield* infos([task]))[0]!
    })

    const getOwned = Effect.fn("ScheduledTask.getOwned")(function* (owner: Capability.Owner, id: ID) {
      const task = yield* owned(owner, id).pipe(Effect.orDie)
      if (!task) return yield* new NotFoundError({ id })
      return (yield* schedules([task]))[0]!
    })

    const write = (task: Task, timing: ScheduledTaskModel.Timing, now: number) =>
      db
        .update(ScheduledTaskTable)
        .set({ next: timing.next, enabled: timing.enabled, missed: timing.missed ?? null, time_updated: now })
        .where(eq(ScheduledTaskTable.id, task.id))
        .run()

    const claim = Effect.fn("ScheduledTask.claim")(function* (
      task: Task,
      slot: number | undefined,
      now: number,
      manualKey?: string,
    ) {
      // Capability IDs derive from (task, revision, slot) or the manual key, so an edit never reuses a Session.
      const ids =
        task.policy === "capability"
          ? ScheduledTaskModel.slotIDs(
              slot === undefined ? `${task.id}:manual:${manualKey}` : `${task.id}:${task.revision}`,
              slot ?? task.time_created,
            )
          : slot === undefined
            ? undefined
            : ScheduledTaskModel.slotIDs(task.id, slot)
      const claimed = {
        id: crypto.randomUUID(),
        task,
        sessionID: ids ? SessionV2.ID.make(ids.session) : SessionV2.ID.create(),
        messageID: ids ? SessionMessage.ID.make(ids.message) : SessionMessage.ID.create(),
        prompt: task.prompt,
      }
      yield* db
        .insert(ScheduledTaskRunTable)
        .values({
          id: claimed.id,
          task_id: task.id,
          slot: slot ?? null,
          revision: task.revision,
          manual_key: manualKey ?? null,
          state: "running",
          session_id: claimed.sessionID,
          message_id: claimed.messageID,
          prompt: claimed.prompt,
          owner: lease,
          time_claimed: now,
        })
        .run()
      return claimed
    })

    // Plans the task at `now` under the write lock. A skipped slot is recorded as missed, and a due slot is
    // claimed when no run holds it. `extra` (Run now) claims an extra run whenever the slot is not claimed.
    const begin = (id: ID, now: number, input: { directory?: AbsolutePath; extra: boolean }) =>
      immediate(
        Effect.gen(function* () {
          const task = yield* find(id, input.directory)
          if (!task) return { type: "missing" } as const
          if (task.policy === "capability") return yield* beginCapability(task, now)
          if (!legacy(task)) return { type: "idle" } as const
          const due = ScheduledTaskModel.plan(timing(task), now)
          if (due.type === "skip") yield* write(task, ScheduledTaskModel.skipRun(timing(task), due.slot, now), now)
          if (due.type === "run") {
            const held = yield* db
              .select({ state: ScheduledTaskRunTable.state })
              .from(ScheduledTaskRunTable)
              .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.slot, due.slot)))
              .get()
            if (!held) return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
            // A settled run of the slot the task points at means the slot was served before (the task was set
            // back to it); move past it without serving it again.
            if (held.state !== "running")
              yield* write(
                task,
                ScheduledTaskModel.recordRun(timing(task), { time: now, slot: due.slot, missed: due.missed }),
                now,
              )
          }
          if (input.extra) return { type: "claimed", claim: yield* claim(task, undefined, now) } as const
          return { type: "idle" } as const
        }),
      )

    // Capability planning under the write lock. A run moves `next` to the claimed slot, so the overtaken slots are
    // counted once even when a stopped claim is voided and the slot planned again.
    const beginCapability = Effect.fn("ScheduledTask.beginCapability")(function* (task: Task, now: number) {
      const timing = capabilityTiming(task)
      const due = ScheduledTaskCapabilityModel.plan(timing, now)
      if (due.type === "wait") return { type: "idle" } as const
      const skipped = task.skipped + due.skipped
      if (due.type === "skip") {
        yield* advance(task, { skipped, ...following(timing, now) }, now)
        return { type: "idle" } as const
      }
      const held = yield* db
        .select({ state: ScheduledTaskRunTable.state })
        .from(ScheduledTaskRunTable)
        .where(
          and(
            eq(ScheduledTaskRunTable.task_id, task.id),
            eq(ScheduledTaskRunTable.revision, task.revision),
            eq(ScheduledTaskRunTable.slot, due.slot),
          ),
        )
        .get()
      if (held?.state === "running") return { type: "idle" } as const
      // Served before (the schedule was set back to it): move past it without serving it again.
      if (held) {
        yield* advance(task, { skipped, ...following(timing, due.slot) }, now)
        return { type: "idle" } as const
      }
      yield* advance(task, { skipped, next: due.slot }, now)
      return { type: "claimed", claim: yield* claim(task, due.slot, now) } as const
    })

    const advance = (task: Task, set: Partial<Task>, now: number) =>
      db
        .update(ScheduledTaskTable)
        .set({ ...set, time_updated: now })
        .where(eq(ScheduledTaskTable.id, task.id))
        .run()

    // The path a user prompt takes: the Session (adopted when its ID exists), durable admission, then a wake.
    // Legacy runs are Maestro Sessions in the task's directory. A capability run uses its owner's agent and
    // placement, and only while the owner Session still exists there with that agent. `admitted` is a takeover
    // retrying a prompt that is already durable, which only reconciles and wakes.
    const dispatch = (claimed: Claim, admitted = false) =>
      Effect.gen(function* () {
        const owner = claimed.task.policy === "capability" ? claimed.task.owner : undefined
        if (claimed.task.policy === "capability" && !(owner && (yield* present(owner))))
          return { type: "revoked" } as const
        const session = yield* sessions.create({
          id: claimed.sessionID,
          agent: owner?.agentID ?? AgentV2.defaultID,
          location: owner?.location ?? { directory: claimed.task.directory },
        })
        // An edit, pause or removal since the claim voids it before admission. What remains is the window from this
        // read to the durable admission inside `sessions.prompt` (its prompt hooks included); a claim revoked in it
        // still settles with an honest `started` receipt.
        if (claimed.task.policy === "capability" && !admitted && !(yield* holds(claimed)))
          return { type: "void" } as const
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return { type: "started", sessionID: session.id } as const
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            // A capability prompt that was admitted before the failure (a wake that failed, say) did start.
            const durable =
              claimed.task.policy === "capability" ? yield* SessionInput.find(db, claimed.messageID) : undefined
            if (durable) return { type: "started", sessionID: durable.sessionID } as const
            return { type: "failed", error: reason(cause) } as const
          }),
        ),
      )

    const holds = (claimed: Claim) =>
      db
        .select({
          state: ScheduledTaskRunTable.state,
          lease: ScheduledTaskRunTable.owner,
          slot: ScheduledTaskRunTable.slot,
          claimed: ScheduledTaskRunTable.revision,
          revision: ScheduledTaskTable.revision,
          enabled: ScheduledTaskTable.enabled,
        })
        .from(ScheduledTaskRunTable)
        .innerJoin(ScheduledTaskTable, eq(ScheduledTaskTable.id, ScheduledTaskRunTable.task_id))
        .where(eq(ScheduledTaskRunTable.id, claimed.id))
        .get()
        .pipe(
          Effect.orDie,
          Effect.map(
            (row) =>
              row?.state === "running" &&
              row.lease === lease &&
              row.claimed === row.revision &&
              // A manual run may start while the schedule is paused.
              (row.enabled || row.slot === null),
          ),
        )

    const present = (owner: Capability.Owner) =>
      sessions.get(owner.sessionID).pipe(
        Effect.map(
          (session) =>
            session.projectID === owner.projectID &&
            session.location.directory === owner.location.directory &&
            session.location.workspaceID === owner.location.workspaceID &&
            session.agent === owner.agentID,
        ),
        Effect.catchTag("Session.NotFoundError", () => Effect.succeed(false)),
      )

    const settle = Effect.fn("ScheduledTask.settle")(function* (claimed: Claim, outcome: Outcome) {
      const now = yield* Clock.currentTimeMillis
      yield* immediate(
        Effect.gen(function* () {
          const run = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(eq(ScheduledTaskRunTable.id, claimed.id))
            .get()
          // A claim an edit revoked while its prompt was being admitted keeps an honest receipt; it never counts
          // toward repeat or moves `next`.
          if (run?.state === "revoked" && outcome.type === "started")
            return yield* db
              .update(ScheduledTaskRunTable)
              .set({ state: "started", session_id: outcome.sessionID, error: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          // Gone with its task, taken over after the lease ended (the new lease settles it), or revoked by an edit.
          if (run?.state !== "running" || run.owner !== lease) return
          if (outcome.type === "void")
            return yield* db.delete(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, run.id)).run()
          yield* db
            .update(ScheduledTaskRunTable)
            .set({
              state: outcome.type,
              error: outcome.type === "failed" ? outcome.error : null,
              owner: null,
              time_settled: now,
            })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          const task = yield* find(claimed.task.id)
          if (!task) return
          if (task.policy === "capability") yield* advance(task, settledCapability(task, run, outcome), now)
          if (legacy(task)) {
            // The task still points at (or before) the served slot unless it was rescheduled while the run
            // started; then the run counts as an extra run and the task keeps its new time.
            const slot = run.slot !== null && task.next <= run.slot ? run.slot : undefined
            const missed =
              slot !== undefined && task.cadence !== "once" && task.next < slot
                ? ScheduledTaskModel.previous(task, task.cadence, slot)
                : undefined
            // A failed slot is consumed like a run, so it is never retried; a failure leaves a rescheduled task alone.
            const advanced =
              outcome.type === "started" || slot !== undefined
                ? ScheduledTaskModel.recordRun(timing(task), { time: now, slot, missed })
                : timing(task)
            yield* advance(
              task,
              {
                next: advanced.next,
                enabled: advanced.enabled,
                missed: advanced.missed ?? null,
                runs: outcome.type === "started" ? task.runs + 1 : task.runs,
              },
              now,
            )
          }
          const kept = db
            .select({ id: ScheduledTaskRunTable.id })
            .from(ScheduledTaskRunTable)
            .where(and(eq(ScheduledTaskRunTable.task_id, task.id), ne(ScheduledTaskRunTable.state, "running")))
            .orderBy(desc(ScheduledTaskRunTable.time_settled))
            .limit(KEEP)
          yield* db
            .delete(ScheduledTaskRunTable)
            .where(
              and(
                eq(ScheduledTaskRunTable.task_id, task.id),
                ne(ScheduledTaskRunTable.state, "running"),
                notInArray(ScheduledTaskRunTable.id, kept),
              ),
            )
            .run()
        }),
      )
    })

    const serve = Effect.fn("ScheduledTask.serve")(function* (id: ID, now: number) {
      const begun = yield* begin(id, now, { extra: false })
      if (begun.type !== "claimed") return
      yield* settle(begun.claim, yield* dispatch(begun.claim))
    })

    // Only a claim whose prompt was admitted happened. It is finished with the exact retry a client would send,
    // which reconciles the admitted prompt and wakes the Session. A claim that never reached admission is void,
    // and its slot is planned again.
    const takeOver = Effect.fn("ScheduledTask.takeOver")(function* (stale: RunRow, now: number) {
      const claimed = yield* immediate(
        Effect.gen(function* () {
          const run = yield* db.select().from(ScheduledTaskRunTable).where(eq(ScheduledTaskRunTable.id, stale.id)).get()
          if (run?.state !== "running" || run.owner !== stale.owner || run.time_claimed !== stale.time_claimed) return
          const task = yield* find(run.task_id)
          if (!task || !run.message_id || run.prompt === null) return
          yield* db
            .update(ScheduledTaskRunTable)
            .set({ owner: lease, time_claimed: now })
            .where(eq(ScheduledTaskRunTable.id, run.id))
            .run()
          return {
            id: run.id,
            task,
            sessionID: run.session_id,
            messageID: run.message_id,
            prompt: run.prompt,
          }
        }),
      )
      if (!claimed) return
      const admitted = yield* SessionInput.find(db, claimed.messageID)
      if (!admitted) return yield* settle(claimed, { type: "void" })
      const retried = yield* dispatch(claimed, true)
      if (retried.type !== "started") yield* Effect.logWarning("Scheduled run retry failed", retried)
      yield* settle(claimed, { type: "started", sessionID: admitted.sessionID })
    })

    const tick = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const stale = yield* db
        .select()
        .from(ScheduledTaskRunTable)
        .where(and(eq(ScheduledTaskRunTable.state, "running"), lt(ScheduledTaskRunTable.time_claimed, now - LEASE)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stale, (run) => takeOver(run, now).pipe(Effect.catchCause(logFailure)), { discard: true })
      const due = yield* db
        .select({ id: ScheduledTaskTable.id })
        .from(ScheduledTaskTable)
        .where(and(eq(ScheduledTaskTable.enabled, true), lte(ScheduledTaskTable.next, now)))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(due, (task) => serve(task.id, now).pipe(Effect.catchCause(logFailure)), { discard: true })
    }).pipe(Effect.withSpan("ScheduledTask.tick"))

    // Runs `edit` on the owner's schedule under the write lock, then reads it back. Errors come back as values so
    // the transaction commits only what the edit wrote.
    const change = <E extends InvalidError>(
      owner: Capability.Owner,
      id: ID,
      edit: (task: Task, now: number) => Effect.Effect<E | undefined, unknown>,
    ) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const failed = yield* immediate(
          Effect.gen(function* () {
            const task = yield* owned(owner, id)
            if (!task) return new NotFoundError({ id })
            return yield* edit(task, now)
          }),
        )
        if (failed) return yield* failed
        return yield* getOwned(owner, id)
      })

    // Marks the task's running claims in `scope` whose prompt was never admitted as revoked.
    const revoke = (task: Task, now: number, scope: SQL) =>
      Effect.gen(function* () {
        const pending = yield* db
          .select()
          .from(ScheduledTaskRunTable)
          .where(and(eq(ScheduledTaskRunTable.task_id, task.id), eq(ScheduledTaskRunTable.state, "running"), scope))
          .all()
        yield* Effect.forEach(
          pending,
          (run) =>
            Effect.gen(function* () {
              if (run.message_id && (yield* SessionInput.find(db, run.message_id))) return
              yield* db
                .update(ScheduledTaskRunTable)
                .set({ state: "revoked", owner: null, time_settled: now })
                .where(eq(ScheduledTaskRunTable.id, run.id))
                .run()
            }),
          { discard: true },
        )
      })

    const capability: Interface["capability"] = {
      create: Effect.fn("ScheduledTask.capability.create")(function* (owner, input) {
        const now = yield* Clock.currentTimeMillis
        const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        const catchUp = input.catchUp ?? "latest"
        const enabled = input.enabled ?? true
        const next = firstSlot({ cadence: input.cadence, timezone, catchUp, enabled }, now)
        if (typeof next !== "number") return yield* next
        const id = ID.create()
        yield* db
          .insert(ScheduledTaskTable)
          .values({
            id,
            directory: owner.location.directory,
            name: input.name,
            prompt: input.prompt,
            ...encode(input.cadence),
            timezone,
            next,
            enabled,
            runs: 0,
            policy: "capability",
            owner,
            catch_up: catchUp,
            repeat_limit: input.repeat ?? null,
            time_created: now,
            time_updated: now,
          })
          .run()
          .pipe(Effect.orDie)
        return yield* getOwned(owner, id).pipe(Effect.orDie)
      }),
      list: Effect.fn("ScheduledTask.capability.list")(function* (owner) {
        const tasks = yield* db
          .select()
          .from(ScheduledTaskTable)
          .where(
            and(
              eq(ScheduledTaskTable.directory, owner.location.directory),
              eq(ScheduledTaskTable.policy, "capability"),
            ),
          )
          .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
          .all()
          .pipe(Effect.orDie)
        return yield* schedules(tasks.filter((task) => sameOwner(task, owner)))
      }),
      get: getOwned,
      update: (owner, id, input) =>
        change(owner, id, (task, now) =>
          Effect.gen(function* () {
            const current = capabilityTiming(task)
            const cadence = input.cadence ?? current.cadence
            const timezone = input.timezone ?? task.timezone
            const catchUp = input.catchUp ?? current.catchUp
            const next = firstSlot({ cadence, timezone, catchUp, enabled: task.enabled }, now)
            if (typeof next !== "number") return next
            const revision = task.revision + 1
            const repeat = input.repeat === undefined ? task.repeat_limit : input.repeat
            // A limit at or below the runs already admitted exhausts the schedule now.
            const exhausted = repeat !== null && task.runs >= repeat
            yield* advance(
              task,
              {
                ...(exhausted ? { enabled: false, disabled_reason: "exhausted" as const } : {}),
                name: input.name ?? task.name,
                prompt: input.prompt ?? task.prompt,
                ...encode(cadence),
                timezone,
                catch_up: catchUp,
                repeat_limit: repeat,
                next,
                revision,
              },
              now,
            )
            // Unstarted claims of older revisions never admit their prompt; an admitted one keeps its receipt.
            yield* revoke(task, now, lt(ScheduledTaskRunTable.revision, revision))
          }),
        ),
      // Pausing revokes unstarted slot claims; a manual run may still start while paused.
      pause: (owner, id) =>
        change<never>(owner, id, (task, now) =>
          Effect.gen(function* () {
            yield* advance(task, { enabled: false }, now)
            yield* revoke(task, now, isNotNull(ScheduledTaskRunTable.slot))
            return undefined
          }),
        ),
      resume: (owner, id) =>
        change(owner, id, (task, now) =>
          Effect.gen(function* () {
            if (task.enabled) return
            if (task.repeat_limit !== null && task.runs >= task.repeat_limit)
              return new InvalidError({
                field: "repeat",
                message: "The schedule used all its runs; raise repeat first.",
              })
            const next = firstSlot({ ...capabilityTiming(task), enabled: true }, now)
            if (typeof next !== "number") return next
            yield* advance(task, { enabled: true, disabled_reason: null, next }, now)
          }),
        ),
      remove: Effect.fn("ScheduledTask.capability.remove")(function* (owner, id) {
        const removed = yield* immediate(
          Effect.gen(function* () {
            if (!(yield* owned(owner, id))) return false
            yield* db.delete(ScheduledTaskTable).where(eq(ScheduledTaskTable.id, id)).run()
            return true
          }),
        )
        if (!removed) return yield* new NotFoundError({ id })
      }),
      run: Effect.fn("ScheduledTask.capability.run")(function* (owner, id, manualKey) {
        const now = yield* Clock.currentTimeMillis
        const begun = yield* immediate(
          Effect.gen(function* () {
            const task = yield* owned(owner, id)
            if (!task) return { type: "missing" } as const
            const prior = yield* db
              .select()
              .from(ScheduledTaskRunTable)
              .where(and(eq(ScheduledTaskRunTable.task_id, id), eq(ScheduledTaskRunTable.manual_key, manualKey)))
              .get()
            if (prior) return { type: "prior", run: prior } as const
            return { type: "claimed", claim: yield* claim(task, undefined, now, manualKey) } as const
          }),
        )
        if (begun.type === "missing") return yield* new NotFoundError({ id })
        if (begun.type === "prior") {
          if (begun.run.state === "revoked") return yield* new RunError({ reason: begun.run.error ?? "revoked" })
          // A claim still starting elsewhere (or stopped before its lease ended) is reused only once admitted.
          const admitted = begun.run.message_id && (yield* SessionInput.find(db, begun.run.message_id))
          if (begun.run.state === "running" && !admitted)
            return yield* new RunError({ reason: "This run is still starting; retry shortly." })
          return { sessionID: begun.run.session_id, reused: true }
        }
        const outcome = yield* dispatch(begun.claim)
        if (outcome.type === "started") {
          yield* settle(begun.claim, outcome)
          return { sessionID: outcome.sessionID, reused: false }
        }
        // Nothing was admitted, so the same call may retry; a missing owner disables the schedule.
        yield* settle(begun.claim, outcome.type === "revoked" ? outcome : { type: "void" })
        return yield* new RunError({
          reason:
            outcome.type === "failed"
              ? outcome.error
              : outcome.type === "void"
                ? "The schedule changed before the run started."
                : "owner-missing",
        })
      }),
    }

    return Service.of({
      list: Effect.fn("ScheduledTask.list")(function* (directory) {
        const tasks = yield* db
          .select()
          .from(ScheduledTaskTable)
          .where(and(eq(ScheduledTaskTable.directory, directory), LEGACY))
          .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
          .all()
          .pipe(Effect.orDie)
        return yield* infos(tasks.filter(legacy))
      }),
      create: Effect.fn("ScheduledTask.create")(function* (directory, input) {
        if (!ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const id = input.id ?? ID.create()
        const last = input.history?.last
        const existing = yield* immediate(
          Effect.gen(function* () {
            const current = yield* find(id)
            if (current) return current
            yield* db
              .insert(ScheduledTaskTable)
              .values({
                id,
                directory,
                name: input.name,
                prompt: input.prompt,
                cadence: input.cadence,
                timezone: input.timezone,
                minute: input.minute ?? ScheduledTaskModel.localMinute(input.next, input.timezone),
                next: input.next,
                enabled: input.enabled ?? true,
                runs: input.history?.runs ?? 0,
                missed: input.history?.missed ?? null,
                time_created: now,
                time_updated: now,
              })
              .run()
            if (last)
              yield* db
                .insert(ScheduledTaskRunTable)
                .values({
                  id: crypto.randomUUID(),
                  task_id: id,
                  state: "started",
                  session_id: last.sessionID,
                  time_claimed: last.time,
                  time_settled: last.time,
                })
                .run()
          }),
        )
        // Reusing an ID adopts the task it names, unchanged; an ID from another directory is a conflict.
        if (existing && existing.directory !== directory) return yield* new ConflictError({ id })
        return yield* get(directory, id).pipe(Effect.orDie)
      }),
      update: Effect.fn("ScheduledTask.update")(function* (directory, id, input) {
        if (input.timezone !== undefined && !ScheduledTaskModel.validZone(input.timezone))
          return yield* new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
        const now = yield* Clock.currentTimeMillis
        const result = yield* immediate(
          Effect.gen(function* () {
            const task = yield* find(id, directory)
            if (!task || !legacy(task)) return "missing" as const
            const timed = input.next !== undefined || input.timezone !== undefined || input.cadence !== undefined
            const next = input.next ?? task.next
            const timezone = input.timezone ?? task.timezone
            const edited = {
              ...timing(task),
              cadence: input.cadence ?? task.cadence,
              timezone,
              next,
              // A new time re-anchors the time of day and clears the missed slot, as saving the editor does.
              ...(timed ? { minute: ScheduledTaskModel.localMinute(next, timezone), missed: undefined } : {}),
            }
            const enabled = toggle(edited, input.enabled, input.next !== undefined, now)
            if (!enabled) return "past" as const
            yield* db
              .update(ScheduledTaskTable)
              .set({
                name: input.name ?? task.name,
                prompt: input.prompt ?? task.prompt,
                cadence: enabled.cadence,
                timezone: enabled.timezone,
                minute: enabled.minute,
                next: enabled.next,
                enabled: enabled.enabled,
                missed: enabled.missed ?? null,
                time_updated: now,
              })
              .where(eq(ScheduledTaskTable.id, id))
              .run()
            return "updated" as const
          }),
        )
        if (result === "missing") return yield* new NotFoundError({ id })
        if (result === "past")
          return yield* new InvalidError({ field: "next", message: "A one-off task needs a future time to resume." })
        return yield* get(directory, id)
      }),
      remove: Effect.fn("ScheduledTask.remove")(function* (directory, id) {
        const removed = yield* db
          .delete(ScheduledTaskTable)
          .where(and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory), LEGACY))
          .returning({ id: ScheduledTaskTable.id })
          .all()
          .pipe(Effect.orDie)
        if (removed.length === 0) return yield* new NotFoundError({ id })
      }),
      run: Effect.fn("ScheduledTask.run")(function* (directory, id) {
        const begun = yield* begin(id, yield* Clock.currentTimeMillis, { directory, extra: true })
        if (begun.type !== "claimed") return yield* new NotFoundError({ id })
        const outcome = yield* dispatch(begun.claim)
        if (outcome.type !== "started") {
          yield* settle(begun.claim, { type: "void" })
          return yield* new RunError({ reason: outcome.type === "failed" ? outcome.error : "owner-missing" })
        }
        yield* settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID }
      }),
      tick,
      capability,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, SessionV2.node] })

/** Serves due slots on the server whether or not any client is open, starting with a pass at boot. */
export const daemonNode = makeGlobalNode({
  name: "scheduled-task-daemon",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tasks = yield* Service
      // A failed pass (the database was busy, say) must not stop later passes.
      yield* tasks.tick.pipe(Effect.catchCause(logFailure), Effect.repeat(Schedule.spaced(TICK)), Effect.forkScoped)
    }),
  ),
  deps: [node],
})

const LEGACY = eq(ScheduledTaskTable.policy, "legacy-browser")

function legacy(task: Task): task is LegacyTask {
  return task.policy === "legacy-browser" && task.cadence !== "interval" && task.cadence !== "cron"
}

function sameOwner(task: Task, owner: Capability.Owner) {
  const stored = task.policy === "capability" ? task.owner : null
  return (
    stored !== null &&
    stored.sessionID === owner.sessionID &&
    stored.agentID === owner.agentID &&
    stored.projectID === owner.projectID &&
    stored.location.directory === owner.location.directory &&
    stored.location.workspaceID === owner.location.workspaceID
  )
}

// Storage of a capability cadence: once keeps its time in `next`; weekly packs `day * 1440 + minute of day`.
function encode(cadence: CapabilityScheduleContract.Cadence) {
  const columns = { minute: 0, interval_minutes: null, cron: null }
  if (cadence.kind === "interval")
    return { ...columns, cadence: "interval" as const, interval_minutes: cadence.minutes }
  if (cadence.kind === "daily") return { ...columns, cadence: "daily" as const, minute: clockMinute(cadence.time) }
  if (cadence.kind === "weekly")
    return { ...columns, cadence: "weekly" as const, minute: cadence.day * 1440 + clockMinute(cadence.time) }
  if (cadence.kind === "cron") return { ...columns, cadence: "cron" as const, cron: cadence.expression }
  return { ...columns, cadence: "once" as const }
}

function decode(task: Task): CapabilityScheduleContract.Cadence {
  const time = clock(task.minute % 1440)
  if (task.cadence === "interval") return { kind: "interval", minutes: task.interval_minutes ?? 0 }
  if (task.cadence === "daily") return { kind: "daily", time }
  if (task.cadence === "weekly") return { kind: "weekly", day: Math.floor(task.minute / 1440), time }
  if (task.cadence === "cron") return { kind: "cron", expression: task.cron ?? "" }
  return { kind: "once", at: task.next }
}

function capabilityTiming(task: Task): ScheduledTaskCapabilityModel.Timing {
  return {
    cadence: decode(task),
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    catchUp: task.catch_up ?? "latest",
  }
}

// The first slot of a new or edited definition; an enabled once must lie ahead. Errors come back as values.
function firstSlot(input: Omit<ScheduledTaskCapabilityModel.Timing, "next">, now: number): number | InvalidError {
  if (!ScheduledTaskModel.validZone(input.timezone))
    return new InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
  if (input.cadence.kind === "cron" && !ScheduledTaskCapabilityModel.parseCron(input.cadence.expression))
    return new InvalidError({ field: "cadence", message: `Invalid cron expression: ${input.cadence.expression}` })
  if (input.cadence.kind === "once")
    return input.enabled && input.cadence.at <= now
      ? new InvalidError({ field: "cadence", message: "A one-off schedule needs a future time." })
      : input.cadence.at
  return (
    ScheduledTaskCapabilityModel.nextAfter({ ...input, next: now }, now) ??
    new InvalidError({ field: "cadence", message: "The cadence never fires." })
  )
}

// The slot after `after`, or disabled once none is left (a once that ran or was skipped).
function following(timing: ScheduledTaskCapabilityModel.Timing, after: number) {
  const next = ScheduledTaskCapabilityModel.nextAfter(timing, after)
  return next === undefined ? { enabled: false } : { next }
}

// A settled capability claim. Manual runs never move the schedule or count. A slot counts once its prompt was
// admitted; a failed slot is consumed, never retried. An edit since the claim already recomputed `next`.
function settledCapability(task: Task, run: RunRow, outcome: Outcome): Partial<Task> {
  if (outcome.type === "revoked") return { enabled: false, disabled_reason: "owner-missing" }
  if (run.slot === null) return {}
  const runs = outcome.type === "started" ? task.runs + 1 : task.runs
  const moved =
    run.revision === task.revision && task.next <= run.slot ? following(capabilityTiming(task), run.slot) : {}
  if (task.repeat_limit !== null && runs >= task.repeat_limit)
    return { runs, ...moved, enabled: false, disabled_reason: "exhausted" }
  return { runs, ...moved }
}

function toSchedule(task: Task, run: RunRow | undefined): Schedule {
  return {
    id: task.id,
    revision: task.revision,
    name: task.name,
    prompt: task.prompt,
    cadence: decode(task),
    timezone: task.timezone,
    catchUp: task.catch_up ?? "latest",
    ...(task.repeat_limit === null ? {} : { repeat: task.repeat_limit }),
    enabled: task.enabled,
    ...(task.disabled_reason === null ? {} : { disabledReason: task.disabled_reason }),
    ...(task.enabled ? { next: task.next } : {}),
    runs: task.runs,
    skipped: task.skipped,
    ...(run ? { last: toRun(run) } : {}),
  }
}

function clockMinute(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

function timing(task: LegacyTask): ScheduledTaskModel.Timing {
  return {
    cadence: task.cadence,
    minute: task.minute,
    timezone: task.timezone,
    next: task.next,
    enabled: task.enabled,
    missed: task.missed ?? undefined,
  }
}

// Turning a task on: a new time resumes it as given, a recurring task rolls to its next future slot, and a
// one-off whose time passed cannot resume (`undefined`).
function toggle(task: ScheduledTaskModel.Timing, enabled: boolean | undefined, retimed: boolean, now: number) {
  if (enabled === undefined || enabled === task.enabled) return task
  if (!enabled || retimed) return { ...task, enabled }
  if (!ScheduledTaskModel.canResume(task, now)) return undefined
  return ScheduledTaskModel.resume(task, now)
}

function toInfo(task: LegacyTask, run: RunRow | undefined): Info {
  return {
    id: task.id,
    name: task.name,
    prompt: task.prompt,
    cadence: task.cadence,
    timezone: task.timezone,
    minute: task.minute,
    next: task.next,
    enabled: task.enabled,
    runs: task.runs,
    ...(task.missed === null ? {} : { missed: task.missed }),
    ...(run ? { last: toRun(run) } : {}),
  }
}

function toRun(run: RunRow): ScheduledTask.Run {
  const time = run.time_settled ?? run.time_claimed
  const slot = run.slot === null ? {} : { slot: run.slot }
  if (run.state === "failed") return { outcome: "failed", time, ...slot, error: run.error ?? "" }
  return { outcome: "started", time, ...slot, sessionID: run.session_id }
}

// The failure as the page shows it.
function reason(cause: Cause.Cause<unknown>) {
  const error = Cause.squash(cause)
  if (error instanceof SessionV2.PromptConflictError)
    return `Prompt ${error.messageID} conflicts with an earlier prompt in ${error.sessionID}`
  if (error instanceof SessionV2.NotFoundError) return `Session not found: ${error.sessionID}`
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

function logFailure(cause: Cause.Cause<unknown>) {
  return Effect.logError("Scheduled task failed", cause)
}

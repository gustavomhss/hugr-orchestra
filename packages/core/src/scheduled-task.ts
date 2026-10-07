export * as ScheduledTask from "./scheduled-task"

import { and, asc, desc, eq, inArray, lt, lte, ne, notInArray } from "drizzle-orm"
import { Cause, Clock, Context, Duration, Effect, Exit, Layer, Schedule, Schema } from "effect"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { AgentV2 } from "./agent"
import { Database } from "./database/database"
import { makeGlobalNode } from "./effect/app-node"
import { AbsolutePath } from "./schema"
import { SessionV2 } from "./session"
import { SessionInput } from "./session/input"
import { SessionMessage } from "./session/message"
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
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/ScheduledTask") {}

type Task = typeof ScheduledTaskTable.$inferSelect
type RunRow = typeof ScheduledTaskRunTable.$inferSelect
type Claim = {
  readonly id: string
  readonly task: Task
  readonly sessionID: SessionV2.ID
  readonly messageID: SessionMessage.ID
  readonly prompt: string
}
type Outcome = { type: "started"; sessionID: SessionV2.ID } | { type: "failed"; error: string } | { type: "void" }

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const sessions = yield* SessionV2.Service
    // Marks this process's claims. A restarted process takes its old claims over once their lease ends.
    const owner = crypto.randomUUID()
    const immediate = <A, E>(effect: Effect.Effect<A, E>) =>
      db.transaction(() => effect, { behavior: "immediate" }).pipe(Effect.orDie)

    const find = (id: ID, directory?: AbsolutePath) =>
      db
        .select()
        .from(ScheduledTaskTable)
        .where(
          directory
            ? and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory))
            : eq(ScheduledTaskTable.id, id),
        )
        .get()

    const infos = Effect.fn("ScheduledTask.infos")(function* (tasks: Task[]) {
      const runs =
        tasks.length === 0
          ? []
          : yield* db
              .select()
              .from(ScheduledTaskRunTable)
              .where(
                and(
                  inArray(
                    ScheduledTaskRunTable.task_id,
                    tasks.map((task) => task.id),
                  ),
                  ne(ScheduledTaskRunTable.state, "running"),
                ),
              )
              .orderBy(desc(ScheduledTaskRunTable.time_settled))
              .all()
              .pipe(Effect.orDie)
      return tasks.map((task) =>
        toInfo(
          task,
          runs.find((run) => run.task_id === task.id),
        ),
      )
    })

    const get = Effect.fn("ScheduledTask.get")(function* (directory: AbsolutePath, id: ID) {
      const task = yield* find(id, directory).pipe(Effect.orDie)
      if (!task) return yield* new NotFoundError({ id })
      return (yield* infos([task]))[0]!
    })

    const write = (task: Task, timing: ScheduledTaskModel.Timing, now: number) =>
      db
        .update(ScheduledTaskTable)
        .set({ next: timing.next, enabled: timing.enabled, missed: timing.missed ?? null, time_updated: now })
        .where(eq(ScheduledTaskTable.id, task.id))
        .run()

    const claim = Effect.fn("ScheduledTask.claim")(function* (task: Task, slot: number | undefined, now: number) {
      const ids = slot === undefined ? undefined : ScheduledTaskModel.slotIDs(task.id, slot)
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
          state: "running",
          session_id: claimed.sessionID,
          message_id: claimed.messageID,
          prompt: claimed.prompt,
          owner,
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

    // The path a user prompt takes: the Session (adopted when its ID exists), durable admission, then a wake.
    // The user talks only to Maestro, so every scheduled run is a Maestro Session, like every chat.
    const dispatch = (claimed: Claim) =>
      Effect.gen(function* () {
        const session = yield* sessions.create({
          id: claimed.sessionID,
          agent: AgentV2.defaultID,
          location: { directory: claimed.task.directory },
        })
        yield* sessions.prompt({ id: claimed.messageID, sessionID: session.id, prompt: { text: claimed.prompt } })
        return session.id
      }).pipe(Effect.exit)

    const settle = Effect.fn("ScheduledTask.settle")(function* (claimed: Claim, outcome: Outcome) {
      const now = yield* Clock.currentTimeMillis
      yield* immediate(
        Effect.gen(function* () {
          const run = yield* db
            .select()
            .from(ScheduledTaskRunTable)
            .where(eq(ScheduledTaskRunTable.id, claimed.id))
            .get()
          // Gone with its task, or taken over after the lease ended: the new owner settles it.
          if (run?.state !== "running" || run.owner !== owner) return
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
          // The task still points at (or before) the served slot unless it was rescheduled while the run started;
          // then the run counts as an extra run and the task keeps its new time.
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
          yield* db
            .update(ScheduledTaskTable)
            .set({
              next: advanced.next,
              enabled: advanced.enabled,
              missed: advanced.missed ?? null,
              runs: outcome.type === "started" ? task.runs + 1 : task.runs,
              time_updated: now,
            })
            .where(eq(ScheduledTaskTable.id, task.id))
            .run()
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
      const exit = yield* dispatch(begun.claim)
      yield* settle(
        begun.claim,
        Exit.isSuccess(exit)
          ? { type: "started", sessionID: exit.value }
          : { type: "failed", error: reason(exit.cause) },
      )
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
            .set({ owner, time_claimed: now })
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
      const exit = yield* dispatch(claimed)
      if (Exit.isFailure(exit)) yield* Effect.logWarning("Scheduled run retry failed", exit.cause)
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

    return Service.of({
      list: Effect.fn("ScheduledTask.list")(function* (directory) {
        const tasks = yield* db
          .select()
          .from(ScheduledTaskTable)
          .where(eq(ScheduledTaskTable.directory, directory))
          .orderBy(asc(ScheduledTaskTable.time_created), asc(ScheduledTaskTable.id))
          .all()
          .pipe(Effect.orDie)
        return yield* infos(tasks)
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
            if (!task) return "missing" as const
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
          .where(and(eq(ScheduledTaskTable.id, id), eq(ScheduledTaskTable.directory, directory)))
          .returning({ id: ScheduledTaskTable.id })
          .all()
          .pipe(Effect.orDie)
        if (removed.length === 0) return yield* new NotFoundError({ id })
      }),
      run: Effect.fn("ScheduledTask.run")(function* (directory, id) {
        const begun = yield* begin(id, yield* Clock.currentTimeMillis, { directory, extra: true })
        if (begun.type !== "claimed") return yield* new NotFoundError({ id })
        const exit = yield* dispatch(begun.claim)
        if (Exit.isFailure(exit)) {
          yield* settle(begun.claim, { type: "void" })
          return yield* new RunError({ reason: reason(exit.cause) })
        }
        yield* settle(begun.claim, { type: "started", sessionID: exit.value })
        return { sessionID: exit.value }
      }),
      tick,
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

function timing(task: Task): ScheduledTaskModel.Timing {
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

function toInfo(task: Task, run: RunRow | undefined): Info {
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

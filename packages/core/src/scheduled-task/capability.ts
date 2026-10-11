export * as ScheduledTaskCapability from "./capability"

import { and, asc, eq, isNotNull, lt, type SQL } from "drizzle-orm"
import { Clock, Effect } from "effect"
import type { Capability } from "@orchestra/schema/capability"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import type { CapabilityScheduleContract } from "../capability/schedule/contract"
import type { SessionV2 } from "../session"
import { SessionInput } from "../session/input"
import { ScheduledTaskCapabilityModel } from "./capability-model"
import { ScheduledTaskModel } from "./model"
import { ScheduledTaskShared } from "./shared"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "./sql"

type ID = ScheduledTask.ID
type Task = ScheduledTaskShared.Task
type RunRow = ScheduledTaskShared.RunRow
type Claim = ScheduledTaskShared.Claim
type Outcome = ScheduledTaskShared.Outcome

export type Schedule = CapabilityScheduleContract.Schedule
type Definition<Action> = Omit<Extract<CapabilityScheduleContract.Input, { action: Action }>, "action" | "id">
export type CapabilityCreate = Definition<"create">
export type CapabilityUpdate = Definition<"update">

/**
 * Capability schedules (schedule_manage). Every call is scoped to `owner`: a schedule owned by anyone else
 * is NotFound, exactly like an unknown ID. The legacy methods never see these rows.
 */
export interface Interface {
  readonly create: (
    owner: Capability.Owner,
    input: CapabilityCreate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.InvalidError>
  readonly list: (owner: Capability.Owner) => Effect.Effect<Schedule[]>
  readonly get: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Bumps the revision, recomputes `next`, and revokes claims of older revisions not yet admitted. */
  readonly update: (
    owner: Capability.Owner,
    id: ID,
    input: CapabilityUpdate,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly pause: (owner: Capability.Owner, id: ID) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError>
  /** Rolls to the next future slot; a past once or an exhausted repeat cannot resume. */
  readonly resume: (
    owner: Capability.Owner,
    id: ID,
  ) => Effect.Effect<Schedule, ScheduledTaskShared.NotFoundError | ScheduledTaskShared.InvalidError>
  readonly remove: (owner: Capability.Owner, id: ID) => Effect.Effect<void, ScheduledTaskShared.NotFoundError>
  /** Manual run deduped on `manualKey`: a retry returns the same Session. Never moves `next` or counts. */
  readonly run: (
    owner: Capability.Owner,
    id: ID,
    manualKey: string,
  ) => Effect.Effect<
    { sessionID: SessionV2.ID; reused: boolean },
    ScheduledTaskShared.NotFoundError | ScheduledTaskShared.RunError
  >
}

// Capability halves of the Service layer. `plan`, `holds` and `present` serve the shared claim, dispatch and
// settle path; `api` builds the public methods once that path exists.
export function make(store: ScheduledTaskShared.Store, sessions: SessionV2.Interface) {
  const { db, lease, immediate, find, lastRuns, advance, claim } = store

  const owned = (owner: Capability.Owner, id: ID) =>
    find(id).pipe(Effect.map((task) => (task && sameOwner(task, owner) ? task : undefined)))

  const schedules = Effect.fn("ScheduledTask.schedules")(function* (tasks: Task[]) {
    const runs = yield* lastRuns(tasks)
    return tasks.map((task) =>
      toSchedule(
        task,
        runs.find((run) => run.task_id === task.id),
      ),
    )
  })

  const getOwned = Effect.fn("ScheduledTask.getOwned")(function* (owner: Capability.Owner, id: ID) {
    const task = yield* owned(owner, id).pipe(Effect.orDie)
    if (!task) return yield* new ScheduledTaskShared.NotFoundError({ id })
    return (yield* schedules([task]))[0]!
  })

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

  // Runs `edit` on the owner's schedule under the write lock, then reads it back. Errors come back as values so
  // the transaction commits only what the edit wrote.
  const change = <E extends ScheduledTaskShared.InvalidError>(
    owner: Capability.Owner,
    id: ID,
    edit: (task: Task, now: number) => Effect.Effect<E | undefined, unknown>,
  ) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const failed = yield* immediate(
        Effect.gen(function* () {
          const task = yield* owned(owner, id)
          if (!task) return new ScheduledTaskShared.NotFoundError({ id })
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
              .set({ state: "revoked", error: "revoked by an edit", owner: null, time_settled: now })
              .where(eq(ScheduledTaskRunTable.id, run.id))
              .run()
          }),
        { discard: true },
      )
    })

  // The public methods, over the shared dispatch and settle path.
  const api = (ops: {
    dispatch: (claimed: Claim) => Effect.Effect<Outcome>
    settle: (claimed: Claim, outcome: Outcome) => Effect.Effect<void>
  }): Interface => ({
    create: Effect.fn("ScheduledTask.capability.create")(function* (owner, input) {
      const now = yield* Clock.currentTimeMillis
      const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      const catchUp = input.catchUp ?? "latest"
      const enabled = input.enabled ?? true
      const next = firstSlot({ cadence: input.cadence, timezone, catchUp, enabled }, now)
      if (typeof next !== "number") return yield* next
      const id = ScheduledTask.ID.create()
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
          and(eq(ScheduledTaskTable.directory, owner.location.directory), eq(ScheduledTaskTable.policy, "capability")),
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
            return new ScheduledTaskShared.InvalidError({
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
      if (!removed) return yield* new ScheduledTaskShared.NotFoundError({ id })
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
      if (begun.type === "missing") return yield* new ScheduledTaskShared.NotFoundError({ id })
      if (begun.type === "prior") {
        // A revoked manual claim stays revoked: the same call never runs, a new call (new key) may.
        if (begun.run.state === "revoked")
          return yield* new ScheduledTaskShared.RunError({
            reason: `${begun.run.error ?? "revoked"}; retrying the same call will not run`,
          })
        // A claim still starting elsewhere (or stopped before its lease ended) is reused only once admitted.
        const admitted = begun.run.message_id && (yield* SessionInput.find(db, begun.run.message_id))
        if (begun.run.state === "running" && !admitted)
          return yield* new ScheduledTaskShared.RunError({ reason: "This run is still starting; retry shortly." })
        return { sessionID: begun.run.session_id, reused: true }
      }
      const outcome = yield* ops.dispatch(begun.claim)
      if (outcome.type === "started") {
        yield* ops.settle(begun.claim, outcome)
        return { sessionID: outcome.sessionID, reused: false }
      }
      // Nothing was admitted, so the same call may retry; a missing owner disables the schedule.
      yield* ops.settle(begun.claim, outcome.type === "revoked" ? outcome : { type: "void" })
      return yield* new ScheduledTaskShared.RunError({
        reason:
          outcome.type === "failed"
            ? outcome.error
            : outcome.type === "void"
              ? "The schedule changed before the run started."
              : "owner-missing",
      })
    }),
  })

  return { plan: beginCapability, holds, present, api }
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
function firstSlot(
  input: Omit<ScheduledTaskCapabilityModel.Timing, "next">,
  now: number,
): number | ScheduledTaskShared.InvalidError {
  if (!ScheduledTaskModel.validZone(input.timezone))
    return new ScheduledTaskShared.InvalidError({ field: "timezone", message: `Unknown time zone: ${input.timezone}` })
  if (input.cadence.kind === "cron" && !ScheduledTaskCapabilityModel.parseCron(input.cadence.expression))
    return new ScheduledTaskShared.InvalidError({
      field: "cadence",
      message: `Invalid cron expression: ${input.cadence.expression}`,
    })
  if (input.cadence.kind === "once")
    return input.enabled && input.cadence.at <= now
      ? new ScheduledTaskShared.InvalidError({ field: "cadence", message: "A one-off schedule needs a future time." })
      : input.cadence.at
  return (
    ScheduledTaskCapabilityModel.nextAfter({ ...input, next: now }, now) ??
    new ScheduledTaskShared.InvalidError({ field: "cadence", message: "The cadence never fires." })
  )
}

// The slot after `after`, or disabled once none is left (a once that ran or was skipped).
function following(timing: ScheduledTaskCapabilityModel.Timing, after: number) {
  const next = ScheduledTaskCapabilityModel.nextAfter(timing, after)
  return next === undefined ? { enabled: false } : { next }
}

// A settled capability claim. Manual runs never move the schedule or count. A slot counts once its prompt was
// admitted; a failed slot is consumed, never retried. An edit since the claim already recomputed `next`.
export function settledCapability(task: Task, run: RunRow, outcome: Outcome): Partial<Task> {
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
    ...(run ? { last: ScheduledTaskShared.toRun(run) } : {}),
  }
}

function clockMinute(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function clock(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}

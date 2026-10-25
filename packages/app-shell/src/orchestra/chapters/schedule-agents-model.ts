import { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { Option, Schema } from "effect"
import { getOwner, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"

// The "Created by agents" section of the schedule chapter. The user's own schedules keep schedule-model.ts and
// schedule-server.ts; this model only reads and manages schedules an agent made with schedule_manage. Create and
// edit stay with the owning agent, so the operator surface is pause, resume, run now and delete.

export type Item = CapabilityScheduleManagement.Item
export type Schedule = CapabilityScheduleManagement.Schedule
export type Options = Readonly<{ signal?: AbortSignal }>
export type Api = Readonly<{
  list: (options?: Options) => Promise<CapabilityScheduleManagement.Page>
  pause: (id: ScheduledTask.ID, key: string, options?: Options) => Promise<Schedule>
  resume: (id: ScheduledTask.ID, key: string, options?: Options) => Promise<Schedule>
  run: (id: ScheduledTask.ID, key: string, options?: Options) => Promise<CapabilityScheduleManagement.Started>
  remove: (id: ScheduledTask.ID, key: string, options?: Options) => Promise<CapabilityScheduleManagement.Removed>
}>
/** A copy key in i18n/orchestra-chapters/schedule.ts plus its params; dates are epoch ms for the view's formatter. */
export type Label = Readonly<{ key: string; params?: Readonly<Record<string, string | number>> }>
export type Action = "pause" | "resume" | "run" | "remove"
export type Failure = "authorization" | "conflict" | "invalid" | "request"
export type Row = Readonly<{
  id: ScheduledTask.ID
  name: string
  prompt: string
  owner: Readonly<{ sessionID: string; agentID: string }>
  cadence: Label
  /** Cron only: the raw expression, shown next to the words. */
  expression?: string
  timezone: string
  next?: number
  status: Label
  runs: Label
  skipped?: Label
  last?: Readonly<{ label: Label; sessionID?: string; error?: string }>
  actions: readonly Action[]
}>
export type State = Readonly<{
  status: "loading" | "ready" | "error"
  rows: readonly Row[]
  busy: boolean
  failure?: Failure
  /** The schedule whose delete waits for confirmation. */
  confirm?: ScheduledTask.ID
  /** The last mutation that failed; `retry` resends it with the same idempotency key. */
  pending?: Readonly<{ action: Action; id: ScheduledTask.ID }>
  started?: CapabilityScheduleManagement.Started
}>
export type Model = Readonly<{
  state: State
  load: () => Promise<void>
  pause: (id: ScheduledTask.ID) => Promise<void>
  resume: (id: ScheduledTask.ID) => Promise<void>
  run: (id: ScheduledTask.ID) => Promise<void>
  requestRemove: (id: ScheduledTask.ID) => void
  cancelRemove: () => void
  confirmRemove: () => Promise<void>
  retry: () => Promise<void>
  dispose: () => void
}>

const prefix = "orchestra.schedule.agents"
const decodePage = Schema.decodeUnknownOption(CapabilityScheduleManagement.Page)

export function createScheduleAgentsModel(api: Api, requestKey: () => string = () => crypto.randomUUID()): Model {
  const [state, set] = createStore<{ -readonly [K in keyof State]: State[K] }>({ status: "loading", rows: [], busy: false })
  let disposed = false
  let controller: AbortController | undefined
  // The key stays out of the reactive store; a retry of the same intent reuses it so the server dedupes.
  let intent: { action: Action; id: ScheduledTask.ID; key: string } | undefined

  const begin = () => {
    controller?.abort()
    controller = new AbortController()
    return controller
  }
  const current = (owner: AbortController) => !disposed && controller === owner && !owner.signal.aborted
  const load = async () => {
    if (disposed) return
    const owner = begin()
    set({ status: "loading", failure: undefined })
    const page = await api.list({ signal: owner.signal }).then(decodePage, (error: unknown) => failure(error))
    if (!current(owner)) return
    controller = undefined
    if (typeof page === "string" || Option.isNone(page)) {
      set({ status: "error", failure: typeof page === "string" ? page : "invalid" })
      return
    }
    set({ status: "ready", rows: page.value.items.map((item) => row(item)), failure: undefined })
  }
  const send = async () => {
    if (disposed || !intent) return
    const sent = intent
    const owner = begin()
    set({ busy: true, failure: undefined, started: undefined, pending: { action: sent.action, id: sent.id } })
    const result = await request(api, sent, owner.signal).then((value) => ({ value }), (error: unknown) => ({ error }))
    if (!current(owner) || intent !== sent) return
    controller = undefined
    if ("error" in result) {
      set({ busy: false, status: "error", failure: failure(result.error) })
      return
    }
    intent = undefined
    set({ busy: false, pending: undefined, confirm: undefined,
      started: "sessionID" in result.value ? result.value : undefined })
    await load()
  }
  const start = (action: Action, id: ScheduledTask.ID) => {
    if (disposed || state.busy) return Promise.resolve()
    intent = { action, id, key: requestKey() }
    return send()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    controller?.abort()
    controller = undefined
    intent = undefined
    set({ status: "loading", rows: [], busy: false, failure: undefined, confirm: undefined, pending: undefined,
      started: undefined })
  }
  if (getOwner()) onCleanup(dispose)
  return {
    state,
    load,
    pause: (id) => start("pause", id),
    resume: (id) => start("resume", id),
    run: (id) => start("run", id),
    requestRemove: (id) => { if (!disposed && !state.busy) set({ confirm: id }) },
    cancelRemove: () => { if (!state.busy) set({ confirm: undefined }) },
    confirmRemove: () => state.confirm ? start("remove", state.confirm) : Promise.resolve(),
    retry: () => state.busy ? Promise.resolve() : send(),
    dispose,
  }
}

/** One agent schedule as the view shows it: cadence in words, status, counters, last outcome and allowed actions. */
export function row(item: Item): Row {
  const schedule = item.schedule
  const cron = schedule.cadence.kind === "cron" ? schedule.cadence.expression : undefined
  return {
    id: schedule.id,
    name: schedule.name,
    prompt: schedule.prompt,
    owner: { sessionID: item.sessionID, agentID: item.agentID },
    cadence: cadenceLabel(schedule.cadence),
    ...(cron === undefined ? {} : { expression: cron }),
    timezone: schedule.timezone,
    ...(schedule.next === undefined ? {} : { next: schedule.next }),
    status: statusLabel(schedule),
    runs: { key: `orchestra.schedule.runs.${schedule.runs === 1 ? "one" : "other"}`, params: { count: schedule.runs } },
    ...(schedule.skipped ? { skipped: { key: `${prefix}.skipped`, params: { count: schedule.skipped } } } : {}),
    ...(schedule.last ? { last: lastRun(schedule.last) } : {}),
    actions: actions(schedule),
  }
}

export function cadenceLabel(cadence: CapabilityScheduleManagement.Cadence): Label {
  if (cadence.kind === "once") return { key: `${prefix}.cadence.once`, params: { date: cadence.at } }
  if (cadence.kind === "daily") return { key: `${prefix}.cadence.daily`, params: { time: cadence.time } }
  if (cadence.kind === "weekly") return { key: `${prefix}.cadence.weekly.${cadence.day}`, params: { time: cadence.time } }
  if (cadence.kind === "cron") return { key: `${prefix}.cadence.cron`, params: { expression: cadence.expression } }
  if (cadence.minutes % 1440 === 0) return every("days", cadence.minutes / 1440)
  if (cadence.minutes % 60 === 0) return every("hours", cadence.minutes / 60)
  return every("minutes", cadence.minutes)
}

export function statusLabel(schedule: Schedule): Label {
  if (schedule.enabled) return { key: `${prefix}.status.enabled` }
  if (schedule.disabledReason === "exhausted") return { key: `${prefix}.status.exhausted` }
  if (schedule.disabledReason === "owner-missing") return { key: `${prefix}.status.ownerMissing` }
  return { key: `${prefix}.status.paused` }
}

// A used-up repeat or a missing owner cannot resume; a missing owner cannot run either.
export function actions(schedule: Schedule): Action[] {
  const toggle: Action[] = schedule.enabled ? ["pause"] : schedule.disabledReason ? [] : ["resume"]
  return [...toggle, ...(schedule.disabledReason === "owner-missing" ? [] : ["run" as const]), "remove"]
}

function lastRun(run: ScheduledTask.Run) {
  if (run.outcome === "started")
    return { label: { key: `${prefix}.last.started`, params: { date: run.time } }, sessionID: run.sessionID }
  return { label: { key: `${prefix}.last.failed`, params: { date: run.time } }, error: run.error }
}

function every(unit: "days" | "hours" | "minutes", count: number): Label {
  if (count === 1 && unit !== "minutes") return { key: `${prefix}.cadence.${unit}.one` }
  return { key: `${prefix}.cadence.${unit}.other`, params: { count } }
}

function request(api: Api, intent: { action: Action; id: ScheduledTask.ID; key: string }, signal: AbortSignal) {
  if (intent.action === "pause") return api.pause(intent.id, intent.key, { signal })
  if (intent.action === "resume") return api.resume(intent.id, intent.key, { signal })
  if (intent.action === "run") return api.run(intent.id, intent.key, { signal })
  return api.remove(intent.id, intent.key, { signal })
}

function failure(error: unknown): Failure {
  if (!error || typeof error !== "object") return "request"
  const cause = "cause" in error ? error.cause : undefined
  const status = "status" in error ? error.status : cause && typeof cause === "object" && "status" in cause ? cause.status : undefined
  const tag = "_tag" in error ? error._tag : undefined
  if (status === 401 || status === 403 || tag === "UnauthorizedError" || tag === "ForbiddenError") return "authorization"
  if (status === 409 || tag === "ConflictError") return "conflict"
  if (status === 400 || tag === "InvalidRequestError" || tag === "HttpApiSchemaError") return "invalid"
  return "request"
}

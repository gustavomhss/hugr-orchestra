export const CADENCES = ["once", "hourly", "daily", "weekly"] as const
export type Cadence = (typeof CADENCES)[number]

export type ScheduleTask = {
  id: string
  name: string
  prompt: string
  agent: string
  cadence: Cadence
  // Epoch milliseconds; shown in the browser's local timezone.
  next: number
  enabled: boolean
  runs: number
  last?: { time: number; sessionID: string }
}

// Due tasks dispatch in saved order, one at a time.
export function dueTasks(tasks: readonly ScheduleTask[], now: number) {
  return tasks.filter((task) => task.enabled && task.next <= now)
}

// Record a dispatched run. One-off tasks pause; recurring tasks roll forward from their own
// slot so the chosen time of day survives late dispatch, missed runs and DST changes.
export function recordRun(task: ScheduleTask, now: number, sessionID: string): ScheduleTask {
  return {
    ...task,
    runs: task.runs + 1,
    last: { time: now, sessionID },
    enabled: task.cadence === "once" ? false : task.enabled,
    next: task.cadence === "once" ? task.next : following(task.cadence, task.next, now),
  }
}

// A one-off task whose time has passed cannot resume; it needs a new future time first.
export function canResume(task: ScheduleTask, now: number) {
  return task.cadence !== "once" || task.next > now
}

export function resume(task: ScheduleTask, now: number): ScheduleTask {
  if (task.cadence === "once") return { ...task, enabled: true }
  return { ...task, enabled: true, next: following(task.cadence, task.next, now) }
}

export function following(cadence: Exclude<Cadence, "once">, from: number, now: number) {
  if (from > now) return from
  if (cadence === "hourly") return from + (Math.floor((now - from) / HOUR) + 1) * HOUR
  const date = new Date(from)
  const days = cadence === "daily" ? 1 : 7
  while (date.getTime() <= now) date.setDate(date.getDate() + days)
  return date.getTime()
}

// `datetime-local` value (minutes) for an epoch, in the browser's local timezone.
export function localInput(time: number) {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// Drop malformed rows instead of discarding the whole saved list.
export function readTasks(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return { tasks: [] }
  return { tasks: value.tasks.filter(isTask) }
}

const HOUR = 3_600_000

function isTask(value: unknown): value is ScheduleTask {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string") return false
  if (typeof value.agent !== "string" || !CADENCES.some((cadence) => cadence === value.cadence)) return false
  if (!Number.isFinite(value.next) || typeof value.enabled !== "boolean" || !Number.isInteger(value.runs)) return false
  if (value.last === undefined) return true
  return isRecord(value.last) && Number.isFinite(value.last.time) && typeof value.last.sessionID === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

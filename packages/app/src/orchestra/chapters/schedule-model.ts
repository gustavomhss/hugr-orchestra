export const CADENCES = ["once", "hourly", "daily", "weekly"] as const
export type Cadence = (typeof CADENCES)[number]
type Recurring = Exclude<Cadence, "once">

export type ScheduleTask = {
  id: string
  name: string
  prompt: string
  agent: string
  cadence: Cadence
  // Epoch milliseconds of the next slot; shown in the browser's local timezone.
  next: number
  // Intended local time of day in minutes after midnight. Daily and weekly slots are rebuilt from it,
  // so a slot moved by a DST gap does not drag later slots with it.
  minute: number
  enabled: boolean
  runs: number
  last?: { time: number; sessionID: string }
  // Most recent slot that was skipped instead of run.
  missed?: number
}

export type Plan = { type: "wait" } | { type: "run"; slot: number; missed?: number } | { type: "skip"; slot: number }

const HOUR = 3_600_000
const DAY = 24 * HOUR
const LATE = DAY

// What the scheduler owes a task at `now`. Only the latest due slot can run; older slots were
// overtaken and count as missed. A one-off or weekly slot more than a day late is skipped, never
// caught up. Hourly and daily slots are always within one cadence of the next slot.
export function plan(task: ScheduleTask, now: number): Plan {
  if (!task.enabled || task.next > now) return { type: "wait" }
  if (task.cadence === "once")
    return now - task.next > LATE ? { type: "skip", slot: task.next } : { type: "run", slot: task.next }
  const slot = previous(task.cadence, task.minute, following(task.cadence, task.minute, task.next, now))
  if (task.cadence === "weekly" && now - slot > LATE) return { type: "skip", slot }
  if (slot === task.next) return { type: "run", slot }
  return { type: "run", slot, missed: previous(task.cadence, task.minute, slot) }
}

// Record a finished run. A run that served `slot` moves the task past it; an extra run (Run now
// before a slot is due) only rolls a slot that is already behind `now`. One-off tasks pause.
export function recordRun(
  task: ScheduleTask,
  run: { time: number; sessionID: string; slot?: number; missed?: number },
): ScheduleTask {
  const from = run.slot ?? task.next
  return {
    ...task,
    runs: task.runs + 1,
    last: { time: run.time, sessionID: run.sessionID },
    missed: run.slot === undefined ? task.missed : run.missed,
    enabled: task.cadence === "once" ? false : task.enabled,
    next: task.cadence === "once" ? task.next : following(task.cadence, task.minute, from, run.time),
  }
}

export function skipRun(task: ScheduleTask, slot: number, now: number): ScheduleTask {
  if (task.cadence === "once") return { ...task, missed: slot, enabled: false }
  return { ...task, missed: slot, next: following(task.cadence, task.minute, slot, now) }
}

// A one-off task whose time has passed cannot resume; it needs a new future time first.
export function canResume(task: ScheduleTask, now: number) {
  return task.cadence !== "once" || task.next > now
}

export function resume(task: ScheduleTask, now: number): ScheduleTask {
  if (task.cadence === "once") return { ...task, enabled: true }
  return { ...task, enabled: true, next: following(task.cadence, task.minute, task.next, now) }
}

// First slot after `now`, stepping from slot `from`. Hourly slots are absolute hours. Daily and weekly
// slots are local calendar days at `minute`: a time that does not exist (spring-forward gap) runs at
// the same offset after the gap that day only, and an ambiguous time (fall-back) runs once, at its
// first occurrence.
export function following(cadence: Recurring, minute: number, from: number, now: number) {
  if (from > now) return from
  if (cadence === "hourly") return from + (Math.floor((now - from) / HOUR) + 1) * HOUR
  const step = cadence === "daily" ? 1 : 7
  const start = Math.max(1, Math.floor((now - from) / (step * DAY)))
  const slots = Array.from({ length: 3 }, (_, index) => local(from, (start + index) * step, minute))
  return slots.find((slot) => slot > now) ?? local(from, (start + 3) * step, minute)
}

export function previous(cadence: Recurring, minute: number, slot: number) {
  if (cadence === "hourly") return slot - HOUR
  return local(slot, cadence === "daily" ? -1 : -7, minute)
}

// `datetime-local` value (minutes) for an epoch, in the browser's local timezone.
export function localInput(time: number) {
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function localMinute(time: number) {
  const date = new Date(time)
  return date.getHours() * 60 + date.getMinutes()
}

// Deterministic IDs for the run that serves `slot`, so a retry or a second tab reconciles with the
// session and prompt a first attempt already created instead of starting another run. The time
// prefix matches the server's ID layout (descending sessions, ascending messages).
export function slotIDs(taskID: string, slot: number) {
  const seed = `${taskID}:${slot}`
  return {
    session: `ses_${stamp(slot, true)}${digest(`session:${seed}`)}`,
    message: `msg_${stamp(slot, false)}${digest(`message:${seed}`)}`,
  }
}

// Drop malformed rows instead of discarding the whole saved list. Rows saved before `minute`
// existed take it from their next slot.
export function readTasks(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return { tasks: [] }
  return {
    tasks: value.tasks
      .filter(isTask)
      .map((task) => (Number.isInteger(task.minute) ? task : { ...task, minute: localMinute(task.next) })),
  }
}

function local(from: number, days: number, minute: number) {
  const date = new Date(from)
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    Math.floor(minute / 60),
    minute % 60,
  ).getTime()
}

function stamp(time: number, descending: boolean) {
  const current = BigInt(time) * 0x1000n + 1n
  const value = descending ? ~current : current
  return Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("")
}

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// 14 base62 characters from a non-cryptographic hash; IDs only need to be stable and well spread.
function digest(text: string) {
  return Array.from({ length: 14 }, (_, index) => BASE62[hash(text, index) % 62]).join("")
}

function hash(text: string, seed: number) {
  const codes = Array.from(text, (char) => char.charCodeAt(0))
  const [a, b] = codes.reduce(
    ([h1, h2], code) => [Math.imul(h1 ^ code, 2654435761), Math.imul(h2 ^ code, 1597334677)],
    [0xdeadbeef ^ seed, 0x41c6ce57 ^ seed],
  )
  const h1 = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909)
  const h2 = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

function isTask(value: unknown): value is ScheduleTask {
  if (!isRecord(value)) return false
  if (typeof value.id !== "string" || typeof value.name !== "string" || typeof value.prompt !== "string") return false
  if (typeof value.agent !== "string" || !CADENCES.some((cadence) => cadence === value.cadence)) return false
  if (!Number.isFinite(value.next) || typeof value.enabled !== "boolean" || !Number.isInteger(value.runs)) return false
  if (
    value.minute !== undefined &&
    !(Number.isInteger(value.minute) && Number(value.minute) >= 0 && Number(value.minute) < 1440)
  )
    return false
  if (value.missed !== undefined && !Number.isFinite(value.missed)) return false
  if (value.last === undefined) return true
  return isRecord(value.last) && Number.isFinite(value.last.time) && typeof value.last.sessionID === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

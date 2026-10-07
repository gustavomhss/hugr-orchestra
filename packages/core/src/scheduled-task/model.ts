export * as ScheduledTaskModel from "./model"

import { DateTime, Option } from "effect"
import type { ScheduledTask } from "@opencode-ai/schema/scheduled-task"

type Recurring = Exclude<ScheduledTask.Cadence, "once">

// The part of a task that decides when it runs. `minute` is the intended local time of day in `timezone`;
// daily and weekly slots are rebuilt from it, so a slot moved by a DST gap does not drag later slots with it.
export type Timing = {
  readonly cadence: ScheduledTask.Cadence
  readonly minute: number
  readonly timezone: string
  readonly next: number
  readonly enabled: boolean
  readonly missed?: number
}

export type Plan = { type: "wait" } | { type: "run"; slot: number; missed?: number } | { type: "skip"; slot: number }

const HOUR = 3_600_000
const DAY = 24 * HOUR
const LATE = DAY

// What the scheduler owes a task at `now`. Only the latest due slot can run; older slots were overtaken
// and count as missed. A one-off or weekly slot more than a day late is skipped, never caught up. Hourly
// and daily slots are always within one cadence of the next slot.
export function plan(task: Timing, now: number): Plan {
  if (!task.enabled || task.next > now) return { type: "wait" }
  if (task.cadence === "once")
    return now - task.next > LATE ? { type: "skip", slot: task.next } : { type: "run", slot: task.next }
  const slot = previous(task, task.cadence, following(task, task.cadence, task.next, now))
  if (task.cadence === "weekly" && now - slot > LATE) return { type: "skip", slot }
  if (slot === task.next) return { type: "run", slot }
  return { type: "run", slot, missed: previous(task, task.cadence, slot) }
}

// A run whose prompt was admitted. A run that served `slot` moves the task past it; an extra run (Run now
// with no due slot, or a slot rescheduled while it ran) only rolls a slot that is already behind `time`.
// One-off tasks pause.
export function recordRun<T extends Timing>(task: T, run: { time: number; slot?: number; missed?: number }): T {
  const from = run.slot ?? task.next
  return {
    ...task,
    missed: run.slot === undefined ? task.missed : run.missed,
    enabled: task.cadence === "once" ? false : task.enabled,
    next: task.cadence === "once" ? task.next : following(task, task.cadence, from, run.time),
  }
}

export function skipRun<T extends Timing>(task: T, slot: number, now: number): T {
  if (task.cadence === "once") return { ...task, missed: slot, enabled: false }
  return { ...task, missed: slot, next: following(task, task.cadence, slot, now) }
}

// A one-off task whose time has passed cannot resume; it needs a new future time first.
export function canResume(task: Timing, now: number) {
  return task.cadence !== "once" || task.next > now
}

export function resume<T extends Timing>(task: T, now: number): T {
  if (task.cadence === "once") return { ...task, enabled: true }
  return { ...task, enabled: true, next: following(task, task.cadence, task.next, now) }
}

// First slot after `now`, stepping from slot `from`. Hourly slots are absolute hours. Daily and weekly slots
// are calendar days at `minute` in the task's zone: a time that does not exist (spring-forward gap) runs at
// the same offset after the gap that day only, and an ambiguous time (fall-back) runs once, at its first
// occurrence.
export function following(zone: { minute: number; timezone: string }, cadence: Recurring, from: number, now: number) {
  if (from > now) return from
  if (cadence === "hourly") return from + (Math.floor((now - from) / HOUR) + 1) * HOUR
  const step = cadence === "daily" ? 1 : 7
  const start = Math.max(1, Math.floor((now - from) / (step * DAY)))
  const slots = Array.from({ length: 3 }, (_, index) => local(zone, from, (start + index) * step))
  return slots.find((slot) => slot > now) ?? local(zone, from, (start + 3) * step)
}

export function previous(zone: { minute: number; timezone: string }, cadence: Recurring, slot: number) {
  if (cadence === "hourly") return slot - HOUR
  return local(zone, slot, cadence === "daily" ? -1 : -7)
}

export function validZone(timezone: string) {
  return Option.isSome(DateTime.zoneMakeNamed(timezone))
}

// Local time of day, in minutes after midnight, of an instant in `timezone`.
export function localMinute(time: number, timezone: string) {
  const parts = DateTime.toParts(DateTime.makeZonedUnsafe(time, { timeZone: timezone }))
  return parts.hour * 60 + parts.minute
}

// Deterministic IDs for the run that serves `slot`, so a retry, a second process or a restart reconciles
// with the Session and prompt a first attempt already created instead of starting another run. The time
// prefix matches the ID layout of Sessions (descending) and messages (ascending).
export function slotIDs(taskID: string, slot: number) {
  const seed = `${taskID}:${slot}`
  return {
    session: `ses_${stamp(slot, true)}${digest(`session:${seed}`)}`,
    message: `msg_${stamp(slot, false)}${digest(`message:${seed}`)}`,
  }
}

// The calendar day `days` after the local day of `from`, at the task's minute, in the task's zone.
function local(zone: { minute: number; timezone: string }, from: number, days: number) {
  const parts = DateTime.toParts(DateTime.makeZonedUnsafe(from, { timeZone: zone.timezone }))
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day + days, Math.floor(zone.minute / 60), zone.minute % 60)
  return DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(wall, { timeZone: zone.timezone, adjustForTimeZone: true, disambiguation: "compatible" }),
  )
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

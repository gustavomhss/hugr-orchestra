export * as ScheduledTaskCapabilityModel from "./capability-model"

import { DateTime, Option } from "effect"
import type { CapabilityScheduleContract } from "../capability/schedule/contract"

// Pure timing for capability schedules. Legacy-browser tasks keep model.ts unchanged.
export type Timing = Readonly<{
  cadence: CapabilityScheduleContract.Cadence
  /** IANA zone; daily/weekly/cron wall-clock fields are read in it. */
  timezone: string
  /** Epoch ms of the slot currently owed (the persisted `next`). */
  next: number
  enabled: boolean
  catchUp: "latest" | "skip"
}>

/** `skipped` counts slots that will never run because of this plan. */
export type Plan =
  | { readonly type: "wait" }
  | { readonly type: "run"; readonly slot: number; readonly skipped: number }
  | { readonly type: "skip"; readonly skipped: number }

export type Cron = Readonly<{ minutes: ReadonlySet<number>; hours: ReadonlySet<number>; days: ReadonlySet<number>;
  months: ReadonlySet<number>; weekdays: ReadonlySet<number>; dayRestricted: boolean; weekdayRestricted: boolean }>

const MINUTE = 60_000
const DAY = 86_400_000
// A once slot later than this is skipped; with catchUp "skip" a slot later than one tick is not run.
const LATE = DAY
const TICK = MINUTE
// Local days searched for the next match; a rule that matches no day inside it never fires.
const HORIZON = 5 * 366
const LIMIT = 100_000
const FIELDS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const
const MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

type Clock = { zone: DateTime.TimeZone; cron: Cron; times: number[] }

/** Five Vixie fields with `*`, lists, ranges and steps; names, macros and seconds are rejected, as is a rule that can never fire. */
export function parseCron(expression: string): Cron | undefined {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const sets = fields.map((field, index) => parseField(field, FIELDS[index][0], FIELDS[index][1]))
  if (!sets.every((set): set is number[] => set !== undefined)) return undefined
  const cron = {
    minutes: new Set(sets[0]),
    hours: new Set(sets[1]),
    days: new Set(sets[2]),
    months: new Set(sets[3]),
    weekdays: new Set(sets[4].map((day) => day % 7)),
    // Vixie: a day field that starts with `*` is unrestricted, even with a step.
    dayRestricted: !fields[2].startsWith("*"),
    weekdayRestricted: !fields[4].startsWith("*"),
  }
  // With both day fields restricted any matching weekday fires; otherwise some selected month must hold the day.
  const possible =
    (cron.dayRestricted && cron.weekdayRestricted) ||
    sets[3].some((month) => sets[2].some((day) => day <= MONTH_DAYS[month]))
  return possible ? cron : undefined
}

/** First slot strictly after `after`; DST gaps resolve to the next valid local instant; undefined for a past once. */
export function nextAfter(timing: Timing, after: number): number | undefined {
  const cadence = timing.cadence
  if (!Number.isFinite(after)) return undefined
  if (cadence.kind === "once") return cadence.at > after ? cadence.at : undefined
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    if (timing.next > after) return timing.next
    return timing.next + (Math.floor((after - timing.next) / step) + 1) * step
  }
  const clock = wallClock(timing)
  if (!clock || !inRange(after)) return undefined
  // Wall times at or before `after`'s own map to instants at or before it; inside a repeated hour later wall
  // times can too, so the scan keeps going until an instant passes `after`.
  return scan(clock, Math.floor(localWall(clock.zone, after) / MINUTE) * MINUTE, 1, (instant) => instant > after)
}

/** What a capability schedule owes at `now`. A once slot more than 24h late is skipped. */
export function plan(timing: Timing, now: number): Plan {
  if (!timing.enabled || timing.next > now) return { type: "wait" }
  if (timing.cadence.kind === "once")
    return now - timing.next > LATE ? { type: "skip", skipped: 1 } : { type: "run", slot: timing.next, skipped: 0 }
  const due = overdue(timing, now)
  if (timing.catchUp === "skip" && now - due.latest > TICK) return { type: "skip", skipped: due.count }
  return { type: "run", slot: due.latest, skipped: due.count - 1 }
}

// The latest slot due at `now` and how many slots are due counting the owed `next`. Without a usable zone or
// rule only the owed slot is known.
function overdue(timing: Timing, now: number) {
  const cadence = timing.cadence
  if (cadence.kind === "interval") {
    const step = cadence.minutes * MINUTE
    const count = Math.floor((now - timing.next) / step) + 1
    return { latest: timing.next + (count - 1) * step, count }
  }
  const clock = wallClock(timing)
  const latest = clock && inRange(now) ? latestSlot(clock, now) : undefined
  if (!clock || latest === undefined || latest <= timing.next) return { latest: timing.next, count: 1 }
  // Counted in local wall times, so several matches inside one DST gap count apart though they run once.
  return { latest, count: 1 + countWalls(clock, localWall(clock.zone, timing.next), localWall(clock.zone, latest)) }
}

function wallClock(timing: Timing): Clock | undefined {
  const cadence = timing.cadence
  if (cadence.kind === "once" || cadence.kind === "interval") return undefined
  const zone = Option.getOrUndefined(DateTime.zoneMakeNamed(timing.timezone))
  // Daily and weekly are the cron rules "M H * * *" and "M H * * D".
  const cron = parseCron(
    cadence.kind === "cron"
      ? cadence.expression
      : `${cadence.time.split(":").map(Number).reverse().join(" ")} * * ${cadence.kind === "weekly" ? cadence.day : "*"}`,
  )
  if (!zone || !cron) return undefined
  const times = [...cron.hours].flatMap((hour) => [...cron.minutes].map((minute) => hour * 60 + minute))
  return { zone, cron, times: times.sort((a, b) => a - b) }
}

// The last slot at or before `now`. When `now` is in the second pass of a repeated hour, wall times up to one
// offset change past its own already ran, so the backward scan starts that much later.
function latestSlot(clock: Clock, now: number) {
  const repeat = Math.max(0, localWall(clock.zone, now - DAY) - (now - DAY) - (localWall(clock.zone, now) - now))
  const start = Math.floor((localWall(clock.zone, now) + repeat) / MINUTE) * MINUTE + MINUTE
  return scan(clock, start, -1, (instant) => instant <= now)
}

// Resolves matching wall times one by one from `from` and returns the first accepted instant. Resolution is
// monotone in wall time, so the first accepted instant is the nearest one in that direction.
function scan(clock: Clock, from: number, step: 1 | -1, accept: (instant: number) => boolean) {
  let wall = seek(clock, from, step)
  for (let index = 0; wall !== undefined && index < LIMIT; index++) {
    const instant = resolve(clock.zone, wall)
    if (accept(instant)) return instant
    wall = seek(clock, wall, step)
  }
  return undefined
}

// The first matching local wall time after `bound` (step 1) or the last one before it (step -1).
function seek(clock: Clock, bound: number, step: 1 | -1) {
  const first = Math.floor(bound / DAY)
  for (let index = 0; index <= HORIZON; index++) {
    const day = first + index * step
    if (!matchesDay(clock.cron, day)) continue
    const walls = clock.times.map((time) => day * DAY + time * MINUTE)
    const wall = step === 1 ? walls.find((wall) => wall > bound) : walls.findLast((wall) => wall < bound)
    if (wall !== undefined) return wall
  }
  return undefined
}

function matchesDay(cron: Cron, day: number) {
  const date = new Date(day * DAY)
  if (!cron.months.has(date.getUTCMonth() + 1)) return false
  const dayOfMonth = cron.days.has(date.getUTCDate())
  const weekday = cron.weekdays.has(date.getUTCDay())
  return cron.dayRestricted && cron.weekdayRestricted ? dayOfMonth || weekday : dayOfMonth && weekday
}

// Matching wall times in (from, to].
function countWalls(clock: Clock, from: number, to: number) {
  const first = Math.floor(from / DAY)
  const last = Math.floor(to / DAY)
  return Array.from({ length: Math.min(Math.max(0, last - first + 1), LIMIT) }, (_, index) => first + index).reduce(
    (total, day) => {
      if (!matchesDay(clock.cron, day)) return total
      if (day > first && day < last) return total + clock.times.length
      return total + clock.times.filter((time) => day * DAY + time * MINUTE > from && day * DAY + time * MINUTE <= to).length
    },
    0,
  )
}

// The instant of a local wall time: the earlier one when the hour repeats, and the first instant after the gap
// when the wall time does not exist (02:30 on a spring-forward day runs at 03:00).
function resolve(zone: DateTime.TimeZone, wall: number) {
  const instant = DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(wall, { timeZone: zone, adjustForTimeZone: true, disambiguation: "earlier" }),
  )
  if (localWall(zone, instant) === wall) return instant
  // In a gap "earlier" lands before it; the gap ends at the first minute whose local time passes `wall`.
  return (
    Array.from({ length: 24 * 60 }, (_, index) => instant + (index + 1) * MINUTE).find(
      (candidate) => localWall(zone, candidate) > wall,
    ) ?? instant
  )
}

// Local wall-clock time of an instant, encoded as UTC epoch ms.
function localWall(zone: DateTime.TimeZone, instant: number) {
  return instant + DateTime.zonedOffset(DateTime.makeZonedUnsafe(instant, { timeZone: zone }))
}

// Effect DateTime rejects instants near the edge of the Date range.
function inRange(instant: number) {
  return Math.abs(instant) < 8e15
}

function parseField(field: string, min: number, max: number) {
  const items = field.split(",").map((item) => parseItem(item, min, max))
  return items.every((item): item is number[] => item !== undefined) ? items.flat() : undefined
}

function parseItem(item: string, min: number, max: number) {
  const match = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(item)
  if (!match) return undefined
  // A step needs `*` or a range; `a/n` is not Vixie syntax.
  if (match[4] !== undefined && match[1] === undefined && match[3] === undefined) return undefined
  const low = match[1] ? min : Number(match[2])
  const high = match[1] ? max : Number(match[3] ?? match[2])
  const step = Number(match[4] ?? 1)
  if (low < min || high > max || low > high || step < 1) return undefined
  return Array.from({ length: Math.floor((high - low) / step) + 1 }, (_, index) => low + index * step)
}

export * as BoardForecast from "./forecast"

import type { Board } from "@orchestra/schema/board"

// Forecasts from the board's own history (CONTRACT.md section 3): the daily shipped throughput since the first ship
// day, resampled in a seeded Monte Carlo, so the same board on the same day always gives the same dates.

const DAY = 86_400_000
const NEEDED = 5
const TRIALS = 1000
const HORIZON = 3650
const SEED = 0x9e3779b9
const OPEN: readonly Board.Stage[] = ["backlog", "ready", "building", "review"]

export type Item = {
  readonly epic: number | null
  readonly stage: Board.Stage
  /** For a shipped issue, the moment it shipped. */
  readonly enteredAt: number
  /** The issue ref this one is blocked on: an unshipped dependency, or itself when paused or asked a blocking question. */
  readonly waitsOn: string | null
}

/** The project forecast and, in position order, one per epic; an epic's dates include the open epics before it. */
export function plan(input: {
  readonly items: readonly Item[]
  readonly epics: readonly { readonly number: number; readonly ref: string }[]
  readonly targetDate: number | null
  readonly now: number
}) {
  const shipped = input.items.filter((item) => item.stage === "shipped")
  const open = input.items.filter((item) => OPEN.includes(item.stage))
  const openOf = (epic: number) => open.filter((item) => item.epic === epic)
  const cumulative = input.epics.map((_, index) =>
    input.epics.slice(0, index + 1).reduce((sum, epic) => sum + openOf(epic.number).length, 0),
  )
  const today = Math.floor(input.now / DAY)
  const runs =
    shipped.length >= NEEDED
      ? simulate(
          throughput(
            shipped.map((item) => item.enteredAt),
            today,
          ),
          [...cumulative, open.length],
          today,
        )
      : []
  const forecast = (items: readonly Item[], shippedHere: number, run?: { readonly p50: number; readonly p85: number }): Board.Forecast => {
    if (items.length === 0 && (shippedHere > 0 || shipped.length >= NEEDED)) return { kind: "done" }
    const waits = items.every((item) => item.waitsOn !== null) ? items[0]?.waitsOn : undefined
    if (waits) return { kind: "waits", on: waits }
    if (!run) return { kind: "insufficient", shipped: shipped.length, needed: NEEDED }
    return {
      kind: "dates",
      p50: run.p50,
      p85: run.p85,
      vsTarget:
        input.targetDate === null
          ? null
          : { p50: Math.round((run.p50 - input.targetDate) / DAY), p85: Math.round((run.p85 - input.targetDate) / DAY) },
    }
  }
  const epics = input.epics.map((epic, index) => ({
    epic: epic.number,
    ref: epic.ref,
    shipped: shipped.filter((item) => item.epic === epic.number).length,
    remaining: openOf(epic.number).length,
    forecast: forecast(
      openOf(epic.number),
      shipped.filter((item) => item.epic === epic.number).length,
      runs[index],
    ),
  }))
  const pole = epics.reduce<number | undefined>((best, epic) => {
    if (epic.forecast.kind !== "dates") return best
    const current = best === undefined ? undefined : epics[best]?.forecast
    if (current?.kind === "dates" && current.p85 >= epic.forecast.p85) return best
    return epics.indexOf(epic)
  }, undefined)
  return {
    project: {
      shipped: shipped.length,
      remaining: open.length,
      targetDate: input.targetDate,
      forecast: forecast(open, shipped.length, runs.at(-1)),
    } satisfies Board.ProjectForecast,
    epics: epics.map((epic, index): Board.EpicForecast => ({ ...epic, setsDate: index === pole })),
  }
}

/** P50 past the target date; two consecutive evaluations like this turn the project's health to at_risk. */
export function late(forecast: Board.ProjectForecast) {
  return forecast.forecast.kind === "dates" && forecast.forecast.vsTarget !== null && forecast.forecast.vsTarget.p50 > 0
}

/** Replays the stage of every issue through the activity log; a point each time the scope or shipped count changes. */
export function scope(
  rows: readonly {
    readonly issue: string | null
    readonly reason: string | null
    readonly after: Record<string, unknown> | null
    readonly at: number
  }[],
) {
  const stages = new Map<string, unknown>()
  return rows.reduce<Board.ScopePoint[]>((points, row) => {
    if (!row.issue || typeof row.after?.stage !== "string") return points
    stages.set(row.issue, row.after.stage)
    const values = [...stages.values()]
    const total = values.filter((stage) => stage !== "intake" && stage !== "cut").length
    const done = values.filter((stage) => stage === "shipped").length
    const last = points.at(-1)
    if (last && last.scope === total && last.shipped === done) return points
    return [...points, { at: row.at, scope: total, shipped: done, reason: !last || last.scope !== total ? row.reason : null }]
  }, [])
}

/** Issues shipped per UTC day, from the first ship day through today, zero days included. */
function throughput(shippedAt: readonly number[], today: number) {
  const first = Math.min(today, ...shippedAt.map((at) => Math.floor(at / DAY)))
  const counts = Array.from({ length: today - first + 1 }, () => 0)
  shippedAt.forEach((at) => {
    counts[Math.min(Math.floor(at / DAY), today) - first]++
  })
  return counts
}

/** For each target count, the P50 and P85 day (UTC midnight epoch ms) by which that many more issues ship. */
function simulate(samples: readonly number[], targets: readonly number[], today: number) {
  const random = mulberry32(SEED)
  const goal = Math.max(...targets)
  const trials = Array.from({ length: TRIALS }, () => {
    const progress: number[] = []
    // Cumulative issues shipped after each simulated day.
    while ((progress.at(-1) ?? 0) < goal && progress.length < HORIZON)
      progress.push((progress.at(-1) ?? 0) + (samples[Math.floor(random() * samples.length)] ?? 0))
    return progress
  })
  return targets.map((target) => {
    const days = trials
      .map((progress) => {
        const index = progress.findIndex((count) => count >= target)
        return index === -1 ? HORIZON : index + 1
      })
      .toSorted((a, b) => a - b)
    return {
      p50: (today + (days[Math.ceil(TRIALS * 0.5) - 1] ?? HORIZON)) * DAY,
      p85: (today + (days[Math.ceil(TRIALS * 0.85) - 1] ?? HORIZON)) * DAY,
    }
  })
}

function mulberry32(seed: number) {
  const state = { value: seed >>> 0 }
  return () => {
    state.value = (state.value + 0x6d2b79f5) >>> 0
    const a = Math.imul(state.value ^ (state.value >>> 15), state.value | 1)
    const b = a ^ (a + Math.imul(a ^ (a >>> 7), a | 61))
    return ((b ^ (b >>> 14)) >>> 0) / 4294967296
  }
}

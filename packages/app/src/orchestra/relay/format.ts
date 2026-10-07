import type { RelayRun, RelayRunStatus, RelayStepStatus } from "./runs"

// Pure display helpers; the components turn their keys into copy.

export type Ago = { key: "now" | "minutes" | "hours" | "yesterday" | "days"; count: number }

export function ago(at: number, now: number): Ago {
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return { key: "now", count: 0 }
  if (minutes < 60) return { key: "minutes", count: minutes }
  const hours = Math.round(minutes / 60)
  if (hours < 24) return { key: "hours", count: hours }
  const days = Math.round(hours / 24)
  return days === 1 ? { key: "yesterday", count: 1 } : { key: "days", count: days }
}

// "4s", "52s", "3m 05s", "1h 12m".
export function duration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`
}

export function span(start: number | undefined, end: number | undefined, now: number) {
  if (start === undefined) return
  return duration((end ?? now) - start)
}

// Server run IDs may be long; the UI shows a short, stable handle.
export const runHandle = (runID: string) => (runID.length > 12 ? runID.slice(0, 8) : runID)

export type Tone = "good" | "bad" | "warm" | "run" | ""

export const RUN_TONE: Record<RelayRunStatus, Tone> = {
  running: "run",
  parked: "warm",
  failed: "bad",
  completed: "good",
  cancelled: "",
}

export const STEP_TONE: Record<RelayStepStatus, Tone> = {
  passed: "good",
  escalated: "warm",
  failed: "bad",
  running: "run",
  pending: "",
}

// Badges use `blue` where dots use `run`.
export const badgeTone = (tone: Tone) => (tone === "run" ? "blue" : tone)

// Live runs first: the ones waiting for a human, then the running ones, newest first within each.
export function liveRuns(runs: RelayRun[]) {
  return runs
    .filter((run) => run.status === "parked" || run.status === "running")
    .toSorted((a, b) =>
      a.status === b.status ? (b.startedAt ?? 0) - (a.startedAt ?? 0) : a.status === "parked" ? -1 : 1,
    )
}

export const newestFirst = (runs: RelayRun[]) => runs.toSorted((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))

// The `${name}` parameters a workflow's checks read, in first-use order.
export function checkParams(commands: string[]) {
  return [
    ...new Set(
      commands.flatMap((command) => [...command.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1])),
    ),
  ]
}

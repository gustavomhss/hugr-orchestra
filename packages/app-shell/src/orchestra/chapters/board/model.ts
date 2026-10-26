import type { ServerBoardGetOutput, ServerBoardIssueOutput } from "@orchestra/client"

export type Snapshot = ServerBoardGetOutput
export type Issue = Snapshot["issues"][number]
export type Page = ServerBoardIssueOutput
export type Trail = Page["trail"]
export type Check = Extract<Trail, { state: "ok" }>["pr"]["checks"][number]
export type Column = (typeof columns)[number]
export type Tick = "pass" | "fail" | "run"

// The board shows five stages. Intake is only counted in the header and Cut lives on the issue page (MOCKS.md v5).
export const columns = ["backlog", "ready", "building", "review", "shipped"] as const
const day = 24 * 60 * 60 * 1000

// Groups issues into the five columns in Maestro's order. Shipped reads newest first.
export function group(issues: readonly Issue[]) {
  const sorted = [...issues].sort((a, b) => a.position - b.position || a.number - b.number)
  const lanes = Object.fromEntries(
    columns.map((stage) => [stage, sorted.filter((issue) => issue.stage === stage)]),
  ) as Record<Column, Issue[]>
  lanes.shipped.sort((a, b) => b.stageEnteredAt - a.stageEnteredAt)
  return {
    lanes,
    intake: issues.filter((issue) => issue.stage === "intake").length,
    cut: issues.filter((issue) => issue.stage === "cut").length,
  }
}

// Share of the live issues in each stage, for the briefing bar. Intake and Cut are not part of the plan yet or anymore.
export function progress(issues: readonly Issue[]) {
  const live = issues.filter((issue) => issue.stage !== "intake" && issue.stage !== "cut")
  const count = (stage: Column) => live.filter((issue) => issue.stage === stage).length
  const shipped = count("shipped")
  return {
    total: live.length,
    shipped,
    percent: live.length ? Math.round((shipped / live.length) * 100) : 0,
    stages: (["shipped", "review", "building", "ready", "backlog"] as const).map((stage) => ({ stage, count: count(stage) })),
  }
}

// Where an issue stands on Maestro's plan. Skipped steps count as settled.
export function steps(issue: Pick<Issue, "steps">) {
  const active = issue.steps.findIndex((step) => step.status === "active")
  return {
    total: issue.steps.length,
    done: issue.steps.filter((step) => step.status === "done" || step.status === "skipped").length,
    current: active === -1 ? undefined : active + 1,
    now: active === -1 ? undefined : (issue.steps[active].now ?? undefined),
  }
}

// GitHub's check rollup: a completed run passes on success, neutral or skipped and fails otherwise.
export function ticks(checks: readonly Check[]) {
  const states = checks.map((check): Tick => {
    if (check.status.toLowerCase() !== "completed") return "run"
    return ["success", "neutral", "skipped"].includes((check.conclusion ?? "").toLowerCase()) ? "pass" : "fail"
  })
  return { states, passed: states.filter((state) => state === "pass").length, total: states.length }
}

// Seats are agent ids. The board shows a role letter, never a display name.
export function monogram(seat: string) {
  return seat.slice(0, 1).toUpperCase()
}

// Card order for the keyboard: down each column, left to right.
export function order(lanes: Record<Column, Issue[]>) {
  return columns.flatMap((stage) => lanes[stage].map((issue) => issue.ref))
}

export function step(refs: readonly string[], current: string | undefined, delta: number) {
  if (!refs.length) return
  const index = current ? refs.indexOf(current) : -1
  if (index === -1) return refs[delta < 0 ? refs.length - 1 : 0]
  return refs[Math.min(refs.length - 1, Math.max(0, index + delta))]
}

// Left and right jump to the nearest card in the next column that has any.
export function across(lanes: Record<Column, Issue[]>, current: string | undefined, delta: number) {
  const from = columns.findIndex((stage) => lanes[stage].some((issue) => issue.ref === current))
  const row = from === -1 ? 0 : lanes[columns[from]].findIndex((issue) => issue.ref === current)
  const next = columns
    .map((_, index) => from + delta * (index + 1))
    .filter((index) => index >= 0 && index < columns.length)
    .find((index) => lanes[columns[index]].length)
  if (next === undefined) return current
  const lane = lanes[columns[next]]
  return lane[Math.min(row, lane.length - 1)].ref
}

// Whole days an issue has sat in its stage, counted from 1.
export function age(issue: Pick<Issue, "stageEnteredAt">, now: number) {
  return Math.max(1, Math.floor((now - issue.stageEnteredAt) / day) + 1)
}

// Shipped rows group by when they shipped, newest first.
export function shippedDay(issue: Pick<Issue, "stageEnteredAt">, now: number) {
  const start = new Date(now).setHours(0, 0, 0, 0)
  if (issue.stageEnteredAt >= start) return "today" as const
  if (issue.stageEnteredAt >= start - day) return "yesterday" as const
  if (issue.stageEnteredAt >= start - 6 * day) return "week" as const
  return "earlier" as const
}

// The open question an issue is paused on, if Maestro asked one.
export function waitingOn(snapshot: Pick<Snapshot, "questions">, issue: Pick<Issue, "number">) {
  return snapshot.questions.find((question) => question.status === "open" && question.issue === issue.number)
}

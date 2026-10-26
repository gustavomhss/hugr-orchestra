import type { ServerBoardListOutput } from "@orchestra/client"
import type { Issue, Snapshot } from "./model"

// Pure helpers for the board's other views (slice E2): the projects overview, the list, the epic page and the
// timeline. Dates from the forecast are epoch ms at UTC midnight, so every date helper here works in UTC.
export type Summary = ServerBoardListOutput[number]
export type Forecast = Snapshot["forecast"]["forecast"]
export type View = "board" | "timeline" | "list"
export type Segment = "all" | "running" | "shipped" | "archived"
export type Filter = "all" | "needs" | "building" | "review" | `seat:${string}`
export type Grouping = "epic" | "stage"
export type Flow = (typeof flow)[number]

// The list and the epic page read top down from what is closest to done; shipped work folds at the end.
export const flow = ["review", "building", "ready", "backlog", "shipped"] as const
export const day = 24 * 60 * 60 * 1000
const week = 7 * day

// Intake is not on the plan yet and Cut is off it; neither counts toward progress or shows in a view.
export function live(issue: Pick<Issue, "stage">): issue is Issue & { stage: Flow } {
  return issue.stage !== "intake" && issue.stage !== "cut"
}

// Overview segments. Archived projects only arrive when the list is fetched with `archived: true`.
export function segment(items: readonly Summary[], which: Segment) {
  if (which === "archived") return items.filter((item) => item.project.status === "archived")
  const shown = items.filter((item) => item.project.status !== "archived")
  if (which === "running") return shown.filter((item) => item.project.status === "active")
  if (which === "shipped") return shown.filter((item) => item.project.status === "shipped")
  return shown
}

// Only a shipped or paused project archives (CONTRACT.md, slice E1).
export function archivable(status: Summary["project"]["status"]) {
  return status === "shipped" || status === "paused"
}

// An issue needs the owner when Maestro asked an open question about it.
export function needsYou(snapshot: Pick<Snapshot, "questions">, issue: Pick<Issue, "number">) {
  return snapshot.questions.some((question) => question.status === "open" && question.issue === issue.number)
}

export function filtered(snapshot: Pick<Snapshot, "issues" | "questions">, which: Filter) {
  return snapshot.issues.filter(live).filter((issue) => {
    if (which === "needs") return needsYou(snapshot, issue)
    if (which === "building" || which === "review") return issue.stage === which
    if (which.startsWith("seat:")) return issue.seat === which.slice(5)
    return true
  })
}

// Seats working on the project, for the filter chips: agent ids, never display names.
export function seats(issues: readonly Issue[]) {
  return [...new Set(issues.filter(live).flatMap((issue) => (issue.seat ? [issue.seat] : [])))].sort()
}

// Review first, then Building, Ready and Backlog in Maestro's order; Shipped newest first.
export function sorted(issues: readonly Issue[]) {
  return issues.filter(live).toSorted((a, b) => {
    const stage = flow.indexOf(a.stage) - flow.indexOf(b.stage)
    if (stage !== 0) return stage
    if (a.stage === "shipped") return b.stageEnteredAt - a.stageEnteredAt
    return a.position - b.position || a.number - b.number
  })
}

export function byStage(issues: readonly Issue[]) {
  const ordered = sorted(issues)
  return flow
    .map((stage) => ({ stage, issues: ordered.filter((issue) => issue.stage === stage) }))
    .filter((item) => item.issues.length > 0)
}

// Epic groups for the list: counts come from every live issue of the epic, rows only from the filtered ones. Epics
// closest to done come first, finished epics after the open ones, issues without an epic last.
export function byEpic(snapshot: Pick<Snapshot, "epics" | "issues">, issues: readonly Issue[]) {
  const groups = snapshot.epics
    .filter((epic) => epic.status !== "cut")
    .map((epic) => ({ epic, ...tally(snapshot.issues.filter((issue) => issue.epic === epic.number)) }))
    .filter((group) => group.total > 0)
    .toSorted((a, b) => rank(a) - rank(b) || a.epic.position - b.epic.position)
    .map((group) => ({ ...group, issues: sorted(issues.filter((issue) => issue.epic === group.epic.number)) }))
  const known = new Set(groups.map((group) => group.epic.number))
  const loose = sorted(issues.filter((issue) => issue.epic === null || !known.has(issue.epic)))
  return [
    ...groups.filter((group) => group.issues.length > 0),
    ...(loose.length ? [{ epic: undefined, ...tally(loose), issues: loose }] : []),
  ]
}

function rank(group: { shipped: number; total: number }) {
  if (group.shipped === group.total) return 2
  return 1 - group.shipped / group.total
}

export function tally(issues: readonly Issue[]) {
  const plan = issues.filter(live)
  return { shipped: plan.filter((issue) => issue.stage === "shipped").length, total: plan.length }
}

// Dependencies an epic waits on that are neither shipped nor part of the epic itself, with the issue that waits.
export function waits(snapshot: Pick<Snapshot, "issues">, issues: readonly Issue[]) {
  const own = new Set(issues.map((issue) => issue.ref))
  return issues
    .filter((issue) => live(issue) && issue.stage !== "shipped")
    .flatMap((issue) =>
      issue.dependsOn
        .filter((ref) => !own.has(ref))
        .map((ref) => ({ ref, on: snapshot.issues.find((item) => item.ref === ref), for: issue }))
        .filter((item) => item.on?.stage !== "shipped"),
    )
}

// Cumulative ships over time: one point per shipped issue, oldest first.
export function shipLine(issues: readonly Issue[]) {
  return issues
    .filter((issue) => issue.stage === "shipped")
    .map((issue) => issue.stageEnteredAt)
    .toSorted((a, b) => a - b)
    .map((at, index) => ({ at, count: index + 1 }))
}

// Monday 00:00 UTC of the week holding `at`.
export function monday(at: number) {
  const midnight = Math.floor(at / day) * day
  return midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * day
}

// ISO 8601 week number.
export function isoWeek(at: number) {
  const thursday = monday(at) + 3 * day
  const year = new Date(thursday).getUTCFullYear()
  return Math.floor((thursday - Date.UTC(year, 0, 1)) / week) + 1
}

// The timeline's frame: whole weeks from the first board activity to a week past the latest date it must show.
export function frame(snapshot: Pick<Snapshot, "issues" | "scope" | "forecast" | "epicForecasts">, now: number) {
  const dates = [snapshot.forecast, ...snapshot.epicForecasts].flatMap((item) =>
    item.forecast.kind === "dates" ? [item.forecast.p85] : [],
  )
  const marks = [
    now,
    ...snapshot.issues.filter(live).map((issue) => issue.stageEnteredAt),
    ...snapshot.scope.map((point) => point.at),
    ...dates,
    ...(snapshot.forecast.targetDate === null ? [] : [snapshot.forecast.targetDate]),
  ]
  const start = monday(Math.min(...marks))
  const end = monday(Math.max(...marks)) + week
  const weeks = Array.from({ length: Math.round((end - start) / week) }, (_, index) => start + index * week)
  return {
    start,
    end,
    weeks: weeks.map((at) => ({ at, week: isoWeek(at) })),
    at: (value: number) => ((Math.min(end, Math.max(start, value)) - start) / (end - start)) * 100,
  }
}

// One bar per epic on the timeline, in Maestro's order. The bar starts at the epic's first recorded stage entry: the
// board keeps when an issue entered its current stage, not when work began.
export function bars(snapshot: Pick<Snapshot, "epics" | "issues" | "epicForecasts">) {
  const forecasts = new Map(snapshot.epicForecasts.map((item) => [item.epic, item]))
  return snapshot.epics
    .filter((epic) => epic.status !== "cut")
    .map((epic) => {
      const issues = sorted(snapshot.issues.filter((issue) => issue.epic === epic.number))
      const ships = shipLine(issues)
      return {
        epic,
        issues,
        ...tally(issues),
        start: Math.min(...issues.map((issue) => issue.stageEnteredAt)),
        last: ships.at(-1)?.at,
        forecast: forecasts.get(epic.number)?.forecast ?? ({ kind: "done" } as const),
        setsDate: forecasts.get(epic.number)?.setsDate ?? false,
      }
    })
    .filter((bar) => bar.total > 0)
    .toSorted((a, b) => a.epic.position - b.epic.position)
}

// A P50–P85 range in the owner's language, read in UTC because forecast dates are UTC midnights.
export function range(p50: number, p85: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).formatRange(p50, p85)
}

export function utcDate(at: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(at)
}

import type { AtlasEvent, AtlasModel } from "../atlas-model"
import { seatName } from "../kit/format"

// Activity rows: the agents' events (session receipts, empty until they are served, D12) and one row per commit
// that moved anchored code (mock views-more.js:65-69).
export type ActivityRow =
  | { id: string; kind: "code"; sha: string; subject: string; facts: number }
  | { id: string; kind: AtlasEvent["kind"]; event: AtlasEvent }
export type ActivityShow = "all" | "reads" | "memory" | "holds" | "code"
export const ACTIVITY_SHOWS = ["all", "reads", "memory", "holds", "code"] as const

const KINDS = { reads: ["read"], memory: ["memory", "resume"], holds: ["hold"], code: ["code"] } as const

export function activityRows(model: AtlasModel): ActivityRow[] {
  return [
    ...model.activity().map((event, index): ActivityRow => ({ id: `e${index}`, kind: event.kind, event })),
    ...model.codeChanges().map(
      (change, index): ActivityRow => ({ id: `c${index}`, kind: "code", sha: change.sha, subject: change.subject, facts: change.facts.length }),
    ),
  ]
}

// "All" shows every agent event but not the code rows, which have their own filter.
export function shownRows(rows: ActivityRow[], show: ActivityShow) {
  if (show === "all") return rows.filter((row) => row.kind !== "code")
  return rows.filter((row) => (KINDS[show] as readonly string[]).includes(row.kind))
}

export const countRows = (rows: ActivityRow[], show: Exclude<ActivityShow, "all">) => shownRows(rows, show).length

// An event's sentence, as a copy key and its parameters (mock model.js:310-322). The view translates it.
export function eventText(event: AtlasEvent) {
  const name = seatName(event.who)
  if (event.kind === "memory" && event.recall) return { key: "orchestra.atlas.activity.event.recalled", params: { name } } as const
  if (event.kind === "memory" && event.ok) return { key: "orchestra.atlas.activity.event.saved", params: { name } } as const
  if (event.kind === "memory") return { key: "orchestra.atlas.activity.event.notSaved", params: { name } } as const
  if (event.kind === "resume" && event.ok) return { key: "orchestra.atlas.activity.event.resumed", params: { name } } as const
  if (event.kind === "resume") return { key: "orchestra.atlas.activity.event.noCheckpoint", params: { name } } as const
  if (event.kind === "hold") return { key: "orchestra.atlas.activity.event.held", params: { name } } as const
  if (event.action === "anchor")
    return {
      key: "orchestra.atlas.activity.event.froze",
      params: { name, count: event.units?.length ?? 0, target: event.target ?? "" },
    } as const
  if (event.action === "catalog") return { key: "orchestra.atlas.activity.event.catalog", params: { name } } as const
  return { key: "orchestra.atlas.activity.event.briefing", params: { name, unit: event.target ?? "" } } as const
}

// The mock's time(ms): "Oct 11 · 14:05 UTC", always in UTC.
export function eventTime(at: number) {
  const date = new Date(at)
  return {
    day: date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    clock: date.toISOString().slice(11, 16),
  }
}

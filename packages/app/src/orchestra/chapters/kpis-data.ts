export const PERIODS = ["7d", "30d", "90d", "all"] as const
export type Period = (typeof PERIODS)[number]

const PERIOD_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const
const MAX_BARS = 8
const DAY = 86_400_000

export type ActivityFact = {
  bucket: number
  sessionID: string
  providerID: string | null
  modelID: string | null
  user: number
  assistant: number
  failed: number
  tokens: number
}
export type ActivitySession = {
  id: string
  title: string
  parentID: string | null
  created: number
  updated: number
  additions: number | null
  deletions: number | null
  files: number | null
}
// The server buckets by its own local days; `days` names each edge so git days can share them.
export type Activity = {
  period: Period
  edges: readonly number[]
  days: readonly string[]
  previous: boolean
  activeMs: readonly number[]
  sessions: readonly ActivitySession[]
  facts: readonly ActivityFact[]
  truncated: boolean
}
export type GitActivity = {
  repository: boolean
  since: number
  until: number
  days: readonly { day: string; commits: number; merges: number }[]
  truncated: boolean
  // Which figures a time-budgeted scan cut short; servers without it only report `truncated`.
  partial?: { commits: boolean; lines: boolean }
}
// Git windows in server-local YYYY-MM-DD days: [previous, bars[0]) and consecutive bars.
export type DayWindow = { previous: string | undefined; bars: readonly string[] }

// Responses are checked before any number reaches a tile; anything malformed fails closed.
export function parseActivity(value: unknown): Activity | undefined {
  if (!isRecord(value) || typeof value.previous !== "boolean" || typeof value.truncated !== "boolean") return
  if (!PERIODS.some((period) => period === value.period)) return
  if (![value.edges, value.days, value.activeMs, value.sessions, value.facts].every(Array.isArray)) return
  const edges = value.edges as unknown[]
  const days = value.days as unknown[]
  const activeMs = value.activeMs as unknown[]
  if (edges.length < 2 || days.length !== edges.length || activeMs.length !== edges.length - 1) return
  if (!edges.every(finite) || !activeMs.every(finite) || !days.every(day)) return
  const factsValid = (value.facts as unknown[]).every(
    (fact) =>
      isRecord(fact) &&
      typeof fact.sessionID === "string" &&
      nullableText(fact.providerID) &&
      nullableText(fact.modelID) &&
      [fact.bucket, fact.user, fact.assistant, fact.failed, fact.tokens].every(finite),
  )
  const sessionsValid = (value.sessions as unknown[]).every(
    (session) =>
      isRecord(session) &&
      typeof session.id === "string" &&
      typeof session.title === "string" &&
      nullableText(session.parentID) &&
      [session.created, session.updated].every(finite) &&
      [session.additions, session.deletions, session.files].every((item) => item === null || finite(item)),
  )
  if (!factsValid || !sessionsValid) return
  return value as Activity
}

export function parseGit(value: unknown): GitActivity | undefined {
  if (!isRecord(value) || typeof value.repository !== "boolean" || typeof value.truncated !== "boolean") return
  if (!finite(value.since) || !finite(value.until) || !Array.isArray(value.days)) return
  if (
    value.partial !== undefined &&
    !(isRecord(value.partial) && typeof value.partial.commits === "boolean" && typeof value.partial.lines === "boolean")
  )
    return
  const daysValid = value.days.every(
    (entry) => isRecord(entry) && day(entry.day) && finite(entry.commits) && finite(entry.merges),
  )
  if (!daysValid) return
  return value as GitActivity
}

export type Totals = ReturnType<typeof totals>

export function summarizeActivity(activity: Activity) {
  const offset = activity.previous ? 1 : 0
  const current = activity.facts.filter((fact) => fact.bucket >= offset)
  const sessions = new Map(activity.sessions.map((session) => [session.id, session]))
  const ranked = new Map<string, { tokens: number; messages: number }>()
  current.forEach((fact) => {
    const entry = ranked.get(fact.sessionID) ?? { tokens: 0, messages: 0 }
    ranked.set(fact.sessionID, {
      tokens: entry.tokens + fact.tokens,
      messages: entry.messages + fact.user + fact.assistant,
    })
  })
  const models = new Map<string, { providerID: string; modelID: string; tokens: number; runs: number }>()
  current.forEach((fact) => {
    if (fact.assistant === 0 || !fact.providerID || !fact.modelID) return
    const key = `${fact.providerID}/${fact.modelID}`
    const entry = models.get(key) ?? { providerID: fact.providerID, modelID: fact.modelID, tokens: 0, runs: 0 }
    models.set(key, { ...entry, tokens: entry.tokens + fact.tokens, runs: entry.runs + fact.assistant })
  })
  const bucket = (index: number) =>
    totals(
      activity.facts.filter((fact) => fact.bucket === index),
      activity.activeMs[index] ?? 0,
    )
  return {
    current: totals(
      current,
      activity.activeMs.slice(offset).reduce((total, value) => total + value, 0),
    ),
    previous: activity.previous ? bucket(0) : undefined,
    bars: activity.activeMs.slice(offset).map((_, index) => bucket(index + offset)),
    start: activity.days[offset]!,
    sessions: [...ranked.entries()]
      .flatMap(([id, entry]) => {
        const session = sessions.get(id)
        if (!session) return []
        return [{ ...session, ...entry }]
      })
      .toSorted((a, b) => b.tokens - a.tokens || b.messages - a.messages || a.id.localeCompare(b.id)),
    models: [...models.values()].toSorted(
      (a, b) =>
        b.tokens - a.tokens ||
        b.runs - a.runs ||
        `${a.providerID}/${a.modelID}`.localeCompare(`${b.providerID}/${b.modelID}`),
    ),
  }
}

export function totals(facts: readonly ActivityFact[], activeMs: number) {
  const runs = facts.filter((fact) => fact.assistant > 0)
  return {
    tokens: facts.reduce((total, fact) => total + fact.tokens, 0),
    activeMs,
    messages: facts.reduce((total, fact) => total + fact.user + fact.assistant, 0),
    runs: facts.reduce((total, fact) => total + fact.assistant, 0),
    failed: facts.reduce((total, fact) => total + fact.failed, 0),
    models: new Set(runs.filter((fact) => fact.modelID).map((fact) => `${fact.providerID}/${fact.modelID}`)).size,
    providers: new Set(runs.flatMap((fact) => (fact.providerID ? [fact.providerID] : []))).size,
  }
}

// The git window for a period in the same server-local days as the activity buckets. `end` is the
// day after today. "All" starts on the first day with a commit.
export function gitWindow(period: Period, end: string, git: GitActivity): DayWindow {
  if (period !== "all") {
    const days = PERIOD_DAYS[period]
    const start = shiftDay(end, -days)
    return { previous: shiftDay(start, -days), bars: barDays(start, days) }
  }
  const first = git.days.reduce((min, entry) => (entry.day < min ? entry.day : min), shiftDay(end, -1))
  return { previous: undefined, bars: barDays(first, Math.max(1, dayCount(first, end))) }
}

export function summarizeGit(git: GitActivity, window: DayWindow) {
  const sum = (from: string, to: string) =>
    git.days
      .filter((entry) => entry.day >= from && entry.day < to)
      .reduce((total, entry) => ({ commits: total.commits + entry.commits, merges: total.merges + entry.merges }), {
        commits: 0,
        merges: 0,
      })
  return {
    current: sum(window.bars[0]!, window.bars[window.bars.length - 1]!),
    previous: window.previous === undefined ? undefined : sum(window.previous, window.bars[0]!),
    bars: window.bars.slice(1).map((edge, index) => sum(window.bars[index]!, edge)),
    // Commit and merge counts are incomplete only when the commit scans stopped early; line totals do not matter here.
    partial: git.partial ? git.partial.commits : git.truncated,
  }
}

// The client's local tomorrow, for git windows when the server's activity days are unavailable.
export function localEnd(now: number) {
  const date = new Date(now)
  date.setDate(date.getDate() + 1)
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-")
}

// Change against the previous window. No previous window, or nothing on either side, has no change.
export function change(current: number, previous: number | undefined) {
  if (previous === undefined || (previous === 0 && current === 0)) return
  if (previous === 0) return { trend: "up" as const, percent: undefined }
  const percent = Math.round(((current - previous) / previous) * 100)
  return { trend: percent > 0 ? ("up" as const) : percent < 0 ? ("down" as const) : ("flat" as const), percent }
}

// Large counts use a k/M/B suffix like the mock ("312k", "9.6M"). A value that would round up to
// 1000 of one unit is shown in the next unit instead ("1.0M", not "1000k").
export function compact(value: number) {
  const scales = [
    { size: 1e9, unit: "B", decimals: 100 },
    { size: 1e6, unit: "M", decimals: 100 },
    { size: 1e3, unit: "k", decimals: 10 },
    { size: 1, unit: "", decimals: 0 },
  ]
  const found = scales.findIndex((scale) => value >= scale.size)
  const index = found === -1 ? scales.length - 1 : found
  const shown = (scale: (typeof scales)[number]) => {
    const scaled = value / scale.size
    const digits = scaled < scale.decimals ? 1 : 0
    return { value: scaled, unit: scale.unit, digits, rounded: Number(scaled.toFixed(digits)) }
  }
  const result = shown(scales[index]!)
  const larger = scales[index - 1]
  const final = result.rounded >= 1000 && larger ? shown(larger) : result
  return { value: final.value, unit: final.unit, digits: final.digits }
}

export function hours(ms: number) {
  const value = ms / 3_600_000
  return { value, digits: value === 0 || value >= 10 ? 0 : value < 1 ? 2 : 1 }
}

// Bar heights as percentages of the tallest bar; an all-zero window draws empty bars.
export function heights(values: readonly number[]) {
  const peak = values.reduce((max, value) => Math.max(max, value), 0)
  return values.map((value) => (peak > 0 ? Math.round((value / peak) * 100) : 0))
}

// A server day as a calendar date, for labels formatted in UTC so the day never shifts.
export function dayDate(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return Date.UTC(year!, month! - 1, date!)
}

// Export the displayed rows; numbers are written as-is and only text is guarded against formulas.
export function usageCsv(rows: readonly (readonly (string | number)[])[]) {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value)
            const safe = (typeof value === "number" && Number.isFinite(value)) || !/^[=+\-@\t\r]/.test(text)
            return `"${(safe ? text : `'${text}`).replaceAll('"', '""')}"`
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  )
}

function barDays(start: string, days: number) {
  const count = Math.min(MAX_BARS, days)
  return Array.from({ length: count + 1 }, (_, index) => shiftDay(start, Math.floor((index * days) / count)))
}

function shiftDay(day: string, days: number) {
  return new Date(dayDate(day) + days * DAY).toISOString().slice(0, 10)
}

function dayCount(from: string, to: string) {
  return Math.round((dayDate(to) - dayDate(from)) / DAY)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function nullableText(value: unknown) {
  return value === null || typeof value === "string"
}

function day(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

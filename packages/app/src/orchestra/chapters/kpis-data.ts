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
  activeMs: number
  tokens: number
  cost: number
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
export type Activity = {
  edges: readonly number[]
  sessions: readonly ActivitySession[]
  facts: readonly ActivityFact[]
}
export type GitActivity = {
  repository: boolean
  since: number
  until: number
  days: readonly { day: string; commits: number; merges: number }[]
  truncated: boolean
}

// Responses are checked before any number reaches a tile; anything malformed fails closed.
export function parseActivity(value: unknown): Activity | undefined {
  if (!isRecord(value) || !Array.isArray(value.edges) || !Array.isArray(value.sessions) || !Array.isArray(value.facts))
    return
  if (!value.edges.every(finite)) return
  const factsValid = value.facts.every(
    (fact) =>
      isRecord(fact) &&
      typeof fact.sessionID === "string" &&
      nullableText(fact.providerID) &&
      nullableText(fact.modelID) &&
      [fact.bucket, fact.user, fact.assistant, fact.failed, fact.activeMs, fact.tokens, fact.cost].every(finite),
  )
  const sessionsValid = value.sessions.every(
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
  const daysValid = value.days.every(
    (day) =>
      isRecord(day) &&
      typeof day.day === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(day.day) &&
      finite(day.commits) &&
      finite(day.merges),
  )
  if (!daysValid) return
  return value as GitActivity
}

// A dashboard window: whole local days ending with today, the bar boundaries that split it,
// and for fixed periods the equal window right before it.
export type Range = { start: number; end: number; previous: number | undefined; bars: number[] }

export function periodRange(period: Exclude<Period, "all">, now: number): Range {
  const days = PERIOD_DAYS[period]
  const end = addDays(dayStart(now), 1)
  const start = addDays(end, -days)
  return { start, end, previous: addDays(start, -days), bars: barEdges(start, days) }
}

// "All" starts on the first day with recorded data; it has no previous window.
export function allRange(first: number, now: number): Range {
  const end = addDays(dayStart(now), 1)
  const start = dayStart(Math.min(first, now))
  return { start, end, previous: undefined, bars: barEdges(start, Math.max(1, Math.round((end - start) / DAY))) }
}

// The activity request asks for the previous window as one extra leading bucket.
export function activityEdges(range: Range) {
  return range.previous === undefined ? range.bars : [range.previous, ...range.bars]
}

export type Totals = ReturnType<typeof totals>

export function summarizeActivity(activity: Activity, range: Range) {
  const offset = range.previous === undefined ? 0 : 1
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
  const models = new Map<string, { providerID: string; modelID: string; tokens: number; runs: number; cost: number }>()
  current
    .filter((fact) => fact.assistant > 0 && fact.providerID && fact.modelID)
    .forEach((fact) => {
      const key = `${fact.providerID}/${fact.modelID}`
      const entry = models.get(key) ?? { providerID: fact.providerID!, modelID: fact.modelID!, tokens: 0, runs: 0, cost: 0 }
      models.set(key, {
        ...entry,
        tokens: entry.tokens + fact.tokens,
        runs: entry.runs + fact.assistant,
        cost: entry.cost + fact.cost,
      })
    })
  return {
    current: totals(current),
    previous: offset ? totals(activity.facts.filter((fact) => fact.bucket === 0)) : undefined,
    bars: range.bars.slice(1).map((_, index) => totals(current.filter((fact) => fact.bucket === index + offset))),
    sessions: [...ranked.entries()]
      .flatMap(([id, entry]) => {
        const session = sessions.get(id)
        if (!session) return []
        return [{ ...session, ...entry }]
      })
      .toSorted((a, b) => b.tokens - a.tokens || b.messages - a.messages || a.id.localeCompare(b.id)),
    models: [...models.values()].toSorted(
      (a, b) => b.tokens - a.tokens || b.runs - a.runs || `${a.providerID}/${a.modelID}`.localeCompare(`${b.providerID}/${b.modelID}`),
    ),
  }
}

// Git days are the server's local calendar days; they are placed on the matching local day.
export function summarizeGit(git: GitActivity, range: Range) {
  const days = git.days.map((entry) => ({ ...entry, time: dayTime(entry.day) }))
  const sum = (from: number, to: number) =>
    days
      .filter((entry) => entry.time >= from && entry.time < to)
      .reduce(
        (total, entry) => ({ commits: total.commits + entry.commits, merges: total.merges + entry.merges }),
        { commits: 0, merges: 0 },
      )
  return {
    current: sum(range.start, range.end),
    previous: range.previous === undefined ? undefined : sum(range.previous, range.start),
    bars: range.bars.slice(1).map((edge, index) => sum(range.bars[index], edge)),
    truncated: git.truncated,
  }
}

export function firstGitDay(git: GitActivity) {
  return git.days.reduce((first, entry) => Math.min(first, dayTime(entry.day)), git.until)
}

export function totals(facts: readonly ActivityFact[]) {
  const runs = facts.filter((fact) => fact.assistant > 0)
  return {
    tokens: facts.reduce((total, fact) => total + fact.tokens, 0),
    activeMs: facts.reduce((total, fact) => total + fact.activeMs, 0),
    messages: facts.reduce((total, fact) => total + fact.user + fact.assistant, 0),
    runs: facts.reduce((total, fact) => total + fact.assistant, 0),
    failed: facts.reduce((total, fact) => total + fact.failed, 0),
    cost: facts.reduce((total, fact) => total + fact.cost, 0),
    models: new Set(runs.filter((fact) => fact.modelID).map((fact) => `${fact.providerID}/${fact.modelID}`)).size,
    providers: new Set(runs.flatMap((fact) => (fact.providerID ? [fact.providerID] : []))).size,
  }
}

// Change against the previous window. No previous window, or nothing on either side, has no change.
export function change(current: number, previous: number | undefined) {
  if (previous === undefined || (previous === 0 && current === 0)) return
  if (previous === 0) return { trend: "up" as const, percent: undefined }
  const percent = Math.round(((current - previous) / previous) * 100)
  return { trend: percent > 0 ? ("up" as const) : percent < 0 ? ("down" as const) : ("flat" as const), percent }
}

// Large counts use a k/M/B suffix like the mock: "312k", "9.6M"; small multiples keep one decimal.
export function compact(value: number) {
  const scale = [
    { size: 1e9, unit: "B", decimals: 100 },
    { size: 1e6, unit: "M", decimals: 100 },
    { size: 1e3, unit: "k", decimals: 10 },
  ].find((item) => value >= item.size)
  if (!scale) return { value, unit: "", digits: 0 }
  const scaled = value / scale.size
  return { value: scaled, unit: scale.unit, digits: scaled < scale.decimals ? 1 : 0 }
}

export function hours(ms: number) {
  const value = ms / 3_600_000
  return { value, digits: value === 0 || value >= 10 ? 0 : value < 1 ? 2 : 1 }
}

// Bar heights as percentages of the tallest bar; an all-zero window draws empty bars.
export function heights(values: readonly number[]) {
  const peak = Math.max(...values, 0)
  return values.map((value) => (peak > 0 ? Math.round((value / peak) * 100) : 0))
}

export function dayStart(time: number) {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function addDays(time: number, days: number) {
  const date = new Date(time)
  date.setDate(date.getDate() + days)
  return date.getTime()
}

function barEdges(start: number, days: number) {
  const count = Math.min(MAX_BARS, days)
  return Array.from({ length: count + 1 }, (_, index) => addDays(start, Math.floor((index * days) / count)))
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

function dayTime(day: string) {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date).getTime()
}

// Export the displayed rows with raw numeric values and no hidden session data.
export function usageCsv(rows: readonly (readonly (string | number)[])[]) {
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value)
            const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
            return `"${safe.replaceAll('"', '""')}"`
          })
          .join(","),
      )
      .join("\r\n") + "\r\n"
  )
}

// A cell is a named reading, or unread. Missing is never zero, a dash, or a dropped column.
// Owner is only the session name recorded at spawn. A pid is not the address.

export const unread = "unread"

// Compare server timestamps with each other, then age locally with a monotonic clock. Remote clock offsets cancel.
export function readingAge(input: { sampledAt?: number; readAt: number; receivedAt: number; now: number }) {
  if (
    input.sampledAt === undefined ||
    ![input.sampledAt, input.readAt, input.receivedAt, input.now].every(Number.isFinite)
  )
    return
  return Math.max(0, input.readAt - input.sampledAt) + Math.max(0, input.now - input.receivedAt)
}

export const tabs = ["Trees", "Worktrees", "Cache", "Docker", "Temporary", "Logs", "IN/OUT", "Quarantine"] as const

export const states = ["alive", "exiting", "zombie", "gone", "unknown", "suspended", "partial"] as const

export type Tab = (typeof tabs)[number]

export type State = (typeof states)[number]

export type NamedReading = {
  source: string
  value: string
  ageMs: number
}

export type ActivityRow = {
  supervisorId: string
  owner: string
  state: State | undefined
  reading: NamedReading | undefined
}

export type ShownRow = {
  id: string
  owner: string
  state: string
  value: string
  source: string
  ageMs: number | undefined
  confirm: false
}

export type View = {
  tab: Tab
  tabs: readonly Tab[]
  pressure: typeof unread
  rows: readonly ShownRow[]
  filterMiss: boolean
}

export function recordedOwner(name: string | undefined) {
  if (!name) return ""
  return name
}

// A sample pid is not the supervisor id. Without that id the cell stays unread.
export function address(input: { supervisorId?: string; pid?: number }) {
  if (!input.supervisorId) return ""
  return input.supervisorId
}

// Selecting a session does not rewrite the recorded name, and does not fill an empty one.
export function selectSession(rows: readonly ActivityRow[], _name: string | undefined) {
  return rows.map((row) => ({ ...row }))
}

// A spawn this process recorded. No session name stays an empty owner. A missing id is not a row.
export function recordedRow(input: { supervisorId: string; owner: string }): ActivityRow | undefined {
  const supervisorId = address({ supervisorId: input.supervisorId })
  if (!supervisorId) return
  return { supervisorId, owner: recordedOwner(input.owner), state: undefined, reading: undefined }
}

export function recordedTrees(): readonly ActivityRow[] {
  return []
}

export function view(rows: readonly ActivityRow[], query: string, tab: Tab = "Trees"): View {
  const held = selectSession(rows, undefined)
  const needle = query.trim()
  const matched = needle ? held.filter((row) => row.supervisorId.includes(needle) || row.owner.includes(needle)) : held
  const filterMiss = needle.length > 0 && matched.length === 0
  const shown = matched.length === 0 && !filterMiss ? [blank()] : matched.map(show)
  return { tab, tabs, pressure: unread, rows: shown, filterMiss }
}

function blank(): ShownRow {
  return { id: unread, owner: "", state: unread, value: unread, source: unread, ageMs: undefined, confirm: false }
}

function show(row: ActivityRow): ShownRow {
  const id = row.supervisorId.length > 0 ? row.supervisorId : unread
  const state = row.state ?? unread
  if (!row.reading || row.reading.source.length === 0) {
    return { id, owner: row.owner, state, value: unread, source: unread, ageMs: undefined, confirm: false }
  }
  return {
    id,
    owner: row.owner,
    state,
    value: row.reading.value,
    source: row.reading.source,
    ageMs: row.reading.ageMs,
    confirm: false,
  }
}

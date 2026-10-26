import type {
  ServerBoardActivityOutput,
  ServerBoardDecisionsOutput,
  ServerBoardGetOutput,
  ServerBoardIssueOutput,
  ServerBoardProofOutput,
  ServerBoardSpendOutput,
} from "@orchestra/client"

export type Snapshot = ServerBoardGetOutput
export type Issue = Snapshot["issues"][number]
export type Page = ServerBoardIssueOutput
export type Trail = Page["trail"]
export type Check = Extract<Trail, { state: "ok" }>["pr"]["checks"][number]
export type Column = (typeof columns)[number]
export type Tick = "pass" | "fail" | "run"
export type Activity = ServerBoardActivityOutput[number]
export type Question = Snapshot["questions"][number]
export type SpendReport = ServerBoardSpendOutput
export type CardSpend = SpendReport["cards"][number]
export type Meter = SpendReport["project"]["models"]
export type Decision = ServerBoardDecisionsOutput[number]
export type Proof = ServerBoardProofOutput

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

// Mirrors the server's rule (packages/core/src/board/board.ts UNDOABLE): only Maestro's plan changes and GitHub
// overwrites undo; the owner reverses their own actions by doing the opposite.
const undoable = ["issue.update", "issue.move", "steps.set", "epic.upsert", "question.withdraw"]
export function canUndo(entry: Pick<Page["activity"][number], "actor" | "action" | "undoneBy">) {
  if (entry.undoneBy !== null) return false
  return entry.action === "github.overwrite" || (entry.actor === "maestro" && undoable.includes(entry.action))
}

// The attachment kind the server stores for a dropped file, from its MIME type.
export function attachmentKind(mime: string) {
  if (mime.startsWith("image/")) return "image" as const
  if (mime.startsWith("video/")) return "video" as const
  if (/^(text\/|application\/(pdf|rtf|msword|vnd\.(openxmlformats-officedocument|oasis\.opendocument|ms-excel|ms-powerpoint)))/.test(mime))
    return "doc" as const
  return "file" as const
}

// A note is plain text that GitHub may mirror, so a pasted key must go to the vault instead. Returns the token that
// looks like a credential: a known prefix, a private key block, or a long unbroken run that is not a commit hash.
export function credential(text: string) {
  const known = text.match(/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}|\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bAKIA[A-Z0-9]{16}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}/)
  if (known) return known[0]
  return text.match(/[A-Za-z0-9_+=-]{32,}/g)?.find((token) => !/^[0-9a-f-]+$/i.test(token))
}

// Declared refusals arrive as the server's tagged JSON body; anything else (transport, parse) has no words to show.
export function refusal(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error) || !("message" in error)) return
  return typeof error.message === "string" && error.message ? error.message : undefined
}

// Intake shows every card until there are more than five; then cards group by theme (their epic, else their type).
export const intakeShown = 5
export function intake(snapshot: Pick<Snapshot, "issues" | "epics">) {
  const items = snapshot.issues.filter((issue) => issue.stage === "intake").sort((a, b) => b.stageEnteredAt - a.stageEnteredAt)
  if (items.length <= intakeShown) return { items, themes: [] }
  const theme = (issue: Issue) => {
    const epic = snapshot.epics.find((entry) => entry.number === issue.epic)
    return epic ? { id: `epic:${epic.number}`, epic: epic.title } : { id: `type:${issue.type}`, type: issue.type }
  }
  const themes = [...new Set(items.map((issue) => theme(issue).id))]
    .map((id) => {
      const members = items.filter((issue) => theme(issue).id === id)
      return { ...theme(members[0]), issues: members }
    })
    .sort((a, b) => b.issues.length - a.issues.length || a.id.localeCompare(b.id))
  return { items, themes }
}

// Every open question across projects, oldest first, with what each one holds up.
export function inbox(snapshots: readonly Snapshot[]) {
  return snapshots
    .flatMap((snapshot) =>
      snapshot.questions
        .filter((question) => question.status === "open")
        .map((question) => {
          const issue = snapshot.issues.find((entry) => entry.number === question.issue)
          return {
            key: snapshot.project.key,
            project: snapshot.project.name,
            targetDate: snapshot.project.targetDate,
            question,
            issue,
            blocks: issue ? snapshot.issues.filter((entry) => entry.dependsOn.includes(issue.ref)).map((entry) => entry.ref) : [],
          }
        }),
    )
    .sort((a, b) => a.question.timeCreated - b.question.timeCreated || a.question.id.localeCompare(b.question.id))
}

// Maestro's recommendation always comes first, so key 1 takes it.
export function options(question: Pick<Question, "options" | "recommended">) {
  return [...question.options].sort((a, b) => Number(b.id === question.recommended) - Number(a.id === question.recommended))
}

// Per project with open questions: how many, and which cards sit paused on one.
export function waits(snapshots: readonly Snapshot[]) {
  return snapshots.flatMap((snapshot) => {
    const open = snapshot.questions.filter((question) => question.status === "open")
    if (!open.length) return []
    const held = snapshot.issues.filter((issue) => issue.paused && open.some((question) => question.issue === issue.number))
    return [{ key: snapshot.project.key, project: snapshot.project.name, targetDate: snapshot.project.targetDate, questions: open.length, held: held.length }]
  })
}

// The owner's answers from the last seven days, newest first, each with the next thing Maestro did on that issue.
export function answered(activity: readonly Activity[], now: number) {
  const text = (row: Activity, field: string) => {
    const value = row.after?.[field]
    return typeof value === "string" ? value : undefined
  }
  return activity
    .filter((row) => row.action === "question.answer" && row.timeCreated >= now - 7 * day)
    .map((row) => ({
      id: row.id,
      ask: text(row, "id"),
      issue: row.issue,
      at: row.timeCreated,
      question: text(activity.find((ask) => ask.action === "question.ask" && text(ask, "id") === text(row, "id")) ?? row, "text"),
      option: text(row, "answer_option"),
      text: text(row, "answer_text"),
      next: activity.find((later) => later.actor === "maestro" && later.issue === row.issue && later.timeCreated > row.timeCreated),
    }))
    .sort((a, b) => b.at - a.at)
}

// The board as it stood at `at`: undo every row after it, newest first, from the row's own before values. Rows carry
// only the columns they changed, so anything else stays as it is now. An issue created after `at` disappears.
export function rewind(issues: readonly Issue[], activity: readonly Activity[], at: number) {
  return activity
    .filter((row) => row.timeCreated > at && row.issue !== null)
    .sort((a, b) => b.timeCreated - a.timeCreated || b.id.localeCompare(a.id))
    .reduce<Issue[]>((board, row) => {
      if (row.action === "issue.create") return board.filter((issue) => issue.number !== row.issue)
      const before = row.before
      if (!before) return board
      return board.map((issue) => (issue.number === row.issue ? restore(issue, before) : issue))
    }, [...issues])
}

function restore(issue: Issue, before: { readonly [x: string]: unknown }): Issue {
  const stage = (["intake", ...columns, "cut"] as const).find((entry) => entry === before.stage)
  return {
    ...issue,
    ...(stage ? { stage } : {}),
    ...(typeof before.position === "number" ? { position: before.position } : {}),
    ...(typeof before.stage_entered_at === "number" ? { stageEnteredAt: before.stage_entered_at } : {}),
    ...(typeof before.title === "string" ? { title: before.title } : {}),
    ...(typeof before.paused === "boolean" ? { paused: before.paused } : {}),
    ...(typeof before.seat === "string" || before.seat === null ? { seat: before.seat } : {}),
    ...(Array.isArray(before.steps) ? { steps: before.steps.filter(isStep) } : {}),
  }
}

function isStep(value: unknown): value is Issue["steps"][number] {
  return typeof value === "object" && value !== null && "title" in value && "status" in value
}

// Issues the replay touches: every issue named by a row after `at`.
export function changed(activity: readonly Activity[], at: number) {
  return new Set(activity.flatMap((row) => (row.timeCreated > at && row.issue !== null ? [row.issue] : [])))
}

// With many events, runs of Maestro's step updates fold into one entry so moves and answers stay readable.
export const foldAbove = 40
export function fold(activity: readonly Activity[]) {
  if (activity.length <= foldAbove) return activity.map((row) => ({ row, count: 1 }))
  return activity.reduce<{ row: Activity; count: number }[]>((entries, row) => {
    const last = entries.at(-1)
    if (last && last.row.action === "steps.set" && row.action === "steps.set") {
      return [...entries.slice(0, -1), { row, count: last.count + 1 }]
    }
    return [...entries, { row, count: 1 }]
  }, [])
}

// Quiet stretches of six hours or more. The scrubber hatches them as "No history" instead of drawing a smooth track.
export const gapAfter = 6 * 60 * 60 * 1000
export function gaps(times: readonly number[], start: number, end: number) {
  const points = [start, ...times.filter((time) => time > start && time < end).sort((a, b) => a - b), end]
  return points.slice(1).flatMap((time, index) => (time - points[index] >= gapAfter ? [{ from: points[index], to: time }] : []))
}

// Spend. A meter is dollars or an honest "not metered" with its source; it is never shown as a zero.
// The bar fills to the budget and stops there; the percent beside it may run past 100.
export function fill(percent: number | null) {
  if (percent === null || !Number.isFinite(percent)) return 0
  return Math.min(100, Math.max(0, percent))
}

// Cards sorted by spend, most first, ties by number so the list never shuffles.
export function costliest(cards: readonly CardSpend[]) {
  return [...cards].sort((a, b) => b.usd - a.usd || a.issue - b.issue)
}

// Models and seats the report names, biggest first, skipping zeros.
export function shares(rows: readonly { model: string; usd: number }[]) {
  return rows.filter((row) => row.usd > 0).sort((a, b) => b.usd - a.usd || a.model.localeCompare(b.model))
}

// Decisions newest first. An overturned decision keeps its place and names the decision that replaced it, so the log
// shows both versions; `replacedBy` and `replaces` resolve those links among the rows given.
export function chain(decisions: readonly Decision[]) {
  const byID = new Map(decisions.map((item) => [item.id, item]))
  return [...decisions]
    .sort((a, b) => b.date - a.date || a.id.localeCompare(b.id))
    .map((item) => ({
      decision: item,
      replacedBy: item.overturnedBy ? byID.get(item.overturnedBy) : undefined,
      replaces: item.supersedes ? byID.get(item.supersedes) : undefined,
    }))
}

// Whether the owner took a different option than the recommended one.
export function against(decision: Pick<Decision, "chosen" | "recommended">) {
  return decision.recommended !== "" && decision.chosen !== decision.recommended
}

// The proof panel's check list: the failing check first, then the rest in the order GitHub reports them.
export function proofChecks(proof: Pick<Proof, "ci">) {
  const checks = proof.ci?.checks ?? []
  const failing = proof.ci?.failing
  return [...checks].sort((a, b) => Number(b.name === failing) - Number(a.name === failing))
}

export function checkTick(check: Check): Tick {
  return ticks([check]).states[0]
}

// A due date typed in a date input is a calendar day; the board stores it as that day at UTC midnight.
export function dayInput(at: number | null | undefined) {
  if (at === null || at === undefined) return ""
  return new Date(at).toISOString().slice(0, 10)
}

export function dayValue(text: string) {
  if (!text) return null
  const at = Date.parse(`${text}T00:00:00Z`)
  return Number.isNaN(at) ? undefined : at
}

// A budget typed in dollars: empty clears it, anything that is not a non-negative number is rejected.
export function budgetValue(text: string) {
  const trimmed = text.trim().replace(/^\$/, "")
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

// Whole dollars stay whole ($18); anything with cents shows both ($2.40).
export function usd(value: number, locale: string) {
  const cents = Math.round(value * 100) % 100 !== 0
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value)
}

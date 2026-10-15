import { Effect, Ref } from "effect"
import { isUsefulFinding, type Finding, type Report } from "./scan"

export interface SchedulerConfig {
  readonly intervalMinutes: number
  readonly dedupeHours: number
}

export interface SchedulerState {
  readonly snoozedUntil: number
  readonly seen: Record<string, number>
  readonly currentKey?: string
}

export interface ReportEvent {
  readonly report: Report
  readonly notify: boolean
}

const MaxSeen = 1024
const MaxDelayMs = 2_147_483_647
const MaxSnoozeMinutes = 7 * 24 * 60

export function makeState(): SchedulerState {
  return { snoozedUntil: 0, seen: {} }
}

export function defaultConfig(): SchedulerConfig {
  return { intervalMinutes: 15, dedupeHours: 24 }
}

export function nextDelayMs(config: SchedulerConfig) {
  const minutes = Number.isFinite(config.intervalMinutes) ? config.intervalMinutes : 15
  return Math.min(Math.max(1, minutes) * 60_000, MaxDelayMs)
}

export function isSnoozed(state: SchedulerState, now: number) {
  return now < state.snoozedUntil
}

export function snooze(state: SchedulerState, minutes: number, now: number): SchedulerState {
  const span = Number.isFinite(minutes) ? minutes : 60
  const clock = Number.isFinite(now) ? now : Date.now()
  const duration = Math.min(Math.max(1, span), MaxSnoozeMinutes)
  return { ...state, snoozedUntil: clock + duration * 60_000 }
}

export function findingKey(kind: string, summary: string) {
  return `${kind}\n${summary}`
}

export function reportKey(report: Report) {
  return report.findings
    .map((item) => `${findingKey(item.kind, item.summary)}\n${item.severity}`)
    .sort()
    .join("\u0000")
}

export function filterFresh(findings: ReadonlyArray<Finding>, state: SchedulerState, now: number, dedupeMs: number) {
  const fresh: Finding[] = []
  const clock = Number.isFinite(now) ? now : Date.now()
  const seen = Object.fromEntries(
    Object.entries(state.seen).filter(([, last]) => last <= clock && clock - last < dedupeMs),
  )
  for (const item of findings) {
    const key = findingKey(item.kind, item.summary)
    const last = seen[key]
    if (last !== undefined && clock - last < dedupeMs) continue
    seen[key] = clock
    fresh.push(item)
  }
  const bounded = Object.fromEntries(
    Object.entries(seen)
      .sort(([, left], [, right]) => right - left)
      .slice(0, MaxSeen),
  )
  return { fresh, state: { ...state, seen: bounded } }
}

export function dedupeMs(config: SchedulerConfig) {
  const hours = Number.isFinite(config.dedupeHours) ? config.dedupeHours : 24
  return Math.min(Math.max(1, hours) * 3_600_000, Number.MAX_SAFE_INTEGER)
}

export function processReport(report: Report, state: SchedulerState, now: number, dedupeMsValue: number) {
  const next = filterFresh(report.findings, state, now, dedupeMsValue)
  const currentKey = reportKey(report)
  const changed = currentKey !== state.currentKey
  if (!changed && next.fresh.length === 0) return { state: next.state }
  return {
    state: { ...next.state, currentKey },
    event: { report, notify: report.findings.some(isUsefulFinding) } satisfies ReportEvent,
  }
}

function tick<R, E>(
  fetchReport: Effect.Effect<Report, E, R>,
  config: SchedulerConfig,
  ref: Ref.Ref<SchedulerState>,
  emit: (event: ReportEvent) => Effect.Effect<void>,
) {
  return Effect.gen(function* () {
    const state = yield* Ref.get(ref)
    const now = Date.now()
    if (isSnoozed(state, now)) return
    const report = yield* fetchReport.pipe(Effect.catch(() => Effect.succeed(null)))
    if (report === null) return
    const next = processReport(report, state, now, dedupeMs(config))
    yield* Ref.set(ref, next.state)
    if (!next.event) return
    yield* emit(next.event).pipe(Effect.catch(() => Effect.void))
  })
}

export function loop<R, E>(
  fetchReport: Effect.Effect<Report, E, R>,
  config: SchedulerConfig,
  ref: Ref.Ref<SchedulerState>,
  emit: (event: ReportEvent) => Effect.Effect<void>,
) {
  const delay = nextDelayMs(config)
  return Effect.forever(tick(fetchReport, config, ref, emit).pipe(Effect.andThen(Effect.sleep(`${delay} millis`))))
}

export function snoozeRef(ref: Ref.Ref<SchedulerState>, minutes: number) {
  return Ref.update(ref, (state) => snooze(state, minutes, Date.now()))
}

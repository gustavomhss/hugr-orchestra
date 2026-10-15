export const JanitorReportChannel = "janitor-report" as const
const MaxReportBytes = 256 * 1024

export interface JanitorState {
  reportJson: string | null
  snoozedUntil: number
  source: string | null
  notify: boolean
  dismissedReportJson: string | null
  dismissedSource: string | null
}

export function createState(initial: Partial<JanitorState> = {}): JanitorState {
  return {
    reportJson: validReport(initial.reportJson) ? initial.reportJson : null,
    snoozedUntil:
      typeof initial.snoozedUntil === "number" && Number.isFinite(initial.snoozedUntil)
        ? Math.max(0, initial.snoozedUntil)
        : 0,
    source: typeof initial.source === "string" ? initial.source : null,
    notify: initial.notify !== false,
    dismissedReportJson: validReport(initial.dismissedReportJson) ? initial.dismissedReportJson : null,
    dismissedSource: typeof initial.dismissedSource === "string" ? initial.dismissedSource : null,
  }
}

export function validReport(value: unknown): value is string {
  if (typeof value !== "string") return false
  if (value.length === 0 || Buffer.byteLength(value, "utf8") > MaxReportBytes) return false
  return true
}

export function setReport(state: JanitorState, value: unknown, source: string | null = null, notify = true): boolean {
  if (!validReport(value)) return false
  state.reportJson = value
  state.source = source
  state.notify = notify
  return true
}

export function getReport(state: JanitorState, now = Date.now()) {
  if (isSnoozed(state, now)) return null
  return state.reportJson
}

export function getReportEnvelope(state: JanitorState, now = Date.now()) {
  const report = getReport(state, now)
  return report === null ? null : { report, source: state.source }
}

export function isDismissed(state: JanitorState, value: unknown, source: string | null) {
  return state.dismissedReportJson === value && state.dismissedSource === source
}

export function dismiss(state: JanitorState) {
  state.dismissedReportJson = state.reportJson
  state.dismissedSource = state.source
  state.reportJson = null
  state.source = null
  state.notify = false
}

export function snooze(state: JanitorState, minutes: number, now = Date.now()) {
  const span = Number.isFinite(minutes) ? minutes : 60
  const duration = Math.min(Math.max(1, span), 7 * 24 * 60)
  state.snoozedUntil = now + duration * 60_000
}

export function isSnoozed(state: JanitorState, now = Date.now()) {
  return now < state.snoozedUntil
}

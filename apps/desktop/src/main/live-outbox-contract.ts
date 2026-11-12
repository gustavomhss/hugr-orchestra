import type { MeetingSegment } from "./live-meeting-client"

export type OutboxTarget = {
  readonly profileID: string
  readonly mode: "shared" | "owned"
  readonly authority: string
  readonly directory: string
}
export type OutboxMeeting = {
  readonly id: string
  readonly sessionID: string
  readonly timeStarted: number
  readonly title: string
}
export type OutboxStatus = "sending" | "paused" | "blocked" | "interrupted" | "storage-error"
export type OutboxReason = "offline" | "deadline" | "authentication" | "target" | "missing" | "ended" | "conflict" | "storage" | "quota" | "shutdown"
export type OutboxRecord = {
  readonly id: string
  readonly target: OutboxTarget
  readonly meeting: OutboxMeeting
  readonly closeRequested: boolean
  readonly sealed: boolean
  readonly status: OutboxStatus
  readonly reason?: OutboxReason
  readonly failures: number
}
export type OutboxSummary = OutboxRecord & { readonly pendingCount: number; readonly pendingBytes: number; readonly rememberedCount: number }
export type OutboxBatch = {
  readonly record: OutboxRecord
  readonly segments: ReadonlyArray<MeetingSegment>
  readonly ids: ReadonlyArray<string>
}
export type RemoteClosed = {
  readonly target: OutboxTarget
  readonly meetingID: string
  readonly sessionID: string
  readonly timeStarted: number
  readonly timeEnded: number
}
export type OutboxErrorReason = "storage" | "quota" | "invalid" | "conflict" | "missing" | "closed"

export type LiveOutbox = {
  readonly profileID: string
  assertCanCreate(): void
  create(input: { readonly id: string; readonly target: OutboxTarget; readonly meeting: OutboxMeeting }): OutboxSummary
  append(id: string, segment: MeetingSegment): "accepted" | "duplicate"
  requestClose(id: string): void
  seal(id: string): void
  acknowledge(id: string, exactPrefixIDs: ReadonlyArray<string>): void
  complete(id: string, confirmed: RemoteClosed): void
  setStatus(id: string, input: { readonly status: OutboxStatus; readonly reason?: OutboxReason; readonly failures: number }): void
  summary(id: string): OutboxSummary
  list(): ReadonlyArray<OutboxSummary>
  batch(id: string): OutboxBatch
  export(id: string): { readonly record: OutboxRecord; readonly segments: ReadonlyArray<MeetingSegment>; readonly receipts: ReadonlyArray<{ readonly id: string; readonly sha256: string; readonly acknowledged: boolean }> }
  discard(id: string): void
  close(): void
}

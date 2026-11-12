import type { OutboxMeeting, OutboxSummary, OutboxTarget, LiveOutbox } from "./live-outbox-contract"
import type { MeetingSegment, MeetingServer } from "./live-meeting-client"

export type DeliveryFailureReason = "active" | "closed" | "cancelled" | "storage" | "quota" | "target" | "offline" | "deadline" | "authentication" | "missing" | "ended" | "conflict"
export type DeliveryAction = { readonly ok: true } | { readonly ok: false; readonly reason: DeliveryFailureReason }
export type LiveDeliveryConnection = {
  readonly mode: "shared" | "owned"
  readonly epoch: object
  readonly server: MeetingServer
}
export type DeliveryItem = OutboxSummary & {
  readonly activeProducer: boolean
  readonly unsaved: "none" | "retained" | "unavailable"
  readonly unsavedBytes?: number
}
export type UnconfirmedStart = {
  readonly id: string
  readonly sessionID: string
  readonly title: string
  readonly reason: DeliveryFailureReason
  readonly target?: OutboxTarget
  readonly meeting?: OutboxMeeting
}
export type DeliverySnapshot = {
  readonly state: "ready" | "storage-error" | "closed"
  readonly items: ReadonlyArray<DeliveryItem>
  readonly unconfirmedStarts: ReadonlyArray<UnconfirmedStart>
}
export type DeliveryExport =
  | { readonly kind: "stored"; readonly data: ReturnType<LiveOutbox["export"]>; readonly unsaved?: MeetingSegment; readonly unsavedUnavailable: boolean }
  | { readonly kind: "unconfirmed"; readonly data: UnconfirmedStart }
  | { readonly kind: "storage-unavailable"; readonly id: string; readonly unsaved?: MeetingSegment; readonly unsavedUnavailable: boolean }
export type LiveDeliveryProducer = {
  readonly localID: string
  readonly meetingID: string
  readonly signal: AbortSignal
  append(segment: MeetingSegment): "accepted" | "duplicate" | "refused"
  requestClose(): DeliveryAction
  /** Caller has joined capture/STT/final callbacks. Releases the producer lease even if sealing fails. */
  seal(): DeliveryAction
  /** Caller has joined its resources; release lease without claiming final segments were flushed or sealed. */
  abandon(): void
}
export type LiveDeliveryManager = {
  start(input: { readonly sessionID: string; readonly title: string }, signal: AbortSignal): Promise<LiveDeliveryProducer>
  snapshot(): DeliverySnapshot
  retry(id: string): DeliveryAction
  finish(id: string): DeliveryAction
  discard(id: string): Promise<DeliveryAction>
  export(id: string): DeliveryExport
  shutdown(): Promise<void>
}
export type LiveDeliveryOptions = {
  readonly store: LiveOutbox
  readonly connection: (signal: AbortSignal) => Promise<LiveDeliveryConnection>
  readonly onChange?: () => void
  /** Private deterministic backoff port only; HTTP's real 10s deadline never uses this seam. */
  readonly sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

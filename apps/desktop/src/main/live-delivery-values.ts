import { LiveDeliveryError } from "./live-delivery-error.ts"
import { isLocalID } from "./live-delivery-id.ts"
import type { LiveDeliveryConnection } from "./live-delivery-contract.ts"
import type { OutboxMeeting, OutboxRecord, OutboxTarget } from "./live-outbox-contract.ts"
import type { MeetingSegment } from "./live-meeting-client.ts"

export type DeliveryConnection = {
  readonly mode: "shared" | "owned"
  readonly epoch: object
  readonly url: string
  readonly origin: string
  readonly username?: string
  readonly password?: string
  readonly directory?: string
}
export type DeliveryInfo = OutboxMeeting & { readonly timeEnded: number | null }
export type DeliveryIdentity = { readonly directory: string; readonly meeting: DeliveryInfo }

export const serializedBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8")
export { isLocalID }
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)

export function deliveryObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new LiveDeliveryError("target")
  return value as Record<string, unknown>
}

export function deliveryConnection(value: LiveDeliveryConnection): DeliveryConnection {
  const root = deliveryObject(value), server = deliveryObject(root.server)
  if ((root.mode !== "shared" && root.mode !== "owned") || !root.epoch || (typeof root.epoch !== "object" && typeof root.epoch !== "function") || typeof server.url !== "string" || (server.username !== undefined && typeof server.username !== "string") || (server.password !== undefined && typeof server.password !== "string") || (server.directory !== undefined && (typeof server.directory !== "string" || !server.directory))) throw new LiveDeliveryError("target")
  const url = URL.parse(server.url)
  if (!url || !["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/" || (server.url !== url.origin && server.url !== `${url.origin}/`)) throw new LiveDeliveryError("target")
  return { mode: root.mode, epoch: root.epoch, url: server.url, origin: url.origin, username: server.username, password: server.password, directory: server.directory }
}

export function sameConnection(a: DeliveryConnection, b: DeliveryConnection) {
  return a.epoch === b.epoch && a.mode === b.mode && a.url === b.url && a.username === b.username && a.password === b.password && a.directory === b.directory
}

export function deliveryIdentity(value: unknown, detail: boolean): DeliveryIdentity {
  const envelope = deliveryObject(value), location = deliveryObject(envelope.location), data = deliveryObject(envelope.data)
  const project = deliveryObject(location.project), info = detail ? deliveryObject(data.meeting) : data
  if (typeof location.directory !== "string" || !location.directory || location.workspaceID !== undefined || typeof project.id !== "string" || !project.id || typeof project.directory !== "string" || !project.directory || typeof info.id !== "string" || !info.id.startsWith("mtg_") || typeof info.sessionID !== "string" || !info.sessionID.startsWith("ses_") || typeof info.title !== "string" || !finite(info.timeStarted) || (info.timeEnded !== null && !finite(info.timeEnded))) throw new LiveDeliveryError("target")
  if (detail) { if (!Array.isArray(data.segments)) throw new LiveDeliveryError("target"); deliveryObject(data.summary); deliveryObject(data.card) }
  return { directory: location.directory, meeting: { id: info.id, sessionID: info.sessionID, title: info.title, timeStarted: info.timeStarted, timeEnded: info.timeEnded } }
}

export function matchesRecord(identity: DeliveryIdentity, record: Pick<OutboxRecord, "target" | "meeting">) {
  return identity.directory === record.target.directory && identity.meeting.id === record.meeting.id && identity.meeting.sessionID === record.meeting.sessionID && identity.meeting.timeStarted === record.meeting.timeStarted
}

export function sameTarget(a: OutboxTarget, b: OutboxTarget) {
  return a.profileID === b.profileID && a.mode === b.mode && a.authority === b.authority && a.directory === b.directory
}

export function admittedSegment(value: MeetingSegment): MeetingSegment {
  if (!value || !isLocalID(value.id) || (value.track !== "me" && value.track !== "them") || typeof value.text !== "string" || !finite(value.startMs) || !finite(value.endMs)) throw new LiveDeliveryError("conflict")
  if (value.text.length > 256 * 1024) throw new LiveDeliveryError("quota")
  const segment = { id: value.id, track: value.track, text: value.text, startMs: value.startMs, endMs: value.endMs }
  if (serializedBytes(segment) > 256 * 1024) throw new LiveDeliveryError("quota")
  return segment
}

export function comparePending(value: unknown, pending: readonly MeetingSegment[]) {
  const root = deliveryObject(value), data = deliveryObject(root.data)
  if (!Array.isArray(data.segments)) throw new LiveDeliveryError("target")
  const local = new Map(pending.map((segment) => [segment.id, segment]))
  for (const candidate of data.segments) {
    const remote = deliveryObject(candidate)
    if (typeof remote.id !== "string") throw new LiveDeliveryError("target")
    const expected = local.get(remote.id)
    if (!expected) continue
    if (remote.track !== expected.track || remote.text !== expected.text || remote.startMs !== expected.startMs || remote.endMs !== expected.endMs) throw new LiveDeliveryError("conflict")
  }
}

export function startInput(value: { sessionID: string; title: string }) {
  if (!value || typeof value.sessionID !== "string" || !value.sessionID.startsWith("ses_") || typeof value.title !== "string") throw new LiveDeliveryError("conflict")
  if (value.title.length > 4096 || value.sessionID.length > 16 * 1024 || Buffer.byteLength(value.title, "utf8") > 4096 || serializedBytes(value) > 16 * 1024) throw new LiveDeliveryError("quota")
  return { sessionID: value.sessionID, title: value.title }
}

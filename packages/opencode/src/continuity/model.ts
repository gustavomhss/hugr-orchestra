import type { MessageID, SessionID } from "@/session/schema"

export const threshold = 50_000

export type Snapshot = {
  sessionID: SessionID
  boundary: MessageID
  tailStart: MessageID
}

export type ContinuityContext = Snapshot & {
  text: string
}

export function isCurrent(snapshot: Snapshot, latest: MessageID | undefined) {
  return snapshot.boundary === latest
}

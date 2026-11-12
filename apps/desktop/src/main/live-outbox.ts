import type { LiveOutbox, OutboxErrorReason } from "./live-outbox-contract"

export class OutboxError extends Error {
  constructor(readonly reason: OutboxErrorReason) {
    super("Live delivery storage refused the operation.")
    this.name = "OutboxError"
  }
}

// Private scaffold: the reviewed acceptance suite precedes the implementation.
export function openLiveOutbox(_userData: string): LiveOutbox {
  throw new OutboxError("storage")
}

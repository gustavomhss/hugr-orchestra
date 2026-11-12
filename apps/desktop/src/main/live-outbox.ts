import type { LiveOutbox, OutboxErrorReason } from "./live-outbox-contract"

export class OutboxError extends Error {
  readonly reason: OutboxErrorReason

  constructor(reason: OutboxErrorReason) {
    super("Live delivery storage refused the operation.")
    this.name = "OutboxError"
    this.reason = reason
  }
}

// Private scaffold: the reviewed acceptance suite precedes the implementation.
export function openLiveOutbox(_userData: string): LiveOutbox {
  throw new OutboxError("storage")
}

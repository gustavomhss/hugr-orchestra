import { OutboxError } from "./live-outbox.ts"
import type { DeliveryFailureReason } from "./live-delivery-contract.ts"
import type { DeliveryConnection } from "./live-delivery-values.ts"

export class LiveDeliveryError extends Error {
  readonly reason: DeliveryFailureReason

  constructor(reason: DeliveryFailureReason) {
    super("Live meeting delivery is unavailable")
    this.name = "LiveDeliveryError"
    this.reason = reason
  }
}

// HTTP ownership metadata stays private; public start rejection is always a fresh LiveDeliveryError.
export class DeliveryRequestError extends LiveDeliveryError {
  readonly transient: boolean
  readonly connection: DeliveryConnection | undefined

  constructor(reason: DeliveryFailureReason, transient: boolean, connection?: DeliveryConnection) {
    super(reason)
    this.transient = transient
    this.connection = connection
  }
}

export class DeliveryStaleError extends LiveDeliveryError {
  constructor() { super("target") }
}

export function deliveryReason(error: unknown): DeliveryFailureReason {
  if (error instanceof LiveDeliveryError) return error.reason
  if (error instanceof OutboxError) return error.reason === "invalid" ? "conflict" : error.reason
  return "storage"
}

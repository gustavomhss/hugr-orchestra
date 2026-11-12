import type { DeliveryFailureReason, LiveDeliveryManager, LiveDeliveryOptions } from "./live-delivery-contract"

export class LiveDeliveryError extends Error {
  readonly reason: DeliveryFailureReason

  constructor(reason: DeliveryFailureReason) {
    super("Live meeting delivery is unavailable")
    this.name = "LiveDeliveryError"
    this.reason = reason
  }
}

// Refusing scaffold: no capture, network, storage mutation or fallback before contract acceptance.
export function createLiveDeliveryManager(_options: LiveDeliveryOptions): LiveDeliveryManager {
  throw new LiveDeliveryError("closed")
}

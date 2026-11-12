import type { DeliveryFailureReason, LiveDeliveryManager, LiveDeliveryOptions } from "./live-delivery-contract"

export class LiveDeliveryError extends Error {
  constructor(readonly reason: DeliveryFailureReason) {
    super("Live meeting delivery is unavailable")
    this.name = "LiveDeliveryError"
  }
}

// Refusing scaffold: no capture, network, storage mutation or fallback before contract acceptance.
export function createLiveDeliveryManager(_options: LiveDeliveryOptions): LiveDeliveryManager {
  throw new LiveDeliveryError("closed")
}

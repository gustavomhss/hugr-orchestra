import assert from "node:assert/strict"
import { createLiveDeliveryManager, LiveDeliveryError } from "./live-delivery-manager.ts"
import type { DeliveryFailureReason, LiveDeliveryOptions } from "./live-delivery-contract.ts"
import { pause, segment } from "./live-delivery-manager-test.fixture.ts"
import type { Fixture } from "./live-delivery-manager-test.fixture.ts"

function attach(f: Fixture, options: Partial<Omit<LiveDeliveryOptions, "store">> = {}) {
  const manager = createLiveDeliveryManager({ store: f.store, connection: async () => f.current.value, sleep: async () => { await pause(1) }, ...options })
  f.own(() => manager.shutdown())
  return manager
}
function rejected(reason: DeliveryFailureReason) {
  return (error: unknown) => {
    assert.ok(error instanceof LiveDeliveryError); assert.equal(error.reason, reason)
    assert.ok(error.message.length > 0 && error.message.length <= 128)
    assert.ok(!error.message.includes("private-secret") && !error.message.includes(segment().text)); assert.equal(error.cause, undefined)
    return true
  }
}

export { attach, rejected }

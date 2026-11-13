import type { LiveRecoveryAction } from "@orchestra/app/live"
import type { DeliveryExport } from "./live-delivery-contract"

export async function exportLiveRecovery(_data: DeliveryExport, _options: {
  readonly signal: AbortSignal
  readonly choose: () => Promise<string | undefined>
}): Promise<LiveRecoveryAction> {
  return { ok: false, reason: "closed" }
}

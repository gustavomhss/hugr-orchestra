import type { LiveRecoveryAction, LiveRecoveryPort } from "@orchestra/app/live"
import type { DeliveryExport, LiveDeliveryCompletion, LiveDeliveryConnection, LiveDeliveryManager } from "./live-delivery-contract"

export type LiveDeliveryOwner = {
  readonly manager: LiveDeliveryManager
  readonly recovery: LiveRecoveryPort
  canStart(): boolean
  connection(signal: AbortSignal): Promise<LiveDeliveryConnection>
  setConnection(connection: LiveDeliveryConnection): Promise<void>
  invalidate(): Promise<void>
  onComplete(listener: (completion: LiveDeliveryCompletion) => void): () => void
  shutdown(): Promise<void>
}

export type LiveDeliveryOwnerOptions = {
  readonly userData: string
  readonly stopCapture: (reason: "rotation" | "quit") => Promise<void>
  readonly exportData: (data: DeliveryExport, signal: AbortSignal) => Promise<LiveRecoveryAction>
}

import type { LeanCoverage } from "@orchestra/schema/lean-coverage"
import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

/** Presentation receives profile-bound backend data; transport/controller owns requests. */
export interface LeanViewProps {
  readonly profileName: string
  readonly data?: LeanDashboard.Info
  readonly loading: boolean
  readonly error?: string
  readonly pending?: ReadonlySet<LeanCoverage.ItemID | "profile">
  readonly history?: LeanDashboard.History
  readonly historyLoading?: boolean
  readonly historyError?: string
  readonly onUpdate: (value: LeanDashboard.Update) => void | Promise<void>
  readonly onHistory: (itemID: LeanCoverage.ItemID) => void
  readonly onRefresh: () => void
  readonly onOpenSession?: (sessionID: string) => void
}

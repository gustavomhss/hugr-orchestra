import type { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { reconcile } from "solid-js/store"

export function applySnapshot(snapshot: ActivityMonitor.Snapshot) {
  // Replacing the root snapshot property clears stale optional fields for a new server lifetime.
  return (state: { snapshot: ActivityMonitor.Snapshot | undefined }) => ({
    snapshot:
      state.snapshot?.instanceID === snapshot.instanceID
        ? reconcile(snapshot, { key: "recordID" })(state.snapshot)
        : snapshot,
  })
}

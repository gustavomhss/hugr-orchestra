export * as EventCompaction from "./compaction"

// Recorded in `data_migration` when durable rows were deleted from the event log, leaving sequence gaps. Seal
// verification then reports the history as compacted instead of broken, and workspace sync refuses to replay it.
export const SNAPSHOT_COMPACTION_MARKER = "event_snapshot_compaction"

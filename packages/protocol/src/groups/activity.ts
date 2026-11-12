import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { ConflictError, InvalidRequestError, ServiceUnavailableError } from "../errors"

export const ActivityGroup = HttpApiGroup.make("server.activity")
  .add(
    HttpApiEndpoint.get("activity.worktrees", "/api/activity/worktrees", {
      success: ActivityMonitor.WorktreeSnapshot,
      error: ServiceUnavailableError,
    }),
  )
  .add(
    HttpApiEndpoint.post("activity.readWorktree", "/api/activity/worktrees/:recordID/read", {
      params: { recordID: Schema.NonEmptyString },
      success: ActivityMonitor.WorktreeSnapshot,
      error: [InvalidRequestError, ConflictError, ServiceUnavailableError],
    }).annotateMerge(
      OpenApi.annotations({
        summary: "Measure one registered git worktree",
        description:
          "Explicit bounded metadata reading by opaque record ID. Persisted registration is rechecked before and after measurement. No arbitrary path, cleanup, owner inference, unique-byte total or use proof is exposed.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("activity.disk", "/api/activity/disk", {
      success: ActivityMonitor.DiskSnapshot,
    }),
  )
  .add(
    HttpApiEndpoint.post("activity.readDisk", "/api/activity/disk/:rootID/read", {
      params: { rootID: ActivityMonitor.DiskRootID },
      success: ActivityMonitor.DiskSnapshot,
    }).annotateMerge(
      OpenApi.annotations({
        summary: "Measure a declared Orchestra disk root",
        description:
          "Explicit bounded metadata walk of cache, logs or temporary files. No arbitrary path, mutation, use proof or unique-byte total is exposed. Snapshot reads never start a walk.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("activity.snapshot", "/api/activity", {
      success: ActivityMonitor.Snapshot,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "activity.snapshot",
        summary: "Read observed Omni pipe processes",
        description:
          "Read this server's spawn ledger and previously requested membership readings. Refresh does not enumerate OS processes. No process control is exposed.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.get("activity.inspect", "/api/activity/:recordID/inspection", {
      params: { recordID: Schema.NonEmptyString },
      success: ActivityMonitor.Snapshot,
      error: InvalidRequestError,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "activity.inspect",
        summary: "Read the members of a recorded Omni spawn",
        description:
          "Explicitly query supervisor membership for an observation and return the ledger. May enumerate OS processes. An observation UUID addresses this read only; it never authorizes process control.",
      }),
    ),
  )

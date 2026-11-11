import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"

export const ActivityGroup = HttpApiGroup.make("server.activity")
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

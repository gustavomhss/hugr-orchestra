import { InvalidRequestError } from "@orchestra/protocol/errors"
import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Schema } from "effect"
import { check } from "./assertions"
import { http, route } from "./dsl"
import type { Scenario } from "./types"

const diskSnapshotPath = "/api/activity/disk"
const diskReadPath = "/api/activity/disk/{rootID}/read"
const invalidDiskRead = { path: route(diskReadPath, { rootID: "httpapi-missing" }) }
const decodeDiskSnapshot = Schema.decodeUnknownSync(ActivityMonitor.DiskSnapshot)

export const activityScenarios: Scenario[] = [
  http.protected
    .get("/api/activity", "activity.snapshot")
    .global()
    .json(200, (body) => Schema.decodeUnknownSync(ActivityMonitor.Snapshot)(body), "status"),
  http.protected
    .get("/api/activity/{recordID}/inspection", "activity.inspect")
    .global()
    .at(() => ({ path: route("/api/activity/{recordID}/inspection", { recordID: "httpapi-missing" }) }))
    .json(400, missingRecord, "status"),
  http.protected
    .get("/api/activity/worktrees", "activity.worktrees")
    .global()
    .json(
      200,
      (body) => {
        const snapshot = Schema.decodeUnknownSync(ActivityMonitor.WorktreeSnapshot)(body)
        check(snapshot.inventoryAt !== undefined, "worktree inventory should report when it checked registrations")
        check(snapshot.records.length === 0, "an empty exercise database should report no worktrees")
      },
      "status",
    ),
  http.protected
    .post("/api/activity/worktrees/{recordID}/read", "activity.readWorktree")
    .global()
    .at(() => ({ path: route("/api/activity/worktrees/{recordID}/read", { recordID: "httpapi-missing" }) }))
    .json(400, missingRecord, "status"),
  http.protected
    .get("/api/activity/docker", "activity.docker")
    .global()
    .json(200, (body) => Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)(body), "status"),
  http.protected
    .post("/api/activity/docker/read", "activity.readDocker")
    .global()
    .probe({ path: "/api/activity/docker/read" })
    .json(
      200,
      (body) => {
        const snapshot = Schema.decodeUnknownSync(ActivityMonitor.DockerSnapshot)(body)
        check(snapshot.snapshotRevision === "1", "expected the first Docker attempt")
        check(snapshot.attempt?.state === "complete", "expected the fixture's Docker read to complete")
        check(snapshot.inventory?.containers[0]?.containerID === "exercise-container", "expected the fixture container")
      },
      "status",
    ),
  http.protected
    .get("/api/activity/external-caches", "activity.externalCaches")
    .global()
    .json(200, (body) => Schema.decodeUnknownSync(ActivityMonitor.ExternalCacheSnapshot)(body), "status"),
  http.protected
    .post("/api/activity/external-caches/{id}/read", "activity.readExternalCache")
    .global()
    .at(() => ({ path: route("/api/activity/external-caches/{id}/read", { id: "httpapi-missing" }) }))
    .json(400, (body) => {
      const error = Schema.decodeUnknownSync(InvalidRequestError)(body)
      check(error.field === "id", "the external cache must have a known opaque ID")
    }, "status"),
  http.protected
    .get(diskSnapshotPath, "activity.disk")
    .global()
    .json(
      200,
      (body) => {
        const snapshot = decodeDiskSnapshot(body)
        check(
          snapshot.roots.map((root) => root.id).join(",") === "cache,logs,temporary",
          "expected all declared disk roots",
        )
        check(
          snapshot.roots.every((root) => root.attempt === undefined),
          "disk snapshot should leave fresh roots unread",
        )
      },
      "status",
    ),
  // The focused HTTP suite measures an actual declared root. This probe needs no filesystem fixture.
  http.protected
    .post(diskReadPath, "activity.readDisk")
    .global()
    .at(() => invalidDiskRead)
    .json(
      400,
      (body) => {
        const error = Schema.decodeUnknownSync(InvalidRequestError)(body)
        check(error.kind === "Params", "unknown disk root should be rejected as a path parameter")
      },
      "status",
    ),
]

function missingRecord(body: unknown) {
  const error = Schema.decodeUnknownSync(InvalidRequestError)(body)
  check(error.field === "recordID", "unknown observation should be rejected by record ID")
}

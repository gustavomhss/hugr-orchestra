export * as ActivityDocker from "./activity-docker"

import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Effect, Schema } from "effect"
import type { AppProcess } from "./process"

export class ReadUnavailable extends Schema.TaggedErrorClass<ReadUnavailable>()("DockerReadUnavailable", {}) {}

export interface Monitor {
  readonly snapshot: () => ActivityMonitor.DockerSnapshot
  readonly read: () => Effect.Effect<ActivityMonitor.DockerSnapshot, ReadUnavailable, AppProcess.Service>
}

// D1-A publishes an unread snapshot and refuses explicit reads until the bounded collector is implemented.
export function make(): Monitor {
  const instanceID = crypto.randomUUID()
  return {
    snapshot: () => ({
      instanceID,
      snapshotRevision: "0",
      readAt: Date.now(),
      source: ActivityMonitor.dockerSource,
      coverage: "containers",
    }),
    read: () => Effect.fail(new ReadUnavailable()),
  }
}

export * as ActivityDocker from "./activity-docker"

import { ActivityMonitor } from "@orchestra/schema/activity-monitor"
import { Clock, Deferred, Effect, Option, Schema } from "effect"
import { PlatformError } from "effect/PlatformError"
import { ChildProcess } from "effect/unstable/process"
import { isUtf8 } from "node:buffer"
import { AppProcess } from "./process"

export class ReadUnavailable extends Schema.TaggedErrorClass<ReadUnavailable>()("DockerReadUnavailable", {}) {}

export interface Monitor {
  readonly snapshot: () => ActivityMonitor.DockerSnapshot
  readonly read: () => Effect.Effect<ActivityMonitor.DockerSnapshot, ReadUnavailable, AppProcess.Service>
}

const command = ChildProcess.make("docker", ["container", "ls", "--all", "--no-trunc", "--size", "--format", "json"])
const limits = { timeout: 5_000, maxOutputBytes: 262_144, maxErrorBytes: 16_384 }

type Incomplete = {
  state: "partial" | "failed" | "unavailable"
  gaps: ReadonlyArray<ActivityMonitor.DockerGap>
}
type Outcome = Incomplete | { state: "complete"; containers: ActivityMonitor.DockerInventory["containers"] }

export function make(): Monitor {
  let current: ActivityMonitor.DockerSnapshot = {
    instanceID: crypto.randomUUID(),
    snapshotRevision: "0",
    readAt: Date.now(),
    source: ActivityMonitor.dockerSource,
    coverage: "containers",
  }
  let flight: Deferred.Deferred<ActivityMonitor.DockerSnapshot, ReadUnavailable> | undefined

  const refresh = Effect.gen(function* () {
    const processService = yield* Effect.serviceOption(AppProcess.Service)
    if (Option.isNone(processService)) return yield* new ReadUnavailable()

    const startedAt = yield* Clock.currentTimeMillis
    const outcome: Outcome = processService.value.omniEnabled
      ? yield* processService.value
          .run(command, limits)
          .pipe(Effect.match({ onSuccess: classifyResult, onFailure: classifyError }))
      : { state: "unavailable", gaps: ["process-unavailable"] }
    const sampledAt = yield* Clock.currentTimeMillis
    const header = {
      instanceID: current.instanceID,
      snapshotRevision: (BigInt(current.snapshotRevision) + 1n).toString(),
      readAt: sampledAt,
      source: current.source,
      coverage: current.coverage,
    }
    current =
      outcome.state === "complete"
        ? {
            ...header,
            inventory: { sampledAt, containers: outcome.containers },
            attempt: { state: "complete", startedAt, sampledAt, gaps: [] },
          }
        : {
            ...header,
            ...(current.inventory && { inventory: current.inventory }),
            attempt: { state: outcome.state, startedAt, sampledAt, gaps: outcome.gaps },
          }
    return current
  })

  return {
    snapshot: () => ({ ...current, readAt: Date.now() }),
    read: () =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          if (flight) return yield* restore(Deferred.await(flight))

          const done = Deferred.makeUnsafe<ActivityMonitor.DockerSnapshot, ReadUnavailable>()
          flight = done
          // The bounded flight belongs to the monitor, so cancelling a waiter cannot cancel other readers' sample.
          yield* Effect.forkDetach(
            restore(refresh).pipe(
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  flight = undefined
                  Deferred.doneUnsafe(done, exit)
                }),
              ),
            ),
          )
          return yield* restore(Deferred.await(done))
        }),
      ),
  }
}

function truncationGaps(output: AppProcess.StreamTruncation) {
  const gaps: ActivityMonitor.DockerGap[] = []
  if (output.stdoutTruncated) gaps.push("stdout-truncated")
  if (output.stderrTruncated) gaps.push("stderr-truncated")
  if (output.outputTruncated) gaps.push("output-truncated")
  return gaps
}

function classifyError(error: AppProcess.AppProcessError): Incomplete {
  if (error.cause instanceof AppProcess.TimedOut) {
    return { state: "failed", gaps: ["timeout", ...truncationGaps(error.cause.truncation)] }
  }
  if (error.exitCode !== undefined && error.exitCode !== 0) return { state: "failed", gaps: ["nonzero-exit"] }
  if (error.exitCode === undefined && error.cause instanceof PlatformError) {
    const reason = error.cause.reason
    if (reason.module === "ChildProcess" && reason.method === "spawn") {
      if (reason._tag === "NotFound") return { state: "unavailable", gaps: ["executable-missing"] }
      if (reason._tag === "PermissionDenied") return { state: "unavailable", gaps: ["process-unavailable"] }
    }
  }
  return { state: "failed", gaps: ["execution-failed"] }
}

const decodeRecord = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

function classifyResult(output: AppProcess.RunResult): Outcome {
  const gaps = truncationGaps(output)
  if (output.exitCode !== 0) return { state: "failed", gaps: ["nonzero-exit", ...gaps] }
  if (gaps.length) return { state: "partial", gaps }

  const lines = output.stdout.toString("utf8").split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  if (lines.filter((line) => line !== "").length > ActivityMonitor.dockerRowLimit)
    return { state: "partial", gaps: ["row-limit"] }
  if (!isUtf8(output.stdout)) return { state: "failed", gaps: ["invalid-record"] }

  const containers: ActivityMonitor.DockerContainer[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const decoded = decodeRecord(line)
    if (
      Option.isNone(decoded) ||
      typeof decoded.value !== "object" ||
      decoded.value === null ||
      Array.isArray(decoded.value)
    ) {
      return { state: "failed", gaps: ["invalid-record"] }
    }
    const row = decoded.value
    if (!("ID" in row) || typeof row.ID !== "string" || row.ID.length === 0) {
      return { state: "failed", gaps: ["missing-id"] }
    }
    if (seen.has(row.ID)) return { state: "failed", gaps: ["duplicate-id"] }

    seen.add(row.ID)
    containers.push({
      containerID: row.ID,
      ...("Names" in row && typeof row.Names === "string" && { name: row.Names }),
      ...("Size" in row && typeof row.Size === "string" && { sizeText: row.Size }),
      owner: "",
      logical: null,
      unique: "não colapsei",
      useProof: "unproved",
    })
  }
  return { state: "complete", containers }
}

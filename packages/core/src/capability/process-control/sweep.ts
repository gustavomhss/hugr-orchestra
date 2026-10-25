export * as CapabilityProcessSweep from "./sweep"

import type { Capability } from "@orchestra/schema/capability"
import { and, eq, inArray, lt, sql } from "drizzle-orm"
import { Effect, Option } from "effect"
import { Database } from "../../database/database"
import { CapabilityJobs } from "../job"
import { CapabilityJobTable } from "../sql"
import type { CapabilityProcessContract } from "./contract"

/**
 * Marks lost the local processes this placement owned before this host started and no longer holds.
 * Assumes one host process per DB. Never respawns, writes stdin or adopts a PID: only the durable state changes.
 */
export const run = Effect.fn("CapabilityProcessSweep.run")(function* (input: {
  jobs: CapabilityProcessContract.Jobs
  live: ReadonlySet<Capability.JobID>
  startedAt: number
  placement: Pick<Capability.Owner, "projectID" | "location">
}) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(CapabilityJobTable).where(and(
    eq(CapabilityJobTable.kind, "local-process"),
    inArray(CapabilityJobTable.state, ["submitting", "submitted", "running", "cancel-requested", "unknown"]),
    lt(CapabilityJobTable.time_created, input.startedAt),
    sql`json_extract(${CapabilityJobTable.owner}, '$.projectID') = ${input.placement.projectID}`,
    sql`json_extract(${CapabilityJobTable.owner}, '$.location.directory') = ${input.placement.location.directory}`,
  )).all()
  const eligible = rows.filter((row) => !input.live.has(row.id) &&
    row.owner.location.workspaceID === input.placement.location.workspaceID)
  const results = yield* Effect.forEach(eligible, (row) => {
    const proof = CapabilityJobs.proofFromRow(row)
    if (Option.isNone(proof))
      return Effect.logWarning("process sweep skipped job", { jobID: row.id, code: "unsupported_schema" }).pipe(Effect.as(false))
    // A row that moved or was settled since the select fails its own guard; it is skipped, not fatal.
    // Rows whose producer Session, message or lineage was deleted fail host() provenance and stay skipped, never lost.
    return input.jobs.markLostHost(proof.value, { id: row.id },
      { expectedGeneration: row.generation, evidence: "startup-owner-absent" }).pipe(
      Effect.as(true), Effect.catchTag("Capability.Failure", (error) =>
        Effect.logWarning("process sweep skipped job", { jobID: row.id, code: error.code }).pipe(Effect.as(false))))
  })
  const marked = results.filter(Boolean).length
  return { marked, skipped: eligible.length - marked }
})

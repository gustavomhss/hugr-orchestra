export * as LeanProject from "./lean-project"

import { Database } from "@orchestra/core/database/database"
import { ProjectV2 } from "@orchestra/core/project"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { LeanProcessor } from "@orchestra/core/tool/lean-processor"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { Effect } from "effect"
import { LeanProfilePreferences } from "./lean-profile-preferences"

export const MAX_PARTS = 200_000
// Decoder admits 4096 + 8*256 UTF-16 text units: at most 36,864 JSON-escaped bytes,
// plus bounded keys/numbers/literals (<4 KiB). Unexpected larger encodings mark incomplete.
export const MAX_METRICS_BYTES = 64 * 1024
const COMMAND_LIMIT = 4096

/** Only native instrumented legacy parts currently contain this provenance. No V2/SDK telemetry inference. */
export const collect = Effect.fn("LeanProject.collect")(function* (scope: LeanDashboard.Scope, limit = MAX_PARTS, latest = false) {
  const database = yield* Database.Service
  return yield* collectWith(database, scope, limit, latest)
})

const collectWith = Effect.fn("LeanProject.collectWith")(function* (database: Database.Interface, scope: LeanDashboard.Scope, limit = MAX_PARTS, latest = false) {
  const rows = yield* database.db.select({
    sessionID: SessionTable.id,
    messageID: MessageTable.id,
    partID: PartTable.id,
    callID: sql<unknown>`json_extract(${PartTable.data}, '$.callID')`,
    status: sql<unknown>`json_extract(${PartTable.data}, '$.state.status')`,
    command: sql<unknown>`substr(json_extract(${PartTable.data}, '$.state.input.command'), 1, ${COMMAND_LIMIT})`,
    commandLength: sql<number | null>`length(json_extract(${PartTable.data}, '$.state.input.command'))`,
    exit: sql<unknown>`json_extract(${PartTable.data}, '$.state.metadata.exit')`,
    time: sql<unknown>`json_extract(${PartTable.data}, '$.state.time.end')`,
    created: MessageTable.time_created,
    metrics: sql<string | null>`CASE WHEN length(CAST(json_extract(${PartTable.data}, '$.state.metadata.lean') AS BLOB)) <= ${MAX_METRICS_BYTES} THEN json_extract(${PartTable.data}, '$.state.metadata.lean') END`,
    metricsOverbound: sql<number>`CASE WHEN length(CAST(json_extract(${PartTable.data}, '$.state.metadata.lean') AS BLOB)) > ${MAX_METRICS_BYTES} THEN 1 ELSE 0 END`,
    revertMessageID: sql<string | null>`CASE WHEN ${SessionTable.revert} IS NOT NULL THEN substr(json_extract(${SessionTable.revert}, '$.messageID'), 1, 256) END`,
    revertPartID: sql<string | null>`CASE WHEN ${SessionTable.revert} IS NOT NULL THEN substr(json_extract(${SessionTable.revert}, '$.partID'), 1, 256) END`,
    hasRevert: sql<number>`${SessionTable.revert} IS NOT NULL`,
    boundaryTime: sql<number | null>`(SELECT m.time_created FROM message m WHERE m.id = json_extract(${SessionTable.revert}, '$.messageID') AND m.session_id = ${SessionTable.id})`,
    boundaryPart: sql<string | null>`(SELECT p.id FROM part p WHERE p.id = json_extract(${SessionTable.revert}, '$.partID') AND p.message_id = json_extract(${SessionTable.revert}, '$.messageID') AND p.session_id = ${SessionTable.id})`,
  }).from(PartTable)
    .innerJoin(MessageTable, and(eq(MessageTable.id, PartTable.message_id), eq(MessageTable.session_id, PartTable.session_id)))
    .innerJoin(SessionTable, eq(SessionTable.id, MessageTable.session_id))
    .where(and(
      eq(SessionTable.project_id, ProjectV2.ID.make(scope.projectID)),
      eq(SessionTable.directory, scope.directory),
      sql`json_extract(${PartTable.data}, '$.type') = 'tool'`,
      sql`json_type(${PartTable.data}, '$.state.metadata.lean') IS NOT NULL`,
    ))
    // Same order as MessageV2.page/hydrate: time-created + message ID, then canonical part ID order.
    .orderBy(...(latest
      ? [desc(sql`json_extract(${PartTable.data}, '$.state.time.end')`), desc(MessageTable.time_created), desc(MessageTable.id), desc(PartTable.id)]
      : [asc(MessageTable.time_created), asc(MessageTable.id), asc(PartTable.id)]))
    .limit(Math.min(MAX_PARTS, Math.max(1, limit)) + 1).all()
    .pipe(Effect.mapError((error) => new LeanProfilePreferences.Unavailable({ message: String(error) })))
  return projectRows(scope, rows.slice(0, Math.min(MAX_PARTS, Math.max(1, limit))).map((row) => ({
    ...row,
    revert: row.hasRevert ? { messageID: row.revertMessageID ?? "", ...(row.revertPartID === null ? {} : { partID: row.revertPartID }) } : null,
  })), rows.length <= Math.min(MAX_PARTS, Math.max(1, limit)))
})

export interface Row {
  readonly sessionID: string
  readonly messageID: string
  readonly partID: string
  readonly callID: unknown
  readonly status: unknown
  readonly command: unknown
  readonly commandLength: number | null
  readonly exit: unknown
  readonly time: unknown
  readonly created: number
  readonly metrics: string | null
  readonly metricsOverbound?: number
  readonly revert: { readonly messageID: string; readonly partID?: string } | null
  readonly boundaryTime: number | null
  readonly boundaryPart: string | null
}

/** Ownership is checked before grouping original executions; conflicting retries remove the whole call. */
export function projectRows(scope: LeanDashboard.Scope, rows: readonly Row[], complete: boolean) {
  const calls = new Map<string, { signature: string; execution: LeanDashboard.Execution } | null>()
  const coverage = { complete }
  for (const row of rows.toSorted((a, b) => a.created - b.created || compareID(a.messageID, b.messageID) || compareID(a.partID, b.partID))) {
    if (row.metricsOverbound || (row.revert && (row.boundaryTime === null || (row.revert.partID !== undefined && row.boundaryPart === null))))
      coverage.complete = false
    if (!visible(row) || (row.status !== "completed" && row.status !== "error") || typeof row.callID !== "string") continue
    const metrics = decodeMetrics(row.metrics)
    if (!metrics || metrics.owner.projectID !== scope.projectID || metrics.owner.location !== scope.directory
      || metrics.owner.sessionID !== row.sessionID || metrics.owner.callID !== row.callID) continue
    const truncated = row.commandLength !== null && row.commandLength > COMMAND_LIMIT
    const profileItem = metrics.filterProfile ? LeanCoverage.forProfile(metrics.filterProfile) : undefined
    const commandItem = !truncated && typeof row.command === "string" ? LeanProcessor.identify(row.command) : undefined
    const itemID = metrics.itemID ?? profileItem ?? commandItem
    if ((metrics.itemID && profileItem && metrics.itemID !== profileItem) || (commandItem && itemID && commandItem !== itemID)) continue
    if (!itemID || typeof row.command !== "string" || !integer(row.time) || row.time < 0) continue
    const execution: LeanDashboard.Execution = {
      sessionID: row.sessionID, messageID: row.messageID, partID: row.partID, callID: row.callID, itemID,
      command: row.command, commandTruncated: truncated, status: row.status,
      exit: integer(row.exit) ? row.exit : null, time: row.time,
      bytesSaved: metrics.bytes.saved,
      tokensSaved: metrics.tokens.kind === "estimated" ? metrics.tokens.saved : null,
    }
    const key = JSON.stringify([row.sessionID, row.messageID, row.callID])
    const signature = JSON.stringify([metrics, execution.command, execution.commandTruncated, execution.status, execution.exit, execution.time, itemID])
    const previous = calls.get(key)
    if (previous === null) continue
    if (previous && previous.signature !== signature) { calls.set(key, null); continue }
    if (!previous) calls.set(key, { signature, execution })
  }
  return { complete: coverage.complete, executions: [...calls.values()].flatMap((call) => call ? [call.execution] : []) }
}

// Missing revert boundaries make the session uncertain. Keep only a proven prefix.
function visible(row: Row) {
  if (!row.revert) return true
  if (row.boundaryTime === null) return false
  if (row.created !== row.boundaryTime) return row.created < row.boundaryTime
  if (row.messageID !== row.revert.messageID) return row.messageID < row.revert.messageID
  return row.revert.partID !== undefined && row.boundaryPart !== null && row.partID < row.revert.partID
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
}

function compareID(a: string, b: string) { return a === b ? 0 : a < b ? -1 : 1 }

function decodeMetrics(text: string | null): LeanMetrics.Decision | undefined {
  if (!text) return undefined
  try {
    return LeanMetrics.decode(JSON.parse(text))
  } catch {
    return undefined
  }
}

export function savings(executions: readonly LeanDashboard.Execution[]): LeanDashboard.Savings {
  const bytes = executions.reduce((sum, execution) => sum + BigInt(execution.bytesSaved ?? 0), 0n)
  const tokens = executions.reduce((sum, execution) => sum + BigInt(execution.tokensSaved ?? 0), 0n)
  const safe = (value: bigint) => value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null
  const tokenCalls = executions.filter((execution) => execution.tokensSaved !== null).length
  return {
    bytesSaved: executions.some((execution) => execution.bytesSaved === null) ? null : safe(bytes),
    tokensSaved: tokenCalls === executions.length ? safe(tokens) : null,
    calls: executions.length, tokenCalls,
  }
}

export const read = Effect.fn("LeanProject.read")(function* (state: LeanProfilePreferences.State, globalEnabled: boolean) {
  const result = yield* collect(state.scope)
  return dashboard(state, globalEnabled, result)
})

export function make(database: Database.Interface) {
  return {
    read: Effect.fn("LeanProject.readBound")(function* (state: LeanProfilePreferences.State, globalEnabled: boolean) {
      return dashboard(state, globalEnabled, yield* collectWith(database, state.scope))
    }),
    history: Effect.fn("LeanProject.historyBound")(function* (scope: LeanDashboard.Scope, itemID: LeanCoverage.ItemID) {
      return historyResult(scope, itemID, yield* collectWith(database, scope, MAX_PARTS, true))
    }),
  }
}

export function dashboard(state: LeanProfilePreferences.State, globalEnabled: boolean, result: ReturnType<typeof projectRows>): LeanDashboard.Info {
  return {
    scope: state.scope, engine: LeanEngine.current, enabled: state.enabled ?? globalEnabled,
    coverage: "saved-profile-history", complete: result.complete, savings: savings(result.executions),
    items: LeanCoverage.ids.map((id) => ({
      id, enabled: state.items[id] ?? true,
      savings: savings(result.executions.filter((execution) => execution.itemID === id)),
    })),
  }
}

export const history = Effect.fn("LeanProject.history")(function* (scope: LeanDashboard.Scope, itemID: LeanCoverage.ItemID) {
  const result = yield* collect(scope, MAX_PARTS, true)
  return historyResult(scope, itemID, result)
})

export function historyResult(scope: LeanDashboard.Scope, itemID: LeanCoverage.ItemID, result: ReturnType<typeof projectRows>): LeanDashboard.History {
  const executions = result.executions.filter((execution) => execution.itemID === itemID)
    .toSorted((a, b) => b.time - a.time || compareID(b.messageID, a.messageID) || compareID(b.partID, a.partID))
  return { scope, itemID, complete: result.complete && executions.length <= 50, executions: executions.slice(0, 50) }
}

// Source: TechLead mcp/src/tools/wave-ledger.ts. Bounded evidence, atomic writes, explicit compaction.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { createHash } from "node:crypto"
import { type GovernanceContext, type WpLedgerRecord, LEDGER_RECORDS, validateProvenance, requireValue, text } from "../governance/contracts.ts"
import { sourceRoot, readState, updateState } from "../governance/state.ts"
import type { ToolDef } from "../contract.ts"
import { waveLedgerToolDescriptor } from "../governance/descriptors.ts"
export { waveLedgerToolDescriptor } from "../governance/descriptors.ts"
export { LEDGER_RECORDS, ledgerRecordSchema } from "../governance/contracts.ts"
export type { WpLedgerRecord } from "../governance/contracts.ts"
interface LedgerLine extends WpLedgerRecord { ts: number }
interface Ledger { schema: 1; projectID: string; wave: string; records: LedgerLine[]; compactions: number; removed: number }
function validateRecord(record: WpLedgerRecord, context: GovernanceContext) {
  requireValue(record && /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(record.wpId), "LEDGER_RECORD_INVALID")
  validateProvenance(record.provenance, context.projectID)
  requireValue(record.actual && typeof record.actual.offBaseline === "boolean", "LEDGER_ACTUAL_INVALID")
  ;[record.actual.gateFails, record.actual.retries, record.actual.costTokens, record.actual.wallClockMs, ...Object.values(record.predicted ?? {}), ...Object.values(record.events ?? {})].forEach((value) => requireValue(Number.isSafeInteger(value) && value >= 0, "LEDGER_NUMBER_INVALID"))
  const events = record.events
  requireValue(!events || events.sealedAt === undefined || events.dispatchedAt === undefined || events.sealedAt >= events.dispatchedAt, "LEDGER_TIMESTAMPS_INVALID")
  requireValue(!events || events.mergedAt === undefined || events.sealedAt === undefined || events.mergedAt >= events.sealedAt, "LEDGER_TIMESTAMPS_INVALID")
}
function validateLedger(value: unknown, context: GovernanceContext, wave: string): Ledger {
  requireValue(value && typeof value === "object", "LEDGER_MISSING")
  const ledger = value as Ledger
  requireValue(ledger.schema === 1 && ledger.projectID === context.projectID && ledger.wave === wave && Array.isArray(ledger.records), "LEDGER_CORRUPT")
  requireValue(ledger.records.length <= LEDGER_RECORDS, "LEDGER_OVERFLOW")
  requireValue(Number.isSafeInteger(ledger.compactions) && ledger.compactions >= 0 && Number.isSafeInteger(ledger.removed) && ledger.removed >= 0, "LEDGER_COMPACTION_CORRUPT")
  ledger.records.forEach((record) => { validateRecord(record, context); requireValue(Number.isSafeInteger(record.ts) && record.ts >= 0, "LEDGER_TIMESTAMP_INVALID") })
  return ledger
}
export function aggregateLedger(records: readonly LedgerLine[]) {
  const totals = records.reduce((total, record) => ({
    costTokens: total.costTokens + record.actual.costTokens,
    gateFails: total.gateFails + record.actual.gateFails,
    retries: total.retries + record.actual.retries,
    offBaselineCount: total.offBaselineCount + Number(record.actual.offBaseline),
    wallClockMs: total.wallClockMs + record.actual.wallClockMs,
    barrierTaxMs: total.barrierTaxMs + (record.events?.mergedAt !== undefined && record.events?.sealedAt !== undefined ? record.events.mergedAt - record.events.sealedAt : 0),
    instrumented: total.instrumented + Number(record.events?.mergedAt !== undefined && record.events?.sealedAt !== undefined),
  }), { costTokens: 0, gateFails: 0, retries: 0, offBaselineCount: 0, wallClockMs: 0, barrierTaxMs: 0, instrumented: 0 })
  requireValue(Object.values(totals).every((value) => Number.isSafeInteger(value) && value >= 0), "LEDGER_TOTAL_OVERFLOW")
  return totals
}
export interface WaveLedgerInput { sourceRoot?: string; action: "record" | "read" | "compact"; wave: string; now?: number; record?: WpLedgerRecord; retain?: number }
const tool: ToolDef<WaveLedgerInput> = {
  ...waveLedgerToolDescriptor,
  async handler(input: WaveLedgerInput, context?: GovernanceContext) {
    requireValue(context, "NATIVE_CONTEXT_REQUIRED")
    await sourceRoot(context, input.sourceRoot)
    if (input.action === "read") {
      const ledger = validateLedger(await readState(context, "ledger", input.wave), context, input.wave)
      return text({ ...ledger, totals: aggregateLedger(ledger.records), coverage: ledger.removed ? "compacted" : "complete-retained-wave" })
    }
    if (input.action === "compact") {
      requireValue(Number.isInteger(input.retain) && input.retain! >= 0 && input.retain! <= LEDGER_RECORDS, "LEDGER_RETAIN_REQUIRED")
      const result: { receipt?: unknown } = {}
      const ledger = await updateState(context, "ledger", input.wave, (current) => {
        const existing = validateLedger(current, context, input.wave)
        const removed = existing.records.slice(0, Math.max(0, existing.records.length - input.retain!))
        result.receipt = { removed: removed.length, digest: createHash("sha256").update(JSON.stringify(removed)).digest("hex"), totals: aggregateLedger(removed), archiveStored: false }
        return { ...existing, records: input.retain === 0 ? [] : existing.records.slice(-input.retain!), compactions: existing.compactions + 1, removed: existing.removed + removed.length }
      })
      return text({ ledger, compaction: result.receipt })
    }
    requireValue(input.action === "record" && input.record && Number.isSafeInteger(input.now) && input.now! >= 0, "LEDGER_RECORD_AND_NOW_REQUIRED")
    validateRecord(input.record, context)
    const record = input.record
    const ledger = await updateState(context, "ledger", input.wave, (current) => {
      const existing = current === undefined ? { schema: 1 as const, projectID: context.projectID, wave: input.wave, records: [], compactions: 0, removed: 0 } : validateLedger(current, context, input.wave)
      requireValue(existing.records.length < LEDGER_RECORDS, "LEDGER_OVERFLOW: explicitly compact before recording")
      requireValue(!existing.records.some((entry) => entry.provenance.eventID === record.provenance.eventID && entry.provenance.sessionID === record.provenance.sessionID), "LEDGER_DUPLICATE_OBSERVATION")
      return { ...existing, records: [...existing.records, { ...record, ts: input.now! }] }
    })
    return text({ action: "record", wave: input.wave, count: ledger.records.length, wpId: record.wpId, ts: input.now })
  },
}
export default tool

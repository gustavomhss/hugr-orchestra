import { expect, test } from "bun:test"
import { join } from "node:path"
import ledger, { LEDGER_RECORDS, type WpLedgerRecord } from "../src/tools/wave-ledger.ts"
import { fixture, provenance, result } from "./fixtures.governance.ts"
function record(index: number): WpLedgerRecord {
  return { wpId: `wp-${index}`, actual: { gateFails: 1, retries: 2, offBaseline: false, costTokens: 10, wallClockMs: 20 }, events: { dispatchedAt: 1, sealedAt: 2, mergedAt: 5 }, provenance: provenance(`event-${index}`) }
}
test("ledger aggregates actual outcomes/barrier tax; concurrent writes don't lose records", async () => {
  const f = await fixture()
  await Promise.all(Array.from({ length: 20 }, (_, index) => ledger.handler({ action: "record", wave: "wave", now: index, record: record(index) }, f.context)))
  const saved = result<{ records: WpLedgerRecord[]; totals: { costTokens: number; barrierTaxMs: number; instrumented: number } }>(await ledger.handler({ action: "read", wave: "wave" }, f.context))
  expect(saved.records.length).toBe(20)
  expect(saved.totals).toMatchObject({ costTokens: 200, barrierTaxMs: 60, instrumented: 20 })
  await expect(ledger.handler({ action: "read", wave: "wave" }, { ...f.context, projectID: "second" })).rejects.toThrow("STATE_READ_FAILED: ENOENT")
})
test("ledger overflow rejects until explicit compaction reports removed evidence", async () => {
  const f = await fixture()
  for (let index = 0; index < LEDGER_RECORDS; index++) await ledger.handler({ action: "record", wave: "wave", now: index, record: record(index) }, f.context)
  await expect(ledger.handler({ action: "record", wave: "wave", now: 300, record: record(300) }, f.context)).rejects.toThrow("LEDGER_OVERFLOW")
  const compacted = result<{ compaction: { removed: number; totals: { costTokens: number }; archiveStored: boolean } }>(await ledger.handler({ action: "compact", wave: "wave", retain: 2 }, f.context))
  expect(compacted.compaction.removed).toBe(LEDGER_RECORDS - 2)
  expect(compacted.compaction.totals.costTokens).toBe((LEDGER_RECORDS - 2) * 10)
  expect(compacted.compaction.archiveStored).toBe(false)
  await ledger.handler({ action: "record", wave: "wave", now: 300, record: record(300) }, f.context)
  expect(result<{ coverage: string }>(await ledger.handler({ action: "read", wave: "wave" }, f.context)).coverage).toBe("compacted")
})
test("ledger missing/corrupt state and invalid timestamps never become empty green", async () => {
  const f = await fixture()
  await expect(ledger.handler({ action: "read", wave: "wave" }, f.context)).rejects.toThrow("STATE_READ_FAILED: ENOENT")
  await ledger.handler({ action: "record", wave: "wave", now: 0, record: record(0) }, f.context)
  await expect(ledger.handler({ action: "record", wave: "wave", now: 1, record: record(0) }, f.context)).rejects.toThrow("LEDGER_DUPLICATE_OBSERVATION")
  await expect(ledger.handler({ action: "record", wave: "wave", now: 1, record: { ...record(1), events: { sealedAt: 10, mergedAt: 2 } } }, f.context)).rejects.toThrow("LEDGER_TIMESTAMPS_INVALID")
  await Bun.write(join(f.state, "project", "ledger", "wave.json"), JSON.stringify({ schema: 1, records: [] }))
  await expect(ledger.handler({ action: "read", wave: "wave" }, f.context)).rejects.toThrow("LEDGER_CORRUPT")
})

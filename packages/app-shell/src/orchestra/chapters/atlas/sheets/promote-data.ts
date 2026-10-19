import type { AtlasPromoteRecord } from "./state"

// The promote result sheet's counts (mock app.js:202-205): new facts (accepted rows that were staged), facts
// re-checked (accepted rows that were already facts), refused suggestions, and every refused row grouped by its
// refusal code, in first-seen order.
export function promoteSummary(record: AtlasPromoteRecord) {
  const rows = record.run.rows
  const staged = (key: string) => record.staged.includes(key)
  const refused = rows.filter((row) => !row.settled)
  const code = (row: { rejected?: string }) => row.rejected ?? "unknown"
  return {
    fresh: rows.filter((row) => row.settled && staged(row.nodeKey)).length,
    again: rows.filter((row) => row.settled && !staged(row.nodeKey)).length,
    refusedNew: refused.filter((row) => staged(row.nodeKey)).length,
    groups: [...new Set(refused.map(code))].map((reason) => ({
      code: reason,
      keys: refused.filter((row) => code(row) === reason).map((row) => row.nodeKey),
    })),
  }
}

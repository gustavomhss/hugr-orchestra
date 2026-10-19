import { describe, expect, test } from "bun:test"
import { promoteSummary } from "./promote-data"
import type { AtlasPromoteRecord } from "./state"

const run = (rows: AtlasPromoteRecord["run"]["rows"]): AtlasPromoteRecord["run"] => ({
  state: "ok",
  read: true,
  candidates: rows.length,
  promoted: rows.filter((row) => row.settled).length,
  refused: rows.filter((row) => !row.settled).length,
  rows,
})

describe("atlas promote summary", () => {
  test("splits new facts from re-checked ones and groups refusals by reason", () => {
    const record: AtlasPromoteRecord = {
      run: run([
        { nodeKey: "k5", settled: true },
        { nodeKey: "k1", settled: true },
        { nodeKey: "k6", settled: false, rejected: "ungrounded" },
        { nodeKey: "k2", settled: false, rejected: "ungrounded" },
        { nodeKey: "k3", settled: false, rejected: "governance-downgrade" },
      ]),
      staged: ["k5", "k6"],
    }
    expect(promoteSummary(record)).toEqual({
      fresh: 1,
      again: 1,
      refusedNew: 1,
      groups: [
        { code: "ungrounded", keys: ["k6", "k2"] },
        { code: "governance-downgrade", keys: ["k3"] },
      ],
    })
  })

  test("a refused row without a code is grouped as unknown", () => {
    expect(promoteSummary({ run: run([{ nodeKey: "a", settled: false }]), staged: [] })).toEqual({
      fresh: 0,
      again: 0,
      refusedNew: 0,
      groups: [{ code: "unknown", keys: ["a"] }],
    })
  })
})

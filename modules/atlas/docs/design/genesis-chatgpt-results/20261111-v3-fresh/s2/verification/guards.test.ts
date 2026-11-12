import { expect, test } from "bun:test"
import path from "node:path"
import { exitCode, runGuards, toJson } from "../../../../../../../../script/guards/run"

// Execute the repository's existing guard against this exact Actions snapshot.
// This bridge adds no rule and cannot turn a setup failure into a pass.
test("Genesis S2 required repository guard gate", () => {
  const report = runGuards({
    cwd: path.resolve(import.meta.dir, "../../../../../../../.."),
    baseRef: "origin/dev",
    approved: [],
  })
  console.log("GENESIS_S2_GUARDS", JSON.stringify(toJson(report)))
  expect(report.errors).toEqual([])
  expect(report.rules).toBeGreaterThan(0)
  expect(exitCode(report, false)).toBe(0)
}, 120_000)

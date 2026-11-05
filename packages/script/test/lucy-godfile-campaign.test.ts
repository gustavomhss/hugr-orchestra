import { expect, test } from "bun:test"
import path from "node:path"
import { formatGodfileReport, runGodfileGate } from "../../../script/godfile"

// Construction-only capture of the existing whole-repository gate, not a filtered replacement.
test("Lucy campaign satisfies the complete repository Godfile gate", () => {
  const report = runGodfileGate({ cwd: path.resolve(import.meta.dir, "../../.."), baseRef: "origin/dev" })
  console.log(formatGodfileReport(report))
  expect(report.checked).toBeGreaterThan(0)
  expect(report.errors).toEqual([])
}, 120_000)

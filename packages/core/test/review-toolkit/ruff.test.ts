import { describe, expect, test } from "bun:test"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewPackRuff } from "../../src/review-toolkit/packs/ruff"
import { parseReport } from "../../src/review-toolkit/packs/ruff-report"

// Parser-policy controls use synthetic process outcomes, not a Ruff binary or sandbox proof.
const root = "/review"
const row = {
  code: "F821",
  message: "Undefined name `missing_name`",
  filename: `${root}/sample.py`,
  location: { row: 1, column: 7 },
  end_location: { row: 1, column: 19 },
}
const captured = (data: Buffer, truncated = false) => ({ data, bytes: data.length, truncated })
const outcome = (stdout: Buffer, exitCode: number | null = 1): ResearchProcess.Outcome => ({
  exitCode, durationMs: 0, timedOut: false, overflow: false, memoryExceeded: false,
  stdout: captured(stdout), stderr: captured(Buffer.alloc(0)),
})
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value))

describe("Ruff report policy (synthetic process outcomes)", () => {
  test("accepts known diagnostics and converts exclusive next-line column one", () => {
    const result = parseReport(JSON.stringify([{ ...row, end_location: { row: 2, column: 1 } }]), { root })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected parsed result")
    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toMatchObject({ pack: "ruff", rule: "F821", path: "sample.py", line: 1 })
    expect(result.results[0].endLine ?? result.results[0].line).toBe(1)
  })

  test("rejects whole malformed, mixed, unknown, missing and outside reports", () => {
    const invalid = [
      "{", JSON.stringify([row, { ...row, code: "F999" }]),
      JSON.stringify([{ ...row, code: null }]), JSON.stringify([{ ...row, code: "invalid-syntax" }]),
      JSON.stringify([{ message: row.message, filename: row.filename, location: row.location, end_location: row.end_location }]),
      JSON.stringify([{ ...row, filename: "/outside/sample.py" }]),
      JSON.stringify([{ ...row, end_location: { row: 1, column: 6 } }]),
      JSON.stringify([{ ...row, end_location: row.location }]),
      JSON.stringify([{ ...row, message: "" }]),
    ]
    for (const report of invalid) expect(parseReport(report, { root }).status).toBe("acquisition-error")
  })

  test("requires UTF-8, complete report and exit agreement", () => {
    expect(ReviewPackRuff.settle(outcome(bytes([]), 0), root).status).toBe("ok")
    expect(ReviewPackRuff.settle(outcome(bytes([row]), 1), root).status).toBe("ok")
    for (const sample of [
      outcome(Buffer.from([0xff])), outcome(Buffer.alloc(0)), outcome(bytes([]), 1),
      outcome(bytes([row]), 0), outcome(bytes([row]), 2),
      { ...outcome(bytes([row])), stdout: captured(bytes([row]), true) },
      { ...outcome(bytes([row])), stderr: captured(Buffer.from([0xff])) },
      { ...outcome(bytes([row])), stderr: captured(Buffer.from("error")) },
    ]) expect(ReviewPackRuff.settle(sample, root).status).toBe("acquisition-error")
  })
})

test("Ruff adapter removes hostile Ruff and Python environment", () => {
  const dirty = {
    PATH: "/usr/bin", RUFF_OUTPUT_FILE: "/outside/report", RUFF_OUTPUT_FORMAT: "text",
    RUFF_CACHE_DIR: "/outside/cache", PYTHONPATH: "/outside/python", rUfF_extra: "hostile", pythonpath: "hostile",
  }
  expect(ResearchProcess.environment(dirty).RUFF_OUTPUT_FILE).toBe(dirty.RUFF_OUTPUT_FILE)
  const env = ReviewPackRuff.environment(dirty)
  expect(env.PATH).toBe("/usr/bin")
  for (const key of ["RUFF_OUTPUT_FILE", "RUFF_OUTPUT_FORMAT", "RUFF_CACHE_DIR", "PYTHONPATH", "rUfF_extra", "pythonpath"]) expect(env[key]).toBeUndefined()
})

export * as ReviewMutantsReport from "./probe-mutants-report"

import { Option, Schema } from "effect"
import type { ReviewProbeRuntime } from "./probe-runtime"

const positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
const point = Schema.Struct({ line: positive, column: positive })
const mutant = Schema.Struct({ name: Schema.String, file: Schema.String, span: Schema.Struct({ start: point, end: point }) }).check(Schema.makeFilter((row) =>
  row.span.end.line > row.span.start.line || (row.span.end.line === row.span.start.line && row.span.end.column > row.span.start.column) ? undefined : "invalid-span",
))
const summary = Schema.Literals(["Success", "CaughtMutant", "MissedMutant", "Unviable", "Timeout", "Failure"])
const count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
const Report = Schema.Struct({
  cargo_mutants_version: Schema.String,
  total_mutants: count,
  missed: count,
  caught: count,
  timeout: count,
  unviable: count,
  success: count,
  outcomes: Schema.Array(Schema.Struct({
    scenario: Schema.Union([Schema.Literal("Baseline"), Schema.Struct({ Mutant: mutant })]),
    summary,
  })),
})
type Report = typeof Report.Type
type Mutant = typeof mutant.Type

export const List = Schema.Array(mutant)
export type Listed = typeof List.Type
export type Result = { readonly status: ReviewProbeRuntime.Status; readonly reason?: string; readonly report?: unknown }

export function parse(text: string, listed: Listed, exitCode: number): Result {
  const raw = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(raw)) return exitOnly(exitCode)
  const decoded = Schema.decodeUnknownOption(Report)(raw.value, { onExcessProperty: "ignore" })
  if (Option.isNone(decoded)) return exitOnly(exitCode, raw.value)
  return judge(decoded.value, listed, exitCode, raw.value)
}

function judge(report: Report, listed: Listed, exitCode: number, raw: unknown): Result {
  if (report.cargo_mutants_version !== "27.1.0" || new Set(listed.map(key)).size !== listed.length) return invalid(raw)
  const baseline = report.outcomes.filter((row) => row.scenario === "Baseline")
  if (baseline.length !== 1) return exitCode === 3 ? unavailable("timeout", raw) : exitCode === 4 ? unavailable("baseline-failed", raw) : invalid(raw)
  if (baseline[0].summary !== "Success" && baseline[0].summary !== "Failure") return invalid(raw)
  if (baseline[0].summary === "Failure") return exitCode === 4 ? unavailable("baseline-failed", raw) : incoherent(raw)
  const mutants = report.outcomes.flatMap((row) => row.scenario === "Baseline" ? [] : [{ ...row, scenario: row.scenario }])
  if (mutants.some((row) => row.summary === "Success" || row.summary === "Failure")) return invalid(raw)
  if (exitCode === 3 || report.timeout > 0 || mutants.some((row) => row.summary === "Timeout")) return unavailable("timeout", raw)
  if (!countsAgree(report, mutants)) return invalid(raw)
  if (!covers(listed, mutants)) return invalid(raw)
  if (report.caught === 0 && report.missed === 0) return unavailable("no-viable-mutants", raw)
  if (report.caught >= 1 && report.missed === 0 && exitCode === 0) return { status: "pass", report: raw }
  if (report.missed >= 1 && exitCode === 2) return { status: "fail", report: raw }
  return incoherent(raw)
}

function countsAgree(report: Report, mutants: ReadonlyArray<{ summary: string }>) {
  const tally = (summary: string) => mutants.filter((row) => row.summary === summary).length
  return report.success === 0 && report.caught === tally("CaughtMutant") && report.missed === tally("MissedMutant") && report.timeout === tally("Timeout") &&
    report.unviable === tally("Unviable") && report.total_mutants === mutants.length
}

function covers(listed: Listed, mutants: ReadonlyArray<{ scenario: { Mutant: Mutant } }>) {
  const pool = listed.map(key)
  for (const row of mutants) {
    const index = pool.indexOf(key(row.scenario.Mutant))
    if (index < 0) return false
    pool.splice(index, 1)
  }
  return pool.length === 0
}

function key(row: Mutant) {
  return `${row.name}\0${row.file}\0${row.span.start.line}:${row.span.start.column}:${row.span.end.line}:${row.span.end.column}`
}

function exitOnly(exitCode: number, report?: unknown): Result {
  if (exitCode === 3) return unavailable("timeout", report)
  if (exitCode === 4) return unavailable("baseline-failed", report)
  return invalid(report)
}

function unavailable(reason: string, report?: unknown): Result {
  return { status: "not-run", reason, report }
}

function invalid(report?: unknown): Result {
  return unavailable("invalid-report", report)
}

function incoherent(report: unknown): Result {
  return unavailable("incoherent-exit", report)
}

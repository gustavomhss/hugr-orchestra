export * as ArmCost from "./cost"

import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { Effect, Option, Result } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import { GateDiff } from "../gate/diff"
import type { GateShell } from "../gate/shell"
import { JudgeConfig } from "../judge/config"
import { RelayJson } from "../json"
import { ArmState } from "./state"

// What the agent's transcript tells the arm (WP6): the cost of the state that just ended (the rows since
// `tr_cursor`) and the agent's last `RELAY-BLOCKED:` claim.

// The transcript bytes when it is a regular file, as `[ -f "$transcript" ]` requires.
export const read = (file: string): Uint8Array | undefined => {
  const info = Result.try(() => statSync(file, { throwIfNoEntry: false }))
  if (!Result.isSuccess(info) || info.success?.isFile() !== true) return undefined
  const bytes = Result.try(() => readFileSync(file))
  return Result.isSuccess(bytes) ? new Uint8Array(bytes.success) : undefined
}

/**
 * The last `RELAY-BLOCKED:` claim, as `grep -oE 'RELAY-BLOCKED:[^"\\]*' | tail -1 | cut -d: -f2- | sed` read the
 * bytes in the C locale: up to a quote, a backslash or the end of the line, then trimmed of spaces. Undefined when
 * there is none.
 */
export const claim = (transcript: Uint8Array): Uint8Array | undefined => {
  const match = Buffer.from(transcript)
    .toString("latin1")
    .match(/RELAY-BLOCKED:[^"\\\n]*/g)
    ?.at(-1)
  if (match === undefined) return undefined
  const text = match.slice("RELAY-BLOCKED:".length).replace(/^ +/, "").replace(/ +$/, "").replaceAll("\u0000", "")
  return text === "" ? undefined : Buffer.from(text, "latin1")
}

export interface Corroboration {
  // The claim as jq received it through `--arg`, and the sha256 of its bytes.
  readonly text: string
  readonly sha: string
  readonly corroborated: string
  readonly graded_by: RelayLedger.GradedBy
}

/**
 * The claim graded against the diff the gate computes from the state's base ref, never against a description the
 * agent supplied. Without a diff it is `unavailable`. The judge's answer is read as `.verdict // "unavailable"` and
 * `.backend // "judge"`, so an empty backend stays empty.
 */
export const corroborate = (
  claim: Uint8Array,
  workdir: string,
  baseRef: string,
): Effect.Effect<Corroboration, never, GateShell.Git | JudgeConfig.Service> =>
  Effect.gen(function* () {
    const text = RelayJson.argText(claim)
    const sha = createHash("sha256").update(claim).digest("hex")
    const diff = yield* GateDiff.compute({ workdir, baseRef, pathspec: "" })
    if (Option.isNone(diff)) return { text, sha, corroborated: "unavailable", graded_by: "judge:unavailable" }
    const judge = yield* JudgeConfig.Service
    const response: Readonly<Record<string, unknown>> = yield* judge.judge({
      criterion: `The agent claims it cannot complete this state for the following reason: '${text}'. Judge ONLY whether the artifact supports that claim. FAIL if the artifact shows the work was simply not attempted, or shows no trace of the obstacle described.`,
      files: [{ name: GateDiff.NAME, text: diff.value.replace(/\r\n?/g, "\n") }],
    })
    return {
      text,
      sha,
      corroborated: alternative(response.verdict, "unavailable") || "unavailable",
      graded_by: `judge:${alternative(response.backend, "judge")}(non-independent)`,
    }
  })

// `$ARM/tr_cursor` counts the rows already charged; the window since then belongs to the state that just ended.
export const charge = (
  arm: string,
  transcript: Uint8Array,
): Effect.Effect<Option.Option<RelayLedger.Cost>, ArmState.StateError> =>
  Effect.gen(function* () {
    const stored = substitution(Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.trCursor), () => "0"))
    const counted = window(transcript, /^[0-9]+$/.test(stored) ? Number(stored) : 0)
    yield* ArmState.write(arm, RelayArm.Files.trCursor, String(counted.total))
    return counted.cost
  })

export interface Window {
  // None when the transcript records no usage anywhere; zeros when it does but this window had none.
  readonly cost: Option.Option<RelayLedger.Cost>
  // The new cursor: the transcript's line count (`wc -l`, LF bytes).
  readonly total: number
}

/**
 * The hook's cost block over the transcript bytes and the stored cursor. The window is every row after the first
 * `cursor` LF-terminated lines (`tail -n +cursor+1`), so a final row without LF is charged again once it is complete.
 * A cursor past the end charges nothing. Usage is `.message.usage // .usage` per row; each count is `// 0` and must be
 * an integer, and anything jq could not have summed leaves the cost absent (PARITY-EXCEPTIONS WP6-6).
 */
export const window = (transcript: Uint8Array, cursor: number): Window => {
  const breaks: number[] = []
  transcript.forEach((byte, at) => {
    if (byte === 10) breaks.push(at)
  })
  const total = breaks.length
  if (total < cursor) return { cost: Option.none(), total }
  const all = rows(transcript)
  // jq -s over the whole file: a transcript it cannot parse records no usage anywhere.
  const seen = all !== undefined && all.some((row) => usages(row).some((usage) => usage !== null))
  const start = cursor === 0 ? 0 : breaks[cursor - 1]! + 1
  const charged = rows(transcript.subarray(start))
  if (charged === undefined) return { cost: Option.none(), total }
  const found = charged.flatMap(usages).filter((usage) => usage !== null)
  if (found.length === 0) return { cost: seen ? Option.some(ZERO) : Option.none(), total }
  const sums = KEYS.map((key) => sum(found, key))
  if (sums.some((value) => value === undefined)) return { cost: Option.none(), total }
  return {
    cost: Option.some({
      in: sums[0]!,
      out: sums[1]!,
      cache_read: sums[2]!,
      cache_write: sums[3]!,
      turns: found.length,
    }),
    total,
  }
}

const ZERO = { in: 0, out: 0, cache_read: 0, cache_write: 0, turns: 0 }
const KEYS = ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]

// One JSON value per nonblank line, read the way jq reads the bytes; undefined when any line does not parse.
function rows(bytes: Uint8Array) {
  const values = RelayJson.argText(bytes)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => Result.try(() => JSON.parse(line) as unknown))
  if (!values.every(Result.isSuccess)) return undefined
  return values.map((value) => value.success)
}

// `.message.usage? // .usage?`: the first operand's truthy outputs, else the second's. An object row yields one value
// per operand (null when absent); a null row yields null; any other row errors, which `?` turns into no output.
function usages(row: unknown): ReadonlyArray<unknown> {
  const message = row === null ? [null] : isObject(row) ? [row.message ?? null] : []
  const first = message.flatMap((value) => (value === null ? [null] : isObject(value) ? [value.usage ?? null] : []))
  const truthy = first.filter((value) => value !== null && value !== false)
  if (truthy.length > 0) return truthy
  return row === null ? [null] : isObject(row) ? [row.usage ?? null] : []
}

// `[$u[].<key> // 0] | add` over integer counts; undefined for a usage that is not an object or a count jq could not
// have added as an integer.
function sum(found: ReadonlyArray<unknown>, key: string) {
  const counts = found.map((usage) => {
    if (!isObject(usage)) return undefined
    const value = usage[key]
    if (value === undefined || value === null || value === false) return 0
    return Number.isSafeInteger(value) ? (value as number) : undefined
  })
  if (counts.some((count) => count === undefined)) return undefined
  const total = counts.reduce<number>((acc, count) => acc + count!, 0)
  return Number.isSafeInteger(total) ? total : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// `$(jq -r '<value> // <fallback>')`: null, false and absent take the fallback; text prints as is and anything else
// as JSON.
function alternative(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === false) return fallback
  return substitution(typeof value === "string" ? value : JSON.stringify(value))
}

function substitution(value: string) {
  return value.replaceAll("\u0000", "").replace(/\n+$/, "")
}

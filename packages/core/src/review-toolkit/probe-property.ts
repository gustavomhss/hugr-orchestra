export * as ReviewProbeProperty from "./probe-property"

import { Effect, Option, Schema } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import { ReviewProbeRuntime } from "./probe-runtime"
import { ReviewProbeTargets } from "./probe-targets"

const sourceBytes = 8192
const HostLine = Schema.Struct({
  kind: Schema.Literals(["property"]),
  nonce: Schema.NonEmptyString,
  law: Schema.optional(Schema.String),
  result: Schema.optional(Schema.Boolean),
  error: Schema.optional(Schema.String),
  original: Schema.optional(Schema.Finite),
  shrunk: Schema.optional(Schema.Finite),
  shrinkSteps: Schema.optional(Schema.Number),
  cases: Schema.optional(Schema.Number),
  evaluations: Schema.optional(Schema.Number),
})

/** Law is a JSON literal in the driver, never evaluated. Shrink stays inside 128 extra calls. */
export function run(input: ReviewProbeTargets.Property, context: ReviewProbeRuntime.Context) {
  const decoded = Schema.decodeUnknownOption(ReviewProbeTargets.Property)(input)
  if (Option.isNone(decoded)) return Effect.succeed(refused("invalid-target"))
  if (Buffer.byteLength(decoded.value.source, "utf8") > sourceBytes) return Effect.succeed(refused("invalid-target"))
  const nonce = Bun.randomUUIDv7()
  const driver = script(decoded.value, context.head.root, nonce)
  if (Buffer.byteLength(driver, "utf8") > Probe.Limits.scriptBytes) return Effect.succeed(refused("script-bytes"))
  return Effect.gen(function* () {
    const step = yield* ReviewProbeRuntime.step("head", context.head, {
      kind: "script",
      language: decoded.value.language,
      source: driver,
    }, context)
    return settle(step, decoded.value, nonce)
  })
}

function refused(reason: string): ReviewProbeRuntime.Result {
  return { status: "not-run" as const, reason, steps: [ReviewProbeRuntime.notRun(reason)] } satisfies ReviewProbeRuntime.Result
}

function settle(step: ReviewProbeRuntime.Step, input: ReviewProbeTargets.Property, nonce: string): ReviewProbeRuntime.Result {
  if (step.status === "not-run") {
    return { status: "not-run" as const, reason: step.reason, steps: [step] } satisfies ReviewProbeRuntime.Result
  }
  const found = lines(step.stdout).filter((line) => line.nonce === nonce)
  if (found.length !== 1) return rewrite(step, "invalid-protocol")
  const report = found[0]
  if (report.error !== undefined) {
    if (step.exitCode === 2 && report.error.length > 0 && report.result === undefined) return rewrite(step, "invalid-property-evidence")
    return rewrite(step, "invalid-protocol")
  }
  const counted = integer(report.cases) && integer(report.evaluations)
  if (report.result === true && step.exitCode === 0 && report.law === input.law && counted && report.cases === input.cases && report.evaluations === input.cases) {
    return { status: "pass" as const, steps: [step] } satisfies ReviewProbeRuntime.Result
  }
  const shrunk = report.result === false && step.exitCode === 1 && report.law === input.law && counted && int32(report.original) && int32(report.shrunk) && integer(report.shrinkSteps) && report.shrinkSteps <= 128 && report.cases !== undefined && report.cases >= 1 && report.cases <= input.cases && report.evaluations === report.cases + report.shrinkSteps && Math.abs(report.shrunk) <= Math.abs(report.original) && (report.shrunk === 0 || Math.sign(report.shrunk) === Math.sign(report.original))
  if (shrunk) {
    const reason = JSON.stringify({ original: report.original, shrunk: report.shrunk, law: report.law })
    return { status: "fail" as const, reason, steps: [step] } satisfies ReviewProbeRuntime.Result
  }
  return rewrite(step, "invalid-protocol")
}

function rewrite(step: ReviewProbeRuntime.Step, reason: string): ReviewProbeRuntime.Result {
  return {
    status: "not-run" as const,
    reason,
    steps: [{ ...step, status: "not-run" as const, reason }],
  } satisfies ReviewProbeRuntime.Result
}

function lines(stdout: string) {
  return stdout.split("\n").flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith("{")) return []
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(trimmed).pipe(Option.flatMap(Schema.decodeUnknownOption(HostLine)))
    return Option.isSome(parsed) ? [parsed.value] : []
  })
}

function integer(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 384
}

function int32(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
}

function script(input: ReviewProbeTargets.Property, root: string, nonce: string) {
  return `${input.source}
;(() => {
const __probeTimer = setInterval(() => {}, 1000)
let __probeSettled = false
let __probeEvaluations = 0
const __probeNonce = ${JSON.stringify(nonce)}
const __probeLaw = ${JSON.stringify(input.law)}
const __probeRoot = ${JSON.stringify(root)}
const __probeCases = ${input.cases}
let __probeState = ${input.seed} >>> 0 || 1
function __probeFinish(code, payload) {
  if (__probeSettled) return
  __probeSettled = true
  process.stdout.write(JSON.stringify(payload) + "\\n")
  clearInterval(__probeTimer)
  process.exitCode = code
}
function __probeNext() {
  __probeState ^= __probeState << 13
  __probeState ^= __probeState >>> 17
  __probeState ^= __probeState << 5
  __probeState >>>= 0
  return __probeState | 0
}
async function __probeCall(value) {
  if (__probeSettled) return new Promise(() => {})
  let result
  try { result = await property(value, __probeRoot) } catch (error) {
    __probeFinish(2, { kind: "property", nonce: __probeNonce, error: String((error && error.message) || "throw") })
    return new Promise(() => {})
  }
  if (typeof result !== "boolean") {
    __probeFinish(2, { kind: "property", nonce: __probeNonce, error: "nonboolean" })
    return new Promise(() => {})
  }
  __probeEvaluations += 1
  return result
}
async function __probeShrink(original) {
  let steps = 0
  let best = original
  const sign = original < 0 ? -1 : 1
  const ask = async (value) => { steps += 1; return __probeCall(value) }
  if (await ask(0) === false) return { shrunk: 0, shrinkSteps: steps }
  const magnitude = original < 0 ? -original : original
  let lo = 1
  let hi = magnitude - 1
  while (lo <= hi && steps < 128) {
    const mid = Math.floor(lo + (hi - lo) / 2)
    const candidate = sign * mid
    if (await ask(candidate) === false) { best = candidate; hi = mid - 1 } else lo = mid + 1
  }
  if (steps < 128 && best !== 0) {
    const neighbor = best - sign
    if ((neighbor < 0 ? -neighbor : neighbor) < (best < 0 ? -best : best) && await ask(neighbor) === false) best = neighbor
  }
  return { shrunk: best, shrinkSteps: steps }
}
async function __probeMain() {
  if (typeof property !== "function") return __probeFinish(2, { kind: "property", nonce: __probeNonce, error: "missing-property" })
  const prefix = [0, 1, -1, 2147483647, -2147483647]
  let ran = 0
  let original
  for (let i = 0; i < __probeCases; i++) {
    const value = i < prefix.length ? prefix[i] : __probeNext()
    ran += 1
    if (await __probeCall(value) === false) { original = value; break }
  }
  if (original === undefined) return __probeFinish(0, { kind: "property", nonce: __probeNonce, law: __probeLaw, result: true, cases: ran, evaluations: __probeEvaluations })
  const shrunk = await __probeShrink(original)
  __probeFinish(1, { kind: "property", nonce: __probeNonce, law: __probeLaw, result: false, original, shrunk: shrunk.shrunk, shrinkSteps: shrunk.shrinkSteps, cases: ran, evaluations: __probeEvaluations })
}
__probeMain()
})()
`
}

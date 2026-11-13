export * as ReviewProbeInterleave from "./probe-interleave"

import { Effect, Option, Schema } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import { ReviewProbeRuntime } from "./probe-runtime"
import { ReviewProbeTargets } from "./probe-targets"

const ORDER = ["head:1", "base:1", "head:2", "base:2"] as const
const Protocol = Schema.Struct({
  kind: Schema.Literal("interleave"),
  nonce: Schema.String,
  gates: Schema.Array(Schema.String),
  result: Schema.Boolean,
})

export const run = Effect.fn("ReviewProbeInterleave.run")(function* (input: ReviewProbeTargets.Interleave, context: ReviewProbeRuntime.Context) {
  const decoded = Schema.decodeUnknownOption(ReviewProbeTargets.Interleave)(input)
  if (Option.isNone(decoded)) return refused("invalid-input")
  const target = decoded.value
  const base = context.base
  if (Buffer.byteLength(target.source, "utf8") > 8192) return refused("source-too-large")
  if (new Set(target.schedule).size < 2) return refused("schedule-not-distinct")
  if (!base) return refused("missing-base")
  const steps: ReviewProbeRuntime.Step[] = []
  for (const label of ORDER) {
    const nonce = Bun.randomUUIDv7()
    const source = harness(target.source, label.startsWith("head") ? context.head.root : base.root, target.schedule, nonce)
    if (Buffer.byteLength(source, "utf8") > Probe.Limits.scriptBytes) return refused("script-too-large", steps)
    const step = yield* ReviewProbeRuntime.step(label, label.startsWith("head") ? context.head : base, { kind: "script", language: target.language, source }, context)
    if (step.status === "not-run") return refused(step.reason ?? "not-run", [...steps, step])
    const checked = evidence(step, nonce, target.schedule)
    if (checked.status === "not-run") return refused(checked.reason ?? "invalid-evidence", [...steps, checked])
    steps.push(checked)
  }
  const matched = steps[0]?.status === "pass" && steps[1]?.status === "fail" && steps[2]?.status === "pass" && steps[3]?.status === "fail"
  return (matched ? { status: "pass", steps } : { status: "fail", steps }) satisfies ReviewProbeRuntime.Result
})

function refused(reason: string, steps: ReadonlyArray<ReviewProbeRuntime.Step> = []): ReviewProbeRuntime.Result {
  return { status: "not-run", reason, steps }
}

function evidence(step: ReviewProbeRuntime.Step, nonce: string, schedule: readonly string[]): ReviewProbeRuntime.Step {
  const lines = step.stdout.split("\n").flatMap((row) => {
    const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row)
    if (Option.isNone(parsed)) return []
    const protocol = Schema.decodeUnknownOption(Protocol)(parsed.value)
    if (Option.isNone(protocol) || protocol.value.nonce !== nonce) return []
    return [protocol.value]
  })
  const protocol = lines[0]
  if (!protocol || lines.length !== 1 || protocol.gates.length !== schedule.length || protocol.gates.some((gate, index) => gate !== schedule[index])) return { ...step, status: "not-run", reason: "invalid-evidence" }
  const coherent = protocol.result ? step.exitCode === 0 : step.exitCode === 1
  if (!coherent) return { ...step, status: "not-run", reason: "incoherent-exit" }
  return step
}

// Interval holds the process open so an unresolved gate times out instead of exiting 0.
// gate resolves only the next declared label; continuations stay microtasks (no all-gates barrier).
function harness(source: string, root: string, schedule: readonly string[], nonce: string) {
  return `${source}
;(() => {
const __root = ${JSON.stringify(root)}
const __schedule = ${JSON.stringify(schedule)}
const __nonce = ${JSON.stringify(nonce)}
const __timer = setInterval(() => {}, 1e9)
const __pending = []
const __resolved = []
const __demanded = new Map()
let __cursor = 0
const __invalid = (error) => {
  clearInterval(__timer)
  process.stdout.write(JSON.stringify({ kind: "interleave", nonce: __nonce, error }) + "\\n")
  process.exit(2)
}
const __release = () => {
  while (__cursor < __schedule.length) {
    const next = __schedule[__cursor]
    const index = __pending.findIndex((item) => item.label === next)
    if (index < 0) return
    const item = __pending.splice(index, 1)[0]
    __cursor += 1
    __resolved.push(item.label)
    item.resolve()
  }
}
const __gate = (label) => {
  const total = __schedule.filter((item) => item === label).length
  const used = __demanded.get(label) ?? 0
  if (typeof label !== "string" || total === 0 || used >= total) __invalid(total === 0 ? "unknown-label" : "extra-label")
  __demanded.set(label, used + 1)
  return new Promise((resolve) => {
    __pending.push({ label, resolve })
    __release()
  })
}
const __finish = (result) => {
  clearInterval(__timer)
  if (__cursor !== __schedule.length || __pending.length !== 0) __invalid("schedule-unused")
  if (typeof result !== "boolean") __invalid("nonboolean")
  process.stdout.write(JSON.stringify({ kind: "interleave", nonce: __nonce, gates: __resolved, result }) + "\\n")
  process.exit(result ? 0 : 1)
}
try {
  Promise.resolve(scenario(__root, __gate)).then(__finish, (error) => __invalid(error instanceof Error ? error.message : "scenario-threw"))
} catch (error) {
  __invalid(error instanceof Error ? error.message : "scenario-threw")
}
})()
`
}

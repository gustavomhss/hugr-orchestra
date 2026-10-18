export * as RelayExternal from "./relay-external"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt, optional } from "./schema"

// External runs: a LangGraph process gated by the Python library writes `<project>/.relay/runs/<runID>/`. The ledger
// is the only source of truth; `run.json` is a convenience snapshot that no reader trusts. Bodies are written in the
// order their structs list, optional fields only when set, then the chain suffix `gen` (always 0), `prev`, `seq`,
// `mac` (always `sha256`: keyed chains wait for a key-sharing design) and `h`, exactly as `LedgerChain.append` does.

export const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/
export const RunID = Schema.String.check(Schema.isPattern(RUN_ID))
export type RunID = typeof RunID.Type

// One run per LangGraph `thread_id`: the thread ID itself when it is already a valid run ID, else a stable hash.
export function runIDFromThread(threadID: string): RunID {
  if (RUN_ID.test(threadID)) return threadID
  return `t_${sha256(threadID).slice(0, 32)}`
}

// Run-scoped events use LangGraph's reserved node names, which no user node can take, and attempt 0.
export const RUN_NODE = "__start__"
export const END_NODE = "__end__"

/**
 * The idempotency key `thread_id/node/attempt/kind`. `kind` is the event name, except `check.result:<check id>`, so
 * every check of one attempt has its own key. The writer skips a body whose key is already on the ledger.
 */
export function key(input: { thread_id: string; node: string; attempt: number; kind: string }) {
  return `${input.thread_id}/${input.node}/${input.attempt}/${input.kind}`
}

const NonEmpty = Schema.NonEmptyString
// Epoch milliseconds.
const At = NonNegativeInt

export const CheckKind = Schema.Literals(["cmd", "judge"])
export type CheckKind = typeof CheckKind.Type
export const Verdict = Schema.Literals(["pass", "fail", "advisory"])
export type Verdict = typeof Verdict.Type
export const DecisionValue = Schema.Literals(["approve", "reject"])
export type DecisionValue = typeof DecisionValue.Type
export const Source = Schema.Literals(["terminal", "orchestra"])
export type Source = typeof Source.Type

const step = { node: NonEmpty, attempt: PositiveInt }

export const RunStart = Schema.Struct({
  event: Schema.Literal("run.start"),
  key: NonEmpty,
  at: At,
  thread_id: NonEmpty,
  graph: NonEmpty,
  library_version: NonEmpty,
  // Set only for projects exported from a Relay document.
  document_id: Schema.optionalKey(NonEmpty),
  document_version: Schema.optionalKey(NonEmpty),
}).annotate({ identifier: "RelayExternal.RunStart" })
export interface RunStart extends Schema.Schema.Type<typeof RunStart> {}

export const StepStart = Schema.Struct({
  event: Schema.Literal("step.start"),
  key: NonEmpty,
  at: At,
  ...step,
}).annotate({ identifier: "RelayExternal.StepStart" })
export interface StepStart extends Schema.Schema.Type<typeof StepStart> {}

// `output` may be truncated by the writer; it is evidence of what the process saw, not a full log.
export const CheckResult = Schema.Struct({
  event: Schema.Literal("check.result"),
  key: NonEmpty,
  at: At,
  ...step,
  id: NonEmpty,
  kind: CheckKind,
  verdict: Verdict,
  output: Schema.String,
}).annotate({ identifier: "RelayExternal.CheckResult" })
export interface CheckResult extends Schema.Schema.Type<typeof CheckResult> {}

export const ApprovalRequest = Schema.Struct({
  event: Schema.Literal("approval.request"),
  key: NonEmpty,
  at: At,
  ...step,
}).annotate({ identifier: "RelayExternal.ApprovalRequest" })
export interface ApprovalRequest extends Schema.Schema.Type<typeof ApprovalRequest> {}

// `request_seq` is the ledger seq of the approval.request it answers. The MVP library writes only `terminal`;
// `orchestra` is reserved for app approvals, which the server must match against its own record.
export const ApprovalDecision = Schema.Struct({
  event: Schema.Literal("approval.decision"),
  key: NonEmpty,
  at: At,
  ...step,
  request_seq: NonNegativeInt,
  decision: DecisionValue,
  note: Schema.String,
  source: Source,
}).annotate({ identifier: "RelayExternal.ApprovalDecision" })
export interface ApprovalDecision extends Schema.Schema.Type<typeof ApprovalDecision> {}

export const StepEnd = Schema.Struct({
  event: Schema.Literal("step.end"),
  key: NonEmpty,
  at: At,
  ...step,
  outcome: Schema.Literals(["pass", "fail"]),
}).annotate({ identifier: "RelayExternal.StepEnd" })
export interface StepEnd extends Schema.Schema.Type<typeof StepEnd> {}

// The verifier's terminal events (`verify.ts` TERMINAL).
export const SprintComplete = Schema.Struct({
  event: Schema.Literal("sprint-complete"),
  key: NonEmpty,
  at: At,
}).annotate({ identifier: "RelayExternal.SprintComplete" })
export interface SprintComplete extends Schema.Schema.Type<typeof SprintComplete> {}

export const Escalate = Schema.Struct({
  event: Schema.Literal("escalate"),
  key: NonEmpty,
  at: At,
  reason: NonEmpty,
  node: Schema.optionalKey(NonEmpty),
}).annotate({ identifier: "RelayExternal.Escalate" })
export interface Escalate extends Schema.Schema.Type<typeof Escalate> {}

// A ledger line without its chain suffix; decoding a full line drops `gen`, `prev`, `seq`, `mac` and `h`.
export const Body = Schema.Union([
  RunStart,
  StepStart,
  CheckResult,
  ApprovalRequest,
  ApprovalDecision,
  StepEnd,
  SprintComplete,
  Escalate,
]).annotate({ identifier: "RelayExternal.Body" })
export type Body = typeof Body.Type

// The snapshot the app renders, in the shape of app-shell `RelayRun` (`runs.ts` decodeRun).
export const RunStatus = Schema.Literals(["running", "parked", "completed", "failed"])
export type RunStatus = typeof RunStatus.Type
export const StepStatus = Schema.Literals(["running", "passed", "failed", "escalated"])
export type StepStatus = typeof StepStatus.Type

export const RunStep = Schema.Struct({
  wp: Schema.String,
  status: StepStatus,
  attempts: NonNegativeInt,
  startedAt: optional(At),
  endedAt: optional(At),
  checks: Schema.Array(Schema.Struct({ id: Schema.String, verdict: Verdict, output: Schema.String })),
  note: optional(Schema.String),
}).annotate({ identifier: "RelayExternal.RunStep" })
export interface RunStep extends Schema.Schema.Type<typeof RunStep> {}

export const Run = Schema.Struct({
  runID: RunID,
  documentID: Schema.String,
  version: optional(Schema.String),
  status: RunStatus,
  position: optional(Schema.String),
  failing: Schema.Array(Schema.String),
  reason: optional(Schema.String),
  label: Schema.String,
  agent: Schema.Literal("langgraph"),
  startedAt: At,
  endedAt: optional(At),
  steps: Schema.Array(RunStep),
}).annotate({ identifier: "RelayExternal.Run" })
export interface Run extends Schema.Schema.Type<typeof Run> {}

/**
 * Rebuilds the run from decoded ledger bodies, in ledger order. Undefined unless the first body is `run.start`.
 *
 * Status: `parked` while the last approval.request has no decision (a library that exits while waiting may still end
 * on `escalate`), else `completed` when the last body is `sprint-complete`, `failed` when it is `escalate`, else
 * `running`: a resume after a terminal event appends to the same run and makes it live again.
 */
export function runFromLedger(bodies: ReadonlyArray<Body>): Run | undefined {
  const start = bodies[0]
  if (start === undefined || start.event !== "run.start") return undefined
  const last = bodies.at(-1)!
  const scoped = bodies.filter(isStep)
  const decisions = scoped.filter((body) => body.event === "approval.decision")
  const request = scoped.findLast((body) => body.event === "approval.request")
  const escalated = last.event === "escalate" ? last : undefined
  const status: RunStatus =
    request !== undefined && !decisions.some((decision) => sameAttempt(decision, request))
      ? "parked"
      : last.event === "sprint-complete"
        ? "completed"
        : escalated
          ? "failed"
          : "running"
  const steps = [...new Set(scoped.map((body) => body.node))].map((node) =>
    stepOf(
      node,
      scoped.filter((body) => body.node === node),
      escalated?.node === node,
    ),
  )
  const position = escalated?.node ?? scoped.at(-1)?.node
  return {
    runID: runIDFromThread(start.thread_id),
    documentID: start.document_id ?? `external:${start.graph}`,
    version: start.document_version,
    status,
    position,
    failing:
      status === "completed"
        ? []
        : (steps.find((item) => item.wp === position)?.checks ?? [])
            .filter((check) => check.verdict === "fail")
            .map((check) => check.id),
    reason: escalated?.reason,
    label: start.graph,
    agent: "langgraph",
    startedAt: start.at,
    endedAt: status === "completed" || status === "failed" ? last.at : undefined,
    steps,
  }
}

type Scoped = StepStart | CheckResult | ApprovalRequest | ApprovalDecision | StepEnd

function isStep(body: Body): body is Scoped {
  return (
    body.event === "step.start" ||
    body.event === "check.result" ||
    body.event === "approval.request" ||
    body.event === "approval.decision" ||
    body.event === "step.end"
  )
}

function sameAttempt(left: Scoped, right: Scoped) {
  return left.node === right.node && left.attempt === right.attempt
}

// A node's latest attempt decides its checks, status and note; its first start and latest end bound it.
function stepOf(node: string, bodies: ReadonlyArray<Scoped>, escalated: boolean): RunStep {
  const attempts = Math.max(...bodies.map((body) => body.attempt))
  const latest = bodies.filter((body) => body.attempt === attempts)
  const end = latest.findLast((body) => body.event === "step.end")
  const decision = latest.findLast((body) => body.event === "approval.decision")
  return {
    wp: node,
    status: escalated ? "escalated" : end?.outcome === "pass" ? "passed" : end ? "failed" : "running",
    attempts,
    startedAt: bodies.find((body) => body.event === "step.start")?.at,
    endedAt: end?.at,
    checks: latest.flatMap((body) =>
      body.event === "check.result" ? [{ id: body.id, verdict: body.verdict, output: body.output }] : [],
    ),
    note: decision?.note === "" ? undefined : decision?.note,
  }
}

// SHA-256 of the UTF-8 bytes, as hex. Synchronous and dependency-free, because this module is shared with the app.
function sha256(text: string) {
  const bytes = new TextEncoder().encode(text)
  const length = Math.ceil((bytes.length + 9) / 64) * 64
  const padded = new Uint8Array(length)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(length - 8, Math.floor(bytes.length / 2 ** 29))
  view.setUint32(length - 4, (bytes.length * 8) >>> 0)
  const hash = Uint32Array.from(H0)
  const words = new Uint32Array(64)
  for (let block = 0; block < length; block += 64) {
    for (let i = 0; i < 64; i++) {
      if (i < 16) {
        words[i] = view.getUint32(block + i * 4)
        continue
      }
      const low = words[i - 15]!
      const high = words[i - 2]!
      const s0 = rotate(low, 7) ^ rotate(low, 18) ^ (low >>> 3)
      const s1 = rotate(high, 17) ^ rotate(high, 19) ^ (high >>> 10)
      words[i] = (words[i - 16]! + s0 + words[i - 7]! + s1) >>> 0
    }
    // [a, b, c, d, e, f, g, h]
    const state = Array.from(hash)
    for (let i = 0; i < 64; i++) {
      const [a, b, c, , e, f, g, h] = state as [number, number, number, number, number, number, number, number]
      const t1 = (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + words[i]!) >>> 0
      const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      state.pop()
      state.unshift((t1 + t2) >>> 0)
      // After the shift, index 4 holds the old d: the new e is d + t1.
      state[4] = (state[4]! + t1) >>> 0
    }
    state.forEach((value, index) => (hash[index] = (hash[index]! + value) >>> 0))
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("")
}

function rotate(value: number, bits: number) {
  return (value >>> bits) | (value << (32 - bits))
}

// FIPS 180-4 constants: the first 32 fraction bits of the square roots (H0) and cube roots (K) of the first primes.
const PRIMES = Array.from({ length: 312 }, (_, index) => index).filter(
  (candidate) =>
    candidate > 1 && Array.from({ length: candidate - 2 }, (_, index) => index + 2).every((d) => candidate % d !== 0),
)
const fraction = (value: number) => Math.floor((value - Math.floor(value)) * 2 ** 32) >>> 0
const H0 = PRIMES.slice(0, 8).map((prime) => fraction(Math.sqrt(prime)))
const K = PRIMES.slice(0, 64).map((prime) => fraction(Math.cbrt(prime)))

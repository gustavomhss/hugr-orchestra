export * as RelayExternal from "./relay-external"

import { Schema } from "effect"
import { NonNegativeInt, PositiveInt } from "./schema"

// External runs: a LangGraph process gated by the Python library writes `<project>/.relay/runs/<runID>/`. The ledger
// is the only source of truth; `run.json` is a convenience snapshot that no reader trusts. Bodies are written in the
// order their structs list, optional fields only when set, then the chain suffix `gen` (always 0), `prev`, `seq`,
// `mac` (always `sha256`) and `h`, exactly as `LedgerChain.append` does.

export const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/

// One run per LangGraph `thread_id`. The writer names the run folder: the thread ID when it matches `RUN_ID`, else
// `t_` plus the first 32 hex characters of its SHA-256. Readers take the run ID from the folder name.

// Run-scoped events use LangGraph's reserved node names, which no user node can take, and attempt 0.
export const RUN_NODE = "__start__"
export const END_NODE = "__end__"

// The idempotency key `thread_id/node/attempt/kind`. `kind` is the event name, except `check.result:<check id>`, so
// every check of one attempt has its own key. The writer skips a body whose key is already on the ledger.
export function key(input: { thread_id: string; node: string; attempt: number; kind: string }) {
  return `${input.thread_id}/${input.node}/${input.attempt}/${input.kind}`
}

// `at` is epoch milliseconds.
const base = { key: Schema.NonEmptyString, at: NonNegativeInt }
const step = { ...base, node: Schema.NonEmptyString, attempt: PositiveInt }

// A ledger line without its chain suffix; decoding a full line drops `gen`, `prev`, `seq`, `mac` and `h`.
export const Body = Schema.Union([
  Schema.Struct({
    event: Schema.Literal("run.start"),
    ...base,
    thread_id: Schema.NonEmptyString,
    graph: Schema.NonEmptyString,
    library_version: Schema.NonEmptyString,
    // Set only for projects exported from a Relay document.
    document_id: Schema.optionalKey(Schema.NonEmptyString),
    document_version: Schema.optionalKey(Schema.NonEmptyString),
  }),
  Schema.Struct({ event: Schema.Literal("step.start"), ...step }),
  // `output` may be truncated by the writer.
  Schema.Struct({
    event: Schema.Literal("check.result"),
    ...step,
    id: Schema.NonEmptyString,
    kind: Schema.Literals(["cmd", "judge"]),
    verdict: Schema.Literals(["pass", "fail", "advisory"]),
    output: Schema.String,
  }),
  Schema.Struct({ event: Schema.Literal("approval.request"), ...step }),
  // `request_seq` is the ledger seq of the approval.request it answers. The MVP library writes only `terminal`.
  Schema.Struct({
    event: Schema.Literal("approval.decision"),
    ...step,
    request_seq: NonNegativeInt,
    decision: Schema.Literals(["approve", "reject"]),
    note: Schema.String,
    source: Schema.Literals(["terminal", "orchestra"]),
  }),
  Schema.Struct({ event: Schema.Literal("step.end"), ...step, outcome: Schema.Literals(["pass", "fail"]) }),
  // The verifier's terminal events (`verify.ts` TERMINAL).
  Schema.Struct({ event: Schema.Literal("sprint-complete"), ...base }),
  Schema.Struct({
    event: Schema.Literal("escalate"),
    ...base,
    reason: Schema.NonEmptyString,
    node: Schema.optionalKey(Schema.NonEmptyString),
  }),
]).annotate({ identifier: "RelayExternal.Body" })
export type Body = typeof Body.Type

// The snapshot the app renders, in the shape of app-shell `RelayRun` (`runs.ts` decodeRun).
export type RunStep = {
  wp: string
  status: "running" | "passed" | "failed" | "escalated"
  attempts: number
  startedAt?: number
  endedAt?: number
  checks: { id: string; verdict: "pass" | "fail" | "advisory"; output: string }[]
  note?: string
}
export type Run = {
  runID: string
  documentID: string
  version?: string
  status: "running" | "parked" | "completed" | "failed"
  position?: string
  failing: string[]
  reason?: string
  label: string
  agent: "langgraph"
  startedAt: number
  endedAt?: number
  steps: RunStep[]
}

type Scoped = Extract<Body, { readonly attempt: number }>

/**
 * Rebuilds the run in folder `runID` from decoded ledger bodies, in ledger order. Undefined unless the first body is `run.start`.
 *
 * Status: `parked` while the last approval.request has no decision, else `completed` when the last body is
 * `sprint-complete`, `failed` when it is `escalate`, else `running`: a resume after a terminal event appends to the
 * same run and makes it live again.
 */
export function runFromLedger(runID: string, bodies: ReadonlyArray<Body>): Run | undefined {
  const start = bodies[0]
  if (start === undefined || start.event !== "run.start") return undefined
  const last = bodies.at(-1)!
  const scoped = bodies.filter((body): body is Scoped => "attempt" in body)
  const request = scoped.findLast((body) => body.event === "approval.request")
  const escalated = last.event === "escalate" ? last : undefined
  const status: Run["status"] =
    request !== undefined &&
    !scoped.some(
      (body) => body.event === "approval.decision" && body.node === request.node && body.attempt === request.attempt,
    )
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
    runID,
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

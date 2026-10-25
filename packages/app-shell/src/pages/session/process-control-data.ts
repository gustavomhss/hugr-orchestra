import { Capability } from "@orchestra/schema/capability"
import { Option, Schema } from "effect"
import type { Part } from "@/v2-wire"

/**
 * The latest status the agent observed for one process, never live state: no route exposes process state, so this
 * derives only from `process_control` results in the transcript.
 */
export type ProcessItem = Readonly<{
  id: Capability.JobRef["id"]
  /** From the start call, when the transcript still holds it. */
  argv?: string
  state: Capability.JobState
  exit?: Readonly<{ code?: number; signal?: string }>
  /** When the tool call that reported the latest status finished. */
  time: number
  /** The tool call that reported the latest status; the transcript anchor the item links to. */
  callID: string
}>

const terminal = new Set<Capability.JobState>(["completed", "failed", "cancelled", "lost"])

/** One item per process, most recently reported first. */
export function processItems(parts: readonly Part[]): readonly ProcessItem[] {
  const reports = parts.flatMap((part, order) => {
    if (part.type !== "tool" || part.tool !== "process_control" || part.state.status !== "completed") return []
    // A truncated or foreign output is skipped rather than guessed at.
    const output = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(part.state.output)
      .pipe(Option.flatMap(Schema.decodeUnknownOption(Output)))
    if (Option.isNone(output)) return []
    const start = Schema.decodeUnknownOption(Start)(part.state.input)
    const time = part.state.time.end
    const callID = part.callID
    return ("items" in output.value ? output.value.items : [output.value.status]).map((status) => ({ status, order, time,
      callID, argv: Option.isSome(start) ? summary(start.value.argv) : undefined }))
  })
  const latest = Map.groupBy(reports, (report) => report.status.process.id)
  return [...latest.entries()].map(([id, group]) => {
    const report = group.reduce((best, next) => next.time > best.time || (next.time === best.time && next.order > best.order)
      ? next : best)
    return { id, argv: group.find((row) => row.argv !== undefined)?.argv, state: report.status.state,
      exit: report.status.exit, time: report.time, callID: report.callID }
  }).toSorted((a, b) => b.time - a.time || b.id.localeCompare(a.id))
}

/** How many processes the header indicator counts; `unknown` and other non-terminal states count as running. */
export function runningCount(items: readonly ProcessItem[]) {
  return items.filter((item) => !terminal.has(item.state)).length
}

function summary(argv: readonly string[]) {
  return argv.map((arg) => /\s|^$/.test(arg) ? JSON.stringify(arg) : arg).join(" ")
}

const Status = Schema.Struct({
  process: Capability.JobRef,
  state: Capability.JobState,
  exit: Schema.optional(Schema.Struct({ code: Schema.optional(Schema.Int), signal: Schema.optional(Schema.String) })),
})
const Output = Schema.Union([
  Schema.Struct({ action: Schema.Literal("list"), items: Schema.Array(Status) }),
  Schema.Struct({ action: Schema.Literals(["start", "status", "write", "submit", "close-input", "log", "wait", "stop", "transfer"]),
    status: Status }),
])
const Start = Schema.Struct({ action: Schema.Literal("start"), argv: Schema.Array(Schema.String).check(Schema.isMinLength(1)) })

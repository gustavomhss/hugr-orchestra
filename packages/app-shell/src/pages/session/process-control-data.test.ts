import { expect, test } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import type { Part } from "@/v2-wire"
import { processItems, runningCount } from "./process-control-data"

const job = (index: number) => Capability.JobID.make(`cjob_${String(index).padStart(26, "0")}`)
const status = (index: number, state: Capability.JobState, exit?: { code?: number; signal?: string }) => ({
  process: { id: job(index) }, state, output: { retainedStart: 0, end: 12, eof: state === "completed" }, input: "open",
  ...(exit ? { exit } : {}),
})
const call = (callID: string, end: number, input: Record<string, unknown>, output: unknown, tool = "process_control"): Part => ({
  id: `prt_${callID}`, sessionID: "ses_1", messageID: "msg_1", type: "tool", callID, tool,
  state: { status: "completed", input, output: typeof output === "string" ? output : JSON.stringify(output), title: "",
    metadata: {}, time: { start: end - 1, end } },
})

const transcript: Part[] = [
  call("call_start_1", 10, { action: "start", argv: ["bun", "run", "dev server"] }, { action: "start", status: status(1, "running") }),
  call("call_start_2", 11, { action: "start", argv: ["sleep", "60"] }, { action: "start", status: status(2, "submitted") }),
  call("call_wait_1", 20, { action: "wait", process: { id: job(1) } },
    { action: "wait", status: status(1, "completed", { code: 0 }), timedOut: false }),
  call("call_list", 30, { action: "list" }, { action: "list", items: [status(2, "running"), status(3, "unknown")] }),
  // Equal finish time: the later transcript entry wins.
  call("call_log_2", 30, { action: "log", process: { id: job(2) } },
    { action: "log", status: status(2, "running"), chunk: { data: "tick", cursor: 4 } }),
  call("call_truncated", 40, { action: "status", process: { id: job(2) } }, '{"action":"status","status":{"process"'),
  call("call_other", 50, { action: "start", argv: ["rm"] }, { action: "start", status: status(4, "running") }, "bash"),
  { id: "prt_running", sessionID: "ses_1", messageID: "msg_1", type: "tool", callID: "call_running", tool: "process_control",
    state: { status: "running", input: { action: "stop", process: { id: job(2) } }, time: { start: 60 } } },
  { id: "prt_text", sessionID: "ses_1", messageID: "msg_1", type: "text", text: JSON.stringify({ status: status(5, "running") }) } as Part,
]

test("derives the latest observed status per process and counts non-terminal ones as running", () => {
  const items = processItems(transcript)
  expect(items).toEqual([
    { id: job(3), argv: undefined, state: "unknown", exit: undefined, time: 30, callID: "call_list" },
    { id: job(2), argv: "sleep 60", state: "running", exit: undefined, time: 30, callID: "call_log_2" },
    { id: job(1), argv: 'bun run "dev server"', state: "completed", exit: { code: 0 }, time: 20, callID: "call_wait_1" },
  ])
  expect(runningCount(items)).toBe(2)
})

test("every terminal state leaves the running count", () => {
  const parts = (["completed", "failed", "cancelled", "lost", "cancel-requested", "intent"] as const).map((state, index) =>
    call(`call_${index}`, index + 1, { action: "status", process: { id: job(index) } }, { action: "status", status: status(index, state) }))
  expect(runningCount(processItems(parts))).toBe(2)
  expect(processItems([])).toEqual([])
  expect(runningCount([])).toBe(0)
})

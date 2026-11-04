// Project a private Grok stream to fixed labels/counters. Never export text, reasoning, tool inputs or stderr.
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

export function summarizeGrokTrace(text, code) {
  assert(Number.isInteger(code) && code >= 0, "grok-trace: invalid process status")
  const events = text.split("\n").filter((line) => line.trim()).map((line) => {
    try { return JSON.parse(line) } catch { throw new Error("grok-trace: invalid event stream") }
  })
  assert(events.every((event) => event !== null && typeof event === "object"), "grok-trace: invalid event")
  const init = events.find((event) => event.type === "system" && event.subtype === "init")
  const result = events.findLast((event) => event.type === "result")
  const blocks = events.flatMap((event) => Array.isArray(event.message?.content) ? event.message.content : [])
  const reasons = new Set(["end_turn", "max_tokens", "max_turn_requests", "refusal", "cancelled", "tool_use"])
  const subtypes = new Set(["success", "error_max_turns", "error_during_execution", "error_max_structured_output_retries"])
  return {
    processCode: code,
    events: events.length,
    partialEvents: events.filter((event) => event.type === "stream_event").length,
    partialTextDeltas: events.filter((event) => event.type === "stream_event" && event.event?.delta?.type === "text_delta").length,
    partialReasoningDeltas: events.filter((event) => event.type === "stream_event" && event.event?.delta?.type === "thinking_delta").length,
    partialToolStarts: events.filter((event) => event.type === "stream_event" && event.event?.type === "content_block_start" &&
      ["tool_use", "server_tool_use"].includes(event.event.content_block?.type)).length,
    sawInit: init !== undefined,
    toolCount: Array.isArray(init?.tools) ? init.tools.length : null,
    mcpCount: Array.isArray(init?.mcp_servers) ? init.mcp_servers.length : null,
    toolUses: blocks.filter((block) => block?.type === "tool_use" || block?.type === "server_tool_use").length,
    textBlocks: blocks.filter((block) => block?.type === "text").length,
    reasoningBlocks: blocks.filter((block) => block?.type === "thinking").length,
    sawResult: result !== undefined,
    result: result === undefined ? null : {
      subtype: subtypes.has(result.subtype) ? result.subtype : "unknown",
      stopReason: reasons.has(result.stop_reason) ? result.stop_reason : "unknown",
      turns: Number.isInteger(result.num_turns) ? result.num_turns : null,
      isError: typeof result.is_error === "boolean" ? result.is_error : null,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const summary = summarizeGrokTrace(readFileSync(process.argv[2], "utf8"), Number(process.argv[4]))
  writeFileSync(process.argv[3], JSON.stringify(summary, null, 2) + "\n")
  console.log(JSON.stringify(summary))
  if (!summary.sawInit || summary.toolCount !== 0 || summary.mcpCount !== 0 || !summary.sawResult ||
    summary.processCode !== 0 || summary.toolUses > 0 || summary.partialToolStarts > 0 ||
    summary.result?.subtype !== "success" || summary.result?.stopReason !== "end_turn") process.exitCode = 1
}

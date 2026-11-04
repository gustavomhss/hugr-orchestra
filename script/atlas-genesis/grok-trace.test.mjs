import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { summarizeGrokTrace } from "./grok-trace.mjs"

function assertSanitizedSummary(summarize) {
  const events = [
    { type: "system", subtype: "init", tools: ["private-tool"], mcp_servers: [], apiKeySource: "private-source" },
    { type: "assistant", message: { content: [
      { type: "thinking", thinking: "private reasoning" },
      { type: "tool_use", name: "private-tool", input: { token: "private-token" } },
      { type: "text", text: "private answer" },
    ] } },
    { type: "result", subtype: "error_max_turns", stop_reason: "max_turn_requests", num_turns: 1, is_error: true, errors: ["private error"] },
  ]
  assert.deepEqual(summarize(events.map((event) => JSON.stringify(event)).join("\n"), 1), {
    processCode: 1, events: 3, partialEvents: 0, sawInit: true, toolCount: 1, mcpCount: 0, toolUses: 1, textBlocks: 1,
    reasoningBlocks: 1, sawResult: true,
    result: { subtype: "error_max_turns", stopReason: "max_turn_requests", turns: 1, isError: true },
  })
}

test("trace summary retains measured metadata and excludes all raw model/tool/credential fields", () => {
  assertSanitizedSummary(summarizeGrokTrace)
})

test("positive control: the same summary oracle rejects adding raw stream content", async () => {
  const source = readFileSync(new URL("./grok-trace.mjs", import.meta.url), "utf8")
  const target = "processCode: code,"
  assert.equal(source.split(target).length, 2, "mutation must change exactly one production field")
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(source.replace(target, "processCode: code, raw: text,")).toString("base64")}`)
  assert.throws(() => assertSanitizedSummary(mutant.summarizeGrokTrace), assert.AssertionError)
})

test("an empty or truncated stream is recorded as incomplete, never a successful model call", () => {
  const empty = summarizeGrokTrace("", 124)
  assert.equal(empty.sawInit, false)
  assert.equal(empty.sawResult, false)
  assert.equal(empty.toolCount, null)
  assert.equal(empty.processCode, 124)
  assert.throws(() => summarizeGrokTrace("not-json", 1), /invalid event stream/)
  assert.throws(() => summarizeGrokTrace("null", 1), /invalid event/)
})

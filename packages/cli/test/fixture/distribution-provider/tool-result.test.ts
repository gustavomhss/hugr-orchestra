import { expect, test } from "bun:test"
import { Schema } from "effect"
import { SessionMessage } from "../../../../schema/src/session-message"
import { WireRequest } from "../distribution-provider-wire"
import { calibrateSuccessfulBashResult, requireSuccessfulBashResult } from "../distribution-provider-tool-result"

const nonce = "unpredictable-proof-nonce"
const stdout = `${nonce}\n`
const state = SessionMessage.ToolStateCompleted.make({ status: "completed", input: { command: "owned nonce command" },
  structured: { exit: 0, truncated: false }, content: [
    { type: "text", text: stdout }, { type: "text", text: "Command exited with code 0." },
  ] })
const tool = Schema.decodeUnknownSync(SessionMessage.AssistantTool)({
  type: "tool", id: "call-proof", name: "bash", state, time: { created: 1, ran: 2, completed: 3 },
})
const request = Schema.decodeUnknownSync(WireRequest)({ model: "qwen3:0.6b", messages: [
  { role: "user", content: `Nonce already appears in prompt: ${nonce}` },
  { role: "assistant", tool_calls: [{ id: tool.id, function: { name: "bash", arguments: "{}" } }] },
  { role: "tool", tool_call_id: tool.id, content: `${stdout}\nCommand exited with code 0.` },
] })

test("successful oracle accepts exact full wire/durable/stdout/exit/truncation agreement", () => {
  expect(requireSuccessfulBashResult(request, tool, stdout)).toEqual({ callID: tool.id, stdout,
    exit: 0, truncated: false, wireContent: `${stdout}\nCommand exited with code 0.` })
})

test("nonce-only, trimmed stdout, wrong exit notice, extra bytes and nontext wire views fail", () => {
  for (const content of [nonce, stdout, `${nonce}\nCommand exited with code 0.`,
    `${stdout}\nCommand exited with code 1.`, `${stdout}\nCommand exited with code 0.extra`, [{ type: "text", text: nonce }]]) {
    const mutated = { ...request, messages: request.messages.map((message) => message.role === "tool" ? { ...message, content } : message) }
    expect(() => requireSuccessfulBashResult(mutated, tool, stdout)).toThrow(new Error("PROVIDER_WIRE_BASH_TOOL_RESULT_MISMATCH"))
  }
})

test("correct wire cannot hide incorrect durable exit, truncation or timeout fields", () => {
  for (const structured of [{ exit: 1, truncated: false }, { exit: 0, truncated: true },
    { exit: 0, truncated: false, timeout: true }, { truncated: false }]) {
    expect(() => requireSuccessfulBashResult(request, { ...tool, state: { ...state, structured } }, stdout))
      .toThrow(new Error("PROVIDER_DURABLE_BASH_STRUCTURED_MISMATCH"))
  }
})

test("correct wire cannot hide wrong durable text blocks or different actual stdout", () => {
  expect(() => requireSuccessfulBashResult(request, { ...tool, state: { ...state,
    content: [{ type: "text", text: nonce }] } }, stdout)).toThrow(new Error("PROVIDER_DURABLE_BASH_CONTENT_MISMATCH"))
  expect(() => requireSuccessfulBashResult(request, tool, `${stdout}extra`)).toThrow(new Error("PROVIDER_DURABLE_BASH_CONTENT_MISMATCH"))
  expect(() => requireSuccessfulBashResult(request, { ...tool, name: "read" }, stdout)).toThrow(new Error("PROVIDER_DURABLE_BASH_NOT_COMPLETED"))
})

test("missing, duplicated or wrong-call-id tool result cannot satisfy cardinality", () => {
  const sent = request.messages.filter((message) => message.role === "tool")
  for (const messages of [request.messages.filter((message) => message.role !== "tool"), [...request.messages, ...sent],
    request.messages.map((message) => message.role === "tool" ? { ...message, tool_call_id: "other-call" } : message)]) {
    expect(() => requireSuccessfulBashResult({ ...request, messages }, tool, stdout))
      .toThrow(new Error("PROVIDER_WIRE_BASH_TOOL_RESULT_CARDINALITY"))
  }
})

test("real-request-copy calibration preserves unknown fields and original durable input", async () => {
  const captured = { ...request, temperature: 0, vendor: { keep: true }, messages: request.messages.map((message) => ({ ...message, vendorField: "kept" })) }
  const json = JSON.stringify(captured)
  const before = structuredClone(tool)
  const result = await calibrateSuccessfulBashResult(json, tool, stdout, nonce)
  expect(result.rejected).toBe("PROVIDER_WIRE_BASH_TOOL_RESULT_MISMATCH")
  expect(result.before).toEqual(result.after)
  expect(result.restored).toEqual(captured)
  expect(result.mutation.messages.find((message) => message.role === "tool")?.content).toBe(nonce)
  expect(tool).toEqual(before)
  expect(JSON.stringify(captured)).toBe(json)
})

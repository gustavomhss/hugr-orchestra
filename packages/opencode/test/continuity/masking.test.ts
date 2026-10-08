import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ATTACHMENT_TOKENS, ERROR_LINES, TAIL_STEPS, apply, candidates, estimate, stub } from "@/continuity/masking"
import { PartID } from "@/session/schema"
import { messages, sessionID } from "./memory-fixture"

const REF = "a".repeat(64)

function tool(message: SessionV1.WithParts, name: string, output: string, extra: { exit?: number; input?: Record<string, unknown> } = {}) {
  const part = {
    id: PartID.ascending(), messageID: message.info.id, sessionID, type: "tool" as const, tool: name, callID: `call_${name}`,
    state: { status: "completed" as const, input: extra.input ?? { filePath: "src/app.ts" }, title: name, output,
      metadata: extra.exit === undefined ? {} : { exit: extra.exit }, time: { start: 1, end: 2 } },
  } as SessionV1.ToolPart
  message.parts.push(part)
  return part
}

// Sixteen alternating messages: eight steps. The first three steps are older than the tail.
function history() {
  const value = messages()
  const big = "line of output\n".repeat(2_000)
  const read = tool(value[1], "read", big)
  const bash = tool(value[3], "bash", big, { exit: 0, input: { command: "npm test" } })
  const todo = tool(value[3], "todowrite", big)
  tool(value[3], "task", big)
  tool(value[3], "maestro_request_review", big)
  const recent = tool(value[value.length - 1], "read", big)
  return { value, read, bash, todo, recent }
}

test("only completed, unprotected results older than the verbatim tail are candidates", () => {
  const { value, read, bash, todo, recent } = history()
  const found = candidates(value, new Map()).map((entry) => entry.part.id)
  expect(found).toEqual([read.id, bash.id])
  expect(found).not.toContain(todo.id)
  expect(found).not.toContain(recent.id)
  expect(candidates(value, new Map([[read.id, REF]])).map((entry) => entry.part.id)).toEqual([bash.id])
  expect(candidates(value.slice(-(TAIL_STEPS * 2)), new Map())).toEqual([])
})

test("candidates report the tokens that masking frees", () => {
  const { value } = history()
  for (const entry of candidates(value, new Map())) expect(entry.saved).toBeGreaterThan(5_000)
})

test("masking replaces output in copies and leaves stored history unchanged", () => {
  const { value, read } = history()
  const before = JSON.stringify(value)
  const masked = apply(value, new Map([[read.id, REF]]))
  expect(JSON.stringify(value)).toBe(before)
  const part = masked[1].parts.find((item) => item.id === read.id)
  if (part?.type !== "tool" || part.state.status !== "completed") throw new Error("Expected masked tool part")
  expect(part.state.output).toStartWith("[masked tool result: read filePath=src/app.ts → completed")
  expect(part.state.output).toContain(`context_recall {"reference":"${REF}"}`)
  expect(masked[0]).toBe(value[0])
})

test("failed output keeps its leading lines verbatim", () => {
  const { value } = history()
  const lines = Array.from({ length: 50 }, (_, index) => `error line ${index}`)
  const failed = tool(value[1], "bash", lines.join("\n"), { exit: 2, input: { command: "make build" } })
  if (failed.state.status !== "completed") throw new Error("Expected completed tool")
  const text = stub(failed as Parameters<typeof stub>[0], REF)
  expect(text).toStartWith(lines.slice(0, ERROR_LINES).join("\n"))
  expect(text).not.toContain(lines[ERROR_LINES])
  expect(text).toContain(`masked ${50 - ERROR_LINES} more lines: bash command=make build → exit 2`)
  const short = tool(value[1], "bash", "fatal: short failure", { exit: 1 })
  expect(stub(short as Parameters<typeof stub>[0], REF)).toBe("fatal: short failure")
  expect(candidates(value, new Map()).map((entry) => entry.part.id)).not.toContain(short.id)
})

test("an inline file counts ATTACHMENT_TOKENS, and masking an old one frees them", () => {
  const { value } = history()
  const image = `data:image/png;base64,${"iVBORw0KGgo".repeat(200_000)}`
  const shot = tool(value[1], "read", "Image read successfully", { input: { filePath: "shot.png" } })
  if (shot.state.status !== "completed") throw new Error("Expected completed tool")
  shot.state.attachments = [{ id: PartID.ascending(), sessionID, messageID: value[1].info.id, type: "file", mime: "image/png", url: image }]
  expect(estimate({ type: "file", mime: "image/png", url: image })).toBeLessThan(ATTACHMENT_TOKENS + 20)
  expect(estimate({ url: image })).toBeGreaterThan(500_000)
  expect(estimate({ text: "line of output\n".repeat(2_000) })).toBeGreaterThan(5_000)
  const found = candidates(value, new Map()).find((entry) => entry.part.id === shot.id)
  expect(found?.saved).toBeGreaterThan(ATTACHMENT_TOKENS - 100)
  const part = apply(value, new Map([[shot.id, REF]]))[1].parts.find((item) => item.id === shot.id)
  if (part?.type !== "tool" || part.state.status !== "completed") throw new Error("Expected masked tool part")
  expect(part.state.attachments).toEqual([])
})

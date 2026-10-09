import { expect, test } from "bun:test"
import { ToolModelCapture } from "../src/tool/model-capture"

test("capture binding owns detached policy snapshots and rejects crossed call owners", () => {
  const owner = { sessionID: "session", callID: "call" }
  const output = { structured: { exit: 0, nested: { status: "original" } }, content: [{ type: "text" as const, text: "capture" }] }
  ToolModelCapture.record(output, { textIndex: 0, observation: { source: "shell", command: "go test .", output: "capture",
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" } }, owner)
  expect(ToolModelCapture.bind(output, output, { ...owner, callID: "another" })).toBeUndefined()
  const binding = ToolModelCapture.bind(output, output, owner)!
  output.structured.nested.status = "mutated"
  output.content[0].text = "mutated"
  expect(binding.baseline.structured).toEqual({ exit: 0, nested: { status: "original" } })
  expect(binding.baseline.content[0]).toEqual({ type: "text", text: "capture" })
  expect(binding.candidate.template.content[0]).toEqual({ type: "text", text: "capture" })
})

test("non-plain structured state and clone failure decline capture without altering native output", () => {
  const owner = { sessionID: "session", callID: "call" }
  const values: unknown[] = [new Map([["nested", { changed: false }]]), new Set(["value"]), new Date(), () => "uncloneable"]
  for (const structured of values) {
    const output = { structured, content: [{ type: "text" as const, text: "capture" }] }
    ToolModelCapture.record(output, { textIndex: 0, observation: { source: "shell", command: "go test .", output: "capture",
      termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" } }, owner)
    expect(ToolModelCapture.get(output)).toBeUndefined()
    expect(output.structured).toBe(structured)
  }
})

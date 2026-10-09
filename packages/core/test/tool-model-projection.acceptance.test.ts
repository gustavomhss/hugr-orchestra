import { expect, test } from "bun:test"
import { ToolModelCapture } from "../src/tool/model-capture"
import { ToolModelProjection } from "../src/tool/model-projection"

test("native projection replaces capture only, preserves policy notes and fits the complete model budget", () => {
  const owner = { sessionID: "session", callID: "call" }
  const original = { structured: { exit: 0, truncated: false }, content: [
    { type: "text" as const, text: "noise\nKEEP 😀\n" },
    { type: "text" as const, text: "Command exited with code 0. Warning stays." },
  ] }
  ToolModelCapture.record(original, { textIndex: 0, observation: {
    source: "shell", command: "go test -v .", output: original.content[0].text,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown",
  } }, owner)
  const baseline = { ...original, content: [{ type: "text" as const, text: "old bounded preview" }] }
  const binding = ToolModelCapture.bind(original, baseline, owner)
  const approved = { ...baseline, content: [...baseline.content, { type: "text" as const, text: "POLICY NOTE" }] }
  const result = ToolModelProjection.project({ enabled: true, owner, binding, approved,
    limits: { maxLines: 10, maxBytes: 200 }, filter: () => ({ status: "reduced", replacement: "KEEP 😀\n", profile: "fixture",
      inputBytes: Buffer.byteLength(original.content[0].text), outputBytes: Buffer.byteLength("KEEP 😀\n"), reason: "fixture" }) })
  expect(result.output.content).toEqual([
    { type: "text", text: "KEEP 😀\n" }, original.content[1], { type: "text", text: "POLICY NOTE" },
  ])
  expect(result.output.structured).toBe(original.structured)
  expect(result.decision?.status).toBe("reduced")
  expect(approved.content[0].text).toBe("old bounded preview")
})

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

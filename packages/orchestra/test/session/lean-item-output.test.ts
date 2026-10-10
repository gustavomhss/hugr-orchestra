import { expect, test } from "bun:test"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LegacyLeanCapture } from "../../src/tool/lean-capture"
import { LegacyLeanOutput } from "../../src/session/lean-output"

const owner = { sessionID: "session", callID: "call" }
const telemetry = { owner: { projectID: "project", location: "/repo/profile", ...owner }, model: { provider: "provider", id: "model" } }
const raw = "=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n"
const reduced = "PASS\nok  \texample.test\t0.001s\n"
const limits = { maxLines: 100, maxBytes: 10000 }

function fixture(command = "go test -v .", output = raw) {
  const result = { title: command, output, metadata: { exit: 0, timeout: false, truncated: false, aborted: false } }
  LegacyLeanCapture.record(result, { source: "shell", command, output,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }, owner)
  return { output: result, binding: LegacyLeanCapture.bind(result, result, owner), owner, limits, enabled: true, command }
}

test("disabled item preserves whole approved view, policy appendix and flags", () => {
  const f = fixture()
  const output = { ...f.output, output: `${raw}\n\nPOLICY KEEP 😀` }
  const input = { ...f, output, items: { go: false } }
  expect(LegacyLeanOutput.project(input)).toBe(output)
  const selected = LegacyLeanOutput.project({ ...input, telemetry })
  expect(selected.output).toBe(output.output)
  const lean = Reflect.get(selected.metadata, "lean")
  const metadata = { ...selected.metadata }
  Reflect.deleteProperty(metadata, "lean")
  expect(metadata).toEqual(output.metadata)
  expect(selected.title).toBe(output.title)
  expect(LeanMetrics.decode(lean)).toMatchObject({ itemID: "go", eligible: true,
    status: "passthrough", reason: "item_disabled", bytes: { saved: 0 } })
  expect(LeanMetrics.decode(lean)?.filterProfile).toBeUndefined()
})

test("Cargo toggle leaves Go default enabled; next projection sees changed item controls", () => {
  const f = fixture()
  expect(LegacyLeanOutput.project({ ...f, items: { cargo: false } }).output).toBe(reduced)
  expect(LegacyLeanOutput.project({ ...f, items: { go: false } })).toBe(f.output)
  expect(LegacyLeanOutput.project({ ...f, items: { go: true } }).output).toBe(reduced)
})

test("unavailable config or uncertain preferences preserve settled output and expose honest reason", () => {
  const f = fixture()
  for (const unavailable of ["config_unavailable", "preferences_unavailable", "preferences_scope_mismatch"] as const) {
    const selected = LegacyLeanOutput.project({ ...f, unavailable, telemetry })
    expect(selected.output).toBe(raw)
    expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))).toMatchObject({ itemID: "go", status: "passthrough", reason: unavailable })
  }
})

test("failed native invocation keeps known literal item without claiming native eligibility", () => {
  const f = fixture()
  const output = { ...f.output, metadata: { ...f.output.metadata, exit: 1 }, output: "exit code: 1\nFAILED KEEP" }
  const selected = LegacyLeanOutput.project({ ...f, output, binding: undefined, telemetry })
  expect(selected.output).toBe(output.output)
  expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))).toMatchObject({ itemID: "go", producer: "unverified",
    eligible: false, status: "passthrough", reason: "not_eligible" })
})

test("plugin mutation, capture loss and refusal preserve bytes and all settled flags", () => {
  const f = fixture()
  for (const patch of [
    { output: `plugin changed\n${raw}` },
    { metadata: { ...f.output.metadata, truncated: true } },
    { metadata: { ...f.output.metadata, timeout: true } },
    { isError: true },
  ]) {
    const output = { ...f.output, ...patch }
    expect(LegacyLeanOutput.project({ ...f, output })).toBe(output)
  }
  expect(LegacyLeanOutput.project({ ...f, limits: { maxLines: 1, maxBytes: 1 } })).toBe(f.output)
  expect(LegacyLeanOutput.project({ ...f, owner: { ...owner, callID: "foreign" } })).toBe(f.output)
})

test("default Jest/Vitest plaintext and ambiguous command remain exact with selective options", () => {
  for (const command of ["jest", "vitest run"]) {
    const f = fixture(command, "PASS test/example.test.ts\nTests: 1 passed, 1 total\n")
    expect(LegacyLeanOutput.project({ ...f, items: { cargo: false } })).toBe(f.output)
    const selected = LegacyLeanOutput.project({ ...f, telemetry })
    expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))?.itemID).toBe(command.startsWith("vitest") ? "vitest" : "jest")
    expect(selected.output).toBe(f.output.output)
  }
  const f = fixture("go test -v . && cargo test")
  expect(LegacyLeanOutput.project({ ...f, items: { cargo: false } })).toBe(f.output)
  expect(LeanMetrics.decode(Reflect.get(LegacyLeanOutput.project({ ...f, telemetry }).metadata, "lean"))?.itemID).toBeUndefined()
})

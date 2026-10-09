import { expect, test } from "bun:test"
import { LegacyLeanCapture } from "../../src/tool/lean-capture"
import { LegacyLeanOutput } from "../../src/session/lean-output"

const raw = "=== RUN   TestOne\n--- PASS: TestOne (0.00s)\nPASS\nok  \texample.test\t0.001s\n"
const reduced = "PASS\nok  \texample.test\t0.001s\n"
const owner = { sessionID: "session", callID: "call" }

function fixture() {
  const output = { title: "go test -v .", metadata: { exit: 0, truncated: false, timeout: false, aborted: false }, output: raw }
  LegacyLeanCapture.record(output, { source: "shell", command: output.title, output: raw,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown" }, owner)
  const approved = { ...output }
  const binding = LegacyLeanCapture.bind(output, approved, owner)
  return { output, approved, binding }
}

test("standard native projection uses actual approved engine and preserves appended policy text", () => {
  const f = fixture()
  expect(f.binding).toBeDefined()
  expect(LegacyLeanOutput.unchanged(f.binding!, f.approved)).toBe(true)
  const approved = { ...f.approved, output: `${raw}\n\nPOLICY WARNING 😀` }
  const result = LegacyLeanOutput.project({ output: approved, binding: f.binding, owner, enabled: true,
    limits: { maxLines: 100, maxBytes: 1000 } })
  expect(result.output).toBe(`${reduced}\n\nPOLICY WARNING 😀`)
  expect(result.metadata).toBe(approved.metadata)
  expect(result.title).toBe(approved.title)
  expect(approved.output).toBe(`${raw}\n\nPOLICY WARNING 😀`)
  expect(f.output.output).toBe(raw)
})

test("standard native disabled, wrong owner, budget or policy mutation keeps exact approved object", () => {
  const f = fixture()
  for (const input of [
    { enabled: false, owner, limits: { maxLines: 100, maxBytes: 1000 } },
    { enabled: true, owner: { ...owner, callID: "another" }, limits: { maxLines: 100, maxBytes: 1000 } },
    { enabled: true, owner, limits: { maxLines: 1, maxBytes: 1 } },
  ]) expect(LegacyLeanOutput.project({ output: f.approved, binding: f.binding, ...input })).toBe(f.approved)
  const changed = { ...f.approved, output: `plugin mutation\n${raw}` }
  expect(LegacyLeanOutput.unchanged(f.binding!, changed)).toBe(false)
  expect(LegacyLeanOutput.project({ output: changed, binding: f.binding, owner, enabled: true,
    limits: { maxLines: 100, maxBytes: 1000 } })).toBe(changed)
  const metadata = { ...f.approved, metadata: { ...f.approved.metadata, exit: 7 } }
  expect(LegacyLeanOutput.project({ output: metadata, binding: f.binding, owner, enabled: true,
    limits: { maxLines: 100, maxBytes: 1000 } })).toBe(metadata)
})

test("same-name or serialized metadata cannot issue a native standard carrier", () => {
  const f = fixture()
  const fake = structuredClone(f.output)
  expect(LegacyLeanCapture.bind(fake, fake, owner)).toBeUndefined()
  expect(LegacyLeanOutput.project({ output: fake, owner, enabled: true, limits: { maxLines: 100, maxBytes: 1000 } })).toBe(fake)
})

test("plugin root outcomes and unknown extensions invalidate the complete native mapping", () => {
  const f = fixture()
  for (const patch of [{ isError: true }, { type: "error" }, { state: "cancelled" }, { unknownExtension: "changed" }]) {
    const changed = { ...f.approved, ...patch }
    expect(LegacyLeanOutput.unchanged(f.binding!, changed)).toBe(false)
    expect(LegacyLeanOutput.project({ output: changed, binding: f.binding, owner, enabled: true,
      limits: { maxLines: 100, maxBytes: 1000 } })).toBe(changed)
  }
})

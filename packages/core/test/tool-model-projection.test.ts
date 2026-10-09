import { expect, test } from "bun:test"
import type { ToolContent } from "@orchestra/schema/llm"
import { ToolModelCapture } from "../src/tool/model-capture"
import { ToolModelProjection } from "../src/tool/model-projection"

const text = (text: string) => ({ type: "text" as const, text })
const media = { type: "file" as const, uri: "data:image/png;base64,AA==", mime: "image/png", name: "proof.png" }
const owner = { sessionID: "session", callID: "call" }
const decision = (raw: string, replacement = "KEEP 😀\n"): ToolModelProjection.FilterResult => ({
  status: "reduced", replacement, profile: "fixture", reason: "preserve evidence",
  inputBytes: Buffer.byteLength(raw), outputBytes: Buffer.byteLength(replacement),
})
function fixture(raw = "noise\nKEEP 😀\n", content: ToolContent[] = [text(raw), text("Command exited with code 0. Warning stays.")],
  index = 0, notes: ToolContent[] = [text("POLICY NOTE")], facts: Partial<ToolModelCapture.Observation> = {}) {
  const original = { structured: { exit: 0, nested: { status: "native", warnings: ["keep"] } }, content }
  ToolModelCapture.record(original, { textIndex: index, observation: { source: "shell", command: "go test -v .", output: raw,
    termination: { kind: "exited", code: 0 }, completeness: "complete", presentation: "unknown", ...facts } }, owner)
  const baseline = { structured: original.structured, content: [text("old bounded preview"), ...content.filter((x) => x.type === "file")] }
  const binding = ToolModelCapture.bind(original, baseline, owner)
  const approved = structuredClone({ ...baseline, content: [...baseline.content, ...notes] })
  const calls: ToolModelCapture.Observation[] = []
  const input: ToolModelProjection.Input = { enabled: true, owner, binding, approved, limits: { maxLines: 20, maxBytes: 500 },
    filter: (observation) => { calls.push(observation); return decision(raw) } }
  return { original, baseline, approved, binding, calls, input }
}
function decline(input: ToolModelProjection.Input) {
  const result = ToolModelProjection.project(input)
  expect(result.output).toBe(input.approved)
  expect(result.decision).toBeUndefined()
}

test("native capture replaces old bounded preview and appends approved policy note", () => {
  const f = fixture()
  const before = structuredClone({ original: f.original, baseline: f.baseline, approved: f.approved, binding: f.binding })
  const result = ToolModelProjection.project(f.input)
  expect(result.output.content).toEqual([text("KEEP 😀\n"), f.original.content[1], text("POLICY NOTE")])
  expect(result.output.structured).toBe(f.approved.structured)
  expect(result.decision).toEqual(decision("noise\nKEEP 😀\n"))
  expect(f.calls).toEqual([f.binding!.candidate.observation])
  expect(f.original).toEqual(before.original)
  expect(f.baseline).toEqual(before.baseline)
  expect(f.approved).toEqual(before.approved)
  expect(f.binding).toEqual(before.binding)
})

test("only designated duplicate slot changes; media, distinct status, warnings and multiple notes survive", () => {
  const raw = "noise\nKEEP 😀\n"
  const content = [text(raw), media, text(raw), text("stderr WARNING"), text("exit status: 0")]
  const f = fixture(raw, content, 2, [text("POLICY 1"), text("POLICY 2")])
  const result = ToolModelProjection.project(f.input)
  expect(result.output.content).toEqual([text(raw), media, text("KEEP 😀\n"), text("stderr WARNING"), text("exit status: 0"), text("POLICY 1"), text("POLICY 2")])
  expect(result.output.structured).toBe(f.approved.structured)
  expect(result.output.structured).toEqual({ exit: 0, nested: { status: "native", warnings: ["keep"] } })
  expect(f.original.content).toEqual(content)
})

const ineligible: [string, Partial<ToolModelCapture.Observation>][] = [
  ["other source", { source: "other" }], ["nonzero exit", { termination: { kind: "exited", code: 1 } }],
  ["unknown termination", { termination: { kind: "unknown" } }], ["timeout", { termination: { kind: "timed_out" } }],
  ["NaN exit", { termination: { kind: "exited", code: NaN } }], ["truncated", { completeness: "truncated" }],
  ["unknown completeness", { completeness: "unknown" }],
]
for (const [name, facts] of ineligible) test(`declines ${name} without processor`, () => {
  const f = fixture(undefined, undefined, undefined, undefined, facts)
  decline(f.input)
  expect(f.calls).toHaveLength(0)
})
for (const mode of ["disabled", "missing", "fake binding", "fake candidate", "session", "call"] as const)
  test(`declines ${mode} capability without processor`, () => {
    const f = fixture()
    const input = { ...f.input }
    if (mode === "disabled") input.enabled = false
    if (mode === "missing") input.binding = undefined
    if (mode === "fake binding") input.binding = { ...f.binding! }
    if (mode === "fake candidate") input.binding = { ...f.binding!, candidate: { ...f.binding!.candidate } }
    if (mode === "session") input.owner = { ...owner, sessionID: "other" }
    if (mode === "call") input.owner = { ...owner, callID: "other" }
    decline(input)
    expect(f.calls).toHaveLength(0)
  })
for (const key of ["maxLines", "maxBytes"] as const)
  for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    test(`declines invalid ${key}=${value} without processor`, () => {
      const f = fixture()
      decline({ ...f.input, limits: { ...f.input.limits, [key]: value } })
      expect(f.calls).toHaveLength(0)
    })
for (const index of [-1, 0.5, 99, 1]) test(`invalid slot ${index} cannot project`, () => {
  const f = fixture("raw", [text("raw"), media], index)
  decline(f.input)
  expect(f.calls).toHaveLength(0)
})
test("capture text mismatch cannot project", () => {
  const f = fixture("raw", [text("different")])
  decline(f.input)
  expect(f.calls).toHaveLength(0)
})

const mutations: [string, (f: ReturnType<typeof fixture>) => void][] = [
  ["nested structured", (f) => { f.approved.structured.nested.status = "changed" }],
  ["structured warning", (f) => { f.approved.structured.nested.warnings.push("changed") }],
  ["structured field", (f) => { f.approved.structured.exit = 1 }],
  ["text", (f) => { Object.assign(f.approved.content[0], { text: "changed" }) }],
  ["media", (f) => { Object.assign(f.approved.content[1], { uri: "changed" }) }],
  ["order", (f) => { f.approved.content.reverse() }],
  ["removed prefix", (f) => { f.approved.content.shift() }],
  ["inserted prefix", (f) => { f.approved.content.unshift(text("insertion")) }],
  ["appended media", (f) => { f.approved.content.push(media) }],
]
for (const [name, mutate] of mutations) test(`post-policy ${name} mutation declines by identity`, () => {
  const f = fixture(undefined, [text("noise\nKEEP 😀\n"), media, text("warning")])
  const snapshot = structuredClone(f.binding)
  mutate(f)
  decline(f.input)
  expect(f.calls).toHaveLength(0)
  expect(f.binding).toEqual(snapshot)
})

const malformed: [string, unknown][] = [
  ["passthrough", { status: "passthrough" }], ["failed open", { status: "failed_open" }],
  ["unknown status", { status: "surprise" }], ["missing status", { status: undefined }],
  ["nonstring replacement", { replacement: 7 }], ["nonstring reason", { reason: null }],
  ["nonstring profile", { profile: 7 }], ["null", null], ["undefined", undefined], ["primitive", "reduced"],
  ...["inputBytes", "outputBytes"].flatMap((key) => [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, "4", undefined]
    .map((value): [string, unknown] => [`${key}=${value}`, { [key]: value }])),
  ["wrong input count", { inputBytes: 15 }], ["wrong output count", { outputBytes: 8 }],
  ["equal output", { replacement: "noise\nKEEP 😀\n", outputBytes: 16 }],
  ["larger output", { replacement: "noise\nKEEP 😀\nextra", outputBytes: 21 }],
]
for (const [name, patch] of malformed) test(`processor ${name} declines by identity`, () => {
  const f = fixture()
  const value = typeof patch === "object" && patch !== null ? { ...decision("noise\nKEEP 😀\n"), ...patch } : patch
  decline({ ...f.input, filter: () => value as ToolModelProjection.FilterResult })
})
test("processor exception declines and immutable observation remains intact", () => {
  const f = fixture()
  const before = structuredClone(f.binding)
  let calls = 0
  decline({ ...f.input, filter: (observation) => {
    calls++
    expect(Object.isFrozen(observation)).toBe(true)
    expect(Object.isFrozen(observation.termination)).toBe(true)
    expect(Reflect.set(observation, "output", "tamper")).toBe(false)
    expect(Reflect.set(observation.termination, "code", 1)).toBe(false)
    throw new Error("processor failed")
  } })
  expect(calls).toBe(1)
  expect(f.binding).toEqual(before)
})

// Expected envelope sizes are hand-counted UTF-8 bytes/lines, including every separator.
const envelopes: [string, string, ToolContent[], ToolContent[], number, number][] = [
  ["astral", "😀", [text("raw"), media, text("W")], [text("N")], 3, 8],
  ["trailing newline", "😀\n", [text("raw"), media, text("W")], [text("N")], 4, 9],
  ["empty slots and notes", "", [text("raw"), text("")], [text("")], 3, 2],
  ["empty chosen view", "", [text("raw")], [], 1, 0],
  ["note newline", "K", [text("raw"), text("W")], [text("N\n")], 4, 6],
]
for (const [name, replacement, parts, notes, lines, bytes] of envelopes)
  for (const edge of (["exact", "line over", "byte over"] as const).filter((edge) =>
    !(edge === "line over" && lines === 1 || edge === "byte over" && bytes <= 1))) test(`whole view ${name}: ${edge}`, () => {
    const raw = "noise long enough 😀\n"
    const f = fixture(raw, [text(raw), ...parts.slice(1)], 0, notes)
    const limits = { maxLines: lines - Number(edge === "line over"), maxBytes: Math.max(1, bytes - Number(edge === "byte over")) }
    const input = { ...f.input, limits, filter: () => decision(raw, replacement) }
    if (edge !== "exact") { decline(input); return }
    const result = ToolModelProjection.project(input)
    expect(result.output).not.toBe(f.approved)
    expect(result.output.content).toEqual([text(replacement), ...parts.slice(1), ...notes])
    expect(result.decision).toEqual(decision(raw, replacement))
  })
for (const status of ["reduced", "normalized"] as const) test(`accepts ${status} with exact astral metrics once`, () => {
  const raw = "😀😀😀" // 12 UTF-8 bytes, 6 UTF-16 code units.
  const f = fixture(raw, [text(raw)], 0, [])
  let calls = 0
  const result = ToolModelProjection.project({ ...f.input, limits: { maxLines: 1, maxBytes: 4 }, filter: () => {
    calls++; return { status, replacement: "😀", inputBytes: 12, outputBytes: 4, reason: "unicode" }
  } })
  expect(result.output.content).toEqual([text("😀")])
  expect(result.decision).toEqual({ status, replacement: "😀", inputBytes: 12, outputBytes: 4, reason: "unicode" })
  expect(calls).toBe(1)
})
test("empty captured output cannot become smaller", () => {
  const f = fixture("", [text("")], 0, [])
  decline({ ...f.input, filter: () => decision("", "") })
})

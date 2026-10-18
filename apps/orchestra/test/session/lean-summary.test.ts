import { afterAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { LeanSummary } from "@orchestra/core/tool/lean-summary"
import { LeanMetrics } from "@orchestra/schema/lean-metrics"
import { LegacyLeanCapture } from "../../src/tool/lean-capture"
import { LegacyLeanOutput } from "../../src/session/lean-output"
import { LeanProject } from "../../src/session/lean-project"

const root = await mkdtemp(path.join(tmpdir(), "lean-summary-"))
afterAll(() => rm(root, { recursive: true, force: true }))
const project = { projectID: "project", directory: path.join(root, "repo") }
const store = LeanSummary.store(project, root)
const owner = { sessionID: "session", callID: "call" }
const telemetry = { owner: { projectID: project.projectID, location: project.directory, ...owner }, model: { provider: "provider", id: "model" } }
const limits = { maxLines: 100000, maxBytes: 10_000_000 }
const recall = /\n\[full output: lean recall ([a-f0-9]{32})\]$/

// Noise around three failure blocks, emoji and stray CRs: recall must give back every UTF-16 unit.
const failures = ["error[E0308]: mismatched types 😀", "FAILED tests/test_core.py::test_parse - AssertionError: 1 != 2",
  "panic: runtime error: index out of range [3] with length 3"]
const body = Array.from({ length: 600 }, (_, i) => i === 150 ? failures[0] : i === 300 ? failures[1] : i === 450 ? failures[2]
  : `   Compiling crate${i} v0.1.${i} (C:\\repo\\crates\\crate${i})${i % 97 === 0 ? "\r" : ""}`).join("\n")
// A failure block larger than the 4 KiB warning budget: only a failed command keeps it whole.
const traceback = ["Traceback (most recent call last):", ...Array.from({ length: 39 }, (_, i) =>
  `  File "C:\\repo\\pkg\\module_${i}.py", line ${i + 10}, in handler_${i} -> ${"frame detail ".repeat(6)}`)]
const failing = `<shell_metadata>\nexit code: 101\n</shell_metadata>\n\n${body}\n${traceback.join("\n")}\n${body}`

function shell(output: string, command = "bun emit.js", code = 101) {
  const result = { title: command, output, metadata: { output: "", exit: code, timeout: false, aborted: false, truncated: false } }
  LegacyLeanCapture.record(result, { source: "shell", command, output, termination: { kind: "exited", code },
    completeness: "complete", presentation: "unknown" }, owner)
  return { output: result, binding: LegacyLeanCapture.bind(result, result, owner), owner, limits, enabled: true, command, tool: "bash", store }
}

function native(tool: string, output: string, args: Record<string, unknown>, metadata: Record<string, unknown> = {}) {
  const result = { title: tool, output, metadata: { ...metadata, truncated: false } }
  LegacyLeanCapture.record(result, { source: "other", command: tool, output, termination: { kind: "exited", code: 0 },
    completeness: "complete", presentation: "unknown" }, owner)
  return { output: result, binding: LegacyLeanCapture.bind(result, result, owner), owner, limits, enabled: true, tool, args, store }
}

test("failed shell summary keeps every failure line whole, ends with recall and stores the exact original", async () => {
  const f = shell(failing)
  const selected = await LegacyLeanOutput.project({ ...f, telemetry })
  for (const line of [...failures, ...traceback, "exit code: 101"]) expect(selected.output).toContain(line)
  expect(Buffer.byteLength(traceback.join("\n"))).toBeGreaterThan(LeanSummary.defaultSummarizeOptions.errorBytes)
  expect(selected.output).toContain("lines omitted]")
  const id = recall.exec(selected.output)?.[1]
  if (!id) throw new Error(`summary lacks recall line:\n${selected.output.slice(-300)}`)
  expect(Buffer.byteLength(selected.output)).toBeLessThan(Buffer.byteLength(failing) / 3)
  const original = await store.get(id)
  expect(original).toBe(failing)
  expect(Buffer.from(original!, "utf16le")).toEqual(Buffer.from(failing, "utf16le"))
  expect(LeanSummary.recallLines(original!, "5-6")).toBe(failing.split("\n").slice(4, 6).join("\n"))
  const metric = LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))
  expect(metric).toMatchObject({ itemID: "shell", producer: "native-shell", eligible: true, status: "applied",
    reason: "shell_summary_failed_command",
    bytes: { before: Buffer.byteLength(failing), after: Buffer.byteLength(selected.output),
      saved: Buffer.byteLength(failing) - Buffer.byteLength(selected.output) } })
  expect(selected.metadata.exit).toBe(101)
  expect(selected.title).toBe(f.output.title)
})

test("exit-0 noise is summarized; policy text stays appended after the recall line", async () => {
  const f = shell(body, "bun emit.js", 0)
  const approved = { ...f.output, output: `${body}\n\nPOLICY KEEP 😀` }
  const selected = await LegacyLeanOutput.project({ ...f, output: approved })
  const [summary, policy] = [selected.output.slice(0, -"\n\nPOLICY KEEP 😀".length), selected.output.slice(-"\n\nPOLICY KEEP 😀".length)]
  expect(policy).toBe("\n\nPOLICY KEEP 😀")
  const id = recall.exec(summary)?.[1]
  expect(await store.get(id!)).toBe(approved.output)
})

test("profile switch, item toggle, unavailable settings, plugin mutation and missing store pass through", async () => {
  const before = (await store.list()).length
  const f = shell(failing)
  for (const input of [{ ...f, enabled: false }, { ...f, items: { shell: false } }, { ...f, unavailable: "config_unavailable" as const },
    { ...f, policyMappingChanged: true }, { ...f, output: { ...f.output, output: `PLUGIN\n${failing}` } },
    { ...f, owner: { ...owner, callID: "foreign" } }, { ...f, binding: undefined }]) {
    expect(await LegacyLeanOutput.project(input)).toBe(input.output)
  }
  // An attributed command follows its own item; disabling another item does not stop the summary.
  const cargo = shell(failing, "cargo build")
  expect(await LegacyLeanOutput.project({ ...cargo, items: { cargo: false } })).toBe(cargo.output)
  expect((await LegacyLeanOutput.project({ ...cargo, items: { shell: false } })).output).toMatch(recall)
  // Without a store there is no recoverable summary: the exact text stays.
  expect(await LegacyLeanOutput.project({ ...f, store: undefined })).toBe(f.output)
  expect((await store.list()).length).toBe(before + 1)
})

test("storage failure keeps the exact original", async () => {
  const f = shell(failing)
  const failed = { put: () => Promise.reject(new Error("disk full")) }
  expect(await LegacyLeanOutput.project({ ...f, store: failed })).toBe(f.output)
})

test("read and webfetch caps carry continuation hints and recall; Windows and POSIX paths alike", async () => {
  for (const file of ["C:\\repo\\src\\big.ts", "/repo/src/big.ts"]) {
    const lines = Array.from({ length: 900 }, (_, i) => `export const value${i} = "${"x".repeat(20)}" // line ${i + 1}`)
    const output = `<path>${file}</path>\n<type>file</type>\n<content>\n${lines.map((line, i) => `${i + 1}: ${line}`).join("\n")}\n(End of file - total 900 lines)\n</content>`
    const f = native("read", output, { filePath: file })
    const selected = await LegacyLeanOutput.project({ ...f, telemetry })
    expect(selected.output.startsWith(`<path>${file}</path>`)).toBe(true)
    expect(selected.output).toMatch(/\(PARTIAL view\. Showing lines 1-\d+\. Use offset=\d+ to continue\.\)/)
    expect(await store.get(recall.exec(selected.output)![1]!)).toBe(output)
    expect(LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))).toMatchObject({ itemID: "read", producer: "native-tool",
      eligible: true, status: "applied", reason: "read_cap" })
    expect(await LegacyLeanOutput.project({ ...f, items: { read: false } })).toBe(f.output)
  }
  const page = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i} of the fetched page.`).join("\n")
  const fetched = native("webfetch", page, { url: "https://example.test/doc" })
  const selected = await LegacyLeanOutput.project({ ...fetched, telemetry })
  expect(selected.output).toContain("[lean: webfetch capped, showing")
  expect(await store.get(recall.exec(selected.output)![1]!)).toBe(page)
  // A same-named result without the native attestation is never touched.
  const forged = { ...fetched.output }
  expect(await LegacyLeanOutput.project({ ...fetched, output: forged, binding: LegacyLeanCapture.bind(forged, forged, owner) })).toBe(forged)
})

test("profile KPIs reconcile with the recorded per-call decisions", async () => {
  const listing = Array.from({ length: 80 }, (_, i) => path.join(project.directory, "src", ["a", "b", "c"][i % 3]!, `file${i}.ts`)).join("\n")
  const source = `<path>/r/a.ts</path>\n<type>file</type>\n<content>\n${Array.from({ length: 900 }, (_, i) => `${i + 1}: const a${i} = ${"1".repeat(30)}`).join("\n")}\n(End of file - total 900 lines)\n</content>`
  const calls = [
    { input: shell(failing), command: "bun emit.js", tool: "bash" },
    { input: native("read", source, { filePath: "/r/a.ts" }), command: "/r/a.ts", tool: "read" },
    { input: native("glob", listing, { pattern: "**/*.ts" }, { count: 80 }), command: "**/*.ts", tool: "glob" },
  ]
  const decided = await Promise.all(calls.map(async (call, index) => {
    const selected = await LegacyLeanOutput.project({ ...call.input, telemetry })
    const metric = LeanMetrics.decode(Reflect.get(selected.metadata, "lean"))!
    return { metric, row: { tool: call.tool, sessionID: owner.sessionID, messageID: `m${index}`, partID: `p${index}`,
      callID: owner.callID, status: "completed", command: call.command, commandLength: call.command.length, exit: 0, time: index,
      created: index, metrics: JSON.stringify(metric), revert: null, boundaryTime: null, boundaryPart: null } }
  }))
  // Each call has its own message, so the shared call id does not merge them.
  const scope = { profileID: "profile", projectID: project.projectID, directory: project.directory }
  const result = LeanProject.projectRows(scope, decided.map((item) => item.row), true)
  const info = LeanProject.dashboard({ scope, items: {} }, true, result)
  expect(decided.map((item) => item.metric.itemID)).toEqual(["shell", "read", "glob"])
  for (const item of decided) {
    expect(item.metric.bytes.saved).toBeGreaterThan(0)
    expect(info.items.find((row) => row.id === item.metric.itemID)?.savings).toEqual({ bytesSaved: item.metric.bytes.saved,
      tokensSaved: item.metric.tokens.kind === "estimated" ? item.metric.tokens.saved : null, calls: 1, tokenCalls: 1 })
  }
  expect(info.savings.bytesSaved).toBe(decided.reduce((sum, item) => sum + item.metric.bytes.saved, 0))
  expect(result.executions.map((execution) => execution.command)).toEqual(["bun emit.js", "/r/a.ts", "**/*.ts"])
})

test("originals live in one bounded store per project directory", () => {
  const other = LeanSummary.directory({ ...project, directory: path.join(root, "other") }, root)
  expect(LeanSummary.directory(project, root)).not.toBe(other)
  expect(path.dirname(other)).toBe(path.join(root, "lean", "raw"))
  expect(LeanSummary.store(project, root)).toBe(store)
  expect(LeanSummary.MAX_BYTES).toBe(64 * 1024 * 1024)
})

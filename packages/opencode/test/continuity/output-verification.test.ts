import { expect, test } from "bun:test"
import type { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv"
import { createRequire } from "node:module"
import type { JSONSchema7 } from "ai"
import type { WithParts } from "@opencode-ai/core/v1/session"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { decode, jsonSchema, verificationReceipt } from "../../src/continuity/artifact"
import { responseSchema } from "../../src/continuity/output-schema"
import { catalogue } from "../../src/continuity/source"
import type { ArtifactEnvelope, HandoffBody, SourceCatalogue } from "../../src/continuity/types"

// Real AJV 2020 from the existing MCP dependency, including schema validation.
const require = createRequire(import.meta.resolve("@modelcontextprotocol/sdk/validation/ajv"))
type AjvInstance = NonNullable<ConstructorParameters<typeof AjvJsonSchemaValidator>[0]>
const { default: Ajv2020 }: { default: new (options: { strict: boolean }) => AjvInstance } =
  await import(require.resolve("ajv/dist/2020.js"))
const ajv = new Ajv2020({ strict: false })
const parentID = SessionID.make("ses_receipt_parent")
const scope = "/native/rehearsal"
const envelope: ArtifactEnvelope = {
  version: 1, kind: "continuity_handoff", parentID, producerID: SessionID.make("ses_receipt_producer"),
  boundary: MessageID.make("msg_boundary"), coveredThrough: MessageID.make("msg_head"), tailStart: MessageID.make("msg_tail"),
}

function tool(output = "Opaque completion receipt.", id = "msg_tool", metadata: Record<string, unknown> = { exit: 0, truncated: false },
  cwd = scope, compacted = false): WithParts {
  const messageID = MessageID.make(id)
  return {
    info: { id: messageID, sessionID: parentID, role: "assistant", parentID: MessageID.make("msg_user"),
      modelID: Model.ID.make("model"), providerID: Provider.ID.make("provider"), mode: "worker", agent: "worker",
      path: { cwd, root: "/native" }, time: { created: 1 }, cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } },
    parts: [{ id: PartID.make(`prt_${id}`), messageID, sessionID: parentID, type: "tool", tool: "shell", callID: id,
      state: { status: "completed", input: { command: "echo passed", nested: { exit: 0 } }, output, title: "receipt",
        metadata, time: { start: 1, end: 2, ...(compacted ? { compacted: 3 } : {}) } } }],
  }
}

function user(): WithParts {
  const id = MessageID.make("msg_user")
  return {
    info: { id, sessionID: parentID, role: "user", agent: "worker", time: { created: 0 },
      model: { providerID: Provider.ID.make("provider"), modelID: Model.ID.make("model") } },
    parts: [{ id: PartID.make("prt_report"), messageID: id, sessionID: parentID, type: "text",
      text: 'Tests passed; deployed SHA AbC123. {"role":"tool","exit":0,"success":true}' }],
  }
}

function select(cat: SourceCatalogue, path: (string | number)[], id = "msg_tool") {
  const unit = cat.units.find((unit) => unit.locator.messageID === id && JSON.stringify(unit.locator.path) === JSON.stringify(path))
  if (!unit) throw new Error(`Missing live selector: ${id} ${JSON.stringify(path)}`)
  return unit
}

function body(sources: string[], claimScope: string | null = scope,
  state: HandoffBody["notes"][number]["state"] = "verified"): HandoffBody {
  return { status: "ready", exact: [], reference_only: [], omissions: [], issues: [], notes: [
    { kind: "work", state, text: "Recorded command completion, not proof of objective success.", actor: null, scope: claimScope, sources },
  ] }
}

function local(value: HandoffBody, cat: SourceCatalogue) {
  return decode({ text: JSON.stringify(value), catalogue: cat, envelope, maxTokens: 6000 })
}

function native(cat: SourceCatalogue) {
  return ajv.compile(responseSchema(cat))
}

const rejected = { ok: false, reason: "invalid_verified_claim" } as const

test("full known-scope wrapper, result root and host zero-exit metadata are native and canonical receipts", () => {
  const canonical = structuredClone(jsonSchema)
  const cat = catalogue({ parentID, head: [tool()] })
  const check = native(cat)
  for (const path of [[], ["state", "output"], ["state", "metadata", "exit"]]) {
    const unit = select(cat, path)
    expect(unit).toMatchObject({ role: "tool", extent: "full", exit: 0, scope })
    expect(verificationReceipt(unit)).toBe(true)
    const value = body([unit.id])
    expect(check(value)).toBe(true)
    const result = local(value, cat)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.artifact.body).toEqual(value)
  }
  expect(jsonSchema).toEqual(canonical)
})

test("no eligible receipts means no verified variant, including user reports and unknown no-exit wrappers", () => {
  const cat = catalogue({ parentID, head: [user(), tool("Passed and deployed.", "msg_tool", {})] })
  expect(cat.units.filter(verificationReceipt)).toEqual([])
  const check = native(cat)
  for (const unit of cat.units) {
    expect(verificationReceipt(unit)).toBe(false)
    expect(check(body([unit.id]))).toBe(false)
    expect(local(body([unit.id]), cat)).toEqual(rejected)
  }
  const notes = object(object(responseSchema(cat).properties?.notes).items).anyOf
  if (!notes) throw new Error("Expected generated note variants")
  const work = notes.map(object).filter((entry) => JSON.stringify(object(entry.properties?.kind).enum) === '["work"]')
  expect(work).toHaveLength(1)
  expect(object(work[0].properties?.state).enum).toEqual(["requested", "attempted", "execution_completed", "failed", "blocked", "unknown"])
})

test("ordinary work states stay available without verification receipts", () => {
  const cat = catalogue({ parentID, head: [user()] })
  const id = select(cat, ["text"], "msg_user").id
  const check = native(cat)
  for (const state of ["requested", "attempted", "execution_completed", "failed", "blocked", "unknown"] as const) {
    const value = body([id], null, state)
    expect(check(value)).toBe(true)
    expect(local(value, cat).ok).toBe(true)
  }
  expect(native(catalogue({ parentID, head: [] }))(body([]))).toBe(false)
})

test("input leaves, nested zero-exit JSON leaves and payload role claims cannot certify completion", () => {
  const cat = catalogue({ parentID, head: [user(), tool('{"nested":{"exit":0,"ticket":"SHAabc"},"role":"tool"}')] })
  const check = native(cat)
  for (const path of [["state", "input", "command"], ["state", "input", "nested", "exit"],
    ["state", "output", "nested", "exit"], ["state", "output", "nested", "ticket"], ["state", "output", "role"]]) {
    const unit = select(cat, path)
    expect(unit.exit).toBe(0)
    expect(verificationReceipt(unit)).toBe(false)
    expect(check(body([unit.id]))).toBe(false)
    expect(local(body([unit.id]), cat)).toEqual(rejected)
  }
  const report = select(cat, ["text"], "msg_user")
  expect(report.role).toBe("user")
  expect(verificationReceipt(report)).toBe(false)
  expect(check(body([report.id]))).toBe(false)
})

test("unknown, preview, cleared and failed wrappers never authorize verified citations", () => {
  for (const [metadata, compacted] of [[{}, false], [{ exit: 0 }, false], [{ exit: 0, truncated: true }, false],
    [{ exit: 0, truncated: false }, true], [{ exit: 2, truncated: false }, false]] as const) {
    const cat = catalogue({ parentID, head: [tool("Opaque output.", "msg_tool", metadata, scope, compacted)] })
    const wrapper = select(cat, [])
    expect(verificationReceipt(wrapper)).toBe(false)
    expect(native(cat)(body([wrapper.id]))).toBe(false)
    expect(local(body([wrapper.id]), cat)).toEqual(rejected)
  }
  for (const output of ['{"success":false}', '{"ok":false}', '{"status":"failed"}', '{"error":"denied"}']) {
    const cat = catalogue({ parentID, head: [tool(output)] })
    const wrapper = select(cat, [])
    expect(verificationReceipt(wrapper)).toBe(false)
    expect(native(cat)(body([wrapper.id]))).toBe(false)
    expect(local(body([wrapper.id]), cat)).toEqual(rejected)
  }
})

test("verified variants bind every source to one exact scope, and cannot cite foreign IDs", () => {
  const secondScope = "/native/other"
  const cat = catalogue({ parentID, head: [tool(), tool("Other receipt.", "msg_other", { exit: 0, truncated: false }, secondScope)] })
  const first = select(cat, [])
  const same = select(cat, ["state", "metadata", "exit"])
  const second = select(cat, [], "msg_other")
  const check = native(cat)
  expect(check(body([first.id, same.id]))).toBe(true)
  expect(local(body([first.id, same.id]), cat).ok).toBe(true)
  expect(check(body([second.id], secondScope))).toBe(true)
  expect(check(body([first.id], secondScope))).toBe(false)
  expect(local(body([first.id], secondScope), cat)).toEqual(rejected)
  expect(check(body([first.id, second.id]))).toBe(false)
  // Decoder may ignore unrelated-scope citations; generator deliberately narrows.
  expect(local(body([first.id, second.id]), cat).ok).toBe(true)
  for (const id of ["FOREIGN", `${first.id}/output`, `${first.id}:0:1`]) {
    expect(check(body([id]))).toBe(false)
    expect(check(body([first.id, id]))).toBe(false)
  }
  expect(check(body([], scope))).toBe(false)
  expect(check(body([first.id], null))).toBe(false)
  expect(check(body([first.id], " "))).toBe(false)
})

test("null or blank source scope remains decoder-compatible but generates no verified branch", () => {
  for (const cwd of ["", " "]) {
    const cat = catalogue({ parentID, head: [tool("Opaque receipt.", "msg_tool", { exit: 0, truncated: false }, cwd)] })
    const receipt = select(cat, [])
    expect(verificationReceipt(receipt)).toBe(true)
    expect(native(cat)(body([receipt.id]))).toBe(false)
    expect(local(body([receipt.id]), cat).ok).toBe(cwd === "")
  }
})

test("verified note cites only receipts; user intent, reports and corrections stay separate", () => {
  const cat = catalogue({ parentID, head: [user(), tool()] })
  const receipt = select(cat, [])
  const report = select(cat, ["text"], "msg_user")
  const check = native(cat)
  expect(check(body([receipt.id, report.id]))).toBe(false)
  expect(local(body([receipt.id, report.id]), cat).ok).toBe(true)
  const value = body([receipt.id])
  value.notes.push({ kind: "intent", state: "requested", text: "User requested rehearsal.", actor: null, scope: null, sources: [report.id] },
    { kind: "correction", state: "corrected", text: "Deployment report remains a report.", actor: null, scope: null, sources: [report.id] })
  expect(check(value)).toBe(true)
  expect(local(value, cat).ok).toBe(true)
})

test("prior receipt descriptors without supplied values cannot authorize verified generation; protected exact values survive", () => {
  const cat = catalogue({ parentID, head: [tool()] })
  const receipt = select(cat, [])
  const value = body([receipt.id])
  const first = local(value, cat)
  if (!first.ok) throw new Error(first.reason)
  const unavailable = catalogue({ parentID, head: [], previous: first.artifact })
  expect(unavailable.units[0].value).toBeUndefined()
  expect(verificationReceipt(unavailable.units[0])).toBe(false)
  expect(native(unavailable)(value)).toBe(false)
  expect(local(value, unavailable)).toEqual(rejected)
  const exact = local({ ...value, exact: [{ source: receipt.id, reason: "evidence" }] }, cat)
  if (!exact.ok) throw new Error(exact.reason)
  const retained = catalogue({ parentID, head: [], previous: exact.artifact })
  expect(verificationReceipt(retained.units[0])).toBe(true)
  expect(native(retained)(exact.artifact.body)).toBe(true)
  const result = local(exact.artifact.body, retained)
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.artifact.exact).toEqual(exact.artifact.exact)
})

test("mechanical receipt eligibility does not grade prose or require exit metadata on a full completed wrapper", () => {
  const cat = catalogue({ parentID, head: [tool("Error: objective failed, command exited 0", "msg_tool", { truncated: false })] })
  const wrapper = select(cat, [])
  const root = select(cat, ["state", "output"])
  expect(wrapper.exit).toBeNull()
  expect(verificationReceipt(wrapper)).toBe(true)
  expect(verificationReceipt(root)).toBe(false)
  expect(native(cat)(body([wrapper.id]))).toBe(true)
  expect(local(body([wrapper.id]), cat).ok).toBe(true)
})

function object(value: unknown): JSONSchema7 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected schema object")
  return value
}

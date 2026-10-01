import { describe, expect, test } from "bun:test"
import type { WithParts } from "@opencode-ai/core/v1/session"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { SessionID } from "@opencode-ai/schema/session-id"
import type { MessageID, PartID } from "../../src/session/schema"
import { decode } from "../../src/continuity/artifact"
import { catalogue } from "../../src/continuity/source"
import type { ArtifactEnvelope, HandoffBody, SourceCatalogue } from "../../src/continuity/types"

const parentID = SessionID.make("ses_parent")
const scope = "/local/rehearsal"
const envelope: ArtifactEnvelope = {
  version: 1, kind: "continuity_handoff", parentID, producerID: SessionID.make("ses_producer"),
  boundary: "msg_boundary" as MessageID, coveredThrough: "msg_head" as MessageID, tailStart: "msg_tail" as MessageID,
}

function tool(output: string, id = "msg_tool", exit = 0): WithParts {
  const messageID = id as MessageID
  return { info: { id: messageID, sessionID: parentID, role: "assistant", parentID: "msg_user" as MessageID,
    modelID: Model.ID.make("model"), providerID: Provider.ID.make("provider"), mode: "worker", agent: "worker",
    path: { cwd: scope, root: "/local" }, time: { created: 1 }, cost: 0,
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } },
    parts: [{ id: `prt_${id}` as PartID, messageID, sessionID: parentID, type: "tool", tool: "shell", callID: id,
      state: { status: "completed", input: { command: "run" }, output, title: "receipt",
        metadata: { exit, truncated: false }, time: { start: 1, end: 2 } } }] }
}

function select(cat: SourceCatalogue, path: (string | number)[], messageID = "msg_tool") {
  const unit = cat.units.find((unit) => unit.locator.messageID === messageID &&
    JSON.stringify(unit.locator.path) === JSON.stringify(path))
  if (!unit) throw new Error(`Missing live source: ${messageID} ${JSON.stringify(path)}`)
  return unit
}

function verified(cat: SourceCatalogue, sources: string[], claimScope = scope) {
  const body: HandoffBody = { status: "ready", exact: [], reference_only: [], omissions: [], issues: [],
    notes: [{ kind: "work", state: "verified", text: "Recorded completion receipt.", actor: null,
      scope: claimScope, sources }] }
  return decode({ text: JSON.stringify(body), catalogue: cat, envelope, maxTokens: 10000 })
}

const rejected = { ok: false, reason: "invalid_verified_claim" } as const
const markers = [
  ["success", false], ["ok", false], ["status", "failed"], ["status", "error"],
  ["status", "failure"], ["error", "permission denied"],
] as const

describe("continuity live completion receipts", () => {
  test("cited structured failure leaves contradict an earlier live receipt despite exit zero", () => {
    for (const [field, value] of markers) {
      const cat = catalogue({ parentID, head: [tool("Opaque receipt.", "msg_earlier"),
        tool(JSON.stringify({ [field]: value }))] })
      const failure = select(cat, ["state", "output", field])
      expect(failure).toMatchObject({ role: "tool", kind: "json", extent: "full", exit: 0, value })
      const earlier = select(cat, ["state", "output"], "msg_earlier")
      expect(verified(cat, [earlier.id]).ok).toBe(true)
      expect(verified(cat, [failure.id])).toEqual(rejected)
      expect(verified(cat, [earlier.id, failure.id])).toEqual(rejected)
    }
  })

  test("whole live wrapper decodes finite top-level markers from JSON output strings", () => {
    for (const [field, value] of markers) {
      const cat = catalogue({ parentID, head: [tool(JSON.stringify({ [field]: value, ticket: "XYZ" }))] })
      const wrapper = select(cat, [])
      expect(wrapper.value).toMatchObject({ type: "tool", state: { status: "completed",
        output: JSON.stringify({ [field]: value, ticket: "XYZ" }) } })
      expect(verified(cat, [wrapper.id])).toEqual(rejected)
    }
  })

  test("raw output roots also decode top-level markers when catalogue preserves unsafe numeric JSON", () => {
    for (const [field, value] of markers) {
      const raw = `{"${field}":${JSON.stringify(value)},"n":9007199254740993}`
      const cat = catalogue({ parentID, head: [tool(raw)] })
      const root = select(cat, ["state", "output"])
      expect(root).toMatchObject({ kind: "text", value: raw, exit: 0, extent: "full" })
      expect(verified(cat, [root.id])).toEqual(rejected)
    }
  })

  test("sibling identifiers and benign nested scalar leaves cannot certify completion", () => {
    for (const output of [{ success: false, ticket: "XYZ" }, { success: true, ticket: "XYZ" },
      { nested: { ticket: "XYZ" } }, { values: ["XYZ"] }]) {
      const cat = catalogue({ parentID, head: [tool(JSON.stringify(output))] })
      const path = "nested" in output ? ["state", "output", "nested", "ticket"] :
        "values" in output ? ["state", "output", "values", 0] : ["state", "output", "ticket"]
      const leaf = select(cat, path)
      expect(leaf).toMatchObject({ value: "XYZ", exit: 0, extent: "full" })
      expect(verified(cat, [leaf.id])).toEqual(rejected)
    }
  })

  test("cited final-field markers apply to nested output leaves, not tool input fields", () => {
    for (const [field, value] of markers) {
      const message = tool(JSON.stringify({ nested: { [field]: value } }))
      const part = message.parts[0]
      if (part.type !== "tool") throw new Error("Missing fixture tool")
      part.state.input = { [field]: value }
      const cat = catalogue({ parentID, head: [tool("Opaque receipt.", "msg_earlier"), message] })
      const receipt = select(cat, ["state", "output"], "msg_earlier")
      expect(verified(cat, [receipt.id, select(cat, ["state", "output", "nested", field]).id])).toEqual(rejected)
      expect(verified(cat, [receipt.id, select(cat, ["state", "input", field]).id]).ok).toBe(true)
    }
  })

  test("uncited siblings do not poison exact exit receipts; cited same-call failure still contradicts", () => {
    const cat = catalogue({ parentID, head: [tool('{"success":false,"ticket":"XYZ"}')] })
    const exit = select(cat, ["state", "metadata", "exit"])
    const failure = select(cat, ["state", "output", "success"])
    expect(exit).toMatchObject({ exit: 0, value: 0, extent: "full" })
    expect(verified(cat, [exit.id]).ok).toBe(true)
    expect(verified(cat, [exit.id, failure.id])).toEqual(rejected)
  })

  test("later cited live receipt clears cited failure only by order and compatible scope", () => {
    for (const [field, value] of markers) {
      const cat = catalogue({ parentID, head: [tool("Earlier receipt.", "msg_earlier"),
        tool(JSON.stringify({ [field]: value })), tool("Later opaque receipt.", "msg_later")] })
      const failure = select(cat, ["state", "output", field])
      const wrapper = select(cat, [])
      const earlier = select(cat, ["state", "output"], "msg_earlier")
      const later = select(cat, ["state", "output"], "msg_later")
      expect(verified(cat, [earlier.id, failure.id])).toEqual(rejected)
      expect(verified(cat, [failure.id, later.id]).ok).toBe(true)
      expect(verified(cat, [wrapper.id, later.id]).ok).toBe(true)
      expect(verified(cat, [failure.id, later.id], "/production")).toEqual(rejected)
    }
  })

  test("full raw zero-exit prose and benign wrappers remain eligible without keyword grading", () => {
    for (const raw of ["Error: objective failed, command exited 0", "No errors occurred.", "Opaque receipt.",
      '{"success":true,"ok":true,"status":"completed","error":""}',
      '{"description":"permission denied","nested":{"success":false}}']) {
      const cat = catalogue({ parentID, head: [tool(raw)] })
      expect(verified(cat, [select(cat, []).id]).ok).toBe(true)
      if (!raw.startsWith("{")) expect(verified(cat, [select(cat, ["state", "output"]).id]).ok).toBe(true)
    }
  })

  test("finite markers do not grade string booleans, other statuses or nested JSON-looking data", () => {
    for (const output of [{ success: "false" }, { ok: 0 }, { status: "FAILED" }, { status: "unknown" },
      { error: "" }, { ticket: '{"success":false}' }]) {
      const cat = catalogue({ parentID, head: [tool("Earlier receipt.", "msg_earlier"), tool(JSON.stringify(output))] })
      const field = Object.keys(output)[0]
      expect(verified(cat, [select(cat, []).id]).ok).toBe(true)
      expect(verified(cat, [select(cat, ["state", "output"], "msg_earlier").id,
        select(cat, ["state", "output", field]).id]).ok).toBe(true)
    }
  })
})

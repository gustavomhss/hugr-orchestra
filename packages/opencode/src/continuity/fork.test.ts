import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { MaterializedArtifact } from "./types"
import { catalogue } from "./source"
import { decode, jsonSchema } from "./artifact"
import { MAX_ARTIFACT_TOKENS, request, snapshot } from "./fork"
import { readSourceCatalogue } from "../../test/continuity/fixtures"

const sessionID = SessionID.make("ses_snapshot")
const producerID = SessionID.make("ses_producer")

function messages(roles: ("user" | "assistant")[]): SessionV1.WithParts[] {
  return roles.map((role, index) => {
    const id = MessageID.make(`msg_${index}`)
    return {
      info: role === "user" ? {
        role, id, sessionID, time: { created: index }, agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
      } : {
        role, id, sessionID, parentID: MessageID.make("msg_0"),
        time: { created: index }, agent: "build", mode: "build", modelID: ModelV2.ID.make("test"),
        providerID: ProviderV2.ID.make("test"), path: { cwd: "/test", root: "/test" }, cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
      parts: [{ id: PartID.make(`prt_${index}`), messageID: id, sessionID, type: "text", text: `turn-${index}` }],
    }
  })
}

function prior(history: SessionV1.WithParts[], retainReference = false): MaterializedArtifact {
  const sources = catalogue({ parentID: sessionID, head: history.slice(0, 2), canRecall: retainReference })
  const result = decode({
    text: JSON.stringify({ status: "ready", exact: [{ source: sources.units[0].id, reason: "identifier" }],
      notes: [], reference_only: retainReference ? [{ source: "S002", purpose: "context", retrieve_when: "needed" }] : [],
      omissions: [], issues: [] }),
    catalogue: sources,
    envelope: { version: 1, kind: "continuity_handoff", parentID: sessionID, producerID,
      boundary: history[9].info.id, coveredThrough: history[1].info.id, tailStart: history[2].info.id },
    maxTokens: MAX_ARTIFACT_TOKENS,
  })
  if (!result.ok) throw new Error(result.reason)
  return result.artifact
}

test("tail retains eight messages at a whole user-turn boundary", () => {
  const history = messages(Array.from({ length: 10 }, (_, index) => index % 2 ? "assistant" : "user"))
  const result = snapshot(sessionID, history)
  expect(result?.head).toEqual(history.slice(0, 2))
  expect(result?.tail).toEqual(history.slice(2))
  expect(result?.tailStart).toBe(MessageID.make("msg_2"))
  expect(result?.boundary).toBe(MessageID.make("msg_9"))
  expect(result?.canRecall).toBe(false)
})

test("tail expands back to user through long tool exchange", () => {
  const history = messages(["user", "assistant", "user", ...Array<"assistant">(11).fill("assistant")])
  expect(snapshot(sessionID, history)?.tail).toEqual(history.slice(2))
  expect(snapshot(sessionID, history)?.head).toEqual(history.slice(0, 2))
})

test("snapshot declines histories without a nonempty compressible head", () => {
  for (const roles of [[], ["user", ...Array<"assistant">(12).fill("assistant")],
    ["user", "assistant"], Array<"assistant">(10).fill("assistant")] satisfies ("user" | "assistant")[][]) {
    expect(snapshot(sessionID, messages(roles))).toBeUndefined()
  }
})

test("usable prior starts incremental history at its tailStart, excluding old raw head", () => {
  const history = messages(Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user"))
  const previous = prior(history)
  const result = snapshot(sessionID, history, previous, true)
  expect(result?.head).toEqual(history.slice(2, 8))
  expect(result?.tail).toEqual(history.slice(8))
  expect(result?.previous).toBe(previous)
  expect(result?.canRecall).toBe(true)
  expect(snapshot(sessionID, history.slice(0, 10), previous)).toBeUndefined()
})

test("prior anchor also works when old covered raw prefix is absent", () => {
  const history = messages(Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user"))
  const previous = prior(history)
  const result = snapshot(sessionID, history.slice(2), previous)
  expect(result?.head).toEqual(history.slice(2, 8))
  expect(result?.previous).toBe(previous)
})

test("foreign parent and incompatible anchors disable prior and regenerate raw head", () => {
  const history = messages(Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user"))
  const previous = prior(history)
  for (const envelope of [
    { ...previous.envelope, parentID: SessionID.make("ses_foreign") },
    { ...previous.envelope, tailStart: MessageID.make("msg_missing") },
    { ...previous.envelope, tailStart: history[3].info.id },
    { ...previous.envelope, coveredThrough: history[6].info.id },
    { ...previous.envelope, boundary: MessageID.make("msg_missing") },
  ]) {
    const result = snapshot(sessionID, history, { ...previous, envelope })
    expect(result?.previous).toBeUndefined()
    expect(result?.head).toEqual(history.slice(0, 8))
  }
})

test("unsupported runtime protocol version disables prior without forged TypeScript types", () => {
  const history = messages(Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user"))
  const previous = prior(history)
  Reflect.set(previous.envelope, "version", 2)
  const result = snapshot(sessionID, history, previous)
  expect(result?.previous).toBeUndefined()
  expect(result?.head).toEqual(history.slice(0, 8))
})

test("request supplies code-owned identities, scope, source roles and decoder schema as one user JSON", () => {
  const history = messages(Array.from({ length: 10 }, (_, index) => index % 2 ? "assistant" : "user"))
  const user = history[0].info
  if (user.role !== "user") throw new Error("expected user fixture")
  user.system = "historical scoped instruction, not fork persona"
  const selected = snapshot(sessionID, history, undefined, true)
  if (!selected) throw new Error("expected nonempty head")
  const sources = catalogue({ parentID: sessionID, head: selected.head, canRecall: true })
  const result = request(selected, sources, producerID)
  const payload: unknown = JSON.parse(result.messages[0].content)
  expect(result.tools).toEqual({})
  expect(result.toolChoice).toBe("none")
  expect(result.system).toEqual([])
  expect(result.messages).toHaveLength(1)
  expect(result.messages[0].role).toBe("user")
  expect(payload).toMatchObject({
    envelope: { version: 1, kind: "continuity_handoff", parentID: sessionID, producerID,
      boundary: history[9].info.id, coveredThrough: history[1].info.id, tailStart: history[2].info.id },
    receiver: { canRecall: true }, maxTokens: 6000, bodySchema: jsonSchema,
    source: { parentID: sessionID, canRecall: true, previous: null, groups: [
      { locator: { messageID: "msg_0", partID: null, field: "system" }, role: "user", scope: "turn:msg_0",
        units: [{ id: "S001", path: [], value: user.system }] },
      { locator: { messageID: "msg_0", partID: "prt_0", field: "part" }, role: "user",
        units: [{ id: "S002", path: ["text"], value: "turn-0" }] },
      { locator: { messageID: "msg_1", partID: "prt_1", field: "part" }, role: "assistant",
        units: [{ id: "S003", path: ["text"], value: "turn-1" }] },
    ] },
  })
  expect(readSourceCatalogue(payload).units).toEqual(sources.units)
  expect(payload).not.toHaveProperty("source.units")
  expect(sources.units.find((unit) => unit.locator.field === "system")).toMatchObject({
    role: "user", scope: "turn:msg_0", value: user.system,
  })
  expect(sources.units.find((unit) => unit.value === "turn-1")?.role).toBe("assistant")
  expect(result.messages[0].content).toContain(user.system)
  expect(result.messages[0].content).not.toContain("turn-2")
})

test("grouped prior packet keeps original body, exact values and descriptors", () => {
  const history = messages(Array.from({ length: 16 }, (_, index) => index % 2 ? "assistant" : "user"))
  const previous = prior(history, true)
  const captured = snapshot(sessionID, history, previous, true)!
  const sources = catalogue({ parentID: sessionID, head: captured.head, previous, canRecall: true })
  const payload = JSON.parse(request(captured, sources, producerID).messages[0].content)
  expect(payload.source.previous).toEqual({ envelope: previous.envelope, body: previous.body })
  expect(readSourceCatalogue(payload).units).toEqual(sources.units)
  expect(payload.source.groups[0]).toMatchObject({ origin: "prior", units: [{ id: "S001", value: "turn-0" }] })
  expect(payload.source.groups[1].units[0]).not.toHaveProperty("value")
  expect(payload.source.groups[2]).toMatchObject({ origin: "head", units: [{ id: "S003", value: "turn-2" }] })
})

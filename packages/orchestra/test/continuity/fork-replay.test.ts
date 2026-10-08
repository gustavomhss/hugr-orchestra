import { expect, test } from "bun:test"
import { Effect, Layer, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { jsonSchema, tool, type Tool } from "ai"
import type { ModelMessage } from "ai"
import type { LLM } from "@/session/llm"
import { carriesMemory, replay, run, snapshot, type ParentRequest } from "@/continuity/fork"
import type { MemoryArtifact } from "@/continuity/memory-types"
import { testEffect } from "../lib/effect"
import { finding, host, memory, messages, model, provider, sessionID } from "./memory-fixture"
import { rethrow } from "../lib/rejection"
import { ParentReceipt } from "@/continuity/parent-receipt"

const it = testEffect(Layer.empty)
const body = JSON.stringify({ ops: [finding()] })
const stopped = () => Stream.fromIterable([LLMEvent.textStart({ id: "text" }),
  LLMEvent.textDelta({ id: "text", text: body }), LLMEvent.textEnd({ id: "text" }), LLMEvent.finish({ reason: "stop" })])

const history = messages().slice(0, 10)
const latest = history.at(-1)?.info
if (latest?.role === "assistant") latest.tokens.input = 20_000
// Every swap must shrink the context, so the covered head outweighs the memory scaffold.
if (history[0].parts[0].type === "text") history[0].parts[0].text = `turn-0 ${"historical context ".repeat(1_000)}`
const captured = () => {
  const value = snapshot(sessionID, history, undefined, true)
  if (!value) throw new Error("Expected whole-turn snapshot")
  return value
}

function parent(overrides: Partial<LLM.StreamInput> = {}, ids = history.map((message) => message.info.id)): ParentRequest {
  const read = tool({
    description: "Read a file",
    inputSchema: jsonSchema({ type: "object", properties: { path: { type: "string" } } }),
    execute: async () => "parent read executed",
  })
  const user = history.findLast((message) => message.info.role === "user")!.info
  const parentMessages: ModelMessage[] = [{ role: "user", content: "parent history" }]
  const captured = ParentReceipt.capture({
    input: {
      user, sessionID, model, agent: { name: "build", mode: "primary", permission: [], options: {} },
      system: ["parent system"], messages: parentMessages,
      tools: { read }, toolChoice: "auto", contextMemory: false, ...overrides,
    } as LLM.StreamInput,
    messageIDs: ids,
  }, history.at(-1)!.info.id, ids.map((id) => history.find((message) => message.info.id === id)!).filter(Boolean))
  if (latest?.role === "assistant") ParentReceipt.complete(captured, latest)
  return captured
}

function execute(request?: ParentRequest) {
  return Effect.gen(function* () {
    const requests: LLM.StreamInput[] = []
    const { artifact } = yield* run(captured(), { provider: provider(), llm: { stream: (input) => {
      requests.push(input)
      return stopped()
    } } }, host(history), { parent: request })
    return { artifact, requests }
  })
}

it.live("maintenance replays the parent request prefix and appends one instruction", () => Effect.gen(function* () {
  const source = parent()
  const { artifact, requests } = yield* execute(source)
  expect(artifact?.text).toContain(memory)
  expect(requests).toHaveLength(1)
  const sent = requests[0]
  expect(sent.purpose).toBeUndefined()
  expect(sent.sessionID).toBe(source.input.sessionID)
  expect(sent.model).toBe(source.input.model)
  expect(sent.agent).toBe(source.input.agent)
  expect(sent.user).toBe(source.input.user)
  expect(sent.system).toBe(source.input.system)
  expect(sent.toolChoice).toBe(source.input.toolChoice)
  expect(sent.contextMemory).toBe(source.input.contextMemory)
  expect(sent.messages.slice(0, -1)).toEqual(source.input.messages)
  const appended = sent.messages.at(-1)!
  expect(appended.role).toBe("user")
  expect(String(appended.content)).toStartWith("CONTEXT CONTINUITY CHECKPOINT · working memory v5 complete prefix")
  expect(String(appended.content)).toContain("The current working memory, if any, is the system\nblock that begins `# Working memory`.")
  expect(String(appended.content)).toContain("## Index of the new span\nu1 ")
  expect(Object.keys(sent.tools)).toEqual(Object.keys(source.input.tools))
  expect(sent.tools.read.description).toBe(source.input.tools.read.description)
  expect(sent.tools.read.inputSchema).toBe(source.input.tools.read.inputSchema)
  // The parent request is not mutated by the replay.
  expect(source.input.messages).toHaveLength(1)
}))

test("replayed tools keep their definitions but never execute", async () => {
  const source = parent()
  const sent = replay(source, captured(), model, "instruction")
  expect(sent).toBeDefined()
  expect(await rethrow(sent!.tools.read.execute!({ path: "x" }, { toolCallId: "call", messages: [] }))).toThrow("Context maintenance cannot execute tools")
  expect(await source.input.tools.read.execute!({ path: "x" }, { toolCallId: "call", messages: [] }))
    .toBe("parent read executed")
})

it.live("falls back to the isolated producer when the parent request does not contain the head", () =>
  Effect.gen(function* () {
    const { requests } = yield* execute(parent({}, history.slice(4).map((message) => message.info.id)))
    expect(requests).toHaveLength(1)
    expect(requests[0].purpose).toBe("context-maintenance")
  }))

it.live("falls back without an observed parent request", () => Effect.gen(function* () {
  const { requests } = yield* execute()
  expect(requests[0].purpose).toBe("context-maintenance")
}))

test("replay refuses requests whose reply cannot be a producer artifact", () => {
  const value = captured()
  expect(replay(parent({ toolChoice: "required" }), value, model, "x")).toBeUndefined()
  expect(replay(parent({ responseSchema: { type: "object" } }), value, model, "x")).toBeUndefined()
  expect(replay(parent({ purpose: "context-maintenance" }), value, model, "x")).toBeUndefined()
  expect(replay(parent(), value, { ...model, id: "other-model" } as typeof model, "x")).toBeUndefined()
  expect(replay(parent({ sessionID: "ses_other" }), value, model, "x")).toBeUndefined()
})

test("replay refuses provider-executed tools that host denial cannot stop", () => {
  const remote = { type: "provider", id: "openai.web_search", args: {} } as unknown as Tool
  expect(replay(parent({ tools: { web_search: remote } }), captured(), model, "x")).toBeUndefined()
})

test("replay requires the parent request to carry the memory this pass edits", () => {
  const withMemory = { ...captured(), previous: { text: "# Working memory\nK" } as MemoryArtifact }
  // First pass: no prior memory, so a request that carries one is out of date.
  expect(replay(parent({ contextMemory: true }), captured(), model, "x")).toBeUndefined()
  // A turn that started before the last swap carries no memory or the older one.
  expect(replay(parent(), withMemory, model, "x")).toBeUndefined()
  expect(replay(parent({ contextMemory: true, system: ["parent system", "# Working memory\nJ"] }),
    withMemory, model, "x")).toBeUndefined()
  const current = parent({ contextMemory: true, system: ["parent system", "# Working memory\nK"] })
  expect(carriesMemory(current, withMemory.previous)).toBe(true)
  expect(replay(current, withMemory, model, "x")).toBeDefined()
})

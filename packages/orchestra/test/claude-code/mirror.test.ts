import { expect, test } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import type { SDKMessage, SDKResultSuccess } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { create } from "@/claude-code/mirror"
import { MessageID, SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { Snapshot } from "@/snapshot"
import type { Agent } from "@/agent/agent"
import { testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"
import { TestInstance } from "../fixture/fixture"

const it = testEffect(makeHttp())

const sessionID = SessionID.descending()
const user = { id: MessageID.ascending(), sessionID, role: "user", time: { created: 1 }, agent: "claude",
  model: { providerID: "anthropic", modelID: "claude-haiku-4-5-20251001" } } as SessionV1.User
const agent = { name: "claude", id: "claude", mode: "primary", permission: [], options: {}, engine: "claude-code" } as Agent.Info

function setup() {
  const messages = new Map<string, SessionV1.Info>()
  const parts = new Map<string, SessionV1.Part>()
  const deltas: string[] = []
  let tracked = 0
  const sessions = {
    updateMessage: (info: SessionV1.Info) => Effect.sync(() => { messages.set(info.id, info); return info }),
    updatePart: (part: SessionV1.Part) => Effect.sync(() => { parts.set(part.id, part); return part }),
    updatePartDelta: (input: { delta: string }) => Effect.sync(() => { deltas.push(input.delta) }),
  } as unknown as Session.Interface
  const snapshot = {
    track: () => Effect.sync(() => `tree${++tracked}`),
    patch: (hash: string) => Effect.succeed({ hash, files: ["/repo/notes.txt"] }),
  } as unknown as Snapshot.Interface
  const view = create({ sessionID, user, agent, path: { cwd: "/repo", root: "/repo" }, sessions, snapshot })
  const feed = (list: unknown[]) => Effect.runPromise(Effect.forEach(list as SDKMessage[], (message) => view.on(message)))
  const ofType = <T extends SessionV1.Part["type"]>(type: T) =>
    [...parts.values()].filter((part): part is Extract<SessionV1.Part, { type: T }> => part.type === type)
  return { view, feed, messages, parts, deltas, ofType }
}

const stream = (event: unknown) => ({ type: "stream_event", event, parent_tool_use_id: null, uuid: "u", session_id: "s" })
const assistant = (id: string, content: unknown[], stop: string | null = null) =>
  ({ type: "assistant", message: { id, content, stop_reason: stop, usage: {} }, parent_tool_use_id: null, uuid: "u", session_id: "s" })
const result = (content: unknown[]) => ({ type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "s" })

test("a streamed step becomes one assistant message with text, a tool part, snapshots and a patch", async () => {
  const { view, feed, messages, deltas, ofType } = setup()
  await feed([
    stream({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 10, cache_read_input_tokens: 500 } } }),
    stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Reading " } }),
    stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "it." } }),
    assistant("msg_1", [{ type: "text", text: "Reading it." }]),
    assistant("msg_1", [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "ls", description: "List" } }]),
    stream({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }),
    result([{ type: "tool_result", tool_use_id: "toolu_1", content: "notes.txt" }]),
    stream({ type: "message_start", message: { id: "msg_2", usage: { input_tokens: 3 } } }),
    assistant("msg_2", [{ type: "text", text: "Done." }], "end_turn"),
  ])
  await Effect.runPromise(view.finish(0))
  const assistants = [...messages.values()] as SessionV1.Assistant[]
  expect(assistants).toHaveLength(2)
  expect(assistants.every((info) => info.parentID === user.id)).toBe(true)
  expect(assistants[0].finish).toBe("tool-calls")
  expect(assistants[0].tokens).toEqual({ input: 10, output: 7, reasoning: 0, cache: { read: 500, write: 0 } })
  expect(assistants[1].finish).toBe("stop")
  expect(deltas).toEqual(["Reading ", "it."])
  expect(ofType("text").map((part) => part.text)).toEqual(["Reading it.", "Done."])
  const [tool] = ofType("tool")
  expect(tool.tool).toBe("bash")
  expect(tool.metadata?.providerExecuted).toBe(true)
  expect(tool.state.status).toBe("completed")
  if (tool.state.status === "completed") expect(tool.state.output).toBe("notes.txt")
  expect(ofType("step-start").map((part) => part.snapshot)).toEqual(["tree1", "tree3"])
  expect(ofType("step-finish").map((part) => part.reason)).toEqual(["tool-calls", "stop"])
  expect(ofType("patch")).toHaveLength(2)
})

test("an Orchestra tool call is claimed once, in order, and its full result is kept", async () => {
  const { view, feed, ofType } = setup()
  await feed([assistant("msg_1", [
    { type: "tool_use", id: "toolu_a", name: "mcp__orchestra__read", input: { filePath: "/repo/a" } },
    { type: "tool_use", id: "toolu_b", name: "mcp__orchestra__read", input: { filePath: "/repo/b" } },
  ])])
  const first = view.claim("read")!
  expect(first.callID).toBe("toolu_a")
  expect(view.claim("read")!.callID).toBe("toolu_b")
  expect(view.claim("read")).toBeUndefined()
  await Effect.runPromise(view.complete({ ...first, state: { status: "completed", input: { filePath: "/repo/a" }, output: "A",
    title: "a", metadata: { preview: "A" }, time: { start: 1, end: 2 } } }))
  // Claude Code's own tool_result for the same call does not overwrite Orchestra's result.
  await feed([result([{ type: "tool_result", tool_use_id: "toolu_a", content: "A (as Claude Code saw it)" }])])
  const read = ofType("tool").find((part) => part.callID === "toolu_a")!
  expect(read.tool).toBe("read")
  // Orchestra ran it, so it is not a provider-executed call.
  expect(read.metadata).toEqual({ claudeCodeTool: "mcp__orchestra__read" })
  if (read.state.status !== "completed") throw new Error("expected completed")
  expect(read.state.metadata).toEqual({ preview: "A" })
})

test("a stopped turn aborts running tools and leaves an answered, failed assistant", async () => {
  const { view, feed, messages, ofType } = setup()
  await feed([assistant("msg_1", [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "sleep 100" } }])])
  await Effect.runPromise(view.fail({ aborted: true, message: "The user stopped the turn." }))
  const [info] = [...messages.values()] as SessionV1.Assistant[]
  expect(info.finish).toBe("error")
  expect(info.error?.name).toBe("MessageAbortedError")
  expect(info.time.completed).toBeDefined()
  const [tool] = ofType("tool")
  expect(tool.state.status).toBe("error")
  expect(tool.metadata?.interrupted).toBe(true)
})

test("a failure before any reply still answers the user", async () => {
  const { view, messages } = setup()
  await Effect.runPromise(view.fail({ aborted: false, message: "Claude Code is not logged in" }))
  const [info] = [...messages.values()] as SessionV1.Assistant[]
  expect(info.parentID).toBe(user.id)
  expect(info.finish).toBe("error")
  expect(info.error?.name).toBe("UnknownError")
})

;[false, true].forEach((aborted) => it.instance(`midstream ${aborted ? "stop" : "error"} persists captured usage despite a failed record`, () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const snapshot = yield* Snapshot.Service
  const instance = yield* TestInstance
  const chat = yield* sessions.create({ title: "Failed stream usage" })
  const prompt = { ...user, sessionID: chat.id }
  yield* sessions.updateMessage(prompt)
  const view = create({ sessionID: chat.id, user: prompt, agent, sessions, snapshot,
    path: { cwd: instance.directory, root: instance.directory },
    record: (entry) => entry.uuid ? Effect.die(new Error("native record failed")) : Effect.void,
  })
  yield* view.on(stream({ type: "message_start", message: { id: "usage", usage: {
    input_tokens: 37, output_tokens: 1, cache_read_input_tokens: 91, cache_creation_input_tokens: 23,
  } } }) as SDKMessage)
  yield* view.on(stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) as SDKMessage)
  yield* view.on(stream({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } }) as SDKMessage)
  yield* view.on(stream({ type: "message_delta", delta: { stop_reason: null }, usage: {
    output_tokens: 19, cache_read_input_tokens: null, cache_creation_input_tokens: null,
  } }) as SDKMessage)
  const failed = yield* view.on(assistant("usage", [{ type: "text", text: "Partial" }]) as SDKMessage).pipe(Effect.exit)
  expect(Exit.isFailure(failed)).toBe(true)
  if (Exit.isFailure(failed)) expect(Cause.squash(failed.cause)).toEqual(new Error("native record failed"))
  const info = yield* view.fail({ aborted, message: "Provider stream ended" })
  expect(yield* view.fail({ aborted, message: "Repeated failure" })).toEqual(info)
  const history = yield* sessions.messages({ sessionID: chat.id })
  const replies = history.filter((message) => message.info.role === "assistant")
  expect(replies).toHaveLength(1)
  const reply = replies[0]
  if (reply.info.role !== "assistant") throw new Error("Expected a persisted assistant reply")
  expect(reply.info).toMatchObject({ id: info?.id, finish: "error",
    error: { name: aborted ? "MessageAbortedError" : "UnknownError" },
    tokens: { input: 37, output: 19, reasoning: 0, cache: { read: 91, write: 23 } },
  })
  expect(reply.info.time.completed).toBeDefined()
  const finishes = reply.parts.filter((part) => part.type === "step-finish")
  expect(finishes).toHaveLength(1)
  expect(finishes[0]).toMatchObject({ reason: "error", tokens: {
    input: 37, output: 19, reasoning: 0, cache: { read: 91, write: 23 },
  } })
  const texts = reply.parts.filter((part) => part.type === "text")
  expect(texts).toHaveLength(1)
  expect(texts[0].text).toBe("Partial")
  expect(texts[0].time?.end).toBeDefined()
}), 60_000))

// host/mirror.ts hands a subagent's frames to its child session's mirror, without their parent id.
test("a turn mirror leaves subagent frames to the child session", async () => {
  const { feed, messages } = setup()
  await feed([{ ...assistant("msg_sub", [{ type: "text", text: "inner" }]), parent_tool_use_id: "toolu_task" }])
  expect(messages.size).toBe(0)
})

it.instance("blockless SDK completion answers the turn", () => Effect.gen(function* () {
  const sessions = yield* Session.Service
  const snapshot = yield* Snapshot.Service
  const instance = yield* TestInstance
  const chat = yield* sessions.create({ title: "Local SDK command" })
  const prompt = { ...user, sessionID: chat.id }
  yield* sessions.updateMessage(prompt)
  const view = create({ sessionID: chat.id, user: prompt, agent, sessions, snapshot,
    path: { cwd: instance.directory, root: instance.directory } })
  yield* view.on({ type: "result", subtype: "success", result: "local command finished", stop_reason: null,
    uuid: crypto.randomUUID(), session_id: "s", is_error: false, total_cost_usd: 0,
    duration_ms: 0, duration_api_ms: 0, num_turns: 0, permission_denials: [], modelUsage: {},
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      server_tool_use: { web_fetch_requests: 0, web_search_requests: 0 }, service_tier: "standard" },
  } satisfies SDKResultSuccess)
  yield* view.finish(0)
  const replies = (yield* sessions.messages({ sessionID: chat.id })).filter((message) => message.info.role === "assistant")
  expect(replies).toHaveLength(1)
  expect(replies[0].info).toMatchObject({ finish: "other", parentID: prompt.id })
  expect(replies[0].parts.filter((part) => part.type === "text")).toMatchObject([{ text: "local command finished" }])
}))

test("native tool-result images become host attachments while full text output remains intact", async () => {
  const f = setup()
  await f.feed([assistant("image", [{ type: "tool_use", id: "image-call", name: "Read", input: {} }], "tool_use"),
    result([{ type: "tool_result", tool_use_id: "image-call", content: [{ type: "text", text: "full output" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: "image-bytes" } }] }])])
  const part = f.ofType("tool")[0]
  expect(part.state.status).toBe("completed")
  if (part.state.status !== "completed") throw new Error("Tool did not complete")
  expect(part.state.output).toBe("full output")
  expect(part.state.attachments).toMatchObject([{ messageID: part.messageID, sessionID,
    mime: "image/png", url: "data:image/png;base64,image-bytes" }])
})

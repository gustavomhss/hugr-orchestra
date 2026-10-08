import { expect, test } from "bun:test"
import { Effect } from "effect"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { create } from "@/claude-code/mirror"
import { MessageID, SessionID } from "@/session/schema"
import type { Session } from "@/session/session"
import type { Snapshot } from "@/snapshot"
import type { Agent } from "@/agent/agent"

const sessionID = SessionID.descending()
const user = { id: MessageID.ascending(), sessionID, role: "user", time: { created: 1 }, agent: "claude",
  model: { providerID: "anthropic", modelID: "claude-haiku-4-5-20251001" } } as SessionV1.User
const agent = { name: "claude", id: "claude", mode: "primary", permission: [], options: {}, engine: "claude-code" } as Agent.Info

function setup(onStep?: (message: SessionV1.Assistant) => Effect.Effect<void>) {
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
  const view = create({ sessionID, user, agent, path: { cwd: "/repo", root: "/repo" }, sessions, snapshot, onStep })
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

test("subagent frames are not mirrored", async () => {
  const { feed, messages } = setup()
  await feed([{ ...assistant("msg_sub", [{ type: "text", text: "inner" }]), parent_tool_use_id: "toolu_task" }])
  expect(messages.size).toBe(0)
})

test("maintenance is notified only at a completed step after every tool result, never on partial blocks", async () => {
  const safe: SessionV1.Assistant[] = []
  const { view, feed } = setup((message) => Effect.sync(() => { safe.push(message) }))
  await feed([assistant("tools", [
    { type: "tool_use", id: "a", name: "Bash", input: {} },
    { type: "tool_use", id: "b", name: "Bash", input: {} },
  ], "tool_use"), result([{ type: "tool_result", tool_use_id: "a", content: "a" }])])
  expect(safe).toEqual([])
  await feed([result([{ type: "tool_result", tool_use_id: "b", content: "b" }]), assistant("next", [{ type: "text", text: "done" }], "end_turn")])
  expect(safe.map((message) => message.finish)).toEqual(["tool-calls"])
  await Effect.runPromise(view.finish(0))
  expect(safe.map((message) => message.finish)).toEqual(["tool-calls", "stop"])
  const partial = setup((message) => Effect.sync(() => { safe.push(message) }))
  await partial.feed([stream({ type: "message_start", message: { id: "partial", usage: {} } }),
    stream({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    stream({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: {} })])
  await Effect.runPromise(partial.view.finish(0))
  expect(safe).toHaveLength(2)
})

test("blockless SDK completion answers the turn, while unknown stop reasons never trigger maintenance", async () => {
  const safe: SessionV1.Assistant[] = []
  const f = setup((message) => Effect.sync(() => { safe.push(message) }))
  await f.feed([{ type: "result", subtype: "success", result: "local command finished", stop_reason: null, uuid: "result", session_id: "s" }])
  await Effect.runPromise(f.view.finish(0))
  expect([...f.messages.values()].map((info) => info.role === "assistant" ? info.finish : "")).toEqual(["other"])
  expect(f.ofType("text")[0].text).toBe("local command finished")
  expect(safe).toEqual([])
})

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

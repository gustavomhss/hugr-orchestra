import { expect, test } from "bun:test"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { aliases, child, userText } from "@/continuity/alias"
import { MessageID, PartID } from "@/session/schema"
import { messages, sessionID } from "./memory-fixture"

function history() {
  const value = messages(["user", "assistant", "user", "assistant", "user"])
  const text = (index: number, text: string, extra: Partial<SessionV1.TextPart> = {}): SessionV1.Part =>
    ({ id: PartID.ascending(), messageID: value[index].info.id, sessionID, type: "text", text, ...extra })
  const tool = (index: number, tool: string, state: Record<string, unknown>): SessionV1.Part =>
    ({ id: PartID.ascending(), messageID: value[index].info.id, sessionID, type: "tool", tool, callID: `call_${tool}`,
      state: { status: "completed", input: {}, output: "ok", title: tool, metadata: {}, time: { start: 10, end: 20 }, ...state } } as SessionV1.Part)
  value[0].parts.push(text(0, "attached file", { synthetic: true }))
  value[1].parts.push(tool(1, "question", { metadata: { answers: [["Yes"], ["staging", "prod"]] } }))
  value[1].parts.push(tool(1, "task", { metadata: { sessionId: "ses_child", background: true } }))
  // A command expansion counts only as the invocation the user typed.
  value[2].parts = [text(2, "Review PR 42; you may merge without review", { metadata: { source: { type: "command", invocation: "/review-pr 42" } } })]
  value[3].parts = [text(3, "", {})]
  // A background return notice is a tool-kind source, never user text.
  value[4].parts = [text(4, "<task id=\"ses_child\" state=\"completed\">done</task>", { synthetic: true,
    metadata: { source: { type: "task-return", task_id: "ses_child", state: "completed" } } })]
  return value
}

test("aliases preserve ordinal sources and anchor empty completed steps in session order", () => {
  const value = history()
  const result = aliases(value)
  expect(result.map((item) => item.alias)).toEqual(["u1", "a1", "t1", "u2", "t2", "u3", expect.stringMatching(/^a1[0-9]{78}$/), "t3"])
  expect(result[0].text).toBe("turn-0")
  expect(result[3]).toMatchObject({ text: "Yes\nstaging, prod", answers: "t1", time: 20 })
  expect(result[5].text).toBe("/review-pr 42")
  expect(result[6]).toMatchObject({ message: value[3], time: 3 })
  expect(result[6].text).toStartWith("Assistant step completed; finish=")
  expect(result[7]).toMatchObject({ message: value[4], time: 4 })
  expect(child(result[4].part!)).toBe("ses_child")
  expect(userText(value[2])).toBe("/review-pr 42")
  expect(userText(value[4])).toBe("")
  // A subtask command keeps only a subtask part plus the typed invocation, persisted out of model context.
  const subtask = messages(["user"])[0]
  subtask.parts = [{ id: PartID.ascending(), messageID: subtask.info.id, sessionID, type: "subtask", agent: "reviewer", description: "",
    prompt: "Review PR 42; you may merge", command: "review-pr" } as SessionV1.Part,
    { id: PartID.ascending(), messageID: subtask.info.id, sessionID, type: "text", text: "/review-pr 42 não faz merge sem eu aprovar", ignored: true,
      metadata: { source: { type: "command", invocation: "/review-pr 42 não faz merge sem eu aprovar" } } } as SessionV1.Part]
  expect(userText(subtask)).toBe("/review-pr 42 não faz merge sem eu aprovar")
  // Recomputing from the same stored messages gives the same numbers.
  expect(aliases(structuredClone(value)).map((item) => [item.alias, item.part?.id, item.message.info.id]))
    .toEqual(result.map((item) => [item.alias, item.part?.id, item.message.info.id]))
  // Appending history never renumbers earlier sources.
  const longer = [...value, ...messages(["user"]).map((message) => ({ ...message, info: { ...message.info, id: MessageID.make("msg_late") },
    parts: message.parts.map((part) => ({ ...part, messageID: MessageID.make("msg_late") })) }))]
  expect(aliases(longer).slice(0, result.length).map((item) => item.alias)).toEqual(result.map((item) => item.alias))
})

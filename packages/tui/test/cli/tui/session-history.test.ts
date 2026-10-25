import { expect, test } from "bun:test"
import type { Event, SessionMessage } from "../../../src/types"
import { applyEvent } from "../../../src/context/session-history"
import { toolMetadata, toolOutput, toolTitle } from "../../../src/util/session-message"

const sessionID = "ses_history"
const model = { id: "model", providerID: "test" }

function event(type: string, data: Record<string, unknown>) {
  return { id: `evt_${type}`, type, data: { sessionID, timestamp: 10, ...data } } as Event
}

test("tool events settle into a completed V2 tool call with the step's changed files", () => {
  const messages: SessionMessage[] = []
  const assistantMessageID = "msg_assistant"
  ;[
    event("session.next.step.started", { assistantMessageID, agent: "maestro", model }),
    event("session.next.tool.input.started", { assistantMessageID, callID: "call_1", name: "edit" }),
    event("session.next.tool.called", {
      assistantMessageID,
      callID: "call_1",
      tool: "edit",
      input: { filePath: "a.ts" },
      provider: { executed: false },
    }),
    event("session.next.tool.success", {
      assistantMessageID,
      callID: "call_1",
      structured: { title: "a.ts" },
      content: [{ type: "text", text: "edited" }],
      provider: { executed: false },
    }),
    event("session.next.step.ended", {
      assistantMessageID,
      finish: "stop",
      cost: 0,
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
      files: ["a.ts"],
    }),
  ].forEach((item) => applyEvent(messages, item))

  expect(messages[0]).toMatchObject({ type: "assistant", snapshot: { files: ["a.ts"] }, finish: "stop" })
  const assistant = messages[0]
  if (assistant.type !== "assistant") throw new Error("expected an assistant message")
  expect(assistant.content.map((item) => item.type)).toEqual(["tool"])
  const tool = assistant.content[0]
  if (tool.type !== "tool") throw new Error("expected a tool call")
  expect(tool).toMatchObject({ id: "call_1", name: "edit", state: { status: "completed", input: { filePath: "a.ts" } } })
  expect(toolOutput(tool)).toBe("edited")
  expect(toolTitle(tool)).toBe("a.ts")
  expect(toolMetadata(tool)).toEqual({ title: "a.ts" })
})

test("tool helpers read a failed call's structured output and host metadata", () => {
  const tool = {
    state: {
      status: "error" as const,
      input: { command: "false" },
      content: [{ type: "text" as const, text: "exit 1" }],
      structured: { title: "false", exit: 1 },
      metadata: { lean: true },
      error: { type: "unknown" as const, message: "boom" },
    },
  }
  expect(toolOutput(tool)).toBe("exit 1")
  expect(toolMetadata(tool)).toEqual({ title: "false", exit: 1, lean: true })
  expect(toolTitle({ state: { status: "pending", input: "{" } })).toBe("")
})

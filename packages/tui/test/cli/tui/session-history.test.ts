import { expect, test } from "bun:test"
import type { SessionMessage, V2Event } from "../../../src/compat/schema"
import { applyEvent, toLegacy } from "../../../src/context/session-history"

const sessionID = "ses_history"
const model = { id: "model", providerID: "test" }
const path = { cwd: "/repo", root: "/repo" }

function event(type: string, data: Record<string, unknown>) {
  return { id: `evt_${type}`, type, data: { sessionID, timestamp: 10, ...data } } as V2Event
}

test("tool events settle into a completed V1 tool part with the step's changed files", () => {
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
  const projected = toLegacy(sessionID, messages, path)
  expect(projected[0].parts.map((part) => part.type)).toEqual(["step-start", "tool", "step-finish"])
  expect(projected[0].parts[1]).toMatchObject({
    tool: "edit",
    state: { status: "completed", input: { filePath: "a.ts" }, output: "edited", title: "a.ts" },
  })
})

test("shell, compaction and failed steps project into V1 shapes, oldest first", () => {
  const projected = toLegacy(
    sessionID,
    [
      {
        id: "msg_failed",
        type: "assistant",
        agent: "maestro",
        model,
        content: [],
        finish: "error",
        error: { type: "unknown", message: "boom" },
        time: { created: 4, completed: 5 },
      },
      { id: "msg_compact", type: "compaction", reason: "auto", summary: "summary", time: { created: 3 } },
      {
        id: "msg_shell",
        type: "shell",
        callID: "call_sh",
        command: "ls",
        output: "a.ts",
        time: { created: 2, completed: 2 },
      },
      { id: "msg_user", type: "user", text: "hi", time: { created: 1 } },
    ] as SessionMessage[],
    path,
  )

  expect(projected.map((item) => [item.info.id, item.info.role])).toEqual([
    ["msg_user", "user"],
    ["msg_shell", "assistant"],
    ["msg_compact", "user"],
    ["msg_compact-summary", "assistant"],
    ["msg_failed", "assistant"],
  ])
  expect(projected[1].parts[0]).toMatchObject({
    type: "tool",
    tool: "bash",
    state: { status: "completed", output: "a.ts" },
  })
  expect(projected[2].parts[0]).toMatchObject({ type: "compaction", auto: true })
  expect(projected[3].info).toMatchObject({ summary: true, parentID: "msg_compact" })
  expect(projected[4].info).toMatchObject({
    parentID: "msg_compact",
    agent: "maestro",
    error: { name: "UnknownError", data: { message: "boom" } },
  })
})

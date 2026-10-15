import { describe, expect, test } from "bun:test"
import type {
  OpenCodeEvent,
  SessionMessageAssistant,
  SessionMessageInfo,
  SessionMessageToolStateCompleted,
  SessionMessageUser,
} from "@opencode-ai/client/promise"
import { confirmedTodos } from "@orchestra/session-ui/confirmed-todos"
import { createV2SessionReducer } from "../context/server-session-v2-reducer"
import { normalizeSessionMessages } from "./session-message"

describe("normalizeSessionMessages", () => {
  test("preserves live V2 structured confirmation like REST without replacing historical snapshots", () => {
    const previous = [{ content: "Earlier snapshot", status: "pending" }]
    const todos = [{ content: "Confirmed task", status: "completed" }]
    const input = { todos: [{ content: "Unconfirmed proposal", status: "pending" }] }
    const source: [SessionMessageUser, SessionMessageAssistant] = [
      { id: "msg_user", type: "user", text: "plan it", time: { created: 1 } },
      {
        id: "msg_assistant",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        time: { created: 2 },
        content: [
          {
            id: "call_previous",
            type: "tool",
            name: "todowrite",
            time: { created: 2, ran: 3, completed: 4 },
            state: {
              status: "completed",
              input: {},
              metadata: { todos: previous },
              content: [{ type: "text", text: JSON.stringify(previous) }],
            },
          },
          {
            id: "call_live",
            type: "tool",
            name: "todowrite",
            time: { created: 5, ran: 6 },
            state: { status: "running", input, metadata: {} },
          },
        ],
      },
    ]
    const snapshots = (messages: SessionMessageInfo[]) =>
      normalizeSessionMessages("ses_1", messages)
        .parts.get("msg_assistant")
        ?.map((part) => {
          if (part.type !== "tool") throw new Error("Expected a tool part")
          return { id: part.id, todos: confirmedTodos(part.state) }
        })
    expect(snapshots(source)).toEqual([
      { id: "call_previous", todos: previous },
      { id: "call_live", todos: undefined },
    ])
    const state = {
      status: "completed",
      input,
      metadata: { todos: [] },
      ...{ structured: { todos } },
      content: [{ type: "text", text: "[\n...output truncated..." }],
    } satisfies SessionMessageToolStateCompleted
    const event = {
      id: "evt_success",
      type: "session.tool.success",
      created: 7,
      location: { directory: "/repo" },
      durable: { aggregateID: "ses_1", seq: 1, version: 2 },
      data: {
        sessionID: "ses_1",
        assistantMessageID: "msg_assistant",
        callID: "call_live",
        executed: false,
        metadata: state.metadata,
        content: state.content,
        // The bundled client predates native structured output.
        ...{ structured: state.structured },
      },
    } satisfies OpenCodeEvent
    const result = createV2SessionReducer().reduce(source, event)
    if (!result) throw new Error("Expected a live reduction")
    expect(result.touched).toEqual(["msg_assistant"])
    const expected = [
      { id: "call_previous", todos: previous },
      { id: "call_live", todos },
    ]
    expect(snapshots(result.messages)).toEqual(expected)
    expect(
      snapshots([
        source[0],
        {
          ...source[1],
          content: source[1].content.map((tool) =>
            tool.type === "tool" && tool.id === "call_live" ? { ...tool, state } : tool,
          ),
        },
      ]),
    ).toEqual(expected)
    expect(snapshots(source)?.[1].todos).toBeUndefined()
  })

  test("preserves confirmed structured todos when display output is truncated", () => {
    const todos = [{ content: "Confirmed task", status: "completed", priority: "high" }]
    const source = [
      { id: "msg_user", type: "user", text: "plan it", time: { created: 1 } },
      {
        id: "msg_assistant",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [
          {
            type: "tool",
            id: "call_todo",
            name: "todowrite",
            state: {
              status: "completed",
              input: { todos: [{ content: "Proposal", status: "pending", priority: "low" }] },
              // The bundled client predates the server's structured output field.
              ...{ structured: { todos } },
              metadata: { todos: [] },
              content: [{ type: "text", text: "[\n...output truncated..." }],
            },
            time: { created: 2, ran: 3, completed: 4 },
          },
        ],
        time: { created: 2, completed: 4 },
      },
    ] satisfies SessionMessageInfo[]

    expect(normalizeSessionMessages("ses_1", source).parts.get("msg_assistant")).toEqual([
      expect.objectContaining({
        tool: "todowrite",
        state: expect.objectContaining({ status: "completed", metadata: { todos } }),
      }),
    ])
  })

  test("projects current turns into stable legacy rendering records", () => {
    const source = [
      { id: "msg_1", type: "agent-switched", agent: "build", time: { created: 1 } },
      {
        id: "msg_2",
        type: "model-switched",
        model: { id: "claude", providerID: "anthropic", variant: "high" },
        time: { created: 2 },
      },
      {
        id: "msg_3",
        type: "user",
        text: "inspect @src/client.ts",
        files: [
          {
            data: "aGVsbG8=",
            mime: "text/plain",
            name: "note.txt",
            source: { type: "inline" },
          },
          {
            data: "ZXhwb3J0IHt9",
            mime: "text/plain",
            name: "client.ts",
            source: { type: "inline" },
            mention: { text: "@src/client.ts", start: 8, end: 22 },
          },
        ],
        agents: [{ name: "review", mention: { text: "@review", start: 0, end: 7 } }],
        time: { created: 3 },
      },
      {
        id: "msg_4",
        type: "assistant",
        agent: "build",
        model: { id: "claude", providerID: "anthropic", variant: "high" },
        content: [
          { type: "reasoning", text: "Thinking", time: { created: 4, completed: 5 } },
          { type: "text", text: "Result" },
          {
            type: "tool",
            id: "call_1",
            name: "read",
            state: {
              status: "completed",
              input: { filePath: "note.txt" },
              metadata: { title: "note.txt" },
              content: [{ type: "text", text: "hello" }],
            },
            time: { created: 5, ran: 6, completed: 7 },
          },
        ],
        cost: 0.1,
        tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 1, write: 0 } },
        time: { created: 4, completed: 7 },
      },
      {
        id: "msg_5",
        type: "compaction",
        status: "completed",
        reason: "auto",
        summary: "summary",
        recent: "recent",
        time: { created: 8 },
      },
    ] satisfies SessionMessageInfo[]

    const result = normalizeSessionMessages("ses_1", source)

    expect(result.messages).toHaveLength(2)
    expect(result.messages[0]).toMatchObject({
      id: "msg_3",
      role: "user",
      agent: "build",
      model: { providerID: "anthropic", modelID: "claude", variant: "high" },
    })
    expect(result.messages[1]).toMatchObject({ id: "msg_4", role: "assistant", parentID: "msg_3", cost: 0.1 })
    expect(result.parts.get("msg_3")?.map((part) => part.id)).toEqual([
      "msg_3:text:0",
      "msg_3:file:0",
      "msg_3:file:1",
      "msg_3:agent:0",
      "msg_5:compaction",
    ])
    expect(result.parts.get("msg_3")?.[2]).toMatchObject({
      type: "file",
      source: {
        type: "file",
        path: "src/client.ts",
        text: { value: "@src/client.ts", start: 8, end: 22 },
      },
    })
    expect(result.parts.get("msg_4")?.map((part) => part.id)).toEqual(["msg_4:reasoning:0", "msg_4:text:0", "call_1"])
    expect(result.parts.get("msg_4")?.[2]).toMatchObject({
      type: "tool",
      tool: "read",
      state: { status: "completed", output: "hello" },
    })
  })

  test("does not invent a parent for an assistant-only page", () => {
    const source = [
      {
        id: "msg_2",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [{ type: "text", text: "orphan" }],
        time: { created: 2 },
      },
    ] satisfies SessionMessageInfo[]

    expect(normalizeSessionMessages("ses_1", source).messages).toEqual([])
  })

  test("projects a current shell message into a renderable standalone turn", () => {
    const source = [
      {
        id: "msg_shell",
        type: "shell",
        shellID: "shell_1",
        command: "printf hello",
        status: "exited",
        exit: 0,
        output: { output: "hello", cursor: 5, size: 5, truncated: false },
        time: { created: 1, completed: 2 },
      },
    ] satisfies SessionMessageInfo[]

    const result = normalizeSessionMessages("ses_1", source)

    expect(result.messages).toEqual([
      expect.objectContaining({ id: "msg_shell", role: "user" }),
      expect.objectContaining({ id: "msg_shell:assistant", role: "assistant", parentID: "msg_shell" }),
    ])
    expect(result.parts.get("msg_shell")).toEqual([expect.objectContaining({ type: "text", text: "printf hello" })])
    expect(result.parts.get("msg_shell:assistant")).toEqual([
      expect.objectContaining({
        type: "tool",
        tool: "bash",
        state: expect.objectContaining({
          status: "completed",
          input: { command: "printf hello" },
          output: "hello",
          title: "Shell",
        }),
      }),
    ])
  })

  test("adapts current edit fields for the legacy edit renderer", () => {
    const source = [
      { id: "msg_user", type: "user", text: "edit it", time: { created: 1 } },
      {
        id: "msg_assistant",
        type: "assistant",
        agent: "build",
        model: { id: "model", providerID: "provider" },
        content: [
          {
            type: "tool",
            id: "call_edit",
            name: "edit",
            state: {
              status: "completed",
              input: { path: "/repo/README.md", oldString: "old", newString: "new" },
              content: [{ type: "text", text: "Edited file successfully" }],
              metadata: {
                files: [
                  {
                    file: "README.md",
                    patch: "@@ -1 +1 @@\n-old\n+new",
                    additions: 1,
                    deletions: 1,
                    status: "modified",
                  },
                ],
                replacements: 1,
              },
            },
            time: { created: 2, ran: 3, completed: 4 },
          },
        ],
        time: { created: 2, completed: 4 },
      },
    ] satisfies SessionMessageInfo[]

    const result = normalizeSessionMessages("ses_1", source)

    expect(result.parts.get("msg_assistant")).toEqual([
      expect.objectContaining({
        type: "tool",
        tool: "edit",
        state: expect.objectContaining({
          status: "completed",
          input: expect.objectContaining({ path: "/repo/README.md", filePath: "/repo/README.md" }),
          metadata: expect.objectContaining({
            filediff: {
              file: "README.md",
              patch: "@@ -1 +1 @@\n-old\n+new",
              additions: 1,
              deletions: 1,
            },
          }),
        }),
      }),
    ])
  })
})

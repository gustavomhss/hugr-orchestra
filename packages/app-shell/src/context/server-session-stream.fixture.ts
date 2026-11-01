import type { ClientEvent } from "@/session-types"

/**
 * One session's live events, in the order the server emits them: agent and model selection, a turn with reasoning,
 * text and an edit tool call, a second turn that opens with a shell command, and a long streamed reply. The index of
 * the last assistant's first text delta is `streamStart`; every event after it only grows that reply.
 */
export function sessionStream(sessionID: string) {
  let n = 0
  const event = (type: string, data: object) => {
    n++
    return {
      id: `evt_${n}`,
      created: n + 1,
      type,
      durable: { aggregateID: sessionID, seq: n, version: 1 },
      location: { directory: "/repo" },
      data: { sessionID, ...data },
    } as unknown as ClientEvent
  }
  const turn = (inputID: string, text: string) => [
    event("session.input.admitted", { inputID, input: { type: "user", delivery: "steer", data: { text } } }),
    event("session.input.promoted", { inputID }),
  ]
  const model = { id: "model", providerID: "provider" }
  const tokens = { input: 1, output: 2, reasoning: 0, cache: { read: 0, write: 0 } }
  const files = [{ file: "a.ts", patch: "@@ -1 +1 @@\n-old\n+new", additions: 1, deletions: 1 }]
  const first = "msg_2_assistant"
  const last = "msg_5_assistant"

  const events = [
    event("session.agent.selected", { agent: "plan" }),
    event("session.model.selected", { model }),
    ...turn("msg_1_user", "fix a.ts"),
    event("session.step.started", { assistantMessageID: first, agent: "build", model }),
    event("session.reasoning.started", { assistantMessageID: first, ordinal: 0 }),
    event("session.reasoning.delta", { assistantMessageID: first, ordinal: 0, delta: "think" }),
    event("session.reasoning.ended", { assistantMessageID: first, ordinal: 0, text: "thinking" }),
    event("session.text.started", { assistantMessageID: first, ordinal: 0 }),
    event("session.text.delta", { assistantMessageID: first, ordinal: 0, delta: "Editing " }),
    event("session.text.ended", { assistantMessageID: first, ordinal: 0, text: "Editing a.ts" }),
    event("session.tool.input.started", { assistantMessageID: first, callID: "call_edit", name: "edit" }),
    event("session.tool.input.delta", { assistantMessageID: first, callID: "call_edit", delta: '{"path":"a.ts"}' }),
    event("session.tool.input.ended", { assistantMessageID: first, callID: "call_edit", text: '{"path":"a.ts"}' }),
    event("session.tool.called", {
      assistantMessageID: first,
      callID: "call_edit",
      input: { path: "a.ts" },
      executed: true,
    }),
    event("session.tool.progress", { assistantMessageID: first, callID: "call_edit", metadata: { files } }),
    event("session.tool.success", {
      assistantMessageID: first,
      callID: "call_edit",
      metadata: { files },
      content: [{ type: "text", text: "edited" }],
      executed: true,
    }),
    event("session.step.ended", { assistantMessageID: first, finish: "stop", cost: 0, tokens }),
    ...turn("msg_3_user", "run ls"),
    event("session.shell.started", { shell: { id: "shell_1", command: "ls", status: "running" } }),
    event("session.shell.ended", { shell: { id: "shell_1", command: "ls", status: "completed", exit: 0 }, output: { output: "a.ts" } }),
    ...turn("msg_4_user", "summarize"),
    event("session.step.started", { assistantMessageID: last, agent: "build", model }),
    event("session.tool.input.started", { assistantMessageID: last, callID: "call_read", name: "read" }),
    event("session.tool.called", { assistantMessageID: last, callID: "call_read", input: { path: "a.ts" }, executed: true }),
    event("session.tool.success", {
      assistantMessageID: last,
      callID: "call_read",
      metadata: {},
      content: [{ type: "text", text: "file body" }],
      executed: true,
    }),
    event("session.text.started", { assistantMessageID: last, ordinal: 0 }),
  ]
  const streamStart = events.length
  const deltas = Array.from({ length: 20 }, (_, index) =>
    event("session.text.delta", { assistantMessageID: last, ordinal: 0, delta: `word${index} ` }),
  )
  return {
    events: [...events, ...deltas, event("session.step.ended", { assistantMessageID: last, finish: "stop", cost: 0, tokens })],
    streamStart,
    last,
  }
}

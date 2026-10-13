import { expect } from "bun:test"
import { Effect, Fiber, Schema } from "effect"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Permission } from "@/permission"
import { pollWithTimeout } from "../../lib/effect"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeEngineFixture } from "../engine-fixture"

// Script only the external SDK. The host, gate, reservation bridge, tools, persistence and permissions are real.
ClaudeEngineFixture.it.instance("the host wires accepted SDK dispatches to the real MCP handler and mirrored result", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  yield* Effect.addFinalizer(() => host.release(f.chat.id))
  const frame = ClaudeEngineFixture.frame
  const responses: unknown[] = []
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const args = { query: "bridge host prompt" }
    yield { type: "assistant", ...frame, uuid: "tool-frame", message: { id: "msg_bridge_tool", content: [
      { type: "tool_use", id: "host_recall", name: "mcp__orchestra__context_recall", input: args },
    ], stop_reason: "tool_use", usage: {} } }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    if (!pre) throw new Error("host did not wire PreToolUse")
    const permitted = await pre({ hook_event_name: "PreToolUse", session_id: "sdk-1", transcript_path: "/tmp/scripted-transcript",
      cwd: params.options?.cwd ?? "/tmp", tool_use_id: "host_recall", tool_name: "mcp__orchestra__context_recall", tool_input: args },
    "host_recall", { signal: new AbortController().signal })
    expect(permitted).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    const accepted = "hookSpecificOutput" in permitted && permitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? permitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("missing dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("host did not wire its SDK MCP server")
    const client = new Client({ name: "scripted-sdk", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    // An argument substitution has no reservation and cannot claim the original call.
    responses.push(await client.callTool({ name: "context_recall", arguments: { ...accepted, query: "wrong arguments" } }))
    const result = await client.callTool({ name: "context_recall", arguments: accepted })
    responses.push(result)
    await client.close()
    yield { type: "user", ...frame, message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "host_recall", content: "recalled" },
    ] } }
    yield { type: "assistant", ...frame, uuid: "answer-frame", message: { id: "msg_bridge_answer", content: [
      { type: "text", text: "Bridge complete" },
    ], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })
  const reply = yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("bridge host prompt") })
  expect(reply.info.role === "assistant" && reply.info.finish).toBe("stop")
  const Text = Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })), isError: Schema.optional(Schema.Boolean) })
  expect(Schema.decodeUnknownSync(Text)(responses[0]).isError).toBe(true)
  const result = Schema.decodeUnknownSync(Text)(responses[1])
  expect(result.isError).toBeUndefined()
  expect(result.content[0].text).toContain("bridge host prompt")
  const part = (yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === "host_recall")
  expect(part?.type === "tool" && part.state.status === "completed" && part.state.output).toBe(result.content[0].text)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  yield* host.release(f.chat.id)
}), 60_000)

ClaudeEngineFixture.it.instance("host Stop cancels the real MCP execution instead of leaving its permission request alive", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  yield* Effect.addFinalizer(() => host.release(f.chat.id))
  const permission = yield* Permission.Service
  yield* f.sessions.setPermission({ sessionID: f.chat.id, permission: [
    { permission: "*", pattern: "*", action: "allow" }, { permission: "context_recall", pattern: "*", action: "ask" },
  ] })
  const responses: unknown[] = []
  const frame = ClaudeEngineFixture.frame
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const args = { query: "waiting for permission" }
    yield { type: "assistant", ...frame, uuid: "cancel-tool-frame", message: { id: "msg_cancel_tool", content: [
      { type: "tool_use", id: "host_waiting", name: "mcp__orchestra__context_recall", input: args },
    ], stop_reason: "tool_use", usage: {} } }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    if (!pre) throw new Error("missing gate")
    const permitted = await pre({ hook_event_name: "PreToolUse", session_id: "sdk-1", transcript_path: "/tmp/scripted-transcript", cwd: params.options?.cwd ?? "/tmp",
      tool_use_id: "host_waiting", tool_name: "mcp__orchestra__context_recall", tool_input: args }, "host_waiting", { signal: new AbortController().signal })
    const accepted = "hookSpecificOutput" in permitted && permitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? permitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("missing dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("missing SDK MCP server")
    const client = new Client({ name: "scripted-sdk-cancel", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    // Closing the SDK query may reject its MCP transport instead of delivering a tool error response.
    responses.push(await client.callTool({ name: "context_recall", arguments: accepted }).catch(() => ({ isError: true })))
    await client.close()
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })
  const running = yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("cancel this recall") }).pipe(Effect.forkChild)
  yield* pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests.find((request) => request.tool?.callID === "host_waiting"))),
    "the MCP tool never reached its permission wait", "5 seconds")
  yield* host.interrupt(f.chat.id)
  yield* Fiber.join(running)
  yield* pollWithTimeout(Effect.sync(() => responses[0]), "the cancelled MCP handler did not return", "5 seconds")
  yield* pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests.every((request) => request.tool?.callID !== "host_waiting") ? true : undefined)),
    "host Stop left the permission request alive", "5 seconds")
  expect(Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.Boolean }))(responses[0]).isError).toBe(true)
  const part = (yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === "host_waiting")
  expect(part?.type === "tool" && part.state.status).toBe("error")
  yield* host.release(f.chat.id)
}), 60_000)

ClaudeEngineFixture.it.instance("generic subagent MCP calls join the mirrored child rather than the dispatcher Session", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  yield* Effect.addFinalizer(() => host.release(f.chat.id))
  const frame = ClaudeEngineFixture.frame
  const responses: unknown[] = []
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    if (!pre) throw new Error("missing gate")
    const base = { session_id: "sdk-1", transcript_path: "/tmp/scripted-transcript", cwd: params.options?.cwd ?? "/tmp" }
    const task = { subagent_type: "general-purpose", description: "Recall child brief", prompt: "generic child private brief", run_in_background: false }
    yield { type: "assistant", ...frame, uuid: "agent-frame", message: { id: "msg_generic_agent", content: [
      { type: "tool_use", id: "generic_agent", name: "Agent", input: task },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "generic_agent", tool_input: task },
      "generic_agent", { signal: new AbortController().signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: "generic-task", tool_use_id: "generic_agent", description: "Recall child brief",
      subagent_type: "general-purpose", is_backgrounded: false, task_type: "local_agent", ...frame }
    const args = { query: "private brief" }
    yield { type: "assistant", ...frame, parent_tool_use_id: "generic_agent", uuid: "generic-tool-frame", message: { id: "msg_generic_recall", content: [
      { type: "tool_use", id: "generic_recall", name: "mcp__orchestra__context_recall", input: args },
    ], stop_reason: "tool_use", usage: {} } }
    const permitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: "generic-task", agent_type: "general-purpose",
      tool_name: "mcp__orchestra__context_recall", tool_use_id: "generic_recall", tool_input: args }, "generic_recall", { signal: new AbortController().signal })
    const accepted = "hookSpecificOutput" in permitted && permitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? permitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("child did not receive a dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("missing SDK MCP server")
    const client = new Client({ name: "generic-scripted-sdk", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    responses.push(await client.callTool({ name: "context_recall", arguments: accepted }))
    await client.close()
    yield { type: "assistant", ...frame, uuid: "generic-answer-frame", message: { id: "msg_generic_answer", content: [
      { type: "text", text: "Child recalled its own brief" },
    ], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })
  yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("parent private brief") })
  const result = Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.optional(Schema.Boolean),
    content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })) }))(responses[0])
  expect(result.isError).toBeUndefined()
  expect(result.content[0].text).toContain("generic child private brief")
  expect(result.content[0].text).not.toContain("parent private brief")
  const children = yield* f.sessions.children(f.chat.id)
  expect(children).toHaveLength(1)
  expect((yield* f.sessions.messages({ sessionID: children[0].id })).flatMap((message) => message.parts)
    .some((part) => part.type === "tool" && part.callID === "generic_recall" && part.state.status === "completed")).toBe(true)
  yield* host.release(f.chat.id)
}), 60_000)

ClaudeEngineFixture.it.instance("interrupting a child with its own query also cancels parent-owned MCP calls and preserves the root turn", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  const permission = yield* Permission.Service
  yield* Effect.addFinalizer(() => host.release(f.chat.id))
  yield* f.sessions.setPermission({ sessionID: f.chat.id, permission: [
    { permission: "*", pattern: "*", action: "allow" }, { permission: "context_recall", pattern: "*", action: "ask" },
  ] })
  const responses: unknown[] = []
  const frame = ClaudeEngineFixture.frame
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
    const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
    if (!pre) throw new Error("missing gate")
    const base = { session_id: "sdk-1", transcript_path: "/tmp/scripted-transcript", cwd: params.options?.cwd ?? "/tmp" }
    const task = { subagent_type: "general-purpose", description: "Child recall", prompt: "child brief", run_in_background: true }
    yield { type: "assistant", ...frame, message: { id: "msg_child_stop_agent", content: [
      { type: "tool_use", id: "stopped_agent", name: "Agent", input: task },
    ], stop_reason: "tool_use", usage: {} } }
    expect(await pre({ ...base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "stopped_agent", tool_input: task },
      "stopped_agent", { signal: new AbortController().signal })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    yield { type: "system", subtype: "task_started", task_id: "stopped-task", tool_use_id: "stopped_agent", description: "Child recall",
      subagent_type: "general-purpose", is_backgrounded: true, task_type: "local_agent", ...frame }
    // The background launch returns before the root can start another provider step.
    yield { type: "user", ...frame, message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "stopped_agent", content: "launched" },
    ] }, tool_use_result: { status: "async_launched", agentId: "stopped-task" } }
    const args = { query: "child brief" }
    yield { type: "assistant", ...frame, parent_tool_use_id: "stopped_agent", message: { id: "msg_child_stop_recall", content: [
      { type: "tool_use", id: "child_waiting", name: "mcp__orchestra__context_recall", input: args },
    ], stop_reason: "tool_use", usage: {} } }
    const permitted = await pre({ ...base, hook_event_name: "PreToolUse", agent_id: "stopped-task", agent_type: "general-purpose",
      tool_name: "mcp__orchestra__context_recall", tool_use_id: "child_waiting", tool_input: args }, "child_waiting", { signal: new AbortController().signal })
    const accepted = "hookSpecificOutput" in permitted && permitted.hookSpecificOutput?.hookEventName === "PreToolUse"
      ? permitted.hookSpecificOutput.updatedInput : undefined
    if (!accepted) throw new Error("child did not receive a dispatch receipt")
    const server = params.options?.mcpServers?.orchestra
    if (!server || server.type !== "sdk") throw new Error("missing SDK MCP server")
    const client = new Client({ name: "scripted-child-stop", version: "1" })
    const transports = InMemoryTransport.createLinkedPair()
    await server.instance.connect(transports[0])
    await client.connect(transports[1])
    responses.push(await client.callTool({ name: "context_recall", arguments: accepted }))
    await client.close()
    yield { type: "assistant", ...frame, message: { id: "msg_after_child_stop", content: [
      { type: "text", text: "Root remains live" },
    ], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })
  const running = yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("start a child") }).pipe(Effect.forkChild)
  const pending = yield* pollWithTimeout(permission.list().pipe(Effect.map((requests) => requests.find((request) => request.tool?.callID === "child_waiting"))),
    "the child MCP call never reached its permission wait", "5 seconds")
  expect(pending.sessionID).not.toBe(f.chat.id)
  // A directly prompted child has its own live query while the original subagent call still belongs to the root.
  ClaudeEngineFixture.state.scripts.push(async function* (input) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "assistant", ...frame, message: { id: "msg_independent_child", content: [
      { type: "text", text: "Independent child prompt" },
    ], stop_reason: "end_turn", usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
    for await (const _ of input) {}
  })
  yield* f.prompt.prompt({ sessionID: pending.sessionID, ...ClaudeEngineFixture.say("prompt the child directly") })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(2)
  yield* host.interrupt(pending.sessionID)
  const reply = yield* Fiber.join(running)
  if (reply.info.role !== "assistant") throw new Error("root did not return an assistant reply")
  expect(reply.info.error).toBeUndefined()
  expect(reply.parts.some((part) => part.type === "text" && part.text === "Root remains live")).toBe(true)
  expect(Schema.decodeUnknownSync(Schema.Struct({ isError: Schema.Boolean }))(responses[0]).isError).toBe(true)
  expect(ClaudeEngineFixture.state.stoppedTasks).toEqual(["stopped-task"])
  expect(ClaudeEngineFixture.state.closed).toEqual([ClaudeEngineFixture.state.queries[1]])
  expect(ClaudeEngineFixture.state.queries[1].options?.abortController?.signal.aborted).toBe(true)
  expect(ClaudeEngineFixture.state.queries[0].options?.abortController?.signal.aborted).toBe(false)
  expect((yield* permission.list()).some((request) => request.sessionID === pending.sessionID)).toBe(false)
  const part = (yield* f.sessions.messages({ sessionID: pending.sessionID })).flatMap((message) => message.parts)
    .find((part) => part.type === "tool" && part.callID === "child_waiting")
  expect(part?.type === "tool" && part.state.status).toBe("error")
  yield* host.release(f.chat.id)
}), 60_000)

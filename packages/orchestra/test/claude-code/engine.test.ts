import { expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeEngineFixture } from "./engine-fixture"
import { ClaudeLifecycleFixture } from "./host/lifecycle-fixture"
import { Provider } from "@/provider/provider"

// The engine switch (specs/claude-code-engine.md): `agent.<id>.engine: "claude-code"` hands the turn to the Claude
// Code host; any other agent stays on Orchestra's loop and the engine never builds a query.

ClaudeEngineFixture.it.instance("a Claude Code agent's turns run in one long-lived host session on Claude Code's own terms", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    ClaudeEngineFixture.state.scripts.push(ClaudeEngineFixture.replies("first answer", "second answer"))
    const first = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("hello") })
    expect(first.info.role === "assistant" && first.info.finish).toBe("stop")
    expect(first.parts.some((part) => part.type === "text" && part.text === "first answer")).toBe(true)
    expect(ClaudeEngineFixture.state.inputs).toEqual(["hello"])
    const options = ClaudeEngineFixture.state.queries[0].options
    expect(options?.systemPrompt).toMatchObject({ type: "preset", preset: "claude_code", append: expect.any(String) })
    // Built-ins stay on and unaliased, project settings load, and no transcript store is swapped in.
    expect(options?.disallowedTools).toBeUndefined()
    expect(options?.tools).toBeUndefined()
    expect(options && "toolAliases" in options).toBe(false)
    expect(options?.sessionStore).toBeUndefined()
    expect(options?.settingSources).toEqual(["project"])
    expect(options?.plugins).toEqual([{ type: "local", path: expect.any(String) }])
    expect(Object.keys(options?.mcpServers ?? {})).toEqual(["orchestra"])
    // Orchestra's policy gate is always wired.
    expect(options?.hooks?.PreToolUse?.length).toBeGreaterThan(0)
    expect(options?.sessionId).toBe(ClaudeHost.claudeSessionID(chat.id))
    expect(options?.resume).toBeUndefined()
    expect((yield* sessions.get(chat.id)).metadata?.claudeCode).toMatchObject({ sessionId: "sdk-1", delivered: [expect.any(String)] })

    const second = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("again") })
    expect(second.parts.some((part) => part.type === "text" && part.text === "second answer")).toBe(true)
    // The same Claude Code session reads the next message: Claude Code, not Orchestra, runs the loop.
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(ClaudeEngineFixture.state.inputs).toEqual(["hello", "again"])
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  }), 30_000)

ClaudeEngineFixture.it.instance("an agent on Orchestra's loop never reaches the host", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { prompt, chat } = yield* ClaudeLifecycleFixture.setup(yield* ClaudeLifecycleFixture.normalConfig)
    const provider = yield* Provider.Service
    expect((yield* provider.getModel(ClaudeLifecycleFixture.model.providerID, ClaudeLifecycleFixture.model.modelID)).id)
      .toBe(ClaudeLifecycleFixture.model.modelID)
    // Orchestra's own transport is the one that runs (and fails, in this fixture); no Claude Code query is built.
    const outcome = yield* prompt.prompt({ sessionID: chat.id, agent: "maestro", model: ClaudeLifecycleFixture.model,
      parts: [{ type: "text", text: "stay on the loop" }] }).pipe(Effect.exit)
    if (ClaudeEngineFixture.state.apiCalls === 0 && Exit.isFailure(outcome)) throw new Error(Cause.pretty(outcome.cause))
    expect(ClaudeEngineFixture.state.apiCalls).toBeGreaterThan(0)
    expect(ClaudeEngineFixture.state.queries).toHaveLength(0)
  }), 30_000)

ClaudeEngineFixture.it.instance("a session that ends before answering fails the turn and does not fall back to Orchestra's loop", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { prompt, chat } = yield* ClaudeEngineFixture.setup()
    ClaudeEngineFixture.state.scripts.push(async function* () { throw new Error("Claude Code could not start") })
    const result = yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("hello") })
    const info = result.info as SessionV1.Assistant
    expect(info.finish).toBe("error")
    expect(info.error?.data).toMatchObject({ message: "Claude Code could not start" })
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
  }), 30_000)

// A subagent the delegation hooks recorded no child session for (Claude Code's own subagent types) gets one at its
// first frame, so its first tool call, an `orchestra` MCP call included, has a mirrored part to run on.
ClaudeEngineFixture.it.instance("a subagent's child session exists before its first tool call and its card links it", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const { sessions, prompt, chat } = yield* ClaudeEngineFixture.setup()
    const frame = ClaudeEngineFixture.frame
    const child = { ...frame, parent_tool_use_id: "toolu_agent" }
    ClaudeEngineFixture.state.scripts.push(async function* (input) {
      await input[Symbol.asyncIterator]().next()
      yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...frame }
      yield { type: "assistant", ...frame, uuid: "a", message: { id: "msg_a", content: [{ type: "tool_use", id: "toolu_agent", name: "Agent",
        input: { subagent_type: "general-purpose", description: "look around", prompt: "find the config" } }], stop_reason: "tool_use", usage: {} } }
      yield { type: "system", subtype: "task_started", task_id: "agent-1", tool_use_id: "toolu_agent", description: "look around",
        subagent_type: "general-purpose", is_backgrounded: false, task_type: "local_agent", ...frame }
      yield { type: "user", ...child, message: { role: "user", content: [{ type: "text", text: "find the config" }] } }
      yield { type: "assistant", ...child, uuid: "c1", message: { id: "msg_c1", content: [{ type: "tool_use", id: "toolu_todo",
        name: "mcp__orchestra__todowrite", input: { todos: [] } }], stop_reason: "tool_use", usage: {} } }
      yield { type: "user", ...child, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_todo", content: "noted" }] } }
      yield { type: "assistant", ...child, uuid: "c2", message: { id: "msg_c2", content: [{ type: "text", text: "found it" }], stop_reason: "end_turn", usage: {} } }
      yield { type: "user", ...frame, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_agent", content: "found it" }] },
        tool_use_result: { status: "completed", agentId: "agent-1", content: [{ type: "text", text: "found it" }] } }
      yield { type: "assistant", ...frame, uuid: "b", message: { id: "msg_b", content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage: {} } }
      yield { type: "result", subtype: "success", is_error: false, stop_reason: "end_turn", total_cost_usd: 0.01, ...frame }
      for await (const _ of input) {}
    })
    yield* prompt.prompt({ sessionID: chat.id, ...ClaudeEngineFixture.say("delegate") })
    const children = yield* sessions.children(chat.id)
    expect(children).toHaveLength(1)
    const mirrored = (yield* sessions.messages({ sessionID: children[0].id })).flatMap((message) => message.parts)
    expect(mirrored.some((part) => part.type === "text" && part.text === "find the config")).toBe(true)
    expect(mirrored.some((part) => part.type === "tool" && part.callID === "toolu_todo" && part.state.status === "completed")).toBe(true)
    expect(mirrored.some((part) => part.type === "text" && part.text === "found it")).toBe(true)
    const card = (yield* sessions.messages({ sessionID: chat.id })).flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.callID === "toolu_agent")
    expect(card?.type === "tool" && card.state.status === "completed" && card.state.metadata?.sessionId).toBe(children[0].id)
  }), 30_000)

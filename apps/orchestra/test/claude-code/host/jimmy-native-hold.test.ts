import { expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "node:path"
import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { MessageID, PartID } from "@/session/schema"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"
import { TestLLMServer } from "../../lib/llm-server"
import { testProviderConfig } from "../../lib/test-provider"
import { ClaudeResearchFixture } from "./jimmy-fixture"

for (const tool of ["Agent", "Task"] as const)
  for (const background of [false, true])
    ClaudeResearchFixture.it.instance(`${tool} native jimmy background=${background} refuses missing research runtime before child creation`, () => Effect.gen(function* () {
      const fixture = yield* ClaudeResearchFixture.setup({ research: false })
      const dispatch = yield* fixture.dispatch("native-research-hold", { tool, background })
      expect(dispatch.output).toMatchObject({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("research allowance is not available") } })
      expect(fixture.join.get(dispatch.callID)).toBeUndefined()
      expect(fixture.join.children()).toEqual([])
      expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
      expect(yield* ClaudeResearchFixture.charges(fixture.parent.id)).toEqual([])
      const part = fixture.mirrored.get(dispatch.callID)
      expect(part?.state).not.toHaveProperty("metadata.sessionId")
      expect(part?.metadata).not.toHaveProperty("sessionId")
      // A retry cannot create a child without the real allowance port.
      expect((yield* fixture.dispatch(dispatch.callID, { tool, background })).output).toEqual(dispatch.output)
      expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
      expect(fixture.abort.signal.aborted).toBe(false)
      // Parent remains usable when the child runtime is missing.
      yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "parent-control.txt"), "Parent control"))
      expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, hook_event_name: "PreToolUse", tool_name: "Read",
        tool_use_id: "parent-read", tool_input: { file_path: path.join(fixture.parent.directory, "parent-control.txt") } }))
        .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
    }), 30_000)

ClaudeResearchFixture.it.instance("non-jimmy native dispatch joins child agent_id while hook session_id remains shared with root", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch("other-native-seat", { subagentType: "orchestra:patty" })
  expect(dispatch.output).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const child = fixture.join.child(dispatch.callID)
  if (!child) throw new Error("Expected non-jimmy child from real dispatch")
  expect(yield* LogicalTask.read(child)).toMatchObject({ executionSessionID: child, memberID: "patty", authoritySessionID: fixture.parent.id })
  const agentID = "native-other-seat"
  fixture.join.taskStarted({ toolUseID: dispatch.callID, taskID: agentID })
  expect(fixture.join.toolUse(agentID)).toBe(dispatch.callID)
  // SDK 0.3.289 BaseHookInput.agent_id, and live S13 hooks: session_id alone is not child identity.
  expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: agentID, agent_type: "orchestra:patty",
    hook_event_name: "PreToolUse", tool_name: "Skill", tool_use_id: "child-skill", tool_input: { skill: "unowned-control" } }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("patty may use only its own skills") } })
  expect((yield* fixture.sessions.get(fixture.parent.id)).metadata?.claudeCode?.sessionId).toBe(ClaudeResearchFixture.base.session_id)
  expect((yield* fixture.sessions.get(child)).metadata?.claudeCode?.sessionId).toBeUndefined()
  expect(yield* ClaudeResearchFixture.charges(child)).toEqual([])
}), 30_000)

ClaudeResearchFixture.it.instance("native Jimmy siblings share root SDK session_id but agent_id selects separate Task allowances", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const first = yield* fixture.nativeDispatch("first-shared-session")
  const sibling = yield* fixture.nativeDispatch("sibling-shared-session")
  expect(first.child).not.toBe(sibling.child)
  expect(fixture.join.toolUse(first.taskID)).toBe(first.callID)
  expect(fixture.join.toolUse(sibling.taskID)).toBe(sibling.callID)
  expect(yield* first.pre("mcp__orchestra__research_view", "first-view", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* sibling.pre("mcp__orchestra__research_view", "sibling-view", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* ClaudeResearchFixture.charges(first.child)).toMatchObject([{ dispatchCallID: first.callID, kind: "tool", amount: 1 }])
  expect(yield* ClaudeResearchFixture.charges(sibling.child)).toMatchObject([{ dispatchCallID: sibling.callID, kind: "tool", amount: 1 }])
  expect(yield* ClaudeResearchFixture.charges(fixture.parent.id)).toEqual([])
  expect((yield* fixture.sessions.get(fixture.parent.id)).metadata?.claudeCode?.sessionId).toBe(ClaudeResearchFixture.base.session_id)
  expect((yield* fixture.sessions.get(first.child)).metadata?.claudeCode?.sessionId).toBeUndefined()
  expect((yield* fixture.sessions.get(sibling.child)).metadata?.claudeCode?.sessionId).toBeUndefined()
  expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: "unjoined-child", hook_event_name: "PreToolUse",
    tool_name: "mcp__orchestra__research_view", tool_use_id: "unjoined-view", tool_input: { action: "corpus" } }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
}), 30_000)

// Only SDK transport is scripted. Host admission, tools, LLM transport and allowance services stay real.
const queries: Parameters<ClaudeCodeSDK.Interface["query"]>[0][] = []
const denied: unknown[] = []
const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({ query: (params) => {
  queries.push(params)
  if (typeof params.prompt === "string") throw new Error("Expected streaming SDK input")
  const prompt = params.prompt
  const frames = (async function* (): AsyncGenerator<SDKMessage> {
    for await (const user of prompt) {
      yield { type: "system", subtype: "init", model: "claude-test", session_id: "direct-native", uuid: crypto.randomUUID() } as SDKMessage
      yield { ...user, session_id: "direct-native" }
      const pre = params.options?.hooks?.PreToolUse?.[0].hooks[0]
      if (!pre) throw new Error("Missing real host PreToolUse hook")
      denied.push(await pre({ session_id: "direct-native", transcript_path: "/tmp/unused", cwd: "/tmp",
        hook_event_name: "PreToolUse", tool_name: "mcp__orchestra__research_view", tool_use_id: "direct-view",
        tool_input: { action: "corpus" } }, undefined, { signal: new AbortController().signal }))
      yield { type: "assistant", session_id: "direct-native", uuid: crypto.randomUUID(), parent_tool_use_id: null,
        message: { id: "direct-response", role: "assistant", model: "claude-test", content: [{ type: "text", text: "No admitted research work." }] } } as SDKMessage
      yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, session_id: "direct-native",
        uuid: crypto.randomUUID() } as SDKMessage
    }
  })()
  return Object.assign(frames, { close: () => { void frames.return(undefined) }, interrupt: async () => undefined,
    stopTask: async () => undefined, setModel: async () => undefined,
    accountInfo: async () => ({ subscriptionType: "Claude Max", apiProvider: "firstParty" }),
    getContextUsage: async () => ({ totalTokens: 10, maxTokens: 200_000, percentage: 0 }),
  }) as unknown as Query
} }))
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ClaudeHost.node, SessionPrompt.node, ResearchExecution.node, ResearchAllowance.node,
  Session.node, SessionProjector.node, Database.node, EventV2Bridge.node, filesystem,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
]), [[ClaudeCodeSDK.node, sdk], [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })]]))

for (const engine of ["claude-code", "orchestra"] as const)
  it.instance(`direct jimmy ${engine} preserves actual binding requirements, without a seat-name admission ban`, () => Effect.gen(function* () {
    queries.length = 0
    denied.length = 0
    const instance = yield* TestInstance
    const remote = yield* TestLLMServer
    const config = testProviderConfig(remote.url)
    yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({
      ...config, enabled_providers: ["test"], model: "test/test-model", small_model: "test/test-model", plugin: [], mcp: {},
      compaction: { auto: false }, agent: { jimmy: { engine, model: "test/test-model" } },
    })))
    const sessions = yield* Session.Service
    const host = yield* ClaudeHost.Service
    const execution = yield* ResearchExecution.Service
    const authority = yield* sessions.create({ agent: "maestro", title: "Research authority" })
    const child = yield* sessions.create({ parentID: authority.id, agent: "jimmy", title: "Bound research execution" })
    if (engine === "orchestra") yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
      projectID: child.projectID, memberID: "jimmy", source: "host" })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
      model: { providerID: "test", modelID: "test-model" } as SessionV1.User["model"], time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), messageID: user.id, sessionID: child.id,
      type: "text", text: "Investigate conditions" })
    const result = yield* Effect.exit(host.turn({ sessionID: child.id, user }))
    expect(yield* remote.calls).toBe(0)
    expect(yield* ClaudeResearchFixture.charges(child.id)).toEqual([])
    if (engine === "claude-code") {
      expect(result).toEqual(Exit.succeed(true))
      expect(queries).toHaveLength(1)
      expect(denied).toMatchObject([{ hookSpecificOutput: { permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("binding_missing") } }])
      expect(yield* LogicalTask.read(child.id)).toBeUndefined()
      const missing = yield* Effect.exit(execution.tool(child.id, "unbound-call", "research_view", Effect.void))
      expect(Exit.isFailure(missing)).toBe(true)
      if (Exit.isFailure(missing)) expect(Cause.squash(missing.cause)).toMatchObject({ code: "binding_missing" })
      yield* host.release(child.id)
      return
    }
    expect(queries).toEqual([])
    expect((yield* sessions.get(child.id)).metadata?.claudeCode?.sessionId).toBeUndefined()
    expect(result).toEqual(Exit.succeed(false))
    const prompt = yield* SessionPrompt.Service
    yield* remote.text("Ordinary research provider reply")
    const reply = yield* execution.enter(child.id, "ordinary-dispatch", prompt.loop({ sessionID: child.id }))
    expect(reply.info).toMatchObject({ role: "assistant", agent: "jimmy" })
    expect(reply.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual(["Ordinary research provider reply"])
    expect(yield* remote.calls).toBe(1)
    expect(yield* ClaudeResearchFixture.charges(child.id)).toMatchObject([{ kind: "provider", dispatchCallID: "ordinary-dispatch", amount: 1 }])
    expect(queries).toEqual([])
  }), 30_000)

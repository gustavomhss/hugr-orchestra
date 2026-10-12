import { expect } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "node:path"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostAdmission } from "@/claude-code/host/admission"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
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
    ClaudeResearchFixture.it.instance(`${tool} native jimmy background=${background} HOLDs before child creation or research work`, () => Effect.gen(function* () {
      const fixture = yield* ClaudeResearchFixture.setup()
      const dispatch = yield* fixture.dispatch("native-research-hold", { tool, background })
      expect(dispatch.output).toMatchObject({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
        permissionDecisionReason: expect.stringContaining("NATIVE_RESEARCH_PROVIDER_ADMISSION_UNAVAILABLE") } })
      expect(fixture.join.get(dispatch.callID)).toBeUndefined()
      expect(fixture.join.children()).toEqual([])
      expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
      expect(yield* ClaudeResearchFixture.charges(fixture.parent.id)).toEqual([])
      const part = fixture.mirrored.get(dispatch.callID)
      expect(part?.state).not.toHaveProperty("metadata.sessionId")
      expect(part?.metadata).not.toHaveProperty("sessionId")
      // A retry cannot create a child or upgrade the same unsupported call into admission.
      expect((yield* fixture.dispatch(dispatch.callID, { tool, background })).output).toEqual(dispatch.output)
      expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
      expect(fixture.abort.signal.aborted).toBe(false)
      // The parent remains usable; this HOLD is not a global tool disable.
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

// Only the external SDK boundary is a sentinel. Host admission, LLM transport and allowance services stay real.
const queries: Parameters<ClaudeCodeSDK.Interface["query"]>[0][] = []
const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({ query: (params) => {
  queries.push(params)
  throw new Error("Unexpected native SDK query")
} }))
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ClaudeHost.node, SessionPrompt.node, ResearchExecution.node, ResearchAllowance.node,
  Session.node, SessionProjector.node, Database.node, EventV2Bridge.node, filesystem,
  LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] }),
]), [[ClaudeCodeSDK.node, sdk], [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true, experimentalEventSystem: true })]]))

for (const engine of ["claude-code", "orchestra"] as const)
  it.instance(`direct jimmy ${engine} boundary precedes SDK query; ordinary loop remains available`, () => Effect.gen(function* () {
    queries.length = 0
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
    yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
      projectID: child.projectID, memberID: "jimmy", source: "host" })
    const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
      model: { providerID: "test", modelID: "test-model" } as SessionV1.User["model"], time: { created: Date.now() } })
    yield* sessions.updatePart({ id: PartID.ascending(), messageID: user.id, sessionID: child.id,
      type: "text", text: "Investigate conditions" })
    const result = yield* Effect.exit(host.turn({ sessionID: child.id, user }))
    expect(queries).toEqual([])
    expect(yield* remote.calls).toBe(0)
    expect(yield* ClaudeResearchFixture.charges(child.id)).toEqual([])
    expect((yield* sessions.get(child.id)).metadata?.claudeCode?.sessionId).toBeUndefined()
    if (engine === "claude-code") {
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBeInstanceOf(ClaudeHostAdmission.UnsupportedNativeAdmission)
      expect(String(result)).toContain("NATIVE_JIMMY_ADMISSION_UNSUPPORTED")
      return
    }
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

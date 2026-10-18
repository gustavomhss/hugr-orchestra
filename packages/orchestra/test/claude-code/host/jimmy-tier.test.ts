import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import { TestClock } from "effect/testing"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import { Research } from "@orchestra/schema/research"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostOptions } from "@/claude-code/host/options"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { ResearchExecution } from "@/research/allowance"
import type { SessionID } from "@/session/schema"
import { ClaudeResearchFixture } from "./jimmy-fixture"

const allowance = (fixture: { research: ClaudeHostResearch.Runtime }, child: SessionID) =>
  fixture.research.execute(child, Effect.map(ResearchExecution.Current, (frame) => frame?.allowance))

// JE-AC-E6: the tier is the plugin agent the Agent call names, bound to its tool_use_id; the brief's text is never read.
ClaudeResearchFixture.it.instance("each orchestra:jimmy-<tier> binds that tier's limits and deadline to the dispatch", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  for (const tier of Research.Depth.literals) {
    const dispatch = yield* fixture.nativeDispatch(`toolu_${tier}`, tier)
    const limits = Research.Tiers[tier]
    expect(yield* allowance(fixture, dispatch.child)).toMatchObject({ tier, dispatchCallID: `toolu_${tier}`,
      providerLimit: limits.providerCalls, toolLimit: limits.toolCalls, byteLimit: limits.capturedBytes,
      deadlineSeconds: limits.deadlineSeconds })
  }
  // An effort line in the brief is plain text: a quick dispatch stays quick.
  const brief = yield* fixture.nativeDispatch("toolu_brief", "quick", "effort: deep\nFind the applicability conditions.")
  expect(yield* allowance(fixture, brief.child)).toMatchObject({ tier: "quick", providerLimit: 24 })
}), 30_000)

ClaudeResearchFixture.it.instance("an untiered jimmy, an unknown tier or a tier on another seat is refused before any child exists", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  for (const [callID, subagentType, reason] of [
    ["toolu_untiered", "orchestra:jimmy", "orchestra:jimmy-focused"],
    ["toolu_unknown", "orchestra:jimmy-max", "not an Orchestra seat"],
    ["toolu_other", "orchestra:backend-deep", "not an Orchestra seat"],
  ] as const) {
    const refused = yield* fixture.dispatch(callID, { subagentType })
    expect(refused.output).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining(reason) } })
    expect(fixture.join.child(callID)).toBeUndefined()
  }
  expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
}), 30_000)

ClaudeResearchFixture.it.instance("the plugin defines one jimmy agent per tier with that tier's maxTurns, and Maestro is told the names", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const input = { seats: [fixture.seat], tools: { jimmy: fixture.tools.map((tool) => tool.id) }, root: path.join(fixture.parent.directory, "plugin") }
  const plugin = yield* Effect.promise(() => ClaudeHostPlugin.build(input))
  expect(plugin.seats).toEqual({ "orchestra:jimmy-quick": "jimmy", "orchestra:jimmy-focused": "jimmy", "orchestra:jimmy-deep": "jimmy" })
  for (const tier of Research.Depth.literals) {
    const text = yield* Effect.promise(() => Bun.file(path.join(plugin.path, `agents/jimmy-${tier}.md`)).text())
    expect(text).toMatch(new RegExp(`^---\\nname: jimmy-${tier}\\n[^]*\\nmaxTurns: ${Research.Tiers[tier].providerCalls}\\n---\\n`))
    expect(text).not.toContain("WebFetch")
  }
  expect(yield* Effect.promise(() => Bun.file(path.join(plugin.path, "agents/jimmy.md")).exists())).toBe(false)
  const sdk = yield* Effect.promise(() => ClaudeHostPlugin.build({ ...input, sdk: { jimmy: {} } }))
  expect(Object.fromEntries(Object.entries(sdk.sdkAgents).map(([name, agent]) => [name, agent.maxTurns])))
    .toEqual({ "orchestra:jimmy-quick": 24, "orchestra:jimmy-focused": 48, "orchestra:jimmy-deep": 96 })
  const append = ClaudeHostOptions.append("maestro", plugin.seats)
  expect(append).toContain("`orchestra:jimmy-quick` for one narrow lookup")
  expect(append).toContain("`orchestra:jimmy-focused`")
  expect(append).toContain("`orchestra:jimmy-deep` for a broad or high-stakes investigation")
  expect(append).not.toMatch(/effort:/)
}), 30_000)

ClaudeResearchFixture.it.instance("the dispatched seat cannot raise its bound tier", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const raised = yield* Effect.exit(fixture.research.enter(dispatch.child, dispatch.callID, "deep"))
  expect(Exit.isFailure(raised) && Cause.squash(raised.cause)).toMatchObject({ code: "binding_mismatch" })
  expect(yield* dispatch.pre("Agent", "toolu_escalate", { subagent_type: "orchestra:jimmy-deep", description: "Deeper",
    prompt: "Keep researching." })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* allowance(fixture, dispatch.child)).toMatchObject({ tier: "quick", providerLimit: 24, deadlineSeconds: 600 })
}), 30_000)

ClaudeResearchFixture.it.instance("a focused dispatch exhausts provider turns at 48, not at the quick 24", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch("toolu_focused", "focused")
  const frame = (id: string): SDKAssistantMessage => ({ type: "assistant", parent_tool_use_id: dispatch.callID,
    session_id: ClaudeResearchFixture.base.session_id, uuid: crypto.randomUUID(), message: { id, type: "message",
      role: "assistant", model: "claude-test", content: [{ type: "text", text: "Researching", citations: null }],
      container: null, context_management: null, stop_reason: "end_turn", stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation: null, cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0, server_tool_use: null, service_tier: null } } })
  yield* Effect.forEach(Array.from({ length: 47 }, (_, index) => index), (index) =>
    fixture.research.observe(fixture.join, frame(`turn-${index}`)))
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "below-cap", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  yield* fixture.research.observe(fixture.join, frame("turn-47"))
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "at-cap", { action: "corpus" }))
    .toMatchObject({ continue: false, stopReason: expect.stringContaining("provider allowance exhausted (48/48)") })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(48)
}), 30_000)

ClaudeResearchFixture.it.instance("the native deadline follows the bound tier: a focused dispatch closes at 1200 seconds", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch("toolu_focused_deadline", "focused")
  yield* TestClock.adjust("1199 seconds")
  expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
  expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: false, deadlineActive: true })
  yield* TestClock.adjust("1 second")
  expect(yield* fixture.research.stopReason(dispatch.child)).toContain("deadline exhausted (1200 seconds)")
  expect(fixture.research.signal(dispatch.child)?.aborted).toBe(true)
}).pipe(Effect.provide(TestClock.layer())), 30_000)

// J1.9: a task grant binds web domains to one dispatch; its WebSearch runs with exactly those domains.
ClaudeResearchFixture.it.instance("a granted dispatch's WebSearch runs with the granted domains; an ungranted one is unchanged", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const grantID = "grt_webdomains"
  ClaudeHostMcp.grants(fixture.parent.id).set(grantID, { grantID, sessionID: fixture.parent.id, seat: "jimmy", writePaths: [],
    writeRoots: [], purpose: "Docs only", allowedDomains: ["bun.sh"], time: Date.now() })
  const granted = yield* fixture.nativeDispatch("toolu_granted", "quick", `Find the runtime docs.\ngrantID: ${grantID}`)
  expect(ClaudeHostMcp.grants(fixture.parent.id).has(grantID)).toBe(false)
  expect(yield* granted.pre("WebSearch", "granted-search", { query: "bun runtime", allowed_domains: ["example.com"] }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow",
      updatedInput: { query: "bun runtime", allowed_domains: ["bun.sh"] } } })
  const open = yield* fixture.nativeDispatch("toolu_open")
  const search = yield* open.pre("WebSearch", "open-search", { query: "bun runtime" })
  expect(search).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(search).not.toHaveProperty("hookSpecificOutput.updatedInput.allowed_domains")
}), 30_000)

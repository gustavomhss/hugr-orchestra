import { expect } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { TestClock } from "effect/testing"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import { Research } from "@orchestra/schema/research"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { ResearchExecution } from "@/research/allowance"
import type { SessionID } from "@/session/schema"
import { ClaudeResearchFixture } from "./jimmy-fixture"

const allowance = (fixture: { research: ClaudeHostResearch.Runtime }, child: SessionID) =>
  fixture.research.execute(child, Effect.map(ResearchExecution.Current, (frame) => frame?.allowance))

ClaudeResearchFixture.it.instance("the brief's effort line binds each tier's limits and deadline; no line binds quick", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const absent = yield* fixture.nativeDispatch("toolu_absent")
  expect(yield* allowance(fixture, absent.child)).toMatchObject({ tier: "quick", providerLimit: 24, toolLimit: 64,
    byteLimit: 64 * 1024 * 1024, deadlineSeconds: 600 })
  for (const tier of ["quick", "focused", "deep"] as const) {
    const dispatch = yield* fixture.nativeDispatch(`toolu_${tier}`, `effort: ${tier}\nFind the applicability conditions.`)
    const limits = Research.Tiers[tier]
    expect(yield* allowance(fixture, dispatch.child)).toMatchObject({ tier, providerLimit: limits.providerCalls,
      toolLimit: limits.toolCalls, byteLimit: limits.capturedBytes, deadlineSeconds: limits.deadlineSeconds })
  }
  expect([ClaudeHostResearch.effort("Effort: deep\r\nbrief"), ClaudeHostResearch.effort("brief\neffort: deep"),
    ClaudeHostResearch.effort(undefined), ClaudeHostResearch.effort("effort: Deep"), ClaudeHostResearch.effort("effort:")])
    .toEqual(["deep", "quick", "quick", undefined, undefined])
}), 30_000)

ClaudeResearchFixture.it.instance("an unknown effort line is refused before any child or allowance exists", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const refused = yield* fixture.dispatch("toolu_invalid", { prompt: "effort: max\nFind the applicability conditions." })
  expect(refused.output).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("unknown effort line") } })
  expect(fixture.join.child("toolu_invalid")).toBeUndefined()
  expect(yield* fixture.sessions.children(fixture.parent.id)).toEqual([])
}), 30_000)

ClaudeResearchFixture.it.instance("the dispatched seat cannot raise its bound tier", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const raised = yield* Effect.exit(fixture.research.enter(dispatch.child, dispatch.callID, "deep"))
  expect(Exit.isFailure(raised) && Cause.squash(raised.cause)).toMatchObject({ code: "binding_mismatch" })
  expect(yield* dispatch.pre("Agent", "toolu_escalate", { subagent_type: "orchestra:jimmy", description: "Deeper",
    prompt: "effort: deep\nKeep researching." })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* allowance(fixture, dispatch.child)).toMatchObject({ tier: "quick", providerLimit: 24, deadlineSeconds: 600 })
}), 30_000)

ClaudeResearchFixture.it.instance("a focused dispatch exhausts provider turns at 48, not at the quick 24", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch("toolu_focused", "effort: focused\nFind the applicability conditions.")
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
  const dispatch = yield* fixture.nativeDispatch("toolu_focused_deadline", "effort: focused\nFind the applicability conditions.")
  yield* TestClock.adjust("1199 seconds")
  expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
  expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: false, deadlineActive: true })
  yield* TestClock.adjust("1 second")
  expect(yield* fixture.research.stopReason(dispatch.child)).toContain("deadline exhausted (1200 seconds)")
  expect(fixture.research.signal(dispatch.child)?.aborted).toBe(true)
}).pipe(Effect.provide(TestClock.layer())), 30_000)

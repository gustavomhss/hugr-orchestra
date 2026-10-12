import { expect } from "bun:test"
import { Cause, Effect, Exit, Schema } from "effect"
import type { SDKAssistantMessage } from "@anthropic-ai/claude-agent-sdk"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ClaudeResearchFixture } from "./jimmy-fixture"

ClaudeResearchFixture.it.instance("Agent dispatch admits the native binding; PreToolUse denies built-ins and non-granted tools", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch()
  expect(dispatch.output).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* LogicalTask.read(dispatch.child)).toMatchObject({ memberID: "jimmy", authoritySessionID: fixture.parent.id,
    executionSessionID: dispatch.child })
  const binding = yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)
  expect(binding.memberID).toBe("jimmy")
  for (const name of ["Bash", "Write", "Edit", "Read", "Grep", "WebFetch", "Agent", "mcp__orchestra__process", "mcp__orchestra__edit"])
    expect(yield* dispatch.pre(name, `denied-${name}`)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* dispatch.pre("Skill", "wrong-skill", { skill: "orchestra:backend-implement" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toEqual([])
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "admitted-view", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toMatchObject([{ kind: "tool", dispatchCallID: dispatch.callID, amount: 1 }])
}), 30_000)

ClaudeResearchFixture.it.instance("PreToolUse charges 64 calls, registry execution deduplicates them, and exhaustion retains captured bytes", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch()
  const text = "Only release 1 under enabled mode."
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "conditions.txt"), text))
  expect(yield* dispatch.pre("mcp__orchestra__research_capture", "capture", { kind: "file", path: "conditions.txt" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const captured = yield* dispatch.run("research_capture", { kind: "file", path: "conditions.txt" }, "capture")
  const receipt = Schema.decodeUnknownSync(Research.SourceReceipt)(captured.metadata.researchSource)
  const charged = yield* ClaudeResearchFixture.charges(dispatch.child)
  expect(charged.filter((entry) => entry.kind === "tool")).toHaveLength(1)
  expect(charged.filter((entry) => entry.kind === "bytes").reduce((sum, entry) => sum + entry.amount, 0)).toBeGreaterThanOrEqual(Buffer.byteLength(text))
  for (const index of Array.from({ length: 63 }, (_, index) => index))
    expect(yield* dispatch.pre("mcp__orchestra__research_view", `view-${index}`, { action: "corpus" }))
      .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const denied = yield* dispatch.pre("mcp__orchestra__research_view", "view-over-cap", { action: "corpus" })
  expect(denied).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("budget_exhausted") } })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "tool")).toHaveLength(64)
  yield* fixture.research.observe(fixture.join, { type: "assistant", parent_tool_use_id: dispatch.callID,
    session_id: "native-host", uuid: crypto.randomUUID(), message: { id: "final-after-tool-exhaustion", role: "assistant", model: "claude-test", content: [{ type: "text", text: "Finished" }] } } as SDKAssistantMessage)
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(1)
  const records = yield* ResearchRecords.Service
  expect(yield* records.view(receipt.binding, { action: "source", ref: receipt.ref })).toMatchObject({ text })
  const second = yield* fixture.dispatch("toolu_second")
  expect(yield* second.pre("mcp__orchestra__research_view", "fresh", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
}), 30_000)

ClaudeResearchFixture.it.instance("capture bytes reserve against 64 MiB before retention and fail with the named budget error", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch()
  const execution = yield* ResearchExecution.Service
  yield* fixture.research.execute(dispatch.child, execution.captureBytes(dispatch.child, "prior-captures", Research.Limits.capturedBytes - 1, Effect.void))
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "over-cap.txt"), "over byte budget"))
  yield* dispatch.pre("mcp__orchestra__research_capture", "over-cap", { kind: "file", path: "over-cap.txt" })
  const exit = yield* Effect.exit(dispatch.run("research_capture", { kind: "file", path: "over-cap.txt" }, "over-cap"))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ code: "budget_exhausted" })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "bytes")
    .reduce((total, entry) => total + entry.amount, 0)).toBe(Research.Limits.capturedBytes - 1)
  const records = yield* ResearchRecords.Service
  const binding = yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)
  expect(yield* records.view(binding, { action: "corpus" })).toMatchObject({ sources: [] })
}), 30_000)

ClaudeResearchFixture.it.instance("unique subagent response IDs charge 24 provider units; repeated blocks and parent turns do not", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch()
  const frame = (id: string, parent = dispatch.callID) => ({ type: "assistant", parent_tool_use_id: parent,
    session_id: "native-host", uuid: crypto.randomUUID(), message: { id, role: "assistant", model: "claude-test",
      content: [{ type: "text", text: "Researching" }] } }) as SDKAssistantMessage
  yield* fixture.research.observe(fixture.join, frame("parent-turn", "unrelated"))
  yield* fixture.research.observe(fixture.join, frame("turn-0"))
  yield* fixture.research.observe(fixture.join, frame("turn-0"))
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(1)
  for (const index of Array.from({ length: 23 }, (_, index) => index + 1)) yield* fixture.research.observe(fixture.join, frame(`turn-${index}`))
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "provider-held", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "deny", permissionDecisionReason: expect.stringContaining("budget_exhausted") } })
  yield* fixture.research.observe(fixture.join, frame("final-text"))
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "provider")).toHaveLength(24)
}), 30_000)

ClaudeResearchFixture.it.instance("Agent settlement preserves the final card and gives the parent exact retained finding qualifications", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.dispatch()
  const finding = { action: "finding", proposition: "Support is conditional", nature: "hypothesis",
    conditions: ["release 1 only", "enabled mode only"], evidence: [], contrary: [], reason: "No runtime observation" } as const
  yield* dispatch.pre("mcp__orchestra__research_record", "finding", finding)
  const recorded = yield* dispatch.run("research_record", finding, "finding")
  const result = Schema.decodeUnknownSync(Schema.Struct({ record: Research.FindingRecord }))(recorded.metadata.research)
  const card: Research.Card = { answer: "Support is conditional.", profile: "understand", depth: "quick", sufficiency: "partial",
    findingRefs: [{ id: result.record.id, revision: result.record.revision }], evidenceRefs: [], documentRefs: [],
    coverage: { examined: [], excluded: ["runtime"], failures: [] }, limitations: ["No runtime observation"], nextActions: [] }
  const final = `Support is conditional.\n\n\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`
  const output = yield* fixture.fire({ ...ClaudeResearchFixture.base, hook_event_name: "PostToolUse", tool_name: "Agent",
    tool_use_id: dispatch.callID, tool_input: {}, tool_response: { status: "completed", agentId: `native-${dispatch.callID}`,
      content: [{ type: "text", text: final }] } })
  expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: expect.stringContaining("Retained finding qualifications") } })
  const part = fixture.mirrored.get(dispatch.callID)
  if (part?.state.status !== "completed") throw new Error("Expected settled Agent part")
  expect(part.state.metadata.workResult).toMatchObject({ referencesChecked: true, discovery: card,
    qualifications: { records: [result.record], complete: true, omitted: 0, total: 1 } })
  expect(part.state.output).toContain(JSON.stringify(result.record.conditions))
  expect(part.state.output).toEndWith(final)
  const author = (yield* fixture.sessions.messages({ sessionID: dispatch.child })).findLast((message) => message.info.role === "assistant")
  expect(author?.parts.flatMap((part) => part.type === "text" ? [part.text] : [])).toEqual([final])
}), 30_000)

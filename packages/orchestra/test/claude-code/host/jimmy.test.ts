import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { TestClock } from "effect/testing"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchExecution } from "@/research/allowance"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import type { Tool } from "@/tool/tool"
import { BridgeFixture } from "./bridge-fixture"
import { ClaudeResearchFixture } from "./jimmy-fixture"

// Exported services only. Native Jimmy dispatch is unsupported; these calls do not pass through Agent hooks.
ClaudeResearchFixture.it.instance("service tool debits deduplicate registry execution, stop at 64, and preserve captured bytes", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.serviceDispatch()
  const text = "Only release 1 under enabled mode."
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "conditions.txt"), text))
  yield* fixture.research.tool(dispatch.child, "capture", "mcp__orchestra__research_capture")
  const captured = yield* dispatch.run("research_capture", { kind: "file", path: "conditions.txt" }, "capture")
  const receipt = Schema.decodeUnknownSync(Research.SourceReceipt)(captured.metadata.researchSource)
  const charged = yield* ClaudeResearchFixture.charges(dispatch.child)
  expect(charged.filter((entry) => entry.kind === "tool")).toHaveLength(1)
  expect(charged.filter((entry) => entry.kind === "bytes").reduce((sum, entry) => sum + entry.amount, 0))
    .toBeGreaterThanOrEqual(Buffer.byteLength(text))
  yield* Effect.forEach(Array.from({ length: 63 }, (_, index) => index), (index) =>
    fixture.research.tool(dispatch.child, `view-${index}`, "mcp__orchestra__research_view"))
  const refused = yield* Effect.exit(dispatch.run("research_view", { action: "corpus" }, "view-over-cap"))
  expect(Exit.isFailure(refused)).toBe(true)
  if (Exit.isFailure(refused)) expect(Cause.squash(refused.cause)).toMatchObject({ code: "budget_exhausted" })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "tool")).toHaveLength(64)
  const records = yield* ResearchRecords.Service
  expect(yield* records.view(receipt.binding, { action: "source", ref: receipt.ref })).toMatchObject({ text })
  const second = yield* fixture.serviceDispatch("second-service-dispatch")
  yield* second.run("research_view", { action: "corpus" }, "fresh")
  expect(yield* ClaudeResearchFixture.charges(second.child)).toMatchObject([{ kind: "tool", amount: 1 }])
}), 30_000)

ClaudeResearchFixture.it.instance("service byte reservation refuses retention beyond 64 MiB with the named budget error", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.serviceDispatch()
  const execution = yield* ResearchExecution.Service
  yield* fixture.research.execute(dispatch.child,
    execution.captureBytes(dispatch.child, "prior-captures", Research.Limits.capturedBytes - 1, Effect.void))
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "over-cap.txt"), "over byte budget"))
  const exit = yield* Effect.exit(dispatch.run("research_capture", { kind: "file", path: "over-cap.txt" }, "over-cap"))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toMatchObject({ code: "budget_exhausted" })
  expect((yield* ClaudeResearchFixture.charges(dispatch.child)).filter((entry) => entry.kind === "bytes")
    .reduce((total, entry) => total + entry.amount, 0)).toBe(Research.Limits.capturedBytes - 1)
  const records = yield* ResearchRecords.Service
  const binding = yield* ResearchBinding.resolve(dispatch.child, fixture.parent.projectID)
  expect(yield* records.view(binding, { action: "corpus" })).toMatchObject({ sources: [] })
}), 30_000)

ClaudeResearchFixture.it.instance("plugin and SDK maxTurns match the service allowance, without proving native pre-provider admission", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.serviceDispatch()
  const limit = yield* fixture.research.execute(dispatch.child,
    Effect.map(ResearchExecution.Current, (frame) => frame?.allowance.providerLimit))
  expect(limit).toBe(24)
  const input = { seats: [fixture.seat], tools: { jimmy: fixture.tools.map((tool) => tool.id) }, root: path.join(fixture.parent.directory, "plugin") }
  const plugin = yield* Effect.promise(() => ClaudeHostPlugin.build(input))
  expect(yield* Effect.promise(() => Bun.file(path.join(plugin.path, "agents/jimmy.md")).text()))
    .toMatch(/^---\n[^]*\nmaxTurns: 24\n---\n/)
  const sdk = yield* Effect.promise(() => ClaudeHostPlugin.build({ ...input, sdk: { jimmy: {} } }))
  expect(limit).toBe(sdk.sdkAgents["orchestra:jimmy"].maxTurns)
  expect(yield* ClaudeResearchFixture.charges(dispatch.child)).toEqual([])
}), 30_000)

ClaudeResearchFixture.it.instance("service timer aborts outstanding MCP execution at 600 seconds without stopping parent or sibling", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.serviceDispatch()
  const transport = yield* BridgeFixture.make(fixture.parent.id, fixture.research)
  const entered = yield* Deferred.make<AbortSignal>()
  const closed = yield* Deferred.make<void>()
  const pending: Tool.Def = { id: "research_view", description: "Held research service call", parameters: Schema.Struct({}),
    execute: (_args, context) => Deferred.succeed(entered, context.abort).pipe(Effect.andThen(Effect.never),
      Effect.ensuring(Deferred.succeed(closed, undefined))) }
  yield* fixture.research.tool(dispatch.child, "held-call", "mcp__orchestra__research_view")
  const part = yield* transport.call({ id: "held-call", tool: "research_view", args: {}, sessionID: dispatch.child, seat: "jimmy" })
  yield* transport.bridge.claim("research_view", transport.arguments("held-call"), new AbortController().signal)
  const context = yield* transport.bridge.context(part)
  const running = yield* transport.bridge.execute(pending, {}, context).pipe(Effect.exit, Effect.forkScoped)
  const signal = yield* Deferred.await(entered)
  yield* TestClock.adjust("599 seconds")
  expect(signal.aborted).toBe(false)
  expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
  const other = yield* fixture.serviceDispatch("other-service-dispatch")
  yield* fixture.research.enter(dispatch.child, dispatch.callID)
  yield* TestClock.adjust("1 second")
  expect(signal.aborted).toBe(true)
  expect(fixture.abort.signal.aborted).toBe(false)
  expect(transport.ctx.abort.signal.aborted).toBe(false)
  yield* Deferred.await(closed)
  expect(Exit.isFailure(yield* Fiber.join(running))).toBe(true)
  expect(yield* fixture.research.stopReason(dispatch.child)).toContain("deadline")
  const late = yield* Effect.exit(fixture.research.tool(dispatch.child, "late-call", "mcp__orchestra__research_view"))
  expect(Exit.isFailure(late)).toBe(true)
  if (Exit.isFailure(late)) expect(Cause.squash(late.cause)).toMatchObject({
    _tag: "ClaudeHostResearch.TerminalClosed", message: expect.stringContaining("RESEARCH_TERMINAL_CLOSED"),
  })
  yield* other.run("research_view", { action: "corpus" }, "other-call")
  expect(fixture.research.signal(other.child)?.aborted).toBe(false)
  // This service/MCP test has no native provider task to stop and makes no such claim.
}).pipe(Effect.provide(TestClock.layer())), 30_000)

for (const outcome of ["settle", "close"] as const)
  ClaudeResearchFixture.it.instance(`service ${outcome} closes admission and aborts its signal without native provider execution`, () => Effect.gen(function* () {
    const fixture = yield* ClaudeResearchFixture.setup()
    const dispatch = yield* fixture.serviceDispatch()
    expect(fixture.research.signal(dispatch.child)).toBeInstanceOf(AbortSignal)
    yield* TestClock.adjust("599 seconds")
    if (outcome === "settle") yield* fixture.research.settle(dispatch.child)
    if (outcome === "close") yield* fixture.research.close
    yield* TestClock.adjust("601 seconds")
    expect(yield* fixture.research.stopReason(dispatch.child)).toBeUndefined()
    expect(fixture.research.signal(dispatch.child)?.aborted).toBe(true)
    expect(yield* fixture.research.status(dispatch.child)).toMatchObject({ closed: true, deadlineActive: false })
    const late = yield* Effect.exit(fixture.research.tool(dispatch.child, "after-terminal", "research_view"))
    expect(Exit.isFailure(late)).toBe(true)
    if (Exit.isFailure(late)) expect(Cause.squash(late.cause)).toMatchObject({ _tag: "ClaudeHostResearch.TerminalClosed" })
  }).pipe(Effect.provide(TestClock.layer())), 30_000)

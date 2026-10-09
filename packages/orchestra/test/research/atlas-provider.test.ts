import { expect } from "bun:test"
import path from "node:path"
import { Effect, Exit, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { NativeResearchTask } from "./fixtures/native-task"
import { testEffect } from "../lib/effect"

const it = testEffect(NativeResearchTask.layer)

it.instance("real provider turns isolate own Atlas header and retire rules on mid-session outage and member switch", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  const events = yield* EventV2.Service
  const rules = { backend: "Backend checks its own execution boundary", jimmy: "Discovery checks source version before inference" }
  yield* Effect.forEach(["backend", "jimmy"] as const, (member) => Effect.gen(function* () {
    const memory = yield* AtlasMemory.open({ sessionID: fixture.parent.id, callID: `seed-${member}`, assistantMessageID: fixture.assistant.id }, { id: member, native: true })
    if ("unavailable" in memory) throw new Error(memory.unavailable)
    const rule = memory.write({ rule: rules[member], scope: "source" })
    const task = memory.write({ taskId: "header-excluded-task", attempted: ["HEADER_TASK_MUST_NOT_LOAD"], failedWith: [], stoppedAt: "Header exclusion control", lesson: "Task history is not a running header" })
    const pr = memory.write({ prId: "header-excluded-pr", decisions: ["HEADER_PR_MUST_NOT_LOAD"], reviewOutcomes: [], knowledgeDelta: [] })
    if (!rule.ok || !task.ok || !pr.ok) throw new Error("Real Atlas scanner/provider did not admit harmless header controls")
  }), { discard: true })
  const backendCard = { outcome: "done", changes: [], checks: [], blockers: [], risks: [], nextActions: [] }
  yield* fixture.remote.text(`\u0060\u0060\u0060backend-result\n${JSON.stringify(backendCard)}\n\u0060\u0060\u0060`)
  const backend = yield* fixture.call({ description: "Observe backend header", prompt: "Return bounded header observation", subagent_type: "backend" }, "backend-fresh")
  if (Exit.isFailure(backend.exit)) return yield* Effect.failCause(backend.exit.cause)
  yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "conditions.txt"), "Only version 1 is supported.\n")
  const state: { source?: Research.SourceReceipt } = {}
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type !== ResearchEvent.SourceAdmitted.type) return
    const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
    if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
    state.source = admitted.receipt
    // Turn two must reacquire current header authority rather than reuse the previously loaded Rules.
    const log = path.join(fixture.instance.directory, ".atlas/memory.jsonl")
    yield* fixture.fs.remove(log)
    yield* fixture.fs.makeDirectory(log)
    const card: Research.Card = { answer: "Only version 1; Atlas is unavailable.", profile: "understand", depth: "quick", sufficiency: "partial",
      findingRefs: [], evidenceRefs: [{ source: admitted.receipt.ref, locator: { kind: "quote", exact: "Only version 1 is supported." } }], documentRefs: [],
      coverage: { examined: ["conditions.txt"], excluded: ["Atlas"], failures: ["Atlas unavailable"] }, limitations: ["Current Atlas rules could not be loaded"], nextActions: [] }
    yield* fixture.remote.text(`\u0060\u0060\u0060jimmy-result\n${JSON.stringify(card)}\n\u0060\u0060\u0060`)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.tool("read", { filePath: "conditions.txt" })
  const discovery = yield* fixture.call({ description: "Observe discovery outage", prompt: "Read conditions.txt; report scope and Atlas availability", subagent_type: "jimmy" }, "jimmy-outage")
  if (Exit.isFailure(discovery.exit)) return yield* Effect.failCause(discovery.exit.cause)
  expect(state.source).toBeDefined()
  yield* fixture.remote.text(`\u0060\u0060\u0060backend-result\n${JSON.stringify(backendCard)}\n\u0060\u0060\u0060`)
  const switched = yield* fixture.call({ description: "Observe backend cold outage", prompt: "Report unavailable current Atlas", subagent_type: "backend" }, "backend-unavailable")
  if (Exit.isFailure(switched.exit)) return yield* Effect.failCause(switched.exit.cause)
  const requests = yield* fixture.remote.inputs
  expect(requests).toHaveLength(4)
  const headers = requests.map((request) => {
    const decoded = Schema.decodeUnknownSync(Schema.Struct({ messages: Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.Unknown })) }))(request)
    const system = decoded.messages.filter((message) => message.role === "system" || message.role === "developer")
    if (!system.length) throw new Error("Provider request has no current system instructions")
    const text = system.map((message) => Schema.decodeUnknownSync(Schema.String)(message.content)).join("\n")
    const header = /<atlas-header\b[^>]*>[\s\S]*?<\/atlas-header>/.exec(text)?.[0]
    if (!header) throw new Error("Actual provider request omitted native Atlas header")
    return header
  })
  expect(headers[0]).toContain('member="backend"')
  expect(headers[0]).toContain(rules.backend)
  expect(headers[0]).not.toContain(rules.jimmy)
  expect(headers[1]).toContain('member="jimmy"')
  expect(headers[1]).toContain(rules.jimmy)
  expect(headers[1]).not.toContain(rules.backend)
  headers.slice(0, 2).forEach((header) => {
    expect(header).toContain("Awareness:")
    expect(header).toContain("Orientation:")
    expect(header).not.toContain("HEADER_TASK_MUST_NOT_LOAD")
    expect(header).not.toContain("HEADER_PR_MUST_NOT_LOAD")
  })
  expect(headers[2]).toContain('member="jimmy" degraded="unavailable"')
  expect(headers[3]).toContain('member="backend" degraded="unavailable"')
  headers.slice(2).forEach((header) => {
    expect(header).not.toContain(rules.backend)
    expect(header).not.toContain(rules.jimmy)
    expect(header).toContain("no project rules are loaded")
  })
  expect(yield* fixture.remote.pending).toBe(0)
}), { git: true }, 120_000)

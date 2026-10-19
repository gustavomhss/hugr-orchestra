import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { EventV2 } from "@orchestra/core/event"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { BackgroundJob } from "@/background/job"
import { NativeResearchTask } from "./fixtures/native-task"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { reply } from "../lib/llm-server"

const it = testEffect(NativeResearchTask.layer)
const result = Schema.Struct({ schema: Schema.Literal("discovery-work-result-v1"),
  referencesChecked: Schema.Boolean, card: Schema.Struct({ parsed: Schema.Boolean }),
  terminal: Schema.Struct({ reason: Schema.String }), outcome: Schema.optional(Schema.String), documents: Schema.optional(Schema.Array(Research.DocumentReceipt)),
  corpus: Schema.optional(Research.Corpus), discovery: Schema.optional(Research.CardV2) })

// Actual native dispatch/provider/store behavior; scripted responses earn no research-quality credit.
it.instance("background native Task is running before worker facts and delivers admitted documents to parent after completion", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    yield* fixture.prompt.cancel(fixture.parent.id)
    yield* Effect.forEach(yield* fixture.sessions.children(fixture.parent.id), (child) => fixture.prompt.cancel(child.id))
    yield* fixture.sessions.remove(fixture.parent.id)
  }).pipe(Effect.orDie))
  const events = yield* EventV2.Service
  const jobs = yield* BackgroundJob.Service
  const artifacts = yield* ResearchArtifacts.Service
  const records = yield* ResearchRecords.Service
  const release = Promise.withResolvers<void>()
  yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
  const state: { source?: Research.SourceReceipt; document?: Research.DocumentReceipt } = {}
  const body = "Only version 1 is applicable. Disabled operation rejects the request [source](research:condition)."
  yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "conditions.txt"), "Only version 1.\nDisabled operation rejects the request.\n")
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
      if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
      state.source = admitted.receipt
      yield* fixture.remote.tool("research_record", { action: "document", document: {
        title: "Background qualified answer", genre: "answer", body, findingRefs: [],
        citations: { condition: { source: admitted.receipt.ref, locator: { kind: "quote", exact: "Disabled operation rejects the request." } } },
      } })
      return
    }
    if (event.type === ResearchEvent.DocumentPublished.type) {
      const admitted = Schema.decodeUnknownSync(ResearchEvent.DocumentPublished.data)(event.data)
      if (admitted.binding.authoritySessionID !== fixture.parent.id || !state.source || state.document) return
      state.document = admitted.receipt
      yield* fixture.remote.tool("inquiry", { action: "open", question: "Which conditions apply?",
        subquestions: ["What does disabled operation do"], profile: "understand" })
      return
    }
    if (event.type === ResearchEvent.InquiryOpened.type) {
      const opened = Schema.decodeUnknownSync(ResearchEvent.InquiryOpened.data)(event.data)
      if (opened.binding.authoritySessionID !== fixture.parent.id || !state.source) return
      yield* fixture.remote.tool("inquiry", { action: "claim", subquestion: opened.subquestions[0], proposition: "Disabled operation rejects the request",
        nature: "extraction", evidence: [{ source: state.source.ref, quote: "Disabled operation rejects the request." }] })
      yield* fixture.remote.tool("inquiry", { action: "check" })
      yield* fixture.remote.tool("inquiry", { action: "close", sufficiency: "answered", answer: "Version 1 applies; disabled operation rejects requests.",
        limitations: ["Static source only"] })
      yield* fixture.remote.text("Background research closed.")
      yield* fixture.remote.text("Parent received completed background research.")
    }
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.push(reply().tool("read", { filePath: "conditions.txt" }).wait(release.promise))
  const called = yield* fixture.call({ description: "Background conditional discovery", prompt: "Retain conditional evidence and publish answer", subagent_type: "jimmy", background: true }, "background-discovery")
  if (Exit.isFailure(called.exit)) return yield* Effect.failCause(called.exit.cause)
  const running = Schema.decodeUnknownSync(result)(called.exit.value.metadata.workResult)
  expect(running).toMatchObject({ terminal: { reason: "running" }, card: { parsed: false }, referencesChecked: false })
  expect(running.discovery).toBeUndefined()
  expect(running.documents).toBeUndefined()
  const child = Schema.decodeUnknownSync(Schema.Struct({ sessionId: Schema.String }))(called.exit.value.metadata).sessionId
  // The SSE stream has reached the real provider, but its tool payload cannot pass the held tail.
  yield* fixture.remote.wait(1).pipe(Effect.timeout("30 seconds"))
  expect((yield* jobs.get(child))?.status).toBe("running")
  expect(state).toEqual({})
  expect(yield* fixture.remote.calls).toBe(1)
  release.resolve()
  // The return is delivered durably to the parent; read the persisted part rather than a streamed update.
  const delivered = yield* pollWithTimeout(fixture.sessions.messages({ sessionID: fixture.parent.id }).pipe(
    Effect.map((history) => history.flatMap((message) => message.parts).find((part) => part.type === "text" &&
      part.metadata?.source?.type === "task-return")),
  ), "Background Task did not deliver its work result", "30 seconds")
  const completed = Schema.decodeUnknownSync(result)(delivered.type === "text" ? delivered.metadata?.workResult : undefined)
  if (!state.document || !state.source) throw new Error("Native background worker omitted admitted source/document")
  expect(completed).toMatchObject({ terminal: { reason: "ended" }, card: { parsed: true }, referencesChecked: true, outcome: "done" })
  expect(completed.discovery).toMatchObject({ schema: "jimmy-card-v2", sufficiency: "answered", limitations: ["Static source only"], check: { verdict: "pass" },
    documentRefs: [state.document.ref],
    claims: [{ evidence: [{ source: state.source.ref, locator: { kind: "quote", exact: "Disabled operation rejects the request." } }] }] })
  expect(completed.documents).toEqual([state.document])
  expect(completed.corpus?.sources).toContainEqual(state.source)
  expect(completed.corpus?.documents).toEqual([state.document])
  expect(state.source.binding).toMatchObject({ authoritySessionID: fixture.parent.id, executionSessionID: child, memberID: "jimmy" })
  expect(state.document.binding).toEqual(state.source.binding)
  expect(yield* artifacts.read(state.source.binding, state.source.ref.artifact)).toMatchObject({
    receipt: state.source, text: "Only version 1.\nDisabled operation rejects the request.", complete: true,
  })
  expect(yield* records.view(state.document.binding, { action: "document", ref: state.document.ref })).toMatchObject({
    ref: state.document.artifact, receipt: state.document, representation: "markdown", text: body, complete: true,
  })
  expect((yield* jobs.wait({ id: child, timeout: 30_000 })).info?.status).toBe("completed")
  // Notice persistence precedes the parent provider request; wait for its completed answer too.
  yield* pollWithTimeout(Effect.gen(function* () {
    const history = yield* fixture.sessions.messages({ sessionID: fixture.parent.id })
    return history.find((message) => message.info.role === "assistant" && message.info.time.completed !== undefined &&
      message.parts.some((part) => part.type === "text" && part.text === "Parent received completed background research."))
  }), "Native task-return did not complete the parent provider turn", "30 seconds")
  yield* fixture.prompt.cancel(fixture.parent.id)
  const history = yield* fixture.sessions.messages({ sessionID: fixture.parent.id })
  const published = history.flatMap((message) => message.parts).filter((part) => part.type === "text" && part.metadata?.source?.type === "task-return")
  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({ metadata: { source: { task_id: child, state: "completed" } } })
  expect(published[0]?.type === "text" && Schema.decodeUnknownSync(result)(published[0].metadata?.workResult)).toEqual(completed)
  expect(history.flatMap((message) => message.parts).find((part) => part.id === called.partID))
    .toMatchObject({ state: { status: "completed", metadata: { workResult: running } } })
  // Seven child requests (read, document, inquiry open, claim, check, close, final text), then one native parent-notice request.
  expect(yield* fixture.remote.calls).toBe(8)
  expect(JSON.stringify((yield* fixture.remote.inputs)[7])).toContain("Background task completed: Background conditional discovery")
  expect(yield* fixture.remote.pending).toBe(0)
}), { git: true }, 120_000)

it.instance("worker success card before terminal provider failure cannot overwrite failed native Task or lose admitted document", () => Effect.gen(function* () {
  const fixture = yield* NativeResearchTask.setup()
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    yield* fixture.prompt.cancel(fixture.parent.id)
    yield* Effect.forEach(yield* fixture.sessions.children(fixture.parent.id), (child) => fixture.prompt.cancel(child.id))
    yield* fixture.sessions.remove(fixture.parent.id)
  }).pipe(Effect.orDie))
  const events = yield* EventV2.Service
  const artifacts = yield* ResearchArtifacts.Service
  const records = yield* ResearchRecords.Service
  const state: { source?: Research.SourceReceipt; document?: Research.DocumentReceipt; card?: Research.Card } = {}
  const body = "Only version 1 [source](research:version)."
  yield* fixture.fs.writeFileString(path.join(fixture.instance.directory, "evidence.txt"), "Only version 1.\n")
  const unsubscribe = yield* events.listen((event) => Effect.gen(function* () {
    if (event.type === ResearchEvent.SourceAdmitted.type) {
      const admitted = Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(event.data)
      if (admitted.binding.authoritySessionID !== fixture.parent.id || admitted.receipt.ref.representation !== "text" || state.source) return
      state.source = admitted.receipt
      yield* fixture.remote.tool("research_record", { action: "document", document: {
        title: "Retained before failure", genre: "answer", body, findingRefs: [],
        citations: { version: { source: admitted.receipt.ref, locator: { kind: "quote", exact: "Only version 1." } } },
      } })
      return
    }
    if (event.type !== ResearchEvent.DocumentPublished.type) return
    const admitted = Schema.decodeUnknownSync(ResearchEvent.DocumentPublished.data)(event.data)
    if (admitted.binding.authoritySessionID !== fixture.parent.id || !state.source || state.document) return
    state.document = admitted.receipt
    state.card = { answer: "Successfully finished; only version 1.", profile: "understand", depth: "quick", sufficiency: "answered",
      findingRefs: [], evidenceRefs: [admitted.receipt.citations.version], documentRefs: [admitted.receipt.ref],
      coverage: { examined: ["evidence.txt"], excluded: [], failures: [] }, limitations: [], nextActions: [] }
    yield* fixture.remote.push(reply().text(`\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`).tool("research_view", { action: "document", ref: admitted.receipt.ref }))
    yield* fixture.remote.error(401, { error: { message: "controlled terminal provider failure" } })
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  yield* fixture.remote.tool("read", { filePath: "evidence.txt" })
  const called = yield* fixture.call({ description: "Preserve evidence through failure", prompt: "Read and publish conditional answer", subagent_type: "jimmy" }, "failed-discovery").pipe(Effect.timeout("30 seconds"))
  expect(Exit.isFailure(called.exit) && Cause.pretty(called.exit.cause)).toContain("Subagent failed")
  if (!state.document || !state.source || !state.card) throw new Error("Controlled provider path omitted the real admitted document")
  const failed = Schema.decodeUnknownSync(Schema.Struct({ workResult: result }))(called.metadata).workResult
  expect(failed).toMatchObject({ terminal: { reason: "failed" }, card: { parsed: false }, referencesChecked: false })
  expect(failed.outcome).toBeUndefined()
  expect(failed.discovery).toBeUndefined()
  expect(failed.corpus?.documents).toEqual([state.document])
  expect(failed.corpus?.sources).toContainEqual(state.source)
  expect(state.document.binding).toEqual(state.source.binding)
  yield* records.verifyEvidence(state.source.binding, state.card.evidenceRefs[0])
  const history = yield* fixture.sessions.messages({ sessionID: state.source.binding.executionSessionID })
  const claimed = history.find((message) => message.parts.some((part) => part.type === "text" &&
    part.text === `\u0060\u0060\u0060jimmy-result\n${JSON.stringify(state.card)}\n\u0060\u0060\u0060`))
  expect(claimed).toMatchObject({ info: { role: "assistant", finish: "tool-calls" } })
  expect(claimed?.parts).toContainEqual(expect.objectContaining({ type: "tool", tool: "research_view",
    state: expect.objectContaining({ status: "completed", input: { action: "document", ref: state.document.ref } }) }))
  const last = history.findLast((message) => message.info.role === "assistant")
  expect(last?.info).toMatchObject({ role: "assistant", error: { name: "APIError", data: { statusCode: 401, isRetryable: false } } })
  expect(last?.info.id).not.toBe(claimed?.info.id)
  expect(yield* artifacts.read(state.source.binding, state.source.ref.artifact)).toMatchObject({ receipt: state.source, text: "Only version 1.", complete: true })
  expect(yield* records.view(state.document.binding, { action: "document", ref: state.document.ref })).toMatchObject({
    ref: state.document.artifact, receipt: state.document, representation: "markdown", text: body, complete: true,
  })
  expect((yield* fixture.sessions.messages({ sessionID: fixture.parent.id })).flatMap((message) => message.parts)
    .find((part) => part.id === called.partID)).toMatchObject({ state: { status: "error", metadata: { workResult: failed } } })
  // Four child requests: read, document, text+view, HTTP 401. Foreground failure sends no parent notice.
  expect(yield* fixture.remote.calls).toBe(4)
  expect(JSON.stringify((yield* fixture.remote.inputs)[3])).toContain(state.card.answer)
  expect(JSON.stringify((yield* fixture.remote.inputs)[3])).toContain(body)
  expect(yield* fixture.remote.pending).toBe(0)
}), { git: true }, 120_000)

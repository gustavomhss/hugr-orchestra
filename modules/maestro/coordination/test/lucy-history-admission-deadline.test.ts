import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Clock, Deferred, Effect, Exit, Fiber, Schema, Stream, Tracer } from "effect"
import { TestClock } from "effect/testing"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, sourcePath, sourceText, stage, text, type Controls } from "./fixture/lucy-engagement"
import { blobRoot, canonical, decoded, digest, reader, refused } from "./fixture/lucy-engagement-artifacts"
import { calls } from "./fixture/lucy-engagement-artifact-limits"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, History, native, request, retained, script } from "./fixture/lucy-history"

const positiveID = "admission_deadline_positive"
const currentID = "admission_deadline_current"
const ancestorID = "admission_deadline_ancestor"
const lateIDs: readonly string[] = [currentID, ancestorID]
const StagedProof = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-proof-v1"),
  historyID: Schema.String, inputHash: Schema.String, sourceSha256: Schema.String, anchorCommit: Schema.String,
  budget: Schema.Struct({ startedAt: Schema.Number, deadlineAt: Schema.Number }),
  sessionID: Schema.String, assistantMessageID: Schema.String, toolCallID: Schema.String,
  name: Schema.Literal("review_history"), result: History,
})
type StagedProof = typeof StagedProof.Type
const CoreResult = Schema.Struct({ result: History })

/**
 * Supplemental acceptance written after the local deadline repair was proposed.
 * Its hosted baseline includes scoped history but excludes the repair; no earlier frozen case changes.
 * The fixture forwards the real FS link before this observer can suspend its return. A physical CAS
 * blob can already exist: the contract is no late admitted capture or successful tool output.
 */
test("H07/H09 the original 30-second history call bound includes real CAS return and the shared collector permit", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<{ readonly proof: StagedProof; readonly destination: string }>()
    const release = yield* Deferred.make<void>()
    const publications: StagedProof[] = []
    const coreExits: Exit.Exit<unknown, unknown>[] = []
    let notifyReaders = () => {}
    const readersFinished = new Promise<void>((resolve) => { notifyReaders = resolve })
    const tracer = Tracer.make({ span: (options) => {
      const span = new Tracer.NativeSpan(options)
      if (options.name !== "ReviewScopedHistory.run") return span
      const end = span.end.bind(span)
      let observed = false
      span.end = (at, exit) => {
        end(at, exit)
        if (observed) return
        observed = true
        coreExits.push(exit)
        if (coreExits.length === 3) notifyReaders()
      }
      return span
    } })
    let evidenceRoot: string | undefined
    let holding = false
    const afterFsLink: NonNullable<Controls["afterFsLink"]> = (from, to) => Effect.gen(function* () {
      if (path.dirname(to) !== evidenceRoot || path.basename(from) !== "blob") return
      const value: unknown = yield* Effect.promise(async () => {
        const body = await fs.readFile(from, "utf8")
        try { return JSON.parse(body) } catch { return undefined }
      })
      if (!Schema.is(StagedProof)(value) || value.toolCallID !== positiveID && !lateIDs.includes(value.toolCallID)) return
      publications.push(value)
      if (value.toolCallID === positiveID || holding) return
      holding = true
      yield* Deferred.succeed(entered, { proof: value, destination: to })
      // Deliberately resist cancellation only at this real storage-return seam. The finalizer below always releases it.
      yield* Deferred.await(release).pipe(Effect.uninterruptible)
    })
    const turns = new Map<string, number>()
    const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      if (stage(log.text) !== "entry") return text(reply(log, modelRequest, { quote: false }))
      const turn = turns.get(log.sessionID) ?? 0
      turns.set(log.sessionID, turn + 1)
      if (turn === 0) return calls([code,
        { id: positiveID, name: "review_history", input: { op: "show", path: sourcePath } }])
      if (turn === 1) return calls([
        { id: currentID, name: "review_history", input: { op: "show", path: sourcePath } },
        { id: ancestorID, name: "review_history", input: { op: "show", path: sourcePath, rev: root.base } },
      ])
      return text(reply(log, modelRequest, { quote: false }))
    }
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      evidenceRoot = blobRoot(root, host)
      const input = request("history-admission-deadline", "diligence")
      const clockAtStart = yield* Clock.currentTimeMillis
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      const gate = yield* Deferred.await(entered)
      expect(yield* Effect.raceFirst(Effect.promise(() => readersFinished).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      expect(coreExits).toHaveLength(3)
      const reads: History[] = []
      for (const exit of coreExits) {
        expect(Exit.isSuccess(exit), "the observer must see completed native readers, not mere span starts").toBe(true)
        if (Exit.isFailure(exit)) return yield* Effect.die("real history reader failed before the storage seam")
        reads.push(Schema.decodeUnknownSync(CoreResult)(exit.value).result)
      }
      expect(publications.filter((proof) => proof.toolCallID === positiveID)).toHaveLength(1)
      expect(publications.filter((proof) => lateIDs.includes(proof.toolCallID))).toHaveLength(1)
      // The first late publisher holds the collector permit. Both real Core readers have already returned;
      // the other native call has not entered publication and is waiting for that same permit.
      const events = yield* native(host, gate.proof.sessionID)
      yield* completed(host, gate.proof.sessionID, code.id)
      const positive = yield* completed(host, gate.proof.sessionID, positiveID)
      expect(Schema.decodeUnknownSync(History)(JSON.parse(positive.text)).text).toBe(sourceText)
      for (const id of [positiveID, ...lateIDs]) {
        const event = events.find((candidate) => candidate.toolCallID === id)
        expect(event).toBeDefined()
        if (!event) return yield* Effect.die("native history event is missing before the clock advances")
        expect(event.name).toBe("review_history")
        expect(event.providerExecuted).not.toBe(true)
        expect(event.state.status).toBe(id === positiveID ? "completed" : "running")
        const identity = digest(canonical({ schema: "review-engagement-history-operation-v1",
          inputHash: gate.proof.inputHash, sourceSha256: gate.proof.sourceSha256,
          sessionID: event.sessionID, assistantMessageID: event.assistantMessageID,
          toolCallID: event.toolCallID, name: "review_history" }))
        const read = reads.find((candidate) => candidate.historyID === identity)
        expect(read).toBeDefined()
        if (!read) return yield* Effect.die("native reader exit is not bound to this fixture call")
        expect(read.sourceSha256).toBe(gate.proof.sourceSha256)
        expect(read.anchorCommit).toBe(root.head)
        expect(read.path).toBe(sourcePath)
        expect(read.op).toBe("show")
        expect(read.complete).toBe(true)
        expect(read.truncated).toBe(false)
        expect(read.text).toBe(id === ancestorID ? 'export const sharedValue = "ENGAGEMENT-BASE"\n' : sourceText)
      }
      expect(gate.proof.budget.deadlineAt - gate.proof.budget.startedAt).toBe(300_000)
      expect(yield* Clock.currentTimeMillis).toBe(clockAtStart)
      expect(path.basename(gate.destination)).toBe(digest(canonical(gate.proof)))
      expect(yield* Effect.promise(() => fs.readFile(gate.destination, "utf8"))).toBe(canonical(gate.proof))
      yield* TestClock.adjust("31 seconds")
      const afterDeadline = yield* Clock.currentTimeMillis
      expect(afterDeadline - clockAtStart).toBe(31_000)
      expect(afterDeadline).toBeLessThan(gate.proof.budget.deadlineAt)
      expect(pending.pollUnsafe()).toBeUndefined()
      expect((yield* host.execution.active).size).toBeGreaterThan(0)
      yield* Deferred.succeed(release, undefined)
      const output = yield* Fiber.join(pending)
      const ended = yield* native(host, gate.proof.sessionID)
      for (const id of lateIDs) {
        const event = ended.find((candidate) => candidate.toolCallID === id)
        expect(event).toBeDefined()
        if (!event) return yield* Effect.die("late native history event is missing")
        expect(event.state.status).toBe("error")
        if (event.state.status !== "error") return yield* Effect.die("late history was admitted as a successful output")
        // ToolStateError carries the reason in error.message, not in the model-visible content array.
        expect(event.state.error.message).toMatch(/engagement-history-(?:deadline|binding-closed)/)
      }
      const terminal = output.type === "text" ? output : yield* host.invoke(input)
      const report = decoded(terminal)
      expect(report.budget).toEqual(gate.proof.budget)
      expect(yield* Clock.currentTimeMillis).toBeLessThan(report.budget.deadlineAt)
      expect(["completed", "failed"]).toContain(report.status)
      if (report.status === "completed") {
        const evidence = yield* retained(host, report)
        expect(evidence.proofs.map((entry) => entry.proof.toolCallID)).toEqual([positiveID])
        expect(evidence.value.history).toHaveLength(1)
      } else {
        const unavailable = yield* host.call(reader, { op: "manifest", reportID: report.reportID })
        refused(unavailable, "engagement-evidence-unavailable")
        expect(unavailable.text).toContain("terminal-status")
      }
      expect((yield* host.execution.active).size).toBe(0)
    }).pipe(Effect.ensuring(Deferred.succeed(release, undefined))), {
      ...variantAdapter(stream), afterFsLink,
    }).pipe(Effect.withTracer(tracer))
  })).pipe(Effect.provide(TestClock.layer())))
}, 180_000)

test("H07 a native history call completed within its deadline can be acknowledged after 30 seconds while its engagement is alive", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<string>()
    const release = yield* Deferred.make<void>()
    const id = "admission_later_ack"
    const provider = script([code, { id, name: "review_history", input: { op: "show", path: sourcePath } }])
    const turns = new Map<string, number>()
    const stream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      if (stage(log.text) !== "entry") return provider.stream(log, modelRequest)
      const turn = turns.get(log.sessionID) ?? 0
      turns.set(log.sessionID, turn + 1)
      if (turn !== 1) return provider.stream(log, modelRequest)
      // This pauses only the next scripted transport response. The real tool has already settled natively.
      return Stream.unwrap(Deferred.succeed(entered, log.sessionID).pipe(
        Effect.andThen(Deferred.await(release)), Effect.as(provider.stream(log, modelRequest)),
      ))
    }
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const input = request("history-ack-after-call-deadline", "diligence")
      const started = yield* Clock.currentTimeMillis
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      const sessionID = yield* Deferred.await(entered)
      yield* completed(host, sessionID, code.id)
      const event = yield* completed(host, sessionID, id)
      const value = Schema.decodeUnknownSync(History)(JSON.parse(event.text), { onExcessProperty: "error" })
      expect(value.text).toBe(sourceText)
      expect(value.anchorCommit).toBe(root.head)
      expect(value.complete).toBe(true)
      expect(yield* Clock.currentTimeMillis).toBe(started)
      yield* TestClock.adjust("31 seconds")
      expect((yield* Clock.currentTimeMillis) - started).toBe(31_000)
      expect(pending.pollUnsafe()).toBeUndefined()
      expect((yield* host.execution.active).size).toBeGreaterThan(0)
      yield* Deferred.succeed(release, undefined)
      const output = yield* Fiber.join(pending)
      const report = decoded(output)
      expect(report.status).toBe("completed")
      expect(report.budget.deadlineAt - report.budget.startedAt).toBe(300_000)
      expect(yield* Clock.currentTimeMillis).toBeLessThan(report.budget.deadlineAt)
      const evidence = yield* retained(host, report)
      expect(evidence.proofs).toHaveLength(1)
      const proof = evidence.proofs[0]?.proof
      expect(proof).toBeDefined()
      if (!proof) return yield* Effect.die("the native completed history was lost by delayed ACK")
      expect(proof.toolCallID).toBe(id)
      expect(proof.assistantMessageID).toBe(event.assistantMessageID)
      expect(proof.nativeSettlement).toEqual({ status: "completed", messageID: event.assistantMessageID })
      expect(proof.result).toEqual(value)
      expect(proof.budget).toEqual(report.budget)
      expect((yield* host.execution.active).size).toBe(0)
    }).pipe(Effect.ensuring(Deferred.succeed(release, undefined))), variantAdapter(stream))
  })).pipe(Effect.provide(TestClock.layer())))
}, 180_000)

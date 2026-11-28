import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Fiber, Stream } from "effect"
import { LLMEvent } from "@orchestra/llm"
import { Database } from "@orchestra/core/database/database"
import { SessionSchema } from "@orchestra/core/session"
import { SessionInputTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { reviewRows } from "./fixture/lucy-pr-entry"
import { fence, outsidePath, reply, run, sourcePath, sourceText, stage, text } from "./fixture/lucy-engagement"
import { decoded, receipt } from "./fixture/lucy-engagement-artifacts"
import { knownVariant, variantAdapter } from "./fixture/lucy-engagement-variant-adapter"

type Envelope = {
  schema: string
  requestID: string
  inputHash: string
  sessionID: string
  status: string
  source: { revision: string; commit: string; sha256: string; files: { path: string; oid: string; mode: string; size: number }[] }
  budget: { startedAt: number; deadlineAt: number }
  reportID: string
  report: ReviewResultV2.Card
  citations: { uri: string; path: string; oid: string; startLine: number; endLine: number; text: string; sha256: string }[]
  classifications: { findingID: string; severity: string; label: string }[]
  notExamined: { item: string; reason: string }[]
}

const request = (requestID: string, profile = "audit") => ({
  kind: "engagement", requestID, profile,
  brief: "Inspect the literal src scope and quote the captured sharedValue declaration.",
  timeBoxMinutes: 5, paths: ["src"],
})

function envelope(result: { type: string; text: string }): Envelope {
  expect(result.type, result.text).toBe("text")
  const value = JSON.parse(result.text) as Envelope
  expect(value.schema).toBe("review-engagement-result-v1")
  expect(value.reportID).toMatch(/^[0-9a-f]{64}$/)
  expect(value.inputHash).toMatch(/^[0-9a-f]{64}$/)
  return value
}

for (const profile of ["audit", "diligence", "artifact"]) {
  test("registered " + profile + " engagement produces a host-bound report and actual quoted evidence without a validation", () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
      const before = yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))
      const input = request("public-" + profile, profile)
      const output = yield* host.invoke(input)
      const value = envelope(output)
      expect(value.status).toBe("completed")
      expect(value.requestID).toBe("public-" + profile)
      expect(value.source.commit).toBe(root.head)
      expect(value.source.revision).toBe("HEAD")
      expect(value.source.files.map((file) => file.path)).toEqual([sourcePath])
      expect(value.source.files[0]).toMatchObject({ mode: "100644", size: Buffer.byteLength(sourceText) })
      expect(value.report.profile).toBe(profile)
      expect(value.report).not.toHaveProperty("verdict")
      expect(value.report.scope).toEqual({ base: root.head, head: root.head, files: 1, changedLines: 0 })
      expect(value.report.findings).toHaveLength(1)
      const finding = value.report.findings[0]!
      expect(finding).toMatchObject({
        path: sourcePath, line: 1, endLine: 1, severity: "P1", status: "open", rungs: ["quote"],
        evidence: { kind: "quote", path: sourcePath, startLine: 1, endLine: 1 },
      })
      expect(value.classifications).toEqual([{
        findingID: finding.id, severity: "P1",
        label: profile === "audit" ? "significant deficiency" : profile === "diligence" ? "price or structure item" : "P1",
      }])
      const citation = value.citations.find((item) => item.path === sourcePath && item.startLine === 1 && item.endLine === 1)
      expect(citation).toBeDefined()
      expect(citation?.oid).toBe(value.source.files[0]?.oid)
      expect(citation?.text).toBe(sourceText.trimEnd())
      expect(citation?.sha256).toBe(createHash("sha256").update(sourceText.trimEnd(), "utf8").digest("hex"))
      expect(citation?.uri).toBeTruthy()
      expect(value.budget.deadlineAt - value.budget.startedAt).toBe(300_000)
      expect(root.requests.some((item) => stage(item.text) === "verify")).toBe(true)
      const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      expect(inputs.some((row) => row.session_id === value.sessionID && row.promoted_seq !== null)).toBe(true)
      const messages = yield* host.db.select().from(SessionMessageTable).all().pipe(Effect.orDie)
      expect(messages.some((row) => row.session_id === value.sessionID && row.type === "assistant")).toBe(true)
      expect(yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))).toEqual(before)
      expect(value.report.coverage.notExamined).toContainEqual({ item: "engagement:history", reason: "not-built" })
      if (profile === "artifact")
        expect(value.report.coverage.notExamined).toContainEqual({ item: "artifact:behavioral-eval", reason: "owner-permission" })
      if (profile === "audit") {
        expect(value.report.coverage.notExamined).toContainEqual({ item: "audit:variants", reason: "no-new-matches" })
        yield* knownVariant(host, input, yield* receipt(host, decoded(output)))
      }
    }), variantAdapter((log, modelRequest) => text(reply(log, modelRequest, { quote: true }))))))
  }, 90_000)
}

test("engagement admission rejects other seats, validation fields, unavailable compliance and premature fix review before child work", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const before = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
    const requests = root.requests.length
    expect((yield* host.invoke(request("wrong-seat"), "backend")).type).toBe("error")
    expect((yield* host.invoke({ ...request("validation-field"), validationRecordID: "not-an-engagement" })).type).toBe("error")
    const compliance = yield* host.invoke(request("premature-compliance", "compliance"))
    expect(compliance.type).toBe("error")
    expect(compliance.text).toContain("engagement-profile-unavailable")
    const fix = yield* host.invoke({ ...request("premature-fix"), fixReview: { reportID: "a".repeat(64), findingIDs: ["C1"] } })
    expect(fix.type).toBe("error")
    expect(fix.text).toContain("engagement-fix-review-unavailable")
    expect(root.requests.length).toBe(requests)
    expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(before)
  }))))
}, 90_000)

test("a public engagement refuses even an APPROVE field in an otherwise valid final report", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const before = yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))
    const value = yield* host.invoke(request("reject-verdict"))
    expect(root.requests.some((item) => stage(item.text) === "finish")).toBe(true)
    expect(value.type).toBe("error")
    expect(value.text).toContain("engagement-report-invalid")
    expect(yield* reviewRows().pipe(Effect.provideService(Database.Service, host.database))).toEqual(before)
  }), {
    stream: (log, modelRequest) => {
      const value = reply(log, modelRequest)
      const card = ReviewResultV2.parse(value)
      return text(card ? fence(ReviewResultV2.TAG, { ...card, verdict: "APPROVE" }) : value)
    },
  })))
}, 90_000)

test("real engagement children confine immutable CODE and refuse native live-source tools", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<string>()
    const release = yield* Deferred.make<void>()
    const held = new Set<string>()
    const native = [
      { id: "native-read-inside", name: "read", input: { path: sourcePath } },
      { id: "native-read-outside", name: "read", input: { path: outsidePath } },
      { id: "native-grep", name: "grep", input: { pattern: "sharedValue", path: "." } },
      { id: "native-glob", name: "glob", input: { pattern: "**/*", path: "." } },
      { id: "native-history", name: "review_history", input: { op: "show", rev: "HEAD", path: outsidePath } },
      { id: "native-atlas", name: "atlas_context", input: { action: "catalog" } },
    ]
    const calls = [{ id: "captured-code", name: "code_locate", input: { symbols: ["sharedValue"] } }, ...native]
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const pending = yield* host.invoke(request("captured-authority")).pipe(Effect.forkChild)
      const reached = yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)),
      )
      expect(reached).toBe(true)
      const child = SessionSchema.ID.make(yield* Deferred.await(entered))
      yield* Effect.gen(function* () {
        const live = 'export const sharedValue = "ENGAGEMENT-LIVE-MUTATION"\n'
        yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), live))
        yield* Effect.promise(() => fs.writeFile(path.join(root.directory, "outside/late.ts"), "LATE-UNADMITTED\n"))
        const search = yield* host.call("code_search", { pattern: "sharedValue", paths: ["**/*"] }, "lucy", child)
        expect(search.type, search.text).toBe("text")
        expect(search.text).toContain(sourceText.trimEnd().replaceAll('"', '\\"'))
        expect(search.text).not.toContain("ENGAGEMENT-OUTSIDE")
        expect(search.text).not.toContain("ENGAGEMENT-LIVE-MUTATION")
        const located = yield* host.call("code_locate", { symbols: ["sharedValue"], paths: ["**/*"] }, "lucy", child)
        expect(located.type, located.text).toBe("text")
        expect(located.text).toContain("ENGAGEMENT-IN-SCOPE")
        expect(located.text).not.toContain("ENGAGEMENT-OUTSIDE")
        expect(located.text).not.toContain("ENGAGEMENT-LIVE-MUTATION")
        for (const input of [{ op: "symbols", name: "sharedValue" }, { op: "definition", name: "sharedValue" }, { op: "map" }]) {
          const result = yield* host.call("code_query", input, "lucy", child)
          expect(result.type, result.text).toBe("text")
          expect(result.text).toContain(sourcePath)
          expect(result.text).not.toContain(outsidePath)
        }
        for (const input of [{ op: "symbols", path: outsidePath }, { op: "definition", at: { path: outsidePath, line: 1, column: 14 } }]) {
          const result = yield* host.call("code_query", input, "lucy", child)
          expect(result.type).toBe("error")
          expect(result.text).toContain("reference_invalid")
        }
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
      const result = envelope(yield* Fiber.join(pending))
      expect(result.source.commit).toBe(root.head)
      expect(result.source.files.map((file) => file.path)).toEqual([sourcePath])
      expect(JSON.stringify(result.citations)).not.toContain("ENGAGEMENT-OUTSIDE")
      expect(JSON.stringify(result.citations)).not.toContain("ENGAGEMENT-LIVE-MUTATION")
      // Native refusal must pass the real runner's scoped admission, not direct registry settlement.
      const turns = yield* host.sessions.context(child)
      const settled = turns.flatMap((message) => message.type === "assistant"
        ? message.content.flatMap((part) => part.type === "tool"
          ? [{ id: part.id, status: part.state.status, body: JSON.stringify(part.state) }] : []) : [])
      expect(settled.find((item) => item.id === "captured-code")?.status).toBe("completed")
      for (const item of native) {
        const observed = settled.find((value) => value.id === item.id)
        expect(observed?.status, item.name).toBe("error")
        expect(observed?.body).not.toContain("ENGAGEMENT-OUTSIDE")
        expect(observed?.body).not.toContain("ENGAGEMENT-LIVE-MUTATION")
      }
      const after = yield* host.call("code_search", { pattern: "sharedValue" }, "lucy", child)
      expect(after.type).toBe("error")
    }), {
      stream: (log, modelRequest) => {
        if (stage(log.text) !== "entry" || held.has(log.sessionID)) return text(reply(log, modelRequest))
        held.add(log.sessionID)
        return Stream.unwrap(Deferred.succeed(entered, log.sessionID).pipe(
          Effect.andThen(Deferred.await(release)), Effect.as(Stream.fromIterable([
            LLMEvent.stepStart({ index: 0 }),
            ...calls.flatMap((call) => [
              LLMEvent.toolInputStart({ id: call.id, name: call.name }),
              LLMEvent.toolInputDelta({ id: call.id, name: call.name, text: JSON.stringify(call.input) }),
              LLMEvent.toolInputEnd({ id: call.id, name: call.name }),
              LLMEvent.toolCall(call),
            ]),
            LLMEvent.stepFinish({ index: 0, reason: "tool-calls" }),
            LLMEvent.finish({ reason: "tool-calls" }),
          ])),
        ))
      },
    })
  })))
}, 90_000)

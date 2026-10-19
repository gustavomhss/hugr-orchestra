import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Research } from "@orchestra/schema/research"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchLedger } from "@orchestra/core/research/ledger"
import { ResearchRecords } from "@orchestra/core/research/records"
import { Locate } from "@orchestra/core/research-toolkit/locate"
import { callFrame, researchFixture } from "./research-binding.test"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)
const check: Research.CheckResult = { verdict: "pass", rules: [{ id: "R2", checked: 1, failed: 0 }], issues: [], urls: [] }
const card = (check: Research.CheckResult): Research.CardV2 => ({
  schema: "jimmy-card-v2", answer: "The answer.", profile: "understand", depth: "quick", sufficiency: "partial", subquestions: [],
  claims: [], hypotheses: [], probes: [], sources: { total: 0, shown: [] }, searches: 0, web: { domains: "unrestricted", urls: [] },
  coverage: { examined: [], excluded: [], failures: [] }, limitations: [], nextActions: [], documentRefs: [], check,
})

describe("research inquiry ledger (J5.1)", () => {
  it.live("a dispatch opens and closes its inquiry once; exact retries replay and nothing follows a close", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const allowances = yield* ResearchAllowance.Service
      const allowance = yield* allowances.bind(fixture.binding, "dispatch-one")
      const question = yield* callFrame(fixture.binding, fixture.context, records.record(fixture.binding, fixture.context,
        { action: "question", question: "Where?", selection: { profile: "locate", depth: "quick", genre: "answer" } }, "open:question"))
      if (!question.record) throw new Error("Expected the question record")
      const ref = { id: question.record.id, revision: question.record.revision }
      const opened = { type: "research.inquiry.opened", question: ref, subquestions: [ref] } as const
      const first = yield* callFrame(fixture.binding, fixture.context, records.inquire(allowance, fixture.context, opened))
      expect(yield* callFrame(fixture.binding, fixture.context, records.inquire(allowance, fixture.context, opened))).toEqual(first)
      const again = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, again, records.inquire(allowance, again, opened)).pipe(Effect.flip)).code).toBe("inquiry_state")
      const checking = yield* fixture.call()
      yield* callFrame(fixture.binding, checking, records.inquire(allowance, checking, { type: "research.inquiry.checked", check }))
      const closing = yield* fixture.call()
      yield* callFrame(fixture.binding, closing, records.inquire(allowance, closing, { type: "research.inquiry.closed", card: card(check) }))
      const late = yield* fixture.call()
      expect((yield* callFrame(fixture.binding, late, records.inquire(allowance, late, { type: "research.inquiry.checked", check })).pipe(Effect.flip)).code)
        .toBe("inquiry_state")
      const steps = yield* records.dispatch(allowance)
      expect(steps.map((step) => step.type).filter((type) => type.startsWith("research.inquiry."))).toEqual([
        "research.inquiry.opened", "research.inquiry.checked", "research.inquiry.closed",
      ])
      // The parent reads the closed card by binding (J5.13).
      expect(yield* ResearchLedger.closed(fixture.binding)).toEqual(card(check))
      // A resumed Task is a new dispatch: its stream starts after its own allowance and holds no earlier inquiry.
      const resumed = yield* allowances.bind(fixture.binding, "dispatch-two")
      expect(yield* ResearchLedger.closed(fixture.binding)).toBeUndefined()
      expect((yield* records.dispatch(resumed)).filter((step) => step.type.startsWith("research.inquiry."))).toEqual([])
      expect((yield* records.dispatch({ ...resumed, dispatchCallID: "never-bound" }).pipe(Effect.flip)).code).toBe("binding_missing")
    }).pipe(Effect.provide(ResearchAllowance.layer)),
  ))

  it.live("original-file lines resolve through the captured span's first line (J5.3)", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const source = yield* callFrame(fixture.binding, fixture.context, records.capture(fixture.binding, fixture.context, {
        origin: { kind: "file", uri: "span.ts" }, representation: "text", mediaType: "text/plain", content: "line four\nline five",
        complete: false, observed: { byteStart: 30, lineStart: 4, lineEnd: 5 },
      }))
      const lines = (start: number, end: number, basis?: "original" | "retained") =>
        records.verifyEvidence(fixture.binding, { source: source.ref, locator: { kind: "lines", start, end, ...(basis ? { basis } : {}) } })
      yield* lines(4, 5, "original")
      yield* lines(1, 2)
      expect((yield* lines(1, 2, "original").pipe(Effect.flip)).code).toBe("reference_invalid")
      expect((yield* lines(5, 6, "original").pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))

  it.live("a code_locate snapshot resolves original lines inside one of its ranges", () => researchFixture((fixture) =>
    Effect.gen(function* () {
      const records = yield* ResearchRecords.Service
      const content = [Locate.SNAPSHOT, "==> src/y.ts:30-31", "30: export function relayed() {", "31:   return 2", "",
        "==> src/x.ts:1-1", "1: export const x = 1"].join("\n")
      const capture = (uri: string) => Effect.gen(function* () {
        const context = yield* fixture.call()
        return yield* callFrame(fixture.binding, context, records.capture(fixture.binding, context, {
          origin: { kind: "file", uri }, representation: "text", mediaType: "text/plain", content, complete: true }))
      })
      const snapshot = yield* capture(fixture.binding.worktree)
      const lines = (ref: Research.SourceRef, start: number, end: number) =>
        records.verifyEvidence(fixture.binding, { source: ref, locator: { kind: "lines", start, end, basis: "original" } })
      yield* lines(snapshot.ref, 30, 31)
      yield* lines(snapshot.ref, 1, 1)
      expect((yield* lines(snapshot.ref, 29, 30).pipe(Effect.flip)).code).toBe("reference_invalid")
      expect((yield* lines(snapshot.ref, 1, 30).pipe(Effect.flip)).code).toBe("reference_invalid")
      // The same bytes read as an ordinary file keep the file's own coordinates.
      const plain = yield* capture("notes.txt")
      expect((yield* lines(plain.ref, 30, 31).pipe(Effect.flip)).code).toBe("reference_invalid")
    }),
  ))
})

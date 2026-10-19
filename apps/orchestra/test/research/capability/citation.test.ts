import { describe, expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { Research } from "@orchestra/schema/research"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { PartID } from "@/session/schema"
import { CapabilitySupport } from "./support"

// The check behind `inquiry check` and `inquiry close` (InquiryCheck.run), reached through the registry's real tools, the
// ledger and the retained bytes, and the card the parent receives (DiscoveryResult.assemble over this dispatch).

const Opened = Schema.Struct({ subquestions: Schema.Array(Research.RecordRef) })

const session = Effect.fn("CitationTest.session")(function* () {
  const fixture = yield* CapabilitySupport.dispatch()
  const fs = yield* FSUtil.Service
  const inquiry = (input: Research.InquiryInput) => fixture.run("inquiry", input)
  const refused = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.exit, Effect.map((exit) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "accepted"))
  const retain = Effect.fn("CitationTest.retain")(function* (name: string, text: string) {
    yield* fs.writeWithDirs(path.join(fixture.directory, name), text)
    return CapabilitySupport.source(yield* fixture.run("read", { filePath: name })).ref
  })
  const open = () => inquiry({ action: "open", question: "What does it do?", subquestions: ["Which line holds it"], profile: "understand" })
    .pipe(Effect.map((result) => Schema.decodeUnknownSync(Opened)(result.metadata.inquiry).subquestions[0]))
  const assemble = DiscoveryResult.assemble({
    info: { ...fixture.assistant, finish: "stop", time: { ...fixture.assistant.time, completed: Date.now() } },
    parts: [{ id: PartID.ascending(), sessionID: fixture.child.id, messageID: fixture.assistant.id, type: "text" as const, text: "Closed." }],
  }, [])
  const answered = (answer: string) => inquiry({ action: "close", sufficiency: "answered", answer })
  return { fixture, inquiry, refused, retain, open, assemble, answered, cleanup: fixture.sessions.remove(fixture.authority.id) }
})

describe("JE-AC-I2, I3: an answer needs verified evidence before it is done", () => {
  // Mutation control: remove the R2 anti-vacuity branch (the `if (strict && !resolved.some(Boolean)) fail("R2", ...)` line) in
  // src/research/inquiry-check.ts. The zero-claims and the no-resolved-evidence reasons then never appear.
  CapabilitySupport.it.instance("answered with zero claims, or with no resolved evidence, fails the check and never closes", () => Effect.gen(function* () {
    const test = yield* session()
    const subquestion = yield* test.open()
    yield* test.retain("observed.txt", "one\ntwo\nthree\n")

    const zero = (yield* test.inquiry({ action: "check" })).output
    expect(zero).toContain("\"verdict\":\"fail\"")
    expect(zero).toContain("answered, but the inquiry has zero claims and zero evidence")
    // With no claim the subquestion is uncovered, which close refuses before it runs the check.
    expect(yield* test.refused(test.answered("It works."))).toContain("neither an answering claim nor a declared gap")

    yield* test.inquiry({ action: "claim", subquestion, proposition: "It works.", nature: "observation", evidence: [] })
    const bare = (yield* test.inquiry({ action: "check" })).output
    expect(bare).toContain("claim has no evidence")
    expect(bare).toContain("answered, but no claim has resolved evidence")
    expect(yield* test.refused(test.answered("It works."))).toContain("the closing check failed: R2")

    const after = yield* test.assemble
    expect(after.outcome).toBeUndefined()
    expect(after.discovery).toBeUndefined()
    yield* test.cleanup
  }))

  CapabilitySupport.it.instance("partial is not answered: it closes without resolved evidence and is never promoted to done", () => Effect.gen(function* () {
    const test = yield* session()
    const subquestion = yield* test.open()
    yield* test.inquiry({ action: "claim", subquestion, proposition: "Not found yet.", nature: "observation", evidence: [] })
    yield* test.inquiry({ action: "check" })
    yield* test.inquiry({ action: "close", sufficiency: "partial", answer: "Not found yet." })

    const after = yield* test.assemble
    expect(after.discovery?.sufficiency).toBe("partial")
    expect(after.discovery?.check.issues.map((issue) => issue.reason)).not.toContain("answered, but no claim has resolved evidence")
    expect(after.outcome).toBeUndefined()
    yield* test.cleanup
  }))

  CapabilitySupport.it.instance("verified evidence passes the check and the answered card is done", () => Effect.gen(function* () {
    const test = yield* session()
    const subquestion = yield* test.open()
    const source = yield* test.retain("observed.txt", "one\ntwo\nthree\n")
    yield* test.inquiry({ action: "claim", subquestion, proposition: "The second line is two.", nature: "extraction",
      evidence: [{ source, lines: { start: 2, end: 2 } }] })
    expect((yield* test.inquiry({ action: "check" })).output).toContain("\"verdict\":\"pass\"")
    expect((yield* test.answered("The second line is two (observed.txt:2).")).output).toContain("\"closed\":\"answered\"")

    const after = yield* test.assemble
    expect(after.discovery).toMatchObject({ sufficiency: "answered", check: { verdict: "pass", issues: [] } })
    expect(after.outcome).toBe("done")
    yield* test.cleanup
  }))
})

describe("JE-AC-I5: cited paths match the retained file exactly", () => {
  // Mutation control: match a cited path by suffix in src/research/inquiry-check.ts (R9), replacing
  // `exact!.has(normal(span.file))` with `normal(span.file).endsWith(citation.target)`; the bare-basename citation then
  // borrows nested/index.ts and the close is accepted. Run red on that mutation.
  CapabilitySupport.it.instance("p:10, p:10-20, p#L10-L20 and [x](p#L10) all resolve; a bare index.ts never borrows nested/index.ts", () => Effect.gen(function* () {
    const test = yield* session()
    const subquestion = yield* test.open()
    const source = yield* test.retain(path.join("nested", "index.ts"), "export const a = 1\nexport const b = 2\n")
    yield* test.inquiry({ action: "claim", subquestion, proposition: "Two exports.", nature: "extraction",
      evidence: [{ source, lines: { start: 1, end: 2 } }] })
    expect((yield* test.inquiry({ action: "check" })).output).toContain("\"verdict\":\"pass\"")

    const forms = "nested/index.ts:1, nested/index.ts:1-2, nested/index.ts#L1-L2 and [b](nested/index.ts#L2) all cite the read."
    const borrowed = yield* test.refused(test.answered(`${forms} Also index.ts:1.`))
    expect(borrowed).toContain("the closing check failed")
    expect(borrowed).toContain("R9 index.ts:1 no evidence for this path")
    expect(borrowed).not.toContain("R9 nested/index.ts")

    expect((yield* test.answered(forms)).output).toContain("\"closed\":\"answered\"")
    const after = yield* test.assemble
    const rule = after.discovery?.check.rules.find((item) => item.id === "R9")
    expect(rule?.checked).toBeGreaterThanOrEqual(3)
    expect(rule?.failed).toBe(0)
    expect(after.outcome).toBe("done")
    yield* test.cleanup
  }))
})

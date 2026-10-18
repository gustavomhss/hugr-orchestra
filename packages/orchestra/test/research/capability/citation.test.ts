import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { Research } from "@orchestra/schema/research"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { PartID } from "@/session/schema"
import { CapabilitySupport } from "./support"

const fence = "`".repeat(3)
const base = { profile: "understand", depth: "quick", sufficiency: "answered", findingRefs: [], documentRefs: [],
  coverage: { examined: [], excluded: [], failures: [] }, limitations: [], nextActions: [] } as const

// The card the seat ends with, assembled by the real host path (DiscoveryResult.assemble) over this dispatch's retention.
const assemble = (fixture: Effect.Success<ReturnType<typeof CapabilitySupport.dispatch>>, prose: string, card: Research.Card) =>
  DiscoveryResult.assemble({
    info: { ...fixture.assistant, finish: "stop", time: { ...fixture.assistant.time, completed: Date.now() } },
    parts: [{ id: PartID.ascending(), sessionID: fixture.child.id, messageID: fixture.assistant.id, type: "text" as const,
      text: `${prose}\n${fence}jimmy-result\n${JSON.stringify(card)}\n${fence}` }],
  }, [])

describe("JE-AC-I2, I3: an answer needs verified evidence before it is done", () => {
  // Mutation control: remove the R2 anti-vacuity branch (`vacuous`) in src/research/citation-check.ts.
  CapabilitySupport.it.instance("answered with nothing verified fails the check and is never done; verified citations make it done", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(fixture.directory, "observed.txt"), "one\ntwo\nthree\n")
    yield* fixture.run("read", { filePath: "observed.txt" })

    const empty = yield* assemble(fixture, "It works.", { ...base, answer: "It works.", evidenceRefs: [] })
    expect(empty.citationCheck).toEqual({ verdict: "fail", checked: { evidence: 0, prose: 0, findings: 0, documents: 0 },
      issues: [{ citation: "answer", reason: "answered card cites no evidence" }], omitted: 0 })
    expect(empty.outcome).toBeUndefined()

    const unverified = yield* assemble(fixture, "See missing.ts:1.", { ...base, answer: "It works.", evidenceRefs: [] })
    expect(unverified.citationCheck?.verdict).toBe("fail")
    expect(unverified.citationCheck?.issues.map((issue) => issue.reason)).toContain("answered card has no verified evidence")
    expect(unverified.outcome).toBeUndefined()

    // A partial card owes no evidence; it is reported, not promoted.
    const partial = yield* assemble(fixture, "Not found yet.", { ...base, sufficiency: "partial", answer: "Not found yet.", evidenceRefs: [] })
    expect(partial.citationCheck?.verdict).toBe("pass")
    expect(partial.outcome).toBeUndefined()

    const verified = yield* assemble(fixture, "The second line is two (observed.txt:2).", { ...base, answer: "Line two.", evidenceRefs: [] })
    expect(verified.citationCheck).toMatchObject({ verdict: "pass", issues: [] })
    expect(verified.citationCheck?.checked.prose).toBe(1)
    expect(verified.outcome).toBe("done")
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})

describe("JE-AC-I5: cited paths match the retained file exactly", () => {
  // Mutation control: match a cited path by suffix (`endsWith`) in src/research/citation-check.ts.
  CapabilitySupport.it.instance("p:10, p:10-20, p#L10-L20 and [x](p#L10) all resolve; a bare index.ts never borrows nested/index.ts", () => Effect.gen(function* () {
    const fixture = yield* CapabilitySupport.dispatch()
    const fs = yield* FSUtil.Service
    yield* fs.writeWithDirs(path.join(fixture.directory, "nested", "index.ts"), "export const a = 1\nexport const b = 2\n")
    yield* fixture.run("read", { filePath: path.join("nested", "index.ts") })

    const forms = "nested/index.ts:1, nested/index.ts:1-2, nested/index.ts#L1-L2 and [b](nested/index.ts#L2) all cite the read."
    const exact = yield* assemble(fixture, forms, { ...base, answer: "Two exports.", evidenceRefs: [] })
    expect(exact.citationCheck).toMatchObject({ verdict: "pass", issues: [] })
    // `:1-2` and `#L1-L2` are one citation; `:1` and the `#L2` link are the other two.
    expect(exact.citationCheck?.checked.prose).toBe(3)
    expect(exact.outcome).toBe("done")

    const borrowed = yield* assemble(fixture, `${forms} Also index.ts:1.`, { ...base, answer: "Two exports.", evidenceRefs: [] })
    expect(borrowed.citationCheck?.verdict).toBe("fail")
    expect(borrowed.citationCheck?.issues).toEqual([{ citation: "index.ts:1", reason: "no retained source for this path in this dispatch" }])
    expect(borrowed.outcome).toBeUndefined()
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})

import { expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { SessionStore } from "@orchestra/core/session"
import { ReviewCandidatesV2 } from "../src/v2/workflow/review-candidates"
import { reorderDiff, sliceDiff } from "../src/v2/workflow/review-diff"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ENTRY, candidate, fenced, item } from "./fixture/lucy-fanout-data"
import { brief, dataBlock, harness, run } from "./fixture/lucy-fanout"

// Host sampling for two independent Deep hunts. Deep stays unbuilt in the catalog; only this file's clone runs it.
// Replies are the fixture's fixed K9 records. No model calls.

const TWO = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " export const keep = 0",
  "-export const a = 1",
  "+export const a = 2",
  "+export const b = 3",
  "@@ -8,2 +9,2 @@ tail",
  " export const tail = 1",
  "-export const c = 4",
  "+export const c = 5",
  "",
].join("\n")

const deepCatalog = (catalog: ReviewCatalog.Catalog) => ({
  ...catalog,
  route: {
    ...catalog.route,
    profiles: catalog.route.profiles.map((profile) => profile.id === "code" ? {
      ...profile,
      lenses: { ...profile.lenses, deep: ["correctness-logic", "correctness-edges", "correctness-reliability", "tests", "security", "correctness-concurrency"] },
    } : profile),
    tiers: catalog.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: true, runs: "deep" } : tier),
  },
})

test("Standard uses one sample with its original child keys and diff order", () =>
  run((directory) => Effect.gen(function* () {
    const h = yield* harness(directory, "samplestd")
    const input = h.input("standard")
    const result = yield* ReviewFanoutV2.run({ ...input, facts: { ...input.facts, diff: TWO } }, h.port)
    if (result.status !== "ran") throw new Error("expected a run")
    expect(result.counts.lensChildren).toBe(5)
    expect(h.calls.some((key) => key.includes(":sample:"))).toBe(false)
    const logic = brief(h.briefs, "lens:correctness-logic:all:hunt")
    expect(logic).not.toContain("Sample ")
    expect(rawBlock(logic, "diff slice")).toBe(sliceDiff(TWO, ["src/a.ts"]))
  })),
)

test("a built Deep clone fans out two scoped sessions per lens and slice under the host cap", () =>
  run((directory) =>
    Effect.gen(function* () {
      const h = yield* harness(directory, "sampledeep")
      let active = 0
      let peak = 0
      const port: ReviewFanoutV2.Port = {
        ...h.port,
        run: (sessionID, text, turn) => {
          if (turn.key !== "hunt") return h.port.run(sessionID, text, turn)
          return Effect.gen(function* () {
            active += 1
            peak = Math.max(peak, active)
            return yield* h.port.run(sessionID, text, turn)
          }).pipe(
            Effect.tap(() => Effect.promise(() => Promise.resolve())),
            Effect.ensuring(Effect.sync(() => {
              active -= 1
            })),
          )
        },
      }
      const input = h.input("deep", { catalog: deepCatalog(h.input("deep").catalog) })
      const result = yield* ReviewFanoutV2.run({ ...input, facts: { ...input.facts, diff: TWO } }, port)
      if (result.status !== "ran") throw new Error("expected a run")
      const lenses = [
        "correctness-concurrency",
        "correctness-edges",
        "correctness-logic",
        "correctness-reliability",
        "security",
        "tests",
      ]
      for (const id of lenses) {
        expect(h.calls).toContain(`create:lens:${id}:all`)
        expect(h.calls).toContain(`create:lens:${id}:all:sample:2`)
      }
      const creates = h.calls.filter((call) => call.startsWith("create:lens:"))
      expect(creates.filter((call) => call.endsWith(":sample:2")).length).toBe(creates.length / 2)
      expect(result.counts.lensChildren).toBe(creates.length)
      expect(creates.length).toBeGreaterThan(ReviewFanoutV2.LIMITS.sessions)
      expect(peak).toBeLessThanOrEqual(ReviewFanoutV2.LIMITS.sessions)
      expect(peak).toBeGreaterThan(0)
      for (const call of creates) {
        const key = call.slice("create:".length)
        expect(h.calls.indexOf(`bind:${key}`)).toBeGreaterThan(h.calls.indexOf(call))
        expect(h.calls.findIndex((item) => item.startsWith(`run:${key}`))).toBeGreaterThan(h.calls.indexOf(`bind:${key}`))
      }
      const scope = yield* h.scope("lens:correctness-logic:all")
      expect(scope).toEqual(yield* h.scope("lens:correctness-logic:all:sample:2"))
      expect(scope).toEqual({
        skills: {
          entry: "lucy-lens-correctness-logic",
          allow: ["lucy-lens-correctness-logic-invariants", "team-stack-js-ts"],
        },
        tools: ["read", "grep", "glob", "review_analyze"],
        budgets: { loads: 4, toolCalls: 50 },
      })
      const store = yield* SessionStore.Service
      const bound = h.bindings.filter((item) => item.lens === "correctness-logic")
      expect(bound).toHaveLength(2)
      expect(bound[0].sessionID).not.toBe(bound[1].sessionID)
      expect((yield* store.get(bound[0].sessionID))?.id).toBe(bound[0].sessionID)
      expect((yield* store.get(bound[1].sessionID))?.id).toBe(bound[1].sessionID)
      const first = brief(h.briefs, "lens:correctness-logic:all:hunt")
      const second = brief(h.briefs, "lens:correctness-logic:all:sample:2:hunt")
      const slice = sliceDiff(TWO, ["src/a.ts"])
      expect(rawBlock(first, "diff slice")).toBe(slice)
      expect(rawBlock(second, "diff slice")).toBe(reorderDiff(slice))
      expect(rawBlock(second, "diff slice")).not.toBe(slice)
      expect(first).toContain("Sample 1 of 2")
      expect(second).toContain("Sample 2 of 2")
      expect(first).not.toContain("Sample 2 of 2")
      expect(second).not.toContain("Sample 1 of 2")
      expect(second).not.toContain("```review-lens")
      expect(second).not.toContain(bound[0].sessionID)
      expect(rulesText(first)).toBe(rulesText(second))
      expect(namedBlock(first, "analyzer items for correctness-logic")).toBe(
        namedBlock(second, "analyzer items for correctness-logic"),
      )
      const hunts = h.calls.filter((call) => call.startsWith("run:lens:"))
      const verifies = h.calls.filter((call) => call.startsWith("create:verify:"))
      expect(verifies.length).toBeGreaterThan(0)
      expect(Math.max(...hunts.map((call) => h.calls.indexOf(call)))).toBeLessThan(
        Math.min(...verifies.map((call) => h.calls.indexOf(call))),
      )
      expect(result.counts.verifiers).toBe(verifies.length)
      expect(result.counts.confirmed).toBe(1)
      expect(result.confirmed.map((finding) => finding.id)).toEqual(["C1"])
      const finish = brief(h.briefs, "lead:finish")
      const confirmed: { id: string; lenses: string[]; agreement: number; severity: string }[] = dataBlock(
        finish,
        "confirmed findings, as the host merged them",
      )
      expect(confirmed).toMatchObject([
        { id: "C1", lenses: ["correctness-logic", "correctness-edges"], agreement: 4, severity: "P1" },
      ])
      expect(result.counts.dropped).toBe(1)
      expect(confirmed.every((finding) => finding.id === "C1")).toBe(true)
    }),
  ),
)

test("agreement counts lens samples once and never confirms or retints severity", () => {
  const shared = candidate("export const a = 2", 2, "P1")
  const both = ReviewCandidatesV2.merge(
    [
      { lens: "correctness-logic", sample: 0, candidates: [shared], observations: [], sources: [] },
      { lens: "correctness-logic", sample: 1, candidates: [shared], observations: [], sources: [] },
    ],
    [],
    ReviewCatalog.current,
  )
  expect(both).toHaveLength(1)
  expect(both[0].agreement).toBe(2)
  expect(both[0].lenses).toEqual(["correctness-logic"])
  expect(both[0].severity).toBe("P1")
  const duplicate = ReviewCandidatesV2.merge(
    [
      { lens: "correctness-logic", sample: 0, candidates: [shared, shared], observations: [], sources: [undefined, undefined] },
      { lens: "correctness-logic", sample: 0, candidates: [shared], observations: [], sources: [undefined] },
    ],
    [],
    ReviewCatalog.current,
  )
  expect(duplicate).toHaveLength(1)
  expect(duplicate[0].agreement).toBe(1)
  expect(duplicate[0].lenses).toEqual(["correctness-logic"])
  const legacy = ReviewCandidatesV2.merge(
    [
      { lens: "correctness-logic", candidates: [shared], observations: [], sources: [] },
      { lens: "correctness-edges", candidates: [{ ...shared, severity: "P2" }], observations: [], sources: [] },
    ],
    [],
    ReviewCatalog.current,
  )
  expect(legacy[0].agreement).toBe(2)
  expect(legacy[0].lenses).toEqual(["correctness-logic", "correctness-edges"])
  expect(legacy[0].severity).toBe("P1")
  const overlapped = { ...item("correctness-logic", 0), line: 2 }
  const withTool = ReviewCandidatesV2.merge(
    [{ lens: "correctness-logic", sample: 0, candidates: [shared], observations: [], sources: [] }],
    [overlapped],
    ReviewCatalog.current,
  )
  expect(withTool[0].agreement).toBe(2)
  expect(withTool[0].lenses).toEqual(["correctness-logic"])
  const withToolAndSample = ReviewCandidatesV2.merge(
    [
      { lens: "correctness-logic", sample: 0, candidates: [shared], observations: [], sources: [] },
      { lens: "correctness-logic", sample: 1, candidates: [shared], observations: [], sources: [] },
    ],
    [overlapped],
    ReviewCatalog.current,
  )
  expect(withToolAndSample[0].agreement).toBe(3)
  expect(withToolAndSample[0].severity).toBe("P1")
  const ranked = ReviewCandidatesV2.merge(
    [
      {
        lens: "correctness-logic",
        sample: 0,
        candidates: [candidate("low agree", 4, "P2"), candidate("high agree", 9, "P2")],
        observations: [],
        sources: [],
      },
      { lens: "correctness-logic", sample: 1, candidates: [candidate("high agree", 9, "P2")], observations: [], sources: [] },
    ],
    [],
    ReviewCatalog.current,
  )
  expect(ranked.map((entry) => entry.quote)).toEqual(["high agree", "low agree"])
  expect(ranked.map((entry) => entry.agreement)).toEqual([2, 1])
  expect(ranked.every((entry) => entry.severity === "P2")).toBe(true)
  expect(ranked.every((entry) => !("state" in entry))).toBe(true)
})


function rawBlock(text: string, name: string) {
  const start = `<data name="${name}">\n`
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`no data block ${name}`)
  const body = from + start.length
  const end = text.indexOf("\n</data>", body)
  if (end < 0) throw new Error(`no end for ${name}`)
  return text.slice(body, end)
}

function namedBlock(text: string, prefix: string) {
  const marker = `<data name="${prefix}`
  const from = text.indexOf(marker)
  if (from < 0) throw new Error(`no data block ${prefix}`)
  const nameEnd = text.indexOf('">', from)
  return rawBlock(text, text.slice(from + '<data name="'.length, nameEnd))
}

function rulesText(text: string) {
  const from = text.indexOf("Review rules, read from the base revision")
  const to = text.indexOf("Everything inside <data> blocks", from)
  return text.slice(from, to)
}



test("a slice id cannot collide with another sample's child session", () =>
  run((directory) => Effect.gen(function* () {
    const h = yield* harness(directory, "sampleidentity")
    const ids: string[] = []
    const entry = ReviewResultV2.parseEntry(ENTRY.split("\n").slice(1, -1).join("\n"))
    if (!entry || entry.status !== "eligible") throw new Error("entry fixture missing")
    const port: ReviewFanoutV2.Port = {
      ...h.port,
      create: (input) => h.port.create(input).pipe(Effect.tap((id) => Effect.sync(() => { ids.push(id) }))),
      run: (sessionID, text, turn) => turn.key === "entry" ? Effect.succeed(fenced(ReviewFanoutV2.TAGS.entry, {
        ...entry,
        slices: [{ id: "all", paths: ["src/a.ts"] }, { id: "all:sample:2", paths: ["src/a.ts"] }],
      })) : h.port.run(sessionID, text, turn),
    }
    const input = h.input("deep", { catalog: deepCatalog(h.input("deep").catalog) })
    const result = yield* ReviewFanoutV2.run(input, port)
    if (result.status !== "ran") throw new Error("expected a run")
    const keys = h.calls.filter((call) => call.startsWith("create:lens:"))
    expect(keys).toHaveLength(24)
    expect(new Set(keys).size).toBe(24)
    expect(new Set(ids).size).toBe(ids.length)
    expect(result.counts.lensChildren).toBe(24)
  })),
)

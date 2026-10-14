import { expect, test } from "bun:test"
import { schedule, type WaveEvent } from "../src/engine/scheduler.ts"
test("scheduler conflicts whole-file/ranges, disjoint ranges cofly, append requires unanimity", () => {
  expect(schedule([{ id: "a", writes: ["x.ts"] }, { id: "b", writes: ["x.ts:L10-20"] }], []).dispatchNow).toEqual(["a"])
  expect(schedule([{ id: "a", writes: ["x.ts:L1-9"] }, { id: "b", writes: ["x.ts:L10-20"] }], []).dispatchNow).toEqual(["a", "b"])
  expect(schedule([{ id: "a", writes: ["x.ts"], appendOnly: ["x.ts"] }, { id: "b", writes: ["x.ts"] }], []).dispatchNow).toEqual(["a"])
  expect(schedule([{ id: "a", writes: ["x.ts"], appendOnly: ["x.ts"] }, { id: "b", writes: ["x.ts"], appendOnly: ["x.ts"] }], []).dispatchNow).toEqual(["a", "b"])
})
test("sealed keeps conflict window, frees seat; serial merge doesn't free window intra-call", () => {
  const wps = [{ id: "a", writes: ["x.ts"] }, { id: "b", writes: ["x.ts"] }, { id: "c", writes: ["z.ts"] }]
  const events: WaveEvent[] = [{ type: "dispatched", wp: "a" }, { type: "sealed", wp: "a" }]
  const advice = schedule(wps, events, 1)
  expect(advice.mergeNow).toBe("a")
  expect(advice.dispatchNow).toEqual(["c"])
  expect(advice.blocked).toContainEqual({ wp: "b", on: "conflict:a" })
  expect(events.length).toBe(2)
})
test("retry DFA replay uses current state, never historical event existence", () => {
  const events: WaveEvent[] = [{ type: "dispatched", wp: "a" }, { type: "failed", wp: "a" }, { type: "dispatched", wp: "a" }]
  const advice = schedule([{ id: "a" }, { id: "b" }], events, 1)
  expect(advice.redispatchable).toEqual([])
  expect(advice.inFlight).toEqual(["a"])
  expect(advice.dispatchNow).toEqual([])
  expect(schedule([{ id: "b" }, { id: "a" }], events, 1)).toEqual(advice)
})
test("hard deps and conflicting soft deps wait for landed evidence; failed dep cannot satisfy", () => {
  const wps = [{ id: "a", writes: ["x.ts"] }, { id: "b", writes: ["x.ts:L10"], deps: ["a"] }]
  expect(schedule(wps, []).blocked).toContainEqual({ wp: "b", on: "deps:a" })
  expect(schedule(wps, []).issues).toContain("dep-conflict: b↔a")
  expect(schedule(wps, [{ type: "dispatched", wp: "a" }, { type: "failed", wp: "a" }]).dispatchNow).toEqual(["a"])
})
test("merge chooses blast then ID; cycles, unknown deps and malformed replay are visible", () => {
  const events: WaveEvent[] = [{ type: "dispatched", wp: "b" }, { type: "sealed", wp: "b" }, { type: "dispatched", wp: "a" }, { type: "sealed", wp: "a" }]
  expect(schedule([{ id: "a", blastRadius: 2 }, { id: "b", blastRadius: 1 }], events).mergeNow).toBe("b")
  expect(schedule([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a"] }], events).issues).toContain("cycle: a→b→a")
  expect(schedule([{ id: "a", hardDeps: ["missing"] }], []).blocked).toEqual([{ wp: "a", on: "deps:missing" }])
  expect(schedule([{ id: "a" }], [{ type: "sealed", wp: "a" }]).issues).toContain("ignored event: sealed a in PENDING")
  expect(schedule([{ id: "a" }], [{ type: "dispatched", wp: "a" }, { type: "merged", wp: "a" }]).issues).toContain("merged-without-seal: a")
})
test("explicit empty wave is done; absent arrays and invalid numeric constraints fail", () => {
  expect(schedule([], []).done).toBe(true)
  expect(schedule([{ id: "a" }], [], 0).blocked).toEqual([{ wp: "a", on: "cap" }])
  expect(() => schedule(undefined as unknown as [], [])).toThrow("SCHEDULER_WPS_INVALID")
  expect(() => schedule([], [], NaN)).toThrow("SCHEDULER_CAP_INVALID")
})
test.each([
  ["writes", "src/*.ts"], ["writes", "src/?.ts"],
  ["reads", "src/*.ts"], ["reads", "src/?.ts"],
  ["appendOnly", "src/*.ts"], ["appendOnly", "src/?.ts"],
] as const)("singleton unresolved %s scope %s holds direct scheduling", (field, site) => {
  const advice = schedule([{ id: "single", [field]: [site] }], [])
  expect(advice).toMatchObject({ status: "HOLD", code: "PATTERN_SCOPE_UNRESOLVED", dispatchNow: [], mergeNow: null, done: false, replayEvaluated: false })
  expect(advice.unresolvedScopes).toEqual([{ wp: "single", field, site }])
  expect(advice.issues).toContain(`PATTERN_SCOPE_UNRESOLVED: single ${field} ${site}`)
})
test("unresolved scope cannot become done from merged replay", () => {
  expect(schedule([{ id: "single", writes: ["src/*"] }], [{ type: "dispatched", wp: "single" }, { type: "sealed", wp: "single" }, { type: "merged", wp: "single" }])).toMatchObject({ status: "HOLD", dispatchNow: [], mergeNow: null, done: false })
})
test("unresolved scope blocks sealed merge and unrelated parallel dispatch", () => {
  const advice = schedule([{ id: "a", writes: ["src/*"] }, { id: "b", writes: ["other.ts"] }], [{ type: "dispatched", wp: "a" }, { type: "sealed", wp: "a" }])
  expect(advice.dispatchNow).toEqual([])
  expect(advice.mergeNow).toBeNull()
  expect(advice.blocked).toEqual([{ wp: "a", on: "PATTERN_SCOPE_UNRESOLVED" }, { wp: "b", on: "PATTERN_SCOPE_UNRESOLVED" }])
})
test("discarded duplicate declaration cannot hide unresolved scope", () => {
  const advice = schedule([{ id: "a", writes: ["literal.ts"] }, { id: "a", reads: ["src/*"] }], [])
  expect(advice.status).toBe("HOLD")
  expect(advice.issues).toContain("duplicate wp id: a")
  expect(advice.unresolvedScopes).toEqual([{ wp: "a", field: "reads", site: "src/*" }])
})
test("literal brackets remain exact filename characters", () => {
  const advice = schedule([{ id: "a", writes: ["src/[ab].ts"] }, { id: "b", writes: ["src/a.ts"] }], [])
  expect(advice.dispatchNow).toEqual(["a", "b"])
  expect(advice.status).toBeUndefined()
})
test("literal bracket paths retain inclusive range conflicts", () => {
  expect(schedule([{ id: "a", writes: ["src/[ab].ts:L1-9"] }, { id: "b", writes: ["src/[ab].ts:L10-20"] }], []).dispatchNow).toEqual(["a", "b"])
  expect(schedule([{ id: "a", writes: ["src/[ab].ts:L1-10"] }, { id: "b", writes: ["src/[ab].ts:L10-20"] }], []).dispatchNow).toEqual(["a"])
})
test("escaped star/question markers remain literal exact scopes", () => {
  const advice = schedule([{ id: "a", writes: [String.raw`src/\*.ts`] }, { id: "b", writes: [String.raw`src/\?.ts`] }], [])
  expect(advice.dispatchNow).toEqual(["a", "b"])
  expect(advice.status).toBeUndefined()
  expect(schedule([{ id: "a", writes: [String.raw`src/\*.ts:L1-10`] }, { id: "b", writes: [String.raw`src/\*.ts:L10-20`] }], []).dispatchNow).toEqual(["a"])
})
test("escaped backslash does not escape following unescaped wildcard", () => {
  expect(schedule([{ id: "a", writes: [String.raw`src/\\*.ts`] }], []).status).toBe("HOLD")
  expect(schedule([{ id: "a", writes: [String.raw`src/\\\*.ts`] }], []).dispatchNow).toEqual(["a"])
})
test("pattern HOLD is canonical and never mutates supplied wave data", () => {
  const wps = [{ id: "b", reads: ["x?"] }, { id: "a", writes: ["x*"] }]
  const events: WaveEvent[] = [{ type: "dispatched", wp: "b" }]
  const before = JSON.stringify({ wps, events })
  expect(schedule(wps, events)).toEqual(schedule([...wps].reverse(), events))
  expect(JSON.stringify({ wps, events })).toBe(before)
})
test("pattern preflight preserves malformed-event rejection instead of green/unknown replay", () => {
  expect(() => schedule([{ id: "a", writes: ["x*"] }], [{ type: "invalid", wp: "a" }] as unknown as WaveEvent[])).toThrow("SCHEDULER_EVENT_INVALID")
  expect(schedule([], [])).toMatchObject({ done: true, dispatchNow: [], mergeNow: null, issues: [] })
})
